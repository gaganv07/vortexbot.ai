/**
 * website/tests/research_and_dashboard_integration.test.js
 * VORTEX AI — Research & Dashboard Architectural Integration Test Battery
 * Verifies non-destructive separation between MT5 Live Dashboard and Research Console,
 * Vercel rewrites, cross-dashboard navigation links, and server-side authorization.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WEBSITE_DIR = path.join(__dirname, '..');
const DASHBOARD_HTML = path.join(WEBSITE_DIR, 'dashboard.html');
const RESEARCH_HTML = path.join(WEBSITE_DIR, 'research.html');
const ACCOUNT_HTML = path.join(WEBSITE_DIR, 'account.html');
const INDEX_HTML = path.join(WEBSITE_DIR, 'index.html');
const LOGIN_HTML = path.join(WEBSITE_DIR, 'login.html');
const VERCEL_JSON = path.join(WEBSITE_DIR, 'vercel.json');
const ANALYTICS_API = path.join(WEBSITE_DIR, 'api', 'v1', 'analytics.js');

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
console.log('  VORTEX AI — RESEARCH & DASHBOARD INTEGRATION VERIFICATION ');
console.log('============================================================\n');

// 1. Separate Dashboard Artifact Invariant
try {
  assert(fs.existsSync(DASHBOARD_HTML), 'dashboard.html must exist');
  assert(fs.existsSync(RESEARCH_HTML), 'research.html must exist');
  const dashContent = fs.readFileSync(DASHBOARD_HTML, 'utf8');
  const resContent = fs.readFileSync(RESEARCH_HTML, 'utf8');

  // Verify dashboard.html retains original MT5 live dashboard behavior
  assert(dashContent.includes('Private trading dashboard'), 'dashboard.html must be MT5 private trading dashboard');
  assert(dashContent.includes('id="metric-positions"'), 'dashboard.html must contain MT5 open positions metric');
  assert(dashContent.includes('/api/trades'), 'dashboard.html must fetch /api/trades for MT5 telemetry');
  assert(!dashContent.includes('tab-regimes'), 'dashboard.html must NOT be overwritten by research panes');
  report('Architecture: dashboard.html preserved as MT5 live read-only dashboard', true);

  // Verify research.html contains the full 9-pane Research & Analytics console
  assert(resContent.includes('Trading Research & Analytics Platform'), 'research.html title must identify Research Platform');
  assert(resContent.includes('id="tab-overview"'), 'research.html must contain Overview pane');
  assert(resContent.includes('id="tab-regimes"'), 'research.html must contain Regimes pane');
  assert(resContent.includes('id="tab-volatility"'), 'research.html must contain Volatility pane');
  assert(resContent.includes('id="tab-sessions"'), 'research.html must contain Sessions pane');
  assert(resContent.includes('id="tab-mtf"'), 'research.html must contain Multi-Timeframe pane');
  assert(resContent.includes('id="tab-tca"'), 'research.html must contain TCA pane');
  assert(resContent.includes('id="tab-risk"'), 'research.html must contain Risk Calculator pane');
  assert(resContent.includes('id="tab-forensics"'), 'research.html must contain Historical Forensics pane');
  assert(resContent.includes('id="tab-quality"'), 'research.html must contain Data Quality pane');
  report('Architecture: research.html contains complete 9-pane quantitative console', true);
} catch (e) {
  report('Architecture: dashboard separation verification failed', false, e.message);
}

// 2. Cross-Dashboard Navigation & Discovery Links
try {
  const dashContent = fs.readFileSync(DASHBOARD_HTML, 'utf8');
  const resContent = fs.readFileSync(RESEARCH_HTML, 'utf8');
  const accContent = fs.readFileSync(ACCOUNT_HTML, 'utf8');
  const idxContent = fs.readFileSync(INDEX_HTML, 'utf8');
  const logContent = fs.readFileSync(LOGIN_HTML, 'utf8');

  assert(dashContent.includes('href="/research.html"') || dashContent.includes('href="/research"'),
    'dashboard.html must include link to research console');
  report('Navigation: dashboard.html links to Research Console', true);

  assert(resContent.includes('href="/dashboard.html"') || resContent.includes('href="/dashboard"'),
    'research.html must include link to MT5 live dashboard');
  report('Navigation: research.html links to MT5 live dashboard', true);

  assert(accContent.includes('href="/research.html"') || accContent.includes('href="/research"'),
    'account.html must include link to research console');
  report('Navigation: account.html links to Research Console', true);

  assert(idxContent.includes('href="/research.html"') || idxContent.includes('href="/research"'),
    'index.html must include link to research');
  report('Navigation: index.html links to Research Console', true);

  assert(logContent.includes('research.html') || logContent.includes('research'),
    'login.html must allow research.html in next parameter whitelist');
  report('Navigation: login.html permits redirection to Research Console', true);
} catch (e) {
  report('Navigation: link verification failed', false, e.message);
}

// 3. Vercel Configuration & Routing Rules
try {
  const vercelCfg = JSON.parse(fs.readFileSync(VERCEL_JSON, 'utf8'));
  const rewrites = vercelCfg.rewrites || [];
  const headers = vercelCfg.headers || [];

  const researchRewrite = rewrites.find(r => r.source === '/research');
  assert(researchRewrite && researchRewrite.destination === '/research.html',
    'vercel.json must rewrite /research to /research.html');
  report('Vercel Config: /research rewrites to /research.html', true);

  const dashRewrite = rewrites.find(r => r.source === '/dashboard');
  assert(dashRewrite && dashRewrite.destination === '/dashboard.html',
    'vercel.json must preserve /dashboard rewrite');
  report('Vercel Config: /dashboard rewrite preserved', true);

  const apiAnalyticsWildcard = rewrites.find(r => r.source.includes('/api/v1/analytics/:path'));
  assert(apiAnalyticsWildcard, 'vercel.json must rewrite /api/v1/analytics/:path*');
  report('Vercel Config: /api/v1/analytics/:path* rewrite configured', true);

  const apiAnalyticsBase = rewrites.find(r => r.source === '/api/v1/analytics');
  assert(apiAnalyticsBase, 'vercel.json must rewrite /api/v1/analytics');
  report('Vercel Config: /api/v1/analytics rewrite configured', true);

  const rootHeader = headers.find(h => h.source === '/(.*)');
  assert(rootHeader && rootHeader.headers.some(h => h.key === 'Content-Security-Policy'),
    'vercel.json must maintain CSP header');
  report('Vercel Config: Security headers and CSP preserved', true);

  const apiHeader = headers.find(h => h.source === '/api/(.*)');
  assert(apiHeader && apiHeader.headers.some(h => h.key === 'Cache-Control' && h.value.includes('no-store')),
    'vercel.json must enforce no-store on /api/(.*)');
  report('Vercel Config: API cache-control no-store enforced', true);
} catch (e) {
  report('Vercel Config: verification failed', false, e.message);
}

// 4. Server-Side Analytics Gateway Routing & Authorization
(async function() {
  try {
    const handler = require(ANALYTICS_API);

    // Test 1: Direct route resolution
    let mockRes1 = {
      statusCode: 0,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(body) { this.body = JSON.parse(body); }
    };
    await handler({ method: 'GET', url: '/api/v1/analytics/overview', headers: {} }, mockRes1);
    assert(mockRes1.statusCode === 401 || mockRes1.statusCode === 503,
      'Unauthenticated request must be rejected with 401 or 503');
    report('Gateway Auth: Unauthenticated direct request rejected fail-closed', true);

    // Test 2: Rewritten route resolution (/api/v1/analytics.js?route=volatility)
    let mockRes2 = {
      statusCode: 0,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(body) { this.body = JSON.parse(body); }
    };
    await handler({ method: 'GET', url: '/api/v1/analytics.js?route=volatility', headers: {} }, mockRes2);
    assert(mockRes2.statusCode === 401 || mockRes2.statusCode === 503,
      'Rewritten request must be rejected with 401 or 503');
    report('Gateway Auth: Unauthenticated rewritten request rejected fail-closed', true);

    // Test 3: Authenticated dispatch check
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = 'https://xtyszeuvtfcgognkrwxv.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'mock-anon-key-123456';
    process.env.SUPABASE_SECRET_KEY = 'mock-secret-key-123456';
    let mockRes3 = {
      statusCode: 0,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(body) { this.body = JSON.parse(body); }
    };
    await handler({ method: 'GET', url: '/api/v1/analytics.js?route=unknown_endpoint', headers: { authorization: 'Bearer invalid.mock.jwt' } }, mockRes3);
    assert(mockRes3.statusCode === 401, 'Invalid JWT token must return 401');
    report('Gateway Auth: Invalid JWT returns 401', true);

  } catch (e) {
    report('Gateway Auth: verification failed', false, e.message);
  }

  console.log('\n============================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
})();
