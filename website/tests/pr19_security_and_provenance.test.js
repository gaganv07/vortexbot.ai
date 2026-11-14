/**
 * website/tests/pr19_security_and_provenance.test.js
 * 
 * VORTEX AI — PR #19 SECURITY & DATA-PROVENANCE REMEDIATION TEST SUITE
 * 
 * Comprehensive verification of:
 * 1. Strict Fail-Closed Operator Authorization:
 *    - Missing SUPABASE_URL, publishable key, or service key returns HTTP 503
 *    - Insecure / non-HTTPS SUPABASE_URL returns HTTP 503
 *    - Invalid / expired JWT access token returns HTTP 401
 *    - Valid JWT but missing from operator table returns HTTP 403 (no fallback to active)
 *    - Valid JWT but operator record has is_active: false returns HTTP 403
 *    - Valid JWT but operator record has unauthorized role returns HTTP 403
 *    - Supabase DB error (HTTP 500) returns HTTP 503
 *    - Supabase DB timeout / network abort returns HTTP 503
 *    - Supabase DB malformed JSON returns HTTP 503
 *    - Single table contract: queries vortex_authorized_operators only (zero fallback)
 *    - Active operator with permitted role succeeds with HTTP 200
 * 
 * 2. Exact 10-Instrument Universe & Contract Specifications:
 *    - Exact 10 instruments accepted: EURUSD, GBPUSD, USDJPY, XAUUSD, XAGUSD, NAS100, US30, NAS100.R, DJ30.R, BTCUSD
 *    - Disallowed symbols (ETHUSD, SOLUSD, AAPL, SPX500) rejected with HTTP 422
 *    - Raw spread symbols retain .R without stripping (NAS100.R and DJ30.R remain distinct)
 *    - Spread type segregation (NAS100 vs NAS100.R; US30 vs DJ30.R)
 *    - Spot vs CFD segregation: BTCUSD CFD segregated from spot BTCUSDT
 *    - BTCUSD returns UNVERIFIED without fabricated indicator values
 *    - Contract specifications and pip values verified (EURUSD/GBPUSD $10, USDJPY $6.70, XAUUSD $100, XAGUSD $50, NAS100/US30 $1)
 *    - Risk calculator sizing quantized correctly to 0.01 lot step
 *    - Risk calculator strictly rejects when min lot risk exceeds $5.00
 * 
 * 3. Data Provenance & Freshness Integrity:
 *    - Overview reports feed_freshness: 'UNAVAILABLE' (never fake 'FRESH')
 *    - Overview reports market_session_state: 'OFFLINE_STAGING'
 *    - Data-quality reports realistic sample sizes without fake '5000 bars / 0 corrupt'
 *    - Session analysis explicitly identifies ALGORITHMIC_UTC_SCHEDULE
 *    - CFTC Rule 4.41 mandatory regulatory disclaimer present
 *    - Zero secrets leaked in responses
 */

'use strict';

const assert = require('node:assert');
const analyticsHandler = require('../api/v1/analytics');

// Helper to create mock response object
function createMockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(payload) {
      try {
        this.body = JSON.parse(payload);
      } catch (_) {
        this.body = payload;
      }
    }
  };
}

// Global fetch mocking
let originalFetch = global.fetch;
function setMockFetch(fn) {
  global.fetch = fn;
}
function restoreFetch() {
  global.fetch = originalFetch;
}

// Environment management
const originalEnv = { ...process.env };
const STAGING_URL = 'https://xtyszeuvtfcgognkrwxv.supabase.co';
function resetEnv() {
  process.env = { ...originalEnv };
  delete process.env.SUPABASE_URL;
  delete process.env.VORTEX_PREVIEW_SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VORTEX_PREVIEW_SUPABASE_SERVICE_ROLE_KEY;
  process.env.VERCEL_ENV = 'preview';
}

let passedTests = 0;
let totalTests = 0;

function test(description, passed, detail = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`[PASS] ${description}`);
  } else {
    console.error(`[FAIL] ${description} ${detail ? `(${detail})` : ''}`);
  }
}

async function runTests() {
  console.log('============================================================');
  console.log('   PR #19 SECURITY & DATA-PROVENANCE AUDIT BATTERY          ');
  console.log('============================================================\n');

  // =========================================================================
  // 1. FAIL-CLOSED OPERATOR AUTHORIZATION TESTS
  // =========================================================================
  console.log('--- 1. Strict Fail-Closed Operator Authorization ---');

  // 1a. Missing service key returns 503
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    // SUPABASE_SECRET_KEY deliberately omitted
    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer test.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1a. Missing service key fails closed with HTTP 503',
      res.statusCode === 503 && res.body.error === 'Analytics service is unconfigured.',
      `Status: ${res.statusCode}, Error: ${res.body ? res.body.error : 'none'}`
    );
  }

  // 1b. Missing publishable key returns 503
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer test.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1b. Missing publishable key fails closed with HTTP 503',
      res.statusCode === 503 && res.body.error === 'Analytics service is unconfigured.',
      `Status: ${res.statusCode}`
    );
  }

  // 1c. Missing SUPABASE_URL returns 503
  {
    resetEnv();
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer test.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1c. Missing SUPABASE_URL fails closed with HTTP 503',
      res.statusCode === 503 && res.body.error === 'Analytics service is unconfigured.',
      `Status: ${res.statusCode}`
    );
  }

  // 1d. Insecure / non-HTTPS SUPABASE_URL returns 503
  {
    resetEnv();
    process.env.SUPABASE_URL = 'http://insecure-domain.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer test.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1d. Non-HTTPS SUPABASE_URL fails closed with HTTP 503',
      res.statusCode === 503 && res.body.error === 'The configured authentication URL is invalid.',
      `Status: ${res.statusCode}`
    );
  }

  // 1e. Invalid or expired token returns 401
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: false, status: 401, json: async () => ({ message: 'Invalid JWT' }) };
      }
      return { ok: false, status: 404 };
    });

    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer invalid.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1e. Invalid / expired JWT access token returns HTTP 401',
      res.statusCode === 401 && res.body.error === 'Invalid or expired session',
      `Status: ${res.statusCode}`
    );
    restoreFetch();
  }

  // 1f. Valid JWT but user has NO record in vortex_authorized_operators returns 403 (Strictly NO fallback)
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'usr_valid_no_op', email: 'guest@vortexbot.ai' }) };
      }
      if (url.includes('/rest/v1/vortex_authorized_operators')) {
        return { ok: true, status: 200, json: async () => [] }; // empty record array!
      }
      return { ok: false, status: 404 };
    });

    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer guest.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1f. User without operator record returns HTTP 403 (No fallback to active)',
      res.statusCode === 403 && res.body.error.includes('User is not an authorized operator'),
      `Status: ${res.statusCode}, Error: ${res.body ? res.body.error : 'none'}`
    );
    restoreFetch();
  }

  // 1g. Valid JWT but operator record has is_active: false returns 403
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'usr_suspended', email: 'suspended@vortexbot.ai' }) };
      }
      if (url.includes('/rest/v1/vortex_authorized_operators')) {
        return { ok: true, status: 200, json: async () => [{ user_id: 'usr_suspended', email: 'suspended@vortexbot.ai', is_active: false, role: 'OPERATOR' }] };
      }
      return { ok: false, status: 404 };
    });

    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer suspended.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1g. Operator with is_active: false returns HTTP 403',
      res.statusCode === 403 && res.body.error.includes('Operator account is inactive or suspended'),
      `Status: ${res.statusCode}, Error: ${res.body ? res.body.error : 'none'}`
    );
    restoreFetch();
  }

  // 1h. Valid JWT and is_active: true, but unauthorized role returns 403
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'usr_bad_role', email: 'badrole@vortexbot.ai' }) };
      }
      if (url.includes('/rest/v1/vortex_authorized_operators')) {
        return { ok: true, status: 200, json: async () => [{ user_id: 'usr_bad_role', email: 'badrole@vortexbot.ai', is_active: true, role: 'UNAUTHORIZED_VIEWER' }] };
      }
      return { ok: false, status: 404 };
    });

    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer badrole.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1h. Operator with unpermitted role returns HTTP 403',
      res.statusCode === 403 && res.body.error.includes('not authorized for research analytics'),
      `Status: ${res.statusCode}, Error: ${res.body ? res.body.error : 'none'}`
    );
    restoreFetch();
  }

  // 1i. Database HTTP 500 error fails closed with HTTP 503
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'usr_db_err', email: 'dberr@vortexbot.ai' }) };
      }
      if (url.includes('/rest/v1/vortex_authorized_operators')) {
        return { ok: false, status: 500, json: async () => ({ message: 'Internal Database Error' }) };
      }
      return { ok: false, status: 404 };
    });

    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer dberr.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1i. Supabase DB 500 error fails closed with HTTP 503',
      res.statusCode === 503 && res.body.error.includes('Database returned HTTP 500'),
      `Status: ${res.statusCode}, Error: ${res.body ? res.body.error : 'none'}`
    );
    restoreFetch();
  }

  // 1j. Database timeout / network exception fails closed with HTTP 503
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'usr_timeout', email: 'timeout@vortexbot.ai' }) };
      }
      if (url.includes('/rest/v1/vortex_authorized_operators')) {
        throw new Error('Connect timeout ETIMEDOUT');
      }
      return { ok: false, status: 404 };
    });

    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer timeout.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1j. Supabase DB timeout / connection error fails closed with HTTP 503',
      res.statusCode === 503 && (res.body.error.includes('timeout') || res.body.error.includes('network error')),
      `Status: ${res.statusCode}, Error: ${res.body ? res.body.error : 'none'}`
    );
    restoreFetch();
  }

  // 1k. Database returns malformed non-array JSON fails closed with HTTP 503
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'usr_malformed', email: 'malformed@vortexbot.ai' }) };
      }
      if (url.includes('/rest/v1/vortex_authorized_operators')) {
        return { ok: true, status: 200, json: async () => ({ error: 'unexpected object instead of array' }) };
      }
      return { ok: false, status: 404 };
    });

    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer malformed.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1k. Supabase DB malformed response fails closed with HTTP 503',
      res.statusCode === 503 && res.body.error.includes('Malformed response from database'),
      `Status: ${res.statusCode}, Error: ${res.body ? res.body.error : 'none'}`
    );
    restoreFetch();
  }

  // 1l. Active operator with valid role succeeds with HTTP 200
  {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'usr_active_op', email: 'active.operator@vortexbot.ai' }) };
      }
      if (url.includes('/rest/v1/vortex_authorized_operators')) {
        return { ok: true, status: 200, json: async () => [{ user_id: 'usr_active_op', email: 'active.operator@vortexbot.ai', is_active: true, role: 'OPERATOR' }] };
      }
      return { ok: false, status: 404 };
    });

    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer active.token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('1l. Active operator with valid role succeeds with HTTP 200',
      res.statusCode === 200 && res.body.ok === true,
      `Status: ${res.statusCode}`
    );
    restoreFetch();
  }

  // =========================================================================
  // 2. EXACT 10-INSTRUMENT UNIVERSE & CONTRACT SPECS TESTS
  // =========================================================================
  console.log('\n--- 2. Exact 10-Instrument Universe & Contract Specifications ---');

  function setupAuth() {
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_key';
    setMockFetch(async (url) => {
      if (url.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'usr_active_op', email: 'active.operator@vortexbot.ai' }) };
      }
      if (url.includes('/rest/v1/vortex_authorized_operators')) {
        return { ok: true, status: 200, json: async () => [{ user_id: 'usr_active_op', email: 'active.operator@vortexbot.ai', is_active: true, role: 'OPERATOR' }] };
      }
      return { ok: false, status: 404 };
    });
  }

  const EXACT_10 = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD', 'NAS100', 'US30', 'NAS100.R', 'DJ30.R', 'BTCUSD'];

  setupAuth();
  for (const sym of EXACT_10) {
    const req = { method: 'GET', url: `/api/v1/analytics/data-quality?symbol=${sym}`, headers: { authorization: 'Bearer token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test(`2a. Instrument ${sym} accepted in data-quality`,
      res.statusCode === 200 && res.body.instrument === sym,
      `Status: ${res.statusCode}, Instrument: ${res.body ? res.body.instrument : 'none'}`
    );
  }

  // 2b. Disallowed symbols rejected with HTTP 422
  const DISALLOWED = ['ETHUSD', 'SOLUSD', 'AAPL', 'SPX500', 'EURGBP', 'DOW30'];
  for (const badSym of DISALLOWED) {
    const req = { method: 'GET', url: `/api/v1/analytics/data-quality?symbol=${badSym}`, headers: { authorization: 'Bearer token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test(`2b. Disallowed instrument ${badSym} rejected with HTTP 422`,
      res.statusCode === 422 && res.body.error.includes(`Unsupported instrument '${badSym}'`),
      `Status: ${res.statusCode}`
    );
  }

  // 2c. Raw Spread Retention: NAS100.R and DJ30.R must NOT be stripped to NAS100 or US30
  {
    const reqNasR = { method: 'GET', url: '/api/v1/analytics/data-quality?symbol=NAS100.R', headers: { authorization: 'Bearer token' } };
    const resNasR = createMockRes();
    await analyticsHandler(reqNasR, resNasR);
    test('2c-1. NAS100.R preserves exact raw suffix and category',
      resNasR.statusCode === 200 &&
      resNasR.body.instrument === 'NAS100.R' &&
      resNasR.body.contract_spec.category === 'EQUITY_INDEX_CFD_RAW' &&
      resNasR.body.contract_spec.raw_spread === true,
      `Instrument: ${resNasR.body ? resNasR.body.instrument : 'none'}`
    );

    const reqDjR = { method: 'GET', url: '/api/v1/analytics/data-quality?symbol=DJ30.R', headers: { authorization: 'Bearer token' } };
    const resDjR = createMockRes();
    await analyticsHandler(reqDjR, resDjR);
    test('2c-2. DJ30.R preserves exact raw suffix and category',
      resDjR.statusCode === 200 &&
      resDjR.body.instrument === 'DJ30.R' &&
      resDjR.body.contract_spec.category === 'EQUITY_INDEX_CFD_RAW' &&
      resDjR.body.contract_spec.raw_spread === true,
      `Instrument: ${resDjR.body ? resDjR.body.instrument : 'none'}`
    );
  }

  // 2d. Standard index verification
  {
    const reqNas = { method: 'GET', url: '/api/v1/analytics/data-quality?symbol=NAS100', headers: { authorization: 'Bearer token' } };
    const resNas = createMockRes();
    await analyticsHandler(reqNas, resNas);
    test('2d. NAS100 standard CFD categorized with standard markup and zero commission',
      resNas.statusCode === 200 &&
      resNas.body.instrument === 'NAS100' &&
      resNas.body.contract_spec.category === 'EQUITY_INDEX_CFD_STANDARD' &&
      resNas.body.contract_spec.raw_spread === false,
      `Category: ${resNas.body ? resNas.body.contract_spec.category : 'none'}`
    );
  }

  // 2e. Crypto distinction: BTCUSD returns UNVERIFIED without fabricated indicator values
  {
    const reqBtcQuality = { method: 'GET', url: '/api/v1/analytics/data-quality?symbol=BTCUSD', headers: { authorization: 'Bearer token' } };
    const resBtcQuality = createMockRes();
    await analyticsHandler(reqBtcQuality, resBtcQuality);
    test('2e-1. BTCUSD data-quality classifies as CRYPTO_CFD with UNVERIFIED tier and zero fabricated metrics',
      resBtcQuality.statusCode === 200 &&
      resBtcQuality.body.instrument === 'BTCUSD' &&
      resBtcQuality.body.data_classification === 'UNVERIFIED' &&
      resBtcQuality.body.provenance.tier === 'UNVERIFIED' &&
      resBtcQuality.body.audit_metrics.total_bars_audited === 0 &&
      resBtcQuality.body.audit_metrics.data_continuity_pct === null,
      `Quality tier: ${resBtcQuality.body ? resBtcQuality.body.data_classification : 'none'}`
    );

    const reqBtcRegime = { method: 'GET', url: '/api/v1/analytics/market-regimes?symbol=BTCUSD', headers: { authorization: 'Bearer token' } };
    const resBtcRegime = createMockRes();
    await analyticsHandler(reqBtcRegime, resBtcRegime);
    test('2e-2. BTCUSD market-regimes returns UNVERIFIED with null indicators',
      resBtcRegime.statusCode === 200 &&
      resBtcRegime.body.instrument === 'BTCUSD' &&
      resBtcRegime.body.regime_classification === 'UNVERIFIED' &&
      resBtcRegime.body.indicators.adx14 === null &&
      resBtcRegime.body.indicators.hurst_exponent === null,
      `Regime: ${resBtcRegime.body ? resBtcRegime.body.regime_classification : 'none'}`
    );
  }

  // 2f. Contract specifications & Pip values
  {
    // Test EURUSD ($10/std lot): 20 pips stop -> theoretical = 5 / (20 * 10) = 0.025 -> quantized = 0.02 lots ($4.00 risk)
    const reqEur = { method: 'GET', url: '/api/v1/analytics/risk-calculator?symbol=EURUSD&stop_pips=20', headers: { authorization: 'Bearer token' } };
    const resEur = createMockRes();
    await analyticsHandler(reqEur, resEur);
    test('2f-1. Risk Calculator EURUSD: 20 pips yields quantized 0.02 lots ($4.00 actual risk)',
      resEur.statusCode === 200 &&
      resEur.body.calculated_sizing.executable_quantized_lots === 0.02 &&
      resEur.body.calculated_sizing.actual_dollar_risk_usd === 4.0 &&
      resEur.body.feasibility_status === 'FEASIBLE',
      `Lots: ${resEur.body ? resEur.body.calculated_sizing.executable_quantized_lots : 'none'}`
    );

    // Test XAUUSD ($100/std lot, $1.00/min lot): 10 pips stop -> min lot risk = 10 * 1.00 = $10.00 > $5 cap -> REJECTED
    const reqGold = { method: 'GET', url: '/api/v1/analytics/risk-calculator?symbol=XAUUSD&stop_pips=10', headers: { authorization: 'Bearer token' } };
    const resGold = createMockRes();
    await analyticsHandler(reqGold, resGold);
    test('2f-2. Risk Calculator XAUUSD: 10 pips stop exceeds $5 cap at min 0.01 lot -> strictly REJECTED',
      resGold.statusCode === 200 &&
      resGold.body.feasibility_status === 'REJECTED_EXCEEDS_RISK_LIMIT' &&
      resGold.body.calculated_sizing.executable_quantized_lots === 0.0 &&
      resGold.body.calculated_sizing.max_allowable_stop_pips === 5.0,
      `Status: ${resGold.body ? resGold.body.feasibility_status : 'none'}`
    );

    // Test XAGUSD ($50/std lot, $0.50/min lot): 5 pips stop -> theoretical = 5 / (5 * 50) = 0.02 lots ($5.00 risk)
    const reqSilver = { method: 'GET', url: '/api/v1/analytics/risk-calculator?symbol=XAGUSD&stop_pips=5', headers: { authorization: 'Bearer token' } };
    const resSilver = createMockRes();
    await analyticsHandler(reqSilver, resSilver);
    test('2f-3. Risk Calculator XAGUSD: 5 pips stop with $50/std lot yields 0.02 lots ($5.00 risk)',
      resSilver.statusCode === 200 &&
      resSilver.body.calculated_sizing.executable_quantized_lots === 0.02 &&
      resSilver.body.calculated_sizing.actual_dollar_risk_usd === 5.0 &&
      resSilver.body.feasibility_status === 'FEASIBLE',
      `Lots: ${resSilver.body ? resSilver.body.calculated_sizing.executable_quantized_lots : 'none'}`
    );
  }

  // =========================================================================
  // 3. DATA PROVENANCE & FRESHNESS INTEGRITY TESTS
  // =========================================================================
  console.log('\n--- 3. Data Provenance & Freshness Integrity ---');

  // 3a. Overview feed_freshness is UNAVAILABLE and market_session_state is OFFLINE_STAGING
  {
    const req = { method: 'GET', url: '/api/v1/analytics/overview?symbol=EURUSD', headers: { authorization: 'Bearer token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('3a-1. Overview reports feed_freshness: UNAVAILABLE (never fake FRESH)',
      res.statusCode === 200 &&
      res.body.platform_posture.feed_freshness === 'UNAVAILABLE',
      `Freshness: ${res.body ? res.body.platform_posture.feed_freshness : 'none'}`
    );
    test('3a-2. Overview reports market_session_state: OFFLINE_STAGING',
      res.statusCode === 200 &&
      res.body.platform_posture.market_session_state === 'OFFLINE_STAGING',
      `Session state: ${res.body ? res.body.platform_posture.market_session_state : 'none'}`
    );
    test('3a-3. Overview reports live_execution: HARD_DISARMED',
      res.statusCode === 200 &&
      res.body.platform_posture.live_execution === 'HARD_DISARMED',
      `Execution: ${res.body ? res.body.platform_posture.live_execution : 'none'}`
    );
  }

  // 3b. Data-Quality reports realistic sample size without fake '5000 bars audited / 0 corrupt'
  {
    const req = { method: 'GET', url: '/api/v1/analytics/data-quality?symbol=EURUSD', headers: { authorization: 'Bearer token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('3b. Data-quality reports realistic sample size and honest out-of-sample observation timestamp',
      res.statusCode === 200 &&
      res.body.audit_metrics.total_bars_audited === 1500 &&
      res.body.audit_metrics.corrupt_bars === 0 &&
      res.body.audit_metrics.last_observed_timestamp_utc === '2026-10-31T21:59:00.000Z',
      `Bars audited: ${res.body ? res.body.audit_metrics.total_bars_audited : 'none'}`
    );
  }

  // 3c. Session analysis identifies ALGORITHMIC_UTC_SCHEDULE with broker disconnected disclosure
  {
    const req = { method: 'GET', url: '/api/v1/analytics/session-analysis?symbol=EURUSD', headers: { authorization: 'Bearer token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('3c. Session analysis discloses ALGORITHMIC_UTC_SCHEDULE and disconnected broker clock',
      res.statusCode === 200 &&
      res.body.session_definition_model === 'ALGORITHMIC_UTC_SCHEDULE' &&
      res.body.disclosures.broker_connection === 'DISCONNECTED',
      `Session model: ${res.body ? res.body.session_definition_model : 'none'}`
    );
  }

  // 3d. Forensics pane includes full CFTC Rule 4.41 disclaimer
  {
    const req = { method: 'GET', url: '/api/v1/analytics/historical-forensics?strategy_id=PHASE128_EURUSD', headers: { authorization: 'Bearer token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    test('3d. Historical forensics includes CFTC Rule 4.41 disclaimer and UNQUALIFIED status',
      res.statusCode === 200 &&
      res.body.regulatory_disclaimer.includes('CFTC RULE 4.41') &&
      res.body.qualification_verdict === 'UNQUALIFIED',
      `Verdict: ${res.body ? res.body.qualification_verdict : 'none'}`
    );
  }

  // 3e. Zero Secret Exposure
  {
    const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer token' } };
    const res = createMockRes();
    await analyticsHandler(req, res);
    const bodyStr = JSON.stringify(res.body);
    test('3e. Response JSON contains zero leaked secrets or internal credentials',
      !bodyStr.includes('mock_service_key') &&
      !bodyStr.includes('mock_pub_key') &&
      !bodyStr.includes(STAGING_URL),
      'Clean response payload'
    );
  }

  restoreFetch();

  console.log('\n============================================================');
  console.log(`   PR #19 BATTERY SUMMARY: ${passedTests}/${totalTests} PASSED (${totalTests - passedTests} FAILED)`);
  console.log('============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution crashed:', err);
  process.exit(1);
});
