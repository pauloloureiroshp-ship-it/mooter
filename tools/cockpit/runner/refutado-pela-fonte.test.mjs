/**
 * refutado-pela-fonte.test.mjs — sinteticos.
 *
 * O teste que mais importa e o que fixa a fronteira `[]` vs `0`: e nela que
 * assenta a decisao de descartar 39 achados, e se ela ceder o descarte deixa de
 * ter fundamento.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { coleccaoVazia, valorPresente, autoRefutado, refutado, planear } from './refutado-pela-fonte.mjs';

test('coleccaoVazia: [] e "" sao auto-descritivos', () => {
  for (const l of ['const out = [];', "let s = '';", 'let t = "";', 'const missing = [];']) {
    assert.equal(coleccaoVazia(l), true, l);
  }
});

test('coleccaoVazia: um 0 na linha tira-a do balde — o 0 e ambiguo', () => {
  // `0` pode ser zero medido ou zero por omissao. E ai que mora a doutrina, por
  // isso nunca se descarta automaticamente.
  assert.equal(coleccaoVazia('let n = 0;'), false);
  assert.equal(coleccaoVazia('const c = { erro: 0, itens: [] };'), false,
    'com 0 e [] na mesma linha, manda a ambiguidade');
  assert.equal(coleccaoVazia('const usd = x.usd || 0;'), false);
});

test('coleccaoVazia: um 0 DENTRO doutro numero nao conta como semente', () => {
  // Escrevi este teste ao contrario a primeira vez, a assumir que o `100` devia
  // tirar a linha do balde por conter um `0`. Nao devia: o `0` de `100` nao e
  // uma semente, e a fronteira `\b` da regex ja o distingue. O codigo estava
  // certo e a expectativa e que estava errada.
  assert.equal(coleccaoVazia('const a = []; // 100 itens'), true);
  assert.equal(coleccaoVazia('const lista = [];'), true);
  assert.equal(coleccaoVazia('const a = []; let n = 0;'), false, 'um 0 SOLTO ja conta');
});

test('valorPresente: se o X esta na linha, nao divergem', () => {
  assert.equal(valorPresente('THEY DIVERGE: comment says ollama_terse, code does x', 'ollama_terse: process.env.X'), true);
  assert.equal(valorPresente('THEY DIVERGE: comment says 42, code does y', 'const n = 7;'), false);
});

test('valorPresente devolve null quando o resumo nao tem a forma esperada', () => {
  assert.equal(valorPresente('THEY MATCH', 'seja o que for'), null);
  assert.equal(valorPresente('', 'x'), null);
});

test('refutado: indecidivel devolve null, nunca true', () => {
  assert.equal(refutado('P2', 'LINE 5', null), null, 'ficheiro ausente');
  assert.equal(refutado('P2', 'LINE 99', ['uma linha']), null, 'linha fora do ficheiro');
  assert.equal(refutado('P2', 'sem numero', ['x']), null);
  assert.equal(refutado('PX', 'LINE 1', ['const a = [];']), null, 'pilar sem regra');
});

test('refutado: P2 so refuta a coleccao vazia, nunca o zero', () => {
  assert.equal(refutado('P2', 'LINE 1', ['const out = [];']), true);
  assert.equal(refutado('P2', 'LINE 1', ['let n = 0;']), false, 'o 0 fica sempre para juizo humano');
});

test('planear separa e respeita decisoes ja tomadas', () => {
  const a = (pilar, chave, resumo) => ({
    pilar, chave, conclusao: 'achado', verdict: 'citacao-ok',
    ficheiro: 'f.js', repo_sha: 'sha', resultado_resumo: resumo,
  });
  const showImpl = () => 'const out = [];\nlet n = 0;\n';
  const r = planear([
    a('P2', 'k1', 'LINE 1'),
    a('P2', 'k2', 'LINE 2'),
    a('P2', 'k3', 'LINE 1'),
  ], { decisoes: new Map([['k3', { decisao: 'aceite' }]]), showImpl });
  assert.deepEqual(r.fora.map((x) => x.chave), ['k1']);
  assert.deepEqual(r.ficam.map((x) => x.chave), ['k2']);
});

// ── auto-refutacao: a alegacao contradiz-se (2026-08-23) ──────────────────

test('autoRefutado: dizer que 0 diverge de 0 e a propria refutacao', () => {
  assert.equal(autoRefutado('THEY DIVERGE: message says 0, code uses 0 PROOF: x.js:1'), true);
  assert.equal(autoRefutado('THEY DIVERGE: comment says v0.2, code does v0.2'), true);
  assert.equal(autoRefutado('THEY DIVERGE: says `4`, code uses `4`'), true);
});

test('autoRefutado: valores diferentes NAO sao auto-refutados', () => {
  assert.equal(autoRefutado('THEY DIVERGE: comment says 45, code does 75'), false,
    'divergencia real fica para leitura, nao se descarta');
});

test('autoRefutado devolve null quando nao ha par para comparar', () => {
  assert.equal(autoRefutado('THEY MATCH'), null);
  assert.equal(autoRefutado(''), null);
  assert.equal(autoRefutado('SEED VISIBLE: LINE 1 -> LINE 2'), null);
});

test('refutado: a auto-refutacao dispensa o ficheiro', () => {
  // Nao e preciso ler codigo nenhum — a afirmacao ja se desmente.
  assert.equal(refutado('P11', 'THEY DIVERGE: message says 7, code uses 7', null), true);
});
