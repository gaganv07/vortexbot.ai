/**
 * VORTEX AI — Client Authentication & Session Manager
 * Authoritative Supabase Auth SDK integration.
 * Strictly fail-closed: No mock adapters, no synthetic sessions, no fallback credentials.
 */
(function(root) {
  'use strict';

  let clientPromise = null;
  let supabaseClient = null;
  let activeConfig = null;
  let providerSettingsPromise = null;

  const Auth = {
    /**
     * Initializes the Supabase client singleton using /api/auth-config.
     * Strictly fail-closed: throws on missing SDK or unavailable configuration.
     */
    init: function() {
      if (clientPromise) return clientPromise;

      clientPromise = (async function() {
        const sdk = root.supabase || (typeof window !== 'undefined' ? window.supabase : null) || (typeof global !== 'undefined' ? global.supabase : null);
        if (!sdk || typeof sdk.createClient !== 'function') {
          const err = new Error('Supabase client SDK is unavailable. Check CDN or network connection.');
          console.error('[VORTEX Auth]', err.message);
          throw err;
        }

        let res;
        try {
          res = await fetch('/api/auth-config', { cache: 'no-store' });
        } catch (fetchErr) {
          const err = new Error('Auth configuration request failed: ' + (fetchErr.message || 'Network error'));
          console.error('[VORTEX Auth]', err.message);
          throw err;
        }

        if (!res.ok) {
          const err = new Error('Auth configuration unavailable (HTTP ' + res.status + ')');
          console.error('[VORTEX Auth]', err.message);
          throw err;
        }

        let cfg;
        try {
          cfg = await res.json();
        } catch (jsonErr) {
          const err = new Error('Auth configuration response is invalid JSON');
          console.error('[VORTEX Auth]', err.message);
          throw err;
        }

        if (!cfg || !cfg.configured || !cfg.supabaseUrl || !cfg.publishableKey) {
          const err = new Error('Authentication is not configured on this deployment');
          console.error('[VORTEX Auth]', err.message);
          throw err;
        }

        activeConfig = {
          supabaseUrl: cfg.supabaseUrl,
          publishableKey: cfg.publishableKey
        };

        supabaseClient = sdk.createClient(cfg.supabaseUrl, cfg.publishableKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'vortex_auth_session'
          }
        });

        return supabaseClient;
      })();

      return clientPromise;
    },

    /**
     * Returns the active Supabase public configuration ({ supabaseUrl, publishableKey })
     */
    getConfig: async function() {
      if (!activeConfig) {
        await Auth.init();
      }
      return activeConfig;
    },

    /**
     * Resolves the authoritative redirect destination URL for dashboard.html on current origin
     */
    getRedirectUrl: function() {
      if (typeof window !== 'undefined' && window.location && window.location.origin) {
        return window.location.origin + '/dashboard.html';
      }
      return 'https://vortexbot.ai/dashboard.html';
    },

    /**
     * Inspects active Supabase provider configuration via GET /auth/v1/settings.
     * Strictly read-only and fail-closed: returns provider availability map.
     */
    getProviderSettings: async function() {
      if (providerSettingsPromise) return providerSettingsPromise;

      providerSettingsPromise = (async function() {
        try {
          if (!activeConfig) {
            await Auth.init();
          }
          if (!activeConfig || !activeConfig.supabaseUrl || !activeConfig.publishableKey) {
            return { configured: false, google: false, raw: null };
          }

          let fetchSignal;
          let timer;
          if (typeof AbortController !== 'undefined') {
            const controller = new AbortController();
            timer = setTimeout(() => controller.abort(), 4500);
            fetchSignal = controller.signal;
          }

          const res = await fetch(`${activeConfig.supabaseUrl}/auth/v1/settings`, {
            method: 'GET',
            headers: {
              'apikey': activeConfig.publishableKey,
              'Authorization': `Bearer ${activeConfig.publishableKey}`
            },
            signal: fetchSignal
          }).finally(() => {
            if (timer) clearTimeout(timer);
          });

          if (!res.ok) {
            console.warn('[VORTEX Auth] Provider settings endpoint returned HTTP', res.status);
            return { configured: true, google: false, raw: null, status: res.status };
          }

          const data = await res.json();
          const googleEnabled = Boolean(data && data.external && data.external.google === true);

          return {
            configured: true,
            google: googleEnabled,
            raw: data
          };
        } catch (err) {
          console.warn('[VORTEX Auth] Unable to retrieve provider settings:', err.message || err);
          return { configured: false, google: false, raw: null, error: err.message };
        }
      })();

      return providerSettingsPromise;
    },

    /**
     * Returns the initialized Supabase client
     */
    getClient: async function() {
      if (!supabaseClient) {
        await Auth.init();
      }
      return supabaseClient;
    },

    /**
     * Extracts and processes any auth redirect callback (hash fragment or PKCE query code)
     */
    handleCallback: async function() {
      try {
        let client = null;
        try {
          client = await Auth.getClient();
        } catch (_) {
          return null;
        }
        if (!client || !client.auth) return null;

        const hash = (typeof window !== 'undefined' && window.location) ? window.location.hash : '';
        const search = (typeof window !== 'undefined' && window.location) ? window.location.search : '';

        // Check for OAuth / Magic link URL tokens
        if (hash && (hash.includes('access_token=') || hash.includes('error='))) {
          const { data, error } = await client.auth.getSession();
          if (error) {
            console.error('[VORTEX Auth] Callback error:', error.message);
          }
          if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
            const title = typeof document !== 'undefined' ? document.title : '';
            window.history.replaceState({}, title, window.location.pathname + search);
          }
          return (data && data.session) ? data.session : null;
        }

        if (search && search.includes('code=')) {
          let session = null;
          try {
            const params = new URLSearchParams(search);
            const code = params.get('code');
            if (code && typeof client.auth.exchangeCodeForSession === 'function') {
              const res = await client.auth.exchangeCodeForSession(code);
              if (res && res.data && res.data.session) {
                session = res.data.session;
              }
            }
          } catch (exErr) {
            console.warn('[VORTEX Auth] exchangeCodeForSession notice:', exErr.message || exErr);
          }

          if (!session) {
            const { data, error } = await client.auth.getSession();
            if (error) {
              console.error('[VORTEX Auth] PKCE callback error:', error.message);
            }
            session = (data && data.session) ? data.session : null;
          }

          if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
            const title = typeof document !== 'undefined' ? document.title : '';
            const cleanSearch = search.replace(/([?&])code=[^&]+(&|$)/, '$1').replace(/[?&]$/, '');
            window.history.replaceState({}, title, window.location.pathname + cleanSearch + hash);
          }
          return session;
        }

        const { data } = await client.auth.getSession();
        return (data && data.session) ? data.session : null;
      } catch (cbErr) {
        console.warn('[VORTEX Auth] handleCallback exception:', cbErr.message || cbErr);
        return null;
      }
    },

    /**
     * Retrieves the current genuine authenticated session exclusively from Supabase SDK.
     * Never manufactures synthetic tokens, emails, or privileges.
     * Never falls back to raw or unconfirmed localStorage.
     * Handles SDK unavailability, configuration failures, and network timeouts fail-closed.
     */
    getSession: async function() {
      try {
        let client = null;
        try {
          client = await Auth.getClient();
        } catch (initErr) {
          console.warn('[VORTEX Auth] Supabase client initialization failed:', initErr.message || initErr);
          return null;
        }

        if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
          return null;
        }

        let res = null;
        try {
          res = await client.auth.getSession();
        } catch (err) {
          console.error('[VORTEX Auth] Supabase SDK getSession exception:', err.message || err);
          return null;
        }

        if (res && res.error) {
          console.error('[VORTEX Auth] Supabase SDK getSession error:', res.error.message || res.error);
          return null;
        }

        const data = res ? res.data : null;
        if (data && data.session && data.session.access_token) {
          const session = data.session;
          if (session.expires_at) {
            const expiresAtMs = session.expires_at * 1000;
            if (Date.now() >= expiresAtMs - 15000) {
              console.warn('[VORTEX Auth] Session expired at', new Date(expiresAtMs).toISOString());
              await Auth.signOut({ redirect: false });
              return null;
            }
          }
          return session;
        }

        return null;
      } catch (outerErr) {
        console.error('[VORTEX Auth] getSession unexpected failure:', outerErr.message || outerErr);
        return null;
      }
    },

    /**
     * Returns the genuine Supabase access token string or null
     */
    getAccessToken: async function() {
      const session = await Auth.getSession();
      return (session && session.access_token) ? session.access_token : null;
    },

    /**
     * Initiates passwordless Magic Link sign-in via authoritative Supabase SDK.
     * Reports success only after the actual request succeeds.
     */
    signInWithOtp: async function(email, opts) {
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        throw new Error('A valid email address is required');
      }

      const client = await Auth.getClient();
      if (!client || !client.auth || typeof client.auth.signInWithOtp !== 'function') {
        throw new Error('Supabase Auth client unavailable');
      }

      const redirectDestination = (opts && opts.emailRedirectTo) || Auth.getRedirectUrl();

      return client.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: redirectDestination
        }
      });
    },

    /**
     * Initiates OAuth sign-in via authoritative Supabase SDK.
     * Never simulates successful provider authentication.
     */
    signInWithOAuth: async function(provider, opts) {
      if (!provider) {
        throw new Error('OAuth provider name is required');
      }

      const client = await Auth.getClient();
      if (!client || !client.auth || typeof client.auth.signInWithOAuth !== 'function') {
        throw new Error('Supabase Auth client unavailable');
      }

      const redirectDestination = (opts && opts.redirectTo) || Auth.getRedirectUrl();

      return client.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: redirectDestination
        }
      });
    },

    /**
     * Authoritative sign-out and session clearance.
     * Calls real Supabase SDK signOut.
     * Distinguishes local session cleanup from remote session revocation if network fails or client unavailable.
     */
    signOut: async function(opts) {
      opts = opts || {};
      let remoteError = null;
      let remoteRevoked = false;
      let clientAvailable = false;

      let client = null;
      try {
        client = await Auth.getClient().catch(() => null);
      } catch (_) {
        client = supabaseClient;
      }

      if (client && client.auth && typeof client.auth.signOut === 'function') {
        clientAvailable = true;
        try {
          const res = await client.auth.signOut();
          if (res && res.error) {
            remoteError = res.error;
            remoteRevoked = false;
          } else {
            remoteRevoked = true;
          }
        } catch (err) {
          remoteError = err;
          remoteRevoked = false;
        }
      } else {
        clientAvailable = false;
        remoteRevoked = false;
        remoteError = new Error('Supabase Auth client unavailable for remote sign-out');
      }

      // Safe local credentials cleanup across both vortex_* and legacy vortext_* keys
      let localCleared = false;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('vortex_token');
          localStorage.removeItem('vortext_token');
          localStorage.removeItem('vortex_user');
          localStorage.removeItem('vortext_user');
          localStorage.removeItem('vortex_auth_session');
          localStorage.removeItem('vortext_auth_session');
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.clear();
        }
        localCleared = true;
      } catch (_) {}

      // Redirect to login unless caller explicitly opted out
      if (opts.redirect !== false && typeof window !== 'undefined' && window.location) {
        if (window.location.pathname !== '/login.html' && window.location.pathname !== '/login') {
          window.location.replace('/login.html');
        }
      }

      if (!clientAvailable || remoteError) {
        return {
          ok: false,
          remoteRevoked: false,
          localCleared: localCleared,
          error: remoteError ? (remoteError.message || String(remoteError)) : 'Supabase Auth client unavailable'
        };
      }

      return {
        ok: true,
        remoteRevoked: true,
        localCleared: localCleared,
        error: null
      };
    },

    /**
     * Route guard: redirects unauthenticated visitors to login safely.
     * Never throws unhandled exceptions; fails closed to /login.html.
     */
    requireAuth: async function() {
      try {
        try {
          await Auth.handleCallback();
        } catch (cbErr) {
          console.warn('[VORTEX Auth] handleCallback exception:', cbErr.message || cbErr);
        }
        const session = await Auth.getSession();
        if (!session || !session.access_token) {
          if (typeof window !== 'undefined' && window.location) {
            window.location.replace('/login.html');
          }
          return null;
        }
        return session;
      } catch (err) {
        console.error('[VORTEX Auth] requireAuth exception, redirecting to login:', err.message || err);
        if (typeof window !== 'undefined' && window.location) {
          window.location.replace('/login.html');
        }
        return null;
      }
    },

    /**
     * Testing hook to reset cached client singleton
     */
    _resetForTesting: function() {
      clientPromise = null;
      supabaseClient = null;
      activeConfig = null;
      providerSettingsPromise = null;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Auth;
  }
  // Canonical VORTEX naming
  if (typeof root !== 'undefined') {
    root.VortexAuth = Auth;
  }
  if (typeof window !== 'undefined') {
    window.VortexAuth = Auth;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
