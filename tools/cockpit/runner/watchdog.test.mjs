/**
 * watchdog.test.mjs — o `KeepAlive` cobre um caso; este cobre o que acontece mais.
 *
 * Um `KeepAlive` de launchd relanca o processo quando ele MORRE. O modo de
 * falha que o dono encontra e outro: processo vivo, endpoint inutil — a porta
 * aceita, o 200 vem sem payload, o cockpit fica em branco. Do lado do launchd
 * isso e um servico saudavel.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const {
  sondar, uptime, registar, lerRegisto, FALHAS_PARA_ALERTA, JANELA_H, PORTA,
} = await import('./watchdog.mjs');

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const T0 = Date.parse('2026-09-01T12:00:00Z');
const resposta = (status, body) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
});

// ── a sondagem ──────────────────────────────────────────────────────────────

test('200 com payload util = vivo', async () => {
  const r = await sondar({ fetchImpl: async () => resposta(200, { running: true, recibos: {} }), agora: T0 });
  assert.equal(r.ok, true);
  assert.equal(r.estado, 'vivo');
});

test('O CASO QUE O KEEPALIVE NAO VE: 200 com payload inutil = falha', async () => {
  const r = await sondar({ fetchImpl: async () => resposta(200, { ola: 1 }), agora: T0 });
  assert.equal(r.ok, false);
  assert.equal(r.estado, 'payload-inutil');
  assert.equal(r.http, 200, 'o HTTP estava OK — e o cockpit estava em branco');
});

test('503 NAO conta como falha — o device respondeu, e pediu para esperar', async () => {
  const r = await sondar({ fetchImpl: async () => resposta(503, {}), agora: T0 });
  assert.equal(r.ok, true);
  assert.equal(r.estado, 'throttled');
});

test('sem resposta e falha, e diz porque — nunca rebenta', async () => {
  const r = await sondar({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); }, agora: T0 });
  assert.equal(r.ok, false);
  assert.equal(r.estado, 'sem-resposta');
  assert.match(r.porque, /ECONNREFUSED/);
});

test('um HTTP mau qualquer e falha', async () => {
  assert.equal((await sondar({ fetchImpl: async () => resposta(500, {}), agora: T0 })).estado, 'http');
});

// ── o uptime ────────────────────────────────────────────────────────────────

const linha = (ms, ok) => ({ ts: new Date(ms).toISOString(), ok });

test('SEM SONDAGENS o uptime e n/d — 0 sondagens nao sao 0%', () => {
  const u = uptime([], { agora: T0 });
  assert.equal(u.pct, null);
  assert.equal(u.alerta, false);
  assert.match(u.porque, /^n\/d/);
});

test('conta so a janela, e o que ficou para tras nao afunda o numero de hoje', () => {
  const u = uptime([
    linha(T0 - 48 * 3600e3, false), linha(T0 - 47 * 3600e3, false),
    linha(T0 - 3600e3, true), linha(T0 - 1800e3, true),
  ], { agora: T0 });
  assert.equal(u.sondagens, 2);
  assert.equal(u.pct, 100);
});

test('ALERTA so com falhas SEGUIDAS no fim — falhas espalhadas nao alarmam', () => {
  const espalhadas = uptime([
    linha(T0 - 5000, false), linha(T0 - 4000, true), linha(T0 - 3000, false),
    linha(T0 - 2000, true), linha(T0 - 1000, false), linha(T0 - 500, true),
  ], { agora: T0 });
  assert.equal(espalhadas.alerta, false);
  assert.equal(espalhadas.seguidas, 0);

  const seguidas = uptime([
    linha(T0 - 5000, true), linha(T0 - 3000, false), linha(T0 - 2000, false), linha(T0 - 1000, false),
  ], { agora: T0 });
  assert.equal(seguidas.seguidas, 3);
  assert.equal(seguidas.alerta, true);
  assert.match(seguidas.porque, /SEGUIDAS/);
});

test('as constantes estao onde se possam discutir', () => {
  assert.equal(FALHAS_PARA_ALERTA, 3);
  assert.equal(JANELA_H, 24);
  assert.equal(PORTA, 4290);
});

// ── o registo sobrevive ao reinicio ─────────────────────────────────────────

test('o registo e APPEND-ONLY e le-se de volta', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'wd-'));
  registar({ ts: '2026-09-01T12:00:00Z', ok: true }, { mooDir: dir });
  registar({ ts: '2026-09-01T12:01:00Z', ok: false }, { mooDir: dir });
  const l = lerRegisto({ mooDir: dir });
  assert.equal(l.length, 2);
  assert.equal(l[1].ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('sem registo nenhum devolve lista vazia, nao rebenta', () => {
  assert.deepEqual(lerRegisto({ mooDir: '/nao/existe' }), []);
});

test('uma linha corrompida nao deita fora o registo inteiro', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'wd-'));
  fs.writeFileSync(path.join(dir, 'watchdog.jsonl'), '{"ts":"a","ok":true}\nlixo\n{"ts":"b","ok":false}\n');
  assert.equal(lerRegisto({ mooDir: dir }).length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── nao reinicia nada ───────────────────────────────────────────────────────

test('o watchdog NAO relanca nada — isso e uma decisao do dono', () => {
  const src = fs.readFileSync(path.join(AQUI, 'watchdog.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const proibido of ['execSync', 'spawn', 'launchctl', 'kill']) {
    assert.ok(!src.includes(proibido), `o watchdog chama \`${proibido}\` — deixou de ser so um observador`);
  }
});

// ── chega ao painel pela porta certa ────────────────────────────────────────

test('o /saude.json publica o uptime, e so o poe em `itens` quando ha alerta', () => {
  const f10 = fs.readFileSync(path.join(AQUI, 'f10-server.mjs'), 'utf8');
  assert.match(f10, /saude\.watchdog = wd;/);
  assert.match(f10, /if \(wd\.alerta\)/,
    'um verde a mais no cartao da saude ensina a ignorar o cartao');
  assert.match(f10, /launchctl kickstart -k gui/, 'o item tem de dizer como se resolve');
});

// ── o registo nao pode virar um imposto ─────────────────────────────────────
//
// Este ficheiro e appendado de 5 em 5 minutos E LIDO INTEIRO a cada
// `/saude.json`, que o painel pede de 60 em 60 s. Sem corte, ao fim de um ano
// sao ~12 MB relidos a cada minuto para responder a uma pergunta sobre as
// ultimas 24 h. Este repositorio ja pagou esta conta uma vez (`runner-ledger`
// a 4,27 MB com zero rotacao, 2026-08-19).

const { MAX_LINHAS } = await import('./watchdog.mjs');

test('o registo apara-se, e o que sai sao as linhas MAIS VELHAS', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'wd-cap-'));
  const f = path.join(dir, 'watchdog.jsonl');
  const linhas = Array.from({ length: 60 }, (_, i) => JSON.stringify({ ts: `t${i}`, ok: true, n: i }));
  fs.writeFileSync(f, `${linhas.join('\n')}\n`);
  const r = registar({ ts: 'novo', ok: true, n: 999 }, { mooDir: dir, max: 20 });
  assert.ok(r.aparado > 0, 'nao aparou nada');
  const ficaram = lerRegisto({ mooDir: dir, max: 1000 });
  assert.equal(ficaram.length, 20);
  assert.equal(ficaram.at(-1).n, 999, 'a linha nova tem de sobreviver');
  assert.ok(ficaram.every((l) => l.n >= 41), 'saiu uma linha recente em vez de uma velha');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('abaixo do tecto (com folga) NAO se reescreve o ficheiro', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'wd-cap2-'));
  fs.writeFileSync(path.join(dir, 'watchdog.jsonl'), `${JSON.stringify({ ts: 'a', ok: true })}\n`);
  let escreveu = false;
  registar({ ts: 'b', ok: true }, {
    mooDir: dir, max: 3000, writeImpl: () => { escreveu = true; },
  });
  assert.equal(escreveu, false, 'reescrever a cada tique seria pior do que nao aparar');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a LEITURA tambem so pega na cauda — nao se carrega o historico todo', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'wd-cap3-'));
  const linhas = Array.from({ length: 500 }, (_, i) => JSON.stringify({ ts: `t${i}`, ok: true, n: i }));
  fs.writeFileSync(path.join(dir, 'watchdog.jsonl'), `${linhas.join('\n')}\n`);
  const lidas = lerRegisto({ mooDir: dir, max: 50 });
  assert.equal(lidas.length, 50);
  assert.equal(lidas[0].n, 450);
});

test('o tecto cobre a janela do uptime com folga larga', () => {
  const porDia = (24 * 60) / 5;   // sondagem de 5 em 5 minutos
  assert.ok(MAX_LINHAS >= porDia * 7, `${MAX_LINHAS} nao cobre uma semana de sondagens`);
});
