#!/usr/bin/env node
'use strict';
/**
 * provider-emoji.js — Wave 58.4 Block B (Q4 provider emoji palette).
 *
 * A PURE function module mapping a provider key → a single brand emoji. This is
 * the SSOT for the provider-brand palette; it ships standalone this wave and is
 * NOT yet wired into any rendered chip (Paulo's gate decision Q1, 2026-06-13:
 * "pure module + tests, wire later"). Wiring is deferred until a target provider
 * chip is specified, so there is zero visual regression to the existing model/
 * subscription emoji maps in PostToolUse.js / gsd-statusline.js.
 *
 * Anti-fabrication (Doctrine V4 #5, brief B.4): this maps a key to an emoji — it
 * makes NO claim that the user holds a subscription to any provider. It is a
 * lookup, not a status. Unknown / empty input → the honest 📦 fallback.
 *
 * Palette (brief B.1):
 *   anthropic · claude · claude_max          → 🟠
 *   openai · gpt                             → 🟢
 *   openai_codex_cli · openai_codex · codex  → 🤖
 *   gemini · google                          → 💎
 *   ollama                                   → 🦙
 *   deepseek                                 → 🐳
 *   groq                                     → 🔥
 *   moonshot · kimi                          → 🌙
 *   generic / unknown / empty               → 📦  (fallback)
 *
 * Specificity order matters: "openai_codex" contains "openai", so the codex rule
 * MUST be tested before the openai rule (otherwise codex would resolve to 🟢).
 */

/** The honest fallback when a provider is unknown / empty / unmapped. */
const FALLBACK = '📦';

/**
 * Ordered match rules — most specific first. Each entry is [regex, emoji].
 * Tested against the normalised (lowercased, trimmed) provider string.
 * The order guarantees codex beats openai, kimi/moonshot stay distinct, etc.
 */
const RULES = [
  [/codex/, '🤖'],            // openai_codex_cli / openai_codex / codex (before openai)
  [/moonshot|kimi/, '🌙'],    // Moonshot / Kimi
  [/deepseek/, '🐳'],
  [/groq/, '🔥'],
  [/gemini|google/, '💎'],
  [/ollama/, '🦙'],
  [/anthropic|claude/, '🟠'], // claude_max / claude / anthropic
  [/openai|gpt/, '🟢'],       // generic OpenAI (gpt-*) — after codex
];

/**
 * Map a provider key to its brand emoji. Pure — no filesystem, no I/O.
 *
 * @param {string} provider  a provider key (e.g. "anthropic", "openai_codex_cli",
 *                           "ollama"). Case-insensitive; surrounding whitespace ignored.
 * @returns {string}         the matching emoji, or 📦 when unknown / empty.
 */
function providerEmoji(provider) {
  const p = String(provider == null ? '' : provider).toLowerCase().trim();
  if (!p) return FALLBACK;
  for (const [re, emoji] of RULES) {
    if (re.test(p)) return emoji;
  }
  return FALLBACK;
}

module.exports = { providerEmoji, FALLBACK };

if (require.main === module) {
  const out = providerEmoji(process.argv[2]);
  process.stdout.write(out + '\n');
}
