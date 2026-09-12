/**
 * Testes do tecto de orçamento.
 *
 * O teste que interessa é o primeiro: reproduz o esquema REAL que a cache
 * escreve desde 2026-05-07 e afirma que 3% de utilização não pode dar T0.
 * Antes desta correcção dava — e nada no hint dizia porquê.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyBudgetCap, normalizarUtilizacao, utilizacaoDe } = require('./budget-cap.js');

test('MORDE: o esquema real da cache (objecto) não pode colapsar o tecto para T0', () => {
  // `{utilization:3} < 50` é false, e as três comparações falhavam em cadeia.
  const cacheReal = { five_hour: { utilization: 3, resets_at: '2026-09-05T18:00:00Z' } };
  assert.equal(applyBudgetCap('T3', cacheReal, 'unknown'), 'T3',
    '3% de orçamento gasto não pode limitar nada');
  assert.equal(applyBudgetCap('T2', cacheReal, 'unknown'), 'T2');
});

test('o tecto continua a morder quando o orçamento está mesmo gasto', () => {
  const p = (u) => ({ five_hour: { utilization: u } });
  assert.equal(applyBudgetCap('T3', p(3), 'unknown'), 'T3');
  assert.equal(applyBudgetCap('T3', p(55), 'unknown'), 'T2');
  assert.equal(applyBudgetCap('T3', p(75), 'unknown'), 'T1');
  assert.equal(applyBudgetCap('T3', p(90), 'unknown'), 'T0');
  // e nunca SOBE o tier de quem já pedia pouco
  assert.equal(applyBudgetCap('T0', p(90), 'unknown'), 'T0');
  assert.equal(applyBudgetCap('T1', p(3), 'unknown'), 'T1');
});

test('os três esquemas que a cache já teve são todos lidos', () => {
  assert.equal(utilizacaoDe({ five_hour: { utilization: 42 } }), 42, 'objecto (actual)');
  assert.equal(utilizacaoDe({ fiveHour: { utilization: 42 } }), 42, 'camelCase');
  assert.equal(utilizacaoDe({ five_hour: 42 }), 42, 'número plano (legado)');
  assert.equal(utilizacaoDe({ five_hour: '42' }), 42, 'string numérica');
});

test('MORDE: sem número legível não há tecto — e não há zero inventado', () => {
  // Inventar 0 daria «T3 sempre»; inventar 100 daria «T0 sempre». Os dois
  // seriam uma decisão escondida atrás de um valor por omissão, que é
  // exactamente como o defeito de origem nasceu.
  assert.equal(normalizarUtilizacao(undefined), null);
  assert.equal(normalizarUtilizacao(null), null);
  assert.equal(normalizarUtilizacao({}), null, 'objecto sem utilization não é zero');
  assert.equal(normalizarUtilizacao({ utilization: 'muito' }), null);
  assert.equal(normalizarUtilizacao(NaN), null);
  assert.equal(normalizarUtilizacao(''), null);
  assert.equal(applyBudgetCap('T3', { five_hour: {} }, 'unknown'), 'T3', 'ilegível não limita');
  assert.equal(applyBudgetCap('T3', {}, 'unknown'), 'T3');

  // zero é uma leitura legítima, não «não sei»
  assert.equal(normalizarUtilizacao(0), 0);
  assert.equal(normalizarUtilizacao({ utilization: 0 }), 0);
});

test('Claude Max não leva tecto; api-free leva um mais apertado', () => {
  const p = (u) => ({ five_hour: { utilization: u } });
  assert.equal(applyBudgetCap('T3', p(99), 'max'), 'T3', 'Max não leva tecto');
  assert.equal(applyBudgetCap('T3', p(35), 'api-free'), 'T1');
  assert.equal(applyBudgetCap('T3', p(35), 'unknown'), 'T3', 'o mesmo valor não limita quem não é api-free');
  assert.equal(applyBudgetCap('T3', p(60), 'api-free'), 'T0');
});

test('sem budget não há tecto', () => {
  assert.equal(applyBudgetCap('T3', null, 'unknown'), 'T3');
  assert.equal(applyBudgetCap('T3', undefined, 'unknown'), 'T3');
});
