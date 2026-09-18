// 14-identity.test.mjs — critério 14 (autorização operacional): sem identidade
// (operator_id + authorization_ref) as operações oficiais são bloqueadas com
// diagnóstico; os ensaios sintéticos (W0) continuam, explicitamente
// sintéticos, sem falsa prontidão. Backend não exposto é outro campo (02c).
//
// Mordida (verificada à mão no fecho do passo 2; relatório no handoff):
// deixar o freeze aceitar um manifesto primário sem authorization_ref, ou o
// preflight ignorar operator_id, põe 14a/14b vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as J from '../journal.mjs';
import { freezeWave, validateManifestInput } from '../freeze.mjs';
import { preflight } from '../preflight.mjs';
import { frozenOpenWave, primaryManifest, syntheticManifest, observedFor, bytesOf, capabilityEligible, fakeExecutor, tmpRoot, clock } from './_harness.mjs';

test('14a · manifesto primário sem authorization_ref ou sem operator_id → freeze recusa (identity_missing), nada é escrito', () => {
  const root = tmpRoot();
  const ctx = J.openJournal({ root, waveId: 'W-14a', now: clock().now });
  const semAuth = primaryManifest('W-14a', { top: { authorization_ref: null } });
  assert.ok(validateManifestInput(semAuth, { waveId: 'W-14a' }).some((f) => f.code === 'identity_missing'));
  assert.throws(() => freezeWave(ctx, { manifest: semAuth }), (e) => e.code === 'manifest_invalid' && e.details.failures.some((f) => f.code === 'identity_missing'));
  const semOp = primaryManifest('W-14a', { condition: { operator_id: null } });
  assert.throws(() => freezeWave(ctx, { manifest: semOp }), (e) => e.code === 'manifest_invalid' && e.details.failures.some((f) => f.code === 'identity_missing' && /operator_id/.test(f.detail)));
  assert.equal(ctx.fs.existsSync(ctx.eventsPath), false, 'nenhum evento');
  assert.equal(ctx.fs.existsSync(ctx.dir + '/manifest.json'), false, 'nenhum manifesto');
});

test('14b · manifesto primário válido: o preflight exige que o operador observado seja o do manifesto; outro operador ⇒ identity_missing, zero envios', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-14b', manifest: primaryManifest('W-14b') });
  const cap = capabilityEligible();
  const exec = fakeExecutor();
  const outro = preflight(ctx, { slot_id: 'Q01-1', bytes: bytesOf(manifest, 'Q01'), observed: observedFor(manifest, { operator_id: 'op-outro' }), capability: cap });
  assert.equal(outro.ok, false);
  assert.ok(outro.reasons.some((x) => x.code === 'identity_missing' && /op-outro/.test(x.detail)), JSON.stringify(outro.reasons));
  const semOp = preflight(ctx, { slot_id: 'Q01-1', bytes: bytesOf(manifest, 'Q01'), observed: observedFor(manifest, { operator_id: null }), capability: cap });
  assert.ok(semOp.reasons.some((x) => x.code === 'identity_missing'));
  assert.equal(exec.calls, 0);

  const certo = preflight(ctx, { slot_id: 'Q01-1', bytes: bytesOf(manifest, 'Q01'), observed: observedFor(manifest), capability: cap });
  assert.equal(certo.ok, true, JSON.stringify(certo.reasons));
  assert.equal(certo.entry.payload.synthetic, false);
  assert.equal(certo.entry.payload.observed.operator_id, 'op-syn');
});

test('14c · W0 sintético corre sem operator_id nem authorization_ref — e cada evento diz synthetic:true (nunca «pronto»)', () => {
  const m = syntheticManifest('W-14c');
  assert.equal(m.authorization_ref, null);
  assert.equal(m.condition_requested.operator_id, null);
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-14c', manifest: m });
  const r = preflight(ctx, { slot_id: 'S01-1', bytes: bytesOf(manifest, 'S01'), observed: observedFor(manifest) });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.equal(r.synthetic, true);
  assert.equal(r.entry.payload.synthetic, true);
  assert.equal(J.waveState(ctx).manifest_hash, manifest.manifest_hash);
  assert.equal(manifest.partition, 'synthetic-qualification');
  // E um manifesto sintético não pode fingir-se primário só por ter authorization_ref.
  const fingido = syntheticManifest('W-14c-2', { top: { authorization_ref: 'auth-x' } });
  const ctx2 = J.openJournal({ root: tmpRoot(), waveId: 'W-14c-2', now: clock().now });
  const f = freezeWave(ctx2, { manifest: fingido });
  assert.equal(f.manifest.partition, 'synthetic-qualification');
  assert.equal(preflight(ctx2, { slot_id: 'S01-1', bytes: bytesOf(f.manifest, 'S01'), observed: observedFor(f.manifest) }).reasons.some((x) => x.code === 'wave_not_open'), true, 'sem open não há preflight_ok — e continua synthetic');
});

test('14d · MORDIDA · a capability record é obrigatória no primário: sem ela é ineligible_surface mesmo com identidade certa; em W0 não é exigida', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-14d', manifest: primaryManifest('W-14d') });
  const r = preflight(ctx, { slot_id: 'Q01-1', bytes: bytesOf(manifest, 'Q01'), observed: observedFor(manifest), capability: null });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.code === 'ineligible_surface'), JSON.stringify(r.reasons));
  const naoElegivel = preflight(ctx, { slot_id: 'Q01-1', bytes: bytesOf(manifest, 'Q01'), observed: observedFor(manifest), capability: capabilityEligible({ eligible_primary: null }) });
  assert.ok(naoElegivel.reasons.some((x) => x.code === 'ineligible_surface' && /null/.test(x.detail)), 'null não é elegível — é desconhecido');
  const w0 = frozenOpenWave({ waveId: 'W-14d-w0' });
  assert.equal(preflight(w0.ctx, { slot_id: 'S01-1', bytes: bytesOf(w0.manifest, 'S01'), observed: observedFor(w0.manifest), capability: null }).ok, true);
});
