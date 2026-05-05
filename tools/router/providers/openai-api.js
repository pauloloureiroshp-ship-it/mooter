#!/usr/bin/env node
/**
 * providers/openai-api.js — direct OpenAI API wrapper for Mooter router.
 *
 * Used as the LAST-RESORT fallback when:
 *   - Codex CLI quota is exhausted, AND
 *   - Anthropic 5h window is also low.
 *
 * Authenticates via OPENAI_API_KEY (loaded from tools/router/.env if present).
 * Pure fetch() call to /v1/chat/completions — no SDK, no npm deps.
 *
 * Records token usage and cost in quota-tracker.js. Pricing pulled from
 * the central pricing.js so we never drift from the rest of the router.
 */

'use strict';

const { loadEnv } = require('./_load-env');
const tracker     = require('../quota-tracker');

loadEnv();

let pricingCache = null;
function getPricing() {
  if (pricingCache) return pricingCache;
  try {
    pricingCache = require('../pricing');
  } catch {
    pricingCache = { PRICES: {}, FALLBACK_PRICE: { input: 2.5, output: 10 } };
  }
  return pricingCache;
}

const API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL_FAST      = 'gpt-4o';
const DEFAULT_MODEL_REASONING = 'o3';
const DEFAULT_TIMEOUT_MS      = 90_000;

/**
 * Call the OpenAI chat completions endpoint.
 *
 * @param {string} prompt
 * @param {object} [opts]
 * @param {string} [opts.model='gpt-4o']
 * @param {'fast'|'reasoning'} [opts.profile='fast']  pick model by intent
 * @param {string} [opts.system]
 * @param {number} [opts.maxTokens=1024]
 * @param {number} [opts.temperature=0.2]
 * @param {number} [opts.timeoutMs=90000]
 * @returns {Promise<{ok:true,text:string,model:string,tokensIn:number,tokensOut:number,costUsd:number,durationMs:number}|null>}
 */
async function callOpenAI(prompt, opts = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('openai-api: prompt must be a non-empty string');
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null; // no key → soft fail; router falls through

  const model = opts.model || (opts.profile === 'reasoning'
    ? DEFAULT_MODEL_REASONING
    : DEFAULT_MODEL_FAST);

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
  const timer = setTimeout(
    () => controller.abort(),
    Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS
  );

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
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
  try {
    json = await res.json();
  } catch {
    return null;
  }

  const choice = json && json.choices && json.choices[0];
  const text   = choice && choice.message && choice.message.content;
  if (!text) return null;

  const usage = json.usage || {};
  const tokensIn  = Number(usage.prompt_tokens)     || 0;
  const tokensOut = Number(usage.completion_tokens) || 0;
  const costUsd = computeCost(model, tokensIn, tokensOut);

  try {
    tracker.recordUsage('openai_api', { tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: costUsd });
  } catch { /* tracker is best-effort */ }

  return { ok: true, text: text.trim(), model, tokensIn, tokensOut, costUsd, durationMs };
}

function computeCost(model, tokensIn, tokensOut) {
  const { PRICES = {}, FALLBACK_PRICE = { input: 2.5, output: 10 } } = getPricing();
  const p = PRICES[model] || FALLBACK_PRICE;
  return ((tokensIn * p.input) + (tokensOut * p.output)) / 1_000_000;
}

function isAvailable() {
  return Boolean(process.env.OPENAI_API_KEY);
}

module.exports = {
  callOpenAI,
  isAvailable,
  computeCost,
  DEFAULT_MODEL_FAST,
  DEFAULT_MODEL_REASONING,
};

// CLI sanity check: `node providers/openai-api.js`
if (require.main === module) {
  process.stdout.write(JSON.stringify({
    available: isAvailable(),
    default_fast: DEFAULT_MODEL_FAST,
    default_reasoning: DEFAULT_MODEL_REASONING,
  }, null, 2) + '\n');
}
