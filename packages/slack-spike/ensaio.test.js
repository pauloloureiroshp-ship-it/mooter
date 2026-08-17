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
  // captura TUDO o que sai: o texto da notificacao E as strings dos blocos.
  // Antes so se capturava o 1o argumento; com o Block Kit, isso deixaria dezenas
  // de strings fora do que os testes de vazamento inspeccionam.
  const publicador = criarPublicador({
    enviar: (t, p, b) => { enviados.push(t + '\n' + JSON.stringify(b)); return { ok: true }; },
  });
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
  // o cartao mostra CHARS_HASH chars de cada hash — 64 nao cabem num telemovel e
  // ninguem os le. O que a demo precisa e de os ver DIFERENTES, nao completos.
  const n = require('./cartao.js').CHARS_HASH;
  assert.ok(texto.includes(hashVelho.slice(0, n)), 'faltou o hash esperado');
  assert.ok(texto.includes(hashNovo.slice(0, n)), 'faltou o hash actual');
  assert.notEqual(hashVelho.slice(0, n), hashNovo.slice(0, n),
    'com este prefixo os dois hashes ficam iguais no ecra — o CAS deixa de se ver');
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
  // dinheiro sai formatado ($0,62), nao cru (0.62): o ledger da 0.1372512 e
  // ninguem le dinheiro assim. O que importa e que o VALOR continua a sair.
  assert.match(texto, /US\$ 0,62/);
  assert.ok(!/0\.6200000|0\.62[0-9]/.test(texto), 'o valor cru nao devia sair');
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

// ── o FIM tem de se dizer ──────────────────────────────────────────────────
// Um job que acaba sem pedir decisao nao produzia mensagem: o thread ficava no
// «volto quando precisar de uma decisao» para sempre, com o trabalho a correr,
// a gastar e a terminar bem. Foi isto que nos cegou ao vivo.
function bancadaConcluida({ jobId = 'job-fim-1', exit = 0, evento = 'done' } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-fim-'));
  const agora = new Date().toISOString();
  const eventos = [
    { ts: agora, job_id: jobId, event: 'dispatched', agent: 'cc', wave: 'slack-spike',
      goal: 'uma coisa pequena', actor: { type: 'human', id: 'slack:U_PAULO', origem: 'slack' } },
    { ts: agora, job_id: jobId, event: evento, agent: 'cc', wave: 'slack-spike', exit_code: exit,
      cost_usd: 0.0959, cost_usd_fonte: 'reportado pelo CLI', model_used: 'claude-haiku-4-5-20251001',
      actor: { type: 'human', id: 'slack:U_PAULO', origem: 'slack' } },
  ];
  fs.writeFileSync(path.join(home, 'ledger.jsonl'), eventos.map((e) => JSON.stringify(e)).join('\n') + '\n');
  process.env.MOOTER_HOME = home;
  return { home, jobId };
}

test('fecho · um job que acaba SEM pendente diz o FIM no thread, com custo', async () => {
  const { jobId } = bancadaConcluida();
  const { ad, enviados } = montar();
  const r = await ad.publicarFechos({ jobs: [jobId] });
  assert.equal(r.length, 1);
  assert.equal(r[0].estado, 'concluido');
  const t = enviados.join('\n');
  assert.match(t, /Trabalho concluído/);
  assert.match(t, /US\$ 0,10/, 'o fim tem de dizer quanto custou');
  assert.match(t, new RegExp(jobId));
});

test('fecho · um job FALHADO diz que falhou e que nada foi aplicado', async () => {
  const { jobId } = bancadaConcluida({ jobId: 'job-fim-2', evento: 'failed', exit: 1 });
  const { ad, enviados } = montar();
  assert.equal((await ad.publicarFechos({ jobs: [jobId] }))[0].estado, 'falhou');
  assert.match(enviados.join('\n'), /Trabalho falhou[\s\S]*Nada foi aplicado/);
});

test('fecho · um job A ESPERA DE DECISAO nao leva fecho (esse tem cartao)', async () => {
  const { jobId } = bancada();
  const { ad, enviados } = montar();
  assert.deepEqual(await ad.publicarFechos({ jobs: [jobId] }), []);
  assert.equal(enviados.length, 0);
});

test('fecho · um prep_timeout NAO se reporta (o motor encadeia um job novo a seguir)', async () => {
  const { jobId } = bancadaConcluida({ jobId: 'job-prep', evento: 'prep_timeout', exit: 'prep-timeout' });
  const { ad, enviados } = montar();
  assert.deepEqual(await ad.publicarFechos({ jobs: [jobId] }), [],
    'anunciar «falhou» num prep encadeado era mentir sobre trabalho que continua');
  assert.equal(enviados.length, 0);
});

test('fecho · nao se repete a cada tique do poller', async () => {
  const { jobId } = bancadaConcluida({ jobId: 'job-fim-3' });
  const { ad, enviados } = montar();
  const fechados = new Set();
  const marcar = (r) => { for (const f of r) if (f.publicado) fechados.add(f.job_id); };
  marcar(await ad.publicarFechos({ jobs: [jobId], jaVisto: (j) => fechados.has(j) }));
  marcar(await ad.publicarFechos({ jobs: [jobId], jaVisto: (j) => fechados.has(j) }));
  assert.equal(enviados.length, 1, 'dois tiques, um fecho');
});

// ── o cartao da decisao tem de levar os NUMEROS ────────────────────────────
// Visto no Slack do dono: «Já gasto: n/d — sem fonte no ledger» num pedido cujo
// custo ESTAVA no ledger (US$ 0,65, reportado pelo CLI). Publicava-se a decisao
// com {estado, auditoria} e mais nada. Um cartao de custodia que mostra n/d onde
// tem o numero nao parece honesto, parece avariado.
test('decisao · o cartao publicado leva custo, modelo e impressao — nao n/d', async () => {
  const { jobId } = bancada();
  const { ad, enviados } = montar();
  const pend = broker.listPending()[0];
  await ad.receberInteraccao({ user_id: 'U_PAULO', accao: 'aprovar', request_id: jobId,
    idem_key: 'k-num', expected_state_hash: pend.state_hash });
  const t = enviados.join('\n');
  assert.match(t, /US\$ 0,62/, 'o custo estava no ledger e o cartao disse n/d');
  assert.match(t, /claude-opus-5/, 'faltou o modelo');
  assert.ok(t.includes(pend.state_hash), 'faltou a impressao completa do pedido');
  assert.ok(!/sem fonte no ledger/.test(t), 'disse «sem fonte» com a fonte presente');
});

// ── silenciar um job sem o decidir ─────────────────────────────────────────
// Um pendente de um goal patologico ficava na fila e reaparecia a CADA religar,
// porque o `vistos` vive em memoria. Silenciar nao e decidir: o pendente continua
// na fila e continua decidivel — so deixa de se anunciar.
test('silenciar · um job ignorado nao se anuncia, mas CONTINUA na fila', async () => {
  const { jobId } = bancada();
  const { ad, enviados } = montar();
  const ignorados = new Set([jobId]);
  const r = await ad.publicarPendentes({ jaVisto: (p) => ignorados.has(p.job_id) });
  assert.equal(enviados.length, 0, 'o cartao nao devia ter saido');
  assert.equal(r[0].publicado, false);
  assert.equal(broker.listPending().length, 1, 'silenciar NAO pode tirar da fila');
});
