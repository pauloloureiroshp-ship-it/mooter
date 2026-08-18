'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. Testes do POLLER — a peca que nao tinha nenhum.
 *
 * Antes disto, mutar qualquer uma das quatro pecas do poller deixava a suite verde:
 * o codigo vivia inline dentro do `principal()`, alcancavel so com socket, tokens e
 * gate. Os dois bugs apanhados AO VIVO (o thread perdido e o fecho na lista errada)
 * nao tinham rede nenhuma. Estes testes chamam as funcoes REAIS, importadas.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { seguirCorrente, criarPoller } = require('./poller.js');

const NOSSO = 'slack:U_PAULO';
const HASH = 'a'.repeat(64);

/** Um adaptador falso com a MESMA forma do real — mas as funcoes sao as reais. */
const { criarAdaptador } = require('./adapter.js');
const { criarPublicador } = require('./publicar.js');
const { criarAllowlist } = require('./allowlist.js');

function bancada(eventos) {
  const enviados = [];
  const publicador = criarPublicador({
    enviar: (t, p, b) => {
      enviados.push(t + '\n' + JSON.stringify(b));
      return { enviado: true };
    } });
  // ⚠️ o duplo tem de imitar o broker REAL: UMA entrada por job, a partir do
  // ULTIMO evento de estado (`estadoCorrente`) — nao uma por evento. Um duplo que
  // devolve uma linha por evento nao e o broker, e uma coisa parecida com ele, e
  // testar contra parecenças foi o erro que este ficheiro existe para nao repetir.
  const brokerFalso = {
    listPending: (f) => {
      const porJob = new Map();
      for (const e of eventos) {
        if (e.exit_code === 'agent-awaiting-approval') porJob.set(e.job_id, e);
      }
      return [...porJob.values()]
        .map((e) => ({ job_id: e.job_id, state_hash: e.state_hash || HASH,
          wave: 'slack-spike', actor: e.actor || { id: 'legacy' } }))
        .filter((p) => !f || !f.actor || p.actor.id === f.actor);
    },
    estadoCorrente: (job) => eventos.filter((e) => e.job_id === job).pop() || null,
  };
  const adaptador = criarAdaptador({ allowlist: criarAllowlist(['U_PAULO']), publicador,
    broker: brokerFalso, despachar: async () => ({ job_id: 'x' }),
    lerEventos: () => eventos });
  const threads = new Map();
  const registos = [];
  const poller = criarPoller({ adaptador, transporte: { threads }, broker: brokerFalso,
    meuActor: NOSSO, lerLedger: () => eventos, registar: (r) => registos.push(r) });
  return { poller, threads, enviados, registos, adaptador };
}

const nosso = { type: 'human', id: NOSSO, origem: 'slack' };

// ── seguirCorrente: os DOIS elos ──────────────────────────────────────────
test('seguirCorrente · o filho de uma prep que EXPIROU herda o thread (prep_from)', () => {
  const threads = new Map([['pai', 'T1']]);
  const r = seguirCorrente([{ event: 'dispatched', job_id: 'filho', prep_from: 'pai' }], threads);
  assert.deepEqual(r, [{ job: 'filho', de: 'pai' }]);
  assert.equal(threads.get('filho'), 'T1');
});

test('seguirCorrente · o filho de uma prep BEM SUCEDIDA tambem (handoff_from)', () => {
  // este era o buraco: o caminho FELIZ ligava por handoff_from e ninguem o seguia
  const threads = new Map([['pai', 'T1']]);
  seguirCorrente([{ event: 'dispatched', job_id: 'filho', handoff_from: 'pai' }], threads);
  assert.equal(threads.get('filho'), 'T1', 'o caminho feliz perdia o thread');
});

test('seguirCorrente · nao rouba o thread de um job que ja tem o seu', () => {
  const threads = new Map([['pai', 'T1'], ['filho', 'T9']]);
  seguirCorrente([{ event: 'dispatched', job_id: 'filho', prep_from: 'pai' }], threads);
  assert.equal(threads.get('filho'), 'T9');
});

test('seguirCorrente · um filho de pai desconhecido fica de fora', () => {
  const threads = new Map();
  assert.deepEqual(seguirCorrente([{ event: 'dispatched', job_id: 'f', prep_from: 'x' }], threads), []);
  assert.equal(threads.size, 0);
});

// ── o tique inteiro ───────────────────────────────────────────────────────
test('tique · publica o cartao de um pendente NOSSO', async () => {
  const { poller, enviados } = bancada([
    { job_id: 'j1', event: 'nao_verificado', exit_code: 'agent-awaiting-approval',
      actor: nosso, cost_usd: 0.5, cost_usd_fonte: 'reportado pelo CLI',
      model_used: 'claude-opus-5', state_hash: HASH },
  ]);
  await poller.tique();
  assert.equal(enviados.length, 1);
  assert.match(enviados[0], /Aprovação pendente/);
});

test('tique · NAO publica um pendente que nao e nosso', async () => {
  const { poller, enviados } = bancada([
    { job_id: 'j1', event: 'nao_verificado', exit_code: 'agent-awaiting-approval',
      actor: { type: 'system', id: 'system' }, state_hash: HASH },
  ]);
  await poller.tique();
  assert.equal(enviados.length, 0, 'o canal encheu-se de pendentes que ninguem pediu no Slack');
});

test('tique · o mesmo cartao nao se republica (dois tiques, um cartao)', async () => {
  const { poller, enviados } = bancada([
    { job_id: 'j1', event: 'nao_verificado', exit_code: 'agent-awaiting-approval',
      actor: nosso, state_hash: HASH },
  ]);
  await poller.tique();
  await poller.tique();
  assert.equal(enviados.length, 1);
});

test('tique · um job SILENCIADO nao se anuncia mas continua na fila', async () => {
  const eventos = [{ job_id: 'j1', event: 'nao_verificado',
    exit_code: 'agent-awaiting-approval', actor: nosso, state_hash: HASH }];
  const b = bancada(eventos);
  const p = criarPoller({ adaptador: b.adaptador, transporte: { threads: b.threads },
    broker: { listPending: () => [{ job_id: 'j1', state_hash: HASH, actor: { id: NOSSO } }],
      estadoCorrente: () => eventos[0] },
    meuActor: NOSSO, lerLedger: () => eventos, ignorados: new Set(['j1']) });
  await p.tique();
  assert.equal(b.enviados.length, 0);
});

// ── o fecho: a prep NAO e o trabalho ──────────────────────────────────────
test('tique · o `done` de uma PREPARACAO nunca se anuncia como trabalho concluido', async () => {
  const eventos = [
    { job_id: 'pai', event: 'dispatched', agent: 'moo', preparation: true, actor: nosso },
    { job_id: 'pai', event: 'done', agent: 'moo', exit_code: 0, cost_usd: 0,
      preparation: true, cost_usd_fonte: 'inferência local sem custo de API' },
  ];
  const { poller, threads, enviados } = bancada(eventos);
  threads.set('pai', 'T1');
  await poller.tique();
  assert.equal(enviados.length, 0,
    'foi isto que fez o dono ver «Trabalho concluído · US$ 0,00» de uma prep');
});

test('tique · o fecho e do FILHO, com o custo REAL, e o filho herda o thread', async () => {
  const eventos = [
    { job_id: 'pai', event: 'dispatched', agent: 'moo', preparation: true, actor: nosso },
    { job_id: 'pai', event: 'done', agent: 'moo', exit_code: 0, cost_usd: 0, preparation: true },
    { job_id: 'filho', event: 'dispatched', agent: 'cc', handoff_from: 'pai' },
    { job_id: 'filho', event: 'done', agent: 'cc', exit_code: 0, cost_usd: 0.1218961,
      cost_usd_fonte: 'reportado pelo CLI', model_used: 'claude-haiku-4-5-20251001' },
  ];
  const { poller, threads, enviados } = bancada(eventos);
  threads.set('pai', 'T1');
  await poller.tique();
  assert.equal(threads.get('filho'), 'T1', 'o filho tem de herdar o thread do pai');
  assert.equal(enviados.length, 1);
  assert.match(enviados[0], /Trabalho concluído/);
  assert.match(enviados[0], /US\$ 0,12/, 'o custo que o dono ve tem de ser o do TRABALHO');
});

test('tique · o fecho nao se repete a cada tique', async () => {
  const eventos = [
    { job_id: 'j', event: 'dispatched', agent: 'cc', actor: nosso },
    { job_id: 'j', event: 'done', agent: 'cc', exit_code: 0, cost_usd: 0.1,
      cost_usd_fonte: 'reportado pelo CLI' },
  ];
  const { poller, threads, enviados } = bancada(eventos);
  threads.set('j', 'T1');
  await poller.tique();
  await poller.tique();
  assert.equal(enviados.length, 1);
});

// ── a pertenca sobrevive ao re-carimbo do motor ───────────────────────────
test('tique · um pendente re-carimbado SEM actor continua a ser nosso', async () => {
  const eventos = [
    { job_id: 'j1', event: 'dispatched', actor: nosso },
    { job_id: 'j1', event: 'nao_verificado', exit_code: 'agent-awaiting-approval',
      actor: nosso, state_hash: HASH },
    // a reconciliacao do motor: mesmo estado, evento novo, SEM actor
    { job_id: 'j1', event: 'nao_verificado', exit_code: 'agent-awaiting-approval',
      state_hash: HASH },
  ];
  const { poller, enviados } = bancada(eventos);
  await poller.tique();
  assert.equal(enviados.length, 1, 'o cartao sumiu do Slack com o pedido ainda a espera');
});

// ── publicado != entregue (ALTO do codex) ─────────────────────────────────
// `publicar()` e sincrono e o envio e fire-and-forget: {publicado:true} so diz que
// o payload atravessou as barreiras. Se o Slack recusar (rate_limited), o cartao
// nunca chega — e marcava-se como visto na mesma, logo nunca era retentado.
test('tique · um cartao que o Slack RECUSOU nao se marca como visto (e retenta)', async () => {
  const eventos = [{ job_id: 'j1', event: 'nao_verificado',
    exit_code: 'agent-awaiting-approval', actor: nosso, state_hash: HASH }];
  const tentativas = [];
  const publicador = criarPublicador({
    enviar: (t, p, b) => { tentativas.push(p.job_id); return Promise.resolve({ enviado: false, porque: 'rate_limited' }); } });
  const brokerFalso = {
    listPending: () => [{ job_id: 'j1', state_hash: HASH, actor: { id: NOSSO } }],
    estadoCorrente: () => eventos[0],
  };
  const adaptador = criarAdaptador({ allowlist: criarAllowlist(['U_PAULO']), publicador,
    broker: brokerFalso, despachar: async () => ({ job_id: 'x' }), lerEventos: () => eventos });
  const registos = [];
  const poller = criarPoller({ adaptador, transporte: { threads: new Map() },
    broker: brokerFalso, meuActor: NOSSO, lerLedger: () => eventos,
    registar: (r) => registos.push(r) });

  await poller.tique();
  await poller.tique();
  assert.equal(tentativas.length, 2, 'um cartao recusado pelo Slack tem de ser retentado');
  assert.ok(registos.some((r) => r.tipo === 'cartao_nao_entregue'),
    'e o silencio tem de ficar registado');
});

test('tique · um cartao ACEITE marca-se como visto e nao se repete', async () => {
  const eventos = [{ job_id: 'j1', event: 'nao_verificado',
    exit_code: 'agent-awaiting-approval', actor: nosso, state_hash: HASH }];
  const tentativas = [];
  const publicador = criarPublicador({
    enviar: (t, p) => { tentativas.push(p.job_id); return Promise.resolve({ enviado: true }); } });
  const brokerFalso = {
    listPending: () => [{ job_id: 'j1', state_hash: HASH, actor: { id: NOSSO } }],
    estadoCorrente: () => eventos[0],
  };
  const adaptador = criarAdaptador({ allowlist: criarAllowlist(['U_PAULO']), publicador,
    broker: brokerFalso, despachar: async () => ({ job_id: 'x' }), lerEventos: () => eventos });
  const poller = criarPoller({ adaptador, transporte: { threads: new Map() },
    broker: brokerFalso, meuActor: NOSSO, lerLedger: () => eventos });
  await poller.tique();
  await poller.tique();
  assert.equal(tentativas.length, 1);
});

test('tique · duas chamadas concorrentes partilham a mesma execucao', async () => {
  let libertar;
  let chamadas = 0;
  const espera = new Promise((resolve) => { libertar = resolve; });
  const adaptador = {
    jobsNossos: () => new Set(),
    publicarFechos: async () => [],
    publicarBatimentos: async () => [],
    publicarPendentes: async () => { chamadas += 1; await espera; return []; },
  };
  const poller = criarPoller({ adaptador, transporte: { threads: new Map() },
    broker: {}, meuActor: NOSSO, lerLedger: () => [] });
  const a = poller.tique();
  const b = poller.tique();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(chamadas, 1, 'setInterval sobreposto entrou duas vezes no mesmo snapshot');
  libertar();
  await Promise.all([a, b]);
  assert.equal(chamadas, 1);
});
