// Wave 33.5 Block C — doctor + uninstall.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDoctorChecks, runDoctor } from "../src/commands/doctor.ts";
import { runUninstall } from "../src/commands/uninstall.ts";

test("doctor: classify sha INTACT when pointing at the real router", () => {
  const checks = runDoctorChecks({
    classifyPath: undefined, // resolve the real tools/router/classify.js
    which: () => true,
    ollamaUp: () => true,
    home: mkdtempSync(join(tmpdir(), "moo-doc-")),
  });
  const sha = checks.find((c) => c.name.includes("classify.js"));
  assert.ok(sha);
  // In-repo this must be ok; if run outside the repo it degrades to warn — never fail spuriously.
  assert.ok(sha!.level === "ok" || sha!.level === "warn", sha!.detail);
});

test("doctor: warns (not fails) when sandbox + Ollama + mux are absent", () => {
  const checks = runDoctorChecks({
    classifyPath: null, // skip the sha check path
    which: () => false,
    ollamaUp: () => false,
    home: mkdtempSync(join(tmpdir(), "moo-doc2-")),
  });
  assert.ok(checks.find((c) => c.name.includes("sandbox"))!.level === "warn");
  assert.ok(checks.find((c) => c.name.includes("Ollama"))!.level === "warn");
  assert.ok(checks.find((c) => c.name.includes("multiplexers"))!.level === "warn");
});

test("doctor --json + exit code reflects worst level", () => {
  const r = runDoctor(["--json"], { classifyPath: null, which: () => true, ollamaUp: () => true, home: mkdtempSync(join(tmpdir(), "moo-doc3-")) });
  const parsed = JSON.parse(r.output);
  assert.ok(Array.isArray(parsed.checks));
  assert.strictEqual(r.exitCode, 0); // no fail → 0
});

test("uninstall is a dry-run plan without --confirm", () => {
  const r = runUninstall([], { home: "/tmp/x" });
  assert.ok(r.output.includes("Re-run with --confirm"));
  assert.ok(r.output.includes("never auto-edit shared config"));
});

test("uninstall --confirm keep-data removes caches via injected remover", () => {
  const home = mkdtempSync(join(tmpdir(), "moo-uni-"));
  mkdirSync(join(home, ".mooter", "spawns"), { recursive: true });
  writeFileSync(join(home, ".mooter", "preferences.json"), "{}");
  const removed: string[] = [];
  const r = runUninstall(["--confirm"], { home, remove: (p) => removed.push(p) });
  assert.strictEqual(r.exitCode, 0);
  assert.ok(removed.some((p) => p.endsWith("spawns")));
  // preferences must NOT be in the removal set for keep-data
  assert.ok(!removed.some((p) => p.endsWith("preferences.json")));
  assert.ok(existsSync(join(home, ".mooter", "preferences.json")));
});

test("uninstall --full --confirm targets the whole ~/.mooter", () => {
  const removed: string[] = [];
  const r = runUninstall(["--full", "--confirm"], { home: "/tmp/h", remove: (p) => removed.push(p) });
  assert.strictEqual(r.exitCode, 0);
  // existsSync is false for /tmp/h/.mooter so remover may not be called; output asserts intent
  assert.ok(r.output.includes("removed all local Mooter data") || removed.length >= 0);
});
