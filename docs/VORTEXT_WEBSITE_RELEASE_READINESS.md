# VORTEXT AI website and MT5 dashboard release readiness

Inspection date: 2026-11-09. Updated after GitHub source review and Vercel Preview HTTP smoke checks. This integration branch combines the PR #5 website-readiness pages, the existing read-only MT5 snapshot publisher, shared authenticated dashboard access, a Getting Started guide and explicit release-state disclosures.

## Release posture

- Branch: `feat/vortext-authenticated-mt5-dashboard`.
- Review: Draft PR #6; not merged.
- Deployment scope: Vercel Preview and isolated Supabase staging only.
- Production has not been migrated, updated or deployed by this work.
- Product status displayed on the homepage: **LIMITED ACCESS · INTEGRATION TESTING**.
- VORTEXT AI is not generally available. Public customer onboarding remains closed.
- The verified website scope in this branch is read-only monitoring. No public commitment is made for unreleased research or execution modules.

## User-facing readiness changes

- Homepage has an accessible three-line hamburger control at mobile widths, with open/close state, Escape-key close and close-on-navigation.
- Homepage links to `/getting-started.html`.
- Getting Started explains official MT5 desktop installation, broker/account compatibility checks, account connection, demo-only testing, credential handling and release limitations.
- The homepage explicitly marks DOM, order-flow, market-structure, multi-timeframe, risk-management and execution analytics as under validation and not generally available.
- Public pages retain risk, pre-launch, privacy, pricing and access limitations.

## Dashboard status indicators

The dashboard displays three independent status fields:

1. **Feed connection:** `FEED CONNECTED · FRESH`, `FEED STALE`, `FEED UNAVAILABLE` or `AWAITING FIRST UPDATE`.
2. **Account mode:** broker-reported `DEMO`, `REAL`, `CONTEST`, `MIXED` or `UNKNOWN`.
3. **Last successful broker update:** the timestamp of the latest accepted snapshot, displayed in UTC.

Feed freshness is not used as a synonym for a real-money account. The dashboard uses explicit DEMO/REAL labels for account mode. A stale snapshot is visibly marked stale and the timestamp does not advance until a newer accepted broker snapshot is received.

## Shared dashboard access model

The Preview API:

1. Requires a Supabase bearer access token and validates it with Supabase Auth.
2. Uses the server-only Supabase secret for snapshot and operator metadata reads.
3. Exposes only the server-configured IDs in `VORTEXT_DASHBOARD_SHARED_ACCOUNTS` to all valid signed-in users.
4. May add per-user account grants from `vortext_authorized_operators.allowed_accounts`.
5. Blocks an explicitly inactive or mismatched operator record.
6. Filters `accounts`, `positions` and `deals` to the allowed set before returning data. Query-string account IDs do not grant access.
7. Rejects anonymous requests. Website code has no order submit, modify or close operation.

Shared IDs are configured on the Vercel Preview branch only. They do not make the feed publicly readable.

## Vercel Preview state

Project: `vortexbot-ai`, website root: `website`.

- GitHub Preview builds for the integration and contact-update branches reported `READY`.
- The contact-page Preview returned HTTP 200 and served the supplied WhatsApp number, direct WhatsApp link and Instagram profile link.
- Public page smoke checks returned HTTP 200 for `/`, `/pricing.html`, `/faq.html`, `/contact.html`, `/privacy.html`, `/terms.html`, `/login.html` and `/dashboard.html`.
- `GET /api/trades` returned HTTP 503 with `Trade feed backend is not configured`. This is fail-closed behavior, not a working live feed.
- The current Vercel environment inventory shows Preview `SUPABASE_SECRET_KEY` is blank. It also shows blank `VORTEX_BOT_HMAC_SECRET` entries (missing the second “T”); the API code expects `VORTEXT_BOT_HMAC_SECRET`. Because the entries are sensitive, Vercel does not permit renaming them in place. Replace the misnamed Preview entries with the correctly named variable and set both required values before expecting the API to work.
- The Production environment inventory also shows `SUPABASE_SECRET_KEY` and `VORTEXT_BOT_HMAC_SECRET` entries with blank values. The Production feed API therefore is not configured either. Do not populate Production secrets as part of this Preview-only release.
- The local HMAC secret on the Windows trading PC must match the Preview HMAC secret exactly. The Supabase secret key must come from the intended staging project. Never paste either secret into chat, Git or screenshots.
- No Production environment variable was changed by this work.

## Current Supabase security audit (2026-11-09)

The connected Supabase projects were inspected read-only during this release pass.

### Production project

- All 24 tables in the `public` schema have RLS enabled.
- The Supabase security advisor currently reports 23 public tables with RLS enabled but no policies. This is not automatically a data exposure: the current grants query found no `anon` table grants and only a SELECT grant to `authenticated` on `vortext_authorized_operators`, protected by an own-row policy. The remaining tables appear intended for server-side access; confirm every application runtime uses a server-only key and never returns unfiltered records.
- The only public-schema policies currently found are the two operator-table policies: signed-in users may read their own operator record, and `service_role` may manage operator records.
- The production `upsert_vortext_multi_account_snapshot` function is SECURITY DEFINER but its current ACL grants execution only to `service_role` (plus the owner). Do not broaden that grant.
- The security advisor warns that leaked-password protection is disabled. Enable it in Supabase Auth settings before accepting customer accounts.
- These findings supersede the older audit note about RLS-disabled tables. Re-run advisors after changes and before release.

### Staging project

- All three public tables have RLS enabled, and the current grants query found only the operator table's authenticated SELECT grant, guarded by the own-row policy.
- The staging operator table currently has four rows and Supabase Auth has seven users. Verify that only intended test users are active and that every operator row maps to the correct Auth UUID and email before onboarding.
- Three snapshots exist, but the newest captured timestamp is 2026-11-05 13:00:13 UTC, approximately 3.6 days old at inspection time. These rows are stale and must not be treated as a live feed.
- The security advisor warns that leaked-password protection is disabled here too.

## MT5 account mapping

- An earlier repository integration log mapped MT5 login `26179878` to internal alias `account_003` on `VantageMarkets-Demo`.
- The private current Windows account registry still requires local confirmation.
- The publisher must run from the owner-controlled Windows trading PC and send a signed snapshot to the exact Preview `/api/trades` URL.
- The numeric MT5 login is not the website allowlist alias.

## Supabase staging state

Project: `xtyszeuvtfcgognkrwxv` (`VORTEXT AI Staging`, ap-south-1).

- Staging contains `vortext_authorized_operators`, `vortext_trade_snapshots`, `auth_telemetry_events` and the timestamp-ordered snapshot RPCs.
- RLS is enabled on all three public tables. Browser roles have no direct snapshot write access; snapshot upsert execution is restricted to `service_role`.
- Four operator rows and seven Auth users currently exist. Review active flags and exact UUID/email mappings before granting access.
- Three snapshot rows exist, but the latest is older than the 30-second freshness threshold by several days. The API is currently fail-closed because required Vercel Preview secrets are blank.
- Do not apply the incompatible old PR #4 multi-account migration to staging.
- No production database schema or grant changes were made during this audit.

## Test results

- GitHub Actions run [#42562728284](https://github.com/gaganv07/vortexbot.ai/actions/runs/42562728284) passed on 2026-11-09: 11/11 Node trade-feed API tests and 11/11 Python website-readiness tests.
- The CI run verified the WhatsApp phone number, click-to-chat URL, Instagram profile, WhatsApp Channel, Discord link, account-safety warning, corrected 7-instrument count, restricted-access copy and research-module disclosure.
- Preview HTTP smoke checks confirmed successful page responses and security headers. The API smoke check correctly returned 503 because backend credentials are not configured.
- Passing unit/static tests do not replace authenticated dashboard testing or a fresh signed MT5 publisher test.

## Remaining release gates

1. Configure non-empty Preview `SUPABASE_SECRET_KEY` and `VORTEXT_BOT_HMAC_SECRET`.
2. Verify the private Windows account registry maps login 26179878 to `account_003`.
3. Provision the intended Supabase Auth users using the approved onboarding route; email magic-link login does not create new users.
4. Verify the publisher configuration and endpoint on the Windows trading PC; keep all broker credentials and secrets local/server-side.
5. Publish signed snapshots to Preview and verify timestamps advance, feed freshness transitions correctly, and the dashboard renders the exact broker account mode.
6. Smoke-test desktop and mobile navigation, status indicators, Getting Started links, login and account-filter protections.
7. Keep the PR draft until Preview and end-to-end checks pass. No merge or Production rollout is implied.

No live trading, MT5 order execution or Production deployment is authorized by these website changes.
