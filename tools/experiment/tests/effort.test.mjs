// effort.test.mjs — AMENDMENT-001b · B4 (2026-09-17): as três provas de comparação POR PAR
// do limiar de utilidade E-6 (annex/effort-measures-prereg.json, aprovado tal como está —
// RECONCILIACAO-CC-PLAN-v1-20260916), como fixtures do módulo de esforço, NÃO replays reais.
//   (i)   empate integral ⇒ regra satisfeita, apresentado como EMPATE;
//   (ii)  duas vitórias conjuntas em 2 de 3 replays ⇒ satisfeita;
//   (iii) uma condição falha num replay e as outras duas passam ⇒ esse replay NÃO conta;
//         nunca combinar condições de replays diferentes.
// Publicam-se os 3 pares e as diferenças absolutas; sem percentagens.
// Mordida: combinar condições entre replays, contar um replay com uma condição falhada, ou
// apresentar o empate como vitória ⇒ vermelho (morde-amend001b.mjs B4).

import test from 'node:test';
import assert from 'node:assert/strict';

import { utilityThreshold, evaluateReplay, CONDITIONS, EffortError, EFFORT_RULE_ID, EFFORT_RULE_APPROVAL } from '../effort.mjs';

const R = (id, A, B, order = 'A,B') => ({ id, order, A: { human_minutes: A[0], record_completeness: A[1], failures_and_rework: A[2] }, B: { human_minutes: B[0], record_completeness: B[1], failures_and_rework: B[2] } });

test('effort-i · empate integral nos 3 replays ⇒ rule_satisfied=true, verdict=tie, apresentado como EMPATE — nunca como poupança; pares e diferenças absolutas (0) publicados', () => {
  const r = utilityThreshold([R('r1', [40, 0.9, 2], [40, 0.9, 2]), R('r2', [38, 1.0, 1], [38, 1.0, 1], 'B,A'), R('r3', [41, 0.95, 3], [41, 0.95, 3])]);
  assert.equal(r.rule_satisfied, true);
  assert.equal(r.verdict, 'tie');
  assert.match(r.presentation, /^EMPATE/);
  assert.deepEqual([r.wins, r.ties, r.losses, r.satisfied_replays], [0, 3, 0, 3]);
  for (const rep of r.replays) { assert.equal(rep.outcome, 'tie'); for (const c of CONDITIONS) assert.equal(rep.pairs[c.measure].abs_diff, 0); }
  assert.equal(r.no_percentages, true);
  assert.equal(JSON.stringify(r).includes('%'), false, 'sem percentagens em lado nenhum');
  assert.equal(r.rule_id, EFFORT_RULE_ID);
  assert.match(r.approval, /E-6 · RECONCILIACAO-CC-PLAN-v1-20260916/);
  assert.equal(EFFORT_RULE_APPROVAL, r.approval);
});

test('effort-ii · duas vitórias conjuntas (as 3 condições no MESMO replay) em 2 de 3 replays ⇒ satisfeita; o 3.º replay perde e é publicado com a mesma visibilidade', () => {
  const r = utilityThreshold([
    R('r1', [45, 0.85, 4], [30, 0.95, 1]),          // vitória conjunta
    R('r2', [42, 0.90, 3], [50, 0.90, 3], 'B,A'),   // derrota: minutos B > A
    R('r3', [44, 0.80, 5], [31, 1.00, 0]),          // vitória conjunta
  ]);
  assert.equal(r.rule_satisfied, true);
  assert.equal(r.verdict, 'satisfied');
  assert.deepEqual([r.wins, r.ties, r.losses, r.satisfied_replays], [2, 0, 1, 2]);
  assert.deepEqual(r.replays.map((x) => x.outcome), ['win', 'loss', 'win']);
  assert.deepEqual(r.replays[1].failed_conditions, ['human_minutes']);
  assert.deepEqual(r.replays[0].pairs.human_minutes, { A: 45, B: 30, abs_diff: 15, unit: 'min', condition: 'B_le_A', holds: true, strict: true });
  assert.deepEqual(r.replays[2].pairs.failures_and_rework, { A: 5, B: 0, abs_diff: 5, unit: 'count', condition: 'B_le_A', holds: true, strict: true });
  assert.equal(r.replays.length, 3, 'os 3 pares publicados, incluindo a derrota');
});

test('effort-iii · uma condição falha num replay e as outras duas passam ⇒ esse replay NÃO conta; com só 1 replay a contar a regra falha — e combinar condições de replays diferentes não a salva', () => {
  const replays = [
    R('r1', [45, 0.85, 4], [30, 0.95, 5]),          // minutos e completude ganham, rework PERDE ⇒ não conta
    R('r2', [42, 0.90, 3], [43, 0.95, 1], 'B,A'),   // completude e rework ganham, minutos PERDE ⇒ não conta
    R('r3', [44, 0.80, 5], [31, 1.00, 0]),          // vitória conjunta
  ];
  const r = utilityThreshold(replays);
  assert.deepEqual(r.replays.map((x) => x.outcome), ['loss', 'loss', 'win']);
  assert.deepEqual(r.replays[0].failed_conditions, ['failures_and_rework']);
  assert.deepEqual(r.replays[1].failed_conditions, ['human_minutes']);
  assert.equal(r.replays[0].counts_for_claim, false);
  assert.equal(r.satisfied_replays, 1);
  assert.equal(r.rule_satisfied, false);
  assert.equal(r.verdict, 'not_satisfied');
  assert.match(r.presentation, /não ajudou/);
  // «Combinar» seria: minutos de r1 + completude de r2 + rework de r2 ⇒ 3 condições «satisfeitas». A regra não o permite:
  // cada condição só vale dentro do replay em que foi medida. Prova por contraste, com a própria função por replay.
  const porReplay = replays.map((x, i) => evaluateReplay(x, i));
  const combinadoErrado = CONDITIONS.every((c) => porReplay.some((p) => p.pairs[c.measure].holds));
  assert.equal(combinadoErrado, true, 'a combinação cruzada daria «satisfeita» — é exactamente o que se proíbe');
  assert.equal(porReplay.filter((p) => p.counts_for_claim).length, 1, '…e a regra por par só conta 1');
});

test('effort-iv · fronteiras: com 2 replays não há veredicto (insufficient_replays); medida em falta é erro, não 0; empate + vitória + derrota ⇒ satisfeita, verdict=satisfied (há uma vitória estrita)', () => {
  const dois = utilityThreshold([R('r1', [40, 0.9, 2], [30, 0.9, 2]), R('r2', [40, 0.9, 2], [30, 0.9, 2])]);
  assert.equal(dois.verdict, 'insufficient_replays');
  assert.equal(dois.rule_satisfied, false);
  assert.throws(() => utilityThreshold([R('r1', [40, 0.9, 2], [30, undefined, 2]), R('r2', [1, 1, 1], [1, 1, 1]), R('r3', [1, 1, 1], [1, 1, 1])]), (e) => e instanceof EffortError && e.code === 'bad_measure');
  assert.throws(() => utilityThreshold([{ id: 'x', A: { human_minutes: 1, record_completeness: 1, failures_and_rework: 1 } }]), (e) => e.code === 'bad_replay');
  const misto = utilityThreshold([R('r1', [40, 0.9, 2], [40, 0.9, 2]), R('r2', [40, 0.9, 2], [35, 0.9, 2]), R('r3', [40, 0.9, 2], [45, 0.9, 2])]);
  assert.deepEqual(misto.replays.map((x) => x.outcome), ['tie', 'win', 'loss']);
  assert.equal(misto.rule_satisfied, true);
  assert.equal(misto.verdict, 'satisfied');
});
