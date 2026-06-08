// Wave 32 (Phase NEW2) — effort modes + ultramoo activation gate.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MODES,
  MODE_NAMES,
  configForMode,
  getEffort,
  getEffortMode,
  setEffort,
  resetEffort,
  isEffortMode,
} from "../src/effort-manager.ts";
import { ULTRAMOO_SUBSYSTEMS } from "../src/types.ts";

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-effort-"));
}

test("four modes exist with matching mode field", () => {
  assert.deepStrictEqual(MODE_NAMES, ["low", "default", "high", "ultramoo"]);
  for (const m of MODE_NAMES) assert.strictEqual(MODES[m].mode, m);
});

test("isEffortMode validates", () => {
  assert.ok(isEffortMode("ultramoo"));
  assert.ok(!isEffortMode("turbo"));
});

test("ULTRAMOO GATE: all 8 sub-systems are ON (the headline contract)", () => {
  const u = configForMode("ultramoo");
  // each of the 8 named sub-systems is in its "active" state
  assert.strictEqual(u.llmlingua, true);
  assert.strictEqual(u.caveman, true);
  assert.strictEqual(u.lorauter, true);
  assert.strictEqual(u.multiLora, true);
  assert.strictEqual(u.workflowAutoThreshold, 500);
  assert.deepStrictEqual(u.costCap, { workflowUsd: 1, sessionUsd: 20 });
  assert.strictEqual(u.banditLocalBias, "hard");
  assert.strictEqual(u.statuslineUltramooChip, true);
  // sanity: the named-subsystem list has exactly 8 entries
  assert.strictEqual(ULTRAMOO_SUBSYSTEMS.length, 8);
});

test("escalation low → default → high → ultramoo strictly increases frugality", () => {
  const flagsOn = (m: ReturnType<typeof configForMode>) =>
    [m.llmlingua, m.caveman, m.lorauter, m.multiLora, m.statuslineUltramooChip].filter(Boolean).length;
  assert.ok(flagsOn(configForMode("low")) < flagsOn(configForMode("default")));
  assert.ok(flagsOn(configForMode("default")) <= flagsOn(configForMode("high")));
  assert.ok(flagsOn(configForMode("high")) < flagsOn(configForMode("ultramoo")));
  // cost caps tighten
  assert.ok(configForMode("ultramoo").costCap.sessionUsd < configForMode("low").costCap.sessionUsd);
});

test("low does NOT auto-trigger workflows; high+ultramoo do", () => {
  assert.strictEqual(configForMode("low").workflowAutoThreshold, null);
  assert.strictEqual(configForMode("default").workflowAutoThreshold, null);
  assert.ok((configForMode("high").workflowAutoThreshold ?? 0) > 0);
  assert.ok((configForMode("ultramoo").workflowAutoThreshold ?? 0) > 0);
});

test("persist + read round-trips; default when absent", () => {
  const home = tmpHome();
  assert.strictEqual(getEffortMode(home), "default"); // absent → default
  setEffort("ultramoo", { home, now: 5 });
  assert.strictEqual(getEffortMode(home), "ultramoo");
  const cfg = getEffort(home);
  assert.strictEqual(cfg.multiLora, true);
  // file holds flat flags so non-TS consumers can read them
  const onDisk = JSON.parse(readFileSync(join(home, ".mooter", "effort.json"), "utf8"));
  assert.strictEqual(onDisk.llmlingua, true);
  assert.strictEqual(onDisk.updated_at, 5);
});

test("reset returns to default", () => {
  const home = tmpHome();
  setEffort("ultramoo", { home });
  resetEffort({ home });
  assert.strictEqual(getEffortMode(home), "default");
});

test("configForMode returns an isolated copy (no table mutation)", () => {
  const a = configForMode("low");
  a.costCap.sessionUsd = 999;
  assert.strictEqual(MODES.low.costCap.sessionUsd, 50, "table not mutated");
});
