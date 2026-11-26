# VORTEX AI — Portfolio Risk State Reconciliation Remediation Report

## 1. Root Cause Analysis
- **Primary Defect**: `MultiInstrumentSupervisor.__init__()` (`app/services/multi_instrument_supervisor.py:197`) calls `self.risk_engine.sync_with_mt5()` **only once at startup**. In `MultiInstrumentSupervisor.step_all()` (`app/services/multi_instrument_supervisor.py:621`), `self.reconciliation_service.reconcile_from_mt5(days_back=7)` runs each polling cycle, but neither `self.risk_engine.sync_with_mt5()` nor `self.risk_engine.register_closed_position()` is invoked when positions close on MT5.
- **Secondary Defects in `app/execution/portfolio_risk_engine.py`**:
  1. **Unsafe Blind Removal**: `sync_with_mt5()` previously converted `mt5.positions_get() is None` into `[]` and deleted every intent in `_open_intents` without verifying closure via historical deals.
  2. **Identifier Mismatch**: Only `str(p.ticket)` was checked, without cross-matching `position_id` / `identifier` / `order` across live positions and exit deals.
  3. **Unconditional `mt5.shutdown()`**: `sync_with_mt5()` called `mt5.shutdown()` unconditionally, which tears down the shared MT5 IPC connection inside a long-running Supervisor.
  4. **Non-Atomic Persistence & Swallowed Errors**: `_persist_state()` wrote directly to `portfolio_risk_state.json` without `threading.RLock`, `.bak` backup, or atomic `os.replace()`; `_load_state()` and `sync_with_mt5()` silently swallowed exceptions.

## 2. Exact Affected Functions & Files Changed
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

## 3. Read-Only Production Dry-Run & Intent Classification
Executed against a read-only copy of `database/portfolio_risk_state.json` + live read-only MT5 `positions_get()` (`0` open positions) and `history_deals_get()` (7-day window):

| Intent Key | Symbol | Classification | Evidence |
|---|---|---|---|
| `2435822872` | `BTCUSD` (`SELL 0.01`) | **VERIFIED_CLOSED** | Absent from MT5 `positions_get()`; MT5 exit deal `1926992033` (`order=2440925127`, `position_id=2435822872`, `entry=1`, `volume=0.01`, `profit=-8.47`, `reason=4` `STOP_LOSS` at `2026-11-25T19:20:07+00:00`). |
| `2440863713` | `USDJPY` (`SELL 0.01`) | **VERIFIED_CLOSED** | Absent from MT5 `positions_get()`; MT5 exit deal `1927686857` (`order=2441810004`, `position_id=2440863713`, `entry=1`, `volume=0.01`, `profit=-2.14`, `reason=4` `STOP_LOSS` at `2026-11-25T20:52:38+00:00`). |

### Exact Before vs. Proposed After State
- **Before (`database/portfolio_risk_state.json`, untouched)**:
  - `open_intents_count`: `2`
  - `open_intents`: `{"2435822872": {...BTCUSD...}, "2440863713": {...USDJPY...}}`
  - Active `USD` currency exposure: `2` (blocking new `USD`-exposed trades via `REJECTED_CURRENCY_EXPOSURE`)
  - `daily_realized_pnl`: `47.37`
- **Proposed After (upon authorized remediation)**:
  - `open_intents_count`: `0`
  - `open_intents`: `{}`
  - `reconciled_closed_ids`: `["2435822872", "2440863713"]`
  - Active `USD` currency exposure: `0`
  - `daily_realized_pnl` delta from these 2 reconciled deals: `-10.61` (`36.76` if applied to `47.37`)

## 4. Production Change Authorization Gate (Hard Stop)
**No production files or running services were modified.** Once authorized:
1. Back up `database/portfolio_risk_state.json` to `database/portfolio_risk_state.json.pre_remediation.bak`.
2. Deploy updated `app/execution/portfolio_risk_engine.py` and add `self.risk_engine.sync_with_mt5(shut_down_after=False)` inside `MultiInstrumentSupervisor.step_all()` (`app/services/multi_instrument_supervisor.py`).
3. Perform controlled Supervisor reload without touching MT5 (`PID 13308`) or Control Center API (`PID 15776`).

## 5. Git Metadata & Push Blocker
- **Repository**: `https://github.com/gaganv07/vortexbot.ai`
- **Branch**: `fix/portfolio-risk-position-reconciliation`
- **Remote Push Status**: Blocked in non-interactive shell by Git Credential Manager (`GCM_INTERACTIVE=never` / `GIT_TERMINAL_PROMPT=0` -> `fatal: could not read Username for 'https://github.com': terminal prompts disabled`). Requires interactive `git push -u origin fix/portfolio-risk-position-reconciliation` by the operator.
- **`main` & Vercel**: `main` untouched at `d3f4eaacaf8eb95240a2481cc95ab68088fcf686`; zero Vercel deployments triggered.
