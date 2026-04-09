/**
 * POST /api/analyse — detect platform/framework/LLM for a URL.
 *
 * Request:  { url: string }
 * Response: { url, platform, framework, llm_detected, savings_pct, cached }
 *
 * Flow:
 *   1. Validate URL (must be https://)
 *   2. Check cache in supabase url_analyses table (SELECT by url)
 *   3. If miss: fetch URL with 8s timeout, read up to 50KB, parse headers + HTML
 *   4. Upsert result into url_analyses (fail-open — if Supabase is down, still
 *      return the analysis result to the client)
 *
 * The fetch is NEVER given the user-provided URL as an auth bearer, path
 * component on our domain, or shell arg. It is used strictly for
 * `fetch(url)` with `AbortSignal.timeout()` and the result body is parsed
 * as plain text. No eval, no exec.
 */

import { NextRequest, NextResponse } from 'next/server';
import { upsert, selectOne } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Fixed at 89% — the real replay result on 1,437 prompts. DO NOT make this
// dynamic; inventing a per-user number would be misleading.
const SAVINGS_PCT = 89;

type AnalyseResult = {
  url: string;
  platform: string;
  framework: string;
  llm_detected: boolean;
  savings_pct: number;
  cached: boolean;
  error?: string;
};

// Real Supabase url_analyses schema (discovered during smoke test):
//   url, platform, language, framework, has_llm, llm_providers, raw_signals,
//   savings_est, analysed_at
// The client-facing API shape uses llm_detected/savings_pct (friendlier),
// so we map at the DB boundary.
type CachedRow = {
  url: string;
  platform: string | null;
  framework: string | null;
  has_llm: boolean | null;
  savings_est: number | null;
  analysed_at: string;
};

// Cache TTL: 24h. Older entries get re-analysed.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isHttpsUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function detectPlatform(headers: Headers, url: string): string {
  const h = (k: string) => headers.get(k) || '';
  if (h('x-vercel-id') || h('server').toLowerCase().includes('vercel')) return 'Vercel';
  if (h('x-railway-request-id')) return 'Railway';
  if (h('x-nf-request-id') || h('server').toLowerCase().includes('netlify')) return 'Netlify';
  if (h('x-github-request-id') || /github\.io$/.test(new URL(url).hostname)) return 'GitHub Pages';
  if (h('cf-ray') && h('server').toLowerCase().includes('cloudflare')) return 'Cloudflare';
  if (h('server').toLowerCase().includes('fly')) return 'Fly.io';
  return 'Unknown';
}

function detectFramework(html: string): string {
  // Order matters — check most specific first.
  if (/\/_next\//.test(html) || /<meta[^>]+name=["']next-head-count["']/i.test(html)) return 'Next.js';
  if (/__remixContext|\/build\/_remix\//.test(html)) return 'Remix';
  if (/__NUXT__|\/_nuxt\//.test(html)) return 'Nuxt';
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']Gatsby/i.test(html)) return 'Gatsby';
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']Hugo/i.test(html)) return 'Hugo';
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']Astro/i.test(html)) return 'Astro';
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']SvelteKit/i.test(html)) return 'SvelteKit';
  if (/\/assets\/.+\.js/.test(html) && /type="module"/.test(html)) return 'Vite';
  if (/\/static\/js\/main\.[a-f0-9]+\.chunk\.js/.test(html)) return 'Create React App';
  if (/data-reactroot/.test(html)) return 'React (generic)';
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i.test(html)) {
    const m = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
    return m ? m[1].split(/\s/)[0] : 'Unknown';
  }
  return 'Unknown';
}

function detectLlmUsage(html: string): boolean {
  return /\b(anthropic|openai|claude|gpt-4|llm|language[- ]?model)\b/i.test(html);
}

async function fetchLimited(url: string, maxBytes: number, timeoutMs: number) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'User-Agent': 'frugal-landing/0.9.1 (+https://github.com/pauloloureiroshp-ship-it/frugal)',
    },
    redirect: 'follow',
  });
  if (!res.ok || !res.body) {
    return { headers: res.headers, html: '', status: res.status };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let html = '';
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    html += decoder.decode(value, { stream: true });
  }
  try { await reader.cancel(); } catch { /* noop */ }
  return { headers: res.headers, html, status: res.status };
}

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const url = (body.url || '').trim();
  if (!url || !isHttpsUrl(url)) {
    return NextResponse.json(
      { error: 'invalid_url', hint: 'URL must start with https://' },
      { status: 400 }
    );
  }

  // Cache check
  const cached = await selectOne<CachedRow>('url_analyses', 'url', url);
  if (cached) {
    const age = Date.now() - new Date(cached.analysed_at).getTime();
    if (age < CACHE_TTL_MS) {
      return NextResponse.json({
        url,
        platform: cached.platform || 'Unknown',
        framework: cached.framework || 'Unknown',
        llm_detected: cached.has_llm === true,
        savings_pct: cached.savings_est != null ? Number(cached.savings_est) : SAVINGS_PCT,
        cached: true,
      } satisfies AnalyseResult);
    }
  }

  // Fresh fetch
  let platform = 'Unknown';
  let framework = 'Unknown';
  let llm_detected = false;
  let fetchError: string | undefined;
  try {
    const { headers, html } = await fetchLimited(url, 50_000, 8000);
    platform = detectPlatform(headers, url);
    framework = detectFramework(html);
    llm_detected = detectLlmUsage(html);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'unreachable';
  }

  // Persist (fail-open — upsert returns null on Supabase errors).
  // Column names match the real Supabase schema: has_llm + savings_est.
  await upsert(
    'url_analyses',
    {
      url,
      platform,
      framework,
      has_llm: llm_detected,
      savings_est: SAVINGS_PCT,
      analysed_at: new Date().toISOString(),
    },
    'url'
  );

  const result: AnalyseResult = {
    url,
    platform,
    framework,
    llm_detected,
    savings_pct: SAVINGS_PCT,
    cached: false,
  };
  if (fetchError) result.error = 'unreachable';

  // Always 200 — UX priority. Client shows the error field if present.
  return NextResponse.json(result);
}
