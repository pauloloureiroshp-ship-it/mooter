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
import { buildConsent, getLocalSecret } from "../consent.ts";

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
  /** `--telemetry-off` revokes telemetry consent (writes consent.json off). */
  telemetryOff?: boolean;
  /** `--sync-cadence=<daily|weekly|manual-only>` sets the sync schedule cadence. */
  syncCadence?: string;
  /** Wave 5 D3 — `--hide-<chip>` adds a chip to hidden_chips; `--show-all` clears. */
  hideChips?: string[];
  showAll?: boolean;
  /** Wave 5 D4 — bash badge controls. */
  badgeOff?: boolean;
  badgeAlways?: boolean;
  badgeThreshold?: number;
  /** Override the ~/.mooter root (tests). */
  mooterHome?: string;
  /** Override "now" + signing secret (tests). */
  now?: Date;
  secret?: string;
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

  // Wave 5 D4 — bash badge controls. --badge-off suppresses; --badge-always forces
  // threshold 0 (any confidence); --badge-threshold=X raises the floor. Always-on by default.
  if (opts.badgeOff || opts.badgeAlways || typeof opts.badgeThreshold === "number") {
    if (opts.badgeOff) {
      prefs.badge_off = true;
    } else {
      prefs.badge_off = false;
      if (opts.badgeAlways) prefs.badge_threshold = 0;
      if (typeof opts.badgeThreshold === "number") {
        if (!Number.isFinite(opts.badgeThreshold) || opts.badgeThreshold < 0 || opts.badgeThreshold > 1) return { exitCode: 1, output: "✗ --badge-threshold must be 0..1" };
        prefs.badge_threshold = opts.badgeThreshold;
      }
    }
    mkdirSync(mooterHome, { recursive: true });
    writeFileSync(join(mooterHome, "preferences.json"), JSON.stringify(prefs, null, 2) + "\n");
    return {
      exitCode: 0,
      output: opts.badgeOff
        ? "✓ Bash badge disabled (mooter quiet --badge-always to re-enable)."
        : `✓ Bash badge on (threshold ${prefs.badge_threshold ?? 0}).`,
    };
  }

  // Wave 5 D3 — statusline chip hide flags. `--hide-<chip>` adds to hidden_chips
  // (valid: vram/quant/ctx/adapter); `--show-all` clears them. Other prefs intact.
  if ((opts.hideChips && opts.hideChips.length) || opts.showAll) {
    const VALID = ["vram", "quant", "ctx", "adapter"];
    const current = new Set(Array.isArray(prefs.hidden_chips) ? (prefs.hidden_chips as string[]) : []);
    if (opts.showAll) current.clear();
    const bad: string[] = [];
    for (const c of opts.hideChips ?? []) {
      if (VALID.includes(c)) current.add(c);
      else bad.push(c);
    }
    if (bad.length) return { exitCode: 1, output: `✗ unknown chip(s): ${bad.join(", ")} (valid: ${VALID.join(" ")})` };
    prefs.hidden_chips = [...current].sort();
    mkdirSync(mooterHome, { recursive: true });
    writeFileSync(join(mooterHome, "preferences.json"), JSON.stringify(prefs, null, 2) + "\n");
    return {
      exitCode: 0,
      output: opts.showAll ? "✓ All statusline chips shown." : `✓ Hidden chips: ${prefs.hidden_chips.join(", ") || "(none)"}.`,
    };
  }

  // Wave 3 Day 2 — revoke telemetry consent. Rewrites consent.json to the
  // opted-out state (signature null). Independent of the badge/Moo-card prefs.
  if (opts.telemetryOff) {
    mkdirSync(mooterHome, { recursive: true });
    const secret = opts.secret ?? getLocalSecret(mooterHome);
    const consent = buildConsent(false, opts.now ?? new Date(), secret);
    writeFileSync(join(mooterHome, "consent.json"), JSON.stringify(consent, null, 2) + "\n", { mode: 0o600 });
    return { exitCode: 0, output: "✓ Telemetry disabled (consent revoked)." };
  }

  // Wave 3 Day 3 — sync cadence (schedule spec only; NO cron is started). Updates
  // consent.json sync_schedule.cadence, preserving the rest of the consent record.
  if (opts.syncCadence) {
    const valid = ["daily", "weekly", "manual-only"];
    if (!valid.includes(opts.syncCadence)) {
      return { exitCode: 1, output: `✗ invalid cadence '${opts.syncCadence}' (use: ${valid.join(" | ")})` };
    }
    mkdirSync(mooterHome, { recursive: true });
    let consent: Record<string, unknown> = {};
    try {
      consent = JSON.parse(readFileSync(join(mooterHome, "consent.json"), "utf8"));
    } catch {
      consent = {};
    }
    const sched = (consent.sync_schedule as Record<string, unknown>) ?? { time_of_day: "03:00", timezone: "local" };
    consent.sync_schedule = { ...sched, cadence: opts.syncCadence };
    writeFileSync(join(mooterHome, "consent.json"), JSON.stringify(consent, null, 2) + "\n", { mode: 0o600 });
    return { exitCode: 0, output: `✓ Sync cadence set to ${opts.syncCadence} (no cron started — Wave 4 honours this).` };
  }

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
