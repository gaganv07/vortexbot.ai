# VORTEX AI — Preview Deployment Readiness Assessment
**Repository:** `https://github.com/gaganv07/vortexbot.ai`  
**Target Branch:** `feature/research-analytics-dashboard`  
**Base Branch:** `main`  
**Target Hosting Environment:** Vercel (Project: `vortexbot-ai`, Root: `website`)  
**Date:** November 13, 2026  
**Auditor:** Antigravity Autonomous Integration Agent  
**Overall Readiness Verdict:** **APPROVED FOR VERCEL PREVIEW DEPLOYMENT (PULL REQUEST READY)**

---

## 1. Readiness Assessment Matrix

| Gate # | Evaluation Category | Standard / Requirement | Observed Status | Verdict |
| :-: | :--- | :--- | :--- | :---: |
| **G-01** | **Git Branching Policy** | Work strictly on feature branch; never push or commit to `main`. | Checked out on `feature/research-analytics-dashboard` tracking `origin/main`. Zero modifications to `main`. | **PASS** |
| **G-02** | **Production Isolation** | Production repository `BOT 4 ALL 7 PAIRS AD level` remains untouched. | Exactly 7,596 files preserved. 0 modifications. | **PASS** |
| **G-03** | **Dual Dashboard Coexistence** | Both `/dashboard` (MT5 live) and `/research` (Research platform) exist independently without collisions. | Both HTML artifacts present, clean rewrites configured, mutual cross-links operational. | **PASS** |
| **G-04** | **Serverless Function API** | `/api/v1/analytics/*` conforms to Vercel Serverless Function specification. | `api/v1/analytics.js` exports standard `handler(req, res)` with query param and path route dispatch. | **PASS** |
| **G-05** | **Server-Side Authorization** | Every analytics endpoint mandates Bearer JWT authentication; fail-closed. | 9/9 endpoints reject unauthenticated requests with HTTP 401; unconfigured requests return 503. | **PASS** |
| **G-06** | **Zero Secrets Exposure** | Zero service-role keys, database URLs, or operator secrets in client files or responses. | Verified by automated AST and string inspection in `sprint2` and `sprint3` suites. | **PASS** |
| **G-07** | **Fixed Risk Policy Governance** | Immutable $200 equity baseline, $5.00 per-trade ceiling, 0.01 lot step, minimum-lot rejection. | Hardcoded in API risk engine and client calculator; verified by test battery. | **PASS** |
| **G-08** | **Data Provenance & Disclosures** | Truthful labeling: Major FX = `VERIFIED`, Indices = `PROXY_ONLY`. CFTC 4.41 full statutory disclaimer. | Conspicuous disclaimers on overview, TCA, and historical forensics panes. | **PASS** |
| **G-09** | **Mobile Responsiveness** | Touch gestures, responsive tables, horizontal scroll tabs, focus visibility. | Verified by 24/24 usability tests; ARIA accessibility attributes validated. | **PASS** |
| **G-10** | **Test Battery Pass Rate** | 100% of integration, gateway, dashboard, and regression tests must pass. | **146 / 146 Tests Passed (0 Failed).** | **PASS** |

---

## 2. Vercel Configuration & Environment Compatibility

### File: `website/vercel.json`
- **Clean URLs & Headers:**
  - `cleanUrls: true` (handles clean route resolution)
  - `Content-Security-Policy`: Strictly limits script origins to `'self'`, `'unsafe-inline'`, and `https://cdn.jsdelivr.net`.
  - `Cache-Control: no-store, max-age=0` applied across all `/api/(.*)` endpoints to guarantee zero intermediate caching of sensitive user telemetry or quantitative metrics.
- **Rewrites Configured:**
  - `/research` $\to$ `/research.html`
  - `/api/v1/analytics/:path*` $\to$ `/api/v1/analytics.js?route=:path*`
  - `/api/v1/analytics` $\to$ `/api/v1/analytics.js`
  - Preserved: `/dashboard`, `/login`, `/account`, `/pricing`, `/faq`, `/contact`, `/privacy`, `/terms`.

### Environment Variables Required in Vercel Project
For preview deployments on Vercel, the following environment variables must be populated in the Vercel Project Settings:

| Environment Variable | Target Value | Visibility | Purpose |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Server & Edge | Project API base URL for user verification |
| `SUPABASE_PUBLISHABLE_KEY` | `eyJ...` (anon key) | Server & Edge | Public API key forwarded via `/api/auth-config` |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | `eyJ...` (service role) | **Server Only (Encrypted)** | Operator status lookup in `vortex_authorized_operators` |

---

## 3. Operational Safety Boundaries

Prior to opening the pull request, the following operational boundaries remain strictly enforced:
- **Broker Connectivity:** Permanently disconnected during preview deployment.
- **Order Execution:** Hard disarmed (`arm_is_armed=False`). Zero orders may be transmitted.
- **ML Inference Mode:** Shadow only. Zero weights promoted to live execution.
- **Customer Onboarding:** Strictly disabled. All pre-launch terms state demonstration and research evaluation only.

---

## 4. Pull Request Instructions

1. **Feature Branch:** `feature/research-analytics-dashboard`
2. **Base Branch:** `main`
3. **Title:** `feat: integrate research & analytics dashboard as separate authenticated console`
4. **Description:**
   - Integrates the 9-pane Research & Analytics dashboard at `/research` (`website/research.html`).
   - Implements the 9-endpoint serverless REST gateway under `/api/v1/analytics/*`.
   - Preserves existing MT5 live read-only dashboard at `/dashboard` (`website/dashboard.html`).
   - Adds seamless cross-linking between dashboards in header navigation, mobile drawers, and profile settings.
   - Updates `vercel.json` with clean rewrites and `no-store` API caching.
   - Zero regressions confirmed across 146 automated tests.
5. **Merge Invariant:**
   - **DO NOT MERGE AUTOMATICALLY.** Create the PR for code review and automated Vercel preview generation. Production deployment is strictly deferred.
