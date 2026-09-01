// ollama-host.test.js
//
// Duas famílias de teste, e a segunda é a que interessa a longo prazo:
//
//   1. o normalizador faz o que promete;
//   2. **cobertura** — nenhum ficheiro de `tools/` lê `process.env.OLLAMA_HOST`
//      cru. Sete sítios tinham o mesmo defeito porque cada um resolvia o URL
//      no seu canto; sem esta varredura, o oitavo nasce partido e ninguém dá
//      por isso. É a mesma lição do portão de design que testava PRESENÇA por
//      ficheiro em vez de COBERTURA (CLAUDE.md, 2026-08-29).

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeHost, ollamaHostFromEnv, DEFAULT_OLLAMA_HOST } = require('./ollama-host.js');

// ── 1 · o normalizador ───────────────────────────────────────────────────

test('normalizeHost: prefixa http:// quando falta o esquema', () => {
  assert.equal(normalizeHost('127.0.0.1:11434'), 'http://127.0.0.1:11434');
  assert.equal(normalizeHost('localhost:11434'), 'http://localhost:11434');
  assert.equal(normalizeHost('host.docker.internal:11434'), 'http://host.docker.internal:11434');
});

test('normalizeHost: não força http em https — não faz downgrade de transporte', () => {
  assert.equal(normalizeHost('https://gpu.local:11434'), 'https://gpu.local:11434');
  assert.equal(normalizeHost('HTTPS://GPU.LOCAL:11434'), 'HTTPS://GPU.LOCAL:11434');
});

test('normalizeHost: não duplica esquema já presente', () => {
  assert.equal(normalizeHost('http://localhost:11434'), 'http://localhost:11434');
  assert.equal(normalizeHost('HTTP://localhost:11434'), 'HTTP://localhost:11434');
});

test('normalizeHost: apara barras finais', () => {
  assert.equal(normalizeHost('127.0.0.1:11434/'), 'http://127.0.0.1:11434');
  assert.equal(normalizeHost('http://gpu:11434///'), 'http://gpu:11434');
});

test('normalizeHost: vazio/nulo cai no fallback — e o fallback também é normalizado', () => {
  assert.equal(normalizeHost(''), DEFAULT_OLLAMA_HOST);
  assert.equal(normalizeHost('   '), DEFAULT_OLLAMA_HOST);
  assert.equal(normalizeHost(undefined), DEFAULT_OLLAMA_HOST);
  assert.equal(normalizeHost(null), DEFAULT_OLLAMA_HOST);
  // A mordida: um default mal escrito partia exactamente como a env partia.
  assert.equal(normalizeHost('', 'host.docker.internal:11434'), 'http://host.docker.internal:11434');
});

test('normalizeHost: nunca lança, seja qual for a porcaria que receba', () => {
  for (const lixo of [0, 1, {}, [], true, false, NaN, Symbol.iterator.toString()]) {
    assert.doesNotThrow(() => normalizeHost(lixo));
    assert.equal(typeof normalizeHost(lixo), 'string');
  }
});

test('normalizeHost: o resultado serve sempre de base a new URL', () => {
  // É este o uso real em 6 dos 7 sítios, e é o que lançava `Invalid URL`.
  for (const entrada of ['127.0.0.1:11434', 'localhost:11434', 'http://gpu:11434', '', null]) {
    const base = normalizeHost(entrada);
    assert.doesNotThrow(
      () => new URL('/api/generate', base),
      `new URL falhou com base derivada de ${JSON.stringify(entrada)} → ${base}`
    );
  }
});

test('ollamaHostFromEnv: lê a env já normalizada, e respeita o fallback do chamador', () => {
  assert.equal(ollamaHostFromEnv(undefined, { OLLAMA_HOST: '127.0.0.1:11434' }), 'http://127.0.0.1:11434');
  assert.equal(ollamaHostFromEnv('http://host.docker.internal:11434', {}), 'http://host.docker.internal:11434');
  assert.equal(ollamaHostFromEnv(undefined, {}), DEFAULT_OLLAMA_HOST);
});

// ── 2 · cobertura: ninguém lê a env crua ─────────────────────────────────

const RAIZ_TOOLS = path.resolve(__dirname, '..');

/** Ficheiros que PODEM falar de `process.env.OLLAMA_HOST` sem normalizar. */
const ISENTOS = new Set([
  path.join('router', 'ollama-host.js'),        // é ele o normalizador
  path.join('router', 'ollama-host.test.js'),   // este ficheiro
]);

function varrer(dir, encontrados = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { varrer(p, encontrados); continue; }
    if (!/\.(js|mjs|cjs|ts)$/.test(e.name)) continue;
    encontrados.push(p);
  }
  return encontrados;
}

test('cobertura: nenhum ficheiro de tools/ lê process.env.OLLAMA_HOST sem normalizar', () => {
  const infractores = [];
  for (const p of varrer(RAIZ_TOOLS)) {
    const rel = path.relative(RAIZ_TOOLS, p);
    if (ISENTOS.has(rel)) continue;
    // Testes escrevem/restauram `process.env.OLLAMA_HOST` para montar cenário —
    // isso é preparação, não resolução de URL. Isentam-se pelo sufixo, e não
    // por lista, para que um teste novo não tenha de ser inscrito à mão aqui
    // (uma lista à mão foi o que deixou o `test:cockpit-runner` perder um
    // ficheiro em silêncio).
    if (/\.test\.(js|mjs|cjs|ts)$/.test(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    if (!/process\.env\.OLLAMA_HOST/.test(src)) continue;
    // Lê a env crua: só é aceitável se for para a passar pelo normalizador.
    if (/ollama-host(\.js)?['"]/.test(src)) continue;
    infractores.push(rel);
  }
  assert.deepEqual(
    infractores,
    [],
    `estes ficheiros resolvem OLLAMA_HOST por conta própria e partem com o formato `
    + `canónico (sem esquema): ${infractores.join(', ')}. Usa ollamaHostFromEnv() de router/ollama-host.js.`
  );
});

test('cobertura: a varredura vê mesmo ficheiros — guarda contra um teste que corre a zero', () => {
  // Um teste de varredura que não varre nada passa verde e não mede nada.
  // (memória do dono: «um teste pode passar verde tendo corrido ZERO testes»)
  const todos = varrer(RAIZ_TOOLS);
  assert.ok(todos.length > 100, `varredura devolveu só ${todos.length} ficheiros — algo está errado`);
  const comEnv = todos.filter((p) => /process\.env\.OLLAMA_HOST/.test(fs.readFileSync(p, 'utf8')));
  assert.ok(comEnv.length > 0, 'nenhum ficheiro menciona OLLAMA_HOST — o regex da varredura deixou de coincidir');
});
