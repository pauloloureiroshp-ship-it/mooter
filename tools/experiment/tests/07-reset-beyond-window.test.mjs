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
import { closeoutWave, deriveOutcomes, reduceSlotHistory, CloseoutError } from '../closeout.mjs';
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

test('07d · MORDIDA · a redução deriva do histórico: intent sem submitted é unknown; known_not_submitted é not_started E attempted=false (AMENDMENT-001 A1 §4); nenhum slot cai fora da soma', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-07d' });
  driveSlot(ctx, manifest, 'S01-1', { to: 'intent' });
  J.knownNotSubmitted(ctx, { slot_id: 'S01-1', proof: 'o campo de texto não aceitou o paste; conversa vazia' });
  clk.advance(2 * MIN);
  driveSlot(ctx, manifest, 'S02-1', { to: 'intent' });
  const d = deriveOutcomes(J.readEvents(ctx));
  assert.equal(d.per_slot['S01-1'].outcome, 'not_started');
  assert.equal(d.per_slot['S01-1'].attempted, false, 'A1 §4: a ocorrência fica no diário e conta à parte como attempted=false');
  assert.equal(d.per_slot['S01-1'].intent_recorded, true, 'houve intenção — fica registado');
  assert.equal(d.per_slot['S01-1'].not_submitted_proven, true);
  assert.equal(d.per_slot['S01-1'].rule, 'R4_known_not_submitted');
  assert.equal(d.per_slot['S02-1'].outcome, 'unknown');
  assert.equal(d.per_slot['S02-1'].rule, 'R3_intent_committed_without_sufficient_capture');
  assert.equal(d.per_slot['S02-1'].attempted, true);
  assert.equal(d.per_slot['S02-2'].outcome, 'not_started');
  assert.equal(d.per_slot['S02-2'].rule, 'R4_no_event', 'nunca teve evento: not_started pela regra 4, não por omissão');
  assert.equal(d.counts.attempted, 1);
  assert.equal(d.counts.intent_recorded, 2);
  assert.equal(d.counts.not_submitted_proven, 1);
  assert.equal(d.counts.identity_ok, true);
  assert.equal(d.counts.planned, d.counts.complete + d.counts.partial + d.counts.failed + d.counts.unknown + d.counts.not_started);
});

// ── AMENDMENT-001 · A1 (2026-09-17) · fixtures de fronteira ──────────────────
// Origem: AMENDMENT-001-20260916.txt §A1 — «"último evento" não é exclusivo nem
// exaustivo». Os cinco casos pedidos, (a)…(e), mais os que a precedência exige.
// Mordida (verificada à mão, relatório no annex/AMENDMENT-001-applied.json):
// trocar a precedência R1↔R4 põe o caso «failed» vermelho; ignorar a regra 6
// (scored altera a classe) põe (e) vermelho.

test('07e · A1 · redução determinística: (a) preflight_failed sem intent = not_started, não failed; (b) submitted sem captured ao fechar = unknown; (c) known_not_submitted sem retry = not_started; (d) captured{completeness:unknown} = unknown; (e) scored/closed depois de captured não alteram a classe; failed prevalece', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-07e', manifest: primaryManifest('W-07e') });
  const exec = fakeExecutor();
  const step = (slot, opts) => { clk.advance(2 * MIN); return driveSlot(ctx, manifest, slot, { exec, ...opts }); };
  // (a) Q01-1: preflight com bytes de OUTRO prompt ⇒ preflight_failed; nunca há intenção.
  clk.advance(2 * MIN);
  const pfa = preflight(ctx, { slot_id: 'Q01-1', bytes: bytesOf(manifest, 'Q02'), observed: observedFor(manifest), capability: capabilityEligible() });
  assert.equal(pfa.ok, false);
  // (c) Q01-2: intent → known_not_submitted, sem nova tentativa.
  step('Q01-2', { to: 'intent' });
  J.knownNotSubmitted(ctx, { slot_id: 'Q01-2', proof: 'a página recarregou antes do envio; conversa vazia' });
  // (d) Q02-1: captured com completeness unknown.
  step('Q02-1', { to: 'captured', completeness: 'unknown' });
  // (e) Q02-2: captured full, depois scored e closed.
  step('Q02-2', { to: 'captured' });
  J.appendEvent(ctx, { slot_id: 'Q02-2', kind: 'scored', payload: { n_records: 3 } });
  J.appendEvent(ctx, { slot_id: 'Q02-2', kind: 'closed' });
  // failed prevalece: Q03-1 submitted → failed.
  step('Q03-1', { to: 'failed', literal: '401 Unauthorized' });
  // captured seguido de policy_review por resolver: Q03-2 ⇒ unknown (captura não suficiente ao fechar).
  step('Q03-2', { to: 'captured' });
  J.appendEvent(ctx, { slot_id: 'Q03-2', kind: 'policy_review', payload: { reason: 'operator_flag', note: 'resposta parece de outra sessão' } });
  // N04-1: captured full, condição igual ⇒ complete.
  step('N04-1', { to: 'captured' });
  // (b) N04-2: submitted, e a onda fecha assim — tem de ser o último (concorrência 1).
  step('N04-2', { to: 'submitted' });

  const d = deriveOutcomes(J.readEvents(ctx));
  const p = d.per_slot;
  assert.equal(p['Q01-1'].outcome, 'not_started'); assert.equal(p['Q01-1'].rule, 'R4_preflight_failed'); assert.equal(p['Q01-1'].attempted, false); assert.equal(p['Q01-1'].intent_recorded, false);
  assert.equal(p['Q01-2'].outcome, 'not_started'); assert.equal(p['Q01-2'].rule, 'R4_known_not_submitted'); assert.equal(p['Q01-2'].attempted, false); assert.equal(p['Q01-2'].not_submitted_proven, true);
  assert.equal(p['Q02-1'].outcome, 'unknown'); assert.equal(p['Q02-1'].rule, 'R2_captured_completeness_unknown'); assert.equal(p['Q02-1'].attempted, true);
  assert.equal(p['Q02-2'].outcome, 'complete'); assert.equal(p['Q02-2'].rule, 'R2_captured_full_condition_ok'); assert.equal(p['Q02-2'].state, 'closed', 'o estado operacional avançou, a classe não mudou');
  assert.equal(p['Q03-1'].outcome, 'failed'); assert.equal(p['Q03-1'].rule, 'R1_failed_terminal'); assert.equal(p['Q03-1'].attempted, true);
  assert.equal(p['Q03-2'].outcome, 'unknown'); assert.equal(p['Q03-2'].rule, 'R3_policy_review_without_sufficient_capture'); assert.equal(p['Q03-2'].answer_sha256 !== null, true, 'a captura existe e fica ligada ao slot; só a classe é unknown');
  assert.equal(p['N04-1'].outcome, 'complete');
  assert.equal(p['N04-2'].outcome, 'unknown'); assert.equal(p['N04-2'].rule, 'R3_submitted_without_sufficient_capture'); assert.equal(p['N04-2'].attempted, true);
  assert.deepEqual([d.counts.planned, d.counts.complete, d.counts.partial, d.counts.failed, d.counts.unknown, d.counts.not_started], [8, 2, 0, 1, 3, 2]);
  assert.equal(d.counts.identity_ok, true);
  assert.equal(d.counts.attempted, 6, 'attempted é dimensão separada: os 6 com intenção não desmentida (fora: Q01-1 sem intenção, Q01-2 desmentida) — não é parcela da soma');
  assert.equal(d.counts.intent_recorded, 7);
  assert.equal(d.counts.not_submitted_proven, 1);
  // A onda fecha com esta forma e o conclusion.json leva a regra por slot.
  clk.t = Date.parse(J.waveState(ctx).closeout_at) + 1;
  const r = closeoutWave(ctx, { human: HUMAN_OK });
  assert.equal(r.conclusion.per_slot['Q01-1'].rule, 'R4_preflight_failed');
  assert.equal(r.conclusion.identity.planned_equals_sum, true);
});

test('07f · A1 · reduceSlotHistory é pura e exaustiva: precedência R1 > R2 > R3 > R4 sobre históricos sintéticos; recuperação supersede (R2 lê o ÚLTIMO captured); lista vazia = not_started; só scored/closed = unknown/inconsistent', () => {
  const ev = (kind, payload = {}) => ({ kind, payload });
  const full = { capture_completeness: 'full', condition_divergent: false, answer_sha256: 'a'.repeat(64) };
  const partial = { capture_completeness: 'partial', condition_divergent: false, answer_sha256: 'b'.repeat(64) };
  const R = (list) => { const r = reduceSlotHistory(list); return [r.outcome, r.rule, r.attempted]; };
  assert.deepEqual(R([]), ['not_started', 'R4_no_event', false]);
  assert.deepEqual(R([ev('prepared'), ev('preflight_failed')]), ['not_started', 'R4_preflight_failed', false]);
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('queued')]), ['not_started', 'R4_queued', false]);
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed')]), ['unknown', 'R3_intent_committed_without_sufficient_capture', true]);
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('submission_uncertain')]), ['unknown', 'R3_submission_uncertain_without_sufficient_capture', true]);
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('submitted'), ev('capture_uncertain')]), ['unknown', 'R3_capture_uncertain_without_sufficient_capture', true]);
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('known_not_submitted')]), ['not_started', 'R4_known_not_submitted', false]);
  // known_not_submitted seguido de nova tentativa que chega a captured: a classe é da tentativa nova.
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('known_not_submitted'), ev('queued'), ev('intent_committed'), ev('submitted'), ev('captured', full)]), ['complete', 'R2_captured_full_condition_ok', true]);
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('submitted'), ev('captured', { ...full, condition_divergent: true })]), ['partial', 'R2_captured_condition_divergent', true]);
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('submitted'), ev('captured', { capture_completeness: 'unknown' })]), ['unknown', 'R2_captured_completeness_unknown', true]);
  // §5 recuperação: capture_uncertain → captured(recover) — o último captured decide; o anterior fica em supersedes, não apagado.
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('submitted'), ev('capture_uncertain', partial), ev('captured', { ...full, recovered: true, supersedes: 'b'.repeat(64) })]), ['complete', 'R2_captured_full_condition_ok', true]);
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('submitted'), ev('captured', partial), ev('policy_review'), ev('captured', full)]), ['complete', 'R2_captured_full_condition_ok', true]);
  // §1 failed prevalece — mesmo que o histórico tenha known_not_submitted antes.
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('known_not_submitted'), ev('queued'), ev('intent_committed'), ev('submitted'), ev('failed', { class: 'auth_failed' })]), ['failed', 'R1_failed_terminal', true]);
  // Conflito sintético R1 vs R4: o diário de hoje não deixa nada seguir-se a `failed`, mas a
  // precedência é uma propriedade da REDUÇÃO, não da máquina de estados — se um dia a máquina
  // mudar, a regra 1 continua a mandar. É este o caso que morde a troca 1↔4 (A1 · mordida).
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('submitted'), ev('failed', { class: 'auth_failed' }), ev('known_not_submitted')]), ['failed', 'R1_failed_terminal', true]);
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('submitted'), ev('failed', { class: 'auth_failed' }), ev('prepared'), ev('preflight_failed')]), ['failed', 'R1_failed_terminal', true]);
  // §6 scoring/fecho não alteram a classe.
  assert.deepEqual(R([ev('prepared'), ev('preflight_ok'), ev('intent_committed'), ev('submitted'), ev('captured', partial), ev('scored'), ev('closed')]), ['partial', 'R2_captured_partial', true]);
  assert.deepEqual(R([ev('scored'), ev('closed')]), ['unknown', 'R0_inconsistent_history', false]);
  // Exaustividade: cada kind de slot, sozinho no fim de um histórico, tem classe.
  for (const k of J.SLOT_KINDS) { const r = reduceSlotHistory([ev('prepared'), ev(k, k === 'captured' ? full : {})]); assert.ok(['complete', 'partial', 'failed', 'unknown', 'not_started'].includes(r.outcome), `${k} → ${r.outcome}`); }
});
