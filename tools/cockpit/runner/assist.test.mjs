/**
 * assist.test.mjs — a doca do Moo responde, e recusa pelas razoes certas.
 *
 * O que estes testes defendem nao e "a funcao devolve texto": e que as tres
 * recusas do modulo continuam a ser recusas quando alguem mexer nele. Um relay
 * local que um dia comece a falar para fora, ou a aceitar um prompt de 2 MB, ou
 * a devolver 200 com um motor morto, deixa de ser aquilo por que foi comprado.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  escolherModelo, validarMensagem, perguntar,
  MAX_MENSAGEM, SISTEMA, NUM_PREDICT,
} from './assist.mjs';

const respostaOk = (texto, extra = {}) => async () => ({
  ok: true, status: 200, url: 'http://127.0.0.1:11434/api/generate',
  json: async () => ({ response: texto, eval_count: 42, ...extra }),
});

// ── a escada do modelo ───────────────────────────────────────────────────────

test('escolherModelo: o residente ganha — ja esta em VRAM', () => {
  const r = escolherModelo({
    residentes: [{ name: 'granite4.2:3b' }, { name: 'outro:7b' }],
    state: { modelo: 'qwen2.5-coder:14b' },
    env: {},
  });
  assert.deepEqual(r, { modelo: 'granite4.2:3b', fonte: 'residente' });
});

test('escolherModelo: sem residente cai no modelo da ultima ronda', () => {
  const r = escolherModelo({ residentes: [], state: { modelo: 'qwen2.5-coder:14b' }, env: {} });
  assert.deepEqual(r, { modelo: 'qwen2.5-coder:14b', fonte: 'ultima-ronda' });
});

test('escolherModelo: `residentes` a null (o /api/ps falhou) nao rebenta', () => {
  const r = escolherModelo({ residentes: null, state: { modelo: 'qwen2.5-coder:14b' }, env: {} });
  assert.equal(r.modelo, 'qwen2.5-coder:14b');
});

test('escolherModelo: MOO_ASSIST_MODELO manda em tudo — e o unico degrau do dono', () => {
  const r = escolherModelo({
    residentes: [{ name: 'granite4.2:3b' }],
    state: { modelo: 'qwen2.5-coder:14b' },
    env: { MOO_ASSIST_MODELO: 'llama3.2:1b' },
  });
  assert.deepEqual(r, { modelo: 'llama3.2:1b', fonte: 'MOO_ASSIST_MODELO' });
});

test('escolherModelo: sem nada devolve null, nunca um nome inventado', () => {
  assert.deepEqual(escolherModelo({ residentes: [], state: {}, env: {} }),
                   { modelo: null, fonte: null });
});

// ── a mensagem ───────────────────────────────────────────────────────────────

test('validarMensagem: vazia e recusada com o motivo, nao com um 500', () => {
  for (const v of [undefined, null, '', '   ', 42]) {
    const r = validarMensagem(v);
    assert.equal(r.ok, false, `${JSON.stringify(v)} devia ser recusada`);
    assert.match(r.erro, /mensagem/);
  }
});

test('validarMensagem: acima do tecto diz o tamanho medido E o tecto', () => {
  const r = validarMensagem('x'.repeat(MAX_MENSAGEM + 1));
  assert.equal(r.ok, false);
  assert.match(r.porque, new RegExp(String(MAX_MENSAGEM + 1)));
  assert.match(r.porque, new RegExp(String(MAX_MENSAGEM)));
});

test('validarMensagem: no limite exacto passa — o tecto e inclusivo', () => {
  assert.equal(validarMensagem('x'.repeat(MAX_MENSAGEM)).ok, true);
});

// ── as tres recusas ──────────────────────────────────────────────────────────

test('$0 DURO: um endpoint fora do loopback LANCA, nunca responde', async () => {
  for (const mau of ['https://api.openai.com', 'http://10.0.0.4:11434', 'http://127.0.0.1:8080']) {
    await assert.rejects(
      () => perguntar({ mensagem: 'ola', modelo: 'm', endpoint: mau, fetchImpl: respostaOk('x') }),
      /motor/,
      `${mau} tinha de ser recusado`,
    );
  }
});

test('sem tool-calls: o corpo enviado ao Ollama nao leva `tools` nem `format`', async () => {
  let enviado = null;
  await perguntar({
    mensagem: 'o que e um recibo?',
    modelo: 'granite4.2:3b',
    fetchImpl: async (url, opts) => { enviado = JSON.parse(opts.body); return (await respostaOk('um recibo e...')())  ; },
  });
  assert.ok(enviado, 'nao chegou a chamar o motor');
  assert.equal('tools' in enviado, false, 'um relay com ferramentas seria um segundo escritor');
  assert.equal('format' in enviado, false);
  assert.equal(enviado.stream, false);
  // A medicao de 2026-08-29: sem isto um modelo de raciocinio devolve vazio.
  assert.equal(enviado.think, false);
  assert.equal(enviado.options.num_predict, NUM_PREDICT);
  assert.equal(enviado.system, SISTEMA);
});

test('o redirect esta fechado — e a unica forma de sair do loopback a meio', async () => {
  let opts = null;
  await perguntar({
    mensagem: 'ola', modelo: 'm',
    fetchImpl: async (u, o) => { opts = o; return (await respostaOk('x')()); },
  });
  assert.equal(opts.redirect, 'error');
});

test('sem modelo: `ok:false` com o porque, e o motor nem chega a ser chamado', async () => {
  let chamou = false;
  const r = await perguntar({
    mensagem: 'ola', modelo: null,
    fetchImpl: async () => { chamou = true; return (await respostaOk('x')()); },
  });
  assert.equal(r.ok, false);
  assert.equal(chamou, false, 'nao se gasta GPU para descobrir que nao ha modelo');
  assert.match(r.porque, /nenhum modelo local/);
});

test('motor em baixo: `ok:false` com o codigo, nunca uma resposta inventada', async () => {
  const r = await perguntar({
    mensagem: 'ola', modelo: 'm',
    fetchImpl: async () => ({ ok: false, status: 500, url: 'http://127.0.0.1:11434/api/generate' }),
  });
  assert.equal(r.ok, false);
  assert.match(r.porque, /500/);
  assert.equal('texto' in r, false, 'sem texto e sem texto — nao ha placeholder');
});

test('resposta vazia (o modelo pensou em vez de escrever) nao passa por resposta', async () => {
  const r = await perguntar({ mensagem: 'ola', modelo: 'm', fetchImpl: respostaOk('   ') });
  assert.equal(r.ok, false);
  assert.match(r.porque, /sem texto/);
});

test('uma resposta boa traz texto, tokens, duracao e $0 estrutural', async () => {
  let t = 1000;
  const r = await perguntar({
    mensagem: 'ola', modelo: 'granite4.2:3b',
    fetchImpl: respostaOk('  tres frases.  '),
    agora: () => { t += 2500; return t; },
  });
  assert.equal(r.ok, true);
  assert.equal(r.texto, 'tres frases.');
  assert.equal(r.modelo, 'granite4.2:3b');
  assert.equal(r.tokens_out, 42);
  assert.equal(r.usd, 0);
  assert.ok(r.dur_s > 0);
});

test('um timeout diz quantos segundos esperou, nao "erro"', async () => {
  const r = await perguntar({
    mensagem: 'ola', modelo: 'm', timeoutMs: 30_000,
    fetchImpl: async () => { const e = new Error('This operation was aborted'); e.name = 'AbortError'; throw e; },
  });
  assert.equal(r.ok, false);
  assert.match(r.porque, /sem resposta em 30s/);
});

/**
 * O `redirect:'error'` ja impede que um pedido comecado no loopback acabe fora
 * dele — esta e a segunda tranca, sobre o `url` que a resposta declara. Nao
 * LANCA (ao contrario da guarda do endpoint, que e configuracao): chega como
 * `ok:false` com o motivo, para a doca poder dizer o que se passou. Nunca, em
 * caso nenhum, com o `texto` que veio dessa origem.
 */
test('uma resposta que venha de outra origem nao entrega texto — diz o porque', async () => {
  const r = await perguntar({
    mensagem: 'ola', modelo: 'm',
    fetchImpl: async () => ({ ok: true, status: 200, url: 'http://evil.example/api/generate', json: async () => ({ response: 'texto de fora' }) }),
  });
  assert.equal(r.ok, false);
  assert.match(r.porque, /motor tem de ser local/);
  assert.equal(r.texto, undefined, 'o texto de uma origem nao-local nunca chega ao dono');
});

test('o sistema proibe inventar numeros — a doca vive num painel que nao mente', () => {
  assert.match(SISTEMA, /n\/d/);
  assert.match(SISTEMA, /Never invent a figure/);
  assert.match(SISTEMA, /cannot read files, run commands, or change anything/);
});
