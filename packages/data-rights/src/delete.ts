// Wave 32 (Phase NEW3) — `mooter data delete-all`. Wipes local Mooter state.
// DESTRUCTIVE → requires explicit confirmation. Only ever touches the given
// home's `.mooter` directory (and the router decisions.log), never anything
// outside it. `dryRun` lists what WOULD be removed without deleting.

import { rmSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DeleteResult {
  removed: string[];
  skipped: string[];
  confirmed: boolean;
  dryRun: boolean;
}

function mooterDir(home: string): string {
  return join(home, ".mooter");
}

// On Windows os.homedir() reads USERPROFILE and ignores HOME, so a caller that
// "isolated" itself via HOME still aims this delete at the real ~/.mooter —
// that is how the live ledger was wiped on 2026-08-05. MOOTER_HOME (the same
// contract every mooter-bridge test uses) is the isolation mechanism here;
// an explicit opts.home still wins.
function stateDir(opts: { home?: string }): string {
  if (opts.home) return mooterDir(opts.home);
  return process.env.MOOTER_HOME || mooterDir(homedir());
}

/**
 * Delete everything under ~/.mooter (+ the router decisions.log, if given).
 * @param opts.confirm  must be true to actually delete (else dry-run report)
 * @param opts.home     injectable home (tests)
 * @param opts.decisionsLog  optional absolute path to also remove
 * @param opts.dryRun   force a listing without deletion
 */
export function deleteAll(opts: { confirm?: boolean; home?: string; decisionsLog?: string; dryRun?: boolean } = {}): DeleteResult {
  const dir = stateDir(opts);
  const dryRun = opts.dryRun || !opts.confirm;

  const targets: string[] = [];
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir)) targets.push(join(dir, entry));
  }
  if (opts.decisionsLog && existsSync(opts.decisionsLog)) targets.push(opts.decisionsLog);

  if (dryRun) {
    return { removed: [], skipped: targets, confirmed: !!opts.confirm, dryRun: true };
  }

  const removed: string[] = [];
  const skipped: string[] = [];
  for (const t of targets) {
    try {
      rmSync(t, { recursive: true, force: true });
      removed.push(t);
    } catch {
      skipped.push(t);
    }
  }
  return { removed, skipped, confirmed: true, dryRun: false };
}
