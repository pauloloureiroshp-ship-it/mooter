import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  probeClassifySha,
  probeSecretPerms,
  probeTelemetryConsent,
  summarizeProbes,
  runtimeThreatProbes,
} from "../src/threat-model/runtime-checks.ts";
import { EXPECTED_CLASSIFY_SHA } from "../../synthesis/src/state/central-state.ts";

test("probeClassifySha: intact / mismatch / absent", () => {
  assert.equal(probeClassifySha(EXPECTED_CLASSIFY_SHA).status, "ok");
  assert.equal(probeClassifySha("deadbeef").status, "fail");
  assert.equal(probeClassifySha(null).status, "warn");
});

test("probeSecretPerms: 0600 ok, 0644 warns, absent ok", () => {
  const dir = mkdtempSync(join(tmpdir(), "mooter-threat-"));
  try {
    const secure = join(dir, "secret-600");
    writeFileSync(secure, "x");
    chmodSync(secure, 0o600);
    assert.equal(probeSecretPerms(secure).status, "ok");

    const leaky = join(dir, "secret-644");
    writeFileSync(leaky, "x");
    chmodSync(leaky, 0o644);
    const r = probeSecretPerms(leaky);
    assert.equal(r.status, "warn");
    assert.match(r.detail, /readable/);

    assert.equal(probeSecretPerms(join(dir, "nope")).status, "ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("probeTelemetryConsent: explicit vs missing", () => {
  assert.equal(probeTelemetryConsent({ telemetry: false }).status, "ok");
  assert.equal(probeTelemetryConsent({ accepted: true }).status, "ok");
  assert.equal(probeTelemetryConsent(null).status, "warn");
});

test("summarizeProbes picks the worst status and counts", () => {
  const s = summarizeProbes([
    { id: "a", vector: "x", severity: "high", status: "ok", detail: "" },
    { id: "b", vector: "x", severity: "high", status: "warn", detail: "" },
    { id: "c", vector: "x", severity: "high", status: "fail", detail: "" },
  ]);
  assert.equal(s.worst, "fail");
  assert.equal(s.failures, 1);
  assert.equal(s.warnings, 1);
});

test("runtimeThreatProbes aggregates classify + secrets + consent", () => {
  const dir = mkdtempSync(join(tmpdir(), "mooter-threat-home-"));
  try {
    const secret = join(dir, ".telemetry_secret");
    writeFileSync(secret, "s");
    chmodSync(secret, 0o600);
    const s = runtimeThreatProbes({
      classifySha: EXPECTED_CLASSIFY_SHA,
      consent: { telemetry: true },
      secretFiles: [secret],
    });
    assert.equal(s.worst, "ok");
    assert.equal(s.results.length, 3); // classify + 1 secret + consent
    assert.equal(s.results[0].status, "ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
