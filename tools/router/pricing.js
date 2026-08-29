#!/usr/bin/env node
// @ts-check
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
 * Last reviewed: 2026-08-03. Cross-check against:
 *   https://www.anthropic.com/pricing
 *   https://platform.openai.com/docs/pricing
 *   https://ai.google.dev/pricing
 */

'use strict';

/**
 * @typedef {'T0'|'T1'|'T2'|'T3'} Tier
 * @typedef {Object} ModelPrice
 * @property {number} input  - USD per 1M input tokens
 * @property {number} output - USD per 1M output tokens
 * @property {string[]} [strengths] - optional classifier hints
 * @property {Tier} [tier]
 * @property {string} [subtier]
 */

// USD per 1M tokens. {input, output, strengths?, tier?}.
// The optional `strengths` and `tier` fields are consumed by classify.js
// (sub-tier selection) and by check-local-models.js (install guide). They
// don't affect cost math, but keeping everything in one registry avoids
// drift between pricing and routing.
/** @type {Record<string, ModelPrice>} */
const PRICES = {
  // ── Anthropic (Claude) — verified 2026-04-16 from platform.claude.com ──
  // NOTE: Opus 4.6 dropped from $15/$75 to $5/$25. 1M context is now
  // included at standard pricing (no 2x surcharge). The $30/$150 rate
  // is "Fast Mode" (6x), NOT extended context.
  'claude-opus-4-6':                 { input:  5.0,  output: 25.0,  strengths: ['architecture','refactor','long-context'], tier: 'T3' },
  'claude-opus-4-6[fast]':           { input: 30.0,  output: 150.0, strengths: ['long-context'],                            tier: 'T3' }, // fast mode: 6× standard
  'claude-opus-4-6[1m]':             { input:  5.0,  output: 25.0,  strengths: ['long-context'],                            tier: 'T3' }, // alias: 1M included in standard
  'claude-sonnet-4-6':               { input:  3.0,  output: 15.0,  strengths: ['code','reasoning','debug'],                tier: 'T2' },

  // ── Claude 5 family — verified 2026-08-19 from ─────────────────────
  //    https://platform.claude.com/docs/en/about-claude/pricing
  // Until today this family was missing from the table ENTIRELY. On this
  // machine `claude-opus-5` is 98.7% of real Claude Code turns (2583 of
  // 2618) and every one of them fell through to FALLBACK_PRICE, i.e. it
  // was priced as Sonnet ($3/$15) instead of $5/$25 — so every cost and
  // savings number the product printed was ~40% low, silently.
  // 1M context is included at standard pricing (no surcharge tier).
  'claude-opus-5':                   { input:  5.0,  output: 25.0,  strengths: ['architecture','refactor','long-context'], tier: 'T3' },
  'claude-opus-5[fast]':             { input: 10.0,  output: 50.0,  strengths: ['long-context'],                            tier: 'T3' }, // fast mode: 2x standard
  'claude-sonnet-5':                 { input:  2.0,  output: 10.0,  strengths: ['code','reasoning','debug'],                tier: 'T2' },
  // Fable 5 carries NO `tier`: T5 is opt-in only via `@fable` and must never
  // be reachable by tier-based selection. A price without a tier is exactly
  // "priceable, not routable".
  'claude-fable-5':                  { input: 10.0,  output: 50.0,  strengths: ['architecture','long-context'] },
  'claude-haiku-4-5':                { input:  1.0,  output:  5.0,  strengths: ['light-code','explain','regex','commit'],   tier: 'T1' },
  'claude-haiku-4-5-20251001':       { input:  1.0,  output:  5.0,  strengths: ['light-code','explain','regex','commit'],   tier: 'T1' },
  // Legacy mappings that may appear in older logs
  'claude-opus-4':                   { input: 15.0,  output: 75.0  }, // old pricing, kept for log compat
  'claude-sonnet-4':                 { input:  3.0,  output: 15.0  },
  'claude-haiku-3-5':                { input:  0.80, output:  4.0  },

  // ── Local / free (Ollama) ──────────────────────────────────────────
  // v0.7: specialists added. See classify.js sub-tier routing + doctrine
  // files. check-local-models.js surfaces which of these are installed.
  //
  // MEDIDO no Mac mini (M4 Pro, 24 GB) em 2026-08-29, ctx 65536, 100% GPU,
  // prompt fixo, `ollama run --verbose`. Recibo:
  // _handoff/motor-mac-20260829-1155.log · vault 50-fleet/2026-08-29-mac-mini-motor-medicao.md
  //   granite4.2:3b       60.48 tok/s · load 2.37s · 8.1 GB carregados
  //   gpt-oss:20b         39.16 tok/s · load 16.94s · 12 GB
  //   granite4.2:8b       32.66 tok/s · load 2.38s · 16 GB
  //   gemma4:12b          22.93 tok/s · load 5.92s · 8.1 GB
  //   qwen2.5-coder:14b   22.22 tok/s · load 7.03s · 15 GB (ctx 32768)
  // Estas sao as PRIMEIRAS medicoes locais deste device. Uma medicao != MooterBench:
  // nenhuma entrada abaixo esta promovida a residente (gate B1-B6 + ▶ do dono).
  'qwen2.5:3b':                      { input: 0, output: 0, strengths: ['general','summarize','translate','quick-answer'], tier: 'T0', subtier: 'general' },
  // NAO instalado NESTE device (Mac mini, medido 2026-08-29). Sobre o Jetson e a
  // 4090 nao ha medicao — nao se remove do catalogo com evidencia de uma maquina.
  'qwen3:30b':                       { input: 0, output: 0, strengths: ['reasoning-local'],                                 tier: 'T0', subtier: 'reason' },
  // NAO instalado NESTE device (Mac mini, medido 2026-08-29). Sobre o Jetson e a
  // 4090 nao ha medicao — nao se remove do catalogo com evidencia de uma maquina.
  'qwen2.5-coder:14b-q4':            { input: 0, output: 0, strengths: ['code','refactor-local','lint','regex'],            tier: 'T0', subtier: 'code' },
  'qwen2.5-coder:14b':               { input: 0, output: 0, strengths: ['code','refactor-local','lint','regex'],            tier: 'T0', subtier: 'code' },
  // NAO instalado NESTE device (Mac mini, medido 2026-08-29). Sobre o Jetson e a
  // 4090 nao ha medicao — nao se remove do catalogo com evidencia de uma maquina.
  'deepseek-r1-distill-qwen:14b':    { input: 0, output: 0, strengths: ['math','reasoning','step-by-step'],                 tier: 'T0', subtier: 'math' },
  // NAO instalado NESTE device (Mac mini, medido 2026-08-29). Sobre o Jetson e a
  // 4090 nao ha medicao — nao se remove do catalogo com evidencia de uma maquina.
  'deepseek-r1:7b':                  { input: 0, output: 0, strengths: ['math','reasoning'],                                tier: 'T0', subtier: 'math' },
  // Google Gemma 4 (local via Ollama) — multimodal, strong reasoning
  // NAO instalado NESTE device (Mac mini, medido 2026-08-29). Sobre o Jetson e a
  // 4090 nao ha medicao — nao se remove do catalogo com evidencia de uma maquina.
  'gemma4:e4b':                       { input: 0, output: 0, strengths: ['reasoning','multimodal','general','summarize'], tier: 'T0', subtier: 'reason' },
  // NAO instalado NESTE device (Mac mini, medido 2026-08-29). Sobre o Jetson e a
  // 4090 nao ha medicao — nao se remove do catalogo com evidencia de uma maquina.
  'gemma3:12b':                       { input: 0, output: 0, strengths: ['general','summarize','translate'],              tier: 'T0', subtier: 'general' },
  // IBM Granite 4.2 (2026-08-25, Apache 2.0, tool-calling formato OpenAI, 128K)
  'granite4.2:3b':                   { input: 0, output: 0, strengths: ['general','triage','classify','quick-answer','summarize'], tier: 'T0', subtier: 'general' },
  'granite4.2:8b':                   { input: 0, output: 0, strengths: ['code','refactor-local','long-context','reasoning'],       tier: 'T0', subtier: 'code' },
  // Ja estavam em disco ha meses e NAO tinham entrada: o router nunca os escolhia.
  'gemma4:12b':                      { input: 0, output: 0, strengths: ['general','summarize','translate','multimodal','long-context'], tier: 'T0', subtier: 'reason' },
  'gpt-oss:20b':                     { input: 0, output: 0, strengths: ['general','reasoning','fast-local'],                       tier: 'T0', subtier: 'reason' },
  'ollama':                          { input: 0, output: 0 }, // generic

  // ── Google (Gemini) — verified 2026-08-03 from ai.google.dev ────────
  'gemini-2.5-pro':                  { input: 1.25,  output: 10.0,  strengths: ['reasoning','long-context','code'], tier: 'T2' },
  'gemini-2.5-pro[200k+]':          { input: 2.50,  output: 15.0,  strengths: ['long-context'],                    tier: 'T2' },
  'gemini-2.5-flash':                { input: 0.30,  output: 2.50,  strengths: ['fast','cheap','multimodal'],       tier: 'T1' },
  'gemini-2.5-flash-lite':           { input: 0.10,  output: 0.40,  strengths: ['ultra-cheap','fast'],              tier: 'T0' },
  // Wave 58.4 — Gemini 3 Flash (Preview), web-searched 2026-06-14: $0.50/$3.00.
  // Distinct from Gemini 3.5 Flash ($1.50/$9.00). Note: live id on ai.google.dev may be
  // gemini-3-flash-preview; using gemini-3-flash here for routing (price-only, cells empty).
  'gemini-3-flash':                  { input: 0.50,  output: 3.00,  strengths: ['fast','cheap','multimodal'],       tier: 'T1' },

  // ── OpenAI — verified 2026-04-16 from developers.openai.com ───────
  'gpt-4o':                          { input: 2.50,  output: 10.0,  strengths: ['general','multimodal','tools'],    tier: 'T2' },
  'o3':                              { input: 2.00,  output:  8.0,  strengths: ['reasoning','math','code'],         tier: 'T2' },
  'o4-mini':                         { input: 1.10,  output:  4.40, strengths: ['reasoning','cheap'],               tier: 'T1' },
  'gpt-4o-mini':                     { input: 0.15,  output:  0.60, strengths: ['fast','cheap'],                    tier: 'T0' },

  // ── DeepSeek — verified 2026-04-16 from api-docs.deepseek.com ─────
  'deepseek-v3':                     { input: 0.27,  output:  1.10, strengths: ['general','cheap'],                 tier: 'T0' },
  'deepseek-r1':                     { input: 0.55,  output:  2.19, strengths: ['reasoning','math','cheap'],        tier: 'T1' },
  'deepseek-v4':                     { input: 0.30,  output:  0.50, strengths: ['newest','general','ultra-cheap'],  tier: 'T0' },
  // Wave 58.4 — DeepSeek V4 Pro. STANDARD list price ($1.74/$3.48) after the
  // 75%-off promo expired 2026-05-31 (promo was $0.435/$0.87). Web-searched
  // 2026-06-14; 1M context. Matrix id: deepseek-v4-pro (price-only, cells empty).
  'deepseek-v4-pro':                 { input: 1.74,  output:  3.48, strengths: ['reasoning','code','long-context'], tier: 'T2' },

  // ── Moonshot (Kimi) — Wave 58.4, web-searched 2026-06-14 ──────────
  // Official Moonshot API: $0.60/$2.50. Some sources report an updated
  // $0.95/$4.00 and OpenRouter lists $0.68/$3.41 — verify at platform.moonshot
  // before relying on this for billing. Matrix id: kimi-k2.6 (price-only).
  'kimi-k2.6':                       { input: 0.60,  output:  2.50, strengths: ['code','agentic','cheap'],          tier: 'T1' },

  // ── xAI (Grok) — verified 2026-04-16 from docs.x.ai ──────────────
  'grok-4':                          { input: 3.00,  output: 15.0,  strengths: ['reasoning','2M-context'],          tier: 'T3' },
  'grok-4.1-fast':                   { input: 0.20,  output:  0.50, strengths: ['fast','cheap','2M-context'],       tier: 'T0' },

  // ── Mistral — verified 2026-04-16 from mistral.ai/pricing ─────────
  'mistral-large-3':                 { input: 0.50,  output:  1.50, strengths: ['multilingual','reasoning'],        tier: 'T1' },
  'codestral':                       { input: 0.30,  output:  0.90, strengths: ['code','fill-in-middle'],           tier: 'T1' },

  // ── Meta (Llama — via providers, not direct API) ──────────────────
  'llama-4-maverick':                { input: 0.20,  output:  0.60, strengths: ['open-source','general'],           tier: 'T0' },
  'llama-4-scout':                   { input: 0.10,  output:  0.30, strengths: ['open-source','fast'],              tier: 'T0' },
};

// Unknown model fallback — Sonnet-tier so the estimate is neither
// free nor Opus. Forces the operator to notice when a new model appears.
/** @type {ModelPrice} */
const FALLBACK_PRICE = { input: 3.0, output: 15.0 };

// Tier → canonical model used when we only have the tier (from classify.js).
// Matches TIER_TO_MODEL in savings-tracker.js but resolved to the pricing key.
/** @type {Record<Tier, string>} */
// ⚠️ DESACTUALIZADO, e a correccao NAO cabe aqui sozinha.
//
// Este mapa aponta a `claude-sonnet-4-6` e `claude-opus-4-6` enquanto a conta
// corre a familia 5 — toda a estimativa por TIER sai a preco de uma geracao
// anterior. Mas nao e o unico mapa tier->modelo do repo: `budget-engine.js:60`
// e `_model-resolver.js:21` tem os seus, e o relatorio de fim de sessao ESCREVE
// "sonnet-4-6" a partir de outro sitio. Mudar so este poe o relatorio a dizer
// um modelo e a cobrar outro — foi o que o CI apanhou.
//
// Fica como esta ate os tres mapas serem tratados juntos, com o teste do
// relatorio a acompanhar. Um numero errado que se conhece vale mais do que
// dois numeros a discordar em silencio.
const TIER_TO_PRICING_KEY = {
  T0: 'qwen2.5:3b',
  T1: 'claude-haiku-4-5',
  T2: 'claude-sonnet-4-6',
  T3: 'claude-opus-4-6',
};

// Average output tokens per turn by tier. Calibrated against real
// session data — update when stats.js backtest shows drift.
/** @type {Record<Tier, number>} */
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

/**
 * @param {number} promptLenChars
 * @returns {number}
 */
function estimateInputTokens(promptLenChars) {
  if (!Number.isFinite(promptLenChars) || promptLenChars <= 0) {
    return SESSION_CONTEXT_BASE_TOKENS;
  }
  return SESSION_CONTEXT_BASE_TOKENS + Math.ceil(promptLenChars / CHARS_PER_TOKEN);
}

/**
 * @param {string | null | undefined} modelKey
 * @returns {ModelPrice}
 */
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
 * @param {string | null | undefined} modelKey
 * @param {number} tokensIn
 * @param {number} tokensOut
 * @returns {number} USD
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
 * @param {Tier | string} tier
 * @param {number} promptLenChars
 * @returns {number} USD
 */
function estimateTurnCost(tier, promptLenChars) {
  const modelKey = TIER_TO_PRICING_KEY[/** @type {Tier} */ (tier)];
  if (!modelKey) return 0;
  const tokensIn = estimateInputTokens(promptLenChars);
  const tokensOut = AVG_OUTPUT_TOK[/** @type {Tier} */ (tier)] || 500;
  return priceTurn(modelKey, tokensIn, tokensOut);
}

/**
 * naiveOpusCost(promptLenChars) → USD
 * "What would this prompt have cost if we had no router and the full
 * Opus-with-1M-context session had to process it?" This is the honest
 * baseline we subtract from to report savings.
 */
/**
 * naiveOpusCost(promptLenChars) → USD
 * "What would this prompt have cost if we had no router and the full
 * Opus-with-1M-context session had to process it?" This is the honest
 * baseline we subtract from to report savings.
 *
 * v0.10 fix: uses Opus 4.6 1M-context STANDARD pricing ($5/$25 per MTok,
 * verified 2026-Q1). Claude Code sessions always use the 1M-context variant,
 * which is now included at standard pricing (no 2× surcharge). Fast-mode
 * ($30/$150) is a separate SKU and NOT the baseline.
 */
/**
 * @param {number} promptLenChars
 * @returns {number} USD
 */
function naiveOpusCost(promptLenChars) {
  const tokensIn = estimateInputTokens(promptLenChars);
  // Opus answers are verbose when unconstrained — use T3 avg output
  return priceTurn('claude-opus-4-6[1m]', tokensIn, AVG_OUTPUT_TOK.T3);
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
