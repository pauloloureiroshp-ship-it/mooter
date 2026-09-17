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
//
// AMENDMENT-001 · A5 (2026-09-17, AMENDMENT-001-20260916.txt): basis 'partial'
// estava fora do enum do contrato (observed | estimated | imputed | unknown).
// Agora: value null ⇔ basis unknown; parcialidade em `coverage` ∈ full|partial|none
// e `components_known`; tokens × lista = estimated (imputed se os tokens o forem),
// NUNCA observed; aggregateUsage recusa basis fora do enum (18e). Mordida: aceitar
// 'partial' ⇒ 18e vermelho; custo calculado como observed ⇒ 18c vermelho
// (tools/experiment/mordida/morde-amend001-a5.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { costEnvelope, usageEnvelope, pricingProvenance, aggregateUsage, metric, ImportError, BASIS, COVERAGE, COST_KIND } from '../import.mjs';

const pricing = createRequire(import.meta.url)('../../router/pricing.js');
const HAIKU = 'claude-haiku-4-5-20251001';

test('18a · input observado (312) + output desconhecido → cost {value:null, basis:unknown, coverage:partial, components_known:[input]}, input_component calculado (estimated, tokens_basis observed), output_component null; price_basis com data (A5)', () => {
  const c = costEnvelope({ model_key: HAIKU, tokens_in: { value: 312, basis: 'observed', source: 'ui' }, tokens_out: null });
  assert.equal(c.value, null);
  assert.equal(c.basis, 'unknown', 'A5: value null ⇔ basis unknown — «partial» não é uma base');
  assert.equal(c.coverage, 'partial');
  assert.deepEqual(c.components_known, ['input']);
  assert.equal(c.kind, COST_KIND);
  assert.equal(c.reason, 'output_unknown');
  assert.equal(c.input_component.value, (312 * pricing.PRICES[HAIKU].input) / 1e6);
  assert.equal(c.input_component.basis, 'estimated', 'tokens observados × lista é custo estimado, não observado');
  assert.equal(c.input_component.tokens_basis, 'observed');
  assert.deepEqual(c.output_component, { value: null, basis: 'unknown', tokens_basis: 'unknown' }, 'a parcela em falta fica null — nunca 0');
  assert.equal(c.price_basis.input_per_mtok, 1);
  assert.equal(c.price_basis.output_per_mtok, 5);
  assert.equal(c.price_basis.module, 'tools/router/pricing.js');
  assert.equal(c.price_basis.last_reviewed, '2026-09-12');
  assert.equal(c.price_basis.unit, 'USD per MTok, list price');
  // O simétrico também é parcial.
  const d = costEnvelope({ model_key: HAIKU, tokens_in: null, tokens_out: { value: 1500, basis: 'observed', source: 'ui' } });
  assert.equal(d.basis, 'unknown');
  assert.equal(d.coverage, 'partial');
  assert.deepEqual(d.components_known, ['output']);
  assert.equal(d.reason, 'input_unknown');
  assert.equal(d.value, null);
  assert.ok(BASIS.includes(c.basis) && BASIS.includes(d.basis) && COVERAGE.includes(c.coverage));
});

test('18b · modelo sem linha em pricing.js → custo unknown{no_price_row}; NUNCA o fallback {3,15} — o SSOT devolveria um número', () => {
  const gpt5 = costEnvelope({ model_key: 'gpt-5', tokens_in: { value: 300, basis: 'observed', source: 'api' }, tokens_out: { value: 1500, basis: 'observed', source: 'api' } });
  assert.equal(gpt5.value, null);
  assert.equal(gpt5.basis, 'unknown');
  assert.equal(gpt5.reason, 'no_price_row');
  assert.equal(gpt5.price_basis.row, null);
  assert.equal(gpt5.coverage, 'full', 'os tokens são conhecidos — o que falta é a linha de preço; coverage é sobre componentes, reason diz o resto');
  assert.equal(pricing.PRICES['gpt-5'], undefined, 'a fixture é real: não há linha gpt-5');
  assert.equal(pricing.priceTurn('gpt-5', 300, 1500), 0.0234, 'e o SSOT, chamado directamente, inventaria 0,0234 USD — é isso que o kit não faz');
  const rotulo = costEnvelope({ model_key: 'Latest', tokens_in: { value: 300, basis: 'observed', source: 'ui' }, tokens_out: { value: 1500, basis: 'observed', source: 'ui' } });
  assert.equal(rotulo.reason, 'no_price_row', 'um rótulo de UI não é chave de preço');
  const semModelo = costEnvelope({ model_key: null, tokens_in: { value: 300, basis: 'observed', source: 'ui' }, tokens_out: { value: 1500, basis: 'observed', source: 'ui' } });
  assert.equal(semModelo.reason, 'no_model_key');
});

test('18c · com os dois lados: observado×lista = ESTIMATED (só uma cobrança real seria observed); um lado estimado ⇒ estimated; um imputado ⇒ imputed; ollama = 0 USD estimated de lista = encargos de API 0, nunca custo total (A5)', () => {
  const obs = costEnvelope({ model_key: HAIKU, tokens_in: { value: 300, basis: 'observed', source: 'ui' }, tokens_out: { value: 1500, basis: 'observed', source: 'ui' } });
  assert.equal(obs.basis, 'estimated', 'A5: tokens observados × preço de tabela = custo estimated, NUNCA observed');
  assert.equal(obs.coverage, 'full');
  assert.deepEqual(obs.components_known, ['input', 'output']);
  assert.equal(obs.input_component.tokens_basis, 'observed');
  assert.match(obs.derivation, /list price/);
  assert.ok(Math.abs(obs.value - (300 * 1 + 1500 * 5) / 1e6) < 1e-12);
  const est = costEnvelope({ model_key: HAIKU, tokens_in: { value: 300, basis: 'observed', source: 'ui' }, tokens_out: { value: 1553, basis: 'estimated', source: 'chars/4' } });
  assert.equal(est.basis, 'estimated');
  const imp = costEnvelope({ model_key: HAIKU, tokens_in: { value: 300, basis: 'imputed', source: 'média da onda' }, tokens_out: { value: 1553, basis: 'estimated', source: 'chars/4' } });
  assert.equal(imp.basis, 'imputed');
  const local = costEnvelope({ model_key: 'ollama', tokens_in: { value: 300, basis: 'observed', source: 'api' }, tokens_out: { value: 1500, basis: 'observed', source: 'api' } });
  assert.equal(local.value, 0);
  assert.equal(local.basis, 'estimated', 'zero de lista para um modelo local é um custo estimado de API — hardware e electricidade ficam fora, e o envelope não finge o contrário');
  assert.equal(local.kind, 'api_charges_at_list_price', '«Ollama = 0 USD» só pode significar encargos adicionais de API = 0, nunca custo total');
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
  assert.equal(env.cost_usd.basis, 'unknown');
  assert.equal(env.cost_usd.coverage, 'partial');
  assert.equal(env.tokens_out.basis, 'unknown');
});

test('18e · A5 · MORDIDA · basis fora do enum é RECUSADA: metric() e aggregateUsage() rejeitam «partial»; soma parcial nunca vira total exacto; nenhum envelope do kit sai com basis fora de BASIS', () => {
  assert.deepEqual([...BASIS], ['observed', 'estimated', 'imputed', 'unknown'], 'o enum do contrato 0.3');
  assert.throws(() => metric({ value: 1, basis: 'partial', source: 'x' }), (e) => e instanceof ImportError && e.code === 'metric_bad_basis');
  const bom = usageEnvelope({ model_key: HAIKU, tokens_in: { value: 300, basis: 'observed', source: 'ui' }, tokens_out: null });
  const mau = { ...bom, cost_usd: { ...bom.cost_usd, value: null, basis: 'partial' } };
  assert.throws(() => aggregateUsage([bom, mau]), (e) => e instanceof ImportError && e.code === 'metric_bad_basis' && /partial/.test(e.message));
  for (const b of ['total', 'exact', '', null, undefined]) assert.throws(() => aggregateUsage([{ ...bom, cost_usd: { ...bom.cost_usd, basis: b } }]), (e) => e.code === 'metric_bad_basis', String(b));
  // Soma parcial: input conhecido em 2 slots, output em nenhum ⇒ cost n_unknown 2, cost_coverage partial 2, exact_total null, e nada somado.
  const agg = aggregateUsage([bom, usageEnvelope({ model_key: HAIKU, tokens_in: { value: 200, basis: 'observed', source: 'ui' }, tokens_out: null })]);
  assert.deepEqual(agg.cost_usd.cost_coverage, { full: 0, partial: 2, none: 0 });
  assert.equal(agg.cost_usd.n_unknown, 2);
  assert.equal(agg.cost_usd.estimated_sum + agg.cost_usd.observed_sum + agg.cost_usd.imputed_sum, 0, 'as parcelas conhecidas ficam nos componentes; o total não se soma por metade');
  assert.equal(agg.cost_usd.exact_total, null);
  assert.equal(agg.tokens_in.observed_sum, 500, 'os tokens observados somam-se — são observados; o USD é calculado e fica separado');
  assert.equal(agg.tokens_in.cost_coverage, null, 'coverage é do custo, não dos tokens');
  // Todos os caminhos do envelope ficam no enum.
  const casos = [
    costEnvelope({ model_key: HAIKU, tokens_in: null, tokens_out: null }),
    costEnvelope({ model_key: null, tokens_in: { value: 1, basis: 'observed', source: 'ui' }, tokens_out: null }),
    costEnvelope({ model_key: 'gpt-5', tokens_in: { value: 1, basis: 'observed', source: 'ui' }, tokens_out: { value: 1, basis: 'observed', source: 'ui' } }),
    costEnvelope({ model_key: HAIKU, tokens_in: { value: 1, basis: 'imputed', source: 'média' }, tokens_out: { value: 1, basis: 'observed', source: 'ui' } }),
    costEnvelope({ model_key: HAIKU, tokens_in: { value: 1, basis: 'observed', source: 'ui' }, tokens_out: { value: 1, basis: 'estimated', source: 'chars/4' } }),
    costEnvelope({ model_key: HAIKU, tokens_in: { value: 1, basis: 'observed', source: 'ui' }, tokens_out: { value: 1, basis: 'observed', source: 'ui' } }),
  ];
  for (const c of casos) { assert.ok(BASIS.includes(c.basis), JSON.stringify(c)); assert.ok(COVERAGE.includes(c.coverage)); assert.equal(c.value === null, c.basis === 'unknown', 'value null ⇔ basis unknown'); assert.notEqual(c.basis, 'observed', 'custo calculado nunca é observed'); }
  assert.equal(casos[3].basis, 'imputed'); assert.equal(casos[4].basis, 'estimated'); assert.equal(casos[5].basis, 'estimated', 'os dois lados observados: continua estimated'); assert.equal(casos[0].coverage, 'none'); assert.equal(casos[1].coverage, 'partial');
});
