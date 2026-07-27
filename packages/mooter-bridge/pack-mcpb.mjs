#!/usr/bin/env node
/**
 * pack-mcpb.mjs — build the .mcpb from the repo, reproducibly.
 *
 * WHY: until v1.1 the bundle that actually ran in Cowork was NOT in git. The
 * installed `server-apps.js` was 13 138 bytes; the repo's was 6 658. Two truths,
 * and the tests only covered the one nobody was running. This script makes the
 * repo the single source and prints a sha256 so the two can be compared.
 *
 * Zero dependencies: writes the ZIP container by hand (stored, no compression),
 * which every unzip and the Claude Desktop installer accept.
 *
 * Usage: node pack-mcpb.mjs [outputPath]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const OUT = process.argv[2] || path.join(HERE, '..', '..', '_handoff', `mooter-v${manifest.version.replace(/\./g, '')}.mcpb`);

// exact file list — never a glob. A stray file in a bundle is a supply-chain bug.
const FILES = [
  ['manifest.json', 'manifest.json'],
  ['icon.png', 'icon.png'],
  ['README.md', 'README.md'],
  ["server-apps.js", "server/server-apps.js"],
  ["gpu.js", "server/gpu.js"],
  ['server.js', 'server/server.js'],
  ['seamless.js', 'server/seamless.js'],
  ['fleet.js', 'server/fleet.js'],
  ['fleet-ui.html', 'server/fleet-ui.html'],
  ['telemetry.js', 'server/telemetry.js'],
  ['moo.js', 'server/moo.js'],
  ['plan.js', 'server/plan.js'],
  ['journal.js', 'server/journal.js'],
  ['worktrees.js', 'server/worktrees.js'],
  ['tools6.js', 'server/tools6.js'],
  ['localfirst.js', 'server/localfirst.js'],
  ['aprender.js', 'server/aprender.js'],
  ['board.js', 'server/board.js'],
  ['capacidades.js', 'server/capacidades.js'],
  ['fosso.js', 'server/fosso.js'],
  ['context.js', 'server/context.js'],
  ['paths.js', 'server/paths.js'],
  ['arvore.js', 'server/arvore.js'],
  ['probe.js', 'server/probe.js'],
  ['preview.js', 'server/preview.js'],
  ['quota.js', 'server/quota.js'],
  ['update.js', 'server/update.js'],
  ['sessao.js', 'server/sessao.js'],
  ['bundle-package.json', 'server/package.json'],
];

/**
 * ⚠️ O bundle é uma lista à mão — e uma lista à mão esquece-se.
 *
 * A v1.4.2 acrescentou `paths.js` e, se ficasse de fora, o conector instalado
 * morria no primeiro `require` com o Cowork a dizer apenas "servidor falhou".
 * Em vez de confiar na memória, lemos os `require('./x.js')` de cada ficheiro
 * que vai no bundle e exigimos que todos estejam na lista. Falha o build, não
 * a máquina do utilizador.
 */
/**
 * ⚠️ Um comentário que MENCIONE um require não é um require.
 *
 * O detector varria o texto cru e apanhou `// todos os require('./x.js') têm de
 * existir` — uma frase de documentação — e recusou o build inteiro por causa de
 * um ficheiro `x.js` que nunca existiu. Um guarda que dá falsos positivos acaba
 * por ser desligado, e um guarda desligado não guarda nada.
 */
function semComentarios(texto) {
  return String(texto)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // blocos
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // linha (sem apanhar http://)
}

function verificarRequires(files) {
  const dentro = new Set(files.map(([src]) => src));
  const faltam = [];
  for (const [src] of files) {
    if (!src.endsWith('.js')) continue;
    const texto = semComentarios(fs.readFileSync(path.join(HERE, src), 'utf8'));
    const re = /require\(\s*['"]\.\/([\w.-]+\.js)['"]\s*\)/g;
    let m;
    while ((m = re.exec(texto)) !== null) {
      if (!dentro.has(m[1])) faltam.push(src + ' -> ' + m[1]);
    }
  }
  if (faltam.length) {
    console.error('BUNDLE INCOMPLETO — estes require ficariam sem ficheiro:');
    for (const f of faltam) console.error('  ' + f);
    process.exit(1);
  }
}
verificarRequires(FILES);

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const locals = [];
const centrals = [];
let offset = 0;

for (const [src, dest] of FILES) {
  const p = path.join(HERE, src);
  if (!fs.existsSync(p)) { console.error('FALTA: ' + src); process.exit(1); }
  const data = fs.readFileSync(p);
  const name = Buffer.from(dest, 'utf8');
  const crc = crc32(data);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
  lh.writeUInt16LE(0, 8);                    // stored
  lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x2821, 12);   // fixed timestamp = reproducible
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
  locals.push(lh, name, data);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
  ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x2821, 14);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(name.length, 28);
  ch.writeUInt32LE(offset, 42);
  centrals.push(ch, name);

  offset += lh.length + name.length + data.length;
}

const central = Buffer.concat(centrals);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(FILES.length, 8); eocd.writeUInt16LE(FILES.length, 10);
eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(offset, 16);

const zip = Buffer.concat([...locals, central, eocd]);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, zip);

console.log('mooter ' + manifest.version + '  ->  ' + OUT);
console.log('  ' + FILES.length + ' ficheiros, ' + zip.length + ' bytes');
console.log('  sha256 ' + crypto.createHash('sha256').update(zip).digest('hex'));
