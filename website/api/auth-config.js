/* Read-only browser auth configuration endpoint.
 * Only publishes the Supabase project URL and publishable key, which are intended
 * for browser clients. Never return service-role keys or other server secrets here.
 */
module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";

  if (!supabaseUrl || !publishableKey) {
    return res.status(503).json({
      configured: false,
      error: "Authentication is not configured for this deployment yet."
    });
  }

  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
      return res.status(503).json({
        configured: false,
        error: "The configured authentication URL is invalid."
      });
    }
  } catch {
    return res.status(503).json({
      configured: false,
      error: "The configured authentication URL is invalid."
    });
  }

  const allowedEmails = (process.env.VORTEX_DASHBOARD_ALLOWED_EMAILS || process.env.VORTEXT_DASHBOARD_ALLOWED_EMAILS || "")
    .split(",").map(function (email) { return email.trim(); }).filter(Boolean);
  // Public signup is opt-in and requires the server-side email fence used by /api/trades.
  const signupEnabled = process.env.VORTEX_PUBLIC_SIGNUP_ENABLED === "true" && allowedEmails.length > 0;

  return res.status(200).json({
    configured: true,
    supabaseUrl,
    publishableKey,
    signupEnabled
  });
};
