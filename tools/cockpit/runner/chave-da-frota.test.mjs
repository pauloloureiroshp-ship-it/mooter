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

// ── Fase 2 · inscricao Ed25519 ───────────────────────────────────────────────
//
// O gate: **inscrever nunca commita, e nunca substitui uma inscricao em
// silencio.** A lista de quem a frota acredita revê-se num `git diff` do dono —
// um comando que inscrevesse E commitasse tornaria a inscricao invisivel, e
// qualquer processo com escrita no vault podia inscrever-se a si proprio. Era
// exactamente o ataque de que o Ed25519 nos tirou.

import { identidade, inscrever } from '../chave-da-frota.mjs';

const parDeTeste = () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pub = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');
  return { pub, kid: A.kidDaPublica(pub) };
};

/** Um device com `~/.mooter/` proprio e um vault proprio. */
function device(nome) {
  const casa = pasta(`casa-${nome}`);
  const vault = pasta(`vault-${nome}`);
  fs.mkdirSync(path.join(vault, '50-fleet'), { recursive: true });
  return { casa, vault, opts: { home: casa, mooDir: path.join(casa, '.mooter'), vaultPath: vault, device: nome } };
}

test('chaveDoDevice cria o par uma vez, guarda-o a 0600, e le-o de volta igual', () => {
  const d = device('m1');
  const a = A.chaveDoDevice(d.opts);
  assert.equal(a.criada, true);
  assert.match(a.kid, /^[0-9a-f]{16}$/);
  if (process.platform !== 'win32') assert.equal(fs.statSync(a.caminho).mode & 0o777, 0o600);

  const b = A.chaveDoDevice(d.opts);
  assert.equal(b.criada, false, 'a segunda chamada nao pode gerar outro par');
  assert.equal(b.kid, a.kid, 'senao a inscricao ja feita no registo deixava de bater');
});

test('a privada vive em ~/.mooter/, NUNCA no vault', () => {
  const d = device('m2');
  const k = A.chaveDoDevice(d.opts);
  assert.ok(k.caminho.includes('.mooter'), k.caminho);
  assert.ok(!k.caminho.startsWith(d.vault), 'a privada no canal que atravessa maquinas era repetir a Fase 1');
});

test('um registo ausente NAO e erro — e uma frota que ainda nao migrou', () => {
  const d = device('m3');
  const r = A.lerRegisto(d.opts);
  assert.equal(r.existe, false);
  assert.equal(r.erro, null);
  assert.deepEqual(r.devices, {});
});

test('um registo ILEGIVEL diz-se ilegivel — nao se inventa confianca', () => {
  const d = device('m4');
  fs.writeFileSync(path.join(d.vault, '50-fleet', 'trusted-devices.json'), '{ isto nao e json');
  const r = A.lerRegisto(d.opts);
  assert.equal(r.existe, true);
  assert.ok(r.erro);
});

test('identidade diz se este device ja esta inscrito, e com que chave', () => {
  const d = device('m5');
  const id = identidade(d.opts);
  assert.equal(id.device, 'm5');
  assert.equal(id.inscrito, false);
  assert.equal(id.conflito, null);

  inscrever('m5', id.pub, d.opts);
  assert.equal(identidade(d.opts).inscrito, true);
});

test('identidade acusa CONFLITO quando o registo tem outra chave para este device', () => {
  const d = device('m6');
  identidade(d.opts);
  inscrever('m6', parDeTeste().pub, d.opts);
  const id = identidade(d.opts);
  assert.equal(id.inscrito, false);
  assert.ok(id.conflito, 'nao e "por inscrever": e uma inscricao que este device ja nao honra');
});

test('GATE: inscrever escreve o ficheiro e NAO commita', () => {
  const d = device('m7');
  const p = parDeTeste();
  const r = inscrever('pc-paulo', p.pub, d.opts);
  assert.equal(r.mudou, true);
  assert.equal(r.kid, p.kid);

  const escrito = JSON.parse(fs.readFileSync(r.caminho, 'utf8'));
  assert.equal(escrito.versao, 1);
  assert.equal(escrito.devices['pc-paulo'].pub, p.pub);
  assert.equal(escrito.devices['pc-paulo'].alg, A.ALG_ED);
  assert.ok(escrito.devices['pc-paulo'].inscrito_em, 'quando foi autorizado faz parte do recibo');
  // Nao ha git nenhum nesta pasta: se o comando tentasse commitar, rebentava.
  assert.equal(fs.existsSync(path.join(d.vault, '.git')), false);
});

test('GATE: inscrever NAO substitui outra chave sem --forcar', () => {
  const d = device('m8');
  const antiga = parDeTeste();
  inscrever('pc-paulo', antiga.pub, d.opts);

  assert.throws(() => inscrever('pc-paulo', parDeTeste().pub, d.opts), /--forcar/);
  const r = A.lerRegisto(d.opts);
  assert.equal(r.devices['pc-paulo'].pub, antiga.pub, 'a inscricao antiga tem de sobreviver');
});

test('inscrever com --forcar revoga a anterior, e diz qual', () => {
  const d = device('m9');
  const antiga = parDeTeste();
  const nova = parDeTeste();
  inscrever('pc-paulo', antiga.pub, d.opts);

  const r = inscrever('pc-paulo', nova.pub, { ...d.opts, forcar: true });
  assert.equal(r.substituiu, antiga.kid);
  assert.equal(A.lerRegisto(d.opts).devices['pc-paulo'].pub, nova.pub);
});

test('inscrever a MESMA chave e no-op', () => {
  const d = device('m10');
  const p = parDeTeste();
  inscrever('pc-paulo', p.pub, d.opts);
  assert.equal(inscrever('pc-paulo', p.pub, d.opts).mudou, false);
});

test('inscrever recusa o que nao e uma chave publica Ed25519', () => {
  const d = device('m11');
  for (const lixo of ['nao-base64!!', Buffer.from('curto').toString('base64'), '']) {
    assert.throws(() => inscrever('pc-paulo', lixo, d.opts), /base64|publica/);
  }
  assert.equal(A.lerRegisto(d.opts).existe, false, 'nada foi escrito');
});

test('inscrever nao escreve por cima de um registo que nao consegue ler', () => {
  const d = device('m12');
  fs.writeFileSync(path.join(d.vault, '50-fleet', 'trusted-devices.json'), '{ partido');
  assert.throws(() => inscrever('pc-paulo', parDeTeste().pub, d.opts), /ilegivel/);
  assert.equal(fs.readFileSync(path.join(d.vault, '50-fleet', 'trusted-devices.json'), 'utf8'), '{ partido');
});

test('o ciclo Fase 2: o PC mostra a publica, o Mac inscreve-a, e o beacon do PC verifica', () => {
  const mac = device('mac-mini');
  const pc = device('pc-paulo');

  // No PC: a identidade publica. Nenhum segredo sai daqui.
  const idPc = identidade(pc.opts);

  // No Mac, que tem o vault: inscreve-se a publica do PC.
  inscrever('pc-paulo', idPc.pub, mac.opts);

  // O PC assina com a PRIVADA dele, que nunca viajou.
  const chavePc = A.chaveDoDevice(pc.opts);
  const b = A.assinadoEd({ device: 'pc-paulo', running: true }, { privada: chavePc.privada, pub: chavePc.pub });

  // E o Mac verifica-o pelo registo.
  const v = A.verificar(b, { registo: A.lerRegisto(mac.opts), device: 'pc-paulo' });
  assert.equal(v.ok, true, 'era isto que exigia levar um segredo a mao');
  assert.equal(v.alg, A.ALG_ED);
});
