// Wave 30 Phase D — `mooter wave` command IO. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyShipGateError, runWave } from "../src/commands/wave.ts";

function withTempHome<T>(fn: () => T): T {
  const dir = mkdtempSync(join(tmpdir(), "mooter-wave-"));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = dir;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("wave with no subcommand prints usage", () => {
  const r = runWave([]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /mooter wave/);
});

test("wave start 30 seeds the A-O template (json)", () => {
  withTempHome(() => {
    const r = runWave(["start", "30", "--branch", "wave30-mega", "--json"]);
    assert.equal(r.exitCode, 0);
    const sum = JSON.parse(r.output);
    assert.equal(sum.active, true);
    assert.equal(sum.number, 30);
    assert.equal(sum.total, 15); // A..O
    assert.equal(sum.phase, "A");
  });
});

test("wave start rejects a non-numeric number", () => {
  withTempHome(() => {
    const r = runWave(["start", "abc"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /usage/);
  });
});

test("wave status is valid JSON and verifies classify.js sha against the repo", () => {
  withTempHome(() => {
    runWave(["start", "30", "--branch", "wave30-mega"]);
    const r = runWave(["status", "--json"]);
    const obj = JSON.parse(r.output);
    assert.equal(obj.number, 30);
    assert.ok("classify" in obj);
    // running inside the repo, classify.js is locatable and must be intact
    assert.equal(obj.classify.ok, true, "classify.js sha must be intact in-repo");
    assert.equal(r.exitCode, 0);
  });
});

test("wave phase --done advances done count", () => {
  withTempHome(() => {
    runWave(["start", "30"]);
    const r = runWave(["phase", "A", "--done", "--commit", "abc123", "--json"]);
    assert.equal(r.exitCode, 0);
    const sum = JSON.parse(r.output);
    assert.equal(sum.done, 1);
  });
});

test("wave phase without active wave errors", () => {
  withTempHome(() => {
    const r = runWave(["phase", "A", "--done"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /no active wave/);
  });
});

test("wave ship succeeds when sha intact and records tag", () => {
  withTempHome(() => {
    runWave(["start", "30"]);
    for (const id of "ABCDEFGHIJKLMNO") runWave(["phase", id, "--done"]);
    const r = runWave(["ship", "--tag", "v1.18.0-mega", "--merge", "deadbeef", "--json"]);
    assert.equal(r.exitCode, 0);
    const shipped = JSON.parse(r.output);
    assert.equal(shipped.tag, "v1.18.0-mega");
    assert.equal(shipped.mergeCommit, "deadbeef");
    // after ship, status shows no active wave
    const st = JSON.parse(runWave(["status", "--json"]).output);
    assert.equal(st.active, false);
    assert.equal(st.historyCount, 1);
  });
});

test("wave ship override is two-phase and --force cannot bypass gates", () => {
  withTempHome(() => {
    runWave(["start", "30"]);
    runWave(["phase", "A", "--done"]);
    const direct = runWave(["ship", "--force"]);
    assert.equal(direct.exitCode, 2);
    assert.match(direct.output, /cannot ship/);
    const requested = runWave([
      "ship",
      "--request-override",
      "--reason",
      "Emergency recovery",
      "--approved-by",
      "Paulo",
      "--json",
    ]);
    assert.equal(requested.exitCode, 0);
    const request = JSON.parse(requested.output);
    assert.equal(request.approvedBy, "Paulo");
    assert.ok(request.failedGates.includes("B"));
    const consumed = runWave(["ship", "--override", request.id, "--json"]);
    assert.equal(consumed.exitCode, 0);
    assert.equal(JSON.parse(consumed.output).shipmentStatus, "shipped_with_override");
  });
});

test("classify SHA failure is never overrideable", () => {
  assert.match(classifyShipGateError("deadbeef") ?? "", /MISMATCH/);
  assert.match(classifyShipGateError(null) ?? "", /unavailable/);
});
