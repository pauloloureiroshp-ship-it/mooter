// Wave 33.8 Block A — statusline (local) ↔ hub (cross-device) stats reconcile.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  driftPct,
  reconcile,
  readLocalCalls,
  readHubCache,
  reconcileStats,
} from "../src/commands/stats-reconcile.ts";
import { runDoctorChecks } from "../src/commands/doctor.ts";

test("driftPct: percentage of the larger magnitude; 0/0 → 0", () => {
  assert.strictEqual(driftPct(0, 0), 0);
  assert.strictEqual(driftPct(100, 100), 0);
  assert.strictEqual(driftPct(95, 100), 5);
  assert.strictEqual(driftPct(50, 100), 50);
  assert.strictEqual(driftPct(269, 658), 59);
});

test("reconcile: unknown when hub never cached (the actionable state)", () => {
  const r = reconcile({ calls: 100 }, null);
  assert.strictEqual(r.level, "unknown");
  assert.match(r.detail, /rebuild-stats/);
});

test("reconcile: ok within 5% drift", () => {
  const r = reconcile({ calls: 98 }, { total_calls: 100, saved_usd: 25.95 });
  assert.strictEqual(r.level, "ok");
  assert.strictEqual(r.driftPct, 2);
});

test("reconcile: warn beyond 5% but framed as expected for multi-device", () => {
  const r = reconcile({ calls: 269 }, { total_calls: 658, saved_usd: 25.95 });
  assert.strictEqual(r.level, "warn");
  assert.match(r.detail, /local 269 calls vs hub 658/);
  assert.match(r.detail, /cross-device/);
  assert.match(r.detail, /hub saved \$25\.95/);
});

test("readLocalCalls: counts non-empty lines; 0 when absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "moo-recon-"));
  const log = join(dir, "decisions.log");
  writeFileSync(log, '{"a":1}\n{"a":2}\n\n{"a":3}\n');
  assert.strictEqual(readLocalCalls(log), 3);
  assert.strictEqual(readLocalCalls(join(dir, "nope.log")), 0);
});

test("readHubCache: reads cache; null when total_calls missing/absent", () => {
  const home = mkdtempSync(join(tmpdir(), "moo-hub-"));
  assert.strictEqual(readHubCache(home), null);
  writeFileSync(join(home, "hub-dashboard-cache.json"), JSON.stringify({ total_calls: 658, saved_usd: 25.95 }));
  assert.deepStrictEqual(readHubCache(home), { total_calls: 658, saved_usd: 25.95, last_updated: undefined });
});

test("reconcileStats: end-to-end with injected paths → warn on divergence", () => {
  const home = mkdtempSync(join(tmpdir(), "moo-rs-"));
  const log = join(home, "decisions.log");
  writeFileSync(log, Array.from({ length: 269 }, (_, i) => `{"i":${i}}`).join("\n") + "\n");
  writeFileSync(join(home, "hub-dashboard-cache.json"), JSON.stringify({ total_calls: 658, saved_usd: 25.95 }));
  const r = reconcileStats({ mooterHome: home, decisionsLogPath: log });
  assert.strictEqual(r.level, "warn");
  assert.strictEqual(r.local!.calls, 269);
  assert.strictEqual(r.hub!.total_calls, 658);
});

test("doctor: includes the stats-sync check (injected reconcile)", () => {
  const checks = runDoctorChecks({
    classifyPath: null,
    which: () => true,
    ollamaUp: () => true,
    home: mkdtempSync(join(tmpdir(), "moo-doc-stats-")),
    statsReconcile: () => ({ level: "ok", detail: "local 100 calls ≈ hub 100 (0% drift)" }),
  });
  const c = checks.find((x) => x.name.includes("stats sync"));
  assert.ok(c, "stats sync check present");
  assert.strictEqual(c!.level, "ok");
});

test("doctor: unknown reconcile downgrades to warn, never fail", () => {
  const checks = runDoctorChecks({
    classifyPath: null,
    which: () => true,
    ollamaUp: () => true,
    home: mkdtempSync(join(tmpdir(), "moo-doc-stats2-")),
    statsReconcile: () => ({ level: "unknown", detail: "hub stats not cached — run `mooter sync --rebuild-stats`" }),
  });
  const c = checks.find((x) => x.name.includes("stats sync"));
  assert.strictEqual(c!.level, "warn");
});
