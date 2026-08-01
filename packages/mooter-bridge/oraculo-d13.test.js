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
