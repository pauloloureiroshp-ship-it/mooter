/**
 * reserva.test.mjs — o runner cede a maquina, e volta sozinho.
 *
 * Medido numa so sessao (2026-08-18), o runner atrapalhou trabalho de primeiro
 * plano quatro vezes: derrubou o wave-gate por contencao de git, obrigou a
 * parar uma medicao A/B, e o STOP posto a mao desapareceu sem ninguem saber
 * quando. O STOP e o gesto do dono e tem de sobreviver a reinicios; para
 * "preciso da maquina vinte minutos" ele e a ferramenta errada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { reservar, libertar, verReserva, esperaS, caminhoReserva, MAX_MINUTOS, MINUTOS_OMISSAO } from './reserva.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'moo-res-'));

test('sem reserva, a maquina e do runner', () => {
  const v = verReserva(tmp());
  assert.equal(v.activa, false);
  assert.equal(v.motivo, 'sem reserva');
  assert.equal(v.faltaS, 0);
});

test('uma reserva activa cede a maquina, e diz a QUEM e porque', () => {
  const b = tmp();
  reservar(b, { quem: 'wave 61', porque: 'build pesado', minutos: 30 });
  const v = verReserva(b);
  assert.equal(v.activa, true);
  assert.match(v.motivo, /wave 61: build pesado/);
  assert.ok(v.faltaS > 1700 && v.faltaS <= 1800);
});

test('ACEITACAO: uma reserva esquecida EXPIRA — e a diferenca para o STOP', () => {
  // Um STOP esquecido deixa a maquina parada para sempre; foi o que aconteceu
  // hoje, e ninguem soube quando. Uma reserva esquecida deixa de valer sozinha.
  const b = tmp();
  reservar(b, { quem: 'medicao', minutos: 20 });
  assert.equal(verReserva(b, { agora: Date.now() + 19 * 60_000 }).activa, true, 'antes do prazo, vale');
  const depois = verReserva(b, { agora: Date.now() + 21 * 60_000 });
  assert.equal(depois.activa, false, 'passado o prazo, a maquina volta ao runner sem ninguem intervir');
  assert.match(depois.motivo, /expirou/);
});

test('ACEITACAO: se o processo que reservou morrer, a reserva caduca', () => {
  // Uma GPU nao fica presa a um script que rebentou a meio.
  const b = tmp();
  reservar(b, { quem: 'script que rebentou', minutos: 120, pid: 999_999 });
  const v = verReserva(b);
  assert.equal(v.activa, false);
  assert.match(v.motivo, /morreu — reserva caduca/);
});

test('uma reserva ilegivel e tratada como ausente, nunca como eterna', () => {
  const b = tmp();
  fs.mkdirSync(b, { recursive: true });
  fs.writeFileSync(caminhoReserva(b), '{isto nao e json');
  assert.equal(verReserva(b).activa, false);
  fs.writeFileSync(caminhoReserva(b), '{"quem":"x"}');
  assert.equal(verReserva(b).activa, false, 'sem prazo nao ha reserva — o prazo e o que a torna segura');
});

test('ninguem fica com a maquina para sempre, nem sem dizer quem e', () => {
  const b = tmp();
  assert.equal(reservar(b, { quem: 'ganancioso', minutos: 9999 }).minutos, MAX_MINUTOS, 'ha tecto');
  assert.equal(reservar(b, { quem: 'x' }).minutos, MINUTOS_OMISSAO, 'sem duracao, e curta');
  assert.throws(() => reservar(b, { quem: '' }), /sem dono/, 'uma reserva anonima nao se cobra a ninguem');
});

test('libertar devolve a maquina antes do tempo, e e idempotente', () => {
  const b = tmp();
  reservar(b, { quem: 'x', minutos: 60 });
  assert.equal(libertar(b), true);
  assert.equal(verReserva(b).activa, false);
  assert.equal(libertar(b), true, 'libertar duas vezes nao rebenta');
});

test('nao se dorme ate ao fim da reserva — ela pode ser libertada mais cedo', () => {
  // Uma GPU parada a mais e o mesmo desperdicio que uma GPU a atrapalhar.
  assert.equal(esperaS(3600), 60, 'ha tecto de espera');
  assert.equal(esperaS(12), 12);
  assert.equal(esperaS(0), 0);
  assert.equal(esperaS(-5), 0);
});

// ------------------------------------------- o ciclo cede, e volta sozinho

test('ACEITACAO E2E: com reserva o ciclo NAO despacha, e avisa uma vez so', async () => {
  process.env.MOOTER_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-res-e2e-'));
  const r = await import('./moo-runner.mjs');
  fs.mkdirSync(r.PATHS.base, { recursive: true });
  reservar(r.PATHS.base, { quem: 'wave 61', porque: 'build pesado', minutos: 30 });

  let despachou = 0;
  const logs = [];
  await r.main({
    argv: [], maxRounds: 8, logImpl: (m) => logs.push(m),
    publishBeaconImpl: async () => {}, sleepImpl: async () => {},
    runRoundImpl: async () => { despachou += 1; return { receipt: { motor_ok: true, verdict: 'sem-achado' } }; },
  });
  assert.equal(despachou, 0, 'uma reserva activa tem de calar o despacho');
  // Um aviso por volta durante duas horas e a mesma inundacao que o disjuntor
  // existe para travar, noutro sitio.
  assert.equal(logs.filter((l) => l.includes('cedo a maquina')).length, 1, 'avisa UMA vez, nao 8');
  assert.match(logs.find((l) => l.includes('cedo a maquina')), /wave 61: build pesado/);
  libertar(r.PATHS.base);
});

test('ACEITACAO E2E: passado o prazo, o ciclo volta ao trabalho sem ninguem intervir', async () => {
  process.env.MOOTER_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-res-e2e2-'));
  const r = await import('./moo-runner.mjs');
  fs.mkdirSync(r.PATHS.base, { recursive: true });
  reservar(r.PATHS.base, { quem: 'esquecida', minutos: 5 });
  // Envelhecer a reserva: e exactamente o caso "alguem esqueceu-se de libertar".
  const f = path.join(r.PATHS.base, 'reserva.json');
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.ate = new Date(Date.now() - 60_000).toISOString();
  fs.writeFileSync(f, JSON.stringify(j));

  let despachou = 0;
  fs.rmSync(r.PATHS.LOCK, { force: true });
  await r.main({
    argv: [], maxRounds: 3, logImpl: () => {},
    publishBeaconImpl: async () => {}, sleepImpl: async () => {},
    runRoundImpl: async () => { despachou += 1; return { receipt: { motor_ok: true, verdict: 'sem-achado' } }; },
  });
  assert.equal(despachou, 3, 'a maquina volta ao runner sozinha — e a diferenca para o STOP');
});
