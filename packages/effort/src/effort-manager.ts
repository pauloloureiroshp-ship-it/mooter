// Wave 32 (Phase NEW2) — effort manager: read/write ~/.mooter/effort.json and
// resolve a mode to its config. Pure given an injectable home dir (tests).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { EffortConfig, EffortMode } from "./types.ts";
import { LOW } from "./modes/low.ts";
import { DEFAULT } from "./modes/default.ts";
import { HIGH } from "./modes/high.ts";
import { ULTRAMOO } from "./modes/ultramoo.ts";

export const MODES: Record<EffortMode, EffortConfig> = {
  low: LOW,
  default: DEFAULT,
  high: HIGH,
  ultramoo: ULTRAMOO,
};

export const MODE_NAMES: EffortMode[] = ["low", "default", "high", "ultramoo"];

export function isEffortMode(s: string): s is EffortMode {
  return (MODE_NAMES as string[]).includes(s);
}

/** Canonical config for a mode (frozen copy so callers can't mutate the table). */
export function configForMode(mode: EffortMode): EffortConfig {
  return { ...MODES[mode], costCap: { ...MODES[mode].costCap } };
}

export function effortPath(home = homedir()): string {
  return join(home, ".mooter", "effort.json");
}

/** Current mode, defaulting to "default" when the file is absent/garbage. */
export function getEffortMode(home = homedir()): EffortMode {
  try {
    const raw = JSON.parse(readFileSync(effortPath(home), "utf8"));
    if (raw && isEffortMode(raw.mode)) return raw.mode;
  } catch { /* fall through */ }
  return "default";
}

/** Current resolved config. */
export function getEffort(home = homedir()): EffortConfig {
  return configForMode(getEffortMode(home));
}

/** Persist a mode (writes the full resolved config so consumers read flat flags). */
export function setEffort(mode: EffortMode, opts: { home?: string; now?: number } = {}): EffortConfig {
  const home = opts.home ?? homedir();
  const cfg = configForMode(mode);
  mkdirSync(join(home, ".mooter"), { recursive: true });
  writeFileSync(effortPath(home), JSON.stringify({ ...cfg, updated_at: opts.now ?? 0 }, null, 2) + "\n");
  return cfg;
}

/** Reset to "default". */
export function resetEffort(opts: { home?: string; now?: number } = {}): EffortConfig {
  return setEffort("default", opts);
}
