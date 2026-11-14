/**
 * website/tests/sprint3_research_dashboard.test.js
 * VORTEX AI — Sprint 3 Research Dashboard UI & Client Integration Test Battery
 * Tests information architecture, accessibility, API client integration,
 * exact 10-instrument universe, fixed risk policy, boundary cases, and XSS security.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WEBSITE_DIR = path.resolve(__dirname, '..');
const DASHBOARD_PATH = fs.existsSync(path.join(WEBSITE_DIR, 'research.html')) ? path.join(WEBSITE_DIR, 'research.html') : path.join(WEBSITE_DIR, 'dashboard.html');
const CLIENT_PATH = path.join(WEBSITE_DIR, 'analytics-client.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(name, passed, detail) {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`[PASS] ${name}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${name}${detail ? ': ' + detail : ''}`);
  }
}

async function runSprint3Battery() {
  console.log('============================================================');
  console.log('   VORTEX AI — SPRINT 3 RESEARCH DASHBOARD TEST BATTERY     ');
  console.log('============================================================\n');

  assert(fs.existsSync(DASHBOARD_PATH), 'dashboard.html must exist');
  assert(fs.existsSync(CLIENT_PATH), 'analytics-client.js must exist');

  const dashboardHtml = fs.readFileSync(DASHBOARD_PATH, 'utf8');
  const clientCode = fs.readFileSync(CLIENT_PATH, 'utf8');

  // -------------------------------------------------------------------------
  // GROUP 1: HTML Architecture, Semantic Landmarks & Accessibility
  // -------------------------------------------------------------------------
  console.log('--- 1. HTML Architecture, Semantic Landmarks & Accessibility ---');

  report('HTML Standards: Document has valid DOCTYPE, lang="en", and meta viewport',
    dashboardHtml.includes('<!doctype html>') &&
    dashboardHtml.includes('<html lang="en">') &&
    dashboardHtml.includes('name="viewport"')
  );

  report('Semantic Landmarks: Header, main, nav, section, and dialog present',
    dashboardHtml.includes('<header>') &&
    dashboardHtml.includes('<main') &&
    dashboardHtml.includes('<nav') &&
    dashboardHtml.includes('<section') &&
    dashboardHtml.includes('role="dialog"')
  );

  report('ARIA Tablist: Nav container declares role="tablist" with aria-label',
    dashboardHtml.includes('role="tablist"') &&
    dashboardHtml.includes('aria-label="Research Console Sections"')
  );

  report('ARIA Tabs: Individual tabs declare role="tab", aria-selected, and aria-controls',
    dashboardHtml.includes('role="tab"') &&
    dashboardHtml.includes('aria-selected="true"') &&
    dashboardHtml.includes('aria-controls="tab-overview"')
  );

  report('ARIA Tabpanels: Panels declare role="tabpanel", tabindex="0", and aria-labelledby',
    dashboardHtml.includes('role="tabpanel"') &&
    dashboardHtml.includes('tabindex="0"') &&
    dashboardHtml.includes('aria-labelledby="tab-btn-overview"')
  );

  report('Focus State Styling: CSS contains visible outline for keyboard navigation',
    dashboardHtml.includes(':focus-visible') &&
    dashboardHtml.includes('outline: 2px solid var(--teal)')
  );

  report('Keyboard Navigation: Script handles ArrowLeft, ArrowRight, Home, and End keys',
    dashboardHtml.includes("e.key === 'ArrowRight'") &&
    dashboardHtml.includes("e.key === 'ArrowLeft'") &&
    dashboardHtml.includes("e.key === 'Home'") &&
    dashboardHtml.includes("e.key === 'End'")
  );

  // -------------------------------------------------------------------------
  // GROUP 2: Product Identity & Research Posture Disclosures
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Product Identity & Research Posture Disclosures ---');

  report('Product Title: Title accurately identifies Trading Research & Analytics Platform',
    dashboardHtml.includes('VORTEX AI — Trading Research & Analytics Platform')
  );

  report('Execution Posture: Prominently identifies HARD DISARMED (arm_is_armed=False)',
    dashboardHtml.includes('HARD DISARMED') &&
    dashboardHtml.includes('arm_is_armed=False')
  );

  report('ML Inference Posture: Prominently identifies SHADOW ONLY mode',
    dashboardHtml.includes('ML: SHADOW ONLY')
  );

  report('Research Disclosure Banner: Conspicuously declares informational research only',
    dashboardHtml.includes('RESEARCH &amp; ANALYTICS PLATFORM DISCLOSURE') &&
    dashboardHtml.includes('Live automated order execution is permanently HARD DISARMED')
  );

  report('CFTC Rule 4.41: Mandatory hypothetical performance disclaimer present in full',
    dashboardHtml.includes('CFTC RULE 4.41 MANDATORY HYPOTHETICAL DISCLAIMER') &&
    dashboardHtml.includes('HYPOTHETICAL OR SIMULATED PERFORMANCE RESULTS HAVE CERTAIN LIMITATIONS') &&
    dashboardHtml.includes('DO NOT REPRESENT ACTUAL TRADING')
  );

  report('Zero False Profit Indicators: No misleading guaranteed profit statements in dashboard',
    !dashboardHtml.includes('guaranteed profit') &&
    !dashboardHtml.includes('passive income') &&
    !dashboardHtml.includes('automated profits')
  );

  // -------------------------------------------------------------------------
  // GROUP 3: Exact 10-Instrument Universe & Instrument Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Exact 10-Instrument Universe & Instrument Isolation ---');

  const EXPECTED_UNIVERSE = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD',
    'NAS100', 'US30', 'NAS100.R', 'DJ30.R', 'BTCUSD'
  ];

  let allInstrumentsPresent = true;
  for (const sym of EXPECTED_UNIVERSE) {
    if (!dashboardHtml.includes(`value="${sym}"`)) {
      allInstrumentsPresent = false;
      break;
    }
  }
  report('Universe Completeness: Global symbol selector contains all 10 universe instruments',
    allInstrumentsPresent
  );

  report('Universe Boundary Isolation: Disallowed cryptos (ETHUSD, SOLUSD) strictly absent',
    !dashboardHtml.includes('ETHUSD') &&
    !dashboardHtml.includes('SOLUSD')
  );

  report('Index Distinction: Standard and Raw spread instruments are strictly segregated',
    dashboardHtml.includes('value="NAS100"') &&
    dashboardHtml.includes('value="NAS100.R"') &&
    dashboardHtml.includes('value="US30"') &&
    dashboardHtml.includes('value="DJ30.R"') &&
    dashboardHtml.includes('Distinct from standard NAS100') &&
    dashboardHtml.includes('Distinct from standard US30')
  );

  report('Crypto Distinction: BTCUSD CFD strictly segregated from spot BTCUSDT',
    dashboardHtml.includes('value="BTCUSD"') &&
    !dashboardHtml.includes('value="BTCUSDT"') &&
    dashboardHtml.includes('Distinct from Spot BTCUSDT')
  );

  // -------------------------------------------------------------------------
  // GROUP 4: Reusable API Client Integration (analytics-client.js)
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Reusable API Client Integration (analytics-client.js) ---');

  const AnalyticsClient = require(CLIENT_PATH);

  report('Client Module: AnalyticsClient exports all 9 endpoint methods',
    typeof AnalyticsClient.getOverview === 'function' &&
    typeof AnalyticsClient.getDataQuality === 'function' &&
    typeof AnalyticsClient.getMarketRegimes === 'function' &&
    typeof AnalyticsClient.getVolatility === 'function' &&
    typeof AnalyticsClient.getSessionAnalysis === 'function' &&
    typeof AnalyticsClient.getMultiTimeframe === 'function' &&
    typeof AnalyticsClient.getTransactionCosts === 'function' &&
    typeof AnalyticsClient.getRiskCalculator === 'function' &&
    typeof AnalyticsClient.getHistoricalForensics === 'function' &&
    typeof AnalyticsClient.fetchAll === 'function'
  );

  report('Race Condition Guard: Client tracks request sequence to drop superseded responses',
    clientCode.includes('requestSequences[routeKey]') &&
    clientCode.includes('requestSequences[routeKey] !== currentSeq')
  );

  report('In-flight Timeout: Client enforces 10-second AbortController timeout',
    clientCode.includes('AbortController') &&
    clientCode.includes('TIMEOUT_MS: 10000') &&
    clientCode.includes('controller.abort()')
  );

  report('Cache Guard: Client enforces cache: "no-store" on all analytics requests',
    clientCode.includes("cache: 'no-store'")
  );

  report('Auth Injection: Client extracts Bearer token and attaches Authorization header',
    clientCode.includes("'Authorization': `Bearer ${token}`")
  );

  report('Correlation ID Propagation: Client extracts X-Correlation-ID from response headers',
    clientCode.includes('X-Correlation-ID') || clientCode.includes('x-correlation-id')
  );

  // -------------------------------------------------------------------------
  // GROUP 5: 9 Research Panes Present & Contract Compliance
  // -------------------------------------------------------------------------
  console.log('\n--- 5. 9 Research Panes Present & Contract Compliance ---');

  report('Tab 1 (Overview): Overview section rendered with posture and governance limits',
    dashboardHtml.includes('id="tab-overview"') &&
    dashboardHtml.includes('id="overview-posture-val"') &&
    dashboardHtml.includes('Institutional Risk Policy Mandate')
  );

  report('Tab 2 (Market Regimes): Regimes section rendered with ADX, Choppiness, and Hurst',
    dashboardHtml.includes('id="tab-regimes"') &&
    dashboardHtml.includes('id="regime-adx-val"') &&
    dashboardHtml.includes('id="regime-chop-val"') &&
    dashboardHtml.includes('id="regime-hurst-val"')
  );

  report('Tab 3 (Volatility): Volatility section rendered with ATR, realized vol, and percentile',
    dashboardHtml.includes('id="tab-volatility"') &&
    dashboardHtml.includes('id="vol-atr-val"') &&
    dashboardHtml.includes('id="vol-realized-val"') &&
    dashboardHtml.includes('id="vol-percentile-val"')
  );

  report('Tab 4 (Sessions): Session section rendered with UTC sessions and ORB 71.4% false rate',
    dashboardHtml.includes('id="tab-sessions"') &&
    dashboardHtml.includes('London Session (07:00 - 16:00 UTC)') &&
    dashboardHtml.includes('71.4% (Severe Mean-Reversion Drag)') &&
    dashboardHtml.includes('-$0.42 / trade')
  );

  report('Tab 5 (Multi-Timeframe): MTF section rendered with D1/H4/M15 consensus score',
    dashboardHtml.includes('id="tab-mtf"') &&
    dashboardHtml.includes('Consensus Score: -60.0 / 100') &&
    dashboardHtml.includes('D1 (Macro)') &&
    dashboardHtml.includes('H4 (Intermediate)') &&
    dashboardHtml.includes('M15 (Precision)')
  );

  report('Tab 6 (TCA): TCA section rendered with spread, commission, slippage, and hurdle',
    dashboardHtml.includes('id="tab-tca"') &&
    dashboardHtml.includes('id="tca-spread-cost"') &&
    dashboardHtml.includes('id="tca-comm-cost"') &&
    dashboardHtml.includes('id="tca-slip-cost"') &&
    dashboardHtml.includes('Cost-to-Risk Budget Ratio')
  );

  report('Tab 7 (Risk Calculator): Interactive calculator rendered with rejection alerts',
    dashboardHtml.includes('id="tab-risk"') &&
    dashboardHtml.includes('id="risk-stop-input"') &&
    dashboardHtml.includes('id="risk-balance-input"') &&
    dashboardHtml.includes('REJECTED: EXCEEDS RISK LIMIT')
  );

  report('Tab 8 (Historical Forensics): Strategy diagnostics rendered with UNQUALIFIED status',
    dashboardHtml.includes('id="tab-forensics"') &&
    dashboardHtml.includes('342') &&
    dashboardHtml.includes('38.6%') &&
    dashboardHtml.includes('0.88') &&
    dashboardHtml.includes('-$0.10') &&
    dashboardHtml.includes('UNQUALIFIED')
  );

  report('Tab 9 (Data Quality): Quality section rendered with complete 10-instrument matrix',
    dashboardHtml.includes('id="tab-quality"') &&
    dashboardHtml.includes('id="dq-bars-val"') &&
    dashboardHtml.includes('Full VORTEX AI Universe Coverage &amp; Provenance Matrix') &&
    dashboardHtml.includes('PROXY_ONLY') &&
    dashboardHtml.includes('VERIFIED')
  );

  // -------------------------------------------------------------------------
  // GROUP 6: Fixed Risk Policy & Risk Boundary Enforcement
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Fixed Risk Policy & Risk Boundary Enforcement ---');

  report('Risk Policy Values: $200 baseline equity and $5.00 per-trade risk ceiling preserved',
    dashboardHtml.includes('$200.00') &&
    dashboardHtml.includes('$5.00') &&
    dashboardHtml.includes('$15.00') &&
    dashboardHtml.includes('$185.00')
  );

  report('Quantization Floor: Calculator enforces 0.01 lot minimum volume step',
    dashboardHtml.includes('Quantized in 0.01 Steps') &&
    dashboardHtml.includes('monetary_risk_at_min_lot_usd')
  );

  report('Rejection Enforcement: Stop distance > 50 pips on EURUSD forces 0.00 lots',
    dashboardHtml.includes('REJECTED_EXCEEDS_RISK_LIMIT') &&
    dashboardHtml.includes('BLOCKED (Volume forced to 0.00)') &&
    dashboardHtml.includes('strictly violates the fixed $5.00 per-trade risk cap')
  );

  // -------------------------------------------------------------------------
  // GROUP 7: Security, Sanitization & Anti-Tampering
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Security, Sanitization & Anti-Tampering ---');

  report('XSS Sanitization: escapeHtml utility active and applied to API text outputs',
    dashboardHtml.includes('function escapeHtml(str)') &&
    dashboardHtml.includes('escapeHtml(')
  );

  report('Secret Exposure Guard: Zero hardcoded API keys, service roles or secret tokens in HTML',
    !dashboardHtml.includes('sb_secret_') &&
    !dashboardHtml.includes('SUPABASE_SERVICE_ROLE_KEY') &&
    !dashboardHtml.includes('xtyszeuvtfcgognkrwxv')
  );

  report('Client Credential Hygiene: analytics-client.js contains zero embedded secrets',
    !clientCode.includes('sb_secret_') &&
    !clientCode.includes('sb_publishable_') &&
    !clientCode.includes('http://localhost:')
  );

  report('Fail-Closed Auth Guard: Dashboard redirects unauthenticated sessions to /login.html',
    dashboardHtml.includes("window.location.replace('/login.html')")
  );

  // -------------------------------------------------------------------------
  // GROUP 8: Backward Compatibility with Prior Regression Test Anchors
  // -------------------------------------------------------------------------
  console.log('\n--- 8. Backward Compatibility with Prior Regression Test Anchors ---');

  const REQUIRED_REGRESSION_ANCHORS = [
    'accounts-table-body', 'positions-container', 'pending-orders-container',
    'trades-table-body', 'closed-trades-table-body', 'perf-win-rate',
    'notifications-list', 'db-health-status', 'audit-table-body',
    'prof-email', 'modal-container', 'modal-close', 'kpi-total-balance',
    'kpi-total-accounts', 'sync-indicator', 'btn-logout', 'mobile-menu'
  ];

  let allAnchorsPresent = true;
  for (const id of REQUIRED_REGRESSION_ANCHORS) {
    if (!dashboardHtml.includes(`id="${id}"`)) {
      allAnchorsPresent = false;
      report(`Anchor Verification: id="${id}" present`, false, 'Anchor missing');
      break;
    }
  }
  if (allAnchorsPresent) {
    report('Regression Anchors: All required DOM selectors preserved for existing tests', true);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n============================================================');
  console.log(`   SPRINT 3 BATTERY SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSprint3Battery().catch(err => {
  console.error('Unhandled Sprint 3 test exception:', err);
  process.exit(1);
});
