/**
 * sync-cockpit.test.mjs — o canal de distribuicao que nao existia.
 *
 * Medido a 2026-08-18: nada fora de `tools/cockpit/` importa o cockpit, o
 * `/mooter-update` nao o sincroniza, e o LaunchAgent aponta direto para dentro
 * do checkout. Estes testes prendem as duas metades: o espelho tem de estar
 * completo, E tem de ser o espelho que a maquina corre.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ficheirosCanonicos, planear, espelhar, selfCheck, alvoDoLaunchAgent, destinoPadrao,
} from './sync-cockpit.mjs';

const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `moo-sync-${n}-`));

function origemFalsa() {
  const d = tmp('src');
  fs.writeFileSync(path.join(d, 'moo-runner.mjs'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(d, 'runner-core.mjs'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(d, 'runner-core.test.mjs'), 'test');
  fs.writeFileSync(path.join(d, 'leia-me.txt'), 'nao e codigo');
  return d;
}

test('os testes NAO viajam para o runtime', () => {
  const nomes = ficheirosCanonicos(origemFalsa()).map((f) => path.basename(f.abs));
  assert.deepEqual(nomes, ['moo-runner.mjs', 'runner-core.mjs'],
    'testes sao a prova de que o codigo esta bem, nao parte do que corre');
});

test('espelhar e idempotente e nunca apaga', () => {
  const src = origemFalsa();
  const dest = tmp('dest');
  const shell = path.join(src, 'nao-existe.html');
  assert.equal(espelhar(planear(src, dest, shell)).length, 2, 'primeira vez copia tudo');
  assert.equal(espelhar(planear(src, dest, shell)).length, 0, 'segunda vez nao mexe em nada');

  fs.writeFileSync(path.join(src, 'moo-runner.mjs'), 'export const a = 99;\n');
  const seg = espelhar(planear(src, dest, shell));
  assert.equal(seg.length, 1, 'so o que mudou volta a viajar');
  assert.ok(fs.existsSync(path.join(dest, 'runner', 'moo-runner.mjs.bak')),
    'um espelho nunca pode ser a unica copia');

  fs.writeFileSync(path.join(dest, 'runner', 'extra-do-utilizador.mjs'), 'meu');
  espelhar(planear(src, dest, shell));
  assert.ok(fs.existsSync(path.join(dest, 'runner', 'extra-do-utilizador.mjs')), 'aditivo: nunca apaga');
});

test('--dry-run nao escreve uma unica linha', () => {
  const src = origemFalsa();
  const dest = tmp('dry');
  espelhar(planear(src, dest, path.join(src, 'x.html')), { dryRun: true });
  assert.equal(fs.existsSync(path.join(dest, 'runner')), false);
});

test('ACEITACAO: um espelho perfeito que ninguem corre NAO passa no self-check', () => {
  // Foi assim que o acumulador morreu 63 sessoes em silencio: o espelho dos
  // hooks estava impecavel e o settings.json apontava para outro sitio.
  const src = origemFalsa();
  const dest = tmp('d1');
  espelhar(planear(src, dest, path.join(src, 'x.html')));
  const home = tmp('home');
  fs.mkdirSync(path.join(home, 'Library', 'LaunchAgents'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'Library', 'LaunchAgents', 'ai.mooter.runner.plist'),
    '<plist><array><string>/usr/bin/node</string><string>/Users/x/frugal/tools/cockpit/runner/moo-runner.mjs</string></array></plist>',
  );

  const r = selfCheck({ origem: src, dest, shell: path.join(src, 'x.html'), home });
  assert.deepEqual(r.emFalta, [], 'o espelho esta completo');
  assert.equal(r.ok, false, 'e mesmo assim NAO passa — porque a maquina corre outra copia');
  assert.match(r.avisos.join(' '), /nao o espelho/);
});

test('self-check passa quando o espelho esta completo E e o que a maquina corre', () => {
  const src = origemFalsa();
  const dest = tmp('d2');
  espelhar(planear(src, dest, path.join(src, 'x.html')));
  const home = tmp('home2');
  fs.mkdirSync(path.join(home, 'Library', 'LaunchAgents'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'Library', 'LaunchAgents', 'ai.mooter.runner.plist'),
    `<plist><array><string>${path.join(dest, 'runner', 'moo-runner.mjs')}</string></array></plist>`,
  );
  const r = selfCheck({ origem: src, dest, shell: path.join(src, 'x.html'), home });
  assert.equal(r.ok, true, JSON.stringify(r.avisos));
});

test('sem LaunchAgent nenhum, o self-check diz que nada corre o espelho', () => {
  const src = origemFalsa();
  const dest = tmp('d3');
  espelhar(planear(src, dest, path.join(src, 'x.html')));
  const r = selfCheck({ origem: src, dest, shell: path.join(src, 'x.html'), home: tmp('vazio') });
  assert.equal(r.ok, false);
  assert.match(r.avisos.join(' '), /nada o corre/);
  assert.equal(alvoDoLaunchAgent(tmp('vazio2')).ausente, true);
});

test('o destino fica ao lado do espelho do router que ja existe', () => {
  assert.equal(destinoPadrao('/h'), path.join('/h', '.claude', 'tools', 'cockpit'));
});
