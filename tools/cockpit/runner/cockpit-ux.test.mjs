/**
 * cockpit-ux.test.mjs — regressões de interface, fixadas como testes.
 *
 * Nasceu de um bug real: com o device a trabalhar bem, o botão "▶ Trabalhar"
 * aparecia cinzento, porque eu desligava-o quando `state.running` era true. Do
 * lado de quem olha, um produto que funciona ficou indistinguível de um produto
 * partido. A lição não é "corrigir aquela linha" — é que **um controlo primário
 * nunca pode renderizar-se morto enquanto o sistema está alcançável**, e isso
 * tem de ser verificável e não uma intenção.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildFeed, FEED_LENGTH } from './fleet-state.mjs';
import { deviceName, portOpen, loopAlive } from './launch.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const SHELL = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-pilot-shell.html'), 'utf8');
const SCRIPT = /<script>([\s\S]*)<\/script>/.exec(SHELL)[1];
/** Código sem comentários: uma regra citada num comentário não é uma violação. */
const CODE = SCRIPT.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

// ── o bug que o dono apanhou ─────────────────────────────────────────────────

test('o controlo primário NUNCA se desliga por o sistema estar a funcionar', () => {
  // A regressão original: `btn.disabled = ... || state.running`.
  assert.ok(
    !/disabled\s*=[^;]*state\.running/.test(CODE),
    'o botão não pode ser desligado por state.running — trabalhar é o estado bom',
  );
  assert.ok(!/\.disabled\s*=\s*true/.test(CODE), 'nada de disabled=true no controlo primário');
});

test('o toggle diz a ACÇÃO que faz, não o estado em que o sistema está', () => {
  assert.match(SCRIPT, /running \? '⏸ Parar de trabalhar' : '▶ Trabalhar'/);
  assert.match(SCRIPT, /control\(running \? '\/stop' : '\/play'/, 'um botão só, dois destinos');
});

test('endpoint inalcançável dá instruções, nunca um botão morto', () => {
  assert.match(SCRIPT, /function renderToggleOffline/);
  assert.match(SCRIPT, /b\.hidden = true;/, 'offline esconde o controlo em vez de o cinzentar');
  assert.match(SHELL, /npm run pilot/, 'e mostra o comando exacto que o levanta');
});

test('um comando só é dado como aplicado quando o loop confirma', () => {
  assert.match(SCRIPT, /expecting = \{ running:expectRunning/);
  assert.match(SCRIPT, /function confirmPending/);
  assert.match(SCRIPT, /ainda não mudou de estado/, 'tem de haver saída honesta quando não pega');
});

// ── o snapshot não se finge cockpit ──────────────────────────────────────────

test('em instantâneo a página explica onde está o cockpit a sério', () => {
  assert.match(SCRIPT, /instantâneo gravado, não o estado ao vivo/);
  assert.match(SCRIPT, /127\.0\.0\.1:4290\/panel/, 'tem de dar o endereço vivo');
});

// ── honestidade que não pode regredir ────────────────────────────────────────

test('não existe caminho onde a ausência de valor vire um número', () => {
  assert.match(SCRIPT, /const nd = \(v, fmt\)/);
  // `|| 0` transforma "não sei" em "zero" — é a forma mais discreta de mentir
  // num painel. Não existe caso legítimo dele neste ficheiro.
  assert.ok(!/\|\|\s*0\b/.test(CODE), 'nada de fallback para 0 em valores medidos');
  assert.match(SCRIPT, /if \(fails >= 2\) offline/, 'duas falhas seguidas = desconectado declarado');
});

test('a legenda desarma a leitura errada de "citação-ok"', () => {
  assert.match(SHELL, /Não<\/b> quer dizer que o\s+achado está certo/);
});

// ── UX/performance ───────────────────────────────────────────────────────────

test('o painel não redesenha secções que não mudaram', () => {
  assert.match(SCRIPT, /const changed = \(key, value\)/);
  for (const sec of ['gpu', 'tally', 'pillars', 'engine', 'align', 'feed']) {
    assert.match(SCRIPT, new RegExp(`changed\\('${sec}'`), `a secção ${sec} redesenha sempre`);
  }
});

test('o catálogo de pilares vem do servidor — página e runner não podem divergir', () => {
  assert.match(SCRIPT, /\/pilares\.json/);
  const server = fs.readFileSync(path.join(REPO, 'tools/cockpit/runner/f10-server.mjs'), 'utf8');
  assert.match(server, /route === '\/pilares\.json'/);
  // O catalogo passou a vir do conjunto EM USO (embutido ou do projecto, ver
  // context-pack.loadPillars), nao da constante embutida. A alegacao e a mesma
  // e fica mais forte: a pergunta que viaja e a do pilar que o loop vai correr.
  assert.match(server, /pergunta: pilares\.pillars\[id\]\.ask/, 'a pergunta real do pilar tem de viajar');
  assert.match(server, /fonte: pilares\.fonte/, 'e o painel tem de saber se os pilares sao do projecto ou os embutidos');
});

test('a sparkline declara que é da sessão do painel, não histórico do device', () => {
  assert.match(SCRIPT, /amostras nesta sessão do painel/);
});

test('o painel abre sem rede externa e respeita reduced-motion', () => {
  assert.ok(!/src="http|href="http|@import/.test(SHELL), 'nenhum recurso externo');
  assert.match(SHELL, /prefers-reduced-motion/);
});

// ── feed ─────────────────────────────────────────────────────────────────────

test('buildFeed devolve os mais recentes primeiro e limita o tamanho', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ ts: `t${i}`, pilar: 'P1', verdict: 'citacao-ok' }));
  const feed = buildFeed(many);
  assert.equal(feed.length, FEED_LENGTH);
  assert.equal(feed[0].ts, 't49', 'o mais recente vem primeiro');
});

test('buildFeed nunca inventa campos em falta', () => {
  const [row] = buildFeed([{ ts: 'x' }]);
  assert.equal(row.verdict, null);
  assert.equal(row.dur_s, null);
  assert.equal(row.ficheiro, null);
});

// ── launcher ─────────────────────────────────────────────────────────────────

test('o device é identificado por hostname, com override explícito', () => {
  const antes = process.env.MOOTER_DEVICE;
  process.env.MOOTER_DEVICE = 'rtx-4090';
  assert.equal(deviceName(), 'rtx-4090');
  delete process.env.MOOTER_DEVICE;
  assert.ok(deviceName().length > 0, 'sem override tem de cair no hostname');
  if (antes !== undefined) process.env.MOOTER_DEVICE = antes;
});

test('portOpen responde false sem lançar numa porta fechada', async () => {
  assert.equal(await portOpen(1, '127.0.0.1', 300), false);
});

test('loopAlive é false para lock inexistente ou PID morto', () => {
  assert.equal(loopAlive('/caminho/que/nao/existe'), false);
});

test('o lançador mostra os controlos mas NUNCA levanta o STOP sozinho', () => {
  const launch = fs.readFileSync(path.join(REPO, 'tools/cockpit/runner/launch.mjs'), 'utf8');
  assert.ok(!/rmSync\(STOP|unlink.*STOP/.test(launch), 'lançar não pode revogar o kill-switch');
  assert.match(launch, /gesto é teu/i, 'e tem de dizer que o ▶ é do dono');
});
