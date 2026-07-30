// `mooter login` / `mooter logout` (Wave 4 Phase B) — connects the terminal to a
// mooter.ai account using the auth flow the landing app ALREADY ships:
//
//   CLI opens the browser at  {landing}/api/cli-token?port=PORT&state=STATE&code_challenge=CC
//     → landing validates the sb-access-token cookie (browser session)
//     → redirects token + user_id_hash to the CLI's local server at
//       http://127.0.0.1:{PORT}/callback?token=…&user_hash=…&state=STATE
//     → CLI verifies state (CSRF), saves token to ~/.mooter/auth.json (0600)
//
// Security hardening (H3):
//   • Random loopback port (port 0 → OS-assigned) — prevents port-squatting
//   • state parameter — CSRF protection; callback rejected if state doesn't match
//   • PKCE infra — verifier+challenge generated and passed to landing for future
//     authorization-code flow; current landing echoes state (not code-based yet)
//
// Privacy: the landing only ever sends a one-way user_id_hash (never the email or
// raw user_id), so auth.json stores the hash — matching the existing contract.
// The only network is the loopback callback + the user's own browser; no external
// calls are made by this code, and tests never start the server or hit the net.

import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mooterHomeDefault } from "../packs.ts";

// ── Security helpers ────────────────────────────────────────────────────────

/** Random state token for CSRF protection (base64url, 128 bits). */
export function generateState(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * PKCE pair — SHA-256 S256 method (RFC 7636).
 * Pass `challenge` to the landing; send `verifier` to the token endpoint when
 * the landing upgrades to a code-based exchange flow.
 */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface AuthRecord {
  access_token: string;
  user_id_hash: string;
  saved_at: string;
  source: "mooter login";
}

export const CLI_CALLBACK_PORT = 7822; // legacy default; runLogin uses port 0 (random) by default
export const DEFAULT_LANDING_URL = "https://mooter.ai";

/** The landing URL the CLI opens to start the handshake.
 *  Includes port, state, and code_challenge when provided so the landing can:
 *    • redirect back to the correct loopback port
 *    • echo the state for CSRF validation
 *    • store the PKCE challenge for a future code-based exchange
 */
export function buildCliAuthUrl(
  landingUrl: string = DEFAULT_LANDING_URL,
  opts: { port?: number; state?: string; codeChallenge?: string } = {},
): string {
  const base = `${landingUrl.replace(/\/$/, "")}/api/cli-token`;
  const params = new URLSearchParams();
  if (opts.port !== undefined) params.set("port", String(opts.port));
  if (opts.state) params.set("state", opts.state);
  if (opts.codeChallenge) {
    params.set("code_challenge", opts.codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Parse the loopback callback URL → { token, userHash, state? } or null. */
export function parseCallback(reqUrl: string): { token: string; userHash: string; state?: string } | null {
  try {
    const u = new URL(reqUrl, `http://127.0.0.1:${CLI_CALLBACK_PORT}`);
    if (!u.pathname.startsWith("/callback")) return null;
    const token = u.searchParams.get("token");
    const userHash = u.searchParams.get("user_hash") ?? "";
    const stateVal = u.searchParams.get("state");
    const result: { token: string; userHash: string; state?: string } = { token: token!, userHash };
    if (stateVal !== null) result.state = stateVal;
    return token ? result : null;
  } catch {
    return null;
  }
}

export function buildAuthRecord(token: string, userHash: string, nowIso: string): AuthRecord {
  return { access_token: token, user_id_hash: userHash, saved_at: nowIso, source: "mooter login" };
}

function authPath(mooterHome?: string): string {
  return join(mooterHome ?? mooterHomeDefault(), "auth.json");
}

export function saveAuth(record: AuthRecord, mooterHome?: string): void {
  const home = mooterHome ?? mooterHomeDefault();
  mkdirSync(home, { recursive: true });
  writeFileSync(authPath(mooterHome), JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
}

export function readAuth(mooterHome?: string): AuthRecord | null {
  try {
    return JSON.parse(readFileSync(authPath(mooterHome), "utf8")) as AuthRecord;
  } catch {
    return null;
  }
}

/** `mooter logout` — remove the saved token (reverts to anonymous/dry-run sync). */
export function runLogout(mooterHome?: string): CmdResult {
  try {
    if (existsSync(authPath(mooterHome))) unlinkSync(authPath(mooterHome));
  } catch {
    /* already gone */
  }
  return { exitCode: 0, output: "✓ Logged out — token removed from ~/.mooter/auth.json (sync reverts to dry-run)." };
}

/** `mooter login --status` — show the current auth without changing anything. */
export function authStatus(mooterHome?: string): CmdResult {
  const a = readAuth(mooterHome);
  if (!a) return { exitCode: 0, output: "Not logged in. Run `mooter login` to connect this terminal." };
  return { exitCode: 0, output: `Logged in (user ${a.user_id_hash.slice(0, 8)}… · since ${a.saved_at}).` };
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* manual fallback — the URL is already printed */
  }
}

export interface LoginOptions {
  landingUrl?: string;
  mooterHome?: string;
  /** Explicit port for tests. Production always uses 0 (OS-assigned random port). */
  port?: number;
  /** Don't open a browser (CI / manual). */
  manual?: boolean;
  /** ms before giving up (default 180s). */
  timeoutMs?: number;
  /** Injected browser opener (tests). */
  open?: (url: string) => void;
  /** Injected clock (tests). */
  nowIso?: string;
  /** Injected line printer (tests silence output by passing a no-op). */
  print?: (line: string) => void;
}

/**
 * Run the login handshake: start the loopback callback server on a random port
 * (port 0), generate a CSRF state + PKCE pair, open the browser at the
 * landing's /api/cli-token with those params, wait for the redirect, verify
 * state, and save the token.  Only loopback I/O — no external network call.
 */
export async function runLogin(opts: LoginOptions = {}): Promise<CmdResult> {
  const landingUrl = opts.landingUrl ?? process.env.MOOTER_LANDING_URL ?? DEFAULT_LANDING_URL;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const print = opts.print ?? ((l: string) => process.stdout.write(l + "\n"));
  const open = opts.open ?? openBrowser;

  // Security: CSRF state + PKCE (both generated fresh per login attempt)
  const state = generateState();
  const pkce = generatePkce();

  return new Promise<CmdResult>((resolve) => {
    let server: Server;
    let timer: ReturnType<typeof setTimeout>;
    let done = false;
    const finish = (res: CmdResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { server.close(); } catch { /* ignore */ }
      resolve(res);
    };

    server = createServer((req, reply) => {
      if (done) { reply.writeHead(400).end("done"); return; }

      const parsed = parseCallback(req.url || "");
      if (!parsed) {
        reply.writeHead(404, { "Content-Type": "text/plain" });
        reply.end("not found");
        return;
      }

      // CSRF: reject if state doesn't match
      if (parsed.state !== state) {
        reply.writeHead(400, { "Content-Type": "text/plain" });
        reply.end("invalid state");
        finish({ exitCode: 1, output: "✗ Login failed: state mismatch (possible CSRF attempt). Run `mooter login` to try again." });
        return;
      }

      const record = buildAuthRecord(parsed.token, parsed.userHash, opts.nowIso ?? new Date().toISOString());
      saveAuth(record, opts.mooterHome);
      reply.writeHead(200, { "Content-Type": "text/html" });
      reply.end("<html><body style='font-family:sans-serif;background:#0B0A09;color:#F2EDE6;text-align:center;padding-top:4rem'><h1>🐮 Mooter connected</h1><p>You can close this tab and return to your terminal.</p></body></html>");
      print("");
      print(`✓ Authorized (user ${record.user_id_hash.slice(0, 8)}…)`);
      print(`✓ Token saved to ~/.mooter/auth.json (mode 0600)`);
      print("ℹ Run `mooter hub` for your authenticated view.");
      finish({ exitCode: 0, output: "" });
    });

    server.on("error", (err) => {
      const addr = server.address();
      const p = (addr && typeof addr === "object") ? addr.port : (opts.port ?? 0);
      finish({ exitCode: 1, output: `✗ Could not start the local login server on 127.0.0.1:${p}: ${String((err as Error).message)}` });
    });

    // Port 0 = OS assigns a random ephemeral port (prevents port-squatting).
    // Tests may pass an explicit port for determinism.
    const listenPort = opts.port ?? 0;
    server.listen(listenPort, "127.0.0.1", () => {
      const addr = server.address();
      const actualPort = (addr && typeof addr === "object") ? addr.port : listenPort;
      const authUrl = buildCliAuthUrl(landingUrl, { port: actualPort, state, codeChallenge: pkce.challenge });

      print("🐮 Mooter login");
      print(`   Opening your browser at: ${authUrl}`);
      print(`   (sign in there; the CLI is listening on 127.0.0.1:${actualPort})`);
      print("");
      print("Waiting for authorization... (Ctrl+C to cancel)");

      if (!opts.manual) open(authUrl);
    });

    timer = setTimeout(() => {
      finish({ exitCode: 1, output: "✗ Login timed out (no authorization received). Run `mooter login` to try again." });
    }, timeoutMs);
  });
}
