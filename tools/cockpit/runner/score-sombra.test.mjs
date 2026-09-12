/**
 * score-sombra.test.mjs — o teste que interessa e o NEGATIVO.
 *
 * Um score de confianca e util e e, ao mesmo tempo, a maneira mais elegante de
 * um sistema deixar de aprender: filtra-se o que o modelo acha fraco, e o
 * primeiro a desaparecer e o contra-exemplo que provava que o criterio estava
 * errado. Por isso a metade que estes testes guardam nao e "o score funciona"
 * — e "o score nao pode decidir".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const {
  extrairScore, campoDeScore, keepsAssinados, limiar, podeFiltrar, pedidoDeScore,
  MIN_KEEPS_PARA_LIMIAR, DESDE,
} = await import('./score-sombra.mjs');

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// ── NAO DECIDE ──────────────────────────────────────────────────────────────

test('o limiar e n/d — e n/d NAO e zero', () => {
  const l = limiar([]);
  assert.equal(l.valor, null);
  assert.notEqual(l.valor, 0, 'zero deixaria passar tudo com ar de decisao tomada');
  assert.match(l.porque, /^n\/d/);
});

test('NAO FILTRA, com limiar ou sem ele', () => {
  assert.equal(podeFiltrar(limiar([])).filtra, false);
  assert.equal(podeFiltrar({ valor: 7, porque: 'inventado' }).filtra, false);
  assert.match(podeFiltrar({ valor: 7, porque: 'x' }).porque, /decisao do dono/);
});

test('mesmo com 100 keeps assinados o limiar continua a ser uma decisao do dono', () => {
  const cem = Array.from({ length: 100 }, () => ({
    por: 'dono', decisao: 'aceite', ts: '2026-09-02T10:00:00Z',
  }));
  const l = limiar(cem);
  assert.equal(l.valor, null, 'nem com dados o ficheiro escolhe o numero sozinho');
  assert.equal(l.keeps, 100);
  assert.match(l.porque, /decisao do dono/);
  assert.equal(podeFiltrar(l).filtra, false);
});

// ── NAO INVENTA ─────────────────────────────────────────────────────────────

test('sem score na resposta, o campo e null — nunca um valor calculado por nos', () => {
  assert.deepEqual(campoDeScore('ACHADO: x PROVA: a.js:1'), { score: null, score_fonte: null });
  assert.equal(extrairScore(''), null);
  assert.equal(extrairScore(null), null);
});

test('com score na resposta, diz-se que a FONTE foi o modelo', () => {
  assert.deepEqual(campoDeScore('ACHADO: x\nSCORE: 7'), { score: 7, score_fonte: 'auto-refletido' });
});

test('le as tres formas que o modelo usa, e o /10', () => {
  assert.equal(extrairScore('SCORE: 3'), 3);
  assert.equal(extrairScore('confianca = 9'), 9);
  assert.equal(extrairScore('CONFIDENCE: 8/10'), 8);
  assert.equal(extrairScore('CONFIANÇA: 5'), 5);
});

test('um valor fora de 1-10 NAO se apara para dentro — vira n/d', () => {
  assert.equal(extrairScore('SCORE: 47'), null, 'aparar fabricaria um valor plausivel de um sem sentido');
  assert.equal(extrairScore('SCORE: 0'), null);
  assert.equal(extrairScore('SCORE: 11'), null);
});

// ── a populacao de calibracao ───────────────────────────────────────────────

test('so keeps do DONO, e so depois do instrumento novo, contam', () => {
  const d = [
    { por: 'dono', decisao: 'aceite', ts: '2026-09-02T10:00:00Z' },   // conta
    { por: 'dono', decisao: 'issue', ts: '2026-09-03T10:00:00Z' },    // conta
    { por: 'dono', decisao: 'aceite', ts: '2026-08-20T10:00:00Z' },   // populacao antiga
    { por: 'claude', decisao: 'aceite', ts: '2026-09-02T10:00:00Z' }, // nao e o dono
    { por: 'dono', decisao: 'descartado', ts: '2026-09-02T10:00:00Z' },
  ];
  assert.equal(keepsAssinados(d), 2);
});

test('o minimo sao 20 keeps, e a fronteira e o dia do instrumento novo', () => {
  assert.equal(MIN_KEEPS_PARA_LIMIAR, 20);
  assert.equal(DESDE, '2026-09-01T00:00:00Z');
  assert.equal(limiar([]).faltam, 20);
});

test('uma decisao sem data nao conta — nao se assume que e recente', () => {
  assert.equal(keepsAssinados([{ por: 'dono', decisao: 'aceite' }]), 0);
});

// ── o pedido no prompt fica DESLIGADO ───────────────────────────────────────

test('o pedido de score esta desligado por omissao', () => {
  assert.equal(pedidoDeScore({ env: {} }), null);
  assert.equal(pedidoDeScore({ env: { MOO_SCORE_PROMPT: '0' } }), null);
  assert.match(pedidoDeScore({ env: { MOO_SCORE_PROMPT: '1' } }), /SCORE: <1-10>/);
});

test('o prompt do repo NAO pede score — ligar isso e uma mudanca medida do instrumento', () => {
  const cp = fs.readFileSync(path.join(AQUI, 'context-pack.mjs'), 'utf8');
  assert.doesNotMatch(cp, /SCORE:\s*<1-10>/,
    'se isto passar a estar no prompt, o baseline-2026-09-01 deixa de ser comparavel sem se dizer');
});

// ── o campo chega ao recibo ─────────────────────────────────────────────────

test('o recibo do runner leva os dois campos, e nao filtra por eles', () => {
  const core = fs.readFileSync(path.join(AQUI, 'runner-core.mjs'), 'utf8');
  assert.match(core, /campoDeScore\(text\)/, 'o campo nao esta a ser escrito no recibo');
  const semComentarios = core.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(semComentarios, /score\s*[<>]=?\s*\d/,
    'apareceu uma comparacao com o score no motor — o modo sombra acabou aqui');
});
