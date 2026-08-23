/**
 * fora-do-enunciado.test.mjs — ficheiros SINTETICOS.
 *
 * Os dois casos que interessam sao os que ja me apanharam a mim: a continuacao de
 * um bloco `/* *\/` sem `*` (que EU acusei de ser codigo) e o indecidivel (que
 * nao pode virar descarte por omissao).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { mapaComentarios, temSemente, temNumeroEmMensagem, linhaCitada, cumpre, planear } from './fora-do-enunciado.mjs';

test('mapaComentarios: // e * simples', () => {
  const m = mapaComentarios(['const a = 1;', '// nota', ' * jsdoc', 'b();']);
  assert.deepEqual(m, [false, true, true, false]);
});

test('mapaComentarios: continuacao de bloco SEM asterisco continua comentario', () => {
  // Foi aqui que a minha primeira regra errou: linha 2 nao tem marcador nenhum
  // e mesmo assim e comentario, porque o bloco abriu na linha 1.
  const m = mapaComentarios(['/* abre', 'texto solto sem marcador', '*/', 'codigo();']);
  assert.deepEqual(m, [true, true, true, false]);
});

test('mapaComentarios: bloco de uma linha nao contamina o resto', () => {
  const m = mapaComentarios(['/* tudo numa linha */', 'codigo();']);
  assert.deepEqual(m, [true, false]);
});

test('temSemente reconhece 0, vazias e [] — e recusa o resto', () => {
  for (const l of ['let n = 0;', "let s = '';", 'let a = [];', 'x = c ? c.v : 0']) {
    assert.equal(temSemente(l), true, l);
  }
  for (const l of ['durationMs,', 'agents_done?: number;', 'const now = a ?? b;', 'let s = null;']) {
    assert.equal(temSemente(l), false, l);
  }
});

test('temSemente nao confunde um 0 dentro de outro numero', () => {
  assert.equal(temSemente('const MAX = 50;'), false, '50 nao e a semente 0');
  assert.equal(temSemente('const porto = 4290;'), false);
});

test('linhaCitada le o numero certo por pilar', () => {
  assert.equal(linhaCitada('P3', 'COMMENT LINE 42: // x'), 42);
  assert.equal(linhaCitada('P2', 'LINE 7: n = 0 EXITS AT LINE 9'), 7);
  assert.equal(linhaCitada('P2', 'sem numero'), null);
});

test('indecidivel devolve null, e NAO false', () => {
  // Sem isto, um ficheiro que nao se conseguiu abrir virava descarte — descartar
  // por nao se ter olhado e o oposto de triar.
  assert.equal(cumpre('P3', 'COMMENT LINE 5', null), null, 'ficheiro ausente');
  assert.equal(cumpre('P3', 'COMMENT LINE 99', ['// so uma linha']), null, 'linha fora do ficheiro');
  assert.equal(cumpre('PX', 'LINE 1', ['x']), null, 'pilar sem regra nao se julga');
  assert.equal(cumpre('P2', 'sem numero', ['x']), null);
});

test('cumpre: P3 aceita comentario e recusa codigo', () => {
  assert.equal(cumpre('P3', 'COMMENT LINE 1', ['// nota']), true);
  assert.equal(cumpre('P3', 'COMMENT LINE 1', ['console.log(1);']), false);
});

test('cumpre: P2 aceita semente e recusa o que nao e', () => {
  assert.equal(cumpre('P2', 'LINE 1', ['let n = 0;']), true);
  assert.equal(cumpre('P2', 'LINE 1', ['durationMs,']), false);
});

test('planear separa os tres baldes e nao mexe em quem ja tem decisao', () => {
  const achado = (pilar, chave, resumo) => ({
    pilar, chave, resumo, conclusao: 'achado', verdict: 'citacao-ok',
    ficheiro: 'f.js', repo_sha: 'sha', resultado_resumo: resumo,
  });
  const showImpl = () => 'let n = 0;\nconsole.log(1);\n';
  const r = planear([
    achado('P2', 'k1', 'LINE 1'),            // cumpre
    achado('P3', 'k2', 'COMMENT LINE 2'),    // fora (e console.log)
    achado('P2', 'k3', 'LINE 99'),           // indecidivel
    achado('P2', 'k4', 'LINE 1'),            // ja decidido
  ], { decisoes: new Map([['k4', { decisao: 'aceite' }]]), showImpl });
  assert.deepEqual(r.dentro.map((x) => x.chave), ['k1']);
  assert.deepEqual(r.fora.map((x) => x.chave), ['k2']);
  assert.deepEqual(r.indecidivel.map((x) => x.chave), ['k3']);
});

// ── P11: a mensagem tem de ter um NUMERO (2026-08-23) ─────────────────────
// 76 dos 87 achados do P11 falhavam o proprio enunciado. O pilar foi desenhado
// na mesma sessao por quem escreve isto — a licao sensibilidade-vs-precisao
// aplicada ao autor.

test('temNumeroEmMensagem: string com digito passa, sem digito nao', () => {
  assert.equal(temNumeroEmMensagem("say('sondei 5 portas')"), true);
  assert.equal(temNumeroEmMensagem('erro: "falhou apos 3 tentativas"'), true);
  assert.equal(temNumeroEmMensagem('nota = `esperei ${n} de 10`'), true);

  assert.equal(temNumeroEmMensagem("text: 'vivacidade n/d — '"), false, 'string sem digito');
  assert.equal(temNumeroEmMensagem("erro: 'nao consegui ler ' + alvo"), false);
  assert.equal(temNumeroEmMensagem('raiz: v.root,'), false, 'nem sequer e mensagem');
  assert.equal(temNumeroEmMensagem('const n = 42;'), false, 'digito FORA de string nao conta');
});

test('temNumeroEmMensagem: o digito tem de estar DENTRO das aspas', () => {
  // `porto` tem digito mas fora da string — o enunciado pede o numero na
  // mensagem que a pessoa le, nao na variavel que a compoe.
  assert.equal(temNumeroEmMensagem("msg: 'porta ' + 4290"), false);
  assert.equal(temNumeroEmMensagem("msg: 'porta 4290'"), true);
});

test('cumpre: P11 usa MESSAGE LINE, nao LINE', () => {
  const linhas = ["const x = 1;", "say('faltam 3 dias')"];
  assert.equal(cumpre('P11', 'MESSAGE LINE 2: ...', linhas), true);
  assert.equal(cumpre('P11', 'MESSAGE LINE 1: ...', linhas), false);
  assert.equal(cumpre('P11', 'sem numero de linha', linhas), null);
});
