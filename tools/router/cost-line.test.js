'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { costLine, reconcile, listPrice, modelKey, count } = require('./cost-line.js');
const pricing = require('./pricing.js');

// Valores esperados calculados A MAO a partir da tabela publicada em pricing.js
// (haiku 4.5: 1/5 por M; sonnet 4.6: 3/15; opus 4.6: 5/25), nao pelo proprio modulo.
const HAIKU_1000_100 = (1000 * 1.0 + 100 * 5.0) / 1e6;   // 0.0015
const SONNET_1000_100 = (1000 * 3.0 + 100 * 15.0) / 1e6; // 0.0045

test('regra: 0 tokens, 0 custo, origem rule_local, completo', () => {
  const l = costLine({ engine: 'rule' });
  assert.equal(l.cost_usd, 0); assert.equal(l.cost_source, 'rule_local'); assert.equal(l.prompt_eval_count, 0); assert.equal(l.eval_count, 0); assert.equal(l.completeness, 'complete');
});

test('ollama com as duas contagens: custo 0, origem ollama_local, contagens intactas', () => {
  const l = costLine({ engine: 'ollama', model: 'qwen2.5-coder:14b', prompt_eval_count: 362, eval_count: 3 });
  assert.equal(l.cost_usd, 0); assert.equal(l.cost_source, 'ollama_local'); assert.equal(l.prompt_eval_count, 362); assert.equal(l.eval_count, 3);
});

test('ollama sem contagens, ou so com UMA: n/d — nunca zero (P6-08)', () => {
  assert.equal(costLine({ engine: 'ollama', model: 'qwen2.5:3b' }).cost_usd, 'n/d');
  assert.equal(costLine({ engine: 'ollama', model: 'qwen2.5:3b', prompt_eval_count: 10 }).cost_usd, 'n/d');
  assert.equal(costLine({ engine: 'ollama', model: 'qwen2.5:3b', eval_count: 10 }).cost_usd, 'n/d');
});

test('contagens: so inteiros finitos >= 0; booleanos, arrays, negativos, fraccoes, vazios -> null (P6-08)', () => {
  assert.equal(count(false), null); assert.equal(count(true), null); assert.equal(count([]), null); assert.equal(count([5]), null);
  assert.equal(count(' '), null); assert.equal(count(-1), null); assert.equal(count(1.5), null); assert.equal(count(NaN), null); assert.equal(count(Infinity), null);
  assert.equal(count(0), 0); assert.equal(count(42), 42); assert.equal(count('42'), 42);
});

test('subscricao: desembolso 0, preco de lista input/output ao lado, igual ao calculo a mao', () => {
  const l = costLine({ engine: 'subscription', model: 'claude-haiku-4-5-20251001', prompt_eval_count: 1000, eval_count: 100 });
  assert.equal(l.cost_usd, 0); assert.equal(l.cost_source, 'subscription_included');
  assert.ok(Math.abs(l.list_price_input_output_usd - HAIKU_1000_100) < 1e-12, `${l.list_price_input_output_usd} vs ${HAIKU_1000_100}`);
  assert.equal(l.model_key_used, 'claude-haiku-4-5-20251001'); assert.equal(l.completeness, 'complete');
});

test('subscricao sem contagens: n/d, nao 0 com origem valida (P6-06)', () => {
  assert.equal(costLine({ engine: 'subscription', model: 'claude-haiku-4-5' }).cost_usd, 'n/d');
});

test('com contagens de cache a linha declara-se PARCIAL: o preco input/output e um subtotal (P6-05)', () => {
  const l = costLine({ engine: 'subscription', model: 'claude-haiku-4-5', prompt_eval_count: 10, eval_count: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 20000 });
  assert.equal(l.completeness, 'partial_no_cache_pricing');
  const a = costLine({ engine: 'api', model: 'claude-sonnet-4-6', prompt_eval_count: 10, eval_count: 100, cache_read_input_tokens: 5000 });
  assert.equal(a.completeness, 'partial_no_cache_pricing');
});

test('api: o custo E o preco de lista, igual ao calculo a mao, com a data do snapshot na origem', () => {
  const l = costLine({ engine: 'api', model: 'claude-sonnet-4-6', prompt_eval_count: 1000, eval_count: 100 });
  assert.ok(Math.abs(l.cost_usd - SONNET_1000_100) < 1e-12);
  assert.match(l.cost_source, /^api_list_price@\d{4}-\d{2}-\d{2}$/);
});

test('api sem contagens: n/d — nunca estimar tokens por caracteres', () => {
  assert.equal(costLine({ engine: 'api', model: 'claude-sonnet-4-6' }).cost_usd, 'n/d');
});

test('modelo desconhecido ou com nome enganador: n/d, NUNCA o fallback de pricing.js (P6-09)', () => {
  assert.equal(listPrice('modelo-inexistente-xyz', 1000, 1000), 'n/d');
  assert.equal(listPrice('claude-haiku-9-inventado', 1000, 1000), 'n/d');
  assert.equal(modelKey('claude-haiku-9-inventado'), null);
  assert.equal(costLine({ engine: 'api', model: 'gpt-nao-existe', prompt_eval_count: 10, eval_count: 10 }).cost_usd, 'n/d');
  // e o fallback de pricing.js existe mesmo: se o SSOT o der para um nome inventado, este teste garante que nao o usamos
  assert.ok(pricing.priceTurn('modelo-inexistente-xyz', 1000, 1000) > 0, 'pricing.js tem fallback; o cost-line nao pode herda-lo');
});

test('modelKey: chave exacta primeiro; apelidos curtos so para os que existem no SSOT', () => {
  assert.equal(modelKey('claude-haiku-4-5-20251001'), 'claude-haiku-4-5-20251001'); assert.equal(modelKey('haiku'), 'claude-haiku-4-5'); assert.equal(modelKey('opus'), 'claude-opus-4-6'); assert.equal(modelKey('qwen2.5:3b'), 'qwen2.5:3b'); assert.equal(modelKey(null), null);
});

test('mordida: preco de lista haiku < sonnet < opus, com valores absolutos calculados a mao', () => {
  const h = listPrice('haiku', 1000, 1000), s = listPrice('sonnet', 1000, 1000), o = listPrice('opus', 1000, 1000);
  assert.ok(Math.abs(h - 0.006) < 1e-12 && Math.abs(s - 0.018) < 1e-12 && Math.abs(o - 0.03) < 1e-12, `${h} ${s} ${o}`);
});

test('reconcile: delta contra o host; n/d NUNCA vira 0 — fica incompleto com contagens (P6-07)', () => {
  const r = reconcile([{ list_price_input_output_usd: 0.01 }, { list_price_input_output_usd: 0.02 }], 0.04);
  assert.equal(r.included, 2); assert.equal(r.excluded, 0); assert.equal(r.incomplete, false);
  assert.equal(r.ours_usd, 0.03); assert.equal(r.host_usd, 0.04); assert.equal(r.delta_usd, -0.01); assert.equal(r.delta_rel, -0.25);
  const nd = reconcile([{ cost_usd: 'n/d', list_price_input_output_usd: 'n/d' }], 1);
  assert.equal(nd.incomplete, true); assert.equal(nd.delta_usd, 'n/d'); assert.equal(nd.excluded, 1);
  assert.equal(reconcile([], 1).incomplete, true);
  assert.equal(reconcile([{ list_price_input_output_usd: 0.01 }], null).delta_usd, 'n/d');
  assert.equal(reconcile([{ cost_usd: -1 }], 1, { basis: 'incremental' }).incomplete, true, 'custo negativo e excluido, nao somado');
  assert.ok(!('savings' in r) && !('poupanca' in r));
});

test('reconcile nao mistura bases: subscricao sem preco de lista fica excluida na base de lista', () => {
  const r = reconcile([{ cost_usd: 0, cost_source: 'subscription_included' }], 1);
  assert.equal(r.excluded, 1); assert.equal(r.incomplete, true);
});

test('precisao: um custo sub-microdolar nao vira 0 na linha (so no reconcile se arredonda)', () => {
  // a mao: 1 token de input do haiku 4.5 = 1,0 / 1e6 = exactamente 1e-6 USD (o 1.º valor deste teste dizia < 1e-6, e estava errado)
  const l = costLine({ engine: 'api', model: 'claude-haiku-4-5', prompt_eval_count: 1, eval_count: 0 });
  assert.ok(l.cost_usd > 0 && Math.abs(l.cost_usd - 1e-6) < 1e-18, String(l.cost_usd));
  const r = reconcile([l], 1e-6, { basis: 'incremental' });
  assert.equal(r.ours_usd, 0.000001); assert.equal(r.delta_usd, 0);
});
