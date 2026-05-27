// summary.ts — aggregate RAW_RESULTS into SUMMARY.json (§8.2, §6, §1 verdict).
//
// Paired statistics throughout (the 3 arms see the SAME 34 prompts): Cohen's d
// is paired, CIs are bootstrap percentile CIs on per-prompt differences. The
// "Pastor wins" verdict applies the pre-registered 3-of-3 criteria (§1) vs the
// Sonnet baseline (arm B), and reports the vs-gold (arm C) comparison too.

import { mean, bootstrapCI, bootstrapDiffCI, pairedCohensD } from "./stats.ts";
import { microsToUsd } from "./pricing.ts";
import type { Arm, BenchEvent, JudgeLogRow, QualityScores } from "./types.ts";

const ARMS: Arm[] = ["A", "B", "C"];

interface ArmSummary {
  n: number;
  n_ok: number;
  mean_quality: number;
  ci_quality_95: [number, number];
  mean_cost_usd: number;
  total_cost_usd: number;
  mean_latency_ms: number;
  mean_tokens_total: number;
  model_distribution: Record<string, number>;
}

interface PairSummary {
  quality_cohens_d_paired: number;
  quality_diff_ci_95: [number, number]; // mean(A)-mean(other)
  cost_savings_pct: number; // 1 - meanCost(A)/meanCost(other)
  latency_diff_pct: number; // meanLat(A)/meanLat(other) - 1
  criteria: { quality_ok: boolean; cost_ok: boolean; latency_ok: boolean };
  pastor_wins: string;
}

function byArm(events: BenchEvent[], arm: Arm): BenchEvent[] {
  return events.filter((e) => e.arm === arm);
}

/** Quality values aligned by prompt_id across two arms (both non-null only). */
function alignedQuality(events: BenchEvent[], a: Arm, b: Arm): { aVals: number[]; bVals: number[] } {
  const map = new Map<string, Partial<Record<Arm, number>>>();
  for (const e of events) {
    if (e.quality_score === null) continue;
    const m = map.get(e.prompt_id) ?? {};
    m[e.arm] = e.quality_score;
    map.set(e.prompt_id, m);
  }
  const aVals: number[] = [];
  const bVals: number[] = [];
  for (const m of map.values()) {
    if (typeof m[a] === "number" && typeof m[b] === "number") {
      aVals.push(m[a]!);
      bVals.push(m[b]!);
    }
  }
  return { aVals, bVals };
}

function armSummary(events: BenchEvent[], arm: Arm): ArmSummary {
  const rows = byArm(events, arm);
  const ok = rows.filter((r) => r.status === "ok");
  const quality = rows.map((r) => r.quality_score).filter((q): q is number => q !== null);
  const costsUsd = rows.map((r) => microsToUsd(r.cost_micros));
  const ci = bootstrapCI(quality, { seed: 4242 });
  const modelDist: Record<string, number> = {};
  for (const r of rows) modelDist[r.model_used] = (modelDist[r.model_used] ?? 0) + 1;
  return {
    n: rows.length,
    n_ok: ok.length,
    mean_quality: mean(quality),
    ci_quality_95: [ci.lower, ci.upper],
    mean_cost_usd: mean(costsUsd),
    total_cost_usd: costsUsd.reduce((a, b) => a + b, 0),
    mean_latency_ms: mean(rows.map((r) => r.latency_total_ms)),
    mean_tokens_total: mean(rows.map((r) => r.tokens_total)),
    model_distribution: modelDist,
  };
}

function pairSummary(events: BenchEvent[], other: Arm): PairSummary {
  const a = armSummary(events, "A");
  const o = armSummary(events, other);
  const { aVals, bVals } = alignedQuality(events, "A", other);
  const diffs = aVals.map((v, i) => v - bVals[i]);
  const ci = bootstrapDiffCI(aVals, bVals, { paired: true, seed: 4242 });

  const costSavings = o.mean_cost_usd > 0 ? 1 - a.mean_cost_usd / o.mean_cost_usd : 0;
  const latencyDiff = o.mean_latency_ms > 0 ? a.mean_latency_ms / o.mean_latency_ms - 1 : 0;

  // Pre-registered §1 criteria (defined vs baseline; reported for both pairs).
  const quality_ok = a.mean_quality >= 0.9 * o.mean_quality;
  const cost_ok = a.mean_cost_usd <= 0.5 * o.mean_cost_usd;
  const latency_ok = a.mean_latency_ms <= 1.2 * o.mean_latency_ms;
  const passed = [quality_ok, cost_ok, latency_ok].filter(Boolean).length;
  const verdict =
    passed === 3 ? "WINS (3/3)" : passed === 2 ? "PARTIAL (2/3)" : passed === 1 ? "WEAK (1/3)" : "LOSES (0/3)";

  return {
    quality_cohens_d_paired: pairedCohensD(diffs),
    quality_diff_ci_95: [ci.lower, ci.upper],
    cost_savings_pct: costSavings,
    latency_diff_pct: latencyDiff,
    criteria: { quality_ok, cost_ok, latency_ok },
    pastor_wins: verdict,
  };
}

function byPack(events: BenchEvent[]): Record<string, unknown> {
  const blocks = [...new Set(events.map((e) => e.block))];
  const out: Record<string, unknown> = {};
  for (const block of blocks) {
    const sub = events.filter((e) => e.block === block);
    const per: Record<string, { mean_quality: number; mean_cost_usd: number; mean_latency_ms: number; n: number }> = {};
    for (const arm of ARMS) {
      const rows = byArm(sub, arm);
      const q = rows.map((r) => r.quality_score).filter((x): x is number => x !== null);
      per[arm] = {
        mean_quality: mean(q),
        mean_cost_usd: mean(rows.map((r) => microsToUsd(r.cost_micros))),
        mean_latency_ms: mean(rows.map((r) => r.latency_total_ms)),
        n: rows.length,
      };
    }
    out[block] = per;
  }
  return out;
}

function misRouting(events: BenchEvent[]): Record<string, unknown> {
  const aRows = byArm(events, "A");
  const packScoped = aRows.filter((r) => r.pack_correct !== null);
  const packCorrect = packScoped.filter((r) => r.pack_correct === true).length;
  const tierScoped = aRows.filter((r) => r.tier_appropriate !== null);
  const tierOk = tierScoped.filter((r) => r.tier_appropriate === true).length;
  const higherScoped = aRows.filter((r) => r.would_higher_tier_help !== null);
  const higherHelp = higherScoped.filter((r) => r.would_higher_tier_help === true).length;
  const review = aRows
    .filter((r) => r.pack_correct === false || r.would_higher_tier_help === true)
    .map((r) => r.prompt_id);
  return {
    pack_correct_rate: packScoped.length ? packCorrect / packScoped.length : null,
    pack_correct_n: `${packCorrect}/${packScoped.length}`,
    tier_appropriate_rate: tierScoped.length ? tierOk / tierScoped.length : null,
    would_higher_tier_help_rate: higherScoped.length ? higherHelp / higherScoped.length : null,
    instances_to_review: [...new Set(review)],
  };
}

/** Mean per-dimension absolute variance across the repeat judge runs (§4.6). */
export function judgeReliability(
  baseRows: JudgeLogRow[],
  repeatRows: JudgeLogRow[],
): { repeat_variance_mean: number; alert_triggered: boolean; n_repeats: number } {
  const dims: (keyof QualityScores)[] = ["correctness", "completeness", "relevance", "actionability", "hallucination"];
  const baseByPrompt = new Map(baseRows.map((r) => [r.prompt_id, r]));
  const diffs: number[] = [];
  for (const rep of repeatRows) {
    const base = baseByPrompt.get(rep.prompt_id);
    if (!base) continue;
    for (const pos of ["1", "2", "3"]) {
      // Compare by ARM (orders differ between base and repeat).
      const arm = rep.position_to_arm?.[pos];
      const basePos = Object.entries(base.position_to_arm).find(([, a]) => a === arm)?.[0];
      if (!arm || !basePos) continue;
      const r1 = rep.scores_by_position[pos];
      const r0 = base.scores_by_position[basePos];
      if (!r1 || !r0) continue;
      for (const d of dims) {
        // normalize 1-5 dims to 0-1 scale for comparable variance
        const norm = d === "completeness" || d === "relevance" || d === "actionability" ? 5 : 1;
        diffs.push(Math.abs((r1[d] - r0[d]) / norm));
      }
    }
  }
  const v = mean(diffs);
  return { repeat_variance_mean: v, alert_triggered: v > 0.3, n_repeats: repeatRows.length };
}

export function buildSummary(
  runId: string,
  events: BenchEvent[],
  judgeBaseRows: JudgeLogRow[],
  judgeRepeatRows: JudgeLogRow[],
): Record<string, unknown> {
  const perArm: Record<string, ArmSummary> = {};
  for (const arm of ARMS) perArm[arm] = armSummary(events, arm);

  const reliability = judgeReliability(judgeBaseRows, judgeRepeatRows);
  const failed = events.filter((e) => e.status === "failed").length;

  return {
    schema_version: "1.0.0",
    run_id: runId,
    n_prompts: new Set(events.map((e) => e.prompt_id)).size,
    n_arms: ARMS.length,
    n_rows: events.length,
    n_failed: failed,
    total_cost_usd: events.reduce((a, e) => a + microsToUsd(e.cost_micros), 0),
    per_arm: perArm,
    pairs: {
      A_vs_B: pairSummary(events, "B"),
      A_vs_C: pairSummary(events, "C"),
    },
    by_pack: byPack(events),
    mis_routing: misRouting(events),
    judge_reliability: reliability,
    notes: "Paired stats (same 34 prompts/arm). Effect size > p-value for interpretation (§6.2). N=34 small — d<0.3 is noise.",
  };
}

/** Flat per-arm rows for SUMMARY.parquet (the nested JSON stays in SUMMARY.json). */
export function summaryArmRows(summary: Record<string, unknown>): Record<string, unknown>[] {
  const perArm = summary.per_arm as Record<string, ArmSummary>;
  const runId = String(summary.run_id);
  return ARMS.map((arm) => {
    const s = perArm[arm];
    return {
      run_id: runId, arm,
      n: s.n, n_ok: s.n_ok,
      mean_quality: s.mean_quality,
      ci_low: s.ci_quality_95[0], ci_high: s.ci_quality_95[1],
      mean_cost_usd: s.mean_cost_usd, total_cost_usd: s.total_cost_usd,
      mean_latency_ms: s.mean_latency_ms, mean_tokens_total: s.mean_tokens_total,
    };
  });
}
