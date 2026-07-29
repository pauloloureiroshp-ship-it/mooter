'use strict';

const assert = require('assert');
const http = require('http');
const { before, after, test } = require('node:test');

const moo = require('./moo.js');
const localfirst = require('./localfirst.js');
const board = require('./board.js');
const aprender = require('./aprender.js');
const seamless = require('./seamless.js');

const BYTES_POR_GB = 1024 ** 3;
const MB_POR_GB = 1024;
const MODELO_PREFERIDO = 'qwen3.6:8b';
const MODELO_PEQUENO = 'qwen2.5:0.5b';

let server;
let host;

function fixtureVram(totalGb, usadoGb) {
  const totalMb = totalGb * MB_POR_GB;
  return {
    available: true,
    memory_total_mb: totalMb,
    live: { memory_total_mb: totalMb, memory_used_mb: usadoGb * MB_POR_GB },
    headroom: { free_mb: totalMb - usadoGb * MB_POR_GB },
  };
}

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url !== '/api/tags') {
      res.statusCode = 404;
      return res.end('{}');
    }
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ models: [
      { model: MODELO_PREFERIDO, size: 8 * BYTES_POR_GB },
      { model: MODELO_PEQUENO, size: 0.5 * BYTES_POR_GB },
    ] }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  host = '127.0.0.1:' + server.address().port;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('placa de 23 GB com 20 GB ocupados não carrega um modelo novo de 8 GB', async () => {
  const escolha = await moo.pickModelExplained(null, host, null, {
    vram: fixtureVram(23, 20),
  });
  assert.strictEqual(moo.FOLGA_MINIMA_GB, 2);
  assert.strictEqual(escolha.model, MODELO_PEQUENO);
  assert.strictEqual(escolha.vram_influenciou, true);
});

test('o mesmo modelo continua elegível quando já está residente', async () => {
  const escolha = await moo.pickModelExplained(null, host, [
    { model: MODELO_PREFERIDO, size: 8 * BYTES_POR_GB },
  ], { vram: fixtureVram(23, 20) });
  assert.strictEqual(escolha.model, MODELO_PREFERIDO);
  assert.strictEqual(escolha.residente, true);
  const routing = localfirst.cabeNoLocal({
    goal: 'resume este ficheiro', tier: 'T0', temModeloLocal: true,
    vramLivreMb: 644, modeloJaResidente: true,
  });
  assert.strictEqual(routing.local, true);
});

test('modelo_porque só fala da VRAM quando ela mudou a escolha', async () => {
  const limitada = await moo.pickModelExplained(null, host, null, {
    vram: fixtureVram(23, 20),
  });
  assert.match(limitada.porque, /VRAM decidiu/i);
  assert.match(limitada.porque, /3072 MB livres/i);
  assert.match(limitada.porque, /folga mínima (?:de|é) 2\.3 GB/i);

  const folgada = await moo.pickModelExplained(null, host, null, {
    vram: fixtureVram(23, 10),
  });
  assert.strictEqual(folgada.model, MODELO_PREFERIDO);
  assert.doesNotMatch(folgada.porque, /VRAM|folga mínima|MB livres/i);
});

test('nenhum modelo cabe: devolve null com motivo legível, nunca o menor às cegas', async () => {
  const escolha = await moo.pickModelExplained(null, host, null, {
    vram: fixtureVram(23, 22),
  });
  assert.strictEqual(escolha.model, null);
  assert.strictEqual(escolha.motivo_nao_local, 'falta_vram');
  assert.match(escolha.porque, /nenhum modelo novo cabe/i);
  assert.match(escolha.porque, /folga mínima/i);
});

test('ledger distingue falta_vram de forcado_por_quota', () => {
  const decisao = localfirst.cabeNoLocal({
    goal: 'resume este ficheiro', tier: 'T0', temModeloLocal: false,
    motivoNaoLocal: 'falta_vram', forcar: true,
  });
  assert.strictEqual(decisao.local, false);
  assert.strictEqual(decisao.motivo_nao_local, 'falta_vram');
  assert.strictEqual(decisao.forcado_por_quota, false);
  assert.deepStrictEqual(seamless._normalizarDecisaoLocal(decisao), decisao);

  const ledger = [{
    job_id: 'vram-1', event: 'dispatched', preparation: false,
    local_decisao: decisao,
  }];
  assert.deepStrictEqual(board._motivosNaoLocal(ledger), [{
    motivo: 'falta_vram', porque: decisao.porque, n: 1,
  }]);
  const record = aprender._jobRecords(ledger)[0];
  assert.strictEqual(record.motivo_nao_local, 'falta_vram');
  assert.strictEqual(record.forcado_por_quota, false);
});

test('leitura da GPU indisponível mantém o selector anterior com ressalva', async () => {
  const escolha = await moo.pickModelExplained(null, host, null, { vram: null });
  assert.strictEqual(escolha.model, MODELO_PREFERIDO);
  assert.match(escolha.porque, /VRAM indisponível|leitura completa da VRAM indisponível/i);
});
