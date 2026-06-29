// overclock-fill.mjs — Node-pure idle-GPU reclaimer for the 🔥 Overclock Moo button.
//
// WHY THIS FILE EXISTS (the audit fix):
//   The cockpit button used to `spawn tsx packages/overclock-moo/src/runner.mjs`.
//   That runner imports `.ts` engine files (allocator.ts, metrics.ts, …) so it
//   NEEDS tsx — and tsx ships in neither the .vsix nor the user's PATH. Installed,
//   the button silently failed. This file is the runner the button can actually
//   launch: ZERO `.ts` imports, only Node built-ins + global fetch, so it runs on
//   the editor's bundled `process.execPath` and travels INSIDE the .vsix.
//
// WHAT IT DOES (honest idle-fill, never-OOM, $0):
//   warm-up (load the resident model) → estimate capacity from free VRAM
//   (hard-capped, KV-cache safe) → saturate N concurrent local moos in a bounded
//   pool → sample nvidia-smi during the run (peak util reached) → stop on idle,
//   round/time budget, or a thermal/VRAM guard → write the honest Fase-2 metric.
//
// HONESTY MANDATE (mirrors metrics.ts, kept verbatim where it matters):
//   • The probe work is SYNTHETIC keep-warm generation, so humanMinutesRecovered
//     is NOT counted (probe, never a stopwatch of unblocked human work).
//   • cloudUsdAvoided is a counterfactual on MEASURED tokens × the FROZEN cheapest
//     cloud tier (Haiku), labelled "est" — a lower bound, never inflated.
//   • throughputX is n/d here (no A/B baseline in the button path).
//   • Missing data is null → rendered "n/d", never a fabricated number.
//
// Run (what the button does):  node overclock-fill.mjs --idle-fill
// Other flags: --json (print metric), --dry-run (capacity only), --rounds N,
//              --budget-sec N.

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ── Honest constants (kept identical in spirit to metrics.ts) ────────────────
export const NA = "n/d";
export const METR_CAVEAT =
  "Estimate of human-equivalent work unblocked, NOT a stopwatch measurement. " +
  "METR 2026: AI can slow experienced devs (-20%..+100% depending on context).";
export const THROUGHPUT_NOTE =
  "secondary metric; ~1x local on dense models (RTX 4090 saturates single-stream) — never the headline";

// FROZEN cheapest-cloud tier, copied from data/pricing-snapshot-2026-05-27.json
// (claude-haiku-4-5: $1 / $5 per Mtok). Inlined because that snapshot lives at the
// repo root and does NOT ship in the .vsix. Pricing a counterfactual at the
// cheapest tier keeps the "cloud avoided" figure a conservative lower bound.
export const HAIKU_FROZEN = { tier: "claude-haiku-4-5", inputPerMtok: 1, outputPerMtok: 5 };

// Hard caps — the slot cap is a GUARANTEE the bounded pool never exceeds, so the
// idle GPU is reclaimed but NEVER driven to OOM.
const HARD_MAX_SLOTS = 6;        // KV-cache safety ceiling for a single 24GB card
const PER_SLOT_MB = 1200;        // conservative VRAM headroom assumed per concurrent slot
const VRAM_HEADROOM = 0.85;      // only plan against 85% of free VRAM (leave slack)
const VRAM_GUARD_FRAC = 0.85;    // stop if used > 85% of total
const TEMP_GUARD_C = 84;         // stop if GPU temp > 84°C
const TEMP_COMFORT_C = 80;       // halve concurrency above 80°C
const DEFAULT_ROUNDS = 8;        // bounded rounds so the button always terminates
const DEFAULT_BUDGET_SEC = 25;   // wall-clock budget for the whole fill
const NUM_PREDICT = 120;         // tokens per probe (matches runner.mjs)

const OLLAMA = (process.env.OLLAMA_HOST?.replace(/\/$/, "")) || "http://127.0.0.1:11434";

function mooterHome() {
  return process.env.MOOTER_HOME || join(homedir(), ".mooter");
}

// ── nvidia-smi helpers (all return null on absence — never fabricate) ─────────
function smi(query) {
  const r = spawnSync("nvidia-smi", [`--query-gpu=${query}`, "--format=csv,noheader,nounits"], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.trim();
}

/** Average GPU utilisation now (%), or null. */
export function queryUtilNow() {
  const out = smi("utilization.gpu");
  if (!out) return null;
  const vals = out.split("\n").map((s) => parseInt(s, 10)).filter(Number.isFinite);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

/** { tempC, usedMb, totalMb } — any field null when unreadable. */
export function readGpuStatus() {
  const out = smi("temperature.gpu,memory.used,memory.total");
  if (out) {
    const parts = (out.split("\n")[0] || "").split(",").map((s) => parseInt(s.trim(), 10));
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      return { tempC: parts[0], usedMb: parts[1], totalMb: parts[2] };
    }
  }
  return { tempC: null, usedMb: null, totalMb: null };
}

/**
 * Estimate concurrent GPU slots from free VRAM. HONEST + SAFE:
 *   • free VRAM unknown → conservative default of 2 (never 0, never OOM).
 *   • otherwise floor(freeBudget / perSlot), clamped to [1, HARD_MAX_SLOTS].
 * Returns { gpuSlots, basis } where basis explains the number ("n/d" when guessed).
 */
export function estimateCapacity(status = readGpuStatus()) {
  const { usedMb, totalMb } = status;
  if (usedMb === null || totalMb === null || totalMb <= 0) {
    return { gpuSlots: 2, freeMb: null, basis: "vram n/d → conservative default" };
  }
  const freeMb = Math.max(0, totalMb - usedMb);
  const budget = freeMb * VRAM_HEADROOM;
  const slots = Math.max(1, Math.min(HARD_MAX_SLOTS, Math.floor(budget / PER_SLOT_MB)));
  return { gpuSlots: slots, freeMb, basis: `floor(${Math.round(budget)}MB / ${PER_SLOT_MB}MB), cap ${HARD_MAX_SLOTS}` };
}

// ── Ollama helpers ───────────────────────────────────────────────────────────
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

export function pickModel(models) {
  if (!models.length) return null;
  const pref = ["qwen2.5-coder", "qwen3", "qwen2.5", "llama3", "gemma"];
  for (const p of pref) {
    const hit = models.find((m) => m.toLowerCase().includes(p));
    if (hit) return hit;
  }
  return models[0];
}

/** One real generate call; tokens are REAL eval counts. Gate = non-empty draft. */
async function runProbe(model, prompt) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false, think: false, options: { num_predict: NUM_PREDICT } }),
      signal: AbortSignal.timeout(120_000),
    });
    const wallSeconds = round1((Date.now() - t0) / 1000);
    if (!res.ok) return { wallSeconds, gatePassed: false, skipped: `ollama-http-${res.status}`, promptTokens: null, evalTokens: null };
    const j = await res.json();
    const text = String(j.response || "").trim();
    const promptTokens = typeof j.prompt_eval_count === "number" ? j.prompt_eval_count : null;
    const evalTokens = typeof j.eval_count === "number" ? j.eval_count : null;
    return { wallSeconds, gatePassed: text.length > 0, promptTokens, evalTokens };
  } catch {
    return { wallSeconds: round1((Date.now() - t0) / 1000), gatePassed: false, skipped: "ollama-unavailable", promptTokens: null, evalTokens: null };
  }
}

/** Counterfactual USD for measured tokens at the FROZEN Haiku tier. null = n/d. */
export function cloudUsdAvoided(promptTokens, evalTokens) {
  if (promptTokens == null && evalTokens == null) return null;
  const usd = ((promptTokens ?? 0) * HAIKU_FROZEN.inputPerMtok + (evalTokens ?? 0) * HAIKU_FROZEN.outputPerMtok) / 1e6;
  return usd > 0 ? Math.round(usd * 1e4) / 1e4 : null;
}

// ── Bounded pool (hard slot cap — never OOM) ─────────────────────────────────
async function runBoundedPool(jobs, width, runJob) {
  if (width <= 0 || !jobs.length) return { results: [], peak: 0 };
  const results = new Array(jobs.length);
  let inFlight = 0, peak = 0, nextIdx = 0;
  async function worker() {
    while (true) {
      while (inFlight >= width) await new Promise((r) => setTimeout(r, 25));
      const idx = nextIdx++;
      if (idx >= jobs.length) break;
      inFlight++;
      if (inFlight > peak) peak = inFlight;
      try { results[idx] = await runJob(jobs[idx]); }
      finally { inFlight--; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, worker));
  return { results, peak };
}

/** GPU util sampler: polls nvidia-smi ~250ms while fn runs; returns peak util. */
async function withUtilSampling(fn) {
  const samples = [];
  let live = true;
  const sampler = (async () => {
    while (live) {
      const u = queryUtilNow();
      if (u !== null) samples.push(u);
      await new Promise((r) => setTimeout(r, 250));
    }
  })();
  const result = await fn();
  live = false;
  await new Promise((r) => setTimeout(r, 300));
  await sampler;
  return { result, utilMax: samples.length ? Math.max(...samples) : null };
}

// ── Honest summary (synthetic-probe aware) ───────────────────────────────────
/**
 * Fold probe results into the Fase-2 honest schema. Synthetic probes recover NO
 * human work, so humanMinutesRecovered is fixed at 0 AND flagged not-applicable
 * (the card renders it "n/d — probe, never counted"). cloudUsdAvoided is the only
 * estimate, and it is keyed strictly to MEASURED tokens.
 */
export function summarizeFill(results, ctx) {
  let gatePass = 0, gateFail = 0, skipped = 0, gpuSeconds = 0;
  let tokens = 0, tokensSeen = false, cloudSum = 0, cloudSeen = false;
  for (const r of results) {
    if (r.skipped) { skipped++; continue; }
    if (r.gatePassed) gatePass++; else gateFail++;
    gpuSeconds += r.wallSeconds || 0;
    const tok = (r.promptTokens ?? 0) + (r.evalTokens ?? 0);
    if (r.promptTokens != null || r.evalTokens != null) { tokens += tok; tokensSeen = true; }
    const c = cloudUsdAvoided(r.promptTokens, r.evalTokens);
    if (typeof c === "number") { cloudSum += c; cloudSeen = true; }
  }
  const jobsRun = gatePass + gateFail;
  return {
    at: ctx.at,
    project: ctx.project,
    baseModel: ctx.baseModel,
    source: "idle-fill-button",
    gpu: ctx.gpu,
    measured: {
      jobsRun,
      gatePass,
      gateFail,
      skipped,
      gpuSecondsReclaimed: round1(gpuSeconds),
      gpuSecondsBusy: round1(gpuSeconds),
      localTokens: tokensSeen ? tokens : null,
      usd: 0,
      cloudUsdAvoided: cloudSeen ? Math.round(cloudSum * 1e4) / 1e4 : null,
    },
    estimated: {
      humanMinutesRecovered: 0,        // synthetic probe → zero, by construction
      humanTimeApplicable: false,      // → card shows "n/d — probe, never counted"
      caveat: METR_CAVEAT,
    },
    quality: {
      passRate: jobsRun > 0 ? Math.round((gatePass / jobsRun) * 100) / 100 : null,
      regressions: gateFail,
    },
    secondary: { throughputX: null, note: THROUGHPUT_NOTE },
  };
}

/** Clean, n/d-safe card lines for the cockpit / stdout. Never prints NaN/undefined. */
export function renderFillCard(m) {
  const nd = (v, suf = "") => (v === null || v === undefined ? NA : `${v}${suf}`);
  const g = m.gpu || {};
  const util = g.utilBefore == null
    ? NA
    : `${g.utilBefore}%${g.utilDuring == null ? "" : `→${g.utilDuring}%`}${g.utilAfter == null ? "" : ` (after ${g.utilAfter}%)`}`;
  const human = m.estimated && m.estimated.humanTimeApplicable === false
    ? `${NA} — probe sintético, nunca contado`
    : `~${m.estimated ? m.estimated.humanMinutesRecovered : NA} human-min`;
  return [
    `🔥 Overclock Moo — idle-fill ($0 local)`,
    `slots ${nd(g.gpuSlots)} (cap ${HARD_MAX_SLOTS}) · ${g.tempC == null ? "" : `${g.tempC}°C · `}util ${util}`,
    `jobs ${nd(m.measured.jobsRun)} (pass ${nd(m.measured.gatePass)} / fail ${nd(m.measured.gateFail)}, skip ${nd(m.measured.skipped)}) · pass-rate ${m.quality.passRate == null ? NA : Math.round(m.quality.passRate * 100) + "%"}`,
    `GPU busy ${nd(m.measured.gpuSecondsBusy, "s")} · tokens ${nd(m.measured.localTokens)} · ~$${nd(m.measured.cloudUsdAvoided)} cloud avoided (est, Haiku frozen) · $0 local`,
    `human time ${human}`,
    `throughput ${nd(m.secondary.throughputX, "×")} — ${m.secondary.note}`,
  ];
}

export function metricsPath(homeOverride) {
  const home = homeOverride || mooterHome();
  return join(home, "cache", "overclock-metrics.jsonl");
}

export function appendMetric(metric, homeOverride) {
  const file = metricsPath(homeOverride);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(metric) + "\n", "utf8");
  return file;
}

function round1(n) { return Math.round(n * 10) / 10; }

// ── Main idle-fill loop (bounded, guarded, honest) ───────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const dryRun = args.includes("--dry-run");
  const rounds = numArg(args, "--rounds", DEFAULT_ROUNDS);
  const budgetSec = numArg(args, "--budget-sec", DEFAULT_BUDGET_SEC);

  const status0 = readGpuStatus();
  const cap = estimateCapacity(status0);
  const utilBefore = queryUtilNow();

  if (dryRun) {
    console.log(JSON.stringify({ capacity: cap, utilBefore, status0 }, null, 2));
    return;
  }

  const models = await ollamaModels();
  const model = pickModel(models);
  const baseModel = model || "n/d";

  // Warm-up: load the resident model (one small generate). Skipped honestly if no model.
  if (model) {
    await runProbe(model, "ok").catch(() => {});
  }

  // Synthetic keep-warm prompt (deterministic, real tokens). Not human work.
  const probePrompt =
    "Write one concise conventional-commit subject line (max 72 chars, no body) " +
    "for a small refactor that extracts a helper function. Output only the line.";

  const deadline = Date.now() + budgetSec * 1000;
  const all = [];
  const { utilMax } = await withUtilSampling(async () => {
    for (let round = 1; round <= rounds; round++) {
      if (Date.now() >= deadline) break;
      // Guard: stop on thermal / VRAM pressure (never on a fabricated reading).
      const st = readGpuStatus();
      if (st.tempC !== null && st.tempC > TEMP_GUARD_C) break;
      if (st.usedMb !== null && st.totalMb !== null && st.totalMb > 0 && st.usedMb / st.totalMb > VRAM_GUARD_FRAC) break;
      // Thermal comfort: halve concurrency above 80°C (floor 1).
      let width = cap.gpuSlots;
      if (st.tempC !== null && st.tempC > TEMP_COMFORT_C) width = Math.max(1, Math.floor(width / 2));
      // No model → nothing to run; stop honestly rather than spin on air.
      if (!model) break;
      const jobs = Array.from({ length: width }, (_, i) => ({ id: `probe:r${round}:${i}` }));
      const { results } = await runBoundedPool(jobs, width, () => runProbe(model, probePrompt));
      all.push(...results.filter(Boolean));
    }
  });

  const utilAfter = queryUtilNow();
  const stEnd = readGpuStatus();
  const metric = summarizeFill(all, {
    at: Date.now(),
    project: null,
    baseModel,
    gpu: {
      utilBefore,
      utilDuring: utilMax,
      utilAfter,
      tempC: stEnd.tempC,
      totalMb: status0.totalMb,
      gpuSlots: cap.gpuSlots,
    },
  });

  const file = appendMetric(metric, mooterHome());
  if (asJson) { console.log(JSON.stringify(metric, null, 2)); return; }
  for (const line of renderFillCard(metric)) console.log("   " + line);
  console.log(`   ledger: ${file}`);
}

function numArg(args, flag, dflt) {
  const i = args.indexOf(flag);
  if (i < 0) return dflt;
  const v = parseInt(args[i + 1], 10);
  return Number.isFinite(v) ? v : dflt;
}

// Run only when invoked as a script (so the test can import without side effects).
const invokedDirectly = (() => {
  try {
    const here = new URL(import.meta.url).pathname;
    const argv1 = (process.argv[1] || "").replace(/\\/g, "/");
    return here.endsWith(argv1.split("/").pop() || " ") || argv1.endsWith("overclock-fill.mjs");
  } catch { return false; }
})();
if (invokedDirectly) {
  main().catch((e) => { console.error("overclock-fill error:", e?.message || e); process.exit(1); });
}
