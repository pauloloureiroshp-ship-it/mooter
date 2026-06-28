// runner.mjs — local $0 executor for an Overclock Moo plan. Phase 2.
//
// Pipeline: read the live GPU slice (cache) → discover REAL pending work →
// planAllocation() → run jobs through runOverlapped() (GPU ∥ CPU pool) →
// GPU util sampler during execution → write the honest metric.
//
// Phase 2 additions (ADDITIVE — all existing behaviour preserved):
//   • runOverlapped replaces the sequential for-loop: GPU and CPU pools run in
//     parallel (CPU verification while GPU generates). Hard slot caps still apply.
//   • GPU util sampler polls nvidia-smi ~250ms during job execution; reports max
//     (peak saturation reached while reclaiming idle) as utilDuring in the metric.
//   • --idle-fill flag: runIdleFill loop re-discovers pending work each round and
//     stops honestly when idle or a guard fires (VRAM > 85%, temp > 84°C).
//   • cloudUsdAvoidedEst per GPU job: counterfactual at the cheapest cloud tier
//     (Haiku) — conservative, never inflated. Null for CPU / token-less jobs.
//   • OLLAMA_NUM_PARALLEL warning when the env value is below gpuSlots.
//
// Run (demo, real): npm run demo   (= tsx src/runner.mjs --demo)
// tsx resolves the .ts imports below; plain node would need a TS loader.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { planAllocation } from "./allocator.ts";
import { discoverPendingJobs, makeJob } from "./job-catalogue.ts";
import { appendMetric, honestSummaryLines, summarize } from "./metrics.ts";
import { cloudUsdAvoided } from "./matrix-bridge.ts";
import { runOverlapped, runIdleFill } from "./pool.mjs";

const OLLAMA = process.env.OLLAMA_HOST?.replace(/\/$/, "") || "http://127.0.0.1:11434";

function repoRoot() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : process.cwd();
}

function mooterHome() {
  return process.env.MOOTER_HOME || join(homedir(), ".mooter");
}

/** Live GPU slice from the collector cache (honest n/d when absent). */
function readGpuSlice() {
  try {
    return JSON.parse(readFileSync(join(mooterHome(), "cache", "gpu-snapshot.json"), "utf8"));
  } catch {
    return null;
  }
}

/** One-shot GPU util now (for the after-reading). null = n/d. */
function queryUtilNow() {
  const r = spawnSync("nvidia-smi", ["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return null;
  const vals = r.stdout.trim().split("\n").map((s) => parseInt(s, 10)).filter(Number.isFinite);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

/**
 * GPU util sampler: polls nvidia-smi every ~250ms while `fn` runs.
 * Returns { utilMax, utilAvg } (both null if no GPU / nvidia-smi absent).
 * Uses the MAX as utilDuring — the peak saturation reached (most conservative
 * meaningful reading: shows the highest the idle GPU was driven).
 */
async function withUtilSampling(fn) {
  const samples = [];
  let live = true;

  // Sampling loop runs concurrently with fn.
  const samplerDone = (async () => {
    while (live) {
      const r = spawnSync(
        "nvidia-smi",
        ["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
        { encoding: "utf8" },
      );
      if (r.status === 0 && r.stdout) {
        const vals = r.stdout.trim().split("\n").map((s) => parseInt(s, 10)).filter(Number.isFinite);
        if (vals.length) samples.push(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
      }
      await new Promise((res) => setTimeout(res, 250));
    }
  })();

  const result = await fn();
  live = false;
  // Wait for one last sample after fn completes.
  await new Promise((res) => setTimeout(res, 300));
  await samplerDone;

  const utilMax = samples.length ? Math.max(...samples) : null;
  const utilAvg = samples.length
    ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
    : null;

  return { result, utilMax, utilAvg };
}

async function ollamaModels() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.models) ? j.models.map((m) => m.name) : [];
  } catch {
    return [];
  }
}

function pickOllamaModel(models) {
  if (!models.length) return null;
  const pref = ["qwen3", "qwen2.5-coder", "qwen2.5", "llama3", "gemma"];
  for (const p of pref) {
    const hit = models.find((m) => m.toLowerCase().includes(p));
    if (hit) return hit;
  }
  return models[0];
}

/** Resolve a POSIX shell (this repo's gate commands assume sh; Windows cmd can't
 *  run the tsx shims). Prefer Git Bash on win32; null ⇒ fall back to the OS shell. */
let _bash;
function bashPath() {
  if (_bash !== undefined) return _bash;
  if (process.platform !== "win32") return (_bash = null); // sh is the default shell
  for (const c of ["C:/Program Files/Git/bin/bash.exe", "C:/Program Files (x86)/Git/bin/bash.exe"]) {
    if (existsSync(c)) return (_bash = c);
  }
  const w = spawnSync("where", ["bash"], { encoding: "utf8" });
  return (_bash = w.status === 0 ? w.stdout.trim().split("\n")[0].trim() : null);
}

/** Run a deterministic gate command; classify spawn failures honestly. */
function runCpuGate(job) {
  const t0 = Date.now();
  const bash = bashPath();
  // npm defaults its own script-shell to cmd on Windows even when launched from
  // bash; force POSIX so the repo's tsx-shim test scripts resolve.
  const r = bash
    ? spawnSync(bash, ["-lc", `export npm_config_script_shell=bash; cd "${(job.cwd || ".").replace(/\\/g, "/")}" && ${job.command}`], { encoding: "utf8", timeout: 180_000 })
    : spawnSync(job.command, { cwd: job.cwd, shell: true, encoding: "utf8", timeout: 180_000 });
  const wallSeconds = (Date.now() - t0) / 1000;
  const out = (r.stdout || "") + (r.stderr || "");
  // Precise tool-missing signals only — NOT a broad scan of combined output (a
  // gate's own subprocess can legitimately print "no such file" etc.).
  //   • ENOENT       → the gate binary itself is absent.
  //   • exit 127     → POSIX shell "command not found".
  //   • npx's exact  → "could not determine executable to run".
  const toolMissing =
    r.error?.code === "ENOENT" ||
    r.status === 127 ||
    /could not determine executable to run/i.test(out);
  if (toolMissing) {
    return { wallSeconds, skipped: "tool-unavailable", gatePassed: false, localTokens: null, promptTokens: null, evalTokens: null };
  }
  return { wallSeconds, gatePassed: r.status === 0, localTokens: null, promptTokens: null, evalTokens: null };
}

/**
 * Run a GPU LLM job via the Ollama API; tokens are REAL eval counts.
 * Returns promptTokens and evalTokens separately (for cloud-$ estimate) plus
 * localTokens = prompt+eval (for metrics, consistent with Phase 1 contract).
 */
async function runGpuLlmJob(job, model, prompt) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // think:false → thinking models (qwen3) answer directly instead of spending
      // the budget on a <think> block, so the gated artifact lands in `response`.
      body: JSON.stringify({ model, prompt, stream: false, think: false, options: { num_predict: 120 } }),
      signal: AbortSignal.timeout(120_000),
    });
    const wallSeconds = (Date.now() - t0) / 1000;
    if (!res.ok) return { wallSeconds, skipped: `ollama-http-${res.status}`, gatePassed: false, localTokens: null, promptTokens: null, evalTokens: null };
    const j = await res.json();
    const text = String(j.response || "").trim();
    const promptTokens = typeof j.prompt_eval_count === "number" ? j.prompt_eval_count : null;
    const evalTokens = typeof j.eval_count === "number" ? j.eval_count : null;
    const localTokens = (promptTokens ?? 0) + (evalTokens ?? 0) || null;
    // Deterministic gate: the draft must be non-empty (a real artifact produced).
    return { wallSeconds, gatePassed: text.length > 0, localTokens, promptTokens, evalTokens, runtimeModel: model, artifact: text };
  } catch (e) {
    const wallSeconds = (Date.now() - t0) / 1000;
    return { wallSeconds, skipped: "ollama-unavailable", gatePassed: false, localTokens: null, promptTokens: null, evalTokens: null };
  }
}

function gitDiffStat(root) {
  const r = spawnSync("git", ["-C", root, "diff", "--stat", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().slice(-1500) : "";
}

/**
 * Read GPU temperature and VRAM used from a cached GPU slice or live nvidia-smi.
 * Returns { tempC: number|null, usedMb: number|null, totalMb: number|null }.
 */
function readGpuStatus(gpu) {
  // Try to read temp+VRAM from nvidia-smi directly (most up-to-date).
  const r = spawnSync(
    "nvidia-smi",
    ["--query-gpu=temperature.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
    { encoding: "utf8" },
  );
  if (r.status === 0 && r.stdout) {
    const first = r.stdout.trim().split("\n")[0] || "";
    const parts = first.split(",").map((s) => parseInt(s.trim(), 10));
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      return { tempC: parts[0], usedMb: parts[1], totalMb: parts[2] };
    }
  }
  // Fall back to cached slice (best-effort).
  if (gpu) {
    const totalMb = typeof gpu.totalMb === "number" ? gpu.totalMb : null;
    const freeMb = typeof gpu.freeMb === "number" ? gpu.freeMb : null;
    const usedMb = totalMb !== null && freeMb !== null ? Math.max(0, totalMb - freeMb) : null;
    return { tempC: null, usedMb, totalMb };
  }
  return { tempC: null, usedMb: null, totalMb: null };
}

/**
 * shouldStop guard for runIdleFill.
 * Reads live VRAM via nvidia-smi; if used > 85% of total OR temp > 84°C, stops.
 * If unreadable → never stops on a fabricated reading (honest).
 */
function makeShouldStop(gpu) {
  return async function shouldStop() {
    const { tempC, usedMb, totalMb } = readGpuStatus(gpu);
    if (tempC !== null && tempC > 84) {
      return { stop: true, reason: `thermal: GPU temp ${tempC}°C > 84°C` };
    }
    if (usedMb !== null && totalMb !== null && totalMb > 0) {
      const frac = usedMb / totalMb;
      if (frac > 0.85) {
        return { stop: true, reason: `vram: ${Math.round(frac * 100)}% used > 85% threshold` };
      }
    }
    // Unreadable → do not stop; never fabricate.
    return { stop: false };
  };
}

/**
 * comfort function for runIdleFill: if GPU temp over threshold, return reduced
 * concurrency (≥1). If temp unreadable, return full gpuSlots (never stop on fiction).
 */
function makeComfort(gpu, gpuSlots) {
  return async function comfort() {
    const { tempC } = readGpuStatus(gpu);
    if (tempC !== null && tempC > 80) {
      // Thermal comfort: reduce to half-capacity (floor 1) above 80°C.
      return Math.max(1, Math.floor(gpuSlots / 2));
    }
    return gpuSlots;
  };
}

/**
 * Warn if OLLAMA_NUM_PARALLEL is set below the planned gpuSlots — the batching
 * would be limited by the server before our slot cap matters.
 */
function warnOllamaParallel(gpuSlots) {
  const env = process.env.OLLAMA_NUM_PARALLEL;
  // Default when unset is typically 4 in Ollama; we use 4 as the known default.
  const knownDefault = 4;
  const effective = env ? parseInt(env, 10) : knownDefault;
  if (Number.isFinite(effective) && effective < gpuSlots) {
    console.warn(
      `⚠ batching limitado: OLLAMA_NUM_PARALLEL=${effective} < gpuSlots=${gpuSlots} ` +
      `(sobe e reinicia o Ollama para saturar o batch)`,
    );
  }
}

/**
 * Build the runGpuJob and runCpuJob closures that match runOverlapped's signature.
 * Each closure captures the diff/model context and returns a JobResult-shaped object.
 */
function makeJobClosures(plan, ollamaModel, diff) {
  const base = plan.baseModel;

  async function runGpuJob(job) {
    if (!ollamaModel) {
      return {
        id: job.id, kind: job.kind, category: job.category,
        model: job.pick.model, runtimeBase: base, resource: "gpu",
        gate: job.gate, humanMinutesEst: job.humanMinutes, usd: 0,
        wallSeconds: 0, gatePassed: false, localTokens: null, skipped: "ollama-unavailable",
        cloudUsdAvoidedEst: null,
      };
    }
    const prompt = `Write a single concise conventional-commit subject line (max 72 chars, no body) for this diff. Output only the line.\n\n${diff}`;
    const r = await runGpuLlmJob(job, ollamaModel, prompt);
    const cloudEst = cloudUsdAvoided(r.promptTokens, r.evalTokens);
    return {
      id: job.id, kind: job.kind, category: job.category,
      model: job.pick.model,
      runtimeBase: r.runtimeModel || ollamaModel,
      resource: "gpu",
      gate: job.gate,
      humanMinutesEst: job.humanMinutes,
      usd: 0,
      wallSeconds: round1(r.wallSeconds),
      gatePassed: r.gatePassed,
      localTokens: r.localTokens,
      ...(r.skipped ? { skipped: r.skipped } : {}),
      cloudUsdAvoidedEst: r.skipped ? null : cloudEst,
    };
  }

  function runCpuJob(job) {
    const r = runCpuGate(job);
    return Promise.resolve({
      id: job.id, kind: job.kind, category: job.category,
      model: job.pick.model, runtimeBase: base, resource: "cpu",
      gate: job.gate, humanMinutesEst: job.humanMinutes, usd: 0,
      wallSeconds: round1(r.wallSeconds),
      gatePassed: r.gatePassed,
      localTokens: r.localTokens,
      ...(r.skipped ? { skipped: r.skipped } : {}),
      cloudUsdAvoidedEst: null, // CPU jobs produce no tokens → no cloud counterfactual
    });
  }

  return { runGpuJob, runCpuJob };
}

async function main() {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const dryRun = args.includes("--dry-run");
  const asJson = args.includes("--json");
  const idleFill = args.includes("--idle-fill");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : demo ? "overclock-moo" : null;

  const root = repoRoot();
  const gpu = readGpuSlice();
  const snapshot = { gpu, project: root.split(/[\\/]/).pop() || null };

  // ── Discover REAL pending work (only-filter keeps the demo fast/deterministic) ──
  let jobs = discoverPendingJobs(root);
  if (only) jobs = jobs.filter((j) => j.id.endsWith(`:${only}`) || (j.cwd || "").replace(/\\/g, "/").includes(`/packages/${only}`));
  // Demo scopes to the deterministic CPU verification track that is locally
  // runnable here (run-tests). Typecheck stays a discovered/plan candidate
  // (unit-tested) but needs a package-local tsc to gate honestly — out of the
  // forced demo so we never gate against a stray global toolchain.
  if (demo) jobs = jobs.filter((j) => j.kind === "run-tests");

  // Demo: add one real GPU job — a commit-msg draft for the live diff (genuinely
  // pending: you need a message for these changes). Skipped honestly if no diff.
  const models = await ollamaModels();
  const ollamaModel = pickOllamaModel(models);
  let diff = "";
  if (demo) {
    diff = gitDiffStat(root);
    if (diff) jobs.push(makeJob("commit-msg:HEAD", "commit-msg", { pending: true }));
  }

  const plan = planAllocation(snapshot, { jobs });

  if (dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  // ── OLLAMA_NUM_PARALLEL warning ───────────────────────────────────────────
  if (plan.capacity.gpuSlots > 1) warnOllamaParallel(plan.capacity.gpuSlots);

  const utilBefore = gpu && typeof gpu.utilPct === "number" ? gpu.utilPct : null;

  // ── Execute the plan ─────────────────────────────────────────────────────
  //
  // --idle-fill: loop until real pending work empties or a guard fires.
  // Normal run: one pass through runOverlapped (same semantics as Phase 1,
  //             but GPU ∥ CPU instead of sequential).

  let allResults = [];
  let utilDuring = null;

  if (idleFill) {
    const shouldStop = makeShouldStop(gpu);
    const comfort = makeComfort(gpu, plan.capacity.gpuSlots);

    // Each round re-discovers pending work and plans fresh.
    const planRound = async () => {
      const freshJobs = discoverPendingJobs(root);
      return planAllocation(snapshot, { jobs: freshJobs });
    };

    // We sample util across the whole idle-fill run (not per-round, for simplicity).
    const { result: rounds, utilMax } = await withUtilSampling(async () => {
      return await runIdleFill({
        planRound,
        shouldStop,
        comfort,
        maxRounds: 50,
        // runGpuJob and runCpuJob are injected per-round via the plan's job list
        // BUT runIdleFill calls runOverlapped which needs closures. We pass them
        // here keyed to the initial plan; each round re-runs with updated plan.
        runGpuJob: async (job) => {
          const { runGpuJob } = makeJobClosures(plan, ollamaModel, diff);
          return await runGpuJob(job);
        },
        runCpuJob: async (job) => {
          const { runCpuJob } = makeJobClosures(plan, ollamaModel, diff);
          return await runCpuJob(job);
        },
      });
    });

    utilDuring = utilMax;
    // Flatten results from all rounds.
    for (const round of rounds) {
      if (round.results) allResults.push(...round.results.filter(Boolean));
    }
  } else {
    // Normal single-pass: runOverlapped (GPU ∥ CPU, replaces the sequential for-loop).
    const { runGpuJob, runCpuJob } = makeJobClosures(plan, ollamaModel, diff);
    const { result: out, utilMax } = await withUtilSampling(async () => {
      return await runOverlapped(plan, { runGpuJob, runCpuJob });
    });
    utilDuring = utilMax;
    allResults = out.results.filter(Boolean);
  }

  const utilAfter = queryUtilNow();
  const metric = summarize(allResults, {
    at: Date.now(),
    project: snapshot.project,
    baseModel: plan.baseModel,
    gpu: {
      utilBefore,
      utilAfter,
      utilDuring,
      totalMb: gpu && typeof gpu.totalMb === "number" ? gpu.totalMb : null,
      vramBudgetMb: plan.capacity.vramBudgetMb,
      gpuSlots: plan.capacity.gpuSlots,
      cpuSlots: plan.capacity.cpuSlots,
    },
  });

  const file = appendMetric(metric, mooterHome());

  if (asJson) {
    console.log(JSON.stringify(metric, null, 2));
    return;
  }
  console.log("🐂 Overclock Moo — Fase 2 (overlap, idle-fill, $0)");
  console.log(`   plan: ${plan.reason}`);
  for (const line of honestSummaryLines(metric)) console.log("   " + line);
  console.log(`   ledger: ${file}`);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

main().catch((e) => {
  console.error("runner error:", e?.message || e);
  process.exit(1);
});
