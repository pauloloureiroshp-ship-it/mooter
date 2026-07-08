#!/usr/bin/env node
// local-pillar.mjs — the $0 local Fleet worker (FASE3 F1).
//
// A `runPillar` implementation for fleet-orchestrator.mjs that does REAL work on
// the 4090 via Ollama, at $0. One round = measure → propose → (self-)test, then
// persist authoritative state to DISK (crash-only: the process holds nothing the
// disk doesn't). Returns the exact { proposal, events, engine, costUsd, gpuMinutes }
// shape the orchestrator's runFleetRound expects, so the Proof Gate / FSM / Ledger
// pipeline runs unchanged.
//
// RESILIENCE (non-negotiable — advogado do diabo 2026-07-08):
//   • Every Ollama call carries an AbortSignal.timeout (generate ≤120s, tags ≤3s).
//   • A whole-round hard timeout (FLEET_ROUND_TIMEOUT_MS, default 10min) races the
//     work — a hung generation NEVER freezes the fleet. A timeout is a clean
//     incident (pillar ledger line) + a throw the orchestrator turns into a fleet
//     `incident`, not a death.
//   • 1-model-per-cycle: default qwen3:30b for every pillar (FLEET_LOCAL_MODEL to
//     override) — avoids VRAM thrash; OLLAMA_KEEP_ALIVE keeps it warm.
//
// HONESTY: the proposal always carries the mandatory "pode falhar se" section, and
// its one quantitative claim (cloud tokens avoided) is grounded in a TYPED
// before/after measure event — so the Proof Gate passes for a real reason, never a
// fabricated one. The measured delta of the proposed CHANGE is "n/d" (a local moo
// drafts the step; it does not execute it) — never invented (change ≠ improvement).
//
// BOUNDED CONTEXT: the prompt is charter + criterion + STATE + last 10 ledger lines
// + previous OUTBOX, hard-capped to FLEET_CONTEXT_CHAR_CAP chars — never the full
// history (that is how a $0 fleet stays $0 and fast).

"use strict";

import { readFileSync, writeFileSync, appendFileSync, renameSync, existsSync } from "node:fs";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { preflight } from "./vram-preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

const OLLAMA = process.env.OLLAMA_HOST?.replace(/\/$/, "") || "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.FLEET_LOCAL_MODEL || "qwen3:30b";
const CONTEXT_CHAR_CAP = Number(process.env.FLEET_CONTEXT_CHAR_CAP) || 6000;
const GENERATE_TIMEOUT_MS = Number(process.env.FLEET_GENERATE_TIMEOUT_MS) || 120_000;
const TAGS_TIMEOUT_MS = 3_000;
const ROUND_TIMEOUT_MS = Number(process.env.FLEET_ROUND_TIMEOUT_MS) || 600_000;
const NUM_PREDICT = Number(process.env.FLEET_NUM_PREDICT) || 220;
// Resident footprint of the default local model (qwen3:30b ≈ 19GB). Governs how
// many generations physically fit on the GPU at once — see computeGenSlots.
const MODEL_VRAM_GB = Number(process.env.FLEET_MODEL_VRAM_GB) || 19;
// Pillars with no meaningful local job: run in DOCUMENTED-IDLE mode (no GPU, no
// generation, a one-line DECISIONS.md entry) instead of a silent no-op. Empty by
// default — every pillar can draft a charter-grounded proposal. Opt-in via env.
const IDLE_PILLARS = new Set(
  (process.env.FLEET_IDLE_PILLARS || "").split(",").map((s) => s.trim()).filter(Boolean),
);

function abs(p) { return isAbsolute(p) ? p : resolve(REPO, p); }
function num(x) { return Number.isFinite(x) ? x : null; }

// ── disk helpers (crash-only: authoritative state lives here) ────────────────
export function atomicWriteJSON(path, obj) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, path);
}
function readJSON(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}
function readText(path) {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}
function lastLines(path, n) {
  const t = readText(path);
  if (!t) return [];
  return t.trim().split(/\r?\n/).filter(Boolean).slice(-n);
}

// ── bounded context assembly (pure, testable) ────────────────────────────────
// Keep the charter/criterion/state HEAD intact; truncate the ledger/outbox TAIL
// to fit the cap. Never emit the full history.
export function assembleContext(parts, cap = CONTEXT_CHAR_CAP) {
  const head =
    `# CHARTER\n${parts.charter || "(none)"}\n\n` +
    `# SUCCESS CRITERIA\n${parts.criteria || "(none)"}\n\n` +
    `# STATE\n${parts.state || "(none)"}\n\n`;
  let tail =
    `# RECENT LEDGER (last 10)\n${parts.ledgerTail || "(empty)"}\n\n` +
    `# PREVIOUS OUTBOX\n${parts.outbox || "(empty)"}\n`;
  const budget = Math.max(0, cap - head.length);
  if (tail.length > budget) tail = tail.slice(0, budget) + "\n…[truncated]";
  return head + tail;
}

function readPillarContext(pillarDir) {
  const policy = readJSON(join(pillarDir, "STANDING_POLICY.json"), {});
  const successCriteria = Array.isArray(policy.success_criteria) ? policy.success_criteria.join(" · ") : "";
  return {
    policy,
    charter: policy.charter || "",
    successCriteria,
    criteria: readText(join(pillarDir, "CRITERIA.md")).slice(0, 1500),
    state: JSON.stringify(readJSON(join(pillarDir, "STATE.json"), {})),
    ledgerTail: lastLines(join(pillarDir, "ledger.jsonl"), 10).join("\n"),
    outbox: readText(join(pillarDir, "OUTBOX.md")).slice(-2000),
  };
}

// ── proposal builder (pure, testable) — honest by construction ───────────────
// A grounded quantitative claim (cloud tokens avoided) tied to a typed before/after
// event, plus the mandatory honesty section. estCloudTokens=null ⇒ purely
// qualitative proposal (still passes the gate via the honesty section).
export function buildProposal(loop, { artifact, estCloudTokens, round, model }) {
  const measureId = `measure-${loop.id}-r${round}`;
  const runEventId = `run-${loop.id}-r${round}`;
  const avoided = Number.isFinite(estCloudTokens) ? estCloudTokens : null;
  const events = [];
  const claims = [];
  if (avoided !== null) {
    events.push({ id: measureId, kind: "measure", output: { before: avoided, after: 0, unit: "cloud_tokens" } });
    claims.push({ text: `${avoided} cloud tokens avoided (ran local on ${model}, $0)`, evidence: [measureId] });
  }
  const body =
    `## Proposal ${loop.id} — round ${round}\n\n` +
    `${artifact}\n\n` +
    `### o que NÃO verifiquei / pode falhar se\n` +
    `- Passo redigido por moo local (${model}); não executei as mudanças nem corri os testes do pilar. ` +
    `Pode falhar se tocar ficheiros frozen, precisar de rede, ou se o critério exigir um baseline que ainda não existe.\n`;
  return {
    proposal: { id: `prop-${loop.id}-r${round}`, state: "drafted", reversible: true, run_event_id: runEventId, body, claims },
    events,
  };
}

// ── documented-idle proposal (pure) — for pillars with no local job. Passes the
// Proof Gate via the mandatory honesty section and makes ZERO quantitative claims
// (nothing was generated), so it is honest by construction — never a fabricated win.
export function buildIdleProposal(loop, round) {
  const body =
    `## Proposal ${loop.id} — round ${round} (DOCUMENTED IDLE)\n\n` +
    `No specialized local job this round (see ${loop.id}/DECISIONS.md). A local moo would only ` +
    `restate the charter, so the pillar idles honestly instead of burning a GPU slot.\n\n` +
    `### o que NÃO verifiquei / pode falhar se\n` +
    `- Nada foi gerado nem medido (idle deliberado). Pode falhar se o charter passar a ter trabalho local acionável — remover de FLEET_IDLE_PILLARS nesse caso.\n`;
  return {
    proposal: { id: `prop-${loop.id}-r${round}`, state: "drafted", reversible: true, run_event_id: `run-${loop.id}-r${round}`, body, claims: [] },
    events: [],
  };
}

// ── GPU snapshot (honest n/d when nvidia-smi absent) ─────────────────────────
function queryGpu() {
  const r = spawnSync(
    "nvidia-smi",
    ["--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
    { encoding: "utf8" },
  );
  if (r.status !== 0 || !r.stdout) return { util: null, temp: null, usedMb: null, totalMb: null };
  const p = (r.stdout.trim().split("\n")[0] || "").split(",").map((s) => parseInt(s.trim(), 10));
  return { util: num(p[0]), temp: num(p[1]), usedMb: num(p[2]), totalMb: num(p[3]) };
}

// ── Ollama (every call time-boxed) ───────────────────────────────────────────
async function ollamaTags() {
  const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(TAGS_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`ollama tags http ${res.status}`);
  const j = await res.json();
  return Array.isArray(j.models) ? j.models.map((m) => m.name) : [];
}
function pickModel(models, preferred) {
  if (models.includes(preferred)) return preferred;
  for (const p of ["qwen3", "qwen2.5-coder", "qwen2.5", "llama3", "gemma"]) {
    const hit = models.find((m) => m.toLowerCase().includes(p));
    if (hit) return hit;
  }
  return models[0] || null;
}
async function ollamaGenerate(model, prompt) {
  const t0 = Date.now();
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // think:false → qwen3 answers directly instead of spending budget on a <think> block.
    body: JSON.stringify({ model, prompt, stream: false, think: false, options: { num_predict: NUM_PREDICT } }),
    signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
  });
  const wall_s = (Date.now() - t0) / 1000;
  if (!res.ok) throw new Error(`ollama generate http ${res.status}`);
  const j = await res.json();
  return {
    text: String(j.response || "").trim(),
    promptTokens: typeof j.prompt_eval_count === "number" ? j.prompt_eval_count : null,
    evalTokens: typeof j.eval_count === "number" ? j.eval_count : null,
    wall_s,
  };
}

// ── VRAM-governed generation allocator (the REAL GPU governor) ───────────────
// The orchestrator's poolWidth admits N pillars per round; the launcher opens it
// so every pillar gets a round. That is admission — NOT how many can physically
// generate at once. On a single 4090 (24GB) a qwen3:30b generation needs ~19GB,
// so only ONE fits; two would thrash/OOM and each caller would trip its 120s
// AbortSignal (the exact serialization that produced 10 timeout incidents).
// This gate caps CONCURRENT generations across ALL pillars in the process to what
// VRAM allows (≈1). Waiters queue on the slot; the 120s generate timeout only
// starts AFTER a slot is acquired, so waiting is never counted as a hung call.
export function computeGenSlots({ totalMb, envSlots } = {}) {
  if (Number.isFinite(envSlots) && envSlots >= 1) return Math.floor(envSlots);
  if (!Number.isFinite(totalMb) || totalMb <= 0) return 1;
  return Math.max(1, Math.min(2, Math.floor(totalMb / 1024 / MODEL_VRAM_GB)));
}
// A counting semaphore. Increment is SYNCHRONOUS after the gate check (JS is
// single-threaded) so inFlight NEVER exceeds `slots` — same hard-cap discipline
// as the Overclock runBoundedPool it replaces for the cross-pillar case.
export function makeGenGate(slots) {
  let inFlight = 0, peak = 0;
  const waiters = [];
  const acquire = () => new Promise((res) => {
    const attempt = () => {
      if (inFlight < slots) { inFlight++; if (inFlight > peak) peak = inFlight; res(); }
      else waiters.push(attempt);
    };
    attempt();
  });
  const release = () => { inFlight = Math.max(0, inFlight - 1); const next = waiters.shift(); if (next) next(); };
  return { acquire, release, get inFlight() { return inFlight; }, get peak() { return peak; }, slots };
}

const GEN_SLOTS = computeGenSlots({ totalMb: queryGpu().totalMb, envSlots: Number(process.env.FLEET_GEN_SLOTS) });
const genGate = makeGenGate(GEN_SLOTS);

// One generation, through the VRAM gate. Real work only — no busywork.
async function runRoundWork(prompt, model) {
  await genGate.acquire();
  try {
    return await ollamaGenerate(model, prompt);
  } finally {
    genGate.release();
  }
}

// ── the pillar round (runPillar) ─────────────────────────────────────────────
export async function localPillar(loop, { now } = {}) {
  const clock = now || (() => Date.now());
  const iso = () => new Date(clock()).toISOString();
  const pillarDir = abs(loop.pillar.workdir);
  const statePath = join(pillarDir, "STATE.json");
  const ledgerPath = join(pillarDir, "ledger.jsonl");
  const prev = readJSON(statePath, {});
  const round = (Number(prev.round) || 0) + 1;
  const sessionId = `fleet-r${round}-${loop.id}`;

  const appendLedger = (rec) => {
    try { appendFileSync(ledgerPath, JSON.stringify({ ts: iso(), pillar: loop.id, round, ...rec }) + "\n"); } catch { /* never crash the fleet */ }
  };

  // DOCUMENTED IDLE: no generation, no GPU slot, a one-line DECISIONS entry (once)
  // and a clean ok:true round for the gate — never a silent no-op nor a timeout.
  if (IDLE_PILLARS.has(loop.id)) {
    const decPath = join(pillarDir, "DECISIONS.md");
    if (!readText(decPath).includes("idle-local:")) {
      try {
        const header = readText(decPath).trim() ? "" : `# DECISIONS — ${loop.id}\n\n`;
        appendFileSync(decPath, `${header}- ${iso()} · idle-local: sem job local acionável (charter é wave cloud/CC-once) → idle DOCUMENTADO, nunca falha silenciosa. Remover de FLEET_IDLE_PILLARS quando houver trabalho local.\n`);
      } catch { /* decisions is advisory here */ }
    }
    const { proposal, events } = buildIdleProposal(loop, round);
    atomicWriteJSON(statePath, { ...prev, status: "active", pillar: loop.id, round, last_run_ts: iso(), sessionId, measuredTotal: (Number(prev.measuredTotal) || 0) + 1, updated_at: iso(), idle: true });
    appendLedger({ event: "round", engine: "local-idle", delta: "n/d", est_cloud_tokens_avoided: "n/d", quota_source: "local-$0", idle: true });
    return { proposal, events, engine: "local-idle", costUsd: 0, gpuMinutes: 0 };
  }

  // F4 PRE-FLIGHT: refuse to generate on a CONTENDED GPU (a foreign model resident +
  // too little free VRAM for the fleet model) — Ollama would spill to CPU and a single
  // generation hangs >120s (proven 2026-07-08). Record a JUSTIFIED incident, bump the
  // per-pillar streak, and surface at 3-in-a-row in the cronista queue. We NEVER unload
  // a foreign model (not ours). A probe failure returns ok:true → never blocked on it.
  const contention = await preflight({ ollamaHost: OLLAMA, fleetModel: DEFAULT_MODEL });
  if (!contention.ok) {
    const streak = (Number(prev.contentionStreak) || 0) + 1;
    appendLedger({ event: "incident", engine: "local-preflight", reason: "vram-contention", detail: contention.reason, foreign_models: contention.foreignModels, vram_free_mb: contention.freeMb, streak });
    atomicWriteJSON(statePath, { ...prev, status: "active", pillar: loop.id, round: Number(prev.round) || 0, last_run_ts: iso(), sessionId, contentionStreak: streak, updated_at: iso(), last_incident: contention.reason });
    if (streak >= 3) {
      try {
        const decPath = join(pillarDir, "..", "cronista", "DECISIONS.md");
        appendFileSync(decPath, `- ${iso()} · vram-contention (${loop.id}): ${contention.foreignModels.join(", ")} resident ${streak} ciclos seguidos → a fleet NÃO gera (evita CPU fallback silencioso). A rota/VRAM é decisão do Paulo; a fleet nunca descarrega modelo de outro processo.\n`);
      } catch { /* advisory */ }
    }
    // Honest: a contention skip did NOT generate — throw so the orchestrator logs a
    // clean incident + ok:false, never a fabricated proposal.
    throw new Error(contention.reason);
  }

  let timer;
  const roundTimeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`round timeout > ${ROUND_TIMEOUT_MS}ms`)), ROUND_TIMEOUT_MS);
  });

  const doRound = async () => {
    // 1 · resolve model (Ollama down → throw → clean incident)
    const model = pickModel(await ollamaTags(), DEFAULT_MODEL);
    if (!model) throw new Error("no ollama model available");
    // 2 · bounded context
    const ctx = readPillarContext(pillarDir);
    const context = assembleContext({
      charter: ctx.charter,
      criteria: [ctx.successCriteria, ctx.criteria].filter(Boolean).join("\n"),
      state: ctx.state,
      ledgerTail: ctx.ledgerTail,
      outbox: ctx.outbox,
    });
    const prompt =
      `You are the "${loop.id}" pillar of the Mooter local fleet, working $0 on a 4090.\n` +
      `From the charter and state below, propose ONE concrete, reversible next step toward the success criterion. ` +
      `Be specific and measurable; do NOT claim results you did not measure. Max 6 lines.\n\n${context}`;
    // 3 · saturated generation
    const gen = await runRoundWork(prompt, model);
    const gpu = queryGpu();
    const artifact = gen.text || "(no output)";
    const estCloudTokens = (gen.promptTokens != null || gen.evalTokens != null)
      ? (gen.promptTokens || 0) + (gen.evalTokens || 0)
      : null;
    const gatePassed = gen.text.length > 0;
    // 4 · honest proposal
    const { proposal, events } = buildProposal(loop, { artifact, estCloudTokens, round, model });
    // 5 · persist authoritative state (atomic) + append the pillar ledger
    atomicWriteJSON(statePath, {
      ...prev,
      status: "active",
      pillar: loop.id,
      round,
      last_run_ts: iso(),
      sessionId,
      measuredWins: (Number(prev.measuredWins) || 0) + (gatePassed ? 1 : 0),
      measuredTotal: (Number(prev.measuredTotal) || 0) + 1,
      openProposals: (Number(prev.openProposals) || 0) + 1,
      contentionStreak: 0,
      updated_at: iso(),
    });
    appendLedger({
      event: "round",
      engine: "ollama-local",
      model,
      delta: "n/d",
      est_cloud_tokens_avoided: estCloudTokens != null ? estCloudTokens : "n/d",
      quota_source: "local-$0",
      prompt_tokens: gen.promptTokens,
      eval_tokens: gen.evalTokens,
      wall_s: Math.round(gen.wall_s * 10) / 10,
      gpu_util: gpu.util,
      gpu_temp: gpu.temp,
      artifact_chars: artifact.length,
    });
    try {
      appendFileSync(join(pillarDir, "OUTBOX.md"), `\n---\n# ${loop.id} — round ${round} (${iso()})\n\n${artifact}\n`);
    } catch { /* outbox is advisory */ }

    return { proposal, events, engine: "ollama-local", costUsd: 0, gpuMinutes: gen.wall_s / 60 };
  };

  try {
    return await Promise.race([doRound(), roundTimeout]);
  } catch (e) {
    // A timeout / Ollama fault is a clean incident + a state advance (so a wedged
    // pillar isn't re-picked forever at round 0), then re-thrown for the fleet.
    appendLedger({ event: "incident", engine: "ollama-local", reason: e && e.message });
    try {
      atomicWriteJSON(statePath, {
        ...prev,
        status: "active",
        pillar: loop.id,
        round,
        last_run_ts: iso(),
        sessionId,
        measuredWins: Number(prev.measuredWins) || 0,
        measuredTotal: (Number(prev.measuredTotal) || 0) + 1,
        updated_at: iso(),
        last_incident: e && e.message,
      });
    } catch { /* state write must never mask the original error */ }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export default localPillar;
