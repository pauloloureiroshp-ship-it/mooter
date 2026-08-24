'use strict';
/**
 * assinatura.test.js — o canal da frota deixa de acreditar em tudo.
 *
 * O gate da Onda 1a e uma frase so: **um beacon adulterado e rejeitado, com
 * recibo**. Tudo o resto aqui existe para que essa frase nao passe por acidente.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const A = require('./assinatura.js');

const CHAVE = Buffer.alloc(A.KEY_BYTES, 7);
const OUTRA = Buffer.alloc(A.KEY_BYTES, 9);
const TS = '2026-08-21T12:00:00.000Z';
const AGORA = Date.parse(TS) + 60_000; // 60s depois de assinado

const beacon = () => ({
  device: 'pc-paulo',
  ts: TS,
  running: true,
  pilar_atual: 'P4',
  gpu_pct: 61,
  recibos: { total: 3724, citacao_ok: 1563, refutado: 44, vazias_seguidas: 0 },
  usd: 0,
});

// ── canonico: a base de tudo ────────────────────────────────────────────────

test('canonico: ordem das chaves nao muda os bytes', () => {
  const a = { z: 1, a: 2, m: { y: 3, b: 4 } };
  const b = { a: 2, m: { b: 4, y: 3 }, z: 1 };
  assert.equal(A.canonico(a), A.canonico(b));
});

test('canonico: `sig` nunca entra no corpo assinado', () => {
  const sem = A.canonico({ device: 'x' });
  const com = A.canonico({ device: 'x', sig: { mac: 'deadbeef' } });
  assert.equal(sem, com, 'assina-se o conteudo, nunca o envelope');
});

test('canonico: undefined desaparece como o JSON o faria', () => {
  assert.equal(A.canonico({ a: 1, b: undefined }), A.canonico({ a: 1 }));
});

test('canonico: null e arrays sobrevivem sem se confundirem', () => {
  assert.equal(A.canonico(null), 'null');
  assert.equal(A.canonico([1, null, 'a']), '[1,null,"a"]');
  assert.notEqual(A.canonico([1, 2]), A.canonico({ 0: 1, 1: 2 }));
});

// ── o caminho feliz ─────────────────────────────────────────────────────────

test('assinado -> verificar: um beacon intacto passa', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  const v = A.verificar(b, { chave: CHAVE, agora: AGORA });
  assert.equal(v.ok, true);
  assert.equal(v.codigo, 'ok');
  assert.equal(v.idade_s, 60);
});

test('assinar e determinista para o mesmo ts e nonce', () => {
  const p = beacon();
  const s1 = A.assinar(p, { chave: CHAVE, ts: TS, nonce: 'n1' });
  const s2 = A.assinar(p, { chave: CHAVE, ts: TS, nonce: 'n1' });
  assert.equal(s1.mac, s2.mac);
});

test('nonces diferentes dao MACs diferentes (o nonce entra no MAC)', () => {
  const p = beacon();
  const s1 = A.assinar(p, { chave: CHAVE, ts: TS, nonce: 'n1' });
  const s2 = A.assinar(p, { chave: CHAVE, ts: TS, nonce: 'n2' });
  assert.notEqual(s1.mac, s2.mac,
    'se o nonce nao entrasse no MAC, trocavam-no a vontade e o anti-replay era decorativo');
});

test('ts diferente da MAC diferente (o ts entra no MAC)', () => {
  const p = beacon();
  const s1 = A.assinar(p, { chave: CHAVE, ts: TS, nonce: 'n1' });
  const s2 = A.assinar(p, { chave: CHAVE, ts: '2026-08-21T13:00:00.000Z', nonce: 'n1' });
  assert.notEqual(s1.mac, s2.mac, 'senao a janela temporal era decorativa');
});

// ── O GATE: adulteracao rejeitada, com recibo ───────────────────────────────

test('GATE · beacon adulterado e REJEITADO com recibo legivel', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });

  // Exactamente o ataque que motiva o modulo: reescrever o custo de outra
  // maquina, mantendo a assinatura que estava la.
  const forjado = Object.assign({}, b, { usd: 999.99 });

  const v = A.verificar(forjado, { chave: CHAVE, agora: AGORA });
  assert.equal(v.ok, false, 'um beacon reescrito NAO pode passar');
  assert.equal(v.codigo, 'adulterado');
  assert.equal(v.motivo, 'assinatura nao bate com o conteudo');
  assert.equal(typeof v.motivo, 'string', 'o recibo tem de ser legivel por uma pessoa');
});

test('GATE · cada campo do beacon esta coberto pela assinatura', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  // Sem isto, um `canonico` que esquecesse um ramo passava despercebido.
  const ataques = {
    device: 'mac-do-vizinho',
    running: false,
    pilar_atual: 'P1',
    gpu_pct: 0,
    usd: 1234,
  };
  for (const [campo, valor] of Object.entries(ataques)) {
    const forjado = Object.assign({}, b, { [campo]: valor });
    const v = A.verificar(forjado, { chave: CHAVE, agora: AGORA });
    assert.equal(v.ok, false, `mexer em '${campo}' tem de partir a assinatura`);
    assert.equal(v.codigo, 'adulterado', `'${campo}': ${v.motivo}`);
  }
  // ... incluindo dentro de um objecto aninhado.
  const aninhado = Object.assign({}, b, {
    recibos: Object.assign({}, b.recibos, { refutado: 0 }),
  });
  assert.equal(A.verificar(aninhado, { chave: CHAVE, agora: AGORA }).codigo, 'adulterado',
    'esconder refutacoes num campo aninhado tambem tem de partir');
});

// ── as outras formas de mentir ──────────────────────────────────────────────

test('chave errada nao verifica', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  const v = A.verificar(b, { chave: OUTRA, agora: AGORA });
  assert.equal(v.ok, false);
  // Ate 2026-08-24 o codigo aqui era `adulterado`: chave errada e conteudo
  // mexido eram indistinguiveis. Com o `kid` no envelope passam a separar-se —
  // o veredicto e o mesmo (recusa), a causa deixa de mentir.
  assert.equal(v.codigo, 'chave-diferente');
});

test('beacon sem assinatura nenhuma e recusado, nao ignorado', () => {
  const v = A.verificar(beacon(), { chave: CHAVE, agora: AGORA });
  assert.equal(v.ok, false);
  assert.equal(v.codigo, 'nao-assinado');
});

test('sem chave para verificar, diz-se — nao se aprova por omissao', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  const v = A.verificar(b, { chave: null, agora: AGORA });
  assert.equal(v.ok, false);
  assert.equal(v.codigo, 'sem-chave');
});

test('algoritmo trocado e recusado (nao se negoceia para baixo)', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  b.sig.alg = 'none';
  assert.equal(A.verificar(b, { chave: CHAVE, agora: AGORA }).codigo, 'alg-desconhecido');
});

test('mac malformado nao rebenta o verificador', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  for (const mau of ['', 'zz', 'A'.repeat(64), 123, null]) {
    b.sig.mac = mau;
    const v = A.verificar(b, { chave: CHAVE, agora: AGORA });
    assert.equal(v.ok, false);
    assert.equal(v.codigo, 'mac-malformado', `mac ${JSON.stringify(mau)}`);
  }
});

test('assinatura expirada e recusada com a idade no recibo', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  const v = A.verificar(b, { chave: CHAVE, agora: Date.parse(TS) + (A.JANELA_S + 10) * 1000 });
  assert.equal(v.ok, false);
  assert.equal(v.codigo, 'expirada');
  assert.match(v.motivo, /expirada \(\d+s > \d+s\)/);
});

test('um device 1h offline reconverge — nao e acusado de fraude', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  const v = A.verificar(b, { chave: CHAVE, agora: Date.parse(TS) + 3600 * 1000 });
  assert.equal(v.ok, true, 'a janela e maior que a frescura, de proposito');
});

test('assinatura datada no futuro e recusada, com skew tolerado', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  // dentro do skew: passa
  assert.equal(A.verificar(b, { chave: CHAVE, agora: Date.parse(TS) - 3000 }).ok, true);
  // fora do skew: recusa
  const v = A.verificar(b, { chave: CHAVE, agora: Date.parse(TS) - 60_000 });
  assert.equal(v.ok, false);
  assert.equal(v.codigo, 'ts-futuro');
});

test('replay: o mesmo nonce duas vezes so passa a primeira', () => {
  const vistos = new Set();
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS, nonce: 'n-unico' });
  assert.equal(A.verificar(b, { chave: CHAVE, agora: AGORA, vistos }).ok, true);
  const v2 = A.verificar(b, { chave: CHAVE, agora: AGORA, vistos });
  assert.equal(v2.ok, false);
  assert.equal(v2.codigo, 'replay');
});

test('sem registo de nonces, reescrever o proprio beacon NAO e replay', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS, nonce: 'n-unico' });
  assert.equal(A.verificar(b, { chave: CHAVE, agora: AGORA }).ok, true);
  assert.equal(A.verificar(b, { chave: CHAVE, agora: AGORA }).ok, true,
    'um beacon reescrito no mesmo sitio a cada ciclo e actualizacao, nao ataque');
});

test('assinar sem chave valida atira — nunca assina com lixo', () => {
  for (const ma of [null, 'string', Buffer.alloc(16)]) {
    assert.throws(() => A.assinar(beacon(), { chave: ma }), /sem chave valida/);
  }
});

// ── a chave do dono ─────────────────────────────────────────────────────────

test('a chave prefere o vault, e diz que e partilhada', () => {
  const r = A.caminhoDaChave({ vaultPath: '/v', existsImpl: () => true });
  assert.equal(r.fonte, 'vault');
  assert.equal(r.partilhado, true);
  assert.match(r.caminho.replace(/\\/g, '/'), /\/v\/50-fleet\/\.owner\.key$/);
});

test('sem vault ha fallback local — e ele DECLARA que nao e frota', () => {
  const r = A.caminhoDaChave({ vaultPath: null, home: '/h', existsImpl: () => false });
  assert.equal(r.fonte, 'local');
  assert.equal(r.partilhado, false,
    'nunca se finge frota: uma chave por-device assina um solitario');
});

test('chaveDoDono cria 32B na primeira vez e reutiliza depois', () => {
  const disco = new Map();
  const io = {
    vaultPath: '/v',
    existsImpl: (p) => p === '/v' || disco.has(p),
    readImpl: (p) => disco.get(p),
    writeImpl: (p, d) => { if (disco.has(p)) { const e = new Error('EEXIST'); e.code = 'EEXIST'; throw e; } disco.set(p, d); },
    mkdirImpl: () => {},
  };
  const a = A.chaveDoDono(io);
  assert.equal(a.erro, null);
  assert.equal(a.chave.length, A.KEY_BYTES);
  assert.equal(a.criada, true);

  const b = A.chaveDoDono(io);
  assert.equal(b.criada, false);
  assert.deepEqual(a.chave, b.chave, 'a chave nao pode mudar entre arranques');
});

test('corrida: quem perde o `wx` RELE em vez de sobrescrever', () => {
  const disco = new Map();
  const boa = crypto.randomBytes(A.KEY_BYTES).toString('hex') + '\n';
  const io = {
    vaultPath: '/v',
    // A chave "ainda nao existe" quando se olha, mas ja existe ao escrever:
    // e exactamente a janela da corrida entre duas maquinas.
    existsImpl: (p) => p === '/v',
    readImpl: () => boa,
    writeImpl: () => { const e = new Error('EEXIST'); e.code = 'EEXIST'; throw e; },
    mkdirImpl: () => {},
  };
  const r = A.chaveDoDono(io);
  assert.equal(r.erro, null);
  assert.equal(r.chave.toString('hex'), boa.trim(),
    'sobrescrever aqui partiria em silencio toda a frota assinada com a primeira chave');
  void disco;
});

test('chave corrompida NAO e substituida em silencio', () => {
  const io = {
    vaultPath: '/v',
    existsImpl: () => true,
    readImpl: () => 'abcd',           // 2 bytes, nao 32
    writeImpl: () => assert.fail('nao pode escrever por cima de uma chave corrompida'),
    mkdirImpl: () => {},
  };
  const r = A.chaveDoDono(io);
  assert.equal(r.chave, null);
  assert.match(r.erro, /corrompida/);
});

test('o aviso de permissoes nao promete o que o Windows nao cumpre', () => {
  assert.match(A.avisoDePermissoes('win32'), /n\/d|nao instala ACL/);
  assert.equal(A.avisoDePermissoes('darwin'), null);
});

// ── kid: separar "chave errada" de "conteudo mexido" ─────────────────────────
//
// Medido 2026-08-24: cada device da frota tinha gerado a sua propria
// `.owner.key` (o `*.key` do .gitignore do vault nunca a deixou viajar), e o
// painel do Mac recusava o beacon do PC com `adulterado` — "assinatura nao bate
// com o conteudo" — sobre um ficheiro que ninguem tinha tocado. O recibo mandava
// cacar um atacante que nao existia.

test('kid identifica a chave sem a revelar, e e estavel', () => {
  const k = A.kidDaChave(CHAVE);
  assert.match(k, /^[0-9a-f]{16}$/);
  assert.equal(k, A.kidDaChave(CHAVE), 'a mesma chave da sempre o mesmo kid');
  assert.notEqual(k, A.kidDaChave(OUTRA), 'chaves diferentes, kids diferentes');
  assert.ok(!CHAVE.toString('hex').includes(k), 'o kid nao pode ser um pedaco da chave');
});

test('o envelope leva o kid de quem assinou', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  assert.equal(b.sig.kid, A.kidDaChave(CHAVE));
  assert.equal(b.sig.alg, A.ALG_TAG);
});

test('GATE: chave DIFERENTE nao e adulteracao, e diz isso', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  const v = A.verificar(b, { chave: OUTRA, agora: AGORA });
  assert.equal(v.ok, false, 'continua a NAO passar — isto nunca foi negociavel');
  assert.equal(v.codigo, 'chave-diferente');
  assert.match(v.motivo, /outra chave do dono/);
  assert.match(v.motivo, /nao adulteracao/);
});

test('GATE: conteudo MEXIDO com a chave certa continua a ser adulteracao', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  b.usd = 999.99;
  const v = A.verificar(b, { chave: CHAVE, agora: AGORA });
  assert.equal(v.ok, false);
  assert.equal(v.codigo, 'adulterado', 'o kid bate: isto e mesmo adulteracao');
});

test('um beacon SEM kid (versao anterior) continua a verificar', () => {
  // No dia do upgrade os beacons ja no vault nao trazem kid. Recusa-los por
  // isso apagaria a frota do painel — o mesmo erro que o `nao-assinado` evita.
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  delete b.sig.kid;
  assert.equal(A.verificar(b, { chave: CHAVE, agora: AGORA }).ok, true);
  // E sem kid a chave errada volta a cair no MAC, que e onde tem de cair —
  // mas o recibo declara que nao consegue escolher entre as duas causas, em vez
  // de acusar forja com a confianca que nao tem.
  const v = A.verificar(b, { chave: OUTRA, agora: AGORA });
  assert.equal(v.codigo, 'adulterado', 'o veredicto nunca esteve em duvida');
  assert.equal(v.kid_ausente, true);
  assert.match(v.motivo, /pode ser chave diferente OU adulteracao/);
});

test('mexer no kid nao faz passar nada — o MAC continua a mandar', () => {
  const b = A.assinado(beacon(), { chave: CHAVE, ts: TS });
  // O atacante poe o kid da vitima para fingir que e a chave dela.
  b.sig.kid = A.kidDaChave(OUTRA);
  assert.equal(A.verificar(b, { chave: OUTRA, agora: AGORA }).codigo, 'adulterado',
    'kid forjado so muda a mensagem de erro, nunca o veredicto');
});
