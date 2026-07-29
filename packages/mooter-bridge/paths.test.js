'use strict';
/**
 * paths.test.js — o bug de caminhos do Windows não volta.
 *
 * O teste que interessa é o T3: uma pasta criada com `fs.mkdtempSync` TEM de
 * ser reconhecida como estando dentro de `os.tmpdir()`. Parece tautológico —
 * e em Linux é. Em Windows não era: `os.tmpdir()` devolve a forma 8.3
 * (`C:\Users\PAULOL~1\...`) e o caminho real resolve para a forma longa
 * (`C:\Users\Paulo Loureiro\...`). Três suites falhavam por causa disto, e o
 * guard recusava worktrees legítimas com "worktree fora da raiz permitida".
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('./paths.js');

test('T1 — canon é estável e idempotente', () => {
  const a = P.canon(__dirname);
  assert.strictEqual(a, P.canon(a));
  assert.strictEqual(P.canon(''), '');
  assert.strictEqual(P.canon(null), '');
});

test('T2 — mesmo() vê através de ./ e de barras a mais', () => {
  assert.ok(P.mesmo(__dirname, path.join(__dirname, '.')));
  assert.ok(P.mesmo(__dirname, path.join(__dirname, 'x', '..')));
  assert.ok(!P.mesmo(__dirname, path.dirname(__dirname)));
});

test('T3 — REGRESSÃO: mkdtemp é reconhecido dentro de os.tmpdir()', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-paths-'));
  try {
    assert.ok(P.dentroDe(d, os.tmpdir()),
      'o temp real não foi reconhecido como temp — é este o bug do 8.3');
    assert.ok(P.dentroDe(path.join(d, 'sub', 'f.js'), os.tmpdir()));
  } finally {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ }
  }
});

test('T4 — dentroDe não se deixa enganar por prefixo sem separador', () => {
  const base = path.join(os.tmpdir(), 'mooter-abc');
  const irmao = path.join(os.tmpdir(), 'mooter-abcdef');
  assert.ok(!P.dentroDe(irmao, base), 'irmão com prefixo comum passou por filho');
  assert.ok(P.dentroDe(base, base), 'a própria pasta conta como dentro');
});

test('T5 — traversal continua bloqueado', () => {
  const raiz = __dirname;
  assert.ok(!P.dentroDe(path.resolve(raiz, '..', '..', '.ssh', 'id_rsa'), raiz));
  assert.ok(P.dentroDe(path.resolve(raiz, 'paths.js'), raiz));
});

test('T6 — chave() é tolerante onde canon() é estrito', () => {
  // caminhos que NÃO existem, vindos de ficheiros escritos por outro processo
  const a = 'C:\\Users\\P\\frugal-w2';
  const b = 'c:/users/p/frugal-w2/';
  assert.strictEqual(P.chave(a), P.chave(b), 'as duas grafias têm de dar a mesma chave');
  assert.notStrictEqual(P.chave('C:\\Users\\P\\outra'), P.chave(a));
});

test('T7 — chave() não colapsa pastas diferentes', () => {
  assert.notStrictEqual(P.chave(__dirname), P.chave(path.dirname(__dirname)));
});

/**
 * ⚠️ T9 — a falha que o gate no Windows apanhou, reproduzida de forma portátil.
 *
 * `fs.realpathSync.native()` só resolve caminhos que EXISTEM. A primeira versão
 * do `canon()` caía para `path.resolve()` quando o caminho não existia — e aí a
 * grafia alternativa (8.3 no Windows, symlink em qualquer lado) ficava por
 * resolver. `dentroDe()` devolvia **false** para um ficheiro que estava lá dentro.
 *
 * Um symlink é a mesma situação e corre em qualquer sistema: duas grafias para o
 * mesmo sítio, uma delas a apontar para um ficheiro que ainda não existe.
 */
test('T9 — REGRESSÃO: caminho AINDA POR CRIAR dentro de uma pasta com outra grafia', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-link-'));
  const real = path.join(base, 'real');
  const link = path.join(base, 'atalho');
  fs.mkdirSync(real);
  let temLink = true;
  try { fs.symlinkSync(real, link, 'junction'); } catch { temLink = false; }
  try {
    if (!temLink) { console.log('  (sem permissão para symlinks — T9 saltado)'); return; }
    const porCriar = path.join(link, 'ainda', 'nao', 'existe.js');
    assert.ok(P.dentroDe(porCriar, real),
      'um ficheiro por criar dentro da pasta não foi reconhecido — é este o bug do gate');
    assert.ok(P.mesmo(link, real), 'as duas grafias da MESMA pasta não coincidiram');
    // e o traversal continua a ser traversal, mesmo por criar
    assert.ok(!P.dentroDe(path.join(link, '..', '..', 'fora.js'), real));
  } finally {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* */ }
  }
});

test('T10 — o cache não congela a resposta de um caminho que passa a existir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-cache-'));
  try {
    const novo = path.join(base, 'nasce-agora');
    const antes = P.canon(novo);          // ainda não existe
    fs.mkdirSync(novo);
    const depois = P.canon(novo);         // agora existe
    assert.ok(P.dentroDe(depois, base), 'depois de existir tem de ser reconhecido');
    assert.ok(P.dentroDe(antes, base), 'antes de existir também — senão o guard recusa o que é legítimo');
  } finally {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* */ }
  }
});

test('T8 — o cache pode ser limpo sem partir nada', () => {
  const antes = P.canon(__dirname);
  P.limparCache();
  assert.strictEqual(P.canon(__dirname), antes);
});
