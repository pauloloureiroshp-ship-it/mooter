// 04-crash-after-intent.test.mjs — critério 04 (forma manual): crash depois de
// a intenção estar persistida e antes do ack ⇒ estado `submission_uncertain`
// na retoma; ZERO reenvios; o mesmo slot recusa um novo token.
//
// Janelas cobertas (annex/state-machine-0.3-cc.json): CW2 (intent sem
// submitted), CW3 (fornecedor aceitou, sem recibo — 1 envio através do
// reinício), CW6 (.intent órfão: o claim ficou no disco e o evento não).
//
// Mordida (verificada à mão no fecho do passo 1; relatório no handoff): fazer resume apagar o .intent, ou não marcar
// submission_uncertain, põe 04a/04b vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as J from '../journal.mjs';
import { fileURLToPath } from 'node:url';
import { importCapture, ImportError } from '../import.mjs';
import { closeoutWave } from '../closeout.mjs';
import { openedWave, clock, fakeExecutor, operatorTriesToSend, linhas, kindsDe, intentFile, voidFiles, tmpRoot, T0, MIN, PROMPT_HASH, MANIFEST_HASH, frozenOpenWave, driveSlot, observedFor, HUMAN_OK } from './_harness.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('04a · CW2/CW3: intent persistida, envio feito, crash antes do recibo → retoma marca submission_uncertain; 1 envio no total; commitIntent no mesmo slot → attempt_token_exists', () => {
  const root = tmpRoot();
  const clk = clock(T0);
  const { ctx } = openedWave({ root, waveId: 'W-04', clk, slots: ['S01-1', 'S02-1'] });
  const exec = fakeExecutor();

  assert.equal(operatorTriesToSend(ctx, exec, 'S01-1'), null);
  assert.equal(exec.calls, 1, 'o envio único, antes do crash');
  assert.deepEqual(kindsDe(ctx, 'S01-1'), ['prepared', 'preflight_ok', 'intent_committed']);
  assert.equal(fs.existsSync(intentFile(ctx, 'S01-1')), true);
  // ── crash: sem `submitted`, sem recibo. O contexto morre aqui. ──

  clk.advance(3 * MIN);
  const ctx2 = J.openJournal({ root, waveId: 'W-04', now: clk.now });
  const r = J.resume(ctx2);
  assert.deepEqual(r.marked, ['S01-1']);
  assert.equal(J.slotState(ctx2, 'S01-1').state, 'submission_uncertain');
  const ultimo = J.readEvents(ctx2).at(-1);
  assert.equal(ultimo.kind, 'submission_uncertain');
  assert.equal(ultimo.payload.reason, 'resume_without_submitted');
  assert.equal(ultimo.payload.attempt_token, 'S01-1-0001', 'a incerteza aponta para o token que a causou');
  assert.equal(exec.calls, 1, 'a retoma NÃO reenvia');

  // O operador tenta «só mais uma vez» — e é recusado pelo ficheiro, antes de qualquer efeito.
  const err = operatorTriesToSend(ctx2, exec, 'S01-1');
  assert.equal(err && err.code, 'attempt_token_exists');
  assert.equal(exec.calls, 1, 'ZERO reenvios');
  assert.equal(fs.existsSync(intentFile(ctx2, 'S01-1')), true, 'o token fica: é a prova de que houve um envio');
  assert.deepEqual(voidFiles(ctx2, 'S01-1'), [], 'não foi anulado — não há prova de não-envio');
  assert.equal(kindsDe(ctx2, 'S01-1').filter((k) => k === 'intent_committed').length, 1);

  // Só a recuperação da MESMA resposta avança este slot (import.mjs, passo 3): a transição existe.
  J.appendEvent(ctx2, { slot_id: 'S01-1', kind: 'captured', payload: { capture_completeness: 'full', recovered: true, answer_sha256: 'c'.repeat(64) } });
  assert.equal(J.slotState(ctx2, 'S01-1').state, 'captured');
  // E a onda pode continuar com o slot seguinte — o deadline é o original.
  assert.equal(operatorTriesToSend(ctx2, exec, 'S02-1'), null);
  assert.equal(exec.calls, 2);
  assert.equal(J.waveState(ctx2).deadline_at, new Date(T0 + 45 * MIN).toISOString());
});

test('04b · CW6: o claim (.intent) ficou no disco mas o evento intent_committed não → retoma marca submission_uncertain (órfão), conservador', () => {
  const root = tmpRoot();
  const clk = clock(T0);
  const { ctx } = openedWave({ root, waveId: 'W-04b', clk, slots: ['S01-1'] });
  const exec = fakeExecutor();
  // Simula o crash entre o 'wx' e o appendEvent: o ficheiro existe, o diário não sabe.
  fs.mkdirSync(path.dirname(intentFile(ctx, 'S01-1')), { recursive: true });
  fs.writeFileSync(intentFile(ctx, 'S01-1'), JSON.stringify({ attempt_token: 'S01-1-0001', slot_id: 'S01-1' }) + '\n');
  assert.deepEqual(kindsDe(ctx, 'S01-1'), ['prepared', 'preflight_ok']);

  const r = J.resume(J.openJournal({ root, waveId: 'W-04b', now: clk.now }));
  assert.deepEqual(r.marked, ['S01-1']);
  assert.deepEqual(r.orphans, [{ slot_id: 'S01-1', state: 'preflight_ok', action: 'marked_submission_uncertain' }]);
  assert.equal(J.slotState(ctx, 'S01-1').state, 'submission_uncertain');
  assert.equal(J.readEvents(ctx).at(-1).payload.reason, 'orphan_intent_file');
  assert.equal(exec.calls, 0);
  assert.equal(operatorTriesToSend(ctx, exec, 'S01-1')?.code, 'attempt_token_exists');
  assert.equal(exec.calls, 0);
  assert.equal(fs.existsSync(intentFile(ctx, 'S01-1')), true, 'o órfão não é apagado');
});

test('04c · retomar duas vezes não marca duas vezes; um .intent de um slot sem evento nenhum é reportado, não inventado', () => {
  const root = tmpRoot();
  const clk = clock(T0);
  const { ctx } = openedWave({ root, waveId: 'W-04c', clk, slots: ['S01-1'] });
  const exec = fakeExecutor();
  assert.equal(operatorTriesToSend(ctx, exec, 'S01-1'), null);
  // .intent de um slot que o diário nunca viu (ex.: pasta copiada de outra onda).
  fs.mkdirSync(path.join(ctx.rawDir, 'S99-1'), { recursive: true });
  fs.writeFileSync(intentFile(ctx, 'S99-1'), '{}\n');

  const r1 = J.resume(J.openJournal({ root, waveId: 'W-04c', now: clk.now }));
  assert.deepEqual(r1.marked, ['S01-1']);
  assert.deepEqual(r1.orphans, [{ slot_id: 'S99-1', state: null, action: 'reported_only' }]);
  const n = linhas(ctx).length;
  const r2 = J.resume(J.openJournal({ root, waveId: 'W-04c', now: clk.now }));
  assert.deepEqual(r2.marked, [], 'a 2.ª retoma não tem nada em intent_committed');
  assert.equal(linhas(ctx).length, n, 'idempotente: nenhuma linha nova');
  assert.equal(J.slotState(ctx, 'S99-1').state, null, 'não se inventa um slot');
});

test('04d · MORDIDA · as duas guardas são independentes: sem o .intent (apagado à mão) o diário ainda recusa, porque o estado é submission_uncertain', () => {
  const root = tmpRoot();
  const clk = clock(T0);
  const { ctx } = openedWave({ root, waveId: 'W-04d', clk, slots: ['S01-1'] });
  const exec = fakeExecutor();
  assert.equal(operatorTriesToSend(ctx, exec, 'S01-1'), null);
  J.resume(ctx);
  assert.equal(J.slotState(ctx, 'S01-1').state, 'submission_uncertain');
  fs.rmSync(intentFile(ctx, 'S01-1')); // alguém «limpa» o ficheiro
  const err = operatorTriesToSend(ctx, exec, 'S01-1');
  assert.equal(err && err.code, 'slot_not_ready');
  assert.equal(err.details.state, 'submission_uncertain');
  assert.equal(exec.calls, 1, 'continua sem reenvio');
  assert.equal(fs.existsSync(intentFile(ctx, 'S01-1')), false, 'a recusa não cria um token novo');
});

test('04e · known_not_submitted exige prova escrita; anula o token (renomeado) e devolve o slot à fila; um novo token tem número novo', () => {
  const root = tmpRoot();
  const clk = clock(T0);
  const { ctx } = openedWave({ root, waveId: 'W-04e', clk, slots: ['S01-1'] });
  const exec = fakeExecutor();
  J.commitIntent(ctx, { slot_id: 'S01-1', prompt_hash: PROMPT_HASH, manifest_hash: MANIFEST_HASH });
  // O operador viu o campo de texto falhar e nada sair — o D02 da onda-01.
  assert.throws(() => J.knownNotSubmitted(ctx, { slot_id: 'S01-1', proof: 'erro' }), (e) => e.code === 'proof_required');
  const k = J.knownNotSubmitted(ctx, { slot_id: 'S01-1', proof: 'o texto não entrou no campo; a conversa ficou vazia; captura de ecrã ks-01.png' });
  assert.equal(k.entry.kind, 'known_not_submitted');
  assert.equal(k.voided && path.basename(k.voided.file), '.intent.void-0001');
  assert.equal(fs.existsSync(intentFile(ctx, 'S01-1')), false);
  assert.equal(J.slotState(ctx, 'S01-1').state, 'known_not_submitted');
  assert.equal(exec.calls, 0);

  J.appendEvent(ctx, { slot_id: 'S01-1', kind: 'queued' });
  assert.equal(operatorTriesToSend(ctx, exec, 'S01-1'), null);
  assert.equal(J.slotState(ctx, 'S01-1').attempt_token, 'S01-1-0002');
  assert.deepEqual(voidFiles(ctx, 'S01-1'), ['.intent.void-0001']);
  assert.equal(exec.calls, 1, 'este é o 1.º envio real do slot — o anterior nunca saiu');
});

// ── AMENDMENT-001c · C1 (2026-09-17) · fecho do `.intent` órfão ─────────────────
// AMENDMENT-001c-20260917.txt (sha256 97e36afb…): um único caso, as cinco asserções.
// Semântica de attempted=false (texto literal do registo, supplement_001c): «ausência de
// tentativa contabilizada pelo diário — NÃO prova de não-envio».
// Mordida: (a) resume() a ignorar o .intent órfão ⇒ passo 1; (b) closeout a classificar o
// slot como not_started ⇒ passo 4; (c) commitIntent a aceitar o slot ⇒ passo 3
// (tools/experiment/mordida/morde-amend001c.mjs).

test('04f · C1 · .intent órfão (crash entre o wx e o appendEvent): resume marca submission_uncertain; importCapture recusa; commitIntent recusa e nada é reenviado; o fecho dá exactamente unknown com attempted=false; o slot fica visível, não liberta orçamento, não volta a queued', () => {
  const { ctx, manifest, clk, root } = frozenOpenWave({ waveId: 'W-04f' });
  const exec = fakeExecutor();
  // Estado inicial: S01-1 com prepared → preflight_ok; .intent no disco; NENHUM intent_committed.
  driveSlot(ctx, manifest, 'S01-1', { to: 'preflight_ok' });
  fs.mkdirSync(path.dirname(intentFile(ctx, 'S01-1')), { recursive: true });
  fs.writeFileSync(intentFile(ctx, 'S01-1'), JSON.stringify({ attempt_token: 'S01-1-0001', slot_id: 'S01-1', wave_id: 'W-04f' }) + '\n');
  assert.deepEqual(kindsDe(ctx, 'S01-1'), ['prepared', 'preflight_ok']);
  assert.equal(exec.calls, 0);

  // 1 · resume ⇒ submission_uncertain{orphan_intent_file}; relatório lista o órfão.
  clk.advance(1 * MIN);
  const r = J.resume(J.openJournal({ root, waveId: 'W-04f', now: clk.now }));
  assert.deepEqual(r.orphans, [{ slot_id: 'S01-1', state: 'preflight_ok', action: 'marked_submission_uncertain' }]);
  assert.deepEqual(r.marked, ['S01-1']);
  assert.equal(J.slotState(ctx, 'S01-1').state, 'submission_uncertain');
  const su = J.readEvents(ctx).filter((e) => e.slot_id === 'S01-1').at(-1);
  assert.equal(su.kind, 'submission_uncertain'); assert.equal(su.payload.reason, 'orphan_intent_file');
  assert.equal(fs.existsSync(intentFile(ctx, 'S01-1')), true, 'o órfão não é apagado nem renomeado pelo resume');

  // 2 · importCapture sem recover ⇒ recusado; nenhum answer.txt.
  assert.throws(() => importCapture(ctx, { slot_id: 'S01-1', answer_bytes: Buffer.from('resposta de origem desconhecida', 'utf8'), capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: null }) }), (e) => e instanceof ImportError && e.code === 'no_intent_for_slot');
  assert.equal(fs.existsSync(path.join(ctx.rawDir, 'S01-1', 'answer.txt')), false, 'nada escrito');
  // …nem com recover: sem intent_committed no diário, a resposta não é deste slot.
  assert.throws(() => importCapture(ctx, { slot_id: 'S01-1', answer_bytes: Buffer.from('x', 'utf8'), capture_completeness: 'full', capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: null }), recover: true, note: 'inspecção manual: parecia a mesma conversa' }), (e) => e.code === 'no_intent_for_slot');

  // 3 · commitIntent ⇒ attempt_token_exists; zero despachos.
  let err = null;
  try { J.commitIntent(ctx, { slot_id: 'S01-1', prompt_hash: manifest.prompts[0].prompt_hash, manifest_hash: manifest.manifest_hash }); exec.send('S01-1'); } catch (e) { err = e; }
  assert.equal(err?.code, 'attempt_token_exists', 'o operador tenta reenviar com os hashes certos e o diário recusa');
  assert.equal(exec.calls, 0, 'nenhum reenvio');
  assert.equal(kindsDe(ctx, 'S01-1').filter((k) => k === 'intent_committed').length, 0);

  // 4 · fecho pelo operador ⇒ exactamente uma classe: unknown; identidade afirmada; attempted=false.
  clk.advance(1 * MIN);
  const before = J.waveState(ctx);
  const closed = closeoutWave(ctx, { human: HUMAN_OK, reason: 'fecho antecipado para fixar o fecho do .intent órfão (C1)' });
  const c = closed.conclusion;
  assert.match(c.wave.closing_reason, /^operator: /);
  const s = c.per_slot['S01-1'];
  assert.equal(s.outcome, 'unknown');
  assert.equal(s.rule, 'R3_submission_uncertain_without_sufficient_capture');
  assert.equal(['complete', 'partial', 'failed', 'unknown', 'not_started'].filter((o) => o === s.outcome).length, 1, 'exactamente uma classe');
  assert.equal(c.identity.planned_equals_sum, true);
  assert.equal(c.planned, c.complete + c.partial + c.failed + c.unknown + c.not_started);
  assert.deepEqual([c.planned, c.unknown, c.not_started, c.attempted], [4, 1, 3, 0]);
  assert.equal(s.attempted, false);
  assert.equal(s.intent_recorded, false, 'attempted=false porque o diário não tem intent_committed — não porque haja prova de não-envio');
  assert.equal(s.not_submitted_proven, false, 'NÃO é prova de não-envio: não há known_not_submitted');

  // 5 · documentação e limites: a semântica de attempted=false está no registo (literal) e no README; o slot fica visível
  //     no histórico; não liberta orçamento; não volta a queued.
  const registry = JSON.parse(fs.readFileSync(path.join(KIT, 'amendments', 'AMENDMENT-001.json'), 'utf8'));
  const literal = 'ausência de tentativa contabilizada pelo diário — NÃO prova de não-envio';
  assert.equal(registry.supplement_001c.attempted_false_semantics, literal);
  assert.match(fs.readFileSync(path.join(KIT, 'README.md'), 'utf8').split('**').join(''), /ausência de tentativa contabilizada pelo diário — NÃO prova de não-envio/, 'o README diz o mesmo (sem a marcação bold)');
  assert.deepEqual(s.history, ['prepared', 'preflight_ok', 'submission_uncertain'], 'submission_uncertain permanece visível');
  assert.equal(s.last_operational_kind, 'submission_uncertain');
  assert.equal(c.eligible_evaluable_denominator.coverage_per_wave, before.state === 'open' ? 4 : 4, 'posições inalteradas');
  assert.equal(c.planned, 4, 'o slot não liberta orçamento: planned não muda');
  assert.equal(c.eligible_evaluable_denominator.caps_declared.coverage_per_wave, 4);
  assert.throws(() => J.appendEvent(ctx, { slot_id: 'S01-1', kind: 'queued' }), (e) => e.code === 'bad_transition', 'não volta a queued (e a onda já fechou)');
  assert.equal(fs.existsSync(intentFile(ctx, 'S01-1')), true, 'o token continua no disco depois do fecho');
});
