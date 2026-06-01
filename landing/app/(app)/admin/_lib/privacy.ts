// Wave 6.5 D1 — admin privacy guardrails (pure, node-env vitest testable).
//
// The /admin panel already existed (overview/users/devices/health tabs, sort,
// CSV export) but rendered + exported RAW email. These helpers close that leak
// (display + CSV masking), centralise the admin allow-list (env-driven, was a
// hardcoded constant), and shape audit-log rows. All pure + isomorphic — no
// process.env, no node:crypto here, so the client bundle can import maskEmail.

/**
 * Mask an email for admin display: first local char + `***` + domain.
 * `paulo.loureiro.shp@gmail.com` → `p***@gmail.com`. Never reveals the local
 * part. Falls back gracefully for malformed input (no `@` → first char + ***).
 */
export function maskEmail(email: unknown): string {
  const s = String(email ?? "").trim();
  if (!s) return "—";
  const at = s.lastIndexOf("@");
  if (at <= 0) return `${s[0] ?? ""}***`;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  return `${local[0]}***@${domain}`;
}

/** Parse a comma-separated ADMIN_EMAILS allow-list into a lowercased set. */
export function parseAdminEmails(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Is this email an admin? Uses the env allow-list when present; otherwise the
 * backward-compatible fallback (the single hardcoded admin the routes used
 * before this wave). Empty / missing email is never an admin.
 */
export function isAdminEmail(email: unknown, rawAllowList: unknown, fallback: string): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e) return false;
  const list = parseAdminEmails(rawAllowList);
  const effective = list.length > 0 ? list : parseAdminEmails(fallback);
  return effective.includes(e);
}

export type AdminAction = "view_users_list" | "view_user_detail" | "view_stats" | "export_data";

export interface AuditEntry {
  action: AdminAction;
  target_user_id_hash: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Build an audit row for `mooter_admin_audit`. admin_user_id is set by the
 * caller (server-side, from the authed session); this shapes the rest. The
 * target is a HASH (never raw uuid/email) and metadata must carry no PII.
 */
export function buildAuditEntry(
  action: AdminAction,
  targetUserIdHash: string | null = null,
  metadata: Record<string, unknown> = {},
): AuditEntry {
  return { action, target_user_id_hash: targetUserIdHash, metadata };
}
