/**
 * launcher.test.js — o launcher delega, pergunta, e nunca mente sobre o que fez.
 *
 * Corre sem rede, sem processos e sem tocar no `~/.mooter` de ninguem.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const L = require('./index.js');

const MANIFESTO = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));

function estadoCom(elicitation = false) {
  const e = L.novoEstado();
  e.clienteAceitaElicitation = elicitation;
  return e;
}

// ── o tecto de 200 linhas, guardado ────────────────────────────────────────

test('o launcher cabe em 200 linhas — o tecto e a feature', () => {
  // Medido sem a linha vazia final: 200 tem de querer dizer 200.
  const linhas = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8').replace(/\n+$/, '').split('\n').length;
  assert.ok(linhas <= 200, `index.js tem ${linhas} linhas`);
});

test('o launcher nao arrasta dependencias nenhumas', () => {
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  for (const r of requires) {
    assert.ok(
      ['fs', 'os', 'path', 'child_process'].includes(r),
      `require nao-builtin no launcher: ${r} — o bundle tem de correr sem npm install`,
    );
  }
});

test('zero logica de produto: o launcher nao sabe o que e um tier nem um recibo', () => {
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  // Um launcher que soubesse isto era uma coisa que deixava de se poder actualizar.
  for (const palavra of ['classify', 'recibo', 'ollama', 'opus', 'haiku', 'sonnet']) {
    assert.doesNotMatch(src.toLowerCase(), new RegExp(`\\b${palavra}\\b`), `o launcher menciona '${palavra}'`);
  }
});

// ── o manifesto ───────────────────────────────────────────────────────────

test('o manifesto declara as tres plataformas e o piso de Node', () => {
  assert.deepEqual(MANIFESTO.compatibility.platforms, ['darwin', 'win32', 'linux']);
  assert.match(MANIFESTO.compatibility.runtimes.node, /^>=\s*20/);
});

test('o token e sensivel, NAO obrigatorio, e SEM `default` (ADR D3.1)', () => {
  const t = MANIFESTO.user_config.mooter_token;
  assert.equal(t.sensitive, true);
  assert.equal(t.required, false);
  // O ponto todo da D3.1: um bundle copiavel nao pode trazer a credencial dentro.
  assert.ok(!('default' in t), 'o manifesto pre-preenche o token — refutado pelo adversario');
});

test('o token chega ao processo por env, e o entry point e o launcher', () => {
  assert.equal(MANIFESTO.server.mcp_config.env.MOOTER_TOKEN, '${user_config.mooter_token}');
  assert.equal(MANIFESTO.server.entry_point, 'index.js');
  assert.equal(MANIFESTO.server.type, 'node');
});

test('nenhum segredo literal no manifesto', () => {
  const cru = fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8');
  assert.doesNotMatch(cru, /sk-[A-Za-z0-9]{10}/);
  assert.doesNotMatch(cru, /"default"\s*:\s*"[A-Za-z0-9_-]{16,}"/);
});

// ── delegacao ─────────────────────────────────────────────────────────────

test('com payload presente, delega — e nao atende MCP nenhum', () => {
  let chamado = null;
  const falso = { on() { return this; } };
  L.delegar({
    existsImpl: () => true,
    payload: '/x/mooter.js',
    argv: ['--foo'],
    spawnImpl: (bin, args, opts) => { chamado = { bin, args, opts }; return falso; },
  });
  assert.deepEqual(chamado.args, ['/x/mooter.js', '--foo']);
  assert.equal(chamado.opts.stdio, 'inherit', 'um pipe intermedio e uma segunda coisa a poder partir-se');
});

test('temPayload nunca lanca, mesmo com um fs que rebenta', () => {
  assert.equal(L.temPayload({ existsImpl: () => { throw new Error('EIO'); } }), false);
});

// ── o MCP minimo ──────────────────────────────────────────────────────────

test('initialize regista se o cliente sabe perguntar (elicitation)', async () => {
  const e = L.novoEstado();
  const r = await L.tratar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: { elicitation: {} } } }, e);
  assert.equal(e.clienteAceitaElicitation, true);
  assert.equal(r.result.protocolVersion, L.PROTOCOLO);
  assert.equal(r.result.serverInfo.name, 'mooter-launcher');
});

test('um cliente sem elicitation nao e tratado como se soubesse perguntar', async () => {
  const e = L.novoEstado();
  await L.tratar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } }, e);
  assert.equal(e.clienteAceitaElicitation, false);
});

test('tools/list expoe uma so ferramenta — a de preparar', async () => {
  const r = await L.tratar({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, L.novoEstado());
  assert.equal(r.result.tools.length, 1);
  assert.equal(r.result.tools[0].name, 'mooter_preparar');
});

test('uma notificacao (sem id) nao gera resposta', async () => {
  assert.equal(await L.tratar({ jsonrpc: '2.0', method: 'notifications/initialized' }, L.novoEstado()), null);
});

test('metodo desconhecido devolve erro JSON-RPC, nao um crash', async () => {
  const r = await L.tratar({ jsonrpc: '2.0', id: 9, method: 'nao/existe' }, L.novoEstado());
  assert.equal(r.error.code, -32601);
});

// ── B1: perguntar antes de descarregar ────────────────────────────────────

test('B1 · pergunta antes de descarregar, e um NAO nao descarrega nada', async () => {
  let descarregou = false;
  const r = await L.preparar(estadoCom(true), {
    existsImpl: () => false,
    perguntarImpl: async () => false,
    descarregarImpl: async () => { descarregou = true; },
  });
  assert.equal(descarregou, false, 'descarregou depois de um nao');
  assert.equal(r.ok, false);
  assert.match(r.texto, /nada foi descarregado/);
});

test('B1 · com um SIM, descarrega e diz para repetir o pedido', async () => {
  let descarregou = false;
  const r = await L.preparar(estadoCom(true), {
    existsImpl: () => false,
    perguntarImpl: async () => true,
    descarregarImpl: async () => { descarregou = true; },
  });
  assert.equal(descarregou, true);
  assert.equal(r.ok, true);
});

test('B1 · so pergunta uma vez por sessao', async () => {
  let perguntas = 0;
  const e = estadoCom(true);
  const o = {
    existsImpl: () => false,
    perguntarImpl: async () => { perguntas += 1; return true; },
    descarregarImpl: async () => {},
  };
  await L.preparar(e, o);
  await L.preparar(e, o);
  assert.equal(perguntas, 1);
});

test('sem chave de release nao ha descarregador — e o texto diz porque', async () => {
  const r = await L.preparar(estadoCom(false), { existsImpl: () => false });
  assert.equal(r.ok, false);
  assert.match(r.texto, /chave publica de release/);
  assert.match(r.texto, /npx @mooter\/cli/);
});

test('com payload ja instalado, preparar nao faz nada', async () => {
  const r = await L.preparar(estadoCom(true), {
    existsImpl: () => true,
    perguntarImpl: async () => { throw new Error('nao devia perguntar'); },
  });
  assert.equal(r.ok, true);
});

// ── B2: sem rede ──────────────────────────────────────────────────────────

test('B2 · sem rede diz «sem rede», e nao um codigo de erro do sistema', async () => {
  for (const erro of ['getaddrinfo ENOTFOUND mooter.ai', 'fetch failed', 'connect ETIMEDOUT']) {
    const r = await L.preparar(estadoCom(false), {
      existsImpl: () => false,
      descarregarImpl: async () => { throw new Error(erro); },
    });
    assert.equal(r.ok, false);
    assert.match(r.texto, /Sem rede/);
    assert.doesNotMatch(r.texto, /ENOTFOUND|ETIMEDOUT/);
  }
});

test('um erro que NAO e de rede nao se disfarca de falta de rede', async () => {
  const r = await L.preparar(estadoCom(false), {
    existsImpl: () => false,
    descarregarImpl: async () => { throw new Error('EACCES: permission denied'); },
  });
  assert.doesNotMatch(r.texto, /Sem rede/);
  assert.match(r.texto, /EACCES/);
});

test('tools/call devolve isError quando nao conseguiu preparar', async () => {
  const r = await L.tratar({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mooter_preparar' } }, L.novoEstado(), {
    existsImpl: () => false,
  });
  assert.equal(r.result.isError, true);
  assert.equal(r.result.content[0].type, 'text');
});
