// Wave 3 Day 3 — `mooter sync --dry-run` client. node:test + tsx.
// Asserts ZERO network: a global fetch that throws if called must never fire.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSync } from "../src/commands/sync.ts";
import { buildConsent } from "../src/consent.ts";
import { listAudit } from "../src/sync/sync_audit.ts";

const NOW = 1_780_000_000_000;
const DAY = 864e5;
const SECRET = "dryrun-secret";

function homeWithConsent(enabled: boolean): string {
  const home = mkdtempSync(join(tmpdir(), "mooter-dr-"));
  writeFileSync(join(home, "consent.json"), JSON.stringify(buildConsent(enabled, new Date(NOW), SECRET)));
  writeFileSync(join(home, "profile.json"), JSON.stringify({ os: "linux", gpu: { model: "RTX 4090", vram_gb: 24 }, ram_gb: 64, providers: { ollama: {} } }));
  return home;
}
const LINES = [JSON.stringify({ event: "classified", ts_ms: NOW - 0.1 * DAY, tier: "T0", confidence: 0.9, safety_boost_applied: false })];

test("refuses without consent (opt-out)", () => {
  const res = runSync({ dryRun: true, mooterHome: homeWithConsent(false), lines: LINES, nowMs: NOW, secret: SECRET });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /not opted-in/);
});

test("refuses bare `sync` (real sync not implemented)", () => {
  const res = runSync({ mooterHome: homeWithConsent(true), nowMs: NOW, secret: SECRET });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /Real sync not implemented yet \(Wave 4/);
});

test("dry-run: full report + audit logged + ZERO network", () => {
  const home = homeWithConsent(true);
  // Trip-wire: any fetch during the dry-run fails the test.
  const orig = globalThis.fetch;
  (globalThis as any).fetch = () => { throw new Error("NETWORK CALL during dry-run!"); };
  try {
    const res = runSync({ dryRun: true, mooterHome: home, lines: LINES, nowMs: NOW, secret: SECRET });
    assert.equal(res.exitCode, 0);
    assert.match(res.output, /DRY RUN \(no network\)/);
    assert.match(res.output, /NOT contacted in dry-run/);
    assert.match(res.output, /Wave 4 Phase D/);
  } finally {
    (globalThis as any).fetch = orig;
  }
  const audit = listAudit(home);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].kind, "dry-run");
  assert.equal(audit[0].bytes_sent, 0, "zero bytes sent is the proof of no network");
});
