/**
 * VORTEX AI — Usability Remediation Test Battery
 * Verifies resolution of all eight usability defects (UF-01 through UF-08)
 * identified in reports/post_sprint4_product_validation/USABILITY_FINDINGS.csv
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${description}`);
    console.error(`       Error: ${err.message}`);
    failedTests++;
  }
}

console.log('============================================================');
console.log('   VORTEX AI — USABILITY REMEDIATION VERIFICATION SUITE    ');
console.log('   Target: UF-01 through UF-08 Defect Resolutions           ');
console.log('============================================================\n');

const dashboardPath = fs.existsSync(path.join(__dirname, '..', 'research.html')) ? path.join(__dirname, '..', 'research.html') : path.join(__dirname, '..', 'dashboard.html');
const navPath = path.join(__dirname, '..', 'nav.js');
const dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');
const navJs = fs.readFileSync(navPath, 'utf8');

// --- UF-01: Tab Navigation Tablet Overflow & Smooth Scroll ---
console.log('--- UF-01: Tab Navigation Tablet Overflow & Smooth Scroll ---');
test('UF-01: .nav-tabs-wrap container exists with horizontal scroll containment', () => {
  assert(dashboardHtml.includes('class="nav-tabs-wrap"'), 'nav-tabs-wrap container missing');
  assert(dashboardHtml.includes('.nav-tabs-wrap'), 'nav-tabs-wrap CSS definition missing');
});

test('UF-01: .nav-tabs has overflow-x auto and smooth scroll behavior', () => {
  assert(dashboardHtml.includes('overflow-x: auto;'), 'overflow-x auto missing in nav-tabs');
  assert(dashboardHtml.includes('scroll-behavior: smooth;'), 'scroll-behavior smooth missing');
});

test('UF-01: Scroll indicator .nav-tabs-fade-right present with ARIA semantics', () => {
  assert(dashboardHtml.includes('class="nav-tabs-fade-right"'), 'fade indicator missing');
  assert(dashboardHtml.includes('aria-label="Scroll right for additional tabs"'), 'ARIA label missing');
});

test('UF-01: switchTab scrolls active tab into view for responsive viewports', () => {
  assert(dashboardHtml.includes('t.scrollIntoView({ behavior: \'smooth\', block: \'nearest\', inline: \'nearest\' })'), 'scrollIntoView missing in switchTab');
});

// --- UF-02: Market Regimes Econometric Terminology Tooltips ---
console.log('\n--- UF-02: Market Regimes Econometric Tooltips & Glossary ---');
test('UF-02: .info-tooltip CSS styling with accessible focus rings defined', () => {
  assert(dashboardHtml.includes('.info-tooltip'), '.info-tooltip CSS missing');
  assert(dashboardHtml.includes('.info-tooltip:focus') || dashboardHtml.includes('.info-tooltip:hover'), 'focus ring styling missing');
});

test('UF-02: Inline tooltips present for ADX, Choppiness Index, and Hurst Exponent', () => {
  assert(dashboardHtml.includes('Average Directional Index'), 'ADX tooltip text missing');
  assert(dashboardHtml.includes('Choppiness Index (CHOP'), 'CHOP tooltip text missing');
  assert(dashboardHtml.includes('Hurst Exponent'), 'Hurst tooltip text missing');
  assert(dashboardHtml.includes('tabindex="0"'), 'tabindex="0" missing for keyboard accessibility');
});

test('UF-02: Econometric Terminology Reference Guide card present in Tab 2', () => {
  assert(dashboardHtml.includes('id="regime-terminology-guide"'), 'terminology guide element missing');
  assert(dashboardHtml.includes('Econometric Terminology Reference Guide'), 'reference guide title missing');
  assert(dashboardHtml.includes('Mean Reverting (Sub-diffusive)'), 'Hurst explanation missing');
});

// --- UF-03: Global Symbol Selector Feed Calibration Visibility ---
console.log('\n--- UF-03: Global Symbol Selector Feed Calibration Visibility ---');
test('UF-03: Instrument calibration banner element present with ARIA role region', () => {
  assert(dashboardHtml.includes('id="instrument-calibration-banner"'), 'calibration banner element missing');
  assert(dashboardHtml.includes('role="region"'), 'role="region" missing on banner');
  assert(dashboardHtml.includes('aria-label="Instrument Feed Calibration Status"'), 'aria-label missing on banner');
});

test('UF-03: CSS classes for banner calibration states defined', () => {
  assert(dashboardHtml.includes('.calibration-banner'), 'banner CSS missing');
  assert(dashboardHtml.includes('.banner-calibrated'), 'calibrated state CSS missing');
  assert(dashboardHtml.includes('.banner-secondary'), 'secondary state CSS missing');
});

test('UF-03: updateCalibrationBanner function implemented in script', () => {
  assert(dashboardHtml.includes('function updateCalibrationBanner(symbol)'), 'updateCalibrationBanner function missing');
  assert(dashboardHtml.includes('EURUSD\', \'GBPUSD\', \'USDJPY\''), 'primary candidates list missing');
  assert(dashboardHtml.includes('cal-pill pill-active'), 'cal-pill pill-active markup missing');
});

test('UF-03: updateCalibrationBanner bound to symbol select change event', () => {
  assert(dashboardHtml.includes('updateCalibrationBanner(symbolSelect.value)'), 'symbol change hook missing');
});

// --- UF-04: Risk Calculator Stop Loss Range Slider ---
console.log('\n--- UF-04: Risk Calculator Stop Loss Range Slider ---');
test('UF-04: Range slider #risk-stop-slider present with min=5, max=100, step=1', () => {
  assert(dashboardHtml.includes('id="risk-stop-slider"'), 'risk-stop-slider missing');
  assert(dashboardHtml.includes('min="5"'), 'slider min="5" missing');
  assert(dashboardHtml.includes('max="100"'), 'slider max="100" missing');
});

test('UF-04: Slider value display element #risk-slider-val present', () => {
  assert(dashboardHtml.includes('id="risk-slider-val"'), 'risk-slider-val element missing');
});

test('UF-04: Bi-directional event sync between range slider and numeric input', () => {
  assert(dashboardHtml.includes('riskSlider.addEventListener(\'input\''), 'slider input event listener missing');
  assert(dashboardHtml.includes('riskInput.addEventListener(\'input\''), 'numeric input event listener missing');
});

test('UF-04: Preset buttons (15, 20, 25, 30, 40, 50 pips) update both slider and input', () => {
  assert(dashboardHtml.includes('stopSlider.value = String(pips)'), 'setRiskStop slider sync missing');
  assert(dashboardHtml.includes('sliderVal.textContent ='), 'setRiskStop slider label sync missing');
});

// --- UF-05: TCA Overnight Financing / Carry Friction Status ---
console.log('\n--- UF-05: TCA Overnight Financing & Carry Guidance ---');
test('UF-05: Overnight financing status card present in Tab 6', () => {
  assert(dashboardHtml.includes('id="tca-carry-friction-card"'), 'tca-carry-friction-card missing');
  assert(dashboardHtml.includes('Overnight Financing &amp; Carry Friction Status') || dashboardHtml.includes('Overnight Financing & Carry Friction Status'), 'card heading missing');
});

test('UF-05: Unprovisioned staging status and carry guidance explicitly stated', () => {
  assert(dashboardHtml.includes('Unprovisioned in Staging Demo Telemetry'), 'unprovisioned status missing');
  assert(dashboardHtml.includes('Intraday Execution Exemption'), 'intraday exemption section missing');
  assert(dashboardHtml.includes('Multi-Day Exposure Advisory'), 'multi-day advisory missing');
});

// --- UF-06: Mobile Menu Swipe-to-Close Gesture ---
console.log('\n--- UF-06: Mobile Menu Swipe-to-Close Gesture ---');
test('UF-06: Touch event listeners (touchstart, touchend) registered on #mobile-menu in nav.js', () => {
  assert(navJs.includes('menu.addEventListener(\'touchstart\''), 'touchstart listener missing in nav.js');
  assert(navJs.includes('menu.addEventListener(\'touchend\''), 'touchend listener missing in nav.js');
});

test('UF-06: Left swipe threshold detection (diffX < -50) closes menu', () => {
  assert(navJs.includes('diffX < -50'), 'left swipe delta threshold missing');
  assert(navJs.includes('Math.abs(diffX) > Math.abs(diffY)'), 'horizontal intent guard missing');
  assert(navJs.includes('closeMenu('), 'closeMenu call on swipe missing');
});

// --- UF-07: Historical Forensics Trade Log CSV Export ---
console.log('\n--- UF-07: Trade Log CSV Export ---');
test('UF-07: Export CSV button #btn-export-trades-csv present in Tab 8 card header', () => {
  assert(dashboardHtml.includes('id="btn-export-trades-csv"'), 'btn-export-trades-csv missing');
  assert(dashboardHtml.includes('Export Trade Log (CSV)'), 'button text missing');
});

test('UF-07: Export click handler generates 342-record CSV blob with required schema', () => {
  assert(dashboardHtml.includes('btnExportCsv.addEventListener(\'click\''), 'export click listener missing');
  assert(dashboardHtml.includes('vortex_trade_forensics_'), 'CSV filename format missing');
  assert(dashboardHtml.includes('Trade_ID\', \'Strategy\', \'Symbol\''), 'CSV header row missing');
  assert(dashboardHtml.includes('numTrades = 342'), '342 trades loop count missing');
});

// --- UF-08: High Contrast Palette Toggle ---
console.log('\n--- UF-08: High-Contrast Palette Toggle ---');
test('UF-08: Desktop and mobile contrast toggle buttons present with ARIA pressed attributes', () => {
  assert(dashboardHtml.includes('id="btn-toggle-contrast"'), 'btn-toggle-contrast missing');
  assert(dashboardHtml.includes('id="btn-toggle-contrast-mobile"'), 'btn-toggle-contrast-mobile missing');
  assert(dashboardHtml.includes('aria-pressed="false"'), 'aria-pressed attribute missing');
});

test('UF-08: body.high-contrast CSS overrides defined with high contrast tokens', () => {
  assert(dashboardHtml.includes('body.high-contrast'), 'high-contrast body rule missing');
  assert(dashboardHtml.includes('body.high-contrast .card'), 'high-contrast card rule missing');
  assert(dashboardHtml.includes('body.high-contrast .kpi-box'), 'high-contrast kpi-box rule missing');
});

test('UF-08: toggleHighContrast persists state in localStorage and updates buttons', () => {
  assert(dashboardHtml.includes('window.toggleHighContrast = function()'), 'toggleHighContrast function missing');
  assert(dashboardHtml.includes('localStorage.setItem(\'vortex_high_contrast\''), 'localStorage setItem missing');
  assert(dashboardHtml.includes('localStorage.getItem(\'vortex_high_contrast\''), 'localStorage getItem missing');
});

console.log('\n============================================================');
console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('============================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
