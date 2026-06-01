// `mooter login` / `mooter logout` (Wave 4 Phase B) — connects the terminal to a
// mooter.ai account using the auth flow the landing app ALREADY ships:
//
//   CLI opens the browser at  {landing}/api/cli-token
//     → landing validates the sb-access-token cookie (browser session)
//     → redirects token + user_id_hash to the CLI's local server at
//       http://127.0.0.1:7822/callback?token=…&user_hash=…
//     → CLI saves it to ~/.mooter/auth.json (0600) and the loopback server closes.
//
// Privacy: the landing only ever sends a one-way user_id_hash (never the email or
// raw user_id), so auth.json stores the hash — matching the existing contract.
// The only network is the loopback callback + the user's own browser; no external
// calls are made by this code, and tests never start the server or hit the net.

import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mooterHomeDefault } from "../packs.ts";

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

export const CLI_CALLBACK_PORT = 7822; // must match landing /api/cli-token redirect target
export const DEFAULT_LANDING_URL = "https://mooter.ai";

/** The landing URL the CLI opens to start the handshake. */
export function buildCliAuthUrl(landingUrl: string = DEFAULT_LANDING_URL): string {
  return `${landingUrl.replace(/\/$/, "")}/api/cli-token`;
}

/** Parse the loopback callback URL → { token, userHash } or null. */
export function parseCallback(reqUrl: string): { token: string; userHash: string } | null {
  try {
    const u = new URL(reqUrl, `http://127.0.0.1:${CLI_CALLBACK_PORT}`);
    if (!u.pathname.startsWith("/callback")) return null;
    const token = u.searchParams.get("token");
    const userHash = u.searchParams.get("user_hash") ?? "";
    return token ? { token, userHash } : null;
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
 * Run the login handshake: start the loopback callback server, open the browser
 * at the landing's /api/cli-token, wait for the redirect, save the token. The
 * loopback server + browser are the only I/O; no external network call is made.
 */
export async function runLogin(opts: LoginOptions = {}): Promise<CmdResult> {
  const landingUrl = opts.landingUrl ?? process.env.MOOTER_LANDING_URL ?? DEFAULT_LANDING_URL;
  const port = opts.port ?? CLI_CALLBACK_PORT;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const print = opts.print ?? ((l: string) => process.stdout.write(l + "\n"));
  const open = opts.open ?? openBrowser;
  const authUrl = buildCliAuthUrl(landingUrl);

  print("🐮 Mooter login");
  print(`   Opening your browser at: ${authUrl}`);
  print(`   (sign in there; the CLI is listening on 127.0.0.1:${port})`);
  print("");
  print("Waiting for authorization... (Ctrl+C to cancel)");

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
      const parsed = parseCallback(req.url || "");
      if (!parsed) {
        reply.writeHead(404, { "Content-Type": "text/plain" });
        reply.end("not found");
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
      finish({ exitCode: 1, output: `✗ Could not start the local login server on 127.0.0.1:${port}: ${String((err as Error).message)}` });
    });

    server.listen(port, "127.0.0.1", () => {
      if (!opts.manual) open(authUrl);
    });

    timer = setTimeout(() => {
      finish({ exitCode: 1, output: "✗ Login timed out (no authorization received). Run `mooter login` to try again." });
    }, timeoutMs);
  });
}
