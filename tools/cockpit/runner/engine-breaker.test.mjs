/**
 * engine-breaker.test.mjs — o apagao de 11 horas, reproduzido em milissegundos.
 *
 * O caso real: 1767 recibos consecutivos de `motor local indisponivel: fetch
 * failed`, de 2026-08-16T23:18:40Z a 2026-08-17T10:18:49Z. Cada um foi contado
 * como uma ronda. Estes testes existem para que essa forma de mentir ao ledger
 * nao possa voltar sem partir a suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEngineBreaker,
  backoffSeconds,
  ENGINE_DOWN_AFTER,
  BACKOFF_BASE_S,
  BACKOFF_CAP_S,
} from './engine-breaker.mjs';

const iso = (s) => new Date(Date.UTC(2026, 7, 18, 0, 0, 0) + s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const falha = (s) => ({ falha_motor: true, ts: iso(s), verdict: 'sem-achado', resultado_resumo: 'motor local indisponivel: fetch failed' });
const boa = (s) => ({ falha_motor: false, ts: iso(s), verdict: 'citacao-ok', resultado_resumo: 'ACHADO: ...' });

test('backoff sobe em potencias de dois e para no tecto', () => {
  assert.equal(backoffSeconds(0), 0, 'sem falhas nao ha espera extra');
  assert.equal(backoffSeconds(1), BACKOFF_BASE_S);
  assert.equal(backoffSeconds(2), BACKOFF_BASE_S * 2);
  assert.equal(backoffSeconds(3), BACKOFF_BASE_S * 4);
  assert.equal(backoffSeconds(99), BACKOFF_CAP_S, 'um apagao longo nunca dorme mais do que o tecto');
  assert.ok(BACKOFF_CAP_S <= 15 * 60, 'o tecto e 15 minutos: acima disso o dono deixa de ver o regresso');
});

test('uma falha isolada continua a ser sinal — o ledger regista o blip', () => {
  const b = createEngineBreaker();
  const r = b.observe(falha(0), iso(0));
  assert.equal(r.recibos.length, 1);
  assert.equal(r.recibos[0].falha_motor, true, 'abaixo do limiar passa o recibo tal e qual');
  assert.equal(r.aberto, false);
  assert.equal(r.backoffS, BACKOFF_BASE_S, 'mesmo um blip abranda o martelo');
});

test('ACEITACAO: 200 rondas com o motor em baixo dao 3 linhas, nao 200', () => {
  const b = createEngineBreaker();
  const ledger = [];
  for (let n = 0; n < 200; n += 1) ledger.push(...b.observe(falha(n * 30), iso(n * 30)).recibos);

  assert.equal(ledger.length, ENGINE_DOWN_AFTER,
    `um apagao tem de custar ${ENGINE_DOWN_AFTER} linhas, aconteca ele 200 vezes ou 1767`);
  const evento = ledger.at(-1);
  assert.equal(evento.evento, 'engine:down');
  assert.equal(evento.inicio, iso(0), 'o engine:down carrega o instante em que o apagao COMECOU');
  assert.equal(evento.usd, 0);
  assert.ok(!ledger.some((r) => r.evento === 'engine:down' && r !== evento), 'so um engine:down por apagao');
});

test('o disjuntor aberto poe o ledger em silencio, nao o processo', () => {
  const b = createEngineBreaker();
  for (let n = 0; n < 50; n += 1) b.observe(falha(n * 30), iso(n * 30));
  const depois = b.observe(falha(9999), iso(9999));
  assert.deepEqual(depois.recibos, [], 'com o disjuntor aberto nao se grava mais nada');
  assert.equal(depois.aberto, true);
  assert.equal(depois.backoffS, BACKOFF_CAP_S, 'mas continua a tentar, devagar');
  assert.equal(b.estado.falhas, 51, 'e continua a CONTAR — o silencio nao e amnesia');
});

test('ACEITACAO: ao voltar, o engine:up traz a duracao real do apagao', () => {
  const b = createEngineBreaker();
  const ONZE_HORAS = 11 * 3600;
  for (let t = 0; t < ONZE_HORAS; t += 900) b.observe(falha(t), iso(t));
  const volta = b.observe(boa(ONZE_HORAS), iso(ONZE_HORAS));

  assert.equal(volta.recibos.length, 2, 'o engine:up e a ronda boa, por esta ordem');
  const [up, ronda] = volta.recibos;
  assert.equal(up.evento, 'engine:up');
  assert.equal(up.apagao_s, ONZE_HORAS, 'a duracao e medida do inicio ao regresso, nao estimada');
  assert.equal(up.inicio, iso(0));
  assert.ok(up.rondas_engolidas > 40, 'diz quantas rondas nao foram gravadas — o silencio e declarado');
  assert.equal(ronda.verdict, 'citacao-ok', 'a primeira ronda boa entra normalmente');
  assert.equal(volta.backoffS, 0, 'motor de volta, ritmo normal de volta');
  assert.equal(b.estado.aberto, false);
});

test('duas falhas separadas por sucesso NAO abrem o disjuntor', () => {
  const b = createEngineBreaker();
  const ledger = [];
  for (const r of [falha(0), boa(30), falha(60), boa(90), falha(120), boa(150)]) {
    ledger.push(...b.observe(r, r.ts).recibos);
  }
  assert.equal(ledger.length, 6, 'sem sequencia nao ha apagao: todos os recibos passam');
  assert.ok(!ledger.some((r) => r.evento), 'e nenhum evento de disjuntor e emitido');
  assert.equal(b.estado.falhas, 0);
});

test('um STOP do dono nao e um motor em baixo', () => {
  const b = createEngineBreaker();
  // runner-core so poe falha_motor quando NAO fomos nos a abortar por STOP.
  const abortadoPorStop = { ts: iso(0), verdict: 'sem-achado', resultado_resumo: 'STOP durante a geracao — ronda abortada' };
  const ledger = [];
  for (let n = 0; n < 20; n += 1) ledger.push(...b.observe(abortadoPorStop, iso(n)).recibos);
  assert.equal(ledger.length, 20, 'parar por vontade do dono e trabalho registado, nao avaria');
  assert.equal(b.estado.aberto, false);
});

test('a duracao do apagao usa UM relogio — nunca mistura o ts do recibo com o do ciclo', () => {
  const b = createEngineBreaker();
  // O recibo traz um ts de OUTRO relogio (no runner real vem do clock do
  // runRound). O disjuntor tem de ignorar esse e medir-se a si proprio.
  const doOutroRelogio = { falha_motor: true, ts: '2031-01-01T00:00:00Z' };
  for (let n = 0; n < 5; n += 1) b.observe(doOutroRelogio, iso(n * 60));
  const up = b.observe(boa(600), iso(600)).recibos[0];
  assert.equal(up.inicio, iso(0), 'o inicio e o instante em que o DISJUNTOR viu a primeira falha');
  assert.equal(up.apagao_s, 600);
});

test('duracao impossivel diz n/d em vez de zero — clampar a 0 e mentir com um numero', () => {
  const b = createEngineBreaker();
  for (let n = 0; n < 5; n += 1) b.observe(falha(n * 60), iso(600));
  const up = b.observe(boa(0), iso(0)).recibos[0]; // "fim" antes do "inicio"
  assert.equal(up.apagao_s, null);
  assert.match(up.resultado_resumo, /n\/d/);
});
