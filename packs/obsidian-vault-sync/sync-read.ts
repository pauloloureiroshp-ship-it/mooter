// Obsidian sync — READ direction (Wave 31). vault/Mooter/preferences.md → Pastor priors.
// Lets the user steer Mooter from their vault: a simple Markdown file with `key: value`
// lines or `- key: value` bullets becomes structured priors written to
// ~/.mooter/pastor/vault-priors.json (which the router can consult). Self-contained.
//
// Recognised keys (all optional, case-insensitive):
//   preferred_lang: pt | en
//   prefer_adapter: <task_type>           (soft hint toward a per-task adapter)
//   avoid_adapter:  <task_type>
//   autoswap: true | false

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function mooterHome(): string {
  return process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0
    ? process.env.MOOTER_HOME
    : join(homedir(), ".mooter");
}

export interface VaultPriors {
  preferred_lang?: "pt" | "en";
  prefer_adapter?: string;
  avoid_adapter?: string;
  autoswap?: boolean;
  _source?: string;
  _read_at?: string;
}

const KEY_RE = /^[-*]?\s*([a-z_]+)\s*:\s*(.+?)\s*$/i;
const KNOWN = new Set(["preferred_lang", "prefer_adapter", "avoid_adapter", "autoswap"]);

/** Parse a preferences.md body into structured priors. Unknown keys are ignored. */
export function parsePreferences(md: string): VaultPriors {
  const priors: VaultPriors = {};
  for (const line of md.split("\n")) {
    const m = KEY_RE.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (!KNOWN.has(key)) continue;
    if (key === "autoswap") priors.autoswap = /^(true|yes|on|1)$/i.test(val);
    else if (key === "preferred_lang") {
      if (val === "pt" || val === "en") priors.preferred_lang = val;
    } else if (key === "prefer_adapter") priors.prefer_adapter = val;
    else if (key === "avoid_adapter") priors.avoid_adapter = val;
  }
  return priors;
}

export interface ReadResult {
  ok: boolean;
  priors: VaultPriors;
  reason?: string;
  written_to?: string;
}

/**
 * Read `<vault>/Mooter/preferences.md`, parse priors, and persist them to
 * ~/.mooter/pastor/vault-priors.json. Absent file → ok:false with empty priors
 * (never invents preferences). `now` injectable for deterministic tests.
 */
export function readPreferences(vaultPath: string, now: Date = new Date()): ReadResult {
  const file = join(vaultPath, "Mooter", "preferences.md");
  if (!existsSync(file)) {
    return { ok: false, priors: {}, reason: "no Mooter/preferences.md in vault (nothing to import)" };
  }
  const priors = parsePreferences(readFileSync(file, "utf8"));
  priors._source = file;
  priors._read_at = now.toISOString();

  const dir = join(mooterHome(), "pastor");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const out = join(dir, "vault-priors.json");
  writeFileSync(out, JSON.stringify(priors, null, 2) + "\n", "utf8");
  return { ok: true, priors, written_to: out };
}
