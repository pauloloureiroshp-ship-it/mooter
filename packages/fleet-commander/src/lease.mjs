// lease.mjs — Fleet Commander · ② the Lease Manager (one worktree per loop, lease
// per path, orphan REPORTED never STOLEN).
//
// docs/strategy/MOOTER_EVOLUTION_FLEET.md §4②. The worktree-crossing lesson turned
// into mechanical law: each loop leases the paths it will touch; two loops can never
// hold the same path. The fleet-specific safety property the generic locker does NOT
// give us: an orphan lease (stale heartbeat) is **reported as an incident, never
// auto-stolen** — the worktree-conductor's tryAcquire would reap a stale lock; the
// Commander must not, because a "dead" loop may just be mid-long-op and silently
// stealing its worktree corrupts work.
//
// The `locks` backend is INJECTED (default in-memory) so this is hermetically
// testable. Integration seam: pass an adapter over
// packages/worktree-conductor/src/locks.ts ({read→readLock, write→tryAcquire,
// remove→release, list→listLocks}) to get real cross-process git-worktree locking.

"use strict";

export const DEFAULT_STALE_MS = 30_000; // matches worktree-conductor heartbeat STALE_MS

// A minimal in-memory locks backend (the default). Shape mirrors what a
// worktree-conductor adapter would expose.
export function inMemoryLocks() {
  const m = new Map();
  return {
    read: (p) => (m.has(p) ? { ...m.get(p) } : null),
    write: (p, rec) => { m.set(p, { ...rec }); },
    remove: (p) => { m.delete(p); },
    list: () => Array.from(m.entries()).map(([resource, rec]) => ({ resource, ...rec })),
  };
}

export function isOrphan(lock, now, staleMs = DEFAULT_STALE_MS) {
  return !!lock && (now - (lock.ts ?? 0)) > staleMs;
}

/**
 * Create a Lease Manager over an injected locks backend.
 * owner: { sessionId, loopId }.
 */
export function createLeaseManager({ locks, now = () => Date.now(), staleMs = DEFAULT_STALE_MS } = {}) {
  const backend = locks || inMemoryLocks();
  const rollback = (held, owner) => { for (const p of held) { const l = backend.read(p); if (l && l.sessionId === owner.sessionId) backend.remove(p); } };

  return {
    /**
     * Lease ALL paths for a loop, all-or-nothing. If any path is held by another
     * live session → fail (held). If held by an ORPHAN (stale) → fail with
     * `orphan-lease` and surface it — NEVER steal it.
     * @returns { ok, paths? } | { ok:false, reason, path, by?/orphan? }
     */
    acquire(paths, owner) {
      const held = [];
      for (const p of Array.isArray(paths) ? paths : []) {
        const existing = backend.read(p);
        if (existing && existing.sessionId !== owner.sessionId) {
          rollback(held, owner);
          if (isOrphan(existing, now(), staleMs)) {
            return { ok: false, reason: "orphan-lease", path: p, orphan: existing };
          }
          return { ok: false, reason: "held", path: p, by: existing.sessionId };
        }
        backend.write(p, { sessionId: owner.sessionId, loopId: owner.loopId, ts: now() });
        held.push(p);
      }
      return { ok: true, paths: held };
    },

    /** Renew (heartbeat) the leases this owner holds — keeps them from going stale. */
    renew(paths, owner) {
      for (const p of Array.isArray(paths) ? paths : []) {
        const l = backend.read(p);
        if (l && l.sessionId === owner.sessionId) backend.write(p, { ...l, ts: now() });
      }
      return { ok: true };
    },

    /** Release only the leases this owner actually holds (never another's). */
    release(paths, owner) {
      for (const p of Array.isArray(paths) ? paths : []) {
        const l = backend.read(p);
        if (l && l.sessionId === owner.sessionId) backend.remove(p);
      }
      return { ok: true };
    },

    /** Report orphan leases (stale heartbeat) for the human/Console. Never reaps. */
    reportOrphans() {
      const t = now();
      return backend.list().filter((l) => isOrphan(l, t, staleMs));
    },

    /** Who holds a path right now (or null). */
    holder(path) { return backend.read(path); },
  };
}
