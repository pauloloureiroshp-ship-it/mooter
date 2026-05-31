// `mooter init` wizard suite (Wave 2 Day 6 — DoD §3.8).
// Run: cd packages/cli && npm test   (tsx --test tests/*.test.ts)
//
// Drives runInit() with a scripted IO + injected probe/validator/clock + temp
// ~/.mooter, so the suite never touches a TTY, the network, or the real home.
// Covers: 3 schemas written with 0600, telemetry default OFF, idempotent re-run,
// 401 → exit 1, and the pure scoring/builder helpers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runInit,
  recommendPacks,
  hardwareFit,
  providerTierFit,
  buildProfile,
  buildConsent,
  buildCredentials,
  type HardwareProfile,
  type InitIO,
  type AnthropicValidation,
} from "../src/commands/init.ts";

const FIXED_NOW = new Date("2026-05-29T12:00:00.000Z");

function fakeProfile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    os: "linux",
    os_version: "6.6.87-wsl2",
    node_version: "v20.11.0",
    cpu_cores: 16,
    ram_gb: 32,
    gpu: { model: "RTX 4090", vram_gb: 24 },
    ollama: { url: "http://host.docker.internal:11434", models: ["qwen2.5-coder:7b", "qwen3:30b"], available: true },
    ...overrides,
  };
}

/** Scripted IO: pull answers from per-method queues; print into a buffer. */
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

const okValidation: AnthropicValidation = {
  valid: true,
  tier_detected: "api_key",
  budget_5h_limit: 0,
  budget_7d_limit: 0,
};

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-init-"));
}

// ── full wizard, max sub, telemetry OFF ──────────────────────────────────────

test("runInit: writes 3 schemas with 0600, telemetry default OFF", async () => {
  const home = tmpHome();
  // answers: anthropic? yes · choice "2" (max) · 3 pack installs: no/no/no · telemetry: no
  const { io } = scriptedIO({
    confirm: [true, false, false, false, false],
    ask: ["2"],
  });
  const res = await runInit({
    io,
    mooterHome: home,
    now: () => FIXED_NOW,
    probe: async () => fakeProfile(),
  });
  assert.equal(res.exitCode, 0);

  for (const f of ["profile.json", "credentials.json", "consent.json"]) {
    const path = join(home, f);
    assert.ok(existsSync(path), `${f} not written`);
    const mode = statSync(path).mode & 0o777;
    assert.equal(mode, 0o600, `${f} perms ${mode.toString(8)} != 600`);
  }

  const consent = JSON.parse(readFileSync(join(home, "consent.json"), "utf8"));
  assert.equal(consent.telemetry_enabled, false, "telemetry must default OFF");

  const creds = JSON.parse(readFileSync(join(home, "credentials.json"), "utf8"));
  assert.equal(creds.providers.anthropic.type, "oauth_max");
  assert.equal(creds.providers.anthropic.tier_detected, "max");
  assert.ok(creds.providers.ollama, "ollama provider should be recorded");
});

test("runInit: telemetry ON when user opts in", async () => {
  const home = tmpHome();
  // W3 D2: persona is asked (ask[1]) and telemetry is now y/n/d (ask[2]).
  const { io } = scriptedIO({ confirm: [true, false, false, false], ask: ["2", "d", "y"] });
  await runInit({ io, mooterHome: home, now: () => FIXED_NOW, probe: async () => fakeProfile() });
  const consent = JSON.parse(readFileSync(join(home, "consent.json"), "utf8"));
  assert.equal(consent.telemetry_enabled, true);
});

// ── API-key path: 401 aborts ──────────────────────────────────────────────────

test("runInit: invalid API key (401) aborts with exit 1", async () => {
  const home = tmpHome();
  const { io } = scriptedIO({ confirm: [true], ask: ["4"], hidden: ["sk-ant-bad"] });
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
      error: "auth failed (HTTP 401)",
    }),
  });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /validation failed/i);
  // An aborted run must leave NO schema behind — not even a partial credential
  // file. Locks the abort-before-any-write contract against future refactors.
  assert.equal(existsSync(join(home, "consent.json")), false);
  assert.equal(existsSync(join(home, "credentials.json")), false);
  assert.equal(existsSync(join(home, "profile.json")), false);
});

test("runInit: valid API key records api_key credential type", async () => {
  const home = tmpHome();
  const { io } = scriptedIO({ confirm: [true, false, false, false, false], ask: ["4"], hidden: ["sk-ant-good"] });
  const res = await runInit({
    io,
    mooterHome: home,
    now: () => FIXED_NOW,
    probe: async () => fakeProfile(),
    validateAnthropic: async () => okValidation,
  });
  assert.equal(res.exitCode, 0);
  const creds = JSON.parse(readFileSync(join(home, "credentials.json"), "utf8"));
  assert.equal(creds.providers.anthropic.type, "api_key");
  assert.equal(creds.providers.anthropic.credential_ref, "keyring");
  assert.doesNotMatch(JSON.stringify(creds), /sk-ant-good/, "raw key must never be persisted");
});

// ── idempotency ───────────────────────────────────────────────────────────────

test("runInit: re-run does not duplicate installed packs", async () => {
  const home = tmpHome();
  // install the first recommended pack both runs (confirm[1] = true).
  const run = () =>
    runInit({
      io: scriptedIO({ confirm: [true, true, false, false, false], ask: ["2"] }).io,
      mooterHome: home,
      now: () => FIXED_NOW,
      probe: async () => fakeProfile(),
    });
  await run();
  await run();
  const installed = JSON.parse(readFileSync(join(home, "installed.json"), "utf8"));
  const unique = new Set(installed.packs);
  assert.equal(installed.packs.length, unique.size, "installed.packs has duplicates");
  assert.ok(installed.packs.length >= 1, "expected at least one installed pack");
});

// ── pure helpers ────────────────────────────────────────────────────────────────

test("hardwareFit: local-capable floor scores by GPU presence", () => {
  assert.equal(hardwareFit("T0", fakeProfile()), 1.0); // 24GB VRAM
  assert.equal(hardwareFit("T1", fakeProfile({ gpu: { model: "iGPU", vram_gb: 2 } })), 0.5);
  assert.equal(hardwareFit("T0", fakeProfile({ ollama: { url: "x", models: [], available: false } })), 0.0);
  assert.equal(hardwareFit("T3", fakeProfile()), 0.5); // cloud-floor pack
});

test("providerTierFit: ceiling vs detected tier", () => {
  assert.equal(providerTierFit("T2", "T3"), 1.0);
  assert.equal(providerTierFit("T3", "T2"), 0.5);
  assert.equal(providerTierFit("T3", "T1"), 0.0);
});

test("recommendPacks: sorts by fit descending, applies static trust", () => {
  const packs = [
    { pack_id: "diagram-systems", model_floor: "T0", model_ceiling: "T3" },
    { pack_id: "voice-tts", model_floor: "T1", model_ceiling: "T2" },
  ];
  const fits = recommendPacks(packs, fakeProfile(), "T3");
  assert.equal(fits[0].pack_id, "diagram-systems", "higher trust should rank first");
  assert.ok(fits[0].fit_score >= fits[1].fit_score);
  assert.equal(fits[0].trust, 98);
});

test("buildProfile: next_refresh_utc is 30 days out", () => {
  const p = buildProfile(fakeProfile(), FIXED_NOW);
  assert.equal(p.captured_utc, FIXED_NOW.toISOString());
  assert.equal(p.next_refresh_utc, "2026-06-28T12:00:00.000Z");
  assert.equal(p.node_version, "20.11.0");
});

test("buildConsent: shape + revocable flag", () => {
  const c = buildConsent(false, FIXED_NOW) as Record<string, unknown>;
  assert.equal(c.telemetry_enabled, false);
  assert.equal(c.can_revoke, true);
  assert.equal(c.consent_version, "1.0.0");
});

test("buildCredentials: omits anthropic block when no access", () => {
  const c = buildCredentials(null, fakeProfile().ollama, fakeProfile().gpu, FIXED_NOW) as {
    providers: Record<string, unknown>;
  };
  assert.equal(c.providers.anthropic, undefined);
  assert.ok(c.providers.ollama);
});
