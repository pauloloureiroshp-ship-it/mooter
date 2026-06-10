// Wave 33.5 Block H.1 — filesystem lock manager.
//
// Mutual exclusion across terminals via atomic O_CREAT|O_EXCL (Node 'wx' flag):
// exactly one writer can create the lock file; everyone else gets EEXIST and
// reads who holds it. Staleness is TTL-based here (deterministic, no clock sync
// needed); the conductor layer adds heartbeat-aware reaping on top.

import { openSync, writeSync, closeSync, readFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";

import { lockPath, locksDir } from "./paths.ts";
import { appendHistory } from "./history.ts";
import type { LockFile, AcquireOutcome } from "./types.ts";

export interface LockOwner {
  sessionId: string;
  terminalName?: string;
  pid?: number;
}

export interface AcquireOptions {
  home?: string;
  now?: number;
  ttlSeconds?: number;
}

const DEFAULT_TTL = 60;

export function readLock(resource: string, home?: string): LockFile | null {
  try {
    return JSON.parse(readFileSync(lockPath(resource, home), "utf8")) as LockFile;
  } catch {
    return null;
  }
}

/** TTL-based staleness — a holder that never released and whose TTL elapsed. */
export function isStale(lock: LockFile, now = Date.now()): boolean {
  return now > lock.acquired_at_ms + lock.ttl_seconds * 1000;
}

/**
 * Atomically attempt to acquire `resource`. Returns {acquired:true} with the
 * written lock, or {acquired:false, heldBy, stale} when another live holder has
 * it. A STALE existing lock is NOT auto-stolen here (that needs user confirm via
 * the conductor); callers decide whether to forceRelease + retry.
 */
export function tryAcquire(resource: string, owner: LockOwner, opts: AcquireOptions = {}): AcquireOutcome {
  const home = opts.home;
  const now = opts.now ?? Date.now();
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL;
  mkdirSync(locksDir(home), { recursive: true });

  const lock: LockFile = {
    resource,
    acquired_by: owner.sessionId,
    terminal_name: owner.terminalName ?? "unknown",
    intent: "",
    acquired_at: new Date(now).toISOString(),
    acquired_at_ms: now,
    ttl_seconds: ttl,
    pid: owner.pid ?? 0,
  };

  try {
    const fd = openSync(lockPath(resource, home), "wx"); // O_CREAT|O_EXCL — atomic
    try {
      writeSync(fd, JSON.stringify(lock));
    } finally {
      closeSync(fd);
    }
    appendHistory(
      { ts_ms: now, session_id: owner.sessionId, terminal_name: lock.terminal_name, op: "ACQUIRED", resource },
      home,
    );
    return { acquired: true, lock };
  } catch (e: unknown) {
    // EEXIST → someone holds it. Anything else (perm, io) we also treat as "not
    // acquired" but surface a synthetic holder so callers never crash.
    const held = readLock(resource, home);
    if (held) {
      const stale = isStale(held, now);
      appendHistory(
        { ts_ms: now, session_id: owner.sessionId, terminal_name: owner.terminalName ?? "unknown", op: "DENIED", resource, detail: stale ? "stale-holder" : "live-holder" },
        home,
      );
      return { acquired: false, heldBy: held, stale };
    }
    // Lock file vanished between EEXIST and read (race) — report a synthetic holder.
    const code = (e as { code?: string }).code ?? "EEXIST";
    return {
      acquired: false,
      heldBy: { ...lock, acquired_by: "unknown", intent: `unreadable (${code})` },
      stale: false,
    };
  }
}

/** Set the intent on a lock we hold (best-effort rewrite). */
export function setLockIntent(resource: string, intent: string, home?: string): void {
  const cur = readLock(resource, home);
  if (!cur) return;
  cur.intent = intent;
  try {
    const fd = openSync(lockPath(resource, home), "w");
    try {
      writeSync(fd, JSON.stringify(cur));
    } finally {
      closeSync(fd);
    }
  } catch {
    /* best-effort */
  }
}

/** Release a lock we own. Only the owning session may release (unless force). */
export function release(resource: string, sessionId: string, opts: AcquireOptions & { force?: boolean } = {}): boolean {
  const home = opts.home;
  const now = opts.now ?? Date.now();
  const held = readLock(resource, home);
  if (!held) return false;
  if (!opts.force && held.acquired_by !== sessionId) return false;
  try {
    rmSync(lockPath(resource, home), { force: true });
    appendHistory(
      {
        ts_ms: now,
        session_id: sessionId,
        terminal_name: held.terminal_name,
        op: opts.force && held.acquired_by !== sessionId ? "FORCE_RELEASED" : "RELEASED",
        resource,
      },
      home,
    );
    return true;
  } catch {
    return false;
  }
}

export function listLocks(home?: string): LockFile[] {
  let files: string[];
  try {
    files = readdirSync(locksDir(home));
  } catch {
    return [];
  }
  const out: LockFile[] = [];
  for (const f of files) {
    if (!f.endsWith(".lock")) continue;
    const lock = readLock(f.replace(/\.lock$/, ""), home);
    if (lock) out.push(lock);
  }
  return out;
}
