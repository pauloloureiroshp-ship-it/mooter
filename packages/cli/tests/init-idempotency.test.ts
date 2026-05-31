// `mooter init` idempotency — Wave 2.5 Day 2 sub-feature 4.
// Run: cd packages/cli && npm test
//
// Three consecutive runs must not duplicate packs, must keep the installed set
// stable across re-runs, must refresh profile (captured_utc), and must persist
// the latest telemetry consent choice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit, type HardwareProfile, type InitIO } from "../src/commands/init.ts";

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

function scriptedIO(answers: { confirm?: boolean[]; ask?: string[] }) {
  const confirm = [...(answers.confirm ?? [])];
  const ask = [...(answers.ask ?? [])];
  const io: InitIO = {
    print: () => {},
    ask: async () => ask.shift() ?? "",
    askHidden: async () => "",
    confirm: async (_q, def) => (confirm.length ? (confirm.shift() as boolean) : def),
  };
  return io;
}

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-init-idem-"));
}

const installedPacks = (home: string): string[] =>
  JSON.parse(readFileSync(join(home, "installed.json"), "utf8")).packs;

test("runInit 3x: no duplicate packs, stable set, profile refresh, consent persists", async () => {
  const home = tmpHome();

  // Run 1 — install the top 2 packs, telemetry OFF.
  await runInit({
    io: scriptedIO({ confirm: [true, true, true, false, false], ask: ["2"] }),
    mooterHome: home,
    now: () => new Date("2026-05-30T10:00:00.000Z"),
    probe: async () => fakeProfile(),
  });
  const afterRun1 = installedPacks(home);
  assert.ok(afterRun1.length >= 1, "expected packs installed in run 1");

  // Run 2 — same 2 packs, tier changes to pro, telemetry still OFF.
  await runInit({
    io: scriptedIO({ confirm: [true, true, true, false, false], ask: ["1"] }),
    mooterHome: home,
    now: () => new Date("2026-05-30T11:00:00.000Z"),
    probe: async () => fakeProfile(),
  });
  const afterRun2 = installedPacks(home);

  // Run 3 — same packs, telemetry ON.
  await runInit({
    io: scriptedIO({ confirm: [true, true, true, false, true], ask: ["2"] }),
    mooterHome: home,
    now: () => new Date("2026-05-30T12:00:00.000Z"),
    probe: async () => fakeProfile(),
  });
  const afterRun3 = installedPacks(home);

  // No duplicates, set never grows on re-run with the same selections.
  assert.equal(new Set(afterRun3).size, afterRun3.length, "installed.packs has duplicates");
  assert.equal(afterRun2.length, afterRun3.length, "set must be stable across re-runs");
  assert.deepEqual([...afterRun2].sort(), [...afterRun3].sort());

  // packs/ has exactly one dir per installed pack (no orphan duplicates).
  const packDirs = readdirSync(join(home, "packs"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  assert.equal(packDirs.length, afterRun3.length, "packs/ dir count must match installed list");

  // profile refreshed to run 3's clock; consent reflects run 3's opt-in.
  const profile = JSON.parse(readFileSync(join(home, "profile.json"), "utf8"));
  assert.equal(profile.captured_utc, "2026-05-30T12:00:00.000Z");
  const consent = JSON.parse(readFileSync(join(home, "consent.json"), "utf8"));
  assert.equal(consent.telemetry_enabled, true, "latest consent choice must persist");
  assert.ok(existsSync(join(home, "credentials.json")));
});
