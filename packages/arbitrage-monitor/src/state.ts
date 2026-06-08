// Wave 33 (L11 / B.4) — arbitrage state + ADVISORY bias.
//
// State lives in ~/.mooter/arbitrage_state.json. Each poll appends to a small
// rolling history per provider; a provider is only flagged "avoid" after the
// SAME degraded/down health is confirmed `confirmThreshold` consecutive times
// (default 3) — this suppresses single-blip false signals. The resulting bias is
// ADVISORY ONLY: it names within-tier providers to prefer/avoid. It can NEVER
// change the tier classify.js assigned (doctrine: tier floor always wins).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Health, ProviderHealth } from "./monitor.ts";

export const DEFAULT_CONFIRM_THRESHOLD = 3;
export const HISTORY_LEN = 10;

export interface ProviderState {
  health: Health;
  /** most recent first, capped at HISTORY_LEN. */
  history: Health[];
  updatedAt: number;
}

export interface ArbitrageState {
  enabled: boolean;
  providers: Record<string, ProviderState>;
  updatedAt: number;
}

const EMPTY: ArbitrageState = { enabled: false, providers: {}, updatedAt: 0 };

function statePath(home: string): string {
  return join(home, ".mooter", "arbitrage_state.json");
}

export function readState(home = homedir()): ArbitrageState {
  try {
    return { ...EMPTY, ...JSON.parse(readFileSync(statePath(home), "utf8")) };
  } catch {
    return { ...EMPTY, providers: {} };
  }
}

function write(state: ArbitrageState, home: string): void {
  mkdirSync(join(home, ".mooter"), { recursive: true });
  writeFileSync(statePath(home), JSON.stringify(state, null, 2) + "\n");
}

/** Enable/disable the monitor (opt-in). */
export function setEnabled(on: boolean, home = homedir()): void {
  const s = readState(home);
  s.enabled = on;
  write(s, home);
}

export function isActive(home = homedir()): boolean {
  return readState(home).enabled === true;
}

/** Fold a poll result into the rolling history and persist. */
export function recordPoll(results: ProviderHealth[], opts: { home?: string; now?: number } = {}): ArbitrageState {
  const home = opts.home ?? homedir();
  const now = opts.now ?? Date.now();
  const s = readState(home);
  for (const r of results) {
    const prev = s.providers[r.id] ?? { health: "unknown", history: [], updatedAt: 0 };
    const history = [r.health, ...prev.history].slice(0, HISTORY_LEN);
    s.providers[r.id] = { health: r.health, history, updatedAt: now };
  }
  s.updatedAt = now;
  write(s, home);
  return s;
}

export interface BiasSuggestion {
  /** providers to avoid for within-tier model choice (degraded/down, confirmed). */
  avoid: string[];
  note: string;
}

/**
 * Derive the ADVISORY within-tier bias. A provider is avoided only when its last
 * `threshold` observations are all degraded or down (confirmed, not a blip).
 * Returns an empty avoid-list when the monitor is disabled. This NEVER returns a
 * tier — it only names providers to deprioritize within whatever tier classify.js
 * already chose.
 */
export function suggestBias(
  home = homedir(),
  opts: { threshold?: number } = {},
): BiasSuggestion {
  const s = readState(home);
  if (!s.enabled) return { avoid: [], note: "arbitrage monitor disabled." };
  const threshold = opts.threshold ?? DEFAULT_CONFIRM_THRESHOLD;
  const avoid: string[] = [];
  for (const [id, ps] of Object.entries(s.providers)) {
    if (ps.history.length < threshold) continue;
    const recent = ps.history.slice(0, threshold);
    if (recent.every((h) => h === "degraded" || h === "down")) avoid.push(id);
  }
  return {
    avoid,
    note: avoid.length
      ? `advisory: deprioritize ${avoid.join(", ")} within-tier (classify.js tier unchanged).`
      : "all monitored providers healthy.",
  };
}

/** Opt-in line-3 status chip. */
export function statusChip(home = homedir()): string | null {
  const s = readState(home);
  if (!s.enabled) return null;
  const bias = suggestBias(home);
  return bias.avoid.length ? `📊 arbitrage: avoid ${bias.avoid.join("/")}` : "📊 arbitrage active";
}
