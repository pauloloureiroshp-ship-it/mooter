// `mooter init` non-TTY (pipe-mode) suite — Wave 2.5 Day 2 sub-feature 1.
// Run: cd packages/cli && npm test
//
// Locks the ERR_USE_AFTER_CLOSE fix: when stdin is not a TTY, runInit() must use
// the line-buffered IO (makeNonTTYIO) and never reach readline/setRawMode. API
// keys come only from MOOTER_ANTHROPIC_KEY — never from the pipe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  runInit,
  makeNonTTYIO,
  type HardwareProfile,
  type AnthropicValidation,
} from "../src/commands/init.ts";

const FIXED_NOW = new Date("2026-05-30T12:00:00.000Z");

function fakeProfile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    os: "linux",
    os_version: "6.6.87-wsl2",
    node_version: "v20.11.0",
    cpu_cores: 16,
    ram_gb: 32,
    gpu: { model: "RTX 4090", vram_gb: 24 },
    ollama: { url: "http://host.docker.internal:11434", models: ["qwen3:30b"], available: true },
    ...overrides,
  };
}

const okValidation: AnthropicValidation = {
  valid: true,
  tier_detected: "api_key",
  budget_5h_limit: 0,
  budget_7d_limit: 0,
};

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-init-nontty-"));
}

/** A non-TTY IO fed from a fixed multi-line string, with an isolated env. */
function pipedIO(input: string, env: NodeJS.ProcessEnv = {}) {
  const lines: string[] = [];
  const io = makeNonTTYIO({
    input: Readable.from([input]),
    env,
    print: (l) => lines.push(l),
  });
  return { io, lines };
}

test("runInit completes in pipe-mode without ERR_USE_AFTER_CLOSE", async () => {
  const home = tmpHome();
  // y=have anthropic · 2=Max sub · 3 pack prompts default skip · telemetry default off
  const { io } = pipedIO("y\n2\n\n\n\n\n");
  const res = await runInit({
    io,
    mooterHome: home,
    now: () => FIXED_NOW,
    probe: async () => fakeProfile(),
  });
  assert.equal(res.exitCode, 0);
  for (const f of ["profile.json", "credentials.json", "consent.json"]) {
    assert.ok(existsSync(join(home, f)), `${f} not written`);
  }
  const creds = JSON.parse(readFileSync(join(home, "credentials.json"), "utf8"));
  assert.equal(creds.providers.anthropic.tier_detected, "max");
});

test("runInit reads MOOTER_ANTHROPIC_KEY when askHidden is called non-TTY", async () => {
  const home = tmpHome();
  // y · 4=API key only · packs skip · telemetry off. Key sourced from env, not pipe.
  const { io } = pipedIO("y\n4\n\n\n\n\n", { MOOTER_ANTHROPIC_KEY: "sk-ant-test" });
  const res = await runInit({
    io,
    mooterHome: home,
    now: () => FIXED_NOW,
    probe: async () => fakeProfile(),
    validateAnthropic: async (key) => {
      assert.equal(key, "sk-ant-test", "validator must receive the env key");
      return okValidation;
    },
  });
  assert.equal(res.exitCode, 0);
  const creds = JSON.parse(readFileSync(join(home, "credentials.json"), "utf8"));
  assert.equal(creds.providers.anthropic.type, "api_key");
  assert.doesNotMatch(JSON.stringify(creds), /sk-ant-test/, "raw key must never be persisted");
});

test("runInit degrades gracefully non-TTY when MOOTER_ANTHROPIC_KEY is unset", async () => {
  const home = tmpHome();
  // y · 4=API key only, but no env key → skip Anthropic, continue, no crash.
  const { io, lines } = pipedIO("y\n4\n\n\n\n\n", {});
  const res = await runInit({
    io,
    mooterHome: home,
    now: () => FIXED_NOW,
    probe: async () => fakeProfile(),
    validateAnthropic: async () => {
      throw new Error("validator must not run for an empty key");
    },
  });
  assert.equal(res.exitCode, 0);
  const creds = JSON.parse(readFileSync(join(home, "credentials.json"), "utf8"));
  assert.equal(creds.providers.anthropic, undefined, "no anthropic provider without a key");
  assert.ok(creds.providers.ollama, "ollama still recorded");
  assert.ok(existsSync(join(home, "consent.json")), "consent still written");
  assert.ok(lines.some((l) => l.includes("Continuing without Anthropic")), "degrade notice shown");
});

test("runInit handles CRLF line endings in piped input", async () => {
  const home = tmpHome();
  const { io } = pipedIO("y\r\n2\r\n\r\n\r\n\r\n\r\n");
  const res = await runInit({
    io,
    mooterHome: home,
    now: () => FIXED_NOW,
    probe: async () => fakeProfile(),
  });
  assert.equal(res.exitCode, 0);
  const creds = JSON.parse(readFileSync(join(home, "credentials.json"), "utf8"));
  assert.equal(creds.providers.anthropic.tier_detected, "max", "CRLF must not corrupt answers");
});

test("runInit falls back to defaults when the pipe is exhausted early", async () => {
  const home = tmpHome();
  // Only one line: confirm anthropic=yes. Everything after defaults (choice→max,
  // packs→skip, telemetry→off) without crashing on the empty stream.
  const { io } = pipedIO("y\n");
  const res = await runInit({
    io,
    mooterHome: home,
    now: () => FIXED_NOW,
    probe: async () => fakeProfile(),
  });
  assert.equal(res.exitCode, 0);
  const consent = JSON.parse(readFileSync(join(home, "consent.json"), "utf8"));
  assert.equal(consent.telemetry_enabled, false, "exhausted pipe → telemetry default OFF");
});
