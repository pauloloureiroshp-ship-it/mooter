// 01-freeze.test.mjs — critério 01: pergunta/manifesto alterados após freeze ⇒
// bloquear o despacho ANTES de qualquer efeito externo, preservar a versão
// anterior.
//
// Contra-exemplo no motor: packages/workflow/src/state.ts:188-206 (startRun
// upsert substitui script/args no mesmo run_id). Aqui a identidade é o hash.
//
// Mordida (verificada à mão no fecho do passo 2; relatório no handoff):
// remover a comparação prompt_hash no preflight, ou a verificação do
// manifest_hash em loadFrozenManifest, põe 01b/01c vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import * as J from '../journal.mjs';
import { freezeWave, loadFrozenManifest, validateManifestInput, buildFrozen, sha256 } from '../freeze.mjs';
import { preflight } from '../preflight.mjs';
import { verifyPins } from '../pins.mjs';
import { frozenOpenWave, syntheticManifest, observedFor, bytesOf, fakeExecutor, tmpRoot, clock, linhas, kindsDe } from './_harness.mjs';

const { provHash } = createRequire(import.meta.url)('../../router/ledger-prov.js');

test('01a · freeze escreve manifest.json + manifest.sha256; prompt_hash = sha256 dos bytes; manifest_hash recalculável; wave.frozen é o 1.º evento; repetir é idempotente', () => {
  const root = tmpRoot();
  const clk = clock();
  const ctx = J.openJournal({ root, waveId: 'W-01a', now: clk.now });
  const input = syntheticManifest('W-01a');
  const f = freezeWave(ctx, { manifest: input });

  assert.equal(f.idempotent, false);
  assert.equal(f.entry.kind, 'wave.frozen');
  assert.equal(f.entry.seq, 0, 'wave.frozen é o primeiro evento');
  for (const p of f.manifest.prompts) assert.equal(p.prompt_hash, sha256(Buffer.from(p.text, 'utf8')));
  assert.deepEqual(f.manifest.slots.map((s) => s.slot_id), ['S01-1', 'S02-1', 'S02-2', 'S01-2'], 'slots derivados da ordem, sem relógio');
  assert.match(f.manifest_hash, /^[0-9a-f]{64}$/);
  assert.equal(f.manifest.engine_pins.files['tools/router/ledger-prov.js'], verifyPins().checked.find((c) => c.path.endsWith('ledger-prov.js')).actual, 'os pins do motor ficam DENTRO do manifesto (C3)');

  const onDisk = JSON.parse(fs.readFileSync(path.join(ctx.dir, 'manifest.json'), 'utf8'));
  assert.equal(onDisk.manifest_hash, f.manifest_hash);
  const shaLine = fs.readFileSync(path.join(ctx.dir, 'manifest.sha256'), 'utf8');
  assert.equal(shaLine.split(/\s+/)[0], sha256(fs.readFileSync(path.join(ctx.dir, 'manifest.json'))));
  assert.equal(loadFrozenManifest(ctx).manifest_hash, f.manifest_hash);

  const n = linhas(ctx).length;
  const again = freezeWave(ctx, { manifest: input });
  assert.equal(again.idempotent, true);
  assert.equal(again.manifest_hash, f.manifest_hash);
  assert.equal(linhas(ctx).length, n, 'freeze repetido do mesmo conteúdo não escreve');
});

test('01b · texto de uma pergunta alterado no manifest.json depois do freeze → loadFrozenManifest lança manifest_tampered; preflight falha e regista; zero envios; o hash congelado no diário é o original', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-01b' });
  const exec = fakeExecutor();
  const file = path.join(ctx.dir, 'manifest.json');
  const original = fs.readFileSync(file, 'utf8');
  // Um byte no texto do 2.º prompt. O sha256 do ficheiro e o manifest_hash deixam de bater.
  fs.writeFileSync(file, original.replace('também neutra.', 'também neutra!'));

  assert.throws(() => loadFrozenManifest(ctx), (e) => e.code === 'manifest_tampered');
  const r = preflight(ctx, { slot_id: 'S01-1', bytes: bytesOf(manifest, 'S01'), observed: observedFor(manifest) });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.code === 'manifest_tampered'), JSON.stringify(r.reasons));
  assert.equal(r.entry.kind, 'preflight_failed');
  assert.equal(exec.calls, 0);
  assert.throws(() => J.commitIntent(ctx, { slot_id: 'S01-1', prompt_hash: r.prompt_hash, manifest_hash: manifest.manifest_hash }), (e) => e.code === 'slot_not_ready', 'sem preflight_ok não há intent');
  assert.equal(J.waveState(ctx).manifest_hash, manifest.manifest_hash, 'o diário guarda o hash original — a versão anterior não se perde');

  // Adversário mais cuidadoso: actualiza também o manifest.sha256. Ainda cai —
  // o manifest_hash gravado já não é o provHash do conteúdo.
  const adulterado = original.replace('também neutra.', 'também neutra!');
  fs.writeFileSync(file, adulterado);
  fs.writeFileSync(path.join(ctx.dir, 'manifest.sha256'), `${sha256(Buffer.from(adulterado, 'utf8'))}  manifest.json\n`);
  assert.throws(() => loadFrozenManifest(ctx), (e) => e.code === 'manifest_tampered' && /manifest_hash gravado/.test(e.message));

  // Adversário completo: recongela o ficheiro inteiro (hash e sha coerentes entre si).
  // Só o DIÁRIO o apanha: wave.frozen tem o hash original, encadeado.
  const obj = JSON.parse(adulterado);
  obj.prompts[1].prompt_hash = sha256(Buffer.from(obj.prompts[1].text, 'utf8'));
  const { manifest_hash: _h, ...semHash } = obj;
  obj.manifest_hash = provHash(semHash);
  const recongelado = JSON.stringify(obj, null, 2) + '\n';
  fs.writeFileSync(file, recongelado);
  fs.writeFileSync(path.join(ctx.dir, 'manifest.sha256'), `${sha256(Buffer.from(recongelado, 'utf8'))}  manifest.json\n`);
  assert.throws(() => loadFrozenManifest(ctx), (e) => e.code === 'manifest_tampered' && /o diário congelou/.test(e.message));

  // Restaurar o ficheiro original volta a bater: a evidência não foi destruída, só o ficheiro editado.
  fs.writeFileSync(file, original);
  fs.writeFileSync(path.join(ctx.dir, 'manifest.sha256'), `${sha256(Buffer.from(original, 'utf8'))}  manifest.json\n`);
  assert.equal(loadFrozenManifest(ctx).manifest_hash, manifest.manifest_hash);
});

test('01c · bytes a colar diferem por UM byte da pergunta congelada → preflight_failed{prompt_hash_mismatch}; bytes iguais → preflight_ok', () => {
  const { ctx, manifest } = frozenOpenWave({ waveId: 'W-01c' });
  const obs = observedFor(manifest);
  const bons = bytesOf(manifest, 'S01');
  const maus = Buffer.concat([bons.subarray(0, bons.length - 1), Buffer.from('!')]);

  const r1 = preflight(ctx, { slot_id: 'S01-1', bytes: maus, observed: obs });
  assert.equal(r1.ok, false);
  const razao = r1.reasons.find((x) => x.code === 'prompt_hash_mismatch');
  assert.ok(razao, JSON.stringify(r1.reasons));
  assert.equal(razao.frozen, manifest.prompts[0].prompt_hash);
  assert.equal(razao.seen, sha256(maus));
  assert.deepEqual(kindsDe(ctx, 'S01-1'), ['prepared', 'preflight_failed']);

  const r2 = preflight(ctx, { slot_id: 'S01-1', bytes: bons, observed: obs });
  assert.equal(r2.ok, true, JSON.stringify(r2.reasons));
  assert.equal(r2.entry.payload.prompt_hash, manifest.prompts[0].prompt_hash);
  assert.deepEqual(kindsDe(ctx, 'S01-1'), ['prepared', 'preflight_failed', 'prepared', 'preflight_ok']);
  // Um CRLF no fim, ou um BOM no início, do texto CERTO também são bytes diferentes — o hash não perdoa.
  const s02 = bytesOf(manifest, 'S02');
  assert.equal(preflight(ctx, { slot_id: 'S02-1', bytes: Buffer.concat([s02, Buffer.from('\r\n')]), observed: obs }).reasons.map((x) => x.code).join(','), 'prompt_hash_mismatch');
  const comBom = preflight(ctx, { slot_id: 'S02-1', bytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), s02]), observed: obs });
  assert.deepEqual(comBom.reasons.map((x) => x.code).sort(), ['hidden_characters', 'prompt_hash_mismatch']);
  assert.equal(preflight(ctx, { slot_id: 'S02-1', bytes: s02, observed: obs }).ok, true);
});

test('01d · o mesmo wave_id não aceita outro conteúdo: manifest_conflict; nova condição = novo wave_id', () => {
  const root = tmpRoot();
  const clk = clock();
  const ctx = J.openJournal({ root, waveId: 'W-01d', now: clk.now });
  const input = syntheticManifest('W-01d');
  const f = freezeWave(ctx, { manifest: input });
  const outro = syntheticManifest('W-01d');
  outro.prompts[0].text += ' (v2)';
  assert.throws(() => freezeWave(ctx, { manifest: outro }), (e) => e.code === 'manifest_conflict' && e.details.existing === f.manifest_hash);
  const outroQueue = syntheticManifest('W-01d', { queue: { jitter_seed: 'outro-seed' } });
  assert.throws(() => freezeWave(ctx, { manifest: outroQueue }), (e) => e.code === 'manifest_conflict', 'o seed do jitter faz parte do que está congelado (C4)');
  assert.equal(linhas(ctx).length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(ctx.dir, 'manifest.json'), 'utf8')).manifest_hash, f.manifest_hash, 'o ficheiro não foi tocado');

  const ctx2 = J.openJournal({ root, waveId: 'W-01d-v2', now: clk.now });
  const f2 = freezeWave(ctx2, { manifest: { ...outro, wave_id: 'W-01d-v2', condition_id: 'cond-syn-v2' } });
  assert.notEqual(f2.manifest_hash, f.manifest_hash);
});

test('01e · MORDIDA · a validação da entrada recusa o que o contrato 0.3 exige: 14 chaves da condição, roles, caps, seed, manifest_hash null', () => {
  const ok = syntheticManifest('W-01e');
  assert.deepEqual(validateManifestInput(ok, { waveId: 'W-01e' }), []);
  const casos = [
    [(m) => { delete m.condition_requested.search_used; }, 'condition_key_missing'],
    [(m) => { m.condition_requested.observed_model_label = 'X'; }, 'condition_observed_only'],
    [(m) => { m.condition_requested.personalization = 'on'; }, 'condition_missing'],
    [(m) => { m.prompts[0].role = 'eligible'; }, 'bad_prompt'],
    [(m) => { m.order.push('S01'); }, 'bad_caps'],
    [(m) => { m.queue_policy.jitter_seed = ''; }, 'bad_queue_policy'],
    [(m) => { m.queue_policy.max_concurrency_total = 2; }, 'bad_queue_policy'],
    [(m) => { m.manifest_hash = 'x'; }, 'manifest_hash_must_be_null'],
    [(m) => { m.prompts[1].prompt_hash = 'f'.repeat(64); }, 'prompt_hash_mismatch'],
    [(m) => { m.wave_id = 'W-outro'; }, 'wave_id_mismatch'],
  ];
  for (const [mut, code] of casos) {
    const m = syntheticManifest('W-01e');
    mut(m);
    const f = validateManifestInput(m, { waveId: 'W-01e' });
    assert.ok(f.some((x) => x.code === code), `${code}: ${JSON.stringify(f)}`);
  }
  // buildFrozen é puro e determinístico para o mesmo (input, now, pins).
  const pins = verifyPins();
  const a = buildFrozen(ok, { now: () => 1, pins });
  const b = buildFrozen(ok, { now: () => 1, pins });
  assert.equal(a.manifest_hash, b.manifest_hash);
});
