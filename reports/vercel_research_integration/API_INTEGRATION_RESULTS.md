# VORTEX AI — Analytics API Gateway Integration Results
**Module:** `website/api/v1/analytics.js`  
**Client Helper:** `website/analytics-client.js`  
**Test Suite:** `website/tests/sprint2_analytics_gateway.test.js`  
**Execution Environment:** Node.js v26.13.0 on Windows  
**Verification Date:** November 13, 2026  
**Result:** **33/33 Tests Passed (0 Failed, 100% Contract Compliance)**

---

## 1. Gateway Overview & Supported Endpoints

The serverless Analytics REST Gateway exposes nine quantitative endpoints conforming strictly to the platform's fail-closed governance, deterministic math models, and fixed risk boundaries:

| # | Endpoint | Query Parameters | Description | Primary Response Fields | Status |
| :-: | :--- | :--- | :--- | :--- | :-: |
| 1 | `/api/v1/analytics/overview` | `symbol` (default: EURUSD) | Platform posture, governance risk limits, active regime, volatility, active session. | `platform_posture`, `fixed_risk_policy`, `regime_summary`, `volatility_summary`, `session_summary` | **200 OK** |
| 2 | `/api/v1/analytics/data-quality` | `symbol` (default: EURUSD) | Data provenance classification, feed continuity %, spike count, latency. | `provenance_tier`, `continuity_pct`, `spike_count`, `latency_ms` | **200 OK** |
| 3 | `/api/v1/analytics/market-regimes` | `symbol`, `timeframe` (M15, H1, H4, D1) | Econometric regime diagnostics: ADX(14), Choppiness(14), Hurst Exponent. | `adx_14`, `choppiness_14`, `hurst_exponent`, `regime_classification` | **200 OK** |
| 4 | `/api/v1/analytics/volatility` | `symbol`, `timeframe` | Volatility metrics: ATR(14) in pips, Realized Vol %, 1Y percentile rank. | `atr_pips`, `realized_vol_pct`, `percentile_rank`, `vol_state` | **200 OK** |
| 5 | `/api/v1/analytics/session-analysis` | `symbol` | UTC session trading ranges, overlap detection, ORB false breakout statistics. | `asian_range_pips`, `london_range_pips`, `ny_range_pips`, `orb_false_breakout_rate` | **200 OK** |
| 6 | `/api/v1/analytics/multi-timeframe` | `symbol` | Multi-timeframe trend consensus (D1/H4/M15) and quantized score (-100 to +100). | `d1_trend`, `h4_trend`, `m15_trend`, `alignment_score`, `consensus_signal` | **200 OK** |
| 7 | `/api/v1/analytics/transaction-costs` | `symbol`, `spread_pips`, `commission_per_lot`, `stop_pips` | Round-trip friction accounting, cost-to-risk ratio, breakeven R-multiple hurdle. | `round_trip_cost_usd`, `cost_to_risk_pct`, `breakeven_r_multiple`, `rollover_guidance` | **200 OK** |
| 8 | `/api/v1/analytics/risk-calculator` | `symbol`, `stop_pips`, `account_balance` | Strict fixed risk quantization (0.01 lot step), actual risk $, minimum-lot rejection. | `recommended_lot_size`, `actual_risk_usd`, `risk_pct_of_balance`, `is_rejected` | **200 OK** |
| 9 | `/api/v1/analytics/historical-forensics`| `strategy_id` | Chronological out-of-sample backtest metrics, UNQUALIFIED verdict, CFTC 4.41. | `total_closed_trades`, `win_rate_pct`, `profit_factor`, `net_expectancy_usd`, `disclaimer` | **200 OK** |

---

## 2. Test Battery Execution Output

```
============================================================
   VORTEX AI — SPRINT 2 ANALYTICS REST GATEWAY BATTERY      
============================================================

--- 1. Configuration Enforcement (Fail-Closed) ---
[PASS] analytics.js: Missing configuration returns HTTP 503
[PASS] analytics.js: Non-HTTPS SUPABASE_URL rejected with HTTP 503

--- 2. Authentication Enforcement on Every Endpoint ---
[PASS] Authentication: /api/v1/analytics/overview rejects unauthenticated request with 401
[PASS] Authentication: /api/v1/analytics/data-quality rejects unauthenticated request with 401
[PASS] Authentication: /api/v1/analytics/market-regimes rejects unauthenticated request with 401
[PASS] Authentication: /api/v1/analytics/volatility rejects unauthenticated request with 401
[PASS] Authentication: /api/v1/analytics/session-analysis rejects unauthenticated request with 401
[PASS] Authentication: /api/v1/analytics/multi-timeframe rejects unauthenticated request with 401
[PASS] Authentication: /api/v1/analytics/transaction-costs rejects unauthenticated request with 401
[PASS] Authentication: /api/v1/analytics/risk-calculator rejects unauthenticated request with 401
[PASS] Authentication: /api/v1/analytics/historical-forensics rejects unauthenticated request with 401
[PASS] Authentication: Invalid JWT rejected with HTTP 401

--- 3. HTTP Method Enforcement & Unknown Routes ---
[PASS] Method Enforcement: POST rejected with HTTP 405 (Allow: GET)
[PASS] Method Enforcement: DELETE rejected with HTTP 405
[PASS] Routing: Unknown analytics endpoint returns HTTP 404

--- 4. Endpoint 1: Overview ---
[PASS] Overview: Returns HTTP 200 with platform posture, risk policy, and summaries

--- 5. Endpoint 2: Data Quality & Provenance ---
[PASS] Data Quality: Major FX (EURUSD) classified as VERIFIED
[PASS] Data Quality: Index (NAS100) accurately classified as PROXY_ONLY
[PASS] Data Quality: Unsupported instrument rejected with HTTP 422

--- 6. Endpoint 3: Market Regime Detection ---
[PASS] Market Regimes: Returns ADX, Choppiness, Hurst, and classification
[PASS] Market Regimes: Unsupported timeframe rejected with HTTP 422

--- 7. Endpoint 4: Volatility Structure ---
[PASS] Volatility: Returns ATR, Realized Volatility %, and Percentile

--- 8. Endpoint 5: Session Analysis & False Breakouts ---
[PASS] Session Analysis: Returns Asian/London/NY ranges and 71.4% false breakout disclosure

--- 9. Endpoint 6: Multi-Timeframe Alignment ---
[PASS] Multi-Timeframe: Returns D1/H4/M15 consensus score and quantization disclosure

--- 10. Endpoint 7: Transaction-Cost Analysis (TCA) ---
[PASS] TCA: Calculates exact round-trip friction, cost-to-risk ratio, and breakeven R-multiple
[PASS] TCA: Negative spread rejected with HTTP 400

--- 11. Endpoint 8: Risk Calculator & Minimum-Lot Rejection ---
[PASS] Risk Calculator: Feasible sizing quantized to 0.02 lots ($4.00 risk, <= $5.00 limit)
[PASS] Risk Calculator: Strictly REJECTS when minimum lot risk ($6.00) exceeds $5.00 risk limit
[PASS] Risk Calculator: Zero/negative stop rejected with HTTP 400

--- 12. Endpoint 9: Historical Forensics & CFTC Disclaimers ---
[PASS] Historical Forensics: Returns UNQUALIFIED verdict and mandatory CFTC Rule 4.41 disclaimer
[PASS] Historical Forensics: Unsupported strategy ID rejected with HTTP 422

--- 13. Correlation ID & Secret Exposure Protection ---
[PASS] Operational: X-Correlation-ID header present and returned in JSON payload
[PASS] Security: Response never leaks service keys, anon keys, or database URLs

============================================================
   SPRINT 2 GATEWAY BATTERY: 33/33 PASSED (0 FAILED)
============================================================
```

---

## 3. Fixed Risk Policy & Minimum-Lot Rejection Verification

A cornerstone invariant of the platform is the immutable **Fixed Risk Policy**:
- **Baseline Equity:** \$200.00 USD
- **Per-Trade Risk Ceiling:** \$5.00 USD
- **Maximum Simultaneous Positions:** 3
- **Aggregate Open Risk Limit:** \$15.00 USD
- **Daily Loss Limit:** \$15.00 USD
- **Permanent Equity Floor:** \$185.00 USD

### Position Sizing & Rejection Formula
For EURUSD (\$10/pip per standard lot):
$$\text{Raw Lots} = \frac{\text{Per-Trade Risk Ceiling}}{\text{Stop Pips} \times \text{Pip Value}} = \frac{\$5.00}{\text{Stop Pips} \times \$10.00}$$
$$\text{Quantized Lots} = \left\lfloor \frac{\text{Raw Lots}}{0.01} \right\rfloor \times 0.01$$

- **Feasible Case (25 pip stop):**
  $$\text{Raw} = \frac{5.00}{250.00} = 0.0200 \implies \text{Lot Size} = 0.02 \implies \text{Actual Risk} = 0.02 \times 25 \times \$10 = \$5.00 \le \$5.00 \quad \text{[APPROVED]}$$
- **Rejection Case (60 pip stop):**
  $$\text{Minimum 0.01 lot risk} = 0.01 \times 60 \times \$10 = \$6.00 > \$5.00 \implies \text{REJECTED (0.00 lots)}$$
  The API returns `is_rejected: true` and `recommended_lot_size: 0.00` with the reason:
  `"Minimum viable position (0.01 lots = $6.00 risk) exceeds the immutable $5.00 per-trade risk limit."`

---

## 4. Lineage & Provenance Traceability

All metrics returned by the API are strictly traceable to offline chronological backtests and phase audits:
1. **ORB False Breakout Rate (71.4%):** Traceable to `app/phase123b_session_behaviour.py`.
2. **ORB Gross Expectancy (-\$0.42):** Traceable to `app/phase123b_session_behaviour.py`.
3. **Multi-Timeframe Consensus Score (-60.0):** Traceable to `app/phase122a_data_qualification.py`.
4. **Hurst Exponent (0.62):** Traceable to `app/phase120c_regime_performance.py`.
5. **Historical Closed Trades (342):** Traceable to Phase 120b & Phase 128b out-of-sample datasets.
6. **Win Rate (38.6%):** Traceable to Phase 120b & Phase 128b evaluations.
7. **Net Expectancy (-\$0.10):** Traceable to deterministic friction deduction (\$0.12 gross - \$0.22 friction).
8. **Round-Trip Friction (\$0.22):** Traceable to `app/phase128c_cost_sizing_broker.py`.
