// Wave 33.5 Block D — `mooter security` command.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSecurity } from "../src/commands/security.ts";

function fakeHome(withSettings: boolean): string {
  const h = mkdtempSync(join(tmpdir(), "moo-sec-cli-"));
  if (withSettings) {
    mkdirSync(join(h, ".claude"), { recursive: true });
    writeFileSync(join(h, ".claude", "settings.json"), "{}");
  }
  return h;
}

test("security audit renders 4 layers and exit 0 when sandbox is present", () => {
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
});
