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
//
// AMENDMENT-001 · A3 (2026-09-17, AMENDMENT-001-20260916.txt): «8 planeados = 6
// elegíveis planeados (planned_eligible) + 2 negativos (negative_planned). Os 6
// NÃO são automaticamente avaliáveis.» Campos distintos, avaliabilidade por
// outcome operacional E por campo científico (11e). Mordida: somar negativos ao
// denominador elegível ⇒ 11a/11e vermelhos (morde-amend001-a3.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';

import * as J from '../journal.mjs';
import { preflight } from '../preflight.mjs';
import { closeoutWave, buildConclusion, checkConclusion, CloseoutError } from '../closeout.mjs';
import { validateManifestInput } from '../freeze.mjs';
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

test('11a · planned 8 = 5 complete + 1 partial + 1 failed + 0 unknown + 1 not_started; coverage 8 POSIÇÕES; planned_eligible 6, negative_planned 2; eligible_evaluable 4 (complete+partial); negativos com outcomes próprios (A3)', () => {
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
  assert.equal(d.basis, 'positions', '«8/8 planned» é cobertura de posições, nunca de respostas');
  assert.equal(d.coverage_per_wave, 8);
  assert.equal(d.planned_eligible, 6);
  assert.equal(d.negative_planned, 2);
  assert.equal('negative' in d, false, 'o nome ambíguo saiu: é negative_planned');
  assert.equal(d.positions_identity_ok, true);
  assert.equal(d.contract_match, true, '6/2/8 = contrato 0.3 learning.denominators');
  assert.deepEqual(d.contract_declared, { planned_eligible_per_wave: 6, negative_per_wave: 2, coverage_per_wave: 8 });
  assert.deepEqual(d.caps_declared, { coverage_per_wave: 8, planned_eligible: 6, negative_planned: 2 });
  assert.deepEqual(d.evaluability_by_outcome, { complete: true, partial: true, failed: false, unknown: false, not_started: false });
  assert.deepEqual(d.eligible_by_outcome, { complete: 3, partial: 1, failed: 1, unknown: 0, not_started: 1 });
  assert.deepEqual(d.negative_by_outcome, { complete: 2, partial: 0, failed: 0, unknown: 0, not_started: 0 });
  assert.equal(d.eligible_evaluable, 4, 'Q01-1, Q02-1, Q02-2 (complete) + Q03-2 (partial) — o parcial FICA no denominador avaliável');
  assert.equal(d.eligible_complete, 3);
  assert.equal(d.negative_evaluable, 2);
  // Por campo: sem evidence declarada, new_fact_used e recommended_appropriately têm denominador 0 — dito, não escondido.
  assert.equal(d.by_field.target_mentioned.eligible_evaluable, 4);
  assert.equal(d.by_field.crawl_access.eligible_evaluable, 6, 'observação do servidor: não precisa de resposta');
  assert.equal(d.by_field.new_fact_used.eligible_evaluable, 0);
  assert.equal(d.by_field.recommended_appropriately.eligible_evaluable, 0);
  assert.deepEqual(d.by_field.new_fact_used.eligible_not_evaluable_why, { 'outcome:failed': 1, 'outcome:not_started': 1, 'evidence:not_declared': 6 });
  assert.ok(c.observability_limits.some((l) => /^new_fact_used: avaliável em 0\/4 .*evidence:not_declared×6/.test(l)), JSON.stringify(c.observability_limits));
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

/** 11e: partição, falhas e EVIDÊNCIA declarada por prompt — resultado exacto e determinístico (A3). */
function evidencedWave(waveId) {
  const m = primaryManifest(waveId);
  m.prompts = m.prompts.map((p) => {
    if (p.id === 'Q01') return { ...p, evidence: { fact_ref: 'diff:page-q01@2026-09-16', asks_recommendation: true } };
    if (p.id === 'Q02') return { ...p, evidence: { fact_ref: null, asks_recommendation: true } };
    if (p.id === 'N04') return { ...p, evidence: { fact_ref: 'diff:page-n04@2026-09-16', asks_recommendation: false } };
    return p; // Q03: não declarado
  });
  const w = frozenOpenWave({ waveId, manifest: m });
  const exec = fakeExecutor();
  const step = (slot, opts) => { w.clk.advance(2 * MIN); return driveSlot(w.ctx, w.manifest, slot, { exec, ...opts }); };
  step('Q01-1', { to: 'captured', observed: { search_used: false } });
  step('Q02-1', { to: 'captured', observed: { search_used: true } });
  step('Q03-1', { to: 'failed', literal: '401 Unauthorized' });
  step('N04-1', { to: 'captured' });
  step('N04-2', { to: 'captured' });
  step('Q03-2', { to: 'captured', completeness: 'partial' });
  step('Q02-2', { to: 'captured', observed: { search_used: null } });
  return { ...w, exec };
}

test('11e · A3 · avaliabilidade POR CAMPO com evidência explícita: new_fact_used só onde há fact_ref; recommended_appropriately só onde o prompt pede recomendação (e há rubrica); target_mentioned em todos com resposta; crawl_access sem precisar de resposta; negativos nunca somam ao elegível', () => {
  const { ctx, clk } = evidencedWave('W-11e');
  clk.t = Date.parse(J.waveState(ctx).closeout_at) + 1;
  const c = buildConclusion(ctx, { human: HUMAN_OK });
  const d = c.eligible_evaluable_denominator;
  assert.equal(d.planned_eligible, 6); assert.equal(d.negative_planned, 2); assert.equal(d.eligible_evaluable, 4); assert.equal(d.negative_evaluable, 2);
  const bf = d.by_field;
  assert.deepEqual([bf.target_mentioned.eligible_evaluable, bf.target_mentioned.negative_evaluable], [4, 2]);
  assert.deepEqual([bf.crawl_access.eligible_evaluable, bf.crawl_access.negative_evaluable], [6, 2]);
  assert.deepEqual([bf.new_fact_used.eligible_evaluable, bf.new_fact_used.negative_evaluable], [1, 2], 'só Q01-1 tem resposta E fact_ref; N04-1/N04-2 têm fact_ref (descritivo, controlo)');
  assert.deepEqual(bf.new_fact_used.eligible_not_evaluable_why, { 'outcome:failed': 1, 'outcome:not_started': 1, 'fact_ref:null': 2, 'evidence:not_declared': 2 });
  assert.deepEqual([bf.recommended_appropriately.eligible_evaluable, bf.recommended_appropriately.negative_evaluable], [3, 0], 'Q01-1, Q02-1, Q02-2 pedem recomendação; Q03-2 não declarado; N04 declara false');
  assert.deepEqual(bf.recommended_appropriately.needs, ['rubric_ref', 'asks_recommendation']);
  const ps = c.per_slot;
  assert.deepEqual([ps['Q02-1'].evaluable_for.new_fact_used, ps['Q02-1'].evaluable_for.recommended_appropriately, ps['Q02-1'].evaluable_for.target_mentioned], [false, true, true]);
  assert.deepEqual([ps['Q03-2'].evaluable_for.new_fact_used, ps['Q03-2'].evaluable_for.recommended_appropriately, ps['Q03-2'].evaluable_for.target_mentioned], [false, false, true], 'parcial: tem resposta, não tem evidência declarada');
  assert.equal(ps['Q03-1'].evaluable_for.crawl_access, true, 'failed: sem resposta, mas o servidor observa-se na mesma');
  assert.equal(ps['Q01-2'].evaluable_for.target_mentioned, false);
  // Critério 19 (A3 §19): search_used=false/null NÃO exclui — Q01-1 (false) e Q02-2 (null) ficam avaliáveis; a
  // elegibilidade para recommended_appropriately vem da declaração, não de search_used.
  assert.equal(ps['Q01-1'].search_used, false); assert.equal(ps['Q01-1'].evaluable_for.recommended_appropriately, true);
  assert.equal(ps['Q02-2'].search_used, null); assert.equal(ps['Q02-2'].evaluable_for.recommended_appropriately, true);
  assert.equal(ps['Q02-1'].search_used, true); assert.equal(ps['Q02-1'].evaluable_for.new_fact_used, false, 'search_used=true não torna nada avaliável');
  assert.equal(d.coverage_per_wave, 8);
  assert.ok(c.observability_limits.some((l) => /^new_fact_used: avaliável em 1\/4/.test(l)), JSON.stringify(c.observability_limits));
  assert.ok(c.observability_limits.some((l) => /^recommended_appropriately: avaliável em 3\/4/.test(l)));
  // per_intent_outcomes leva o denominador por campo (n_evaluable) — sem registos, tudo null, mas o denominador está lá.
  assert.equal(c.per_intent_outcomes.Q01.new_fact_used.n_evaluable, 1);
  assert.equal(c.per_intent_outcomes.Q02.new_fact_used.n_evaluable, 0);
  assert.equal(c.per_intent_outcomes.Q02.recommended_appropriately.n_evaluable, 2);
  assert.equal(c.per_intent_outcomes.N04.recommended_appropriately.n_evaluable, 0);
});

test('11f · A3 · evidence mal formada no manifesto é recusada no freeze (não entra em silêncio como «não avaliável»); o que se declara vai para o diário', () => {
  for (const bad of [{ fact_ref: 7, asks_recommendation: true }, { fact_ref: null }, { asks_recommendation: 'sim', fact_ref: null }, 'x', []]) {
    const m = primaryManifest('W-11f');
    m.prompts[0] = { ...m.prompts[0], evidence: bad };
    const f = validateManifestInput(m, { waveId: 'W-11f' });
    assert.ok(f.some((x) => x.code === 'bad_prompt' && /evidence/.test(x.detail)), JSON.stringify({ bad, f }));
  }
  const ok = primaryManifest('W-11f-ok');
  ok.prompts[0] = { ...ok.prompts[0], evidence: { fact_ref: 'diff:x', asks_recommendation: false } };
  assert.deepEqual(validateManifestInput(ok, { waveId: 'W-11f-ok' }), []);
  const { ctx } = frozenOpenWave({ waveId: 'W-11f-ok', manifest: ok });
  const frozen = J.readEvents(ctx).find((e) => e.kind === 'wave.frozen').payload;
  assert.deepEqual(frozen.evidence.Q01, { declared: true, fact_ref: 'diff:x', asks_recommendation: false });
  assert.deepEqual(frozen.evidence.Q02, { declared: false, fact_ref: null, asks_recommendation: false });
  assert.equal(frozen.rubric_ref, 'rubric-syn-v0');
});
test('11g · A3 · a regra do piloto também morde pelo controlo negativo: 6/6 elegíveis avaliáveis mas 1/2 negativos ⇒ qualified_for_next_design recusado (inconclusive_forced); com 2/2 passa', () => {
  const w = frozenOpenWave({ waveId: 'W-11g', manifest: primaryManifest('W-11g') });
  const exec = fakeExecutor();
  const step = (slot) => { w.clk.advance(2 * MIN); return driveSlot(w.ctx, w.manifest, slot, { exec, to: 'captured' }); };
  for (const s of ['Q01-1', 'Q02-1', 'Q03-1', 'N04-1', 'Q03-2', 'Q02-2', 'Q01-2']) step(s);
  // N04-2 nunca começa.
  w.clk.t = Date.parse(J.waveState(w.ctx).closeout_at) + 1;
  const c = buildConclusion(w.ctx, { human: { ...HUMAN_OK, decision: 'qualified_for_next_design' } });
  const d = c.eligible_evaluable_denominator;
  assert.deepEqual([d.eligible_evaluable, d.planned_eligible, d.negative_evaluable, d.negative_planned], [6, 6, 1, 2]);
  const chk = checkConclusion(c);
  assert.equal(chk.ok, false);
  assert.ok(chk.problems.some((p) => /inconclusive_forced/.test(p) && /negative_evaluable 1\/2/.test(p)), JSON.stringify(chk.problems));
  assert.ok(c.observability_limits.some((l) => /^negative_evaluable 1 < negative_planned 2/.test(l)));
  // O mesmo desenho com os 2 negativos: qualified passa no gate (a decisão continua a ser humana).
  const w2 = frozenOpenWave({ waveId: 'W-11g-2', manifest: primaryManifest('W-11g-2') });
  const exec2 = fakeExecutor();
  for (const s of ['Q01-1', 'Q02-1', 'Q03-1', 'N04-1', 'N04-2', 'Q03-2', 'Q02-2', 'Q01-2']) { w2.clk.advance(2 * MIN); driveSlot(w2.ctx, w2.manifest, s, { exec: exec2, to: 'captured' }); }
  w2.clk.t = Date.parse(J.waveState(w2.ctx).closeout_at) + 1;
  assert.equal(checkConclusion(buildConclusion(w2.ctx, { human: { ...HUMAN_OK, decision: 'qualified_for_next_design' } })).ok, true);
});
