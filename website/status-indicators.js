/**
 * VORTEX AI — Status Indicator & Telemetry Formatting Utility
 * Enforces strict separation between Feed Freshness, Account Mode, Execution State, and Data Provenance.
 */
(function(root) {
  const STALE_THRESHOLD_MS = 30000; // 30 seconds server-side threshold agreement

  const StatusUtils = {
    STALE_THRESHOLD_MS: STALE_THRESHOLD_MS,

    /**
     * Evaluates feed freshness state
     * Returns: { status: 'CONNECTED'|'STALE'|'DISCONNECTED'|'UNAVAILABLE'|'UNKNOWN', label, badgeClass, icon, message }
     */
    evaluateFeedFreshness: function(data, err) {
      if (err) {
        return {
          status: 'UNAVAILABLE',
          label: 'UNAVAILABLE',
          badgeClass: 'status-badge-unavailable',
          icon: '✕',
          message: 'Account information is temporarily unavailable'
        };
      }
      if (!data) {
        return {
          status: 'DISCONNECTED',
          label: 'DISCONNECTED',
          badgeClass: 'status-badge-disconnected',
          icon: '○',
          message: 'No recent account update has been received'
        };
      }

      // Check if data is flagged as bootstrap preflight cache
      const isBootstrapCache = (data.telemetry_source === 'PREFLIGHT_BOOTSTRAP_CACHE') ||
                               (data.snapshot && data.snapshot.fleet_summary &&
                                data.snapshot.fleet_summary.telemetry_source === 'PREFLIGHT_BOOTSTRAP_CACHE') ||
                               (data.snapshot && data.snapshot.account &&
                                data.snapshot.account.telemetry_source === 'PREFLIGHT_BOOTSTRAP_CACHE');

      const capturedAt = data.captured_at || (data.snapshot && data.snapshot.captured_at);
      if (!capturedAt) {
        return {
          status: 'DISCONNECTED',
          label: 'DISCONNECTED',
          badgeClass: 'status-badge-disconnected',
          icon: '○',
          message: 'No account update has been received'
        };
      }

      const captureMs = new Date(capturedAt).getTime();
      const nowMs = Date.now();
      const ageMs = nowMs - captureMs;

      if (isBootstrapCache || data.stale === true || !Number.isFinite(captureMs) || ageMs > STALE_THRESHOLD_MS || captureMs > nowMs + 60000) {
        return {
          status: 'STALE',
          label: 'STALE',
          badgeClass: 'status-badge-stale',
          icon: '⚠',
          ageMs: Math.max(0, ageMs),
          isCache: isBootstrapCache,
          message: isBootstrapCache
            ? 'Showing a previous saved update. New account information has not been received.'
            : `Account information is delayed (last update was ${Math.round(ageMs / 1000)} seconds ago)`
        };
      }

      // Active fresh stream
      return {
        status: 'CONNECTED',
        label: 'CONNECTED / FRESH',
        badgeClass: 'status-badge-connected',
        icon: '●',
        ageMs: Math.max(0, ageMs),
        message: 'Recent account information received'
      };
    },

    /**
     * Determines authoritative Account Mode from broker metadata
     * Never infers from balance, account number, or server name.
     */
    evaluateAccountMode: function(account) {
      if (!account || !account.trade_mode) {
        return {
          mode: 'UNKNOWN',
          label: 'UNKNOWN',
          badgeClass: 'mode-badge-unknown',
          description: 'Account mode information is unavailable'
        };
      }
      const raw = String(account.trade_mode).toUpperCase().trim();
      if (raw === 'DEMO') {
        return {
          mode: 'DEMO',
          label: 'DEMO',
          badgeClass: 'mode-badge-demo',
          description: 'Simulated capital on broker demo infrastructure'
        };
      }
      if (raw === 'REAL') {
        return {
          mode: 'REAL',
          label: 'REAL',
          badgeClass: 'mode-badge-real',
          description: 'Live real-money trading account'
        };
      }
      return {
        mode: 'UNKNOWN',
        label: 'UNKNOWN',
        badgeClass: 'mode-badge-unknown',
        description: 'Account mode could not be verified: ' + raw
      };
    },

    /**
     * Formats last successful broker update timestamp
     * Never substitutes webpage refresh or polling time.
     */
    formatBrokerTimestamp: function(capturedAt, isCache) {
      if (!capturedAt) {
        return {
          utc: '—',
          local: '—',
          relative: 'No verified broker update recorded',
          hasRecordedUpdate: false
        };
      }

      const d = new Date(capturedAt);
      if (isNaN(d.getTime())) {
        return {
          utc: '—',
          local: '—',
          relative: 'No verified broker update recorded',
          hasRecordedUpdate: false
        };
      }

      const now = Date.now();
      const diffSec = Math.floor((now - d.getTime()) / 1000);
      let relativeStr = '';

      if (diffSec < 0) {
        relativeStr = 'Just now';
      } else if (diffSec < 60) {
        relativeStr = `Updated ${diffSec} second${diffSec === 1 ? '' : 's'} ago`;
      } else if (diffSec < 3600) {
        const min = Math.floor(diffSec / 60);
        relativeStr = `Updated ${min} minute${min === 1 ? '' : 's'} ago`;
      } else if (diffSec < 86400) {
        const hrs = Math.floor(diffSec / 3600);
        relativeStr = `Updated ${hrs} hour${hrs === 1 ? '' : 's'} ago`;
      } else {
        const days = Math.floor(diffSec / 86400);
        relativeStr = `Updated ${days} day${days === 1 ? '' : 's'} ago`;
      }

      if (isCache) {
        relativeStr += ' (Previous saved update)';
      }

      const pad = (n) => String(n).padStart(2, '0');
      const utcFormatted = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
      const localFormatted = d.toLocaleString();

      return {
        utc: utcFormatted,
        local: localFormatted,
        relative: relativeStr,
        hasRecordedUpdate: true
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatusUtils;
  } else {
    root.StatusUtils = StatusUtils;
  }
})(typeof window !== 'undefined' ? window : this);

