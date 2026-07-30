'use strict';

const { EventEmitter } = require('events');

const BASE_URL = 'https://api.moonshot.ai/v1';
const MODEL = 'kimi-k3';
const PROVIDER_LABEL = 'Moonshot · nuvem';
const MISSING_KEY_ERROR = 'MOONSHOT_API_KEY não configurada — platform.moonshot.ai';
const DEFAULT_TIMEOUT_MS = 120000;
const PRICING_USD_PER_MILLION = Object.freeze({
  input_cache_miss: 3,
  input_cache_hit: 0.30,
  output: 15,
});

function numberOrNull(value) {
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return value != null && Number.isFinite(number) && number >= 0 ? number : null;
}

function configuredApiKey(value) {
  const raw = value == null ? process.env.MOONSHOT_API_KEY : value;
  const key = String(raw || '').trim();
  return key && !key.includes('${') ? key : null;
}

function cachedTokensFrom(usage) {
  const u = usage || {};
  const promptDetails = u.prompt_tokens_details || u.input_tokens_details || {};
  for (const value of [
    promptDetails.cached_tokens,
    u.cached_tokens,
    u.prompt_cache_hit_tokens,
    u.cache_read_input_tokens,
  ]) {
    const tokens = numberOrNull(value);
    if (tokens != null) return tokens;
  }
  return null;
}

function calculateCost(usage) {
  const u = usage || {};
  const inputTokens = numberOrNull(u.prompt_tokens != null ? u.prompt_tokens : u.input_tokens);
  const outputTokens = numberOrNull(u.completion_tokens != null ? u.completion_tokens : u.output_tokens);
  if (inputTokens == null || outputTokens == null) {
    return {
      total_usd: null,
      input_cache_miss_tokens: null,
      input_cache_hit_tokens: null,
      output_tokens: outputTokens,
      rates_usd_per_million: PRICING_USD_PER_MILLION,
      unavailable_reason: 'usage sem tokens de input/output na resposta Moonshot',
    };
  }
  const reportedCacheHitTokens = cachedTokensFrom(u);
  if (reportedCacheHitTokens == null) {
    return {
      total_usd: null,
      input_cache_miss_tokens: null,
      input_cache_hit_tokens: null,
      output_tokens: outputTokens,
      rates_usd_per_million: PRICING_USD_PER_MILLION,
      unavailable_reason: 'usage sem detalhe de cache na resposta Moonshot',
    };
  }
  const cacheHitTokens = Math.min(inputTokens, reportedCacheHitTokens);
  const cacheMissTokens = inputTokens - cacheHitTokens;
  const total = (cacheMissTokens * PRICING_USD_PER_MILLION.input_cache_miss
    + cacheHitTokens * PRICING_USD_PER_MILLION.input_cache_hit
    + outputTokens * PRICING_USD_PER_MILLION.output) / 1000000;
  return {
    total_usd: Number(total.toFixed(9)),
    input_cache_miss_tokens: cacheMissTokens,
    input_cache_hit_tokens: cacheHitTokens,
    output_tokens: outputTokens,
    rates_usd_per_million: PRICING_USD_PER_MILLION,
  };
}

function extractText(response) {
  const content = response && response.choices && response.choices[0]
    && response.choices[0].message && response.choices[0].message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part && (part.text || part.content)) || '').join('').trim();
  }
  return null;
}

function redactSecret(value, key) {
  const text = String(value || 'erro desconhecido');
  return key ? text.split(key).join('[redacted]') : text;
}

async function responseError(response, key) {
  let apiMessage = null;
  try {
    const body = await response.json();
    apiMessage = body && body.error && (body.error.message || body.error.code);
  } catch { /* a resposta pode não ser JSON */ }
  const status = response && response.status != null ? response.status : 'n/d';
  const statusText = response && response.statusText ? ' ' + response.statusText : '';
  const detail = apiMessage ? ': ' + apiMessage : '';
  return redactSecret('Kimi HTTP ' + status + statusText + detail, key);
}

/**
 * Executa uma chamada OpenAI-compatible sem expor a key ao command line,
 * stdout, stderr ou ledger. O EventEmitter imita ChildProcess para que o bridge
 * use o mesmo ciclo de vida e a mesma telemetria dos motores existentes.
 */
function runKimi(options) {
  const opts = options || {};
  const outStream = opts.outStream;
  const errStream = opts.errStream;
  const key = configuredApiKey(opts.apiKey);
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const timeoutMs = Math.max(1, numberOrNull(opts.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const emitter = new EventEmitter();
  let controller = null;
  let closed = false;
  let killed = false;

  const write = (event) => {
    try { outStream.write(JSON.stringify(event) + '\n'); } catch { /* */ }
  };
  const writeError = (message) => {
    try { errStream.write(String(message) + '\n'); } catch { /* */ }
  };
  const finish = (code) => {
    if (closed) return;
    closed = true;
    try { outStream.end(); } catch { /* */ }
    try { errStream.end(); } catch { /* */ }
    setImmediate(() => emitter.emit('close', code));
  };
  const fail = (message, code) => {
    const safe = redactSecret(message, key);
    writeError(safe);
    write({
      type: 'result', subtype: 'error', is_error: true, result: safe,
      model: MODEL, provider_label: PROVIDER_LABEL, local: false,
    });
    finish(code == null ? 1 : code);
  };

  async function execute() {
    controller = new AbortController();
    let timeout = null;
    try {
      write({
        type: 'system', subtype: 'init', model: MODEL,
        provider_label: PROVIDER_LABEL, base_url: BASE_URL, local: false,
      });
      const timeoutPromise = new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          try { controller.abort(); } catch { /* */ }
          const error = new Error('Kimi excedeu o timeout de ' + timeoutMs + ' ms');
          error.code = 'KIMI_TIMEOUT';
          reject(error);
        }, timeoutMs);
      });
      const response = await Promise.race([
        fetchImpl(BASE_URL + '/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + key,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'user', content: String(opts.prompt || '') }],
            stream: false,
          }),
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);
      if (!response || response.ok !== true) {
        const message = await Promise.race([responseError(response, key), timeoutPromise]);
        clearTimeout(timeout);
        fail(message);
        return;
      }
      const body = await Promise.race([response.json(), timeoutPromise]);
      clearTimeout(timeout);
      const text = extractText(body);
      if (!text) {
        fail('Kimi devolveu uma resposta sem texto');
        return;
      }
      const usage = body.usage || {};
      const cost = calculateCost(usage);
      const inputTokens = numberOrNull(usage.prompt_tokens != null ? usage.prompt_tokens : usage.input_tokens);
      const outputTokens = numberOrNull(usage.completion_tokens != null ? usage.completion_tokens : usage.output_tokens);
      const normalizedUsage = {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_input_tokens: cost.input_cache_hit_tokens,
      };
      const modelUsed = body.model || MODEL;
      write({
        type: 'assistant', model: modelUsed, provider_label: PROVIDER_LABEL,
        message: { model: modelUsed, content: [{ type: 'text', text }], usage: normalizedUsage },
      });
      write({
        type: 'result', subtype: 'success', result: text, model: modelUsed,
        provider_label: PROVIDER_LABEL, local: false,
        session_id: body.id || null, usage: normalizedUsage,
        total_cost_usd: cost.total_usd,
        cost_breakdown: cost,
        cost_note: cost.total_usd == null
          ? cost.unavailable_reason + ' — custo n/d'
          : 'Moonshot: cache miss $3/M input · cache hit $0.30/M input · $15/M output',
      });
      finish(0);
    } catch (error) {
      clearTimeout(timeout);
      if (killed) return;
      if (error && error.code === 'KIMI_TIMEOUT') fail(error.message);
      else fail('Kimi falhou: ' + redactSecret(error && error.message, key));
    }
  }

  emitter.kill = () => {
    killed = true;
    try { controller && controller.abort(); } catch { /* */ }
    fail('Kimi cancelado', 137);
    return true;
  };
  emitter.stdout = { pipe() { /* o adaptador escreve directamente */ } };
  emitter.stderr = { pipe() { /* idem */ } };

  setImmediate(() => {
    emitter.emit('spawn');
    if (!key) return fail(MISSING_KEY_ERROR);
    if (typeof fetchImpl !== 'function') return fail('fetch indisponível neste runtime Node');
    execute();
  });
  return emitter;
}

module.exports = {
  BASE_URL, MODEL, PROVIDER_LABEL, MISSING_KEY_ERROR,
  PRICING_USD_PER_MILLION, DEFAULT_TIMEOUT_MS,
  configuredApiKey, calculateCost, extractText, runKimi,
};
