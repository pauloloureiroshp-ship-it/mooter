/**
 * GET /api/tuning — current router-tuning.json contents.
 *
 * Adds a plain-language "explanation" for each pattern so the dashboard can
 * render a friendlier preview than the raw signature text. This is pure
 * heuristic — if the signature looks like a question, we explain it as
 * "matches prompts starting with 'how do I ...'"-style.
 */

import { NextResponse } from 'next/server';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { tuningPath } from '@/app/lib/paths';

export const dynamic = 'force-dynamic';

type TuningFile = {
  generated_at?: string;
  sample_size?: number;
  complexity_threshold?: number;
  promote_to_t0_patterns?: string[];
  demote_from_t3_patterns?: string[];
  notes?: string[];
};

function explainPattern(pattern: string): string {
  const words = pattern.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'matches empty signature (no-op)';
  if (words[0] === 'commit') return 'matches commit message / diff requests';
  if (words[0] === 'explain') return 'matches explanation requests';
  if (words[0] === 'summarize' || words[0] === 'summarise') return 'matches summarization requests';
  if (words[0] === 'refactor') return 'matches refactor requests (will be kept at T3 by HIGH_RISK guard)';
  if (words[0] === 'fix') return 'matches fix-it requests';
  return `matches prompts starting with "${words.join(' ')}"`;
}

export async function GET() {
  const p = tuningPath();
  if (!existsSync(p)) {
    return NextResponse.json(
      { error: 'tuning_missing', path: p, hint: 'Run `node tools/router/backtest.js` first.' },
      { status: 404 }
    );
  }
  try {
    const raw = readFileSync(p, 'utf8');
    const data = JSON.parse(raw) as TuningFile;
    const stat = statSync(p);

    const promote = (data.promote_to_t0_patterns || []).map((pattern) => ({
      pattern,
      explanation: explainPattern(pattern),
    }));
    const demote = (data.demote_from_t3_patterns || []).map((pattern) => ({
      pattern,
      explanation: explainPattern(pattern),
    }));

    return NextResponse.json({
      path: p,
      mtime: stat.mtime.toISOString(),
      generated_at: data.generated_at,
      sample_size: data.sample_size,
      complexity_threshold: data.complexity_threshold,
      promote,
      demote,
      notes: data.notes || [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'tuning_parse_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
