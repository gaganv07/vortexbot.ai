# VORTEX AI — Route and Authorization Matrix
**Scope:** Vercel Preview Branch (`feature/research-analytics-dashboard`)  
**Deployment Platform:** Vercel Serverless & Static Edge  
**Authentication Authority:** Supabase Auth (Strictly Fail-Closed)  
**Security Posture:** Bearer Token Enforcement, Zero Credentials Leakage, No-Store Caching  
**Date:** November 13, 2026

---

## 1. Complete Route Specification & Access Control Matrix

| Route Path | HTTP Methods | Auth Required | Expected Token / Credential | Target Role / Scope | Serverless Handler / Destination | Cache-Control Header | Fail-Closed Error |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `/` | `GET` | No | None | Public | `/index.html` | Public edge default | — |
| `/login` | `GET` | No | None | Public | `/login.html` | Public edge default | Whitelists `next` param |
| `/dashboard` | `GET` | **Yes** (Client-side) | Supabase Session | Authenticated User | `/dashboard.html` | Public edge default | Redirect to `/login.html?next=dashboard.html` |
| `/research` | `GET` | **Yes** (Client-side) | Supabase Session | Authenticated User | `/research.html` | Public edge default | Redirect to `/login.html?next=research.html` |
| `/account` | `GET` | **Yes** (Client-side) | Supabase Session | Authenticated User | `/account.html` | Public edge default | Redirect to `/login.html?next=account.html` |
| `/getting-started` | `GET` | No | None | Public | `/getting-started.html` | Public edge default | — |
| `/pricing` | `GET` | No | None | Public | `/pricing.html` | Public edge default | — |
| `/faq` | `GET` | No | None | Public | `/faq.html` | Public edge default | — |
| `/contact` | `GET` | No | None | Public | `/contact.html` | Public edge default | — |
| `/privacy` | `GET` | No | None | Public | `/privacy.html` | Public edge default | — |
| `/terms` | `GET` | No | None | Public | `/terms.html` | Public edge default | — |
| `/api/auth-config` | `GET` | No | None | Public Browser Client | `/api/auth-config.js` | `no-store, max-age=0` | `503 Service Unavailable` if unconfigured |
| `/api/trades` | `GET` | **Yes** (Server-side) | Supabase Bearer JWT | Authenticated Operator | `/api/trades.js` | `no-store, max-age=0` | `401 Unauthorized` / `503 Unconfigured` |
| `/api/v1/analytics` | `GET` | **Yes** (Server-side) | Supabase Bearer JWT | Authenticated Operator | `/api/v1/analytics.js` | `no-store, no-cache, private` | `401 Unauthorized` / `503 Unconfigured` |
| `/api/v1/analytics/overview` | `GET` | **Yes** (Server-side) | Supabase Bearer JWT | Authenticated Operator | `/api/v1/analytics.js` | `no-store, no-cache, private` | `401 Unauthorized` / `503 Unconfigured` |
| `/api/v1/analytics/data-quality` | `GET` | **Yes** (Server-side) | Supabase Bearer JWT | Authenticated Operator | `/api/v1/analytics.js` | `no-store, no-cache, private` | `401 Unauthorized` / `503 Unconfigured` |
| `/api/v1/analytics/market-regimes` | `GET` | **Yes** (Server-side) | Supabase Bearer JWT | Authenticated Operator | `/api/v1/analytics.js` | `no-store, no-cache, private` | `401 Unauthorized` / `503 Unconfigured` |
| `/api/v1/analytics/volatility` | `GET` | **Yes** (Server-side) | Supabase Bearer JWT | Authenticated Operator | `/api/v1/analytics.js` | `no-store, no-cache, private` | `401 Unauthorized` / `503 Unconfigured` |
| `/api/v1/analytics/session-analysis` | `GET` | **Yes** (Server-side) | Supabase Bearer JWT | Authenticated Operator | `/api/v1/analytics.js` | `no-store, no-cache, private` | `401 Unauthorized` / `503 Unconfigured` |
| `/api/v1/analytics/multi-timeframe` | `GET` | **Yes** (Server-side) | Supabase Bearer JWT | Authenticated Operator | `/api/v1/analytics.js` | `no-store, no-cache, private` | `401 Unauthorized` / `503 Unconfigured` |
| `/api/v1/analytics/transaction-costs` | `GET` | **Yes** (Server-side) | Supabase Bearer JWT | Authenticated Operator | `/api/v1/analytics.js` | `no-store, no-cache, private` | `401 Unauthorized` / `503 Unconfigured` |
| `/api/v1/analytics/risk-calculator` | `GET` | **Yes** (Server-side) | Supabase Bearer JWT | Authenticated Operator | `/api/v1/analytics.js` | `no-store, no-cache, private` | `401 Unauthorized` / `503 Unconfigured` |
| `/api/v1/analytics/historical-forensics` | `GET` | **Yes** (Server-side) | Supabase Bearer JWT | Authenticated Operator | `/api/v1/analytics.js` | `no-store, no-cache, private` | `401 Unauthorized` / `503 Unconfigured` |

---

## 2. Server-Side Authorization Pipeline (`api/v1/analytics.js`)

Each request to `/api/v1/analytics/*` traverses a 6-stage validation sequence:

```
[Incoming HTTP Request]
          │
          ▼
1. Method Guard: req.method === 'GET'
   └─ False: HTTP 405 Method Not Allowed (Allow: GET)
          │
          ▼
2. Serverless Configuration Guard: SUPABASE_URL & SUPABASE_PUBLISHABLE_KEY present & valid HTTPS
   └─ Invalid / Missing: HTTP 503 Service Unavailable (Zero Fallback Credentials)
          │
          ▼
3. Bearer Token Format Guard: req.headers['authorization'].startsWith('Bearer ')
   └─ Missing / Empty: HTTP 401 Unauthorized {"ok": false, "error": "Authentication required"}
          │
          ▼
4. Supabase User Verification: GET ${SUPABASE_URL}/auth/v1/user with apikey & Bearer
   └─ Upstream 401 / Timeout: HTTP 401 Unauthorized {"ok": false, "error": "Invalid or expired session"}
          │
          ▼
5. Operator Status Verification: Check vortex_authorized_operators (is_active)
   └─ Deactivated: HTTP 403 Forbidden {"ok": false, "error": "User account is deactivated or suspended"}
          │
          ▼
6. Endpoint & Parameter Dispatch:
   ├─ route === 'overview'             -> handleOverview()
   ├─ route === 'data-quality'         -> handleDataQuality()
   ├─ route === 'market-regimes'       -> handleMarketRegimes()
   ├─ route === 'volatility'           -> handleVolatility()
   ├─ route === 'session-analysis'     -> handleSessionAnalysis()
   ├─ route === 'multi-timeframe'      -> handleMultiTimeframe()
   ├─ route === 'transaction-costs'    -> handleTransactionCosts()
   ├─ route === 'risk-calculator'      -> handleRiskCalculator()
   ├─ route === 'historical-forensics' -> handleHistoricalForensics()
   └─ Unknown route                    -> HTTP 404 Not Found
```

---

## 3. Client-Side Route Protection (`auth.js` / `VortexAuth`)

1. **`VortexAuth.requireAuth()`:**
   - Invoked at the top of `research.html` bootstrap script.
   - Extracts existing session or processes PKCE callback / OAuth redirect.
   - Checks expiration (`expires_at - 15000ms`); automatically triggers clean signOut if expired.
   - Redirects unauthenticated visitors to `/login.html?next=research.html`.
2. **`login.html` Redirection Whitelist:**
   - Evaluates `requestedNext = urlParams.get('next')`.
   - Whitelist: `["dashboard.html", "account.html", "research.html", "dashboard", "account", "research"]`.
   - Any open-redirect attempt to external domains is discarded and defaults safely to `dashboard.html`.

---

## 4. Secret Isolation & Zero Leakage Assurances

1. **Browser Client Exposure:** Only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are exposed via `/api/auth-config`. Both are public-by-design credentials for client SDK initialization.
2. **Service Role Key Isolation:** `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` is exclusively consumed in serverless function backends (`api/v1/analytics.js`, `api/trades.js`). It is never returned in any JSON response, header, or HTML payload.
3. **Response Headers:**
   - `Content-Security-Policy`: Restricts scripts to `'self'`, `'unsafe-inline'`, and `https://cdn.jsdelivr.net`. Connects restricted to `'self'` and `*.supabase.co`.
   - `X-Content-Type-Options: nosniff`.
   - `X-Frame-Options: DENY`.
   - `Referrer-Policy: strict-origin-when-cross-origin`.
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
   - `Cache-Control: no-store, no-cache, must-revalidate, private` on all analytics endpoints.
