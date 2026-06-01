/**
 * supabase.ts — thin REST wrapper for frugal landing (v0.9.1).
 *
 * Intentionally does NOT depend on @supabase/supabase-js. All we need is
 * INSERT/UPSERT/SELECT via the REST endpoint with the anon key — which is
 * just `fetch` with a couple of headers. Saves ~300KB of bundled deps and
 * one vector for version mismatches.
 *
 * All calls are server-side only (from /api routes). The anon key is exposed
 * via NEXT_PUBLIC_ only so Vercel exposes it to the edge runtime; the actual
 * reads/writes happen from server code, not the browser.
 */

import { env } from './env';

export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const URL = SUPABASE_URL;
const KEY = SUPABASE_ANON_KEY;

function headers(extra: Record<string, string> = {}): HeadersInit {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export function isConfigured(): boolean {
  return Boolean(URL && KEY);
}

/**
 * INSERT a row. Returns the inserted row on success, or null on failure.
 * `Prefer: return=representation` asks PostgREST to echo the inserted row.
 */
export async function insert<T>(table: string, row: Record<string, unknown>): Promise<T | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as T[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * UPSERT a row by a conflict key. Used for url_analyses where we want to
 * refresh cached analyses rather than insert duplicates.
 */
export async function upsert<T>(
  table: string,
  row: Record<string, unknown>,
  onConflict: string
): Promise<T | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation,resolution=merge-duplicates' }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as T[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * COUNT rows in a table (for the waitlist counter).
 * Uses PostgREST's `Prefer: count=exact` + a 0-row range to avoid pulling
 * actual data.
 */
export async function count(table: string): Promise<number> {
  if (!isConfigured()) return 0;
  try {
    const res = await fetch(`${URL}/rest/v1/${table}?select=id`, {
      method: 'HEAD',
      headers: headers({ Prefer: 'count=exact', Range: '0-0' }),
      signal: AbortSignal.timeout(3000),
    });
    const range = res.headers.get('content-range'); // e.g. "0-0/42"
    if (!range) return 0;
    const total = range.split('/')[1];
    const n = parseInt(total, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * SELECT a single row by a column equality filter. Used by /api/analyse to
 * read the cached analysis before re-fetching the URL.
 */
export async function selectOne<T>(
  table: string,
  column: string,
  value: string
): Promise<T | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(
      `${URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}&limit=1`,
      {
        headers: headers(),
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as T[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Call a Postgres RPC (SECURITY DEFINER function) via PostgREST. When an
 * accessToken is given it is used as the bearer (so `auth.uid()` resolves to
 * that user); otherwise the anon key is used (for token-bearer functions where
 * the argument itself is the secret). Returns the parsed JSON, or null on any
 * failure. Wave 6 D2 — install tokens.
 */
export async function rpc<T>(
  fn: string,
  args: Record<string, unknown>,
  accessToken?: string,
): Promise<T | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${accessToken || KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/* ─── Auth helpers (magic link via Supabase GoTrue REST) ─── */

/**
 * Send a magic link OTP to the given email. The user clicks the link in
 * their inbox and gets redirected to `redirectTo`.
 */
export async function signInWithEmail(email: string, redirectTo: string): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    const res = await fetch(`${URL}/auth/v1/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ email, options: { emailRedirectTo: redirectTo } }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Exchange an auth code (from the magic link callback) for an access token.
 */
export async function exchangeCodeForSession(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string };
} | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${URL}/auth/v1/token?grant_type=authorization_code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Get the current user from an access token.
 */
export async function getUser(accessToken: string): Promise<{ id: string; email: string } | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: KEY },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Insert or update a profile row. Uses the user's own access token for RLS.
 */
export async function upsertProfile(
  accessToken: string,
  profile: Record<string, unknown>,
): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    const res = await fetch(`${URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(profile),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Read the current user's profile.
 */
export async function getProfile(accessToken: string, userId: string): Promise<Record<string, unknown> | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${URL}/rest/v1/profiles?id=eq.${userId}&limit=1`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Upsert a device row. Uses the user's access token for RLS.
 */
export async function upsertDevice(
  accessToken: string,
  device: Record<string, unknown>,
): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    const res = await fetch(`${URL}/rest/v1/devices?on_conflict=device_id`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(device),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch all devices for a user. Uses the user's access token for RLS.
 */
export async function getDevices(
  accessToken: string,
  userId: string,
): Promise<Record<string, unknown>[]> {
  if (!isConfigured()) return [];
  try {
    const res = await fetch(
      `${URL}/rest/v1/devices?user_id=eq.${userId}&order=last_sync_at.desc`,
      {
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * MP-18: Insert a snapshot into decisions_log for historical tracking.
 * Rate-limited: skips insert if last row for same device is < 5 min old.
 */
export async function insertDecisionsSnapshot(
  accessToken: string,
  userId: string,
  deviceId: string | null,
  data: { decisions: number; savings_usd: number },
): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    // Check last entry for this device — skip if < 5 min ago
    const filter = deviceId
      ? `user_id=eq.${encodeURIComponent(userId)}&device_id=eq.${encodeURIComponent(deviceId)}`
      : `user_id=eq.${encodeURIComponent(userId)}&device_id=is.null`;
    const checkRes = await fetch(
      `${URL}/rest/v1/decisions_log?${filter}&order=recorded_at.desc&limit=1`,
      {
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (checkRes.ok) {
      const rows = await checkRes.json();
      if (rows?.[0]?.recorded_at) {
        const lastTs = new Date(rows[0].recorded_at).getTime();
        if (Date.now() - lastTs < 5 * 60 * 1000) return false; // 5 min cooldown
      }
    }

    const res = await fetch(`${URL}/rest/v1/decisions_log`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        device_id: deviceId,
        decisions: data.decisions,
        savings_usd: data.savings_usd,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ─── GitHub OAuth helpers ─── */

/**
 * Redirect to GitHub OAuth via Supabase GoTrue.
 * Call from the browser (client-side only).
 */
export function signInWithGitHub() {
  const redirectTo = `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`;
  window.location.href =
    `${SUPABASE_URL}/auth/v1/authorize` +
    `?provider=github` +
    `&redirect_to=${encodeURIComponent(redirectTo)}` +
    `&scopes=read:user,public_repo`;
}

/**
 * Fetch GitHub profile metadata from the GitHub API.
 * Only reads public repo metadata — NEVER code or private repos.
 */
export async function getGitHubProfile(accessToken: string) {
  const repos = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  }).then(r => r.json());

  if (!Array.isArray(repos)) return null;

  const languages: Record<string, number> = {};
  for (const repo of repos) {
    if (repo.language) {
      languages[repo.language] = (languages[repo.language] || 0) + 1;
    }
  }

  const primaryLanguage = Object.entries(languages)
    .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || 'unknown';

  return {
    github_username: repos[0]?.owner?.login ?? null,
    primary_language: primaryLanguage,
    language_distribution: languages,
    public_repos_count: repos.length,
  };
}
