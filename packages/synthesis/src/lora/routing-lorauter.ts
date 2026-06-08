// L13 routing — LORAUTER per-task adapter selection (Wave 31, Pastor v2).
//
// Replaces the Wave 29 routing-stub (which always returned null). This is the
// real, DETERMINISTIC adapter router based on the LORAUTER approach
// (arxiv 2601.21795): represent the task with TF-IDF over the prompt, score each
// per-task adapter by cosine similarity against its keyword profile plus
// structural signals (file extensions, language, classify category), and route to
// the best adapter only when its *relative confidence* clears a threshold — else
// fall back to baseline. No LLM is used to pick the adapter (principle 9): the
// decision is a pure function of the prompt + classify features + the registry.
//
// Two hard doctrine guardrails (V4 principle 5/6):
//   1. classify.js owns the TIER. routeAdapter() NEVER changes it — it only
//      biases *which adapter* runs inside the tier the classifier already chose.
//   2. Auto-swap is OPT-IN (default OFF). selectAdapterForTask() — the Wave 29
//      contract — keeps returning null unless the user opts in, so byte-for-byte
//      routing behaviour is unchanged until they ask for it.

import { readPreferences } from "../config.ts";
import {
  listTaskAdapters,
  getTaskAdapter,
  TASK_ADAPTER_TYPES,
  type LoraAdapter,
  type TaskType,
} from "./adapter-registry.ts";

/** Wave 29 contract: the *default* auto-swap flag. Still false in Wave 31 — the
 *  engine is opt-in (see autoSwapEnabled()). Kept so existing callers/tests hold. */
export const AUTO_SWAP_ENABLED = false;

/** Relative-confidence threshold a specialised adapter must clear to be selected. */
export const ROUTE_THRESHOLD = 0.7;

/** Prior mass given to "baseline / no adapter" so weak evidence stays sub-threshold. */
export const BASELINE_PRIOR = 2.0;

const EXT_WEIGHT = 1.6;
const LANG_MATCH_WEIGHT = 1.2;
const LANG_MISMATCH_PENALTY = 1.5;
const CAT_MATCH = 0.8;
const CAT_NEUTRAL = 0.25;

export interface RoutingFeatures {
  prompt_class?: string; // 'T0' | 'T1' | 'T2' | 'T3' (classify tier)
  task_tags?: string[];
  base_model?: string;
  // ── Wave 31 additions (all optional → backward compatible) ──
  prompt?: string; // raw prompt text (drives TF-IDF)
  lang?: "pt" | "en" | "other"; // classify lang_detected, if known
  file_exts?: string[]; // e.g. [".tsx", ".css"] parsed from file refs
  task_category?: string; // classify task_category, if known
}

export interface AdapterScore {
  adapter: string;
  task_type: TaskType;
  confidence: number; // relative confidence 0..1 (sums to ~1 across candidates+prior)
  cosine: number; // raw TF-IDF cosine (telemetry/explainability)
  keyword_hits: string[];
  ext_match: boolean;
  lang_match: boolean;
}

export interface RouteDecision {
  tier: string; // UNCHANGED from the classifier — the hard guardrail
  adapter: string; // selected adapter name (baseline name when no match)
  task_type: TaskType;
  confidence: number; // winner's relative confidence
  matched: boolean; // true iff a specialised adapter crossed ROUTE_THRESHOLD
  threshold: number;
  detected_lang: "pt" | "en" | "other";
  scores: AdapterScore[]; // every candidate, sorted desc by confidence
  reason: string;
}

// ── Tokenisation ─────────────────────────────────────────────────────────────

// Minimal PT+EN stopword set — enough to drop noise without an NLP dependency.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "be",
  "this", "that", "with", "as", "it", "at", "by", "from", "you", "your", "i", "we",
  "o", "a", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "e", "ou", "em",
  "no", "na", "para", "por", "que", "com", "se", "é", "ao", "à", "um", "como", "isto",
  "este", "esta", "meu", "minha", "qual", "sobre", "the", "me", "my",
]);

/** Lowercase, strip punctuation, drop stopwords + sub-2-char tokens. Deterministic. */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** term → count */
function termFreq(terms: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of terms) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

// ── IDF over the adapter keyword profiles (the "corpus") ─────────────────────

/** Build an IDF map from the candidate adapters' keyword profiles. */
export function buildIdf(adapters: LoraAdapter[]): Map<string, number> {
  const docs = adapters.map((a) => new Set(a.keyword_profile ?? []));
  const n = Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const doc of docs) for (const term of doc) df.set(term, (df.get(term) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [term, d] of df) idf.set(term, Math.log((n + 1) / (d + 0.5)) + 1);
  return idf;
}

function tfidfVector(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const v = new Map<string, number>();
  for (const [term, c] of tf) {
    const w = idf.get(term);
    if (w !== undefined) v.set(term, c * w); // only shared-vocabulary terms have an axis
  }
  return v;
}

export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (vb !== undefined) dot += va * vb;
  }
  const mag = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((s, x) => s + x * x, 0));
  const ma = mag(a);
  const mb = mag(b);
  if (ma === 0 || mb === 0) return 0;
  return dot / (ma * mb);
}

// ── Structural affinity ──────────────────────────────────────────────────────

/** Parse file extensions out of a prompt (e.g. "Button.tsx" → ".tsx"). */
export function extractFileExts(prompt: string): string[] {
  if (!prompt) return [];
  const out = new Set<string>();
  const re = /\.([a-z0-9]{1,5})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const ext = "." + m[1].toLowerCase();
    if (!/^\.\d+$/.test(ext)) out.add(ext); // drop ".1" style version fragments
  }
  return [...out];
}

/** Heuristic language detect from token mix (used only when classify lang is absent). */
export function detectLang(terms: string[]): "pt" | "en" | "other" {
  const PT = new Set(["não", "sim", "ficheiro", "código", "ecrã", "botão", "português", "escreve", "resumo", "página", "função", "que", "com", "uma", "para"]);
  const EN = new Set(["file", "code", "button", "page", "write", "summary", "function", "the", "with", "for", "please", "make"]);
  let pt = 0;
  let en = 0;
  for (const t of terms) {
    if (PT.has(t)) pt++;
    if (EN.has(t)) en++;
  }
  if (pt === 0 && en === 0) return "other";
  return pt >= en ? "pt" : "en";
}

const CODE_CAT = /code|file|refactor|cross_file|bug|implement|build|migration|debug/i;
const PROSE_CAT = /explain|transform|prose|writ|doc|summar|translate|content/i;

function categoryAffinity(taskCategory: string | undefined, type: TaskType): number {
  if (!taskCategory) return CAT_NEUTRAL;
  const isCoding = type.startsWith("coding-");
  const isProse = type.startsWith("prose-");
  if (isCoding && CODE_CAT.test(taskCategory)) return CAT_MATCH;
  if (isProse && PROSE_CAT.test(taskCategory)) return CAT_MATCH;
  return CAT_NEUTRAL;
}

// ── The router ───────────────────────────────────────────────────────────────

/**
 * Deterministically route a task to a per-task adapter. The `tier` is taken from
 * the classifier and returned UNCHANGED (doctrine guardrail). When no specialised
 * adapter clears the relative-confidence threshold, the decision is "pastor-baseline".
 */
export function routeAdapter(features: RoutingFeatures): RouteDecision {
  const tier = features.prompt_class ?? "";
  const prompt = features.prompt ?? "";
  const tags = features.task_tags ?? [];
  const promptTerms = [...tokenize(prompt), ...tags.flatMap((t) => tokenize(t))];
  const detectedLang = features.lang && features.lang !== "other" ? features.lang : detectLang(promptTerms);
  const exts = features.file_exts && features.file_exts.length ? features.file_exts : extractFileExts(prompt);

  // Candidates = the specialised (non-baseline) task adapters.
  const candidates = listTaskAdapters().filter((a) => a.task_type && a.task_type !== "baseline");
  const idf = buildIdf(candidates);
  const promptTf = termFreq(promptTerms);
  const promptVec = tfidfVector(promptTf, idf);

  const raw: Array<{ a: LoraAdapter; rawAffinity: number; cosine: number; hits: string[]; extMatch: boolean; langMatch: boolean }> = [];

  for (const a of candidates) {
    const profile = a.keyword_profile ?? [];
    const profileSet = new Set(profile);
    const hits = [...new Set(promptTerms.filter((t) => profileSet.has(t)))];

    // keyword score = Σ idf(hit) — distinctive terms weigh more (TF-IDF spirit).
    const kwScore = hits.reduce((s, t) => s + (idf.get(t) ?? 1), 0);

    // raw cosine for telemetry/explainability.
    const adapterVec = tfidfVector(termFreq(profile), idf);
    const cosine = cosineSimilarity(promptVec, adapterVec);

    const extMatch = exts.some((e) => (a.file_ext_affinity ?? []).includes(e));
    const langAff = a.lang_affinity ?? "any";
    const langMatch = langAff === "any" || langAff === detectedLang;
    const langMismatch = langAff !== "any" && langAff !== detectedLang;

    // Require *some* evidence (a keyword hit or an extension match); otherwise this
    // adapter gets no affinity — prevents e.g. prose-pt winning on language alone.
    let rawAffinity = 0;
    if (kwScore > 0 || extMatch) {
      rawAffinity =
        kwScore +
        (extMatch ? EXT_WEIGHT : 0) +
        (langMatch ? LANG_MATCH_WEIGHT : 0) +
        categoryAffinity(features.task_category, a.task_type as TaskType) -
        (langMismatch ? LANG_MISMATCH_PENALTY : 0);
      rawAffinity = Math.max(0, rawAffinity);
    }
    raw.push({ a, rawAffinity, cosine, hits, extMatch, langMatch });
  }

  const total = raw.reduce((s, r) => s + r.rawAffinity, 0) + BASELINE_PRIOR;
  const scores: AdapterScore[] = raw
    .map((r) => ({
      adapter: r.a.name,
      task_type: r.a.task_type as TaskType,
      confidence: total > 0 ? r.rawAffinity / total : 0,
      cosine: Math.round(r.cosine * 1000) / 1000,
      keyword_hits: r.hits,
      ext_match: r.extMatch,
      lang_match: r.langMatch,
    }))
    .sort((x, y) => y.confidence - x.confidence);

  const winner = scores[0];
  const matched = !!winner && winner.confidence >= ROUTE_THRESHOLD;

  if (matched) {
    return {
      tier,
      adapter: winner.adapter,
      task_type: winner.task_type,
      confidence: winner.confidence,
      matched: true,
      threshold: ROUTE_THRESHOLD,
      detected_lang: detectedLang,
      scores,
      reason: `routed to ${winner.task_type} (confidence ${winner.confidence.toFixed(2)} ≥ ${ROUTE_THRESHOLD})`,
    };
  }

  const baseline = getTaskAdapter("baseline");
  return {
    tier,
    adapter: baseline?.name ?? "pastor-baseline",
    task_type: "baseline",
    confidence: winner ? winner.confidence : 0,
    matched: false,
    threshold: ROUTE_THRESHOLD,
    detected_lang: detectedLang,
    scores,
    reason: winner
      ? `no adapter cleared threshold (best ${winner.task_type} ${winner.confidence.toFixed(2)} < ${ROUTE_THRESHOLD}) → baseline`
      : "no candidates → baseline",
  };
}

/** True when the user has opted into auto hot-swap (env or preferences). Default off. */
export function autoSwapEnabled(): boolean {
  if (process.env.MOOTER_LORA_AUTOSWAP === "1") return true;
  if (process.env.MOOTER_LORA_AUTOSWAP === "0") return false;
  const prefs = readPreferences();
  return prefs.lora_autoswap === true;
}

/**
 * Wave 29 contract (backward compatible). Returns an adapter to hot-swap, or null.
 * Default behaviour is UNCHANGED: returns null unless the user has opted into
 * auto-swap. When opted in, runs LORAUTER and returns the matched adapter (null on
 * baseline — the caller keeps the unmodified model). Never used to change the tier.
 */
export function selectAdapterForTask(features: RoutingFeatures): LoraAdapter | null {
  if (!autoSwapEnabled()) return null;
  const decision = routeAdapter(features);
  if (!decision.matched) return null;
  return getTaskAdapter(decision.task_type);
}

export { TASK_ADAPTER_TYPES };
