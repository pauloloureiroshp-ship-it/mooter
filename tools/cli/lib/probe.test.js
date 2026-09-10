/**
 * probe.test.js — o device apresenta-se, e nunca inventa nem espreita.
 *
 * Sem binarios instalados, sem rede, sem GPU. O que se prova aqui e o
 * comportamento; o que a maquina real diz esta medido no journal da onda.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const P = require('./probe.js');

const SEM_NADA = { existsImpl: () => false, sep: path };

// ── R6: a linha que nao se atravessa ──────────────────────────────────────

/** O ficheiro sem comentarios — o que a maquina corre, nao o que o autor diz. */
function codigoDe(ficheiro) {
  return require('node:fs')
    .readFileSync(path.join(__dirname, ficheiro), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('R6 · o probe NAO le credenciais, tokens nem sessoes de ninguem', () => {
  // Varre o CODIGO, nao os comentarios: o cabecalho do `probe.js` NOMEIA de
  // proposito os ficheiros que nao le (`~/.claude/.credentials.json`, o
  // keychain), e essa documentacao vale mais do que o teste ser simples de
  // escrever. Um teste que confunde «menciona» com «faz» reprova a explicacao
  // junto com a coisa explicada.
  const codigo = codigoDe('probe.js');
  for (const proibido of ['.credentials', 'auth.json', 'keychain', 'security find-generic-password', 'ANTHROPIC_API_KEY']) {
    assert.ok(!codigo.includes(proibido), `o probe LE ${proibido}`);
  }
});

test('R6 · sem comando read-only documentado, o login e `n/d` — nunca inferido', () => {
  const r = P.clis({ ondeImpl: () => '/bin/qualquer', execImpl: () => 'v1.2.3' });
  for (const c of r) {
    assert.equal(c.login, 'n/d');
    assert.match(c.porque, /comando read-only/);
  }
});

// ── presenca e versao ─────────────────────────────────────────────────────

test('uma CLI ausente diz que nao esta instalada, sem versao e sem crash', () => {
  const r = P.clis(Object.assign({}, SEM_NADA, { ondeImpl: () => null }));
  assert.equal(r.length, P.CLIS.length);
  for (const c of r) {
    assert.equal(c.presente, false);
    assert.equal(c.versao, null);
    assert.equal(c.login, 'n/d');
  }
});

test('uma CLI que rebenta no --version fica presente e com versao nula', () => {
  const r = P.clis({
    ondeImpl: () => '/bin/x',
    execImpl: () => { throw new Error('boom'); },
  });
  assert.equal(r[0].presente, true);
  assert.equal(r[0].versao, null);
});

test('a versao e a primeira linha, truncada — nao um dump', () => {
  const r = P.clis({ ondeImpl: () => '/bin/x', execImpl: () => '1.2.3\nbanner\noutra' });
  assert.equal(r[0].versao, '1.2.3');
});

// ── ondeEsta: sem `which`, porque o `which` precisa do PATH ───────────────

test('ondeEsta procura FORA do PATH — o launchd nao traz ~/.local/bin', () => {
  const vistos = [];
  const achado = P.ondeEsta('codex', {
    env: { PATH: '/usr/bin:/bin' },
    home: '/Users/alguem',
    sep: path,
    existsImpl: (p) => { vistos.push(p); return p === '/Users/alguem/.local/node/bin/codex'; },
  });
  assert.equal(achado, '/Users/alguem/.local/node/bin/codex');
  assert.ok(vistos.includes('/usr/bin/codex'), 'nem sequer olhou para o PATH');
});

test('ondeEsta nao corre `which` nenhum', () => {
  const codigo = codigoDe('probe.js');
  const bloco = codigo.slice(codigo.indexOf('function ondeEsta'), codigo.indexOf('async function retrato'));
  assert.ok(!/\bwhich\b/.test(bloco), 'o resolvedor usa `which` — que precisa ele proprio do PATH');
});

test('ondeEsta sobrevive a um fs que rebenta', () => {
  assert.equal(P.ondeEsta('x', { env: { PATH: '/a' }, home: '/h', sep: path, existsImpl: () => { throw new Error('EIO'); } }), null);
});

// ── Ollama: a PORTA, nao o binario ────────────────────────────────────────

test('Ollama · aceita OLLAMA_HOST sem esquema (o formato canonico)', async () => {
  let pedido = null;
  await P.ollama({
    host: '127.0.0.1:11434',
    fetchImpl: async (u) => { pedido = u; return { ok: true, json: async () => ({ models: [] }) }; },
  });
  assert.equal(pedido, 'http://127.0.0.1:11434/api/tags');
});

test('Ollama · nao duplica o esquema quando ele ja la esta', async () => {
  let pedido = null;
  await P.ollama({
    host: 'http://gpu.local:11434',
    fetchImpl: async (u) => { pedido = u; return { ok: true, json: async () => ({ models: [] }) }; },
  });
  assert.equal(pedido, 'http://gpu.local:11434/api/tags');
});

test('Ollama · lista os modelos que a porta reporta', async () => {
  const r = await P.ollama({
    fetchImpl: async () => ({ ok: true, json: async () => ({ models: [{ name: 'granite4.2:3b' }, { name: 'gpt-oss:20b' }] }) }),
  });
  assert.equal(r.presente, true);
  assert.deepEqual(r.modelos, ['granite4.2:3b', 'gpt-oss:20b']);
});

test('Ollama · nada a atender e ausente, com o endereco na razao', async () => {
  const r = await P.ollama({ host: '127.0.0.1:11434', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(r.presente, false);
  assert.match(r.porque, /127\.0\.0\.1:11434/);
  assert.deepEqual(r.modelos, []);
});

test('Ollama · a porta a responder mal NAO conta como presente', async () => {
  // Instalado != a atender. O motor $0 que falha mudo e o defeito que ja custou
  // trabalho a cair para um motor pago.
  const r = await P.ollama({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(r.presente, false);
  assert.match(r.porque, /500/);
});

// ── o retrato e a tabela ──────────────────────────────────────────────────

test('retrato nunca lanca, mesmo com o probe da GPU a rebentar', async () => {
  const r = await P.retrato(Object.assign({}, SEM_NADA, {
    gpuImpl: () => { throw new Error('sem GPU'); },
    fetchImpl: async () => { throw new Error('sem rede'); },
    ondeImpl: () => null,
  }));
  assert.equal(r.gpu.vendor, 'n/d');
  assert.equal(r.ollama.presente, false);
  assert.ok(r.medido_em);
});

test('a tabela diz `n/d` onde nao sabe, e nunca um zero a fingir', async () => {
  const r = await P.retrato(Object.assign({}, SEM_NADA, {
    gpuImpl: () => ({ vendor: 'n/d' }),
    fetchImpl: async () => { throw new Error('x'); },
    ondeImpl: () => null,
    totalmemImpl: () => { throw new Error('x'); },
  }));
  const t = P.tabela(r).join('\n');
  assert.match(t, /GPU\s+n\/d/);
  assert.match(t, /RAM\s+n\/d/);
  assert.doesNotMatch(t, /0 GB/);
});

test('a tabela mostra a GPU, a VRAM e os modelos quando ha', async () => {
  const r = await P.retrato(Object.assign({}, SEM_NADA, {
    gpuImpl: () => ({ vendor: 'apple', name_short: 'Apple M4 Pro', vramMB: 16220 }),
    fetchImpl: async () => ({ ok: true, json: async () => ({ models: [{ name: 'a' }] }) }),
    ondeImpl: () => null,
    totalmemImpl: () => 24 * 1024 * 1024 * 1024,
  }));
  const t = P.tabela(r).join('\n');
  assert.match(t, /Apple M4 Pro/);
  assert.match(t, /15\.8 GB/);
  assert.match(t, /24 GB/);
  assert.match(t, /1 modelo/);
});

test('ramMB devolve null em vez de rebentar', () => {
  assert.equal(P.ramMB({ totalmemImpl: () => { throw new Error('x'); } }), null);
});
