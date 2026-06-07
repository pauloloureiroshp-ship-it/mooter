// Wave 30 Phase E — `mooter dogfood` helpers + IO. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseTags,
  coerceSeverity,
  buildEntry,
  digest,
  countToday,
  loadEntries,
  runDogfood,
} from "../src/commands/dogfood.ts";

function withTempHome<T>(fn: () => T): T {
  const dir = mkdtempSync(join(tmpdir(), "mooter-dog-"));
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

test("parseTags extracts lowercase #tags, de-duped", () => {
  assert.deepEqual(parseTags("slow #CLI and #cli and #onboarding"), ["cli", "onboarding"]);
  assert.deepEqual(parseTags("no tags here"), []);
});

test("coerceSeverity narrows to allow-list (medium→med, default low)", () => {
  assert.equal(coerceSeverity("HIGH"), "high");
  assert.equal(coerceSeverity("medium"), "med");
  assert.equal(coerceSeverity("bogus"), "low");
  assert.equal(coerceSeverity(undefined), "low");
});

test("buildEntry stamps tags + severity (no active wave → null phase)", () => {
  withTempHome(() => {
    const e = buildEntry("digest #stdout was wrong", { severity: "high" }, new Date("2026-06-07T10:00:00Z"));
    assert.equal(e.severity, "high");
    assert.deepEqual(e.tags, ["stdout"]);
    assert.equal(e.phase, null);
    assert.equal(e.wave, null);
  });
});

test("log appends and counts today; digest aggregates by severity + tag", () => {
  withTempHome(() => {
    runDogfood(["log", "spinner #ux janky", "--severity", "med"]);
    runDogfood(["log", "another #ux thing", "--severity=high"]);
    const entries = loadEntries();
    assert.equal(entries.length, 2);
    const d = digest(entries, new Date());
    assert.equal(d.inWindow, 2);
    assert.equal(d.bySeverity.high, 1);
    assert.equal(d.bySeverity.med, 1);
    assert.equal(d.byTag[0].tag, "ux");
    assert.equal(d.byTag[0].count, 2);
  });
});

test("log requires non-empty text", () => {
  withTempHome(() => {
    const r = runDogfood(["log", "--severity", "high"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /usage/);
  });
});

test("countToday respects the UTC day boundary", () => {
  withTempHome(() => {
    const now = new Date("2026-06-07T12:00:00Z");
    const entries = [
      { ts: "2026-06-07T01:00:00Z", text: "a", tags: [], severity: "low" as const, phase: null, wave: null },
      { ts: "2026-06-06T23:00:00Z", text: "b", tags: [], severity: "low" as const, phase: null, wave: null },
    ];
    assert.equal(countToday(now, entries), 1);
  });
});

test("digest --days window excludes older entries", () => {
  withTempHome(() => {
    const now = new Date("2026-06-07T12:00:00Z");
    const entries = [
      { ts: "2026-06-07T01:00:00Z", text: "recent #x", tags: ["x"], severity: "low" as const, phase: null, wave: null },
      { ts: "2026-05-01T01:00:00Z", text: "old #x", tags: ["x"], severity: "low" as const, phase: null, wave: null },
    ];
    const d = digest(entries, now, 7);
    assert.equal(d.inWindow, 1);
    assert.equal(d.total, 2);
  });
});

test("log returns JSON entry with --json", () => {
  withTempHome(() => {
    const r = runDogfood(["log", "friction text", "--json"]);
    assert.equal(r.exitCode, 0);
    const e = JSON.parse(r.output);
    assert.equal(e.text, "friction text");
    assert.equal(e.severity, "low");
  });
});
