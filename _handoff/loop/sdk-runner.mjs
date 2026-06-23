#!/usr/bin/env node
/**
 * Mooter - Cowork/CC Loop Runner (SDK side / "generator") - SEAMLESS.
 *
 * Uses the Claude Agent SDK so canUseTool answers AskUserQuestion + permissions in-process
 * (no dialogs). resume = context continuity. Stop hook = instant bus ping. acceptEdits.
 * Docs: https://code.claude.com/docs/en/agent-sdk/user-input
 * Auth: from 2026-06-15 runs on your Claude plan credit (Max), NO API key.
 *
 * Install once:  npm i @anthropic-ai/claude-agent-sdk
 * Bus (_handoff/loop/): STATE.json, INBOX.md, OUTBOX.md, DECISIONS.md, ledger.jsonl,
 *   heartbeat.json, transcript/, STOP (kill switch).
 * Env: LOOP_DIR, REPO, GEN_MODEL(sonnet), MAX_ROUNDS(12), POLL_MS(5000),
 *      ROUND_TIMEOUT_MS(1500000), DRY_RUN(0).
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const LOOP_DIR = process.env.LOOP_DIR ? resolve(process.env.LOOP_DIR) : HERE;
const REPO = process.env.REPO ? resolve(process.env.REPO) : resolve(LOOP_DIR, "..", "..");
const FLEET_DIR = resolve(LOOP_DIR, "..", "fleet");
const GEN_MODEL = process.env.GEN_MODEL || "claude-sonnet-4-6";
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS || 12);
const POLL_MS = Number(process.env.POLL_MS || 5000);
const ROUND_TIMEOUT_MS = Number(process.env.ROUND_TIMEOUT_MS || 25 * 60 * 1000);
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

// ---- Policy: DESTRUCTIVE (deny + log) vs reversible (allow). P1-P4 + classify.js FROZEN. ----
const DESTRUCTIVE_BASH = [
  /\bgit\s+push\b/, /\bgit\s+merge\b/, /\bgit\s+tag\b/, /\bgit\s+reset\s+--hard\b/,
  /--force\b/, /\bgh\s+pr\s+(merge|create)\b/, /\brm\s+-rf?\b/, /\bnpm\s+publish\b/,
  /\bvercel\s+(deploy|--prod)\b/, /\bwrangler\s+(deploy|publish)\b/,
  /\bsupabase\b.*\b(deploy|db\s+push|migration\s+up)\b/, /\bdocker\s+push\b/,
];
const CLASSIFY_FROZEN = /classify\.js/;
function bashIsDestructive(cmd = "") { return DESTRUCTIVE_BASH.some((re) => re.test(cmd)); }

// ---- The governor: pick AskUserQuestion answers by policy (DETERMINISTIC, no nested query) ----
// MUST NOT call query() here: a nested SDK query inside canUseTool deadlocks the outer turn.
// Pure synchronous keyword heuristic; every choice logged to DECISIONS for transparency.
function decideAnswers(input) {
  const questions = input.questions || [];
  const answers = {};
  for (const q of questions) {
    const opts = q.options || [];
    const prefer = opts.find((o) => {
      const t = ((o.label || "") + " " + (o.description || "")).toLowerCase();
      return /measure|data|dados|eval|honest|revert|revers|local-first|curar|aditiv/.test(t)
        && !/unfreeze|descongel|force-push|deploy|secret|merge.*main/.test(t);
    });
    const safe = prefer || opts.find((o) => {
      const t = ((o.label || "") + " " + (o.description || "")).toLowerCase();
      return !/unfreeze|descongel|force-push|delete|apagar|merge.*main|deploy|secret|pivot/.test(t);
    }) || opts[0] || { label: "" };
    answers[q.question] = safe.label;
  }
  return answers;
}

// ---- canUseTool: the seamless gate. Answers questions, allows reversible, defers destructive ----
async function canUseTool(toolName, input, _ctx) {
  if (toolName === "AskUserQuestion") {
    const answers = decideAnswers(input);
    logDecision("AUTO-ANSWER " + (input.questions || []).map((q) => q.header).join("/"),
      "Q->A: " + JSON.stringify(answers));
    return { behavior: "allow", updatedInput: { questions: input.questions, answers } };
  }
  const fp = (input && (input.file_path || input.path)) || "";
  if ((toolName === "Edit" || toolName === "Write") && CLASSIFY_FROZEN.test(fp)) {
    logDecision("BLOCKED classify.js write", "tool=" + toolName + " path=" + fp);
    return { behavior: "deny", message: "classify.js is FROZEN (CI sha-enforced). Do this additively in a new file instead." };
  }
  if (toolName === "Bash" && bashIsDestructive(input && input.command)) {
    logDecision("DEFERRED destructive", "cmd: " + (input.command || "") + "\nRecomendacao: reve e corre tu (irreversivel).");
    return { behavior: "deny", message: "Destructive/irreversible action logged to DECISIONS.md for the human. Continue on reversible work; do NOT push/merge/deploy/delete here." };
  }
  return { behavior: "allow", updatedInput: input };
}

// ---- Stop hook: ping the bus the instant a turn ends ----
async function onStop() { heartbeat({ event: "turn_stop", at: new Date().toISOString() }); return {}; }

const FOOTER = "\n\n--- LOOP PROTOCOL: faz o trabalho desta ronda e termina o turno. Mantem-te na branch isolada. " +
  "Termina com um bloco ```status``` (DID/TESTS/BLOCKERS/NEXT/DONE). As tuas perguntas e o irreversivel sao " +
  "tratados automaticamente pelo governador - nao esperes por humanos. ---";

// WCOCKPIT: mapa modo → modelo (lazy=haiku/barato, moo=GEN_MODEL, crazy=opus)
const MODE_MODEL_MAP = { lazy: "claude-haiku-4-5", moo: null, crazy: "claude-opus-4-6" };
const _modeRegPath = join(HERE, "mode-registry.js");
function resolveModel(sessionId) {
  try {
    if (!existsSync(_modeRegPath)) return GEN_MODEL;
    const mr = _require(_modeRegPath);
    const entry = mr.get(sessionId);
    if (!entry) return GEN_MODEL;
    if (entry.model) return entry.model; // modelo explícito por sessão vence
    return MODE_MODEL_MAP[entry.mode] || GEN_MODEL;
  } catch { return GEN_MODEL; }
}

async function oneRound(s) {
  const inbox = readSafe(INBOX) || "(empty INBOX)";
  log("round " + s.round + ": running SDK generator (resume=" + (s.sessionId ? "yes" : "no") + ")");
  let finalText = "", sid = s.sessionId || null, ok = true;
  // WCOCKPIT: lê o modo por sessão e escolhe o modelo (lazy→haiku, moo→GEN_MODEL, crazy→opus)
  const roundModel = s.sessionId ? resolveModel(s.sessionId) : GEN_MODEL;
  if (roundModel !== GEN_MODEL) log("round " + s.round + ": session mode → model=" + roundModel);
  if (DRY_RUN) { finalText = "```status\nDID: dry-run\nTESTS: n/a\nBLOCKERS: none\nNEXT: continue\nDONE: no\n```"; }
  else {
    const ac = new AbortController();
    const killTimer = setTimeout(() => { log("round timeout -> aborting query"); try { ac.abort(); } catch (e) {} }, ROUND_TIMEOUT_MS);
    try {
      for await (const m of query({
        prompt: inbox + FOOTER,
        options: {
          model: roundModel,
          cwd: REPO,
          resume: s.sessionId || undefined,
          permissionMode: "acceptEdits",
          canUseTool,
          abortController: ac,
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
    finally { clearTimeout(killTimer); }
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
  log("sdk-runner up - repo=" + REPO + " gen=" + GEN_MODEL + " dryRun=" + DRY_RUN);
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
