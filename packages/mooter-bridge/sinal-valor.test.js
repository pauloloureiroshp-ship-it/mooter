'use strict';

/**
 * sinal-valor.test.js
 *
 * O teste que vale por todos: **zero respostas dá `n/d`, nunca 0%.** É a diferença entre
 * "perguntámos e ninguém quer" e "nunca perguntámos" — e hoje a verdade é a segunda. Um agregado
 * que devolvesse 0% deixaria o produto contar a história errada sobre si próprio.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sv = require('./sinal-valor.js');

function ficheiroTemp(nome) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sinal-' + nome + '-')), 'sinal-valor.jsonl');
}

test('sem respostas o agregado é n/d — nunca 0%', () => {
  const f = ficheiroTemp('vazio');
  const a = sv.agregado({ ficheiro: f });
  assert.strictEqual(a.total_respostas, 0);
  assert.strictEqual(a.pagaria.valor, null, '0 respostas não pode virar 0% — é n/d');
  assert.strictEqual(a.usaria_outra_vez.valor, null);
  assert.match(a.resumo, /nunca perguntámos/);
});

test('o autor fica registado mas FORA do agregado público', () => {
  const f = ficheiroTemp('autor');
  sv.registar({ origem: 'autor', usaria: true, pagaria: true }, { ficheiro: f });
  const a = sv.agregado({ ficheiro: f });
  assert.strictEqual(a.total_respostas, 1);
  assert.strictEqual(a.do_autor, 1);
  assert.strictEqual(a.pagaria.valor, null, 'o dono a dizer que pagaria pelo próprio produto não é sinal de mercado');
  assert.strictEqual(a.disposicao_a_pagar_declarada, 0, 'a contagem de disposição a pagar não pode incluir o autor');
});

test('estranhos e amigos são contados em separado — amigo é sinal mais macio', () => {
  const f = ficheiroTemp('mistura');
  sv.registar({ origem: 'amigo', usaria: true, pagaria: true }, { ficheiro: f });
  sv.registar({ origem: 'amigo', usaria: true, pagaria: true }, { ficheiro: f });
  sv.registar({ origem: 'estranho', usaria: true, pagaria: false }, { ficheiro: f });
  const a = sv.agregado({ ficheiro: f });
  assert.strictEqual(a.de_amigos, 2);
  assert.strictEqual(a.de_estranhos, 1);
  assert.strictEqual(a.pagaria.valor, 66.7, '2 de 3 externos disseram que pagariam');
  assert.strictEqual(a.pagaria_estranhos.valor, 0, 'o único estranho disse que não — o sinal duro é 0%');
  assert.strictEqual(a.disposicao_a_pagar_declarada, 2);
});

test('quem não responde a uma pergunta não entra no denominador dessa pergunta', () => {
  const f = ficheiroTemp('parcial');
  sv.registar({ origem: 'estranho', usaria: true, pagaria: null }, { ficheiro: f });
  sv.registar({ origem: 'estranho', usaria: null, pagaria: true }, { ficheiro: f });
  const a = sv.agregado({ ficheiro: f });
  assert.strictEqual(a.usaria_outra_vez.denominador, 1, 'só uma pessoa respondeu ao "usarias"');
  assert.strictEqual(a.pagaria.denominador, 1, 'só uma pessoa respondeu ao "pagarias"');
  assert.strictEqual(a.usaria_outra_vez.valor, 100);
  assert.strictEqual(a.pagaria.valor, 100);
  assert.match(a.pagaria.porque, /1 de 1/, 'o denominador tem de vir ao lado do valor');
});

test('receita real é sempre 0 e nunca se confunde com disposição declarada', () => {
  const f = ficheiroTemp('receita');
  for (let i = 0; i < 10; i++) sv.registar({ origem: 'estranho', pagaria: true }, { ficheiro: f });
  const a = sv.agregado({ ficheiro: f });
  assert.strictEqual(a.disposicao_a_pagar_declarada, 10);
  assert.strictEqual(a.receita_real_usd, 0, 'dez pessoas a dizer que pagariam continua a ser $0 de receita');
  assert.match(a.receita_nota, /ninguém pagou/);
});

test('origem inválida é recusada com motivo — nada entra sem etiqueta', () => {
  const f = ficheiroTemp('origem');
  const r = sv.registar({ origem: 'talvez', pagaria: true }, { ficheiro: f });
  assert.strictEqual(r.ok, false);
  assert.match(r.porque, /origem/);
  assert.strictEqual(sv.lerTodas(f).length, 0);
});

test('linha corrompida é saltada, não inventada nem fatal', () => {
  const f = ficheiroTemp('corrompido');
  sv.registar({ origem: 'estranho', pagaria: true }, { ficheiro: f });
  fs.appendFileSync(f, '{isto nao e json\n', 'utf8');
  sv.registar({ origem: 'estranho', pagaria: false }, { ficheiro: f });
  const a = sv.agregado({ ficheiro: f });
  assert.strictEqual(a.total_respostas, 2, 'as duas boas contam, a corrompida desaparece: ' + a.total_respostas);
});

test('registo ilegível devolve contagens n/d, nunca zeros fabricados', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sinal-ilegivel-'));
  assert.strictEqual(sv.lerTodas(dir), null);
  const a = sv.agregado({ ficheiro: dir });
  assert.strictEqual(a.total_respostas, null);
  assert.strictEqual(a.disposicao_a_pagar_declarada, null);
  assert.strictEqual(a.pagaria.denominador, null);
  assert.match(a.resumo, /n\/d — não consegui ler/);
  assert.strictEqual(a.receita_real_usd, 0, 'receita real não depende do registo de intenção');
});

test('nada de identificação pessoal entra no registo', () => {
  const f = ficheiroTemp('privacidade');
  sv.registar({ origem: 'estranho', pagaria: true, nome: 'Maria', email: 'maria@exemplo.pt' }, { ficheiro: f });
  const bruto = fs.readFileSync(f, 'utf8');
  assert.ok(!bruto.includes('Maria'), 'um nome entrou no ficheiro');
  assert.ok(!bruto.includes('maria@exemplo.pt'), 'um email entrou no ficheiro');
});

test('não há rede neste módulo — a promessa do manifest depende disso', () => {
  const fonte = fs.readFileSync(path.join(__dirname, 'sinal-valor.js'), 'utf8');
  for (const proibido of ["require('http')", 'require("http")', "require('https')", 'require("https")', 'fetch(']) {
    assert.ok(!fonte.includes(proibido), 'sinal-valor.js ganhou rede (' + proibido + ') — o manifest diz que não há telemetria automática');
  }
});

test('o convite só aparece a quem já trabalhou', () => {
  assert.strictEqual(sv.convite(false), null, 'perguntar "pagarias?" a quem não viu nada é pedir um palpite');
  assert.match(sv.convite(true), /Pagarias/);
});
