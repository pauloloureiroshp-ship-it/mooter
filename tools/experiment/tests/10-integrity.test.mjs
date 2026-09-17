// 10-integrity.test.mjs — critério 10: raw/manifest adulterados ⇒ detectar por
// hash; interpretações novas supersedem, não apagam evidência; o closeout
// NUNCA reescreve nada.
//
// Reutiliza o padrão de tools/router/agent-sync-ledger.js:633/763-766
// (integrity_sha256 sobre o recibo sem o campo, verificação inversa) e a
// cadeia de hashes do journal.mjs (passo 1).
//
// Mordida (verificada à mão no fecho do passo 4; relatório no handoff): tirar
// a recomputação de sha256 dos raw/* no integrityReport, ou deixar a auditoria
// ignorar a assinatura da conclusão, põe 10a/10b vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as J from '../journal.mjs';
import { closeoutWave, auditClosed, integrityReport, artifactsAndHashes, CloseoutError, SEMANTICS_VERSION } from '../closeout.mjs';
import { frozenOpenWave, driveSlot, HUMAN_OK, MIN } from './_harness.mjs';

function closedWave(waveId) {
  const w = frozenOpenWave({ waveId });
  driveSlot(w.ctx, w.manifest, 'S01-1', { to: 'captured', answer: 'primeira resposta' });
  w.clk.advance(2 * MIN);
  driveSlot(w.ctx, w.manifest, 'S02-1', { to: 'captured', answer: 'segunda resposta' });
  w.clk.t = Date.parse(J.waveState(w.ctx).closeout_at) + 1;
  const r = closeoutWave(w.ctx, { human: HUMAN_OK });
  return { ...w, closed: r };
}

test('10a · onda fechada; 1 byte em raw/S02-1/answer.txt e 1 byte em manifest.json → auditClosed lista MISMATCH e o slot; conclusion.json intacto, nada apagado, cadeia íntegra', () => {
  const { ctx, closed } = closedWave('W-10a');
  const before = auditClosed(ctx);
  assert.equal(before.ok, true, JSON.stringify(before));
  const concBytes = fs.readFileSync(closed.file);

  fs.appendFileSync(path.join(ctx.rawDir, 'S02-1', 'answer.txt'), '!');
  const mj = path.join(ctx.dir, 'manifest.json');
  fs.writeFileSync(mj, fs.readFileSync(mj, 'utf8').replace('também neutra.', 'também neutra!'));

  const after = auditClosed(ctx);
  assert.equal(after.ok, false);
  assert.equal(after.integrity.manifest, 'MISMATCH');
  assert.deepEqual(after.integrity.raw, ['S02-1']);
  assert.ok(after.integrity.violations.some((v) => v.what === 'manifest.json' && v.kind === 'file_sha256_mismatch'));
  assert.ok(after.integrity.violations.some((v) => v.what === 'raw/S02-1/answer.txt' && v.kind === 'answer_sha256_mismatch'));
  assert.deepEqual(after.artifact_drift.map((d) => `${d.path}:${d.kind}`).sort(), ['manifest.json:changed_after_close', 'raw/S02-1/answer.txt:changed_after_close']);
  assert.equal(after.conclusion_intact, true, 'a conclusão continua assinada e igual a si própria');
  assert.equal(Buffer.compare(fs.readFileSync(closed.file), concBytes), 0, 'auditClosed não reescreve conclusion.json');
  assert.equal(after.integrity.chain.ok, true, 'o diário não foi tocado');
  assert.equal(fs.existsSync(path.join(ctx.rawDir, 'S02-1', 'answer.txt')), true, 'nada é apagado — o adulterado fica, listado');
  assert.throws(() => closeoutWave(ctx, { human: HUMAN_OK }), (e) => e instanceof CloseoutError && e.code === 'already_closed', 'não se «refecha» por cima');
});

test('10b · adulterar o próprio conclusion.json parte a assinatura; adulterar uma linha do diário parte a cadeia e a fotografia do diário na conclusão', () => {
  const { ctx, closed } = closedWave('W-10b');
  const original = fs.readFileSync(closed.file, 'utf8');
  fs.writeFileSync(closed.file, original.replace('"complete": 2', '"complete": 3'));
  const a = auditClosed(ctx);
  assert.equal(a.conclusion_intact, false, 'integrity_sha256 já não bate');
  assert.equal(a.journal_matches, false, 'e o wave.closed guarda o sha do ficheiro original');
  fs.writeFileSync(closed.file, original);
  assert.equal(auditClosed(ctx).ok, true);

  const lines = fs.readFileSync(ctx.eventsPath, 'utf8').split('\n').filter(Boolean);
  const idx = lines.findIndex((l) => JSON.parse(l).kind === 'captured');
  lines[idx] = lines[idx].replace('"capture_completeness":"full"', '"capture_completeness":"partial"');
  fs.writeFileSync(ctx.eventsPath, lines.join('\n') + '\n');
  const b = auditClosed(ctx);
  assert.equal(b.ok, false);
  assert.equal(b.integrity.chain.ok, false);
  assert.equal(b.integrity.chain.broken_at, idx + 1, 'a cadeia diz a linha');
  assert.equal(b.journal_intact, false);
  assert.equal(b.conclusion_intact, true, 'a conclusão em si não mudou — é o diário que já não a suporta');
});

test('10c · integrityReport numa onda ABERTA também vê: parcial renomeado tem hash, manifesto verificado 3×, cadeia; artifactsAndHashes exclui só conclusion/temporários/events.jsonl', () => {
  const { ctx, manifest, clk } = frozenOpenWave({ waveId: 'W-10c' });
  driveSlot(ctx, manifest, 'S01-1', { to: 'capture_uncertain', answer: 'parcial…' });
  clk.advance(1 * MIN);
  const rep = integrityReport(ctx);
  assert.equal(rep.ok, true, JSON.stringify(rep.violations));
  assert.equal(rep.manifest.file_sha256_ok, true);
  assert.equal(rep.manifest.manifest_hash_ok, true);
  assert.equal(rep.manifest.journal_hash_ok, true);
  const arts = artifactsAndHashes(ctx);
  const paths = arts.map((a) => a.path);
  assert.ok(paths.includes('manifest.json') && paths.includes('manifest.sha256') && paths.includes('raw/S01-1/.intent') && paths.includes('raw/S01-1/answer.txt'));
  assert.equal(paths.includes('events.jsonl'), false, 'o diário é guardado pela cadeia + fotografia, não por hash de ficheiro (muda ao fechar)');
  for (const a of arts) assert.match(a.sha256, /^[0-9a-f]{64}$/);
});

test('10d · MORDIDA · a conclusão fixa semantics_version 0.3-proposed e external_review pending; e amendments começa vazio — mudar a semântica é uma AMENDMENT datada, não uma edição', () => {
  const { closed } = closedWave('W-10d');
  assert.equal(SEMANTICS_VERSION, '0.3-proposed');
  assert.equal(closed.conclusion.semantics_version, '0.3-proposed');
  assert.equal(closed.conclusion.external_review, 'pending');
  assert.deepEqual(closed.conclusion.amendments, []);
  assert.match(closed.conclusion.amendment_rule, /AMENDMENT datada/);
  assert.equal(closed.conclusion.inference_note.includes('Sem IC agregado, sem +2, sem efeito causal'), true);
  const onDisk = JSON.parse(fs.readFileSync(closed.file, 'utf8'));
  assert.equal(onDisk.integrity_sha256, closed.conclusion.integrity_sha256);
});
