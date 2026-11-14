# VORTEX AI — PR #19 DATA PROVENANCE & INSTRUMENT AUDIT
## Full Forensic Audit of Data Contracts, Lineage, and Instrument Universe

**Repository:** `gaganv07/vortexbot.ai`  
**Pull Request:** PR #19 (`feature/research-analytics-dashboard` $\to$ `main`)  
**Audit Date:** November 14, 2026 (Reconciled)  
**Audit Scope:** Research Analytics REST Gateway (`website/api/v1/analytics.js`) & UI (`website/research.html`)  
**Audit Posture:** **AUDITED & RECONCILED: RESEARCH SPECIFICATIONS & BROKER PROVENANCE**  

---

### 1. Executive Summary

This audit assesses data provenance, contract specifications, and instrument universe boundaries in Pull Request #19. All analytics exposed by the REST gateway at `website/api/v1/analytics.js` and rendered by `website/research.html` have been cross-referenced with institutional research artifacts from Phases 108 through 128.

Key architectural boundaries enforced:
1. **Preservation of Raw Spread CFD vs. Standard Proxies:** Strictly distinguishes raw-spread CFD instruments (`NAS100.R`, `DJ30.R`) from standard retail spread markup CFD proxies (`NAS100`, `US30`). Suffixes are never stripped.
2. **Strict 10-Instrument Universe Boundary:** Validates the exact 10 approved instruments; immediately rejects unauthorized instruments (such as `ETHUSD`, `SOLUSD`, `SPX500`) with `HTTP 422 Unprocessable Entity`.
3. **Broker-Verified vs. Research-Only & Unverified Categorization:** Clear, evidence-based segregation between broker-verified contract specifications (Vantage MT5 tick archives), research-only datasets (`XAGUSD`), proxy-derived values (`NAS100`, `US30`), raw spread specifications (`NAS100.R`, `DJ30.R`), and unverified contracts (`BTCUSD`).
4. **Transparent Feed State & Offline Replay Disclosures:** In accordance with SEC, CFTC, and consumer transparency standards, live broker streams are truthfully reported as `feed_freshness: 'UNAVAILABLE'` and `market_session_state: 'OFFLINE_STAGING'`. No live price feeds or synthetic freshness metrics are fabricated.

---

### 2. Exact 10-Instrument Universe & Contract Specifications

The gateway strictly enforces the 10-instrument universe register:

```javascript
const AUTHORIZED_UNIVERSE = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD',
  'NAS100', 'US30', 'NAS100.R', 'DJ30.R', 'BTCUSD'
];
```

#### Detailed Instrument Classification Matrix

| Instrument | Classification Category | Provenance Tier | Contract Size | Point / Pip Size | Point Value (1.0 Std Lot) | Point Value (0.01 Min Lot) | Data Lineage & Evidence Source |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **EURUSD** | Major FX | `BROKER_VERIFIED` | 100,000 | 0.0001 | \$10.00 | \$0.10 | Vantage MT5 Broker Contract & Historical Tick Archive |
| **GBPUSD** | Major FX | `BROKER_VERIFIED` | 100,000 | 0.0001 | \$10.00 | \$0.10 | Vantage MT5 Broker Contract & Historical Tick Archive |
| **USDJPY** | Major FX | `BROKER_VERIFIED` | 100,000 | 0.01 | \$6.70 | \$0.067 | Vantage MT5 Broker Contract & Historical Tick Archive |
| **XAUUSD** | Spot Gold CFD | `BROKER_VERIFIED` | 100 | 0.01 | \$100.00 | \$1.00 | Broker Raw Gold Tick Archive & MT5 Specifications |
| **XAGUSD** | Spot Silver CFD | `RESEARCH_ONLY` | 5,000 | 0.001 | \$50.00 | \$0.50 | Phase 46/47 Silver Staging Dataset (Offline Research) |
| **NAS100** | Equity Index CFD (Standard) | `PROXY_DERIVED` | 1 | 1.00 | \$1.00 | \$0.01 | Standard Retail Spread Markup Proxy Model |
| **US30** | Equity Index CFD (Standard) | `PROXY_DERIVED` | 1 | 1.00 | \$1.00 | \$0.01 | Standard Retail Spread Markup Proxy Model |
| **NAS100.R**| Equity Index CFD (Raw Spread) | `RAW_SPREAD_TIER`| 1 | 1.00 | \$1.00 | \$0.01 | Raw Spread Tier CFD (\$7.00/lot RT comm model) |
| **DJ30.R** | Equity Index CFD (Raw Spread) | `RAW_SPREAD_TIER`| 1 | 1.00 | \$1.00 | \$0.01 | Raw Spread Tier CFD (\$7.00/lot RT comm model) |
| **BTCUSD** | Crypto Cash CFD | `UNVERIFIED` | 1 | 1.00 | \$1.00 | \$0.01 | Cash-Settled Derivative (Unprovisioned in Staging) |

#### Negative Boundary Verification
Any symbol outside the authorized 10 is strictly rejected with `HTTP 422 Unprocessable Entity`:
- Disallowed crypto derivatives (`ETHUSD`, `SOLUSD`) $\implies$ `HTTP 422`.
- Equities and foreign indices (`AAPL`, `SPX500`, `EURGBP`, `DOW30`) $\implies$ `HTTP 422`.

---

### 3. Suffix Preservation & CFD Spread Model Distinction

#### NAS100 vs. NAS100.R and US30 vs. DJ30.R
- **Separation Enforced:** The parser preserves the full instrument string without stripping suffixes.
- `NAS100.R` and `DJ30.R` are modeled as raw-spread instruments (`raw_spread: true`, `category: 'EQUITY_INDEX_CFD_RAW'`, and `provenance_tier: 'RAW_SPREAD_TIER'`) carrying a distinct \$7.00/lot round-turn commission structure.
- `NAS100` and `US30` are recognized with `raw_spread: false` and standard retail spread markup.
- This ensures separate accounting and prevents conflation of raw institutional tiers with retail markup proxies.

#### BTCUSD Cash CFD Status
- The platform documents that `BTCUSD` is a cash-settled broker CFD derivative, not physical spot crypto.
- Because live crypto liquidity is unprovisioned in the staging environment, `BTCUSD` returns:
  - `data_classification: 'UNVERIFIED'`
  - `indicators: { adx14: null, choppiness_index14: null, hurst_exponent: null }`
  - `audit_metrics: { total_bars_audited: 0, data_continuity_pct: null, last_observed_timestamp_utc: null }`
- No synthetic price quotes or false technical indicator readings are fabricated.

---

### 4. Risk Calculator Contract & Quantization Math

The risk calculator enforces the platform governance rule: \$200 baseline equity with a maximum per-trade monetary risk cap of **\$5.00** (2.5% max risk), quantized to **0.01 lot steps**.

$$\text{Theoretical Lots} = \frac{\text{Per Trade Risk USD}}{\text{Stop Pips} \times \text{Pip Value per Std Lot}}$$
$$\text{Executable Lots} = \left\lfloor \text{Theoretical Lots} \times 100 \right\rfloor \div 100$$
$$\text{Monetary Risk at 0.01 Lot} = \text{Stop Pips} \times (0.01 \times \text{Pip Value per Std Lot})$$

#### Feasibility and Rejection Gates
1. **Feasible Trade (EURUSD, 20 pips):**
   - $\text{Theoretical} = 5.00 / (20 \times 10.00) = 0.025 \text{ lots}$
   - $\text{Executable} = 0.02 \text{ lots}$
   - $\text{Actual Dollar Risk} = 0.02 \times 20 \times 10.00 = \$4.00 \le \$5.00$
   - Result: `FEASIBLE` (quantization error: 20%).
2. **Rejection (XAUUSD, 10 pips):**
   - Pip value per standard lot = \$100.00; pip value per 0.01 min lot = \$1.00.
   - Monetary risk at 0.01 lot = $10 \times \$1.00 = \$10.00$.
   - Because $\$10.00 > \$5.00$, trade is strictly rejected:
     - `feasibility_status: 'REJECTED_EXCEEDS_RISK_LIMIT'`
     - `executable_quantized_lots: 0.00`
     - `max_allowable_stop_pips: 5.0`
3. **Rejection (EURUSD, 60 pips):**
   - Monetary risk at 0.01 lot = $60 \times \$0.10 = \$6.00 > \$5.00$.
   - Result: `REJECTED_EXCEEDS_RISK_LIMIT` (max allowable stop: 50.0 pips).

---

### 5. Data Freshness & Provenance Transparency Disclosures

To ensure compliance with SEC, CFTC, and consumer protection guidelines, all staging indicators are disclosed truthfully:
- **Broker Disconnect:** `feed_freshness: 'UNAVAILABLE'`, `market_session_state: 'OFFLINE_STAGING'`.
- **Historical Nature:** All metrics, regimes, and forensic tables reflect closed historical evaluation windows (Phase 108–128 archives).
- **Regulatory Warning:** Overview and forensics panes prominently display the verbatim CFTC Rule 4.41 disclaimer on hypothetical/historical performance.
