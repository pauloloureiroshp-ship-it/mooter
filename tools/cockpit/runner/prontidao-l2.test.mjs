/**
 * prontidao-l2.test.mjs — o relatorio nao pode mentir na direccao confortavel.
 *
 * Um instrumento que mede a distancia a um objectivo tem uma tentacao muito
 * concreta: converter "ainda nao ha dados" em "0%", porque 0% e um numero e n/d
 * nao e. Estes testes existem para trancar o contrario.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-prontidao-'));
process.env.MOOTER_HOME = HOME_TMP;

const { prontidao, proveniencia } = await import('./prontidao-l2.mjs');
const { MIN_TRIADOS, AUDITORIA_1_EM } = await import('./autopilot.mjs');

const achado = (chave, o = {}) => ({
  ts: '2026-08-20T10:00:00Z', pilar: 'P2', chave,
  ficheiro: 'tools/x.js', janela: '10-20', verdict: 'citacao-ok', conclusao: 'achado',
  evidencia: 'tools/x.js:12 => n = 5', resultado_resumo: 'ACHADO: x', ...o,
});
const dec = (o) => ({ decisao: 'aceite', ...o });

/* ───────────────────────── proveniencia ───────────────────────── */

test('PROVENIENCIA: os voids em massa nao se disfarcam de triagem do dono', () => {
  const d = new Map([
    ['a', dec({ por: 'dono' })],
    ['b', dec({ por: 'claude', decisao: 'descartado', motivo: 'instrumento-nao-discrimina' })],
    ['c', dec({ por: 'claude', decisao: 'descartado', motivo: 'nao-e-um-problema' })],
    ['d', dec({ por: 'agente', decisao: 'descartado', motivo: 'trivial' })],
    ['e', dec({})],
  ]);
  const p = proveniencia(d);
  assert.equal(p.dono, 1);
  assert.equal(p.varredura_ensaio, 1, 'claude + instrumento-nao-discrimina = varredura do ensaio');
  assert.equal(p.outro, 1, 'claude com outro motivo nao e varredura de ensaio');
  assert.equal(p.agente, 1);
  assert.equal(p.sem_assinatura, 1, 'sem `por` cai no seu proprio balde — nunca no do dono');
});

test('PROVENIENCIA: um ledger vazio nao inventa baldes', () => {
  const p = proveniencia(new Map());
  assert.deepEqual(p, { dono: 0, varredura_ensaio: 0, agente: 0, outro: 0, sem_assinatura: 0 });
  assert.deepEqual(proveniencia(null), p, 'sem mapa nenhum tambem nao rebenta');
});

/* ───────────────────────── prontidao ───────────────────────── */

/**
 * O caso medido no device real a 2026-08-24: 1448 decisoes, ZERO do dono. O
 * painel dizia-lhe "you keep 0% of what it finds". Dizer 0% a quem nunca
 * decidiu nada e acusa-lo de um juizo que ele nao fez.
 */
test('SEM DADOS: a precisao e null, nunca 0 — a diferenca entre informar e acusar', () => {
  const receipts = Array.from({ length: 50 }, (_, i) => achado(`k${i}`));
  const decisoes = new Map(receipts.slice(0, 40).map((r) => [
    r.chave, dec({ por: 'claude', decisao: 'descartado', motivo: 'instrumento-nao-discrimina' }),
  ]));
  const r = prontidao({ receipts, decisoes });
  assert.equal(r.triados_pelo_dono, 0);
  assert.equal(r.precisao, null, 'null, e nao 0');
  assert.notEqual(r.precisao, 0);
  assert.equal(r.faltam, MIN_TRIADOS);
  assert.equal(r.portao.aberto, false);
  assert.match(r.portao.porque_fechado, /no data yet/);
  assert.equal(r.proveniencia.varredura_ensaio, 40);
  assert.equal(r.proveniencia.dono, 0);
});

test('COM DADOS DO DONO: a precisao e a dele, e as dos agentes nao a movem', () => {
  const receipts = Array.from({ length: 100 }, (_, i) => achado(`k${i}`));
  const decisoes = new Map();
  // 20 decisoes do dono: 15 aceites + 2 issues mantidos, 3 descartados => 85%.
  for (let i = 0; i < 15; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'aceite' }));
  for (let i = 15; i < 17; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'issue' }));
  for (let i = 17; i < 20; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'descartado', motivo: 'trivial' }));
  // E 60 de um script, que nao podem tocar no numero dele.
  for (let i = 20; i < 80; i += 1) decisoes.set(`k${i}`, dec({ por: 'claude', decisao: 'descartado', motivo: 'instrumento-nao-discrimina' }));

  const r = prontidao({ receipts, decisoes });
  assert.equal(r.triados_pelo_dono, 20);
  assert.equal(r.mantidos, 17);
  assert.equal(Math.round(r.precisao), 85);
  assert.equal(r.faltam, 0);
  assert.equal(r.portao.aberto, true, '20 decisoes a 85% passam os dois criterios');
  assert.equal(r.proveniencia.varredura_ensaio, 60, 'contadas, mas fora do numero dele');
});

test('o dono a deitar tudo fora fecha o portao — e a mensagem e sobre ELE, com dados', () => {
  const receipts = Array.from({ length: 30 }, (_, i) => achado(`k${i}`));
  const decisoes = new Map();
  for (let i = 0; i < 5; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'aceite' }));
  for (let i = 5; i < 25; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'descartado', motivo: 'trivial' }));
  const r = prontidao({ receipts, decisoes });
  assert.equal(r.triados_pelo_dono, 25);
  assert.equal(Math.round(r.precisao), 20);
  assert.equal(r.portao.aberto, false, '20% esta muito abaixo da barra');
  assert.match(r.portao.porque_fechado, /you keep 20%/, 'aqui SIM: ha dados, e o numero e dele');
});

/* ─────────────── de onde saem as decisoes que faltam ─────────────── */

test('a aritmetica dos achados necessarios e aritmetica, e nao uma previsao', () => {
  const receipts = Array.from({ length: 40 }, (_, i) => achado(`P2.${i}|f${i}.js:1-9:s${i}`));
  const r = prontidao({ receipts, decisoes: new Map() });
  assert.equal(r.fila, 40);
  assert.ok(r.reservados >= 0 && r.reservados <= 40);
  if (r.reservados < MIN_TRIADOS) {
    assert.equal(r.achados_novos_necessarios, (MIN_TRIADOS - r.reservados) * AUDITORIA_1_EM);
  } else {
    assert.equal(r.achados_novos_necessarios, 0);
  }
  // O relatorio nao tem — e nao pode ter — nenhum campo de data ou prazo.
  assert.ok(!('quando' in r) && !('eta' in r) && !('previsao' in r),
    'uma data estimada seria a unica mentira que este relatorio podia contar');
});

test('com o volume ja feito, nao se pedem achados novos', () => {
  const receipts = Array.from({ length: 30 }, (_, i) => achado(`k${i}`));
  const decisoes = new Map();
  for (let i = 0; i < 20; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'aceite' }));
  const r = prontidao({ receipts, decisoes });
  assert.equal(r.faltam, 0);
  assert.equal(r.achados_novos_necessarios, 0);
});

test('sem recibos nenhuns nada rebenta, e nada e inventado', () => {
  const r = prontidao({});
  assert.equal(r.triados_pelo_dono, 0);
  assert.equal(r.precisao, null);
  assert.equal(r.fila, 0);
  assert.equal(r.reservados, 0);
  assert.equal(r.portao.aberto, false);
  assert.equal(r.dreno.base, null, 'sem dreno datado nao ha linha de base');
});
