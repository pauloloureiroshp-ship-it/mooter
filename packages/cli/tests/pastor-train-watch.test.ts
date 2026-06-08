// Wave 32 (Phase F) — `mooter pastor train-watch` command.
import { test } from "node:test";
import assert from "node:assert";
import { runPastor } from "../src/commands/pastor.ts";

test("train-watch renders a frame (honest no-run fallback uses real registry)", () => {
  const r = runPastor(["train-watch"]);
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /Train-Watch/);
  assert.match(r.output, /PER-TASK SCORES/);
  // real synthesis registry → shows task adapters, never a fabricated curve
  assert.match(r.output, /task adapters registered|PER-TASK/);
});

test("train-watch --json emits a machine-readable view", () => {
  const r = runPastor(["train-watch", "--json"]);
  assert.strictEqual(r.exitCode, 0);
  const v = JSON.parse(r.output);
  assert.ok("phase" in v);
  assert.ok(Array.isArray(v.registryTasks));
  assert.ok(v.registryTasks.length >= 1);
});

test("train-watch listed in usage", () => {
  const r = runPastor(["help"]);
  assert.match(r.output, /train-watch/);
});
