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


  // ⚠️ APANHADO AO VIVO a 2026-07-26: um job de PREPARACAO (o moo a amaciar o
  // caminho ao agente pago, a $0) chegou a 140 376 caracteres de raciocinio em
  // 6 minutos e continuava. Um preparador que demora mais do que o trabalho que
  // prepara nao poupa nada — atrasa, com a GPU ocupada e o pago a espera.
  try {
    const src = require('fs').readFileSync(__dirname + '/moo.js', 'utf8');
    assert.ok(/MAX_RACIOCINIO/.test(src), 'o raciocinio local voltou a ficar sem trela');
    assert.ok(/raciocinio-cortado/.test(src), 'corta sem dizer ao painel que cortou');
    // a trela e sobre o PREAMBULO: nunca cortar uma resposta ja comecada
    assert.ok(/!text && pensamento\.length > MAX_RACIOCINIO/.test(src),
      'pode cortar uma resposta a meio — so o preambulo interno pode ser interrompido');
    assert.ok(moo.MAX_RACIOCINIO >= 5000, 'trela curta de mais: cortaria trabalho legitimo');
    ok('trela no raciocinio: corta o preambulo infinito, nunca a resposta');
  } catch (e) { bad('trela no raciocinio', e); }
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

  /**
   * ── ONDA 1 (2026-07-26) — o selector deixa de escolher o mais velho por 1 GB ──
   * Roster REAL desta máquina, medido via /api/tags hoje. O caso que motivou
   * tudo: qwen3:30b (18,5 GB, 2025) ganhava ao qwen3.6:27b (17,4 GB, Abr 2026).
   */
  const roster = http.createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ models: [
        { model: 'qwen3.6:35b-a3b', size: 25661243776 },
        { model: 'qwen3:30b', size: 19864223744 },
        { model: 'qwen3.6:27b', size: 18682238976 },
        { model: 'qwen2.5-coder:14b', size: 9663676416 },
        { model: 'gemma4:e4b', size: 10307921510 },
        { model: 'qwen2.5-coder:7b', size: 5046586573 },
        { model: 'qwen2.5:3b', size: 2159374499 },
      ] }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => roster.listen(0, '127.0.0.1', r));
  const RHOST = '127.0.0.1:' + roster.address().port;

  try {
    // 23 GB de VRAM: o 35b (23,9 GB) não cabe. O 3.6:27b TEM de ganhar ao 3:30b.
    const r = await moo.pickModelExplained(null, RHOST, null, { free_mb: 23028 });
    assert.strictEqual(r.model, 'qwen3.6:27b', 'a geração de Abril 2026 perdeu para o modelo de 2025 por 1 GB: ' + r.model);
    assert.ok(/geração 3\.6/.test(r.porque) && /ganhou a/.test(r.porque), 'a escolha tem de se explicar em linguagem de gente: ' + r.porque);
    ok('ONDA 1.3: qwen3.6:27b ganha ao qwen3:30b (geração > 1 GB)');
  } catch (e) { bad('geração ganha a tamanho', e); }

  try {
    // tarefa de código → o especialista ganha ao generalista maior
    const r = await moo.pickModelExplained(null, RHOST, null, { free_mb: 23028, goal: 'corrige o bug na função parseTelemetry do ficheiro telemetry.js' });
    assert.strictEqual(r.model, 'qwen2.5-coder:14b', 'tarefa de código devia ir para o *-coder: ' + r.model);
    ok('ONDA 1.3: pedido de código vai para o qwen2.5-coder:14b');
  } catch (e) { bad('código → coder', e); }

  try {
    // o residente de geração mais antiga NÃO bloqueia a troca (a inércia era o bug)
    const r = await moo.pickModelExplained(null, RHOST, [{ model: 'qwen3:30b', size: 19864223744 }], { free_mb: 23028 });
    assert.strictEqual(r.model, 'qwen3.6:27b', 'o residente de 2025 voltou a bloquear a geração nova: ' + r.model);
    assert.strictEqual(r.trocou_residente, 'qwen3:30b');
    ok('ONDA 1.3: residente qwen3:30b (2025) é trocado pelo qwen3.6:27b (2026)');
  } catch (e) { bad('residente antigo não bloqueia', e); }

  try {
    // residente da MESMA geração e calibre fica — recarregar por nada é desperdício
    const r = await moo.pickModelExplained(null, RHOST, [{ model: 'qwen3.6:27b', size: 18682238976 }], { free_mb: 23028 });
    assert.strictEqual(r.model, 'qwen3.6:27b');
    assert.ok(!r.trocou_residente, 'trocou um residente que já era a melhor escolha');
    ok('ONDA 1.3: residente que é a melhor escolha fica quente');
  } catch (e) { bad('residente óptimo fica (roster real)', e); }

  try {
    // ── ONDA 1.1/1.2: o payload leva num_ctx>=16384 e keep_alive — medido, não assumido
    let visto = null;
    const eco = http.createServer((req, res) => {
      let b = ''; req.on('data', (d) => { b += d; });
      req.on('end', () => {
        visto = JSON.parse(b);
        res.setHeader('content-type', 'application/x-ndjson');
        res.end(JSON.stringify({ model: visto.model, done: true, done_reason: 'stop', message: { role: 'assistant', content: 'ok' }, prompt_eval_count: 1, eval_count: 1, eval_duration: 1e9 }) + '\n');
      });
    });
    await new Promise((r) => eco.listen(0, '127.0.0.1', r));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-ctx-'));
    const out = fs.createWriteStream(path.join(dir, 'out.log'));
    const child = moo.runLocal({ hostStr: '127.0.0.1:' + eco.address().port, model: 'x', prompt: 'olá', outStream: out, errStream: new PassThrough() });
    await new Promise((res) => child.on('close', res));
    assert.ok(visto && visto.options && visto.options.num_ctx >= 16384,
      'num_ctx não foi enviado ou é < 16384 — o Ollama volta ao default 4096: ' + JSON.stringify(visto && visto.options));
    assert.ok(visto.keep_alive, 'sem keep_alive cada troca de modelo paga 18 GB de recarregamento');
    assert.strictEqual(visto.options.temperature, 0.2);
    eco.close(); fs.rmSync(dir, { recursive: true, force: true });
    ok('ONDA 1.1: num_ctx=' + visto.options.num_ctx + ' e keep_alive=' + visto.keep_alive + ' vão no payload');
  } catch (e) { bad('num_ctx/keep_alive no payload', e); }

  try {
    // ── ONDA 1.2: contexto que não cabe é DITO, com números — nunca em silêncio
    let visto2 = null;
    const eco2 = http.createServer((req, res) => {
      let b = ''; req.on('data', (d) => { b += d; });
      req.on('end', () => { visto2 = JSON.parse(b); res.end(JSON.stringify({ model: visto2.model, done: true, message: { content: 'ok' }, eval_count: 1, prompt_eval_count: 1, eval_duration: 1e9 }) + '\n'); });
    });
    await new Promise((r) => eco2.listen(0, '127.0.0.1', r));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-trunc-'));
    const outPath = path.join(dir, 'out.log');
    const out = fs.createWriteStream(outPath);
    const gigante = 'x'.repeat(140000);   // ~40k tokens estimados > teto 32768
    const child = moo.runLocal({ hostStr: '127.0.0.1:' + eco2.address().port, model: 'x', prompt: gigante, outStream: out, errStream: new PassThrough() });
    await new Promise((res) => child.on('close', res));
    await new Promise((r) => setTimeout(r, 60));
    const evs = telemetry.parseLines(fs.readFileSync(outPath, 'utf8'));
    const init = evs.find((e) => e.type === 'system');
    assert.ok(init.contexto_truncado && init.contexto_truncado.tokens_estimados > init.contexto_truncado.num_ctx,
      'o corte de contexto tem de ser declarado com números, não null');
    eco2.close(); fs.rmSync(dir, { recursive: true, force: true });
    ok('ONDA 1.2: truncagem declarada (' + init.contexto_truncado.tokens_estimados + ' tokens > num_ctx ' + init.contexto_truncado.num_ctx + ')');
  } catch (e) { bad('truncagem declarada', e); }

  roster.close();

  console.log('\n' + pass + ' testes moo' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
  server.close();
});
