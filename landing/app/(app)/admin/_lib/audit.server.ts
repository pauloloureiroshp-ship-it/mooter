// Wave 6.5 D1 — server-only admin helpers: audit-log writes + the admin
// allow-list. Kept OUT of privacy.ts (which the client bundle imports) because
// this uses node:crypto + process.env. Imported only by /api/admin/* routes.

import { createHash } from 'crypto';
import type { AuditEntry } from './privacy';

// Backward-compatible default: the single admin the routes hardcoded before
// this wave. ADMIN_EMAILS (comma-separated) overrides it when set.
export const ADMIN_EMAIL_FALLBACK = 'paulo.loureiro.shp@gmail.com';

/** The configured admin allow-list (raw, comma-separated) or '' when unset. */
export function getAdminAllowList(): string {
  // eslint-disable-next-line no-restricted-properties -- server-only allow-list, not a NEXT_PUBLIC env
  return process.env.ADMIN_EMAILS ?? '';
}

/** Stable, non-reversible 16-hex hash of a user id (same scheme as cli-token). */
export function userIdHash(userId: string): string {
  return createHash('sha256').update(String(userId)).digest('hex').slice(0, 16);
}

/**
 * Best-effort audit insert into mooter_admin_audit. NEVER throws and never
 * blocks the response — if the table is absent (migration 007 not applied yet)
 * or the request fails, it silently no-ops. Uses the admin's own access token
 * (RLS insert policy: admin_user_id = auth.uid()).
 */
export async function writeAudit(
  accessToken: string,
  adminUserId: string,
  entry: AuditEntry,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''; // eslint-disable-line no-restricted-properties
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''; // eslint-disable-line no-restricted-properties
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/mooter_admin_audit`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        admin_user_id: adminUserId,
        action: entry.action,
        target_user_id_hash: entry.target_user_id_hash,
        metadata: entry.metadata,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* best-effort — audit must never break the admin view */
  }
}
