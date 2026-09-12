/**
 * capturar-ledger.test.mjs — o retrato do Ledger, e a regra que o mantem inteiro.
 *
 * O pedido que abriu isto dizia "screenshot CDP <5s no Ledger". Medido no
 * mac-mini com Chrome headless contra o Ledger real (1280x5142 px): 148 ms,
 * mediana de 3 corridas. O tecto nunca esteve em risco NESTA maquina, e o
 * ficheiro passa a existir para que a proxima pessoa que discordar discorde
 * contra um comando em vez de contra uma lembranca.
 *
 * O defeito que EXISTIA e outro, e e visual: um screenshot de pagina inteira
 * nao e a pagina. O que e `fixed` desenha-se uma vez, do tamanho da JANELA.
 * Medido: recorte de 80x80 na goteira a y=300 -> 324 B de PNG (com textura);
 * o mesmo recorte a y=4600 -> 252 B (liso). O retrato do Ledger tinha textura
 * nos primeiros 800 px de 5142. Com `?capture=1` os dois recortes saem
 * BYTE A BYTE iguais.
 *
 * Por isso o teste de fundo aqui e de COBERTURA e nao de presenca: a mesma
 * classe de defeito que fez o portao de movimento nascer cego a 2026-08-29.
 * Uma regra `body[data-capture]` que existe nao prova nada; o que prova e que
 * NENHUM elemento posicionado fora do fluxo ficou de fora dela.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const {
  urlDeCaptura, veredicto, acharChrome, TECTO_MS, CHROMES, REPO,
} = await import('./capturar-ledger.mjs');

const CASCA = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-ledger-shell.html'), 'utf8');
/** Sem comentarios: uma regra citada dentro de um `/* *\/` nao e uma regra. */
const CSS = /<style>([\s\S]*?)<\/style>/.exec(CASCA)[1].replace(/\/\*[\s\S]*?\*\//g, '');

// ── o endereco ───────────────────────────────────────────────────────────────

test('o modo retrato entra sempre no endereco', () => {
  assert.match(urlDeCaptura('http://127.0.0.1:4290/ledger'), /\?capture=1$/);
  assert.match(urlDeCaptura('http://127.0.0.1:4290/ledger?x=1'), /\?x=1&capture=1$/);
});

test('nao se duplica quando ja la esta', () => {
  const u = urlDeCaptura('http://127.0.0.1:4290/ledger?capture=1');
  assert.equal(u.match(/capture=1/g).length, 1);
});

test('um caminho de disco vira file://, nao um endereco relativo partido', () => {
  const u = urlDeCaptura('dist/moo-ledger.html');
  assert.ok(u.startsWith('file://'), u);
  assert.match(u, /capture=1$/);
});

test('sem alvo, captura o Ledger construido deste repo', () => {
  const u = urlDeCaptura(null, { repoRoot: '/r' });
  assert.equal(u, `${pathToFileURL('/r/dist/moo-ledger.html').href}?capture=1`);
});

// ── o veredicto ──────────────────────────────────────────────────────────────

test('abaixo do tecto passa, acima reprova', () => {
  assert.equal(veredicto({ ms: 148 }).ok, true);
  assert.equal(veredicto({ ms: 5001 }).ok, false);
  assert.match(veredicto({ ms: 5001 }).porque, /ACIMA do tecto/);
});

test('o tecto e 5 s, como foi pedido', () => {
  assert.equal(TECTO_MS, 5000);
  assert.equal(veredicto({ ms: 5000 }).ok, true, 'o tecto e inclusivo');
});

test('SEM MEDICAO nao ha veredicto — um tempo nao medido nao se estima', () => {
  const v = veredicto({ ms: null });
  assert.equal(v.medido, false);
  assert.equal(v.ok, false);
  assert.match(v.porque, /^n\/d/);
});

// ── o browser ────────────────────────────────────────────────────────────────

test('MOO_CHROME ganha, e mentir sobre ele nao passa em silencio', () => {
  assert.equal(acharChrome({ env: { MOO_CHROME: '/x/chrome' }, existsImpl: () => true }), '/x/chrome');
  assert.equal(acharChrome({ env: { MOO_CHROME: '/nao/existe' }, existsImpl: () => false }), null,
    'apontar o MOO_CHROME a nada nao pode cair para outro browser sem avisar');
});

test('sem Chrome nenhum devolve null — nao se inventa um caminho', () => {
  assert.equal(acharChrome({ env: {}, existsImpl: () => false }), null);
  assert.ok(CHROMES.length >= 3);
});

// ── COBERTURA: nada posicionado fora do fluxo escapa ao modo retrato ─────────

/** Os selectores da folha que usam `position:fixed` ou `position:sticky`. */
function foraDoFluxo(css) {
  const achados = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (/position:\s*(fixed|sticky)/.test(m[2]) && !sel.startsWith('body[data-capture]')) {
      achados.push(sel);
    }
  }
  return achados;
}

test('a folha AINDA tem elementos fora do fluxo — senao este teste nao mede nada', () => {
  assert.ok(foraDoFluxo(CSS).length >= 3,
    'se isto chegar a zero, o teste passou a aprovar por vacuidade');
});

test('COBERTURA: cada elemento fora do fluxo tem regra de retrato — presenca nao chega', () => {
  const semCobertura = foraDoFluxo(CSS).filter((sel) => {
    // O selector nu, sem pseudo-elemento: `body::before` cobre-se com
    // `body[data-capture]::before`, e `header.cover` com o mesmo prefixo.
    const alvo = sel.replace(/^body(?=::|$)/, '').trim();
    const escapado = (alvo || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`body\\[data-capture\\]\\s*${escapado}\\s*\\{`);
    return !re.test(CSS);
  });
  assert.deepEqual(semCobertura, [],
    `sem regra de retrato: ${semCobertura.join(' · ')} — vao sair errados no screenshot`);
});

// ── o interruptor, corrido ──────────────────────────────────────────────────

function levantarCasca(search) {
  const corpo = /<script>\n\(\(\) => \{([\s\S]*)\}\)\(\);/.exec(CASCA);
  assert.ok(corpo, 'nao encontrei o corpo do script da casca');
  const body = { dataset: {}, innerHTML: '' };
  const ctx = {
    document: {
      body, getElementById: () => null, addEventListener() {}, querySelectorAll: () => [],
    },
    location: { protocol: 'http:', search },
    window: {}, console,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, fetch: async () => { throw new Error('x'); },
    AbortSignal: { timeout: () => null }, requestAnimationFrame: (f) => f(),
  };
  ctx.globalThis = ctx; ctx.window.document = ctx.document;
  vm.createContext(ctx);
  // Sem payload a casca escreve a pagina de "no payload" e RETORNA — o que
  // basta: o interruptor corre antes disso, de proposito.
  try { vm.runInContext(`(() => {${corpo[1]}})()`, ctx, { timeout: 5000 }); } catch { /* DOM magro */ }
  return body;
}

test('?capture=1 liga o modo retrato', () => {
  assert.equal(levantarCasca('?capture=1').dataset.capture, '1');
});

test('sem o pedir, o modo retrato NAO se auto-activa', () => {
  assert.equal(levantarCasca('').dataset.capture, undefined);
  assert.equal(levantarCasca('?capture=0').dataset.capture, undefined);
  assert.equal(levantarCasca('?nocapture=1').dataset.capture, undefined,
    'um sufixo nao pode ligar o modo');
});
