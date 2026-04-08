#!/usr/bin/env node
/**
 * pricing.js — single source of truth for model pricing (USD per MTok).
 *
 * Used by savings-tracker.js, stats.js, backtest.js. Update this file
 * periodically as Anthropic/OpenAI/Google prices change. Keep the shape
 * {input, output} so every consumer can compute turn cost as:
 *
 *   (tokens_in  * price.input  / 1e6)  +
 *   (tokens_out * price.output / 1e6)
 *
 * Ollama and any local model map to {0, 0}. Unknown models fall back to
 * FALLBACK_PRICE (Sonnet-tier) so we never crash on a typo — but the
 * estimate will be wrong until added here.
 *
 * Last reviewed: 2026-04-07. Cross-check against:
 *   https://www.anthropic.com/pricing
 *   https://platform.openai.com/docs/pricing
 *   https://ai.google.dev/pricing
 */

'use strict';

// USD per 1M tokens. {input, output, strengths?, tier?}.
// The optional `strengths` and `tier` fields are consumed by classify.js
// (sub-tier selection) and by check-local-models.js (install guide). They
// don't affect cost math, but keeping everything in one registry avoids
// drift between pricing and routing.
const PRICES = {
  // ── Anthropic (Claude) ─────────────────────────────────────────────
  'claude-opus-4-6':                 { input: 15.0,  output: 75.0,  strengths: ['architecture','refactor','long-context'], tier: 'T3' },
  'claude-opus-4-6[1m]':             { input: 30.0,  output: 150.0, strengths: ['long-context'],                            tier: 'T3' }, // >200k ctx: 2×
  'claude-sonnet-4-6':               { input:  3.0,  output: 15.0,  strengths: ['code','reasoning','debug'],                tier: 'T2' },
  'claude-sonnet-4-6[1m]':           { input:  6.0,  output: 22.5,  strengths: ['long-context'],                            tier: 'T2' },
  'claude-haiku-4-5':                { input:  0.80, output:  4.0,  strengths: ['light-code','explain','regex','commit'],   tier: 'T1' },
  'claude-haiku-4-5-20251001':       { input:  0.80, output:  4.0,  strengths: ['light-code','explain','regex','commit'],   tier: 'T1' },
  // Legacy mappings that may appear in older logs
  'claude-opus-4':                   { input: 15.0,  output: 75.0  },
  'claude-sonnet-4':                 { input:  3.0,  output: 15.0  },
  'claude-haiku-3-5':                { input:  0.80, output:  4.0  },

  // ── Local / free (Ollama) ──────────────────────────────────────────
  // v0.7: specialists added. See classify.js sub-tier routing + doctrine
  // files. check-local-models.js surfaces which of these are installed.
  'qwen2.5:3b':                      { input: 0, output: 0, strengths: ['general','summarize','translate','quick-answer'], tier: 'T0', subtier: 'general' },
  'qwen3:30b':                       { input: 0, output: 0, strengths: ['reasoning-local'],                                 tier: 'T0', subtier: 'reason' },
  'qwen2.5-coder:14b-q4':            { input: 0, output: 0, strengths: ['code','refactor-local','lint','regex'],            tier: 'T0', subtier: 'code' },
  'qwen2.5-coder:14b':               { input: 0, output: 0, strengths: ['code','refactor-local','lint','regex'],            tier: 'T0', subtier: 'code' },
  'deepseek-r1-distill-qwen:14b':    { input: 0, output: 0, strengths: ['math','reasoning','step-by-step'],                 tier: 'T0', subtier: 'math' },
  'deepseek-r1:7b':                  { input: 0, output: 0, strengths: ['math','reasoning'],                                tier: 'T0', subtier: 'math' },
  'ollama':                          { input: 0, output: 0 }, // generic

  // ── Google (Gemini) — optional, not emitted by classifier yet ──────
  'gemini-2.5-flash':                { input: 0.075, output: 0.30 },
  'gemini-2.5-pro':                  { input: 1.25,  output: 5.0  },

  // ── OpenAI (if Codex CLI or similar is added later) ────────────────
  'gpt-4o':                          { input: 2.50,  output: 10.0 },
  'gpt-4o-mini':                     { input: 0.15,  output: 0.60 },
};

// Unknown model fallback — Sonnet-tier so the estimate is neither
// free nor Opus. Forces the operator to notice when a new model appears.
const FALLBACK_PRICE = { input: 3.0, output: 15.0 };

// Tier → canonical model used when we only have the tier (from classify.js).
// Matches TIER_TO_MODEL in savings-tracker.js but resolved to the pricing key.
const TIER_TO_PRICING_KEY = {
  T0: 'qwen2.5:3b',
  T1: 'claude-haiku-4-5',
  T2: 'claude-sonnet-4-6',
  T3: 'claude-opus-4-6',
};

// Average output tokens per turn by tier. Calibrated against real
// session data — update when stats.js backtest shows drift.
const AVG_OUTPUT_TOK = {
  T0: 200,   // local models are asked for short structured answers
  T1: 350,   // commit msg, docstring, regex
  T2: 900,   // bug hunt, plan, refactor description
  T3: 1800,  // architecture doc, multi-file diff
};

// Chars-per-token estimator. PT-PT + code averages ~3.5 chars/tok for
// Claude's BPE tokenizer. Conservative — real counts vary ±20%.
const CHARS_PER_TOKEN = 3.5;

/**
 * Estimate input tokens from a prompt_len field in decisions.log.
 * NOTE: this is JUST the user's prompt text. Real input tokens include
 * the full system prompt + tools schema + prior turns, which is ~5-15k
 * in a typical Claude Code session. We add a conservative base below.
 */
const SESSION_CONTEXT_BASE_TOKENS = 8000; // system + tools + short hx

function estimateInputTokens(promptLenChars) {
  if (!Number.isFinite(promptLenChars) || promptLenChars <= 0) {
    return SESSION_CONTEXT_BASE_TOKENS;
  }
  return SESSION_CONTEXT_BASE_TOKENS + Math.ceil(promptLenChars / CHARS_PER_TOKEN);
}

function getPrice(modelKey) {
  if (!modelKey) return FALLBACK_PRICE;
  if (PRICES[modelKey]) return PRICES[modelKey];
  // Loose match: ollama:* → ollama
  if (modelKey.startsWith('ollama')) return PRICES['ollama'];
  return FALLBACK_PRICE;
}

/**
 * priceTurn(model, tokensIn, tokensOut) → USD
 * Central cost function. Use for everything. Returns 0 for local models.
 */
function priceTurn(modelKey, tokensIn, tokensOut) {
  const p = getPrice(modelKey);
  const ti = Math.max(0, Number(tokensIn) || 0);
  const to = Math.max(0, Number(tokensOut) || 0);
  return (ti * p.input + to * p.output) / 1e6;
}

/**
 * estimateTurnCost(tier, promptLenChars) → USD
 * The main entry point for savings-tracker: given only a classifier
 * decision (tier + prompt_len), produce the best cost estimate we can.
 */
function estimateTurnCost(tier, promptLenChars) {
  const modelKey = TIER_TO_PRICING_KEY[tier];
  if (!modelKey) return 0;
  const tokensIn = estimateInputTokens(promptLenChars);
  const tokensOut = AVG_OUTPUT_TOK[tier] || 500;
  return priceTurn(modelKey, tokensIn, tokensOut);
}

/**
 * naiveOpusCost(promptLenChars) → USD
 * "What would this prompt have cost if we had no router and the full
 * Opus-with-1M-context session had to process it?" This is the honest
 * baseline we subtract from to report savings.
 */
function naiveOpusCost(promptLenChars) {
  const tokensIn = estimateInputTokens(promptLenChars);
  // Opus answers are verbose when unconstrained — use T3 avg output
  return priceTurn('claude-opus-4-6', tokensIn, AVG_OUTPUT_TOK.T3);
}

module.exports = {
  PRICES,
  FALLBACK_PRICE,
  TIER_TO_PRICING_KEY,
  AVG_OUTPUT_TOK,
  SESSION_CONTEXT_BASE_TOKENS,
  CHARS_PER_TOKEN,
  getPrice,
  priceTurn,
  estimateInputTokens,
  estimateTurnCost,
  naiveOpusCost,
};
