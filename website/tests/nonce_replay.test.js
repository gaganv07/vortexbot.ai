const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

function makeReq(method, url, headers, bodyObj) {
  const raw = bodyObj ? Buffer.from(JSON.stringify(bodyObj), 'utf8') : Buffer.alloc(0);
  const stream = Readable.from(raw.length ? [raw] : []);
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  return { req: stream, raw };
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(chunk) { this.body = chunk || ''; }
  };
}

function samplePayload(offsetMs = 0) {
  return {
    bot_id: 'vortex-main',
    captured_at: new Date(Date.now() + offsetMs).toISOString(),
    account: { server: 'Demo', currency: 'USD', balance: 1000, equity: 1000, margin: 0, free_margin: 1000, leverage: 100, trade_mode: 'DEMO' },
    positions: [],
    deals: []
  };
}

function sign(secret, ts, payload) {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');
  return crypto.createHmac('sha256', secret).update(ts).update('.').update(raw).digest('hex');
}

test('trades.js enforces shared atomic nonce replay protection across instances, concurrency, and DB outage', async () => {
  const prev = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    VORTEX_BOT_HMAC_SECRET: process.env.VORTEX_BOT_HMAC_SECRET,
    VORTEX_BOT_ID: process.env.VORTEX_BOT_ID,
    VORTEX_REQUIRE_NONCE: process.env.VORTEX_REQUIRE_NONCE
  };
  const origFetch = global.fetch;

  process.env.VERCEL_ENV = 'preview';
  process.env.SUPABASE_URL = 'https://xtyszeuvtfcgognkrwxv.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_key_123456';
  process.env.VORTEX_BOT_HMAC_SECRET = '0123456789abcdef0123456789abcdef';
  process.env.VORTEX_BOT_ID = 'vortex-main';
  process.env.VORTEX_REQUIRE_NONCE = 'true';

  // Shared isolated database state simulating PostgreSQL primary key (bot_id, nonce)
  const sharedNonceStore = new Set();
  let lastCapturedAt = null;
  let dbDown = false;
  let snapshotWrites = 0;

  global.fetch = async (url, opts) => {
    if (dbDown) throw new Error('ECONNREFUSED');
    const body = JSON.parse(opts.body);
    if (String(url).endsWith('/rpc/consume_vortex_ingest_nonce')) {
      const key = `${body.p_bot_id}:${body.p_nonce}`;
      if (sharedNonceStore.has(key)) {
        return { ok: true, status: 200, json: async () => ({ accepted: false }) };
      }
      sharedNonceStore.add(key);
      return { ok: true, status: 200, json: async () => ({ accepted: true }) };
    }
    if (String(url).endsWith('/rpc/upsert_vortext_multi_account_snapshot')) {
      if (lastCapturedAt !== null && new Date(body.p_captured_at) <= new Date(lastCapturedAt)) {
        return { ok: true, status: 200, json: async () => [{ accepted: false }] };
      }
      lastCapturedAt = body.p_captured_at;
      snapshotWrites++;
      return { ok: true, status: 200, json: async () => [{ accepted: true }] };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  try {
    const handlerA = require('../api/trades');
    const ts = String(Math.floor(Date.now() / 1000));
    const payload = samplePayload();
    const sig = sign(process.env.VORTEX_BOT_HMAC_SECRET, ts, payload);

    // 1. Missing nonce when VORTEX_REQUIRE_NONCE=true -> 400
    const rMissing = makeRes();
    await handlerA(makeReq('POST', '/api/trades', {
      'content-type': 'application/json',
      'x-vortext-timestamp': ts,
      'x-vortext-signature': sig
    }, payload).req, rMissing);
    assert.equal(rMissing.statusCode, 400);

    // 2. 20 simultaneous requests with same nonce -> exactly 1x 200, 19x 409, 1 DB write
    const concNonce = 'nonce-conc-' + crypto.randomBytes(6).toString('hex');
    const concResults = await Promise.all(Array.from({ length: 20 }, async () => {
      const res = makeRes();
      await handlerA(makeReq('POST', '/api/trades', {
        'content-type': 'application/json',
        'x-vortext-timestamp': ts,
        'x-vortext-signature': sig,
        'x-vortex-nonce': concNonce
      }, payload).req, res);
      return res.statusCode;
    }));
    assert.equal(concResults.filter((c) => c === 200).length, 1);
    assert.equal(concResults.filter((c) => c === 409).length, 19);
    assert.equal(snapshotWrites, 1);

    // 3. Simulated second independent serverless instance / module reload -> 409 (NOT 200!)
    delete require.cache[require.resolve('../api/trades')];
    const handlerB = require('../api/trades');
    const rSecond = makeRes();
    await handlerB(makeReq('POST', '/api/trades', {
      'content-type': 'application/json',
      'x-vortext-timestamp': ts,
      'x-vortext-signature': sig,
      'x-vortex-nonce': concNonce
    }, payload).req, rSecond);
    assert.equal(rSecond.statusCode, 409);

    // 4. Database unavailable -> fail closed with 503
    dbDown = true;
    const rDown = makeRes();
    await handlerB(makeReq('POST', '/api/trades', {
      'content-type': 'application/json',
      'x-vortext-timestamp': ts,
      'x-vortext-signature': sig,
      'x-vortex-nonce': 'nonce-down-' + crypto.randomBytes(6).toString('hex')
    }, payload).req, rDown);
    assert.equal(rDown.statusCode, 503);
    dbDown = false;

    // 5. Out-of-order snapshot -> 409
    const oldPayload = samplePayload(-10000);
    const oldSig = sign(process.env.VORTEX_BOT_HMAC_SECRET, ts, oldPayload);
    const rOld = makeRes();
    await handlerB(makeReq('POST', '/api/trades', {
      'content-type': 'application/json',
      'x-vortext-timestamp': ts,
      'x-vortext-signature': oldSig,
      'x-vortex-nonce': 'nonce-old-' + crypto.randomBytes(6).toString('hex')
    }, oldPayload).req, rOld);
    assert.equal(rOld.statusCode, 409);
  } finally {
    global.fetch = origFetch;
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
