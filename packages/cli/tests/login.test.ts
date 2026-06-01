// Wave 4 Phase B — `mooter login`/`logout` CLI. node:test + tsx.
// The only I/O is a loopback (127.0.0.1) callback — not HTTPS, not external
// network. Tests inject the "browser open" so no real browser launches.

import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "node:http";
import { statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildCliAuthUrl, parseCallback, buildAuthRecord, saveAuth, readAuth,
  runLogout, authStatus, runLogin, type AuthRecord,
} from "../src/commands/login.ts";

const NOW = "2026-05-31T18:00:00.000Z";
function home() { return mkdtempSync(join(tmpdir(), "mooter-login-")); }

test("buildCliAuthUrl: targets the existing /api/cli-token endpoint", () => {
  assert.equal(buildCliAuthUrl("https://mooter.ai"), "https://mooter.ai/api/cli-token");
  assert.equal(buildCliAuthUrl("http://localhost:3000/"), "http://localhost:3000/api/cli-token");
});

test("parseCallback: extracts token + user_hash, rejects non-callback", () => {
  assert.deepEqual(parseCallback("/callback?token=tok123&user_hash=abc"), { token: "tok123", userHash: "abc" });
  assert.equal(parseCallback("/callback?user_hash=abc"), null, "no token → null");
  assert.equal(parseCallback("/other?token=x"), null, "wrong path → null");
});

test("buildAuthRecord: stores hash (never email/raw id), with source", () => {
  const r = buildAuthRecord("tok", "deadbeef00", NOW);
  assert.equal(r.access_token, "tok");
  assert.equal(r.user_id_hash, "deadbeef00");
  assert.equal(r.source, "mooter login");
  assert.ok(!("email" in r) && !("user_id" in r), "no email / raw user_id stored");
});

test("saveAuth writes 0600 + readAuth roundtrip", () => {
  const h = home();
  const rec = buildAuthRecord("tok", "abc123", NOW);
  saveAuth(rec, h);
  const mode = statSync(join(h, "auth.json")).mode & 0o777;
  assert.equal(mode, 0o600, "token file must be user-only readable");
  assert.deepEqual(readAuth(h), rec);
});

test("runLogout removes auth.json; authStatus reflects state", () => {
  const h = home();
  assert.match(authStatus(h).output, /Not logged in/);
  saveAuth(buildAuthRecord("tok", "abcdef0123", NOW), h);
  assert.match(authStatus(h).output, /Logged in \(user abcdef01/);
  runLogout(h);
  assert.equal(readAuth(h), null, "auth.json deleted");
  assert.match(authStatus(h).output, /Not logged in/);
});

test("runLogin: loopback callback saves the token (injected open, no browser)", async () => {
  const h = home();
  const port = 7841; // test port (not the prod 7822)
  // Injected "open" fires the loopback callback the landing would redirect to.
  const open = (_url: string) => {
    get(`http://127.0.0.1:${port}/callback?token=loop-tok&user_hash=cafef00d99`, (res) => res.resume());
  };
  const res = await runLogin({ port, mooterHome: h, open, nowIso: NOW, timeoutMs: 5000, print: () => {} });
  assert.equal(res.exitCode, 0);
  const saved = readAuth(h) as AuthRecord;
  assert.equal(saved.access_token, "loop-tok");
  assert.equal(saved.user_id_hash, "cafef00d99");
});

test("runLogin: times out cleanly when no callback arrives", async () => {
  const h = home();
  const res = await runLogin({ port: 7842, mooterHome: h, manual: true, open: () => {}, timeoutMs: 150, print: () => {} });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /timed out/);
  assert.equal(readAuth(h), null, "no token saved on timeout");
});
