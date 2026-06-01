// Wave 6 D2 — `mooter init --from-token=<t>` pre-config fetch. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPreConfigFromToken } from "../src/commands/init.ts";

const VALID = "a".repeat(40);

function mockFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response) as unknown as typeof fetch;
}

test("returns the pre-config for a valid token (200)", async () => {
  const cfg = { persona: "senior_ic", subscription_self_reported: "max" };
  const pre = await fetchPreConfigFromToken(VALID, mockFetch(200, cfg), "https://example.test");
  assert.deepEqual(pre, cfg);
});

test("rejects a malformed token without calling fetch", async () => {
  let called = false;
  const f = (async () => { called = true; return {} as Response; }) as unknown as typeof fetch;
  const pre = await fetchPreConfigFromToken("too-short", f, "https://example.test");
  assert.equal(pre, null);
  assert.equal(called, false, "must not hit the network for an invalid token");
});

test("returns null on a non-OK response (expired/used → 410)", async () => {
  const pre = await fetchPreConfigFromToken(VALID, mockFetch(410, { error: "expired_or_used" }), "https://example.test");
  assert.equal(pre, null);
});

test("returns null when fetch throws (offline)", async () => {
  const f = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  const pre = await fetchPreConfigFromToken(VALID, f, "https://example.test");
  assert.equal(pre, null);
});

test("targets the read-only validate endpoint (does not consume the token)", async () => {
  let url = "";
  const f = (async (u: string) => {
    url = u;
    return { ok: true, status: 200, json: async () => ({ persona: "other" }) } as Response;
  }) as unknown as typeof fetch;
  await fetchPreConfigFromToken(VALID, f, "https://example.test");
  assert.match(url, /\/api\/install\/validate\/a{40}$/);
});
