"""Comprehensive regression tests for Portfolio Risk Position Reconciliation."""
from __future__ import annotations

import json
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.execution.portfolio_risk_engine import (
    CentralizedPortfolioRiskEngine,
    PortfolioRiskDecision,
    PositionRiskIntent,
)


def _intent(
    symbol: str = "USDJPY",
    direction: str = "SELL",
    volume: float = 0.01,
    risk_usd: float = 0.85,
    margin_usd: float = 10.0,
    currencies: list[str] | None = None,
    ticket: str = "",
    position_id: str = "",
) -> PositionRiskIntent:
    return PositionRiskIntent(
        instrument=symbol,
        broker_symbol=symbol,
        direction=direction,
        entry_price=158.81,
        stop_loss=159.15,
        take_profit=158.12,
        volume=volume,
        planned_risk_usd=risk_usd,
        required_margin_usd=margin_usd,
        currencies=currencies or ["USD", "JPY"],
        asset_group="FX_MAJOR",
        ticket=ticket,
        position_id=position_id,
    )


def _pos(ticket: int, symbol: str = "USDJPY", volume: float = 0.01, identifier: int | None = None, order: int | None = None):
    return SimpleNamespace(
        ticket=ticket,
        identifier=identifier if identifier is not None else ticket,
        order=order if order is not None else ticket,
        symbol=symbol,
        volume=volume,
        type=1,
        price_open=158.81,
        sl=159.15,
        tp=158.12,
    )


def _deal(
    ticket: int,
    position_id: int,
    order: int,
    symbol: str,
    entry: int,
    volume: float,
    profit: float,
    reason: int = 4,
):
    return SimpleNamespace(
        ticket=ticket,
        position_id=position_id,
        order=order,
        symbol=symbol,
        entry=entry,
        volume=volume,
        profit=profit,
        commission=0.0,
        swap=0.0,
        reason=reason,
    )


def test_1_mt5_position_remains_open(tmp_path: Path):
    eng = CentralizedPortfolioRiskEngine(state_file=tmp_path / "risk.json")
    eng.register_open_position("2440863713", _intent())
    res = eng.reconcile_positions(positions=[_pos(2440863713)], deals=[])
    assert res.portfolio_open_intents_after == 1
    assert len(res.still_open) == 1
    assert len(res.verified_closed) == 0


def test_2_3_4_5_stop_loss_take_profit_manual_closures_and_specific_tickets(tmp_path: Path):
    """Tests STOP_LOSS (BTCUSD 2435822872, USDJPY 2440863713), TAKE_PROFIT, and manual closure."""
    eng = CentralizedPortfolioRiskEngine(state_file=tmp_path / "risk.json")
    eng.register_open_position("2435822872", _intent("BTCUSD", currencies=["USD"], risk_usd=0.80))
    eng.register_open_position("2440863713", _intent("USDJPY", currencies=["USD", "JPY"], risk_usd=0.80))
    eng.register_open_position("3000000001", _intent("EURUSD", currencies=["EUR", "USD"], risk_usd=0.80))
    eng.register_open_position("3000000002", _intent("GBPUSD", currencies=["GBP", "USD"], risk_usd=0.80))

    deals = [
        _deal(1926992033, 2435822872, 2440925127, "BTCUSD", entry=1, volume=0.01, profit=-8.47, reason=4),
        _deal(1927686857, 2440863713, 2441810004, "USDJPY", entry=1, volume=0.01, profit=-2.14, reason=4),
        _deal(1927686900, 3000000001, 3000000099, "EURUSD", entry=1, volume=0.01, profit=3.50, reason=5),
        _deal(1927686950, 3000000002, 3000000100, "GBPUSD", entry=1, volume=0.01, profit=1.10, reason=0),
    ]

    res = eng.reconcile_positions(positions=[], deals=deals)
    assert res.portfolio_open_intents_after == 0
    assert len(res.verified_closed) == 4
    reasons = {item["ticket"]: item["exit_reason"] for item in res.verified_closed}
    assert reasons["2435822872"] == "STOP_LOSS"
    assert reasons["2440863713"] == "STOP_LOSS"
    assert reasons["3000000001"] == "TAKE_PROFIT"
    assert reasons["3000000002"] == "MANUAL_OR_OTHER"
    assert eng.daily_realized_pnl == pytest.approx(-6.01, abs=0.01)


def test_6_7_position_ticket_and_deal_ticket_mismatch(tmp_path: Path):
    """Order ticket differs from position_id or deal ticket differs from order/position_id."""
    eng = CentralizedPortfolioRiskEngine(state_file=tmp_path / "risk.json")
    eng.register_open_position("555001", _intent("EURUSD"), position_id="666001")

    # Still open matched via position_id/identifier
    res_open = eng.reconcile_positions(positions=[_pos(999001, "EURUSD", identifier=666001)], deals=[])
    assert res_open.portfolio_open_intents_after == 1

    # Closed matched via position_id even though deal ticket & order ticket differ
    res_closed = eng.reconcile_positions(
        positions=[],
        deals=[_deal(777001, position_id=666001, order=888001, symbol="EURUSD", entry=1, volume=0.01, profit=2.0, reason=5)],
    )
    assert res_closed.portfolio_open_intents_after == 0
    assert res_closed.verified_closed[0]["exit_reason"] == "TAKE_PROFIT"


def test_8_9_10_missing_deals_disconnected_and_mt5_error_keep_intents(tmp_path: Path):
    eng = CentralizedPortfolioRiskEngine(state_file=tmp_path / "risk.json")
    eng.register_open_position("2435822872", _intent("BTCUSD", currencies=["USD"]))

    # MT5 positions_get() returned None (disconnected / API error)
    res_err = eng.reconcile_positions(positions=None, deals=[])
    assert res_err.aborted_reason == "MT5_POSITIONS_UNAVAILABLE"
    assert res_err.portfolio_open_intents_after == 1

    # Position missing from MT5 snapshot, but deals missing / None -> do NOT remove
    res_no_deals = eng.reconcile_positions(positions=[], deals=None)
    assert res_no_deals.portfolio_open_intents_after == 1
    assert len(res_no_deals.unverified_kept) == 1

    # Position missing from MT5 snapshot, empty deals -> do NOT remove blindly
    res_empty_deals = eng.reconcile_positions(positions=[], deals=[])
    assert res_empty_deals.portfolio_open_intents_after == 1
    assert len(res_empty_deals.unverified_kept) == 1


def test_11_15_duplicate_reconciliation_and_historical_reappearance_idempotent(tmp_path: Path):
    eng = CentralizedPortfolioRiskEngine(state_file=tmp_path / "risk.json")
    eng.register_open_position("2440863713", _intent("USDJPY"))
    deals = [_deal(1927686857, 2440863713, 2441810004, "USDJPY", entry=1, volume=0.01, profit=-2.14, reason=4)]

    r1 = eng.reconcile_positions(positions=[], deals=deals)
    assert len(r1.verified_closed) == 1
    assert eng.daily_realized_pnl == pytest.approx(-2.14)

    # Repeated reconciliation with same historical deal must be idempotent
    r2 = eng.reconcile_positions(positions=[], deals=deals)
    assert len(r2.verified_closed) == 0
    assert eng.daily_realized_pnl == pytest.approx(-2.14)


def test_12_partial_closure(tmp_path: Path):
    eng = CentralizedPortfolioRiskEngine(state_file=tmp_path / "risk.json")
    eng.register_open_position("400001", _intent("EURUSD", volume=0.02, risk_usd=1.00))

    # Partial close leaves 0.01 open in MT5
    r1 = eng.reconcile_positions(
        positions=[_pos(400001, "EURUSD", volume=0.01)],
        deals=[_deal(9001, 400001, 9002, "EURUSD", entry=1, volume=0.01, profit=1.25, reason=0)],
    )
    assert r1.portfolio_open_intents_after == 1
    assert len(r1.partial_closures) == 1
    assert eng._open_intents["400001"].volume == pytest.approx(0.01)
    assert eng._open_intents["400001"].planned_risk_usd == pytest.approx(0.50)

    # Final close removes remaining 0.01
    r2 = eng.reconcile_positions(
        positions=[],
        deals=[_deal(9003, 400001, 9004, "EURUSD", entry=1, volume=0.01, profit=1.00, reason=5)],
    )
    assert r2.portfolio_open_intents_after == 0
    assert len(r2.verified_closed) == 1


def test_13_concurrent_state_updates_and_atomic_persistence(tmp_path: Path):
    state_file = tmp_path / "risk.json"
    eng = CentralizedPortfolioRiskEngine(state_file=state_file)
    errors = []

    def worker(idx: int):
        try:
            eng.register_open_position(f"700{idx}", _intent("EURUSD", risk_usd=0.20))
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    assert len(eng._open_intents) == 10
    reloaded = CentralizedPortfolioRiskEngine(state_file=state_file)
    assert len(reloaded._open_intents) == 10


def test_14_restart_recovery_and_corrupt_primary_bak_fallback(tmp_path: Path):
    state_file = tmp_path / "risk.json"
    eng = CentralizedPortfolioRiskEngine(state_file=state_file)
    eng.register_open_position("2435822872", _intent("BTCUSD", currencies=["USD"]))
    eng.register_open_position("2440863713", _intent("USDJPY", currencies=["USD", "JPY"]))

    # Corrupt primary JSON -> should recover from .json.bak (which has 1st intent)
    state_file.write_text("{corrupt json", encoding="utf-8")
    recovered = CentralizedPortfolioRiskEngine(state_file=state_file)
    assert "2435822872" in recovered._open_intents


def test_risk_engine_integration_after_reconciliation(tmp_path: Path):
    """Verify closed positions free exposure while limits, equity floor, and drawdown stay enforced."""
    eng = CentralizedPortfolioRiskEngine(state_file=tmp_path / "risk.json")
    eng.register_open_position("2435822872", _intent("BTCUSD", currencies=["USD"], risk_usd=0.80))
    eng.register_open_position("2440863713", _intent("USDJPY", currencies=["USD", "JPY"], risk_usd=0.80))

    # Before reconciliation: NAS100 blocked by USD currency exposure limit (2)
    blocked = eng.validate_pre_order(_intent("NAS100", currencies=["USD"], risk_usd=0.80), current_equity=266.28, free_margin=266.28)
    assert blocked.approved is False
    assert blocked.decision == PortfolioRiskDecision.REJECTED_CURRENCY_EXPOSURE

    # Reconcile both closed STOP_LOSS positions
    deals = [
        _deal(1926992033, 2435822872, 2440925127, "BTCUSD", entry=1, volume=0.01, profit=-8.47, reason=4),
        _deal(1927686857, 2440863713, 2441810004, "USDJPY", entry=1, volume=0.01, profit=-2.14, reason=4),
    ]
    res = eng.reconcile_positions(positions=[], deals=deals)
    assert res.portfolio_open_intents_after == 0
    assert res.resulting_currency_exposure == {}

    # After reconciliation: NAS100 approved
    approved = eng.validate_pre_order(_intent("NAS100", currencies=["USD"], risk_usd=0.80), current_equity=266.28, free_margin=266.28)
    assert approved.approved is True

    # Safety invariants remain enforced: equity floor ($200) and live-trading lock
    low_eq = eng.validate_pre_order(_intent("NAS100", currencies=["USD"], risk_usd=0.80), current_equity=195.0, free_margin=195.0)
    assert low_eq.approved is False
    assert low_eq.decision == PortfolioRiskDecision.REJECTED_EQUITY_FLOOR

    live_blocked = eng.validate_pre_order(_intent("NAS100", currencies=["USD"], risk_usd=0.80), current_equity=266.28, free_margin=266.28, live_trading_attempt=True)
    assert live_blocked.approved is False
    assert live_blocked.decision == PortfolioRiskDecision.REJECTED_LIVE_TRADING_DISABLED


def test_dry_run_does_not_modify_state_file(tmp_path: Path):
    state_file = tmp_path / "risk.json"
    eng = CentralizedPortfolioRiskEngine(state_file=state_file)
    eng.register_open_position("2435822872", _intent("BTCUSD", currencies=["USD"]))
    before_raw = state_file.read_text(encoding="utf-8")

    deals = [_deal(1926992033, 2435822872, 2440925127, "BTCUSD", entry=1, volume=0.01, profit=-8.47, reason=4)]
    dry = eng.reconcile_positions(positions=[], deals=deals, dry_run=True)

    assert dry.dry_run is True
    assert len(dry.verified_closed) == 1
    assert dry.portfolio_open_intents_after == 0
    assert len(eng._open_intents) == 1
    assert state_file.read_text(encoding="utf-8") == before_raw
