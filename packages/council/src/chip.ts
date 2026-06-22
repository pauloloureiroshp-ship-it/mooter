// Statusline / CLI chip for a council run. Pure + deterministic.
//
//   🏛 council 1.2s · $0.00 · saved ~100%
//
// "saved" compares the REAL council cost against an ESTIMATED all-Opus baseline
// (the paper's N× frontier). The baseline is explicitly an estimate (~) — never
// presented as measured. For an all-local council, real cost is $0 and the saved
// figure shows what a pure-Opus deliberation would have cost instead.

import type { CouncilVerdict } from "./types.ts";

/** Rough per-call Opus cost estimate (USD) for the all-Opus comparison baseline. */
export const OPUS_PER_CALL_EST = 0.06;

export interface ChipOptions {
  /** Override the all-Opus per-call estimate. */
  opusPerCallEst?: number;
}

function fmtUsd(x: number): string {
  if (x === 0) return "$0.00";
  if (x < 0.01) return `$${x.toFixed(4)}`;
  return `$${x.toFixed(2)}`;
}

function fmtSecs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Estimated cost of running the same deliberation entirely on Opus (every model
 * call). Honest estimate — labelled with ~ at the render site.
 */
export function allOpusBaselineUsd(verdict: CouncilVerdict, opusPerCall = OPUS_PER_CALL_EST): number {
  return Math.round(verdict.modelCalls * opusPerCall * 1e6) / 1e6;
}

/** The compact chip string. */
export function renderCouncilChip(verdict: CouncilVerdict, opts: ChipOptions = {}): string {
  const baseline = allOpusBaselineUsd(verdict, opts.opusPerCallEst ?? OPUS_PER_CALL_EST);
  const saved = baseline > 0 ? Math.max(0, Math.round(((baseline - verdict.costUsd) / baseline) * 100)) : 0;
  const savedStr = baseline > 0 ? ` · saved ~${saved}%` : "";
  return `🏛 council ${fmtSecs(verdict.latencyMs)} · ${fmtUsd(verdict.costUsd)}${savedStr}`;
}
