'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { costLine, reconcile, listPrice, modelKey } = require('./cost-line.js');
const pricing = require('./pricing.js');

test('regra: 0 tokens, 0 custo, origem rule_local', () => {
  const l = costLine({ engine: 'rule' });
  assert.equal(l.cost_usd, 0); assert.equal(l.cost_source, 'rule_local'); assert.equal(l.prompt_eval_count, 0); assert.equal(l.eval_count, 0);
});

test('ollama com contagens: custo 0 com origem ollama_local e as contagens intactas', () => {
  const l = costLine({ engine: 'ollama', model: 'qwen2.5-coder:14b', prompt_eval_count: 362, eval_count: 3 });
  assert.equal(l.cost_usd, 0); assert.equal(l.cost_source, 'ollama_local'); assert.equal(l.prompt_eval_count, 362); assert.equal(l.eval_count, 3);
});

test('ollama SEM contagens: n/d, nunca zero (zero seria um numero inventado)', () => {
  const l = costLine({ engine: 'ollama', model: 'qwen2.5:3b' });
  assert.equal(l.cost_usd, 'n/d'); assert.equal(l.cost_source, 'n/d');
});

test('subscricao: desembolso 0, preco de lista ao lado, vindo do SSOT pricing.js', () => {
  const l = costLine({ engine: 'subscription', model: 'claude-haiku-4-5-20251001', prompt_eval_count: 1000, eval_count: 100 });
  assert.equal(l.cost_usd, 0); assert.equal(l.cost_source, 'subscription_included');
  const expected = pricing.priceTurn('claude-haiku-4-5', 1000, 100);
  assert.ok(Math.abs(l.list_price_usd - expected) < 1e-9, `${l.list_price_usd} vs ${expected}`);
  assert.ok(l.list_price_usd > 0);
});

test('api: o custo E o preco de lista do SSOT, com a data do snapshot na origem', () => {
  const l = costLine({ engine: 'api', model: 'claude-sonnet-4-6', prompt_eval_count: 1000, eval_count: 100 });
  assert.equal(l.cost_usd, pricing.priceTurn('claude-sonnet-4-6', 1000, 100));
  assert.match(l.cost_source, /^api_list_price@\d{4}-\d{2}-\d{2}$/);
});

test('api sem contagens: n/d — nunca estimar tokens por caracteres', () => {
  const l = costLine({ engine: 'api', model: 'claude-sonnet-4-6' });
  assert.equal(l.cost_usd, 'n/d');
});

test('modelKey: mapeia para as chaves REAIS do SSOT (nao para apelidos que caem no fallback)', () => {
  assert.equal(modelKey('claude-haiku-4-5-20251001'), 'claude-haiku-4-5-20251001'); assert.equal(modelKey('haiku'), 'claude-haiku-4-5'); assert.equal(modelKey('claude-opus-4-6'), 'claude-opus-4-6'); assert.equal(modelKey('qwen2.5:3b'), 'qwen2.5:3b');
});

// mordida: o Haiku tem de ser mais barato do que o Sonnet no preco de lista — se um apelido
// cair no FALLBACK_PRICE (3/15), os dois ficam iguais e este teste falha.
test('mordida: preco de lista haiku < sonnet < opus, e nenhum e o fallback', () => {
  const h = listPrice('haiku', 1000, 1000), s = listPrice('sonnet', 1000, 1000), o = listPrice('opus', 1000, 1000);
  assert.ok(h < s && s < o, `${h} ${s} ${o}`);
  assert.notEqual(h, listPrice('modelo-inexistente-xyz', 1000, 1000));
});

test('listPrice devolve n/d sem modelo ou sem contagens', () => {
  assert.equal(listPrice(null, 1, 1), 'n/d'); assert.equal(listPrice('haiku', null, 1), 'n/d');
});

test('reconcile: delta contra o host, nunca chamado poupanca; host ausente = n/d', () => {
  const r = reconcile([{ list_price_usd: 0.01 }, { list_price_usd: 0.02 }], 0.04);
  assert.equal(r.ours_usd, 0.03); assert.equal(r.host_usd, 0.04); assert.equal(r.delta_usd, -0.01); assert.equal(r.delta_rel, -0.25);
  assert.equal(reconcile([{ cost_usd: 0 }], null).delta_usd, 'n/d');
  assert.ok(!('savings' in r) && !('poupanca' in r));
});

// mordida: se alguem fizer a linha inventar zero para o Ollama sem contagens, este teste tem de falhar
test('mordida: uma linha ollama sem contagens nunca pode dizer 0', () => {
  const l = costLine({ engine: 'ollama' });
  assert.notEqual(l.cost_usd, 0);
});
