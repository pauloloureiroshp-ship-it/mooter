/**
 * GET /api/decisions — paginated read of decisions.log.
 *
 * Query params:
 *   - window: '1h' | '24h' | '7d' | '30d' | 'all'  (default: '24h')
 *   - tier:   'T0' | 'T1' | 'T2' | 'T3'            (optional filter)
 *   - category: string                              (optional filter)
 *   - min_conf: number 0..1                         (optional filter)
 *   - max_conf: number 0..1                         (optional filter)
 *   - limit:  number                                (default: 500, max: 5000)
 *
 * Returns the most recent N entries (newest first) that match the filters,
 * each with only fields safe to display. NEVER returns the prompt_preview
 * beyond the first 120 chars — matches the tracker's existing convention.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'node:fs';
import { decisionsLogPath } from '@/app/lib/paths';

export const dynamic = 'force-dynamic';

type DecisionEntry = {
  ts: string;
  ts_ms?: number;
  event: string;
  prompt_len?: number;
  prompt_preview?: string;
  tier?: string;
  task_category?: string;
  recommended_backend?: string;
  recommended_model?: string;
  confidence?: number;
  escalation_rule?: string;
  arbiter_honored?: boolean | null;
  cache_hit?: boolean;
};

const WINDOW_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  all: Number.POSITIVE_INFINITY,
};

function safeParse(line: string): DecisionEntry | null {
  try {
    return JSON.parse(line) as DecisionEntry;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const windowKey = url.searchParams.get('window') || '24h';
  const tier = url.searchParams.get('tier');
  const category = url.searchParams.get('category');
  const minConf = parseFloat(url.searchParams.get('min_conf') || '0');
  const maxConf = parseFloat(url.searchParams.get('max_conf') || '1');
  const limit = Math.min(5000, parseInt(url.searchParams.get('limit') || '500', 10));

  const logPath = decisionsLogPath();
  if (!existsSync(logPath)) {
    return NextResponse.json({ error: 'log_missing', path: logPath }, { status: 404 });
  }

  let raw: string;
  try {
    raw = readFileSync(logPath, 'utf8');
  } catch (err) {
    return NextResponse.json(
      { error: 'log_read_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const cutoff = Date.now() - (WINDOW_MS[windowKey] ?? WINDOW_MS['24h']);

  // Walk the log backward for efficiency — we want the newest entries.
  const results: DecisionEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
    const entry = safeParse(lines[i]);
    if (!entry || entry.event !== 'classified') continue;
    const tsMs = entry.ts_ms ?? (entry.ts ? Date.parse(entry.ts) : 0);
    if (tsMs < cutoff) break; // log is append-only, older entries follow
    if (tier && entry.tier !== tier) continue;
    if (category && entry.task_category !== category) continue;
    const conf = entry.confidence ?? 0;
    if (conf < minConf || conf > maxConf) continue;
    results.push({
      ts: entry.ts,
      ts_ms: tsMs,
      event: entry.event,
      prompt_len: entry.prompt_len,
      prompt_preview: (entry.prompt_preview || '').slice(0, 120),
      tier: entry.tier,
      task_category: entry.task_category,
      recommended_backend: entry.recommended_backend,
      recommended_model: entry.recommended_model,
      confidence: entry.confidence,
      escalation_rule: entry.escalation_rule,
      arbiter_honored: entry.arbiter_honored,
      cache_hit: entry.cache_hit,
    });
  }

  return NextResponse.json({
    window: windowKey,
    total: results.length,
    decisions: results,
  });
}
