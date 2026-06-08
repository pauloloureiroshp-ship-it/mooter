// Wave 33.5 Block H — orchestration paths. All state under ~/.mooter/orchestration
// (override the root with MOOTER_HOME for tests).

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export function orchestrationRoot(home = process.env.MOOTER_HOME || homedir()): string {
  // When MOOTER_HOME is set we treat it as the ~/.mooter root directly; otherwise
  // append .mooter to the home dir (mirrors @mooter/synthesis config semantics).
  return process.env.MOOTER_HOME
    ? join(home, "orchestration")
    : join(home, ".mooter", "orchestration");
}

export function locksDir(home?: string): string {
  return join(orchestrationRoot(home), "locks");
}

export function heartbeatsDir(home?: string): string {
  return join(orchestrationRoot(home), "heartbeats");
}

export function historyPath(home?: string): string {
  return join(orchestrationRoot(home), "history.jsonl");
}

export function queuePath(home?: string): string {
  return join(orchestrationRoot(home), "queue.jsonl");
}

/** Resource → lock filename. A resource like "git-abc" → "git-abc.lock". */
export function lockPath(resource: string, home?: string): string {
  const safe = resource.replace(/[^A-Za-z0-9_.-]/g, "-");
  return join(locksDir(home), `${safe}.lock`);
}

export function ensureDirs(home?: string): void {
  mkdirSync(locksDir(home), { recursive: true });
  mkdirSync(heartbeatsDir(home), { recursive: true });
}
