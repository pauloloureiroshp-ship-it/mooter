// `mooter quiet` — toggle the bash-command tier badges (Wave 2.5 Day 3).
//
// `mooter quiet`        → disable badges (preferences.json quiet=true)
// `mooter quiet --off`  → re-enable badges (quiet=false)
//
// The toggle is persisted to ~/.mooter/preferences.json, the same file
// tools/router/badge.js reads before emitting a <tier-badge>. Writing is a
// merge: unrelated fields (badge_position, statusline_view, future keys) are
// preserved so Day 4's confidence trail can extend the schema without conflict.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface Preferences {
  quiet: boolean;
  badge_position?: string;
  statusline_view?: string;
  [key: string]: unknown;
}

export interface QuietOptions {
  /** `--off` re-enables badges (quiet=false). */
  off?: boolean;
  /** Override the ~/.mooter root (tests). */
  mooterHome?: string;
}

const DEFAULT_PREFS: Preferences = {
  quiet: false,
  badge_position: "inline",
  statusline_view: "auto",
};

/** Load preferences.json, merging over defaults. Missing/bad file → defaults. */
export function loadPreferences(mooterHome: string): Preferences {
  try {
    const raw = readFileSync(join(mooterHome, "preferences.json"), "utf8");
    const obj = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULT_PREFS, ...obj, quiet: obj.quiet === true };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function runQuiet(opts: QuietOptions = {}): CmdResult {
  const mooterHome = opts.mooterHome ?? join(homedir(), ".mooter");
  const prefs = loadPreferences(mooterHome);
  prefs.quiet = !opts.off; // bare `quiet` enables quiet mode; `--off` disables it
  mkdirSync(mooterHome, { recursive: true });
  writeFileSync(join(mooterHome, "preferences.json"), JSON.stringify(prefs, null, 2) + "\n");
  return {
    exitCode: 0,
    output: prefs.quiet
      ? "✓ Badges disabled. Run `mooter quiet --off` to re-enable."
      : "✓ Badges enabled.",
  };
}
