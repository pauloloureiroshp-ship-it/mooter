#!/usr/bin/env node
/**
 * providers/deepseek-v4.js — DeepSeek V4 Pro provider for the Mooter router.
 *
 * Wave 29 (Phase 29.D): an OPEN-WEIGHT (MIT-licensed) T2 option. DeepSeek V4 Pro
 * scores 80.6% SWE-bench Verified (≈0.2pp behind Opus 4.6) and 93.5%
 * LiveCodeBench, so for code/SWE tasks it is a strong, much cheaper alternative
 * to "Sonnet always". Default routing is UNCHANGED — this is opt-in BYOK and
 * never overrides the classify.js tier (doctrine: classify.js wins).
 *
 * Auth: DEEPSEEK_API_KEY (BYOK), loaded from tools/router/.env if present.
 * OpenAI-compatible /chat/completions endpoint — pure fetch(), no SDK.
 *
 * classify.js and inject_context.js are NOT touched by this module.
 */

'use strict';

const { loadEnv } = require('./_load-env');
let tracker;
try { tracker = require('../quota-tracker'); } catch { tracker = null; }

loadEnv();

const API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat'; // DeepSeek's flagship chat model (V4 series)
const DEFAULT_MODEL_REASONING = 'deepseek-reasoner';
const DEFAULT_TIMEOUT_MS = 90_000;

// DeepSeek published API pricing (USD per 1M tokens, cache-miss standard rate,
// ~2025). BYOK users see their own invoice; this is for the router's cost
// accounting only. Verify against https://api-docs.deepseek.com/quick_start/pricing
const DEEPSEEK_PRICE = { input: 0.27, output: 1.10 };

/** True when a DEEPSEEK_API_KEY is present (BYOK). */
function isAvailable() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/** Human-facing note when the provider is selected but no key is configured. */
function keyWarning() {
  return isAvailable()
    ? null
    : 'DeepSeek V4 is opt-in (open-weight, MIT). Set DEEPSEEK_API_KEY (BYOK) to enable it as a T2 option.';
}

function computeCost(_model, tokensIn, tokensOut) {
  return ((tokensIn * DEEPSEEK_PRICE.input) + (tokensOut * DEEPSEEK_PRICE.output)) / 1_000_000;
}

/**
 * Advisory T2 routing decision: should the router prefer DeepSeek V4 over Sonnet
 * for this T2 task? PURE — depends only on the passed context. Never consulted by
 * classify.js; the router MAY call this after classify.js has fixed the tier.
 *
 * @param {object} ctx
 * @param {string} [ctx.subscription_tier]  'claude-max'|'claude-pro'|'none'|'multi'|'byok'
 * @param {string} [ctx.task_type]          e.g. 'swe', 'coding', 'refactor', 'prose'
 * @param {string} [ctx.latency_pref]       'low'|'normal'
 * @param {boolean}[ctx.available]          defaults to isAvailable()
 * @returns {{prefer:boolean, reason:string}}
 */
function shouldPreferDeepSeekT2(ctx = {}) {
  const available = ctx.available !== undefined ? ctx.available : isAvailable();
  if (!available) return { prefer: false, reason: 'no_api_key' };
  // Claude Max → marginal cost ≈ $0 for Anthropic frontier; keep Sonnet.
  if (ctx.subscription_tier === 'claude-max') return { prefer: false, reason: 'max_marginal_cost_zero' };
  // Strong on SWE/code benchmarks → prefer for those task types.
  if (ctx.task_type && /\b(swe|swe-bench|coding|code|refactor|debug)\b/i.test(ctx.task_type)) {
    return { prefer: true, reason: 'swe_bench_strength' };
  }
  // Pay-as-you-go users → bias to the cheaper open-weight option.
  if (ctx.subscription_tier === 'none' || ctx.subscription_tier === 'byok') {
    return { prefer: true, reason: 'payg_cost_bias' };
  }
  // Latency-sensitive → keep the default (Sonnet) path.
  if (ctx.latency_pref === 'low') return { prefer: false, reason: 'latency_pref_default' };
  return { prefer: false, reason: 'default_sonnet' };
}

/**
 * Call DeepSeek's chat completions endpoint. Returns null on any soft failure
 * (no key, network error, non-ok, empty) so the router falls through.
 * @returns {Promise<{ok:true,text:string,model:string,tokensIn:number,tokensOut:number,costUsd:number,durationMs:number}|null>}
 */
async function callDeepSeek(prompt, opts = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('deepseek-v4: prompt must be a non-empty string');
  }
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const model = opts.model || (opts.profile === 'reasoning' ? DEFAULT_MODEL_REASONING : DEFAULT_MODEL);
  const messages = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });

  const body = {
    model,
    messages,
    max_tokens: Number(opts.maxTokens) || 1024,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.2,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return null;
  }
  clearTimeout(timer);
  const durationMs = Date.now() - t0;

  if (!res.ok) return null;

  let json;
  try { json = await res.json(); } catch { return null; }

  const choice = json && json.choices && json.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (!text) return null;

  const usage = json.usage || {};
  const tokensIn = Number(usage.prompt_tokens) || 0;
  const tokensOut = Number(usage.completion_tokens) || 0;
  const costUsd = computeCost(model, tokensIn, tokensOut);

  try {
    if (tracker && tracker.recordUsage) tracker.recordUsage('deepseek_v4', { tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: costUsd });
  } catch { /* best-effort */ }

  return { ok: true, text: text.trim(), model, tokensIn, tokensOut, costUsd, durationMs };
}

module.exports = {
  callDeepSeek,
  isAvailable,
  keyWarning,
  computeCost,
  shouldPreferDeepSeekT2,
  DEFAULT_MODEL,
  DEFAULT_MODEL_REASONING,
  DEEPSEEK_PRICE,
};

// CLI sanity check: `node providers/deepseek-v4.js`
if (require.main === module) {
  process.stdout.write(JSON.stringify({
    available: isAvailable(),
    default_model: DEFAULT_MODEL,
    key_warning: keyWarning(),
    license: 'MIT (open-weight)',
  }, null, 2) + '\n');
}
