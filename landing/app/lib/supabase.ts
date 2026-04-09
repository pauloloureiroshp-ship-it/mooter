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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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
