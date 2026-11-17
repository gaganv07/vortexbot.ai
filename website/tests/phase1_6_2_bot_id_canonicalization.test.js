/**
 * website/tests/phase1_6_2_bot_id_canonicalization.test.js
 *
 * VORTEX AI — Phase 1.6.2: Bot ID Canonicalization Test Battery
 *
 * Verifies:
 * 1. Canonical variable alone resolves to configured value or 'vortex-main'
 * 2. Legacy variable alone remains supported
 * 3. Both variables present: canonical takes precedence over legacy
 * 4. Neither variable present: fallback is 'vortex-main'
 * 5. Whitespace in variables is properly trimmed and handled
 * 6. Invalid bot IDs in payload or environment are rejected (403 / 503)
 * 7. Existing HMAC verification, clock-skew, and account validation remain unchanged
 * 8. Secret and credential containment verified
 */

'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

const tradesHandler = require('../api/trades');

const STAGING_URL = 'https://xtyszeuvtfcgognkrwxv.supabase.co';
const SECRET_HMAC = 'test_secret_key_32_characters_minimum_length_required!';

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
  process.env.VORTEX_BOT_HMAC_SECRET = SECRET_HMAC;
  delete process.env.VORTEXT_BOT_HMAC_SECRET;
  delete process.env.VORTEX_BOT_ID;
  delete process.env.VORTEXT_BOT_ID;
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

function samplePayload(botId = 'vortex-main') {
  return {
    bot_id: botId,
    captured_at: new Date().toISOString(),
    account: {
      account_id: 'account_003',
      login: 26179878,
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
      account_id: 'account_003',
      login: 26179878,
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
  console.log('   PHASE 1.6.2: BOT ID CANONICALIZATION TEST BATTERY        ');
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
    // 1. CANONICAL VARIABLE ALONE WORKS (VORTEX_BOT_ID)
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEX_BOT_ID = 'vortex-main';
    const signed1 = buildSignedPayload(SECRET_HMAC, samplePayload('vortex-main'));
    const res1 = createMockRes();
    await tradesHandler(createMockReq({ body: signed1.rawBody, headers: signed1.headers }), res1);
    report('1a. Canonical variable alone (VORTEX_BOT_ID=vortex-main) accepts matching payload',
      res1.statusCode === 200 && res1.body && res1.body.ok === true,
      `Status: ${res1.statusCode}, Body: ${JSON.stringify(res1.body)}`);

    // Mismatched bot ID must be rejected with 403
    const signed1Wrong = buildSignedPayload(SECRET_HMAC, samplePayload('other-bot-id'));
    const res1Wrong = createMockRes();
    await tradesHandler(createMockReq({ body: signed1Wrong.rawBody, headers: signed1Wrong.headers }), res1Wrong);
    report('1b. Canonical variable alone rejects mismatched bot ID with HTTP 403',
      res1Wrong.statusCode === 403 && res1Wrong.body && res1Wrong.body.error === 'Unknown bot ID',
      `Status: ${res1Wrong.statusCode}, Body: ${JSON.stringify(res1Wrong.body)}`);

    // Custom canonical bot ID
    resetEnv();
    process.env.VORTEX_BOT_ID = 'custom-vortex-bot-01';
    const signed1Custom = buildSignedPayload(SECRET_HMAC, samplePayload('custom-vortex-bot-01'));
    const res1Custom = createMockRes();
    await tradesHandler(createMockReq({ body: signed1Custom.rawBody, headers: signed1Custom.headers }), res1Custom);
    report('1c. Custom canonical bot ID (custom-vortex-bot-01) accepted when matched',
      res1Custom.statusCode === 200 && res1Custom.body && res1Custom.body.ok === true,
      `Status: ${res1Custom.statusCode}`);

    // -------------------------------------------------------------------------
    // 2. LEGACY VARIABLE ALONE REMAINS SUPPORTED (VORTEXT_BOT_ID)
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEXT_BOT_ID = 'vortext-legacy-bot';
    const signed2 = buildSignedPayload(SECRET_HMAC, samplePayload('vortext-legacy-bot'));
    const res2 = createMockRes();
    await tradesHandler(createMockReq({ body: signed2.rawBody, headers: signed2.headers }), res2);
    report('2a. Legacy variable alone (VORTEXT_BOT_ID=vortext-legacy-bot) accepts matching payload',
      res2.statusCode === 200 && res2.body && res2.body.ok === true,
      `Status: ${res2.statusCode}, Body: ${JSON.stringify(res2.body)}`);

    const signed2Wrong = buildSignedPayload(SECRET_HMAC, samplePayload('vortex-main'));
    const res2Wrong = createMockRes();
    await tradesHandler(createMockReq({ body: signed2Wrong.rawBody, headers: signed2Wrong.headers }), res2Wrong);
    report('2b. Legacy variable alone rejects non-matching bot ID with HTTP 403',
      res2Wrong.statusCode === 403 && res2Wrong.body && res2Wrong.body.error === 'Unknown bot ID',
      `Status: ${res2Wrong.statusCode}`);

    // -------------------------------------------------------------------------
    // 3. BOTH VARIABLES PRESENT: CANONICAL PRECEDENCE
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEX_BOT_ID = 'vortex-canonical-primary';
    process.env.VORTEXT_BOT_ID = 'vortext-legacy-secondary';

    // Canonical bot ID must be accepted
    const signed3Canonical = buildSignedPayload(SECRET_HMAC, samplePayload('vortex-canonical-primary'));
    const res3Canonical = createMockRes();
    await tradesHandler(createMockReq({ body: signed3Canonical.rawBody, headers: signed3Canonical.headers }), res3Canonical);
    report('3a. Both present: Canonical bot ID is accepted (HTTP 200)',
      res3Canonical.statusCode === 200 && res3Canonical.body && res3Canonical.body.ok === true,
      `Status: ${res3Canonical.statusCode}`);

    // Legacy bot ID must be rejected when canonical is configured
    const signed3Legacy = buildSignedPayload(SECRET_HMAC, samplePayload('vortext-legacy-secondary'));
    const res3Legacy = createMockRes();
    await tradesHandler(createMockReq({ body: signed3Legacy.rawBody, headers: signed3Legacy.headers }), res3Legacy);
    report('3b. Both present: Legacy bot ID is rejected with 403 (canonical precedence verified)',
      res3Legacy.statusCode === 403 && res3Legacy.body && res3Legacy.body.error === 'Unknown bot ID',
      `Status: ${res3Legacy.statusCode}`);

    // -------------------------------------------------------------------------
    // 4. NEITHER VARIABLE PRESENT: FALLBACK IS 'vortex-main'
    // -------------------------------------------------------------------------
    resetEnv();
    delete process.env.VORTEX_BOT_ID;
    delete process.env.VORTEXT_BOT_ID;

    // Default 'vortex-main' must be accepted
    const signed4Default = buildSignedPayload(SECRET_HMAC, samplePayload('vortex-main'));
    const res4Default = createMockRes();
    await tradesHandler(createMockReq({ body: signed4Default.rawBody, headers: signed4Default.headers }), res4Default);
    report("4a. Neither present: Fallback is 'vortex-main' (HTTP 200)",
      res4Default.statusCode === 200 && res4Default.body && res4Default.body.ok === true,
      `Status: ${res4Default.statusCode}`);

    // Former legacy default 'vortext-fleet' must be rejected
    const signed4OldDefault = buildSignedPayload(SECRET_HMAC, samplePayload('vortext-fleet'));
    const res4OldDefault = createMockRes();
    await tradesHandler(createMockReq({ body: signed4OldDefault.rawBody, headers: signed4OldDefault.headers }), res4OldDefault);
    report("4b. Neither present: Legacy default 'vortext-fleet' rejected with 403",
      res4OldDefault.statusCode === 403 && res4OldDefault.body && res4OldDefault.body.error === 'Unknown bot ID',
      `Status: ${res4OldDefault.statusCode}`);

    // -------------------------------------------------------------------------
    // 5. WHITESPACE TRIMMING & EMPTY VARIABLE HANDLING
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEX_BOT_ID = '   vortex-padded-bot   ';
    const signed5Padded = buildSignedPayload(SECRET_HMAC, samplePayload('vortex-padded-bot'));
    const res5Padded = createMockRes();
    await tradesHandler(createMockReq({ body: signed5Padded.rawBody, headers: signed5Padded.headers }), res5Padded);
    report('5a. Padded VORTEX_BOT_ID trims correctly and accepts trimmed bot ID',
      res5Padded.statusCode === 200 && res5Padded.body && res5Padded.body.ok === true,
      `Status: ${res5Padded.statusCode}`);

    // Whitespace canonical falls back to legacy
    resetEnv();
    process.env.VORTEX_BOT_ID = '   \t  \n  ';
    process.env.VORTEXT_BOT_ID = 'vortext-fallback-bot';
    const signed5Fallback = buildSignedPayload(SECRET_HMAC, samplePayload('vortext-fallback-bot'));
    const res5Fallback = createMockRes();
    await tradesHandler(createMockReq({ body: signed5Fallback.rawBody, headers: signed5Fallback.headers }), res5Fallback);
    report('5b. Pure whitespace VORTEX_BOT_ID falls back cleanly to VORTEXT_BOT_ID',
      res5Fallback.statusCode === 200 && res5Fallback.body && res5Fallback.body.ok === true,
      `Status: ${res5Fallback.statusCode}`);

    // Whitespace canonical and legacy falls back to 'vortex-main'
    resetEnv();
    process.env.VORTEX_BOT_ID = '   ';
    process.env.VORTEXT_BOT_ID = '   ';
    const signed5AllSpaces = buildSignedPayload(SECRET_HMAC, samplePayload('vortex-main'));
    const res5AllSpaces = createMockRes();
    await tradesHandler(createMockReq({ body: signed5AllSpaces.rawBody, headers: signed5AllSpaces.headers }), res5AllSpaces);
    report("5c. Both variables whitespace-only falls back to 'vortex-main'",
      res5AllSpaces.statusCode === 200 && res5AllSpaces.body && res5AllSpaces.body.ok === true,
      `Status: ${res5AllSpaces.statusCode}`);

    // -------------------------------------------------------------------------
    // 6. INVALID BOT IDS ARE REJECTED
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEX_BOT_ID = 'vortex-main';

    // Invalid characters in payload bot_id
    const signed6SpecialChars = buildSignedPayload(SECRET_HMAC, samplePayload('vortex@bot#invalid!'));
    const res6SpecialChars = createMockRes();
    await tradesHandler(createMockReq({ body: signed6SpecialChars.rawBody, headers: signed6SpecialChars.headers }), res6SpecialChars);
    report('6a. Payload bot ID with illegal characters rejected with 403',
      res6SpecialChars.statusCode === 403,
      `Status: ${res6SpecialChars.statusCode}`);

    // Empty bot_id in payload
    const signed6Empty = buildSignedPayload(SECRET_HMAC, samplePayload(''));
    const res6Empty = createMockRes();
    await tradesHandler(createMockReq({ body: signed6Empty.rawBody, headers: signed6Empty.headers }), res6Empty);
    report('6b. Empty payload bot ID rejected with 400 (Invalid field: bot_id)',
      res6Empty.statusCode === 400 && res6Empty.body && res6Empty.body.error === 'Invalid field: bot_id',
      `Status: ${res6Empty.statusCode}, Body: ${JSON.stringify(res6Empty.body)}`);

    // Oversized bot_id in payload (> 64 chars)
    const signed6Oversized = buildSignedPayload(SECRET_HMAC, samplePayload('a'.repeat(65)));
    const res6Oversized = createMockRes();
    await tradesHandler(createMockReq({ body: signed6Oversized.rawBody, headers: signed6Oversized.headers }), res6Oversized);
    report('6c. Oversized payload bot ID (> 64 chars) rejected with 400 (Invalid field: bot_id)',
      res6Oversized.statusCode === 400 && res6Oversized.body && res6Oversized.body.error === 'Invalid field: bot_id',
      `Status: ${res6Oversized.statusCode}, Body: ${JSON.stringify(res6Oversized.body)}`);

    // Configured invalid bot_id fails closed via readyForIngest (503)
    resetEnv();
    process.env.VORTEX_BOT_ID = 'invalid bot id with spaces!';
    const signed6ConfigInvalid = buildSignedPayload(SECRET_HMAC, samplePayload('invalid bot id with spaces!'));
    const res6ConfigInvalid = createMockRes();
    await tradesHandler(createMockReq({ body: signed6ConfigInvalid.rawBody, headers: signed6ConfigInvalid.headers }), res6ConfigInvalid);
    report('6d. Environment bot ID failing pattern guard triggers 503 (readyForIngest fails closed)',
      res6ConfigInvalid.statusCode === 503 && res6ConfigInvalid.body && res6ConfigInvalid.body.error === 'Trade feed backend is not configured',
      `Status: ${res6ConfigInvalid.statusCode}`);

    // -------------------------------------------------------------------------
    // 7. HMAC VERIFICATION & ACCOUNT VALIDATION INTEGRITY
    // -------------------------------------------------------------------------
    resetEnv();
    process.env.VORTEX_BOT_ID = 'vortex-main';

    // Mismatched signature rejected with 401
    const signed7BadSig = buildSignedPayload('wrong_secret_key_32_characters_minimum!', samplePayload('vortex-main'));
    const res7BadSig = createMockRes();
    await tradesHandler(createMockReq({ body: signed7BadSig.rawBody, headers: signed7BadSig.headers }), res7BadSig);
    report('7a. HMAC verification preserved: Mismatched signature rejected with 401',
      res7BadSig.statusCode === 401 && res7BadSig.body && res7BadSig.body.error === 'Invalid or expired bot signature',
      `Status: ${res7BadSig.statusCode}`);

    // Clock skew > 300s rejected with 401
    const signed7Skew = buildSignedPayload(SECRET_HMAC, samplePayload('vortex-main'), -305);
    const res7Skew = createMockRes();
    await tradesHandler(createMockReq({ body: signed7Skew.rawBody, headers: signed7Skew.headers }), res7Skew);
    report('7b. Clock skew check preserved: Expired timestamp rejected with 401',
      res7Skew.statusCode === 401,
      `Status: ${res7Skew.statusCode}`);

    // Duplicate account IDs rejected with 400
    const dupAccountsPayload = samplePayload('vortex-main');
    dupAccountsPayload.accounts.push({ ...dupAccountsPayload.accounts[0] });
    const signed7DupAcc = buildSignedPayload(SECRET_HMAC, dupAccountsPayload);
    const res7DupAcc = createMockRes();
    await tradesHandler(createMockReq({ body: signed7DupAcc.rawBody, headers: signed7DupAcc.headers }), res7DupAcc);
    report('7c. Account validation preserved: Duplicate account ID rejected with 400',
      res7DupAcc.statusCode === 400 && res7DupAcc.body && res7DupAcc.body.error === 'Invalid or duplicate account ID',
      `Status: ${res7DupAcc.statusCode}`);

    // -------------------------------------------------------------------------
    // 8. DATA LEAKAGE & CONTAINMENT CHECK
    // -------------------------------------------------------------------------
    const resList = [res1, res1Wrong, res2, res3Canonical, res3Legacy, res4Default, res6ConfigInvalid];
    let leakDetected = false;
    for (const r of resList) {
      const serialized = JSON.stringify(r.body || {}) + JSON.stringify(r.headers || {});
      if (serialized.includes(SECRET_HMAC) || serialized.includes('mock_secret_key_for_testing')) {
        leakDetected = true;
      }
    }
    report('8. Secret containment: Zero secrets or keys leaked in responses or headers',
      !leakDetected,
      'No sensitive data leaked');

  } finally {
    global.fetch = originalFetch;
  }

  console.log('\n------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBattery().catch(err => {
  console.error('Fatal test battery error:', err);
  process.exit(1);
});
