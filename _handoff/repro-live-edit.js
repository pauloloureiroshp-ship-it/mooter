// repro-live-edit.js — diagnostico do Live Edit com a extensao REALMENTE instalada.
// Corre: node "C:\Users\Paulo Loureiro\frugal\_handoff\repro-live-edit.js"
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const extRoot = path.join(os.homedir(), '.vscode', 'extensions');
let dirs = [];
try { dirs = fs.readdirSync(extRoot).filter((d) => d.toLowerCase().includes('mooter')); }
catch (e) { console.log('Nao consegui ler', extRoot, '-', e.message); process.exit(1); }
console.log('Extensoes mooter instaladas:', dirs.length ? dirs.join(' · ') : 'NENHUMA');

const target = 'C:/Users/Paulo Loureiro/frugal-land-mp52a/landing/app/page.tsx';
console.log('Ficheiro alvo existe?', fs.existsSync(target));
console.log('Node deste teste:', process.version, '(nota: o VS Code usa o Node do Electron, pode diferir)');

for (const d of dirs) {
  const base = path.join(extRoot, d);
  let ver = 'n/d';
  try { ver = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8')).version; } catch {}
  console.log('\n=== ' + d + ' · versao ' + ver + ' ===');

  const babelDir = path.join(base, 'node_modules', '@babel', 'parser');
  console.log('1) @babel/parser embarcado?', fs.existsSync(babelDir));
  let babelVer = 'n/d';
  try { babelVer = JSON.parse(fs.readFileSync(path.join(babelDir, 'package.json'), 'utf8')).version; } catch {}
  console.log('   versao embarcada:', babelVer);

  try {
    const b = require(babelDir);
    console.log('2) require(@babel/parser): OK · tem parse?', typeof b.parse === 'function');
  } catch (e) {
    console.log('2) require(@babel/parser) FALHOU:', e.code || '', String(e.message).slice(0, 200));
  }

  try {
    const LEA = require(path.join(base, 'src', 'live-edit-ast.js'));
    const src = fs.readFileSync(target, 'utf8');
    const r = LEA.applyDeterministicEdit(
      src,
      { line: 41, col: 15, tag: 'h1' },
      { kind: 'text', value: 'Got Moooo?' }
    );
    console.log('3) applyDeterministicEdit →', JSON.stringify({
      ok: r.ok, reason: r.reason || null, detail: r.detail || null,
      kind: r.kind || null, changed: r.changed || null,
    }));
  } catch (e) {
    console.log('3) live-edit-ast FALHOU:', String(e.message).slice(0, 300));
  }
}
console.log('\nFim. Cola este output inteiro no Cowork.');
