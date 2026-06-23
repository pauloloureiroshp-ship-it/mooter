#!/usr/bin/env node
/**
 * Mooter - Cowork/CC Loop Runner (SDK side / "generator") - SEAMLESS.
 *
 * WHY THIS EXISTS (the fix for "I keep screenshotting dialogs and asking Claude
 * which option to pick"):
 *   The dialogs come from INTERACTIVE Claude Code sessions calling AskUserQuestion.
 *   In headless CLI (`claude -p`) that question has nowhere to go. This runner uses
 *   the **Claude Agent SDK** instead of the CLI, which exposes `canUseTool` - a
 *   single callback that fires for BOTH tool-permission requests AND AskUserQuestion
 *   clarifying questions. So the loop ANSWERS its own questions in-process, by the
 *   STANDING_POLICY/rubric (or via a tiny Haiku "governor" call), and NEVER pops a
 *   dialog. No clicking, no typing, no VS Code UI in the autonomous path.
 *
 * Docs: https://code.claude.com/docs/en/agent-sdk/user-input  (canUseTool + AskUserQuestion)
 *       https://code.claude.com/docs/en/agent-sdk/overview     (resume, hooks, sessions)
 *
 * Auth: from 2026-06-15 the Agent SDK runs on your Claude plan credit (Max 20x = $200/mo
 *       SDK credit), NO API key required. The bundled binary uses your logged-in CC.
 *       Ref: https://support.claude.com/en/articles/15036540
 *
 * Install (once, in ~/frugal):  npm i @anthropic-ai/claude-agent-sdk
 * Run:  node _handoff/loop/sdk-runner.mjs        (or via pm2, like loop-runner.mjs)
 *
 * Bus (_handoff/loop/): STATE.json, INBOX.md, OUTBOX.md, DECISIONS.md, ledger.jsonl,
 *   heartbeat.json, transcript/, STOP (kill switch).  Same bus as loop-runner.mjs.
 *
 * Env: LOOP_DIR, REPO, GEN_MODEL(default sonnet), GOVERNOR_MODEL(default haiku),
 *      MAX_ROUNDS(12), POLL_MS(5000), DRY_RUN(0).
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOOP_DIR = process.env.LOOP_DIR ? resolve(process.env.LOOP_DIR) : HERE;
const REPO = process.env.REPO ? resolve(process.env.REPO) : resolve(LOOP_DIR, "..", "..");
const FLEET_DIR = resolve(LOOP_DIR, "..", "fleet");
const GEN_MODEL = process.env.GEN_MODEL || "claude-sonnet-4-6";
const GOVERNOR_MODEL = process.env.GOVERNOR_MODEL || "claude-haiku-4-5";
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS || 12);
const POLL_MS = Number(process.env.POLL_MS || 5000);
const DRY_RUN = process.env.DRY_RUN === "1";

const P = (f) => join(LOOP_DIR, f);
const STATE = P("STATE.json"), INBOX = P("INBOX.md"), OUTBOX = P("OUTBOX.md");
const STOP = P("STOP"), HEARTBEAT = P("heartbeat.json"), TRANSCRIPT = P("transcript");
const DECISIONS = P("DECISIONS.md");

const log = (...a) => console.log("[sdk-loop " + new Date().toISOString() + "]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readSafe = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };

function readState() { try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return { status: "idle", round: 0, sessionId: null }; } }
function writeState(s) { s.updated_at = new Date().toISOString(); const t = STATE + ".tmp"; writeFileSync(t, JSON.stringify(s, null, 2)); renameSync(t, STATE); }
function heartbeat(x) { try { writeFileSync(HEARTBEAT, JSON.stringify({ ts: new Date().toISOString(), pid: process.pid, ...x })); } catch {} }
function logDecision(kind, detail) {
  const line = "\n## " + new Date().toISOString() + " - " + kind + "\n" + detail + "\n";
  try { appendFileSync(DECISIONS, line); } catch {}
}

// ---- Policy: what is DESTRUCTIVE (deny + log, never auto) vs reversible (allow) ----
// Encodes STANDING_POLICY P1-P4 + Mooter hard invariants (classify.js FROZEN).
const DESTRUCTIVE_BASH = [
  /\bgit\s+push\b/, /\bgit\s+merge\b/, /\bgit\s+tag\b/, /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+push\b.*\b(main|origin\/main)\b/, /--force\b/, /\bgh\s+pr\s+merge\b/,
  /\brm\s+-rf?\b/, /\bnpm\s+publish\b/, /\bvercel\s+(deploy|--prod)\b/, /\bwrangler\s+(deploy|publish)\b/,
  /\bsupabase\b.*\b(deploy|db\s+push|migration\s+up)\b/, /\bdocker\s+push\b/,
];
const CLASSIFY_FROZEN = /classify\.js/; // never allow a write/edit that touches the frozen classifier

function bashIsDestructive(cmd = "") { return DESTRUCTIVE_BASH.some((re) => re.test(cmd)); }

// ---- The governor: pick AskUserQuestion answers by policy (tiny Haiku call, with fallback) ----
async function decideAnswers(input) {
  const policy = [readSafe(join(FLEET_DIR, "STANDING_POLICY.md")), readSafe(join(FLEET_DIR, "WORLD_CLASS_LOOP.md"))].join("\n\n");
  const questions = input.questions || [];
  // Deterministic fallback answer: prefer the option that is reversible / measure-first /
  // never unfreezes classify.js / never destructive. Default to first such option.
  const fallback = {};
  for (const q of questions) {
    const opts = q.options || [];
    const safe = opts.find((o) => {
      const t = ((o.label || "") + " " + (o.description || "")).toLowerCase();
      return !/unfreeze|descongel|force-push|delete|apagar|merge.*main|deploy|secret/.test(t);
    }) || opts[0] || { label: "" };
    fallback[q.question] = safe.label;
  }
  if (DRY_RUN) return fallback;
  // Governor: ask Haiku to choose strictly per policy. Returns {question: label}.
  try {
    const prompt =
      "És o GOVERNADOR (human-on-the-loop) do loop autónomo do Mooter. Escolhe a melhor opção para CADA pergunta, " +
      "ESTRITAMENTE pela política abaixo. Regras duras: NUNCA escolher descongelar classify.js; preferir reversível, " +
      "measure-first, honesto; evitar destrutivo (merge/push main, deploy, secrets, apagar). Responde APENAS JSON " +
      "{\"<texto da pergunta>\": \"<label escolhida>\"}.\n\n=== POLÍTICA ===\n" + policy +
      "\n\n=== PERGUNTAS (JSON) ===\n" + JSON.stringify(questions);
    let out = "";
    for await (const m of query({ prompt, options: { model: GOVERNOR_MODEL, allowedTools: [] } })) {
      if (m && typeof m.result === "string") out += m.result;
    }
    const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    // keep only known questions; fill gaps from fallback
    const answers = { ...fallback };
    for (const q of questions) if (j[q.question]) answers[q.question] = j[q.question];
    return answers;
  } catch (e) {
    log("governor failed, using deterministic fallback:", e && e.message);
    return fallback;
  }
}

// ---- canUseTool: the seamless gate. Answers questions, allows reversible, defers destructive ----
async function canUseTool(toolName, input, _ctx) {
  // 1) Clarifying questions -> answer in-process by policy. NO dialog ever.
  if (toolName === "AskUserQuestion") {
    const answers = await decideAnswers(input);
    logDecision("AUTO-ANSWER " + (input.questions || []).map((q) => q.header).join("/"),
      "Q->A: " + JSON.stringify(answers));
    return { behavior: "allow", updatedInput: { questions: input.questions, answers } };
  }
  // 2) Frozen invariant: never let anything write the classifier.
  const fp = (input && (input.file_path || input.path)) || "";
  if ((toolName === "Edit" || toolName === "Write") && CLASSIFY_FROZEN.test(fp)) {
    logDecision("BLOCKED classify.js write", "tool=" + toolName + " path=" + fp);
    return { behavior: "deny", message: "classify.js is FROZEN (CI sha-enforced). Do this additively in a new file instead." };
  }
  // 3) Destructive bash -> deny, log to DECISIONS (non-blocking), redirect to reversible work.
  if (toolName === "Bash" && bashIsDestructive(input && input.command)) {
    logDecision("DEFERRED destructive", "cmd: " + (input.command || "") + "\nRecomendação: revê e corre tu (irreversível).");
    return { behavior: "deny", message: "Destructive/irreversible action logged to DECISIONS.md for the human. Continue on reversible work; do NOT push/merge/deploy/delete here." };
  }
  // 4) Everything else (Read/Edit/Write/reversible Bash/etc) -> allow.
  return { behavior: "allow", updatedInput: input };
}

// ---- Stop hook: ping the bus the instant a turn ends (no polling lag) ----
async function onStop() { heartbeat({ event: "turn_stop", at: new Date().toISOString() }); return {}; }

const FOOTER = "\n\n--- LOOP PROTOCOL: faz o trabalho desta ronda e termina o turno. Mantém-te na branch isolada. " +
  "Termina com um bloco ```status``` (DID/TESTS/BLOCKERS/NEXT/DONE). As tuas perguntas e o irreversível são " +
  "tratados automaticamente pelo governador - não esperes por humanos. ---";

async function oneRound(s) {
  const inbox = readSafe(INBOX) || "(empty INBOX)";
  log("round " + s.round + ": running SDK generator (resume=" + (s.sessionId ? "yes" : "no") + ")");
  let finalText = "", sid = s.sessionId || null, ok = true;
  if (DRY_RUN) { finalText = "```status\nDID: dry-run\nTESTS: n/a\nBLOCKERS: none\nNEXT: continue\nDONE: no\n```"; }
  else {
    try {
      for await (const m of query({
        prompt: inbox + FOOTER,
        options: {
          model: GEN_MODEL,
          cwd: REPO,
          resume: s.sessionId || undefined,
          permissionMode: "acceptEdits",
          canUseTool,
          hooks: { Stop: [{ hooks: [onStop] }] },
        },
      })) {
        if (m && m.type === "system" && m.subtype === "init" && m.session_id) sid = m.session_id;
        if (m && m.type === "assistant" && m.message && m.message.content) {
          for (const c of m.message.content) if (c.type === "text") finalText += c.text;
        }
        if (m && typeof m.result === "string") finalText = m.result;
      }
    } catch (e) { ok = false; finalText = "SDK error: " + (e && e.message); log("round error:", e && e.message); }
  }
  writeFileSync(OUTBOX, finalText);
  writeFileSync(join(TRANSCRIPT, "round-" + s.round + "-outbox.md"), finalText);
  appendFileSync(P("ledger.jsonl"), JSON.stringify({ ts: new Date().toISOString(), round: s.round, ok, chars: finalText.length, engine: "sdk" }) + "\n");
  writeState({ ...s, status: "awaiting_eval", sessionId: sid, lastOk: ok });
  log("round " + s.round + ": done (ok=" + ok + ") -> awaiting_eval");
  return ok;
}

async function main() {
  mkdirSync(TRANSCRIPT, { recursive: true });
  log("sdk-runner up - repo=" + REPO + " gen=" + GEN_MODEL + " governor=" + GOVERNOR_MODEL + " dryRun=" + DRY_RUN);
  for (;;) {
    try {
      if (existsSync(STOP)) { log("STOP sentinel - exiting"); return; }
      const s = readState();
      heartbeat({ status: s.status, round: s.round, wave: s.wave });
      if (s.status === "done" || s.status === "stopped") { await sleep(POLL_MS); continue; }
      if (s.status !== "cc_running") { await sleep(POLL_MS); continue; }
      if ((s.round || 0) > (s.maxRounds || MAX_ROUNDS)) { writeState({ ...s, status: "stopped", reason: "maxRounds" }); continue; }
      await oneRound(s);
    } catch (e) {
      log("iteration error (continuing):", e && e.message);
      await sleep(POLL_MS);
    }
  }
}
main().catch((e) => { log("fatal (service restarts):", e); process.exit(1); });
