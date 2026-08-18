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

test('cadeia · custo SEM procedencia nao entra na soma (o every() passava a vazio)', () => {
  // ⚠️ Achado do final-reviewer. O valor somava e a fonte, ausente, nao ficava
  // registada — e o `fontes.every(fonteLegivel)` do cartao passava A VAZIO,
  // publicando um total "de procedencia reconhecida" que era, em parte, de origem
  // desconhecida. Latente (o ledger real traz fonte em 12/12), mas um so evento
  // sem ela bastava para publicar US$ 100 como total verificado.
  const l = [desp('a'), fim('a', 1),
    desp('b', { handoff_from: 'a' }), { event: 'done', job_id: 'b', cost_usd: 99 }];
  const c = cadeiaDe(l, 'a');
  assert.equal(c.total, 1, 'somou 99 de origem desconhecida');
  assert.equal(c.todosMedidos, false);
  assert.deepEqual(c.semFonte, ['b']);
});

test('cadeia · fonte «n/d» conta como ausente (a mesma regra do leitura.js)', () => {
  const l = [desp('a'), fim('a', 1),
    desp('b', { handoff_from: 'a' }),
    { event: 'done', job_id: 'b', cost_usd: 99, cost_usd_fonte: 'n/d' }];
  assert.equal(cadeiaDe(l, 'a').total, 1, '«n/d» passou por procedencia válida');
});

test('cadeia · re-carimbo SEM fonte nao herda a procedencia antiga (ALTO->MEDIO codex)', () => {
  // o codex reproduziu: pai US$1 com fonte + filho US$2 com fonte, depois o filho
  // re-carimbado para US$9 SEM fonte => publicava US$10 com a fonte antiga
  const l = [desp('a'), fim('a', 1),
    desp('b', { handoff_from: 'a' }), fim('b', 2),
    { event: 'done', job_id: 'b', cost_usd: 9 }];
  const c = cadeiaDe(l, 'a');
  assert.equal(c.total, 1, 'ficou com o valor velho do filho e a fonte velha');
  assert.equal(c.todosMedidos, false);
});

test('cadeia · pai FANTASMA nao conta como pedido (ledger truncado)', () => {
  const l = [desp('b', { handoff_from: 'nunca-existiu' }), fim('b', 2)];
  const c = cadeiaDe(l, 'b');
  assert.equal(c.pedidos, 1, 'contou um pedido que nao existe no ledger');
  assert.deepEqual(c.jobs, ['b']);
});

test('cadeia · re-despacho com outro pai da a MESMA cadeia por qualquer porta', () => {
  // antes: `pai` guardava o ultimo elo, `filhos` guardava todos os historicos — a
  // mesma conversa dava totais diferentes conforme o cartao por onde se entrasse
  const l = [desp('A'), fim('A', 1), desp('B'), fim('B', 10),
    desp('x', { handoff_from: 'A' }),
    desp('x', { handoff_from: 'B' }), fim('x', 2)];   // x re-despachado sob B
  // entrar por A e a porta que denuncia: com `filhos` a guardar elos historicos,
  // A ainda "tinha" x como filho, e a cadeia de A somava um custo que ja nao e dela
  const deA = cadeiaDe(l, 'A');
  assert.deepEqual(deA.jobs, ['A'], 'A ficou com um filho que ja foi re-despachado sob B');
  assert.equal(deA.total, 1, 'a cadeia de A somou o custo de um job que pertence a B');

  const deB = cadeiaDe(l, 'B');
  const deX = cadeiaDe(l, 'x');
  assert.deepEqual(deX.jobs.slice().sort(), deB.jobs.slice().sort(),
    'a mesma conversa via duas cadeias diferentes conforme a porta de entrada');
  assert.equal(deX.total, 12);
});
