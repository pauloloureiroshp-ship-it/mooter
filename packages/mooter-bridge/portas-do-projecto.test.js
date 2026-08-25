'use strict';
/**
 * ⚠️ Cada teste falha contra a versão anterior — onde este módulo não existia e
 * a lista de portas era fixa. O caso que interessa é o REAL: `landing` corre em
 * 7819 e `dashboard` em 7820, e nenhuma das duas está nas 14 da indústria.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const p = require('./portas-do-projecto.js');

let ok = 0, mau = 0;
function teste(nome, fn) {
  try { fn(); ok++; console.log('  ok   ' + nome); }
  catch (e) { mau++; console.log('  FALHA ' + nome + '\n       ' + e.message); }
}

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-portas-'));
fs.writeFileSync(path.join(raiz, 'package.json'), JSON.stringify({ scripts: {
  'handoff:qa': 'node tools/x.js', 'test': 'node --test' } }));
fs.mkdirSync(path.join(raiz, 'landing'));
fs.writeFileSync(path.join(raiz, 'landing', 'package.json'), JSON.stringify({ scripts: {
  dev: 'next dev -H 127.0.0.1 -p 7819', build: 'next build -p 9999', start: 'next start -H 0.0.0.0 -p 7819' } }));
fs.mkdirSync(path.join(raiz, 'dashboard'));
fs.writeFileSync(path.join(raiz, 'dashboard', 'package.json'), JSON.stringify({ scripts: {
  dev: 'next dev -H 127.0.0.1 -p 7820' } }));
fs.mkdirSync(path.join(raiz, 'node_modules'));
fs.mkdirSync(path.join(raiz, 'node_modules', 'lixo'));
fs.writeFileSync(path.join(raiz, 'node_modules', 'lixo', 'package.json'), JSON.stringify({ scripts: {
  dev: 'vite --port 1234' } }));

console.log('\nportas-do-projecto.js\n');

teste('Q1 · encontra a 7819 do landing e a 7820 do dashboard (nenhuma nas 14 da lista fixa)', () => {
  const r = p.portasDoProjecto(raiz);
  assert.ok(r.portas.includes(7819), 'portas: ' + JSON.stringify(r.portas));
  assert.ok(r.portas.includes(7820), 'portas: ' + JSON.stringify(r.portas));
});

teste('Q2 · cada porta traz o ficheiro e o script onde foi declarada', () => {
  const d = p.portasDoProjecto(raiz).detalhe.find((x) => x.porta === 7819);
  assert.strictEqual(d.onde, 'landing/package.json');
  assert.ok(/^(dev|start)$/.test(d.script), 'script: ' + d.script);
  assert.strictEqual(d.como, '-p');
});

teste('Q3 · `build` NAO conta — build nao serve nada', () => {
  assert.ok(!p.portasDoProjecto(raiz).portas.includes(9999),
    'a porta do build entrou na lista de sondagem');
});

teste('Q4 · node_modules e ignorado', () => {
  assert.ok(!p.portasDoProjecto(raiz).portas.includes(1234),
    'sondar portas declaradas por dependencias e ruido garantido');
});

teste('Q5 · as quatro formas de declarar uma porta', () => {
  const f = (cmd) => p.portasDeUmScript('dev', cmd).map((x) => x.porta);
  assert.deepStrictEqual(f('next dev -p 7819'), [7819]);
  assert.deepStrictEqual(f('vite --port 5174'), [5174]);
  assert.deepStrictEqual(f('astro dev --port=4321'), [4321]);
  assert.deepStrictEqual(f('PORT=4000 node server.js'), [4000]);
  assert.deepStrictEqual(f('next build'), [], 'sem porta nao inventa nenhuma');
});

teste('Q6 · sem package.json nenhum, diz isso — nao devolve lista vazia muda', () => {
  const vazia = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-vazia-'));
  const r = p.portasDoProjecto(vazia);
  assert.deepStrictEqual(r.portas, []);
  assert.match(r.porque, /não encontrei nenhum package.json/);
  assert.strictEqual(r.procurado, 0);
});

teste('Q7 · com package.json mas sem portas, o motivo e OUTRO', () => {
  const so = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-so-'));
  fs.writeFileSync(path.join(so, 'package.json'), JSON.stringify({ scripts: { dev: 'node index.js' } }));
  const r = p.portasDoProjecto(so);
  assert.match(r.porque, /nenhum script de arranque declara uma porta/,
    'os dois casos pedem accoes diferentes e nao se podem confundir: ' + r.porque);
  assert.strictEqual(r.procurado, 1);
});

teste('Q8 · sem raiz devolve motivo, nunca rebenta', () => {
  assert.match(p.portasDoProjecto(null).porque, /não há pasta de sessão/);
});

teste('Q9 · raiz ilegível é n/d, nunca projecto vazio medido', () => {
  const ficheiro = path.join(raiz, 'nao-e-pasta.txt');
  fs.writeFileSync(ficheiro, 'x');
  const r = p.portasDoProjecto(ficheiro);
  assert.deepStrictEqual(r.portas, []);
  assert.strictEqual(r.procurado, null);
  assert.match(r.porque, /^n\/d — não consegui listar/);
});

console.log('\n' + ok + ' passou · ' + mau + ' falhou\n');
process.exit(mau ? 1 : 0);
