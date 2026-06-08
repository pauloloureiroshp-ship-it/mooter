// Wave 32 (Phase C) — the inline per-command token-tracker prefix.
//
//   [T0 🏠 qwen 145ms · 384 tok · $0]
//   [T2 ☁️ Opus 380ms · 1.2k tok · $0.0094]
//
// Honest by construction: tokens/cost come from the caller's measured values.
// A pure-local CLI op that calls no model is genuinely [T0 🏠 local 12ms · 0 tok
// · $0] — that is accurate, not a placeholder. Cost is never invented: $0 prints
// as "$0" (not "$0.0000") and a missing cost is omitted rather than faked.

import { Tier, Backend, TIER_COLOR, TIER_DOT, BACKEND_GLYPH, colorize, useColor } from "./color-coder.ts";

export interface TrackInfo {
  tier: Tier;
  backend: Backend;
  /** short model/provider label, e.g. "qwen", "Opus", "local" */
  model: string;
  /** wall-clock milliseconds */
  ms: number;
  /** total tokens (in + out); 0 for pure-local ops that call no model */
  tokens: number;
  /** USD cost; 0 for local/free, omitted from output only when undefined */
  costUsd?: number;
}

/** 1898286 → "1.9M", 13300 → "13.3k", 384 → "384". */
export function fmtTokens(n: number): string {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
}

/** $0 stays "$0"; sub-cent keeps 4 dp ($0.0094); else 2 dp ($1.20). */
export function fmtCost(usd: number): string {
  const v = Number(usd) || 0;
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

/** Round ms to an integer; clamp negatives to 0 (clock skew safety). */
export function fmtMs(ms: number): string {
  return `${Math.max(0, Math.round(Number(ms) || 0))}ms`;
}

/**
 * Render the full prefix tag. Color is applied to the tier token only (the dot
 * already carries hue) so the line stays readable; pass `color:false` for tests
 * and plain terminals.
 */
export function formatPrefix(info: TrackInfo, opts: { color?: boolean } = {}): string {
  const on = opts.color ?? useColor();
  const tier = colorize(TIER_COLOR[info.tier], info.tier, on);
  const dot = TIER_DOT[info.tier];
  const glyph = BACKEND_GLYPH[info.backend];
  const parts = [`${fmtMs(info.ms)}`, `${fmtTokens(info.tokens)} tok`];
  if (info.costUsd !== undefined) parts.push(fmtCost(info.costUsd));
  return `[${dot} ${tier} ${glyph} ${info.model} ${parts.join(" · ")}]`;
}

/**
 * Plain (no-color, no-emoji) form for logs and assertions:
 *   "[T2 cloud Opus 380ms · 1.2k tok · $0.0094]"
 */
export function formatPrefixPlain(info: TrackInfo): string {
  const parts = [fmtMs(info.ms), `${fmtTokens(info.tokens)} tok`];
  if (info.costUsd !== undefined) parts.push(fmtCost(info.costUsd));
  return `[${info.tier} ${info.backend} ${info.model} ${parts.join(" · ")}]`;
}
