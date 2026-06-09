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
  weeklyMarkdown,
  weeklyCronPlan,
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

test("log warns when severity is unrecognized but still records it as low", () => {
  withTempHome(() => {
    const r = runDogfood(["log", "app crashed", "--severity", "critical"]);
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /unknown severity 'critical'/);
    assert.match(r.output, /logged \[low\]/);
    assert.equal(loadEntries()[0].severity, "low");
  });
});

test("log --json stays pure JSON even with an unrecognized severity", () => {
  withTempHome(() => {
    const r = runDogfood(["log", "app crashed", "--severity", "critical", "--json"]);
    assert.equal(r.exitCode, 0);
    const e = JSON.parse(r.output); // must not throw — no warning text leaked into JSON
    assert.equal(e.severity, "low");
  });
});

test("unknown subcommand exits 1 and hints at valid subcommands", () => {
  withTempHome(() => {
    const r = runDogfood(["lst"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /unknown subcommand 'lst'/);
    assert.match(r.output, /--help/);
  });
});

// ── Wave 46 — weekly digest + cron ───────────────────────────────────────────
test("weeklyMarkdown: empty window → honest 'not enough data yet'", () => {
  const now = new Date("2026-06-09T12:00:00Z");
  const d = digest([], now, 7);
  const md = weeklyMarkdown(d, now);
  assert.match(md, /weekly digest/i);
  assert.match(md, /Not enough data yet/i);
});

test("weeklyMarkdown: with entries → markdown with counts, tags, recent", () => {
  const now = new Date("2026-06-09T12:00:00Z");
  const entries = [
    { ts: "2026-06-08T10:00:00Z", text: "router slow #perf", tags: ["perf"], severity: "high" as const, phase: null, wave: null },
    { ts: "2026-06-07T10:00:00Z", text: "typo in help #docs", tags: ["docs"], severity: "low" as const, phase: null, wave: null },
  ];
  const d = digest(entries, now, 7);
  const md = weeklyMarkdown(d, now);
  assert.match(md, /\*\*2\*\* items logged this week/);
  assert.match(md, /High: 1/);
  assert.match(md, /#perf/);
  assert.match(md, /Recent friction/);
});

test("weeklyCronPlan: posix install never mutates crontab (dry-run line)", () => {
  const plan = weeklyCronPlan("linux");
  assert.equal(plan.schedule, "0 9 * * 1");
  assert.match(plan.command, /dogfood digest --weekly --send/);
  assert.match(plan.install, /crontab -/);
  const win = weeklyCronPlan("win32");
  assert.match(win.install, /schtasks/i);
});

test("runDogfood digest --install-cron is a dry-run (shows, installs nothing)", () => {
  const r = runDogfood(["digest", "--install-cron"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /dry-run/i);
  assert.match(r.output, /0 9 \* \* 1/);
});

test("runDogfood digest --weekly emits markdown digest", () =>
  withTempHome(() => {
    const r = runDogfood(["digest", "--weekly"]);
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /weekly digest/i);
  }));
