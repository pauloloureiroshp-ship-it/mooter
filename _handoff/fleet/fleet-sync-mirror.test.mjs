// fleet-sync-mirror.test.mjs — offline unit test for the SYNC.md DIGEST mirror
// (pure, no I/O). Run: node --test _handoff/fleet/fleet-sync-mirror.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { composeFleetMirror, upsertFleetSection, BEGIN, END } from "./fleet-sync-mirror.mjs";

const sample = {
  date: "2026-07-10", iso: "2026-07-10T11:41:36.388Z", round: 3,
  pillars: 12, peakGpu: 0, gpuCap: 1,
  rounds: 9493, incidents: 57, incoherences: 0,
  wins: 24, total: 9481, avoided: 23772, twoFactor: 2,
};

test("composeFleetMirror renders exactly 5 dated lines with the key numbers", () => {
  const block = composeFleetMirror(sample);
  const lines = block.split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[0], /\*\*2026-07-10\*\* — cronista round 3 · 12 pillars · GPU peak 0\/cap 1/);
  assert.match(lines[1], /rounds \(cumulative\): 9493 · incidents: 57 · incoherences now: 0/);
  assert.match(lines[2], /measured wins: 24\/9481 · est cloud tokens avoided: 23772 \(\$0, all local\)/);
  assert.match(lines[3], /open two-factor proposals \(Paulo gate\): 2/);
  assert.match(lines[4], /source: _handoff\/fleet\/cronista\/DIGEST\.md/);
});

test("composeFleetMirror shows n/d when twoFactor is missing", () => {
  const block = composeFleetMirror({ ...sample, twoFactor: null });
  assert.match(block, /open two-factor proposals \(Paulo gate\): n\/d/);
});

test("upsertFleetSection appends a managed section to plain SYNC text", () => {
  const out = upsertFleetSection("# SYNC\n\nsome state\n", composeFleetMirror(sample));
  assert.match(out, /# SYNC/);
  assert.ok(out.includes(BEGIN) && out.includes(END));
  assert.match(out, /## Fleet \(auto\)/);
});

test("upsertFleetSection is idempotent — same input yields identical output", () => {
  const first = upsertFleetSection("# SYNC\n\nstate\n", composeFleetMirror(sample));
  const second = upsertFleetSection(first, composeFleetMirror(sample));
  assert.equal(second, first);
});

test("upsertFleetSection replaces the block in place (no duplicate sections)", () => {
  const first = upsertFleetSection("# SYNC\n", composeFleetMirror(sample));
  const updated = composeFleetMirror({ ...sample, round: 4, rounds: 9500 });
  const second = upsertFleetSection(first, updated);
  assert.equal((second.match(/## Fleet \(auto\)/g) || []).length, 1); // exactly one section
  assert.equal((second.match(new RegExp(BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1);
  assert.match(second, /cronista round 4 · 12 pillars/);
  assert.doesNotMatch(second, /cronista round 3 · 12 pillars/);
});

test("upsertFleetSection seeds an empty file", () => {
  const out = upsertFleetSection("", composeFleetMirror(sample));
  assert.ok(out.startsWith(BEGIN));
  assert.match(out, /## Fleet \(auto\)/);
});
