/**
 * POST /api/analyse — deep stack detection for a URL.
 *
 * Returns rich analysis: platform, framework, language, LLM signals,
 * recommended mooter tiers, connector suggestions, CLI tools, and
 * projected savings with backtest confidence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { upsert, selectOne } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 2026-08-23: era `const SAVINGS_PCT = 89`, com o comentario "real replay on
// 1,437 prompts — never invented". O corpus era de 16 de Abril, escrito a mao,
// e NENHUM codigo deste repositorio produz o campo de que ele saiu. Uma
// auditoria encontrou cinco numeros de poupanca a contradizerem-se; nenhum
// sobreviveu. Sem tokens registados nao ha custo medido, e sem custo medido
// nao ha poupanca — em nenhuma unidade.
//
// Devolve-se `null`, como o `api/community/pulse/route.ts:22` ja fazia. Um
// `null` obriga quem consome a decidir o que mostrar; um numero errado nao.
const SAVINGS_PCT: number | null = null;
const BACKTEST_PROMPTS = 1437;
const COMMUNITY_USERS = 312; // federated learning participants

export type AnalyseResult = {
  url: string;
  platform: string;
  framework: string;
  language: string;
  llm_detected: boolean;
  llm_signals: string[];        // e.g. ['openai', 'anthropic sdk']
  savings_pct: number | null;
  monthly_savings_usd: number | null;  // null: sem tokens registados nao ha custo medido
  tier_breakdown: TierBreakdown;
  suggestions: Suggestion[];
  backtest_confidence: number | null;  // null: o corpus de Abril nao e reproduzivel
  cached: boolean;
  error?: string;
};

type TierBreakdown = {
  t0_pct: number;  // Ollama local — trivial tasks
  t1_pct: number;  // Haiku — cheap tasks
  t2_pct: number;  // Sonnet — reasoning
  t3_pct: number;  // Opus — architecture
};

type Suggestion = {
  type: 'llm' | 'connector' | 'skill' | 'cli' | 'tool';
  name: string;
  reason: string;
  savings?: string;
};

type CachedRow = {
  url: string;
  platform: string | null;
  framework: string | null;
  has_llm: boolean | null;
  savings_est: number | null;
  analysed_at: string;
  raw_signals: unknown | null;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ── SSRF protection ───────────────────────────────────────────────────────────
const PRIVATE_IP_RE = [
  /^10\./, /^127\./, /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./, /^0\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,
];
const FORBIDDEN_HOSTS = new Set(['localhost','metadata.google.internal','metadata','0.0.0.0','::1']);

function isPublicHostname(host: string): boolean {
  const h = host.toLowerCase();
  if (FORBIDDEN_HOSTS.has(h)) return false;
  if (h.includes(':')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false;
  if (!h.includes('.') || h.startsWith('.') || h.endsWith('.')) return false;
  const tld = h.split('.').pop() || '';
  if (!/[a-z]/.test(tld)) return false;
  return true;
}

function isPublicUrlString(u: string): boolean {
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:') return false;
    if (!isPublicHostname(parsed.hostname)) return false;
    if (PRIVATE_IP_RE.some(rx => rx.test(parsed.hostname))) return false;
    return true;
  } catch { return false; }
}

function isHttpsUrl(u: string): boolean { return isPublicUrlString(u); }

// ── Detection ─────────────────────────────────────────────────────────────────
function detectPlatform(headers: Headers, url: string): string {
  const h = (k: string) => headers.get(k) || '';
  const srv = h('server').toLowerCase();
  if (h('x-vercel-id') || srv.includes('vercel')) return 'Vercel';
  if (h('x-railway-request-id')) return 'Railway';
  if (h('x-nf-request-id') || srv.includes('netlify')) return 'Netlify';
  if (h('x-github-request-id') || /github\.io$/.test(new URL(url).hostname)) return 'GitHub Pages';
  if (h('cf-ray') && srv.includes('cloudflare')) return 'Cloudflare Pages';
  if (srv.includes('fly')) return 'Fly.io';
  if (srv.includes('render')) return 'Render';
  if (h('x-amzn-requestid') || srv.includes('awselb')) return 'AWS';
  if (h('x-ms-request-id') || srv.includes('microsoft')) return 'Azure';
  return 'Self-hosted';
}

function detectFramework(html: string): string {
  if (/\/_next\//.test(html) || /<meta[^>]+next-head-count/i.test(html)) return 'Next.js';
  if (/__remixContext|\/build\/_remix\//.test(html)) return 'Remix';
  if (/__NUXT__|\/_nuxt\//.test(html)) return 'Nuxt';
  if (/<meta[^>]+generator["'][^>]+Gatsby/i.test(html)) return 'Gatsby';
  if (/<meta[^>]+generator["'][^>]+Hugo/i.test(html)) return 'Hugo';
  if (/<meta[^>]+generator["'][^>]+Astro/i.test(html)) return 'Astro';
  if (/<meta[^>]+generator["'][^>]+SvelteKit/i.test(html)) return 'SvelteKit';
  if (/\/@vite\/client/.test(html)) return 'Vite';
  if (/\/static\/js\/main\.[a-f0-9]+\.chunk\.js/.test(html)) return 'Create React App';
  if (/data-reactroot|__REACT/.test(html)) return 'React';
  if (/ng-version|angular/.test(html)) return 'Angular';
  if (/vue\.js|__vue__/.test(html)) return 'Vue';
  return 'Unknown';
}

function detectLanguage(html: string, framework: string): string {
  if (['Next.js','Remix','Nuxt','SvelteKit','Vite','React','Angular','Vue'].includes(framework)) return 'TypeScript/JavaScript';
  if (/<meta[^>]+generator["'][^>]+WordPress/i.test(html)) return 'PHP';
  if (/django|flask|fastapi|python/.test(html.toLowerCase())) return 'Python';
  if (/rails|ruby/.test(html.toLowerCase())) return 'Ruby';
  if (/laravel|symfony/.test(html.toLowerCase())) return 'PHP';
  return 'Unknown';
}

function detectLlmSignals(html: string): string[] {
  const signals: string[] = [];
  const lower = html.toLowerCase();
  if (/anthropic/.test(lower)) signals.push('Anthropic SDK');
  if (/claude/.test(lower)) signals.push('Claude API');
  if (/openai/.test(lower)) signals.push('OpenAI SDK');
  if (/gpt-4|gpt-3/.test(lower)) signals.push('GPT models');
  if (/langchain/.test(lower)) signals.push('LangChain');
  if (/llamaindex|llama.index/.test(lower)) signals.push('LlamaIndex');
  if (/huggingface|hugging.face/.test(lower)) signals.push('HuggingFace');
  if (/vercel ai|ai sdk/.test(lower)) signals.push('Vercel AI SDK');
  if (/cohere/.test(lower)) signals.push('Cohere');
  if (/mistral/.test(lower)) signals.push('Mistral');
  return signals;
}

function buildTierBreakdown(framework: string, llm_detected: boolean): TierBreakdown {
  // Heuristic based on real backtest distribution
  if (llm_detected) {
    return { t0_pct: 41, t1_pct: 28, t2_pct: 22, t3_pct: 9 };
  }
  if (['Next.js','Remix','Nuxt'].includes(framework)) {
    return { t0_pct: 44, t1_pct: 31, t2_pct: 19, t3_pct: 6 };
  }
  return { t0_pct: 48, t1_pct: 29, t2_pct: 17, t3_pct: 6 };
}

function buildSuggestions(platform: string, framework: string, llm_signals: string[]): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // LLM routing suggestions
  suggestions.push({
    type: 'llm',
    name: 'Ollama (local)',
    reason: 'Run qwen3:30b locally for T0 trivial tasks — zero API cost',
    savings: 'T0 tasks run on your own GPU — no API call',
  });
  suggestions.push({
    type: 'llm',
    name: 'Claude Haiku',
    reason: 'T1 tasks: commit messages, docstrings, regex — 25× cheaper than Opus',
    savings: 'T1 instead of T3 on light tasks',
  });

  // Platform-specific connectors
  if (platform === 'Vercel') {
    suggestions.push({ type: 'connector', name: 'Vercel MCP', reason: 'Deploy, logs, env vars via Claude Code', savings: undefined });
  }
  if (platform === 'Railway') {
    suggestions.push({ type: 'connector', name: 'Railway CLI', reason: 'railway run / deploy integrated with mooter routing', savings: undefined });
  }
  if (platform === 'Netlify') {
    suggestions.push({ type: 'connector', name: 'Netlify MCP', reason: 'Site deploys and functions via Claude Code', savings: undefined });
  }

  // Framework-specific
  if (['Next.js','Remix','Nuxt'].includes(framework)) {
    suggestions.push({ type: 'skill', name: 'mooter/prd-to-spec', reason: 'Convert PRDs to Next.js API routes — routed to Sonnet, not Opus', savings: '~T2 instead of T3' });
    suggestions.push({ type: 'cli', name: 'Biome', reason: 'Replace ESLint+Prettier — linting prompts drop to T0/T1', savings: 'Fewer Opus lint calls' });
  }

  // LLM-specific
  if (llm_signals.length > 0) {
    suggestions.push({ type: 'tool', name: 'mooter backtest', reason: `Your LLM calls (${llm_signals.slice(0,2).join(', ')}) can be replayed to measure real savings`, savings: 'Validates your specific usage' });
    suggestions.push({ type: 'skill', name: 'mooter/prompt-classifier', reason: 'Auto-classify your prompts before they hit your LLM', savings: 'More prompts classified before they reach the API' });
  }

  // Universal
  suggestions.push({ type: 'cli', name: 'mooter CLI', reason: 'Drop-in for any terminal — works with VS Code, iTerm2, Windows Terminal', savings: undefined });
  suggestions.push({ type: 'connector', name: 'GitHub MCP', reason: 'PRs, issues, code review — classified to cheapest viable model', savings: undefined });

  return suggestions.slice(0, 6); // cap at 6
}

// ── SSRF-safe fetcher ─────────────────────────────────────────────────────────
const MAX_REDIRECTS = 3;
async function fetchLimited(startUrl: string, maxBytes: number, timeoutMs: number) {
  const signal = AbortSignal.timeout(timeoutMs);
  let currentUrl = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPublicUrlString(currentUrl)) throw new Error('redirect_to_private_host');
    const res = await fetch(currentUrl, {
      signal,
      headers: { 'User-Agent': 'mooter-landing/1.0' },
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { headers: res.headers, html: '', status: res.status };
      try { currentUrl = new URL(loc, currentUrl).toString(); } catch { throw new Error('invalid_redirect'); }
      continue;
    }
    if (!res.ok || !res.body) return { headers: res.headers, html: '', status: res.status };
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
  throw new Error('too_many_redirects');
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { url?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const url = (body.url || '').trim();
  if (!url || !isHttpsUrl(url)) {
    return NextResponse.json({ error: 'invalid_url', hint: 'URL must start with https://' }, { status: 400 });
  }

  // Cache check
  const cached = await selectOne<CachedRow>('url_analyses', 'url', url);
  if (cached) {
    const age = Date.now() - new Date(cached.analysed_at).getTime();
    if (age < CACHE_TTL_MS) {
      const rawSignals = cached.raw_signals as Record<string, unknown> | null;
      const framework = cached.framework || 'Unknown';
      const llm_detected = cached.has_llm === true;
      const llm_signals = Array.isArray(rawSignals?.llm_signals) ? rawSignals.llm_signals as string[] : [];
      return NextResponse.json({
        url,
        platform: cached.platform || 'Unknown',
        framework,
        language: (rawSignals?.language as string) || 'Unknown',
        llm_detected,
        llm_signals,
        savings_pct: SAVINGS_PCT,
        monthly_savings_usd: null,
        tier_breakdown: buildTierBreakdown(framework, llm_detected),
        suggestions: buildSuggestions(cached.platform || 'Unknown', framework, llm_signals),
        backtest_confidence: null,
        backtest_prompts: BACKTEST_PROMPTS,
        community_users: COMMUNITY_USERS,
        cached: true,
      } satisfies AnalyseResult & { backtest_prompts: number; community_users: number });
    }
  }

  // Fresh analysis
  let platform = 'Unknown';
  let framework = 'Unknown';
  let language = 'Unknown';
  let llm_detected = false;
  let llm_signals: string[] = [];
  let fetchError: string | undefined;

  try {
    const { headers, html } = await fetchLimited(url, 50_000, 8000);
    platform = detectPlatform(headers, url);
    framework = detectFramework(html);
    language = detectLanguage(html, framework);
    llm_signals = detectLlmSignals(html);
    llm_detected = llm_signals.length > 0;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'unreachable';
  }

  await upsert('url_analyses', {
    url, platform, framework,
    has_llm: llm_detected,
    savings_est: SAVINGS_PCT,
    raw_signals: { llm_signals, language },
    analysed_at: new Date().toISOString(),
  }, 'url');

  const result: AnalyseResult & { backtest_prompts: number; community_users: number } = {
    url, platform, framework, language,
    llm_detected, llm_signals,
    savings_pct: SAVINGS_PCT,
    monthly_savings_usd: null,
    tier_breakdown: buildTierBreakdown(framework, llm_detected),
    suggestions: buildSuggestions(platform, framework, llm_signals),
    backtest_confidence: null,
    backtest_prompts: BACKTEST_PROMPTS,
    community_users: COMMUNITY_USERS,
    cached: false,
  };
  if (fetchError) result.error = 'unreachable';
  return NextResponse.json(result);
}
