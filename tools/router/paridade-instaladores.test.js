// paridade-instaladores.test.js — os três canais de distribuição têm de dizer
// o mesmo sobre o que é «o runtime» e sobre quais são os hooks ligados.
//
// ─────────────────────────────────────────────────────────────────────────────
// PORQUE ESTE FICHEIRO EXISTE
//
// A 2026-08-31 mediu-se o custo de não haver esta verificação. Havia TRÊS
// definições de runtime — `install.sh`, `install.ps1` e o Step 5 do
// `/mooter-update` — e já tinham divergido:
//
//   · os dois instaladores copiavam `providers/` explicitamente (Wave 61,
//     acrescentado precisamente porque o glob plano o perdia);
//   · o updater usava `*.js`, **não recursivo**, e por isso nunca refrescava
//     `providers/` numa máquina actualizada.
//
// Resultado: um update imprimiu cinco ✓, passou todos os gates, e deixou um
// `providers/ollama-api.js` velho — a correcção do motor $0 chegou ao repo e
// nunca chegou ao runtime. Não houve erro de `require` porque o ficheiro velho
// não requer o novo. Falhou em silêncio.
//
// A lista dos hooks ligados tem o mesmo formato de risco: existe em três sítios
// (`WIRED_HOOKS`, o `for h in` do `.sh`, o `$hookNames` do `.ps1`) e os próprios
// comentários pedem «keep this list in lockstep» — um pedido que, até aqui,
// ninguém verificava. Um pedido em prosa não é um portão.
//
// Este teste é o portão. Falha se qualquer um dos três se afastar dos outros.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');
const INSTALL_SH = path.join(RAIZ, 'install.sh');
const INSTALL_PS1 = path.join(RAIZ, 'install.ps1');

const ler = (p) => fs.readFileSync(p, 'utf8');

// ── os hooks ligados: uma lista, três cópias ─────────────────────────────

/** `for h in a.js b.js …; do` → ['a.js','b.js',…] */
function hooksDoShell(src) {
  const m = src.match(/for h in ((?:[\w.\-]+\.js\s+)*[\w.\-]+\.js);\s*do/);
  return m ? m[1].trim().split(/\s+/) : null;
}

/** `$hookNames = @('a.js','b.js',…)` → ['a.js','b.js',…] */
function hooksDoPowerShell(src) {
  const m = src.match(/\$hookNames\s*=\s*@\(([^)]*)\)/);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

test('a lista de hooks do install.sh é extraível — se o regex deixar de bater, o teste avisa', () => {
  // Sem esta guarda, um teste de paridade que deixa de encontrar as listas
  // passa a comparar `null` com `null` e fica verde a medir nada.
  const lista = hooksDoShell(ler(INSTALL_SH));
  assert.ok(Array.isArray(lista) && lista.length > 3,
    'não consegui ler o `for h in ...` do install.sh — actualiza o extractor, não apagues o teste');
});

test('a lista de hooks do install.ps1 é extraível', () => {
  const lista = hooksDoPowerShell(ler(INSTALL_PS1));
  assert.ok(Array.isArray(lista) && lista.length > 3,
    'não consegui ler o `$hookNames` do install.ps1 — actualiza o extractor, não apagues o teste');
});

test('WIRED_HOOKS · install.sh · install.ps1 nomeiam exactamente os mesmos hooks', () => {
  const { WIRED_HOOKS } = require('./sync-hooks.js');
  const canonico = [...WIRED_HOOKS].sort();
  const doSh = hooksDoShell(ler(INSTALL_SH)).sort();
  const doPs1 = hooksDoPowerShell(ler(INSTALL_PS1)).sort();

  assert.deepEqual(doSh, canonico,
    'install.sh divergiu de WIRED_HOOKS — um hook novo que só entre num dos dois nunca chega ao destino');
  assert.deepEqual(doPs1, canonico,
    'install.ps1 divergiu de WIRED_HOOKS — é o instalador do Windows, e o silêncio é o mesmo');
});

// ── a definição de runtime: uma só, chamada pelos três ───────────────────

test('install.sh delega o espelho em sync-runtime.js', () => {
  const src = ler(INSTALL_SH);
  assert.match(src, /sync-runtime\.js.*--src.*--dest/s,
    'install.sh tem de chamar sync-runtime.js com --src e --dest');
});

test('install.ps1 delega o espelho em sync-runtime.js', () => {
  const src = ler(INSTALL_PS1);
  assert.match(src, /sync-runtime\.js/,
    'install.ps1 tem de chamar sync-runtime.js');
  assert.match(src, /--src[\s\S]{0,120}--dest/,
    'install.ps1 tem de passar --src e --dest');
});

test('a skill /mooter-update delega o espelho no MESMO script', () => {
  const skill = path.join(RAIZ, '.claude', 'skills', 'mooter-update', 'SKILL.md');
  const src = ler(skill);
  assert.match(src, /sync-runtime\.js/, 'o Step 5 tem de chamar sync-runtime.js');
  assert.match(src, /sync-runtime\.js --check/, 'o Step 6 tem de ter o gate --check');
});

test('nenhum instalador voltou a copiar o runtime por conta própria', () => {
  // A mordida que interessa: é assim que a 4.ª definição nasce — alguém
  // acrescenta «só mais um cp» ao lado da chamada, e o drift recomeça.
  const sh = ler(INSTALL_SH);
  assert.ok(!/cp\s+'\$SRC_DIR\/tools\/router\/'\*\.js/.test(sh),
    'install.sh voltou a copiar *.js à mão — usa sync-runtime.js');
  assert.ok(!/cp\s+'\$SRC_DIR\/tools\/router\/'\*\.json/.test(sh),
    'install.sh voltou a copiar *.json à mão — package.json/tsconfig.json não são runtime');
  assert.ok(!/cp\s+'\$SRC_DIR\/tools\/router\/providers\/'\*/.test(sh),
    'install.sh voltou a copiar providers/ à mão — o espelho já é recursivo');

  const ps1 = ler(INSTALL_PS1);
  assert.ok(!/Get-ChildItem[^\n]*tools\\router"[^\n]*-Filter \*\.js/.test(ps1),
    'install.ps1 voltou a copiar *.js à mão — usa sync-runtime.js');
  assert.ok(!/\$provSrc\s*=/.test(ps1),
    'install.ps1 voltou a copiar providers/ à mão — o espelho já é recursivo');
});

test('o piso de Node do install.sh continua a bater com o do install.ps1', () => {
  // Não é o tema deste ficheiro, mas é a mesma classe: dois instaladores com um
  // número copiado à mão. Já custou uma vez (o .sh dizia 18+ enquanto o bundle
  // entregue era node20) — quem instalasse em 18 passava aqui e falhava depois.
  const sh = ler(INSTALL_SH).match(/NODE_MAJOR"?\s*-lt\s*(\d+)/);
  const ps1 = ler(INSTALL_PS1).match(/-lt\s*(\d+)|\blt\s*(\d+)|major\s*<\s*(\d+)/i);
  assert.ok(sh, 'não encontrei o piso de Node no install.sh');
  if (!ps1) return; // o .ps1 pode exprimi-lo de outra forma; não inventamos falha
  const nSh = Number(sh[1]);
  const nPs1 = Number(ps1[1] || ps1[2] || ps1[3]);
  assert.equal(nSh, nPs1, `piso de Node diverge: install.sh ${nSh} vs install.ps1 ${nPs1}`);
});
