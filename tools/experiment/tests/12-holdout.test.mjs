// 12-holdout.test.mjs — critério 12: a proibição de learning / contaminação do
// holdout APLICA-SE JÁ (PROTOCOLO 0.2 §9); só o ensaio de integração do job
// automático fica diferido. Condição C4: holdout/ é README + directório até
// haver custodiante — logo o que se prova aqui é a AUSÊNCIA de caminhos, não
// um mecanismo.
//
// Parte estática (barata, corre sempre): nenhum módulo de aprendizagem do
// motor referencia prisma-data/ ou holdout; nenhum módulo do kit lê holdout/.
// Parte dinâmica: um holdout/ presente no root é invisível ao closeout; uma
// observação sobre R01 é recusada; o learner do motor não tem sequer o
// conceito de onda.
//
// Mordida (verificada à mão no fecho do passo 4; relatório no handoff):
// acrescentar `readdirSync(path.join(ctx.root, 'holdout'))` a qualquer módulo
// do kit, ou listar holdout/ nos artefactos, põe 12a/12c vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as J from '../journal.mjs';
import { REPO_ROOT } from '../pins.mjs';
import { appendScore } from '../scores.mjs';
import { closeoutWave, artifactsAndHashes } from '../closeout.mjs';
import { frozenOpenWave, driveSlot, HUMAN_OK, MIN } from './_harness.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(p, 'utf8');

test('12a · estático: os módulos de aprendizagem do motor (pastor-tune, backtest, update-router, bandit, adaptive-learner) não referenciam prisma-data nem holdout', () => {
  const candidatos = [
    'tools/router/pastor-tune.js', 'tools/router/backtest.js', 'tools/router/update-router.js',
    'packages/validation/src/bandit/bandit.ts', 'packages/validation/src/bandit/reward-fn.ts',
    'packages/router/src/adaptive-learner.ts', 'packages/router/src/decide-agent.ts',
  ].map((r) => path.join(REPO_ROOT, r)).filter((p) => fs.existsSync(p));
  assert.ok(candidatos.length >= 5, `esperava ≥5 módulos de aprendizagem no repo, encontrei ${candidatos.length}`);
  for (const p of candidatos) {
    const src = read(p);
    // «holdout» sozinho não chega: backtest.js tem o seu próprio --holdout (uma fatia do
    // decisions.log para o benchmark de routing). O que interessa é o CAMINHO dos dados do experimento.
    assert.equal(/prisma-data|prisma\/waves|scores\.jsonl|holdout\/|R0[12]\.json/i.test(src), false, `${path.relative(REPO_ROOT, p)} referencia dados do experimento`);
  }
});

test('12b · estático: nenhum módulo do kit lê holdout/ — a única menção é o README; e nenhum importa o motor além dos dois pinados + pricing (proveniência)', () => {
  const mods = fs.readdirSync(KIT).filter((f) => f.endsWith('.mjs'));
  assert.ok(mods.length >= 8, `kit tem ${mods.length} módulos`);
  for (const f of mods) {
    const src = read(path.join(KIT, f));
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); // sem comentários: os cabeçalhos citam o motor de propósito
    // O que se proíbe é LER: holdout como caminho numa chamada de fs/path. Uma mensagem de erro
    // que diz «o holdout não passa por aqui» (scores.mjs) é exactamente a regra a falar.
    assert.equal(/(readFileSync|readdirSync|existsSync|openSync|statSync|join|resolve)\([^)]*holdout/i.test(code), false, `${f} lê/percorre um caminho holdout`);
    assert.equal(/['"`][^'"`]*holdout\/[^'"`]*['"`]/i.test(code), false, `${f} tem um caminho literal holdout/`);
    const requires = [...code.matchAll(/require\('\.\.\/router\/([^']+)'\)/g)].map((m) => m[1]);
    for (const r of requires) assert.ok(['ledger-prov.js', 'provider-health.js', 'pricing.js'].includes(r), `${f} importa ../router/${r} — fora da lista permitida`);
    assert.equal(/classify\.js|providers\/|packages\/workflow|quota-tracker/.test(code), false, `${f} toca o caminho do motor que o respondente não pode ver`);
  }
  const readme = read(path.join(KIT, 'holdout', 'README.md'));
  assert.match(readme, /Sem custódia, não executar/);
  assert.match(readme, /learning\.automatic_learning_in_cycle = false/);
  assert.equal(fs.existsSync(path.join(KIT, 'holdout.mjs')), false, 'C4: sem holdout.mjs até haver custodiante');
});

test('12c · dinâmico: um holdout/ presente no root (com R01/R02) é invisível ao closeout e aos artefactos; uma observação sobre R01-1 é recusada', () => {
  const { ctx, manifest, clk, root } = frozenOpenWave({ waveId: 'W-12c' });
  fs.mkdirSync(path.join(root, 'holdout'), { recursive: true });
  fs.writeFileSync(path.join(root, 'holdout', 'R01.json'), JSON.stringify({ id: 'R01', text: 'PERGUNTA RESERVADA SINTÉTICA — nunca lida pelo kit', sealed_at: null }));
  fs.writeFileSync(path.join(root, 'holdout', 'custody.json'), JSON.stringify({ custodian_id: null, released_at: null }));
  driveSlot(ctx, manifest, 'S01-1', { to: 'captured' });
  assert.throws(() => appendScore(ctx, { slot_id: 'R01-1', field: 'target_mentioned', value: true, source: 's', timestamp: new Date(clk.t).toISOString(), evidence_reference: {}, reviewer: 'r' }), (e) => e.code === 'score_invalid' && e.details.failures.some((f) => f.code === 'slot_unknown'));
  clk.t = Date.parse(J.waveState(ctx).closeout_at) + 1;
  const r = closeoutWave(ctx, { human: HUMAN_OK });
  const serial = JSON.stringify(r.conclusion);
  assert.equal(/holdout|R01|RESERVADA/.test(serial), false, 'a conclusão não sabe que o holdout existe');
  assert.equal(artifactsAndHashes(ctx).some((a) => /holdout/.test(a.path)), false);
  assert.equal(fs.existsSync(path.join(root, 'holdout', 'R01.json')), true, 'e o holdout fica intacto');
  assert.equal(fs.readFileSync(path.join(root, 'holdout', 'R01.json'), 'utf8').includes('nunca lida'), true);
});

test('12d · MORDIDA · o closeout não «aprende»: fechar duas ondas iguais dá conclusões com os mesmos derivados e nenhum ficheiro partilhado fora de waves/<id>/', () => {
  const a = frozenOpenWave({ waveId: 'W-12d-a' });
  const b = frozenOpenWave({ root: a.root, waveId: 'W-12d-b' });
  for (const w of [a, b]) { driveSlot(w.ctx, w.manifest, 'S01-1', { to: 'captured', answer: 'igual' }); w.clk.advance(2 * MIN); driveSlot(w.ctx, w.manifest, 'S02-1', { to: 'failed', literal: 'Something went wrong.' }); w.clk.t = Date.parse(J.waveState(w.ctx).closeout_at) + 1; }
  const ca = closeoutWave(a.ctx, { human: HUMAN_OK }).conclusion;
  const cb = closeoutWave(b.ctx, { human: HUMAN_OK }).conclusion;
  for (const k of ['planned', 'attempted', 'complete', 'failed', 'not_started', 'unknown']) assert.equal(ca[k], cb[k], k);
  const top = fs.readdirSync(a.root).sort();
  assert.deepEqual(top, ['waves'], `no root só há waves/ (sem ficheiros de estado partilhado, sem tuning): ${top.join(',')}`);
});
