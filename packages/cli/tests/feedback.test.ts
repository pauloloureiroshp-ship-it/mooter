// Wave 6.5 D2 — `mooter feedback` pure helpers + runFeedback IO. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  coerceTopic,
  coerceSeverity,
  looksLikePII,
  buildFeedbackPayload,
  runFeedback,
  runFeedbackList,
} from "../src/commands/feedback.ts";

function homeWithAuth(token: string | null): string {
  const h = mkdtempSync(join(tmpdir(), "mooter-fb-"));
  mkdirSync(h, { recursive: true });
  if (token) {
    writeFileSync(
      join(h, "auth.json"),
      JSON.stringify({ access_token: token, user_id_hash: "abcd1234", saved_at: "x", source: "test" }),
    );
  }
  return h;
}

test("coerceTopic / coerceSeverity narrow to the allow-list", () => {
  assert.equal(coerceTopic("BUG"), "bug");
  assert.equal(coerceTopic("nonsense"), "other");
  assert.equal(coerceSeverity("High"), "high");
  assert.equal(coerceSeverity(""), "low");
});

test("looksLikePII flags an email in the message", () => {
  assert.equal(looksLikePII("contact me at a@b.com"), true);
  assert.equal(looksLikePII("the chart loads slow"), false);
});

test("buildFeedbackPayload caps message at 1000 chars", () => {
  const p = buildFeedbackPayload({ message: "x".repeat(2000) });
  assert.equal(p.message.length, 1000);
});

test("buildFeedbackPayload throws on empty + on PII", () => {
  assert.throws(() => buildFeedbackPayload({ message: "  " }), /empty_message/);
  assert.throws(() => buildFeedbackPayload({ message: "ping me a@b.com" }), /pii_detected/);
});

test("runFeedback works WITHOUT login (anonymous via hub)", async () => {
  let sentBody: Record<string, unknown> = {};
  const f = (async (_url: string, init: RequestInit) => {
    sentBody = JSON.parse(String(init.body));
    return { ok: true, status: 201, json: async () => ({ id: "fb_anon" }) } as Response;
  }) as unknown as typeof fetch;
  const res = await runFeedback({ message: "anon ping", mooterHome: homeWithAuth(null), hubUrl: "https://hub.test", fetchImpl: f });
  assert.equal(res.exitCode, 0, "anonymous feedback must succeed");
  assert.match(res.output, /no login required/);
  assert.equal(sentBody.user_id_hash, null, "no user hash when not logged in");
});

test("runFeedback refuses a PII message before sending", async () => {
  let called = false;
  const f = (async () => { called = true; return {} as Response; }) as unknown as typeof fetch;
  const res = await runFeedback({ message: "reach me a@b.com", mooterHome: homeWithAuth("tok"), fetchImpl: f });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /email/);
  assert.equal(called, false, "must not POST a PII message");
});

test("runFeedback posts to hub (no auth header) and carries user_id_hash when logged in", async () => {
  let sentBody: Record<string, unknown> = {};
  let sentAuth: string | undefined = "x";
  const f = (async (_url: string, init: RequestInit) => {
    sentAuth = (init.headers as Record<string, string>).Authorization;
    sentBody = JSON.parse(String(init.body));
    return { ok: true, status: 201, json: async () => ({ id: "fb_xyz" }) } as Response;
  }) as unknown as typeof fetch;
  const res = await runFeedback({
    message: "dashboard slow on M1", topic: "performance", severity: "medium",
    mooterHome: homeWithAuth("tok123"), hubUrl: "https://hub.test", fetchImpl: f,
  });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /fb_xyz/);
  assert.equal(sentAuth, undefined, "feedback is anonymous — no Authorization header");
  assert.equal(sentBody.user_id_hash, "abcd1234", "pseudonymous hash rides along when logged in");
  assert.equal(sentBody.topic, "performance");
  assert.equal(sentBody.severity, "medium");
});

test("runFeedback returns non-zero on a server error", async () => {
  const f = (async () => ({ ok: false, status: 500 }) as Response) as unknown as typeof fetch;
  const res = await runFeedback({ message: "hi", mooterHome: homeWithAuth("tok"), hubUrl: "https://x.test", fetchImpl: f });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /HTTP 500/);
});

test("runFeedbackList needs an admin token", async () => {
  const prev = process.env.MOOTER_ADMIN_TOKEN; delete process.env.MOOTER_ADMIN_TOKEN;
  const res = await runFeedbackList({});
  if (prev !== undefined) process.env.MOOTER_ADMIN_TOKEN = prev;
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /MOOTER_ADMIN_TOKEN/);
});

test("runFeedbackList sends the admin bearer and renders rows", async () => {
  let sentAuth = "";
  const f = (async (_url: string, init: RequestInit) => {
    sentAuth = (init.headers as Record<string, string>).Authorization;
    return { ok: true, status: 200, json: async () => ({ feedback: [{ topic: "bug", severity: "high", content: "x crashes", received_at: "2026-06-02T10:00:00Z" }] }) } as Response;
  }) as unknown as typeof fetch;
  const res = await runFeedbackList({ adminToken: "adm_1", hubUrl: "https://hub.test", fetchImpl: f });
  assert.equal(res.exitCode, 0);
  assert.equal(sentAuth, "Bearer adm_1");
  assert.match(res.output, /x crashes/);
});
