// oraculo-d13.test.js — D13: o oráculo corre POR OMISSÃO em jobs de escrita.
//
// Prova o contrato da decisão, não a leitura do `if`: sem variável nenhuma o
// oráculo está LIGADO; só `MOOTER_ORACULO=0` o desliga; o antigo `=1` continua
// a ligá-lo (nenhuma configuração existente muda de comportamento); e a porta
// continua fechada para jobs que não escrevem — um job de leitura não pode
// partir nada, e medir a suite por causa dele seria custo sem sinal.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { ORACULO_LIGADO } = require('./seamless.js');
const oraculo = require('./oraculo.js');

function comEnv(valor, fn) {
  const antes = process.env.MOOTER_ORACULO;
  if (valor === undefined) delete process.env.MOOTER_ORACULO;
  else process.env.MOOTER_ORACULO = valor;
  try { return fn(); } finally {
    if (antes === undefined) delete process.env.MOOTER_ORACULO;
    else process.env.MOOTER_ORACULO = antes;
  }
}

test('D13: sem variável, o oráculo está LIGADO — a omissão mudou', () => {
  assert.equal(comEnv(undefined, ORACULO_LIGADO), true);
});

test('D13: `MOOTER_ORACULO=0` é o único opt-out — reversível numa variável', () => {
  assert.equal(comEnv('0', ORACULO_LIGADO), false);
  assert.equal(comEnv(' 0 ', ORACULO_LIGADO), false, 'espaços à volta não podem reactivar por acidente');
});

test('D13: o antigo `MOOTER_ORACULO=1` continua a ligar — nada quebra a montante', () => {
  assert.equal(comEnv('1', ORACULO_LIGADO), true);
});

test('D13: um valor desconhecido mantém-no ligado — a falha é para o lado do sinal', () => {
  assert.equal(comEnv('talvez', ORACULO_LIGADO), true);
  assert.equal(comEnv('', ORACULO_LIGADO), true);
});

// ── Os dois defeitos que ligar por omissão transformou de teóricos em diários ──
// Apanhados pelo gate pré-push desta wave. Enquanto o oráculo era opt-in
// (MOOTER_ORACULO=1) quase ninguém os atingia; a partir de D13 estão no caminho
// de TODOS os jobs de escrita, e por isso são bloqueadores e não notas.

test('D13/1: um check que passava e que DEPOIS não arranca não é regressão do job', () => {
  // ENOENT/EACCES/PATH mexido a meio ⇒ `passou: null` (não arrancou), nunca
  // `false`. Com o antigo filtro `!c.passou` isto entrava em falhDepois sem
  // estar em falhAntes e escrevia followup_quality:0 por causa da máquina.
  const antes = { veredicto: 'verde', checks: [{ id: 'test', passou: true }, { id: 'lint', passou: true }] };
  const depois = { veredicto: 'verde', checks: [{ id: 'test', passou: null, correu: false }, { id: 'lint', passou: true }] };
  const v = oraculo.comparar(antes, depois);
  assert.notEqual(v.veredicto, 'regressao', 'ausência de medição virou medição negativa');
  assert.deepEqual(v.novos_falhados, []);
  assert.notEqual(v.followup_quality, 0, 'castigou o job pelo ambiente da máquina');
});

test('D13/1: mas também não é PRÉMIO — quem apaga a prova não leva followup_quality 1', () => {
  // A assimetria que a própria correcção acima criou: se `passou:null` deixa de
  // castigar, um job que parta a CAPACIDADE de correr o check (apagar o
  // package.json, estragar o PATH) apagava a única prova contra si e caía no
  // ramo verde. Sem medição, silêncio — nem culpa nem crédito.
  const antes = { veredicto: 'verde', checks: [{ id: 'test', passou: true }, { id: 'lint', passou: true }] };
  const depois = { veredicto: 'verde', checks: [{ id: 'test', passou: null, correu: false }, { id: 'lint', passou: true }] };
  const v = oraculo.comparar(antes, depois);
  assert.equal(v.veredicto, 'n/d');
  assert.equal(v.followup_quality, null, 'premiou um job por uma prova que desapareceu');
  assert.match(v.porque, /deixou de ser medida/);
  assert.equal(oraculo.eventoDeQualidade(v), null);
});

test('D13/1: um check que DESAPARECE da lista conta como deixou de ser medido', () => {
  // Remover o script do package.json faz o check sumir de `detectarChecks`,
  // não aparecer como null. É a mesma perda de prova por outra porta.
  const antes = { veredicto: 'verde', checks: [{ id: 'test', passou: true }, { id: 'lint', passou: true }] };
  const depois = { veredicto: 'verde', checks: [{ id: 'lint', passou: true }] };
  const v = oraculo.comparar(antes, depois);
  assert.equal(v.veredicto, 'n/d');
  assert.equal(v.followup_quality, null);
  assert.match(v.porque, /test/);
});

// `node-test` e `test` são o MESMO papel por duas fontes (detectarChecks:77-91):
// `test` quando o package.json o declara, `node-test` quando é inferido dos
// *.test.js da raiz. Um job que acrescente `scripts.test` faz o check mudar de
// nome — e sem normalizar por papel isso lê-se como prova nova + prova perdida.

test('D13/1: acrescentar scripts.test ao package.json é BOM, não silêncio', () => {
  // node-test verde → test verde. Tudo medido, tudo a passar, e o job fez
  // exactamente o que devia. Sem normalizar por papel dava n/d.
  const antes = { veredicto: 'verde', checks: [{ id: 'node-test', passou: true }] };
  const depois = { veredicto: 'verde', checks: [{ id: 'test', passou: true }] };
  const v = oraculo.comparar(antes, depois);
  assert.equal(v.veredicto, 'verde');
  assert.equal(v.followup_quality, 1, 'castigou com silêncio um job que declarou os testes');
});

test('D13/1: e a mesma renomeação com a suite vermelha não inventa culpa nova', () => {
  // node-test vermelho → test vermelho: a MESMA falha crónica por outro nome.
  // Sem normalizar por papel, `test` entrava em `novos` e escrevia 0.
  const antes = { veredicto: 'vermelho', checks: [{ id: 'node-test', passou: false }] };
  const depois = { veredicto: 'vermelho', checks: [{ id: 'test', passou: false }] };
  const v = oraculo.comparar(antes, depois);
  assert.notEqual(v.veredicto, 'regressao', 'imputou ao job uma falha que ja existia, so por mudar de nome');
  assert.deepEqual(v.novos_falhados, []);
});

test('D13/1: uma falha REAL nova continua a ser imputada — a guarda não cega o oráculo', () => {
  const antes = { veredicto: 'verde', checks: [{ id: 'test', passou: true }] };
  const depois = { veredicto: 'vermelho', checks: [{ id: 'test', passou: false }] };
  const v = oraculo.comparar(antes, depois);
  assert.equal(v.veredicto, 'regressao');
  assert.equal(v.followup_quality, 0);
  assert.deepEqual(v.novos_falhados, ['test']);
});

test('D13/1: um check que já não arrancava ANTES e falha a sério DEPOIS conta como novo', () => {
  const antes = { veredicto: 'verde', checks: [{ id: 'a', passou: true }, { id: 'test', passou: null, correu: false }] };
  const depois = { veredicto: 'vermelho', checks: [{ id: 'a', passou: true }, { id: 'test', passou: false }] };
  const v = oraculo.comparar(antes, depois);
  assert.deepEqual(v.novos_falhados, ['test'], 'um vermelho medido tem de contar mesmo vindo de um n/d');
});

test('D13/2: sem medição, «não entregou» NÃO escreve — senão o 0 era o único valor possível', () => {
  // A raiz deste repo não declara scripts.test/lint/build nem tem *.test.js na
  // raiz ⇒ medir() devolve n/d ⇒ comparar() devolve followup_quality null ⇒ o
  // caminho honesto nunca escreve. Se a entrega escrevesse à mesma, aquela
  // worktree só sabia produzir castigo, nunca recompensa.
  const nd = oraculo.comparar({ veredicto: 'n/d', checks: [] }, { veredicto: 'n/d', checks: [] });
  assert.equal(nd.followup_quality, null);
  const composto = oraculo.comporEntrega(nd, { entregou: false, porque: 'a worktree ficou igual' });
  assert.equal(composto.followup_quality, null, 'n/d virou 0 — sinal unidireccional');
  assert.equal(oraculo.eventoDeQualidade(composto), null, 'escreveu evento sem ter medido nada');
});

test('D13/2: COM medição, «não entregou» continua a matar o verde comprado com inacção', () => {
  const verde = oraculo.comparar(
    { veredicto: 'verde', checks: [{ id: 'test', passou: true }] },
    { veredicto: 'verde', checks: [{ id: 'test', passou: true }] });
  assert.equal(verde.followup_quality, 1);
  const composto = oraculo.comporEntrega(verde, { entregou: false, porque: '20 escritas negadas' });
  assert.equal(composto.veredicto, 'nao_entregou');
  assert.equal(composto.followup_quality, 0);
  assert.match(oraculo.eventoDeQualidade(composto).porque, /negadas/);
});

test('D13/2: quem entregou passa incólume, e um veredicto ausente não é inventado', () => {
  const verde = { veredicto: 'verde', followup_quality: 1, novos_falhados: [], porque: 'tudo passa' };
  assert.deepEqual(oraculo.comporEntrega(verde, { entregou: true }), verde);
  assert.deepEqual(oraculo.comporEntrega(verde, null), verde);
  assert.equal(oraculo.comporEntrega(null, { entregou: false }), null);
});
