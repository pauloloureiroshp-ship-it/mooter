'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');

const kimi = require('./kimi-adapter.js');

function capture() {
  const out = [];
  const err = [];
  const outStream = new PassThrough();
  const errStream = new PassThrough();
  outStream.on('data', (chunk) => out.push(chunk));
  errStream.on('data', (chunk) => err.push(chunk));
  return {
    outStream,
    errStream,
    outText: () => Buffer.concat(out).toString('utf8'),
    errText: () => Buffer.concat(err).toString('utf8'),
  };
}

function closeCode(child) {
  return new Promise((resolve) => child.once('close', resolve));
}

function events(text) {
  return String(text).split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('caminho feliz usa a API OpenAI-compatible, Bearer auth e custo medido', async () => {
  const io = capture();
  const apiKey = 'moonshot-test-secret';
  let request = null;
  const child = kimi.runKimi({
    apiKey,
    prompt: 'Responde apenas ok.',
    timeoutMs: 100,
    outStream: io.outStream,
    errStream: io.errStream,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: 'chatcmpl-kimi-1', model: 'kimi-k3',
            choices: [{ message: { role: 'assistant', content: 'ok' } }],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 100,
              prompt_tokens_details: { cached_tokens: 200 },
            },
          };
        },
      };
    },
  });
  assert.strictEqual(await closeCode(child), 0);
  assert.strictEqual(request.url, 'https://api.moonshot.ai/v1/chat/completions');
  assert.strictEqual(request.options.headers.authorization, 'Bearer ' + apiKey);
  const payload = JSON.parse(request.options.body);
  assert.strictEqual(payload.model, 'kimi-k3');
  assert.strictEqual(payload.messages[0].content, 'Responde apenas ok.');
  const output = io.outText();
  assert.ok(!output.includes(apiKey), 'a key apareceu no stream/ledger');
  const result = events(output).find((event) => event.type === 'result');
  assert.strictEqual(result.result, 'ok');
  assert.strictEqual(result.provider_label, 'Moonshot · nuvem');
  assert.strictEqual(result.total_cost_usd, 0.00396);
  assert.strictEqual(result.cost_breakdown.input_cache_miss_tokens, 800);
  assert.strictEqual(result.cost_breakdown.input_cache_hit_tokens, 200);
});

test('sem key falha claramente e nunca chama a rede', async () => {
  const io = capture();
  let calls = 0;
  const child = kimi.runKimi({
    apiKey: '${user_config.moonshot_api_key}',
    prompt: 'olá',
    outStream: io.outStream,
    errStream: io.errStream,
    fetchImpl: async () => { calls++; throw new Error('não devia correr'); },
  });
  assert.strictEqual(await closeCode(child), 1);
  assert.strictEqual(calls, 0);
  const result = events(io.outText()).find((event) => event.type === 'result');
  assert.strictEqual(result.result, 'MOONSHOT_API_KEY não configurada — platform.moonshot.ai');
  assert.match(io.errText(), /MOONSHOT_API_KEY não configurada/);
});

test('timeout continua activo até ao fim do body e aborta response.json pendurado', async () => {
  const io = capture();
  let signal = null;
  const child = kimi.runKimi({
    apiKey: 'timeout-test-key',
    prompt: 'demora',
    timeoutMs: 15,
    outStream: io.outStream,
    errStream: io.errStream,
    fetchImpl: async (url, options) => {
      signal = options.signal;
      return {
        ok: true,
        status: 200,
        json: () => new Promise(() => {}),
      };
    },
  });
  assert.strictEqual(await closeCode(child), 1);
  assert.strictEqual(signal.aborted, true);
  const result = events(io.outText()).find((event) => event.type === 'result');
  assert.match(result.result, /timeout de 15 ms/);
});

test('custo separa cache miss, cache hit e output pelos preços declarados', () => {
  const cost = kimi.calculateCost({
    prompt_tokens: 1000000,
    completion_tokens: 100000,
    prompt_tokens_details: { cached_tokens: 250000 },
  });
  assert.deepStrictEqual(cost, {
    total_usd: 3.825,
    input_cache_miss_tokens: 750000,
    input_cache_hit_tokens: 250000,
    output_tokens: 100000,
    rates_usd_per_million: {
      input_cache_miss: 3,
      input_cache_hit: 0.30,
      output: 15,
    },
  });

  const missingCache = kimi.calculateCost({
    prompt_tokens: 1000,
    completion_tokens: 100,
  });
  assert.strictEqual(missingCache.total_usd, null);
  assert.strictEqual(missingCache.input_cache_miss_tokens, null);
  assert.strictEqual(missingCache.input_cache_hit_tokens, null);
  assert.match(missingCache.unavailable_reason, /sem detalhe de cache/);

  const emptyTokens = kimi.calculateCost({
    prompt_tokens: '',
    completion_tokens: 10,
    prompt_tokens_details: { cached_tokens: 0 },
  });
  assert.strictEqual(emptyTokens.total_usd, null);
  assert.strictEqual(emptyTokens.input_cache_miss_tokens, null);
  assert.match(emptyTokens.unavailable_reason, /sem tokens de input\/output/);
});

test('wiring expõe kimi nas duas tools, no manifest e sem key no comando', () => {
  const seam = require('./seamless.js');
  const tools6 = require('./tools6.js');
  const work = tools6.build(seam, {}, {}).find((tool) => tool.name === 'mooter_work');
  assert.ok(work.inputSchema.properties.agent.enum.includes('kimi'));
  const command = seam.buildCommand('kimi', __dirname, 'Read', null, 'teste');
  assert.strictEqual(command.bin, '(moonshot)');
  assert.ok(!JSON.stringify(command).includes('MOONSHOT_API_KEY'));
  assert.strictEqual(seam.cliModelFor('kimi', 'T2', 'sonnet'), 'kimi-k3');
  for (const verdict of ['SHIP', 'NO-SHIP']) {
    const guarded = seam.veredictoSemEvidencia({ agent: 'kimi', evidencia: null }, verdict);
    assert.strictEqual(guarded.degradado, true, verdict + ' devia activar o guard');
    assert.match(guarded.texto, /Moonshot · nuvem/);
    assert.doesNotMatch(guarded.texto, /motor local/);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  // O kimi tem de constar das entregas de ALGUMA versão — não da corrente. Exigir
  // a corrente fazia o teste rebentar em todo o bump que não tocasse no kimi (foi
  // o que aconteceu na 1.45.0, que entregou só fatia-local.js).
  const deliveries = JSON.parse(fs.readFileSync(path.join(__dirname, 'entregas-por-versao.json'), 'utf8'));
  assert.ok(
    Object.values(deliveries).some((ficheiros) => ficheiros.includes('kimi-adapter.js')),
    'kimi-adapter.js tem de constar das entregas de alguma versão',
  );
  assert.strictEqual(manifest.server.mcp_config.env.MOONSHOT_API_KEY, '${user_config.moonshot_api_key}');
  assert.strictEqual(manifest.user_config.moonshot_api_key.sensitive, true);
});

// --- P1-E #3 · tecto por categoria -------------------------------------------
// Uma auditoria pede leitura longa + escrita longa e, com stream:false, nada
// chega antes do fim: o tecto de 240 s matava o pedido inteiro e o trabalho
// perdia-se completo, não parcial.

test('auditoria tem tecto maior que o default, e o default não se mexeu', () => {
  assert.strictEqual(kimi.timeoutParaCategoria('auditoria').ms, 900000);
  assert.ok(kimi.timeoutParaCategoria('auditoria').ms > kimi.DEFAULT_TIMEOUT_MS);
  assert.strictEqual(kimi.DEFAULT_TIMEOUT_MS, 240000, 'o default é a rede de segurança — não sobe por arrasto');
});

test('categoria desconhecida ou ausente cai no default — nunca herda o tecto generoso', () => {
  for (const cat of [undefined, null, '', '   ', 'inventada', 42]) {
    const t = kimi.timeoutParaCategoria(cat);
    assert.strictEqual(t.ms, kimi.DEFAULT_TIMEOUT_MS, `categoria ${JSON.stringify(cat)} escapou para um tecto maior`);
  }
});

test('o tecto diz sempre de onde veio — um número mudo não se audita', () => {
  assert.match(kimi.timeoutParaCategoria('auditoria').fonte, /categoria "auditoria"/);
  assert.match(kimi.timeoutParaCategoria('inventada').fonte, /desconhecida/);
  assert.match(kimi.timeoutParaCategoria(undefined, 5000).fonte, /explícito/);
});

test('opts.timeoutMs explícito ganha à categoria', () => {
  assert.strictEqual(kimi.timeoutParaCategoria('auditoria', 1234).ms, 1234);
});

test('a categoria é normalizada, não é sensível a maiúsculas ou espaços', () => {
  assert.strictEqual(kimi.timeoutParaCategoria('  AUDITORIA  ').ms, 900000);
});
