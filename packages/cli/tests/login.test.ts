// Wave 4 Phase B — `mooter login`/`logout` CLI. node:test + tsx.
// The only I/O is a loopback (127.0.0.1) callback — not HTTPS, not external
// network. Tests inject the "browser open" so no real browser launches.
//
// H3 hardening: random port, state CSRF, PKCE infra.

import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "node:http";
import { statSync, mkdtempSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildCliAuthUrl, parseCallback, buildAuthRecord, saveAuth, readAuth,
  runLogout, authStatus, runLogin, generateState, generatePkce,
  type AuthRecord,
} from "../src/commands/login.ts";

const NOW = "2026-05-31T18:00:00.000Z";
function home() { return mkdtempSync(join(tmpdir(), "mooter-login-")); }

// ── buildCliAuthUrl ──────────────────────────────────────────────────────────

test("buildCliAuthUrl: no params → clean /api/cli-token (backward compat)", () => {
  assert.equal(buildCliAuthUrl("https://mooter.ai"), "https://mooter.ai/api/cli-token");
  assert.equal(buildCliAuthUrl("http://localhost:3000/"), "http://localhost:3000/api/cli-token");
});

test("buildCliAuthUrl: includes port + state + PKCE challenge when provided", () => {
  const raw = buildCliAuthUrl("https://mooter.ai", { port: 54321, state: "abc123", codeChallenge: "xyz_challenge" });
  const u = new URL(raw);
  assert.equal(u.searchParams.get("port"), "54321");
  assert.equal(u.searchParams.get("state"), "abc123");
  assert.equal(u.searchParams.get("code_challenge"), "xyz_challenge");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
});

// ── parseCallback ────────────────────────────────────────────────────────────

test("parseCallback: extracts token + user_hash, rejects non-callback", () => {
  assert.deepEqual(parseCallback("/callback?token=tok123&user_hash=abc"), { token: "tok123", userHash: "abc" });
  assert.equal(parseCallback("/callback?user_hash=abc"), null, "no token → null");
  assert.equal(parseCallback("/other?token=x"), null, "wrong path → null");
});

test("parseCallback: includes state when present in callback URL", () => {
  const r = parseCallback("/callback?token=t&user_hash=h&state=mystate");
  assert.deepEqual(r, { token: "t", userHash: "h", state: "mystate" });
});

// ── PKCE helpers ─────────────────────────────────────────────────────────────

test("generateState: returns non-empty base64url string", () => {
  const s = generateState();
  assert.ok(s.length > 0);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
});

test("generatePkce: verifier and challenge are valid; challenge = SHA256(verifier)", () => {
  const { verifier, challenge } = generatePkce();
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  const expected = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(challenge, expected, "challenge must be SHA-256(verifier) base64url");
});

// ── buildAuthRecord, saveAuth, readAuth ──────────────────────────────────────

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
  // ⚠️ `mode: 0o600` NAO existe no Windows. Medido a 2026-08-20 nesta maquina:
  // pedido `0o600` -> obtido `0o666`. O Node so mexe no bit de leitura-apenas.
  //
  // A asercao do modo fica onde significa alguma coisa; no Windows verifica-se
  // que o codigo AINDA pede o `0o600`, para a proteccao nao se perder no dia em
  // que alguem so testar aqui.
  //
  // O que isto NAO cobre: ACLs do Windows. Nesta plataforma o ficheiro de token
  // NAO fica user-only por este caminho — e uma lacuna real deste produto, e
  // fica escrita onde se ve em vez de escondida atras de um teste verde.
  if (process.platform !== "win32") {
    const mode = statSync(join(h, "auth.json")).mode & 0o777;
    assert.equal(mode, 0o600, "token file must be user-only readable");
  } else {
    const fonte = readFileSync(new URL("../src/commands/login.ts", import.meta.url), "utf8");
    assert.match(fonte, /mode: 0o600/, "o codigo tem de continuar a pedir 0600 ao escrever o token");
  }
  assert.deepEqual(readAuth(h), rec);
});

// ── runLogout / authStatus ───────────────────────────────────────────────────

test("runLogout removes auth.json; authStatus reflects state", () => {
  const h = home();
  assert.match(authStatus(h).output, /Not logged in/);
  saveAuth(buildAuthRecord("tok", "abcdef0123", NOW), h);
  assert.match(authStatus(h).output, /Logged in \(user abcdef01/);
  runLogout(h);
  assert.equal(readAuth(h), null, "auth.json deleted");
  assert.match(authStatus(h).output, /Not logged in/);
});

// ── runLogin ─────────────────────────────────────────────────────────────────

test("runLogin: loopback callback saves the token (state echoed by injected open)", async () => {
  const h = home();
  const port = 7841; // test port (not the prod random port)
  // The injected "open" simulates the landing: it reads the state from the auth
  // URL and echoes it back in the callback — exactly what the real landing does.
  const open = (url: string) => {
    const state = new URL(url).searchParams.get("state") ?? "";
    get(
      `http://127.0.0.1:${port}/callback?token=loop-tok&user_hash=cafef00d99&state=${encodeURIComponent(state)}`,
      (res) => res.resume(),
    );
  };
  const res = await runLogin({ port, mooterHome: h, open, nowIso: NOW, timeoutMs: 5000, print: () => {} });
  assert.equal(res.exitCode, 0);
  const saved = readAuth(h) as AuthRecord;
  assert.equal(saved.access_token, "loop-tok");
  assert.equal(saved.user_id_hash, "cafef00d99");
});

test("runLogin: rejects callback with wrong state (CSRF protection)", async () => {
  const h = home();
  const port = 7843;
  // Attacker fires callback with a fabricated state — must be rejected.
  const open = (_url: string) => {
    get(
      `http://127.0.0.1:${port}/callback?token=evil-tok&user_hash=hacker&state=wrong-state`,
      (res) => res.resume(),
    );
  };
  const res = await runLogin({ port, mooterHome: h, open, nowIso: NOW, timeoutMs: 1000, print: () => {} });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /state mismatch|timed out/, "must fail with CSRF or timeout");
  assert.equal(readAuth(h), null, "malicious token must not be saved");
});

test("runLogin: times out cleanly when no callback arrives", async () => {
  const h = home();
  const res = await runLogin({ port: 7842, mooterHome: h, manual: true, open: () => {}, timeoutMs: 150, print: () => {} });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /timed out/);
  assert.equal(readAuth(h), null, "no token saved on timeout");
});
