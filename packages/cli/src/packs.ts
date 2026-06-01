// Pack state helpers (Wave 3 Day 2) — shared by `mooter dashboard` (PACK section)
// and `mooter hub`. Reads the local schemas the wizard/router already write.
//
// Honesty: there is NO per-pack time-series usage log in this build, so usage
// counts are reported as "no usage data yet" rather than fabricated. We surface
// only what exists: the installed list (installed.json) and the active pack
// (last-decision.json, if the router wrote one).

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function mooterHomeDefault(): string {
  return join(homedir(), ".mooter");
}

/** Installed pack ids from installed.json (sorted). Missing file → []. */
export function listInstalledPacks(mooterHome: string = mooterHomeDefault()): string[] {
  try {
    const obj = JSON.parse(readFileSync(join(mooterHome, "installed.json"), "utf8"));
    return Array.isArray(obj.packs) ? obj.packs.filter((p: unknown) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** Active pack from last-decision.json, or null (GENERAL/AMBIGUOUS/absent → null). */
export function getActivePack(mooterHome: string = mooterHomeDefault()): string | null {
  try {
    const obj = JSON.parse(readFileSync(join(mooterHome, "last-decision.json"), "utf8"));
    const pid = obj && obj.pack_id;
    return typeof pid === "string" && pid !== "GENERAL" && pid !== "AMBIGUOUS" ? pid : null;
  } catch {
    return null;
  }
}
