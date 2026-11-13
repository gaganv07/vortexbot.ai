/**
 * website/tests/sprint2_analytics_gateway.test.js
 * VORTEX AI — Sprint 2 Analytics REST Gateway Verification Battery
 * Deterministic test suite verifying endpoint contracts, authentication guards,
 * parameter validation, data provenance, minimum-lot rejection, and zero secret leakage.
 */

'use strict';

const assert = require('assert');
const analyticsHandler = require('../api/v1/analytics.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(testName, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName}: ${details}`);
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, val) { this.headers[key.toLowerCase()] = val; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    end(data) {
      if (data) {
        try { this.body = JSON.parse(data); } catch (_) { this.body = data; }
      }
      return this;
    }
  };
}

const origEnv = Object.assign({}, process.env);
const STAGING_URL = 'https://xtyszeuvtfcgognkrwxv.supabase.co';

function resetEnv() {
  process.env = Object.assign({}, origEnv);
  process.env.VERCEL_ENV = 'preview';
}

let mockFetchHandler = null;
const originalFetch = global.fetch;

function setMockFetch(fn) {
  mockFetchHandler = fn;
  global.fetch = async function(url, options) {
    if (mockFetchHandler) {
      return await mockFetchHandler(url, options);
    }
    return originalFetch(url, options);
  };
}

function restoreFetch() {
  mockFetchHandler = null;
  global.fetch = originalFetch;
}

const ALL_ENDPOINTS = [
  'overview',
  'data-quality',
  'market-regimes',
  'volatility',
  'session-analysis',
  'multi-timeframe',
  'transaction-costs',
  'risk-calculator',
  'historical-forensics'
];

async function runBattery() {
  console.log('============================================================');
  console.log('   VORTEX AI — SPRINT 2 ANALYTICS REST GATEWAY BATTERY      ');
  console.log('============================================================\n');

  // -----------------------------------------------------------------------
  // TEST GROUP 1: Configuration Enforcement & Fail-Closed Behavior
  // -----------------------------------------------------------------------
  console.log('--- 1. Configuration Enforcement (Fail-Closed) ---');
  {
    resetEnv();
    delete process.env.SUPABASE_URL;
    delete process.env.VORTEX_PREVIEW_SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;

    const req = { method: 'GET', headers: { authorization: 'Bearer test' }, url: '/api/v1/analytics/overview' };
    const res = createMockRes();
    await analyticsHandler(req, res);
    report('analytics.js: Missing configuration returns HTTP 503',
      res.statusCode === 503 && res.body.ok === false && res.body.error === 'Analytics service is unconfigured.',
      `Got status ${res.statusCode}, body: ${JSON.stringify(res.body)}`
    );

    // Non-HTTPS URL
    process.env.SUPABASE_URL = 'http://insecure.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'test_secret_key';
    const req2 = { method: 'GET', headers: { authorization: 'Bearer test' }, url: '/api/v1/analytics/overview' };
    const res2 = createMockRes();
    await analyticsHandler(req2, res2);
    report('analytics.js: Non-HTTPS SUPABASE_URL rejected with HTTP 503',
      res2.statusCode === 503 && res2.body.error === 'The configured authentication URL is invalid.',
      `Got status ${res2.statusCode}`
    );
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 2: Authentication Enforcement Across All 9 Endpoints
  // -----------------------------------------------------------------------
  console.log('\n--- 2. Authentication Enforcement on Every Endpoint ---');
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'valid_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'valid_secret_key';

    for (const ep of ALL_ENDPOINTS) {
      // 2a. Missing authorization header
      const req = { method: 'GET', headers: {}, url: `/api/v1/analytics/${ep}` };
      const res = createMockRes();
      await analyticsHandler(req, res);
      report(`Authentication: /api/v1/analytics/${ep} rejects unauthenticated request with 401`,
        res.statusCode === 401 && res.body.error === 'Authentication required',
        `Got status ${res.statusCode}`
      );
    }

    // 2b. Invalid token rejected
    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: false, status: 401, json: async () => ({ message: 'Token invalid' }) };
      }
      return { ok: false, status: 404 };
    });
    const reqInvalid = { method: 'GET', headers: { authorization: 'Bearer bad.token' }, url: '/api/v1/analytics/overview' };
    const resInvalid = createMockRes();
    await analyticsHandler(reqInvalid, resInvalid);
    report('Authentication: Invalid JWT rejected with HTTP 401',
      resInvalid.statusCode === 401 && resInvalid.body.error === 'Invalid or expired session',
      `Got status ${resInvalid.statusCode}`
    );
    restoreFetch();
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 3: HTTP Method Enforcement & Routing
  // -----------------------------------------------------------------------
  console.log('\n--- 3. HTTP Method Enforcement & Unknown Routes ---');
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'valid_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'valid_secret_key';

    // POST to GET-only route
    const reqPost = { method: 'POST', headers: {}, url: '/api/v1/analytics/overview' };
    const resPost = createMockRes();
    await analyticsHandler(reqPost, resPost);
    report('Method Enforcement: POST rejected with HTTP 405 (Allow: GET)',
      resPost.statusCode === 405 && resPost.headers['allow'] === 'GET',
      `Got status ${resPost.statusCode}`
    );

    // DELETE to GET-only route
    const reqDel = { method: 'DELETE', headers: {}, url: '/api/v1/analytics/risk-calculator' };
    const resDel = createMockRes();
    await analyticsHandler(reqDel, resDel);
    report('Method Enforcement: DELETE rejected with HTTP 405',
      resDel.statusCode === 405,
      `Got status ${resDel.statusCode}`
    );

    // Mock authenticated user for routing check
    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: 'usr_1', email: 'test@vortexbot.ai' }) };
      if (url.includes('/rest/v1/vortex_authorized_operators')) return { ok: true, status: 200, json: async () => ([{ user_id: 'usr_1', email: 'test@vortexbot.ai', role: 'AUTHENTICATED_USER', is_active: true }]) };
      return { ok: true, status: 200, json: async () => ([]) };
    });

    // Unknown endpoint
    const reqUnknown = { method: 'GET', headers: { authorization: 'Bearer valid.jwt' }, url: '/api/v1/analytics/unsupported-endpoint' };
    const resUnknown = createMockRes();
    await analyticsHandler(reqUnknown, resUnknown);
    report('Routing: Unknown analytics endpoint returns HTTP 404',
      resUnknown.statusCode === 404 && resUnknown.body.error.includes('Unsupported analytics endpoint'),
      `Got status ${resUnknown.statusCode}`
    );

    restoreFetch();
  }

  // Setup valid mock auth environment for endpoint verification
  function setupValidAuth() {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'valid_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'valid_secret_key';

    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'usr_verified_77', email: 'analyst@vortexbot.ai' }) };
      }
      if (url.includes('/rest/v1/vortex_authorized_operators')) {
        return { ok: true, status: 200, json: async () => ([{ user_id: 'usr_verified_77', email: 'analyst@vortexbot.ai', role: 'AUTHENTICATED_USER', is_active: true }]) };
      }
      return { ok: false, status: 404 };
    });
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 4: Endpoint 1 — GET /api/v1/analytics/overview
  // -----------------------------------------------------------------------
  console.log('\n--- 4. Endpoint 1: Overview ---');
  {
    setupValidAuth();
    const req = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/overview?symbol=EURUSD' };
    const res = createMockRes();
    await analyticsHandler(req, res);
    report('Overview: Returns HTTP 200 with platform posture, risk policy, and summaries',
      res.statusCode === 200 && res.body.ok === true &&
      res.body.platform_posture.live_execution === 'HARD_DISARMED' &&
      res.body.fixed_risk_policy.per_trade_risk_usd === 5.0 &&
      res.body.regime_summary.status === 'VERIFIED',
      `Got status ${res.statusCode}, body: ${JSON.stringify(res.body)}`
    );
    restoreFetch();
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 5: Endpoint 2 — GET /api/v1/analytics/data-quality
  // -----------------------------------------------------------------------
  console.log('\n--- 5. Endpoint 2: Data Quality & Provenance ---');
  {
    setupValidAuth();
    // 5a. Verified FX Feed
    const reqFx = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/data-quality?symbol=EURUSD' };
    const resFx = createMockRes();
    await analyticsHandler(reqFx, resFx);
    report('Data Quality: Major FX (EURUSD) classified as VERIFIED',
      resFx.statusCode === 200 && resFx.body.data_classification === 'VERIFIED' && resFx.body.anomaly_flags.gap_detected === false,
      `Got status ${resFx.statusCode}, classification: ${resFx.body.data_classification}`
    );

    // 5b. Proxy Feed
    const reqProxy = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/data-quality?symbol=NAS100' };
    const resProxy = createMockRes();
    await analyticsHandler(reqProxy, resProxy);
    report('Data Quality: Index (NAS100) accurately classified as PROXY_ONLY',
      resProxy.statusCode === 200 && resProxy.body.data_classification === 'PROXY_ONLY',
      `Got status ${resProxy.statusCode}, classification: ${resProxy.body.data_classification}`
    );

    // 5c. Unsupported instrument
    const reqBad = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/data-quality?symbol=UNSUPPORTED_COIN' };
    const resBad = createMockRes();
    await analyticsHandler(reqBad, resBad);
    report('Data Quality: Unsupported instrument rejected with HTTP 422',
      resBad.statusCode === 422 && resBad.body.ok === false,
      `Got status ${resBad.statusCode}`
    );
    restoreFetch();
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 6: Endpoint 3 — GET /api/v1/analytics/market-regimes
  // -----------------------------------------------------------------------
  console.log('\n--- 6. Endpoint 3: Market Regime Detection ---');
  {
    setupValidAuth();
    const req = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/market-regimes?symbol=EURUSD&timeframe=H1' };
    const res = createMockRes();
    await analyticsHandler(req, res);
    report('Market Regimes: Returns ADX, Choppiness, Hurst, and classification',
      res.statusCode === 200 &&
      res.body.indicators.adx14 === 28.4 &&
      res.body.indicators.hurst_exponent === 0.62 &&
      res.body.regime_classification === 'TRENDING_BEARISH' &&
      res.body.status === 'VERIFIED',
      `Got status ${res.statusCode}`
    );

    // Unsupported timeframe
    const reqTf = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/market-regimes?symbol=EURUSD&timeframe=M1' };
    const resTf = createMockRes();
    await analyticsHandler(reqTf, resTf);
    report('Market Regimes: Unsupported timeframe rejected with HTTP 422',
      resTf.statusCode === 422,
      `Got status ${resTf.statusCode}`
    );
    restoreFetch();
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 7: Endpoint 4 — GET /api/v1/analytics/volatility
  // -----------------------------------------------------------------------
  console.log('\n--- 7. Endpoint 4: Volatility Structure ---');
  {
    setupValidAuth();
    const req = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/volatility?symbol=EURUSD&timeframe=H1' };
    const res = createMockRes();
    await analyticsHandler(req, res);
    report('Volatility: Returns ATR, Realized Volatility %, and Percentile',
      res.statusCode === 200 &&
      res.body.atr14_pips === 14.2 &&
      res.body.volatility_state === 'NORMAL' &&
      res.body.slope_interpretation === 'EXPANSION',
      `Got status ${res.statusCode}`
    );
    restoreFetch();
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 8: Endpoint 5 — GET /api/v1/analytics/session-analysis
  // -----------------------------------------------------------------------
  console.log('\n--- 8. Endpoint 5: Session Analysis & False Breakouts ---');
  {
    setupValidAuth();
    const req = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/session-analysis?symbol=EURUSD' };
    const res = createMockRes();
    await analyticsHandler(req, res);
    report('Session Analysis: Returns Asian/London/NY ranges and 71.4% false breakout disclosure',
      res.statusCode === 200 &&
      res.body.sessions.LONDON.median_range_pips === 48.0 &&
      res.body.opening_range_breakout_metrics.false_breakout_rate_pct === 71.4 &&
      res.body.research_disclosure.includes('Phase 123 finding'),
      `Got status ${res.statusCode}`
    );
    restoreFetch();
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 9: Endpoint 6 — GET /api/v1/analytics/multi-timeframe
  // -----------------------------------------------------------------------
  console.log('\n--- 9. Endpoint 6: Multi-Timeframe Alignment ---');
  {
    setupValidAuth();
    const req = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/multi-timeframe?symbol=EURUSD' };
    const res = createMockRes();
    await analyticsHandler(req, res);
    report('Multi-Timeframe: Returns D1/H4/M15 consensus score and quantization disclosure',
      res.statusCode === 200 &&
      res.body.timeframe_signals.D1_macro.bias === 'BEARISH' &&
      res.body.alignment_score === -60.0 &&
      res.body.research_disclosure.includes('Phase 122 finding'),
      `Got status ${res.statusCode}`
    );
    restoreFetch();
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 10: Endpoint 7 — GET /api/v1/analytics/transaction-costs
  // -----------------------------------------------------------------------
  console.log('\n--- 10. Endpoint 7: Transaction-Cost Analysis (TCA) ---');
  {
    setupValidAuth();
    // Valid TCA
    const req = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/transaction-costs?symbol=EURUSD&spread_pips=1.2&commission_per_lot=7.0&stop_pips=15.0' };
    const res = createMockRes();
    await analyticsHandler(req, res);
    report('TCA: Calculates exact round-trip friction, cost-to-risk ratio, and breakeven R-multiple',
      res.statusCode === 200 &&
      res.body.cost_breakdown_min_lot.total_round_trip_friction_usd === 0.22 &&
      res.body.impact_metrics.cost_to_fixed_risk_budget_pct === 4.4 &&
      res.body.impact_metrics.friction_drag_assessment === 'ACCEPTABLE',
      `Got status ${res.statusCode}, body: ${JSON.stringify(res.body)}`
    );

    // Invalid TCA parameter (negative spread)
    const reqNeg = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/transaction-costs?symbol=EURUSD&spread_pips=-1.0' };
    const resNeg = createMockRes();
    await analyticsHandler(reqNeg, resNeg);
    report('TCA: Negative spread rejected with HTTP 400',
      resNeg.statusCode === 400 && resNeg.body.ok === false,
      `Got status ${resNeg.statusCode}`
    );
    restoreFetch();
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 11: Endpoint 8 — GET /api/v1/analytics/risk-calculator
  // -----------------------------------------------------------------------
  console.log('\n--- 11. Endpoint 8: Risk Calculator & Minimum-Lot Rejection ---');
  {
    setupValidAuth();
    // 11a. Feasible sizing (20 pips on EURUSD at $5 risk -> 0.02 lots, actual risk $4.00)
    const reqOk = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/risk-calculator?symbol=EURUSD&stop_pips=20.0' };
    const resOk = createMockRes();
    await analyticsHandler(reqOk, resOk);
    report('Risk Calculator: Feasible sizing quantized to 0.02 lots ($4.00 risk, <= $5.00 limit)',
      resOk.statusCode === 200 &&
      resOk.body.feasibility_status === 'FEASIBLE' &&
      resOk.body.calculated_sizing.executable_quantized_lots === 0.02 &&
      resOk.body.calculated_sizing.actual_dollar_risk_usd === 4.00,
      `Got status ${resOk.statusCode}, sizing: ${JSON.stringify(resOk.body.calculated_sizing)}`
    );

    // 11b. CRITICAL: Minimum-lot rejection when stop exceeds $5 risk budget (60 pips on EURUSD -> 0.01 lot = $6.00 > $5.00)
    const reqReject = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/risk-calculator?symbol=EURUSD&stop_pips=60.0' };
    const resReject = createMockRes();
    await analyticsHandler(reqReject, resReject);
    report('Risk Calculator: Strictly REJECTS when minimum lot risk ($6.00) exceeds $5.00 risk limit',
      resReject.statusCode === 200 &&
      resReject.body.feasibility_status === 'REJECTED_EXCEEDS_RISK_LIMIT' &&
      resReject.body.calculated_sizing.executable_quantized_lots === 0.00 &&
      resReject.body.calculated_sizing.monetary_risk_at_min_lot_usd === 6.00 &&
      resReject.body.rejection_reason.includes('strictly violates the fixed $5.00 per-trade risk cap'),
      `Got status ${resReject.statusCode}, body: ${JSON.stringify(resReject.body)}`
    );

    // 11c. Invalid stop parameter (0 pips)
    const reqZero = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/risk-calculator?symbol=EURUSD&stop_pips=0' };
    const resZero = createMockRes();
    await analyticsHandler(reqZero, resZero);
    report('Risk Calculator: Zero/negative stop rejected with HTTP 400',
      resZero.statusCode === 400 && resZero.body.ok === false,
      `Got status ${resZero.statusCode}`
    );
    restoreFetch();
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 12: Endpoint 9 — GET /api/v1/analytics/historical-forensics
  // -----------------------------------------------------------------------
  console.log('\n--- 12. Endpoint 9: Historical Forensics & CFTC Disclaimers ---');
  {
    setupValidAuth();
    const req = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/historical-forensics?strategy_id=PHASE128_EURUSD' };
    const res = createMockRes();
    await analyticsHandler(req, res);
    report('Historical Forensics: Returns UNQUALIFIED verdict and mandatory CFTC Rule 4.41 disclaimer',
      res.statusCode === 200 &&
      res.body.qualification_verdict === 'UNQUALIFIED' &&
      res.body.regulatory_disclaimer.includes('CFTC RULE 4.41') &&
      res.body.metrics.profit_factor === 0.88,
      `Got status ${res.statusCode}`
    );

    // Unsupported strategy ID
    const reqBad = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/historical-forensics?strategy_id=FAKE_STRATEGY' };
    const resBad = createMockRes();
    await analyticsHandler(reqBad, resBad);
    report('Historical Forensics: Unsupported strategy ID rejected with HTTP 422',
      resBad.statusCode === 422,
      `Got status ${resBad.statusCode}`
    );
    restoreFetch();
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 13: Correlation ID & Secret Exposure Protection
  // -----------------------------------------------------------------------
  console.log('\n--- 13. Correlation ID & Secret Exposure Protection ---');
  {
    setupValidAuth();
    const req = { method: 'GET', headers: { authorization: 'Bearer token' }, url: '/api/v1/analytics/overview' };
    const res = createMockRes();
    await analyticsHandler(req, res);
    const bodyStr = JSON.stringify(res.body);

    report('Operational: X-Correlation-ID header present and returned in JSON payload',
      Boolean(res.headers['x-correlation-id']) && res.headers['x-correlation-id'] === res.body.correlation_id,
      `Header: ${res.headers['x-correlation-id']}, body: ${res.body.correlation_id}`
    );

    report('Security: Response never leaks service keys, anon keys, or database URLs',
      !bodyStr.includes('valid_secret_key') && !bodyStr.includes('valid_pub_key') && !bodyStr.includes(STAGING_URL),
      `Secret leak detected in: ${bodyStr}`
    );
    restoreFetch();
  }

  // -----------------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------------
  console.log('\n============================================================');
  console.log(`   SPRINT 2 GATEWAY BATTERY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('============================================================\n');

  resetEnv();
  if (failedTests > 0) {
    process.exit(1);
  }
}

runBattery().catch(err => {
  console.error('Fatal test runner exception:', err);
  process.exit(1);
});

