// 03-claim.test.mjs — critério 03: dois (aqui, quatro) workers reclamam o mesmo
// slot ⇒ no máximo um atravessa o limite de despacho.
//
// O PROTOCOLO 0.2 §9 difere o ENSAIO de execução automática; a REGRA aplica-se
// já, e a primitiva que a garante (openSync 'wx' = O_CREAT|O_EXCL, o idioma de
// packages/worktree-conductor/src/locks.ts:65) está no journal.mjs desde o
// passo 1. Provar que morde é barato: N processos, uma corrida determinística.
//
// Mordida (verificada à mão no fecho do passo 1; relatório no handoff): trocar 'wx' por 'w' em commitIntent deixa os
// N processos todos com token e o diário com N intent_committed → 03a vermelho.
// Só tirar o existsSync NÃO altera o resultado (é o 'wx' que decide).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import * as J from '../journal.mjs';
import { openedWave, clock, tmpRoot, kindsDe, intentFile, PROMPT_HASH, MANIFEST_HASH, T0, MIN } from './_harness.mjs';
import fs from 'node:fs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CHILD = path.join(AQUI, '_claim-child.mjs');

function correrFilho(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CHILD, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (status) => {
      let parsed = null;
      try { parsed = JSON.parse(out.trim().split('\n').pop()); } catch { /* fica null */ }
      resolve({ status, parsed, err: err.slice(0, 300) });
    });
  });
}

test('03a · 4 processos reclamam o mesmo slot ao mesmo tempo: exactamente 1 token, exactamente 1 intent_committed, os outros attempt_token_exists', async () => {
  const root = tmpRoot();
  const { ctx } = openedWave({ root, waveId: 'W-03', clk: clock(), slots: ['S01-1'] });
  const N = 4;
  const args = [root, 'W-03', 'S01-1', '400', PROMPT_HASH, MANIFEST_HASH, String(T0 + 2 * MIN)];
  const resultados = await Promise.all(Array.from({ length: N }, () => correrFilho(args)));

  for (const r of resultados) assert.ok(r.parsed, `o filho tem de responder JSON; stderr: ${r.err}`);
  const ok = resultados.filter((r) => r.parsed.ok);
  const recusados = resultados.filter((r) => !r.parsed.ok);
  assert.equal(ok.length, 1, `exactamente UM processo passa: ${JSON.stringify(resultados.map((r) => r.parsed))}`);
  assert.equal(recusados.length, N - 1);
  for (const r of recusados) assert.equal(r.parsed.code, 'attempt_token_exists', JSON.stringify(r.parsed));

  const intents = kindsDe(ctx, 'S01-1').filter((k) => k === 'intent_committed');
  assert.equal(intents.length, 1, 'o diário tem UM intent_committed — o «wx» decidiu antes de qualquer escrita no diário');
  assert.equal(J.verifyChain(ctx).ok, true, 'nenhuma escrita concorrente rasgou a cadeia');
  assert.equal(JSON.parse(fs.readFileSync(intentFile(ctx, 'S01-1'), 'utf8')).attempt_token, ok[0].parsed.attempt_token);
  assert.equal(ok[0].parsed.attempt_token, 'S01-1-0001');
});

test('03b · a corrida é determinística: com o atraso a zero o resultado é o mesmo (1 token), o que mostra que não dependemos da sorte', async () => {
  const root = tmpRoot();
  const { ctx } = openedWave({ root, waveId: 'W-03b', clk: clock(), slots: ['S01-1'] });
  const resultados = await Promise.all(Array.from({ length: 3 }, () => correrFilho([root, 'W-03b', 'S01-1', '0', PROMPT_HASH, MANIFEST_HASH, String(T0 + 2 * MIN)])));
  assert.equal(resultados.filter((r) => r.parsed && r.parsed.ok).length, 1);
  assert.equal(kindsDe(ctx, 'S01-1').filter((k) => k === 'intent_committed').length, 1);
});
