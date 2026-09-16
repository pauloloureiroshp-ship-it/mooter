// 18-partial-usage.test.mjs — critério 18: tokens de entrada conhecidos e saída
// desconhecida ⇒ cobertura PARCIAL, não custo total exacto; nunca preencher a
// parcela em falta com zero. E o preço vem da linha exacta do SSOT — nunca do
// fallback.
//
// Medido hoje no motor: pricing.js:240-246 getPrice() devolve FALLBACK_PRICE
// {3, 15} para qualquer modelo desconhecido; :256-261 priceTurn coage tokens
// não-numéricos a 0. priceTurn('gpt-5', 300, 1500) = 0.0234 embora não exista
// linha gpt-5. Este teste prova que o kit não passa por lá.
//
// Mordida (verificada à mão no fecho do passo 3; relatório no handoff): trocar
// a leitura de PRICES[model_key] por pricing.getPrice(), ou preencher o output
// em falta com 0, põe 18a/18b vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { costEnvelope, usageEnvelope, pricingProvenance } from '../import.mjs';

const pricing = createRequire(import.meta.url)('../../router/pricing.js');
const HAIKU = 'claude-haiku-4-5-20251001';

test('18a · input observado (312) + output desconhecido → cost {value:null, basis:partial}, input_component calculado, output_component null; price_basis com data', () => {
  const c = costEnvelope({ model_key: HAIKU, tokens_in: { value: 312, basis: 'observed', source: 'ui' }, tokens_out: null });
  assert.equal(c.value, null);
  assert.equal(c.basis, 'partial');
  assert.equal(c.reason, 'output_unknown');
  assert.equal(c.input_component.value, (312 * pricing.PRICES[HAIKU].input) / 1e6);
  assert.equal(c.input_component.basis, 'observed');
  assert.deepEqual(c.output_component, { value: null, basis: 'unknown' });
  assert.equal(c.price_basis.input_per_mtok, 1);
  assert.equal(c.price_basis.output_per_mtok, 5);
  assert.equal(c.price_basis.module, 'tools/router/pricing.js');
  assert.equal(c.price_basis.last_reviewed, '2026-09-12');
  assert.equal(c.price_basis.unit, 'USD per MTok, list price');
  // O simétrico também é parcial.
  const d = costEnvelope({ model_key: HAIKU, tokens_in: null, tokens_out: { value: 1500, basis: 'observed', source: 'ui' } });
  assert.equal(d.basis, 'partial');
  assert.equal(d.reason, 'input_unknown');
  assert.equal(d.value, null);
});

test('18b · modelo sem linha em pricing.js → custo unknown{no_price_row}; NUNCA o fallback {3,15} — o SSOT devolveria um número', () => {
  const gpt5 = costEnvelope({ model_key: 'gpt-5', tokens_in: { value: 300, basis: 'observed', source: 'api' }, tokens_out: { value: 1500, basis: 'observed', source: 'api' } });
  assert.equal(gpt5.value, null);
  assert.equal(gpt5.basis, 'unknown');
  assert.equal(gpt5.reason, 'no_price_row');
  assert.equal(gpt5.price_basis.row, null);
  assert.equal(pricing.PRICES['gpt-5'], undefined, 'a fixture é real: não há linha gpt-5');
  assert.equal(pricing.priceTurn('gpt-5', 300, 1500), 0.0234, 'e o SSOT, chamado directamente, inventaria 0,0234 USD — é isso que o kit não faz');
  const rotulo = costEnvelope({ model_key: 'Latest', tokens_in: { value: 300, basis: 'observed', source: 'ui' }, tokens_out: { value: 1500, basis: 'observed', source: 'ui' } });
  assert.equal(rotulo.reason, 'no_price_row', 'um rótulo de UI não é chave de preço');
  const semModelo = costEnvelope({ model_key: null, tokens_in: { value: 300, basis: 'observed', source: 'ui' }, tokens_out: { value: 1500, basis: 'observed', source: 'ui' } });
  assert.equal(semModelo.reason, 'no_model_key');
});

test('18c · com os dois lados: observado×lista = observed; um lado estimado ⇒ estimated; um imputado ⇒ imputed (a pior base ganha); ollama = 0 USD observado, não «grátis por omissão»', () => {
  const obs = costEnvelope({ model_key: HAIKU, tokens_in: { value: 300, basis: 'observed', source: 'ui' }, tokens_out: { value: 1500, basis: 'observed', source: 'ui' } });
  assert.equal(obs.basis, 'observed');
  assert.ok(Math.abs(obs.value - (300 * 1 + 1500 * 5) / 1e6) < 1e-12);
  const est = costEnvelope({ model_key: HAIKU, tokens_in: { value: 300, basis: 'observed', source: 'ui' }, tokens_out: { value: 1553, basis: 'estimated', source: 'chars/4' } });
  assert.equal(est.basis, 'estimated');
  const imp = costEnvelope({ model_key: HAIKU, tokens_in: { value: 300, basis: 'imputed', source: 'média da onda' }, tokens_out: { value: 1553, basis: 'estimated', source: 'chars/4' } });
  assert.equal(imp.basis, 'imputed');
  const local = costEnvelope({ model_key: 'ollama', tokens_in: { value: 300, basis: 'observed', source: 'api' }, tokens_out: { value: 1500, basis: 'observed', source: 'api' } });
  assert.equal(local.value, 0);
  assert.equal(local.basis, 'observed', 'zero de lista para um modelo local é um valor observado — hardware e electricidade ficam fora, e o envelope não finge o contrário');
  const localSem = costEnvelope({ model_key: 'ollama', tokens_in: null, tokens_out: null });
  assert.equal(localSem.value, null, 'local sem usage continua unknown — não vira 0');
});

test('18d · MORDIDA · pricingProvenance mede o ficheiro real; um pricing.js sem «Last reviewed» dá last_reviewed null, não uma data inventada', () => {
  const real = pricingProvenance();
  assert.match(real.sha256, /^[0-9a-f]{64}$/);
  assert.equal(real.last_reviewed, '2026-09-12');
  const fake = { readFileSync: () => Buffer.from('// pricing sem data\nmodule.exports = {};\n') };
  const sem = pricingProvenance({ fs: fake });
  assert.equal(sem.last_reviewed, null);
  assert.notEqual(sem.sha256, real.sha256);
  const env = usageEnvelope({ model_key: HAIKU, tokens_in: { value: 10, basis: 'observed', source: 'ui' } });
  assert.equal(env.cost_usd.basis, 'partial');
  assert.equal(env.tokens_out.basis, 'unknown');
});
