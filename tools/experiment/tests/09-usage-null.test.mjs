// 09-usage-null.test.mjs — critério 09: tokens/custo ausentes ⇒ null com
// cobertura; estimados/imputados etiquetados; nenhuma soma silenciosa como zero.
//
// Contra-exemplos no motor (8dfdb8b8): agent.ts:65-67 (len/4 sem etiqueta),
// state.ts:213-224 (`?? 0` e «poupança» por cima), cost-perf-tracker.js:70-75
// (`ti || 0`). A doutrina certa está em cost-perf-tracker.js:16-20 («unknown
// numerics are stored as null, never a guessed value») — reutilizamos a REGRA.
//
// Mordida (verificada à mão no fecho do passo 3; relatório no handoff): `?? 0`
// no metric(), ou somar unknown como 0 no aggregateUsage, põe 09a/09c vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as J from '../journal.mjs';
import { preflight } from '../preflight.mjs';
import { importCapture, metric, usageEnvelope, aggregateUsage, ImportError } from '../import.mjs';
import { frozenOpenWave, primaryManifest, observedFor, bytesOf, capabilityEligible, fakeExecutor, MIN } from './_harness.mjs';

const HAIKU = 'claude-haiku-4-5-20251001';

function submitSlot(ctx, manifest, slotId, exec) {
  const pid = manifest.slots.find((s) => s.slot_id === slotId).prompt_id;
  const r = preflight(ctx, { slot_id: slotId, bytes: bytesOf(manifest, pid), observed: observedFor(manifest), capability: capabilityEligible() });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  J.commitIntent(ctx, { slot_id: slotId, prompt_hash: manifest.prompts.find((p) => p.id === pid).prompt_hash, manifest_hash: manifest.manifest_hash });
  exec.send(slotId);
  J.appendEvent(ctx, { slot_id: slotId, kind: 'submitted', payload: {} });
}

test('09a · metric(): null → {value:null, basis:unknown}; número nu é recusado; estimado/imputado exigem source; unknown com valor é contradição', () => {
  assert.deepEqual(metric(null), { value: null, basis: 'unknown', source: null });
  assert.deepEqual(metric(undefined), { value: null, basis: 'unknown', source: null });
  assert.deepEqual(metric({ value: null, basis: 'observed' }), { value: null, basis: 'unknown', source: null }, 'value null manda: a base vira unknown');
  assert.throws(() => metric(312), (e) => e instanceof ImportError && e.code === 'metric_without_basis');
  assert.throws(() => metric({ value: 312, basis: 'estimated' }), (e) => e.code === 'metric_needs_source');
  assert.throws(() => metric({ value: 312, basis: 'unknown' }), (e) => e.code === 'metric_bad_basis');
  assert.throws(() => metric({ value: -1, basis: 'observed' }), (e) => e.code === 'metric_bad_value');
  assert.deepEqual(metric({ value: 1553, basis: 'estimated', source: 'chars/4' }), { value: 1553, basis: 'estimated', source: 'chars/4' });
  assert.deepEqual(metric({ value: 0, basis: 'observed', source: 'ui' }), { value: 0, basis: 'observed', source: 'ui' }, 'zero OBSERVADO é um valor; zero por omissão não existe');
});

test('09b · 8 slots: 3 observados, 2 estimados (chars/4 etiquetado), 3 sem usage → o envelope de cada um é fiel, e o diário guarda basis por métrica', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-09b', manifest: primaryManifest('W-09b') });
  const exec = fakeExecutor();
  const usages = [
    { model_key: HAIKU, tokens_in: { value: 300, basis: 'observed', source: 'ui' }, tokens_out: { value: 1500, basis: 'observed', source: 'ui' } },
    { model_key: HAIKU, tokens_in: { value: 310, basis: 'observed', source: 'ui' }, tokens_out: { value: 1400, basis: 'observed', source: 'ui' } },
    { model_key: HAIKU, tokens_in: { value: 305, basis: 'observed', source: 'ui' }, tokens_out: { value: 1600, basis: 'observed', source: 'ui' } },
    { model_key: HAIKU, tokens_in: { value: 300, basis: 'estimated', source: 'chars/4' }, tokens_out: { value: 1553, basis: 'estimated', source: 'chars/4' } },
    { model_key: HAIKU, tokens_in: { value: 298, basis: 'estimated', source: 'chars/4' }, tokens_out: { value: 1490, basis: 'estimated', source: 'chars/4' } },
    { model_key: HAIKU }, { model_key: HAIKU }, { model_key: HAIKU }, // modelo conhecido, usage desconhecido — a UI não mostra tokens
  ];
  const envs = [];
  for (let i = 0; i < manifest.slots.length; i++) {
    const slot = manifest.slots[i].slot_id;
    if (i) clk.advance(2 * MIN);
    submitSlot(ctx, manifest, slot, exec);
    const r = importCapture(ctx, { slot_id: slot, answer_bytes: Buffer.from(`resposta ${i}`), capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: i % 2 === 0 }), usage: usages[i] });
    envs.push(r.usage);
  }
  const fromJournal = J.readEvents(ctx).filter((e) => e.kind === 'captured').map((e) => e.payload.usage);
  assert.equal(fromJournal.length, 8);
  assert.deepEqual(fromJournal.map((u) => u.tokens_out.basis), ['observed', 'observed', 'observed', 'estimated', 'estimated', 'unknown', 'unknown', 'unknown']);
  assert.deepEqual(fromJournal.map((u) => u.tokens_out.value), [1500, 1400, 1600, 1553, 1490, null, null, null]);
  assert.equal(fromJournal[5].cost_usd.basis, 'unknown');
  assert.equal(fromJournal[5].cost_usd.reason, 'no_usage');
  assert.equal(fromJournal[3].cost_usd.basis, 'estimated', 'custo sobre tokens estimados é custo estimado — nunca «real»');
  assert.equal(fromJournal[0].cost_usd.basis, 'observed');
  assert.equal(fromJournal[0].cost_usd.price_basis.last_reviewed, '2026-09-12', 'a data do SSOT de preços fica no envelope');
  assert.match(fromJournal[0].cost_usd.price_basis.sha256, /^[0-9a-f]{64}$/);
  assert.equal(exec.calls, 8);
});

test('09c · aggregateUsage: soma só o que tem valor, por base; unknown conta, não soma; coverage = observados/total; nunca há exact_total', () => {
  const envs = [
    usageEnvelope({ model_key: HAIKU, tokens_in: { value: 300, basis: 'observed', source: 'ui' }, tokens_out: { value: 1500, basis: 'observed', source: 'ui' } }),
    usageEnvelope({ model_key: HAIKU, tokens_in: { value: 310, basis: 'observed', source: 'ui' }, tokens_out: { value: 1400, basis: 'observed', source: 'ui' } }),
    usageEnvelope({ model_key: HAIKU, tokens_in: { value: 305, basis: 'observed', source: 'ui' }, tokens_out: { value: 1600, basis: 'observed', source: 'ui' } }),
    usageEnvelope({ model_key: HAIKU, tokens_in: { value: 300, basis: 'estimated', source: 'chars/4' }, tokens_out: { value: 1553, basis: 'estimated', source: 'chars/4' } }),
    usageEnvelope({ model_key: HAIKU, tokens_in: { value: 298, basis: 'estimated', source: 'chars/4' }, tokens_out: { value: 1490, basis: 'estimated', source: 'chars/4' } }),
    usageEnvelope({}), usageEnvelope({}), usageEnvelope({}),
  ];
  const agg = aggregateUsage(envs);
  assert.equal(agg.tokens_out.observed_sum, 4500);
  assert.equal(agg.tokens_out.estimated_sum, 3043);
  assert.equal(agg.tokens_out.n_observed, 3);
  assert.equal(agg.tokens_out.n_estimated, 2);
  assert.equal(agg.tokens_out.n_unknown, 3);
  assert.equal(agg.tokens_out.n_total, 8);
  assert.equal(agg.tokens_out.coverage, 0.375);
  assert.equal(agg.tokens_out.exact_total, null, 'com 3 unknown e 2 estimated não existe total exacto — e o campo diz null, não 7543');
  assert.equal(agg.cost_usd.n_unknown, 3);
  assert.equal(agg.cost_usd.n_observed, 3);
  assert.equal(agg.cost_usd.n_estimated, 2);
  assert.ok(Math.abs(agg.cost_usd.observed_sum - ((300 + 310 + 305) * 1 + (1500 + 1400 + 1600) * 5) / 1e6) < 1e-12);
  // Um envelope inteiramente vazio não muda somas nem cobertura para além do denominador.
  const agg2 = aggregateUsage([...envs, usageEnvelope({})]);
  assert.equal(agg2.tokens_out.observed_sum, 4500);
  assert.equal(agg2.tokens_out.n_total, 9);
  assert.equal(agg2.tokens_out.coverage, 3 / 9);
});

test('09d · MORDIDA · latência desconhecida fica null; e o importador recusa usage com número nu (sem basis) em vez de o aceitar como observado', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-09d' });
  const exec = fakeExecutor();
  submitSlot(ctx, manifest, 'S01-1', exec);
  assert.throws(() => importCapture(ctx, { slot_id: 'S01-1', answer_bytes: Buffer.from('x'), capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: null }), usage: { tokens_out: 1500 } }), (e) => e.code === 'metric_without_basis');
  const r = importCapture(ctx, { slot_id: 'S01-1', answer_bytes: Buffer.from('x'), capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: null }), usage: { latency_ms: null } });
  assert.deepEqual(r.usage.latency_ms, { value: null, basis: 'unknown', source: null });
  assert.equal(r.usage.model_key, null);
  assert.equal(r.usage.cost_usd.reason, 'no_model_key');
});
