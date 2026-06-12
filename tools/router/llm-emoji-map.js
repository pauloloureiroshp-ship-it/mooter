#!/usr/bin/env node
/**
 * llm-emoji-map.js — Wave 58 Phase A.4
 *
 * Canonical per-LLM emoji map: maps a model ID (or family name) to a
 * { emoji, label, color } descriptor. Used by statusline chips, CLI output,
 * and the dynamic-UI agent-identity layer.
 *
 * Families:
 *   mooter  — 🐮 pink   (Mooter native / local-first)
 *   claude  — ✨ amber  (Anthropic Claude: Opus, Sonnet, Haiku, any claude-*)
 *   fable   — 🌟 gold   (Claude Fable / T5 opt-in only)
 *   openai  — 🟢 green  (OpenAI, Codex, GPT)
 *   gemini  — 💎 blue   (Google Gemini)
 *   ollama  — 🦙 tan    (Ollama, llama.cpp, vLLM, any local open-weight)
 *   unknown — 🤖 gray   (unrecognised)
 *
 * Status indicators (model-agnostic):
 *   thinking  → 💭
 *   executing → 🛠
 *   waiting   → ⏳
 *   queued    → ❄️
 *   complete  → ✅
 *   error     → ❌
 *
 * Anti-fabrication (Doctrine V4 §5): emojiForModel returns the 🤖 unknown
 * entry — never a remembered/invented entry — for any unrecognised model ID.
 *
 * No new runtime dependencies. CommonJS ('use strict').
 */
'use strict';

// ---------------------------------------------------------------------------
// Raw family map
// ---------------------------------------------------------------------------

/** @type {Record<string, {emoji: string, label: string, color: string}>} */
const FAMILY_MAP = {
  mooter:  { emoji: '🐮', label: 'Mooter',  color: 'pink'  },
  claude:  { emoji: '✨', label: 'Claude',  color: 'amber' },
  fable:   { emoji: '🌟', label: 'Fable',   color: 'gold'  },
  openai:  { emoji: '🟢', label: 'OpenAI',  color: 'green' },
  gemini:  { emoji: '💎', label: 'Gemini',  color: 'blue'  },
  ollama:  { emoji: '🦙', label: 'Ollama',  color: 'tan'   },
  unknown: { emoji: '🤖', label: 'Unknown', color: 'gray'  },
};

// ---------------------------------------------------------------------------
// Status indicators
// ---------------------------------------------------------------------------

/** @type {Record<string, string>} */
const STATUS_EMOJI_MAP = {
  thinking:  '💭',
  executing: '🛠',
  waiting:   '⏳',
  queued:    '❄️',
  complete:  '✅',
  error:     '❌',
};

// ---------------------------------------------------------------------------
// Model-ID → family resolution
//
// Rules applied in ORDER (first match wins). All comparisons are on the
// lower-cased, whitespace-stripped model ID.
// ---------------------------------------------------------------------------

/**
 * Normalise a model ID for matching (lowercase, trim, collapse internal
 * whitespace).
 * @param {string} id
 * @returns {string}
 */
function normalise(id) {
  return typeof id === 'string' ? id.trim().toLowerCase().replace(/\s+/g, '-') : '';
}

/**
 * Map a normalised model ID to a family key using prefix/substring rules.
 * Returns 'unknown' for anything unrecognised.
 * @param {string} norm  — already normalised (lowercase, trimmed)
 * @returns {string}    family key
 */
function familyFromNorm(norm) {
  if (!norm) return 'unknown';

  // Mooter-native (must check before 'ollama' since mooter runs local)
  if (norm === 'mooter' || norm.startsWith('mooter-') || norm.startsWith('mooter:')) {
    return 'mooter';
  }

  // Claude Fable (T5 opt-in) — must check before generic 'claude'
  if (
    norm.includes('fable') ||
    norm.startsWith('claude-fable') ||
    norm.startsWith('us.anthropic.claude-fable') ||
    // internal model IDs sometimes surface as 'fable-*'
    /^fable[-:]/.test(norm)
  ) {
    return 'fable';
  }

  // Claude (any Anthropic model)
  if (
    norm.startsWith('claude') ||
    norm.startsWith('anthropic') ||
    norm.startsWith('us.anthropic') ||
    norm.includes('claude-')
  ) {
    return 'claude';
  }

  // OpenAI / Codex / GPT
  if (
    norm.startsWith('gpt') ||
    norm.startsWith('gpt-') ||
    norm.startsWith('o1') ||
    norm.startsWith('o3') ||
    norm.startsWith('o4') ||
    norm.startsWith('codex') ||
    norm.includes('openai') ||
    norm.startsWith('text-davinci') ||
    norm.startsWith('davinci') ||
    norm.startsWith('curie') ||
    norm.startsWith('babbage') ||
    norm.startsWith('ada')
  ) {
    return 'openai';
  }

  // Google Gemini
  if (
    norm.startsWith('gemini') ||
    norm.includes('gemini') ||
    norm.startsWith('google/gemini') ||
    norm.startsWith('models/gemini')
  ) {
    return 'gemini';
  }

  // Ollama / llama.cpp / vLLM / open-weight local models
  // Covers qwen*, llama*, mistral*, phi*, gemma*, deepseek*, yi*, falcon*,
  // vicuna*, orca*, codellama*, starcoder*, wizardcoder*, solar*, internlm*,
  // mixtral*, dolphin*, openchat*, neural*, tinyllama*, stable-beluga*, etc.
  if (
    norm.startsWith('ollama:') ||
    norm.startsWith('ollama/') ||
    norm.includes('llama') ||
    norm.startsWith('qwen') ||
    norm.startsWith('mistral') ||
    norm.startsWith('phi') ||
    norm.startsWith('gemma') ||
    norm.startsWith('deepseek') ||
    norm.startsWith('yi-') ||
    norm.startsWith('falcon') ||
    norm.startsWith('vicuna') ||
    norm.startsWith('orca') ||
    norm.startsWith('codellama') ||
    norm.startsWith('starcoder') ||
    norm.startsWith('wizardcoder') ||
    norm.startsWith('solar') ||
    norm.startsWith('internlm') ||
    norm.startsWith('mixtral') ||
    norm.startsWith('dolphin') ||
    norm.startsWith('openchat') ||
    norm.startsWith('neural') ||
    norm.startsWith('tinyllama') ||
    norm.startsWith('stable-beluga') ||
    norm.startsWith('vllm') ||
    norm.includes('llm.cpp') ||
    norm.startsWith('gguf') ||
    norm.endsWith('.gguf')
  ) {
    return 'ollama';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the descriptor for a given family key.
 * Falls back to 'unknown' for absent/invalid keys.
 * @param {string} fam
 * @returns {{emoji: string, label: string, color: string}}
 */
function emojiForFamily(fam) {
  return FAMILY_MAP[fam] || FAMILY_MAP.unknown;
}

/**
 * Return the descriptor for a model ID string using robust prefix matching.
 * Never fabricates: unrecognised IDs → 🤖 unknown.
 *
 * Examples:
 *   'claude-opus-4-8'      → ✨ Claude  amber
 *   'gpt-5-3-codex'        → 🟢 OpenAI  green
 *   'qwen3-30b'            → 🦙 Ollama  tan
 *   'gemini-2.5-pro'       → 💎 Gemini  blue
 *   'claude-fable-5'       → 🌟 Fable   gold
 *   'mooter-sonnet-4-6'    → 🐮 Mooter  pink
 *   'totally-unknown-x99'  → 🤖 Unknown gray
 *
 * @param {string} modelId
 * @returns {{emoji: string, label: string, color: string}}
 */
function emojiForModel(modelId) {
  const norm = normalise(modelId);
  return emojiForFamily(familyFromNorm(norm));
}

/**
 * Return the status emoji for a given state string.
 * Falls back to '🤖' (unknown/generic) for absent/invalid states.
 * @param {string} state — 'thinking' | 'executing' | 'waiting' | 'queued' | 'complete' | 'error'
 * @returns {string}
 */
function statusEmoji(state) {
  if (typeof state !== 'string') return '🤖';
  return STATUS_EMOJI_MAP[state.toLowerCase().trim()] || '🤖';
}

module.exports = {
  FAMILY_MAP,
  STATUS_EMOJI_MAP,
  emojiForFamily,
  emojiForModel,
  statusEmoji,
  // internal — exported for tests
  familyFromNorm,
  normalise,
};
