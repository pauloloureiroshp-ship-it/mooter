// L12 — LLMLingua prompt compression (Wave 29 Phase 29.B, opt-in).
//
// Two backends, tried in order under `backend: "auto"`:
//   1. "llmlingua"  — Microsoft LLMLingua (perplexity-based) via a Python
//                     subprocess, IFF `python3 -c "import llmlingua"` succeeds.
//   2. "heuristic"  — a dependency-free, deterministic, entity-safe reducer
//                     (stopword/filler/whitespace pruning). Always available.
// If neither applies (or prompt below the budget floor) the prompt is returned
// verbatim with backend "none". Nothing here ever sits between user and model —
// callers opt in and decide whether to use the compressed string.
//
// Privacy: compression is local-only; no prompt text leaves the process.

import { spawnSync, type SpawnSyncOptions } from "node:child_process";

export type CompressionBackend = "auto" | "llmlingua" | "heuristic" | "none";

export interface CompressionOptions {
  /** Desired compression factor, e.g. 4 means "aim for ~1/4 the tokens". */
  target_ratio: number;
  /** Keep names, paths, URLs, code, error messages, numbers intact. */
  preserve_entities: boolean;
  /** Never compress a prompt at or below this many tokens (no-op floor). */
  budget_min_tokens?: number;
  /** Force a backend. Default "auto". */
  backend?: CompressionBackend;
  /** Injection seam for tests (defaults to node spawnSync). */
  spawn?: (cmd: string, args: string[], opts: SpawnSyncOptions) => { status: number | null; stdout?: Buffer | string };
}

export interface CompressionResult {
  compressed: string;
  original_tokens: number;
  compressed_tokens: number;
  /** original/compressed; 1 means no reduction. */
  ratio: number;
  backend: Exclude<CompressionBackend, "auto">;
  /** Count of protected entity spans left intact (heuristic backend). */
  preserved_entities: number;
}

/**
 * Approximate model tokens. This is a deterministic heuristic (≈ words×1.3 +
 * standalone punctuation), NOT a real BPE tokenizer — good enough for ratio
 * accounting and stable across runs for tests.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.match(/[A-Za-z0-9_]+(?:'[A-Za-z]+)?/g) ?? [];
  const punctuation = text.match(/[^\sA-Za-z0-9_]/g) ?? [];
  return Math.ceil(words.length * 1.3) + punctuation.length;
}

// Filler phrases collapsed before word-level pruning (highest-value drops first).
const FILLER_PHRASES: Array<[RegExp, string]> = [
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bat this point in time\b/gi, "now"],
  [/\bin the event that\b/gi, "if"],
  [/\bfor the purpose of\b/gi, "for"],
  [/\bplease note that\b/gi, ""],
  [/\bit should be noted that\b/gi, ""],
  [/\bas you can see\b/gi, ""],
];

// Tier 1 (drop first): pure filler that carries ~no information.
const FILLER_WORDS = new Set([
  "just", "really", "very", "actually", "basically", "simply", "quite",
  "please", "kindly", "essentially", "literally", "definitely", "certainly",
  "obviously", "clearly", "perhaps", "maybe", "somewhat", "rather",
]);

// Tier 2 (drop next): function words safe to elide in a compressed instruction.
const STOPWORDS = new Set([
  "a", "an", "the", "that", "this", "these", "those", "is", "are", "was",
  "were", "be", "been", "being", "of", "to", "in", "on", "at", "for", "with",
  "and", "or", "but", "so", "as", "by", "from", "into", "about", "than",
  "then", "there", "here", "it", "its", "we", "you", "i", "they",
]);

interface Span { start: number; end: number; }

// Spans that must survive compression when preserve_entities is on.
function protectedSpans(text: string): Span[] {
  const patterns: RegExp[] = [
    /```[\s\S]*?```/g, // fenced code
    /`[^`\n]+`/g, // inline code
    /https?:\/\/[^\s)]+/g, // URLs
    /\b[\w./-]+\.[A-Za-z]{1,5}\b(?::\d+)?/g, // file paths / filenames (foo/bar.ts:12)
    /\b(?:[A-Z][a-z0-9]+){2,}\b/g, // CamelCase identifiers
    /\b\w+_\w+(?:_\w+)*\b/g, // snake_case identifiers
    /\b\d+(?:\.\d+)+\b/g, // versions / decimals (1.2.3)
    /\b(?:[A-Za-z]*Error|Exception)\b[^\n]*?(?=\.\s+[A-Z]|\n|$)/g, // error message (stops at sentence/line end)
    /"[^"\n]*"|'[^'\n]*'/g, // quoted strings
  ];
  const spans: Span[] = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  // Merge overlapping spans.
  spans.sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged;
}

function isProtected(index: number, spans: Span[]): boolean {
  for (const s of spans) {
    if (index >= s.start && index < s.end) return true;
    if (s.start > index) break;
  }
  return false;
}

/**
 * Deterministic, entity-safe heuristic compression. Drops filler phrases, then
 * filler words, then stopwords (in that order) until the target ratio is met or
 * nothing droppable remains, never touching protected spans.
 */
export function compressHeuristic(prompt: string, options: CompressionOptions): CompressionResult {
  const originalTokens = estimateTokens(prompt);
  const targetTokens = Math.max(1, Math.ceil(originalTokens / Math.max(1, options.target_ratio)));

  // 1. Phrase-level collapse (only outside protected spans → apply on a masked copy).
  let working = prompt;
  if (options.preserve_entities) {
    // Apply phrase collapse only where no protected span overlaps the match.
    for (const [re, repl] of FILLER_PHRASES) {
      working = replaceOutsideSpans(working, re, repl);
    }
  } else {
    for (const [re, repl] of FILLER_PHRASES) working = working.replace(re, repl);
  }

  const spans = options.preserve_entities ? protectedSpans(working) : [];
  const preserved = spans.length;

  // 2. Word-level pruning, two tiers, until target reached.
  const tokenRe = /(\s+|[^\sA-Za-z0-9_]+|[A-Za-z0-9_]+(?:'[A-Za-z]+)?)/g;
  type Tok = { text: string; index: number; droppable: 0 | 1 | 2; dropped: boolean };
  const toks: Tok[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(working)) !== null) {
    const text = m[0];
    const index = m.index;
    let droppable: 0 | 1 | 2 = 0;
    const isWord = /^[A-Za-z0-9_]/.test(text);
    if (isWord && !(options.preserve_entities && isProtected(index, spans))) {
      const lower = text.toLowerCase();
      if (FILLER_WORDS.has(lower)) droppable = 1;
      else if (STOPWORDS.has(lower)) droppable = 2;
    }
    toks.push({ text, index, droppable, dropped: false });
  }

  let current = originalTokens;
  for (const tier of [1, 2] as const) {
    if (current <= targetTokens) break;
    for (const t of toks) {
      if (current <= targetTokens) break;
      if (t.droppable === tier && !t.dropped) {
        t.dropped = true;
        // Marginal token cost of removing one word ≈ 1.3 (matches estimateTokens'
        // words×1.3 model); using estimateTokens(word) here over-counts short
        // words and made the loop stop short of the target.
        current -= 1.3;
      }
    }
  }

  // 3. Reassemble, collapsing whitespace left by removals.
  let out = "";
  for (const t of toks) {
    if (t.dropped) continue;
    out += t.text;
  }
  out = out.replace(/[ \t]{2,}/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  const compressedTokens = estimateTokens(out);
  return {
    compressed: out,
    original_tokens: originalTokens,
    compressed_tokens: compressedTokens,
    ratio: compressedTokens > 0 ? originalTokens / compressedTokens : 1,
    backend: "heuristic",
    preserved_entities: preserved,
  };
}

function replaceOutsideSpans(text: string, re: RegExp, repl: string): string {
  const spans = protectedSpans(text);
  re.lastIndex = 0;
  let result = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const overlaps = spans.some((s) => m!.index < s.end && m!.index + m![0].length > s.start);
    result += text.slice(last, m.index);
    result += overlaps ? m[0] : repl;
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  result += text.slice(last);
  return result;
}

/** Probe whether the Python LLMLingua backend is importable. */
export function llmlinguaAvailable(spawn: NonNullable<CompressionOptions["spawn"]> = spawnSync): boolean {
  try {
    const r = spawn("python3", ["-c", "import llmlingua"], { timeout: 4000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Main entry point. Honors the budget floor, picks a backend, returns a result.
 * `backend: "auto"` uses LLMLingua when importable, else the heuristic.
 */
export function compressPrompt(prompt: string, options: CompressionOptions): CompressionResult {
  const originalTokens = estimateTokens(prompt);
  const floor = options.budget_min_tokens ?? 0;
  if (originalTokens <= floor) {
    return {
      compressed: prompt,
      original_tokens: originalTokens,
      compressed_tokens: originalTokens,
      ratio: 1,
      backend: "none",
      preserved_entities: 0,
    };
  }

  const backend = options.backend ?? "auto";
  if (backend === "none") {
    return {
      compressed: prompt,
      original_tokens: originalTokens,
      compressed_tokens: originalTokens,
      ratio: 1,
      backend: "none",
      preserved_entities: 0,
    };
  }
  if (backend === "llmlingua" || (backend === "auto" && llmlinguaAvailable(options.spawn ?? spawnSync))) {
    const viaPython = compressViaLlmLingua(prompt, options);
    if (viaPython) return viaPython;
    // Fall through to heuristic if the subprocess failed.
  }
  return compressHeuristic(prompt, options);
}

// Best-effort call into a local Python LLMLingua. Returns null on any failure so
// the caller falls back to the heuristic. The Python side prints the compressed
// string on stdout; we recompute token counts locally for a single source of truth.
function compressViaLlmLingua(prompt: string, options: CompressionOptions): CompressionResult | null {
  const spawn = options.spawn ?? spawnSync;
  const rate = 1 / Math.max(1, options.target_ratio);
  const py = [
    "import sys, json",
    "from llmlingua import PromptCompressor",
    "data = json.load(sys.stdin)",
    "c = PromptCompressor()",
    "r = c.compress_prompt(data['p'], rate=data['rate'])",
    "sys.stdout.write(r['compressed_prompt'] if isinstance(r, dict) else str(r))",
  ].join("\n");
  try {
    const r = spawn("python3", ["-c", py], {
      input: JSON.stringify({ p: prompt, rate }),
      timeout: 60000,
      encoding: "utf8",
    } as SpawnSyncOptions);
    if (r.status !== 0 || !r.stdout) return null;
    const compressed = (typeof r.stdout === "string" ? r.stdout : r.stdout.toString()).trim();
    if (!compressed) return null;
    const originalTokens = estimateTokens(prompt);
    const compressedTokens = estimateTokens(compressed);
    return {
      compressed,
      original_tokens: originalTokens,
      compressed_tokens: compressedTokens,
      ratio: compressedTokens > 0 ? originalTokens / compressedTokens : 1,
      backend: "llmlingua",
      preserved_entities: 0,
    };
  } catch {
    return null;
  }
}
