// Wave 32 (Phase NEW2/NEW1) — `mooter effort` + `mooter status` commands.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runEffort } from "../src/commands/effort.ts";
import { runStatus } from "../src/commands/status.ts";

function withHome<T>(fn: () => T): T {
  const prev = process.env.HOME;
  process.env.HOME = mkdtempSync(join(tmpdir(), "mooter-es-"));
  process.env.MOOTER_HOME = join(process.env.HOME, ".mooter");
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
  }
}

test("effort set ultramoo flips all 8 and persists", () => {
  withHome(() => {
    const r = runEffort(["set", "ultramoo"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /effort: ultramoo/);
    assert.match(r.output, /all 8 sub-systems engaged/);
    const cfg = JSON.parse(readFileSync(join(process.env.HOME!, ".mooter", "effort.json"), "utf8"));
    assert.strictEqual(cfg.llmlingua, true);
    assert.strictEqual(cfg.multiLora, true);
    assert.strictEqual(cfg.costCap.sessionUsd, 20);
  });
});

test("effort set rejects unknown mode", () => {
  withHome(() => {
    const r = runEffort(["set", "warp"]);
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /usage: mooter effort set/);
  });
});

test("effort show defaults to default mode", () => {
  withHome(() => {
    const r = runEffort(["show"]);
    assert.match(r.output, /effort: default/);
  });
});

test("effort reset returns to default", () => {
  withHome(() => {
    runEffort(["set", "high"]);
    const r = runEffort(["reset"]);
    assert.match(r.output, /effort: default/);
  });
});

test("status compact + didactic render real fields", () => {
  withHome(() => {
    runEffort(["set", "high"]);
    const compact = runStatus([]);
    assert.match(compact.output, /effort high/);
    assert.match(compact.output, /Pastor \d+ adapters/);
    const didactic = runStatus(["--didactic"]);
    assert.match(didactic.output, /didactic/);
    assert.match(didactic.output, /High — prompts are compressed/);
  });
});
