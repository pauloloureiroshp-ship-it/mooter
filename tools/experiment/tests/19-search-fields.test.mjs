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
import { frozenOpenWave, primaryManifest, syntheticManifest, observedFor, bytesOf, capabilityEligible, tmpRoot, clock } from './_harness.mjs';

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
    if (r.entry) assert.equal('search_used' in r.entry.payload.observed, false, 'o preflight não regista search_used, venha de onde vier');
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
