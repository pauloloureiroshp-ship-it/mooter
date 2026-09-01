#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * providers/ollama-api.js — programmatic Ollama wrapper for the router.
 *
 * Mirrors the (prompt, opts) → Promise<Result|null> shape used by
 * providers/codex-cli.js and providers/openai-api.js so router-execute.js
 * (Wave-2) can dispatch all non-Anthropic providers through a uniform
 * interface.
 *
 * The legacy ollama_call_node.js is kept as a thin CLI for the Option-A
 * pre-computed path in inject_context.js — it does NOT expose a callable
 * function. This module fills that gap.
 *
 * Token counts come from Ollama's `prompt_eval_count` and `eval_count`
 * fields (non-stream mode). cost_usd is always 0 (local subscription).
 *
 * No npm deps — pure Node built-ins (`fetch` is global since Node 18).
 */

const tracker = require('../quota-tracker');

const DEFAULT_HOST  = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2.5:3b';
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * `OLLAMA_HOST` sem esquema é o formato CANÓNICO — é assim que o próprio Ollama
 * o documenta e o imprime (`OLLAMA_HOST=127.0.0.1:11434`). Este ficheiro assumia
 * que vinha sempre com `http://` e concatenava à bruta, o que produzia
 * `fetch('127.0.0.1:11434/api/chat')` → `Failed to parse URL`.
 *
 * Medido a 2026-08-31 nesta máquina, com o Ollama VIVO e 10 modelos carregados:
 *   · `isAvailable()` → `{available:false, reason:'…Failed to parse URL…'}`
 *   · `callOllama()`  → **`null`, sem razão nenhuma** — o `catch` do fetch
 *     engole o erro de parse e o chamador lê «o modelo não respondeu».
 *
 * O segundo é o caro: o motor $0 falhava MUDO, e todo o trabalho de leitura
 * caía para um motor pago sem que nada o dissesse. É a mesma família do
 * `empty_completion` que o `provider-health.js` documenta — um erro de
 * transporte a sair pela porta de «resposta vazia».
 */
function normalizeHost(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/\/+$/, '');
  if (!s) return DEFAULT_HOST;
  return /^https?:\/\//i.test(s) ? s : `http://${s}`;
}

const SYSTEM = [
  'És um assistente de software engineering conciso.',
  'Respondes em PT-PT (Portugal). Código e identificadores em inglês.',
  'Respostas curtas e directas — nunca mais de 3 frases para perguntas simples.',
  'Não uses preâmbulo. Não repitas o que o user perguntou.',
].join('\n');

/**
 * @typedef {Object} OllamaResult
 * @property {true}    ok
 * @property {string}  text
 * @property {string}  model
 * @property {number}  tokensIn
 * @property {number}  tokensOut
 * @property {number}  costUsd
 * @property {number}  durationMs
 */

/**
 * Call Ollama's /api/chat endpoint (non-streaming).
 *
 * @param {string} prompt
 * @param {object} [opts]
 * @param {string} [opts.model='qwen2.5:3b']
 * @param {string} [opts.host]               override OLLAMA_HOST
 * @param {string} [opts.system]             override default system prompt
 * @param {number} [opts.maxTokens=256]      forwarded as num_predict
 * @param {number} [opts.temperature=0.2]
 * @param {number} [opts.timeoutMs=90000]
 * @returns {Promise<OllamaResult|null>}     null on any failure (caller falls through)
 */
async function callOllama(prompt, opts = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('ollama-api: prompt must be a non-empty string');
  }

  const host  = normalizeHost(opts.host || process.env.OLLAMA_HOST || DEFAULT_HOST);
  const model = opts.model || process.env.OLLAMA_OPTION_A_MODEL || DEFAULT_MODEL;
  const timeoutMs = Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS;

  // Wave 66: dispatch via /api/chat (messages) instead of the legacy /api/generate.
  // Modern instruct/reasoning models (gemma3+, gemma4:e4b, ...) return an EMPTY
  // `response` on /api/generate but answer correctly on /api/chat (text lands in
  // message.content). Older models (qwen2.5) work on both, so chat is strictly
  // safer. think:false stops reasoning models burning num_predict on hidden CoT.
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: opts.system || SYSTEM },
      { role: 'user', content: prompt },
    ],
    stream: false,
    keep_alive: -1,
    options: {
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.2,
      num_predict: Number(opts.maxTokens) || 256,
    },
    think: false,
  });

  const url = host + '/api/chat';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
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

  // /api/chat puts the answer in message.content; keep a /api/generate fallback
  // (response) so older payloads and test stubs still parse.
  const rawText =
    (json && json.message && typeof json.message.content === 'string') ? json.message.content
    : (json && typeof json.response === 'string')                      ? json.response
    : '';
  const text = rawText.trim();
  if (!text) return null;

  const tokensIn  = Number(json.prompt_eval_count) || 0;
  const tokensOut = Number(json.eval_count)        || 0;
  const costUsd = 0; // local model; subscription-style

  try {
    tracker.recordUsage('ollama', {
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      duration_ms: durationMs,
    });
  } catch { /* tracker is best-effort */ }

  // Wave 19 (Day 4.1) — record REAL T0/local tokens into the per-tier tracker.
  // The module shipped in Day 1 (#102) but was never wired to any executor, so
  // T0 always read 0 in the 🪙 chip + Stop report. This is the executor path
  // (router-execute → callOllama). Best-effort, metadata only (no prompt text).
  try {
    require('../token_tracker.js').trackCall('T0', model, tokensIn, tokensOut, { sessionId: opts.sessionId });
  } catch { /* tracker is best-effort */ }

  return { ok: true, text, model, tokensIn, tokensOut, costUsd, durationMs };
}

/**
 * Cheap availability probe — does the Ollama host respond to /api/tags?
 * Uses a short timeout to keep the hot path fast. Does not consume quota.
 *
 * @param {object} [opts]
 * @param {string} [opts.host]
 * @param {number} [opts.timeoutMs=1500]
 * @returns {Promise<{available:boolean,reason?:string}>}
 */
async function isAvailable(opts = {}) {
  const host = normalizeHost(opts.host || process.env.OLLAMA_HOST || DEFAULT_HOST);
  const url  = host + '/api/tags';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(opts.timeoutMs) || 1500);

  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { available: false, reason: `tags http ${res.status}` };
    return { available: true };
  } catch (err) {
    clearTimeout(timer);
    return { available: false, reason: `tags error: ${err && err.message || 'unknown'}` };
  }
}

module.exports = {
  callOllama,
  isAvailable,
  normalizeHost,
  DEFAULT_MODEL,
  DEFAULT_HOST,
};

// CLI sanity check: `node providers/ollama-api.js`
if (require.main === module) {
  isAvailable().then((probe) => {
    process.stdout.write(JSON.stringify({
      ...probe,
      default_model: DEFAULT_MODEL,
      default_host: DEFAULT_HOST,
    }, null, 2) + '\n');
  });
}
