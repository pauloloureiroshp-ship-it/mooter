// Wave 14 Day 2 — pure state-derivation helpers for the signed-in dashboard.
// landing vitest is node-env (no React testing library), so the logic that
// decides "is this data live / outdated / demo" and "which Ollama models are
// already installed" lives here as pure functions and is unit-tested directly.

export type HeroSource = 'live' | 'outdated' | 'demo';

/** A heartbeat older than this (in days) is treated as outdated. */
export const HERO_STALE_DAYS = 7;

/**
 * F-4 — classify the stats hero's data source from the last sync time.
 * - no data / no sync timestamp        → 'demo'
 * - last sync within HERO_STALE_DAYS   → 'live'
 * - last sync older than that          → 'outdated'
 * Pure: accepts `nowMs` for deterministic tests.
 */
export function heroDataSource(
  lastSyncIso: string | null | undefined,
  hasData: boolean,
  nowMs: number = Date.now(),
): HeroSource {
  if (!hasData || !lastSyncIso) return 'demo';
  const ms = Date.parse(lastSyncIso);
  if (!Number.isFinite(ms)) return 'demo';
  const days = Math.floor((nowMs - ms) / 86_400_000);
  return days > HERO_STALE_DAYS ? 'outdated' : 'live';
}

interface DeviceLike {
  ollama_models?: string[] | null;
}
interface ProfileLike {
  devices?: DeviceLike[] | null;
}

/**
 * F-6 — the set of Ollama models actually reported installed across the user's
 * devices (real sync payload, not the legacy `frugal_config.ollama_has_*`
 * booleans). Deduped, order-stable. Returns the exact tags Ollama reports
 * (e.g. "qwen3:30b").
 */
export function installedOllamaModels(profile: ProfileLike | null | undefined): string[] {
  const seen = new Set<string>();
  for (const d of profile?.devices ?? []) {
    for (const m of d?.ollama_models ?? []) {
      if (typeof m === 'string' && m.trim()) seen.add(m.trim());
    }
  }
  return [...seen];
}

/**
 * True when `model` is present in the installed set. Ollama tags are matched
 * exactly first (e.g. "qwen3:30b"); we also accept a match on the repository
 * name before the ":" so "qwen3:30b" satisfies a recommendation written as
 * "qwen3" and vice-versa. We never loosely match across different repos.
 */
export function isModelInstalled(installed: string[], model: string): boolean {
  if (!model) return false;
  const want = model.trim();
  if (installed.includes(want)) return true;
  // An untagged recommendation (just the repo name) is satisfied by any tag of it.
  if (!want.includes(':')) return installed.some((m) => m.split(':')[0] === want);
  return false;
}
