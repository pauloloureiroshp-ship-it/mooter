// Wave 2.6 Day 3 — `mooter trail --evolution`. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildEvolution, runTrail } from "../src/commands/trail.ts";

const DAY = 24 * 3600 * 1000;
const NOW = 1_780_000_000_000; // fixed epoch ms for deterministic windowing

function evt(daysAgo: number, tier: string, confidence: number) {
  return JSON.stringify({
    event: "classified",
    ts_ms: NOW - daysAgo * DAY,
    tier,
    confidence,
  });
}

// 3 prompts in the last 7d, 2 in the previous 7d.
const LINES = [
  evt(1, "T0", 0.9),
  evt(2, "T2", 0.8),
  evt(6, "T0", 0.85),
  evt(9, "T3", 0.95), // prev window
  evt(12, "T2", 0.7), // prev window
  evt(20, "T0", 0.99), // older than both windows → ignored
];

test("buildEvolution: partitions last-7d vs prev-7d by ts_ms", () => {
  const evo = buildEvolution(LINES, NOW) as any;
  assert.equal(evo.last7.prompts, 3);
  assert.equal(evo.prev7.prompts, 2);
  assert.deepEqual(evo.last7.tierMix, { T0: 2, T1: 0, T2: 1, T3: 0 });
  assert.deepEqual(evo.prev7.tierMix, { T0: 0, T1: 0, T2: 1, T3: 1 });
});

test("buildEvolution: prompts delta % computed against previous window", () => {
  const evo = buildEvolution(LINES, NOW) as any;
  // (3 - 2) / 2 * 100 = 50
  assert.equal(Math.round(evo.prompts_delta_pct), 50);
});

test("buildEvolution: avg confidence per window + delta", () => {
  const evo = buildEvolution(LINES, NOW) as any;
  assert.ok(Math.abs(evo.last7.avgConf - (0.9 + 0.8 + 0.85) / 3) < 1e-9);
  assert.ok(Math.abs(evo.prev7.avgConf - (0.95 + 0.7) / 2) < 1e-9);
  assert.equal(typeof evo.conf_delta, "number");
});

test("buildEvolution: empty windows don't throw, deltas degrade", () => {
  const evo = buildEvolution([], NOW) as any;
  assert.equal(evo.last7.prompts, 0);
  assert.equal(evo.prev7.prompts, 0);
  assert.equal(evo.last7.avgConf, null);
  assert.equal(evo.conf_delta, null);
});

test("runTrail --evolution: human output declares LoRA honestly (no fake)", async () => {
  const res = await runTrail({ lines: LINES, nowMs: NOW, evolution: true });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /evolution \(last 7d vs previous 7d\)/);
  assert.match(res.output, /prompts:   2 → 3/);
  assert.match(res.output, /LoRA: ◌ none yet \(Adapter Forge ships Wave 5\)/);
  assert.match(res.output, /Per-window dollar savings is not shown/);
});

test("runTrail --evolution --json: machine-readable", async () => {
  const res = await runTrail({ lines: LINES, nowMs: NOW, evolution: true, json: true });
  const obj = JSON.parse(res.output);
  assert.equal(obj.last7.prompts, 3);
  assert.equal(obj.prev7.prompts, 2);
});
