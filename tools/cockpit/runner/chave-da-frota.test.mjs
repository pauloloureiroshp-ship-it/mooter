/**
 * chave-da-frota.test.mjs — o gesto que move a chave entre maquinas.
 *
 * O gate e uma frase: **este comando nunca pode pousar a chave onde o git a
 * apanhe, nem substituir uma chave diferente em silencio.** O resto existe para
 * que essa frase nao passe por acidente.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { estado, exportar, importar, dentroDeRepo } from '../chave-da-frota.mjs';

import { createRequire } from 'node:module';
const requireT = createRequire(import.meta.url);
const A = requireT('../../router/assinatura.js');

const pasta = (nome) => fs.mkdtempSync(path.join(os.tmpdir(), `moo-chave-${nome}-`));
const hex = () => crypto.randomBytes(A.KEY_BYTES).toString('hex');

/** Um vault de mentira com (ou sem) chave la dentro. */
function vaultCom(nome, chaveHex) {
  const vault = pasta(nome);
  fs.mkdirSync(path.join(vault, '50-fleet'), { recursive: true });
  if (chaveHex) fs.writeFileSync(path.join(vault, '50-fleet', '.owner.key'), chaveHex + '\n', { mode: 0o600 });
  return { vault, opts: { vaultPath: vault, home: vault } };
}

// ── dentroDeRepo ─────────────────────────────────────────────────────────────

test('dentroDeRepo sobe a arvore ate encontrar .git — e devolve null quando nao ha', () => {
  const raiz = pasta('repo');
  fs.mkdirSync(path.join(raiz, '.git'));
  fs.mkdirSync(path.join(raiz, 'a', 'b'), { recursive: true });
  assert.equal(dentroDeRepo(path.join(raiz, 'a', 'b', 'chave.hex')), raiz);

  const limpo = pasta('sem-repo');
  assert.equal(dentroDeRepo(path.join(limpo, 'chave.hex')), null);
});

test('dentroDeRepo responde mesmo que o ficheiro ainda nao exista', () => {
  const raiz = pasta('repo2');
  fs.mkdirSync(path.join(raiz, '.git'));
  assert.ok(dentroDeRepo(path.join(raiz, 'ainda-nao-existe.hex')));
});

// ── estado ───────────────────────────────────────────────────────────────────

test('estado devolve o kid, e o kid bate com o que a assinatura calcula', () => {
  const k = hex();
  const { opts } = vaultCom('estado', k);
  const st = estado(opts);
  assert.equal(st.existe, true);
  assert.equal(st.partilhado, true);
  assert.equal(st.kid, A.kidDaChave(Buffer.from(k, 'hex')));
});

test('GATE: perguntar o estado NUNCA cria a chave', () => {
  // Uma sonda que gera um segredo como efeito lateral geraria uma chave nova na
  // maquina onde se ia importar a do dono, so por se ter perguntado o estado.
  const { vault, opts } = vaultCom('sem-chave', null);
  const st = estado(opts);
  assert.equal(st.existe, false);
  assert.equal(st.kid, null);
  assert.equal(fs.existsSync(path.join(vault, '50-fleet', '.owner.key')), false, 'nada foi escrito');
});

test('uma chave ilegivel diz-se ilegivel, nao se substitui', () => {
  const { opts } = vaultCom('corrompida', null);
  fs.writeFileSync(path.join(opts.vaultPath, '50-fleet', '.owner.key'), 'isto-nao-e-hex\n');
  const st = estado(opts);
  assert.equal(st.existe, true);
  assert.equal(st.kid, null);
  assert.match(st.erro, /nao parece uma chave/);
});

// ── exportar ─────────────────────────────────────────────────────────────────

test('GATE: exportar RECUSA escrever dentro de um repositorio git', () => {
  const { opts } = vaultCom('exp-repo', hex());
  const repo = pasta('destino-repo');
  fs.mkdirSync(path.join(repo, '.git'));
  const destino = path.join(repo, 'chave.hex');

  assert.throws(() => exportar(destino, opts), /repositorio git/);
  assert.equal(fs.existsSync(destino), false, 'e nao pode ter escrito na mesma');
});

test('exportar escreve a chave com 0600, e o hex e mesmo o da chave', () => {
  const k = hex();
  const { opts } = vaultCom('exp', k);
  const destino = path.join(pasta('destino'), 'chave.hex');

  const r = exportar(destino, opts);
  assert.equal(r.kid, A.kidDaChave(Buffer.from(k, 'hex')));
  assert.equal(fs.readFileSync(destino, 'utf8').trim(), k);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(destino).mode & 0o777, 0o600, 'ninguem alem do dono');
  }
});

test('exportar sem chave nenhuma explica-se em vez de inventar uma', () => {
  const { opts } = vaultCom('exp-vazio', null);
  assert.throws(() => exportar(path.join(pasta('d2'), 'k.hex'), opts), /nao ha chave para exportar/);
});

// ── importar ─────────────────────────────────────────────────────────────────

test('importar a MESMA chave e no-op, e diz que nada mudou', () => {
  const k = hex();
  const { opts } = vaultCom('imp-igual', k);
  const origem = path.join(pasta('origem'), 'k.hex');
  fs.writeFileSync(origem, k);

  const r = importar(origem, opts);
  assert.equal(r.ok, true);
  assert.equal(r.mudou, false);
  assert.equal(r.substituiu, null);
});

test('GATE: importar uma chave DIFERENTE sem --forcar e recusado', () => {
  // Substituir invalida tudo o que ja foi assinado com a antiga, e o efeito nao
  // e local: a frota deixa de reconhecer este device ate ele reassinar.
  const antiga = hex();
  const { opts } = vaultCom('imp-dif', antiga);
  const origem = path.join(pasta('origem2'), 'k.hex');
  fs.writeFileSync(origem, hex());

  assert.throws(() => importar(origem, opts), /--forcar/);
  assert.equal(
    fs.readFileSync(path.join(opts.vaultPath, '50-fleet', '.owner.key'), 'utf8').trim(),
    antiga,
    'a chave antiga tem de continuar intacta',
  );
});

test('importar com --forcar substitui, e diz o que ficou para tras', () => {
  const antiga = hex();
  const nova = hex();
  const { opts } = vaultCom('imp-forcar', antiga);
  const origem = path.join(pasta('origem3'), 'k.hex');
  fs.writeFileSync(origem, nova);

  const r = importar(origem, { ...opts, forcar: true });
  assert.equal(r.mudou, true);
  assert.equal(r.kid, A.kidDaChave(Buffer.from(nova, 'hex')));
  assert.equal(r.substituiu, A.kidDaChave(Buffer.from(antiga, 'hex')), 'o recibo diz qual morreu');
  assert.equal(fs.readFileSync(r.caminho, 'utf8').trim(), nova);
});

test('importar num device sem chave nenhuma instala-a sem precisar de --forcar', () => {
  const nova = hex();
  const { opts } = vaultCom('imp-novo', null);
  const origem = path.join(pasta('origem4'), 'k.hex');
  fs.writeFileSync(origem, nova);

  const r = importar(origem, opts);
  assert.equal(r.mudou, true);
  assert.equal(r.substituiu, null, 'nao substituiu nada — nao havia nada');
  assert.equal(fs.readFileSync(r.caminho, 'utf8').trim(), nova);
});

test('importar recusa lixo: hex a mais, hex a menos, e coisa nenhuma', () => {
  const { opts } = vaultCom('imp-lixo', null);
  const dir = pasta('origem5');
  const casos = [
    ['curta.hex', crypto.randomBytes(16).toString('hex')],
    ['longa.hex', crypto.randomBytes(64).toString('hex')],
    ['texto.hex', 'a chave e: segredo'],
    ['vazia.hex', ''],
  ];
  for (const [nome, conteudo] of casos) {
    const p = path.join(dir, nome);
    fs.writeFileSync(p, conteudo);
    assert.throws(() => importar(p, opts), /chave|B,/, `${nome} tinha de ser recusada`);
  }
  assert.equal(fs.existsSync(path.join(opts.vaultPath, '50-fleet', '.owner.key')), false);
});

// ── o ciclo completo, que e o que o dono faz ────────────────────────────────

test('exportar de uma maquina e importar noutra da o MESMO kid', () => {
  const k = hex();
  const mac = vaultCom('mac', k);
  const pc = vaultCom('pc', null);
  const pen = path.join(pasta('pen'), 'owner.key');

  const saida = exportar(pen, mac.opts);
  const entrada = importar(pen, pc.opts);

  assert.equal(saida.kid, entrada.kid, 'e o kid que prova que o transporte correu bem');
  // E a prova que interessa: um beacon assinado no Mac verifica no PC.
  const chaveMac = Buffer.from(fs.readFileSync(path.join(mac.vault, '50-fleet', '.owner.key'), 'utf8').trim(), 'hex');
  const chavePc = Buffer.from(fs.readFileSync(path.join(pc.vault, '50-fleet', '.owner.key'), 'utf8').trim(), 'hex');
  const beacon = A.assinado({ device: 'mac-mini', running: true }, { chave: chaveMac });
  assert.equal(A.verificar(beacon, { chave: chavePc }).ok, true, 'era isto que nunca funcionou');
});
