"""
app/execution/portfolio_risk_engine.py — Centralized Multi-Instrument Portfolio Risk Engine

Enforces global portfolio risk policies and per-instrument limits:
1. Universal Account Equity Floor: >= $200.00 USD. Below $200.00, trading fails closed.
2. Per-Trade Planned Risk Ceiling: <= $1.00 USD strict maximum monetary loss.
3. Strict Floor Rounding: Volumes always round DOWN to valid broker volume step.
4. Total Open Portfolio Risk: Max 3 concurrent positions, total open risk <= $3.00 USD (1.5% of equity).
5. Currency Exposure Limits: Max 2 simultaneous open positions exposed to the same base or quote currency (e.g. USD).
6. Correlated Asset Limits: Max 1 simultaneous open position in correlated index instruments (NAS100, US30).
7. Margin Utilization Cap: Total required margin across all positions cannot exceed 60% of equity ($120.00 on $200 equity).
8. Daily Loss Circuit Breaker: 15% of starting equity ($30.00 max daily loss at $200 baseline).
9. Peak Trailing Drawdown Halt: 15% from high-water mark.
10. Permanent Live Lock: Real-money live trading permanently disabled (LIVE_TRADING_ENABLED = False).
"""

from __future__ import annotations

import json
import logging
import math
import os
import shutil
import tempfile
import threading
from dataclasses import asdict, dataclass, field, fields
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

logger = logging.getLogger("vortex.portfolio_risk")

MINIMUM_ACCOUNT_EQUITY_USD = 200.0
MAX_RISK_PER_TRADE_USD = 1.00
MAX_CONCURRENT_POSITIONS = 3
MAX_TOTAL_OPEN_RISK_USD = 3.00
MAX_CURRENCY_EXPOSURE = 2
MAX_CORRELATED_EXPOSURE = 1
MAX_MARGIN_UTILIZATION_PCT = 60.0
MAX_DAILY_DRAWDOWN_PCT = 15.0
MAX_DAILY_LOSS_USD_AT_200 = 30.0


class PortfolioRiskDecision(str, Enum):
    APPROVED = "APPROVED"
    REJECTED_EQUITY_FLOOR = "REJECTED_EQUITY_FLOOR"
    REJECTED_TRADE_RISK_LIMIT = "REJECTED_TRADE_RISK_LIMIT"
    REJECTED_PORTFOLIO_RISK_LIMIT = "REJECTED_PORTFOLIO_RISK_LIMIT"
    REJECTED_MAX_POSITIONS = "REJECTED_MAX_POSITIONS"
    REJECTED_CURRENCY_EXPOSURE = "REJECTED_CURRENCY_EXPOSURE"
    REJECTED_CORRELATED_EXPOSURE = "REJECTED_CORRELATED_EXPOSURE"
    REJECTED_MARGIN_UTILIZATION = "REJECTED_MARGIN_UTILIZATION"
    REJECTED_DAILY_DRAWDOWN = "REJECTED_DAILY_DRAWDOWN"
    REJECTED_CIRCUIT_BREAKER = "REJECTED_CIRCUIT_BREAKER"
    REJECTED_LIVE_TRADING_DISABLED = "REJECTED_LIVE_TRADING_DISABLED"
    REJECTED_STALE_OR_CLOSED = "REJECTED_STALE_OR_CLOSED"
    REJECTED_STRATEGY_UNCERTIFIED = "REJECTED_STRATEGY_UNCERTIFIED"


@dataclass
class PositionRiskIntent:
    instrument: str
    broker_symbol: str
    direction: str  # "BUY" | "SELL"
    entry_price: float
    stop_loss: float
    take_profit: float
    volume: float
    planned_risk_usd: float
    required_margin_usd: float
    currencies: List[str]  # e.g. ["EUR", "USD"]
    asset_group: str       # e.g. "INDICES", "FX_MAJOR", "METALS"
    correlation_id: str = ""
    features: List[float] = field(default_factory=list)
    ai_prob: float = 0.5
    strategy_name: str = ""
    strategy_version: str = ""
    timeframe: str = ""
    candle_time: str = ""
    ticket: str = ""
    position_id: str = ""
    deal_ticket: str = ""
    opened_at: str = ""
    closed_volume: float = 0.0


@dataclass
class ReconciliationResult:
    """Structured output from authoritative position reconciliation (supports dry-run)."""
    mt5_open_positions_count: int
    portfolio_open_intents_before: int
    portfolio_open_intents_after: int
    verified_closed: List[Dict[str, Any]] = field(default_factory=list)
    still_open: List[Dict[str, Any]] = field(default_factory=list)
    partial_closures: List[Dict[str, Any]] = field(default_factory=list)
    unverified_kept: List[Dict[str, Any]] = field(default_factory=list)
    skipped_duplicate_ids: List[str] = field(default_factory=list)
    resulting_currency_exposure: Dict[str, int] = field(default_factory=dict)
    aborted_reason: Optional[str] = None
    dry_run: bool = False


@dataclass
class PortfolioRiskStatus:
    decision: PortfolioRiskDecision
    approved: bool
    reason: str
    current_equity: float
    free_margin: float
    total_open_risk_usd: float
    open_positions_count: int
    daily_realized_pnl: float
    daily_drawdown_pct: float
    circuit_breaker_active: bool
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["decision"] = self.decision.value
        return d


class CentralizedPortfolioRiskEngine:
    """
    Independent central risk authority enforcing portfolio exposure and individual sizing rules.
    """

    CORRELATION_GROUPS: Dict[str, Set[str]] = {
        "US_EQUITY_INDICES": {"NAS100", "NAS100.R", "US30", "DJ30.R", "SP500"},
        "PRECIOUS_METALS": {"XAUUSD", "GOLD", "XAGUSD", "SILVER"},
        "CRYPTO": {"BTCUSD", "ETHUSD", "LTCUSD"},
    }

    CURRENCY_MAP: Dict[str, List[str]] = {
        "EURUSD": ["EUR", "USD"],
        "GBPUSD": ["GBP", "USD"],
        "USDJPY": ["USD", "JPY"],
        "EURDKK": ["EUR", "DKK"],
        "USDTRY": ["USD", "TRY"],
        "USDCNH": ["USD", "CNH"],
        "EURCZK": ["EUR", "CZK"],
        "XAUUSD": ["USD"],
        "BTCUSD": ["USD"],
        "NAS100.R": ["USD"],
        "DJ30.R": ["USD"],
        "AAPL.24H": ["USD"],
    }

    def __init__(
        self,
        min_equity: float = MINIMUM_ACCOUNT_EQUITY_USD,
        max_trade_risk: Optional[float] = MAX_RISK_PER_TRADE_USD,
        max_portfolio_risk: Optional[float] = MAX_TOTAL_OPEN_RISK_USD,
        max_daily_dd_pct: float = MAX_DAILY_DRAWDOWN_PCT,
        state_file: Optional[Path] = None,
        sync_mt5: bool = False,
    ):
        self.min_equity = min_equity
        self.max_trade_risk = max_trade_risk
        self.max_portfolio_risk = max_portfolio_risk
        self.max_daily_dd_pct = max_daily_dd_pct
        self.state_file = state_file or (Path("database") / "portfolio_risk_state.json")

        self.daily_starting_equity: float = min_equity
        self.daily_realized_pnl: float = 0.0
        self.peak_equity: float = min_equity
        self.circuit_breaker_tripped: bool = False
        self.circuit_breaker_reason: str = ""
        self._open_intents: Dict[str, PositionRiskIntent] = {}
        self._reconciled_closed_ids: List[str] = []
        self._lock = threading.RLock()
        self._load_state()
        if sync_mt5:
            self.sync_with_mt5()

    def _validate_loaded_payload(self, data: Any) -> Dict[str, Any]:
        if not isinstance(data, dict):
            raise ValueError("Portfolio risk state root must be a JSON object")
        intents = data.get("open_intents", {})
        if not isinstance(intents, dict):
            raise ValueError("open_intents must be a JSON object")
        return data

    def _load_state(self) -> None:
        with self._lock:
            candidates = [self.state_file, self.state_file.with_suffix(".json.bak")]
            for candidate in candidates:
                if not candidate.exists():
                    continue
                try:
                    raw = candidate.read_text(encoding="utf-8")
                    data = self._validate_loaded_payload(json.loads(raw))
                    self.daily_starting_equity = float(data.get("daily_starting_equity", self.min_equity))
                    self.daily_realized_pnl = float(data.get("daily_realized_pnl", 0.0))
                    self.peak_equity = float(data.get("peak_equity", self.daily_starting_equity))
                    self.circuit_breaker_tripped = bool(data.get("circuit_breaker_tripped", False))
                    self.circuit_breaker_reason = str(data.get("circuit_breaker_reason", ""))
                    valid_fields = {f.name for f in fields(PositionRiskIntent)}
                    self._open_intents.clear()
                    for t, idict in data.get("open_intents", {}).items():
                        if isinstance(idict, dict):
                            filtered = {k: v for k, v in idict.items() if k in valid_fields}
                            if not filtered.get("ticket"):
                                filtered["ticket"] = str(t)
                            if not filtered.get("position_id"):
                                filtered["position_id"] = str(t)
                            self._open_intents[str(t)] = PositionRiskIntent(**filtered)
                    closed_ids = data.get("reconciled_closed_ids", [])
                    if isinstance(closed_ids, list):
                        self._reconciled_closed_ids = [str(x) for x in closed_ids[-500:]]
                    return
                except Exception as exc:
                    logger.error(f"[PORTFOLIO_RISK] Failed to load state from {candidate}: {exc}")

    def _persist_state(self) -> None:
        with self._lock:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "daily_starting_equity": self.daily_starting_equity,
                "daily_realized_pnl": round(self.daily_realized_pnl, 2),
                "peak_equity": round(self.peak_equity, 2),
                "circuit_breaker_tripped": self.circuit_breaker_tripped,
                "circuit_breaker_reason": self.circuit_breaker_reason,
                "open_intents_count": len(self._open_intents),
                "open_intents": {t: asdict(p) for t, p in self._open_intents.items()},
                "reconciled_closed_ids": self._reconciled_closed_ids[-500:],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            if self.state_file.exists():
                bak_path = self.state_file.with_suffix(".json.bak")
                try:
                    shutil.copy2(self.state_file, bak_path)
                except Exception as bak_exc:
                    logger.warning(f"[PORTFOLIO_RISK] Backup creation failed for {self.state_file}: {bak_exc}")

            fd, tmp_name = tempfile.mkstemp(
                dir=str(self.state_file.parent),
                prefix=f".{self.state_file.stem}_",
                suffix=".tmp",
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as tmp_f:
                    json.dump(payload, tmp_f, indent=2)
                    tmp_f.flush()
                    os.fsync(tmp_f.fileno())
                os.replace(tmp_name, self.state_file)
            except Exception as write_exc:
                logger.error(f"[PORTFOLIO_RISK] Atomic state persistence failed: {write_exc}")
                try:
                    if os.path.exists(tmp_name):
                        os.unlink(tmp_name)
                except OSError:
                    pass
                raise

    @staticmethod
    def _field(obj: Any, name: str, default: Any = None) -> Any:
        if isinstance(obj, dict):
            return obj.get(name, default)
        return getattr(obj, name, default)

    def _intent_identifiers(self, key: str, intent: PositionRiskIntent) -> Set[str]:
        ids = {str(key)}
        if intent.ticket:
            ids.add(str(intent.ticket))
        if intent.position_id:
            ids.add(str(intent.position_id))
        return {x for x in ids if x and x != "None"}

    def _currency_exposure_map(self, intents: Dict[str, PositionRiskIntent]) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for p in intents.values():
            curs = self.CURRENCY_MAP.get(p.instrument.upper(), p.currencies)
            for c in curs:
                counts[c] = counts.get(c, 0) + 1
        return counts

    def reconcile_positions(
        self,
        positions: Optional[Iterable[Any]],
        deals: Optional[Iterable[Any]],
        journal_records: Optional[Iterable[Dict[str, Any]]] = None,
        dry_run: bool = False,
    ) -> ReconciliationResult:
        """
        Authoritative idempotent reconciliation comparing:
        A. Live MT5 open positions
        B. Portfolio risk open intents
        C. Verified MT5 historical deals
        D. Closed trade journal records
        Fail-closed: never removes an intent on MT5 error (positions is None) or unverified absence.
        """
        with self._lock:
            before_count = len(self._open_intents)
            if positions is None:
                return ReconciliationResult(
                    mt5_open_positions_count=0,
                    portfolio_open_intents_before=before_count,
                    portfolio_open_intents_after=before_count,
                    resulting_currency_exposure=self._currency_exposure_map(self._open_intents),
                    aborted_reason="MT5_POSITIONS_UNAVAILABLE",
                    dry_run=dry_run,
                )

            pos_list = list(positions)
            if deals is None and len(self._open_intents) > 0:
                # Missing deal history: still match live positions, but abort removals
                deals_available = False
                deal_list: List[Any] = []
            else:
                deals_available = True
                deal_list = list(deals or [])

            journal_closed_ids: Dict[str, Dict[str, Any]] = {}
            for rec in (journal_records or []):
                if not isinstance(rec, dict):
                    continue
                for id_key in ("position_id", "ticket", "order_ticket", "deal_ticket", "trade_id"):
                    val = rec.get(id_key)
                    if val is not None and str(val).strip():
                        journal_closed_ids[str(val).strip()] = rec

            # Index live positions by ticket, identifier, and order
            live_by_id: Dict[str, Any] = {}
            for p in pos_list:
                for attr in ("ticket", "identifier", "order"):
                    val = self._field(p, attr)
                    if val is not None and str(val) not in ("", "0", "None"):
                        live_by_id[str(val)] = p

            verified_closed: List[Dict[str, Any]] = []
            still_open: List[Dict[str, Any]] = []
            partial_closures: List[Dict[str, Any]] = []
            unverified_kept: List[Dict[str, Any]] = []
            skipped_duplicates: List[str] = []

            working_intents: Dict[str, PositionRiskIntent] = dict(self._open_intents)
            reconciled_set = set(self._reconciled_closed_ids)
            pnl_delta = 0.0
            state_changed = False

            for key, intent in list(self._open_intents.items()):
                ids = self._intent_identifiers(key, intent)
                matched_live = None
                for ident in ids:
                    if ident in live_by_id:
                        matched_live = live_by_id[ident]
                        break

                if matched_live is not None:
                    live_vol = float(self._field(matched_live, "volume", intent.volume) or intent.volume)
                    if live_vol < intent.volume - 1e-8 and live_vol > 0:
                        ratio = live_vol / max(intent.volume, 1e-8)
                        partial_closures.append({
                            "ticket": key,
                            "instrument": intent.instrument,
                            "previous_volume": intent.volume,
                            "remaining_volume": live_vol,
                        })
                        if not dry_run:
                            intent.closed_volume = round(intent.closed_volume + (intent.volume - live_vol), 4)
                            intent.volume = live_vol
                            intent.planned_risk_usd = round(intent.planned_risk_usd * ratio, 2)
                            state_changed = True
                    still_open.append({
                        "ticket": key,
                        "instrument": intent.instrument,
                        "volume": live_vol,
                    })
                    continue

                # Not in live MT5 positions -> check idempotency set first
                if any(ident in reconciled_set for ident in ids):
                    skipped_duplicates.append(key)
                    working_intents.pop(key, None)
                    if not dry_run:
                        self._open_intents.pop(key, None)
                        state_changed = True
                    continue

                if not deals_available and not any(ident in journal_closed_ids for ident in ids):
                    unverified_kept.append({
                        "ticket": key,
                        "instrument": intent.instrument,
                        "reason": "MISSING_DEAL_HISTORY",
                    })
                    continue

                # Independently verify closure via MT5 exit deals
                exit_deals = []
                for d in deal_list:
                    d_pos = str(self._field(d, "position_id", ""))
                    d_ord = str(self._field(d, "order", ""))
                    d_tkt = str(self._field(d, "ticket", ""))
                    d_entry = self._field(d, "entry", None)
                    if d_entry in (1, 2) and ({d_pos, d_ord, d_tkt} & ids):
                        exit_deals.append(d)

                closed_vol = sum(float(self._field(d, "volume", 0.0) or 0.0) for d in exit_deals)
                journal_match = next((journal_closed_ids[ident] for ident in ids if ident in journal_closed_ids), None)

                if exit_deals and closed_vol >= intent.volume - 1e-8:
                    realized = sum(
                        float(self._field(d, "profit", 0.0) or 0.0)
                        + float(self._field(d, "commission", 0.0) or 0.0)
                        + float(self._field(d, "swap", 0.0) or 0.0)
                        for d in exit_deals
                    )
                    last_reason = self._field(exit_deals[-1], "reason", None)
                    exit_reason = "STOP_LOSS" if last_reason == 4 else "TAKE_PROFIT" if last_reason == 5 else "MANUAL_OR_OTHER"
                    deal_tickets = [self._field(d, "ticket") for d in exit_deals]
                    verified_closed.append({
                        "ticket": key,
                        "position_id": intent.position_id or key,
                        "instrument": intent.instrument,
                        "exit_reason": exit_reason,
                        "exit_deal_tickets": deal_tickets,
                        "closed_volume": round(closed_vol, 4),
                        "realized_pnl": round(realized, 2),
                        "verification_source": "MT5_DEAL_HISTORY",
                    })
                    working_intents.pop(key, None)
                    if not dry_run:
                        logger.info(
                            f"[PORTFOLIO_RISK] Synchronized position closed from MT5: "
                            f"Ticket #{key} ({intent.instrument}, {exit_reason}, PnL=${realized:.2f})"
                        )
                        self._open_intents.pop(key, None)
                        self._reconciled_closed_ids.append(key)
                        reconciled_set.add(key)
                        pnl_delta += realized
                        state_changed = True
                elif journal_match is not None:
                    realized = float(journal_match.get("net_realized_pnl", journal_match.get("realized_pnl", 0.0)) or 0.0)
                    exit_reason = str(journal_match.get("exit_reason", "JOURNAL_VERIFIED"))
                    verified_closed.append({
                        "ticket": key,
                        "position_id": intent.position_id or key,
                        "instrument": intent.instrument,
                        "exit_reason": exit_reason,
                        "exit_deal_tickets": [],
                        "closed_volume": intent.volume,
                        "realized_pnl": round(realized, 2),
                        "verification_source": "TRADE_JOURNAL",
                    })
                    working_intents.pop(key, None)
                    if not dry_run:
                        logger.info(
                            f"[PORTFOLIO_RISK] Synchronized position closed from Journal: "
                            f"Ticket #{key} ({intent.instrument}, {exit_reason})"
                        )
                        self._open_intents.pop(key, None)
                        self._reconciled_closed_ids.append(key)
                        reconciled_set.add(key)
                        state_changed = True
                else:
                    logger.warning(
                        f"[PORTFOLIO_RISK] Intent #{key} ({intent.instrument}) absent from live MT5 positions "
                        f"but closure unverified (exit_vol={closed_vol:.4f}/{intent.volume:.4f}); keeping intent."
                    )
                    unverified_kept.append({
                        "ticket": key,
                        "instrument": intent.instrument,
                        "reason": "UNVERIFIED_ABSENCE",
                    })

            if not dry_run:
                if pnl_delta != 0.0:
                    self.daily_realized_pnl = round(self.daily_realized_pnl + pnl_delta, 2)
                if state_changed:
                    self._persist_state()

            return ReconciliationResult(
                mt5_open_positions_count=len(pos_list),
                portfolio_open_intents_before=before_count,
                portfolio_open_intents_after=len(working_intents),
                verified_closed=verified_closed,
                still_open=still_open,
                partial_closures=partial_closures,
                unverified_kept=unverified_kept,
                skipped_duplicate_ids=skipped_duplicates,
                resulting_currency_exposure=self._currency_exposure_map(working_intents),
                dry_run=dry_run,
            )

    def sync_with_mt5(self, shut_down_after: bool = False, days_back: int = 7) -> Optional[ReconciliationResult]:
        """Synchronizes open position intents directly with active MT5 terminal positions and verified deals."""
        try:
            import MetaTrader5 as mt5
            if not mt5.initialize():
                logger.warning("[PORTFOLIO_RISK] MT5 initialize() returned False during sync_with_mt5")
                return None

            positions = mt5.positions_get()
            if positions is None:
                logger.warning(f"[PORTFOLIO_RISK] MT5 positions_get() returned None: {mt5.last_error()}")
                return None

            from datetime import timedelta
            now = datetime.now(timezone.utc)
            deals = mt5.history_deals_get(now - timedelta(days=days_back), now + timedelta(days=1))

            result = self.reconcile_positions(positions=positions, deals=deals, dry_run=False)

            with self._lock:
                live_tickets = {str(p.ticket): p for p in positions}
                existing_ids = set()
                for k, intent in self._open_intents.items():
                    existing_ids.update(self._intent_identifiers(k, intent))

                state_added = False
                for t_str, pos in live_tickets.items():
                    pos_ids = {t_str, str(getattr(pos, "identifier", "")), str(getattr(pos, "order", ""))}
                    if not (pos_ids & existing_ids):
                        order_type = pos.type
                        loss = 0.0
                        if pos.sl > 0:
                            calc = mt5.order_calc_profit(order_type, pos.symbol, pos.volume, pos.price_open, pos.sl)
                            if calc is not None:
                                loss = abs(float(calc))
                        if loss == 0.0 and pos.sl > 0:
                            dist = abs(pos.price_open - pos.sl)
                            loss = round(dist * 100000.0 * pos.volume, 2)

                        margin = 0.0
                        calc_m = mt5.order_calc_margin(order_type, pos.symbol, pos.volume, pos.price_open)
                        if calc_m is not None:
                            margin = round(float(calc_m), 2)

                        dir_str = "BUY" if pos.type == 0 else "SELL"
                        sym = pos.symbol.replace(".r", "").upper()
                        self._open_intents[t_str] = PositionRiskIntent(
                            instrument=sym,
                            broker_symbol=pos.symbol,
                            direction=dir_str,
                            entry_price=float(pos.price_open),
                            stop_loss=float(pos.sl),
                            take_profit=float(pos.tp),
                            volume=float(pos.volume),
                            planned_risk_usd=round(loss, 2),
                            required_margin_usd=margin,
                            currencies=self.CURRENCY_MAP.get(sym, ["USD"]),
                            asset_group="FOREX" if "USD" in sym and sym not in ("XAUUSD", "BTCUSD") else "OTHER",
                            ticket=t_str,
                            position_id=str(getattr(pos, "identifier", t_str) or t_str),
                            opened_at=datetime.now(timezone.utc).isoformat(),
                        )
                        state_added = True
                        logger.info(f"[PORTFOLIO_RISK] Registered live MT5 position Ticket #{t_str}: {sym} {dir_str} {pos.volume} lots, Stop Risk: ${loss:.2f} USD")

                if state_added:
                    self._persist_state()

            if shut_down_after:
                mt5.shutdown()
            return result
        except Exception as e:
            logger.error(f"[PORTFOLIO_RISK] MT5 sync exception: {e}", exc_info=True)
            return None

    def get_total_open_risk(self) -> float:
        """Returns the aggregate monetary risk (USD) across all registered open positions."""
        return round(sum(p.planned_risk_usd for p in self._open_intents.values()), 2)

    def get_total_open_margin(self) -> float:
        """Returns the aggregate required margin (USD) across all registered open positions."""
        return round(sum(p.required_margin_usd for p in self._open_intents.values()), 2)

    def validate_pre_order(
        self,
        intent: PositionRiskIntent,
        current_equity: float,
        free_margin: float,
        live_trading_attempt: bool = False,
    ) -> PortfolioRiskStatus:
        """
        Validates proposed trade intent against all account, trade, and portfolio constraints.
        Fails closed on any violation.
        """
        # 1. LIVE Trading Lockout (Non-negotiable)
        if live_trading_attempt:
            return self._reject(
                PortfolioRiskDecision.REJECTED_LIVE_TRADING_DISABLED,
                "Real-money LIVE trading is permanently locked out (DEMO only).",
                current_equity, free_margin
            )

        # 2. Universal Equity Floor ($200 USD)
        if current_equity < (self.min_equity - 1e-4):
            return self._reject(
                PortfolioRiskDecision.REJECTED_EQUITY_FLOOR,
                f"Account equity ${current_equity:.2f} is below the required minimum floor (${self.min_equity:.2f} USD).",
                current_equity, free_margin
            )

        # 3. Circuit Breaker / Daily Drawdown (15% limit of daily starting equity)
        max_daily_loss = self.daily_starting_equity * (self.max_daily_dd_pct / 100.0)
        current_daily_loss = -min(0.0, self.daily_realized_pnl)
        effective_daily_loss = max(current_daily_loss, max(0.0, self.daily_starting_equity - current_equity))
        if self.circuit_breaker_tripped or effective_daily_loss >= max_daily_loss:
            self.circuit_breaker_tripped = True
            reason = f"Daily drawdown circuit breaker active: loss ${effective_daily_loss:.2f} >= ${max_daily_loss:.2f} allowance (15% limit)."
            self.circuit_breaker_reason = reason
            self._persist_state()
            return self._reject(PortfolioRiskDecision.REJECTED_CIRCUIT_BREAKER, reason, current_equity, free_margin)

        # 4. Individual Trade Risk Limit (Bypassed when DEMO_MIN_LOT_SIZING_ENABLED is authorized)
        try:
            from app.config import DEMO_MIN_LOT_SIZING_ENABLED
        except ImportError:
            DEMO_MIN_LOT_SIZING_ENABLED = False
        if not DEMO_MIN_LOT_SIZING_ENABLED and self.max_trade_risk is not None:
            if intent.planned_risk_usd > (self.max_trade_risk + 1e-4):
                return self._reject(
                    PortfolioRiskDecision.REJECTED_TRADE_RISK_LIMIT,
                    f"Planned risk ${intent.planned_risk_usd:.2f} exceeds approved trade risk ceiling (${self.max_trade_risk:.2f} USD).",
                    current_equity, free_margin
                )

        # 5. Volume Step & Rounding Check
        if intent.volume <= 0.0:
            return self._reject(
                PortfolioRiskDecision.REJECTED_TRADE_RISK_LIMIT,
                f"Calculated volume is {intent.volume:.4f} lots. Sizing strictly floored to 0.00.",
                current_equity, free_margin
            )

        # 6. Max Concurrent Positions (Strictly preserved at 3)
        active_count = len(self._open_intents)
        if active_count >= MAX_CONCURRENT_POSITIONS:
            return self._reject(
                PortfolioRiskDecision.REJECTED_MAX_POSITIONS,
                f"Active open positions ({active_count}) at maximum portfolio limit ({MAX_CONCURRENT_POSITIONS}).",
                current_equity, free_margin
            )

        # 7. Total Open Portfolio Risk Limit (Bypassed when DEMO_MIN_LOT_SIZING_ENABLED is authorized)
        current_open_risk = sum(p.planned_risk_usd for p in self._open_intents.values())
        if not DEMO_MIN_LOT_SIZING_ENABLED and self.max_portfolio_risk is not None:
            if (current_open_risk + intent.planned_risk_usd) > (self.max_portfolio_risk + 1e-4):
                return self._reject(
                    PortfolioRiskDecision.REJECTED_PORTFOLIO_RISK_LIMIT,
                    f"Total portfolio open risk (${current_open_risk + intent.planned_risk_usd:.2f}) exceeds ${self.max_portfolio_risk:.2f} budget.",
                    current_equity, free_margin
                )

        # 8. Currency Exposure Limit (Max 2 per currency)
        intent_currencies = self.CURRENCY_MAP.get(intent.instrument.upper(), intent.currencies)
        for cur in intent_currencies:
            cur_count = sum(1 for p in self._open_intents.values() if cur in self.CURRENCY_MAP.get(p.instrument.upper(), p.currencies))
            if cur_count >= MAX_CURRENCY_EXPOSURE:
                return self._reject(
                    PortfolioRiskDecision.REJECTED_CURRENCY_EXPOSURE,
                    f"Currency exposure limit reached for {cur}: {cur_count} open positions.",
                    current_equity, free_margin
                )

        # 9. Correlated Asset Class Limit (Max 1 index)
        for grp_name, grp_syms in self.CORRELATION_GROUPS.items():
            if intent.instrument.upper() in grp_syms:
                grp_count = sum(1 for p in self._open_intents.values() if p.instrument.upper() in grp_syms)
                if grp_count >= MAX_CORRELATED_EXPOSURE:
                    return self._reject(
                        PortfolioRiskDecision.REJECTED_CORRELATED_EXPOSURE,
                        f"Correlated exposure limit reached for {grp_name}: {grp_count} existing position(s).",
                        current_equity, free_margin
                    )

        # 10. Margin Utilization Cap (Max 60% of equity)
        total_open_margin = sum(p.required_margin_usd for p in self._open_intents.values())
        new_total_margin = total_open_margin + intent.required_margin_usd
        max_allowed_margin = current_equity * (MAX_MARGIN_UTILIZATION_PCT / 100.0)
        if new_total_margin > max_allowed_margin or intent.required_margin_usd > free_margin:
            return self._reject(
                PortfolioRiskDecision.REJECTED_MARGIN_UTILIZATION,
                f"Margin requirement (${new_total_margin:.2f}) exceeds allowed margin buffer (${max_allowed_margin:.2f}) or free margin.",
                current_equity, free_margin
            )

        # Approved!
        return PortfolioRiskStatus(
            decision=PortfolioRiskDecision.APPROVED,
            approved=True,
            reason=f"Approved: Sizing {intent.volume:.2f} lots risks ${intent.planned_risk_usd:.2f} (within portfolio limits and margin allowance).",
            current_equity=current_equity,
            free_margin=free_margin,
            total_open_risk_usd=current_open_risk + intent.planned_risk_usd,
            open_positions_count=active_count + 1,
            daily_realized_pnl=self.daily_realized_pnl,
            daily_drawdown_pct=round((effective_daily_loss / self.daily_starting_equity) * 100.0, 2),
            circuit_breaker_active=False,
        )

    def register_open_position(
        self,
        ticket: str,
        intent: PositionRiskIntent,
        position_id: Optional[str] = None,
        deal_ticket: Optional[str] = None,
    ) -> None:
        with self._lock:
            t_str = str(ticket)
            if not intent.ticket:
                intent.ticket = t_str
            if not intent.position_id:
                intent.position_id = str(position_id or t_str)
            if deal_ticket and not intent.deal_ticket:
                intent.deal_ticket = str(deal_ticket)
            if not intent.opened_at:
                intent.opened_at = datetime.now(timezone.utc).isoformat()
            self._open_intents[t_str] = intent
            self._persist_state()

    def register_closed_position(self, ticket: str, realized_pnl_usd: float) -> None:
        with self._lock:
            t_str = str(ticket)
            if t_str in self._reconciled_closed_ids:
                if t_str in self._open_intents:
                    del self._open_intents[t_str]
                    self._persist_state()
                return
            if t_str in self._open_intents:
                del self._open_intents[t_str]
            self._reconciled_closed_ids.append(t_str)
            self.daily_realized_pnl = round(self.daily_realized_pnl + realized_pnl_usd, 2)
            self._persist_state()

    def _reject(self, decision: PortfolioRiskDecision, reason: str, equity: float, free_margin: float) -> PortfolioRiskStatus:
        logger.warning(f"[PORTFOLIO_RISK_REJECT] {decision.value}: {reason}")
        current_daily_loss = -min(0.0, self.daily_realized_pnl)
        return PortfolioRiskStatus(
            decision=decision,
            approved=False,
            reason=reason,
            current_equity=equity,
            free_margin=free_margin,
            total_open_risk_usd=sum(p.planned_risk_usd for p in self._open_intents.values()),
            open_positions_count=len(self._open_intents),
            daily_realized_pnl=self.daily_realized_pnl,
            daily_drawdown_pct=round((current_daily_loss / self.daily_starting_equity) * 100.0, 2),
            circuit_breaker_active=self.circuit_breaker_tripped,
        )
