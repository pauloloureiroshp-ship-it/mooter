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
import { closeoutWave, auditClosed, integrityReport, artifactsAndHashes, buildConclusion, checkConclusion, loadAmendments, externalReviewState, externalReviewDetail, isBareNd, CloseoutError, SEMANTICS_VERSION, EXTERNAL_REVIEW_STATES, CLOSEOUT_REQUIRED } from '../closeout.mjs';
import { frozenOpenWave, driveSlot, HUMAN_OK, MIN, tmpRoot } from './_harness.mjs';

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

test('10d · MORDIDA · a conclusão fixa semantics_version 0.3-proposed; external_review DERIVA do registo de emendas (AMENDMENT-001 ⇒ corrections_applied_pending_confirmation); amendments lista o ficheiro com sha256 — mudar a semântica é uma AMENDMENT datada, não uma edição', () => {
  const { closed } = closedWave('W-10d');
  assert.equal(SEMANTICS_VERSION, '0.3-proposed');
  assert.equal(closed.conclusion.semantics_version, '0.3-proposed');
  assert.equal(closed.conclusion.external_review, 'corrections_applied_pending_confirmation');
  const am = closed.conclusion.amendments;
  assert.equal(am.length, 1);
  assert.equal(am[0].id, 'AMENDMENT-001'); assert.equal(am[0].date, '2026-09-17'); assert.equal(am[0].file, 'amendments/AMENDMENT-001.json');
  assert.match(am[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(am[0].source_sha256, '794045bee008c303c0422c49cc4040afda4eac38df4fb6963c3f707cf19c416f', 'o sha do AMENDMENT-001-20260916.txt que a originou');
  assert.deepEqual(am[0].items.map((i) => i.id), ['A4', 'A1', 'A2', 'A3', 'A5']);
  assert.deepEqual(am[0].items.filter((i) => i.status === 'applied').map((i) => i.commit), ['2f671ea8', 'd4bf406c', '84420bef', '3fb3ac75']);
  assert.equal(am[0].external_review_after, 'corrections_applied_pending_confirmation');
  // AMENDMENT-001b: o suplemento vive no mesmo registo (supplement_001b) e entra no alcance do estado.
  assert.equal(am[0].supplements.length, 1);
  assert.equal(am[0].supplements[0].id, 'AMENDMENT-001b'); assert.equal(am[0].supplements[0].key, 'supplement_001b'); assert.equal(am[0].supplements[0].date, '2026-09-17');
  assert.equal(am[0].supplements[0].source_sha256, '07ca1e65275d3b561af2cb1bde83f7f84575ca17be3e2ca771a3d4a15ae1dcd4', 'o sha do AMENDMENT-001b-20260917.txt');
  assert.deepEqual(am[0].supplements[0].items.map((i) => i.id), ['B1', 'B2', 'B3', 'B4']);
  assert.deepEqual(am[0].supplements[0].items.map((i) => i.commit), ['1d9d7b37', '179bddb8', '011cd546', 'ada344a9']);
  assert.equal(closed.conclusion.external_review_detail, 'corrections_applied_pending_confirmation (001+001b)');
  assert.equal(externalReviewDetail([]), 'pending');
  // Sem registo ⇒ pending; e o estado escrito à mão em desacordo com o registo é problema.
  assert.equal(externalReviewState([]), 'pending');
  assert.deepEqual(loadAmendments({ dir: tmpRoot() }), [], 'directório sem emendas: lista vazia, não erro');
  assert.deepEqual([...EXTERNAL_REVIEW_STATES], ['pending', 'corrections_applied_pending_confirmation', 'done']);
  const manual = { ...closed.conclusion, external_review: 'done' };
  assert.ok(checkConclusion(manual).problems.some((p) => /não corresponde ao registo/.test(p)));
  assert.ok(checkConclusion({ ...closed.conclusion, external_review: 'aprovado' }).problems.some((p) => /external_review ∈/.test(p)));
  // Um ficheiro de emenda inválido não passa em silêncio.
  const dir = tmpRoot();
  fs.writeFileSync(path.join(dir, 'AMENDMENT-002.json'), JSON.stringify({ id: 'AMENDMENT-002', date: '2026-09-18', items: [], semantics_version: '0.4-proposed', external_review_after: 'pending' }));
  assert.throws(() => loadAmendments({ dir }), (e) => e instanceof CloseoutError && e.code === 'amendment_invalid' && /semantics_version/.test(e.message));
  fs.writeFileSync(path.join(dir, 'AMENDMENT-002.json'), JSON.stringify({ id: 'AMENDMENT-002', date: '2026-09-18', items: [], semantics_version: '0.3-proposed', external_review_after: 'aprovado' }));
  assert.throws(() => loadAmendments({ dir }), (e) => e.code === 'amendment_invalid' && /external_review_after/.test(e.message));
  // …nem um suplemento inválido.
  fs.writeFileSync(path.join(dir, 'AMENDMENT-002.json'), JSON.stringify({ id: 'AMENDMENT-002', date: '2026-09-18', items: [], semantics_version: '0.3-proposed', external_review_after: 'pending', supplement_002b: { id: 'AMENDMENT-002b', date: '2026-09-19', items: [], external_review_after: 'confirmado' } }));
  assert.throws(() => loadAmendments({ dir }), (e) => e.code === 'amendment_invalid' && /supplement_002b/.test(e.message));
  // O estado deriva do mais recente, suplementos incluídos.
  fs.writeFileSync(path.join(dir, 'AMENDMENT-002.json'), JSON.stringify({ id: 'AMENDMENT-002', date: '2026-09-18', items: [], semantics_version: '0.3-proposed', external_review_after: 'pending', supplement_002b: { id: 'AMENDMENT-002b', date: '2026-09-19', items: [], external_review_after: 'done' } }));
  const dois = loadAmendments({ dir });
  assert.equal(externalReviewState(dois), 'done');
  assert.equal(externalReviewDetail(dois), 'done (002+002b)');
  assert.match(closed.conclusion.amendment_rule, /AMENDMENT datada/);
  assert.equal(closed.conclusion.inference_note.includes('Sem IC agregado, sem +2, sem efeito causal'), true);
  const onDisk = JSON.parse(fs.readFileSync(closed.file, 'utf8'));
  assert.equal(onDisk.integrity_sha256, closed.conclusion.integrity_sha256);
});

test('10e · A4 · completude: <<TODO>> e «n/d» nu contam como em falta; «n/d — justificação» é julgamento concluído; conclusion.completeness = concluídos / 21', () => {
  const { ctx, clk } = frozenOpenWave({ waveId: 'W-10e' });
  clk.t = Date.parse(J.waveState(ctx).closeout_at) + 1;
  assert.equal(isBareNd('n/d'), true); assert.equal(isBareNd('N/D'), true); assert.equal(isBareNd('n/d — '), true); assert.equal(isBareNd('n/d (ok)'), true, 'justificação com < 8 caracteres não conta');
  assert.equal(isBareNd('n/d — onda sintética, sem contra-evidência a registar'), false); assert.equal(isBareNd('n/d (onda sintética)'), false); assert.equal(isBareNd('há contra-evidência: …'), false); assert.equal(isBareNd(3), false);
  const nu = buildConclusion(ctx, { human: { ...HUMAN_OK, counterevidence: 'n/d', confounders: 'n/d' } });
  assert.equal(nu.completeness.required, 21);
  assert.equal(nu.completeness.required, CLOSEOUT_REQUIRED.length);
  assert.deepEqual(nu.completeness.missing, ['counterevidence', 'confounders']);
  assert.equal(nu.completeness.concluded, 19);
  const chk = checkConclusion(nu);
  assert.equal(chk.ok, false);
  assert.deepEqual(chk.todos, ['counterevidence', 'confounders']);
  assert.ok(chk.problems.some((p) => p.startsWith('counterevidence: «n/d» só com justificação')), JSON.stringify(chk.problems));
  assert.throws(() => closeoutWave(ctx, { human: { ...HUMAN_OK, confounders: 'n/d' } }), (e) => e instanceof CloseoutError && e.code === 'conclusion_incomplete');
  assert.equal(J.waveState(ctx).state, 'open', 'a recusa não fecha nada');
  const semTodo = buildConclusion(ctx, { human: { ...HUMAN_OK, reviewer: undefined } });
  assert.deepEqual(semTodo.completeness.missing, ['reviewer']);
  assert.equal(semTodo.reviewer, '<<TODO>>');
  const ok = buildConclusion(ctx, { human: HUMAN_OK });
  assert.deepEqual(ok.completeness, { required: 21, concluded: 21, missing: [], rule: ok.completeness.rule });
  assert.equal(checkConclusion(ok).ok, true);
});
