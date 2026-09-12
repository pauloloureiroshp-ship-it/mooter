/**
 * replay-sample.test.mjs — a amostra tem de ser reproduzivel, proporcional, e CEGA.
 *
 * As tres propriedades sao as que dao valor ao replay, e cada uma tem uma forma
 * facil de se perder sem ninguem reparar: uma amostra aleatoria que ninguem
 * repete; uma estratificacao que arredonda a celula medida para longe; e um
 * pacote que mostra o rotulo antigo e passa a medir se o dono concorda consigo
 * proprio.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const {
  ordem, repartir, estratoDe, amostrar, fichaDoItem, manifesto, linhaDoAlvo,
  TAMANHO, DESTINO, REPO,
} = await import('./replay-sample.mjs');

// ── reproduzivel ────────────────────────────────────────────────────────────

test('a ordem e determinística e depende da semente', () => {
  assert.equal(ordem('P1|a.js:1-9:aa'), ordem('P1|a.js:1-9:aa'));
  assert.notEqual(ordem('P1|a.js:1-9:aa'), ordem('P1|a.js:1-9:bb'));
  assert.notEqual(ordem('x', { semente: 'A' }), ordem('x', { semente: 'B' }));
});

test('nao ha Math.random em lado nenhum — uma amostra irrepetivel nao e evidencia', () => {
  const src = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'runner', 'replay-sample.mjs'), 'utf8');
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /Math\.random/);
});

// ── proporcional ────────────────────────────────────────────────────────────

test('os maiores restos somam SEMPRE o total pedido', () => {
  for (const pop of [
    { a: 607, b: 446, c: 11, d: 3, e: 2, f: 1 },
    { a: 1, b: 1, c: 1 },
    { a: 999 },
    { a: 7, b: 7, c: 7, d: 7, e: 7, f: 7, g: 7 },
  ]) {
    const q = repartir(pop, 50);
    assert.equal(Object.values(q).reduce((s, n) => s + n, 0), 50, JSON.stringify(pop));
  }
});

test('a celula que o gate mede sobrevive a amostragem', () => {
  const q = repartir({ 'instrumento-nao-discrimina': 607, trivial: 446, 'nao-e-um-problema': 11, aceite: 3, issue: 1, outro: 2 }, 50);
  assert.equal(q['instrumento-nao-discrimina'], 28);
  const pctPop = 607 / 1070;
  const pctAmostra = 28 / 50;
  assert.ok(Math.abs(pctPop - pctAmostra) < 0.02, `${pctPop} vs ${pctAmostra}`);
});

test('populacao vazia nao produz amostra inventada', () => {
  assert.deepEqual(repartir({}, 50), {});
});

test('empates desfazem-se pelo nome — senao a amostra deixa de ser repetivel', () => {
  const a = repartir({ z: 10, a: 10, m: 10 }, 4);
  const b = repartir({ m: 10, z: 10, a: 10 }, 4);
  assert.deepEqual(a, b);
});

test('o estrato de um descarte e o motivo; de um aceite, a decisao', () => {
  assert.equal(estratoDe({ decisao: 'descartado', motivo: 'trivial' }), 'trivial');
  assert.equal(estratoDe({ decisao: 'descartado' }), 'descartado-sem-motivo');
  assert.equal(estratoDe({ decisao: 'aceite' }), 'aceite');
});

// ── so o que existe ─────────────────────────────────────────────────────────

const RECIBOS = Array.from({ length: 40 }, (_, i) => ({
  chave: `P1|a.js:${i}-9:h${i}`, conclusao: 'achado', pilar: 'P1', ficheiro: 'a.js',
  janela: `${i + 1}-70`, resultado_resumo: `LINE ${i + 1}: x`,
}));
const DECISOES = RECIBOS.map((r, i) => ({
  chave: r.chave, decisao: 'descartado',
  motivo: i < 30 ? 'instrumento-nao-discrimina' : 'trivial', por: 'claude', ts: '2026-08-26T10:00:00Z',
}));

test('uma decisao sobre um achado que ja nao existe no ledger nao entra', () => {
  const a = amostrar([...DECISOES, { chave: 'fantasma', decisao: 'descartado', motivo: 'trivial' }], RECIBOS, { total: 10 });
  assert.equal(a.total_populacao, 40);
  assert.ok(a.escolhidos.every((x) => x.recibo));
});

test('recibos sem achado nao entram — nao ha o que enriquecer', () => {
  const a = amostrar(DECISOES, [...RECIBOS, { chave: 'z', conclusao: 'sem-achado' }], { total: 10 });
  assert.equal(a.total_populacao, 40);
});

test('a amostra sai do mesmo tamanho e do mesmo conteudo em duas corridas', () => {
  const um = amostrar(DECISOES, RECIBOS, { total: 10 });
  const dois = amostrar(DECISOES, RECIBOS, { total: 10 });
  assert.deepEqual(um.escolhidos.map((x) => x.recibo.chave), dois.escolhidos.map((x) => x.recibo.chave));
  assert.equal(um.escolhidos.length, 10);
});

// ── CEGA ────────────────────────────────────────────────────────────────────

test('A FICHA NAO MOSTRA O ROTULO ANTIGO — senao mede se o dono concorda consigo', () => {
  const item = {
    recibo: { chave: 'P1|a.js:1-9:aa', pilar: 'P1', ficheiro: 'a.js', resultado_resumo: 'LINE 1: x' },
    decisao: { decisao: 'descartado', motivo: 'instrumento-nao-discrimina', por: 'dono' },
    estrato: 'instrumento-nao-discrimina',
  };
  const ficha = fichaDoItem(1, item, { alvo: { ficheiro: 'a.js', linha: 1 }, snippet: { texto: '1 >| x' } });
  assert.ok(!ficha.includes('instrumento-nao-discrimina\n'), 'o motivo antigo vazou para a ficha');
  assert.doesNotMatch(ficha, /decisao_anterior|motivo_anterior/);
  // A lista de motivos POR ESCOLHER tem de la estar — e o formulario, nao o gabarito.
  assert.match(ficha, /decisao: aceite \| descartado \| issue/);
  assert.match(ficha, /as cegas/);
});

test('a ficha pede a decisao e traz a chave para a colar de volta', () => {
  const ficha = fichaDoItem(7, {
    recibo: { chave: 'K', pilar: 'P2', ficheiro: 'b.js' }, decisao: {}, estrato: 'trivial',
  }, { porque: 'ficheiro inexistente' });
  assert.match(ficha, /# Replay 07 de 50/);
  assert.match(ficha, /chave: "K"/);
  assert.match(ficha, /nao foi possivel enriquecer/);
});

// ── o manifesto diz o que a amostra NAO pode dizer ──────────────────────────

test('o manifesto declara os limites em vez de os esconder', () => {
  const a = amostrar(DECISOES, RECIBOS, { total: 10 });
  const m = manifesto(a);
  assert.match(m, /Nao mede keep-rate/);
  assert.match(m, /50 e uma amostra pequena/);
  assert.match(m, /Nao abras o `gabarito.json`|Nao abras o gabarito/);
});

// ── a linha que se mostra ───────────────────────────────────────────────────

test('centra-se na linha CITADA, nao no inicio da janela', () => {
  assert.equal(linhaDoAlvo({ janela: '3901-3970', citacoes: [{ ref: 'a.js:3921' }] }), 3921);
  assert.equal(linhaDoAlvo({ janela: '3901-3970', citacoes: [] }), 3901);
  assert.equal(linhaDoAlvo({}), 1);
});

// ── o que ficou em disco ────────────────────────────────────────────────────

test('os 50 pacotes existem, com manifesto e gabarito SEPARADO', () => {
  assert.ok(fs.existsSync(DESTINO), 'falta a pasta do replay');
  const nomes = fs.readdirSync(DESTINO);
  const fichas = nomes.filter((n) => /^\d\d-/.test(n));
  assert.equal(fichas.length, TAMANHO);
  assert.ok(nomes.includes('MANIFESTO.md'));
  assert.ok(nomes.includes('gabarito.json'));
  const gab = JSON.parse(fs.readFileSync(path.join(DESTINO, 'gabarito.json'), 'utf8'));
  assert.equal(gab.itens.length, TAMANHO);
  assert.match(gab._, /NAO ABRIR/);
});

test('NENHUMA das 50 fichas contem uma decisao ja tomada', () => {
  for (const n of fs.readdirSync(DESTINO).filter((x) => /^\d\d-/.test(x))) {
    const t = fs.readFileSync(path.join(DESTINO, n), 'utf8');
    assert.doesNotMatch(t, /decisao_anterior/, n);
    assert.doesNotMatch(t, /^decisao: (aceite|descartado|issue)$/m, `${n} ja vem rotulado`);
  }
});
