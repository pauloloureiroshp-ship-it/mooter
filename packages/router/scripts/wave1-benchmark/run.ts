#!/usr/bin/env -S npx tsx
// run.ts — Wave 1 Pastor benchmark orchestrator (Fase E).
//
// Invokes 3 arms over the 34 pre-registered prompts, runs deterministic checks,
// blind-judges, back-fills judge scores + mis-routing diagnostics, then writes
// JSONL + Parquet + SUMMARY + queries.sql + data-lake compaction. Cost-monitored
// (loud every 5 prompts; $30 info, $80 hard stop). Schema-validates every row.
//
// Usage:
//   tsx run.ts                 full run (34 × 3) → outputs/
//   tsx run.ts --limit 1       dry-run (P001 × 3 + judge) → outputs/dry-run/
//   tsx run.ts --skip-judge    invocation only

import { readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPastor } from "./lib/arm-pastor.ts";
import { runBaseline } from "./lib/arm-baseline.ts";
import { runGold } from "./lib/arm-gold.ts";
import { runDeterministicCheck } from "./lib/deterministic-checks.ts";
import { judgePrompt, type JudgeArmOutput } from "./lib/judge.ts";
import { buildLineageBase, makeLineage, eventId, type LineageBase } from "./lib/lineage.ts";
import { costMicros, microsToUsd, pricingVersion } from "./lib/pricing.ts";
import { JUDGE_MODEL, tierIdx } from "./lib/models.ts";
import { emitEvent, writeJsonl, readJsonl, dataLakeEventsPath } from "./lib/event-emitter.ts";
import { writeEventsParquet, writeParquet } from "./lib/parquet-write.ts";
import { buildSummary, summaryArmRows } from "./lib/summary.ts";
import { compositeQuality, type Arm, type BenchEvent, type JudgeLogRow, type PromptSpec } from "./lib/types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const LAKE_DATE = "2026-05-27";
const COST_INFO_USD = 30;
const COST_HARD_USD = 80;
const WOULD_HELP_DELTA = 0.15; // quality gap (gold − pastor) that flags would_higher_tier_help
const N_JUDGE_REPEATS = 5; // §4.6 sanity-check repeats

const ARMS: Arm[] = ["A", "B", "C"];
const log = (m: string): void => process.stdout.write(m + "\n");

interface Args { limit: number | null; skipJudge: boolean; outDir: string; }
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const limitFlag = a.includes("--limit") ? Number(a[a.indexOf("--limit") + 1]) : a.includes("--dry-run") ? 1 : null;
  const skipJudge = a.includes("--skip-judge");
  const outDir = limitFlag === 1 ? join(HERE, "outputs", "dry-run") : join(HERE, "outputs");
  return { limit: limitFlag, skipJudge, outDir };
}

function loadPrompts(limit: number | null): PromptSpec[] {
  const lines = readFileSync(join(HERE, "prompts.jsonl"), "utf8").split("\n").filter((l) => l.trim());
  const all = lines.map((l) => JSON.parse(l) as PromptSpec);
  return limit ? all.slice(0, limit) : all;
}

async function runArm(arm: Arm, prompt: string) {
  if (arm === "A") return runPastor(prompt);
  if (arm === "B") return runBaseline(prompt);
  return runGold(prompt);
}

function buildEvent(p: PromptSpec, arm: Arm, base: LineageBase, inv: Awaited<ReturnType<typeof runArm>>): BenchEvent {
  const id = eventId(base.run_id, p.id, arm);
  const det = runDeterministicCheck(p.correctness_check, inv.response);
  const cost = costMicros(inv.model_used, inv.tokens_input, inv.tokens_output);
  return {
    event_id: id, schema_version: "1.0.0", event_type: "bench",
    lineage: makeLineage(base, id),
    prompt_id: p.id, arm, block: p.block, expected_pack: p.expected_pack, expected_tier_floor: p.expected_tier_floor,
    model_used: inv.model_used, tier_routed: inv.tier_routed, pack_routed: inv.pack_routed, pack_confidence: inv.pack_confidence,
    latency_classifier_ms: inv.latency_classifier_ms, latency_llm_ms: inv.latency_llm_ms, latency_total_ms: inv.latency_total_ms,
    tokens_input: inv.tokens_input, tokens_output: inv.tokens_output, tokens_total: inv.tokens_input + inv.tokens_output,
    cost_micros: cost, response: inv.response,
    judge_scores: null, quality_score: null, judge_run_id: null, judge_seed_position: null,
    pack_correct: null, tier_appropriate: null, would_higher_tier_help: null,
    deterministic: det, status: inv.status, error: inv.error,
    timestamp: new Date().toISOString(),
  };
}

function flattenJudgeRows(jr: JudgeLogRow): Record<string, unknown>[] {
  return ARMS.map((arm) => {
    const pos = Object.entries(jr.position_to_arm).find(([, a]) => a === arm)?.[0] ?? "0";
    const s = jr.scores_by_position[pos];
    return {
      judge_event_id: jr.judge_event_id, run_id: jr.lineage.run_id, prompt_id: jr.prompt_id,
      judge_model: jr.judge_model, is_repeat: jr.is_repeat, seed: jr.seed, arm, position: Number(pos),
      correctness: s?.correctness ?? null, completeness: s?.completeness ?? null,
      relevance: s?.relevance ?? null, actionability: s?.actionability ?? null, hallucination: s?.hallucination ?? null,
      output_length: jr.length_by_position[pos] ?? 0,
    };
  });
}

const JUDGE_PARQUET_SCHEMA: Record<string, unknown> = {
  judge_event_id: { type: "UTF8" }, run_id: { type: "UTF8" }, prompt_id: { type: "UTF8" },
  judge_model: { type: "UTF8" }, is_repeat: { type: "BOOLEAN" }, seed: { type: "INT64" },
  arm: { type: "UTF8" }, position: { type: "INT64" },
  correctness: { type: "DOUBLE", optional: true }, completeness: { type: "INT64", optional: true },
  relevance: { type: "INT64", optional: true }, actionability: { type: "INT64", optional: true },
  hallucination: { type: "INT64", optional: true }, output_length: { type: "INT64" },
};

const SUMMARY_PARQUET_SCHEMA: Record<string, unknown> = {
  run_id: { type: "UTF8" }, arm: { type: "UTF8" }, n: { type: "INT64" }, n_ok: { type: "INT64" },
  mean_quality: { type: "DOUBLE" }, ci_low: { type: "DOUBLE" }, ci_high: { type: "DOUBLE" },
  mean_cost_usd: { type: "DOUBLE" }, total_cost_usd: { type: "DOUBLE" },
  mean_latency_ms: { type: "DOUBLE" }, mean_tokens_total: { type: "DOUBLE" },
};

const QUERIES_SQL = `-- Wave 1 Pastor benchmark — pre-canned DuckDB queries.
-- Run: duckdb -c ".read queries.sql"  (from the outputs/ dir)

-- Q1: cost + quality + latency per arm
SELECT arm, COUNT(*) n, ROUND(AVG(quality_score),3) mean_quality,
       ROUND(SUM(cost_micros)/1e6,4) total_cost_usd, ROUND(AVG(latency_total_ms)) mean_latency_ms
FROM 'RAW_RESULTS.parquet' GROUP BY arm ORDER BY arm;

-- Q2: Pastor (arm A) quality by pack
SELECT pack_routed, COUNT(*) n, ROUND(AVG(quality_score),3) mean_quality, ROUND(AVG(cost_micros)/1e6,5) mean_cost_usd
FROM 'RAW_RESULTS.parquet' WHERE arm='A' GROUP BY pack_routed ORDER BY n DESC;

-- Q3: mis-routing — routed vs expected pack (arm A)
SELECT expected_pack, pack_routed, COUNT(*) n
FROM 'RAW_RESULTS.parquet' WHERE arm='A' GROUP BY expected_pack, pack_routed ORDER BY n DESC;

-- Q4: tier distribution of Pastor + mean quality per tier
SELECT tier_routed, COUNT(*) n, ROUND(AVG(quality_score),3) mean_quality, ROUND(AVG(cost_micros)/1e6,5) mean_cost_usd
FROM 'RAW_RESULTS.parquet' WHERE arm='A' GROUP BY tier_routed ORDER BY tier_routed;

-- Q5: cost savings — Pastor vs baseline (B) vs gold (C)
SELECT
  ROUND(SUM(CASE WHEN arm='A' THEN cost_micros END)/1e6,4) pastor_usd,
  ROUND(SUM(CASE WHEN arm='B' THEN cost_micros END)/1e6,4) baseline_usd,
  ROUND(SUM(CASE WHEN arm='C' THEN cost_micros END)/1e6,4) gold_usd,
  ROUND(1 - SUM(CASE WHEN arm='A' THEN cost_micros END)*1.0/SUM(CASE WHEN arm='B' THEN cost_micros END),3) savings_vs_baseline,
  ROUND(1 - SUM(CASE WHEN arm='A' THEN cost_micros END)*1.0/SUM(CASE WHEN arm='C' THEN cost_micros END),3) savings_vs_gold
FROM 'RAW_RESULTS.parquet';

-- Q6: quality per dimension by arm (judge log, base runs only)
SELECT arm, ROUND(AVG(correctness),3) correctness, ROUND(AVG(completeness),2) completeness,
       ROUND(AVG(relevance),2) relevance, ROUND(AVG(actionability),2) actionability, ROUND(AVG(hallucination),3) hallucination
FROM 'JUDGE_LOG.parquet' WHERE is_repeat=false GROUP BY arm ORDER BY arm;

-- Q7: latency distribution per arm
SELECT arm, ROUND(MIN(latency_total_ms)) min_ms, ROUND(MEDIAN(latency_total_ms)) p50_ms,
       ROUND(QUANTILE_CONT(latency_total_ms,0.95)) p95_ms, ROUND(MAX(latency_total_ms)) max_ms
FROM 'RAW_RESULTS.parquet' GROUP BY arm ORDER BY arm;

-- Q8: where would a higher tier have helped? (arm A)
SELECT prompt_id, block, tier_routed, pack_routed, ROUND(quality_score,3) q_pastor
FROM 'RAW_RESULTS.parquet' WHERE arm='A' AND would_higher_tier_help GROUP BY ALL ORDER BY prompt_id;

-- Q9: hallucination incidents by arm
SELECT arm, SUM(CASE WHEN hallucination=1 THEN 1 ELSE 0 END) hallucinated, COUNT(*) n
FROM 'JUDGE_LOG.parquet' WHERE is_repeat=false GROUP BY arm ORDER BY arm;

-- Q10: per-prompt quality across arms (paired view)
SELECT prompt_id, block,
  MAX(CASE WHEN arm='A' THEN quality_score END) q_pastor,
  MAX(CASE WHEN arm='B' THEN quality_score END) q_baseline,
  MAX(CASE WHEN arm='C' THEN quality_score END) q_gold
FROM 'RAW_RESULTS.parquet' GROUP BY prompt_id, block ORDER BY prompt_id;
`;

/** Warm-tier compaction: hot JSONL → daily Parquet → latest.parquet symlink (§15.3). */
async function compactDataLake(): Promise<void> {
  const lake = readJsonl<BenchEvent>(dataLakeEventsPath(LAKE_DATE));
  if (lake.length === 0) return;
  const parquetDir = join(homedir(), ".mooter", "cache", "parquet");
  mkdirSync(parquetDir, { recursive: true });
  const datePath = join(parquetDir, `${LAKE_DATE}.parquet`);
  await writeEventsParquet(lake, datePath);
  const latest = join(parquetDir, "latest.parquet");
  try { if (existsSync(latest)) rmSync(latest); symlinkSync(datePath, latest); } catch { /* symlink optional */ }
}

async function main(): Promise<void> {
  const args = parseArgs();
  mkdirSync(args.outDir, { recursive: true });
  const prompts = loadPrompts(args.limit);
  const base = buildLineageBase({ pricingVersion: pricingVersion(), ollamaHost: process.env.OLLAMA_HOST || "http://host.docker.internal:11434" });

  const rawPath = join(args.outDir, "RAW_RESULTS.jsonl");
  // fresh start for this run's RAW file (data lake is append-only across runs)
  writeFileSync(rawPath, "");

  log(`▶ run_id=${base.run_id}`);
  log(`  prompts=${prompts.length} arms=3 judge=${args.skipJudge ? "off" : "on"} out=${args.outDir}`);
  log(`  pinned: ${base.pastor_version} @ ${base.commit_sha} · pricing=${base.pricing_version} · ollama=${base.ollama_version} · sdk=${base.anthropic_sdk_version}`);

  const events: BenchEvent[] = [];
  let costMicrosAcc = 0;
  let infoFired = false;

  // --- invocation phase ---
  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    for (const arm of ARMS) {
      const inv = await runArm(arm, p.prompt);
      const ev = buildEvent(p, arm, base, inv);
      emitEvent(rawPath, ev, LAKE_DATE);
      events.push(ev);
      costMicrosAcc += ev.cost_micros;
      if (inv.status === "failed") log(`  ⚠ ${p.id}/${arm} FAILED: ${inv.error}`);
    }
    if ((i + 1) % 5 === 0 || i === prompts.length - 1) {
      log(`  [${i + 1}/${prompts.length}] running cost ≈ $${microsToUsd(costMicrosAcc).toFixed(4)}`);
    }
    const usd = microsToUsd(costMicrosAcc);
    if (!infoFired && usd >= COST_INFO_USD) { infoFired = true; log(`  ⓘ cost passed $${COST_INFO_USD} (est $50). Continuing.`); }
    if (usd >= COST_HARD_USD) {
      log(`  ⛔ HARD STOP — cost $${usd.toFixed(2)} ≥ $${COST_HARD_USD}. Wrote ${events.length} rows. Aborting before more spend.`);
      writeJsonl(rawPath, events);
      process.exit(3);
    }
  }
  log(`  invocation done · ${events.length} rows · $${microsToUsd(costMicrosAcc).toFixed(4)}`);

  // --- judging phase ---
  const judgeRows: JudgeLogRow[] = [];
  const judgeRunId = `${base.run_id}-judge`;
  if (!args.skipJudge) {
    const eventsByPrompt = new Map<string, BenchEvent[]>();
    for (const e of events) { const a = eventsByPrompt.get(e.prompt_id) ?? []; a.push(e); eventsByPrompt.set(e.prompt_id, a); }

    const judgeOne = async (p: PromptSpec, isRepeat: boolean): Promise<void> => {
      const evs = eventsByPrompt.get(p.id) ?? [];
      const outputs: JudgeArmOutput[] = evs.map((e) => ({ arm: e.arm, response: e.response }));
      const res = await judgePrompt(p.id, p.prompt, outputs, isRepeat ? 0x5eed : 0);
      costMicrosAcc += res.cost_micros;
      const jid = `${base.run_id}-${p.id}-judge${isRepeat ? "-r" : ""}`;
      judgeRows.push({
        judge_event_id: jid, schema_version: "1.0.0", event_type: "judge",
        lineage: makeLineage(base, jid), prompt_id: p.id, judge_model: JUDGE_MODEL, judge_run_id: judgeRunId,
        is_repeat: isRepeat, seed: res.seed, position_to_arm: res.positionToArm,
        scores_by_position: res.scoresByPosition, length_by_position: res.lengthByPosition,
        raw_judge_response: res.raw, latency_ms: res.latency_ms,
        tokens_input: res.tokens_input, tokens_output: res.tokens_output, cost_micros: res.cost_micros,
        timestamp: new Date().toISOString(),
      });
      if (isRepeat) return;
      if (!res.parse_ok) log(`  ⚠ judge parse failed for ${p.id} — neutral scores used`);
      // back-fill scores into the arm events
      for (const e of evs) {
        const qs = { ...res.scoresByArm[e.arm] };
        // deterministic correctness overrides the judge where it ran (§3.2)
        if (e.deterministic?.ran && e.deterministic.passed !== null) qs.correctness = e.deterministic.passed ? 1.0 : 0.0;
        e.judge_scores = qs;
        e.quality_score = compositeQuality(qs);
        e.judge_run_id = judgeRunId;
        e.judge_seed_position = Number(Object.entries(res.positionToArm).find(([, a]) => a === e.arm)?.[0] ?? 0);
      }
    };

    for (const p of prompts) await judgeOne(p, false);
    for (const p of prompts.slice(0, Math.min(N_JUDGE_REPEATS, prompts.length))) await judgeOne(p, true);

    // --- mis-routing diagnostics (need cross-arm quality) ---
    for (const [, evs] of eventsByPrompt) {
      const a = evs.find((e) => e.arm === "A");
      const c = evs.find((e) => e.arm === "C");
      if (!a) continue;
      const specific = a.expected_pack !== "AMBIGUOUS" && a.expected_pack !== "GENERAL";
      a.pack_correct = specific ? a.pack_routed === a.expected_pack : null;
      a.tier_appropriate = a.tier_routed ? tierIdx(a.tier_routed) >= tierIdx(a.expected_tier_floor) : null;
      const qa = a.quality_score ?? 0;
      const qc = c?.quality_score ?? qa;
      a.would_higher_tier_help = a.tier_routed ? tierIdx(a.tier_routed) < tierIdx("T3") && qc - qa > WOULD_HELP_DELTA : null;
    }
  }

  // --- persist everything ---
  writeJsonl(rawPath, events); // rewrite with back-filled scores
  const baseJudge = judgeRows.filter((j) => !j.is_repeat);
  const repeatJudge = judgeRows.filter((j) => j.is_repeat);
  writeJsonl(join(args.outDir, "JUDGE_LOG.jsonl"), judgeRows);

  const summary = buildSummary(base.run_id, events, baseJudge, repeatJudge);
  writeFileSync(join(args.outDir, "SUMMARY.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(args.outDir, "lineage-snapshot.json"), JSON.stringify(base, null, 2));
  writeFileSync(join(args.outDir, "queries.sql"), QUERIES_SQL);

  await writeEventsParquet(events, join(args.outDir, "RAW_RESULTS.parquet"));
  await writeParquet(JUDGE_PARQUET_SCHEMA, judgeRows.flatMap(flattenJudgeRows), join(args.outDir, "JUDGE_LOG.parquet"));
  await writeParquet(SUMMARY_PARQUET_SCHEMA, summaryArmRows(summary), join(args.outDir, "SUMMARY.parquet"));

  // data lake warm-tier compaction
  await compactDataLake();

  // --- final report (facts only) ---
  const pa = (summary.per_arm as Record<string, { mean_quality: number; mean_cost_usd: number; mean_latency_ms: number }>);
  log(`\n✅ done · run_id=${base.run_id}`);
  log(`  total cost ≈ $${microsToUsd(costMicrosAcc).toFixed(4)} · rows=${events.length} · judge_calls=${judgeRows.length}`);
  for (const arm of ARMS) log(`  arm ${arm}: quality=${pa[arm].mean_quality.toFixed(3)} cost=$${pa[arm].mean_cost_usd.toFixed(5)} latency=${Math.round(pa[arm].mean_latency_ms)}ms`);
  const rel = summary.judge_reliability as { repeat_variance_mean: number; alert_triggered: boolean };
  log(`  judge variance=${rel.repeat_variance_mean.toFixed(3)} alert=${rel.alert_triggered}`);
  log("  Hub upload skipped — endpoint /api/bench not yet deployed (Wave 2 task).");
}

void main();
