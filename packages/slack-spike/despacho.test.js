'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. Testes da porta de despacho.
 *
 * `toolWork` entra injectado — e o ponto: em MODO CONSTRUCAO nenhum destes
 * testes despacha nada a serio, e mesmo assim provam-se as barreiras que so
 * importam quando ha dinheiro em jogo.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { criarDespachador, CAMPOS_PARA_O_MOTOR } = require('./despacho.js');
const gate = require('./gate.js');
const { criarPublicador } = require('./publicar.js');

function comSync(conteudo) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-desp-'));
  const p = path.join(d, 'SYNC.md');
  fs.writeFileSync(p, conteudo);
  return p;
}
const DESTRAVADO = () => comSync('# SYNC\n\n' + gate.LINHA_DESTRAVE + '\n');
const TRANCADO = () => comSync('# SYNC\n\na kimi-egress ainda manda.\n');

const PEDIDO = { goal: 'arruma os testes', agent: 'cc', wave: 'slack-spike',
  actor: { type: 'human', id: 'slack:U_PAULO', origem: 'slack' } };

test('despachar · com o SYNC.md trancado NAO chama o motor (o gate e por despacho, nao por processo)', async () => {
  let chamou = false;
  const { despachar } = criarDespachador({ syncPath: TRANCADO(),
    toolWork: async () => { chamou = true; return { job_id: 'job-1' }; } });
  const r = await despachar(PEDIDO);
  assert.equal(chamou, false);
  assert.equal(r.job_id, null);
  assert.match(r.porque_local, /trancado/i);
});

test('despachar · destravado, chama o motor UMA vez e devolve o job_id', async () => {
  const vistos = [];
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async (a) => { vistos.push(a); return { job_id: 'job-42' }; } });
  assert.equal((await despachar(PEDIDO)).job_id, 'job-42');
  assert.equal(vistos.length, 1);
  assert.equal(vistos[0].actor.id, 'slack:U_PAULO');
});

test('despachar · o gate reabre: um SYNC.md que perde a linha volta a trancar', async () => {
  const syncPath = DESTRAVADO();
  const { despachar } = criarDespachador({ syncPath, toolWork: async () => ({ job_id: 'job-1' }) });
  assert.equal((await despachar(PEDIDO)).job_id, 'job-1');
  fs.writeFileSync(syncPath, '# SYNC\n\nreabri a frente.\n');
  assert.equal((await despachar(PEDIDO)).job_id, null);
});

test('despachar · thread_context nao chega ao motor: morre na allowlist de saida', async () => {
  let recebido = null;
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async (a) => { recebido = a; return { job_id: 'job-1' }; } });
  const r = await despachar(Object.assign({}, PEDIDO, {
    thread_context: ['o que se disse no canal antes'] }));
  assert.equal(r.job_id, null);
  assert.match(r.porque_local, /thread_context/);
  assert.equal(recebido, null, 'o motor nem foi chamado');
});

test('despachar · a allowlist de saida e a simetrica da de publicacao', () => {
  assert.deepEqual([...CAMPOS_PARA_O_MOTOR].sort(), ['actor', 'agent', 'goal', 'wave']);
});

test('despachar · o erro do motor sai em porque_local, e o publicar RECUSA publica-lo', async () => {
  const goalSecreto = 'migra a base de dados de producao';
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async () => ({ error: 'recusado: "' + goalSecreto + '" tem um caracter reservado' }) });
  const r = await despachar(PEDIDO);
  assert.equal(r.job_id, null);
  assert.ok(r.porque_local.includes(goalSecreto), 'o erro do motor cita o goal — e o problema');

  // e e por isso que o nome do campo importa: a porta de saida recusa-o
  const pub = criarPublicador({ dryRun: true });
  const p = pub.publicar({ tipo: 'estado', job_id: 'j', porque_local: r.porque_local });
  assert.equal(p.publicado, false);
  assert.match(p.porque, /fora da allowlist/);
});

test('despachar · toolWork que rebenta nao rebenta o handler', async () => {
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async () => { throw new Error('o motor caiu'); } });
  const r = await despachar(PEDIDO);
  assert.equal(r.job_id, null);
  assert.match(r.porque_local, /o motor caiu/);
});

test('despachar · toolWork sem job_id nao inventa um', async () => {
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(), toolWork: async () => ({}) });
  assert.equal((await despachar(PEDIDO)).job_id, null);
});

test('despachar · goal vazio nao chega ao motor', async () => {
  let chamou = false;
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async () => { chamou = true; return { job_id: 'j' }; } });
  assert.equal((await despachar({ goal: '   ', agent: 'cc', wave: 'w', actor: null })).job_id, null);
  assert.equal(chamou, false);
});

test('criarDespachador · sem toolWork ou sem syncPath nao se monta', () => {
  assert.throws(() => criarDespachador({ syncPath: DESTRAVADO() }), /toolWork/);
  assert.throws(() => criarDespachador({ toolWork: async () => ({}) }), /syncPath/);
});
