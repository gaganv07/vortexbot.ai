/**
 * website/api/_lib/project_binding.js
 *
 * VORTEX AI — PR #19 STAGE 2D: SHARED SUPABASE PROJECT-BINDING GUARD
 *
 * Centralized, fail-closed project-binding validation shared across every server-side
 * and browser-auth configuration route:
 * - website/api/v1/analytics.js
 * - website/api/trades.js
 * - website/api/auth-config.js
 *
 * Invariants:
 * 1. Preview environment (VERCEL_ENV=preview) must bind exclusively to staging project 'xtyszeuvtfcgognkrwxv'.
 * 2. Production environment (VERCEL_ENV=production) must bind exclusively to production project 'bucziqekzyrttgcoxtas'.
 * 3. Local development strictly requires an explicit switch (VERCEL_ENV=development OR VORTEX_LOCAL_DEV=true)
 *    AND an explicit project reference matching the Supabase URL.
 * 4. No implicit overrides: VORTEX_ALLOW_LOCAL_DEV is removed; NODE_ENV=development is NEVER inferred.
 * 5. Unknown or ambiguous environments fail closed.
 * 6. Protocol must be HTTPS; custom ports, credentials, paths, queries, and fragments are strictly forbidden.
 */

'use strict';

const STAGING_PROJECT_REF = 'xtyszeuvtfcgognkrwxv';
const PRODUCTION_PROJECT_REF = 'bucziqekzyrttgcoxtas';
const SUPPORTED_LOCAL_REFS = Object.freeze([STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF]);

/**
 * Validates Supabase project URL binding against execution environment.
 * Strictly fail-closed: enforces HTTPS, canonical project reference,
 * strict URL structure (no credentials, port, path, query, fragment),
 * and environment scoping (Preview -> Staging, Production -> Production,
 * Local Development -> Explicit matching reference).
 *
 * @param {string} supabaseUrl - Raw Supabase URL string
 * @returns {{ valid: boolean, error?: string, projectRef?: string, environment?: string }}
 */
function validateSupabaseProjectBinding(supabaseUrl) {
  if (!supabaseUrl || typeof supabaseUrl !== 'string') {
    return { valid: false, error: 'Supabase URL missing or invalid' };
  }

  const rawUrl = supabaseUrl.trim();
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return { valid: false, error: 'Malformed URL' };
  }

  // 1. Strict Protocol Enforcement
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Insecure protocol: HTTPS is strictly required' };
  }

  // 2. Strict URL Structure Enforcement (no credentials, custom port, path, query, fragment)
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URL contains credentials which are forbidden' };
  }
  if (parsed.port) {
    return { valid: false, error: 'Custom ports are forbidden' };
  }
  if (parsed.pathname && parsed.pathname !== '/' && parsed.pathname !== '') {
    return { valid: false, error: 'URL contains path components which are forbidden' };
  }
  if (parsed.search) {
    return { valid: false, error: 'URL contains query parameters which are forbidden' };
  }
  if (parsed.hash) {
    return { valid: false, error: 'URL contains fragment which is forbidden' };
  }

  // 3. Supabase Domain Structure Enforcement
  const hostname = parsed.hostname.toLowerCase();
  const hostParts = hostname.split('.');
  if (hostParts.length !== 3 || hostParts[1] !== 'supabase' || !['co', 'in'].includes(hostParts[2])) {
    return { valid: false, error: 'Hostname is not a valid Supabase domain' };
  }

  const extractedRef = hostParts[0];
  if (!/^[a-z0-9_-]{1,64}$/.test(extractedRef)) {
    return { valid: false, error: 'Invalid Supabase project reference format' };
  }

  // 4. Environment Scoping & Project Binding
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const isExplicitLocalDev = vercelEnv === 'development' || process.env.VORTEX_LOCAL_DEV === 'true';

  if (vercelEnv === 'preview') {
    // Preview environment must bind strictly to staging project
    if (extractedRef !== STAGING_PROJECT_REF) {
      return {
        valid: false,
        error: `Preview environment rejection: project '${extractedRef}' does not match expected staging reference '${STAGING_PROJECT_REF}'`
      };
    }
    return { valid: true, projectRef: extractedRef, environment: 'preview' };
  }

  if (vercelEnv === 'production') {
    // Production environment must bind strictly to production project
    if (extractedRef !== PRODUCTION_PROJECT_REF) {
      return {
        valid: false,
        error: `Production environment rejection: project '${extractedRef}' does not match expected production reference '${PRODUCTION_PROJECT_REF}'`
      };
    }
    return { valid: true, projectRef: extractedRef, environment: 'production' };
  }

  if (isExplicitLocalDev) {
    // Local development requires explicit project reference
    const explicitRef = (
      process.env.SUPABASE_PROJECT_REF ||
      process.env.VORTEX_EXPECTED_SUPABASE_PROJECT_REF ||
      process.env.EXPECTED_SUPABASE_PROJECT_REF ||
      ''
    ).trim().toLowerCase();

    if (!explicitRef) {
      return { valid: false, error: 'Local development rejection: missing explicit project reference' };
    }

    if (!SUPPORTED_LOCAL_REFS.includes(explicitRef)) {
      return {
        valid: false,
        error: `Local development rejection: unsupported project reference '${explicitRef}'. Supported: ${SUPPORTED_LOCAL_REFS.join(', ')}`
      };
    }

    if (explicitRef !== extractedRef) {
      return {
        valid: false,
        error: `Local development rejection: explicit project reference '${explicitRef}' does not match URL project reference '${extractedRef}'`
      };
    }

    return { valid: true, projectRef: extractedRef, environment: 'development' };
  }

  // Unknown or ambiguous environment (missing or invalid VERCEL_ENV outside explicit local dev)
  return {
    valid: false,
    error: `Unknown environment rejection: missing or invalid VERCEL_ENV '${vercelEnv}' outside explicit local development`
  };
}

/**
 * Resolves the expected Supabase project reference based on environment scoping.
 * Preview -> 'xtyszeuvtfcgognkrwxv'
 * Production -> 'bucziqekzyrttgcoxtas'
 * Local Development -> declared via VORTEX_EXPECTED_SUPABASE_PROJECT_REF or SUPABASE_PROJECT_REF
 * Unknown / ambiguous environments fail closed (returns null).
 */
function expectedSupabaseProjectRef() {
  const deploymentEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();

  if (deploymentEnv === 'preview') return STAGING_PROJECT_REF;
  if (deploymentEnv === 'production') return PRODUCTION_PROJECT_REF;

  const isLocalDev = deploymentEnv === 'development' || process.env.VORTEX_LOCAL_DEV === 'true';

  if (isLocalDev) {
    const localRef = (
      process.env.SUPABASE_PROJECT_REF ||
      process.env.VORTEX_EXPECTED_SUPABASE_PROJECT_REF ||
      process.env.EXPECTED_SUPABASE_PROJECT_REF ||
      ''
    ).trim().toLowerCase();
    if (SUPPORTED_LOCAL_REFS.includes(localRef)) {
      return localRef;
    }
  }

  return null;
}

module.exports = {
  validateSupabaseProjectBinding,
  expectedSupabaseProjectRef,
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  SUPPORTED_LOCAL_REFS
};
