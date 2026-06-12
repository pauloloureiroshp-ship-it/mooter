// @ts-check
/**
 * Wave 56 — Admin audit-trail writer.
 *
 * Every admin read endpoint (the `/v1/admin/*` family) must leave a tamper-evident
 * trail in `audit_admin_views` BEFORE it returns any data. This module owns that
 * write and the IP-hashing helper the handlers feed it.
 *
 * Privacy model (ABSOLUTE — Wave 33.7 + Wave 56 doctrine):
 *  - The hub admin gate is a single shared Bearer token (`MOOTER_ADMIN_TOKEN`),
 *    NOT a per-admin email. We therefore have no admin identity to store. Instead
 *    we store a *pseudonymous* `admin_email_hash` = sha256hex(adminToken)[:16].
 *    It is stable per token and reveals nothing about the token. The RAW token is
 *    NEVER stored, logged, or returned.
 *  - `target_user_hash` is the anonymous 16-hex user key (SHA256(user_id)[:16]),
 *    never a raw email / github handle / raw user_id.
 *  - `ip_hash` is sha256hex(CF-Connecting-IP)[:16], or null when the header is
 *    absent. The raw IP is never persisted.
 *
 * Runtime: Cloudflare Workers. Use Web Crypto (`crypto.subtle`) — the Node
 * `crypto` module is NOT available here. This matches the existing `hashIp`
 * pattern in `hub/routes/feedback.js` (no shared exported sha256 helper exists
 * in `hub/lib`, so we keep a self-contained one here).
 */

/**
 * SHA-256 of `input`, returned as the first 16 lowercase hex characters
 * (= first 8 bytes). 16-hex is the canonical anonymous-key width across the hub
 * (Wave 33.7 user_id_hash, feedback ip_hash). Fail-safe: returns null on any
 * crypto error rather than throwing into a caller.
 *
 * @param {string} input
 * @returns {Promise<string | null>}
 */
async function sha256Hex16(input) {
  try {
    const data = new TextEncoder().encode(String(input));
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)]
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

/**
 * Derive a pseudonymous, stable `ip_hash` (16-hex) from the request's
 * `CF-Connecting-IP` header. Returns null when the header is absent so callers
 * can store SQL NULL rather than a hash of the empty string.
 *
 * @param {Request} request
 * @returns {Promise<string | null>}
 */
export async function hashAdminIp(request) {
  const ip = request && request.headers ? request.headers.get('CF-Connecting-IP') : null;
  if (!ip) return null;
  return sha256Hex16(ip);
}

/**
 * Append one row to `audit_admin_views` describing an admin data view. MUST be
 * awaited BEFORE the endpoint returns its data, but is wrapped so an audit-write
 * failure NEVER blocks or breaks the data response: any error is swallowed after
 * a best-effort `console.error` (Sentry-safe — no secrets in the log).
 *
 * The raw admin token is hashed to a pseudonymous, stable `admin_email_hash`
 * (sha256hex(adminToken)[:16]); the raw token is never stored. When no token is
 * supplied the value is the literal string 'unknown'.
 *
 * @param {{ DB: D1Database }} env  Worker env with the D1 binding.
 * @param {object} args
 * @param {string} args.endpoint                 Logical endpoint label, e.g. '/v1/admin/users'.
 * @param {string | null} [args.targetUserHash]  16-hex anonymous user key being viewed, or null.
 * @param {string} [args.adminToken]             Raw Bearer token (hashed here; never stored raw).
 * @param {string | null} [args.ipHash]          Pre-computed 16-hex ip_hash (see hashAdminIp), or null.
 * @returns {Promise<void>}
 */
export async function logAdminView(env, { endpoint, targetUserHash = null, adminToken = '', ipHash = null }) {
  try {
    const adminEmailHash = adminToken ? (await sha256Hex16(adminToken)) || 'unknown' : 'unknown';
    const ts = Date.now();
    await env.DB
      .prepare(
        'INSERT INTO audit_admin_views (admin_email_hash, endpoint, target_user_hash, ts, ip_hash) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(adminEmailHash, String(endpoint), targetUserHash ?? null, ts, ipHash ?? null)
      .run();
  } catch (err) {
    // Audit-write failures must never block the data response. Best-effort log
    // only — the error object carries no secret (the raw token is never here).
    try {
      console.error('[admin_audit] logAdminView failed', err instanceof Error ? err.message : err);
    } catch {
      /* logging is best-effort */
    }
  }
}
