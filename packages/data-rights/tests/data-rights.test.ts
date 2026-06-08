// Wave 32 (Phase NEW3) — GDPR data rights: export · privacy-audit · delete · forget-me.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildExport } from "../src/export.ts";
import { auditExport, isClean } from "../src/privacy-audit.ts";
import { deleteAll } from "../src/delete.ts";
import { forgetMe, signForget, getDeviceId } from "../src/forget-me.ts";

function fixtureHome(): string {
  const home = mkdtempSync(join(tmpdir(), "mooter-dr-"));
  const m = join(home, ".mooter");
  mkdirSync(join(m, "pastor"), { recursive: true });
  writeFileSync(join(m, "preferences.json"), JSON.stringify({ quiet: false, statusline_mode: "full" }));
  writeFileSync(join(m, "effort.json"), JSON.stringify({ mode: "ultramoo" }));
  writeFileSync(join(m, "limits.toml"), "[limits]\nmax_session_cost_usd = 50\n");
  writeFileSync(join(m, "pastor", "state.json"), JSON.stringify({ active: "coding-frontend" }));
  // sensitive — must be redacted, never exported
  writeFileSync(join(m, ".telemetry_secret"), "s3cr3t-telemetry-value-1234567890");
  writeFileSync(join(m, "auth.json"), JSON.stringify({ token: "ghp_aaaaaaaaaaaaaaaaaaaa" }));
  writeFileSync(join(m, "credentials.json"), JSON.stringify({ email: "paulo@example.com" }));
  mkdirSync(join(home, ".frugal"), { recursive: true });
  writeFileSync(join(home, ".frugal", "device.id"), "dev-abc-123\n");
  return home;
}

// ── privacy-audit ──────────────────────────────────────────────────────────
test("audit catches emails, tokens, jwt, private keys, and known secrets", () => {
  assert.ok(auditExport("contact me at a@b.com").some((v) => v.kind === "email"));
  assert.ok(auditExport("Authorization: bearer ghp_abcdefghijklmnop").some((v) => v.kind === "bearer_token"));
  assert.ok(auditExport("tok eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpM").some((v) => v.kind === "jwt"));
  assert.ok(auditExport("-----BEGIN PRIVATE KEY-----").some((v) => v.kind === "private_key"));
  assert.ok(auditExport("blah mySecret123 blah", ["mySecret123"]).some((v) => v.kind === "secret_value"));
  assert.ok(isClean("just routing features, tier T0, confidence 0.9"));
});

// ── export ───────────────────────────────────────────────────────────────────
test("export includes config + pastor, redacts secrets, and PASSES the audit", () => {
  const home = fixtureHome();
  const r = buildExport({ home, knownSecrets: ["s3cr3t-telemetry-value-1234567890"] });
  const obj = JSON.parse(r.json);
  // included config
  assert.strictEqual(obj.config["preferences.json"].statusline_mode, "full");
  assert.strictEqual(obj.config["effort.json"].mode, "ultramoo");
  assert.strictEqual(obj.pastor["state.json"].active, "coding-frontend");
  // redacted inventory lists them WITHOUT values
  assert.ok(obj.redacted_present.includes(".telemetry_secret"));
  assert.ok(obj.redacted_present.includes("auth.json"));
  assert.ok(obj.redacted_present.includes("credentials.json"));
  // the actual secret/token/email must NOT appear anywhere
  assert.ok(!r.json.includes("s3cr3t-telemetry-value-1234567890"), "telemetry secret leaked!");
  assert.ok(!r.json.includes("ghp_aaaaaaaaaaaaaaaaaaaa"), "github token leaked!");
  assert.ok(!r.json.includes("paulo@example.com"), "email leaked!");
  // GATE: export passes the privacy audit
  assert.strictEqual(r.clean, true, JSON.stringify(r.audit));
});

// ── delete-all ─────────────────────────────────────────────────────────────
test("delete-all without confirm is a dry-run (nothing removed)", () => {
  const home = fixtureHome();
  const r = deleteAll({ home });
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(r.removed.length, 0);
  assert.ok(r.skipped.length > 0);
  assert.ok(existsSync(join(home, ".mooter", "effort.json")), "still present after dry-run");
});

test("delete-all --confirm wipes the .mooter dir contents", () => {
  const home = fixtureHome();
  const r = deleteAll({ home, confirm: true });
  assert.strictEqual(r.dryRun, false);
  assert.ok(r.removed.length > 0);
  assert.ok(!existsSync(join(home, ".mooter", "effort.json")), "removed");
  assert.ok(!existsSync(join(home, ".mooter", ".telemetry_secret")), "secret removed too");
});

// ── forget-me ────────────────────────────────────────────────────────────────
test("getDeviceId reads ~/.frugal/device.id", () => {
  const home = fixtureHome();
  assert.strictEqual(getDeviceId(home), "dev-abc-123");
});

test("signForget is deterministic HMAC", () => {
  const a = signForget("dev-1", 100, "secret");
  const b = signForget("dev-1", 100, "secret");
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, signForget("dev-1", 101, "secret"));
});

test("forget-me without confirm does not call the hub", async () => {
  let called = false;
  const r = await forgetMe({ fetchImpl: (async () => { called = true; return new Response("", { status: 202 }); }) as any });
  assert.strictEqual(called, false);
  assert.match(r.message, /requires --confirm/);
});

test("forget-me --confirm posts signed body and treats 202 as queued", async () => {
  const home = fixtureHome();
  let body: any = null;
  const fakeFetch = (async (_url: string, init: any) => {
    body = JSON.parse(init.body);
    return new Response("", { status: 202 });
  }) as any;
  const r = await forgetMe({ confirm: true, home, now: 100, fetchImpl: fakeFetch });
  assert.strictEqual(r.queued, true);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(body.device_id, "dev-abc-123");
  assert.ok(body.signature.length > 0, "signed");
});

test("forget-me handles a non-202 hub response honestly", async () => {
  const home = fixtureHome();
  const fakeFetch = (async () => new Response("nope", { status: 500 })) as any;
  const r = await forgetMe({ confirm: true, home, now: 1, fetchImpl: fakeFetch });
  assert.strictEqual(r.queued, false);
  assert.match(r.message, /500/);
});
