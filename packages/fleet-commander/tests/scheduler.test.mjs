// scheduler.test.mjs — Fleet Commander ① Scheduler. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePriority, hitRateWithPrior, pickNext, DEFAULT_CAPS } from "../src/scheduler.mjs";

const HOUR = 60 * 60 * 1000;
const NOW = 100 * HOUR;

test("hitRateWithPrior: cold start = 0.5, improves with measured wins, punishes losses", () => {
  assert.equal(hitRateWithPrior({}), 0.5, "no history → Beta(1,1) prior = 0.5");
  assert.ok(hitRateWithPrior({ measuredWins: 9, measuredTotal: 10 }) > 0.7);
  assert.ok(hitRateWithPrior({ measuredWins: 0, measuredTotal: 10 }) < 0.1, "all-loss loop sinks");
});

test("computePriority: monotonic in staleness, impact, and hit-rate", () => {
  const base = { lastRunAt: NOW - 10 * HOUR, impact: 0.5, measuredWins: 5, measuredTotal: 10 };
  const p0 = computePriority(base, { now: NOW });
  assert.ok(computePriority({ ...base, lastRunAt: NOW - 20 * HOUR }, { now: NOW }) > p0, "staler → higher");
  assert.ok(computePriority({ ...base, impact: 0.9 }, { now: NOW }) > p0, "more impact → higher");
  assert.ok(computePriority({ ...base, measuredWins: 10, measuredTotal: 10 }, { now: NOW }) > p0, "better hit-rate → higher");
  assert.equal(computePriority({ ...base, lastRunAt: NOW }, { now: NOW }), 0, "just ran → 0 staleness → 0 priority");
});

test("pickNext: foreground preemption yields the GPU entirely", () => {
  const loops = [{ id: "a", lastRunAt: 0, impact: 1 }];
  const r = pickNext(loops, { now: NOW, gpu: { foregroundBusy: true } });
  assert.equal(r.pick, null);
  assert.match(r.reason, /foreground-preemption/);
});

test("pickNext: a full human queue pauses generation (protect attention)", () => {
  const loops = [{ id: "a", lastRunAt: 0, impact: 1 }];
  const r = pickNext(loops, { now: NOW, humanQueueSize: DEFAULT_CAPS.globalHumanQueue });
  assert.equal(r.pick, null);
  assert.match(r.reason, /human queue full/);
});

test("pickNext: excludes suspended/paused loops and loops at their open-proposal cap", () => {
  const loops = [
    { id: "suspended", lastRunAt: 0, impact: 1, state: "suspended" },
    { id: "capped", lastRunAt: 0, impact: 1, openProposals: DEFAULT_CAPS.perLoopOpen },
    { id: "ok", lastRunAt: NOW - 5 * HOUR, impact: 0.5, measuredWins: 3, measuredTotal: 4 },
  ];
  const r = pickNext(loops, { now: NOW });
  assert.equal(r.pick.id, "ok");
});

test("pickNext: picks the highest staleness×impact×hit-rate", () => {
  const loops = [
    { id: "fresh", lastRunAt: NOW - 1 * HOUR, impact: 1, measuredWins: 9, measuredTotal: 10 },
    { id: "stale-high", lastRunAt: NOW - 40 * HOUR, impact: 0.9, measuredWins: 8, measuredTotal: 10 },
    { id: "stale-junk", lastRunAt: NOW - 40 * HOUR, impact: 0.9, measuredWins: 0, measuredTotal: 10 },
  ];
  const r = pickNext(loops, { now: NOW });
  assert.equal(r.pick.id, "stale-high", "stale + impactful + trusted wins");
  const order = r.ranked.map((x) => x.loop.id);
  // stale-high and stale-junk have IDENTICAL staleness+impact — only hit-rate differs,
  // and it sinks the junk loop below its trusted sibling (deprioritized with proof).
  assert.ok(order.indexOf("stale-junk") > order.indexOf("stale-high"), "hit-rate sinks the junk loop below its trusted sibling");
});

test("pickNext: honest null when nothing is eligible", () => {
  const r = pickNext([{ id: "x", state: "paused" }], { now: NOW });
  assert.equal(r.pick, null);
  assert.match(r.reason, /no eligible loop/);
});
