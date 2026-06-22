#!/usr/bin/env node
/**
 * Mooter — Cowork⇄CC Loop Runner (CC side / "generator").
 *
 * Pilots Claude Code in headless mode over a file-bus so an external evaluator
 * (Cowork) can drive multi-round waves WITHOUT any human keystrokes after start.
 *
 * Bus (all under _handoff/loop/):
 *   STATE.json  — state machine {status, round, maxRounds, sessionId, ...}
 *   INBOX.md    — next instruction FROM Cowork TO CC (CC consumes)
 *   OUTBOX.md   — CC's last result (Cowork reads)
 *   CRITERIA.md — wave success criteria + stop conditions (human-authored)
 *   STOP        — sentinel file; if present, runner exits cleanly (kill switch)
 *   transcript/ — append-only round-by-round audit
 *
 * Status machine:
 *   cc_running    → runner runs CC on INBOX, writes OUTBOX, → awaiting_eval
 *   awaiting_eval → runner idles; Cowork evaluator flips to cc_running (new INBOX) or done/stopped
 *   done|stopped  → runner exits
 *
 * Safety: never merges/pushes to main (enforced in the prompt + CRITERIA);
 *   maxRounds cap; per-round timeout; STOP kill switch; isolated branch only.
 *
 * Headless CC ref: https://code.claude.com/docs/en/headless
 *
 * Usage:  node _handoff/loop/loop-runner.mjs
 * Env:
 *   LOOP_DIR           default: dir of this script
 *   REPO               default: two levels up from LOOP_DIR (the repo root)
 *   PERMISSION_MODE    default: acceptEdits  (set bypassPermissions for full autonomy — see README)
 *   MAX_ROUNDS         default: 12
 *   POLL_MS            default: 5000
 *   ROUND_TIMEOUT_MS   default: 1800000 (30 min)
 *   DRY_RUN            default: 0  (1 = simulate CC without calling claude — smoke-test the bus)
 *   CLAUDE_BIN         default: claude
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOOP_DIR = process.env.LOOP_DIR ? resolve(process.env.LOOP_DIR) : HERE;
const REPO = process.env.REPO ? resolve(process.env.REPO) : resolve(LOOP_DIR, "..", "..");
const PERMISSION_MODE = process.env.PERMISSION_MODE || "acceptEdits";
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS || 12);
const POLL_MS = Number(process.env.POLL_MS || 5000);
const ROUND_TIMEOUT_MS = Number(process.env.ROUND_TIMEOUT_MS || 30 * 60 * 1000);
const DRY_RUN = process.env.DRY_RUN === "1";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

const P = (f) => join(LOOP_DIR, f);
const STATE = P("STATE.json");
const INBOX = P("INBOX.md");
const OUTBOX = P("OUTBOX.md");
const STOP = P("STOP");
const TRANSCRIPT = P("transcript");

const log = (...a) => console.log(`[loop ${new Date().toISOString()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readState() {
  try { return JSON.parse(readFileSync(STATE, "utf8")); }
  catch { return { status: "idle", round: 0, maxRounds: MAX_ROUNDS, sessionId: null }; }
}
function writeState(s) {
  s.updated_at = new Date().toISOString();
  const tmp = STATE + ".tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, STATE); // atomic-ish
}

const PROTOCOL_FOOTER = `

────────────────────────────────────────────────────────
LOOP PROTOCOL (read carefully — you are the GENERATOR in an autonomous Cowork⇄CC loop):
- Do the work for THIS round only, then STOP your turn. Do not ask the human anything.
- NEVER merge/push/tag to main. NEVER delete data. Stay on the isolated branch.
- End your turn with a fenced block exactly like this so the evaluator can parse you:
  \`\`\`status
  DID: <one line on what you changed/ran this round>
  TESTS: <pass/fail counts or "n/a">
  BLOCKERS: <none | what needs a human>
  NEXT: <what you think the next round should do>
  DONE: <yes|no — is the wave's CRITERIA.md fully met?>
  \`\`\`
- If you hit something that genuinely needs a human (credentials, irreversible action), set BLOCKERS and DONE:no and stop.
────────────────────────────────────────────────────────`;

function runClaude(promptText, sessionId) {
  return new Promise((resolveRun) => {
    if (DRY_RUN) {
      log("DRY_RUN: simulating CC round");
      return resolveRun({
        ok: true,
        sessionId: sessionId || "dry-session",
        text: "```status\nDID: dry-run simulated round\nTESTS: n/a\nBLOCKERS: none\nNEXT: continue\nDONE: no\n```",
      });
    }
    const args = ["-p", promptText, "--output-format", "stream-json", "--verbose", "--permission-mode", PERMISSION_MODE];
    if (sessionId) args.push("--resume", sessionId);
    const child = spawn(CLAUDE_BIN, args, { cwd: REPO });
    let sid = sessionId || null;
    let finalText = "";
    let buf = "";
    const timer = setTimeout(() => { log("round timeout — killing CC"); child.kill("SIGKILL"); }, ROUND_TIMEOUT_MS);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.session_id && !sid) sid = ev.session_id;
          // capture assistant text + final result across CC stream-json shapes
          if (ev.type === "result" && typeof ev.result === "string") finalText = ev.result;
          else if (ev.type === "assistant" && ev.message?.content) {
            for (const c of ev.message.content) if (c.type === "text") finalText += c.text;
          }
        } catch { /* non-JSON verbose line — ignore */ }
      }
    });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ ok: code === 0, sessionId: sid, text: finalText || stderr || "(no output captured)", code });
    });
    child.on("error", (e) => { clearTimeout(timer); resolveRun({ ok: false, sessionId: sid, text: `spawn error: ${e.message}` }); });
  });
}

async function main() {
  mkdirSync(TRANSCRIPT, { recursive: true });
  log(`runner up · repo=${REPO} · perm=${PERMISSION_MODE} · maxRounds=${MAX_ROUNDS} · dryRun=${DRY_RUN}`);
  for (;;) {
    if (existsSync(STOP)) { log("STOP sentinel found — exiting"); return; }
    const s = readState();
    if (s.status === "done" || s.status === "stopped") { log(`status=${s.status} — exiting`); return; }
    if (s.status !== "cc_running") { await sleep(POLL_MS); continue; }

    if ((s.round || 0) > (s.maxRounds || MAX_ROUNDS)) {
      log("maxRounds exceeded — stopping"); writeState({ ...s, status: "stopped", reason: "maxRounds" }); return;
    }

    const inbox = existsSync(INBOX) ? readFileSync(INBOX, "utf8") : "(empty INBOX)";
    log(`round ${s.round}: running CC`);
    const res = await runClaude(inbox + PROTOCOL_FOOTER, s.sessionId);

    writeFileSync(OUTBOX, res.text);
    appendFileSync(join(TRANSCRIPT, `round-${s.round}-inbox.md`), inbox);
    writeFileSync(join(TRANSCRIPT, `round-${s.round}-outbox.md`), res.text);
    // Transparency ledger — one line per round, read live by the cockpit tab.
    appendFileSync(P("ledger.jsonl"), JSON.stringify({
      ts: new Date().toISOString(), round: s.round, ok: res.ok, chars: res.text.length,
    }) + "\n");
    writeState({ ...s, status: "awaiting_eval", sessionId: res.sessionId, lastOk: res.ok });
    log(`round ${s.round}: CC done (ok=${res.ok}) → awaiting_eval`);
  }
}
main().catch((e) => { log("fatal", e); process.exit(1); });
