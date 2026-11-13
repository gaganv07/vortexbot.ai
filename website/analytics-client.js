/**
 * website/analytics-client.js
 * VORTEX AI — Client API Client for Sprint 2 Analytics REST Gateway
 * Provides strongly-typed, authenticated, race-safe communication with /api/v1/analytics/.
 * Enforces zero private data caching, correlation ID propagation, and fail-closed error handling.
 */

(function(root) {
  'use strict';

  // In-flight sequence tracker to prevent stale responses overwriting newer user selections
  const requestSequences = {};
  const activeControllers = {};

  const AnalyticsClient = {
    // Default request timeout in milliseconds
    TIMEOUT_MS: 10000,

    /**
     * Resolves the authoritative Bearer access token from VortexAuth.
     */
    async getAuthToken() {
      try {
        const authModule = root.VortexAuth || root.Auth || (typeof window !== 'undefined' ? (window.VortexAuth || window.Auth) : null);
        if (authModule && typeof authModule.getAccessToken === 'function') {
          return await authModule.getAccessToken();
        }
        return null;
      } catch (_) {
        return null;
      }
    },

    /**
     * Core request dispatcher with auth injection, timeout, and race-condition guard.
     */
    async request(endpoint, queryParams = {}, explicitToken = null) {
      const cleanEndpoint = endpoint.replace(/^\/+/, '').replace(/^api\/v1\/analytics\/?/, '');
      const routeKey = cleanEndpoint.split('?')[0] || 'overview';

      // Increment sequence for this specific endpoint to drop race-condition responses
      requestSequences[routeKey] = (requestSequences[routeKey] || 0) + 1;
      const currentSeq = requestSequences[routeKey];

      // Abort previous in-flight request for the same endpoint if active
      if (activeControllers[routeKey]) {
        try {
          activeControllers[routeKey].abort();
        } catch (_) {}
      }

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      activeControllers[routeKey] = controller;

      const timeoutId = setTimeout(() => {
        if (controller) controller.abort();
      }, this.TIMEOUT_MS);

      try {
        const token = explicitToken || (await this.getAuthToken());
        if (!token) {
          clearTimeout(timeoutId);
          return {
            ok: false,
            status: 401,
            error: 'Authentication required. No valid session token available.',
            isAuthError: true
          };
        }

        // Build query string
        const searchParams = new URLSearchParams();
        for (const [k, v] of Object.entries(queryParams)) {
          if (v !== undefined && v !== null && v !== '') {
            searchParams.append(k, String(v));
          }
        }
        const qs = searchParams.toString();
        const url = `/api/v1/analytics/${routeKey}${qs ? '?' + qs : ''}`;

        const headers = {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        };

        const fetchOpts = {
          method: 'GET',
          headers: headers,
          cache: 'no-store'
        };
        if (controller) {
          fetchOpts.signal = controller.signal;
        }

        let res;
        try {
          res = await fetch(url, fetchOpts);
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            return {
              ok: false,
              status: 408,
              error: 'Request timed out after 10 seconds or was canceled by a newer selection.',
              isTimeout: true
            };
          }
          return {
            ok: false,
            status: 0,
            error: `Network communication error: ${fetchErr.message || 'Connection failed.'}`,
            isNetworkError: true
          };
        }

        clearTimeout(timeoutId);

        // Check if a newer request was dispatched while this was in flight
        if (requestSequences[routeKey] !== currentSeq) {
          return {
            ok: false,
            status: 499,
            error: 'Response superseded by a newer operator selection.',
            isStaleSelection: true
          };
        }

        const correlationId = res.headers ? (res.headers.get('X-Correlation-ID') || res.headers.get('x-correlation-id') || null) : null;

        let data = null;
        try {
          data = await res.json();
        } catch (jsonErr) {
          return {
            ok: false,
            status: res.status,
            correlationId: correlationId,
            error: `Malformed JSON response from server (HTTP ${res.status}).`
          };
        }

        if (!res.ok) {
          let errorMsg = (data && data.error) ? data.error : `HTTP ${res.status} error from analytics gateway.`;
          return {
            ok: false,
            status: res.status,
            correlationId: correlationId,
            error: errorMsg,
            isAuthError: res.status === 401,
            isForbidden: res.status === 403,
            isValidationError: res.status === 422 || res.status === 400,
            isRateLimited: res.status === 429,
            isUnconfigured: res.status === 503,
            data: data
          };
        }

        return {
          ok: true,
          status: res.status,
          correlationId: correlationId,
          data: data
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },

    // -----------------------------------------------------------------------
    // Endpoint Methods (1 through 9)
    // -----------------------------------------------------------------------

    /**
     * 1. Overview: Platform posture, active regime, volatility overview, session state, risk limits.
     */
    async getOverview(symbol = 'EURUSD', token = null) {
      return this.request('overview', { symbol }, token);
    },

    /**
     * 2. Data Quality: Feed continuity, spike flags, latency, provenance classification.
     */
    async getDataQuality(symbol = 'EURUSD', token = null) {
      return this.request('data-quality', { symbol }, token);
    },

    /**
     * 3. Market Regimes: ADX(14), Choppiness(14), Hurst Exponent, regime state.
     */
    async getMarketRegimes(symbol = 'EURUSD', timeframe = 'H1', token = null) {
      return this.request('market-regimes', { symbol, timeframe }, token);
    },

    /**
     * 4. Volatility: ATR(14), Realized Vol %, 1Y percentile rank, slope.
     */
    async getVolatility(symbol = 'EURUSD', timeframe = 'H1', token = null) {
      return this.request('volatility', { symbol, timeframe }, token);
    },

    /**
     * 5. Session Analysis: Asian/London/NY ranges, ORB false breakout rate (71.4%).
     */
    async getSessionAnalysis(symbol = 'EURUSD', token = null) {
      return this.request('session-analysis', { symbol }, token);
    },

    /**
     * 6. Multi-Timeframe: D1/H4/M15 trend consensus, alignment score (-100 to +100).
     */
    async getMultiTimeframe(symbol = 'EURUSD', token = null) {
      return this.request('multi-timeframe', { symbol }, token);
    },

    /**
     * 7. Transaction Costs: Round-trip friction $, cost-to-risk %, breakeven hurdle.
     */
    async getTransactionCosts(symbol = 'EURUSD', spreadPips = 1.2, commissionPerLot = 7.0, stopPips = 15.0, token = null) {
      return this.request('transaction-costs', {
        symbol,
        spread_pips: spreadPips,
        commission_per_lot: commissionPerLot,
        stop_pips: stopPips
      }, token);
    },

    /**
     * 8. Risk Calculator: Quantized sizing (0.01 step), actual $ risk, minimum-lot rejection.
     */
    async getRiskCalculator(symbol = 'EURUSD', stopPips = 20.0, accountBalance = 200.0, token = null) {
      return this.request('risk-calculator', {
        symbol,
        stop_pips: stopPips,
        account_balance: accountBalance
      }, token);
    },

    /**
     * 9. Historical Forensics: Out-of-sample backtest metrics, CFTC Rule 4.41 disclaimer.
     */
    async getHistoricalForensics(strategyId = 'PHASE128_EURUSD', token = null) {
      return this.request('historical-forensics', { strategy_id: strategyId }, token);
    },

    /**
     * Aggregator: Fetches all primary analytics modules for an active symbol in parallel.
     */
    async fetchAll(symbol = 'EURUSD', timeframe = 'H1', strategyId = 'PHASE128_EURUSD', token = null) {
      const [overview, dataQuality, regimes, volatility, sessions, mtf, forensics] = await Promise.all([
        this.getOverview(symbol, token),
        this.getDataQuality(symbol, token),
        this.getMarketRegimes(symbol, timeframe, token),
        this.getVolatility(symbol, timeframe, token),
        this.getSessionAnalysis(symbol, token),
        this.getMultiTimeframe(symbol, token),
        this.getHistoricalForensics(strategyId, token)
      ]);

      return {
        overview,
        dataQuality,
        regimes,
        volatility,
        sessions,
        mtf,
        forensics
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalyticsClient;
  } else {
    root.AnalyticsClient = AnalyticsClient;
  }
})(typeof window !== 'undefined' ? window : this);

