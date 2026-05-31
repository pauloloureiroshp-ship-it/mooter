// Wave 3 Day 2 — telemetry opt-in consent (HMAC audit-trail). node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildConsent, signConsent, verifyConsent, getLocalSecret, type Consent } from "../src/consent.ts";
import { runQuiet } from "../src/commands/quiet.ts";

const NOW = new Date("2026-05-31T18:00:00Z");
const SECRET = "test-secret-deadbeef";

test("default opt-OUT: disabled consent has null signature + all categories off", () => {
  const c = buildConsent(false, NOW, SECRET);
  assert.equal(c.telemetry_enabled, false);
  assert.equal(c.consent_signature, null);
  assert.equal(c.consent_timestamp_utc, null);
  assert.equal(c.data_categories.tier_distribution, false);
  assert.equal(c.data_categories.prompt_content, false);
});

test("opt-in: enabled consent is HMAC-signed + user-verifiable", () => {
  const c = buildConsent(true, NOW, SECRET);
  assert.equal(c.telemetry_enabled, true);
  assert.ok(c.consent_signature, "has a signature");
  assert.equal(c.consent_timestamp_utc, NOW.toISOString());
  assert.equal(verifyConsent(c, SECRET), true, "verifies with the right secret");
  assert.equal(verifyConsent(c, "wrong-secret"), false, "fails with a wrong secret");
});

test("prompt_content is NEVER true, even when opted in", () => {
  const c = buildConsent(true, NOW, SECRET);
  assert.equal(c.data_categories.prompt_content, false);
});

test("tamper detection: flipping enabled without re-signing fails verify", () => {
  const c = buildConsent(true, NOW, SECRET);
  const tampered = { ...c, telemetry_enabled: false } as Consent; // signature now stale
  assert.equal(verifyConsent(tampered, SECRET), false);
});

test("signConsent is deterministic for the same payload+secret", () => {
  const c = buildConsent(true, NOW, SECRET);
  assert.equal(signConsent(c, SECRET), signConsent(c, SECRET));
});

test("getLocalSecret persists + reuses a 0600 secret", () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-sec-"));
  const s1 = getLocalSecret(home);
  const s2 = getLocalSecret(home);
  assert.equal(s1, s2, "stable across calls");
  assert.ok(s1.length >= 32);
});

test("quiet --telemetry-off writes a revoked, verifiable consent.json", () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-tel-"));
  const res = runQuiet({ telemetryOff: true, mooterHome: home, now: NOW, secret: SECRET });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Telemetry disabled/);
  const consent = JSON.parse(readFileSync(join(home, "consent.json"), "utf8")) as Consent;
  assert.equal(consent.telemetry_enabled, false);
  assert.equal(verifyConsent(consent, SECRET), true, "revoked consent still verifies (null sig)");
});
