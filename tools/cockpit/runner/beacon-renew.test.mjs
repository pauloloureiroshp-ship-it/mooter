/**
 * beacon-renew.test.mjs — renovar a PROVA, nunca re-datar o DEVICE.
 *
 * O primeiro teste deste ficheiro e o unico que interessa mesmo: o corpo do
 * beacon tem de sair byte a byte igual ao que entrou. Um cron que carimbe `ts`
 * de hora a hora poe uma maquina morta a dizer "awake · heartbeat 3m ago" — a
 * mentira exacta que este projecto nao pode contar, introduzida pela correccao
 * de uma outra.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renovarBeacon, precisaDeRenovar, LIMIAR_S } from './beacon-renew.mjs';

const HORA = 3600e3;
const AGORA = Date.parse('2026-09-01T12:00:00Z');

/** Um beacon como o `writeBeacon` o escreve, com assinatura de idade `horas`. */
const beaconDe = (horas, extra = {}) => ({
  device: 'bancada', ts: '2026-08-25T19:16:52.900Z', seq: 41,
  plataforma: 'darwin', running: false,
  pausa: { activa: true, razao: 'rotacao vazia' },
  recibos: { total: 903, citacao_ok: 400 },
  ...extra,
  sig: { alg: 'hmac-sha256', ts: new Date(AGORA - horas * HORA).toISOString(), nonce: 'n1', tag: 'antiga' },
});

function bancadaDir(beacon) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-renew-'));
  fs.writeFileSync(path.join(dir, 'bancada.json'), JSON.stringify(beacon, null, 2));
  return dir;
}

/** Assina de mentira, mas de forma OBSERVAVEL: o corpo viaja intacto ao lado. */
const assinarFalso = (corpo) => ({
  payload: { ...corpo, sig: { alg: 'hmac-sha256', ts: new Date(AGORA).toISOString(), nonce: 'n2', tag: 'nova' } },
  assinado: true, alg: 'hmac-sha256', inscrito: false, chave_partilhada: false, porque: null,
});

const correr = (dir, extra = {}) => renovarBeacon({
  device: 'bancada', where: { dir, transporte: 'local', partilhado: false },
  agora: AGORA, assinarImpl: assinarFalso,
  publicarLigadoImpl: () => false, ...extra,
});

// ── a regra que nao pode cair ────────────────────────────────────────────────

test('RENOVAR NAO RE-DATA: o corpo sai identico, so a assinatura e nova', () => {
  const antes = beaconDe(20);
  const dir = bancadaDir(antes);
  const r = correr(dir);
  assert.equal(r.renovado, true);

  const depois = JSON.parse(fs.readFileSync(path.join(dir, 'bancada.json'), 'utf8'));
  const { sig: sigAntes, ...corpoAntes } = antes;
  const { sig: sigDepois, ...corpoDepois } = depois;
  assert.deepEqual(corpoDepois, corpoAntes, 'um so campo do corpo mudou — o cron passou a mentir');
  // Explicito, porque e ESTE campo que o painel usa para dizer acordado/a dormir.
  assert.equal(depois.ts, antes.ts, 'o `ts` do device NUNCA se renova');
  assert.equal(depois.seq, antes.seq, 'renovar nao e um estado novo — o contador nao anda');
  assert.notEqual(sigDepois.ts, sigAntes.ts, 'a assinatura tem de ficar nova, senao nada disto serve');
});

test('o codigo NAO contem um carimbo de data novo para o corpo', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('./beacon-renew.mjs', import.meta.url)), 'utf8');
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/ts:\s*new Date/.test(codigo), false,
               're-datar o beacon poe uma maquina morta a parecer acordada');
});

// ── quando renovar ───────────────────────────────────────────────────────────

test('o limiar deriva da janela real da assinatura — nao de um numero de cabeca', async () => {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const { JANELA_S } = req('../../router/assinatura.js');
  assert.equal(LIMIAR_S, Math.floor(JANELA_S / 2));
});

test('dentro do limiar nao se escreve — a conta dos commits e do vault do dono', () => {
  const dir = bancadaDir(beaconDe(1));
  const antes = fs.statSync(path.join(dir, 'bancada.json')).mtimeMs;
  const r = correr(dir);
  assert.equal(r.renovado, false);
  assert.match(r.porque, /ainda dentro do limiar/);
  assert.equal(fs.statSync(path.join(dir, 'bancada.json')).mtimeMs, antes);
});

test('O CASO REAL: uma assinatura de 6 dias renova-se', () => {
  const r = correr(bancadaDir(beaconDe(24 * 6)));
  assert.equal(r.renovado, true);
  assert.ok(r.idade_s > 24 * 3600, 'a idade medida tem de viajar na resposta');
});

test('--forca renova mesmo dentro do limiar', () => {
  const r = correr(bancadaDir(beaconDe(1)), { forca: true });
  assert.equal(r.renovado, true);
});

test('uma assinatura no FUTURO nao se renova — isso e um relogio, nao idade', () => {
  const p = precisaDeRenovar(beaconDe(-5), { agora: AGORA });
  assert.equal(p.renovar, false);
  assert.match(p.porque, /futuro/);
});

test('um beacon SEM assinatura nao ganha uma aqui — nem com --forca', () => {
  const semSig = { device: 'bancada', ts: '2026-08-25T19:16:52.900Z' };
  const p = precisaDeRenovar(semSig, { agora: AGORA });
  assert.equal(p.renovar, false);
  const r = correr(bancadaDir(semSig), { forca: true });
  assert.equal(r.ok, false);
  assert.match(r.porque, /invento/);
});

// ── recusas honestas ─────────────────────────────────────────────────────────

test('sem beacon nenhum: recusa com instrucao, e NAO cria um vazio', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-renew-vazio-'));
  const r = correr(dir);
  assert.equal(r.ok, false);
  assert.equal(fs.existsSync(path.join(dir, 'bancada.json')), false, 'um beacon inventado e pior do que nenhum');
  assert.match(r.porque, /corre o loop uma vez/);
});

test('beacon ilegivel: nao se escreve por cima do que nao se percebeu', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-renew-lixo-'));
  fs.writeFileSync(path.join(dir, 'bancada.json'), '{isto nao e json');
  const r = correr(dir);
  assert.equal(r.ok, false);
  assert.match(r.porque, /ilegivel/);
  assert.equal(fs.readFileSync(path.join(dir, 'bancada.json'), 'utf8'), '{isto nao e json');
});

test('se a assinatura falhar, o ficheiro em disco fica exactamente como estava', () => {
  const antes = beaconDe(48);
  const dir = bancadaDir(antes);
  const r = correr(dir, { assinarImpl: () => ({ assinado: false, porque: 'sem chave do dono' }) });
  assert.equal(r.ok, false);
  assert.match(r.porque, /sem chave do dono/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'bancada.json'), 'utf8')), antes);
});

// ── publicacao ───────────────────────────────────────────────────────────────

test('publicar continua a pedir-se: desligado, renova em disco e DI-LO', () => {
  const r = renovarBeacon({
    device: 'bancada', where: { dir: bancadaDir(beaconDe(48)), transporte: 'vault', partilhado: true },
    agora: AGORA, assinarImpl: assinarFalso, publicarLigadoImpl: () => false,
    publicarImpl: () => { throw new Error('nao devia publicar'); },
  });
  assert.equal(r.renovado, true);
  assert.equal(r.publicado.ok, false);
  assert.match(r.publicado.porque, /MOO_PUBLICAR_BEACON/);
});

test('com a publicacao ligada, o commit vai para o caminho canonico do beacon', () => {
  let visto = null;
  const dir = bancadaDir(beaconDe(48));
  const r = renovarBeacon({
    device: 'bancada', where: { dir, transporte: 'vault', partilhado: true },
    agora: AGORA, assinarImpl: assinarFalso, publicarLigadoImpl: () => true,
    publicarImpl: (raiz, rel) => { visto = { raiz, rel }; return { ok: true, porque: 'publicado' }; },
  });
  assert.equal(r.publicado.ok, true);
  assert.equal(visto.rel, '50-fleet/bancada.json');
  assert.equal(visto.raiz, path.dirname(dir));
});
