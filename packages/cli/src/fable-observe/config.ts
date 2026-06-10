// Fable-observe config (Wave Mega 50-51 Phase 5) — ~/.mooter/fable-observe.json
//
// Opt-in observation loop. Disabled by default; nothing is written until the
// user runs `mooter fable-observe enable`. `store_prompts` is a SECOND opt-in:
// by default only the 16-hex task_hash of a prompt is kept, never the text.
// Pure node:fs — zero dependencies.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export interface FableObserveConfig {
  enabled: boolean;
  store_prompts: boolean;
}

export function defaultConfig(): FableObserveConfig {
  return { enabled: false, store_prompts: false };
}

export function configPath(home: string = homedir()): string {
  return join(home, ".mooter", "fable-observe.json");
}

export function observationsDir(home: string = homedir()): string {
  return join(home, ".mooter", "fable-observations");
}

/** Read config, merging over defaults; corrupt/missing file → defaults. */
export function readConfig(home: string = homedir()): FableObserveConfig {
  const base = defaultConfig();
  try {
    const raw = JSON.parse(readFileSync(configPath(home), "utf8")) as Record<string, unknown>;
    if (raw && typeof raw === "object") {
      if (typeof raw.enabled === "boolean") base.enabled = raw.enabled;
      if (typeof raw.store_prompts === "boolean") base.store_prompts = raw.store_prompts;
    }
  } catch {
    /* missing or corrupt → defaults */
  }
  return base;
}

export function writeConfig(cfg: FableObserveConfig, home: string = homedir()): void {
  const path = configPath(home);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}
