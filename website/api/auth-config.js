/**
 * website/api/auth-config.js
 *
 * Read-only browser auth configuration endpoint.
 * Only publishes the canonical Supabase project URL and publishable key intended
 * for browser clients. Enforces environment-aware project binding (Preview -> staging,
 * Production -> production) via the shared project-binding guard.
 * Strictly never returns service-role keys, HMAC secrets, or other server secrets.
 */

'use strict';

const {
  validateSupabaseProjectBinding,
  expectedSupabaseProjectRef,
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  SUPPORTED_LOCAL_REFS
} = require('./_lib/project_binding');

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(body);
  }
  res.statusCode = status;
  return res.end(JSON.stringify(body));
}

function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return reply(res, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VORTEX_PREVIEW_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim().replace(/[\r\n\s]+/g, '');

  if (!supabaseUrl || !publishableKey) {
    return reply(res, 503, {
      configured: false,
      error: 'Authentication is not configured for this deployment yet.'
    });
  }

  const binding = validateSupabaseProjectBinding(supabaseUrl);
  if (!binding.valid) {
    return reply(res, 503, {
      configured: false,
      error: 'The configured authentication URL is invalid.'
    });
  }

  return reply(res, 200, {
    configured: true,
    supabaseUrl,
    publishableKey
  });
}

handler.validateSupabaseProjectBinding = validateSupabaseProjectBinding;
handler.expectedSupabaseProjectRef = expectedSupabaseProjectRef;
handler.STAGING_PROJECT_REF = STAGING_PROJECT_REF;
handler.PRODUCTION_PROJECT_REF = PRODUCTION_PROJECT_REF;
handler.SUPPORTED_LOCAL_REFS = SUPPORTED_LOCAL_REFS;

module.exports = handler;
