// `mooter init` no-Anthropic edge case — Wave 2.5 Day 2 sub-feature 3.
// Run: cd packages/cli && npm test
//
// Two paths: (a) user declines Anthropic → wizard completes, credentials omit
// anthropic, consent still written; (b) a provided key fails validation → clean
// abort (exit 1) with a Cause/Fix-formatted error and no schema files left behind.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit, formatError, type HardwareProfile, type InitIO } from "../src/commands/init.ts";

const FIXED_NOW = new Date("2026-05-30T12:00:00.000Z");

function fakeProfile(): HardwareProfile {
  return {
    os: "linux",
    os_version: "6.6.87-wsl2",
    node_version: "v20.11.0",
    cpu_cores: 16,
    ram_gb: 32,
    gpu: { model: "RTX 4090", vram_gb: 24 },
    ollama: { url: "http://host.docker.internal:11434", models: ["qwen3:30b"], available: true },
  };
}

function scriptedIO(answers: { confirm?: boolean[]; ask?: string[]; hidden?: string[] }) {
  const confirm = [...(answers.confirm ?? [])];
  const ask = [...(answers.ask ?? [])];
  const hidden = [...(answers.hidden ?? [])];
  const lines: string[] = [];
  const io: InitIO = {
    print: (l) => lines.push(l),
    ask: async () => ask.shift() ?? "",
    askHidden: async () => hidden.shift() ?? "",
    confirm: async (_q, def) => (confirm.length ? (confirm.shift() as boolean) : def),
  };
  return { io, lines };
}

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-init-noanthropic-"));
}

test("runInit completes when user skips the Anthropic step", async () => {
  const home = tmpHome();
  // anthropic? no · 3 pack prompts skip · telemetry off
  const { io } = scriptedIO({ confirm: [false, false, false, false, false] });
  const res = await runInit({
    io,
    mooterHome: home,
    now: () => FIXED_NOW,
    probe: async () => fakeProfile(),
  });
  assert.equal(res.exitCode, 0);
  const creds = JSON.parse(readFileSync(join(home, "credentials.json"), "utf8"));
  assert.equal(creds.providers.anthropic, undefined, "no anthropic when skipped");
  assert.ok(creds.providers.ollama, "ollama still recorded");
  assert.ok(existsSync(join(home, "consent.json")), "consent still written");
});

test("runInit aborts gracefully on Anthropic 401 with a Cause/Fix error", async () => {
  const home = tmpHome();
  const { io, lines } = scriptedIO({ confirm: [true], ask: ["4"], hidden: ["sk-ant-bad"] });
  const res = await runInit({
    io,
    mooterHome: home,
    now: () => FIXED_NOW,
    probe: async () => fakeProfile(),
    validateAnthropic: async () => ({
      valid: false,
      tier_detected: "api_key",
      budget_5h_limit: 0,
      budget_7d_limit: 0,
      error: "401 Unauthorized",
    }),
  });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /validation failed/i);
  // Clean abort: no partial schema files.
  assert.equal(existsSync(join(home, "credentials.json")), false);
  assert.equal(existsSync(join(home, "consent.json")), false);
  // Error is shown in the uniform Cause/Fix format.
  const blob = lines.join("\n");
  assert.match(blob, /✗ Anthropic validation failed/);
  assert.match(blob, /Cause: 401 Unauthorized/);
  assert.match(blob, /Fix:\s+get a new key/i);
});

test("formatError renders the ✗ / Cause / Fix shape", () => {
  const msg = formatError("thing broke", "because reasons", "do this");
  assert.equal(msg, "✗ thing broke\n  Cause: because reasons\n  Fix:   do this");
});
