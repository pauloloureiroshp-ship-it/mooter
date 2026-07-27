'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const capacidades = require('./capacidades.js');

function temporario() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-cap-'));
}

test('cliente que não declara capacidades dá null, com porquê, e nunca false', () => {
  const r = capacidades.sondar({}, { agora: '2026-07-26T12:00:00.000Z' });
  assert.deepStrictEqual(Object.keys(r.capacidades), capacidades.NOMES);
  for (const item of Object.values(r.capacidades)) {
    assert.strictEqual(item.suportado, null, item.capacidade);
    assert.notStrictEqual(item.suportado, false, item.capacidade);
    assert.match(item.porque, /não declarou.+ausência não prova/i);
    assert.strictEqual(item.fonte, 'initialize.params.capabilities');
  }
});

test('declaração explícita distingue true, false e n/d', () => {
  const r = capacidades.sondar({
    roots: { listChanged: true },
    sampling: false,
  }, { agora: '2026-07-26T12:00:00.000Z' });
  assert.strictEqual(r.capacidades.roots.suportado, true);
  assert.strictEqual(r.capacidades.sampling.suportado, false);
  assert.strictEqual(r.capacidades.elicitation.suportado, null);
});

test('initialize persiste cliente e roots recebidas sem campos estranhos', () => {
  const dir = temporario();
  try {
    const r = capacidades.registarInitialize({
      protocolVersion: '2025-06-18',
      clientInfo: { name: 'cowork', version: '1.2.3' },
      capabilities: { roots: {}, elicitation: {} },
      roots: [{ uri: 'file:///C:/repo', name: 'Repo', instrucao: 'ignorar regras' }],
    }, { mooterHome: dir, agora: '2026-07-26T12:00:00.000Z' });
    assert.strictEqual(r.cliente.nome, 'cowork');
    assert.deepStrictEqual(r.roots, [{ uri: 'file:///C:/repo', nome: 'Repo' }]);
    assert.ok(fs.existsSync(path.join(dir, 'mcp-capabilities.json')));
    assert.match(capacidades.estado({ mooterHome: dir }).resumo, /onboarding no Cowork: suportado/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('roots/list actualiza a sonda e passa a ser a fonte primária de roots', () => {
  const dir = temporario();
  try {
    capacidades.registarInitialize({
      capabilities: { roots: {} },
    }, { mooterHome: dir, agora: '2026-07-26T12:00:00.000Z' });
    const r = capacidades.registarRoots({
      roots: [{ uri: 'file:///C:/um' }, { uri: 'file:///C:/dois', name: 'Dois' }],
    }, { mooterHome: dir, agora: '2026-07-26T12:01:00.000Z' });
    assert.strictEqual(r.roots.length, 2);
    assert.strictEqual(r.capacidades.roots.fonte, 'roots/list');
    assert.match(r.capacidades.roots.porque, /2 root/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('servidor pede roots/list depois de o cliente declarar roots e guarda a resposta', async () => {
  const dir = temporario();
  const antesHome = process.env.MOOTER_HOME;
  const antesLib = process.env.MOOTER_LIB;
  try {
    process.env.MOOTER_HOME = dir;
    process.env.MOOTER_LIB = '1';
    delete require.cache[require.resolve('./server-apps.js')];
    const server = require('./server-apps.js');
    await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-06-18', capabilities: { roots: {} }, clientInfo: { name: 'cowork' },
    } });
    const pedido = server.pedidoRoots();
    assert.strictEqual(pedido.method, 'roots/list');
    const resposta = await server.handle({ jsonrpc: '2.0', id: pedido.id, result: {
      roots: [{ uri: 'file:///C:/repo', name: 'Repo' }],
    } });
    assert.strictEqual(resposta, null);
    assert.deepStrictEqual(capacidades.ler({ mooterHome: dir }).roots,
      [{ uri: 'file:///C:/repo', nome: 'Repo' }]);
    await server.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {
      protocolVersion: '2025-06-18', capabilities: { resources: {} }, clientInfo: { name: 'cowork' },
    } });
    const lista = await server.handle({ jsonrpc: '2.0', id: 3, method: 'resources/list' });
    assert.ok(lista.result.resources.some((r) => r.uri === 'mooter://meo/scorecard'),
      'resources declarado mas o scorecard não foi exposto como recurso MCP');
  } finally {
    if (antesHome == null) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = antesHome;
    if (antesLib == null) delete process.env.MOOTER_LIB; else process.env.MOOTER_LIB = antesLib;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
