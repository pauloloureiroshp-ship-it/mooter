// 02-condition.test.mjs — critério 02 (controlos observáveis): contexto do
// coordenador nos bytes, ou rótulo de modelo observado ≠ pedido ⇒ bloquear;
// nunca corrigir em silêncio. Backend oculto fica null — não é identidade
// inventada (PROTOCOLO §9 «backend unknown não é identidade inventada»).
//
// No preflight isto é «não enviar». O fecho de condição APÓS a captura
// (policy_review + condition_closed quando a UI trocou de modelo a meio) é do
// importador — passo 3.
//
// Mordida (verificada à mão no fecho do passo 2; relatório no handoff):
// saltar o canário, ou normalizar rótulos antes de comparar, põe 02a/02b
// vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as J from '../journal.mjs';
import { preflight, HIDDEN_CHARS } from '../preflight.mjs';
import { frozenOpenWave, primaryManifest, observedFor, bytesOf, capabilityEligible, fakeExecutor, kindsDe } from './_harness.mjs';

test('02a · canário do coordenador nos bytes → preflight_failed{coordinator_context_detected}; caracteres invisíveis → hidden_characters; zero envios', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-02a' });
  const obs = observedFor(manifest);
  const exec = fakeExecutor();
  const comCanario = Buffer.concat([bytesOf(manifest, 'S01'), Buffer.from('\n\nCANARY-COORD-7f3a: marca-alvo, rubrica, hipótese H1', 'utf8')]);

  const r = preflight(ctx, { slot_id: 'S01-1', bytes: comCanario, observed: obs });
  assert.equal(r.ok, false);
  const codes = r.reasons.map((x) => x.code);
  assert.ok(codes.includes('coordinator_context_detected'), JSON.stringify(codes));
  assert.ok(codes.includes('prompt_hash_mismatch'), 'o canário também muda o hash — duas guardas independentes');
  assert.equal(exec.calls, 0);

  // Só o marcador, em minúsculas (case-insensitive), e um zero-width escondido no meio da pergunta certa.
  const zw = Buffer.from(manifest.prompts[0].text.replace(' ', '​ '), 'utf8');
  const r2 = preflight(ctx, { slot_id: 'S02-1', bytes: zw, observed: obs });
  assert.ok(r2.reasons.some((x) => x.code === 'hidden_characters'), JSON.stringify(r2.reasons));
  assert.equal(HIDDEN_CHARS.test(manifest.prompts[0].text), false, 'a pergunta congelada não tem invisíveis');
  const lower = Buffer.from('master-prompt: ' + manifest.prompts[0].text, 'utf8');
  assert.ok(preflight(ctx, { slot_id: 'S02-2', bytes: lower, observed: obs }).reasons.some((x) => x.code === 'coordinator_context_detected'));
});

test('02b · rótulo observado na UI ≠ seleccionado → model_label_drift; nunca corrigido; o slot fica preflight_failed com o que se viu', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-02b' });
  const r = preflight(ctx, { slot_id: 'S01-1', bytes: bytesOf(manifest, 'S01'), observed: observedFor(manifest, { observed_model_label: 'Latest' }) });
  assert.equal(r.ok, false);
  const d = r.reasons.find((x) => x.code === 'model_label_drift');
  assert.ok(d, JSON.stringify(r.reasons));
  assert.match(d.detail, /Latest/);
  assert.equal(r.entry.payload.observed.observed_model_label, 'Latest', 'o diário guarda o rótulo observado tal como estava');
  assert.equal(r.entry.payload.observed.selected_model_label, manifest.condition_requested.selected_model_label);
  assert.deepEqual(kindsDe(ctx, 'S01-1'), ['prepared', 'preflight_failed']);

  // Outro controlo divergente: personalização ligada, ou superfície diferente.
  const r2 = preflight(ctx, { slot_id: 'S01-1', bytes: bytesOf(manifest, 'S01'), observed: observedFor(manifest, { personalization: 'on' }) });
  assert.ok(r2.reasons.some((x) => x.code === 'personalization_unobserved' || x.code === 'personalization_not_off'));
  const r3 = preflight(ctx, { slot_id: 'S01-1', bytes: bytesOf(manifest, 'S01'), observed: observedFor(manifest, { surface: 'gemini-web' }) });
  assert.ok(r3.reasons.some((x) => x.code === 'condition_mismatch' && /surface/.test(x.detail)));
});

test('02c · backend oculto: observed_plan/backend não expostos ficam null e o preflight passa; o evento não inventa identidade', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-02c' });
  const obs = observedFor(manifest, { observed_plan: null, reasoning_control: null, auto_switch: null });
  const r = preflight(ctx, { slot_id: 'S01-1', bytes: bytesOf(manifest, 'S01'), observed: obs });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.equal(r.entry.payload.observed.observed_plan, null);
  assert.equal(r.entry.payload.observed.reasoning_control, null);
  assert.equal('backend_model_version' in r.entry.payload.observed, false, 'nem sequer existe um campo backend para preencher');
  assert.equal(JSON.stringify(r.entry.payload.observed).includes('unknown_when_hidden'), false);
});

test('02d · no braço primário, um controlo ESSENCIAL não observável bloqueia (condition_unobserved); em W0 sintético só se regista', () => {
  const pm = primaryManifest('W-02d');
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-02d', manifest: pm });
  const cap = capabilityEligible();
  const semLabel = preflight(ctx, { slot_id: 'Q01-1', bytes: bytesOf(manifest, 'Q01'), observed: observedFor(manifest, { selected_model_label: null }), capability: cap });
  assert.equal(semLabel.ok, false);
  assert.ok(semLabel.reasons.some((x) => x.code === 'condition_unobserved' && /selected_model_label/.test(x.detail)), JSON.stringify(semLabel.reasons));

  const tudoOk = preflight(ctx, { slot_id: 'Q01-1', bytes: bytesOf(manifest, 'Q01'), observed: observedFor(manifest), capability: cap });
  assert.equal(tudoOk.ok, true, JSON.stringify(tudoOk.reasons));
  assert.equal(tudoOk.synthetic, false);
  assert.equal(J.slotState(ctx, 'Q01-1').state, 'preflight_ok');

  // W0 sintético: o mesmo rótulo em falta não bloqueia — fica null no evento, e o evento diz synthetic:true.
  const w0 = frozenOpenWave({ waveId: 'W-02d-w0' });
  const r0 = preflight(w0.ctx, { slot_id: 'S01-1', bytes: bytesOf(w0.manifest, 'S01'), observed: observedFor(w0.manifest, { selected_model_label: null, observed_model_label: null }) });
  assert.equal(r0.ok, true, JSON.stringify(r0.reasons));
  assert.equal(r0.synthetic, true);
  assert.equal(r0.entry.payload.observed.selected_model_label, null);
  assert.equal(r0.entry.payload.synthetic, true);
});
