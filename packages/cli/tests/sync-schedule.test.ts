// Wave 3 Day 3 — sync schedule spec (cadence only; no cron). node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runQuiet } from "../src/commands/quiet.ts";
import { buildConsent } from "../src/consent.ts";

function home(): string {
  const h = mkdtempSync(join(tmpdir(), "mooter-sched-"));
  writeFileSync(join(h, "consent.json"), JSON.stringify(buildConsent(true, new Date(1_780_000_000_000), "s")));
  return h;
}
function cadence(h: string): string {
  return JSON.parse(readFileSync(join(h, "consent.json"), "utf8")).sync_schedule.cadence;
}

test("buildConsent: default cadence is daily", () => {
  const c = buildConsent(true, new Date(1_780_000_000_000), "s");
  assert.equal(c.sync_schedule.cadence, "daily");
  assert.equal(c.sync_schedule.time_of_day, "03:00");
});

test("quiet --sync-cadence accepts the 3 valid cadences", () => {
  for (const cad of ["daily", "weekly", "manual-only"]) {
    const h = home();
    const res = runQuiet({ syncCadence: cad, mooterHome: h });
    assert.equal(res.exitCode, 0);
    assert.match(res.output, new RegExp(`cadence set to ${cad}`));
    assert.equal(cadence(h), cad);
  }
});

test("quiet --sync-cadence rejects an invalid cadence", () => {
  const res = runQuiet({ syncCadence: "hourly", mooterHome: home() });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /invalid cadence/);
});

test("quiet --sync-cadence preserves other consent fields", () => {
  const h = home();
  runQuiet({ syncCadence: "manual-only", mooterHome: h });
  const c = JSON.parse(readFileSync(join(h, "consent.json"), "utf8"));
  assert.equal(c.telemetry_enabled, true, "telemetry untouched");
  assert.equal(c.sync_schedule.cadence, "manual-only");
  assert.equal(c.sync_schedule.time_of_day, "03:00", "other schedule fields preserved");
});

test("sets cadence even when consent.json is absent (creates schedule)", () => {
  const h = mkdtempSync(join(tmpdir(), "mooter-sched2-"));
  const res = runQuiet({ syncCadence: "weekly", mooterHome: h });
  assert.equal(res.exitCode, 0);
  assert.equal(cadence(h), "weekly");
});
