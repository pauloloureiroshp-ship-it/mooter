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
  /** Wave 2.6 Day 3 — Moo card per-turn (Stop hook). Default OFF (opt-in). */
  moo_card_enabled?: boolean;
  [key: string]: unknown;
}

export interface QuietOptions {
  /** `--off` re-enables badges (quiet=false). */
  off?: boolean;
  /** `--moo-card` enables the per-turn Moo card (Stop hook). */
  mooCard?: boolean;
  /** `--moo-card-off` disables the per-turn Moo card. */
  mooCardOff?: boolean;
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

  // Wave 2.6 Day 3 — Moo card toggle. When a --moo-card[-off] flag is present we
  // only touch moo_card_enabled and leave the badge `quiet` state alone (the two
  // toggles are independent). Other prefs are preserved by the load→merge→write.
  if (opts.mooCard || opts.mooCardOff) {
    prefs.moo_card_enabled = opts.mooCard === true && opts.mooCardOff !== true;
    mkdirSync(mooterHome, { recursive: true });
    writeFileSync(join(mooterHome, "preferences.json"), JSON.stringify(prefs, null, 2) + "\n");
    return {
      exitCode: 0,
      output: prefs.moo_card_enabled
        ? "✓ Moo card enabled. Run `mooter quiet --moo-card-off` to disable."
        : "✓ Moo card disabled.",
    };
  }

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
