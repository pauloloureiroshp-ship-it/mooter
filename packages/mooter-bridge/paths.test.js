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

test('T8 — o cache pode ser limpo sem partir nada', () => {
  const antes = P.canon(__dirname);
  P.limparCache();
  assert.strictEqual(P.canon(__dirname), antes);
});
