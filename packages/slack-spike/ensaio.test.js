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
const { criarPoller } = require('./poller.js');
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

function montar({ despachar, silenciados, cancelar, enviar, registar } = {}) {
  const enviados = [];
  const capturas = [];
  // captura TUDO o que sai: o texto da notificacao E as strings dos blocos.
  // Antes so se capturava o 1o argumento; com o Block Kit, isso deixaria dezenas
  // de strings fora do que os testes de vazamento inspeccionam.
  const publicador = criarPublicador({
    enviar: (t, p, b) => {
      capturas.push({ texto: t, payload: p, blocos: b });
      enviados.push(t + '\n' + JSON.stringify(p) + '\n' + JSON.stringify(b));
      return typeof enviar === 'function' ? enviar(t, p, b) : { enviado: true };
    },
  });
  const ad = criarAdaptador({
    allowlist: criarAllowlist(['U_PAULO']),
    publicador,
    broker,
    despachar: despachar || (async () => ({ job_id: 'job-novo-dry-run' })),
    silenciados,
    cancelar,
    registar,
  });
  return { ad, enviados, capturas, publicador };
}

test.beforeEach(() => { broker.setDispatcher(async () => ({ job_id: 'job-redespacho-dry-run' })); });
test.afterEach(() => {
  delete process.env.MOOTER_HOME;
  delete process.env.SLACK_HEARTBEAT_MS;
});

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

// ── o botao PARAR (decisao de maestro H3: cancelar > progresso) ────────────
const { criarCancelador } = require('./cancelar.js');
const cartao = require('./cartao.js');

function comSyncVivo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-stop-'));
  const p = path.join(d, 'SYNC.md');
  fs.writeFileSync(p, '# SYNC\n\n' + require('./gate.js').LINHA_DESTRAVE + '\n');
  return p;
}

test('parar · o CAS NAO bloqueia um stop (um clique atrasado tem de parar na mesma)', async () => {
  const vistos = [];
  const { cancelar } = criarCancelador({ syncPath: comSyncVivo(),
    toolCancel: async (a) => { vistos.push(a); return { job_id: a.job_id, state: 'cancelled' }; } });
  // hash deliberadamente velho: com CAS estrito isto seria recusado
  const r = await cancelar({ job_id: 'job-1', actor: null, hash_visto: '0000dead' });
  assert.equal(r.parado, true, 'o botao de emergencia falhou exactamente quando o estado muda');
  assert.equal(vistos.length, 1);
});

test('parar · um job JA TERMINADO e no-op, nao erro (idempotente)', async () => {
  const { cancelar } = criarCancelador({ syncPath: comSyncVivo(),
    toolCancel: async () => ({ job_id: 'j', state: 'done',
      note: 'já estava terminado — nada a fazer (idempotente)' }) });
  const r = await cancelar({ job_id: 'j' });
  assert.equal(r.parado, true);
  assert.equal(r.estado, 'JA_TERMINADO');
});

test('parar · com o SYNC trancado o stop NAO chega ao motor', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-stop2-'));
  fs.writeFileSync(path.join(d, 'SYNC.md'), '# SYNC\n\nnada aqui\n');
  let chamou = false;
  const { cancelar } = criarCancelador({ syncPath: path.join(d, 'SYNC.md'),
    toolCancel: async () => { chamou = true; return {}; } });
  const r = await cancelar({ job_id: 'j' });
  assert.equal(r.parado, false);
  assert.equal(chamou, false);
});

test('parar · allowlist do stop: nada fora de job_id/actor/hash_visto atravessa', async () => {
  let chamou = false;
  const { cancelar } = criarCancelador({ syncPath: comSyncVivo(),
    toolCancel: async () => { chamou = true; return {}; } });
  const r = await cancelar({ job_id: 'j', worktree: 'C:\Users\Paulo\paulo-vault' });
  assert.equal(r.parado, false);
  assert.match(r.porque_local, /fora da allowlist do stop/);
  assert.equal(chamou, false);
});

test('parar · o adapter chama a porta do stop e publica o desfecho COM o custo', async () => {
  const { jobId } = bancada();
  const enviados = [];
  const publicador = criarPublicador({
    enviar: (t, p, b) => { enviados.push(t + '\n' + JSON.stringify(b)); } });
  const ad = criarAdaptador({ allowlist: criarAllowlist(['U_PAULO']), publicador, broker,
    despachar: async () => ({ job_id: 'x' }),
    cancelar: async () => ({ parado: true, estado: 'PARADO' }) });
  const r = await ad.receberInteraccao({ user_id: 'U_PAULO', accao: 'parar',
    request_id: jobId, expected_state_hash: 'seja-o-que-for' });
  assert.equal(r.estado, 'PARADO');
  const t = enviados.join('\n');
  assert.match(t, /🛑/);
  assert.match(t, /US\$ 0,62/, 'o custo ATE ao stop e a informacao mais util deste cartao');
  assert.match(t, /accao=parar/, 'a auditoria tem de registar o stop');
});

test('parar · um clique de terceiro no PARAR tambem morre na allowlist', async () => {
  let chamou = false;
  const { ad } = montar();
  const ad2 = criarAdaptador({ allowlist: criarAllowlist(['U_PAULO']),
    publicador: criarPublicador({ dryRun: true }), broker,
    despachar: async () => ({ job_id: 'x' }),
    cancelar: async () => { chamou = true; return { parado: true, estado: 'PARADO' }; } });
  const r = await ad2.receberInteraccao({ user_id: 'U_ESTRANHO', accao: 'parar',
    request_id: 'j', expected_state_hash: 'h' });
  assert.equal(r.estado, 'IGNORADO');
  assert.equal(chamou, false, 'o stop de um estranho nem chega a porta');
  void ad;
});

test('cartao (unidade) · o heartbeat SO mostra numeros quando ha numeros reais', () => {
  const semNada = cartao.construir({ tipo: 'estado', job_id: 'job-a-1234',
    hash_esperado: 'h'.repeat(64) });
  assert.match(JSON.stringify(semNada.blocos), /Recebido/);
  assert.ok(!/passos/.test(JSON.stringify(semNada.blocos)), 'inventou progresso do nada');

  const comNumeros = cartao.construir({ tipo: 'estado', job_id: 'job-a-1234',
    hash_esperado: 'h'.repeat(64), passos: 4, segundos: 72 });
  const t = JSON.stringify(comNumeros.blocos);
  assert.match(t, /4 passos/);
  assert.match(t, /1m12s/);
  assert.ok(!/%/.test(t), 'uma percentagem seria inventada — nao ha denominador');

  const soTempo = cartao.construir({ tipo: 'estado', job_id: 'job-a-1234',
    hash_esperado: 'h'.repeat(64), passos: 0, segundos: 72 });
  const tt = JSON.stringify(soTempo.blocos);
  assert.match(tt, /1m12s/);
  assert.ok(!/0 passos/.test(tt), 'zero passos e ausencia de medicao, nao progresso');
});

test('cartao (unidade) · tem botao PARAR, e sem confirmacao (stop com atrito nao e stop)', () => {
  const b = cartao.construir({ tipo: 'estado', job_id: 'job-a-1234', hash_esperado: 'h'.repeat(64) }).blocos;
  const acc = b.find((x) => x.type === 'actions');
  assert.ok(acc, 'nao ha botao de parar');
  assert.equal(acc.elements[0].action_id, cartao.ACCOES.parar);
  assert.ok(!acc.elements[0].confirm, 'um stop de emergencia com confirmacao chega tarde');
  assert.ok(!acc.elements[0].style, 'o vermelho aqui leria-se como "acao perigosa"');
});

// ── um pendente nosso nao desaparece por o motor esquecer quem pediu ───────
// Visto ao vivo: a reconciliacao do motor re-carimba o estado de um job antigo com
// um evento SEM actor; o actor degrada para `legacy` e um listPending({actor}) deixa
// de o ver. O pedido continua a espera no motor e SOME do Slack.
test('pertenca · um job re-carimbado SEM actor continua a ser nosso', async () => {
  const { home, jobId } = bancada({ actor: { type: 'human', id: 'slack:U_PAULO', origem: 'slack' } });
  const { ad } = montar();
  const ledger0 = lerLedgerPorOmissao();
  assert.ok(ad.jobsNossos(ledger0, 'slack:U_PAULO').has(jobId), 'devia ser nosso a partida');

  // a reconciliacao do motor: mesmo estado, evento novo, SEM actor
  fs.appendFileSync(path.join(home, 'ledger.jsonl'), JSON.stringify({
    ts: new Date().toISOString(), job_id: jobId, event: 'nao_verificado',
    exit_code: 'agent-awaiting-approval' }) + '\n');

  const ledger1 = lerLedgerPorOmissao();
  assert.equal(broker.listPending({ actor: 'slack:U_PAULO' }).length, 0,
    'o filtro do broker perde-o — e este o comportamento que nos mordeu');
  assert.ok(ad.jobsNossos(ledger1, 'slack:U_PAULO').has(jobId),
    'a pertenca derivada do ledger tem de sobreviver ao re-carimbo');
});

test('pertenca · o cartao continua a sair depois do re-carimbo', async () => {
  const { home, jobId } = bancada({ actor: { type: 'human', id: 'slack:U_PAULO', origem: 'slack' } });
  const { ad, enviados } = montar();
  fs.appendFileSync(path.join(home, 'ledger.jsonl'), JSON.stringify({
    ts: new Date().toISOString(), job_id: jobId, event: 'nao_verificado',
    exit_code: 'agent-awaiting-approval' }) + '\n');
  const nossos = ad.jobsNossos(lerLedgerPorOmissao(), 'slack:U_PAULO');
  const r = await ad.publicarPendentes({ pertence: (j) => nossos.has(j) });
  assert.equal(r.length, 1, 'o cartao desapareceu do Slack com o pedido ainda a espera');
  assert.equal(enviados.length, 1);
});

test('pertenca · um job de OUTRA origem continua fora (a pertenca nao alargou)', async () => {
  bancada();   // actor `system`, nao nosso
  const { ad, enviados } = montar();
  const nossos = ad.jobsNossos(lerLedgerPorOmissao(), 'slack:U_PAULO');
  assert.deepEqual(await ad.publicarPendentes({ pertence: (j) => nossos.has(j) }), []);
  assert.equal(enviados.length, 0);
});

// ── o que o critico externo apanhou e eu nao (achado 2026-08-17) ───────────
// O broker liga o filho ao pai por DOIS campos: `prep_from` quando a preparacao
// EXPIRA, `handoff_from` quando ela tem SUCESSO. Eu so conhecia o primeiro — logo
// o caminho FELIZ perdia a thread e o trabalho pago acabava sem aparecer no Slack.
function bancadaPrepComFilho() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-hand-'));
  const t = new Date().toISOString();
  const nosso = { type: 'human', id: 'slack:U_PAULO', origem: 'slack' };
  fs.writeFileSync(path.join(home, 'ledger.jsonl'), [
    { ts: t, job_id: 'job-prep', event: 'dispatched', agent: 'moo', preparation: true, actor: nosso },
    { ts: t, job_id: 'job-prep', event: 'done', agent: 'moo', exit_code: 0, cost_usd: 0,
      preparation: true, cost_usd_fonte: 'inferência local sem custo de API' },
    { ts: t, job_id: 'job-filho', event: 'dispatched', agent: 'cc', handoff_from: 'job-prep' },
    { ts: t, job_id: 'job-filho', event: 'done', agent: 'cc', exit_code: 0, cost_usd: 0.1218961,
      cost_usd_fonte: 'reportado pelo CLI', model_used: 'claude-haiku-4-5-20251001' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  process.env.MOOTER_HOME = home;
  return { home };
}

test('handoff_from · o filho de uma preparacao BEM SUCEDIDA e nosso', () => {
  bancadaPrepComFilho();
  const { ad } = montar();
  const nossos = ad.jobsNossos(lerLedgerPorOmissao(), 'slack:U_PAULO');
  assert.ok(nossos.has('job-filho'),
    'o caminho feliz perdia o filho: so se seguia prep_from, e a prep boa liga por handoff_from');
});

test('preparacao · o `done` de uma PREP nunca se anuncia como trabalho concluido', async () => {
  bancadaPrepComFilho();
  const { ad, enviados } = montar();
  const r = await ad.publicarFechos({ jobs: ['job-prep'] });
  assert.deepEqual(r, [], 'anunciar o done da prep foi o que fez o dono ver «US$ 0,00 de graca»');
  assert.equal(enviados.length, 0);
});

test('preparacao · o fecho e do FILHO, e leva o custo REAL', async () => {
  bancadaPrepComFilho();
  const { ad, enviados } = montar();
  const r = await ad.publicarFechos({ jobs: ['job-prep', 'job-filho'] });
  assert.equal(r.length, 1);
  assert.equal(r[0].job_id, 'job-filho');
  assert.match(enviados.join('\n'), /US\$ 0,12/,
    'o custo que o dono ve tem de ser o do trabalho, nao o zero da preparacao');
});

// ── o cartao silenciado que ficou com o botao quente ──────────────────────
test('silenciado · Aprovar nao gasta, mas Parar continua a travar', async () => {
  // ⚠️ O silencio vivia SO no poller (publicacao). O caminho do clique nunca o via,
  // e um cartao ja publicado ficava no canal com o [Aprovar] quente. Visto no
  // #mooter-demo: o cartao do ciclo mau — opus, US$ 0,66 ja gastos — a um clique
  // de gastar outra vez, dias depois de ter sido «silenciado».
  bancada();
  const despachados = [];
  const parados = [];
  const { ad } = montar({
    despachar: async (a) => { despachados.push(a); return { job_id: 'job-caro' }; },
    silenciados: new Set(['job-mau']),
    cancelar: async (x) => { parados.push(x); return { parado: true, estado: 'PARADO' }; },
  });

  const r = await ad.receberInteraccao({ user_id: 'U_PAULO', request_id: 'job-mau', accao: 'aprovar' });
  assert.equal(r.estado, 'SILENCIADO');
  assert.equal(despachados.length, 0, 'o clique num job silenciado gastou dinheiro');
  assert.match(r.porque, /Recusar e Parar continuam/);

  // e o dono NAO fica preso dentro do cartao: travar tem de continuar a passar
  await ad.receberInteraccao({ user_id: 'U_PAULO', request_id: 'job-mau', accao: 'parar' });
  assert.equal(parados.length, 1, 'silenciar um job trancou o proprio botao que o trava');
});

test('silenciado · um job NAO silenciado continua a poder ser aprovado', async () => {
  bancada();
  const { ad } = montar({ silenciados: new Set(['job-outro']) });
  const r = await ad.receberInteraccao({ user_id: 'U_PAULO', request_id: 'job-bom', accao: 'aprovar' });
  assert.notEqual(r.estado, 'SILENCIADO', 'o guarda apanhou um job que nao estava silenciado');
});

// ── a cadeia tem de chegar a TODOS os cartoes que levam custo ─────────────
test('cadeia · TODO o cartao que leva custo leva tambem a cadeia (pendente · decisao · parado · fecho)', async () => {
  // ⚠️ Este e o teste que impede a sexta instancia de voltar. Ligar um campo novo
  // em UM sitio e testa-lo ali deixa os outros tres a mostrar o numero do pedido
  // enquanto um mostra o da conversa — dois numeros na mesma thread e nenhuma
  // regra para saber qual e qual e pior que nao ter cadeia nenhuma.
  const vistos = [];
  const LEDGER = [
    { event: 'dispatched', job_id: 'j1' },
    { event: 'done', job_id: 'j1', cost_usd: 0.1, cost_usd_fonte: 'reportado pelo CLI' },
    { event: 'dispatched', job_id: 'j2', handoff_from: 'j1' },
    { event: 'done', job_id: 'j2', cost_usd: 0.9, cost_usd_fonte: 'reportado pelo CLI', exit_code: 0 },
  ];
  const estado = (job) => LEDGER.filter((e) => e.job_id === job).pop();
  const ad = criarAdaptador({
    allowlist: { permite: () => ({ ok: true }) },
    publicador: { publicar: (p) => { vistos.push(p); return { publicado: true, envio: null }; } },
    broker: { decide: () => ({ estado: 'APPROVED' }), estadoCorrente: (j) => estado(j),
      listPending: () => [] },
    despachar: async () => ({ job_id: 'j3' }),
    cancelar: async () => ({ parado: true, estado: 'PARADO' }),
    lerEventos: () => LEDGER,
  });

  // 1 · pendente (o cartao com botoes) — devolvido, nao publicado
  const cartao = ad.cartaoDe({ job_id: 'j2', wave: 'w' }, LEDGER);
  vistos.push(cartao);
  // 2 · decisao · 3 · parado · 4 · fecho
  await ad.receberInteraccao({ user_id: 'U', request_id: 'j2', accao: 'aprovar' });
  await ad.receberInteraccao({ user_id: 'U', request_id: 'j2', accao: 'parar' });
  await ad.publicarFechos({ jobs: ['j2'], jaVisto: () => false });

  const comCusto = vistos.filter((p) => p && 'custo' in p);
  assert.ok(comCusto.length >= 4, 'esperava os quatro cartoes, vi ' + comCusto.length);
  for (const p of comCusto) {
    assert.ok(p.cadeia, 'o cartao `' + p.tipo + '` leva custo mas NAO leva cadeia');
    assert.equal(p.cadeia.pedidos, 2, 'cartao `' + p.tipo + '` viu uma cadeia errada');
    assert.equal(Number(p.cadeia.total.toFixed(2)), 1, 'cartao `' + p.tipo + '` somou mal');
  }
});

test('silenciado · o clique NAO chega ao broker (nao basta nao chamar `despachar`)', async () => {
  // ⚠️ Achado MEDIO do codex: o teste anterior vigiava `despachar`, que serve as
  // MENCOES — uma aprovacao gasta atraves de `broker.decide`. Uma mutacao que
  // chamasse o broker antes de devolver SILENCIADO ficava verde. Agora vigia-se o
  // broker, que e por onde o dinheiro sai de facto.
  const decisoes = [];
  const parados = [];
  const ad = criarAdaptador({
    allowlist: { permite: () => ({ ok: true }) },
    publicador: { publicar: () => ({ publicado: true, envio: null }) },
    broker: { decide: (x) => { decisoes.push(x); return { estado: 'APPROVED' }; },
      estadoCorrente: () => ({ event: 'done', job_id: 'job-mau' }), listPending: () => [] },
    despachar: async () => ({ job_id: 'novo' }),
    cancelar: async (x) => { parados.push(x); return { parado: true, estado: 'PARADO' }; },
    silenciados: new Set(['job-mau']),
    lerEventos: () => [],
  });

  const r = await ad.receberInteraccao({ user_id: 'U', request_id: 'job-mau', accao: 'aprovar' });
  assert.equal(r.estado, 'SILENCIADO');
  assert.equal(decisoes.length, 0, 'o clique num job silenciado chegou ao broker');

  // e o mesmo job, nao um qualquer: parar tem de continuar a passar
  await ad.receberInteraccao({ user_id: 'U', request_id: 'job-mau', accao: 'parar' });
  assert.equal(parados.length, 1);
  assert.equal(parados[0].job_id, 'job-mau');
});

// **Um teste exercita o código real quando o único valor que ele fabrica é a ENTRADA do sistema (o ledger, a menção, o clique, o relógio) e a assert é sobre o que SAIU pela mesma função exportada que o binário usa; se o teste fabrica um payload intermédio e o entrega directamente à camada seguinte, está a exercitar uma cópia do padrão — e prova apenas a parte que nunca esteve partida.**

function bancadaDeEventos(eventos) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-wave-egress-'));
  fs.writeFileSync(path.join(home, 'ledger.jsonl'),
    eventos.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  process.env.MOOTER_HOME = home;
  return { home };
}

function pollerDeEnsaio(ad, jobId, agora, registos, ignorados) {
  return criarPoller({
    adaptador: ad,
    transporte: { threads: new Map([[jobId, 'T1']]) },
    broker,
    meuActor: 'slack:U_PAULO',
    lerLedger: lerLedgerPorOmissao,
    agora,
    registar: (r) => registos.push(r),
    ignorados,
  });
}

test('T1 · canarios do ledger nao atravessam o adapter e o cartao continua a sair', async () => {
  const ts = '2026-08-18T12:00:00.000Z';
  const canarios = {
    wave: 'CANARY_PRIVATE_WAVE',
    model_used: 'CANARY_PRIVATE_MODEL',
    cost_usd_fonte: 'CANARY_PRIVATE_SOURCE',
    agent: 'CANARY_PRIVATE_AGENT',
  };
  bancadaDeEventos([
    { ts, job_id: 'job-egress-a', event: 'dispatched',
      actor: { type: 'human', id: 'CANARY_PRIVATE_AUTHOR', origem: 'slack' } },
    { ts, job_id: 'job-egress-a', event: 'nao_verificado',
      exit_code: 'agent-awaiting-approval', cost_usd: 0.2, ...canarios,
      actor: { type: 'human', id: 'CANARY_PRIVATE_AUTHOR', origem: 'slack' } },
    { ts, job_id: 'job-egress-b', event: 'dispatched',
      actor: { type: 'system', id: 'CANARY_PRIVATE_ACTOR', origem: null } },
    { ts, job_id: 'job-egress-b', event: 'nao_verificado',
      exit_code: 'agent-awaiting-approval', cost_usd: 0.3, ...canarios,
      actor: { type: 'system', id: 'CANARY_PRIVATE_ACTOR', origem: null },
      actor_porque: 'CANARY_PRIVATE_ACTOR_PORQUE' },
  ]);
  const { ad, capturas } = montar();
  const r = await ad.publicarPendentes();
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => x.publicado), 'degradar mostruario nao pode apagar a custodia');
  assert.equal(capturas.length, 2);
  for (const captura of capturas) {
    assert.ok(captura.payload && typeof captura.payload === 'object',
      'a porta de envio foi chamada sem o payload normalizado');
    assert.equal(captura.payload.wave, null);
    assert.equal(captura.payload.autor.valor, null);
    assert.equal(captura.payload.motor.valor, null);
    assert.equal(captura.payload.modelo.valor, null);
    assert.equal(captura.payload.custo.valor, null);
    assert.equal(captura.payload.custo.fonte, null);
  }
  assert.ok(!JSON.stringify(capturas).includes('CANARY'), 'um canario chegou a porta de envio');
  assert.match(JSON.stringify(capturas), /n\/d/);
  const degradados = new Set(r.flatMap((x) => x.degradados));
  for (const campo of ['wave', 'autor', 'motor', 'modelo', 'custo']) {
    assert.ok(degradados.has(campo), 'a degradacao de ' + campo + ' ficou silenciosa');
  }
});

test('T2 · chamador hostil e travado e a variante decorativa degrada sem canarios', () => {
  const capturas = [];
  const pub = criarPublicador({ enviar: (t, p, b) => {
    capturas.push({ t, p, b }); return { enviado: true };
  } });
  const hostil = { tipo: 'pendente', job_id: 'job-CANARY_PRIVATE',
    wave: 'CANARY_PRIVATE_WAVE', autor: { valor: 'CANARY_PRIVATE_AUTHOR' },
    motor: { valor: 'cc' }, modelo: { valor: 'claude-haiku-4-5' },
    custo: { valor: 0, fonte: 'inferência local sem custo de API' },
    hash_esperado: 'CANARY_PRIVATE_HASH', accoes: ['aprovar'] };
  assert.equal(pub.publicar(hostil).publicado, false);
  assert.equal(capturas.length, 0);

  const degradavel = { ...hostil, job_id: 'job-hostil-1', hash_esperado: 'a'.repeat(64) };
  const r = pub.publicar(degradavel);
  assert.equal(r.publicado, true);
  assert.equal(capturas.length, 1);
  assert.equal(JSON.stringify(capturas).match(/CANARY/g), null);
});

test('T3 · o heartbeat real leva Parar com a impressao corrente do broker', async () => {
  const jobId = 'job-heartbeat-parar';
  const inicio = Date.parse('2026-08-18T12:00:00.000Z');
  const ledger = [
    { ts: new Date(inicio).toISOString(), job_id: jobId, event: 'dispatched', agent: 'cc',
      actor: { type: 'human', id: 'slack:U_PAULO', origem: 'slack' } },
    { ts: new Date(inicio + 1000).toISOString(), job_id: jobId, event: 'started', agent: 'cc' },
    { ts: new Date(inicio + 2000).toISOString(), job_id: jobId, event: 'step', step_index: 1 },
  ];
  bancadaDeEventos(ledger);
  process.env.SLACK_HEARTBEAT_MS = '60000';
  const { ad, capturas } = montar();
  const registos = [];
  const poller = pollerDeEnsaio(ad, jobId, () => inicio + 70000, registos);
  await poller.tique();

  assert.equal(capturas.length, 1);
  const accoes = capturas[0].blocos.find((b) => b.type === 'actions');
  const parar = accoes && accoes.elements.find((e) => e.action_id === 'mooter_parar');
  assert.ok(parar, 'o caminho real nao produziu o botao Parar');
  const lido = cartao.lerValorDoBotao(parar.value);
  assert.equal(lido.ok, true);
  assert.equal(lido.job_id, jobId);
  assert.equal(lido.accao, 'parar');
  assert.equal(lido.hash, broker.estadoDoJob(jobId, ledger).state_hash);
});

test('T3 · o primeiro estado pos-despacho leva Parar com a impressao escrita pelo dispatcher', async () => {
  const jobId = 'job-estado-inicial';
  const { home } = bancadaDeEventos([]);
  const { ad, capturas } = montar({ despachar: async ({ actor }) => {
    fs.appendFileSync(path.join(home, 'ledger.jsonl'), JSON.stringify({
      ts: '2026-08-18T12:30:00.000Z', job_id: jobId, event: 'dispatched', actor,
    }) + '\n', 'utf8');
    return { job_id: jobId };
  } });

  const r = await ad.receberMencao({ user_id: 'U_PAULO', texto: 'continua', thread: 'T1' });
  assert.equal(r.aceite, true);
  assert.equal(capturas.length, 1);
  const accoes = capturas[0].blocos.find((b) => b.type === 'actions');
  const parar = accoes && accoes.elements.find((e) => e.action_id === 'mooter_parar');
  assert.ok(parar, 'o estado inicial nao produziu o botao Parar');
  const lido = cartao.lerValorDoBotao(parar.value);
  assert.equal(lido.ok, true);
  assert.equal(lido.job_id, jobId);
  assert.equal(lido.accao, 'parar');
  assert.equal(lido.hash, broker.estadoDoJob(jobId, lerLedgerPorOmissao()).state_hash);
});

test('T4 · heartbeat so depois do limiar, sem percentagem, com dedupe por entrega', async () => {
  const jobId = 'job-heartbeat-limiar';
  const inicio = Date.parse('2026-08-18T13:00:00.000Z');
  bancadaDeEventos([
    { ts: new Date(inicio).toISOString(), job_id: jobId, event: 'dispatched', agent: 'cc',
      actor: { type: 'human', id: 'slack:U_PAULO', origem: 'slack' } },
    { ts: new Date(inicio + 1000).toISOString(), job_id: jobId, event: 'started' },
    { ts: new Date(inicio + 2000).toISOString(), job_id: jobId, event: 'step', step_index: 1 },
    { ts: new Date(inicio + 3000).toISOString(), job_id: jobId, event: 'step', step_index: 2 },
  ]);
  process.env.SLACK_HEARTBEAT_MS = '60000';
  let agoraMs = inicio + 59000;
  const a = montar();
  const poller = pollerDeEnsaio(a.ad, jobId, () => agoraMs, []);
  await poller.tique();
  assert.equal(a.capturas.length, 0, 'bateu antes de demorar');

  agoraMs = inicio + 70000;
  await poller.tique();
  assert.equal(a.capturas.length, 1);
  const tudo = JSON.stringify(a.capturas[0]);
  assert.match(tudo, /2 passos/);
  assert.match(tudo, /1m10s/);
  assert.ok(!/%/.test(tudo), 'inventou percentagem sem denominador');
  assert.ok(!/ETA|restante|estimad/i.test(tudo), 'inventou previsao sem denominador');
  await poller.tique();
  assert.equal(a.capturas.length, 1, 'repetiu dentro do limiar');

  let tentativas = 0;
  const b = montar({ enviar: () => ({ enviado: ++tentativas > 1 }) });
  const retry = pollerDeEnsaio(b.ad, jobId, () => agoraMs, []);
  await retry.tique();
  assert.equal(retry.batidos.has(jobId), false, 'marcou um batimento recusado pelo Slack');
  await retry.tique();
  assert.equal(retry.batidos.has(jobId), true);
  await retry.tique();
  assert.equal(b.capturas.length, 2, 'nao deduplicou depois da entrega');

  const c = montar();
  const ignorado = pollerDeEnsaio(c.ad, jobId, () => agoraMs, [], new Set([jobId]));
  await ignorado.tique();
  assert.equal(c.capturas.length, 0, 'um job ignorado recebeu heartbeat');
});

test('T5 · fecho recusado pelo Slack e retentado antes de entrar em fechados', async () => {
  const { jobId } = bancadaConcluida({ jobId: 'job-fecho-retry' });
  let tentativas = 0;
  const registos = [];
  const { ad, capturas } = montar({ enviar: () => ({ enviado: ++tentativas > 1 }) });
  const poller = pollerDeEnsaio(ad, jobId, () => Date.now(), registos);
  await poller.tique();
  assert.equal(poller.fechados.has(jobId), false);
  assert.ok(registos.some((r) => r.tipo === 'fecho_nao_entregue' && r.job === jobId));
  await poller.tique();
  assert.equal(poller.fechados.has(jobId), true);
  await poller.tique();
  assert.equal(capturas.length, 2, 'um fecho entregue voltou a ser publicado');
});

test('T6 · frase inventada e recusada pelo catalogo fechado', () => {
  const capturas = [];
  const pub = criarPublicador({ enviar: (...a) => {
    capturas.push(a); return { enviado: true };
  } });
  const r = pub.publicar({ tipo: 'estado', job_id: 'job-x', texto: 'frase inventada' });
  assert.equal(r.publicado, false);
  assert.match(r.porque, /catalogo/);
  assert.equal(capturas.length, 0);
});

test('batimento · SEM filtro de dono estoira, e o silencio nao depende do chamador', async () => {
  // ⚠️ Achado MEDIO do codex, reproduzido antes de corrigido: `publicarBatimentos`
  // iterava TODOS os jobs `dispatched` do ledger e a garantia vivia so no
  // `poller.js`. Chamada sem `jaBateu`, publicou o batimento de um job de OUTRO
  // actor e de um job SILENCIADO. Um guarda que depende de quem chama e a mesma
  // familia de defeito deste pacote — e aqui o preco e publicar o trabalho de
  // outra pessoa no canal.
  const publicados = [];
  const LEDGER = [
    { ts: '2026-08-18T00:00:00Z', event: 'dispatched', job_id: 'job-de-outro' },
    { ts: '2026-08-18T00:00:00Z', event: 'dispatched', job_id: 'job-silenciado' },
  ];
  const ad = criarAdaptador({
    allowlist: { permite: () => ({ ok: true }) },
    publicador: { publicar: (p) => { publicados.push(p.job_id); return { publicado: true, envio: null }; } },
    broker: { estadoCorrente: (j) => LEDGER.find((e) => e.job_id === j),
      estadoDoJob: () => ({ state_hash: 'a'.repeat(64) }), listPending: () => [] },
    despachar: async () => ({}),
    silenciados: new Set(['job-silenciado']),
    lerEventos: () => LEDGER,
  });
  const agora = Date.parse('2026-08-18T01:00:00Z');

  await assert.rejects(() => ad.publicarBatimentos({ agora, limiarMs: 1000 }),
    /precisa de `jaBateu`/, 'publicou batimentos sem filtro de dono nenhum');
  assert.equal(publicados.length, 0);

  // COM filtro, mas um que deixa passar tudo: o silencio tem de aguentar sozinho
  await ad.publicarBatimentos({ agora, limiarMs: 1000, jaBateu: () => false });
  assert.ok(!publicados.includes('job-silenciado'),
    'o job silenciado bateu porque o chamador nao o filtrou — o silencio tem de valer aqui dentro');
  assert.ok(publicados.includes('job-de-outro'),
    'o filtro de dono e do chamador; sem ele o job passa — e por isso `jaBateu` e obrigatorio');
});
