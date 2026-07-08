#!/usr/bin/env node
// fleet-orchestrator.mjs — the Fleet maestro (F2).
//
// docs/strategy/MOOTER_EVOLUTION_FLEET.md §4 ①-⑤. Wires the four hardened
// Fleet Commander primitives to the Phase-1 $0 concurrent executor:
//
//   ① Scheduler  packages/fleet-commander/src/scheduler.mjs   pickNext (attention quota)
//   ② Lease      packages/fleet-commander/src/lease.mjs       orphan REPORTED, never STOLEN
//   ③ Proof Gate packages/fleet-commander/src/proof-gate.mjs  "pode falhar se" + typed groundedness
//   ④ FSM        packages/fleet-commander/src/fsm.mjs         drafted→proven→gated (+ transition-guard)
//   ⑤ Ledger     _handoff/fleet/fleet-ledger.jsonl            append-only {ts,event,pillar,...}
//   workforce    packages/overclock-moo/src/pool.mjs          runBoundedPool — HARD concurrency cap ($0 local)
//
// HARD CAPS (never bent, proven live by peak counters, not just by admission):
//   • ≤1 gpu_heavy pillar on the 4090 at a time (the GPU is one resource);
//   • ≤N cloud_heavy pillars consuming the Opus frontier budget (H4);
//   • ≤poolWidth total in-flight;
//   • ≤budgetUsdPerDay of frontier spend/day — exceeded → cloud admission denied (frota pausa, H4);
//   • ≤daysQuota runs/day per pillar; ≤perLoopOpen open proposals; global human-queue cap.
//
// RESILIENCE: every round is try/caught — a throwing pillar becomes an `incident`
// event and the fleet keeps going; it never dies mid-round.
//
// $0 BY DEFAULT: the real workforce (sdk-runner.mjs) is CLOUD and stays OFF unless
// FLEET_ALLOW_CLOUD=1. DRY_RUN=1 uses a synthetic, tokenless workforce. Fail-closed
// to $0 — matching the doctrine and H4 (a cloud-first fleet auto-pauses on cost).
//
// Everything is dependency-injectable via runFleet(opts) so the DRY_RUN smoke can
// force cap contention, seed an orphan lease, and assert — with zero tokens.

"use strict";

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync } from "node:fs";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import { pickNext, DEFAULT_CAPS } from "../../packages/fleet-commander/src/scheduler.mjs";
import { createLeaseManager, inMemoryLocks } from "../../packages/fleet-commander/src/lease.mjs";
import { gateProposal } from "../../packages/fleet-commander/src/proof-gate.mjs";
import { transition } from "../../packages/fleet-commander/src/fsm.mjs";
import { runBoundedPool } from "../../packages/overclock-moo/src/pool.mjs";
import { probeVramFreeMb, probeOllamaPs } from "./vram-preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

// ── config (env-driven, all overridable via runFleet opts) ───────────────────
function envNum(name, d) { const v = Number(process.env[name]); return Number.isFinite(v) ? v : d; }
function abs(p) { return isAbsolute(p) ? p : resolve(REPO, p); }

export function loadFleet(configPath) {
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  if (!raw || !Array.isArray(raw.pillars)) throw new Error(`fleet config has no pillars[]: ${configPath}`);
  return raw;
}

// ── ledger (⑤) — append-only, honest {ts,event,pillar,...} matching the 23-Jun format ──
export function makeLedger(ledgerPath, now) {
  return function emit(rec) {
    const line = JSON.stringify({ ts: new Date(now()).toISOString(), ...rec }) + "\n";
    try { appendFileSync(ledgerPath, line); } catch { /* ledger write must never crash the fleet */ }
    return line;
  };
}

// ── build the scheduler's loop view from pillars + live state ────────────────
// hit-rate/lastRunAt/openProposals/runsToday come from each pillar's STATE.json +
// the fleet ledger; missing → honest cold-start (Beta(1,1) prior handles it).
export function buildLoops(pillars, fleetDir, { now, runsToday = {}, readState } = {}) {
  const _read = readState || ((id) => {
    try { return JSON.parse(readFileSync(join(fleetDir, id, "STATE.json"), "utf8")); } catch { return {}; }
  });
  return pillars.map((p) => {
    const st = _read(p.id) || {};
    const lastRunAt = st.last_run_ts ? Date.parse(st.last_run_ts) : (st.updated_at ? Date.parse(st.updated_at) : 0);
    return {
      id: p.id,
      pillar: p,
      state: st.status === "paused" || st.status === "suspended" ? st.status : "active",
      impact: p.priority,
      lastRunAt: Number.isFinite(lastRunAt) ? lastRunAt : 0,
      openProposals: st.openProposals ?? 0,
      measuredWins: st.measuredWins ?? 0,
      measuredTotal: st.measuredTotal ?? 0,
      runsToday: runsToday[p.id] ?? 0,
      gpu_heavy: !!p.gpu_heavy,
      cloud_heavy: !!p.cloud_heavy,
    };
  });
}

// ── admission (①+HARD caps) — reuse the scheduler ranking, then enforce the
// per-class caps + budget + quota. What the batch admits is what the caps allow;
// deferred pillars are logged, never silently dropped. ──────────────────────
export function admitBatch(loops, ctx, caps, { spentUsd = 0, estCloudCostUsd = 0, emit = () => {} } = {}) {
  const admitted = [];
  const remaining = loops.filter((l) => {
    if (l.runsToday >= l.pillar.daysQuota) { emit({ event: "admission_skip", pillar: l.id, reason: `daysQuota reached (${l.runsToday}/${l.pillar.daysQuota})` }); return false; }
    return true;
  });
  let gpu = 0, cloud = 0, budget = spentUsd;

  while (admitted.length < caps.poolWidth) {
    const { pick, reason } = pickNext(remaining, ctx);
    if (!pick) { admitted._reason = reason; break; }
    remaining.splice(remaining.indexOf(pick), 1);

    if (pick.gpu_heavy && gpu >= caps.gpuHeavyConcurrent) { emit({ event: "admission_skip", pillar: pick.id, reason: "gpu-heavy cap (1) — deferred to next round" }); continue; }
    if (pick.cloud_heavy) {
      if (cloud >= caps.cloudConcurrent) { emit({ event: "admission_skip", pillar: pick.id, reason: `cloud cap (${caps.cloudConcurrent}) — deferred` }); continue; }
      if (budget + estCloudCostUsd > caps.budgetUsdPerDay) { emit({ event: "admission_skip", pillar: pick.id, reason: `frontier budget exhausted ($${budget.toFixed(2)}+$${estCloudCostUsd} > $${caps.budgetUsdPerDay}) — fleet pauses cloud (H4)` }); continue; }
      budget += estCloudCostUsd;
    }
    admitted.push(pick);
    if (pick.gpu_heavy) gpu++;
    if (pick.cloud_heavy) cloud++;
  }
  return { admitted, gpu, cloud, budgetProjected: budget };
}

// ── the synthetic $0 workforce (DRY_RUN). Produces a proposal per pillar. One
// pillar (id ending in ":dishonest") omits the mandatory "pode falhar se"
// section, so the Proof Gate rejects it MECHANICALLY — proving the parser bites. ──
export function dryRunPillar(loop, { now }) {
  const dishonest = /:dishonest$/.test(loop.id) || loop.pillar.dishonest === true;
  const runEventId = `run-${loop.id}-${now()}`;
  const measureId = `measure-${loop.id}-${now()}`;
  // A typed before/after event the honest claim will cite (H7 groundedness).
  const events = dishonest ? [] : [
    { id: measureId, kind: "measure", output: { before: 100, after: 62 } },
    { id: runEventId, kind: "run", output: {} },
  ];
  const body = dishonest
    ? `## Proposal ${loop.id}\nMakes it 38% faster. Ship it.`
    : `## Proposal ${loop.id}\nRewires the ${loop.id} host-side layer.\n\n### o que NÃO verifiquei / pode falhar se\n- Não testei sob carga concorrente; pode falhar se o input externo for hostil.`;
  const claims = dishonest
    ? [{ text: "38% faster", evidence: [] }]                    // quantitative + no evidence → rejected
    : [{ text: "38% faster on the harness", evidence: [measureId] }]; // grounded in a typed before/after
  return {
    proposal: { id: `prop-${loop.id}-${now()}`, state: "drafted", reversible: true, run_event_id: runEventId, body, claims },
    events,
    engine: "ollama-dry",
    costUsd: 0,
    gpuMinutes: loop.gpu_heavy ? 0.5 : 0,
  };
}

// The real workforce: sdk-runner.mjs (CLOUD). Fail-closed to $0 unless explicitly allowed.
async function cloudPillar(loop) {
  if (process.env.FLEET_ALLOW_CLOUD !== "1") {
    throw new Error(`cloud workforce refused ($0 default): set FLEET_ALLOW_CLOUD=1 to run sdk-runner for '${loop.id}'`);
  }
  const { spawn } = await import("node:child_process");
  const runner = resolve(REPO, "_handoff/loop/sdk-runner.mjs");
  await new Promise((res, rej) => {
    const cp = spawn(process.execPath, [runner], {
      env: { ...process.env, LOOP_DIR: abs(loop.pillar.workdir), REPO, MAX_ROUNDS: "1" },
      stdio: "inherit",
    });
    cp.on("exit", (code) => (code === 0 ? res() : rej(new Error(`sdk-runner exited ${code}`))));
    cp.on("error", rej);
  });
  return { proposal: { id: `prop-${loop.id}`, state: "drafted", reversible: true, body: "(see OUTBOX)", claims: [] }, events: [], engine: "sdk-cloud", costUsd: NaN, gpuMinutes: 0 };
}

// ── one round: admit → lease → dispatch (HARD cap) → proof-gate → FSM → ledger ──
export async function runFleetRound(round, loops, deps) {
  const { caps, ctx, lease, emit, now, runPillar, spent } = deps;
  const { admitted } = admitBatch(loops, ctx, caps, { spentUsd: spent.usd, estCloudCostUsd: deps.estCloudCostUsd, emit });
  if (!admitted.length) return { round, idle: true, ran: 0, results: [] };

  // Live class counters PROVE the caps (admission guarantees them; counters verify).
  const live = { gpu: 0, cloud: 0 };
  const peak = { gpu: 0, cloud: 0, pool: 0 };

  async function runJob(loop) {
    const owner = { sessionId: `fleet-r${round}-${loop.id}`, loopId: loop.id };
    // ② Lease the pillar's workdir. Orphan → REPORTED as incident, NEVER stolen.
    const lock = lease.acquire([loop.pillar.workdir], owner);
    if (!lock.ok) {
      emit({ event: "incident", pillar: loop.id, reason: lock.reason, detail: lock.reason === "orphan-lease" ? "stale lease reported, not reaped" : `held by ${lock.by || "?"}` });
      return { loop, skipped: lock.reason };
    }
    if (loop.gpu_heavy) { live.gpu++; peak.gpu = Math.max(peak.gpu, live.gpu); }
    if (loop.cloud_heavy) { live.cloud++; peak.cloud = Math.max(peak.cloud, live.cloud); }
    peak.pool = Math.max(peak.pool, live.gpu + live.cloud);
    emit({ event: "round_start", pillar: loop.id, round, gpu_heavy: loop.gpu_heavy, cloud_heavy: loop.cloud_heavy });
    try {
      let out;
      try {
        out = await runPillar(loop, { now });
      } catch (e) {
        // RESILIENCE (per-pillar): a throwing worker is an incident, not a fleet death.
        emit({ event: "incident", pillar: loop.id, round, reason: "pillar-threw", detail: e && e.message });
        emit({ event: "round_complete", pillar: loop.id, round, ok: false, done: false, gated: false });
        return { loop, error: e && e.message };
      }
      // ③ Proof Gate — reject anything without "pode falhar se" or with ungrounded claims.
      const gate = gateProposal(out.proposal, { events: out.events });
      if (!gate.ok) {
        const rej = transition(out.proposal, "rejected");
        emit({ event: "gate_rejected", pillar: loop.id, round, reasons: gate.reasons });
        if (rej.ok) emit({ event: "fsm_transition", pillar: loop.id, from: "drafted", to: "rejected", kind: rej.event.kind });
        emit({ event: "round_complete", pillar: loop.id, round, ok: true, done: false, gated: false });
        return { loop, gated: false, engine: out.engine, reasons: gate.reasons };
      }
      // ④ FSM: drafted → proven → gated (transition-guard enforces §5 legality).
      const t1 = transition(out.proposal, "proven");
      const t2 = t1.ok ? transition(t1.proposal, "gated") : { ok: false };
      if (t1.ok) emit({ event: "fsm_transition", pillar: loop.id, from: "drafted", to: "proven", kind: t1.event.kind });
      if (t2.ok) emit({ event: "fsm_transition", pillar: loop.id, from: "proven", to: "gated", kind: t2.event.kind });
      spent.usd += out.costUsd || 0;
      emit({ event: "round_complete", pillar: loop.id, round, ok: true, done: false, gated: !!t2.ok, engine: out.engine, cost_usd: out.costUsd, gpu_min: out.gpuMinutes });
      return { loop, gated: !!t2.ok, engine: out.engine };
    } finally {
      if (loop.gpu_heavy) live.gpu--;
      if (loop.cloud_heavy) live.cloud--;
      lease.release([loop.pillar.workdir], owner);
    }
  }

  const width = Math.min(caps.poolWidth, admitted.length);
  const { results, peakConcurrency, ran } = await runBoundedPool(admitted, width, runJob);
  // ⑤ report orphan leases for the human/Console (never reaped here).
  for (const orphan of lease.reportOrphans()) emit({ event: "orphan_report", resource: orphan.resource, loop: orphan.loopId });
  return { round, ran, results, peak: { ...peak, poolReported: peakConcurrency } };
}

// ── the driver loop. Fully injectable; main() supplies env-backed defaults. ──
export async function runFleet(opts = {}) {
  const now = opts.now || (() => Date.now());
  const configPath = opts.configPath || abs(process.env.FLEET_CONFIG || "_handoff/fleet/fleet.json");
  const fleet = opts.fleet || loadFleet(configPath);
  const fleetDir = opts.fleetDir || abs(process.env.FLEET_DIR || "_handoff/fleet");
  const ledgerPath = opts.ledgerPath || abs(process.env.FLEET_LEDGER || join(fleetDir, "fleet-ledger.jsonl"));
  const heartbeatPath = opts.heartbeatPath || join(fleetDir, "fleet-heartbeat.json");
  const stopSentinel = opts.stopSentinel || join(fleetDir, "STOP");
  const dryRun = opts.dryRun ?? (process.env.DRY_RUN === "1");
  const maxRounds = opts.maxRounds ?? envNum("FLEET_MAX_ROUNDS", 6);

  const caps = {
    gpuHeavyConcurrent: opts.caps?.gpuHeavyConcurrent ?? fleet.caps?.gpuHeavyConcurrent ?? envNum("FLEET_GPU_CONCURRENT", 1),
    cloudConcurrent:    opts.caps?.cloudConcurrent    ?? fleet.caps?.cloudConcurrent    ?? envNum("FLEET_CLOUD_CONCURRENT", 2),
    poolWidth:          opts.caps?.poolWidth          ?? fleet.caps?.poolWidth          ?? envNum("FLEET_POOL_WIDTH", 4),
    budgetUsdPerDay:    opts.caps?.budgetUsdPerDay    ?? fleet.caps?.budgetUsdPerDay    ?? envNum("FLEET_BUDGET_USD_DAY", 5),
    perLoopOpen:        opts.caps?.perLoopOpen        ?? fleet.caps?.perLoopOpen        ?? DEFAULT_CAPS.perLoopOpen,
    globalHumanQueue:   opts.caps?.globalHumanQueue   ?? fleet.caps?.globalHumanQueue   ?? DEFAULT_CAPS.globalHumanQueue,
  };

  const emit = opts.emit || makeLedger(ledgerPath, now);
  const lease = opts.lease || createLeaseManager({ locks: opts.locks || inMemoryLocks(), now });
  const runPillar = opts.runPillar || (dryRun ? dryRunPillar : cloudPillar);
  const foregroundBusy = opts.foregroundBusy ?? (process.env.FLEET_FOREGROUND_BUSY === "1");
  const humanQueueSize = opts.humanQueueSize ?? 0;
  const runsToday = opts.runsToday || {};
  const spent = { usd: opts.spentUsd || 0 };

  emit({ event: "startup", pillars: fleet.pillars.map((p) => p.id), dry_run: !!dryRun, caps });

  const summary = { rounds: 0, ran: 0, gated: 0, rejected: 0, incidents: 0, peakGpu: 0, peakCloud: 0, peakPool: 0, errors: 0, spentUsd: 0, idleReason: null };
  const wrapEmit = (rec) => {
    if (rec.event === "gate_rejected") summary.rejected++;
    if (rec.event === "incident") summary.incidents++;
    return emit(rec);
  };

  for (let round = 1; round <= maxRounds; round++) {
    if (existsSync(stopSentinel)) { summary.idleReason = "STOP sentinel"; break; }
    const loops = buildLoops(fleet.pillars, fleetDir, { now, runsToday, readState: opts.readState });
    const ctx = { now: now(), gpu: { foregroundBusy }, humanQueueSize, caps };
    let res;
    try {
      res = await runFleetRound(round, loops, { caps, ctx, lease, emit: wrapEmit, now, runPillar, spent, estCloudCostUsd: opts.estCloudCostUsd ?? envNum("FLEET_EST_CLOUD_COST_USD", 0) });
    } catch (e) {
      // RESILIENCE: a round must never kill the fleet.
      summary.errors++;
      wrapEmit({ event: "incident", round, reason: "round-threw", detail: e && e.message });
      continue;
    }
    summary.rounds++;
    if (res.idle) { summary.idleReason = "no eligible pillar (caps/quota/preemption)"; wrapEmit({ event: "idle", round, reason: summary.idleReason }); break; }
    for (const r of res.results || []) {
      if (!r) continue;
      if (r.skipped) continue;
      summary.ran++;
      if (r.gated) summary.gated++;
      // count this pillar's run toward its daily quota
      runsToday[r.loop.id] = (runsToday[r.loop.id] ?? 0) + 1;
    }
    if (res.peak) {
      summary.peakGpu = Math.max(summary.peakGpu, res.peak.gpu);
      summary.peakCloud = Math.max(summary.peakCloud, res.peak.cloud);
      summary.peakPool = Math.max(summary.peakPool, res.peak.pool);
    }
    // F4: enrich the heartbeat with GPU contention state (cronista DIGEST reads it).
    let vramFreeMb = null, foreignModels = [];
    if (!dryRun) {
      try {
        vramFreeMb = probeVramFreeMb();
        const fleetBase = (process.env.FLEET_LOCAL_MODEL || "qwen3:30b").split(":")[0];
        const ps = await probeOllamaPs((process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, ""));
        foreignModels = ps.map((m) => m.name || m.model).filter((n) => n && n.split(":")[0] !== fleetBase);
      } catch { /* heartbeat enrichment is best-effort — never blocks the fleet */ }
    }
    try { writeHeartbeat(heartbeatPath, { dry_run: !!dryRun, round, running: [], summary_peakGpu: summary.peakGpu, summary_peakCloud: summary.peakCloud, vram_free_mb: vramFreeMb, foreign_models: foreignModels }, now); } catch {}
  }
  summary.spentUsd = spent.usd;
  emit({ event: "shutdown", ...summary });
  return summary;
}

function writeHeartbeat(path, obj, now) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify({ ts: new Date(now()).toISOString(), pid: process.pid, ...obj }));
  renameSync(tmp, path);
}

// ── CLI entry ────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runFleet()
    .then((s) => { console.log("[fleet] shutdown:", JSON.stringify(s)); process.exit(0); })
    .catch((e) => { console.error("[fleet] fatal:", e && e.message); process.exit(1); });
}
