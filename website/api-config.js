/**
 * VORTEX AI — Client API Configuration
 * Supports environment-aware resolution without hardcoded remote URLs.
 */
(function(root) {
  const API_CONFIG = {
    // Current environment mode
    getEnvironment() {
      if (typeof window === 'undefined') return 'NODE_RUNTIME';
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return 'LOCAL_DEVELOPMENT';
      if (host.endsWith('.vercel.app')) return 'VERCEL_PREVIEW';
      return 'PRODUCTION';
    },

    // Resolves base API path
    getBaseUrl() {
      if (typeof window === 'undefined') return '';
      // 1. Operator manual override in localStorage
      const customUrl = localStorage.getItem('vortex_backend_url');
      if (customUrl) return customUrl.replace(/\/+$/, '');

      // 2. Local development: use same-origin relative path (e.g. local daemon port)
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return '';
      }

      // 3. Vercel Preview or Hosted Production: uses same-origin serverless edge gateway
      return '';
    },

    // Build fully qualified URL
    url(endpoint) {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
      return this.getBaseUrl() + cleanEndpoint;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API_CONFIG;
  } else {
    root.API_CONFIG = API_CONFIG;
  }
})(typeof window !== 'undefined' ? window : this);

