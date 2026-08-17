'use strict';
/** ⚠️ THROWAWAY — spike Slack. Ver README.md e morte.js. Nao copiar para o produto. */

/**
 * O ensaio do infeliz (kimi #4) + o loop feliz, contra o broker REAL em
 * dry-run: MOOTER_HOME aponta para uma pasta temporaria e o dispatcher e um
 * duplo. NENHUM despacho real acontece nesta suite.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const broker = require('../mooter-bridge/broker.js');
const { criarAllowlist } = require('./allowlist.js');
const { criarPublicador } = require('./publicar.js');
const { criarAdaptador, lerLedgerPorOmissao } = require('./adapter.js');
const transporte = require('./transporte.js');

const MP_TEXTO = '# masterprompt de ensaio\n\nfaz uma coisa pequena.\n';
const MP_HASH = crypto.createHash('sha256').update(MP_TEXTO, 'utf8').digest('hex');

/** Cria um MOOTER_HOME temporario com UM pendente real, pronto a decidir. */
function bancada({ jobId = 'job-ensaio-1', actor = null } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-home-'));
  fs.mkdirSync(path.join(home, 'jobs', jobId), { recursive: true });
  fs.writeFileSync(path.join(home, 'jobs', jobId, 'masterprompt.md'), MP_TEXTO, 'utf8');

  const agora = new Date().toISOString();
  const eventos = [
    { ts: agora, job_id: jobId, event: 'dispatched', agent: 'cc', wave: 'slack-spike',
      worktree: 'C:\\repo', goal: 'uma coisa pequena', mp_hash: MP_HASH, tier: 'T3',
      permissoes_efectivas: { valor: ['Read', 'Edit'] }, escrita: true },
    { ts: agora, job_id: jobId, event: 'nao_verificado', agent: 'cc', wave: 'slack-spike',
      worktree: 'C:\\repo', exit_code: 'agent-awaiting-approval', mp_hash: MP_HASH,
      cost_usd: 0.62, cost_usd_fonte: 'reportado pelo CLI', model_used: 'claude-opus-5',
      files_touched: null, visibilidade: 'local_only',
      actor: actor || { type: 'system', id: 'system', origem: null },
      actor_porque: actor ? 'declarado por quem disparou'
        : 'n/d — ator não declarado por quem disparou; nunca inferido' },
  ];
  fs.writeFileSync(path.join(home, 'ledger.jsonl'),
    eventos.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  process.env.MOOTER_HOME = home;
  return { home, jobId };
}

function montar({ despachar } = {}) {
  const enviados = [];
  const publicador = criarPublicador({ enviar: (t) => { enviados.push(t); return { ok: true }; } });
  const ad = criarAdaptador({
    allowlist: criarAllowlist(['U_PAULO']),
    publicador,
    broker,
    despachar: despachar || (async () => ({ job_id: 'job-novo-dry-run' })),
  });
  return { ad, enviados };
}

test.beforeEach(() => { broker.setDispatcher(async () => ({ job_id: 'job-redespacho-dry-run' })); });
test.afterEach(() => { delete process.env.MOOTER_HOME; });

// ── o caminho feliz ───────────────────────────────────────────────────────
test('feliz · mencao do id da allowlist e aceite e despachada com actor do Slack', async () => {
  bancada();
  const vistos = [];
  const { ad } = montar({ despachar: async (a) => { vistos.push(a); return { job_id: 'job-novo' }; } });
  const r = await ad.receberMencao({ user_id: 'U_PAULO', texto: 'arruma os testes', thread: 'T1' });
  assert.equal(r.aceite, true);
  assert.equal(vistos.length, 1);
  assert.deepEqual(vistos[0].actor, { type: 'human', id: 'slack:U_PAULO', origem: 'slack' });
});

test('feliz · o thread-context NUNCA entra no prompt', async () => {
  bancada();
  const vistos = [];
  const { ad } = montar({ despachar: async (a) => { vistos.push(a); return { job_id: 'job-novo' }; } });
  await ad.receberMencao({
    user_id: 'U_PAULO', texto: 'arruma os testes', thread: 'T1',
    thread_context: ['msg anterior com a password hunter2', 'outra msg'],
  });
  const serializado = JSON.stringify(vistos[0]);
  assert.ok(!serializado.includes('hunter2'), 'o contexto do thread entrou no despacho: ' + serializado);
  assert.ok(!serializado.includes('msg anterior'));
});

test('feliz · aprovar publica a ENTRADA DE AUDITORIA do ledger no thread (kimi #8)', async () => {
  const { jobId } = bancada();
  const { ad, enviados } = montar();
  const pend = broker.listPending()[0];
  assert.ok(pend, 'a bancada devia ter um pendente');

  const r = await ad.receberInteraccao({
    user_id: 'U_PAULO', accao: 'aprovar', request_id: jobId,
    idem_key: 'k1', expected_state_hash: pend.state_hash, thread: 'T1',
  });
  assert.equal(r.estado, 'APPROVED');
  const texto = enviados.join('\n');
  assert.match(texto, /APPROVED/);
  assert.ok(texto.includes(jobId), 'a auditoria devia identificar o pedido');
  assert.ok(texto.includes(pend.state_hash.slice(0, 12)), 'a auditoria devia mostrar o hash aprovado');
});

// ── falha 1 · recusa ──────────────────────────────────────────────────────
test('infeliz 1 · recusar grava REJECTED e diz-se no thread', async () => {
  const { jobId } = bancada();
  const { ad, enviados } = montar();
  const pend = broker.listPending()[0];
  const r = await ad.receberInteraccao({
    user_id: 'U_PAULO', accao: 'recusar', request_id: jobId,
    idem_key: 'k-recusa', expected_state_hash: pend.state_hash, thread: 'T1',
  });
  assert.equal(r.estado, 'REJECTED');
  assert.match(enviados.join('\n'), /recus|REJECTED/i);
});

// ── falha 2 · clique atrasado (STALE com o hash a trabalhar) ──────────────
test('infeliz 2 · clique atrasado da STALE e MOSTRA os dois hashes', async () => {
  const { home, jobId } = bancada();
  const { ad, enviados } = montar();
  const hashVelho = broker.listPending()[0].state_hash;

  // o mundo mexeu-se entre o cartao e o clique
  fs.appendFileSync(path.join(home, 'ledger.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), job_id: jobId, event: 'step', step_index: 1 }) + '\n');
  const hashNovo = broker.listPending()[0].state_hash;
  assert.notEqual(hashVelho, hashNovo, 'o ensaio nao mexeu no estado — o STALE nao seria real');

  const r = await ad.receberInteraccao({
    user_id: 'U_PAULO', accao: 'aprovar', request_id: jobId,
    idem_key: 'k-stale', expected_state_hash: hashVelho, thread: 'T1',
  });
  assert.equal(r.estado, 'STALE');
  const texto = enviados.join('\n');
  assert.ok(texto.includes(hashVelho.slice(0, 12)), 'faltou o hash esperado');
  assert.ok(texto.includes(hashNovo.slice(0, 12)), 'faltou o hash actual');
  // e o pendente CONTINUA na fila — um clique obsoleto nao decide nada
  assert.equal(broker.listPending().length, 1);
});

// ── falha 3 · daemon offline (o pendente sobrevive e reaparece) ───────────
test('infeliz 3 · daemon morre e ao religar o pendente reaparece', async () => {
  bancada();
  const a = montar();
  const antes = await a.ad.publicarPendentes({ thread: 'T1' });
  assert.equal(antes.length, 1);

  // "o daemon morreu": instancia nova, memoria nova, mesmo ledger
  const b = montar();
  const depois = await b.ad.publicarPendentes({ thread: 'T1' });
  assert.equal(depois.length, 1, 'o pendente devia sobreviver ao daemon');
  assert.equal(depois[0].job_id, antes[0].job_id);
  assert.match(b.enviados.join('\n'), /aprova|pendente/i);
});

// ── kimi #1 (ALTO) · a allowlist vale nos DOIS caminhos ───────────────────
test('kimi #1 · clique de TERCEIRO e ignorado, registado, e NAO chega ao broker', async () => {
  const { jobId } = bancada();
  const { ad, enviados } = montar();
  const pend = broker.listPending()[0];

  const r = await ad.receberInteraccao({
    user_id: 'U_ESTRANHO', accao: 'aprovar', request_id: jobId,
    idem_key: 'k-estranho', expected_state_hash: pend.state_hash, thread: 'T1',
  });
  assert.equal(r.estado, 'IGNORADO');
  assert.equal(broker.listPending().length, 1, 'o estranho mexeu no pendente');
  assert.equal(enviados.length, 0, 'nao se responde a um estranho no canal');
  assert.equal(ad.registo.filter((x) => x.tipo === 'clique_de_fora').length, 1);
});

test('kimi #1 · mencao de TERCEIRO nao despacha nada', async () => {
  bancada();
  let despachos = 0;
  const { ad } = montar({ despachar: async () => { despachos++; return { job_id: 'x' }; } });
  const r = await ad.receberMencao({ user_id: 'U_ESTRANHO', texto: 'apaga tudo', thread: 'T1' });
  assert.equal(r.aceite, false);
  assert.equal(despachos, 0);
});

// ── pendente ja decidido · resposta efemera ───────────────────────────────
test('pendente ja decidido responde "ja decidido" de forma efemera', async () => {
  const { jobId } = bancada();
  const { ad, enviados } = montar();
  const pend = broker.listPending()[0];
  await ad.receberInteraccao({ user_id: 'U_PAULO', accao: 'recusar', request_id: jobId,
    idem_key: 'k1', expected_state_hash: pend.state_hash, thread: 'T1' });
  enviados.length = 0;

  const r = await ad.receberInteraccao({ user_id: 'U_PAULO', accao: 'aprovar', request_id: jobId,
    idem_key: 'k2', expected_state_hash: pend.state_hash, thread: 'T1' });
  assert.match(r.porque, /ja decidido|já decidido/i);
  assert.equal(r.efemero, true);
  assert.equal(enviados.length, 0, 'uma resposta efemera nao se publica no canal');
});

// ── o cartao nunca leva conteudo ──────────────────────────────────────────
test('cartao · leva custo/modelo/autor e NUNCA goal, worktree ou masterprompt', async () => {
  bancada();
  const { ad, enviados } = montar();
  await ad.publicarPendentes({ thread: 'T1' });
  const texto = enviados.join('\n');
  assert.match(texto, /0\.62/);
  assert.match(texto, /claude-opus-5/);
  assert.ok(!texto.includes('uma coisa pequena'), 'o goal vazou para o cartao');
  assert.ok(!texto.includes('C:\\repo'), 'o worktree vazou para o cartao');
  assert.ok(!texto.includes(MP_HASH), 'o mp_hash vazou para o cartao');
});

// ── o round-trip do cartao (o buraco que faltava) ─────────────────────────
// Ate aqui provava-se o cartao E provava-se o clique, mas nunca com o cartao a
// ALIMENTAR o clique. No meio faltava o `hash_esperado`: o `cartaoDe` nao o
// punha, e sem ele o botao nascia sem CAS — ou seja, sem botao nenhum.
test('round-trip · o cartao do pendente REAL gera botoes, e o botao decide o MESMO pedido', async () => {
  const { jobId } = bancada();
  const { ad } = montar();

  const pend = broker.listPending()[0];
  const cartao = ad.cartaoDe(pend, lerLedgerPorOmissao());
  assert.equal(cartao.hash_esperado, pend.state_hash,
    'o hash tem de viajar NO cartao: e o cartao que o botao carrega de volta');

  const blocos = transporte.blocosDoCartao('texto do cartao', cartao);
  const accoes = blocos.find((b) => b.type === 'actions');
  assert.ok(accoes, 'sem botoes nao ha demo');
  const botaoAprovar = accoes.elements.find((e) => e.action_id === transporte.ACCOES.aprovar);

  // o clique regressa pelo caminho do Slack, com o hash QUE ESTAVA no cartao
  const c = transporte.classificarEnvelope({
    type: 'interactive', envelope_id: 'e1',
    payload: { type: 'block_actions', user: { id: 'U_PAULO' }, message: { ts: '1700.1' },
      actions: [{ action_id: botaoAprovar.action_id, action_ts: '1700.9', value: botaoAprovar.value }] },
  }, 'U0BOT');
  assert.equal(c.dados.request_id, jobId);
  assert.equal(c.dados.expected_state_hash, pend.state_hash);

  const r = await ad.receberInteraccao(c.dados);
  assert.equal(r.estado, 'APPROVED');
});

test('round-trip · o botao do cartao ANTIGO leva um clique atrasado a STALE, nao a decisao', async () => {
  bancada();
  const { ad } = montar();
  const pend = broker.listPending()[0];
  const cartao = ad.cartaoDe(pend, lerLedgerPorOmissao());
  const botao = transporte.blocosDoCartao('t', cartao)
    .find((b) => b.type === 'actions').elements[0];

  // o mundo mexeu-se depois de o cartao sair: o hash do cartao envelheceu
  const c = transporte.classificarEnvelope({
    type: 'interactive', envelope_id: 'e2',
    payload: { type: 'block_actions', user: { id: 'U_PAULO' }, message: { ts: '1.1' },
      actions: [{ action_id: botao.action_id, action_ts: '2.0',
        value: transporte.valorDoBotao(cartao.job_id, 'aprovar', 'hash-de-um-cartao-velho') }] },
  }, 'U0BOT');

  const r = await ad.receberInteraccao(c.dados);
  assert.equal(r.estado, 'STALE', 'o hash do cartao e que manda — ler um hash fresco matava isto');
});

// ── o poller: o cartao so aparece se alguem o publicar ────────────────────
// Havia `publicarPendentes()` desde o inicio e ninguem o chamava: o socket traz
// mencoes e cliques, mas o pendente nasce no LEDGER, minutos depois. Sem poller
// a demo morria no passo 3, com a suite toda verde.
test('poller · o mesmo cartao NAO se republica a cada tique', async () => {
  bancada();
  const { ad, enviados } = montar();
  const vistos = new Set();
  const jaVisto = (p) => vistos.has(p.job_id + ':' + p.state_hash);
  const marcar = (r) => { for (const x of r) if (x.publicado) vistos.add(x.job_id + ':' + x.state_hash); };

  marcar(await ad.publicarPendentes({ jaVisto }));
  assert.equal(enviados.length, 1);
  marcar(await ad.publicarPendentes({ jaVisto }));
  marcar(await ad.publicarPendentes({ jaVisto }));
  assert.equal(enviados.length, 1, 'tres tiques, um cartao');
});

test('poller · se o ESTADO mudar, sai cartao novo (o botao antigo ja daria STALE)', async () => {
  const { home, jobId } = bancada();
  const { ad, enviados } = montar();
  const vistos = new Set();
  const jaVisto = (p) => vistos.has(p.job_id + ':' + p.state_hash);
  const marcar = (r) => { for (const x of r) if (x.publicado) vistos.add(x.job_id + ':' + x.state_hash); };

  marcar(await ad.publicarPendentes({ jaVisto }));
  assert.equal(enviados.length, 1);

  fs.appendFileSync(path.join(home, 'ledger.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), job_id: jobId, event: 'step', step_index: 7 }) + '\n');

  marcar(await ad.publicarPendentes({ jaVisto }));
  assert.equal(enviados.length, 2, 'estado novo => cartao novo, com um hash que ainda decide');
});

test('poller · o filtro por actor impede o canal de receber pendentes que NAO nasceram no Slack', async () => {
  bancada();   // o pendente da bancada tem actor `system`, nao `slack:…`
  const { ad, enviados } = montar();
  const r = await ad.publicarPendentes({ filtro: { actor: 'slack:U_PAULO' } });
  assert.equal(r.length, 0, 'um pendente de outra origem nao se mostra no canal da demo');
  assert.equal(enviados.length, 0);
});

test('poller · e MOSTRA o pendente que nasceu no Slack', async () => {
  bancada({ actor: { type: 'human', id: 'slack:U_PAULO', origem: 'slack' } });
  const { ad, enviados } = montar();
  const r = await ad.publicarPendentes({ filtro: { actor: 'slack:U_PAULO' } });
  assert.equal(r.length, 1);
  assert.equal(enviados.length, 1);
});
