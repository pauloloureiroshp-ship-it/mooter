#!/usr/bin/env node
/**
 * local-loop-runner.mjs — Mooter Evolution Fleet · F0.5 · the $0 LOCAL loop.
 *
 * The local sibling of sdk-runner.mjs. Same governor, ZERO cloud: the brain is a
 * local Ollama model (qwen…), so a fleet loop costs $0 and never touches the
 * Claude limit. This is the "mão-de-obra $0" the whole fleet stands on
 * (docs/strategy/MOOTER_EVOLUTION_FLEET.md §3, F0.5).
 *
 * Shape: an agentic plan→act→observe→decide loop, 1 ACTION PER TURN.
 *   plan    — ask the local model for the next single action as JSON
 *   gate    — the governor: reversible → allow · irreversible → STOP for the human
 *   act     — execute exactly one allowed tool (or none, if gated)
 *   observe — feed the tool result back
 *   decide  — the model says done, or we hit maxTurns / timeout
 *
 * Every turn is written to the Ledger via appendEvent (kind:'turn'); a gated
 * irreversible action emits kind:'decision' and HALTS — the gate hook the spec
 * requires (§11 F0.5). Provenance (input/output hashes) is stamped MECHANICALLY
 * by the journal; the model never writes its own lineage.
 *
 * Honesty: if Ollama is down, the loop returns { ok:false, reason:'ollama-*' } —
 * it never fabricates a result. Nothing here can push/merge/deploy/delete or
 * write classify.js (the governor denies those, byte-for-byte with sdk-runner).
 *
 * Testable by construction: runLoop() takes its Ollama client, journal, shell and
 * clock as INJECTED deps, so the test suite drives the whole loop with mocks — no
 * live GPU, no live Ollama, no writes to the real Ledger. The CLI (main) wires the
 * real ones.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { createDispatchGate } from "../../packages/fleet-commander/src/stop-gate.mjs";

// ───────────────────────── Governor (based on sdk-runner.mjs, held STRICTER) ─────────────────────────
// The mechanical guardrail: main is read-only at the CREDENTIAL level. DESTRUCTIVE_BASH
// is the cloud runner's bank verbatim; bashIsDestructive + shellTouchesClassify then add
// local hardening on top — never laxer than the cloud runner, deliberately stricter.
export const DESTRUCTIVE_BASH = [
  /\bgit\s+push\b/, /\bgit\s+merge\b/, /\bgit\s+tag\b/, /\bgit\s+reset\s+--hard\b/,
  /--force\b/, /\bgh\s+pr\s+(merge|create)\b/, /\brm\s+-rf?\b/, /\bnpm\s+publish\b/,
  /\bvercel\s+(deploy|--prod)\b/, /\bwrangler\s+(deploy|publish)\b/,
  /\bsupabase\b.*\b(deploy|db\s+push|migration\s+up)\b/, /\bdocker\s+push\b/,
];
export const CLASSIFY_FROZEN = /classify\.js/;

export function bashIsDestructive(cmd = "") {
  const s = String(cmd);
  if (DESTRUCTIVE_BASH.some((re) => re.test(s))) return true;
  // Local hardening beyond the cloud bank — a $0 autonomous loop is held STRICTER:
  // deny ANY `rm` with an argument. A proposal-generating loop never needs to delete,
  // so this closes both the `rm -fr` flag-order gap AND bare `rm <file>` in one rule.
  return /\brm\s+\S/.test(s);
}

// classify.js is FROZEN. A loop may only READ it, and only via a SINGLE pure-read
// command. ANY compound command (chain / pipe / subshell / redirection) that mentions
// classify.js is denied outright — a genuine read never needs one, and inspecting only
// the first verb (anchored ^) let `cat classify.js && echo x > classify.js` slip past.
// So: deny-by-shape first, then require a lone read verb. This closes the interpreter-
// write vector (`python -c open(...,'w')`, `perl -i`, `awk`) AND compound bypasses.
const CLASSIFY_READ_OK = /^\s*(cat|grep|rg|egrep|less|more|head|tail|diff|wc|git|ls|stat|file|sha256sum|md5sum)\b/;
export function shellTouchesClassify(cmd = "") {
  const s = String(cmd);
  if (!CLASSIFY_FROZEN.test(s)) return false;             // doesn't mention classify.js
  if (/[;&|>]|\$\(|`|\bxargs\b/.test(s)) return true;     // any chain/redirect/subshell → deny
  return !CLASSIFY_READ_OK.test(s);                       // single command → must be a pure read
}

// The tools a local loop may ever call. Anything outside this list is denied — an
// allowlist, not a blocklist (SOTA 2026: bound the blast radius mechanically).
export const TOOL_ALLOWLIST = ["read_file", "run_shell", "note", "finish"];

/**
 * The gate. Returns { behavior:'allow' } for reversible work, or
 * { behavior:'deny', reason } for anything irreversible / off-allowlist.
 * A deny is NOT an error — it is the loop's cue to emit kind:decision and stop
 * for the human (the frontier/human decides the irreversible, never the moo).
 */
export function gateAction(action) {
  const tool = action && action.tool;
  if (!tool || !TOOL_ALLOWLIST.includes(tool)) {
    return { behavior: "deny", reason: `tool '${tool}' not in allowlist` };
  }
  const args = (action && action.args) || {};
  if (tool === "run_shell") {
    if (bashIsDestructive(args.command)) return { behavior: "deny", reason: "destructive/irreversible bash — deferred to the human gate" };
    if (shellTouchesClassify(args.command)) return { behavior: "deny", reason: "classify.js is FROZEN (sha-enforced) — a loop may only READ it, never write it" };
    return { behavior: "allow" };
  }
  // Write-intent tools (none in the F0.5 allowlist yet, but future-proof): a path
  // pointing at classify.js is frozen. read_file is a READ — harmless, allowed.
  if (tool !== "read_file") {
    const path = String(args.path || args.file_path || "");
    if (CLASSIFY_FROZEN.test(path)) return { behavior: "deny", reason: "classify.js is FROZEN (sha-enforced) — never written by a loop" };
  }
  return { behavior: "allow" };
}

// ───────────────────────── The local Ollama brain (proven /api/generate path) ─────────────────────────
const OLLAMA = process.env.OLLAMA_HOST?.replace(/\/$/, "") || "http://127.0.0.1:11434";
const MODEL_PREFS = ["qwen3", "qwen2.5-coder", "qwen2.5", "llama3", "gemma"];

// A fetch with a timeout whose timer is ALWAYS cleared — a bare
// AbortSignal.timeout() leaves a pending handle that makes process.exit() race
// libuv teardown (the UV_HANDLE_CLOSING assertion on Windows).
async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  // An EXTERNAL signal (the STOP watcher) must be able to kill a call already in
  // flight — that is the difference between a kill-switch and a polite request.
  const ext = opts && opts.signal;
  const onExt = () => ctrl.abort();
  if (ext) { if (ext.aborted) ctrl.abort(); else ext.addEventListener("abort", onExt, { once: true }); }
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(timer); if (ext) ext.removeEventListener("abort", onExt); }
}

async function listModels(base = OLLAMA) {
  try {
    const res = await fetchWithTimeout(`${base}/api/tags`, {}, 2500);
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.models) ? j.models.map((m) => m.name) : [];
  } catch { return []; }
}

export function pickModel(models) {
  if (!Array.isArray(models) || !models.length) return null;
  for (const p of MODEL_PREFS) {
    const hit = models.find((m) => m.toLowerCase().includes(p));
    if (hit) return hit;
  }
  return models[0];
}

/**
 * Real Ollama client. generate() returns { ok, text } or { ok:false, reason }.
 * think:false → thinking models answer directly. format:'json' → structured out.
 * Honest: any failure is a reason, never a fabricated answer.
 */
function realOllama(base = OLLAMA) {
  return {
    async generate({ model, prompt, options, signal }) {
      try {
        const res = await fetchWithTimeout(`${base}/api/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, prompt, stream: false, think: false, format: "json", options: { num_predict: 400, temperature: 0, ...options } }),
          signal,
        }, 120_000);
        if (!res.ok) return { ok: false, reason: `ollama-http-${res.status}` };
        const j = await res.json();
        return { ok: true, text: String(j.response || ""), promptTokens: j.prompt_eval_count ?? null, evalTokens: j.eval_count ?? null };
      } catch (e) {
        // An abort is not a failure of Ollama — it is us pulling the plug on purpose.
        if (signal && signal.aborted) return { ok: false, reason: "aborted-by-stop" };
        return { ok: false, reason: "ollama-unavailable" };
      }
    },
  };
}

// ───────────────────────── Default tools (reversible only) ─────────────────────────
export function defaultTools({ cwd, shell }) {
  const runShell = shell || ((cmd) => {
    const r = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", timeout: 60_000 });
    const out = ((r.stdout || "") + (r.stderr || "")).slice(-1500);
    return { code: r.status, out, missing: r.error?.code === "ENOENT" || r.status === 127 };
  });
  return {
    read_file: (args) => {
      try {
        const p = resolve(cwd || ".", String(args.path || ""));
        const text = readFileSync(p, "utf8").slice(0, Number(args.max || 2000));
        return { ok: true, observation: text };
      } catch (e) { return { ok: false, observation: `read error: ${e?.code || e?.message || "unknown"}` }; }
    },
    run_shell: (args) => {
      const r = runShell(String(args.command || ""));
      if (r.missing) return { ok: false, observation: "tool-unavailable" };
      return { ok: r.code === 0, observation: r.out || `(exit ${r.code})` };
    },
    note: (args, ctx) => { ctx.notes.push(String(args.text || "")); return { ok: true, observation: "noted" }; },
    // finish is handled by the loop directly; kept here for allowlist symmetry.
    finish: (args) => ({ ok: true, observation: String(args.summary || "") }),
  };
}

// ───────────────────────── The loop ─────────────────────────
const SYSTEM = [
  "You are a local $0 worker moo in the Mooter Evolution Fleet.",
  "Do the task using ONE action per turn. Reply with ONLY a JSON object:",
  '{"thought": string, "tool": "read_file"|"run_shell"|"note"|"finish", "args": object, "done": boolean}',
  "Tools: read_file{path}, run_shell{command}, note{text}, finish{summary}.",
  "You may NOT push/merge/deploy/delete or write classify.js — those are the human's, never yours.",
  "CONVERGE: the moment the History already contains the answer, you MUST call finish with a summary.",
  "Do NOT repeat an action already in History — if you just ran it, use its observation and move on (usually to finish).",
].join("\n");

function buildPrompt(task, history, notes) {
  const hist = history.map((h, i) =>
    `#${i + 1} ${h.action.tool}(${JSON.stringify(h.action.args || {})}) → ${String(h.observation).slice(0, 400)}`
  ).join("\n") || "(none yet)";
  const notesBlock = notes.length ? `\nNotes so far:\n- ${notes.join("\n- ")}` : "";
  const nudge = history.length
    ? `\n\nYou have already taken ${history.length} action(s). If the History above answers the TASK, reply with finish NOW.`
    : "";
  return `${SYSTEM}\n\nTASK:\n${task}\n\nHistory (past actions → observations):\n${hist}${notesBlock}${nudge}\n\nNext action (JSON only):`;
}

export function parseAction(text) {
  // format:'json' should give clean JSON, but be defensive: extract the first {...}.
  let raw = String(text || "").trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) raw = m[0];
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === "object") {
      return { thought: o.thought != null ? String(o.thought) : "", tool: o.tool != null ? String(o.tool) : "", args: o.args && typeof o.args === "object" ? o.args : {}, done: !!o.done };
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * Run one local loop to completion. All I/O is injected for testability.
 * @returns {ok, reason, result?, turns, events, receipt, pendingDecision?}
 *   reason ∈ done | halted | gated-irreversible | max-turns | timeout | ollama-unavailable | ollama-http-*
 *
 * `gate` (stop-gate.mjs) runs before EVERY turn, and it defaults to the REAL one:
 * an invariant you have to remember to switch on is not an invariant. Tests inject
 * an open gate to stay hermetic; production gets the kill-switch for free.
 */
export async function runLoop(opts) {
  const {
    task,
    sid,
    model = "qwen3:30b",
    maxTurns = 12,
    timeoutMs = 25 * 60 * 1000,
    cwd = process.cwd(),
    ollama = realOllama(),
    journal,                 // { appendEvent(ev) }
    tools = defaultTools({ cwd }),
    now = () => Date.now(),
    agent = "local-loop-runner",
    pilar = null,
    device = null,
    gate = createDispatchGate({ owner: { sessionId: sid, loopId: agent }, pilar, device }),
    watchIntervalMs = 250,   // how often the kill-switch is polled DURING a model call
  } = opts || {};

  const started = now();
  const history = [];
  const notes = [];
  const events = [];
  const emit = (ev) => { events.push(ev); try { journal && journal.appendEvent && journal.appendEvent({ sid, agent, model, ...ev }); } catch { /* best-effort */ } };
  // The per-job receipt travels with EVERY exit path — a job with no receipt is a
  // job that cannot be audited, which is the same as a job that did not happen.
  const fin = (o) => { try { return { ...o, receipt: gate && gate.receipt ? gate.receipt() : null }; } catch { return { ...o, receipt: null }; } };

  try {
  for (let turn = 1; turn <= maxTurns; turn++) {
    if (now() - started > timeoutMs) return fin({ ok: true, reason: "timeout", turns: history, events });

    // ── The pre-dispatch gate: STOP · VRAM · one-pilar-per-GPU ──────────────
    // Re-read every turn, never cached: the loop a kill-switch must stop is, by
    // definition, already running. A halt is an ordinary outcome (ok:true), not a
    // crash — the human pulled a lever that was built for them to pull.
    const pass = gate && typeof gate.check === "function" ? gate.check() : { allow: true };
    if (!pass.allow) {
      emit({ kind: "decision", gate: "halted", output: { halted_by: pass.gate, reason: pass.denyReason, answered_by: "pending-human" } });
      return fin({ ok: true, reason: "halted", haltedBy: pass.gate, haltReason: pass.denyReason, turns: history, events });
    }

    const prompt = buildPrompt(task, history, notes);

    // ── The in-flight watcher ───────────────────────────────────────────────
    // Gating only BETWEEN turns makes the human wait for whatever the model is
    // already chewing on. Measured (stop-drill, 2026-08-15): 232ms with qwen2.5:3b
    // but 6327ms with gpt-oss:20b — i.e. the 5s target was met only by the model
    // nobody runs a pilar on. So we poll the kill-switch DURING the call and abort
    // it. `peek()` is side-effect-free, which is why it can run every 250ms.
    const abort = new AbortController();
    let abortedBy = null;
    const watcher = gate && typeof gate.peek === "function" && watchIntervalMs > 0
      ? setInterval(() => {
          try {
            const s = gate.peek();
            if (s && s.stopped) { abortedBy = s.reason; abort.abort(); }
          } catch { /* a watcher that throws must never take the loop down */ }
        }, watchIntervalMs)
      : null;
    if (watcher && typeof watcher.unref === "function") watcher.unref();

    let resp;
    try { resp = await ollama.generate({ model, prompt, signal: abort.signal }); }
    finally { if (watcher) clearInterval(watcher); }

    if (abortedBy) {
      emit({ kind: "decision", gate: "halted", output: { halted_by: "stop-in-flight", reason: abortedBy, answered_by: "pending-human" } });
      return fin({ ok: true, reason: "halted", haltedBy: "stop-in-flight", haltReason: abortedBy, turns: history, events });
    }
    if (!resp || !resp.ok) return fin({ ok: false, reason: resp?.reason || "ollama-unavailable", turns: history, events });

    const action = parseAction(resp.text);
    if (!action || !action.tool) {
      // Not a fatal error — record and let the model correct itself next turn.
      history.push({ action: { tool: "(invalid)", args: {} }, observation: "invalid JSON — reply with a single JSON action object" });
      continue;
    }

    // The moo's plan for this turn IS the Ledger event (kind:'turn'). Provenance
    // hashed mechanically by the journal over input/output.
    emit({ kind: "turn", input: { task, turn }, output: action });

    if (action.tool === "finish" || action.done) {
      const summary = (action.args && action.args.summary) != null ? String(action.args.summary) : "";
      emit({ kind: "outcome", output: { summary, turns: history.length }, gate: "reversible" });
      return fin({ ok: true, reason: "done", result: summary, turns: history, events });
    }

    // Gate BEFORE acting. Irreversible/off-allowlist → emit kind:decision, HALT.
    // NOTE: named `actionGate`, not `gate` — `gate` is the injected pre-dispatch gate
    // above, and shadowing it here would put it in the temporal dead zone for the
    // whole turn (a ReferenceError on the very first check).
    const actionGate = gateAction(action);
    if (actionGate.behavior === "deny") {
      emit({ kind: "decision", gate: "irreversible", output: { action, reason: actionGate.reason, answered_by: "pending-human" } });
      return fin({ ok: true, reason: "gated-irreversible", pendingDecision: { action, reason: actionGate.reason }, turns: history, events });
    }

    // Act: exactly one allowed tool.
    const tool = tools[action.tool];
    let observation;
    if (!tool) observation = `unknown tool '${action.tool}'`;
    else {
      try { const r = await tool(action.args || {}, { cwd, notes }); observation = r && r.observation != null ? r.observation : String(r); }
      catch (e) { observation = `tool error: ${e?.message || e}`; }
    }
    history.push({ action, observation });
  }

  return fin({ ok: true, reason: "max-turns", turns: history, events });
  } finally {
    // The GPU lease is released on EVERY exit — done, halted, gated, crashed. A loop
    // that dies holding the card turns into the orphan lease the next pilar reports.
    try { gate && gate.release && gate.release(); } catch { /* best-effort */ }
  }
}

// ───────────────────────── CLI (real wiring) ─────────────────────────
function realJournal() {
  try {
    const require = createRequire(import.meta.url);
    const here = resolve(fileURLToPath(import.meta.url), "..");
    // Prefer the runtime copy; fall back to the repo copy.
    for (const p of [join(homedir(), ".claude", "tools", "router", "handoff-journal.js"), resolve(here, "..", "..", "tools", "router", "handoff-journal.js")]) {
      try { return require(p); } catch { /* try next */ }
    }
  } catch { /* degrade */ }
  return { appendEvent() { return { ok: false }; } };
}

async function main() {
  const args = process.argv.slice(2);
  const taskIdx = args.indexOf("--task");
  const task = taskIdx >= 0 ? args[taskIdx + 1] : "List the files in the current directory with run_shell, then finish with a one-line summary.";
  const sid = (args[args.indexOf("--sid") + 1]) || `local-loop-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const models = await listModels();
  const model = pickModel(models);
  if (!model) {
    console.error("⚠ Ollama sem modelos (ou desligado). O runner local é $0 mas precisa de Ollama a correr. Honesto: não corro no ar.");
    // exitCode (not process.exit) → let libuv drain the fetch pool cleanly (avoids
    // the UV_HANDLE_CLOSING teardown race on Windows).
    process.exitCode = 2;
    return;
  }
  console.log(`🐮 local-loop-runner ($0) · model=${model} · sid=${sid}`);
  const res = await runLoop({ task, sid, model, cwd: process.cwd(), journal: realJournal() });
  console.log(`→ ${res.reason} (${res.turns.length} turns, ${res.events.length} ledger events)`);
  if (res.reason === "gated-irreversible") console.log(`   ⛔ parou no gate: ${res.pendingDecision.reason} — o humano decide.`);
  if (res.result) console.log(`   ${res.result}`);
  process.exitCode = res.ok ? 0 : 1;
}

// Run as CLI only when invoked directly (not when imported by the test).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { console.error("local-loop-runner error:", e?.message || e); process.exitCode = 1; });
}
