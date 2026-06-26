// `mooter init` — F2.1: recommended-pack install must pass the SAME static-audit
// gate as `mooter pack install`. Closes the bypass where onboarding installed
// packs without scanning the scaffold for prompt-injection / exfil.
// Run: cd packages/cli && npm test
//
// Strategy: drive the real recommend→install flow over the bundled registry, but
// inject the `auditPack` seam so we control the audit verdict deterministically
// (no spawn of the auditor script). A HIGH finding must block every pack; a clean
// verdict must install as before. The fix is the wiring, so we assert the wiring.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit, type HardwareProfile, type InitIO } from "../src/commands/init.ts";
import { type AuditResult } from "../src/commands/pack.ts";

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
  const lines: string[] = [];
  const io: InitIO = {
    print: (l) => lines.push(l),
    ask: async () => ask.shift() ?? "",
    askHidden: async () => "",
    confirm: async (_q, def) => (confirm.length ? (confirm.shift() as boolean) : def),
  };
  return { io, lines };
}

const tmpHome = (): string => mkdtempSync(join(tmpdir(), "mooter-init-f21-"));
const installedPacks = (home: string): string[] =>
  JSON.parse(readFileSync(join(home, "installed.json"), "utf8")).packs;

const CLEAN: AuditResult = { ok: true, findings: [] };
const HIGH: AuditResult = {
  ok: false,
  findings: [{ id: "exfil_tool", severity: "high", line: 3 }],
};

// Control: a clean audit verdict installs ≥1 pack (proves the flow still works
// AND that the gate is not blocking healthy packs).
test("init: clean audit verdict installs recommended packs", async () => {
  const home = tmpHome();
  await runInit({
    io: scriptedIO({ confirm: [true, true, true, false, false], ask: ["2"] }).io,
    mooterHome: home,
    now: () => new Date("2026-06-25T10:00:00.000Z"),
    probe: async () => fakeProfile(),
    auditPack: () => CLEAN,
  });
  assert.ok(installedPacks(home).length >= 1, "clean packs must install");
});

// The bypass fix: a HIGH finding blocks EVERY recommended pack during onboarding,
// even though the user confirmed install. installed.json ends empty.
test("init: HIGH static-audit finding blocks the install (bypass closed)", async () => {
  const home = tmpHome();
  const { io, lines } = scriptedIO({ confirm: [true, true, true, false, false], ask: ["2"] });
  await runInit({
    io,
    mooterHome: home,
    now: () => new Date("2026-06-25T10:00:00.000Z"),
    probe: async () => fakeProfile(),
    auditPack: () => HIGH,
  });
  assert.equal(installedPacks(home).length, 0, "HIGH-flagged packs must NOT install via init");
  assert.ok(
    lines.some((l) => /blocked/i.test(l) && /exfil_tool/.test(l)),
    "must surface a blocked message naming the HIGH finding",
  );
});

// Fail-open parity with pack.ts: auditor unavailable (null) must NOT break a
// trusted install — onboarding still works when the auditor script is missing.
test("init: null audit verdict (auditor unavailable) installs (fail-open)", async () => {
  const home = tmpHome();
  await runInit({
    io: scriptedIO({ confirm: [true, true, true, false, false], ask: ["2"] }).io,
    mooterHome: home,
    now: () => new Date("2026-06-25T10:00:00.000Z"),
    probe: async () => fakeProfile(),
    auditPack: () => null,
  });
  assert.ok(installedPacks(home).length >= 1, "null verdict must fail-open (install proceeds)");
});
