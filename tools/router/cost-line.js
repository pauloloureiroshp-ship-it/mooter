#!/usr/bin/env node
/**
 * cost-line.js — C2-min: a «linha 2» de custo de uma decisão/execução, com ORIGEM.
 *
 * O ledger de hoje escreve `cost_usd: 0` na maioria das linhas sem dizer porquê
 * (é zero porque foi local? porque é subscrição? porque ninguém mediu?). Esta
 * função devolve um objecto que responde sempre às três perguntas:
 *
 *   cost_usd     — quanto custou EM DESEMBOLSO INCREMENTAL (0 para local e subscrição)
 *   cost_source  — de onde vem o número:
 *                    'rule_local'            classify.js: 0 tokens, 0 chamadas
 *                    'ollama_local'          contagens do próprio Ollama (prompt_eval_count/eval_count)
 *                    'subscription_included' chamada coberta por subscrição; o preço de lista vai em list_price_usd
 *                    'api_list_price@<date>' preço de lista de tools/router/pricing.js (SSOT), quando é API paga
 *                    'n/d'                   sem contagens: não se inventa
 *   tokens       — prompt_eval_count / eval_count (nomes do Ollama, mantidos para não haver 2 vocabulários)
 *   priced_at    — data do snapshot de preços usado
 *
 * Nunca soma nada a que se possa chamar «poupança». Nunca estima tokens a partir
 * de caracteres: sem contagem, é n/d.
 */
'use strict';

const pricing = require('./pricing.js');

// pricing.js nao exporta a data do snapshot; o cabecalho diz «Last reviewed: 2026-08-03».
// Le-se do proprio ficheiro para nao haver duas verdades.
const PRICES_SNAPSHOT_DATE = (() => { try { const m = require('fs').readFileSync(require.resolve('./pricing.js'), 'utf8').match(/Last reviewed:\s*(\d{4}-\d{2}-\d{2})/); return m ? m[1] : 'pricing.js'; } catch { return 'pricing.js'; } })();

/**
 * @param {object} p
 * @param {'rule'|'ollama'|'subscription'|'api'} p.engine
 * @param {string} [p.model]
 * @param {number|null} [p.prompt_eval_count]
 * @param {number|null} [p.eval_count]
 * @param {number|null} [p.cache_read_input_tokens]
 * @param {number|null} [p.cache_creation_input_tokens]
 * @param {number|null} [p.host_reported_cost_usd]  o que o host (CLI) disse ter custado, se disse
 */
function costLine(p) {
  const tin = numOrNull(p.prompt_eval_count), tout = numOrNull(p.eval_count);
  const base = { engine: p.engine, model: p.model || null, prompt_eval_count: tin, eval_count: tout, cache_read_input_tokens: numOrNull(p.cache_read_input_tokens), cache_creation_input_tokens: numOrNull(p.cache_creation_input_tokens), priced_at: PRICES_SNAPSHOT_DATE };
  if (p.engine === 'rule') return { ...base, cost_usd: 0, cost_source: 'rule_local', prompt_eval_count: 0, eval_count: 0 };
  if (p.engine === 'ollama') {
    if (tin === null && tout === null) return { ...base, cost_usd: 'n/d', cost_source: 'n/d', reason: 'sem prompt_eval_count/eval_count' };
    return { ...base, cost_usd: 0, cost_source: 'ollama_local' };
  }
  const list = listPrice(p.model, tin, tout);
  if (p.engine === 'subscription') return { ...base, cost_usd: 0, cost_source: 'subscription_included', list_price_usd: list, host_reported_cost_usd: numOrNull(p.host_reported_cost_usd) };
  if (p.engine === 'api') { if (list === 'n/d') return { ...base, cost_usd: 'n/d', cost_source: 'n/d', reason: 'sem preco no SSOT ou sem contagens' }; return { ...base, cost_usd: list, cost_source: `api_list_price@${PRICES_SNAPSHOT_DATE}`, host_reported_cost_usd: numOrNull(p.host_reported_cost_usd) }; }
  return { ...base, cost_usd: 'n/d', cost_source: 'n/d', reason: `engine desconhecido: ${p.engine}` };
}

/** Preço de lista pelo SSOT; 'n/d' quando o modelo não tem preço ou faltam contagens. */
function listPrice(model, tin, tout) {
  if (tin === null || tout === null || !model) return 'n/d';
  try {
    const r = pricing.priceTurn(modelKey(model), tin, tout);
    if (r && typeof r === 'object' && Number.isFinite(r.total)) return round6(r.total);
    if (Number.isFinite(r)) return round6(r);
  } catch { /* sem preco */ }
  return 'n/d';
}

// As chaves do SSOT sao ids completos ('claude-haiku-4-5', 'claude-sonnet-4-6', ...).
// Medido 2026-09-09: 'haiku' a seco caia no FALLBACK_PRICE (3/15 = preco de Sonnet) —
// o Haiku ficava 3x mais caro do que e. Primeiro a chave exacta; depois a familia.
function modelKey(model) {
  const m = String(model).toLowerCase();
  if (pricing.getPrice && pricing.PRICES && pricing.PRICES[m]) return m;
  try { if (pricing.PRICES && pricing.PRICES[m]) return m; } catch { /* */ }
  if (/haiku/.test(m)) return 'claude-haiku-4-5';
  if (/sonnet-5/.test(m)) return 'claude-sonnet-5';
  if (/sonnet/.test(m)) return 'claude-sonnet-4-6';
  if (/opus-5/.test(m)) return 'claude-opus-5';
  if (/opus/.test(m)) return 'claude-opus-4-6';
  if (/fable/.test(m)) return 'claude-fable-5';
  return m;
}

/** Reconciliação: soma das linhas vs telemetria do host. Devolve Δ absoluto e relativo, nunca «poupança». */
function reconcile(lines, hostTotalUsd) {
  const ours = lines.reduce((a, l) => a + (Number.isFinite(l.list_price_usd) ? l.list_price_usd : (Number.isFinite(l.cost_usd) ? l.cost_usd : 0)), 0);
  const host = numOrNull(hostTotalUsd);
  if (host === null) return { ours_usd: round6(ours), host_usd: 'n/d', delta_usd: 'n/d', delta_rel: 'n/d' };
  const d = ours - host;
  return { ours_usd: round6(ours), host_usd: round6(host), delta_usd: round6(d), delta_rel: host ? round6(d / host) : 'n/d' };
}

function numOrNull(v) { return (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v); }
function round6(x) { return Math.round(x * 1e6) / 1e6; }

module.exports = { costLine, listPrice, reconcile, modelKey, PRICES_SNAPSHOT_DATE };
