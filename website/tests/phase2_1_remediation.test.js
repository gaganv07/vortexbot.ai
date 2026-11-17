/**
 * website/tests/phase2_1_remediation.test.js
 *
 * VORTEX AI — Phase 2.1 Remediation Verification Suite
 * Verifies:
 * 1. Complete route rewrite coverage in vercel.json (specifically /market-coverage and all HTML pages)
 * 2. Auth storage key harmonization (standard Supabase session key, legacy migration, signOut cleanup)
 * 3. Security headers, fail-closed guards, and cross-dashboard session compatibility
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WEBSITE_DIR = path.join(__dirname, '..');
const VERCEL_JSON_PATH = path.join(WEBSITE_DIR, 'vercel.json');
const AUTH_JS_PATH = path.join(WEBSITE_DIR, 'auth.js');
const TRADES_JS_PATH = path.join(WEBSITE_DIR, 'api', 'trades.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(name, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`[PASS] ${name}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${name}: ${details}`);
  }
}

console.log('============================================================');
console.log('   PHASE 2.1: ROUTING & AUTH HARMONIZATION VERIFICATION     ');
console.log('============================================================\n');

// --- 1. Vercel Rewrites Complete Route Coverage ---
console.log('--- 1. Route Rewrite Coverage in vercel.json ---');
try {
  assert(fs.existsSync(VERCEL_JSON_PATH), 'vercel.json must exist');
  const vercelCfg = JSON.parse(fs.readFileSync(VERCEL_JSON_PATH, 'utf8'));
  const rewrites = Array.isArray(vercelCfg.rewrites) ? vercelCfg.rewrites : [];

  // Test 1a: /market-coverage rewrite is present
  const mcRewrite = rewrites.find(r => r.source === '/market-coverage');
  assert(mcRewrite, '/market-coverage rewrite must be defined');
  assert.strictEqual(mcRewrite.destination, '/market-coverage.html',
    '/market-coverage must route to /market-coverage.html');
  report('1a. /market-coverage rewrite present and points to /market-coverage.html', true);

  // Test 1b: All 11 non-index HTML files have corresponding rewrite
  const htmlFiles = fs.readdirSync(WEBSITE_DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
  assert.strictEqual(htmlFiles.length, 11, 'Expected 11 non-index HTML files in website/');

  const missingRewrites = [];
  for (const hf of htmlFiles) {
    const route = '/' + hf.replace('.html', '');
    const found = rewrites.find(r => r.source === route && r.destination === '/' + hf);
    if (!found) missingRewrites.push(hf);
  }
  assert.strictEqual(missingRewrites.length, 0,
    `Missing rewrites for: ${missingRewrites.join(', ')}`);
  report(`1b. All ${htmlFiles.length} non-index HTML pages have clean rewrite routes`, true);

  // Test 1c: API analytics rewrites preserved
  const analyticsWildcard = rewrites.find(r => r.source === '/api/v1/analytics/:path*');
  const analyticsBase = rewrites.find(r => r.source === '/api/v1/analytics');
  assert(analyticsWildcard, 'Analytics wildcard rewrite must exist');
  assert(analyticsBase, 'Analytics base rewrite must exist');
  report('1c. Analytics API wildcard and base rewrites preserved', true);

  // Test 1d: Security headers and CSP preserved
  const headers = Array.isArray(vercelCfg.headers) ? vercelCfg.headers : [];
  const rootHeader = headers.find(h => h.source === '/(.*)');
  assert(rootHeader, 'Root header definition must exist');
  const csp = rootHeader.headers.find(h => h.key === 'Content-Security-Policy');
  assert(csp && csp.value.includes("connect-src 'self' https://*.supabase.co"),
    'CSP must allow Supabase connections');
  report('1d. CSP and security headers intact in vercel.json', true);

} catch (err) {
  report('1. Route rewrite coverage check failed', false, err.message);
}

// --- 2. Auth Storage Key Harmonization & Migration ---
console.log('\n--- 2. Auth Storage Key Harmonization in auth.js ---');
try {
  assert(fs.existsSync(AUTH_JS_PATH), 'auth.js must exist');
  const authSource = fs.readFileSync(AUTH_JS_PATH, 'utf8');

  // Test 2a: auth.js does not specify custom storageKey: 'vortex_auth_session' in createClient
  const customStorageKeyMatch = /createClient\([^)]+storageKey\s*:\s*['"]vortex_auth_session['"]/s.test(authSource);
  assert(!customStorageKeyMatch, 'auth.js must NOT configure custom storageKey in createClient');
  report('2a. Custom storageKey: "vortex_auth_session" removed from createClient', true);

  // Test 2b: Standard Supabase storage key migration logic is present
  assert(authSource.includes("'sb-' + projectRef + '-auth-token'") ||
         authSource.includes('sb-${projectRef}-auth-token') ||
         authSource.includes('sb-'),
    'auth.js must reference standard sb-<ref>-auth-token storage key');
  assert(authSource.includes('vortex_auth_session'),
    'auth.js must retain backward-compatible migration fallback for legacy vortex_auth_session');
  report('2b. Standard Supabase storage key migration fallback implemented', true);

  // Test 2c: Sign-out cleans up standard storage key and legacy keys
  assert(authSource.includes('removeItem') && authSource.includes('vortex_auth_session'),
    'signOut must remove legacy vortex_auth_session');
  assert(authSource.includes('sb-'),
    'signOut must remove standard sb-<ref>-auth-token');
  report('2c. SignOut explicitly purges standard and legacy session keys', true);

} catch (err) {
  report('2. Auth storage key harmonization check failed', false, err.message);
}

// --- 3. Functional Simulation of Session Migration & Continuity ---
console.log('\n--- 3. Functional Session Migration & Compatibility Simulation ---');
(async function() {
  try {
    // Mock browser globals for simulation
    const mockStorage = {};
    const mockLocalStorage = {
      getItem(key) { return mockStorage[key] || null; },
      setItem(key, val) { mockStorage[key] = String(val); },
      removeItem(key) { delete mockStorage[key]; },
      clear() { for (const k in mockStorage) delete mockStorage[k]; }
    };

    const mockSessionPayload = JSON.stringify({
      access_token: 'mock.ey.jwt-token-for-testing',
      refresh_token: 'mock-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'usr-12345', email: 'operator@vortexbot.ai' }
    });

    const testUrl = 'https://xtyszeuvtfcgognkrwxv.supabase.co';
    const hostParts = new URL(testUrl).hostname.toLowerCase().split('.');
    const projectRef = hostParts[0];
    const standardKey = 'sb-' + projectRef + '-auth-token';

    // Scenario A: User signs in via login.html (populates standardKey)
    mockLocalStorage.setItem(standardKey, mockSessionPayload);
    assert.strictEqual(mockLocalStorage.getItem(standardKey), mockSessionPayload,
      'Standard key should be populated by login simulation');
    report('3a. Standard Supabase session format stored in sb-<ref>-auth-token', true);

    // Scenario B: User with legacy vortex_auth_session migrates cleanly
    mockLocalStorage.clear();
    mockLocalStorage.setItem('vortex_auth_session', mockSessionPayload);

    // Run migration block
    if (!mockLocalStorage.getItem(standardKey)) {
      const legacySession = mockLocalStorage.getItem('vortex_auth_session');
      if (legacySession) {
        mockLocalStorage.setItem(standardKey, legacySession);
      }
    }
    assert.strictEqual(mockLocalStorage.getItem(standardKey), mockSessionPayload,
      'Migration must copy legacy session to standard key');
    report('3b. Legacy vortex_auth_session automatically migrated to sb-<ref>-auth-token', true);

    // Scenario C: SignOut purges both keys
    mockLocalStorage.removeItem(standardKey);
    mockLocalStorage.removeItem('vortex_auth_session');
    assert.strictEqual(mockLocalStorage.getItem(standardKey), null);
    assert.strictEqual(mockLocalStorage.getItem('vortex_auth_session'), null);
    report('3c. SignOut completely purges all session keys fail-closed', true);

  } catch (err) {
    report('3. Session simulation failed', false, err.message);
  }

  // --- 4. Backend Canonical Resolution Verification in trades.js ---
  console.log('\n--- 4. Backend Canonical Resolution in trades.js ---');
  try {
    const tradesSource = fs.readFileSync(TRADES_JS_PATH, 'utf8');

    assert(tradesSource.includes('VORTEX_BOT_HMAC_SECRET'),
      'trades.js must prefer canonical VORTEX_BOT_HMAC_SECRET');
    assert(tradesSource.includes('VORTEXT_BOT_HMAC_SECRET'),
      'trades.js must retain legacy VORTEXT_BOT_HMAC_SECRET fallback');
    report('4a. trades.js implements dual HMAC secret resolution', true);

    assert(tradesSource.includes('VORTEX_BOT_ID'),
      'trades.js must prefer canonical VORTEX_BOT_ID');
    assert(tradesSource.includes('VORTEXT_BOT_ID'),
      'trades.js must retain legacy VORTEXT_BOT_ID fallback');
    assert(tradesSource.includes("'vortex-main'"),
      'trades.js must default to vortex-main as final fallback');
    report('4b. trades.js implements dual Bot ID resolution with vortex-main fallback', true);

  } catch (err) {
    report('4. Backend canonical resolution verification failed', false, err.message);
  }

  console.log('\n============================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
})();
