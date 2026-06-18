#!/usr/bin/env node
// @ts-check
/**
 * prompt-optimizer.js — heuristic prompt reformatter for the mooter router.
 *
 * Called by inject_context.js after classify.js, before <router-hint> emission.
 * Produces a dense, tier-aware reformulation of the user prompt that the model
 * uses as an execution anchor. The ORIGINAL prompt is never altered — Claude Code
 * does not support interception. The optimized version rides alongside in
 * <optimized-task> within the hint context.
 *
 * Budget: < 5ms per call. Pure regex/string — zero LLM, zero I/O, zero deps.
 *
 * Strategies (applied sequentially, composable):
 *   S1 — Verbal padding removal
 *   S2 — Tier-aware reformatting
 *   S3 — Category-aware task framing
 *   S4 — Error trace structuring
 *   S5 — Multi-language normalization hint
 *
 * Guardrails:
 *   - NEVER optimize HIGH_RISK prompts
 *   - NEVER optimize architecture_or_critical category
 *   - NEVER optimize prompts < 30 chars (overhead > benefit)
 *   - NEVER re-optimize (skip if <optimized-task> already present)
 *   - Fail silently — any error → null
 */

'use strict';

/**
 * @typedef {Object} OptimizerDecision
 * @property {string} [tier]
 * @property {string} [task_category]
 * @property {string} [recommended_model]
 * @property {boolean} [has_error_trace]
 * @property {string} [lang_detected]
 *
 * @typedef {Object} OptimizeResult
 * @property {string} optimized_task
 * @property {number} tokens_saved_est
 * @property {string} strategy
 */

// ── S1: Verbal padding removal ─────────────────────────────────────────
// Remove conversational noise that adds zero information for the model.
// Two passes: PT-PT patterns first, then EN patterns.

const PADDING_PT = [
  /\b(?:podes|consegues|poderías|poderias)\s+(?:por favor\s+)?/gi,
  /\b(?:olha l[aá]|olha|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|ora bem|pronto)\s*[,.]?\s*/gi,
  /\bpor favor\b[,.]?\s*/gi,
  /\b(?:gostava|gostaria)\s+(?:que\s+)?(?:tu\s+)?/gi,
  /\b(?:será que|ser[aá] que)\s+/gi,
  /\b(?:queria|eu queria|eu preciso que|preciso que tu)\s+/gi,
];

const PADDING_EN = [
  /\b(?:can you|could you|would you|will you)\s+(?:please\s+)?/gi,
  /\b(?:I would like you to|I'd like you to|I want you to|I need you to)\s+/gi,
  /\b(?:please|pls|plz)\b[,.]?\s*/gi,
  /\b(?:hey|hi|hello|hi there|hey there)\s*[,.]?\s*/gi,
  /\b(?:thanks|thank you|thx|cheers)\s*[,.]?\s*/gi,
  /\b(?:so basically|basically|actually|well)\s*[,.]?\s*/gi,
  /\b(?:do you think you can|is it possible to|would it be possible to)\s+/gi,
];

/** @param {string} text @returns {string} */
function removePadding(text) {
  let result = text;
  for (const rx of PADDING_PT) result = result.replace(rx, '');
  for (const rx of PADDING_EN) result = result.replace(rx, '');
  // Collapse multiple spaces and leading/trailing whitespace.
  result = result.replace(/\s{2,}/g, ' ').trim();
  // Capitalize first char if it was lowered by removal.
  if (result.length > 0 && /^[a-záàâãéèêíïóôõúüç]/.test(result)) {
    result = result[0].toUpperCase() + result.slice(1);
  }
  return result;
}

// ── S2: Tier-aware reformatting ─────────────────────────────────────────

/** @param {string} text @returns {string} */
function reformatForT0(text) {
  // Compress: remove articles, redundant prepositions, collapse to imperative.
  let t = text;
  // Remove common PT articles and prepositions (only mid-sentence, not start).
  t = t.replace(/\b(?:o|a|os|as|um|uma|uns|umas|do|da|dos|das|no|na|nos|nas|ao|à|aos|às|de|em|com|para|pelo|pela)\s+/gi, (/** @type {string} */ m, /** @type {number} */ offset) => {
    // Keep if at start of sentence or after period/colon.
    if (offset === 0) return m;
    const prev = t[offset - 1];
    if (prev === '.' || prev === ':' || prev === '\n') return m;
    return ' ';
  });
  // Remove EN articles mid-sentence.
  t = t.replace(/\s\b(?:the|a|an|of|in|on|at|to|for|with|from|by)\b\s/gi, ' ');
  // Collapse whitespace.
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

/** @param {string} text @returns {string} */
function reformatForT1(text) {
  // Direct instruction, strip "because" clauses that are obvious.
  let t = text;
  t = t.replace(/\s*(?:porque|because|since|já que|dado que|visto que)\s+[^.;]+[.;]?\s*/gi, '. ');
  t = t.replace(/\s{2,}/g, ' ').trim();
  // Ensure ends with period or question mark.
  if (t.length > 0 && !/[.?!]$/.test(t)) t += '.';
  return t;
}

/** @param {string} text @returns {string} */
function reformatForT2(text) {
  // Structure multi-step prompts as bullet points.
  // Detect sentence boundaries and reformat if ≥ 3 sentences.
  const sentences = text.split(/(?<=[.!?])\s+/).filter((/** @type {string} */ s) => s.trim().length > 5);
  if (sentences.length >= 3) {
    return sentences.map((/** @type {string} */ s) => `- ${s.trim()}`).join('\n');
  }
  return text;
}

/** @param {string} text @returns {string} */
function reformatForT3(text) {
  // For Opus: enrich with explicit structure if the prompt mixes context+task.
  // Detect if there's a question or imperative at the end.
  const lines = text.split(/\n/).filter(Boolean);
  if (lines.length < 2) {
    // Single block — try to split into context + task.
    const questionMatch = text.match(/(.+?)(\?[^?]*$)/s);
    if (questionMatch && questionMatch[1].length > 50) {
      return `Context: ${questionMatch[1].trim()}\nTask: ${questionMatch[2].trim()}`;
    }
    return text;
  }
  // Multi-line — check if already has structure (headers, bullets).
  const hasStructure = lines.some((/** @type {string} */ l) => /^[-*•]|^#+\s|^(?:Context|Task|Constraint|Step)/i.test(l.trim()));
  if (hasStructure) return text; // Already structured, don't touch.
  // Heuristic: last line is the task, rest is context.
  const context = lines.slice(0, -1).join('\n').trim();
  const task = lines[lines.length - 1].trim();
  return `Context:\n${context}\n\nTask: ${task}`;
}

/**
 * @param {string} text
 * @param {string | undefined} tier
 * @returns {string}
 */
function tierReformat(text, tier) {
  switch (tier) {
    case 'T0': return reformatForT0(text);
    case 'T1': return reformatForT1(text);
    case 'T2': return reformatForT2(text);
    case 'T3': return reformatForT3(text);
    default:   return text;
  }
}

// ── S3: Category-aware task framing ────────────────────────────────────

/**
 * @param {string} text
 * @param {string} category
 * @returns {string}
 */
function categoryFrame(text, category) {
  switch (category) {
    case 'bug_hunt_or_debug':
    case 'bug_investigation':
      // Prefix with "Debug:" if not already present.
      if (/^debug/i.test(text.trim())) return text;
      return `Debug: ${text}`;

    case 'cheap_task':
    case 'commit_or_docstring':
      if (/^(?:commit|docstring|gera)/i.test(text.trim())) return text;
      return text; // Already specialized, no framing needed.

    case 'summarize_or_trivial':
    case 'simple_transform_or_explain':
      if (/\b(?:resume|resumo|summari[zs]e)\b/i.test(text))
        return /^(?:Summar|Resume)/i.test(text.trim()) ? text : `Summarize: ${text}`;
      if (/\b(?:traduz|translate)\b/i.test(text))
        return /^Translat/i.test(text.trim()) ? text : `Translate: ${text}`;
      if (/\b(?:format|transforma|convert)\b/i.test(text))
        return /^(?:Format|Transform|Convert)/i.test(text.trim()) ? text : `Transform: ${text}`;
      return text;

    case 'code_generation':
      if (/^implement/i.test(text.trim())) return text;
      return `Implement: ${text}`;

    case 'math_or_reasoning':
    case 'reasoning_intermediate':
      if (/^solve\s+step/i.test(text.trim())) return text;
      return `Solve step-by-step: ${text}`;

    case 'trivial_local':
    case 'ambiguous_short':
    case 'ambiguous_medium':
    case 'ambiguous_long':
      // Sub-detect intent for better framing (overnight-tuning 2026-04-12)
      if (/\b(?:resume|resumo|summari[zs]e|explain|explica)\b/i.test(text))
        return /^(?:Summar|Explica|Resume)/i.test(text.trim()) ? text : `Summarize: ${text}`;
      if (/\b(?:traduz|translate)\b/i.test(text))
        return /^Translat/i.test(text.trim()) ? text : `Translate: ${text}`;
      if (/\b(?:format|transforma|convert)\b/i.test(text))
        return /^(?:Format|Transform|Convert)/i.test(text.trim()) ? text : `Transform: ${text}`;
      return text;

    default:
      return text;
  }
}

// ── S4: Error trace structuring ────────────────────────────────────────

const ERROR_LINE_RE = /(?:^|\n)\s*((?:[A-Z]\w*)?Error|TypeError|ReferenceError|SyntaxError|RangeError):\s*(.+)/;
const STACK_LINE_RE = /^\s+at\s+.+/gm;

/** @param {string} text @returns {string | null} */
function structureErrorTrace(text) {
  const errorMatch = text.match(ERROR_LINE_RE);
  if (!errorMatch) return null;

  const errorType = errorMatch[1];
  const errorMsg = errorMatch[2].trim();

  // Extract first 3 stack lines.
  const stackLines = (text.match(STACK_LINE_RE) || []).slice(0, 3);
  const stack = stackLines.length > 0
    ? stackLines.map(l => l.trim()).join('\n')
    : null;

  // Everything before the error line is context.
  const errorIdx = text.indexOf(errorMatch[0]);
  const contextBefore = errorIdx > 0 ? text.slice(0, errorIdx).trim() : null;

  const parts = [];
  parts.push(`Bug: ${errorType}: ${errorMsg}`);
  if (stack) parts.push(`Stack:\n${stack}`);
  if (contextBefore && contextBefore.length > 10) parts.push(`Context: ${contextBefore}`);
  parts.push('Task: identify root cause and propose fix');

  return parts.join('\n');
}

// ── S5: Multi-language normalization ───────────────────────────────────

/**
 * @param {string} text
 * @param {string} langDetected
 * @param {string | undefined} tier
 * @returns {string}
 */
function langHint(text, langDetected, tier) {
  // Only add hint for T1/T2 where models respond better with explicit lang signal.
  if (tier !== 'T1' && tier !== 'T2') return text;
  if (langDetected === 'en' || langDetected === 'other') return text;
  // PT prompt going to Haiku/Sonnet — add note.
  const hint = `[Note: user prompt in ${langDetected.toUpperCase()} — respond in ${langDetected.toUpperCase()}]`;
  return `${text}\n${hint}`;
}

// ── Main optimize function ─────────────────────────────────────────────

const HIGH_RISK_HINT = /\b(?:push|deploy|release|migration|migrac|drop\s+table|rm\s+-rf|reset\s+--hard|\.env|secret|credential|api[_ ]?key|architect|arquitetur|refactor|refator|critical|cr[ií]tic|audit|review\s+final|merge|ci\s+pipeline|\.github\/workflow)/i;

/**
 * optimize(prompt, decision) → result | null
 *
 * @param {string} prompt   — raw user prompt
 * @param {OptimizerDecision | null | undefined} decision — classify.js output (task_category, tier, etc.)
 * @returns {OptimizeResult | null}
 */
function optimize(prompt, decision) {
  if (!prompt || typeof prompt !== 'string') return null;
  if (!decision || typeof decision !== 'object') return null;

  const tier = decision.tier;
  const category = decision.task_category || '';
  const model = decision.recommended_model || '';

  // v0.10.2: Model-aware strategy preference from A/B test data (57 tests).
  // qwen2.5:3b benefits from s1+s2 (padding + tier reformat).
  // Larger models (gemma3, gemma4, deepseek-r1) benefit from s1+s3 (padding + category frame).
  // This biases strategy order: for small models, prioritise s2; for large, prioritise s3.
  const preferCategoryFrame = /gemma|deepseek|qwen3/i.test(model);

  // Guardrails.
  if (prompt.length < 30) return null;
  if (HIGH_RISK_HINT.test(prompt)) return null;
  if (category === 'architecture_or_critical') return null;
  if (category === 'cross_file_change') return null;
  // Wave 63 GAP 5 — never compress a DENSE code_generation prompt (fenced code,
  // multi-line code spec, or symbol-heavy body): removePadding/reformatForT0 strip
  // articles & prepositions and collapse whitespace, which can corrupt code,
  // identifiers, or string literals. Short/light code prompts still optimize. The
  // literature flags code as the compression-sensitive case (today only
  // architecture/cross-file were guarded).
  if (category === 'code_generation' && isDenseCodePrompt(prompt)) return null;
  if (/<optimized-task/.test(prompt)) return null;
  if (category === 'bash_command_paste') return null;
  if (category === 'file_read_intent') return null;

  const strategies = [];
  let working = prompt;

  // S1 — Padding removal (always applied first).
  const afterPadding = removePadding(working);
  if (afterPadding !== working && afterPadding.length > 0) {
    strategies.push('s1');
    working = afterPadding;
  }

  // S4 — Error trace structuring (before tier reformat, since it
  // replaces the entire text if an error trace is found).
  if (decision.has_error_trace) {
    const structured = structureErrorTrace(working);
    if (structured) {
      strategies.push('s4');
      working = structured;
    }
  }

  // v0.10.2: Model-aware strategy order. A/B data (57 tests) shows:
  //   Small models (qwen2.5:3b): s2 first → s3 (s1+s2 dominant, 17-14 wins)
  //   Large models (gemma3/4, deepseek): s3 first → s2 (s1+s3 dominant, 8-1 wins)
  // When s3 runs first, it adds category prefix ("Debug:", "Solve step-by-step:")
  // which gives larger models better framing before tier reformat.
  if (preferCategoryFrame) {
    // S3 first for larger models
    const afterCategory = categoryFrame(working, category);
    if (afterCategory !== working) { strategies.push('s3'); working = afterCategory; }
    const afterTier = tierReformat(working, tier);
    if (afterTier !== working) { strategies.push('s2'); working = afterTier; }
  } else {
    // S2 first for smaller models (default, original order)
    const afterTier = tierReformat(working, tier);
    if (afterTier !== working) { strategies.push('s2'); working = afterTier; }
    const afterCategory = categoryFrame(working, category);
    if (afterCategory !== working) { strategies.push('s3'); working = afterCategory; }
  }

  // S5 — Language normalization hint.
  const langDetected = decision.lang_detected || 'en';
  const afterLang = langHint(working, langDetected, tier);
  if (afterLang !== working) {
    strategies.push('s5');
    working = afterLang;
  }

  // If nothing changed, no optimization needed.
  if (strategies.length === 0) return null;
  if (working === prompt) return null;

  // Estimate tokens saved (chars / 4 is a rough token estimate).
  const charsSaved = Math.max(0, prompt.length - working.length);
  const tokensSaved = Math.round(charsSaved / 4);

  return {
    optimized_task: working,
    tokens_saved_est: tokensSaved,
    strategy: strategies.join('+'),
  };
}

// ── Wave 63 GAP 5: dense-code detection ─────────────────────────────────
/**
 * True when a prompt carries dense code/structure that destructive compression
 * (article/preposition removal + whitespace collapse) could corrupt: a fenced
 * code block, a multi-line code spec, or a symbol-heavy body. Short/light code
 * prompts return false (safe to optimize). Pure; never throws.
 * @param {string} text @returns {boolean}
 */
function isDenseCodePrompt(text) {
  if (!text || typeof text !== 'string') return false;
  if (/```/.test(text)) return true; // fenced code block
  const codeToken = /[{};]|=>|\bdef\b|\bfunction\b|\bclass\b|\bimport\b|\breturn\b|\bconst\b|\blet\b|#include/;
  const lines = text.split('\n');
  if (lines.length >= 4 && codeToken.test(text)) return true; // multi-line code spec
  if (text.length > 120) {
    const symbols = (text.match(/[{}()[\]<>;=|&/*+]/g) || []).length;
    if (symbols / text.length > 0.12) return true; // symbol-heavy body
  }
  return false;
}

// ── Exports ────────────────────────────────────────────────────────────

module.exports = {
  optimize,
  // Exposed for testing:
  isDenseCodePrompt,
  removePadding,
  reformatForT0,
  reformatForT1,
  reformatForT2,
  reformatForT3,
  categoryFrame,
  structureErrorTrace,
  langHint,
};
