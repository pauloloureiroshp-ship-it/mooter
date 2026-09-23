'use strict';
/**
 * prompt-traits.js — what telemetry may keep about a prompt: a hash and
 * closed-vocabulary traits, never the text.
 *
 * /privacy (mooter.ai) says «We log a SHA-256 hash of each prompt — never the
 * text itself». Until 2026-09-23 the hook (`inject_context.js`) and the
 * executor (`router-execute.js`) wrote the first 80 characters of every prompt
 * to `decisions.log` as `prompt_preview`. The fix is to compute, at write time,
 * everything the readers (backtest, event-builder) used to derive from that
 * excerpt, and store only the result:
 *
 *   prompt_sha256        sha256 hex of the full prompt (exact-repeat grouping)
 *   tuning_exclude       any TUNING_EXCLUDE marker (patterns.js) matched
 *   deliberate_high_tier quality-intent / user-override phrase matched
 *   keyword_signals      hits from KEYWORD_ALLOW_LIST (a fixed vocabulary)
 *   has_file_refs        mentions a .js/.ts/.py/.go/.md/.json file
 *   has_code_block       contains ```
 *   is_system_prompt     a Claude Code hook echo (<task-notification>, …)
 *
 * The regex lists and the allow-list live HERE (moved from backtest.js) so the
 * write side and the read side cannot drift.
 */

const crypto = require('crypto');
const { TUNING_EXCLUDE: HIGH_RISK_MARKERS } = require('./patterns');

/** @param {string | undefined | null} text */
function hasHighRisk(text) {
  if (!text) return false;
  return HIGH_RISK_MARKERS.some(/** @param {RegExp} rx */ (rx) => rx.test(text));
}

// Mirror of classify.js QUALITY_INTENT_PATTERNS + USER_OVERRIDE detection.
// These phrases are DELIBERATE high-tier signals. Filtering them out of the
// tuning pool prevents the daily backtest from proposing the same demotions
// every cycle. (2026-04-18 audit — classify.js doesn't export these.)
const QUALITY_INTENT_LOCAL = [
  /\bpensa\s+bem\b/i, /\bpensa\s+(bem\s+)?antes\b/i, /\bultrathink\b/i,
  /\bthink\s+(hard|deeply|carefully|step[-\s]by[-\s]step)\b/i,
  /\bmega\s*think\b/i, /\bpreciso\s+do\s+teu\s+melhor\b/i,
  /\bgive\s+me\s+your\s+best\b/i, /\bdon'?t\s+(mess|screw)\s+this\s+up\b/i,
  /\bn[aã]o\s+podes\s+falhar\b/i, /\bmission\s+critical\b/i,
  /\bdeep\s+dive\s+(analysis)?\b/i,
];
const USER_OVERRIDE_LOCAL = [
  /@(opus|sonnet|haiku|gemini|gpt-?4o?|ollama|qwen)\b/i,
  /\b(usa|use|usar|com|with|via|por)\s+(o\s+)?(opus|sonnet|haiku|gemini|gpt-?4o?|ollama|qwen)\b/i,
  /\bforce\s+(opus|sonnet|haiku|gemini|gpt-?4o?|ollama|qwen)\b/i,
  /\b(sonnet|opus|haiku|gemini|ollama)\s+diagnostica\b/i,
  /\bmodel\s*:\s*(opus|sonnet|haiku|gemini|ollama)\b/i,
];

/** @param {string | undefined | null} text */
function hasDeliberateHighTierSignal(text) {
  if (!text) return false;
  return QUALITY_INTENT_LOCAL.some((rx) => rx.test(text)) ||
         USER_OVERRIDE_LOCAL.some((rx) => rx.test(text));
}

const KEYWORD_ALLOW_LIST = new Set([
  'commit', 'message', 'docstring', 'summarize', 'explain', 'fix',
  'bug', 'error', 'debug', 'trace', 'root cause', 'refactor', 'extract',
  'classify', 'plan', 'design', 'architect', 'review', 'test', 'deploy',
  'migration', 'secret', 'credentials', 'production', 'merge', 'schema',
  'math', 'proof', 'equation', 'step by step', 'reasoning',
]);

/** @param {string | null | undefined} text @returns {string[]} */
function extractKeywordSignals(text) {
  if (!text || typeof text !== 'string') return [];
  const low = text.toLowerCase();
  const hits = [];
  for (const kw of KEYWORD_ALLOW_LIST) {
    if (low.includes(kw)) hits.push(kw);
  }
  return hits;
}

// Non-user prompts injected by Claude Code itself (hook echoes). The savings
// tracker must not count them as user turns. (Moved from savings-tracker.js.)
const SYSTEM_PROMPT_PATTERNS = [
  /^<task-notification>/i,
  /^<system-reminder>/i,
  /^<command-name>/i,
];

/** @param {string | null | undefined} text */
function isSystemPromptText(text) {
  if (!text) return false;
  return SYSTEM_PROMPT_PATTERNS.some((rx) => rx.test(text));
}

/** @param {string} prompt */
function promptSha256(prompt) {
  return crypto.createHash('sha256').update(String(prompt || ''), 'utf8').digest('hex');
}

/**
 * @param {string} prompt
 * @returns {{prompt_sha256: string, tuning_exclude: boolean, deliberate_high_tier: boolean,
 *   keyword_signals: string[], has_file_refs: boolean, has_code_block: boolean, is_system_prompt: boolean}}
 */
function promptTraits(prompt) {
  const text = typeof prompt === 'string' ? prompt : '';
  return {
    prompt_sha256: promptSha256(text),
    tuning_exclude: hasHighRisk(text),
    deliberate_high_tier: hasDeliberateHighTierSignal(text),
    keyword_signals: extractKeywordSignals(text),
    has_file_refs: /\.(js|ts|py|go|md|json)\b/.test(text),
    has_code_block: /```/.test(text),
    is_system_prompt: isSystemPromptText(text),
  };
}

/**
 * Read side: a log line is either legacy (has `prompt_preview`) or new (has
 * `prompt_sha256` + traits). These helpers answer the same questions for both.
 *
 * @param {Record<string, any>} d
 */
function lineHighRisk(d) {
  if (!d) return false;
  if (typeof d.tuning_exclude === 'boolean') return d.tuning_exclude;
  return hasHighRisk(d.prompt_preview);
}

/** @param {Record<string, any>} d */
function lineDeliberateHighTier(d) {
  if (!d) return false;
  if (typeof d.deliberate_high_tier === 'boolean') return d.deliberate_high_tier;
  return hasDeliberateHighTierSignal(d.prompt_preview);
}

/** @param {Record<string, any>} d */
function lineIsSystemPrompt(d) {
  if (!d) return false;
  if (typeof d.is_system_prompt === 'boolean') return d.is_system_prompt;
  return isSystemPromptText(d.prompt_preview);
}

/** @param {Record<string, any>} d @returns {string[]} */
function lineKeywordSignals(d) {
  if (!d) return [];
  if (Array.isArray(d.keyword_signals)) {
    return d.keyword_signals.filter((k) => typeof k === 'string' && KEYWORD_ALLOW_LIST.has(k));
  }
  return extractKeywordSignals(d.prompt_preview);
}

module.exports = {
  HIGH_RISK_MARKERS,
  KEYWORD_ALLOW_LIST,
  hasHighRisk,
  hasDeliberateHighTierSignal,
  extractKeywordSignals,
  promptSha256,
  promptTraits,
  lineHighRisk,
  lineDeliberateHighTier,
  lineKeywordSignals,
  SYSTEM_PROMPT_PATTERNS,
  isSystemPromptText,
  lineIsSystemPrompt,
};
