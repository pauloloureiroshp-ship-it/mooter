// manifest-bounds.test.ts — Wave 2 Day 3 NIT 1: defensive guard that
// `model_floor` never exceeds `model_ceiling` in a pack manifest. The check
// fires inside loadPackManifest so a misconfigured pack fails loud at load
// time rather than producing silent routing surprises downstream.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertTierBounds } from "../src/policy.ts";
import { loadPackManifest } from "../src/pack_resolve.ts";

function writePack(packsDir: string, name: string, body: string): void {
  const dir = join(packsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pack.yaml"), body, "utf8");
}

test("assertTierBounds: valid bounds pass silently", () => {
  assert.doesNotThrow(() =>
    assertTierBounds({ pack_id: "test", model_floor: "T0", model_ceiling: "T3" }),
  );
  assert.doesNotThrow(() =>
    assertTierBounds({ pack_id: "test", model_floor: "T2", model_ceiling: "T2" }),
  );
});

test("assertTierBounds: floor above ceiling throws with named pack", () => {
  assert.throws(
    () => assertTierBounds({ pack_id: "bad-pack", model_floor: "T3", model_ceiling: "T0" }),
    /Pack 'bad-pack'.*model_floor=T3.*model_ceiling=T0/s,
  );
});

test("assertTierBounds: unknown tier strings default to T2 → no throw at equal idx", () => {
  // tierIdx returns 2 (T2) on unknown — equal indices satisfy the bound.
  assert.doesNotThrow(() =>
    assertTierBounds({ pack_id: "test", model_floor: "BOGUS", model_ceiling: "ALSO_BOGUS" }),
  );
});

test("loadPackManifest: a manifest with floor > ceiling throws", () => {
  const root = mkdtempSync(join(tmpdir(), "mooter-bounds-"));
  writePack(
    root,
    "broken-pack",
    [
      "name: broken-pack",
      "model_floor: T3",
      "model_ceiling: T0",
      "skills: { required: [], recommended: [] }",
      "mcps: { required: [], recommended: [] }",
      "subagents: { primary: model-reasoner, reviewer: final-reviewer }",
    ].join("\n"),
  );
  assert.throws(
    () => loadPackManifest("broken-pack", root),
    /broken-pack.*T3.*T0/s,
  );
});

test("loadPackManifest: a valid manifest loads without throwing", () => {
  const root = mkdtempSync(join(tmpdir(), "mooter-bounds-"));
  writePack(
    root,
    "ok-pack",
    [
      "name: ok-pack",
      "model_floor: T1",
      "model_ceiling: T3",
      "skills: { required: [], recommended: [] }",
      "mcps: { required: [], recommended: [] }",
      "subagents: { primary: model-reasoner, reviewer: final-reviewer }",
    ].join("\n"),
  );
  const m = loadPackManifest("ok-pack", root);
  assert.ok(m, "manifest should load");
  assert.equal(m?.model_floor, "T1");
  assert.equal(m?.model_ceiling, "T3");
});

test("loadPackManifest: omitted floor/ceiling default to T2/T3 → no throw", () => {
  const root = mkdtempSync(join(tmpdir(), "mooter-bounds-"));
  writePack(
    root,
    "defaults-pack",
    [
      "name: defaults-pack",
      "skills: { required: [], recommended: [] }",
      "mcps: { required: [], recommended: [] }",
      "subagents: { primary: model-reasoner, reviewer: final-reviewer }",
    ].join("\n"),
  );
  const m = loadPackManifest("defaults-pack", root);
  assert.ok(m);
  assert.equal(m?.model_floor, "T2");
  assert.equal(m?.model_ceiling, "T3");
});
