// lease.test.mjs — Fleet Commander ② Lease Manager. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLeaseManager, inMemoryLocks, isOrphan, DEFAULT_STALE_MS } from "../src/lease.mjs";

const A = { sessionId: "loopA", loopId: "routing" };
const B = { sessionId: "loopB", loopId: "budget" };

test("acquire: leases all paths for a loop; a second loop cannot take a held path", () => {
  const lm = createLeaseManager();
  assert.equal(lm.acquire(["src/x.ts", "src/y.ts"], A).ok, true);
  const r = lm.acquire(["src/y.ts"], B);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "held");
  assert.equal(r.by, "loopA");
});

test("acquire: all-or-nothing — a partial conflict rolls back, leaving no half-lease", () => {
  const lm = createLeaseManager();
  lm.acquire(["b"], B);
  const r = lm.acquire(["a", "b", "c"], A); // 'b' is held by B
  assert.equal(r.ok, false);
  assert.equal(lm.holder("a"), null, "'a' must not be left leased after a failed all-or-nothing acquire");
  assert.equal(lm.holder("c"), null);
  assert.equal(lm.holder("b").sessionId, "loopB", "B still holds b");
});

test("orphan lease is REPORTED, never STOLEN (the core §4② law)", () => {
  let t = 1_000_000;
  const lm = createLeaseManager({ now: () => t, staleMs: DEFAULT_STALE_MS });
  lm.acquire(["w"], A);
  t += DEFAULT_STALE_MS + 1; // A's lease goes stale (orphan)

  const r = lm.acquire(["w"], B);
  assert.equal(r.ok, false, "B must NOT steal the orphan");
  assert.equal(r.reason, "orphan-lease");
  assert.equal(r.orphan.sessionId, "loopA");
  assert.equal(lm.holder("w").sessionId, "loopA", "the orphan lease is untouched, not reaped");

  const orphans = lm.reportOrphans();
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].resource, "w");
});

test("renew keeps a lease alive; after renew it is no longer an orphan", () => {
  let t = 0;
  const lm = createLeaseManager({ now: () => t, staleMs: 100 });
  lm.acquire(["p"], A);
  t = 90; lm.renew(["p"], A);      // heartbeat before it goes stale
  t = 150;                          // 150 > 90+100? no (60 since renew) → still alive
  assert.equal(lm.reportOrphans().length, 0);
  t = 300;                          // now well past
  assert.equal(lm.reportOrphans().length, 1);
});

test("release frees only the owner's leases, never another loop's", () => {
  const lm = createLeaseManager();
  lm.acquire(["p"], A);
  lm.release(["p"], B);             // B tries to release A's lease
  assert.equal(lm.holder("p").sessionId, "loopA", "B cannot release A's lease");
  lm.release(["p"], A);
  assert.equal(lm.holder("p"), null);
});

test("re-acquire by the same owner is idempotent-ish (refreshes, stays held)", () => {
  const lm = createLeaseManager();
  assert.equal(lm.acquire(["p"], A).ok, true);
  assert.equal(lm.acquire(["p"], A).ok, true, "same owner can re-acquire its own path");
  assert.equal(lm.holder("p").sessionId, "loopA");
});

test("isOrphan: pure staleness check", () => {
  assert.equal(isOrphan({ ts: 0 }, 10_000, 5_000), true);
  assert.equal(isOrphan({ ts: 8_000 }, 10_000, 5_000), false);
  assert.equal(isOrphan(null, 10_000), false);
});

test("inMemoryLocks: read/write/remove/list round-trip", () => {
  const b = inMemoryLocks();
  b.write("x", { sessionId: "s", ts: 1 });
  assert.equal(b.read("x").sessionId, "s");
  assert.equal(b.list().length, 1);
  b.remove("x");
  assert.equal(b.read("x"), null);
});
