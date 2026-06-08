// Wave 33.5 Block H — conductor orchestration layer.
//
// Composes locks + heartbeats into the behaviours the CLI exposes:
//  · acquireWithRecovery — try lock; if held by a STALE+dead session, report it
//    as recoverable (NEVER auto-steal — H.8 requires user confirm)
//  · status snapshot — live sessions, active locks, pending queue
//  · reap — drop dead-session heartbeats

import { tryAcquire, release, listLocks, readLock, isStale, type LockOwner, type AcquireOptions } from "./locks.ts";
import { listHeartbeats, readHeartbeat, isHeartbeatStale, reapStaleHeartbeats } from "./heartbeat.ts";
import { pending } from "./queue.ts";
import { appendHistory } from "./history.ts";
import type { LockFile, Heartbeat, QueueEntry, AcquireOutcome } from "./types.ts";

export interface RecoveryAcquire {
  outcome: AcquireOutcome;
  /** When held: is the holder's session heartbeat dead (stale or absent)? */
  holderDead?: boolean;
  /** True when the lock can be safely force-released (TTL stale AND holder dead). */
  recoverable?: boolean;
}

/**
 * Attempt to acquire, enriching a denial with recovery info. A lock is
 * "recoverable" only when BOTH its TTL has elapsed AND the holder's heartbeat is
 * dead — a live holder with an expired TTL is still respected (no theft).
 */
export function acquireWithRecovery(resource: string, owner: LockOwner, opts: AcquireOptions = {}): RecoveryAcquire {
  const outcome = tryAcquire(resource, owner, opts);
  if (outcome.acquired) return { outcome };
  const now = opts.now ?? Date.now();
  const holderHb = readHeartbeat(outcome.heldBy.acquired_by, opts.home);
  const holderDead = !holderHb || isHeartbeatStale(holderHb, now);
  return {
    outcome,
    holderDead,
    recoverable: outcome.stale && holderDead,
  };
}

export interface ConductorStatus {
  generatedAtMs: number;
  liveSessions: Heartbeat[];
  staleSessions: Heartbeat[];
  locks: Array<LockFile & { stale: boolean; holderDead: boolean }>;
  queue: QueueEntry[];
}

export function status(opts: { home?: string; now?: number } = {}): ConductorStatus {
  const now = opts.now ?? Date.now();
  const hbs = listHeartbeats(opts.home);
  const live = hbs.filter((h) => !isHeartbeatStale(h, now));
  const stale = hbs.filter((h) => isHeartbeatStale(h, now));
  const locks = listLocks(opts.home).map((l) => {
    const hb = readHeartbeat(l.acquired_by, opts.home);
    return { ...l, stale: isStale(l, now), holderDead: !hb || isHeartbeatStale(hb, now) };
  });
  return { generatedAtMs: now, liveSessions: live, staleSessions: stale, locks, queue: pending(opts.home) };
}

/** Force-release a recoverable lock after user confirm (the CLI gates on confirm). */
export function forceRelease(resource: string, bySessionId: string, opts: AcquireOptions = {}): boolean {
  const held = readLock(resource, opts.home);
  if (!held) return false;
  const ok = release(resource, bySessionId, { ...opts, force: true });
  if (ok) {
    appendHistory(
      { ts_ms: opts.now ?? Date.now(), session_id: bySessionId, terminal_name: "conductor", op: "REAPED", resource, detail: `was held by ${held.acquired_by}` },
      opts.home,
    );
  }
  return ok;
}

export function reap(opts: { home?: string; now?: number } = {}): string[] {
  return reapStaleHeartbeats(opts);
}
