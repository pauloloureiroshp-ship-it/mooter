// 20-scientific-independence.test.mjs — critério 20 (novo, PROTOCOLO 0.2 §9):
// acesso / recuperação / citação / uso são observações com evidência PRÓPRIA;
// o closeout nunca deriva uma da outra; logs em falta não cancelam W2 nem
// geram falsa ausência (null é «não observado»).
//
// Contrato 0.3 scientific_observations: value_domain [true,false,null];
// required_provenance [source,timestamp,evidence_reference,reviewer];
// «new_fact_used: Require page diff and answer excerpt. A cited URL alone does
// not prove use of the revised fact.» «No automatic promotion from access to
// retrieval/citation/use.»
//
// Mordida (verificada à mão no fecho do passo 4; relatório no handoff): deixar
// countObservations promover citação→uso, ou aceitar new_fact_used=true sem
// diff+excerto, ou tratar null como false, põe 20a/20b/20c vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import * as J from '../journal.mjs';
import { openFromManifest } from '../open.mjs';
import { freezeWave } from '../freeze.mjs';
import { appendScore, readScores, validateScore, countObservations, ScoreError, SCIENCE_FIELDS } from '../scores.mjs';
import { closeoutWave, buildConclusion } from '../closeout.mjs';
import { frozenOpenWave, primaryManifest, driveSlot, HUMAN_OK, tmpRoot, clock, MIN, T0 } from './_harness.mjs';

const ISO = (ms) => new Date(ms).toISOString();
const prov = (clk, over = {}) => ({ source: 'reviewer-read', timestamp: ISO(clk.t), evidence_reference: { excerpt: 'trecho da resposta' }, reviewer: 'rev-syn', ...over });

/** W2-like: 8 slots capturados, sem logs de crawler em lado nenhum. */
function w2(waveId) {
  const w = frozenOpenWave({ waveId, manifest: primaryManifest(waveId, { top: { condition_id: 'cond-w2' } }) });
  for (const s of w.manifest.slots) { w.clk.advance(2 * MIN); driveSlot(w.ctx, w.manifest, s.slot_id, { to: 'captured', answer: `resposta ${s.slot_id}` }); }
  return w;
}

test('20a · citação observada num slot (page_or_domain_cited=true) NÃO promove new_fact_used: fica null; crawl_access null em todos ⇒ observability_limits diz «não observado», a onda fecha na mesma', () => {
  const { ctx, manifest, clk } = w2('W-20a');
  appendScore(ctx, { slot_id: 'Q01-1', field: 'page_or_domain_cited', value: true, ...prov(clk) });
  appendScore(ctx, { slot_id: 'Q01-1', field: 'target_mentioned', value: true, ...prov(clk) });
  appendScore(ctx, { slot_id: 'Q02-1', field: 'recommended_appropriately', value: false, ...prov(clk) });
  clk.t = Date.parse(J.waveState(ctx).closeout_at) + 1;
  const c = buildConclusion(ctx, { human: HUMAN_OK });
  const q01 = c.per_intent_outcomes['Q01'];
  assert.deepEqual(q01.page_or_domain_cited, { true: 1, false: 0, null: 1, n_slots: 2, n_records: 1 });
  assert.deepEqual(q01.new_fact_used, { true: 0, false: 0, null: 2, n_slots: 2, n_records: 0 }, 'citação não vira uso');
  assert.deepEqual(q01.crawl_access, { true: 0, false: 0, null: 2, n_slots: 2, n_records: 0 });
  assert.deepEqual(q01.retrieved_target_url, { true: 0, false: 0, null: 2, n_slots: 2, n_records: 0 }, 'e citação não vira recuperação');
  assert.ok(c.observability_limits.some((l) => /^crawl_access: null em 8\/8/.test(l)), JSON.stringify(c.observability_limits));
  assert.ok(c.observability_limits.some((l) => /^new_fact_used: null em 8\/8/.test(l)));
  const r = closeoutWave(ctx, { human: HUMAN_OK });
  assert.equal(r.entry.kind, 'wave.closed', 'sem logs de crawler a onda fecha na mesma — a limitação fica escrita, a amostragem não é cancelada');
  assert.equal(r.conclusion.complete, 8);
  assert.equal(manifest.partition, 'primary');
});

test('20b · new_fact_used=true exige evidence_reference{diff, excerpt}; sem isso é recusado e nada é escrito; com isso entra', () => {
  const { ctx, clk } = w2('W-20b');
  const antes = readScores(ctx).length;
  assert.throws(() => appendScore(ctx, { slot_id: 'Q01-1', field: 'new_fact_used', value: true, ...prov(clk) }), (e) => e instanceof ScoreError && e.code === 'score_invalid' && e.details.failures.some((f) => f.code === 'evidence_required'));
  assert.throws(() => appendScore(ctx, { slot_id: 'Q01-1', field: 'new_fact_used', value: true, ...prov(clk, { evidence_reference: { diff: '- preço antigo\n+ preço novo' } }) }), (e) => e.details.failures.some((f) => f.code === 'evidence_required'), 'só o diff não chega');
  assert.equal(readScores(ctx).length, antes, 'nada escrito');
  const ok = appendScore(ctx, { slot_id: 'Q01-1', field: 'new_fact_used', value: true, ...prov(clk, { evidence_reference: { diff: '- preço antigo\n+ preço novo', excerpt: 'a resposta diz «preço novo»' } }) });
  assert.equal(ok.field, 'new_fact_used');
  assert.equal(ok.answer_sha256.length, 64, 'a observação liga-se à captura pelo hash da resposta');
  // false e null nunca exigem diff — a evidência é para a afirmação positiva.
  appendScore(ctx, { slot_id: 'Q02-1', field: 'new_fact_used', value: false, ...prov(clk) });
  appendScore(ctx, { slot_id: 'Q03-1', field: 'new_fact_used', value: null, ...prov(clk) });
  assert.equal(readScores(ctx).length, antes + 3);
});

test('20c · proveniência obrigatória; campo fora da lista, valor fora do domínio, slot fora do manifesto (o holdout R01) e slot sem captura são recusados; crawl_access pode existir sem resposta', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-20c', manifest: primaryManifest('W-20c') });
  const base = { slot_id: 'Q01-1', field: 'target_mentioned', value: true };
  for (const k of ['source', 'timestamp', 'evidence_reference', 'reviewer']) {
    const rec = { ...base, ...prov(clk) }; delete rec[k];
    assert.ok(validateScore(rec).some((f) => f.code === 'provenance_missing' && f.detail === k), k);
  }
  assert.ok(validateScore({ ...base, ...prov(clk), field: 'looks_good' }).some((f) => f.code === 'bad_field'));
  assert.ok(validateScore({ ...base, ...prov(clk), value: 'yes' }).some((f) => f.code === 'bad_value'));
  assert.ok(validateScore({ ...base, ...prov(clk), slot_id: 'R01-1' }, { knownSlots: manifest.slots.map((s) => s.slot_id) }).some((f) => f.code === 'slot_unknown'));
  assert.throws(() => appendScore(ctx, { ...base, ...prov(clk), slot_id: 'R01-1' }), (e) => e.details.failures.some((f) => f.code === 'slot_unknown'), 'o holdout não passa por scores.jsonl de uma onda de desenvolvimento');
  assert.throws(() => appendScore(ctx, { ...base, ...prov(clk) }), (e) => e.code === 'no_capture_for_slot', 'sem resposta não há o que observar…');
  const ca = appendScore(ctx, { slot_id: 'Q01-1', field: 'crawl_access', value: null, ...prov(clk, { source: 'sem logs do servidor' }) });
  assert.equal(ca.value, null, '…excepto o acesso do crawler, que é sobre o servidor');
  assert.equal(SCIENCE_FIELDS.includes('competitor_included'), true);
  assert.ok(validateScore({ slot_id: 'Q01-1', field: 'competitor_included', value: true, ...prov(clk) }).some((f) => /brand/.test(f.detail)), 'concorrente é por marca');
});

test('20d · MORDIDA · a última observação de um campo vence (revisões supersedem, ficam no ficheiro); null nunca é contado como false; countObservations é puro', () => {
  const { ctx, clk } = w2('W-20d');
  appendScore(ctx, { slot_id: 'Q01-1', field: 'recommended_appropriately', value: true, ...prov(clk) });
  clk.advance(1 * MIN);
  appendScore(ctx, { slot_id: 'Q01-1', field: 'recommended_appropriately', value: false, ...prov(clk, { source: 'segunda leitura: a recomendação era para outro caso de uso' }) });
  const scores = readScores(ctx);
  assert.equal(scores.filter((s) => s.slot_id === 'Q01-1' && s.field === 'recommended_appropriately').length, 2, 'as duas ficam');
  const counts = countObservations({ scores, slot_ids: ['Q01-1', 'Q01-2'], prompt_of: { 'Q01-1': 'Q01', 'Q01-2': 'Q01' } });
  assert.deepEqual(counts.Q01.recommended_appropriately, { true: 0, false: 1, null: 1, n_slots: 2, n_records: 2 });
  assert.equal(counts.Q01.recommended_appropriately.null, 1, 'Q01-2 sem registo é null — não é false');
  // Um W2 sem cobertura de crawler não é bloqueado à abertura: o manifesto não tem gate de crawl.
  const root = tmpRoot();
  const c2 = J.openJournal({ root, waveId: 'W-20d-w2', now: clock(T0).now });
  freezeWave(c2, { manifest: primaryManifest('W-20d-w2') });
  assert.equal(openFromManifest(c2).entry.kind, 'wave.opened', 'crawl_required=false: abre no checkpoint pré-registado, logs ou não');
  assert.equal(fs.existsSync(c2.eventsPath), true);
});
