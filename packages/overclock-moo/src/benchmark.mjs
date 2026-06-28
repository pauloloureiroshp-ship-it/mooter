// benchmark.mjs — Overclock Moo · Phase 2 honest benchmark.
//
// TWO PARTS, STRICT ORDER:
//
//   HEADLINE  — idle-reclaim: real gated jobs through the pool with util sampling.
//               Metric: GPU idle→during, gpuSecondsBusy, pass/fail,
//               $0 local vs ~$ cloud avoided (est, Haiku floor), ~human-min
//               recovered (WITH METR caveat), pass-rate.
//               Appended to the JSONL ledger via appendMetric.
//
//   SECONDARY — throughput sweep [1,2,4,8] (reused from overclock-bench.mjs
//               reference logic). Measured multiplier honestly reported — expect
//               ≈1× on a dense model on RTX 4090. Labelled "secundário". Stored
//               in metric.secondary.throughputX for the headline metric.
//
// HONESTY RULES (hard):
//   • No GPU / no Ollama → print n/d, skip execution, never invent numbers.
//   • Tokens = real eval_count from Ollama API.
//   • Util = real nvidia-smi polled at 250ms.
//   • throughputX = null in production runs (populated here, secondary only).
//   • METR caveat travels with every human-min figure.
//
// DO NOT run this script yourself against hardware; the orchestrator does.
// tsx --check src/benchmark.mjs  → must pass (type-load clean).
// tsx src/benchmark.mjs --dry-run  → print plan JSON and exit.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { computeCapacity } from "./allocator.ts";
import { makeJob } from "./job-catalogue.ts";
import { appendMetric, honestSummaryLines, summarize, METR_CAVEAT, THROUGHPUT_NOTE } from "./metrics.ts";
import { cloudUsdAvoided, DEFAULT_BASE_MODEL } from "./matrix-bridge.ts";
import { runBoundedPool } from "./pool.mjs";

const OLLAMA = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");
const NA = "n/d";

// ── 16 representative asymmetry-safe "brick" prompts for the sweep ───────────
const SNIPPETS = [
  "function debounce(fn, ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}",
  "const sum = arr => arr.reduce((a,b)=>a+b,0)",
  "async function retry(fn, n){for(let i=0;i<n;i++){try{return await fn()}catch(e){if(i===n-1)throw e}}}",
  "function clamp(x,lo,hi){return Math.max(lo,Math.min(hi,x))}",
  "const uniq = a => [...new Set(a)]",
  "function chunk(a,n){const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o}",
  "const pick=(o,ks)=>ks.reduce((r,k)=>(k in o&&(r[k]=o[k]),r),{})",
  "function slugify(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}",
  "const groupBy=(a,f)=>a.reduce((m,x)=>((m[f(x)] ||= []).push(x),m),{})",
  "function memoize(fn){const c=new Map();return k=>c.has(k)?c.get(k):(c.set(k,fn(k)),c.get(k))}",
  "const range=(n)=>Array.from({length:n},(_,i)=>i)",
  "function deepGet(o,p){return p.split('.').reduce((x,k)=>x?.[k],o)}",
  "const sleep=ms=>new Promise(r=>setTimeout(r,ms))",
  "function once(fn){let done,val;return(...a)=>done?val:(done=true,val=fn(...a))}",
  "const flatten=a=>a.flat(Infinity)",
  "function classNames(...a){return a.filter(Boolean).join(' ')}",
];

/** Long-output, asymmetry-safe "brick" prompt for the throughput sweep. */
function sweepPrompt(i) {
  return (
    "Generate a comprehensive unit-test suite (at least 8 distinct describe/it cases " +
    "covering edge cases) for this JavaScript function. Output only runnable JavaScript " +
    "test code, no prose.\n\n" + SNIPPETS[i % SNIPPETS.length]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GPU util helpers
// ─────────────────────────────────────────────────────────────────────────────

/** One-shot nvidia-smi: { util, memUsedMb } or null. */
function nvidiaUtilNow() {
  const r = spawnSync(
    "nvidia-smi",
    ["--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits"],
    { encoding: "utf8" },
  );
  if (r.status !== 0 || !r.stdout) return null;
  const first = r.stdout.trim().split("\n")[0] || "";
  const [u, m] = first.split(",").map((s) => parseInt(s.trim(), 10));
  return Number.isFinite(u) ? { util: u, memUsedMb: Number.isFinite(m) ? m : null } : null;
}

/**
 * Wait for the GPU to drain back to idle before the throughput sweep runs.
 * The headline burst leaves work in flight; if the sweep's width=1 baseline runs
 * before it drains, the baseline is artificially slow and the measured multiplier
 * becomes a contamination artefact (not real batching). Polls until util ≤ idleUtil
 * for `stable` consecutive samples, or gives up after `timeoutMs` (never blocks when
 * nvidia-smi is unavailable). HONESTY: a clean baseline or no number at all.
 */
async function settleGpu({ idleUtil = 25, stable = 3, timeoutMs = 30000, intervalMs = 500 } = {}) {
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < timeoutMs) {
    const s = nvidiaUtilNow();
    if (!s) return; // no GPU reading — nothing to settle, never block
    if (s.util <= idleUtil) {
      if (++calm >= stable) return;
    } else {
      calm = 0;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Run `fn` while sampling GPU util every 250ms.
 * Returns { result, utilMax, utilAvg } — both null when nvidia-smi absent.
 * Uses MAX as the saturation-reached reading (never average-smoothed down).
 */
async function withSampling(fn) {
  const samples = [];
  let live = true;

  const samplerDone = (async () => {
    while (live) {
      const s = nvidiaUtilNow();
      if (s) samples.push(s.util);
      await new Promise((res) => setTimeout(res, 250));
    }
  })();

  const result = await fn();
  live = false;
  await new Promise((res) => setTimeout(res, 300));
  await samplerDone;

  const utilMax = samples.length ? Math.max(...samples) : null;
  const utilAvg = samples.length
    ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
    : null;

  return { result, utilMax, utilAvg };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ollamaModels() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.models) ? j.models.map((m) => m.name) : [];
  } catch {
    return [];
  }
}

function pickModel(models) {
  if (!models.length) return null;
  const pref = ["qwen3", "qwen2.5-coder", "qwen2.5", "llama3", "gemma"];
  for (const p of pref) {
    const hit = models.find((m) => m.toLowerCase().includes(p));
    if (hit) return hit;
  }
  return models[0];
}

/**
 * Single Ollama generate call. Returns real token counts from the API.
 */
async function genOne(model, promptText, numPredict = 120) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model, prompt: promptText, stream: false, think: false,
        options: { num_predict: numPredict },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) return { ok: false, ms, evalTokens: 0, promptTokens: 0 };
    const j = await res.json();
    return {
      ok: true,
      ms,
      text: String(j.response || "").trim(),
      evalTokens: typeof j.eval_count === "number" ? j.eval_count : 0,
      promptTokens: typeof j.prompt_eval_count === "number" ? j.prompt_eval_count : 0,
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, evalTokens: 0, promptTokens: 0, err: String(e?.message || e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Infra helpers
// ─────────────────────────────────────────────────────────────────────────────

function repoRoot() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : process.cwd();
}

function mooterHome() {
  return process.env.MOOTER_HOME || join(homedir(), ".mooter");
}

function readGpuSliceSync() {
  try {
    return JSON.parse(readFileSync(join(mooterHome(), "cache", "gpu-snapshot.json"), "utf8"));
  } catch {
    return null;
  }
}

function nd(v, suffix = "") {
  return v == null ? NA : `${v}${suffix}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — HEADLINE: idle-reclaim with real gated jobs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the headline batch: a deliberate, representative set of REAL asymmetry-safe
 * GPU draft jobs (all pending=true, $0 local, gated non-empty). The headline ALWAYS
 * runs GPU work so the idle→saturated reclaim is actually demonstrated — relying on
 * discovered repo work would leave the headline empty whenever the only pending work
 * is CPU verification (which the benchmark does not execute). CPU/GPU overlap is
 * proven by pool.test.ts; the headline's job is to measure GPU idle-reclaim honestly.
 * The pool runs the whole batch at a width hard-capped to the allocator's gpuSlots
 * (never OOM).
 */
const HEADLINE_GPU_KINDS = ["doc-gen", "test-stubs", "code-review-gated", "backlog-summarize", "journal-rollup", "commit-msg"];

function buildHeadlinePlan(root, gpuSnapshot) {
  const capacity = computeCapacity(gpuSnapshot, { jobs: [] });
  const jobs = HEADLINE_GPU_KINDS.map((k, i) => makeJob(`bench:${k}#${i}`, k, { pending: true }));
  return { capacity, baseModel: DEFAULT_BASE_MODEL, jobs, idle: false };
}

/**
 * Execute the headline batch via the bounded pool at width = gpuSlots (hard cap,
 * never OOM). GPU jobs run real Ollama calls and attribute cloudUsdAvoidedEst from
 * their real split token counts. Honest skip when Ollama is down.
 */
async function runHeadlinePlan(plan, model, diff) {
  if (plan.idle || plan.jobs.length === 0) {
    return [];
  }
  const width = Math.max(1, plan.capacity.gpuSlots || 0);

  async function runGpuJob(job) {
    if (!model) {
      return {
        id: job.id, kind: job.kind, category: job.category,
        model: job.pick?.model || "n/d", runtimeBase: plan.baseModel,
        resource: "gpu", gate: job.gate, humanMinutesEst: job.humanMinutes, usd: 0,
        wallSeconds: 0, gatePassed: false, localTokens: null,
        skipped: "ollama-unavailable", cloudUsdAvoidedEst: null,
      };
    }
    const prompt = `Draft a concise doc comment or test-stub for: ${job.id}.\n\n(context diff: ${diff.slice(0, 300)})`;
    const r = await genOne(model, prompt, 120);
    const cloudEst = r.ok ? cloudUsdAvoided(r.promptTokens, r.evalTokens) : null;
    const localTokens = r.ok && (r.promptTokens + r.evalTokens) > 0
      ? r.promptTokens + r.evalTokens
      : null;
    return {
      id: job.id, kind: job.kind, category: job.category,
      model: job.pick?.model || model, runtimeBase: model,
      resource: "gpu", gate: job.gate, humanMinutesEst: job.humanMinutes, usd: 0,
      wallSeconds: Math.round(r.ms / 100) / 10,
      gatePassed: r.ok && r.text.length > 0,
      localTokens,
      ...(r.ok ? {} : { skipped: "ollama-unavailable" }),
      cloudUsdAvoidedEst: r.ok ? cloudEst : null,
    };
  }

  const { results } = await runBoundedPool(plan.jobs, width, runGpuJob);
  return results.filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — SECONDARY: throughput sweep [1,2,4,8]
// ─────────────────────────────────────────────────────────────────────────────

const SWEEP_LEVELS = [1, 2, 4, 8];
const SWEEP_JOBS = 16;
const SWEEP_NUM_PREDICT = 128;

/**
 * Bounded pool sweep (same logic as reference overclock-bench.mjs).
 * Returns aggregate eval tokens + counts.
 */
async function runSweepPool(model, prompts, width) {
  let idx = 0;
  let okTokens = 0;
  let okCount = 0;
  let failCount = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= prompts.length) return;
      const r = await genOne(model, prompts[i], SWEEP_NUM_PREDICT);
      if (r.ok) {
        okTokens += r.evalTokens;
        okCount++;
      } else {
        failCount++;
      }
    }
  }

  await Promise.all(Array.from({ length: width }, () => worker()));
  return { okTokens, okCount, failCount };
}

async function runThroughputSweep(model) {
  if (!model) {
    console.log("   sweep: Ollama indisponível — throughput n/d");
    return { rows: [], throughputX: null };
  }

  // Warm-up (loads the base; not counted in sweep results).
  process.stdout.write("   warm-up sweep… ");
  const w = await genOne(model, sweepPrompt(0), 32);
  if (!w.ok) {
    console.log(`FALHOU (${w.err || "?"}) — modelo disponível no Ollama?`);
    return { rows: [], throughputX: null };
  }
  console.log(`ok (${w.ms}ms, ${w.evalTokens} tok)`);

  const prompts = Array.from({ length: SWEEP_JOBS }, (_, i) => sweepPrompt(i));
  const rows = [];

  for (const width of SWEEP_LEVELS) {
    process.stdout.write(`   concorrência ${width}… `);
    const { result: r, utilMax, utilAvg } = await withSampling(async () => {
      const t0 = Date.now();
      const out = await runSweepPool(model, prompts, width);
      return { ...out, wallMs: Date.now() - t0 };
    });
    const tps = r.wallMs > 0 ? Math.round((r.okTokens / (r.wallMs / 1000)) * 10) / 10 : 0;
    rows.push({ width, okTokens: r.okTokens, okCount: r.okCount, failCount: r.failCount, wallMs: r.wallMs, tps, utilMax, utilAvg });
    console.log(`wall ${Math.round(r.wallMs / 100) / 10}s · ${r.okTokens} tok · ${tps} tok/s · util ${nd(utilMax, "%")} max · ok ${r.okCount}/${SWEEP_JOBS}`);
  }

  // throughputX = best tps / baseline (width=1) tps. Null if uncomputable.
  const base = rows.find((r) => r.width === 1);
  const best = rows.reduce((a, b) => (b.tps > a.tps ? b : a), rows[0] || { tps: 0 });
  const throughputX =
    base && base.tps > 0 ? Math.round((best.tps / base.tps) * 100) / 100 : null;

  return { rows, throughputX };
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown report
// ─────────────────────────────────────────────────────────────────────────────

function buildMarkdown(at, model, idleUtilBefore, headlineMetric, summaryLines, sweepRows, throughputX) {
  const stamp = at.toISOString();
  let md = `# Overclock Moo — benchmark honesto (${stamp})\n\n`;
  md += `**modelo base:** \`${model || NA}\` · **OLLAMA_NUM_PARALLEL:** ${process.env.OLLAMA_NUM_PARALLEL || "(default ~4)"}\n\n`;

  // ── PARTE 1 — HEADLINE ─────────────────────────────────────────────────────
  md += `## PARTE 1 — HEADLINE: reclamação de GPU ociosa\n\n`;
  md += `> A métrica principal é: GPU ociosa → saturada, $0 local vs ~$ cloud evitados,\n`;
  md += `> ~min-humanos recuperados (COM ressalva METR). Throughput é **SECUNDÁRIO**.\n\n`;
  md += `**GPU util idle antes:** ${nd(idleUtilBefore, "%")}\n\n`;

  if (headlineMetric) {
    for (const line of summaryLines) md += `- ${line}\n`;
  } else {
    md += `- Sem GPU / Ollama indisponível — todos os resultados: ${NA}\n`;
  }
  md += `\n`;

  // ── PARTE 2 — SECUNDÁRIO ───────────────────────────────────────────────────
  md += `## PARTE 2 — SECUNDÁRIO: sweep de throughput [${SWEEP_LEVELS.join(",")}]\n\n`;
  md += `> **Secundário** — ≈1× local em modelos densos (RTX 4090 satura single-stream).\n`;
  md += `> Cresce em: jobs de output curto, MoE base (ex. qwen3:30b), OLLAMA_NUM_PARALLEL alto, vLLM datacenter.\n`;
  md += `> O 7b experimental mediu ~1.37×; modelos densos ~1× (compute-bound, não memory-bound).\n\n`;

  if (sweepRows.length > 0) {
    md += `| concorrência | wall (s) | tok/s | tokens | util máx | speedup vs 1 |\n`;
    md += `|---:|---:|---:|---:|:---:|---:|\n`;
    const base = sweepRows.find((r) => r.width === 1);
    for (const r of sweepRows) {
      const wallS = Math.round(r.wallMs / 100) / 10;
      const su =
        base && base.tps > 0
          ? (Math.round((r.tps / base.tps) * 100) / 100) + "×"
          : NA;
      md += `| ${r.width} | ${wallS} | **${r.tps}** | ${r.okTokens} | ${nd(r.utilMax, "%")} | ${su} |\n`;
    }
    md += `\n**throughputX medido:** ${nd(throughputX, "×")} _(secundário; ${THROUGHPUT_NOTE})_\n\n`;
  } else {
    md += `Sweep não executado (Ollama indisponível ou warm-up falhou) — throughputX: ${NA}\n\n`;
  }

  // ── Honesty footnote ───────────────────────────────────────────────────────
  md += `---\n\n`;
  md += `> **Honestidade:** tokens = \`eval_count\` real do Ollama; util = \`nvidia-smi\` amostrado a 250ms.\n`;
  md += `> Cloud-$ evitado = estimativa conservadora ao preço Haiku (tier mais barato — nunca inflada).\n`;
  md += `> ${METR_CAVEAT}\n`;
  md += `> Se throughput achatar: sobe \`OLLAMA_NUM_PARALLEL\` e reinicia o Ollama.\n`;

  return md;
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const root = repoRoot();
  const home = mooterHome();
  const gpuSnapshot = readGpuSliceSync();

  const plan = buildHeadlinePlan(root, gpuSnapshot);

  if (dryRun) {
    console.log("🐂 Overclock Moo — benchmark (dry-run)");
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const models = await ollamaModels();
  const model = pickModel(models);

  console.log("🐂 Overclock Moo — benchmark honesto (Fase 2)");
  console.log(`   modelo: ${model || NA} · GPU snapshot: ${gpuSnapshot ? "disponível" : NA}`);

  const idleReading = nvidiaUtilNow();
  const idleUtilBefore = idleReading?.util ?? null;
  console.log(`   GPU util idle: ${nd(idleUtilBefore, "%")} · mem: ${nd(idleReading?.memUsedMb, " MiB")}`);

  // Git diff for job context.
  let diff = "";
  try {
    const r = spawnSync("git", ["-C", root, "diff", "--stat", "HEAD"], { encoding: "utf8" });
    if (r.status === 0) diff = r.stdout.trim().slice(-1000);
  } catch { /* ignore */ }

  // ── PARTE 1: HEADLINE ──────────────────────────────────────────────────────
  console.log("\n── PARTE 1: idle-reclaim (headline) ──");

  const { result: headlineResults, utilMax: headlineUtilDuring } = await withSampling(async () => {
    return await runHeadlinePlan(plan, model, diff);
  });

  const utilAfterHeadline = nvidiaUtilNow()?.util ?? null;

  let headlineMetric = summarize(headlineResults, {
    at: Date.now(),
    project: root.split(/[\\/]/).pop() || null,
    baseModel: plan.baseModel,
    gpu: gpuSnapshot
      ? {
          utilBefore: idleUtilBefore,
          utilAfter: utilAfterHeadline,
          utilDuring: headlineUtilDuring,
          totalMb: typeof gpuSnapshot.totalMb === "number" ? gpuSnapshot.totalMb : null,
          vramBudgetMb: plan.capacity.vramBudgetMb,
          gpuSlots: plan.capacity.gpuSlots,
          cpuSlots: plan.capacity.cpuSlots,
        }
      : null,
    // throughputX populated after sweep below.
  });

  const summaryLines = honestSummaryLines(headlineMetric);
  for (const line of summaryLines) console.log("   " + line);

  // ── PARTE 2: SECUNDÁRIO ────────────────────────────────────────────────────
  console.log("\n── PARTE 2: throughput sweep (secundário) ──");
  // Drain the headline burst first so the width=1 baseline is clean (else the
  // measured multiplier is a contamination artefact, not real batching).
  process.stdout.write("   a aguardar a GPU voltar a idle… ");
  await settleGpu();
  console.log(`ok (util ${nd(nvidiaUtilNow()?.util, "%")})`);
  const { rows: sweepRows, throughputX } = await runThroughputSweep(model);
  console.log(`   throughputX medido: ${nd(throughputX, "×")} (${THROUGHPUT_NOTE})`);

  // Rebuild metric with throughputX from sweep (secondary bucket).
  headlineMetric = summarize(headlineResults, {
    at: headlineMetric.at,
    project: headlineMetric.project,
    baseModel: plan.baseModel,
    gpu: headlineMetric.gpu,
    throughputX,
  });

  // Append to JSONL ledger.
  const ledgerFile = appendMetric(headlineMetric, home);
  console.log(`\n   ledger: ${ledgerFile}`);

  // ── Markdown report ────────────────────────────────────────────────────────
  const at = new Date();
  const stamp = at.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = join(root, "_handoff", `overclock-benchmark-${stamp}.md`);
  const md = buildMarkdown(at, model, idleUtilBefore, headlineMetric, summaryLines, sweepRows, throughputX);

  try {
    writeFileSync(reportPath, md, "utf8");
    console.log(`   relatório: ${reportPath}`);
  } catch (e) {
    console.log(`   (não consegui escrever o relatório: ${e.message})`);
  }

  // ── RESUMO ─────────────────────────────────────────────────────────────────
  const m = headlineMetric.measured;
  const q = headlineMetric.quality;
  const e = headlineMetric.estimated;
  console.log("\n=== RESUMO ===");
  console.log(
    `GPU ociosa ${nd(idleUtilBefore, "%")} → saturada ${nd(headlineMetric.gpu?.utilDuring, "%")} · ` +
    `busy ${nd(m.gpuSecondsBusy, "s")} · jobs ${m.jobsRun} (pass ${m.gatePass} / fail ${m.gateFail}) · ` +
    `pass-rate ${q.passRate !== null ? Math.round(q.passRate * 100) + "%" : NA} · ` +
    `~${e.humanMinutesRecovered} human-min (est, METR caveat) · ` +
    `~$${nd(m.cloudUsdAvoided)} cloud evitado · $0 local · ` +
    `throughput ${nd(throughputX, "×")} (secundário)`
  );
}

main().catch((e) => {
  console.error("benchmark error:", e?.message || e);
  process.exit(1);
});
