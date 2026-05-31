// `mooter init` no-Ollama edge case — Wave 2.5 Day 2 sub-feature 2.
// Run: cd packages/cli && npm test
//
// When Ollama is offline the wizard must complete cleanly: T0 local tier is
// disabled, credentials.json omits providers.ollama, and no step throws.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit, type HardwareProfile, type InitIO } from "../src/commands/init.ts";

const FIXED_NOW = new Date("2026-05-30T12:00:00.000Z");

function offlineOllamaProfile(): HardwareProfile {
  return {
    os: "linux",
    os_version: "22.04",
    node_version: "v20.11.0",
    cpu_cores: 16,
    ram_gb: 32,
    gpu: null,
    ollama: { url: "http://localhost:11434", models: [], available: false },
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
  return mkdtempSync(join(tmpdir(), "mooter-init-noollama-"));
}

test("runInit completes when Ollama is offline", async () => {
  const home = tmpHome();
  // anthropic yes · choice 2 (max) · 3 pack prompts skip · telemetry off
  const { io, lines } = scriptedIO({ confirm: [true, false, false, false, false], ask: ["2"] });
  const res = await runInit({
    io,
    mooterHome: home,
    now: () => FIXED_NOW,
    probe: async () => offlineOllamaProfile(),
  });
  assert.equal(res.exitCode, 0);
  const creds = JSON.parse(readFileSync(join(home, "credentials.json"), "utf8"));
  assert.ok(creds.providers.anthropic, "anthropic still recorded");
  assert.equal(creds.providers.ollama, undefined, "ollama must be omitted when offline");
  assert.ok(existsSync(join(home, "profile.json")));
  assert.ok(lines.some((l) => l.includes("T0 local tier disabled")), "offline notice shown");
});

test("runInit completes with neither Ollama nor Anthropic (T0 stays usable)", async () => {
  const home = tmpHome();
  // anthropic no · 3 pack prompts skip · telemetry off
  const { io } = scriptedIO({ confirm: [false, false, false, false, false] });
  const res = await runInit({
    io,
    mooterHome: home,
    now: () => FIXED_NOW,
    probe: async () => offlineOllamaProfile(),
  });
  assert.equal(res.exitCode, 0);
  const creds = JSON.parse(readFileSync(join(home, "credentials.json"), "utf8"));
  assert.deepEqual(creds.providers, {}, "no providers when both are absent");
});
