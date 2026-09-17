// 07-reset-beyond-window.test.mjs — critério 07: um reset do fornecedor que
// ultrapassa a janela de 45 min ⇒ a onda fecha INCOMPLETA; os slots que não
// começaram saem not_started; deadline_at não se move; nenhuma reposição de slots.
//
// contrato 0.3 queue_policy.pause_exceeds_budget: «Close incomplete; mark
// remaining slots not_started. Do not silently extend wave or replace failed
// slots.» O reset entra pelo literal (provider-health.lerReposicao) — ninguém o
// escreve à mão.
//
// Mordida (verificada à mão no fecho do passo 4; relatório no handoff): deixar
// o closeout empurrar deadline/closeout para depois do reset, ou contar
// not_started como unknown, põe 07a/07b vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as J from '../journal.mjs';
import { preflight } from '../preflight.mjs';
import { importFailure } from '../import.mjs';
import { closeoutWave, deriveOutcomes, CloseoutError } from '../closeout.mjs';
import { frozenOpenWave, primaryManifest, observedFor, bytesOf, capabilityEligible, fakeExecutor, driveSlot, HUMAN_OK, T0, MIN } from './_harness.mjs';

const ISO = (ms) => new Date(ms).toISOString();

test('07a · T0+20 min: rate limit com retry-after: 3600 → next_action_at > closeout_at; o preflight seguinte recusa (budget_exceeded); o closeout fecha com reason budget_exceeded e 6× not_started; deadline_at intacto', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-07a', manifest: primaryManifest('W-07a') });
  const exec = fakeExecutor();
  driveSlot(ctx, manifest, 'Q01-1', { to: 'captured', exec });
  clk.t = T0 + 20 * MIN;
  driveSlot(ctx, manifest, 'Q02-1', { to: 'submitted', exec });
  const f = importFailure(ctx, { slot_id: 'Q02-1', literal: 'Too many requests. retry-after: 3600' });
  assert.equal(f.class, 'rate_limited');
  assert.equal(f.reset_at, ISO(T0 + 20 * MIN + 3600_000));
  assert.equal(f.pause.kind, 'wave.throttled');
  const w = J.waveState(ctx);
  assert.equal(w.next_action_at, ISO(T0 + 80 * MIN));
  assert.equal(w.closeout_at, ISO(T0 + 40 * MIN));
  assert.equal(w.deadline_at, ISO(T0 + 45 * MIN), 'a pausa NÃO estende o deadline');

  clk.t = T0 + 21 * MIN;
  const pf = preflight(ctx, { slot_id: 'Q03-1', bytes: bytesOf(manifest, 'Q03'), observed: observedFor(manifest), capability: capabilityEligible() });
  assert.equal(pf.ok, false);
  const razao = pf.reasons.find((x) => x.code === 'budget_exceeded');
  assert.ok(razao, JSON.stringify(pf.reasons));
  assert.equal(razao.next_action_at, ISO(T0 + 80 * MIN));
  assert.equal(exec.calls, 2, 'nada mais foi enviado');

  const r = closeoutWave(ctx, { human: HUMAN_OK });
  assert.equal(r.conclusion.wave.closing_reason, 'budget_exceeded');
  assert.equal(r.conclusion.planned, 8);
  assert.equal(r.conclusion.complete, 1);
  assert.equal(r.conclusion.failed, 1);
  assert.equal(r.conclusion.not_started, 6);
  assert.equal(r.conclusion.unknown, 0);
  assert.equal(r.conclusion.identity.planned_equals_sum, true);
  assert.equal(r.conclusion.wave.deadline_at, ISO(T0 + 45 * MIN));
  assert.equal(r.conclusion.wave.closeout_at, ISO(T0 + 40 * MIN));
  assert.deepEqual(J.readEvents(ctx).slice(-2).map((e) => e.kind), ['wave.closing', 'wave.closed']);
  assert.equal(J.readEvents(ctx).at(-2).payload.reason, 'budget_exceeded');
  assert.ok(r.conclusion.observability_limits.some((l) => /eligible_evaluable 1 < planned_eligible 6/.test(l)));
});

test('07b · sem pausa nenhuma, passado closeout_at: closing_reason = closeout_at_reached; antes disso, fechar exige razão escrita do operador (wave_still_open)', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-07b' });
  driveSlot(ctx, manifest, 'S01-1', { to: 'captured' });
  clk.t = T0 + 30 * MIN;
  assert.throws(() => closeoutWave(ctx, { human: HUMAN_OK }), (e) => e instanceof CloseoutError && e.code === 'wave_still_open');
  assert.throws(() => closeoutWave(ctx, { human: HUMAN_OK, reason: 'porque' }), (e) => e.code === 'wave_still_open', 'razão curta não chega');
  assert.equal(J.waveState(ctx).state, 'open', 'as recusas não fecham nada');
  clk.t = T0 + 40 * MIN;
  const r = closeoutWave(ctx, { human: HUMAN_OK });
  assert.equal(r.conclusion.wave.closing_reason, 'closeout_at_reached');
  assert.equal(r.conclusion.not_started, 3);
  assert.equal(r.conclusion.complete, 1);
});

test('07c · fecho antecipado pelo operador com razão: registada como operator:…; slots em voo saem unknown, não são «repostos»', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-07c' });
  driveSlot(ctx, manifest, 'S01-1', { to: 'captured' });
  clk.advance(2 * MIN);
  driveSlot(ctx, manifest, 'S02-1', { to: 'submitted' });
  clk.advance(1 * MIN);
  const r = closeoutWave(ctx, { human: HUMAN_OK, reason: 'a superfície mudou de interface a meio; W0 tem de recomeçar' });
  assert.match(r.conclusion.wave.closing_reason, /^operator: a superfície mudou/);
  assert.equal(r.conclusion.unknown, 1, 'S02-1 submitted sem captura = unknown');
  assert.equal(r.conclusion.not_started, 2);
  assert.equal(r.conclusion.attempted, 2);
  assert.equal(r.conclusion.planned, 4, 'o tecto não cresce para compensar');
});

test('07d · MORDIDA · outcomeOf deriva do histórico: intent sem submitted é unknown; known_not_submitted é not_started; nenhum slot cai fora da soma', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-07d' });
  driveSlot(ctx, manifest, 'S01-1', { to: 'intent' });
  J.knownNotSubmitted(ctx, { slot_id: 'S01-1', proof: 'o campo de texto não aceitou o paste; conversa vazia' });
  clk.advance(2 * MIN);
  driveSlot(ctx, manifest, 'S02-1', { to: 'intent' });
  const d = deriveOutcomes(J.readEvents(ctx));
  assert.equal(d.per_slot['S01-1'].outcome, 'not_started');
  assert.equal(d.per_slot['S01-1'].attempted, true, 'houve intenção — fica registado — mas nada saiu');
  assert.equal(d.per_slot['S02-1'].outcome, 'unknown');
  assert.equal(d.per_slot['S02-2'].outcome, 'not_started');
  assert.equal(d.counts.identity_ok, true);
  assert.equal(d.counts.planned, d.counts.complete + d.counts.partial + d.counts.failed + d.counts.unknown + d.counts.not_started);
});
