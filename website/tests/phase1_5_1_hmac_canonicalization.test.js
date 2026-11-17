/**
 * website/tests/phase1_5_1_hmac_canonicalization.test.js
 *
 * VORTEX AI — Phase 1.5.1: HMAC Environment Variable Canonicalization Test Battery
 *
 * Verifies:
 * 1. Canonical variable alone works (VORTEX_BOT_HMAC_SECRET)
 * 2. Legacy variable alone works (VORTEXT_BOT_HMAC_SECRET)
 * 3. Both variables present: canonical takes precedence over legacy
 * 4. Whitespace canonical falls back cleanly to valid legacy
 * 5. Neither variable present: fails closed with HTTP 503
 * 6. Invalid/short secret (< 32 chars): fails closed with HTTP 503
 * 7. Existing HMAC signature verification remains unchanged (validates HMAC-SHA256,
 *    rejects clock skew > 300s, rejects tampered payload, rejects wrong secret)
 * 8. Secret containment: Zero secrets exposed in response bodies or headers
 */

'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

const tradesHandler = require('../api/trades');

const STAGING_URL = 'https://xtyszeuvtfcgognkrwxv.supabase.co';
const SECRET_CANONICAL = 'canonical_secret_key_32_characters_minimum_len!';
const SECRET_LEGACY = 'legacy_vortext_secret_key_32_chars_minimum_len!';
const SECRET_SHORT = 'too_short_secret';

let passed = 0;
let failed = 0;

function report(testName, ok, details = '') {
  if (ok) {
    passed++;
    console.log(`[PASS] ${testName}`);
  } else {
    failed++;
    console.error(`[FAIL] ${testName}: ${details}`);
  }
}

function resetEnv() {
  process.env.VERCEL_ENV = 'preview';
  process.env.SUPABASE_URL = STAGING_URL;
  process.env.SUPABASE_SECRET_KEY = 'mock_secret_key_for_testing';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_publishable_key_for_testing';
  delete process.env.VORTEX_BOT_HMAC_SECRET;
  delete process.env.VORTEXT_BOT_HMAC_SECRET;
}

function createMockReq(options = {}) {
  const method = options.method || 'POST';
  const url = options.url || '/api/trades';
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

function buildSignedPayload(secret, bodyObj, timestampOffset = 0) {
  const now = Math.floor(Date.now() / 1000) + timestampOffset;
  const timestamp = String(now);
  const rawBody = JSON.stringify(bodyObj);
  const bodyBuffer = Buffer.from(rawBody, 'utf8');
  const signature = crypto.createHmac('sha256', secret)
    .update(timestamp, 'ascii')
    .update('.', 'ascii')
    .update(bodyBuffer)
    .digest('hex');

  return {
    timestamp,
    signature,
    rawBody,
    headers: {
      'content-type': 'application/json',
      'x-vortext-timestamp': timestamp,
      'x-vortext-signature': signature
    }
  };
}

function samplePayload() {
  return {
    bot_id: process.env.VORTEX_BOT_ID || process.env.VORTEXT_BOT_ID || 'vortex-main',
    captured_at: new Date().toISOString(),
    account: {
      account_id: 'demo_12345678',
      login: 12345678,
      server: 'VantageMarkets-Demo',
      currency: 'USD',
      trade_mode: 'DEMO',
      balance: 10000.0,
      equity: 10000.0,
      margin: 0.0,
      free_margin: 10000.0,
      leverage: 100,
      enabled: true,
      trading_enabled: true
    },
    accounts: [{
      account_id: 'demo_12345678',
      login: 12345678,
      server: 'VantageMarkets-Demo',
      currency: 'USD',
      trade_mode: 'DEMO',
      balance: 10000.0,
      equity: 10000.0,
      margin: 0.0,
      free_margin: 10000.0,
      leverage: 100,
      enabled: true,
      trading_enabled: true
    }],
    positions: [],
    deals: []
  };
}

async function runBattery() {
  console.log('============================================================');
  console.log('   PHASE 1.5.1: HMAC ENVIRONMENT CANONICALIZATION BATTERY   ');
  console.log('============================================================\n');

  // Preserve global fetch
  const originalFetch = global.fetch;

  // Mock fetch to simulate successful Supabase RPC storage
  global.fetch = async (url, opts) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ accepted: true })
    };
  };

  try {
    // -------------------------------------------------------------------------
    // 1. CANONICAL VARIABLE ALONE WORKS (VORTEX_BOT_HMAC_SECRET)
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEX_BOT_HMAC_SECRET = SECRET_CANONICAL;
    const signed1 = buildSignedPayload(SECRET_CANONICAL, samplePayload());
    const res1 = createMockRes();
    await tradesHandler(createMockReq({ body: signed1.rawBody, headers: signed1.headers }), res1);
    report('1a. Canonical variable alone (VORTEX_BOT_HMAC_SECRET) accepts valid signature',
      res1.statusCode === 200 && res1.body && res1.body.ok === true,
      `Status: ${res1.statusCode}, Body: ${JSON.stringify(res1.body)}`);

    const signed1Wrong = buildSignedPayload(SECRET_LEGACY, samplePayload());
    const res1Wrong = createMockRes();
    await tradesHandler(createMockReq({ body: signed1Wrong.rawBody, headers: signed1Wrong.headers }), res1Wrong);
    report('1b. Canonical variable alone rejects mismatched signature (401)',
      res1Wrong.statusCode === 401,
      `Status: ${res1Wrong.statusCode}`);

    // -------------------------------------------------------------------------
    // 2. LEGACY VARIABLE ALONE WORKS (VORTEXT_BOT_HMAC_SECRET)
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEXT_BOT_HMAC_SECRET = SECRET_LEGACY;
    const signed2 = buildSignedPayload(SECRET_LEGACY, samplePayload());
    const res2 = createMockRes();
    await tradesHandler(createMockReq({ body: signed2.rawBody, headers: signed2.headers }), res2);
    report('2a. Legacy variable alone (VORTEXT_BOT_HMAC_SECRET) accepts valid signature',
      res2.statusCode === 200 && res2.body && res2.body.ok === true,
      `Status: ${res2.statusCode}, Body: ${JSON.stringify(res2.body)}`);

    const signed2Wrong = buildSignedPayload(SECRET_CANONICAL, samplePayload());
    const res2Wrong = createMockRes();
    await tradesHandler(createMockReq({ body: signed2Wrong.rawBody, headers: signed2Wrong.headers }), res2Wrong);
    report('2b. Legacy variable alone rejects mismatched signature (401)',
      res2Wrong.statusCode === 401,
      `Status: ${res2Wrong.statusCode}`);

    // -------------------------------------------------------------------------
    // 3. BOTH VARIABLES PRESENT: CANONICAL PRECEDENCE
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEX_BOT_HMAC_SECRET = SECRET_CANONICAL;
    process.env.VORTEXT_BOT_HMAC_SECRET = SECRET_LEGACY;

    // Request signed with canonical secret MUST succeed
    const signed3Canonical = buildSignedPayload(SECRET_CANONICAL, samplePayload());
    const res3Canonical = createMockRes();
    await tradesHandler(createMockReq({ body: signed3Canonical.rawBody, headers: signed3Canonical.headers }), res3Canonical);
    report('3a. Both variables present: Canonical secret signature accepted (200)',
      res3Canonical.statusCode === 200 && res3Canonical.body && res3Canonical.body.ok === true,
      `Status: ${res3Canonical.statusCode}`);

    // Request signed with legacy secret MUST be rejected (proving canonical precedence)
    const signed3Legacy = buildSignedPayload(SECRET_LEGACY, samplePayload());
    const res3Legacy = createMockRes();
    await tradesHandler(createMockReq({ body: signed3Legacy.rawBody, headers: signed3Legacy.headers }), res3Legacy);
    report('3b. Both variables present: Legacy secret signature rejected with 401 (precedence verified)',
      res3Legacy.statusCode === 401 && res3Legacy.body && res3Legacy.body.error === 'Invalid or expired bot signature',
      `Status: ${res3Legacy.statusCode}, Error: ${res3Legacy.body && res3Legacy.body.error}`);

    // -------------------------------------------------------------------------
    // 4. WHITESPACE CANONICAL FALLS BACK TO VALID LEGACY
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEX_BOT_HMAC_SECRET = '   ';
    process.env.VORTEXT_BOT_HMAC_SECRET = SECRET_LEGACY;

    const signed4 = buildSignedPayload(SECRET_LEGACY, samplePayload());
    const res4 = createMockRes();
    await tradesHandler(createMockReq({ body: signed4.rawBody, headers: signed4.headers }), res4);
    report('4. Whitespace canonical secret trims to empty and falls back to legacy (200)',
      res4.statusCode === 200 && res4.body && res4.body.ok === true,
      `Status: ${res4.statusCode}`);

    // -------------------------------------------------------------------------
    // 5. NEITHER VARIABLE PRESENT: FAILS CLOSED (503)
    // -------------------------------------------------------------------------
    resetEnv();
    const signed5 = buildSignedPayload(SECRET_CANONICAL, samplePayload());
    const res5 = createMockRes();
    await tradesHandler(createMockReq({ body: signed5.rawBody, headers: signed5.headers }), res5);
    report('5. Neither variable present: Fails closed with HTTP 503',
      res5.statusCode === 503 && res5.body && res5.body.error === 'Trade feed backend is not configured',
      `Status: ${res5.statusCode}, Error: ${res5.body && res5.body.error}`);

    // -------------------------------------------------------------------------
    // 6. INVALID OR SHORT SECRET: FAILS CLOSED (503)
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEX_BOT_HMAC_SECRET = SECRET_SHORT;
    const res6a = createMockRes();
    await tradesHandler(createMockReq({ body: '{}', headers: { 'content-type': 'application/json' } }), res6a);
    report('6a. Short canonical secret (< 32 chars): Fails closed with HTTP 503',
      res6a.statusCode === 503,
      `Status: ${res6a.statusCode}`);

    resetEnv();
    process.env.VORTEXT_BOT_HMAC_SECRET = SECRET_SHORT;
    const res6b = createMockRes();
    await tradesHandler(createMockReq({ body: '{}', headers: { 'content-type': 'application/json' } }), res6b);
    report('6b. Short legacy secret (< 32 chars): Fails closed with HTTP 503',
      res6b.statusCode === 503,
      `Status: ${res6b.statusCode}`);

    // -------------------------------------------------------------------------
    // 7. HMAC INTEGRITY & EDGE REJECTIONS REMAIN UNCHANGED
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEX_BOT_HMAC_SECRET = SECRET_CANONICAL;

    // 7a. Expired timestamp (> 300s skew)
    const signed7a = buildSignedPayload(SECRET_CANONICAL, samplePayload(), -305);
    const res7a = createMockRes();
    await tradesHandler(createMockReq({ body: signed7a.rawBody, headers: signed7a.headers }), res7a);
    report('7a. Clock skew > 300s in past rejected with HTTP 401',
      res7a.statusCode === 401,
      `Status: ${res7a.statusCode}`);

    // 7b. Future timestamp (> 300s skew)
    const signed7b = buildSignedPayload(SECRET_CANONICAL, samplePayload(), +305);
    const res7b = createMockRes();
    await tradesHandler(createMockReq({ body: signed7b.rawBody, headers: signed7b.headers }), res7b);
    report('7b. Future timestamp > 300s rejected with HTTP 401',
      res7b.statusCode === 401,
      `Status: ${res7b.statusCode}`);

    // 7c. Tampered payload
    const signed7c = buildSignedPayload(SECRET_CANONICAL, samplePayload());
    const tamperedBody = signed7c.rawBody.replace('demo_12345678', 'demo_99999999');
    const res7c = createMockRes();
    await tradesHandler(createMockReq({ body: tamperedBody, headers: signed7c.headers }), res7c);
    report('7c. Tampered body bytes rejected with HTTP 401',
      res7c.statusCode === 401,
      `Status: ${res7c.statusCode}`);

    // 7d. Tampered signature
    const signed7d = buildSignedPayload(SECRET_CANONICAL, samplePayload());
    const tamperedHeaders = Object.assign({}, signed7d.headers, {
      'x-vortext-signature': signed7d.signature.slice(0, -4) + '0000'
    });
    const res7d = createMockRes();
    await tradesHandler(createMockReq({ body: signed7d.rawBody, headers: tamperedHeaders }), res7d);
    report('7d. Tampered signature bytes rejected with HTTP 401',
      res7d.statusCode === 401,
      `Status: ${res7d.statusCode}`);

    // 7e. Missing timestamp header
    const signed7e = buildSignedPayload(SECRET_CANONICAL, samplePayload());
    const headers7e = {
      'content-type': 'application/json',
      'x-vortext-signature': signed7e.signature
    };
    const res7e = createMockRes();
    await tradesHandler(createMockReq({ body: signed7e.rawBody, headers: headers7e }), res7e);
    report('7e. Missing x-vortext-timestamp header rejected with HTTP 401',
      res7e.statusCode === 401,
      `Status: ${res7e.statusCode}`);

    // 7f. Missing signature header
    const headers7f = {
      'content-type': 'application/json',
      'x-vortext-timestamp': signed7e.timestamp
    };
    const res7f = createMockRes();
    await tradesHandler(createMockReq({ body: signed7e.rawBody, headers: headers7f }), res7f);
    report('7f. Missing x-vortext-signature header rejected with HTTP 401',
      res7f.statusCode === 401,
      `Status: ${res7f.statusCode}`);

    // 7g. Wrong Content-Type
    const res7g = createMockRes();
    await tradesHandler(createMockReq({ body: signed7e.rawBody, headers: { 'content-type': 'text/plain' } }), res7g);
    report('7g. Non-JSON Content-Type rejected with HTTP 415',
      res7g.statusCode === 415,
      `Status: ${res7g.statusCode}`);

    // -------------------------------------------------------------------------
    // 8. ZERO SECRET LEAKAGE
    // -------------------------------------------------------------------------
    const allResponses = [res1, res1Wrong, res2, res2Wrong, res3Canonical, res3Legacy, res4, res5, res6a, res6b, res7a, res7b, res7c, res7d, res7e, res7f, res7g];
    let leaked = false;
    for (const r of allResponses) {
      const bodyStr = JSON.stringify(r.body || {});
      const headerStr = JSON.stringify(r.headers || {});
      if (bodyStr.includes(SECRET_CANONICAL) || bodyStr.includes(SECRET_LEGACY) ||
          headerStr.includes(SECRET_CANONICAL) || headerStr.includes(SECRET_LEGACY)) {
        leaked = true;
        break;
      }
    }
    report('8. Secret containment: Zero HMAC secrets exposed in response bodies or headers', !leaked);

  } finally {
    global.fetch = originalFetch;
    resetEnv();
  }

  console.log('\n------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBattery().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
