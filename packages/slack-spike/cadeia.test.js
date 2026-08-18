'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cadeiaDe } = require('./cadeia.js');

const desp = (job, de, extra) => Object.assign({ event: 'dispatched', job_id: job }, de || {}, extra || {});
const fim = (job, c) => ({ event: 'done', job_id: job, cost_usd: c, cost_usd_fonte: 'reportado pelo CLI' });

test('cadeia · soma as tres geracoes do moinho real (US$ 2,88, nao US$ 1,24)', () => {
  // os numeros sao os medidos no #mooter-demo em 2026-08-18
  const l = [
    desp('70d9'), fim('70d9', 0.0977),
    desp('3eb9', { handoff_from: '70d9' }), fim('3eb9', 1.2432),
    desp('aa1d', { handoff_from: '3eb9' }), fim('aa1d', 1.5424),
  ];
  for (const olhando of ['70d9', '3eb9', 'aa1d']) {
    const c = cadeiaDe(l, olhando);
    assert.equal(c.pedidos, 3, 'a partir de ' + olhando);
    assert.equal(c.total.toFixed(4), '2.8833', 'a partir de ' + olhando);
    assert.equal(c.todosMedidos, true);
  }
});

test('cadeia · a partir do MEIO conta tambem o que veio depois', () => {
  const l = [desp('a'), fim('a', 1), desp('b', { handoff_from: 'a' }), fim('b', 2),
    desp('c', { handoff_from: 'b' }), fim('c', 4)];
  assert.equal(cadeiaDe(l, 'b').total, 7, 'olhar para o do meio escondeu o que veio a seguir');
});

test('cadeia · conhece os DOIS elos (prep_from e handoff_from)', () => {
  const porPrep = [desp('p'), fim('p', 1), desp('f', { prep_from: 'p' }), fim('f', 2)];
  assert.equal(cadeiaDe(porPrep, 'f').pedidos, 2, 'perdeu o elo prep_from (prep EXPIRADA)');
  const porHandoff = [desp('p'), fim('p', 1), desp('f', { handoff_from: 'p' }), fim('f', 2)];
  assert.equal(cadeiaDe(porHandoff, 'f').pedidos, 2, 'perdeu o elo handoff_from (prep com SUCESSO)');
});

test('cadeia · um job sem custo torna o total um PISO, nao um total', () => {
  const l = [desp('a'), fim('a', 1), desp('b', { handoff_from: 'a' })];   // b ainda a correr
  const c = cadeiaDe(l, 'a');
  assert.equal(c.pedidos, 2);
  assert.equal(c.total, 1);
  assert.equal(c.todosMedidos, false, 'publicar um piso como total e a mesma mentira em ponto pequeno');
});

test('cadeia · job solitario nao inventa cadeia', () => {
  const c = cadeiaDe([desp('so'), fim('so', 0.5)], 'so');
  assert.equal(c.pedidos, 1);
  assert.equal(c.total, 0.5);
});

test('cadeia · um ciclo no ledger nao pendura o daemon', () => {
  const l = [desp('a', { handoff_from: 'b' }), desp('b', { handoff_from: 'a' })];
  const c = cadeiaDe(l, 'a');
  assert.ok(c.pedidos <= 2);
});

test('cadeia · usa o ULTIMO custo do job (a reconciliacao re-carimba)', () => {
  const l = [desp('a'), fim('a', 1), fim('a', 3)];
  assert.equal(cadeiaDe(l, 'a').total, 3, 'ficou com o carimbo velho');
});
