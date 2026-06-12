// fable-5-routing.ts — Wave 58 (A.17): Fable-5-inspired adaptive escalation.
//
// ── WHAT THIS IS (and the boundary it does NOT cross) ────────────────────────
//
// classify.js (FROZEN) decides the TIER for a prompt. decideAgent() (Wave 58)
// picks the best-value MODEL within a category by Token-Efficiency Score (TES).
// adaptiveRoute() is the *third* layer: given a task and its category, it tries
// the cheapest viable model first, has a JUDGE score the answer, and ESCALATES
// to the next-best-TES candidate only when the answer is not good enough.
//
//   classify.js    : prompt → TIER            (NOT touched here; frozen sha)
//   decideAgent    : (category, gate) → MODEL  (best TES within capability band)
//   adaptiveRoute  : (task, category) → run + judge + escalate-on-low-confidence
//
// adaptiveRoute NEVER re-classifies a prompt and NEVER imports classify.js. It
// picks a model and runs it; it does not re-tier. The candidate ORDER is the
// TES ranking (cheapest-viable-first = highest TES meeting the score gate), so
// "escalate" means "spend more for quality" — walk DOWN the TES ranking to the
// next, more-expensive-but-stronger candidate.
//
// ── CONFIDENCE = SONNET SELF-JUDGE, NOT CLASSIFIER CONFIDENCE ─────────────────
//
// The `confidence` that drives escalation is the JUDGE's quality score in
// [0,1] — by default a Sonnet self-judge applying the judge.ts rubric. It is
// EXPLICITLY NOT classify.js's TF-IDF routing confidence (which measures "is
// this the right tier", not "is this answer good"). The two are unrelated; we
// name the field `confidence` to match the brief but document it as the judge
// score everywhere it surfaces.
//
// ── NO FABRICATION (Doctrine V4 #5) ──────────────────────────────────────────
//
// • Candidates are ranked by REAL TES (decide-agent primitives: a measured
//   matrix cell + a real snapshot price). A model with no measured score for
//   the category, or a pending/unknown price, is NOT a viable candidate — we
//   never invent a score or a price to make one rankable.
// • If NO candidate clears the confidence threshold after max_attempts, we
//   return the BEST-SO-FAR answer with escalation_reason
//   "confidence threshold not reached" and final_confidence_met=false. We never
//   fake success by reporting the last (or best) answer as if it passed.
// • executor + judge are INJECTED. Tests stub them, so a test run never calls a
//   real model. The DEFAULT judge calls `claude --print --model sonnet` via a
//   subprocess (no API key; the CLI is on PATH) and parses with judge.ts's
//   parseScores; if that transport fails or returns unparseable output, the
//   default judge returns null confidence (honest unknown), which the caller
//   treats as "did not meet threshold" rather than a fabricated pass.
//
// Pure-ish module: the candidate ranking is file-reads only (snapshot + seed,
// already cached by the reused modules). The only side effect is a best-effort
// append to the per-category escalation journal. Never throws to the caller.

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { MATRIX_MODELS, getCell, type MatrixModel } from "./specialization-matrix.ts";
import {
  TASK_CATEGORIES,
  parseTaskCategory,
  type TaskCategory,
} from "./task-categories.ts";
import { computeTES } from "./tes-calculator.ts";

// ---------------------------------------------------------------------------
// Defaults (documented; one place to change them)
// ---------------------------------------------------------------------------

/** Default number of models tried before giving up (incl. the first). */
export const DEFAULT_MAX_ATTEMPTS = 3 as const;
/** Default judge-confidence floor an answer must clear to be accepted. */
export const DEFAULT_MIN_CONFIDENCE = 0.75 as const;
/** Default score gate for a model to be a *viable* candidate at all. Mirrors
 *  decideAgent's DEFAULT_MIN_SCORE so the candidate pool matches the matrix
 *  engine's notion of "good enough to consider". */
export const DEFAULT_MIN_SCORE = 0.75 as const;

// ---------------------------------------------------------------------------
// Injected dependency contracts
// ---------------------------------------------------------------------------

/** What the executor returns for one (model, task) run. cost/tokens are
 *  passed straight through to the attempt record + escalation journal; null is
 *  the honest value when the executor does not know them. */
export interface ExecutorResult {
  /** The model's answer text. */
  text: string;
  /** Realized USD cost of the call, or null when unknown. */
  cost: number | null;
  /** Total tokens (in+out) of the call, or null when unknown. */
  tokens: number | null;
}

/** Runs one model against the task. INJECTED so tests never hit a real model. */
export type Executor = (model: string, task: string) => Promise<ExecutorResult> | ExecutorResult;

/** Scores an answer's quality in [0,1] (the Sonnet self-judge by default), or
 *  null when the judge could not produce a score (honest unknown → treated as
 *  "below threshold", never as a pass). INJECTED so tests stub it. */
export type Judge = (task: string, answer: string) => Promise<number | null> | number | null;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AdaptiveRouteArgs {
  /** The task/prompt text handed to the executor. */
  task: string;
  /** One of the 24 Wave 58 categories — selects the TES candidate ranking. */
  task_category: string;
  /** Max models to try (incl. the first). Default 3. Clamped to >=1 and to the
   *  number of viable candidates. */
  max_attempts?: number;
  /** Judge-confidence floor (0..1) an answer must clear. Default 0.75. */
  min_confidence?: number;
  /** Candidate score gate (0..1): a model needs a measured category score >=
   *  this to be considered. Default 0.75. */
  min_score?: number;
  /** Runs a model on the task. INJECTED (tests stub). */
  executor: Executor;
  /** Scores an answer 0..1. INJECTED (tests stub). Defaults to the Sonnet
   *  self-judge when omitted. */
  judge?: Judge;
  /** Override the escalation journal location (tests). */
  home?: string;
  /** TEST-ONLY escalation-walk seam. When supplied, this exact TES-desc ranking
   *  is used INSTEAD of rankCandidates() — so the escalation logic can be
   *  exercised deterministically over >1 candidate WITHOUT fabricating matrix
   *  scores (the real matrix is honestly sparse; most categories have <2
   *  measured+priced models). Production callers NEVER pass this; it does not
   *  invent capability data, it only injects the candidate ORDER for a test. */
  __candidates?: RankedCandidate[];
}

export interface AttemptRecord {
  /** 1-indexed attempt number. */
  attempt: number;
  /** The model run on this attempt. */
  model: string;
  /** Its measured TES for the category (the ranking key; never fabricated). */
  tes: number | null;
  /** The judge's confidence for this attempt's answer, or null (unknown). */
  confidence: number | null;
  /** Realized cost of this attempt, or null when the executor did not know it. */
  cost: number | null;
  /** Total tokens of this attempt, or null. */
  tokens: number | null;
  /** Did this attempt's answer meet min_confidence? */
  met_threshold: boolean;
}

export interface AdaptiveRouteResult {
  /** The accepted (or best-so-far) answer text. Null only when no viable
   *  candidate existed (nothing was ever run). */
  final: string | null;
  /** The model whose answer we are returning. Null when nothing ran. */
  winning_model: string | null;
  /** The judge confidence of the returned answer (the best seen), or null. */
  final_confidence: number | null;
  /** True iff the returned answer cleared min_confidence (honest success flag). */
  final_confidence_met: boolean;
  /** Sum of known attempt costs (USD). Unknown costs contribute nothing and are
   *  flagged via cost_complete=false rather than guessed. */
  total_cost: number;
  /** True iff EVERY attempt reported a known cost (so total_cost is complete). */
  cost_complete: boolean;
  /** One record per model tried, in attempt order. */
  attempts: AttemptRecord[];
  /** Why we stopped: accepted on attempt N, exhausted candidates, ran out of
   *  attempts, or no viable candidate at all. Honest about not-reaching. */
  escalation_reason: string;
}

// ---------------------------------------------------------------------------
// Candidate ranking — REAL TES only (decide-agent primitives, no fabrication)
// ---------------------------------------------------------------------------

export interface RankedCandidate {
  model: string;
  /** Measured category score in [0,1] (gate + tie-break). */
  score: number;
  /** Real TES for (model, category). Always a finite number here (we drop
   *  pending/unknown-price candidates before ranking). */
  tes: number;
}

/**
 * Build the TES-descending candidate ranking for a category.
 *
 * A model is a VIABLE candidate only when ALL of:
 *   - it has a MEASURED matrix cell for the category (real, cited score), AND
 *   - that score >= min_score (the quality gate), AND
 *   - computeTES yields a finite number (a real snapshot price — 'ok' for a
 *     priced model, 'free' for a local model). Pending/unknown price ⇒ no TES
 *     ⇒ not rankable ⇒ excluded (we never invent a price to rank it).
 *
 * Sorted by TES descending (cheapest-viable-first), with deterministic
 * tie-breaks: higher measured score, then model id. This is the same notion of
 * "best value first" that decideAgent uses; adaptiveRoute walks DOWN this list
 * as it escalates.
 */
export function rankCandidates(category: TaskCategory, minScore: number): RankedCandidate[] {
  const out: RankedCandidate[] = [];
  for (const model of MATRIX_MODELS as readonly MatrixModel[]) {
    const cell = getCell(model, category);
    if (!cell || !cell.measured || typeof cell.score !== "number") continue; // no real score
    if (cell.score < minScore) continue; // below the quality gate
    const tesResult = computeTES({ model, category, benchmark_score: cell.score });
    if (typeof tesResult.tes !== "number" || !Number.isFinite(tesResult.tes)) continue; // unpriceable
    out.push({ model, score: cell.score, tes: tesResult.tes });
  }
  out.sort((a, b) => {
    if (b.tes !== a.tes) return b.tes - a.tes; // TES desc (best value first)
    if (b.score !== a.score) return b.score - a.score; // then higher quality
    return a.model < b.model ? -1 : a.model > b.model ? 1 : 0; // then id (stable)
  });
  return out;
}

// ---------------------------------------------------------------------------
// Default judge — Sonnet self-judge via `claude --print --model sonnet`
// ---------------------------------------------------------------------------

const SONNET_JUDGE_MODEL = "sonnet" as const;

/**
 * The five judge.ts dimensions, normalized to a single [0,1] confidence:
 *   - correctness   ∈ {0, 0.5, 1}      → weight 0.40
 *   - completeness  ∈ 1..5 → /5         → weight 0.25
 *   - relevance     ∈ 1..5 → /5         → weight 0.15
 *   - actionability ∈ 1..5 → /5         → weight 0.15
 *   - hallucination ∈ {0,1} → (1-h)     → weight 0.05 (a penalty toward 0)
 * Weights sum to 1.0. This blend is a documented CONVENTION of the default
 * judge (not a measurement); a caller who wants a different aggregation injects
 * their own `judge`.
 */
const JUDGE_WEIGHTS = {
  correctness: 0.4,
  completeness: 0.25,
  relevance: 0.15,
  actionability: 0.15,
  hallucination: 0.05,
} as const;

interface RawScores {
  correctness: number;
  completeness: number;
  relevance: number;
  actionability: number;
  hallucination: number;
}

/** Blend the five rubric dimensions into a single confidence in [0,1]. */
export function scoresToConfidence(s: RawScores): number {
  const c =
    JUDGE_WEIGHTS.correctness * s.correctness +
    JUDGE_WEIGHTS.completeness * (s.completeness / 5) +
    JUDGE_WEIGHTS.relevance * (s.relevance / 5) +
    JUDGE_WEIGHTS.actionability * (s.actionability / 5) +
    JUDGE_WEIGHTS.hallucination * (1 - s.hallucination);
  return Math.round(Math.min(1, Math.max(0, c)) * 1e4) / 1e4;
}

/** Build the single-answer judge prompt (rubric from judge.ts, one OUTPUT). */
function buildSelfJudgePrompt(task: string, answer: string): string {
  return `És um juiz técnico imparcial. Avalia UMA resposta a um prompt.

PROMPT ORIGINAL:
"""
${task}
"""

RUBRICS (aplica-as literalmente, não inventes critérios):
[correctness] float em {0.0, 0.5, 1.0} — 1.0 = correcto/compila/factos verificáveis; 0.5 = parcial; 0.0 = errado/inventado.
[completeness] int 1-5 — 5 = todos os requisitos com profundidade; 1 = só o mais óbvio.
[relevance] int 1-5 — 5 = on-topic, idioms do domínio; 1 = off-topic.
[actionability] int 1-5 — 5 = pronto a usar; 1 = vago, sem next step.
[hallucination] int 0 ou 1 — 0 = nenhuma invenção; 1 = pelo menos uma invenção factual material.

RESPOSTA A AVALIAR:
--- OUTPUT 1 ---
${answer || "(resposta vazia)"}

Devolve EXCLUSIVAMENTE um objecto JSON (sem markdown) com esta forma exacta:
{"1":{"correctness":0.0,"completeness":1,"relevance":1,"actionability":1,"hallucination":0}}`;
}

const clampInt = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof v === "number" ? Math.round(v) : Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(hi, Math.max(lo, n));
};
const correctnessVal = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0.5;
  if (n >= 0.75) return 1.0;
  if (n >= 0.25) return 0.5;
  return 0.0;
};

/** Extract the position-"1" score object from the judge's raw JSON, or null. */
function parseSelfJudge(raw: string): RawScores | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: Record<string, Record<string, unknown>>;
  try {
    obj = JSON.parse(m[0]) as Record<string, Record<string, unknown>>;
  } catch {
    return null;
  }
  const s = obj["1"] ?? obj as unknown as Record<string, unknown>;
  if (!s || typeof s !== "object") return null;
  return {
    correctness: correctnessVal((s as Record<string, unknown>).correctness),
    completeness: clampInt((s as Record<string, unknown>).completeness, 1, 5, 3),
    relevance: clampInt((s as Record<string, unknown>).relevance, 1, 5, 3),
    actionability: clampInt((s as Record<string, unknown>).actionability, 1, 5, 3),
    hallucination: clampInt((s as Record<string, unknown>).hallucination, 0, 1, 0),
  };
}

/**
 * The DEFAULT judge: a Sonnet self-judge via `claude --print --model sonnet`
 * (no API key — the CLI is on PATH). Returns a [0,1] confidence, or null when
 * the transport fails or the output cannot be parsed (honest unknown — the
 * caller treats null as "did not meet threshold", never as a pass). Never
 * throws. This is exported so a CLI can wire it; tests inject a stub instead.
 */
export const sonnetSelfJudge: Judge = (task: string, answer: string): number | null => {
  const prompt = buildSelfJudgePrompt(task, answer);
  let res;
  try {
    res = spawnSync("claude", ["--print", "--model", SONNET_JUDGE_MODEL], {
      input: prompt,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return null; // spawn failed (claude not on PATH, etc.) — honest unknown
  }
  if (res.error || res.status !== 0 || typeof res.stdout !== "string") return null;
  const parsed = parseSelfJudge(res.stdout);
  if (!parsed) return null;
  return scoresToConfidence(parsed);
};

// ---------------------------------------------------------------------------
// Per-category escalation journal (a SIBLING of cost-perf-log.jsonl)
//
// Best-effort append-only JSONL at `~/.mooter/fable-5-escalations.jsonl` (one
// line per adaptiveRoute call). Mirrors cost-perf-tracker.js conventions:
// honest nulls for unknowns, never throws, a crash mid-write loses at most one
// line. We keep this a SIBLING file (not cost-perf-log) so the cost/perf drift
// analytics stay clean and the escalation signal is queryable on its own.
// ---------------------------------------------------------------------------

export interface EscalationRecord {
  task_category: TaskCategory;
  /** How many models were tried (>=1). */
  attempts: number;
  /** True iff more than one model ran (an actual escalation occurred). */
  escalated: boolean;
  /** Did the FINAL answer clear min_confidence? */
  accepted: boolean;
  /** The model whose answer was returned (best-so-far). */
  winning_model: string;
  /** Judge confidence of the returned answer, or null (honest unknown). */
  final_confidence: number | null;
  /** The threshold in force for this call. */
  min_confidence: number;
  /** Sum of known attempt costs (USD). */
  total_cost: number;
  /** False when any attempt's cost was unknown (so total_cost is partial). */
  cost_complete: boolean;
  /** The models tried, in attempt order. */
  models_tried: string[];
}

function mooterHome(override?: string): string {
  return override || process.env.MOOTER_HOME || join(homedir(), ".mooter");
}

/** Absolute path of the escalation journal. */
export function escalationLogPath(home?: string): string {
  return join(mooterHome(home), "fable-5-escalations.jsonl");
}

/**
 * Append one escalation row. Best-effort: returns true on a successful write,
 * false on any failure (never throws — it is on the adaptiveRoute hot path and
 * must never break a route). Creates the home dir if missing.
 */
export function appendEscalation(rec: EscalationRecord, opts: { home?: string } = {}): boolean {
  try {
    const home = mooterHome(opts.home);
    try {
      mkdirSync(home, { recursive: true });
    } catch {
      /* may already exist */
    }
    const row = { ts: new Date().toISOString(), ...rec };
    appendFileSync(escalationLogPath(opts.home), JSON.stringify(row) + "\n");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// adaptiveRoute — the public engine
// ---------------------------------------------------------------------------

/**
 * Fable-5-inspired adaptive escalation.
 *
 * Algorithm (matching the Wave 58 A.17 brief, step-by-step):
 *   1. Rank candidate models by TES descending for the category (rankCandidates
 *      — REAL TES only; pending-price / unmeasured models are not candidates).
 *   2. Try the cheapest viable model first (highest TES meeting min_score).
 *   3. executor(model, task) → { text, cost, tokens }   (INJECTED).
 *   4. judge(task, text) → confidence 0..1               (INJECTED; default
 *      Sonnet self-judge). A null confidence is an honest unknown.
 *   5. If confidence < min_confidence → escalate to the NEXT-TES candidate (the
 *      next, more-capable-but-pricier model) and repeat, up to max_attempts.
 *   6. Return { final, winning_model, total_cost, attempts[], escalation_reason }.
 *      The returned answer is the BEST seen (highest judge confidence). If none
 *      cleared the threshold, escalation_reason is "confidence threshold not
 *      reached" and final_confidence_met=false — never a faked success.
 *
 * Records the escalation outcome per category (best-effort append to the
 * sibling journal; failure is silent and never affects the return).
 * Never throws — executor/judge errors collapse to a null-confidence attempt.
 */
export async function adaptiveRoute(args: AdaptiveRouteArgs): Promise<AdaptiveRouteResult> {
  const minConfidence = clampUnit(args.min_confidence, DEFAULT_MIN_CONFIDENCE);
  const minScore = clampUnit(args.min_score, DEFAULT_MIN_SCORE);
  const judge = args.judge ?? sonnetSelfJudge;

  // --- validate category -----------------------------------------------------
  const category = parseTaskCategory(args.task_category);
  if (category === null) {
    return emptyResult(
      `unknown task_category "${args.task_category}" — must be one of the 24 categories (see task-categories.ts); nothing run`,
    );
  }

  // --- step 1: rank candidates by REAL TES -----------------------------------
  // The __candidates seam (tests only) injects a deterministic ranking so the
  // escalation walk is exercisable over >1 candidate without fabricating matrix
  // data. Production always uses the real, anti-fabrication rankCandidates().
  const ranked = args.__candidates ?? rankCandidates(category, minScore);
  if (ranked.length === 0) {
    return emptyResult(
      `no viable candidate for ${category} at min_score=${minScore} ` +
        `(no measured+priced model cleared the gate) — nothing run; seed a benchmark or lower min_score`,
    );
  }

  // clamp attempts to [1, candidate count]
  const requested = Number.isFinite(args.max_attempts as number)
    ? Math.floor(args.max_attempts as number)
    : DEFAULT_MAX_ATTEMPTS;
  const maxAttempts = Math.max(1, Math.min(requested, ranked.length));

  // --- steps 2-5: try, judge, escalate ---------------------------------------
  const attempts: AttemptRecord[] = [];
  let best: AttemptRecord | null = null;
  let bestText: string | null = null;
  let accepted = false;
  let acceptedAttempt = 0;

  for (let i = 0; i < maxAttempts; i++) {
    const cand = ranked[i];
    const { text, cost, tokens } = await runExecutor(args.executor, cand.model, args.task);
    const confidence = await runJudge(judge, args.task, text);
    const met = confidence !== null && confidence >= minConfidence;

    const record: AttemptRecord = {
      attempt: i + 1,
      model: cand.model,
      tes: cand.tes,
      confidence,
      cost,
      tokens,
      met_threshold: met,
    };
    attempts.push(record);

    // track best-so-far by judge confidence (null counts as -1 so any real
    // score beats "unknown"; we never fabricate a score for an unknown).
    if (best === null || confScore(confidence) > confScore(best.confidence)) {
      best = record;
      bestText = text;
    }

    if (met) {
      accepted = true;
      acceptedAttempt = i + 1;
      break; // do not spend more once the gate is cleared
    }
  }

  // --- step 6: assemble result ----------------------------------------------
  const total = sumCosts(attempts);
  const escalation_reason = accepted
    ? `accepted on attempt ${acceptedAttempt}/${attempts.length} (${best!.model}) ` +
      `at confidence ${best!.confidence} >= min_confidence ${minConfidence}`
    : attempts.length >= ranked.length
      ? `confidence threshold not reached: exhausted all ${ranked.length} viable candidate(s), ` +
        `returning best-so-far (${best!.model}, confidence ${fmtConf(best!.confidence)}) — below min_confidence ${minConfidence}`
      : `confidence threshold not reached: ran out of attempts (max_attempts=${maxAttempts}), ` +
        `returning best-so-far (${best!.model}, confidence ${fmtConf(best!.confidence)}) — below min_confidence ${minConfidence}`;

  // best-effort: record the escalation outcome per category (never affects return)
  appendEscalation(
    {
      task_category: category,
      attempts: attempts.length,
      escalated: attempts.length > 1,
      accepted,
      winning_model: best!.model,
      final_confidence: best!.confidence,
      min_confidence: minConfidence,
      total_cost: total.value,
      cost_complete: total.complete,
      models_tried: attempts.map((a) => a.model),
    },
    { home: args.home },
  );

  return {
    final: bestText,
    winning_model: best!.model,
    final_confidence: best!.confidence,
    final_confidence_met: accepted,
    total_cost: total.value,
    cost_complete: total.complete,
    attempts,
    escalation_reason,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a 0..1 arg, falling back to a default when absent/out-of-range. */
function clampUnit(v: number | undefined, dflt: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return dflt;
  return v;
}

/** A null confidence sorts below any real score (so "unknown" never wins). */
function confScore(c: number | null): number {
  return c === null ? -1 : c;
}

function fmtConf(c: number | null): string {
  return c === null ? "unknown" : String(c);
}

/** Run the injected executor defensively; any throw → an empty, null-cost run. */
async function runExecutor(
  executor: Executor,
  model: string,
  task: string,
): Promise<ExecutorResult> {
  try {
    const r = await executor(model, task);
    return {
      text: typeof r?.text === "string" ? r.text : "",
      cost: typeof r?.cost === "number" && Number.isFinite(r.cost) ? r.cost : null,
      tokens: typeof r?.tokens === "number" && Number.isFinite(r.tokens) ? r.tokens : null,
    };
  } catch {
    return { text: "", cost: null, tokens: null };
  }
}

/** Run the injected judge defensively; any throw or out-of-range → null. */
async function runJudge(judge: Judge, task: string, answer: string): Promise<number | null> {
  try {
    const c = await judge(task, answer);
    if (typeof c !== "number" || !Number.isFinite(c)) return null;
    return Math.min(1, Math.max(0, c));
  } catch {
    return null;
  }
}

/** Sum known attempt costs; complete=false when any attempt's cost was null. */
function sumCosts(attempts: AttemptRecord[]): { value: number; complete: boolean } {
  let value = 0;
  let complete = true;
  for (const a of attempts) {
    if (typeof a.cost === "number" && Number.isFinite(a.cost)) value += a.cost;
    else complete = false;
  }
  return { value: Math.round(value * 1e6) / 1e6, complete };
}

/** A result for the "nothing run" cases (bad category / no candidate). */
function emptyResult(reason: string): AdaptiveRouteResult {
  return {
    final: null,
    winning_model: null,
    final_confidence: null,
    final_confidence_met: false,
    total_cost: 0,
    cost_complete: true,
    attempts: [],
    escalation_reason: reason,
  };
}

// ---------------------------------------------------------------------------
// Re-exports for callers + tests
// ---------------------------------------------------------------------------

export { TASK_CATEGORIES, type TaskCategory };
