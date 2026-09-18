// 17-deadline-persists.test.mjs — critério 17: o reinício conserva o deadline
// ORIGINAL de 45 min (incluindo esperas); a retoma não cria outro run/wave ID
// para renovar tempo ou crédito.
//
// Contra-exemplo no motor: packages/cli/src/commands/workflow.ts:208 cria
// `run_id = name + Date.now()` a cada corrida — um re-run é um run novo com
// relógio novo. Aqui o wave_id vem do manifesto e o deadline vem do 1.º e
// único `wave.opened`.
//
// Mordida (verificada à mão no fecho do passo 1; relatório no handoff): fazer openWave recalcular quando já está aberta
// (remover a guarda `already_open`) põe 17b vermelho; recalcular o deadline a partir do relógio põe 17a/17b/17c vermelhos (medido no fecho do passo 1).

import test from 'node:test';
import assert from 'node:assert/strict';

import * as J from '../journal.mjs';
import { openedWave, clock, fakeExecutor, operatorTriesToSend, linhas, tmpRoot, T0, MIN, MANIFEST_HASH } from './_harness.mjs';

const ISO = (ms) => new Date(ms).toISOString();

test('17a · aberta em T0, «processo morre», retoma em T0+30 min: deadline_at e closeout_at são os de T0; restam 10 min para o fecho', () => {
  const root = tmpRoot();
  const clk = clock(T0);
  const { ctx } = openedWave({ root, waveId: 'W-17', clk, slots: ['S01-1', 'S02-1'] });
  const w0 = J.waveState(ctx);
  assert.equal(w0.opened_at, ISO(T0));
  assert.equal(w0.deadline_at, ISO(T0 + 45 * MIN));
  assert.equal(w0.closeout_at, ISO(T0 + 40 * MIN));
  const antes = linhas(ctx).length;

  // «Morre» o processo: o contexto some; um processo novo abre o mesmo root/wave.
  clk.advance(30 * MIN);
  const ctx2 = J.openJournal({ root, waveId: 'W-17', now: clk.now });
  const r = J.resume(ctx2);

  assert.equal(r.wave.state, 'open');
  assert.equal(r.wave.deadline_at, ISO(T0 + 45 * MIN), 'o deadline NÃO se move com o reinício');
  assert.equal(r.wave.closeout_at, ISO(T0 + 40 * MIN));
  assert.equal(r.remaining_to_closeout_ms, 10 * MIN, '15 min até ao deadline menos 5 de reserva = 10 min úteis');
  assert.equal(r.can_send, true);
  assert.equal(linhas(ctx2).length, antes, 'a retoma de uma onda sem slots em voo não escreve nada');
  assert.equal(linhas(ctx2).filter((l) => JSON.parse(l).kind === 'wave.opened').length, 1, 'continua a haver UM wave.opened');
});

test('17b · abrir de novo é recusado (already_open) — mesmo depois do deadline; nunca há reabertura para renovar tempo', () => {
  const root = tmpRoot();
  const clk = clock(T0);
  const { ctx } = openedWave({ root, waveId: 'W-17b', clk });
  const antes = linhas(ctx).length;

  for (const dt of [1 * MIN, 30 * MIN, 44 * MIN, 46 * MIN, 24 * 60 * MIN]) {
    clk.t = T0 + dt;
    const ctxN = J.openJournal({ root, waveId: 'W-17b', now: clk.now });
    assert.throws(() => J.openWave(ctxN, { manifest_hash: MANIFEST_HASH }), (e) => e.code === 'already_open' && e.details.deadline_at === ISO(T0 + 45 * MIN), `T0+${dt / MIN}min`);
    assert.throws(() => J.openWave(ctxN, { manifest_hash: MANIFEST_HASH, wallclock_minutes: 90 }), (e) => e.code === 'already_open', 'nem com janela maior');
  }
  assert.equal(linhas(ctx).length, antes, 'nenhuma tentativa de reabrir escreveu no diário');
});

test('17c · passado closeout_at, commitIntent recusa com closeout_reached; o deadline reportado é o original', () => {
  const root = tmpRoot();
  const clk = clock(T0);
  const { ctx } = openedWave({ root, waveId: 'W-17c', clk, slots: ['S01-1'] });
  const exec = fakeExecutor();

  clk.t = T0 + 39 * MIN + 59_000;
  assert.equal(operatorTriesToSend(J.openJournal({ root, waveId: 'W-17c', now: clk.now }), exec, 'S01-1'), null, 'a 1 s do fecho ainda se envia');
  assert.equal(exec.calls, 1);

  // Um 2.º slot, já depois do closeout — mesmo que o 1.º tivesse terminado.
  J.appendEvent(ctx, { slot_id: 'S01-1', kind: 'submitted', payload: {} });
  J.appendEvent(ctx, { slot_id: 'S01-1', kind: 'captured', payload: { capture_completeness: 'full' } });
  J.appendEvent(ctx, { slot_id: 'S02-1', kind: 'prepared' });
  J.appendEvent(ctx, { slot_id: 'S02-1', kind: 'preflight_ok', payload: {} });
  clk.t = T0 + 40 * MIN;
  const err = operatorTriesToSend(J.openJournal({ root, waveId: 'W-17c', now: clk.now }), exec, 'S02-1');
  assert.equal(err && err.code, 'closeout_reached');
  assert.equal(err.details.deadline_at, ISO(T0 + 45 * MIN));
  assert.equal(exec.calls, 1, 'nenhum envio depois do closeout');
  assert.equal(J.slotState(ctx, 'S02-1').state, 'preflight_ok', 'o slot fica por começar — o closeout derivará not_started');
});

test('17d · o wave_id e os slot_id vêm do manifesto, não do relógio: dois reinícios em instantes diferentes lêem os mesmos ids', () => {
  const root = tmpRoot();
  const clk = clock(T0);
  openedWave({ root, waveId: 'W-17d', clk, slots: ['S01-1', 'S01-2'] });
  const ids = (ms) => {
    clk.t = ms;
    const c = J.openJournal({ root, waveId: 'W-17d', now: clk.now });
    const ev = J.readEvents(c);
    return { waves: new Set(ev.map((e) => e.wave_id)), slots: [...J.slotStates(c, ev).keys()] };
  };
  const a = ids(T0 + 5 * MIN);
  const b = ids(T0 + 5 * 60 * MIN);
  assert.deepEqual([...a.waves], ['W-17d']);
  assert.deepEqual([...b.waves], ['W-17d']);
  assert.deepEqual(a.slots, ['S01-1', 'S01-2']);
  assert.deepEqual(b.slots, a.slots);
  assert.equal(J.readEvents(J.openJournal({ root, waveId: 'W-17d', now: clk.now })).some((e) => /\d{13}/.test(e.wave_id + String(e.slot_id))), false, 'nenhum id carrega um timestamp em ms');
});

test('17e · MORDIDA · a janela é do manifesto e a reserva conta: 45/5 por omissão, e uma janela ≤ reserva é recusada antes de escrever', () => {
  const root = tmpRoot();
  const clk = clock(T0);
  const ctx = J.openJournal({ root, waveId: 'W-17e', now: clk.now });
  J.appendEvent(ctx, { kind: 'wave.frozen', payload: { manifest_hash: MANIFEST_HASH } });
  assert.throws(() => J.openWave(ctx, { manifest_hash: MANIFEST_HASH, wallclock_minutes: 5, reserve_minutes: 5 }), (e) => e.code === 'bad_window');
  assert.throws(() => J.openWave(ctx, { manifest_hash: 'f'.repeat(64) }), (e) => e.code === 'manifest_mismatch', 'abrir com outro manifesto é recusado');
  assert.equal(linhas(ctx).length, 1, 'as recusas não escrevem');
  const e = J.openWave(ctx, { manifest_hash: MANIFEST_HASH, wallclock_minutes: 20, reserve_minutes: 5 });
  assert.equal(e.payload.deadline_at, ISO(T0 + 20 * MIN));
  assert.equal(e.payload.closeout_at, ISO(T0 + 15 * MIN));
  assert.equal(e.payload.clock_source, 'injected');
});
