// 11-denominators.test.mjs — critério 11: slot negativo, parcial ou falhado
// permanece no denominador; proibida a substituição oportunista; denominadores
// de adequação separados (contrato 0.3 learning.denominators: 6 / 2 / 8).
//
// Regra do piloto (G6, gap-audit): «Incomplete decisive coverage forces
// inconclusive under pilot rule» — qualified_for_next_design com cobertura
// elegível incompleta é recusado pelo checkConclusion.
//
// Mordida (verificada à mão no fecho do passo 4; relatório no handoff): contar
// só os complete no denominador, ou aceitar qualified com eligible_evaluable <
// planned_eligible, põe 11a/11b vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as J from '../journal.mjs';
import { preflight } from '../preflight.mjs';
import { closeoutWave, buildConclusion, checkConclusion, CloseoutError } from '../closeout.mjs';
import { frozenOpenWave, primaryManifest, observedFor, bytesOf, capabilityEligible, fakeExecutor, driveSlot, HUMAN_OK, MIN } from './_harness.mjs';

/** 8 slots com um mix realista: 5 complete (2 negativos), 1 partial, 1 failed, 1 not_started. */
function mixedWave(waveId) {
  const w = frozenOpenWave({ waveId, manifest: primaryManifest(waveId) });
  const exec = fakeExecutor();
  const step = (slot, opts) => { w.clk.advance(2 * MIN); return driveSlot(w.ctx, w.manifest, slot, { exec, ...opts }); };
  step('Q01-1', { to: 'captured' });
  step('Q02-1', { to: 'captured' });
  step('Q03-1', { to: 'failed', literal: '401 Unauthorized' });
  step('N04-1', { to: 'captured' });
  step('N04-2', { to: 'captured' });
  step('Q03-2', { to: 'captured', completeness: 'partial' });
  step('Q02-2', { to: 'captured' });
  // Q01-2 nunca começa.
  return { ...w, exec };
}

test('11a · planned 8 = 5 complete + 1 partial + 1 failed + 0 unknown + 1 not_started; coverage 8; eligible 6, negative 2; eligible_evaluable 4 (complete+partial); negativos com outcomes próprios', () => {
  const { ctx, clk } = mixedWave('W-11a');
  clk.t = Date.parse(J.waveState(ctx).closeout_at) + 1;
  const c = buildConclusion(ctx, { human: HUMAN_OK });
  assert.equal(c.planned, 8);
  assert.equal(c.attempted, 7);
  assert.equal(c.complete, 5);
  assert.equal(c.partial, 1);
  assert.equal(c.failed, 1);
  assert.equal(c.unknown, 0);
  assert.equal(c.not_started, 1);
  assert.equal(c.identity.planned_equals_sum, true);
  const d = c.eligible_evaluable_denominator;
  assert.equal(d.coverage_per_wave, 8);
  assert.equal(d.planned_eligible, 6);
  assert.equal(d.negative, 2);
  assert.equal(d.eligible_evaluable, 4, 'Q01-1, Q02-1, Q02-2 (complete) + Q03-2 (partial) — o parcial FICA no denominador avaliável');
  assert.equal(d.eligible_complete, 3);
  assert.equal(d.negative_evaluable, 2);
  assert.deepEqual(c.negative_control_outcomes, { complete: 2, partial: 0, failed: 0, unknown: 0, not_started: 0 });
  assert.equal(c.per_slot['Q03-1'].outcome, 'failed');
  assert.equal(c.per_slot['Q03-1'].failure_class, 'auth_failed');
  assert.equal(c.per_slot['Q01-2'].outcome, 'not_started');
  assert.ok(c.observability_limits.some((l) => /eligible_evaluable 4 < planned_eligible 6/.test(l)), 'a cobertura incompleta é dita, não escondida');
});

test('11b · regra do piloto: com cobertura elegível incompleta, decision=qualified_for_next_design é recusada (inconclusive_forced); inconclusive e stop passam', () => {
  const { ctx, clk } = mixedWave('W-11b');
  clk.t = Date.parse(J.waveState(ctx).closeout_at) + 1;
  const qualified = buildConclusion(ctx, { human: { ...HUMAN_OK, decision: 'qualified_for_next_design' } });
  const chk = checkConclusion(qualified);
  assert.equal(chk.ok, false);
  assert.ok(chk.problems.some((p) => /inconclusive_forced/.test(p)), JSON.stringify(chk));
  assert.throws(() => closeoutWave(ctx, { human: { ...HUMAN_OK, decision: 'qualified_for_next_design' } }), (e) => e instanceof CloseoutError && e.code === 'conclusion_incomplete' && /inconclusive_forced/.test(e.message));
  assert.equal(J.waveState(ctx).state, 'open', 'a recusa não fecha nada');
  assert.equal(checkConclusion(buildConclusion(ctx, { human: { ...HUMAN_OK, decision: 'stop' } })).ok, true);
  const r = closeoutWave(ctx, { human: { ...HUMAN_OK, decision: 'inconclusive' } });
  assert.equal(r.conclusion.decision, 'inconclusive');
  assert.equal(J.waveState(ctx).state, 'closed');
});

test('11c · substituição oportunista: um 9.º slot fora do manifesto não passa no preflight (slot_unknown) nem no commit; planned continua 8', () => {
  const { ctx, manifest, clk, exec } = mixedWave('W-11c');
  clk.advance(2 * MIN);
  const pf = preflight(ctx, { slot_id: 'Q05-1', bytes: bytesOf(manifest, 'Q01'), observed: observedFor(manifest), capability: capabilityEligible() });
  assert.equal(pf.ok, false);
  assert.ok(pf.reasons.some((x) => x.code === 'slot_unknown'), JSON.stringify(pf.reasons));
  assert.throws(() => J.commitIntent(ctx, { slot_id: 'Q05-1', prompt_hash: manifest.prompts[0].prompt_hash, manifest_hash: manifest.manifest_hash }), (e) => e.code === 'slot_not_ready');
  // Nem «repetir» o slot falhado: Q03-1 está failed, é terminal.
  const again = preflight(ctx, { slot_id: 'Q03-1', bytes: bytesOf(manifest, 'Q03'), observed: observedFor(manifest), capability: capabilityEligible() });
  assert.ok(again.reasons.some((x) => x.code === 'slot_not_ready'));
  assert.equal(exec.calls, 7);
  clk.t = Date.parse(J.waveState(ctx).closeout_at) + 1;
  const c = buildConclusion(ctx, { human: HUMAN_OK });
  assert.equal(c.planned, 8);
  assert.equal(Object.keys(c.per_slot).length, 8);
  assert.equal('Q05-1' in c.per_slot, false);
});

test('11d · MORDIDA · invalidated: o reviewer pode invalidar um complete (com razão) — valid desce, complete não; slot errado ou sem razão é recusado', () => {
  const { ctx, clk } = mixedWave('W-11d');
  clk.t = Date.parse(J.waveState(ctx).closeout_at) + 1;
  const c = buildConclusion(ctx, { human: HUMAN_OK, invalidated: [{ slot_id: 'Q02-2', reason: 'a resposta cita a pergunta seguinte: contaminação de sessão observada' }] });
  assert.equal(c.complete, 5);
  assert.equal(c.valid, 4);
  assert.equal(c.invalidated.length, 1);
  assert.throws(() => buildConclusion(ctx, { human: HUMAN_OK, invalidated: [{ slot_id: 'Q03-1', reason: 'não é complete, é failed' }] }), (e) => e.code === 'bad_invalidation');
  assert.throws(() => buildConclusion(ctx, { human: HUMAN_OK, invalidated: [{ slot_id: 'Q02-2', reason: 'x' }] }), (e) => e.code === 'bad_invalidation');
  assert.throws(() => buildConclusion(ctx, { human: HUMAN_OK, invalidated: [{ slot_id: 'Q99-1', reason: 'não existe este slot' }] }), (e) => e.code === 'bad_invalidation');
});
