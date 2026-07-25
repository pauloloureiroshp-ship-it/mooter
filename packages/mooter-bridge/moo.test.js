'use strict';
/**
 * moo.test.js — the local adapter, tested against a fake Ollama.
 *
 * The real daemon lives on Paulo's 4090 and cannot be reached from CI, so we
 * stand up an HTTP server that speaks the exact shape a measured run returned
 * on 2026-07-25 (qwen2.5:3b, ~185 tok/s, all three counters present):
 *
 *   {"model":"qwen2.5:3b","done":true,"prompt_eval_count":51,"eval_count":385,
 *    "prompt_eval_duration":...,"eval_duration":2085000000,"total_duration":...}
 *
 * Durations are NANOSECONDS — getting that wrong is a 1e9 error in tok/s.
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');

const moo = require('./moo.js');
const telemetry = require('./telemetry.js');

let pass = 0;
const ok = (n) => { console.log('  ok  ' + n); pass++; };
const bad = (n, e) => { console.log('  FAIL ' + n + '\n       ' + ((e && e.message) || e)); process.exitCode = 1; };

const server = http.createServer((req, res) => {
  if (req.url === '/api/tags') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ models: [
      { model: 'qwen2.5:3b', size: 2159374499, details: { parameter_size: '3.1B', quantization_level: 'Q4_K_M' } },
      { model: 'llama3.1:70b', size: 42000000000, details: { parameter_size: '70B' } },
    ] }));
  }
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const p = JSON.parse(body);
      res.setHeader('content-type', 'application/x-ndjson');
      res.write(JSON.stringify({ model: p.model, message: { role: 'assistant', content: 'Um handoff é ' }, done: false }) + '\n');
      res.write(JSON.stringify({ model: p.model, message: { role: 'assistant', content: 'a passagem de contexto.' }, done: false }) + '\n');
      res.end(JSON.stringify({
        model: p.model, done: true, done_reason: 'stop',
        prompt_eval_count: 51, eval_count: 385,
        prompt_eval_duration: 120000000, eval_duration: 2085000000,
        total_duration: 2448000000, load_duration: 125000000,
      }) + '\n');
    });
    return;
  }
  res.statusCode = 404; res.end('{}');
});

server.listen(0, '127.0.0.1', async () => {
  const HOST = '127.0.0.1:' + server.address().port;
  console.log('\nmoo — o tier local finalmente existe');

  try {
    const models = await moo.listModels(HOST, 1500);
    assert.strictEqual(models.length, 2);
    ok('lê /api/tags');
  } catch (e) { bad('lê /api/tags', e); }

  // ⚠️ v1.3.3 — este teste dizia "escolhe o mais pequeno" e estava a codificar
  // o comportamento ERRADO como correcto. Um modelo maior prepara melhor, e a
  // VRAM livre já é medida. A regra passa a ser: o maior que CABE.
  try {
    // o 70B pesa ~42 GB: só entra quando há VRAM para ele
    const grande = await moo.pickModel(null, HOST, null, { free_mb: 60000 });
    assert.strictEqual(grande, 'llama3.1:70b', 'com 60 GB livres devia escolher o maior que cabe');
    const m = await moo.pickModel(null, HOST, null, { free_mb: 20000 });
    assert.strictEqual(m, 'qwen2.5:3b', 'com 20 GB livres o 70B (42 GB) não cabe — escolhe o que cabe');
    const pequeno = await moo.pickModel(null, HOST, null, { free_mb: 3000 });
    assert.strictEqual(pequeno, 'qwen2.5:3b', 'com 3 GB livres só o pequeno cabe');
    const r = await moo.pickModel(null, HOST, [{ model: 'llama3.1:70b' }]);
    assert.strictEqual(r, 'llama3.1:70b', 'o residente na GPU tem prioridade — já está quente');
    ok('escolhe modelo: residente > maior que cabe, nunca inventado');
  } catch (e) { bad('escolhe modelo', e); }

  // ⚠️ o bug real de 2026-07-25: um embedder foi escolhido e o job morreu em
  // 102 ms. Enviesamento duplo — embedders são os menores E ficam residentes
  // por causa do RAG do vault. Quanto melhor o RAG, mais garantido o erro.
  try {
    assert.strictEqual(moo.isGenerative({ model: 'nomic-embed-text:latest' }), false);
    assert.strictEqual(moo.isGenerative({ model: 'bge-m3' }), false);
    assert.strictEqual(moo.isGenerative({ model: 'all-minilm' }), false);
    assert.strictEqual(moo.isGenerative({ model: 'qwen2.5:3b' }), true);
    const r = await moo.pickModel(null, HOST, [{ model: 'nomic-embed-text:latest' }], { free_mb: 20000 });
    assert.notStrictEqual(r, 'nomic-embed-text:latest', 'escolheu um embedder residente — o job morre em 102ms');
    assert.ok(r && r.indexOf('embed') < 0);
    ok('NUNCA escolhe um modelo de embeddings, mesmo residente');
  } catch (e) { bad('rejeita embedders', e); }

  // ⚠️ v1.4.2 — o CICLO VICIOSO, medido no ledger de 2026-07-25: os 4 jobs
  // locais do dia correram todos em qwen2.5:3b. Não por ser o melhor — por estar
  // carregado. E estava carregado porque o job minúsculo anterior o carregou.
  // Numa máquina com 19 GB de VRAM livres, o tier local ficou preso a 3B.
  try {
    const r = await moo.pickModelExplained(null, HOST, [{ model: 'qwen2.5:3b', size: 2159374499 }], { free_mb: 60000 });
    assert.strictEqual(r.model, 'llama3.1:70b', 'ficou preso ao 3B residente com 60 GB livres');
    assert.strictEqual(r.trocou_residente, 'qwen2.5:3b');
    assert.ok(/maior/.test(r.porque), 'trocou de modelo sem explicar porquê: ' + r.porque);
    assert.ok(r.custo, 'trocar de modelo custa arranque — tem de ser dito');
    ok('quebra o ciclo vicioso: 3B residente perde para o 70B que cabe');
  } catch (e) { bad('quebra o ciclo vicioso', e); }

  try {
    // sem VRAM para o grande, o residente pequeno é a escolha certa — e continua a sê-lo
    const r = await moo.pickModelExplained(null, HOST, [{ model: 'qwen2.5:3b', size: 2159374499 }], { free_mb: 3000 });
    assert.strictEqual(r.model, 'qwen2.5:3b');
    assert.ok(!r.trocou_residente, 'trocou para um modelo que não cabe');
    ok('sem VRAM para o maior, mantém o residente (e não força um arranque inútil)');
  } catch (e) { bad('mantém o residente quando não há VRAM', e); }

  try {
    // o residente JÁ é o melhor: não há troca nem custo de arranque
    const r = await moo.pickModelExplained(null, HOST, [{ model: 'llama3.1:70b', size: 42000000000 }], { free_mb: 60000 });
    assert.strictEqual(r.model, 'llama3.1:70b');
    assert.ok(!r.trocou_residente);
    ok('residente que já é o maior que cabe fica onde está');
  } catch (e) { bad('residente óptimo fica', e); }

  try {
    const r = await moo.pickModelExplained(null, '127.0.0.1:1', null);
    assert.strictEqual(r.model, null);
    assert.ok(/não tem nenhum modelo local/.test(r.porque), 'null sem explicação é indistinguível de avaria');
    ok('quando não há modelo, o porquê vem escrito');
  } catch (e) { bad('null explicado', e); }

  try {
    const nada = await moo.pickModel(null, '127.0.0.1:1', null);
    assert.strictEqual(nada, null, 'sem daemon tem de devolver null, não um nome plausível');
    ok('daemon em baixo → null, nunca um palpite');
  } catch (e) { bad('daemon em baixo', e); }

  // full run, writing the same NDJSON shape the cloud agents write
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-'));
    const outPath = path.join(dir, 'out.log');
    const out = fs.createWriteStream(outPath);
    const err = new PassThrough();
    const child = moo.runLocal({ hostStr: HOST, model: 'qwen2.5:3b', prompt: 'olá', outStream: out, errStream: err });

    const code = await new Promise((res) => child.on('close', res));
    assert.strictEqual(code, 0);
    await new Promise((r) => setTimeout(r, 60));

    const t = telemetry.readJobTelemetry(outPath, 3);
    assert.strictEqual(t.model, 'qwen2.5:3b');
    assert.strictEqual(t.tokens_in, 51, 'prompt_eval_count não chegou como tokens_in');
    assert.strictEqual(t.tokens_out, 385, 'eval_count não chegou como tokens_out');
    assert.ok(t.finished);
    assert.strictEqual(t.cost_usd, 0, 'local é zero MEDIDO, não desconhecido');
    assert.ok(/handoff/.test(t.activity), 'o texto gerado devia aparecer: ' + t.activity);

    const evs = telemetry.parseLines(fs.readFileSync(outPath, 'utf8'));
    const result = evs.find((e) => e.type === 'result');
    const tok_s = result.ollama.tok_s;
    assert.strictEqual(tok_s, Math.round(385 / (2085000000 / 1e9)), 'tok/s mal calculado (nanosegundos!)');
    assert.strictEqual(tok_s, 185, 'esperava ~185 tok/s, medido na 4090 em 2026-07-25');
    ok('corre, mede tokens reais e calcula ' + tok_s + ' tok/s (ns → s)');
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) { bad('corrida completa', e); }

  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-'));
    const out = fs.createWriteStream(path.join(dir, 'out.log'));
    const child = moo.runLocal({ hostStr: '127.0.0.1:1', model: 'x', prompt: 'y', outStream: out, errStream: new PassThrough() });
    const code = await new Promise((res) => child.on('close', res));
    assert.notStrictEqual(code, 0, 'daemon inalcançável tem de falhar, não fingir sucesso');
    ok('daemon inalcançável → exit != 0 e erro no log');
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) { bad('daemon inalcançável', e); }

  console.log('\n' + pass + ' testes moo' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
  server.close();
});
