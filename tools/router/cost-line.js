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
 *                    'ollama_local'          contagens do próprio Ollama (prompt_eval_count E eval_count)
 *                    'subscription_included' chamada coberta por subscrição; o preço de lista vai ao lado
 *                    'api_list_price@<date>' preço de lista de tools/router/pricing.js (SSOT), quando é API paga
 *                    'n/d'                   sem contagens ou sem preço: não se inventa
 *   completeness — 'complete' | 'partial_no_cache_pricing' (há contagens de cache que o SSOT não preça)
 *   tokens       — prompt_eval_count / eval_count (nomes do Ollama, mantidos para não haver 2 vocabulários)
 *   priced_at    — data do snapshot de preços lida do próprio pricing.js ('n/d' se ilegível)
 *
 * Endurecido 2026-09-09 depois do adversário do P6 (AMENDMENT-1.md dessa prova):
 *   - contagens só inteiros finitos >= 0 (booleanos, arrays, fracções → null → n/d);
 *   - Ollama exige AS DUAS contagens; subscrição sem contagens → n/d (não 0 com origem válida);
 *   - modelo desconhecido → null/n/d, NUNCA o FALLBACK_PRICE do pricing.js (que é preço de Sonnet);
 *   - reconcile() nunca converte n/d em 0: a linha fica excluída e o total fica `incomplete`.
 *
 * Nunca soma nada a que se possa chamar «poupança». Nunca estima tokens a partir
 * de caracteres: sem contagem, é n/d. A ORIGEM (engine) é declarada por quem chama —
 * este módulo não a verifica (`source_declared_by_caller: true` em cada linha).
 */
'use strict';

const pricing = require('./pricing.js');

const SOURCES = Object.freeze(['rule_local', 'ollama_local', 'subscription_included', 'api_list_price', 'n/d']);

// pricing.js nao exporta a data do snapshot; o cabecalho diz «Last reviewed: YYYY-MM-DD».
// Le-se do proprio ficheiro para nao haver duas verdades; se nao se ler, e n/d.
const PRICES_SNAPSHOT_DATE = (() => {
  try { const m = require('fs').readFileSync(require.resolve('./pricing.js'), 'utf8').match(/Last reviewed:\s*(\d{4}-\d{2}-\d{2})/); return m ? m[1] : 'n/d'; } catch { return 'n/d'; }
})();

/** Contagem de tokens: só inteiros finitos >= 0 (ou string decimal de um). Tudo o resto é null. */
function count(v) {
  if (typeof v === 'number') return (Number.isInteger(v) && v >= 0) ? v : null;
  if (typeof v === 'string' && /^\d+$/.test(v.trim()) && v.trim() !== '') return Number(v.trim());
  return null;
}

/**
 * @param {object} p
 * @param {'rule'|'ollama'|'subscription'|'api'} p.engine  ORIGEM declarada por quem chama
 * @param {string} [p.model]
 * @param {number|null} [p.prompt_eval_count]
 * @param {number|null} [p.eval_count]
 * @param {number|null} [p.cache_read_input_tokens]
 * @param {number|null} [p.cache_creation_input_tokens]
 * @param {number|null} [p.host_reported_cost_usd]  o que o host (CLI) disse ter custado, se disse
 */
function costLine(p) {
  p = p || {};
  const tin = count(p.prompt_eval_count), tout = count(p.eval_count);
  const cr = count(p.cache_read_input_tokens), cc = count(p.cache_creation_input_tokens);
  const hasCache = (cr !== null && cr > 0) || (cc !== null && cc > 0);
  const key = modelKey(p.model);
  const base = {
    engine: p.engine || null, model: p.model || null, model_key_used: key,
    prompt_eval_count: tin, eval_count: tout, cache_read_input_tokens: cr, cache_creation_input_tokens: cc,
    priced_at: PRICES_SNAPSHOT_DATE, source_declared_by_caller: true,
    completeness: hasCache ? 'partial_no_cache_pricing' : 'complete',
  };
  const nd = (reason) => ({ ...base, cost_usd: 'n/d', cost_source: 'n/d', completeness: 'complete', reason });

  if (p.engine === 'rule') return { ...base, cost_usd: 0, cost_source: 'rule_local', prompt_eval_count: 0, eval_count: 0, completeness: 'complete' };
  if (p.engine === 'ollama') {
    if (tin === null || tout === null) return nd('ollama exige prompt_eval_count E eval_count inteiros');
    return { ...base, cost_usd: 0, cost_source: 'ollama_local' };
  }
  if (p.engine === 'subscription' || p.engine === 'api') {
    if (tin === null || tout === null) return nd('sem contagens de tokens');
    if (key === null) return nd(`modelo sem preco no SSOT: ${p.model}`);
    const list = listPrice(key, tin, tout);
    if (list === 'n/d') return nd('sem preco de lista');
    const host = numOrNull(p.host_reported_cost_usd);
    if (p.engine === 'subscription') return { ...base, cost_usd: 0, cost_source: 'subscription_included', list_price_input_output_usd: list, host_reported_cost_usd: host };
    return { ...base, cost_usd: list, cost_source: `api_list_price@${PRICES_SNAPSHOT_DATE}`, list_price_input_output_usd: list, host_reported_cost_usd: host };
  }
  return nd(`engine desconhecido: ${p.engine}`);
}

/** Preço de lista input/output pelo SSOT (sem cache); 'n/d' quando o modelo não tem preço ou faltam contagens. */
function listPrice(model, tin, tout) {
  const i = count(tin), o = count(tout), key = modelKey(model);
  if (i === null || o === null || key === null) return 'n/d';
  const pr = pricing.PRICES[key];
  if (!pr || !Number.isFinite(pr.input) || !Number.isFinite(pr.output)) return 'n/d';
  return (i * pr.input + o * pr.output) / 1e6; // sem arredondar: sub-microdolar nao vira 0 na linha
}

// As chaves do SSOT sao ids completos ('claude-haiku-4-5', 'claude-sonnet-4-6', ...).
// Medido 2026-09-09: 'haiku' a seco caia no FALLBACK_PRICE (3/15 = preco de Sonnet) —
// o Haiku ficava 3x mais caro do que e. Primeiro a chave exacta; depois so os apelidos
// curtos exactos ('haiku', 'sonnet', 'opus'); tudo o resto e null (n/d), nunca fallback.
const ALIASES = Object.freeze({ haiku: 'claude-haiku-4-5', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-6', fable: 'claude-fable-5' });
function modelKey(model) {
  if (model === null || model === undefined) return null;
  const m = String(model).trim().toLowerCase();
  if (!m) return null;
  if (Object.prototype.hasOwnProperty.call(pricing.PRICES, m)) return m;
  const a = ALIASES[m];
  if (a && Object.prototype.hasOwnProperty.call(pricing.PRICES, a)) return a;
  return null;
}

/**
 * Reconciliação: soma das linhas vs telemetria do host, numa base declarada.
 *   basis 'list'        (defeito) soma list_price_input_output_usd — para subscrição
 *   basis 'incremental' soma cost_usd — para API paga
 * Uma linha sem número finito >= 0 nessa base é EXCLUÍDA (contada), e o total fica `incomplete`.
 * Devolve Δ absoluto e relativo (n/d se incompleto ou sem host). Nunca «poupança».
 */
function reconcile(lines, hostTotalUsd, opts) {
  const basis = (opts && opts.basis) || 'list';
  const field = basis === 'incremental' ? 'cost_usd' : 'list_price_input_output_usd';
  let ours = 0, included = 0, excluded = 0;
  for (const l of lines || []) {
    const v = l ? l[field] : undefined;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) { ours += v; included++; } else excluded++;
  }
  const incomplete = excluded > 0 || included === 0;
  const host = numOrNull(hostTotalUsd);
  const out = { basis, lines: (lines || []).length, included, excluded, incomplete, ours_usd: round6(ours), host_usd: host === null ? 'n/d' : round6(host), delta_usd: 'n/d', delta_rel: 'n/d' };
  if (incomplete || host === null) return out;
  const d = ours - host;
  out.delta_usd = round6(d); out.delta_rel = host ? round6(d / host) : 'n/d';
  return out;
}

function numOrNull(v) { return (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v))) ? null : Number(v); }
function round6(x) { return Math.round(x * 1e6) / 1e6; }

module.exports = { costLine, listPrice, reconcile, modelKey, count, SOURCES, PRICES_SNAPSHOT_DATE };
