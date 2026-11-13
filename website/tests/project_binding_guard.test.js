/**
 * website/tests/project_binding_guard.test.js
 * 
 * VORTEX AI — PR #19 SUPABASE PROJECT-BINDING GUARD COMPREHENSIVE TEST BATTERY
 * 
 * Tests the environment-aware project-reference guard in website/api/v1/analytics.js:
 * 1. Preview Environment:
 *    - Exact staging URL (https://xtyszeuvtfcgognkrwxv.supabase.co) + VERCEL_ENV=preview -> accepted
 *    - Production URL + VERCEL_ENV=preview -> rejected
 *    - Any other Supabase project URL + Preview -> rejected
 *    - Insecure HTTP URL -> rejected
 *    - URL with credentials -> rejected
 *    - URL with custom port -> rejected
 *    - URL with path components -> rejected
 *    - URL with query parameters -> rejected
 *    - URL with fragment -> rejected
 * 
 * 2. Production Environment:
 *    - Exact production URL (https://bucziqekzyrttgcoxtas.supabase.co) + VERCEL_ENV=production -> accepted
 *    - Staging URL + VERCEL_ENV=production -> rejected
 *    - Any other project URL + Production -> rejected
 * 
 * 3. Local Development:
 *    - Explicit staging project reference + matching staging URL -> accepted
 *    - Explicit production project reference + matching production URL -> accepted
 *    - Missing project reference -> rejected
 *    - Mismatched reference and URL -> rejected
 *    - Unsupported local project reference -> rejected
 * 
 * 4. Unknown Environments:
 *    - Missing VERCEL_ENV outside explicit local development -> rejected
 *    - Invalid VERCEL_ENV outside explicit local development -> rejected
 *    - NODE_ENV=production without VERCEL_ENV (no inference) -> rejected
 *    - NODE_ENV=preview without VERCEL_ENV (no inference) -> rejected
 * 
 * 5. Full Handler Integration & Fail-Closed Dispatch:
 *    - Handler rejects missing/mismatched project reference with HTTP 503 before any Supabase request
 *    - Zero network fetch attempted when project binding fails
 */

'use strict';

const assert = require('node:assert');
const analyticsHandler = require('../api/v1/analytics');

const validateSupabaseProjectBinding = analyticsHandler.validateSupabaseProjectBinding;
const STAGING_REF = analyticsHandler.STAGING_PROJECT_REF;
const PROD_REF = analyticsHandler.PRODUCTION_PROJECT_REF;

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
  process.env = { ...originalEnv };
  delete process.env.VERCEL_ENV;
  delete process.env.NODE_ENV;
  delete process.env.VORTEX_LOCAL_DEV;
  delete process.env.VORTEX_ALLOW_LOCAL_DEV;
  delete process.env.SUPABASE_PROJECT_REF;
  delete process.env.VORTEX_EXPECTED_SUPABASE_PROJECT_REF;
  delete process.env.EXPECTED_SUPABASE_PROJECT_REF;
  delete process.env.SUPABASE_URL;
  delete process.env.VORTEX_PREVIEW_SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
}

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

async function runTestSuite() {
  console.log('============================================================');
  console.log('   PR #19 SUPABASE PROJECT-BINDING GUARD TEST BATTERY       ');
  console.log('============================================================\n');

  // -------------------------------------------------------------------------
  // 1. PREVIEW ENVIRONMENT
  // -------------------------------------------------------------------------
  console.log('--- 1. Preview Environment Scoping ---');
  {
    resetEnv();
    process.env.VERCEL_ENV = 'preview';

    // 1a. Exact staging URL accepted
    const r1 = validateSupabaseProjectBinding(STAGING_URL);
    report('1a. Preview: Exact staging URL accepted',
      r1.valid === true && r1.projectRef === STAGING_REF && r1.environment === 'preview');

    // 1b. Production URL rejected
    const r2 = validateSupabaseProjectBinding(PROD_URL);
    report('1b. Preview: Production URL rejected',
      r2.valid === false && r2.error.includes('does not match expected staging reference'));

    // 1c. Any other Supabase project rejected
    const r3 = validateSupabaseProjectBinding('https://unauthorized-rogue.supabase.co');
    report('1c. Preview: Rogue Supabase project rejected',
      r3.valid === false && r3.error.includes('does not match expected staging reference'));

    // 1d. Insecure HTTP URL rejected
    const r4 = validateSupabaseProjectBinding(`http://${STAGING_REF}.supabase.co`);
    report('1d. Preview: Insecure HTTP URL rejected',
      r4.valid === false && r4.error.includes('Insecure protocol'));

    // 1e. URL with credentials rejected
    const r5 = validateSupabaseProjectBinding(`https://admin:secret@${STAGING_REF}.supabase.co`);
    report('1e. Preview: URL with credentials rejected',
      r5.valid === false && r5.error.includes('contains credentials'));

    // 1f. URL with custom port rejected
    const r6 = validateSupabaseProjectBinding(`https://${STAGING_REF}.supabase.co:8443`);
    report('1f. Preview: URL with custom port rejected',
      r6.valid === false && r6.error.includes('Custom ports are forbidden'));

    // 1g. URL with path rejected
    const r7 = validateSupabaseProjectBinding(`https://${STAGING_REF}.supabase.co/rest/v1`);
    report('1g. Preview: URL with path rejected',
      r7.valid === false && r7.error.includes('contains path components'));

    // 1h. URL with query rejected
    const r8 = validateSupabaseProjectBinding(`https://${STAGING_REF}.supabase.co?redirect=malicious`);
    report('1h. Preview: URL with query parameters rejected',
      r8.valid === false && r8.error.includes('contains query parameters'));

    // 1i. URL with fragment rejected
    const r9 = validateSupabaseProjectBinding(`https://${STAGING_REF}.supabase.co#override`);
    report('1i. Preview: URL with fragment rejected',
      r9.valid === false && r9.error.includes('contains fragment'));
  }

  // -------------------------------------------------------------------------
  // 2. PRODUCTION ENVIRONMENT
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Production Environment Scoping ---');
  {
    resetEnv();
    process.env.VERCEL_ENV = 'production';

    // 2a. Exact production URL accepted
    const r1 = validateSupabaseProjectBinding(PROD_URL);
    report('2a. Production: Exact production URL accepted',
      r1.valid === true && r1.projectRef === PROD_REF && r1.environment === 'production');

    // 2b. Staging URL rejected in production
    const r2 = validateSupabaseProjectBinding(STAGING_URL);
    report('2b. Production: Staging URL rejected',
      r2.valid === false && r2.error.includes('does not match expected production reference'));

    // 2c. Other project URL rejected in production
    const r3 = validateSupabaseProjectBinding('https://unauthorized-other.supabase.co');
    report('2c. Production: Arbitrary project URL rejected',
      r3.valid === false && r3.error.includes('does not match expected production reference'));
  }

  // -------------------------------------------------------------------------
  // 3. LOCAL DEVELOPMENT
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Local Development Scoping ---');
  {
    // 3a. Explicit staging ref + staging URL (VERCEL_ENV=development) accepted
    resetEnv();
    process.env.VERCEL_ENV = 'development';
    process.env.SUPABASE_PROJECT_REF = STAGING_REF;
    const r1 = validateSupabaseProjectBinding(STAGING_URL);
    report('3a. Local Dev (VERCEL_ENV=dev): Explicit staging ref + matching staging URL accepted',
      r1.valid === true && r1.projectRef === STAGING_REF && r1.environment === 'development');

    // 3b. Explicit staging ref + staging URL (VORTEX_LOCAL_DEV=true) accepted
    resetEnv();
    process.env.VORTEX_LOCAL_DEV = 'true';
    process.env.SUPABASE_PROJECT_REF = STAGING_REF;
    const r2 = validateSupabaseProjectBinding(STAGING_URL);
    report('3b. Local Dev (VORTEX_LOCAL_DEV): Explicit staging ref + matching staging URL accepted',
      r2.valid === true && r2.projectRef === STAGING_REF && r2.environment === 'development');

    // 3c. Explicit production ref + matching prod URL accepted
    resetEnv();
    process.env.VERCEL_ENV = 'development';
    process.env.SUPABASE_PROJECT_REF = PROD_REF;
    const r3 = validateSupabaseProjectBinding(PROD_URL);
    report('3c. Local Dev: Explicit prod ref + matching prod URL accepted',
      r3.valid === true && r3.projectRef === PROD_REF && r3.environment === 'development');

    // 3d. Missing project reference rejected
    resetEnv();
    process.env.VERCEL_ENV = 'development';
    const r4 = validateSupabaseProjectBinding(STAGING_URL);
    report('3d. Local Dev: Missing explicit project reference rejected',
      r4.valid === false && r4.error.includes('missing explicit project reference'));

    // 3e. Mismatched reference and URL rejected
    resetEnv();
    process.env.VERCEL_ENV = 'development';
    process.env.SUPABASE_PROJECT_REF = STAGING_REF;
    const r5 = validateSupabaseProjectBinding(PROD_URL);
    report('3e. Local Dev: Mismatched reference and URL rejected',
      r5.valid === false && r5.error.includes('does not match URL project reference'));

    // 3f. Unsupported local project reference rejected
    resetEnv();
    process.env.VERCEL_ENV = 'development';
    process.env.SUPABASE_PROJECT_REF = 'arbitrary-unsupported-ref';
    const r6 = validateSupabaseProjectBinding('https://arbitrary-unsupported-ref.supabase.co');
    report('3f. Local Dev: Unsupported local project reference rejected',
      r6.valid === false && r6.error.includes('unsupported project reference'));
  }

  // -------------------------------------------------------------------------
  // 4. UNKNOWN ENVIRONMENTS & STRICT INFERENCE GUARDS
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Unknown Environments & Inference Guards ---');
  {
    // 4a. Missing VERCEL_ENV outside explicit local dev rejected
    resetEnv();
    const r1 = validateSupabaseProjectBinding(STAGING_URL);
    report('4a. Unknown: Missing VERCEL_ENV outside local dev rejected',
      r1.valid === false && r1.error.includes('Unknown environment rejection'));

    // 4b. Invalid VERCEL_ENV (e.g. 'staging' or 'test') rejected
    resetEnv();
    process.env.VERCEL_ENV = 'staging';
    const r2 = validateSupabaseProjectBinding(STAGING_URL);
    report('4b. Unknown: Invalid VERCEL_ENV=staging rejected',
      r2.valid === false && r2.error.includes('Unknown environment rejection'));

    // 4c. Do not infer Production from NODE_ENV alone
    resetEnv();
    process.env.NODE_ENV = 'production';
    const r3 = validateSupabaseProjectBinding(PROD_URL);
    report('4c. Unknown: Do not infer Production from NODE_ENV alone (rejected)',
      r3.valid === false && r3.error.includes('Unknown environment rejection'));

    // 4d. Do not infer Preview from NODE_ENV alone
    resetEnv();
    process.env.NODE_ENV = 'preview';
    const r4 = validateSupabaseProjectBinding(STAGING_URL);
    report('4d. Unknown: Do not infer Preview from NODE_ENV alone (rejected)',
      r4.valid === false && r4.error.includes('Unknown environment rejection'));
  }

  // -------------------------------------------------------------------------
  // 5. FULL SERVERLESS HANDLER INTEGRATION & ZERO-NETWORK PROOF
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Full Serverless Handler Integration & Fail-Closed Guard ---');
  {
    // 5a. Mismatched project reference fails closed with HTTP 503 before any network call
    resetEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = PROD_URL; // Mismatched URL in preview
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    let fetchAttempted = false;
    const originalFetch = global.fetch;
    global.fetch = async () => {
      fetchAttempted = true;
      throw new Error('NETWORK CALL DETECTED: Fetch must not be called when project binding fails!');
    };

    try {
      const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer mock.token' } };
      const res = createMockRes();
      await analyticsHandler(req, res);

      report('5a. Handler returns HTTP 503 on project binding failure',
        res.statusCode === 503 && res.body.error === 'The configured authentication URL is invalid.');
      report('5b. Handler executes zero Supabase network requests on binding failure',
        fetchAttempted === false);
    } finally {
      global.fetch = originalFetch;
    }

    // 5c. Missing VERCEL_ENV in production-like NODE_ENV fails closed with HTTP 503
    resetEnv();
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_URL = PROD_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub';
    process.env.SUPABASE_SECRET_KEY = 'mock_sec';

    fetchAttempted = false;
    global.fetch = async () => {
      fetchAttempted = true;
      throw new Error('Fetch must not be called');
    };

    try {
      const req = { method: 'GET', url: '/api/v1/analytics/overview', headers: { authorization: 'Bearer mock.token' } };
      const res = createMockRes();
      await analyticsHandler(req, res);

      report('5c. Missing VERCEL_ENV with NODE_ENV=production fails closed with HTTP 503',
        res.statusCode === 503 && res.body.error === 'The configured authentication URL is invalid.');
      report('5d. Zero Supabase requests dispatched on unverified environment',
        fetchAttempted === false);
    } finally {
      global.fetch = originalFetch;
    }
  }

  // -------------------------------------------------------------------------
  // FINAL BATTERY SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n============================================================');
  console.log(`BATTERY RESULTS: ${passedTests} / ${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error running test battery:', err);
  process.exit(1);
});

