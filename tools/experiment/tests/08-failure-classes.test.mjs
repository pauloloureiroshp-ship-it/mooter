// 08-failure-classes.test.mjs — critério 08: timeout de captura, quota, rate
// limit, recusa e autenticação são categorias DISTINTAS; a mensagem original
// fica sempre; uma falha de captura nunca é reclassificada como quota.
//
// Reutiliza tal-qual a taxonomia de tools/router/provider-health.js:175-245
// (pinada, C3) para o que VEM DO FORNECEDOR. O que vem do operador (captura
// falhou; a resposta é uma recusa) não passa pelo classificador — medido hoje:
// classificarFalha('Unable to display response. usage limit?') devolve
// quota_exhausted, que é exactamente o erro que o caso 08 proíbe.
//
// Mordida (verificada à mão no fecho do passo 3; relatório no handoff): passar
// o literal de captura pelo classificador, ou inferir recusa do texto, ou
// deixar cair o literal, põe 08b/08c/08a vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import * as J from '../journal.mjs';
import { preflight } from '../preflight.mjs';
import { importCapture, importFailure, markCaptureUncertain } from '../import.mjs';
import { frozenOpenWave, observedFor, bytesOf, fakeExecutor, kindsDe, MIN } from './_harness.mjs';

const providerHealth = createRequire(import.meta.url)('../../router/provider-health.js');

function submitSlot(ctx, manifest, slotId, exec) {
  const pid = manifest.slots.find((s) => s.slot_id === slotId).prompt_id;
  const r = preflight(ctx, { slot_id: slotId, bytes: bytesOf(manifest, pid), observed: observedFor(manifest) });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  J.commitIntent(ctx, { slot_id: slotId, prompt_hash: manifest.prompts.find((p) => p.id === pid).prompt_hash, manifest_hash: manifest.manifest_hash });
  exec.send(slotId);
  J.appendEvent(ctx, { slot_id: slotId, kind: 'submitted', payload: {} });
}

const closeAndNext = (ctx, manifest, clk, slotId, exec) => { clk.advance(2 * MIN); submitSlot(ctx, manifest, slotId, exec); };

test('08a · quota, rate limit e autenticação: classes da taxonomia pinada, literal preservado, reset lido do literal; quota/ritmo geram a pausa de onda com next_action_at', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-08a' });
  const exec = fakeExecutor();
  // Ordem deliberada: a quota vem em ÚLTIMO — o «Resets 10pm» cai fora da janela
  // de 45 min e, a partir daí, o kit recusa mais envios (caso 07). Provado no fim.
  const casos = [
    ['S01-1', '401 Unauthorized: session expired', 'auth_failed', null],
    ['S02-1', 'Too many requests. retry-after: 90', 'rate_limited', 'wave.throttled'],
    ['S02-2', 'You have reached your weekly limit. Resets 10pm', 'quota_exhausted', 'wave.reset_wait'],
  ];
  for (const [slot, literal, cls, pause] of casos) {
    // Depois de uma pausa, o preflight seguinte pode dizer too_early; para o teste, avançamos o relógio.
    closeAndNext(ctx, manifest, clk, slot, exec);
    const r = importFailure(ctx, { slot_id: slot, literal });
    assert.equal(r.class, cls, literal);
    assert.equal(r.entry.payload.literal, literal, 'o literal fica tal como veio');
    assert.equal(J.slotState(ctx, slot).state, 'failed');
    if (pause) {
      assert.equal(r.pause.kind, pause);
      assert.equal(r.pause.payload.literal, literal);
      assert.ok(r.pause.payload.next_action_at, 'a pausa diz quando');
      assert.equal(J.waveState(ctx).next_action_at, r.pause.payload.next_action_at, 'o scheduler passa a honrar o reset');
    } else assert.equal(r.pause, null, 'auth_failed não é pausa de ritmo — é paragem');
    const next = J.waveState(ctx).next_action_at;
    if (next && Date.parse(next) < Date.parse(J.waveState(ctx).closeout_at)) clk.t = Date.parse(next) + 1000;
  }
  const rl = J.readEvents(ctx).find((e) => e.kind === 'failed' && e.payload.class === 'rate_limited');
  assert.equal(rl.payload.reset_at, new Date(Date.parse(rl.ts) + 90_000).toISOString(), 'retry-after: 90 → reset_at = ts + 90 s (provider-health.lerReposicao)');
  assert.equal(exec.calls, 3, 'três envios, três falhas, zero reenvios automáticos');

  // Depois da quota, o reset («10pm») está fora da janela: o slot seguinte não passa no preflight.
  clk.t = Date.parse(J.readEvents(ctx).find((e) => e.kind === 'wave.reset_wait').ts) + 1000;
  const pf = preflight(ctx, { slot_id: 'S01-2', bytes: bytesOf(manifest, 'S01'), observed: observedFor(manifest) });
  assert.equal(pf.ok, false);
  assert.ok(pf.reasons.some((x) => x.code === 'budget_exceeded'), JSON.stringify(pf.reasons));
  assert.equal(exec.calls, 3);
});

test('08b · falha de CAPTURA com um literal que o classificador leria como quota → capture_uncertain{class: capture_failure}; nunca quota; a resposta continua recuperável', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-08b' });
  const exec = fakeExecutor();
  submitSlot(ctx, manifest, 'S01-1', exec);
  const literal = 'Unable to display response. usage limit?';
  assert.equal(providerHealth.classificarFalha({ message: literal }), 'quota_exhausted', 'a fixture é mesmo o caso perigoso: o classificador diria quota');
  const cu = markCaptureUncertain(ctx, { slot_id: 'S01-1', literal, capture_method: 'chrome-extension' });
  assert.equal(cu.payload.class, 'capture_failure');
  assert.equal(cu.payload.literal, literal);
  assert.equal(J.slotState(ctx, 'S01-1').state, 'capture_uncertain');
  assert.equal(J.readEvents(ctx).some((e) => e.kind === 'wave.reset_wait' || e.kind === 'wave.throttled'), false, 'nenhuma pausa de onda inventada');
  const cap = importCapture(ctx, { slot_id: 'S01-1', answer_bytes: Buffer.from('resposta recuperada'), capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: null }), recover: true, note: 'reaberta a mesma conversa no histórico' });
  assert.equal(cap.entry.kind, 'captured');
});

test('08c · recusa: é uma resposta CAPTURADA com refusal:true — texto intacto, separada de recomendação; o kit não infere recusa do texto', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-08c' });
  const exec = fakeExecutor();
  submitSlot(ctx, manifest, 'S01-1', exec);
  const texto = Buffer.from("I can't help with that request.", 'utf8');
  const semFlag = importCapture(ctx, { slot_id: 'S01-1', answer_bytes: texto, capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: false }) });
  assert.equal(semFlag.entry.payload.refusal, false, 'sem a flag do operador, é uma resposta como outra qualquer — o kit não adivinha');

  const { ctx: c2, manifest: m2 } = frozenOpenWave({ waveId: 'W-08c2' });
  submitSlot(c2, m2, 'S01-1', exec);
  const comFlag = importCapture(c2, { slot_id: 'S01-1', answer_bytes: texto, capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(m2, { search_used: false }), refusal: true });
  assert.equal(comFlag.entry.payload.refusal, true);
  assert.equal(comFlag.entry.kind, 'captured', 'recusa não é failed: fica no denominador de cobertura, o reviewer adjudica');
  assert.equal(comFlag.answer_sha256, semFlag.answer_sha256, 'bytes idênticos — nada foi parafraseado');
  assert.equal(J.slotState(c2, 'S01-1').state, 'captured');
});

test('08d · MORDIDA · literal vazio é recusado; classe desconhecida fica `unknown` com o literal, não é adivinhada; http_status entra na classificação', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-08d' });
  const exec = fakeExecutor();
  submitSlot(ctx, manifest, 'S01-1', exec);
  assert.throws(() => importFailure(ctx, { slot_id: 'S01-1', literal: '' }), (e) => e.code === 'bad_input');
  assert.throws(() => markCaptureUncertain(ctx, { slot_id: 'S01-1', literal: '' }), (e) => e.code === 'bad_input');
  const r = importFailure(ctx, { slot_id: 'S01-1', literal: 'Something went wrong.' });
  assert.equal(r.class, 'unknown');
  assert.equal(r.entry.payload.literal, 'Something went wrong.');
  const { ctx: c2, manifest: m2, clk } = frozenOpenWave({ waveId: 'W-08d2' });
  submitSlot(c2, m2, 'S02-1', exec);
  const r2 = importFailure(c2, { slot_id: 'S02-1', literal: 'Something went wrong.', http_status: 429 });
  assert.equal(r2.class, 'rate_limited', '429 sem texto de quota é ritmo (provider-health.js:207)');
  assert.equal(r2.pause.kind, 'wave.throttled');
  assert.equal(r2.pause.payload.basis, 'provider-health CAUSAS.rate_limited.recuperaEmMs', 'sem literal de reset, a base é o fallback da taxonomia — e diz que é');
  assert.equal(Date.parse(r2.pause.payload.next_action_at) - clk.t, 60_000);
  assert.deepEqual(kindsDe(c2, 'S02-1').slice(-1), ['failed']);
});
