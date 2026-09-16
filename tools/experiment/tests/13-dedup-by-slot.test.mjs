// 13-dedup-by-slot.test.mjs — critério 13: o mesmo prompt em slots diferentes
// NÃO é cache nem duplicado — são repetições planeadas, cada uma com o seu
// slot, o seu token e a sua observação. O que se deduplica é a TENTATIVA
// dentro do mesmo slot (um token), nunca a repetição entre slots.
//
// Mordida (verificada à mão no fecho do passo 2; relatório no handoff):
// identificar o slot pelo prompt_hash em vez do slot_id (ou recusar um 2.º
// preflight_ok para o mesmo prompt_hash) põe 13a/13b vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as J from '../journal.mjs';
import { preflight } from '../preflight.mjs';
import { jitterMs } from '../schedule.mjs';
import { frozenOpenWave, observedFor, bytesOf, fakeExecutor, kindsDe, MIN } from './_harness.mjs';

const operatorSends = (ctx, exec, slotId, manifest) => {
  try { J.commitIntent(ctx, { slot_id: slotId, prompt_hash: manifest.prompts.find((p) => slotId.startsWith(p.id + '-')).prompt_hash, manifest_hash: manifest.manifest_hash }); } catch (e) { return e; }
  exec.send(slotId); return null;
};

test('13a · S01-1 e S01-2 têm o mesmo prompt_hash e são slots distintos: cada um passa o preflight com os MESMOS bytes, cada um recebe o seu token; o 2.º commit em S01-1 é recusado', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-13a' });
  const obs = observedFor(manifest);
  const exec = fakeExecutor();
  const bytes = bytesOf(manifest, 'S01');
  const s1 = manifest.slots.find((s) => s.slot_id === 'S01-1');
  const s2 = manifest.slots.find((s) => s.slot_id === 'S01-2');
  assert.equal(s1.prompt_id, s2.prompt_id, 'a fixture repete mesmo o prompt');

  assert.equal(preflight(ctx, { slot_id: 'S01-1', bytes, observed: obs }).ok, true);
  assert.equal(operatorSends(ctx, exec, 'S01-1', manifest), null);
  assert.equal(operatorSends(ctx, exec, 'S01-1', manifest)?.code, 'attempt_token_exists', 'retry no MESMO slot: deduplicado pelo token');
  // Termina S01-1 para o S01-2 poder voar (concorrência 1).
  J.appendEvent(ctx, { slot_id: 'S01-1', kind: 'submitted', payload: {} });
  J.appendEvent(ctx, { slot_id: 'S01-1', kind: 'captured', payload: { capture_completeness: 'full', answer_sha256: 'c'.repeat(64) } });

  clk.advance(2 * MIN);
  const r2 = preflight(ctx, { slot_id: 'S01-2', bytes, observed: obs });
  assert.equal(r2.ok, true, `os mesmos bytes noutro slot não são cache: ${JSON.stringify(r2.reasons)}`);
  assert.equal(r2.entry.payload.prompt_hash, manifest.prompts[0].prompt_hash);
  assert.equal(operatorSends(ctx, exec, 'S01-2', manifest), null);
  assert.equal(exec.calls, 2, 'duas repetições planeadas = dois envios, um por slot');
  assert.equal(J.slotState(ctx, 'S01-1').attempt_token, 'S01-1-0001');
  assert.equal(J.slotState(ctx, 'S01-2').attempt_token, 'S01-2-0001');
  assert.deepEqual(kindsDe(ctx, 'S01-2'), ['prepared', 'preflight_ok', 'intent_committed']);
});

test('13b · o jitter é por slot (seed+slot_id): S01-1 e S01-2 têm instantes diferentes e determinísticos, mesmo com o mesmo prompt', () => {
  const { manifest } = frozenOpenWave({ waveId: 'W-13b' });
  const q = manifest.queue_policy;
  const j1 = jitterMs({ seed: q.jitter_seed, slot_id: 'S01-1', range_seconds: q.jitter_seconds });
  const j2 = jitterMs({ seed: q.jitter_seed, slot_id: 'S01-2', range_seconds: q.jitter_seconds });
  assert.notEqual(j1, j2, 'slots diferentes ⇒ jitter diferente (com este seed)');
  assert.equal(j1, jitterMs({ seed: q.jitter_seed, slot_id: 'S01-1', range_seconds: q.jitter_seconds }), 'determinístico');
  for (const j of [j1, j2]) assert.ok(j >= 0 && j <= q.jitter_seconds[1] * 1000);
  assert.notEqual(j1, jitterMs({ seed: 'outro-seed', slot_id: 'S01-1', range_seconds: q.jitter_seconds }), 'o seed conta (C4)');
});

test('13c · MORDIDA · uma resposta com os mesmos bytes noutro slot é observação nova: o preflight/commit não consultam respostas anteriores', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-13c' });
  const obs = observedFor(manifest);
  const exec = fakeExecutor();
  const bytes = bytesOf(manifest, 'S02');
  preflight(ctx, { slot_id: 'S02-1', bytes, observed: obs });
  operatorSends(ctx, exec, 'S02-1', manifest);
  J.appendEvent(ctx, { slot_id: 'S02-1', kind: 'submitted', payload: {} });
  J.appendEvent(ctx, { slot_id: 'S02-1', kind: 'captured', payload: { capture_completeness: 'full', answer_sha256: 'd'.repeat(64) } });
  clk.advance(3 * MIN);
  const r = preflight(ctx, { slot_id: 'S02-2', bytes, observed: obs });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.equal(operatorSends(ctx, exec, 'S02-2', manifest), null);
  assert.equal(exec.calls, 2);
  // O intervalo contou a partir da conclusão de S02-1 (captured), não da abertura.
  assert.ok(r.entry.payload.schedule_basis.includes('last_terminal+interval+jitter'), JSON.stringify(r.entry.payload.schedule_basis));
});
