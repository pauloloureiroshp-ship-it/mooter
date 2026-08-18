#!/usr/bin/env node
/**
 * stop-drill.mjs — the drill that decides whether the STOP is a kill-switch or décor.
 *
 * "Sem drill medido não é kill-switch." A gate that passes unit tests proves the
 * LOGIC; only a timed drill against a FULL QUEUE and a REAL local model proves the
 * LATENCY — the number the human actually feels when they want their GPU back.
 *
 * WHAT IT MEASURES (two different numbers — conflating them is how a drill lies)
 *   t_refuse — stop.json written → the first dispatch REFUSED. This is the gate's own
 *              latency: how fast the mechanism reacts. Sub-millisecond by design.
 *   t_idle   — stop.json written → the worker actually returns. This is what the human
 *              feels, and it is bounded from below by the IN-FLIGHT turn: the loop is
 *              gated BETWEEN turns, so a model call already in flight runs to completion.
 *
 * The gap between the two is the honest finding of this drill, not a bug to hide: to
 * push t_idle below t_refuse + one-turn you must abort the in-flight fetch, which is a
 * separate (and riskier) change. Measure first, decide after.
 *
 * SAFETY: by default the drill uses a TEMP stop file, never ~/.mooter/stop.json — a
 * crashed drill must not leave a live kill-switch halting Paulo's real fleet. Pass
 * `--real` to drill the true path (cleaned up in a finally, but the risk is yours).
 *
 * USE
 *   node _handoff/loop/stop-drill.mjs                  # 6 jobs, real Ollama, temp path
 *   node _handoff/loop/stop-drill.mjs --jobs 4 --at 1500
 *   node _handoff/loop/stop-drill.mjs --real           # against ~/.mooter/stop.json
 *   node _handoff/loop/stop-drill.mjs --simulated      # no Ollama needed (labelled n/d)
 *
 * EXIT: 0 = drill ran and produced numbers · 2 = could not run (says why, measures nothing)
 */

import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runLoop } from "./local-loop-runner.mjs";
import { createDispatchGate, STOP_PATH_DEFAULT } from "../../packages/fleet-commander/src/stop-gate.mjs";

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const has = (name) => args.includes(`--${name}`);

const JOBS = Number(flag("jobs", 6));
const STOP_AT_MS = Number(flag("at", 2000));
const MAX_TURNS = Number(flag("turns", 6));
const USE_REAL_PATH = has("real");
const SIMULATED = has("simulated");
const OLLAMA = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");

const ms = (n) => `${Math.round(n * 100) / 100}ms`;

/** A model stand-in with a known per-turn latency — used only with --simulated, and
 *  the receipt says so, because a number produced by my own knob measures my knob. */
function simulatedOllama(turnMs) {
  return {
    async generate() {
      await new Promise((r) => setTimeout(r, turnMs));
      return { ok: true, text: JSON.stringify({ tool: "note", args: { text: "trabalho" }, done: false }) };
    },
  };
}

async function pickLocalModel() {
  // The smallest model gives the FLATTERING number. `--model` exists so the drill can
  // be run against the model a pilar actually uses — t_idle is bounded by the in-flight
  // turn, so a 3b and a 20b are two different truths and both deserve measuring.
  const forced = flag("model", null);
  if (forced) return forced;
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const j = await res.json();
    const names = (j.models || []).map((m) => m.name);
    // The drill wants the SMALLEST honest model: we are measuring the gate, not the GPU.
    for (const p of ["qwen2.5:3b", "qwen2.5", "qwen3", "gemma", "llama3"]) {
      const hit = names.find((n) => n.toLowerCase().includes(p));
      if (hit) return hit;
    }
    return names[0] || null;
  } catch { return null; }
}

async function main() {
  let stopPath, cleanup = () => {};
  if (USE_REAL_PATH) {
    stopPath = STOP_PATH_DEFAULT;
    if (existsSync(stopPath)) {
      console.error(`⚠ ${stopPath} já existe — o drill não sobrepõe um STOP real. Remove-o primeiro, ou corre sem --real.`);
      process.exitCode = 2; return;
    }
    cleanup = () => { try { rmSync(stopPath, { force: true }); } catch { /* best-effort */ } };
  } else {
    const dir = mkdtempSync(join(tmpdir(), "mooter-stop-drill-"));
    stopPath = join(dir, "stop.json");
    cleanup = () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } };
  }

  let ollama = null, model = "n/d", mode;
  if (SIMULATED) {
    mode = "simulated"; ollama = simulatedOllama(Number(flag("turn-ms", 800)));
  } else {
    model = await pickLocalModel();
    if (!model) {
      console.error("⚠ Ollama não responde. O drill mede latência REAL ou não mede nada — não invento números.");
      console.error("   Sobe o Ollama, ou corre com --simulated (o recibo fica marcado como não-real).");
      cleanup(); process.exitCode = 2; return;
    }
    mode = "real-ollama";
  }

  console.log(`🛑 STOP drill · ${JOBS} jobs na fila · modo=${mode} · modelo=${model} · stop=${stopPath}`);
  console.log(`   o switch cai aos ${STOP_AT_MS}ms\n`);

  const results = [];
  let stopWrittenAt = null;
  let firstRefusedAt = null;

  // The kill-switch falls mid-flight, exactly as a human would pull it.
  const timer = setTimeout(() => {
    stopWrittenAt = performance.now();
    writeFileSync(stopPath, JSON.stringify({
      stop: true, by: "stop-drill", since: new Date().toISOString(),
      reason: "drill cronometrado — quero a GPU de volta",
    }));
  }, STOP_AT_MS);

  const t0 = performance.now();
  try {
    // A BOUNDED SINGLE-SHOT QUEUE: one worker, one job at a time. This is the shape the
    // GPU mutex demands (1 active pilar per GPU) — a fan-out would be refused by design.
    for (let i = 1; i <= JOBS; i++) {
      const gate = createDispatchGate({ stopPath, owner: { sessionId: `drill-${i}`, loopId: "drill" }, pilar: "drill" });
      const started = performance.now();
      const res = await runLoop({
        task: "Anota uma linha sobre o estado do repositório e depois continua a anotar.",
        sid: `drill-${i}`, model, maxTurns: MAX_TURNS, gate,
        ollama: ollama || undefined,
        tools: { note: (a, ctx) => { ctx.notes.push(String(a.text || "")); return { ok: true, observation: "noted" }; } },
      });
      const ended = performance.now();
      if (res.reason === "halted" && firstRefusedAt == null) firstRefusedAt = ended;
      results.push({ job: i, reason: res.reason, turns: res.turns.length, started, ended });
      console.log(`   job ${i}: ${res.reason} (${res.turns.length} turns, ${ms(ended - started)})`);
      if (res.reason === "halted") {
        // The queue itself must die, not just this job — otherwise STOP means
        // "skip one job" and the fleet keeps eating the GPU.
        console.log(`   ⛔ fila abortada no job ${i}: ${res.haltReason}`);
        results.push(...Array.from({ length: JOBS - i }, (_, k) => ({ job: i + k + 1, reason: "never-dispatched", turns: 0 })));
        break;
      }
    }
  } finally {
    clearTimeout(timer);
    cleanup();
  }

  const tEnd = performance.now();
  const halted = results.find((r) => r.reason === "halted");
  const tRefuse = stopWrittenAt != null && firstRefusedAt != null ? firstRefusedAt - stopWrittenAt : null;
  const tIdle = stopWrittenAt != null ? tEnd - stopWrittenAt : null;

  const receipt = {
    kind: "stop-drill-receipt",
    modo: mode,
    honesto: mode === "real-ollama" ? "latência real de um modelo local" : "latência SIMULADA — não é uma medição de produção",
    modelo: model,
    jobs_na_fila: JOBS,
    jobs_executados: results.filter((r) => r.reason !== "never-dispatched" && r.reason !== "halted").length,
    jobs_nunca_despachados: results.filter((r) => r.reason === "never-dispatched").length,
    parou: !!halted,
    t_refuse_ms: tRefuse == null ? "n/d" : Math.round(tRefuse * 100) / 100,
    t_idle_ms: tIdle == null ? "n/d" : Math.round(tIdle * 100) / 100,
    meta_ms: 5000,
    cumpre_meta: tIdle == null ? "n/d" : tIdle < 5000,
    stop_path: stopPath,
    medido_em: new Date().toISOString(),
  };

  console.log("\n── recibo ─────────────────────────────────────────────");
  if (!halted && stopWrittenAt != null) {
    console.log("⚠ a fila terminou ANTES do switch cair — aumenta --jobs ou baixa --at. Sem paragem observada, não há número.");
  }
  console.log(`t_refuse (mecanismo)........ ${receipt.t_refuse_ms === "n/d" ? "n/d" : ms(tRefuse)}`);
  console.log(`t_idle   (o que o humano sente) ${receipt.t_idle_ms === "n/d" ? "n/d" : ms(tIdle)}   meta <5000ms → ${receipt.cumpre_meta}`);
  console.log(`jobs nunca despachados...... ${receipt.jobs_nunca_despachados}/${JOBS}`);
  console.log(JSON.stringify(receipt, null, 2));

  process.exitCode = 0;
}

main().catch((e) => { console.error("stop-drill error:", e?.message || e); process.exitCode = 2; });
