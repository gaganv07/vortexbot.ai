# VORTEX AI — Portfolio Risk State Reconciliation Remediation Report

## 1. Root Cause Analysis
- **Primary Defect**: `MultiInstrumentSupervisor.__init__()` (`app/services/multi_instrument_supervisor.py:197`) calls `self.risk_engine.sync_with_mt5()` **only once at startup**. In `MultiInstrumentSupervisor.step_all()` (`app/services/multi_instrument_supervisor.py:621`), `self.reconciliation_service.reconcile_from_mt5(days_back=7)` runs each polling cycle, but neither `self.risk_engine.sync_with_mt5()` nor `self.risk_engine.register_closed_position()` is invoked when positions close on MT5.
- **Secondary Defects in `app/execution/portfolio_risk_engine.py`**:
  1. **Unsafe Blind Removal**: `sync_with_mt5()` previously converted `mt5.positions_get() is None` into `[]` and deleted every intent in `_open_intents` without verifying closure via historical deals.
  2. **Identifier Mismatch**: Only `str(p.ticket)` was checked, without cross-matching `position_id` / `identifier` / `order` across live positions and exit deals.
  3. **Unconditional `mt5.shutdown()`**: `sync_with_mt5()` called `mt5.shutdown()` unconditionally, which tears down the shared MT5 IPC connection inside a long-running Supervisor.
  4. **Non-Atomic Persistence & Swallowed Errors**: `_persist_state()` wrote directly to `portfolio_risk_state.json` without `threading.RLock`, `.bak` backup, or atomic `os.replace()`; `_load_state()` and `sync_with_mt5()` silently swallowed exceptions.

### Verified Stale Production Tickets
- **MT5 Live State**: `0` open positions, `0` pending orders (`login=26458461`, `VantageMarkets-Demo`, Balance/Equity `$266.28 USD`).
- **Stale Records in `database/portfolio_risk_state.json`**:
  1. `BTCUSD` Ticket/Position `2435822872` (`SELL 0.01`) — closed `2026-11-25T19:20:07+00:00` via `STOP_LOSS` (`exit_deal=1926992033`, `PnL=-$8.47`).
  2. `USDJPY` Ticket/Position `2440863713` (`SELL 0.01`) — closed `2026-11-25T20:52:38+00:00` via `STOP_LOSS` (`exit_deal=1927686857`, `PnL=-$2.14`).
- **Impact**: Both stale intents counted toward the `MAX_CURRENCY_EXPOSURE = 2` limit for `USD`, causing `REJECTED_CURRENCY_EXPOSURE` on subsequent approved signals (`NAS100` at `2026-11-26 12:45:07`, `US30` at `11:45:08`, etc.).

## 2. Exact Affected Functions & Files Changed
- **Modified / Added in `fix/portfolio-risk-position-reconciliation`**:
  - `app/execution/__init__.py`
  - `app/execution/portfolio_risk_engine.py`:
    - `PositionRiskIntent` (added `ticket`, `position_id`, `deal_ticket`, `opened_at`, `closed_volume`)
    - `ReconciliationResult` (structured audit/dry-run report)
    - `CentralizedPortfolioRiskEngine._load_state()` (schema validation + `.json.bak` fallback)
    - `CentralizedPortfolioRiskEngine._persist_state()` (thread-safe `RLock`, `.json.bak` backup, `tempfile` + `os.fsync` + `os.replace`)
    - `CentralizedPortfolioRiskEngine.reconcile_positions()` (authoritative, fail-closed, idempotent 4-way reconciliation across live MT5 positions, `_open_intents`, MT5 exit deals, and trade journal records, with partial-closure and `dry_run` support)
    - `CentralizedPortfolioRiskEngine.sync_with_mt5(shut_down_after=False, days_back=7)`
    - `CentralizedPortfolioRiskEngine.register_open_position()` / `register_closed_position()` (locked & idempotent)
  - `tests/test_portfolio_risk_reconciliation.py`
  - `VORTEX_PORTFOLIO_RISK_RECONCILIATION_REPORT.md`
  - `VORTEX_PORTFOLIO_RISK_RECONCILIATION_TEST_REPORT.md`

## 3. Read-Only Dry-Run Output
Executed against a temporary read-only copy of `database/portfolio_risk_state.json` + live read-only MT5 `positions_get()` and `history_deals_get()`:
- `mt5_open_positions_count`: `0`
- `portfolio_open_intents_before`: `2` (`2435822872`, `2440863713`)
- `portfolio_open_intents_after`: `0`
- `verified_closed`:
  - `2435822872` (`BTCUSD`, `STOP_LOSS`, `exit_deal_tickets=[1926992033]`, `closed_volume=0.01`, `realized_pnl=-8.47`, `MT5_DEAL_HISTORY`)
  - `2440863713` (`USDJPY`, `STOP_LOSS`, `exit_deal_tickets=[1927686857]`, `closed_volume=0.01`, `realized_pnl=-2.14`, `MT5_DEAL_HISTORY`)
- `unverified_kept`: `[]`
- `resulting_currency_exposure`: `{}`
- `dry_run`: `true` (`database/portfolio_risk_state.json` verified byte-identical / untouched).

## 4. Production Change Authorization Gate (Proposed Plan — Awaiting Authorization)
**No production files or running services were modified.** Once authorized:
1. Back up `database/portfolio_risk_state.json` to `database/portfolio_risk_state.json.pre_remediation.bak`.
2. Deploy the updated `app/execution/portfolio_risk_engine.py` and add `self.risk_engine.sync_with_mt5(shut_down_after=False)` inside `MultiInstrumentSupervisor.step_all()` (`app/services/multi_instrument_supervisor.py`) alongside `reconcile_from_mt5()`.
3. Run one-shot reconciliation (or controlled Supervisor reload without touching MT5 `PID 13308`) to clear the 2 verified closed intents (`2435822872`, `2440863713`) and reset `USD` currency exposure from `2` to `0`.
4. **Expected Impact**: Subsequent approved signals will pass `CentralizedPortfolioRiskEngine.validate_pre_order()` normally while all equity floor (`$200`), daily drawdown (`15%`), position (`3`), and currency (`2`) limits remain strictly enforced.

## 5. Git Metadata
- **Repository**: `https://github.com/gaganv07/vortexbot.ai`
- **Branch**: `fix/portfolio-risk-position-reconciliation`
- **Main / Vercel**: `main` untouched; zero Vercel deployments triggered.
