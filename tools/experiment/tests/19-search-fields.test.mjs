// 19-search-fields.test.mjs — critério 19 (novo, PROTOCOLO 0.2 §9):
// search_available (elegibilidade: true obrigatório no braço primário) ≠
// search_used (observação: true/false/null, fica na amostra). No preflight só
// se decide o primeiro; o segundo é do importador (passo 3) e nunca filtra.
//
// Mordida (verificada à mão no fecho do passo 2; relatório no handoff):
// tratar search_used como elegibilidade, ou aceitar search_available=false no
// primário, põe 19a/19b vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as J from '../journal.mjs';
import { freezeWave, validateManifestInput } from '../freeze.mjs';
import { preflight } from '../preflight.mjs';
import { frozenOpenWave, primaryManifest, syntheticManifest, observedFor, bytesOf, capabilityEligible, tmpRoot, clock, driveSlot, fakeExecutor, HUMAN_OK, MIN } from './_harness.mjs';
import { appendScore } from '../scores.mjs';
import { buildConclusion } from '../closeout.mjs';

test('19a · manifesto primário com search_available ≠ true → freeze recusa (search_required); em W0 sintético é aceite (fica registado)', () => {
  const ctx = J.openJournal({ root: tmpRoot(), waveId: 'W-19a', now: clock().now });
  for (const v of [false, null]) {
    const m = primaryManifest('W-19a', { condition: { search_available: v } });
    assert.ok(validateManifestInput(m, { waveId: 'W-19a' }).some((f) => f.code === 'search_required'), `search_available=${v}`);
    assert.throws(() => freezeWave(ctx, { manifest: m }), (e) => e.code === 'manifest_invalid');
  }
  const w0 = syntheticManifest('W-19a', { condition: { search_available: false } });
  assert.deepEqual(validateManifestInput(w0, { waveId: 'W-19a' }), []);
  const f = freezeWave(ctx, { manifest: w0 });
  assert.equal(f.manifest.condition_requested.search_available, false);
});

test('19b · na UI, search_available observado false/null → preflight_failed{search_unavailable} no primário; true → passa', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-19b', manifest: primaryManifest('W-19b') });
  const cap = capabilityEligible();
  for (const v of [false, null]) {
    const r = preflight(ctx, { slot_id: 'Q01-1', bytes: bytesOf(manifest, 'Q01'), observed: observedFor(manifest, { search_available: v }), capability: cap });
    assert.equal(r.ok, false, `search_available=${v}`);
    assert.ok(r.reasons.some((x) => x.code === 'search_unavailable'), JSON.stringify(r.reasons));
  }
  const ok = preflight(ctx, { slot_id: 'Q01-1', bytes: bytesOf(manifest, 'Q01'), observed: observedFor(manifest, { search_available: true }), capability: cap });
  assert.equal(ok.ok, true, JSON.stringify(ok.reasons));
});

test('19c · search_used NÃO é elegibilidade: o preflight ignora-o (é observação pós-resposta), e um valor false/null observado não bloqueia nada', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-19c', manifest: primaryManifest('W-19c') });
  const cap = capabilityEligible();
  for (const v of [false, null, true]) {
    const r = preflight(ctx, { slot_id: 'Q02-1', bytes: bytesOf(manifest, 'Q02'), observed: observedFor(manifest, { search_used: v }), capability: cap });
    assert.equal(r.ok, true, `search_used=${v}: ${JSON.stringify(r.reasons)}`);
    assert.equal(r.reasons.some((x) => /search_used/.test(x.code)), false);
    if (r.entry) {
      assert.equal('search_used' in r.entry.payload.observed, false, 'search_used não é observação de preflight');
      assert.deepEqual(r.entry.payload.observed.search_used_reported_pre_capture, { value: v, ignored: true, why: 'search_used é observação pós-resposta; registado no importador' }, 'mas o que o operador reportou fica, com proveniência — nada se apaga');
    }
  }
  // O manifesto congelado guarda search_used como null — só se preenche por observação.
  assert.equal(manifest.condition_requested.search_used, null);
  const comValor = primaryManifest('W-19c-2', { condition: { search_used: true } });
  assert.ok(validateManifestInput(comValor, { waveId: 'W-19c-2' }).some((f) => f.code === 'condition_observed_only' && /search_used/.test(f.detail)));
});

test('19d · MORDIDA · os dois campos vivem em sítios distintos: search_available no manifesto E na observação do preflight; search_used em lado nenhum antes da captura', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-19d', manifest: primaryManifest('W-19d') });
  const r = preflight(ctx, { slot_id: 'Q03-1', bytes: bytesOf(manifest, 'Q03'), observed: observedFor(manifest), capability: capabilityEligible() });
  assert.equal(r.ok, true);
  assert.equal(r.entry.payload.observed.search_available, true);
  assert.equal('search_used' in r.entry.payload.observed, false, 'o preflight não escreve search_used — ainda não há resposta');
  assert.equal(manifest.condition_requested.search_available, true);
});

// AMENDMENT-001b · B2 (b): search_used=false nunca exclui — resposta completa + adjudicação ⇒ evaluable=1.
test('19e · B2 · resposta completa com search_used=false, adjudicada target_mentioned=true ⇒ evaluable=1 no by_field e no slot; search_used=true sem adjudicação ⇒ 0', () => {
  const w = frozenOpenWave({ waveId: 'W-19e', manifest: primaryManifest('W-19e') });
  const exec = fakeExecutor();
  w.clk.advance(2 * MIN); driveSlot(w.ctx, w.manifest, 'Q01-1', { to: 'captured', exec, observed: { search_used: false } });
  w.clk.advance(2 * MIN); driveSlot(w.ctx, w.manifest, 'Q02-1', { to: 'captured', exec, observed: { search_used: true } });
  appendScore(w.ctx, { slot_id: 'Q01-1', field: 'target_mentioned', value: true, source: 'reviewer-syn', timestamp: new Date(w.clk.t).toISOString(), evidence_reference: { excerpt: '…' }, reviewer: 'rev-syn' });
  w.clk.t = Date.parse(J.waveState(w.ctx).closeout_at) + 1;
  const c = buildConclusion(w.ctx, { human: HUMAN_OK });
  assert.equal(c.per_slot['Q01-1'].search_used, false);
  assert.deepEqual([c.per_slot['Q01-1'].capture_sufficient_for.target_mentioned, c.per_slot['Q01-1'].evaluable_for.target_mentioned], [true, true]);
  assert.deepEqual([c.per_slot['Q02-1'].capture_sufficient_for.target_mentioned, c.per_slot['Q02-1'].evaluable_for.target_mentioned], [true, false], 'search_used=true não adjudica nada');
  assert.deepEqual(c.eligible_evaluable_denominator.evaluable_by_field.target_mentioned, { eligible: 1, negative: 0 });
  assert.equal(c.search_used_counts.false, 1);
  assert.equal(c.eligible_evaluable_denominator.coverage_per_wave, 8);
});
