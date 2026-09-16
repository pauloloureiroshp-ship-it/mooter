// 05-recover.test.mjs — critério 05: a resposta existe mas a captura falhou ⇒
// recuperar a MESMA resposta no MESMO slot; nunca criar conversa/slot novo; o
// parcial anterior fica (renomeado, com hash).
//
// É a onda-01 de 11/09 (addendum B): D01-R1 respondida, captura parcial por
// queda da extensão, depois «a MESMA resposta recuperada integralmente (6213
// caracteres)» — «o ficheiro parcial não é uma segunda conversa».
//
// Mordida (verificada à mão no fecho do passo 3; relatório no handoff): deixar
// o importador aceitar um slot sem intent_committed, ou apagar o parcial em vez
// de renomear, ou capturar sem policy_review quando a condição mudou, põe
// 05a/05b/05d vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as J from '../journal.mjs';
import { preflight } from '../preflight.mjs';
import { importCapture, markCaptureUncertain, ImportError } from '../import.mjs';
import { frozenOpenWave, observedFor, bytesOf, fakeExecutor, kindsDe, linhas, MIN } from './_harness.mjs';

/** Leva um slot até `submitted` (preflight → intent → operador envia → submitted). */
function submitSlot(ctx, manifest, slotId, exec) {
  const pid = manifest.slots.find((s) => s.slot_id === slotId).prompt_id;
  const r = preflight(ctx, { slot_id: slotId, bytes: bytesOf(manifest, pid), observed: observedFor(manifest) });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  J.commitIntent(ctx, { slot_id: slotId, prompt_hash: manifest.prompts.find((p) => p.id === pid).prompt_hash, manifest_hash: manifest.manifest_hash });
  exec.send(slotId);
  J.appendEvent(ctx, { slot_id: slotId, kind: 'submitted', payload: { ts_submitted: new Date(ctx.now()).toISOString() } });
}

const RESPOSTA = Buffer.from('Resposta sintética completa, com seis mil caracteres imaginários resumidos numa linha.', 'utf8');
const PARCIAL = RESPOSTA.subarray(0, 24);

test('05a · captura parcial → capture_uncertain (com o parcial guardado) → recover com a resposta completa: mesmo slot, parcial renomeado e referenciado, nº de slots inalterado, 1 envio', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-05a' });
  const exec = fakeExecutor();
  submitSlot(ctx, manifest, 'S01-1', exec);
  const slotsAntes = J.slotStates(ctx).size;

  const cu = markCaptureUncertain(ctx, { slot_id: 'S01-1', literal: 'Ligação à extensão caiu a meio da resposta', partial_bytes: PARCIAL, capture_method: 'chrome-extension' });
  assert.equal(cu.kind, 'capture_uncertain');
  assert.equal(cu.payload.class, 'capture_failure');
  assert.equal(cu.payload.partial.bytes, 24);
  assert.equal(fs.readFileSync(path.join(ctx.rawDir, 'S01-1', 'answer.txt')).length, 24);

  assert.throws(() => importCapture(ctx, { slot_id: 'S01-1', answer_bytes: RESPOSTA, capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: false }) }), (e) => e instanceof ImportError && e.code === 'recover_required', 'incerto exige recover:true explícito');
  assert.throws(() => importCapture(ctx, { slot_id: 'S01-1', answer_bytes: RESPOSTA, capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: false }), recover: true }), (e) => e.code === 'recover_needs_proof', 'e prova de que é a mesma resposta');

  const r = importCapture(ctx, { slot_id: 'S01-1', answer_bytes: RESPOSTA, capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: false }), recover: true, note: 'mesma conversa reaberta no histórico; captura de ecrã ks-05a.png' });
  assert.equal(r.entry.kind, 'captured');
  assert.equal(r.entry.payload.recovered, true);
  assert.equal(r.entry.payload.answer_bytes, RESPOSTA.length);
  assert.equal(r.supersedes.file, 'raw/S01-1/answer.partial-01.txt');
  assert.equal(r.supersedes.sha256, cu.payload.partial.sha256, 'o evento aponta para o parcial que substitui, pelo hash');
  assert.equal(fs.readFileSync(path.join(ctx.rawDir, 'S01-1', 'answer.partial-01.txt')).length, 24, 'o parcial continua no disco');
  assert.equal(fs.readFileSync(path.join(ctx.rawDir, 'S01-1', 'answer.txt')).length, RESPOSTA.length);
  assert.equal(fs.readFileSync(path.join(ctx.rawDir, 'S01-1', 'answer.sha256'), 'utf8').split(/\s+/)[0], r.answer_sha256);
  assert.equal(J.slotStates(ctx).size, slotsAntes, 'nenhum slot novo');
  assert.equal(exec.calls, 1, 'nenhum reenvio: a recuperação não toca no fornecedor');
  assert.deepEqual(kindsDe(ctx, 'S01-1'), ['prepared', 'preflight_ok', 'intent_committed', 'submitted', 'capture_uncertain', 'captured']);
  assert.equal(J.verifyChain(ctx).ok, true);
});

test('05b · o importador nunca cria slot nem conversa: slot sem intent → no_intent_for_slot; slot fora do manifesto → slot_unknown; nada escrito', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-05b' });
  const antes = linhas(ctx).length;
  const args = { answer_bytes: RESPOSTA, capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: null }) };
  assert.throws(() => importCapture(ctx, { slot_id: 'S02-1', ...args }), (e) => e.code === 'no_intent_for_slot');
  preflight(ctx, { slot_id: 'S02-1', bytes: bytesOf(manifest, 'S02'), observed: observedFor(manifest) });
  assert.throws(() => importCapture(ctx, { slot_id: 'S02-1', ...args }), (e) => e.code === 'no_intent_for_slot', 'preflight_ok ainda não é intenção');
  assert.throws(() => importCapture(ctx, { slot_id: 'S99-1', ...args }), (e) => e.code === 'slot_unknown');
  assert.equal(fs.existsSync(path.join(ctx.rawDir, 'S02-1', 'answer.txt')), false);
  assert.equal(fs.existsSync(path.join(ctx.rawDir, 'S99-1')), false);
  assert.equal(linhas(ctx).length, antes + 2, 'só o prepared+preflight_ok do teste; nenhuma captura');
});

test('05c · submission_uncertain (crash após envio) → recover com provider_run_id liga a resposta ao slot original; segunda recuperação no mesmo slot já não é permitida sem novo estado incerto', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-05c' });
  const exec = fakeExecutor();
  const pid = 'S01';
  preflight(ctx, { slot_id: 'S01-1', bytes: bytesOf(manifest, pid), observed: observedFor(manifest) });
  J.commitIntent(ctx, { slot_id: 'S01-1', prompt_hash: manifest.prompts[0].prompt_hash, manifest_hash: manifest.manifest_hash });
  exec.send('S01-1');
  // crash: sem submitted. Retoma → submission_uncertain.
  clk.advance(2 * MIN);
  const r = J.resume(ctx);
  assert.deepEqual(r.marked, ['S01-1']);
  const cap = importCapture(ctx, { slot_id: 'S01-1', answer_bytes: RESPOSTA, capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: true }), recover: true, provider_run_id: 'conv-abc123' });
  assert.equal(cap.entry.payload.provider_run_id, 'conv-abc123');
  assert.equal(cap.entry.payload.supersedes, null, 'não havia parcial');
  assert.equal(J.slotState(ctx, 'S01-1').state, 'captured');
  assert.equal(exec.calls, 1);
  assert.throws(() => importCapture(ctx, { slot_id: 'S01-1', answer_bytes: RESPOSTA, capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest), recover: true, provider_run_id: 'conv-abc123' }), (e) => e.code === 'slot_not_importable', 'captured não volta a importar — interpretações novas vão para scores, não para raw');
});

test('05d · MORDIDA · condição observada mudou DEPOIS da resposta (rótulo «Latest») → policy_review antes de captured; a captura fica; condition_divergent=true; nunca pooling silencioso', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-05d' });
  const exec = fakeExecutor();
  submitSlot(ctx, manifest, 'S02-1', exec);
  const r = importCapture(ctx, { slot_id: 'S02-1', answer_bytes: RESPOSTA, capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { observed_model_label: 'Latest', search_used: true }) });
  assert.deepEqual(r.drift, [{ field: 'observed_model_label', requested: manifest.condition_requested.selected_model_label, observed: 'Latest' }]);
  assert.deepEqual(kindsDe(ctx, 'S02-1').slice(-2), ['policy_review', 'captured']);
  const pr = J.readEvents(ctx).filter((e) => e.slot_id === 'S02-1' && e.kind === 'policy_review')[0];
  assert.equal(pr.payload.condition_closed, true);
  assert.equal(r.entry.payload.condition_divergent, true);
  assert.equal(r.entry.payload.observed.observed_model_label, 'Latest', 'o rótulo observado fica tal como se viu — não é «corrigido» para o pedido');
  assert.equal(fs.existsSync(path.join(ctx.rawDir, 'S02-1', 'answer.txt')), true, 'a captura fica: é evidência, com condição fechada');
});
