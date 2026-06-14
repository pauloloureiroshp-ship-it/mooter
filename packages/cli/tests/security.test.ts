// Wave 33.5 Block D — `mooter security` command.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

import { runSecurity } from "../src/commands/security.ts";

function fakeHome(withSettings: boolean): string {
  const h = mkdtempSync(join(tmpdir(), "moo-sec-cli-"));
  if (withSettings) {
    mkdirSync(join(h, ".claude"), { recursive: true });
    writeFileSync(join(h, ".claude", "settings.json"), "{}");
  }
  return h;
}

// The "sandbox present" path asserts exit 0, which only holds when a real sandbox
// (bwrap) is installed — otherwise the audit correctly reports FAIL → exit ≠ 0.
// Guard so the test runs (and asserts exit 0) only where bwrap exists; honest skip
// elsewhere (CI runners / Windows). This replaces the cli-test --test-skip-pattern.
function hasSandbox(): boolean {
  try {
    execSync("command -v bwrap", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test(
  "security audit renders 4 layers and exit 0 when sandbox is present",
  { skip: hasSandbox() ? false : "no bwrap on this host (sandbox absent)" },
  () => {
  const r = runSecurity(["audit"], { env: {} as NodeJS.ProcessEnv, home: fakeHome(true) });
  assert.ok(r.output.includes("Layer 1"));
  assert.ok(r.output.includes("Layer 4"));
  // On a host with bwrap, network/fs layers pass → no FAIL → exit 0.
  assert.strictEqual(r.exitCode, 0);
});

test("security audit warns when ANTHROPIC_API_KEY is in the env", () => {
  const r = runSecurity(["audit"], { env: { ANTHROPIC_API_KEY: "sk-x" } as NodeJS.ProcessEnv, home: fakeHome(false) });
  assert.ok(r.output.includes("WARN"), r.output);
  assert.ok(r.output.includes("ANTHROPIC_API_KEY"), r.output);
});

test("security audit --json is machine-readable", () => {
  const r = runSecurity(["audit", "--json"], { env: {} as NodeJS.ProcessEnv, home: fakeHome(true) });
  const parsed = JSON.parse(r.output);
  assert.strictEqual(parsed.layers.length, 4);
  assert.ok(["PASS", "WARN", "FAIL"].includes(parsed.overall));
});

test("security with an unknown subcommand shows usage", () => {
  const r = runSecurity(["bogus"], { env: {} as NodeJS.ProcessEnv, home: fakeHome(false) });
  assert.strictEqual(r.exitCode, 1);
  assert.ok(r.output.includes("usage"));
  assert.ok(r.output.includes("summary"), "usage should mention the summary subcommand");
});

// Wave Mega 50-51 (2.D) — `mooter security summary`.
test("security summary: one-screen honest summary with layers AND non-protections", () => {
  const r = runSecurity(["summary"], { env: {} as NodeJS.ProcessEnv, home: fakeHome(false) });
  assert.strictEqual(r.exitCode, 0);
  assert.ok(r.output.includes("4 layers"), r.output);
  assert.ok(r.output.includes("Network egress"));
  assert.ok(r.output.includes("NOT protected"), "must state what the sandbox does NOT cover");
  assert.ok(r.output.includes("MAIN Claude Code session is not sandboxed"));
  assert.ok(r.output.includes("Cloud tiers"), "must be honest that cloud calls leave the machine");
  // One screen: keep it tight.
  assert.ok(r.output.split("\n").length <= 25, `summary too long: ${r.output.split("\n").length} lines`);
});

test("security summary: points to verification commands, not blind trust", () => {
  const r = runSecurity(["summary"], { env: {} as NodeJS.ProcessEnv, home: fakeHome(false) });
  assert.ok(r.output.includes("mooter security audit"));
  assert.ok(r.output.includes("mooter security spawn-test"));
  assert.ok(r.output.includes("docs/SECURITY_COMPETITIVE_ADVANTAGE.md"));
});
