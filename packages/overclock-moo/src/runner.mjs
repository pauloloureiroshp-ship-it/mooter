// runner.mjs — local $0 executor for an Overclock Moo plan.
//
// Pipeline: read the live GPU slice (cache) → discover REAL pending work →
// planAllocation() → run each job's DETERMINISTIC gate locally ($0), measuring
// wall-clock + pass/fail → write the honest metric. GPU LLM jobs run only when
// Ollama is up (else honest skip, never a fabricated result). Tokens come from
// the Ollama API's real eval counts; nothing is invented.
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
    return { wallSeconds, skipped: "tool-unavailable", gatePassed: false, localTokens: null };
  }
  return { wallSeconds, gatePassed: r.status === 0, localTokens: null };
}

/** Run a GPU LLM job via the Ollama API; tokens are REAL eval counts. */
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
    if (!res.ok) return { wallSeconds, skipped: `ollama-http-${res.status}`, gatePassed: false, localTokens: null };
    const j = await res.json();
    const text = String(j.response || "").trim();
    const localTokens = (j.prompt_eval_count || 0) + (j.eval_count || 0) || null;
    // Deterministic gate: the draft must be non-empty (a real artifact produced).
    return { wallSeconds, gatePassed: text.length > 0, localTokens, runtimeModel: model, artifact: text };
  } catch (e) {
    const wallSeconds = (Date.now() - t0) / 1000;
    return { wallSeconds, skipped: "ollama-unavailable", gatePassed: false, localTokens: null };
  }
}

function gitDiffStat(root) {
  const r = spawnSync("git", ["-C", root, "diff", "--stat", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().slice(-1500) : "";
}

async function main() {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const dryRun = args.includes("--dry-run");
  const asJson = args.includes("--json");
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

  // ── Execute the plan, measuring honestly ──────────────────────────────────
  const utilBefore = gpu && typeof gpu.utilPct === "number" ? gpu.utilPct : null;
  const results = [];
  for (const job of plan.jobs) {
    const base = { id: job.id, kind: job.kind, category: job.category, model: job.pick.model, runtimeBase: plan.baseModel, resource: job.resource, gate: job.gate, humanMinutesEst: job.humanMinutes, usd: 0 };
    if (job.resource === "cpu") {
      const r = runCpuGate(job);
      results.push({ ...base, wallSeconds: round1(r.wallSeconds), gatePassed: r.gatePassed, localTokens: r.localTokens, ...(r.skipped ? { skipped: r.skipped } : {}) });
    } else {
      if (!ollamaModel) {
        results.push({ ...base, wallSeconds: 0, gatePassed: false, localTokens: null, skipped: "ollama-unavailable" });
        continue;
      }
      const prompt = `Write a single concise conventional-commit subject line (max 72 chars, no body) for this diff. Output only the line.\n\n${diff}`;
      const r = await runGpuLlmJob(job, ollamaModel, prompt);
      results.push({ ...base, runtimeBase: r.runtimeModel || ollamaModel, wallSeconds: round1(r.wallSeconds), gatePassed: r.gatePassed, localTokens: r.localTokens, ...(r.skipped ? { skipped: r.skipped } : {}) });
    }
  }

  const utilAfter = queryUtilNow();
  const metric = summarize(results, {
    at: Date.now(),
    project: snapshot.project,
    baseModel: plan.baseModel,
    gpu: {
      utilBefore,
      utilAfter,
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
  console.log("🐂 Overclock Moo — Fase 1 (batch, local, $0)");
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
