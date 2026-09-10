/**
 * pack.test.mjs — o bundle e reproduzivel, minimo, e recusa deixar de ser um launcher.
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { empacotar, verificar, FICHEIROS } from './pack-mcpb.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

test('o bundle e REPRODUZIVEL — dois empacotamentos dao o mesmo sha256', () => {
  const a = crypto.createHash('sha256').update(empacotar()).digest('hex');
  const b = crypto.createHash('sha256').update(empacotar()).digest('hex');
  assert.equal(a, b, 'dois builds do mesmo commit dao hashes diferentes: a assinatura deixa de identificar');
});

test('o bundle tem DOIS ficheiros e nada mais', () => {
  assert.deepEqual(FICHEIROS.map((f) => f[1]).sort(), ['index.js', 'manifest.json']);
});

test('nem testes nem package.json entram no bundle', () => {
  const zip = empacotar().toString('latin1');
  for (const proibido of ['launcher.test.js', 'pack-mcpb.mjs', 'pack.test.mjs', 'package.json']) {
    assert.ok(!zip.includes(proibido), `${proibido} entrou no bundle`);
  }
});

test('o zip abre com o `unzip` do sistema e traz os dois ficheiros', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpb-'));
  try {
    const f = path.join(dir, 'a.mcpb');
    fs.writeFileSync(f, empacotar());
    // A prova que interessa nao e o nosso proprio leitor concordar com o nosso
    // proprio escritor: e um descompactador que nao sabe de nos.
    const saida = execFileSync('unzip', ['-l', f], { encoding: 'utf8' });
    assert.match(saida, /manifest\.json/);
    assert.match(saida, /index\.js/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('o manifesto dentro do zip e byte-a-byte o do disco', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpb-'));
  try {
    const f = path.join(dir, 'a.mcpb');
    fs.writeFileSync(f, empacotar());
    execFileSync('unzip', ['-o', '-q', f, '-d', dir]);
    assert.equal(
      fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'),
      fs.readFileSync(path.join(AQUI, 'manifest.json'), 'utf8'),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verificar() aprova o launcher tal como esta', () => {
  assert.deepEqual(verificar(), []);
});

test('verificar() RECUSA um manifesto com o token pre-preenchido (D3.1)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpb-'));
  try {
    fs.copyFileSync(path.join(AQUI, 'index.js'), path.join(dir, 'index.js'));
    const man = JSON.parse(fs.readFileSync(path.join(AQUI, 'manifest.json'), 'utf8'));
    man.user_config.mooter_token.default = 'tok_abcdef0123456789';
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(man));
    const p = verificar(dir);
    assert.equal(p.length, 1);
    assert.match(p[0], /pre-preenche o token/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verificar() RECUSA um launcher que ganhou uma dependencia', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpb-'));
  try {
    fs.copyFileSync(path.join(AQUI, 'manifest.json'), path.join(dir, 'manifest.json'));
    const src = fs.readFileSync(path.join(AQUI, 'index.js'), 'utf8');
    fs.writeFileSync(path.join(dir, 'index.js'), src + "\nconst z = require('zod');\n");
    const p = verificar(dir);
    assert.ok(p.some((x) => /nao-builtin: zod/.test(x)), p.join(' | '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verificar() RECUSA um launcher que passou do tecto de linhas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpb-'));
  try {
    fs.copyFileSync(path.join(AQUI, 'manifest.json'), path.join(dir, 'manifest.json'));
    const src = fs.readFileSync(path.join(AQUI, 'index.js'), 'utf8');
    fs.writeFileSync(path.join(dir, 'index.js'), src + '\n//\n'.repeat(120));
    assert.ok(verificar(dir).some((x) => /tecto 200/.test(x)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
