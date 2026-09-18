// 16-journal-failure.test.mjs — critério 16: falha do diário antes de persistir
// a intenção ⇒ ZERO despachos e falha visível; falha ao guardar um resultado
// bloqueia envios novos até reconciliação.
//
// Invariante (annex/acceptance-criteria-20.json #16): commitIntent LANÇA em
// falha de fs; nenhum evento parcial deixa o slot «pronto»; depois de uma
// falha de escrita o scheduler recusa novo commitIntent até reconcile.
//
// Mordida (verificada à mão no fecho do passo 1; relatório no handoff): trocar o `throw` de
// appendEvent por `return null` (never-throws, como handoff-journal.js:416)
// põe 16a e 16b vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import * as J from '../journal.mjs';
import { openedWave, clock, failingFs, fakeExecutor, operatorTriesToSend, linhas, kindsDe, intentFile, voidFiles, tmpRoot, PROMPT_HASH, MANIFEST_HASH } from './_harness.mjs';

test('16a · o diário falha ao escrever intent_committed → lança, zero envios, token anulado (nunca apagado), diário bloqueado', () => {
  const f = failingFs();
  const clk = clock();
  const { ctx } = openedWave({ clk, fsImpl: f.fs });
  const antes = linhas(ctx).length;
  const exec = fakeExecutor();

  // A próxima escrita em events.jsonl (não a do token) morre com ENOSPC.
  f.on('writeSync', (p) => p.endsWith('events.jsonl'), f.err('ENOSPC', 'no space left on device'));

  const err = operatorTriesToSend(ctx, exec, 'S01-1');
  assert.ok(err instanceof J.JournalError, 'tem de lançar JournalError');
  assert.equal(err.code, 'journal_write_failed');
  assert.match(err.message, /intent_committed/);
  assert.equal(f.armed.length, 0, 'a falha programada disparou');

  assert.equal(exec.calls, 0, 'ZERO envios: o operador só cola depois de commitIntent devolver');
  assert.equal(linhas(ctx).length, antes, 'nenhuma linha nova — nem parcial');
  assert.equal(fs.existsSync(intentFile(ctx, 'S01-1')), false, 'o .intent não fica a fingir que há um envio em curso');
  assert.deepEqual(voidFiles(ctx, 'S01-1'), ['.intent.void-0001'], 'o token é RENOMEADO (prova positiva de não-envio), nunca apagado');
  assert.equal(err.details.voided && err.details.voided.why, 'append_failed');
  assert.equal(J.isBlocked(ctx), true, 'journal.blocked existe — a falha é visível a quem vier a seguir');
  assert.equal(J.slotState(ctx, 'S01-1').state, 'preflight_ok', 'o slot continua onde estava: nada de intent_committed fantasma');

  // Sem reconcile, o próximo envio é recusado ANTES de tocar no disco.
  const de_novo = operatorTriesToSend(ctx, exec, 'S01-1');
  assert.equal(de_novo && de_novo.code, 'journal_blocked');
  assert.equal(exec.calls, 0);
});

test('16b · guardar um resultado falha (fsync) → lança, bloqueia envios novos; reconcile levanta o bloqueio só com a cadeia íntegra', () => {
  const f = failingFs();
  const clk = clock();
  const { ctx } = openedWave({ clk, fsImpl: f.fs, slots: ['S01-1', 'S02-1'] });
  const exec = fakeExecutor();

  assert.equal(operatorTriesToSend(ctx, exec, 'S01-1'), null);
  assert.equal(exec.calls, 1);
  J.appendEvent(ctx, { slot_id: 'S01-1', kind: 'submitted', payload: { ts_submitted: new Date(clk.t).toISOString() } });

  // O fsync da linha `captured` morre. A linha pode ter chegado ao ficheiro
  // (page cache) — o que não pode acontecer é fingir que ficou durável.
  f.on('fsyncSync', (p) => p.endsWith('events.jsonl'), f.err('EIO', 'fsync failed'));
  assert.throws(
    () => J.appendEvent(ctx, { slot_id: 'S01-1', kind: 'captured', payload: { capture_completeness: 'full', answer_sha256: 'c'.repeat(64) } }),
    (e) => e instanceof J.JournalError && e.code === 'journal_write_failed',
  );
  assert.equal(J.isBlocked(ctx), true);

  // Bloqueado: o slot seguinte não pode receber intent, e o executor não é chamado.
  const err = operatorTriesToSend(ctx, exec, 'S02-1');
  assert.equal(err && err.code, 'journal_blocked');
  assert.equal(exec.calls, 1, 'nenhum envio novo enquanto o diário estiver bloqueado');

  // Reconciliação: a cadeia é recalculada; se bater, o bloqueio sai e fica registado.
  const r = J.reconcile(ctx, { operator_note: 'fsync EIO simulado; disco verificado' });
  assert.equal(r.chain.ok, true);
  assert.equal(r.entry.kind, 'journal.reconciled');
  assert.equal(J.isBlocked(ctx), false);
  assert.ok(r.entry.payload.blocked_reason && /fsync failed/.test(r.entry.payload.blocked_reason.reason), 'a razão do bloqueio fica no evento de reconciliação');

  // S01-1 continua em voo (a captura não foi confirmada durável… mas a linha existe: o diário é a verdade).
  const s = J.slotState(ctx, 'S01-1');
  assert.ok(['submitted', 'captured'].includes(s.state), `estado de S01-1 derivado do diário: ${s.state}`);
});

test('16c · linha rasgada (escrita parcial sem \\n) → tudo o que lê lança journal_torn; reconcile recusa reconciliar à mão', () => {
  const clk = clock();
  const { ctx } = openedWave({ clk });
  // Simula o crash a meio da escrita: bytes de uma linha sem o '\n' final.
  fs.appendFileSync(ctx.eventsPath, '{"schema":"prisma-experiment-journal/0.1","seq":99,"kind":"prepared","slot_id":"S09-1","pay');

  assert.throws(() => J.readEvents(ctx), (e) => e.code === 'journal_torn');
  const exec = fakeExecutor();
  const err = operatorTriesToSend(ctx, exec, 'S01-1');
  assert.equal(err && err.code, 'journal_torn', 'commitIntent recusa enquanto a última linha estiver rasgada');
  assert.equal(exec.calls, 0);
  assert.throws(() => J.reconcile(ctx), (e) => e.code === 'chain_broken');
  const v = J.verifyChain(ctx);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'torn_tail');
  assert.equal(v.broken_at, v.length + 1, 'a linha rasgada é a seguinte às íntegras');
});

test('16d · um byte alterado no meio parte a cadeia; verifyChain diz a linha; nada é apagado', () => {
  const clk = clock();
  const { ctx } = openedWave({ clk });
  const ls = linhas(ctx);
  assert.ok(ls.length >= 4);
  // Altera um byte do payload da 2.ª linha (wave.opened) — o deadline, por exemplo.
  const alvo = ls[1].replace('"wallclock_minutes":45', '"wallclock_minutes":46');
  assert.notEqual(alvo, ls[1], 'a fixture tem de tocar mesmo no conteúdo');
  fs.writeFileSync(ctx.eventsPath, [ls[0], alvo, ...ls.slice(2)].join('\n') + '\n');

  const v = J.verifyChain(ctx);
  assert.equal(v.ok, false);
  // A 2.ª linha ainda tem prev_hash correcto (aponta para a 1.ª); o que não bate
  // é o seu payload_hash — e a 3.ª já não aponta para os bytes novos da 2.ª.
  assert.equal(v.broken_at, 2);
  assert.equal(v.reason, 'payload_hash_mismatch');
  assert.throws(() => J.reconcile(ctx), (e) => e.code === 'chain_broken');
  assert.equal(linhas(ctx).length, ls.length, 'reconcile não apaga nem reescreve evidência');
});

test('16e · MORDIDA · o token do slot também é durável: se a escrita do .intent falhar, não há evento e não há envio', () => {
  const f = failingFs();
  const clk = clock();
  const { ctx } = openedWave({ clk, fsImpl: f.fs });
  const exec = fakeExecutor();
  f.on('fsyncSync', (p) => p.endsWith('.intent'), f.err('EIO', 'fsync .intent failed'));

  const err = operatorTriesToSend(ctx, exec, 'S01-1');
  assert.equal(err && err.code, 'intent_write_failed');
  assert.equal(exec.calls, 0);
  assert.equal(kindsDe(ctx, 'S01-1').includes('intent_committed'), false, 'sem token durável não há intent_committed');
  assert.equal(fs.existsSync(intentFile(ctx, 'S01-1')), false);
  assert.deepEqual(voidFiles(ctx, 'S01-1'), ['.intent.void-0001']);
  // O diário NÃO fica bloqueado (nada foi escrito nele): o operador pode tentar outra vez.
  assert.equal(J.isBlocked(ctx), false);
  assert.equal(operatorTriesToSend(ctx, exec, 'S01-1'), null);
  assert.equal(exec.calls, 1);
  assert.equal(J.slotState(ctx, 'S01-1').attempt_token, 'S01-1-0002', 'o 2.º token tem número próprio; o 1.º ficou anulado no disco');
});

test('16f · o root é obrigatório e fora do repo (E-2): sem default, sem prisma-data/ dentro do Mooter', () => {
  assert.throws(() => J.openJournal({ waveId: 'W-x' }), (e) => e.code === 'root_required');
  assert.throws(() => J.openJournal({ root: 'relativo/prisma-data', waveId: 'W-x' }), (e) => e.code === 'root_required');
  assert.throws(() => J.openJournal({ root: J.AQUI, waveId: 'W-x' }), (e) => e.code === 'root_inside_repo');
  const ok = J.openJournal({ root: tmpRoot(), waveId: 'W-x' });
  assert.equal(ok.waveId, 'W-x');
  assert.equal(typeof PROMPT_HASH, 'string'); assert.equal(MANIFEST_HASH.length, 64);
});
