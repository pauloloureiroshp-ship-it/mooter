// classify_domain() — axis 2 of two-axis routing (Pastor Wave 1, Day 3).
//
// Axis 1 (complexity → tier) lives in tools/router/classify.js and is NOT touched here.
// Axis 2 maps a prompt to a domain *pack* (packs/<name>/pack.yaml) using a pure regex
// layer: word-boundary keyword matching + intent-phrase substrings + file-extension
// hints + negative-keyword penalties. No Ollama, no Haiku, no embeddings (those land in
// later days). Regexes are compiled once at boot (loadPacks) and cached on each pack.
//
// Source of truth: docs/strategy/PASTOR.md §10.3 (this day) and §3 (two-axis routing).
// Algorithm + scoring are documented in docs/spec/classify-domain.md.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";

// --- scoring weights (see spec) ---
export const WEIGHTS = {
  keyword: 1.0,
  intent_phrase: 1.5,
  file_extension: 0.5,
  negative_keyword: -2.0,
} as const;

// --- confidence thresholds (see spec) ---
export const THRESHOLDS = {
  single: 0.6, // >= single pack
  ambiguous: 0.4, // [ambiguous, single) → AMBIGUOUS with top-3
} as const;

export interface DomainSignals {
  keywords: string[];
  intent_phrases: string[];
  file_extensions: string[];
  negative_keywords: string[];
}

/** A pack with its domain regexes pre-compiled (done once, at boot). */
export interface CompiledPack {
  pack_id: string;
  keywordRes: RegExp[];
  negativeRes: RegExp[];
  intentPhrases: string[]; // lower-cased substrings
  fileExtensions: string[]; // lower-cased, e.g. ".tsx"
}

export interface Candidate {
  pack_id: string;
  score: number;
}

export interface DomainClassification {
  pack_id: string; // a pack name | "AMBIGUOUS" | "GENERAL"
  confidence: number; // 0..1
  reason: string;
  candidates: Candidate[]; // top-3 with score > 0, descending
}

const NON_PACK_DIRS = new Set(["node_modules", "tests", "__mock__"]);

/** Escape a literal string for safe embedding inside a RegExp source. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile a keyword/negative term to a case-insensitive word-boundary regex. */
function toWordBoundaryRe(term: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(term.trim())}\\b`, "i");
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Compile one pack's domain_signals into matchers. */
export function compilePack(pack_id: string, signals: Partial<DomainSignals>): CompiledPack {
  return {
    pack_id,
    keywordRes: asStringArray(signals.keywords).map(toWordBoundaryRe),
    negativeRes: asStringArray(signals.negative_keywords).map(toWordBoundaryRe),
    intentPhrases: asStringArray(signals.intent_phrases).map((p) => p.toLowerCase()),
    fileExtensions: asStringArray(signals.file_extensions).map((e) => e.toLowerCase()),
  };
}

/** Resolve the repo's canonical packs/ directory relative to this module. */
export function defaultPacksDir(): string {
  // packages/router/src/classify_domain.ts -> <repo>/packs
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "packs");
}

/**
 * Read every packs/<name>/pack.yaml and compile its domain signals.
 * Generic: nothing about the specific seed packs is hard-coded.
 */
export function loadPacks(packsDir: string = defaultPacksDir()): CompiledPack[] {
  return readdirSync(packsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !NON_PACK_DIRS.has(d.name))
    .map((d) => join(packsDir, d.name, "pack.yaml"))
    .filter((p) => existsSync(p))
    .map((p) => {
      const doc = yaml.load(readFileSync(p, "utf8")) as Record<string, unknown>;
      const pack_id =
        typeof doc?.name === "string" ? doc.name : dirname(p).split(/[\\/]/).pop()!;
      const signals = (doc?.domain_signals ?? {}) as Partial<DomainSignals>;
      return compilePack(pack_id, signals);
    });
}

interface ScoredPack {
  pack_id: string;
  score: number;
  keywordHits: number;
  intentHits: number;
  extHits: number;
  negativeHits: number;
}

/** Score a single pack against the prompt. */
function scorePack(pack: CompiledPack, prompt: string, lowerPrompt: string): ScoredPack {
  let keywordHits = 0;
  for (const re of pack.keywordRes) if (re.test(prompt)) keywordHits++;

  let negativeHits = 0;
  for (const re of pack.negativeRes) if (re.test(prompt)) negativeHits++;

  let intentHits = 0;
  for (const phrase of pack.intentPhrases) if (lowerPrompt.includes(phrase)) intentHits++;

  let extHits = 0;
  for (const ext of pack.fileExtensions) if (lowerPrompt.includes(ext)) extHits++;

  const score =
    keywordHits * WEIGHTS.keyword +
    intentHits * WEIGHTS.intent_phrase +
    extHits * WEIGHTS.file_extension +
    negativeHits * WEIGHTS.negative_keyword;

  return { pack_id: pack.pack_id, score, keywordHits, intentHits, extHits, negativeHits };
}

function reasonFor(s: ScoredPack): string {
  const parts: string[] = [];
  if (s.keywordHits) parts.push(`${s.keywordHits} keyword`);
  if (s.intentHits) parts.push(`${s.intentHits} intent`);
  if (s.extHits) parts.push(`${s.extHits} ext`);
  if (s.negativeHits) parts.push(`${s.negativeHits} negative`);
  return parts.join(", ") || "no signal";
}

/**
 * Classify a prompt into a domain pack.
 *   confidence = top_score / sum(top-3 positive scores)
 *   >= 0.6 → single pack; [0.4, 0.6) → AMBIGUOUS (top-3); else GENERAL.
 * top_score <= 0 → GENERAL.
 */
export function classifyDomain(
  prompt: string,
  packs: CompiledPack[],
): DomainClassification {
  const lowerPrompt = prompt.toLowerCase();
  const scored = packs
    .map((p) => scorePack(p, prompt, lowerPrompt))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score <= 0) {
    return { pack_id: "GENERAL", confidence: 0, reason: "no domain signal matched", candidates: [] };
  }

  const sumTop3 = scored.slice(0, 3).reduce((sum, s) => sum + Math.max(0, s.score), 0);
  const confidence = sumTop3 > 0 ? top.score / sumTop3 : 0;
  const candidates: Candidate[] = scored
    .slice(0, 3)
    .filter((s) => s.score > 0)
    .map((s) => ({ pack_id: s.pack_id, score: s.score }));

  let pack_id: string;
  if (confidence >= THRESHOLDS.single) pack_id = top.pack_id;
  else if (confidence >= THRESHOLDS.ambiguous) pack_id = "AMBIGUOUS";
  else pack_id = "GENERAL";

  const reason =
    pack_id === "AMBIGUOUS"
      ? `ambiguous between ${candidates.map((c) => c.pack_id).join(" / ")} (conf ${confidence.toFixed(2)})`
      : `${top.pack_id}: ${reasonFor(top)} (score ${top.score}, conf ${confidence.toFixed(2)})`;

  return { pack_id, confidence, reason, candidates };
}

// --- Wave 2 Day 3: combined v1 (regex) + v2 (embedding) classifier ----------
//
// v1 (regex, sync above) is high-precision when it hits but low-recall on
// paraphrases. v2 (embedding, async, see embedding_store.ts) catches semantic
// matches the regex misses. Combination rules — conservative on purpose so v2
// can only HELP, never silently override a confident v1 verdict:
//
//   1. v1 confident (>= THRESHOLDS.single)        → trust v1 ("regex_confident").
//      Agreement bonus: if v2 also picks the same pack, +0.10 ("agreement").
//   2. v1 AMBIGUOUS and v2 picks one of the candidates with strong similarity
//      (>= EMBED_PROMOTE_SIM)                     → promote to that single pack
//                                                   ("embedding_disambiguates").
//   3. v1 GENERAL but v2 has a strong match
//      (>= EMBED_PROMOTE_SIM)                     → promote to that pack
//                                                   ("embedding_promotes").
//   4. v2 unavailable (Ollama down, no seeds, etc.) → return v1 untouched
//                                                   ("regex_fallback").
//   5. Otherwise return v1 with source="regex".
//
// All branches preserve the existing DomainClassification shape so the hook
// renderers keep working unchanged.

import type { EmbeddingClassification, EmbeddingStore } from "./embedding_store.ts";
import { embeddingStore as defaultEmbeddingStore } from "./embedding_store.ts";

/** Similarity threshold above which v2 is "strong enough" to promote v1. */
export const EMBED_PROMOTE_SIM = 0.55;
/** Confidence bonus added when v1 and v2 independently picked the same pack. */
export const AGREEMENT_BONUS = 0.1;

export type CombinedSource =
  | "regex_confident"
  | "regex"
  | "agreement"
  | "embedding_disambiguates"
  | "embedding_promotes"
  | "regex_fallback";

export interface CombinedDomainClassification extends DomainClassification {
  source: CombinedSource;
  embedding_similarity?: number; // v2 top-pack similarity when available
}

/** Combined v1 + v2 classifier. v2 only helps; never overrides confident v1. */
export async function classifyDomainCombined(
  prompt: string,
  packs: CompiledPack[],
  store: EmbeddingStore = defaultEmbeddingStore,
): Promise<CombinedDomainClassification> {
  const v1 = classifyDomain(prompt, packs);
  const v2: EmbeddingClassification | null = await store.classify(prompt).catch(() => null);

  if (!v2) {
    return { ...v1, source: "regex_fallback" };
  }

  // Rule 1: v1 confident — trust it. Agreement bonus when v2 also picks it.
  if (v1.confidence >= THRESHOLDS.single && v1.pack_id !== "AMBIGUOUS" && v1.pack_id !== "GENERAL") {
    if (v2.pack_id === v1.pack_id) {
      return {
        ...v1,
        confidence: Math.min(1, v1.confidence + AGREEMENT_BONUS),
        reason: `${v1.reason} | embedding agrees (sim=${v2.similarity.toFixed(2)})`,
        source: "agreement",
        embedding_similarity: v2.similarity,
      };
    }
    return { ...v1, source: "regex_confident", embedding_similarity: v2.similarity };
  }

  // Rule 2: v1 AMBIGUOUS but v2 picks one of the candidates with strong sim.
  if (v1.pack_id === "AMBIGUOUS" && v2.similarity >= EMBED_PROMOTE_SIM) {
    const candidateIds = new Set(v1.candidates.map((c) => c.pack_id));
    if (candidateIds.has(v2.pack_id)) {
      return {
        pack_id: v2.pack_id,
        confidence: v2.similarity,
        reason: `${v2.pack_id}: embedding disambiguated (sim=${v2.similarity.toFixed(2)}, was AMBIGUOUS between ${[...candidateIds].join("/")})`,
        candidates: v1.candidates,
        source: "embedding_disambiguates",
        embedding_similarity: v2.similarity,
      };
    }
  }

  // Rule 3: v1 GENERAL but v2 has a strong match — promote.
  if (v1.pack_id === "GENERAL" && v2.similarity >= EMBED_PROMOTE_SIM) {
    return {
      pack_id: v2.pack_id,
      confidence: v2.similarity,
      reason: `${v2.pack_id}: embedding promoted from GENERAL (sim=${v2.similarity.toFixed(2)})`,
      candidates: [{ pack_id: v2.pack_id, score: v2.similarity }],
      source: "embedding_promotes",
      embedding_similarity: v2.similarity,
    };
  }

  // Rule 5 default — v1 stands.
  return { ...v1, source: "regex", embedding_similarity: v2.similarity };
}
