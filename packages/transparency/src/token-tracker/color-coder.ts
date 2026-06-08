// Wave 32 (Phase C) — tier/backend color + glyph vocabulary for the inline
// token-tracker prefix. Mirrors the statusline palette (T0 green → T3 red,
// free → expensive) so the two surfaces tell the same story.
//
// Color honors NO_COLOR / MOOTER_NO_COLOR / TERM=dumb (same gate as the
// statusline) so plain terminals and test snapshots get bare text.

export type Tier = "T0" | "T1" | "T2" | "T3";
export type Backend = "local" | "cloud";

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  // 256-color orange (208) for T2 — distinct from the blue/yellow neighbours.
  orange: "\x1b[38;5;208m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
} as const;

/** T0 green · T1 blue · T2 orange · T3 red — free → expensive. */
export const TIER_COLOR: Record<Tier, string> = {
  T0: ANSI.green,
  T1: ANSI.blue,
  T2: ANSI.orange,
  T3: ANSI.red,
};

/** Emoji circle echoing the tier color (degrades to a glyph in no-color mode). */
export const TIER_DOT: Record<Tier, string> = {
  T0: "🟢",
  T1: "🔵",
  T2: "🟠",
  T3: "🔴",
};

export const BACKEND_GLYPH: Record<Backend, string> = {
  local: "🏠",
  cloud: "☁️",
};

export function useColor(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.NO_COLOR && !env.MOOTER_NO_COLOR && env.TERM !== "dumb";
}

export function colorize(code: string, s: string, on: boolean = useColor()): string {
  return on && code ? `${code}${s}${ANSI.reset}` : String(s);
}

export function dim(s: string, on: boolean = useColor()): string {
  return colorize(ANSI.dim, s, on);
}

export { ANSI };
