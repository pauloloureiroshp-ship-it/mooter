'use strict';
/**
 * bundle.test.js — o que vai dentro do .mcpb tem de bater certo com o código.
 *
 * Duas classes de bug que já custaram uma release cada:
 *
 *  1. um ficheiro novo (`paths.js`) fica fora da lista do `pack-mcpb.mjs`.
 *     O repo tem 12 suites verdes, o bundle morre no primeiro `require` e o
 *     Cowork só sabe dizer "o servidor falhou".
 *  2. a versão está colada no código e o bump só toca no manifest. O conector
 *     diz ao host que é a 1.4.1 quando é a 1.4.2 — e deixa de ser possível
 *     responder a "é esta a build que eu instalei?".
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const PACK = fs.readFileSync(path.join(HERE, 'pack-mcpb.mjs'), 'utf8');

/** A lista de ficheiros declarada no packer, tal como ele a vê. */
function ficheirosDoBundle() {
  const bloco = PACK.slice(PACK.indexOf('const FILES = ['), PACK.indexOf('];', PACK.indexOf('const FILES = [')));
  const out = [];
  const re = /\[\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\]/g;
  let m;
  while ((m = re.exec(bloco)) !== null) out.push({ src: m[1], dest: m[2] });
  return out;
}

test('B1 — todo o require(./x.js) de um ficheiro empacotado também é empacotado', () => {
  const files = ficheirosDoBundle();
  assert.ok(files.length >= 15, 'não consegui ler a lista de ficheiros do packer');
  const dentro = new Set(files.map((f) => f.src));
  const faltam = [];
  for (const f of files) {
    if (!f.src.endsWith('.js')) continue;
    const texto = fs.readFileSync(path.join(HERE, f.src), 'utf8');
    const re = /require\(\s*['"]\.\/([\w.-]+\.js)['"]\s*\)/g;
    let m;
    while ((m = re.exec(texto)) !== null) if (!dentro.has(m[1])) faltam.push(f.src + ' -> ' + m[1]);
  }
  assert.deepStrictEqual(faltam, [], 'o bundle instalaria um conector que não arranca');
});

test('B2 — todos os ficheiros da lista existem em disco', () => {
  for (const f of ficheirosDoBundle()) {
    assert.ok(fs.existsSync(path.join(HERE, f.src)), 'falta no repo: ' + f.src);
  }
});

test('B3 — o packer recusa uma lista incompleta (a verificação existe mesmo)', () => {
  assert.ok(/verificarRequires\(FILES\)/.test(PACK),
    'a verificação de requires deixou de correr no build');
});

test('B4 — a versão anunciada vem do manifest, não de uma string colada', () => {
  const srv = fs.readFileSync(path.join(HERE, 'server-apps.js'), 'utf8');
  const linha = srv.split('\n').find((l) => l.includes('serverInfo:'));
  assert.ok(linha, 'não encontrei o serverInfo');
  assert.ok(!/version:\s*['"]\d+\.\d+/.test(linha),
    'a versão está colada no código — vai mentir ao host no próximo bump');
  assert.ok(/version:\s*VERSION/.test(linha));
});

test('B5 — manifest e lista de tools do manifest batem com as 6 públicas', () => {
  const man = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
  const tools6 = require('./tools6.js');
  const publicas = tools6.PUBLICAS.slice().sort();
  const noManifest = man.tools.map((t) => t.name).sort();
  assert.deepStrictEqual(noManifest, publicas,
    'o manifest promete portas diferentes das que o servidor abre');
});
