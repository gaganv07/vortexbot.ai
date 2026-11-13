/**
 * website/tests/cross_route_project_isolation.test.js
 *
 * VORTEX AI — PR #19 STAGE 2C: CROSS-ROUTE SUPABASE PROJECT ISOLATION TEST BATTERY
 *
 * Comprehensive cross-route test suite proving that EVERY server-side API using
 * Supabase service credentials enforces deployment-specific project binding:
 * - website/api/v1/analytics.js
 * - website/api/trades.js
 *
 * Test Scenarios:
 * 1. Shared Security Implementation Invariance
 * 2. Preview Environment Isolation (xtyszeuvtfcgognkrwxv ONLY)
 * 3. Production Environment Isolation (bucziqekzyrttgcoxtas ONLY)
 * 4. Local Development Scoping (explicit matching ref required)
 * 5. Unknown Environments & Strict Inference Guards
 * 6. Malformed & Insecure URLs (HTTP, credentials, ports, paths, query, fragments)
 * 7. Missing Secrets (fail-closed behavior)
 * 8. Zero Outbound Network Requests on Invalid Configurations (fetch spy)
 * 9. Existing Authentication, Authorization, HMAC & Secret Non-Leakage
 */

'use strict';

const assert = require('node:assert');
const { Readable } = require('node:stream');

const analyticsHandler = require('../api/v1/analytics');
const tradesHandler = require('../api/trades');
const sharedBinding = require('../api/_lib/project_binding');

const STAGING_REF = sharedBinding.STAGING_PROJECT_REF;
const PROD_REF = sharedBinding.PRODUCTION_PROJECT_REF;
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PROD_URL = `https://${PROD_REF}.supabase.co`;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(name, passed, detail = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`[PASS] ${name}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${name} ${detail ? `(${detail})` : ''}`);
  }
}

// Clean environment before each test
const originalEnv = { ...process.env };
function resetEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) {
      delete process.env[k];
    }
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v;
  }
  delete process.env.VERCEL_ENV;
  delete process.env.NODE_ENV;
  delete process.env.VORTEX_LOCAL_DEV;
  delete process.env.VORTEX_ALLOW_LOCAL_DEV;
  delete process.env.SUPABASE_PROJECT_REF;
  delete process.env.VORTEX_EXPECTED_SUPABASE_PROJECT_REF;
  delete process.env.EXPECTED_SUPABASE_PROJECT_REF;
  delete process.env.SUPABASE_URL;
  delete process.env.VORTEX_PREVIEW_SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VORTEX_PREVIEW_SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.VORTEXT_BOT_HMAC_SECRET;
}

function createMockReq(options = {}) {
  const method = options.method || 'GET';
  const url = options.url || '/';
  const headers = {};
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      headers[k.toLowerCase()] = v;
    }
  }
  const body = options.body !== undefined ? options.body : '';
  const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');

  const stream = Readable.from([bodyBuffer]);
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  return stream;
}

function createMockRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(data) {
      if (data) {
        try {
          this.body = JSON.parse(data);
        } catch (_) {
          this.body = data;
        }
      }
    }
  };
}

async function runCrossRouteIsolationBattery() {
  console.log('============================================================');
  console.log('   PR #19 STAGE 2C: CROSS-ROUTE PROJECT ISOLATION BATTERY   ');
  console.log('============================================================\n');

  // -------------------------------------------------------------------------
  // 1. SHARED SECURITY IMPLEMENTATION INVARIANCE
  // -------------------------------------------------------------------------
  console.log('--- 1. Shared Security Logic Invariance ---');
  {
    report('1a. Shared implementation: analytics.js imports validateSupabaseProjectBinding from _lib',
      analyticsHandler.validateSupabaseProjectBinding === sharedBinding.validateSupabaseProjectBinding);

    report('1b. Shared implementation: trades.js imports validateSupabaseProjectBinding from _lib',
      tradesHandler.validateSupabaseProjectBinding === sharedBinding.validateSupabaseProjectBinding);

    report('1c. Shared constants: STAGING_PROJECT_REF identical across both routes',
      analyticsHandler.STAGING_PROJECT_REF === STAGING_REF &&
      tradesHandler.STAGING_PROJECT_REF === STAGING_REF &&
      STAGING_REF === 'xtyszeuvtfcgognkrwxv');

    report('1d. Shared constants: PRODUCTION_PROJECT_REF identical across both routes',
      analyticsHandler.PRODUCTION_PROJECT_REF === PROD_REF &&
      tradesHandler.PRODUCTION_PROJECT_REF === PROD_REF &&
      PROD_REF === 'bucziqekzyrttgcoxtas');
  }

  // -------------------------------------------------------------------------
  // 2. PREVIEW ENVIRONMENT ISOLATION (VERCEL_ENV=preview)
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Preview Environment Isolation (xtyszeuvtfcgognkrwxv ONLY) ---');
  {
    // 2a. analytics.js accepts staging project in preview
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res2a = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res2a);
    // Accepted binding proceeds to auth check (returns 401 when no token, NOT 503)
    report('2a. Preview: analytics.js accepts staging project xtyszeuvtfcgognkrwxv',
      res2a.statusCode === 401, `Status: ${res2a.statusCode}`);

    // 2b. trades.js (GET) accepts staging project in preview
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    const res2b = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res2b);
    report('2b. Preview: trades.js (GET) accepts staging project xtyszeuvtfcgognkrwxv',
      res2b.statusCode === 401, `Status: ${res2b.statusCode}`);

    // 2c. trades.js (POST) accepts staging project in preview
    const res2c = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res2c);
    // Accepted binding proceeds to signature validation (returns 401 for invalid signature, NOT 503)
    report('2c. Preview: trades.js (POST) accepts staging project xtyszeuvtfcgognkrwxv',
      res2c.statusCode === 401, `Status: ${res2c.statusCode}`);

    // 2d. analytics.js rejects production project in preview (HTTP 503)
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = PROD_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res2d = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res2d);
    report('2d. Preview: analytics.js rejects production project bucziqekzyrttgcoxtas (503)',
      res2d.statusCode === 503, `Status: ${res2d.statusCode}`);

    // 2e. trades.js (GET) rejects production project in preview (HTTP 503)
    const res2e = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res2e);
    report('2e. Preview: trades.js (GET) rejects production project bucziqekzyrttgcoxtas (503)',
      res2e.statusCode === 503, `Status: ${res2e.statusCode}`);

    // 2f. trades.js (POST) rejects production project in preview (HTTP 503)
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    const res2f = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res2f);
    report('2f. Preview: trades.js (POST) rejects production project bucziqekzyrttgcoxtas (503)',
      res2f.statusCode === 503, `Status: ${res2f.statusCode}`);

    // 2g. analytics.js rejects rogue project in preview (HTTP 503)
    process.env.SUPABASE_URL = 'https://unauthorized-rogue.supabase.co';
    const res2g = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res2g);
    report('2g. Preview: analytics.js rejects rogue project reference (503)',
      res2g.statusCode === 503, `Status: ${res2g.statusCode}`);

    // 2h. trades.js (GET & POST) rejects rogue project in preview (HTTP 503)
    const res2hGet = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res2hGet);
    const res2hPost = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res2hPost);
    report('2h. Preview: trades.js rejects rogue project reference on GET and POST (503)',
      res2hGet.statusCode === 503 && res2hPost.statusCode === 503,
      `GET: ${res2hGet.statusCode}, POST: ${res2hPost.statusCode}`);
  }

  // -------------------------------------------------------------------------
  // 3. PRODUCTION ENVIRONMENT ISOLATION (VERCEL_ENV=production)
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Production Environment Isolation (bucziqekzyrttgcoxtas ONLY) ---');
  {
    // 3a. analytics.js accepts production project in production
    resetEnv();
    process.env.VERCEL_ENV = 'production';
    process.env.SUPABASE_URL = PROD_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res3a = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res3a);
    report('3a. Production: analytics.js accepts production project bucziqekzyrttgcoxtas',
      res3a.statusCode === 401, `Status: ${res3a.statusCode}`);

    // 3b. trades.js (GET) accepts production project in production
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    const res3b = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res3b);
    report('3b. Production: trades.js (GET) accepts production project bucziqekzyrttgcoxtas',
      res3b.statusCode === 401, `Status: ${res3b.statusCode}`);

    // 3c. trades.js (POST) accepts production project in production
    const res3c = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res3c);
    report('3c. Production: trades.js (POST) accepts production project bucziqekzyrttgcoxtas',
      res3c.statusCode === 401, `Status: ${res3c.statusCode}`);

    // 3d. analytics.js rejects staging project in production (HTTP 503)
    resetEnv();
    process.env.VERCEL_ENV = 'production';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res3d = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res3d);
    report('3d. Production: analytics.js rejects staging project in production (503)',
      res3d.statusCode === 503, `Status: ${res3d.statusCode}`);

    // 3e. trades.js (GET) rejects staging project in production (HTTP 503)
    const res3e = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res3e);
    report('3e. Production: trades.js (GET) rejects staging project in production (503)',
      res3e.statusCode === 503, `Status: ${res3e.statusCode}`);

    // 3f. trades.js (POST) rejects staging project in production (HTTP 503)
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    const res3f = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res3f);
    report('3f. Production: trades.js (POST) rejects staging project in production (503)',
      res3f.statusCode === 503, `Status: ${res3f.statusCode}`);

    // 3g. Both routes reject arbitrary rogue project in production (HTTP 503)
    process.env.SUPABASE_URL = 'https://unauthorized-production-rogue.supabase.co';
    const res3gA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res3gA);
    const res3gT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res3gT);
    report('3g. Production: Both routes reject rogue project in production (503)',
      res3gA.statusCode === 503 && res3gT.statusCode === 503,
      `Analytics: ${res3gA.statusCode}, Trades: ${res3gT.statusCode}`);
  }

  // -------------------------------------------------------------------------
  // 4. LOCAL DEVELOPMENT SCOPING (EXPLICIT MATCHING REF REQUIRED)
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Local Development Scoping ---');
  {
    // 4a. analytics.js accepts explicit staging ref in local dev
    resetEnv();
    process.env.VERCEL_ENV = 'development';
    process.env.SUPABASE_PROJECT_REF = STAGING_REF;
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res4a = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res4a);
    report('4a. Local Dev: analytics.js accepts explicit staging reference',
      res4a.statusCode === 401, `Status: ${res4a.statusCode}`);

    // 4b. trades.js accepts explicit staging ref in local dev
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    const res4bGet = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res4bGet);
    const res4bPost = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res4bPost);
    report('4b. Local Dev: trades.js (GET & POST) accepts explicit staging reference',
      res4bGet.statusCode === 401 && res4bPost.statusCode === 401,
      `GET: ${res4bGet.statusCode}, POST: ${res4bPost.statusCode}`);

    // 4c. analytics.js accepts explicit production ref in local dev
    resetEnv();
    process.env.VORTEX_LOCAL_DEV = 'true';
    process.env.SUPABASE_PROJECT_REF = PROD_REF;
    process.env.SUPABASE_URL = PROD_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res4c = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res4c);
    report('4c. Local Dev: analytics.js accepts explicit production reference',
      res4c.statusCode === 401, `Status: ${res4c.statusCode}`);

    // 4d. trades.js accepts explicit production ref in local dev
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    const res4d = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res4d);
    report('4d. Local Dev: trades.js accepts explicit production reference',
      res4d.statusCode === 401, `Status: ${res4d.statusCode}`);

    // 4e. Both routes reject local dev with missing project reference (HTTP 503)
    resetEnv();
    process.env.VERCEL_ENV = 'development';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res4eA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res4eA);
    const res4eT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res4eT);
    report('4e. Local Dev: Both routes reject missing project reference (503)',
      res4eA.statusCode === 503 && res4eT.statusCode === 503,
      `Analytics: ${res4eA.statusCode}, Trades: ${res4eT.statusCode}`);

    // 4f. Both routes reject local dev with mismatched reference and URL (HTTP 503)
    process.env.SUPABASE_PROJECT_REF = STAGING_REF;
    process.env.SUPABASE_URL = PROD_URL; // Mismatched

    const res4fA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res4fA);
    const res4fT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res4fT);
    report('4f. Local Dev: Both routes reject mismatched reference and URL (503)',
      res4fA.statusCode === 503 && res4fT.statusCode === 503,
      `Analytics: ${res4fA.statusCode}, Trades: ${res4fT.statusCode}`);

    // 4g. Both routes reject unsupported project reference in local dev (HTTP 503)
    process.env.SUPABASE_PROJECT_REF = 'arbitrary-unsupported-ref';
    process.env.SUPABASE_URL = 'https://arbitrary-unsupported-ref.supabase.co';

    const res4gA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res4gA);
    const res4gT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res4gT);
    report('4g. Local Dev: Both routes reject unsupported reference (503)',
      res4gA.statusCode === 503 && res4gT.statusCode === 503,
      `Analytics: ${res4gA.statusCode}, Trades: ${res4gT.statusCode}`);
  }

  // -------------------------------------------------------------------------
  // 5. UNKNOWN ENVIRONMENTS & INFERENCE GUARDS
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Unknown Environments & Strict Inference Guards ---');
  {
    // 5a. Missing VERCEL_ENV outside local dev rejected on both routes (HTTP 503)
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res5aA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res5aA);
    const res5aT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res5aT);
    report('5a. Unknown Env: Missing VERCEL_ENV rejected on both routes (503)',
      res5aA.statusCode === 503 && res5aT.statusCode === 503,
      `Analytics: ${res5aA.statusCode}, Trades: ${res5aT.statusCode}`);

    // 5b. Invalid VERCEL_ENV=staging rejected on both routes (HTTP 503)
    process.env.VERCEL_ENV = 'staging';
    const res5bA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res5bA);
    const res5bT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res5bT);
    report('5b. Unknown Env: Invalid VERCEL_ENV=staging rejected on both routes (503)',
      res5bA.statusCode === 503 && res5bT.statusCode === 503,
      `Analytics: ${res5bA.statusCode}, Trades: ${res5bT.statusCode}`);

    // 5c. Do not infer Production from NODE_ENV=production alone (HTTP 503)
    resetEnv();
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_URL = PROD_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res5cA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res5cA);
    const res5cT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res5cT);
    report('5c. Inference Guard: Do not infer Production from NODE_ENV alone (503)',
      res5cA.statusCode === 503 && res5cT.statusCode === 503,
      `Analytics: ${res5cA.statusCode}, Trades: ${res5cT.statusCode}`);

    // 5d. Do not infer Preview from NODE_ENV=preview alone (HTTP 503)
    resetEnv();
    process.env.NODE_ENV = 'preview';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res5dA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res5dA);
    const res5dT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res5dT);
    report('5d. Inference Guard: Do not infer Preview from NODE_ENV alone (503)',
      res5dA.statusCode === 503 && res5dT.statusCode === 503,
      `Analytics: ${res5dA.statusCode}, Trades: ${res5dT.statusCode}`);
  }

  // -------------------------------------------------------------------------
  // 6. MALFORMED & INSECURE URLS
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Malformed & Insecure URLs ---');
  {
    const badUrls = [
      { name: '6a. Insecure HTTP', url: `http://${STAGING_REF}.supabase.co` },
      { name: '6b. URL with credentials', url: `https://user:pass@${STAGING_REF}.supabase.co` },
      { name: '6c. Custom port', url: `https://${STAGING_REF}.supabase.co:8443` },
      { name: '6d. Unexpected path', url: `https://${STAGING_REF}.supabase.co/rest/v1` },
      { name: '6e. Query parameters', url: `https://${STAGING_REF}.supabase.co?token=bypass` },
      { name: '6f. URL fragment', url: `https://${STAGING_REF}.supabase.co#fragment` }
    ];

    for (const item of badUrls) {
      resetEnv();
      process.env.VERCEL_ENV = 'preview';
      process.env.SUPABASE_URL = item.url;
      process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
      process.env.SUPABASE_SECRET_KEY = 'mock_sec';

      const resA = createMockRes();
      await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), resA);
      const resT = createMockRes();
      await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), resT);

      report(`${item.name} rejected on both routes (503)`,
        resA.statusCode === 503 && resT.statusCode === 503,
        `Analytics: ${resA.statusCode}, Trades: ${resT.statusCode}`);
    }
  }

  // -------------------------------------------------------------------------
  // 7. MISSING SECRETS (FAIL-CLOSED BEHAVIOR)
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Missing Secrets (Fail-Closed Behavior) ---');
  {
    // 7a. analytics.js missing service key -> 503
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    // SUPABASE_SECRET_KEY deliberately omitted

    const res7a = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res7a);
    report('7a. Missing Secret: analytics.js missing service key fails closed (503)',
      res7a.statusCode === 503, `Status: ${res7a.statusCode}`);

    // 7b. analytics.js missing publishable key -> 503
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';
    // SUPABASE_PUBLISHABLE_KEY deliberately omitted

    const res7b = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res7b);
    report('7b. Missing Secret: analytics.js missing publishable key fails closed (503)',
      res7b.statusCode === 503, `Status: ${res7b.statusCode}`);

    // 7c. trades.js (GET & POST) missing service key -> 503
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    // SUPABASE_SECRET_KEY deliberately omitted

    const res7cGet = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res7cGet);
    const res7cPost = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res7cPost);
    report('7c. Missing Secret: trades.js missing service key fails closed on GET and POST (503)',
      res7cGet.statusCode === 503 && res7cPost.statusCode === 503,
      `GET: ${res7cGet.statusCode}, POST: ${res7cPost.statusCode}`);

    // 7d. trades.js (GET) missing publishable key -> 503
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    // SUPABASE_PUBLISHABLE_KEY deliberately omitted

    const res7d = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res7d);
    report('7d. Missing Secret: trades.js (GET) missing publishable key fails closed (503)',
      res7d.statusCode === 503, `Status: ${res7d.statusCode}`);

    // 7e. trades.js (POST) missing HMAC secret -> 503
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    // VORTEXT_BOT_HMAC_SECRET deliberately omitted

    const res7e = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res7e);
    report('7e. Missing Secret: trades.js (POST) missing HMAC secret fails closed (503)',
      res7e.statusCode === 503, `Status: ${res7e.statusCode}`);
  }

  // -------------------------------------------------------------------------
  // 8. ZERO OUTBOUND SUPABASE REQUESTS (PRE-NETWORK PROOF)
  // -------------------------------------------------------------------------
  console.log('\n--- 8. Zero Outbound Requests on Invalid Configuration ---');
  {
    const originalFetch = global.fetch;
    let fetchCallCount = 0;

    const spyFetch = async (url) => {
      fetchCallCount++;
      throw new Error(`PRE-NETWORK SECURITY VIOLATION: Outbound fetch called to ${url}!`);
    };

    // 8a. analytics.js with mismatched project ref makes zero outbound calls
    global.fetch = spyFetch;
    fetchCallCount = 0;
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = PROD_URL; // Mismatched
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res8a = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res8a);
    report('8a. Pre-Network Proof: analytics.js project mismatch dispatches 0 fetch requests',
      fetchCallCount === 0 && res8a.statusCode === 503, `Fetch count: ${fetchCallCount}, Status: ${res8a.statusCode}`);

    // 8b. trades.js (GET) with mismatched project ref makes zero outbound calls
    fetchCallCount = 0;
    const res8b = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res8b);
    report('8b. Pre-Network Proof: trades.js (GET) project mismatch dispatches 0 fetch requests',
      fetchCallCount === 0 && res8b.statusCode === 503, `Fetch count: ${fetchCallCount}, Status: ${res8b.statusCode}`);

    // 8c. trades.js (POST) with mismatched project ref makes zero outbound calls
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    fetchCallCount = 0;
    const res8c = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res8c);
    report('8c. Pre-Network Proof: trades.js (POST) project mismatch dispatches 0 fetch requests',
      fetchCallCount === 0 && res8c.statusCode === 503, `Fetch count: ${fetchCallCount}, Status: ${res8c.statusCode}`);

    // 8d. analytics.js with unknown environment makes zero outbound calls
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    fetchCallCount = 0;
    const res8d = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res8d);
    report('8d. Pre-Network Proof: analytics.js unknown environment dispatches 0 fetch requests',
      fetchCallCount === 0 && res8d.statusCode === 503, `Fetch count: ${fetchCallCount}, Status: ${res8d.statusCode}`);

    // 8e. trades.js (GET) with unknown environment makes zero outbound calls
    fetchCallCount = 0;
    const res8e = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res8e);
    report('8e. Pre-Network Proof: trades.js (GET) unknown environment dispatches 0 fetch requests',
      fetchCallCount === 0 && res8e.statusCode === 503, `Fetch count: ${fetchCallCount}, Status: ${res8e.statusCode}`);

    // 8f. trades.js (POST) with unknown environment makes zero outbound calls
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    fetchCallCount = 0;
    const res8f = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res8f);
    report('8f. Pre-Network Proof: trades.js (POST) unknown environment dispatches 0 fetch requests',
      fetchCallCount === 0 && res8f.statusCode === 503, `Fetch count: ${fetchCallCount}, Status: ${res8f.statusCode}`);

    global.fetch = originalFetch;
  }

  // -------------------------------------------------------------------------
  // 9. PRESERVATION OF AUTHENTICATION, AUTHORIZATION & SECRET CONTAINMENT
  // -------------------------------------------------------------------------
  console.log('\n--- 9. Authentication, Authorization & Secret Non-Leakage ---');
  {
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_public_anon_key_for_test';
    process.env.SUPABASE_SECRET_KEY = 'mock_service_role_secret_key_12345';
    process.env.VORTEXT_BOT_HMAC_SECRET = 'supersecretbotkeymustbe32charslong!';

    // 9a. trades.js HMAC validation preserved (rejects bad signature with 401)
    const res9a = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: {
        'content-type': 'application/json',
        'x-vortext-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-vortext-signature': '0'.repeat(64)
      },
      body: JSON.stringify({ bot_id: 'vortext-fleet' })
    }), res9a);
    report('9a. Auth Preserved: trades.js POST rejects invalid bot signature with 401',
      res9a.statusCode === 401 && res9a.body && res9a.body.error.includes('signature'),
      `Status: ${res9a.statusCode}`);

    // 9b. trades.js Bearer auth preserved (rejects missing token with 401)
    const res9b = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res9b);
    report('9b. Auth Preserved: trades.js GET rejects missing Authorization header with 401',
      res9b.statusCode === 401 && res9b.body && res9b.body.error === 'Sign-in required',
      `Status: ${res9b.statusCode}`);

    // 9c. analytics.js Bearer auth preserved (rejects missing token with 401)
    const res9c = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res9c);
    report('9c. Auth Preserved: analytics.js GET rejects missing Authorization header with 401',
      res9c.statusCode === 401 && res9c.body && res9c.body.error === 'Authentication required',
      `Status: ${res9c.statusCode}`);

    // 9d. Zero secrets in responses across both routes
    const bodyStr9a = JSON.stringify(res9a.body || '');
    const bodyStr9b = JSON.stringify(res9b.body || '');
    const bodyStr9c = JSON.stringify(res9c.body || '');
    const combinedBodies = `${bodyStr9a} ${bodyStr9b} ${bodyStr9c}`;

    const headersStr9a = JSON.stringify(res9a.headers || '');
    const headersStr9b = JSON.stringify(res9b.headers || '');
    const headersStr9c = JSON.stringify(res9c.headers || '');
    const combinedHeaders = `${headersStr9a} ${headersStr9b} ${headersStr9c}`;

    report('9d. Secret Containment: Zero service-role keys or HMAC secrets leaked in response bodies or headers',
      !combinedBodies.includes('mock_service_role_secret_key_12345') &&
      !combinedBodies.includes('supersecretbotkeymustbe32charslong!') &&
      !combinedHeaders.includes('mock_service_role_secret_key_12345') &&
      !combinedHeaders.includes('supersecretbotkeymustbe32charslong!'));
  }

  // Restore original environment
  resetEnv();
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v;
  }

  // -------------------------------------------------------------------------
  // FINAL BATTERY VERDICT
  // -------------------------------------------------------------------------
  console.log('\n============================================================');
  console.log(`CROSS-ROUTE ISOLATION BATTERY RESULTS: ${passedTests} / ${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCrossRouteIsolationBattery().catch((err) => {
    console.error('Fatal error in cross-route test battery:', err);
    process.exit(1);
  });
}

module.exports = { runCrossRouteIsolationBattery };
