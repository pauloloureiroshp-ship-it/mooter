/**
 * proxy.test.mjs — o v0 julgado sobretudo pelo que RECUSA fazer.
 *
 * Um esqueleto de servidor testa-se ao contrario do habitual: as garantias que
 * interessam sao negativas (nao liga, nao ouve na rede, nao escala em silencio,
 * nao grava o prompt) e essas nao aparecem num teste de caminho feliz.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  criarProxy, ligado, guardaDeOrigem, promptDoCorpo, cabeNoLocal,
  escreverRecibo, contagensVazias, caminhoDoRecibo,
  FLAG, HOST, TIERS_LOCAIS,
} from './proxy.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// ── (b) nao se liga sozinho ─────────────────────────────────────────────────

test('sem a flag, criarProxy RECUSA-SE A CONSTRUIR — nao devolve servidor nenhum', () => {
  const r = criarProxy({ env: {} });
  assert.equal(r.ok, false);
  assert.equal(r.servidor, undefined, 'devolver um servidor parado deixa o listen() a uma linha de distancia');
  assert.equal(r.escutar, undefined);
  assert.match(r.porque, new RegExp(FLAG));
  assert.match(r.porque, /opt-in/);
});

test('a flag nao se liga com qualquer valor truthy', () => {
  assert.equal(ligado({ [FLAG]: '1' }), true);
  assert.equal(ligado({ [FLAG]: 'true' }), true);
  // `'0'` e `'false'` sao truthy em JS. Uma flag que os aceite liga-se com um
  // `MOOTER_M1_PROXY=0` mal lido — e isso e um servidor a arrancar por engano.
  assert.equal(ligado({ [FLAG]: '0' }), false);
  assert.equal(ligado({ [FLAG]: 'false' }), false);
  assert.equal(ligado({ [FLAG]: 'sim' }), false);
  assert.equal(ligado({}), false);
});

// ── (a) nao ouve na rede ────────────────────────────────────────────────────

test('nao existe caminho para 0.0.0.0 no ficheiro — e um invariante de texto, de proposito', () => {
  // Um teste de comportamento nao apanha isto: so se veria com o socket aberto
  // numa maquina numa rede real. O que se pode garantir e que a string nao esta
  // no ficheiro, e essa garantia vale mais do que nao ter garantia nenhuma.
  //
  // Codigo SEM comentarios, seguindo a convencao que o `cockpit-ux.test.mjs` ja
  // usa: uma regra citada num comentario nao e uma violacao dela. Sem isto, o
  // proprio comentario que explica porque nao ha `0.0.0.0` fazia o teste falhar.
  const bruto = fs.readFileSync(path.join(AQUI, 'proxy.mjs'), 'utf8');
  const fonte = bruto.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/0\.0\.0\.0/.test(fonte), 'apareceu um bind para todas as interfaces');
  assert.ok(!/'::'|"::"/.test(fonte), '`::` liga em todas as interfaces IPv6');
  assert.match(bruto, /0\.0\.0\.0/, 'e o comentario que o proibe tem de continuar la');
  assert.equal(HOST, '127.0.0.1');
});

test('o guarda recusa uma origem que nao seja loopback', () => {
  const req = (remoteAddress, host) => ({ socket: { remoteAddress }, headers: { host } });
  assert.equal(guardaDeOrigem(req('127.0.0.1', '127.0.0.1:4310')).ok, true);
  assert.equal(guardaDeOrigem(req('::1', 'localhost:4310')).ok, true);
  assert.equal(guardaDeOrigem(req('::ffff:127.0.0.1', 'localhost')).ok, true);

  const lan = guardaDeOrigem(req('192.168.1.44', 'localhost'));
  assert.equal(lan.ok, false);
  assert.match(lan.porque, /so do proprio computador/);

  // Rebinding de DNS: a socket e local mas o `Host` aponta para fora.
  const rebind = guardaDeOrigem(req('127.0.0.1', 'evil.example.com'));
  assert.equal(rebind.ok, false);
  assert.match(rebind.porque, /nao e loopback/);
});

// ── (c) nao escala em silencio ──────────────────────────────────────────────

test('o v0 so serve o que cabe no local, e recusa o resto DIZENDO porque', async () => {
  const recibos = [];
  const p = criarProxy({
    env: { [FLAG]: '1' },
    porta: 0,
    classifyImpl: () => ({ tier: 'T3' }),
    ollamaImpl: () => { throw new Error('o motor local NUNCA devia ser chamado para T3'); },
    reciboImpl: (r) => { recibos.push(r); return { ok: true }; },
  });
  assert.equal(p.ok, true);
  const { porta } = await p.escutar();
  try {
    const res = await fetch(`http://127.0.0.1:${porta}/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'desenha-me a arquitectura toda' }] }),
    });
    assert.equal(res.status, 501, 'um tier de nuvem tem de ser recusado, nao servido a medo');
    const b = await res.json();
    assert.match(b.error.message, /nao tem esse degrau/);
    assert.match(b.error.message, /escalar em silencio/, 'a recusa tem de dizer PORQUE e a funcionalidade');
    assert.equal(p.contagens.recusadas_sem_degrau, 1);
    assert.equal(p.contagens.servidas_local, 0);
    assert.equal(recibos.length, 1, 'uma recusa tambem deixa recibo — senao a porta so regista sucessos');
    assert.equal(recibos[0].ok, false);
  } finally { await p.fechar(); }
});

test('o que cabe no local e servido, e a resposta DIZ que a porta roteou', async () => {
  const p = criarProxy({
    env: { [FLAG]: '1' }, porta: 0,
    classifyImpl: () => ({ tier: 'T0' }),
    ollamaImpl: async () => ({ ok: true, text: 'ola', model: 'qwen2.5-coder:14b' }),
    reciboImpl: () => ({ ok: true }),
    agora: (() => { let n = 1000; return () => (n += 7); })(),
  });
  const { porta } = await p.escutar();
  try {
    const res = await fetch(`http://127.0.0.1:${porta}/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'qual e a capital?' }] }),
    });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.choices[0].message.content, 'ola');
    assert.equal(b.mooter.servido_por, 'ollama-local');
    assert.equal(b.mooter.tier, 'T0');
    assert.equal(p.contagens.servidas_local, 1);
    assert.equal(p.contagens.pela_porta, 1);
  } finally { await p.fechar(); }
});

test('o motor local em baixo da 502 — nao um 200 com texto vazio', async () => {
  const p = criarProxy({
    env: { [FLAG]: '1' }, porta: 0,
    classifyImpl: () => ({ tier: 'T1' }),
    ollamaImpl: async () => null,          // o contrato dos providers: null e falha suave
    reciboImpl: () => ({ ok: true }),
  });
  const { porta } = await p.escutar();
  try {
    const res = await fetch(`http://127.0.0.1:${porta}/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
    });
    assert.equal(res.status, 502);
    assert.equal(p.contagens.servidas_local, 0);
  } finally { await p.fechar(); }
});

test('uma rota que nao existe diz QUAIS existem', async () => {
  const p = criarProxy({ env: { [FLAG]: '1' }, porta: 0, classifyImpl: () => ({ tier: 'T0' }) });
  const { porta } = await p.escutar();
  try {
    const res = await fetch(`http://127.0.0.1:${porta}/v1/embeddings`, { method: 'POST' });
    assert.equal(res.status, 404);
    assert.match((await res.json()).error.message, /so \/v1\/models e \/v1\/chat\/completions/);
  } finally { await p.fechar(); }
});

// ── (e) o recibo nao pode levar o prompt ────────────────────────────────────

test('o recibo grava o que prova a rota — e NAO ha por onde o prompt entrar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm1-'));
  const ficheiro = path.join(dir, 'r.jsonl');
  const r = escreverRecibo({
    tier: 'T0', modelo: 'qwen2.5-coder:14b', ok: true, ms: 42, porque: 'servido pelo motor local',
    // Tentativa deliberada de contrabando: se a allowlist nao existisse, isto
    // aterrava no disco. E assim que um prompt sai de uma maquina sem ninguem
    // ter decidido que saia.
    prompt: 'A CHAVE DO DONO E 1234', messages: [{ role: 'user', content: 'segredo' }],
  }, { ficheiro });
  assert.equal(r.ok, true);
  const escrito = fs.readFileSync(ficheiro, 'utf8');
  assert.ok(!/CHAVE DO DONO/.test(escrito), 'o conteudo do prompt chegou ao disco');
  assert.ok(!/segredo/.test(escrito));
  assert.ok(!/prompt|messages/.test(escrito), 'nem sequer as chaves passam');
  const linha = JSON.parse(escrito.trim());
  assert.equal(linha.tier, 'T0');
  assert.equal(linha.modelo, 'qwen2.5-coder:14b');
  assert.equal(linha.ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('um recibo que nao se consegue escrever nao parte a chamada', () => {
  const r = escreverRecibo({ tier: 'T0', ok: true },
    { ficheiro: '/x/y/z.jsonl', mkdirImpl: () => { throw new Error('EROFS'); } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /EROFS/);
});

// ── as DUAS contagens ───────────────────────────────────────────────────────

test('as contagens nascem separadas, e nao ha um total que as funda', () => {
  const c = contagensVazias();
  assert.deepEqual(Object.keys(c).sort(),
    ['pela_porta', 'recusadas_guarda', 'recusadas_sem_degrau', 'servidas_local'].sort());
  // Nao existe `total` de proposito: a obediencia do hook (7/3026) e a da porta
  // tem denominadores diferentes, e um campo chamado `total` seria o convite
  // para os somar. O mapa proibe reciclar o numero velho no funil novo.
  assert.ok(!('total' in c));
  assert.ok(!('obediencia_pct' in c), 'uma percentagem aqui teria de escolher um denominador');
});

// ── auxiliares ──────────────────────────────────────────────────────────────

test('o prompt e a ULTIMA mensagem do utilizador, nao a primeira', () => {
  assert.equal(promptDoCorpo({ messages: [
    { role: 'user', content: 'velha' },
    { role: 'assistant', content: 'resposta' },
    { role: 'user', content: 'nova' },
  ] }), 'nova');
  assert.equal(promptDoCorpo({ messages: [{ role: 'system', content: 'so sistema' }] }), null);
  assert.equal(promptDoCorpo({}), null);
  assert.equal(promptDoCorpo(null), null);
});

test('so T0 e T1 cabem no local — e um tier desconhecido NAO cabe', () => {
  assert.deepEqual([...TIERS_LOCAIS], ['T0', 'T1']);
  assert.equal(cabeNoLocal('T0'), true);
  assert.equal(cabeNoLocal('t1'), true);
  assert.equal(cabeNoLocal('T2'), false);
  assert.equal(cabeNoLocal('T5'), false, 'o Fable e opt-in por @fable e nunca por aqui');
  // Fail-closed: um tier que o classificador nao soube dar nao pode virar local
  // por omissao. Servir a medo e a mesma coisa que escalar a medo.
  assert.equal(cabeNoLocal(null), false);
  assert.equal(cabeNoLocal(''), false);
  assert.equal(cabeNoLocal('desconhecido'), false);
});

test('o recibo vai para ~/.mooter, nunca para o repo', () => {
  const p = caminhoDoRecibo({ home: '/casa' });
  assert.equal(p.split(path.sep).join('/'), '/casa/.mooter/m1-proxy.jsonl');
});
