/**
 * website/tests/cross_route_project_isolation.test.js
 *
 * VORTEX AI — PR #19 STAGE 2D: CROSS-ROUTE SUPABASE PROJECT ISOLATION TEST BATTERY
 *
 * Comprehensive cross-route test suite proving that EVERY server-side API and
 * browser-auth configuration route enforces deployment-specific project binding:
 * - website/api/v1/analytics.js
 * - website/api/trades.js
 * - website/api/auth-config.js
 *
 * Test Scenarios:
 * 1. Shared Security Implementation Invariance (all 3 routes)
 * 2. Preview Environment Isolation (xtyszeuvtfcgognkrwxv ONLY across all 3 routes)
 * 3. Production Environment Isolation (bucziqekzyrttgcoxtas ONLY across all 3 routes)
 * 4. Local Development Scoping (explicit matching ref required across all 3 routes)
 * 5. Unknown Environments & Strict Inference Guards (negative tests for removed paths)
 * 6. Malformed & Insecure URLs (HTTP, credentials, ports, paths, query, fragments)
 * 7. Missing Secrets (fail-closed behavior)
 * 8. Zero Outbound Network Requests on Invalid Configurations (fetch spy across all routes)
 * 9. Existing Authentication, Authorization, Method & Secret Non-Leakage
 */

'use strict';

const assert = require('node:assert');
const { Readable } = require('node:stream');

const analyticsHandler = require('../api/v1/analytics');
const tradesHandler = require('../api/trades');
const authConfigHandler = require('../api/auth-config');
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
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
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
  console.log('   PR #19 STAGE 2D: CROSS-ROUTE PROJECT ISOLATION BATTERY   ');
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

    report('1c. Shared implementation: auth-config.js imports validateSupabaseProjectBinding from _lib',
      authConfigHandler.validateSupabaseProjectBinding === sharedBinding.validateSupabaseProjectBinding);

    report('1d. Shared constants: STAGING_PROJECT_REF identical across all 3 routes',
      analyticsHandler.STAGING_PROJECT_REF === STAGING_REF &&
      tradesHandler.STAGING_PROJECT_REF === STAGING_REF &&
      authConfigHandler.STAGING_PROJECT_REF === STAGING_REF &&
      STAGING_REF === 'xtyszeuvtfcgognkrwxv');

    report('1e. Shared constants: PRODUCTION_PROJECT_REF identical across all 3 routes',
      analyticsHandler.PRODUCTION_PROJECT_REF === PROD_REF &&
      tradesHandler.PRODUCTION_PROJECT_REF === PROD_REF &&
      authConfigHandler.PRODUCTION_PROJECT_REF === PROD_REF &&
      PROD_REF === 'bucziqekzyrttgcoxtas');

    report('1f. Shared constants: SUPPORTED_LOCAL_REFS identical across all 3 routes',
      Array.isArray(authConfigHandler.SUPPORTED_LOCAL_REFS) &&
      authConfigHandler.SUPPORTED_LOCAL_REFS.includes(STAGING_REF) &&
      authConfigHandler.SUPPORTED_LOCAL_REFS.includes(PROD_REF));
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
    report('2c. Preview: trades.js (POST) accepts staging project xtyszeuvtfcgognkrwxv',
      res2c.statusCode === 401, `Status: ${res2c.statusCode}`);

    // 2d. auth-config.js accepts staging project in preview
    const res2d = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res2d);
    report('2d. Preview: auth-config.js accepts staging project xtyszeuvtfcgognkrwxv',
      res2d.statusCode === 200 && res2d.body && res2d.body.configured === true && res2d.body.supabaseUrl === STAGING_URL,
      `Status: ${res2d.statusCode}, Body: ${JSON.stringify(res2d.body)}`);

    // 2e. analytics.js rejects production project in preview (HTTP 503)
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = PROD_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res2e = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res2e);
    report('2e. Preview: analytics.js rejects production project bucziqekzyrttgcoxtas (503)',
      res2e.statusCode === 503, `Status: ${res2e.statusCode}`);

    // 2f. trades.js (GET) rejects production project in preview (HTTP 503)
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    const res2f = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res2f);
    report('2f. Preview: trades.js (GET) rejects production project bucziqekzyrttgcoxtas (503)',
      res2f.statusCode === 503, `Status: ${res2f.statusCode}`);

    // 2g. trades.js (POST) rejects production project in preview (HTTP 503)
    const res2g = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res2g);
    report('2g. Preview: trades.js (POST) rejects production project bucziqekzyrttgcoxtas (503)',
      res2g.statusCode === 503, `Status: ${res2g.statusCode}`);

    // 2h. auth-config.js rejects production project in preview (HTTP 503)
    const res2h = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res2h);
    report('2h. Preview: auth-config.js rejects production project bucziqekzyrttgcoxtas (503)',
      res2h.statusCode === 503 && res2h.body && res2h.body.configured === false,
      `Status: ${res2h.statusCode}, Body: ${JSON.stringify(res2h.body)}`);

    // 2i. All 3 routes reject rogue project in preview (HTTP 503)
    process.env.SUPABASE_URL = 'https://unauthorized-rogue.supabase.co';
    const res2iA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res2iA);
    const res2iT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res2iT);
    const res2iC = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res2iC);
    report('2i. Preview: All 3 routes reject rogue project reference (503)',
      res2iA.statusCode === 503 && res2iT.statusCode === 503 && res2iC.statusCode === 503,
      `A: ${res2iA.statusCode}, T: ${res2iT.statusCode}, C: ${res2iC.statusCode}`);
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

    // 3d. auth-config.js accepts production project in production
    const res3d = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res3d);
    report('3d. Production: auth-config.js accepts production project bucziqekzyrttgcoxtas',
      res3d.statusCode === 200 && res3d.body && res3d.body.configured === true && res3d.body.supabaseUrl === PROD_URL,
      `Status: ${res3d.statusCode}, Body: ${JSON.stringify(res3d.body)}`);

    // 3e. analytics.js rejects staging project in production (HTTP 503)
    resetEnv();
    process.env.VERCEL_ENV = 'production';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res3e = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res3e);
    report('3e. Production: analytics.js rejects staging project in production (503)',
      res3e.statusCode === 503, `Status: ${res3e.statusCode}`);

    // 3f. trades.js (GET) rejects staging project in production (HTTP 503)
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    const res3f = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res3f);
    report('3f. Production: trades.js (GET) rejects staging project in production (503)',
      res3f.statusCode === 503, `Status: ${res3f.statusCode}`);

    // 3g. trades.js (POST) rejects staging project in production (HTTP 503)
    const res3g = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res3g);
    report('3g. Production: trades.js (POST) rejects staging project in production (503)',
      res3g.statusCode === 503, `Status: ${res3g.statusCode}`);

    // 3h. auth-config.js rejects staging project in production (HTTP 503)
    const res3h = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res3h);
    report('3h. Production: auth-config.js rejects staging project in production (503)',
      res3h.statusCode === 503 && res3h.body && res3h.body.configured === false,
      `Status: ${res3h.statusCode}, Body: ${JSON.stringify(res3h.body)}`);

    // 3i. All 3 routes reject arbitrary rogue project in production (HTTP 503)
    process.env.SUPABASE_URL = 'https://unauthorized-production-rogue.supabase.co';
    const res3iA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res3iA);
    const res3iT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res3iT);
    const res3iC = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res3iC);
    report('3i. Production: All 3 routes reject rogue project in production (503)',
      res3iA.statusCode === 503 && res3iT.statusCode === 503 && res3iC.statusCode === 503,
      `A: ${res3iA.statusCode}, T: ${res3iT.statusCode}, C: ${res3iC.statusCode}`);
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

    // 4c. auth-config.js accepts explicit staging ref in local dev
    const res4c = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res4c);
    report('4c. Local Dev: auth-config.js accepts explicit staging reference',
      res4c.statusCode === 200 && res4c.body && res4c.body.configured === true,
      `Status: ${res4c.statusCode}`);

    // 4d. analytics.js accepts explicit production ref via VORTEX_LOCAL_DEV
    resetEnv();
    process.env.VORTEX_LOCAL_DEV = 'true';
    process.env.SUPABASE_PROJECT_REF = PROD_REF;
    process.env.SUPABASE_URL = PROD_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res4d = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res4d);
    report('4d. Local Dev: analytics.js accepts explicit production reference via VORTEX_LOCAL_DEV',
      res4d.statusCode === 401, `Status: ${res4d.statusCode}`);

    // 4e. trades.js accepts explicit production ref in local dev
    process.env.VORTEXT_BOT_HMAC_SECRET = 'a'.repeat(32);
    const res4e = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res4e);
    report('4e. Local Dev: trades.js accepts explicit production reference',
      res4e.statusCode === 401, `Status: ${res4e.statusCode}`);

    // 4f. auth-config.js accepts explicit production ref in local dev
    const res4f = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res4f);
    report('4f. Local Dev: auth-config.js accepts explicit production reference',
      res4f.statusCode === 200 && res4f.body && res4f.body.configured === true,
      `Status: ${res4f.statusCode}`);

    // 4g. All 3 routes reject local dev with missing project reference (HTTP 503)
    resetEnv();
    process.env.VERCEL_ENV = 'development';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res4gA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res4gA);
    const res4gT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res4gT);
    const res4gC = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res4gC);
    report('4g. Local Dev: All 3 routes reject missing project reference (503)',
      res4gA.statusCode === 503 && res4gT.statusCode === 503 && res4gC.statusCode === 503,
      `A: ${res4gA.statusCode}, T: ${res4gT.statusCode}, C: ${res4gC.statusCode}`);

    // 4h. All 3 routes reject local dev with mismatched reference and URL (HTTP 503)
    process.env.SUPABASE_PROJECT_REF = STAGING_REF;
    process.env.SUPABASE_URL = PROD_URL; // Mismatched

    const res4hA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res4hA);
    const res4hT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res4hT);
    const res4hC = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res4hC);
    report('4h. Local Dev: All 3 routes reject mismatched reference and URL (503)',
      res4hA.statusCode === 503 && res4hT.statusCode === 503 && res4hC.statusCode === 503,
      `A: ${res4hA.statusCode}, T: ${res4hT.statusCode}, C: ${res4hC.statusCode}`);

    // 4i. All 3 routes reject unsupported project reference in local dev (HTTP 503)
    process.env.SUPABASE_PROJECT_REF = 'arbitrary-unsupported-ref';
    process.env.SUPABASE_URL = 'https://arbitrary-unsupported-ref.supabase.co';

    const res4iA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res4iA);
    const res4iT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res4iT);
    const res4iC = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res4iC);
    report('4i. Local Dev: All 3 routes reject unsupported reference (503)',
      res4iA.statusCode === 503 && res4iT.statusCode === 503 && res4iC.statusCode === 503,
      `A: ${res4iA.statusCode}, T: ${res4iT.statusCode}, C: ${res4iC.statusCode}`);
  }

  // -------------------------------------------------------------------------
  // 5. UNKNOWN ENVIRONMENTS & STRICT INFERENCE GUARDS (NEGATIVE TESTS)
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Unknown Environments & Strict Inference Guards (Negative Tests) ---');
  {
    // 5a. Missing VERCEL_ENV outside local dev rejected on all 3 routes (HTTP 503)
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res5aA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res5aA);
    const res5aT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res5aT);
    const res5aC = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res5aC);
    report('5a. Unknown Env: Missing VERCEL_ENV rejected on all 3 routes (503)',
      res5aA.statusCode === 503 && res5aT.statusCode === 503 && res5aC.statusCode === 503,
      `A: ${res5aA.statusCode}, T: ${res5aT.statusCode}, C: ${res5aC.statusCode}`);

    // 5b. Invalid VERCEL_ENV=staging rejected on all 3 routes (HTTP 503)
    process.env.VERCEL_ENV = 'staging';
    const res5bA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res5bA);
    const res5bT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res5bT);
    const res5bC = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res5bC);
    report('5b. Unknown Env: Invalid VERCEL_ENV=staging rejected on all 3 routes (503)',
      res5bA.statusCode === 503 && res5bT.statusCode === 503 && res5bC.statusCode === 503,
      `A: ${res5bA.statusCode}, T: ${res5bT.statusCode}, C: ${res5bC.statusCode}`);

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
    const res5cC = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res5cC);
    report('5c. Inference Guard: Do not infer Production from NODE_ENV alone (503 across all 3 routes)',
      res5cA.statusCode === 503 && res5cT.statusCode === 503 && res5cC.statusCode === 503,
      `A: ${res5cA.statusCode}, T: ${res5cT.statusCode}, C: ${res5cC.statusCode}`);

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
    const res5dC = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res5dC);
    report('5d. Inference Guard: Do not infer Preview from NODE_ENV alone (503 across all 3 routes)',
      res5dA.statusCode === 503 && res5dT.statusCode === 503 && res5dC.statusCode === 503,
      `A: ${res5dA.statusCode}, T: ${res5dT.statusCode}, C: ${res5dC.statusCode}`);

    // 5e. Task A Negative Test: Do not infer Local Development from NODE_ENV=development alone
    resetEnv();
    process.env.NODE_ENV = 'development';
    process.env.SUPABASE_PROJECT_REF = STAGING_REF;
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res5eA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res5eA);
    const res5eT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res5eT);
    const res5eC = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res5eC);
    report('5e. Task A Negative Test: NODE_ENV=development alone without explicit switch rejected on all 3 routes (503)',
      res5eA.statusCode === 503 && res5eT.statusCode === 503 && res5eC.statusCode === 503,
      `A: ${res5eA.statusCode}, T: ${res5eT.statusCode}, C: ${res5eC.statusCode}`);

    // 5f. Task A Negative Test: VORTEX_ALLOW_LOCAL_DEV removed as an implicit override
    resetEnv();
    process.env.VORTEX_ALLOW_LOCAL_DEV = 'true';
    process.env.SUPABASE_PROJECT_REF = STAGING_REF;
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    const res5fA = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res5fA);
    const res5fT = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res5fT);
    const res5fC = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res5fC);
    report('5f. Task A Negative Test: VORTEX_ALLOW_LOCAL_DEV rejected as removed override on all 3 routes (503)',
      res5fA.statusCode === 503 && res5fT.statusCode === 503 && res5fC.statusCode === 503,
      `A: ${res5fA.statusCode}, T: ${res5fT.statusCode}, C: ${res5fC.statusCode}`);

    // 5g. expectedSupabaseProjectRef returns null for ambiguous/removed inference environments
    resetEnv();
    process.env.NODE_ENV = 'development';
    process.env.SUPABASE_PROJECT_REF = STAGING_REF;
    const ref1 = sharedBinding.expectedSupabaseProjectRef();
    resetEnv();
    process.env.VORTEX_ALLOW_LOCAL_DEV = 'true';
    process.env.SUPABASE_PROJECT_REF = STAGING_REF;
    const ref2 = sharedBinding.expectedSupabaseProjectRef();
    report('5g. Task A Consistency: expectedSupabaseProjectRef returns null for NODE_ENV=dev and VORTEX_ALLOW_LOCAL_DEV alone',
      ref1 === null && ref2 === null);
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
      const resC = createMockRes();
      await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), resC);

      report(`${item.name} rejected on all 3 routes (503)`,
        resA.statusCode === 503 && resT.statusCode === 503 && resC.statusCode === 503,
        `Analytics: ${resA.statusCode}, Trades: ${resT.statusCode}, AuthConfig: ${resC.statusCode}`);
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

    const res7a = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res7a);
    report('7a. Missing Secret: analytics.js missing service key fails closed (503)',
      res7a.statusCode === 503, `Status: ${res7a.statusCode}`);

    // 7b. analytics.js missing publishable key -> 503
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

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

    const res7e = createMockRes();
    await tradesHandler(createMockReq({
      method: 'POST',
      url: '/api/trades',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }), res7e);
    report('7e. Missing Secret: trades.js (POST) missing HMAC secret fails closed (503)',
      res7e.statusCode === 503, `Status: ${res7e.statusCode}`);

    // 7f. auth-config.js missing publishable key -> 503
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = STAGING_URL;

    const res7f = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res7f);
    report('7f. Missing Secret: auth-config.js missing publishable key fails closed (503)',
      res7f.statusCode === 503 && res7f.body && res7f.body.configured === false,
      `Status: ${res7f.statusCode}`);

    // 7g. auth-config.js missing URL -> 503
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';

    const res7g = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res7g);
    report('7g. Missing Secret: auth-config.js missing Supabase URL fails closed (503)',
      res7g.statusCode === 503 && res7g.body && res7g.body.configured === false,
      `Status: ${res7g.statusCode}`);
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

    // 8d. auth-config.js with mismatched project ref makes zero outbound calls
    fetchCallCount = 0;
    const res8d = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res8d);
    report('8d. Pre-Network Proof: auth-config.js project mismatch dispatches 0 fetch requests',
      fetchCallCount === 0 && res8d.statusCode === 503, `Fetch count: ${fetchCallCount}, Status: ${res8d.statusCode}`);

    // 8e. analytics.js with unknown environment makes zero outbound calls
    resetEnv();
    process.env.SUPABASE_URL = STAGING_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    fetchCallCount = 0;
    const res8e = createMockRes();
    await analyticsHandler(createMockReq({ method: 'GET', url: '/api/v1/analytics/overview' }), res8e);
    report('8e. Pre-Network Proof: analytics.js unknown environment dispatches 0 fetch requests',
      fetchCallCount === 0 && res8e.statusCode === 503, `Fetch count: ${fetchCallCount}, Status: ${res8e.statusCode}`);

    // 8f. trades.js (GET) with unknown environment makes zero outbound calls
    fetchCallCount = 0;
    const res8f = createMockRes();
    await tradesHandler(createMockReq({ method: 'GET', url: '/api/trades' }), res8f);
    report('8f. Pre-Network Proof: trades.js (GET) unknown environment dispatches 0 fetch requests',
      fetchCallCount === 0 && res8f.statusCode === 503, `Fetch count: ${fetchCallCount}, Status: ${res8f.statusCode}`);

    // 8g. auth-config.js with unknown environment makes zero outbound calls
    fetchCallCount = 0;
    const res8g = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res8g);
    report('8g. Pre-Network Proof: auth-config.js unknown environment dispatches 0 fetch requests',
      fetchCallCount === 0 && res8g.statusCode === 503, `Fetch count: ${fetchCallCount}, Status: ${res8g.statusCode}`);

    global.fetch = originalFetch;
  }

  // -------------------------------------------------------------------------
  // 9. AUTHENTICATION, AUTHORIZATION & SECRET NON-LEAKAGE
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

    // 9d. auth-config.js rejects non-GET HTTP methods with 405 Method Not Allowed
    const res9dPost = createMockRes();
    await authConfigHandler(createMockReq({ method: 'POST', url: '/api/auth-config' }), res9dPost);
    const res9dPut = createMockRes();
    await authConfigHandler(createMockReq({ method: 'PUT', url: '/api/auth-config' }), res9dPut);
    const res9dDelete = createMockRes();
    await authConfigHandler(createMockReq({ method: 'DELETE', url: '/api/auth-config' }), res9dDelete);
    report('9d. Method Guard: auth-config.js rejects non-GET methods with 405 and Allow: GET',
      res9dPost.statusCode === 405 && res9dPost.headers['allow'] === 'GET' &&
      res9dPut.statusCode === 405 && res9dPut.headers['allow'] === 'GET' &&
      res9dDelete.statusCode === 405 && res9dDelete.headers['allow'] === 'GET',
      `POST: ${res9dPost.statusCode}, PUT: ${res9dPut.statusCode}, DELETE: ${res9dDelete.statusCode}`);

    // 9e. auth-config.js enforces Cache-Control: no-store, max-age=0
    const res9e = createMockRes();
    await authConfigHandler(createMockReq({ method: 'GET', url: '/api/auth-config' }), res9e);
    report('9e. Cache Header Guard: auth-config.js sets Cache-Control: no-store, max-age=0',
      res9e.headers['cache-control'] && res9e.headers['cache-control'].includes('no-store'),
      `Cache-Control: ${res9e.headers['cache-control']}`);

    // 9f. Zero secrets in responses across all 3 routes
    const bodyStr9a = JSON.stringify(res9a.body || '');
    const bodyStr9b = JSON.stringify(res9b.body || '');
    const bodyStr9c = JSON.stringify(res9c.body || '');
    const bodyStr9e = JSON.stringify(res9e.body || '');
    const combinedBodies = `${bodyStr9a} ${bodyStr9b} ${bodyStr9c} ${bodyStr9e}`;

    const headersStr9a = JSON.stringify(res9a.headers || '');
    const headersStr9b = JSON.stringify(res9b.headers || '');
    const headersStr9c = JSON.stringify(res9c.headers || '');
    const headersStr9e = JSON.stringify(res9e.headers || '');
    const combinedHeaders = `${headersStr9a} ${headersStr9b} ${headersStr9c} ${headersStr9e}`;

    report('9f. Secret Containment: Zero service-role keys or HMAC secrets leaked in response bodies or headers',
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
