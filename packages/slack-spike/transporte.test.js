'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. Testes do transporte, ZERO rede.
 *
 * `fetch` e o WebSocket entram injectados (a convencao do repo permite duplos na
 * fronteira de APIs externas, e so ali). Tudo o que se afirma aqui e sobre
 * comportamento observavel: o que sai, em que ordem, e o que NAO sai.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const t = require('./transporte.js');
const gate = require('./gate.js');

const BOT = 'U0BOT';
const PAULO = 'U_PAULO';

function comSync(conteudo) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-transp-'));
  const p = path.join(d, 'SYNC.md');
  fs.writeFileSync(p, conteudo);
  return p;
}
const SYNC_DESTRAVADO = () => comSync('# SYNC\n\n' + gate.LINHA_DESTRAVE + '\n');
const SYNC_TRANCADO = () => comSync('# SYNC\n\nkimi-egress ainda aberta.\n');

const mencao = (extra) => ({
  type: 'events_api', envelope_id: 'env-1',
  payload: { event_id: 'Ev123', event: Object.assign({
    type: 'app_mention', user: PAULO, text: '<@' + BOT + '> arruma os testes',
    channel: 'C_DEMO', ts: '1700.1',
  }, extra || {}) },
});

const clique = (valor, extra) => ({
  type: 'interactive', envelope_id: 'env-2',
  payload: Object.assign({
    type: 'block_actions', user: { id: PAULO }, message: { ts: '1700.1' },
    actions: [{ action_id: 'mooter_aprovar', action_ts: '1700.9', value: valor }],
  }, extra || {}),
});

const fetchFalso = (respostas) => {
  const chamadas = [];
  const f = async (url, init) => {
    chamadas.push({ url, corpo: JSON.parse(init.body), auth: init.headers.Authorization });
    const metodo = String(url).split('/api/')[1];
    const r = respostas[metodo] || { ok: true, ts: '1700.5' };
    return { json: async () => r };
  };
  f.chamadas = chamadas;
  return f;
};

// ── o goal ──────────────────────────────────────────────────────────────────
test('extrairGoal · tira a mencao ao bot, e o id do bot NAO fica no goal', () => {
  const g = t.extrairGoal('<@U0BOT> arruma os testes do broker', 'U0BOT');
  assert.equal(g, 'arruma os testes do broker');
  assert.ok(!g.includes('U0BOT'));
});

test('extrairGoal · desescapa as entidades que o Slack mete no texto', () => {
  assert.equal(t.extrairGoal('<@U0BOT> corre a &amp;&amp; b &lt;x&gt;', 'U0BOT'), 'corre a && b <x>');
});

// ── a traducao do envelope ──────────────────────────────────────────────────
test('classificarEnvelope · app_mention vira mencao com SO user_id e texto', () => {
  const c = t.classificarEnvelope(mencao(), BOT);
  assert.equal(c.tipo, 'mencao');
  assert.equal(c.dados.user_id, PAULO);
  assert.equal(c.dados.texto, 'arruma os testes');
});

test('classificarEnvelope · o thread_context NUNCA atravessa, mesmo quando o Slack o manda', () => {
  const c = t.classificarEnvelope(mencao({
    thread_context: ['segredo dito no canal', 'outra mensagem'],
    blocks: [{ type: 'section' }],
    files: [{ name: 'contrato.pdf' }],
  }), BOT);
  assert.equal(c.tipo, 'mencao');
  assert.deepEqual(Object.keys(c.dados).sort(), ['canal', 'texto', 'thread_ts', 'user_id']);
  assert.ok(!JSON.stringify(c.dados).includes('segredo dito no canal'));
  assert.ok(!JSON.stringify(c.dados).includes('contrato.pdf'));
});

test('classificarEnvelope · evento que nao e app_mention e ignorado MAS pede ack', () => {
  const c = t.classificarEnvelope({ type: 'events_api', envelope_id: 'e',
    payload: { event: { type: 'message', text: 'conversa normal' } } }, BOT);
  assert.equal(c.tipo, 'ignorado');
  // sem ack, o Slack re-entrega para sempre
  assert.equal(c.precisa_ack, true);
});

test('classificarEnvelope · mencao vinda de um bot nao se atende', () => {
  assert.equal(t.classificarEnvelope(mencao({ bot_id: 'B1' }), BOT).tipo, 'ignorado');
});

test('classificarEnvelope · hello e disconnect nao pedem ack', () => {
  assert.equal(t.classificarEnvelope({ type: 'hello' }).precisa_ack, false);
  const d = t.classificarEnvelope({ type: 'disconnect', reason: 'refresh_requested' });
  assert.equal(d.tipo, 'disconnect');
  assert.equal(d.razao, 'refresh_requested');
});

// ── o clique ────────────────────────────────────────────────────────────────
test('classificarEnvelope · o clique traz o hash DO CARTAO, nao um hash fresco', () => {
  const c = t.classificarEnvelope(clique(t.valorDoBotao('job-7', 'aprovar', 'hash-do-cartao')), BOT);
  assert.equal(c.tipo, 'interaccao');
  assert.equal(c.dados.expected_state_hash, 'hash-do-cartao');
  assert.equal(c.dados.request_id, 'job-7');
  assert.equal(c.dados.accao, 'aprovar');
});

test('classificarEnvelope · a idem_key e estavel por (job, accao) — 2 cliques iguais sao replay', () => {
  const v = t.valorDoBotao('job-7', 'aprovar', 'h');
  const a = t.classificarEnvelope(clique(v), BOT).dados.idem_key;
  const b = t.classificarEnvelope(clique(v), BOT).dados.idem_key;
  assert.equal(a, b);
  const r = t.classificarEnvelope(clique(t.valorDoBotao('job-7', 'recusar', 'h')), BOT).dados.idem_key;
  assert.notEqual(a, r, 'aprovar e recusar nao podem partilhar chave');
});

test('classificarEnvelope · botao sem hash e ignorado (sem CAS nao se decide)', () => {
  const c = t.classificarEnvelope(clique(JSON.stringify({ j: 'job-7', a: 'aprovar' })), BOT);
  assert.equal(c.tipo, 'ignorado');
  assert.match(c.porque, /hash/i);
});

test('classificarEnvelope · botao com lixo no valor e ignorado, nao rebenta', () => {
  assert.equal(t.classificarEnvelope(clique('nao-e-json'), BOT).tipo, 'ignorado');
  assert.equal(t.classificarEnvelope(clique(t.valorDoBotao('j', 'apagar', 'h')), BOT).tipo, 'ignorado');
});

// ── os blocos ───────────────────────────────────────────────────────────────
test('blocosDoCartao · o botao leva job_id, accao e hash — e mais nada', () => {
  const b = t.blocosDoCartao('texto do cartao', { job_id: 'job-7', hash_esperado: 'h9',
    accoes: ['aprovar', 'recusar'], custo: { valor: 1 } });
  const botoes = b.find((x) => x.type === 'actions').elements;
  assert.equal(botoes.length, 2);
  assert.deepEqual(Object.keys(JSON.parse(botoes[0].value)).sort(), ['a', 'h', 'j']);
});

test('blocosDoCartao · sem hash_esperado NAO ha botoes (um botao sem CAS decide as cegas)', () => {
  const b = t.blocosDoCartao('texto', { job_id: 'job-7', accoes: ['aprovar'] });
  assert.equal(b.find((x) => x.type === 'actions'), undefined);
});

// ── as duas guardas que custam dinheiro ─────────────────────────────────────
test('correr · o ACK sai ANTES de o handler acabar (senao o Slack re-entrega e paga-se 2x)', async () => {
  const enviadosPeloSocket = [];
  let cb;
  const socket = { aoMensagem: (f) => { cb = f; }, aoAbrir: () => {}, aoFechar: () => {},
    aoErro: () => {}, enviar: (o) => enviadosPeloSocket.push(o), fechar: () => {} };

  const tr = t.criarTransporte({ canal: 'C_DEMO', botUserId: BOT, syncPath: SYNC_DESTRAVADO(),
    dryRun: true, fetchImpl: fetchFalso({ 'apps.connections.open': { ok: true, url: 'wss://falso' } }),
    abrirSocket: () => socket });

  let libertar;
  const bloqueado = new Promise((res) => { libertar = res; });
  const r = await tr.correr({ aoMencionar: async () => { await bloqueado; return { job_id: 'job-1' }; } });
  assert.equal(r.correu, true);

  const aDecorrer = cb(JSON.stringify(mencao()));
  await new Promise((res) => setImmediate(res));
  assert.deepEqual(enviadosPeloSocket, [{ envelope_id: 'env-1' }],
    'o ack tem de estar enviado com o handler ainda a correr');
  libertar();
  await aDecorrer;
});

test('tratarEnvelope · a re-entrega do mesmo event_id NAO chama o handler outra vez', async () => {
  const tr = t.criarTransporte({ canal: 'C_DEMO', botUserId: BOT, syncPath: SYNC_DESTRAVADO(),
    dryRun: true });
  let chamadas = 0;
  const maos = { aoMencionar: async () => { chamadas += 1; return { job_id: 'job-1' }; } };
  await tr.tratarEnvelope(mencao(), maos);
  const segunda = await tr.tratarEnvelope(mencao(), maos);
  assert.equal(chamadas, 1);
  assert.equal(segunda.tipo, 'duplicado');
});

// ── o gate, outra vez, na porta de saida ────────────────────────────────────
test('enviar · envio REAL com o SYNC.md trancado nao sai e nao toca na rede', async () => {
  const f = fetchFalso({});
  const tr = t.criarTransporte({ canal: 'C_DEMO', syncPath: SYNC_TRANCADO(),
    botToken: 'xoxb-x', fetchImpl: f });   // dryRun OFF: e o caso que interessa guardar
  const r = await tr.enviar('cartao', { tipo: 'pendente', job_id: 'j' });
  assert.equal(r.enviado, false);
  assert.match(r.porque, /kimi-egress|trancado/i);
  assert.equal(f.chamadas.length, 0, 'nem uma chamada ao Slack');
  assert.equal(tr.enviados.length, 0);
});

test('enviar · em dry-run corre COM o SYNC trancado — e isso E o MODO CONSTRUCAO', async () => {
  const f = fetchFalso({});
  const tr = t.criarTransporte({ canal: 'C_DEMO', syncPath: SYNC_TRANCADO(),
    dryRun: true, fetchImpl: f });
  const r = await tr.enviar('cartao', { tipo: 'pendente', job_id: 'j' });
  assert.equal(r.enviado, true);
  assert.equal(r.dry_run, true);
  assert.equal(f.chamadas.length, 0, 'dry-run nao fala com o Slack: e por isso que pode correr trancado');
});

test('correr · trancado NAO pede sequer o URL do socket ao Slack', async () => {
  const f = fetchFalso({});
  const tr = t.criarTransporte({ canal: 'C_DEMO', syncPath: SYNC_TRANCADO(), fetchImpl: f });
  const r = await tr.correr({});
  assert.equal(r.correu, false);
  assert.equal(f.chamadas.length, 0, 'trancado nao fala com o Slack');
});

// ── o efemero ───────────────────────────────────────────────────────────────
test('tratarEnvelope · clique de terceiro NAO gera efemero (responder confirmava que o pedido existe)', async () => {
  const tr = t.criarTransporte({ canal: 'C_DEMO', syncPath: SYNC_DESTRAVADO(), dryRun: true });
  await tr.tratarEnvelope(clique(t.valorDoBotao('job-7', 'aprovar', 'h')), {
    aoInteragir: async () => ({ estado: 'IGNORADO', efemero: true, porque: 'fora da allowlist' }),
  });
  assert.equal(tr.enviados.length, 0);
});

test('tratarEnvelope · pendente ja decidido gera efemero com frase FIXA (nunca o porque do broker)', async () => {
  const tr = t.criarTransporte({ canal: 'C_DEMO', syncPath: SYNC_DESTRAVADO(), dryRun: true });
  await tr.tratarEnvelope(clique(t.valorDoBotao('job-7', 'aprovar', 'h')), {
    aoInteragir: async () => ({ estado: 'APPROVED', efemero: true,
      porque: 'ja decidido no worktree /caminho/secreto com goal "arruma X"' }),
  });
  assert.equal(tr.enviados.length, 1);
  assert.equal(tr.enviados[0].metodo, 'chat.postEphemeral');
  assert.ok(!tr.enviados[0].corpo.text.includes('secreto'));
  assert.ok(!tr.enviados[0].corpo.text.includes('arruma X'));
});

// ── o thread ────────────────────────────────────────────────────────────────
test('enviar · a resposta de um job vai para o thread da mencao que o criou', async () => {
  const tr = t.criarTransporte({ canal: 'C_DEMO', botUserId: BOT, syncPath: SYNC_DESTRAVADO(),
    dryRun: true });
  await tr.tratarEnvelope(mencao(), { aoMencionar: async () => ({ job_id: 'job-9' }) });
  await tr.enviar('estado', { tipo: 'estado', job_id: 'job-9' });
  const ultimo = tr.enviados[tr.enviados.length - 1];
  assert.equal(ultimo.corpo.thread_ts, '1700.1');
});

// ── o erro do Slack ─────────────────────────────────────────────────────────
test('chamarSlack · o erro do Slack nao devolve o corpo enviado (levava o texto consigo)', async () => {
  const f = fetchFalso({ 'chat.postMessage': { ok: false, error: 'channel_not_found' } });
  await assert.rejects(
    () => t.chamarSlack('chat.postMessage', { channel: 'C', text: 'goal secreto do Paulo' },
      { token: 'xoxb-x', fetchImpl: f }),
    (e) => {
      assert.ok(!e.message.includes('goal secreto'), 'a mensagem de erro nao leva o texto');
      assert.equal(e.slack_error, 'channel_not_found');
      return true;
    });
});

test('pedirUrlDoSocket · usa o token de APP, nao o do bot', async () => {
  const f = fetchFalso({ 'apps.connections.open': { ok: true, url: 'wss://x' } });
  const url = await t.pedirUrlDoSocket({ appToken: 'xapp-123', fetchImpl: f });
  assert.equal(url, 'wss://x');
  assert.equal(f.chamadas[0].auth, 'Bearer xapp-123');
});

test('criarTransporte · sem canal ou sem syncPath nao se monta (nao ha default seguro)', () => {
  assert.throws(() => t.criarTransporte({ syncPath: SYNC_DESTRAVADO() }), /canal/);
  assert.throws(() => t.criarTransporte({ canal: 'C' }), /syncPath/);
});

// ── reconexao ───────────────────────────────────────────────────────────────
// O `disconnect` do Slack (refresh_requested) chega de horas em horas. Estava a
// ser classificado e ignorado: o daemon ficava com cara de "a ouvir" e nao ouvia.
function socketFalso() {
  const s = { enviados: [], cbs: {} };
  for (const k of ['aoAbrir', 'aoMensagem', 'aoFechar', 'aoErro']) s[k] = (f) => { s.cbs[k] = f; };
  s.enviar = (o) => s.enviados.push(o);
  s.fechar = () => {};
  return s;
}

test('correr · o `disconnect` do Slack dispara religacao (nao se fica a olhar)', async () => {
  const sockets = [];
  const agendados = [];
  const tr = t.criarTransporte({ canal: 'C', syncPath: SYNC_DESTRAVADO(), dryRun: true,
    fetchImpl: fetchFalso({ 'apps.connections.open': { ok: true, url: 'wss://x' } }),
    abrirSocket: () => { const s = socketFalso(); sockets.push(s); return s; },
    agendar: (fn, ms) => { agendados.push({ fn, ms }); return { unref() {} }; } });

  await tr.correr({});
  assert.equal(sockets.length, 1);
  await sockets[0].cbs.aoMensagem(JSON.stringify({ type: 'disconnect', reason: 'refresh_requested' }));
  assert.equal(agendados.length, 1, 'devia ter agendado uma religacao');

  await agendados[0].fn();   // agora devolve a promise da religacao
  assert.equal(sockets.length, 2, 'abriu socket novo');
});

test('correr · o socket a fechar tambem religa, com backoff crescente', async () => {
  const sockets = []; const agendados = [];
  const tr = t.criarTransporte({ canal: 'C', syncPath: SYNC_DESTRAVADO(), dryRun: true,
    fetchImpl: fetchFalso({ 'apps.connections.open': { ok: true, url: 'wss://x' } }),
    abrirSocket: () => { const s = socketFalso(); sockets.push(s); return s; },
    agendar: (fn, ms) => { agendados.push({ fn, ms }); return { unref() {} }; } });

  await tr.correr({});
  sockets[0].cbs.aoFechar();
  await agendados[0].fn();
  sockets[1].cbs.aoFechar();
  assert.equal(agendados.length, 2);
  assert.ok(agendados[1].ms > agendados[0].ms, 'a 2a espera tem de ser maior: ' + agendados.map(a => a.ms));
});

test('correr · uma queda gera UMA religacao, nao duas (close + erro no mesmo socket)', async () => {
  const agendados = [];
  const tr = t.criarTransporte({ canal: 'C', syncPath: SYNC_DESTRAVADO(), dryRun: true,
    fetchImpl: fetchFalso({ 'apps.connections.open': { ok: true, url: 'wss://x' } }),
    abrirSocket: () => socketFalso(), agendar: (fn, ms) => { agendados.push({ fn, ms }); return { unref() {} }; } });
  const r = await tr.correr({});
  r.socket.cbs.aoErro(new Error('rede'));
  r.socket.cbs.aoFechar();
  assert.equal(agendados.length, 1, 'erro seguido de close nao pode duplicar a religacao');
});

test('correr · aoAbrir com sucesso reseta o backoff', async () => {
  const sockets = []; const agendados = [];
  const tr = t.criarTransporte({ canal: 'C', syncPath: SYNC_DESTRAVADO(), dryRun: true,
    fetchImpl: fetchFalso({ 'apps.connections.open': { ok: true, url: 'wss://x' } }),
    abrirSocket: () => { const s = socketFalso(); sockets.push(s); return s; },
    agendar: (fn, ms) => { agendados.push({ fn, ms }); return { unref() {} }; } });
  await tr.correr({});
  sockets[0].cbs.aoFechar();
  await agendados[0].fn();
  sockets[1].cbs.aoAbrir();          // ligou bem
  sockets[1].cbs.aoFechar();         // e caiu outra vez
  assert.equal(agendados[1].ms, agendados[0].ms, 'depois de uma ligacao boa, a espera volta ao inicio');
});

test('correr · com reconectar:false nao religa (para quem quer um socket so)', async () => {
  const agendados = [];
  const tr = t.criarTransporte({ canal: 'C', syncPath: SYNC_DESTRAVADO(), dryRun: true, reconectar: false,
    fetchImpl: fetchFalso({ 'apps.connections.open': { ok: true, url: 'wss://x' } }),
    abrirSocket: () => socketFalso(), agendar: (fn, ms) => { agendados.push({ fn, ms }); return { unref() {} }; } });
  const r = await tr.correr({});
  r.socket.cbs.aoFechar();
  assert.equal(agendados.length, 0);
});

// ── a corrida que o critico externo reproduziu ─────────────────────────────
// `threadCorrente` era um `let` no escopo do transporte, posto antes do handler e
// limpo no `finally`. Com DUAS mencoes concorrentes os handlers intercalam-se nos
// `await` e a segunda sobrepoe a primeira: o job da 1a ia parar ao thread da 2a.
test('corrida · duas mencoes concorrentes NAO trocam de thread', async () => {
  const tr = t.criarTransporte({ canal: 'C', botUserId: BOT, syncPath: SYNC_DESTRAVADO(),
    dryRun: true });

  const mencaoEm = (ts, ev) => ({ type: 'events_api', envelope_id: 'e-' + ev,
    payload: { event_id: 'Ev' + ev, event: { type: 'app_mention', user: PAULO,
      text: '<@' + BOT + '> faz x', channel: 'C', ts } } });

  // a 1a mencao demora; a 2a passa-lhe a frente e resolve primeiro
  let libertar;
  const presa = new Promise((res) => { libertar = res; });
  const maos = {
    aoMencionar: async (d) => {
      if (d.thread_ts === 'T1') { await presa; return { job_id: 'J1' }; }
      return { job_id: 'J2' };
    },
  };

  const a = tr.tratarEnvelope(mencaoEm('T1', 1), maos);
  const b = tr.tratarEnvelope(mencaoEm('T2', 2), maos);
  await b;             // a segunda acaba primeiro
  libertar();
  await a;

  assert.equal(tr.threads.get('J1'), 'T1', 'o job da 1a mencao foi parar ao thread da 2a');
  assert.equal(tr.threads.get('J2'), 'T2');
});

test('religar · FECHA o socket velho (senao acumulam-se e o log fica ambiguo)', async () => {
  const abertos = [];
  const socketFalso2 = () => {
    const s = { fechado: false, cbs: {} };
    for (const k of ['aoAbrir', 'aoMensagem', 'aoFechar', 'aoErro']) s[k] = (f) => { s.cbs[k] = f; };
    s.enviar = () => {}; s.fechar = () => { s.fechado = true; };
    abertos.push(s); return s;
  };
  const agendados = [];
  const tr = t.criarTransporte({ canal: 'C', syncPath: SYNC_DESTRAVADO(), dryRun: true,
    fetchImpl: fetchFalso({ 'apps.connections.open': { ok: true, url: 'wss://x' } }),
    abrirSocket: socketFalso2, agendar: (fn) => { agendados.push(fn); return { unref() {} }; } });
  await tr.correr({});
  await abertos[0].cbs.aoMensagem(JSON.stringify({ type: 'disconnect', reason: 'warning' }));
  assert.equal(abertos[0].fechado, true, 'o socket velho ficou aberto a escrever no mesmo log');
  await agendados[0]();
  assert.equal(abertos.length, 2);
  assert.equal(abertos[1].fechado, false);
});

test('religar · cada socket tem geracao no log (para se saber qual esta vivo)', async () => {
  const regs = [];
  const socketFalso3 = () => {
    const s = { cbs: {} };
    for (const k of ['aoAbrir', 'aoMensagem', 'aoFechar', 'aoErro']) s[k] = (f) => { s.cbs[k] = f; };
    s.enviar = () => {}; s.fechar = () => {};
    return s;
  };
  const tr = t.criarTransporte({ canal: 'C', syncPath: SYNC_DESTRAVADO(), dryRun: true,
    fetchImpl: fetchFalso({ 'apps.connections.open': { ok: true, url: 'wss://x' } }),
    abrirSocket: socketFalso3, agendar: () => ({ unref() {} }),
    registar: (r) => regs.push(r) });
  const r = await tr.correr({});
  r.socket.cbs.aoAbrir();
  const aberto = regs.find((x) => x.tipo === 'socket_aberto');
  assert.equal(aberto.geracao, 1, 'sem geracao, duas linhas iguais no log podem ser sockets diferentes');
});

async function filhoSobrevive(modo, esperaMs) {
  // ⚠️ Este teste vive num processo filho de proposito. A propriedade e «o processo
  // continua vivo», e essa nao se ve de dentro. Ao vivo, o daemon publicou dois
  // cartoes e fez `exit 0` um segundo depois: o timer da religacao e `unref()`'d, o
  // poller tambem, e fechado o socket nada segurava o event loop. O ultimo registo
  // dizia «a_religar tentativa 1» — parecia estar a tentar. Estava morto.
  const filho = require('node:child_process').spawn(process.execPath,
    [require('node:path').join(__dirname, 'vive.fixture.js'), modo], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((ok, falha) => {
      filho.stdout.on('data', (b) => { if (String(b).includes('caiu')) ok(); });
      filho.on('exit', (c) => falha(new Error('morreu ANTES de o socket cair (codigo ' + c + ')')));
      setTimeout(() => falha(new Error('o filho nunca chegou a cair')), 10000).unref();
    });
    await new Promise((r) => setTimeout(r, esperaMs));
    return filho.exitCode;
  } finally { filho.kill(); }
}

test('o daemon NAO morre entre o socket cair e a religacao', async () => {
  assert.equal(await filhoSobrevive('normal', 700), null,   // a religacao so vem ao 1000ms
    'o processo morreu na janela de religacao — sem ancora nada segura o event loop');
});

test('o daemon NAO morre quando a propria RELIGACAO falha (ALTO do codex)', async () => {
  // o pai espera 2500ms: passa a tentativa dos 1000ms (que estoira) e entra na
  // segunda janela. A versao anterior deste teste parava aos 700ms e nunca via isto.
  assert.equal(await filhoSobrevive('falha', 2500), null,
    'a religacao falhou e o processo morreu — a 1a falha de rede matava o daemon');
});

test('religar · uma tentativa FALHADA agenda outra (senao a 1a falha mata o daemon)', async () => {
  // ⚠️ Achado ALTO do codex. O `catch` da religacao so registava `religar_falhou`
  // e nao agendava nada: com o poller `unref()` e a ancora ja largada, o primeiro
  // `apps.connections.open` que falhasse — Slack em baixo, DNS, 429 — esvaziava a
  // fila e o processo saia com exit 0. Era o MESMO bug da ancora, um nivel abaixo:
  // tapei a queda do socket e deixei aberta a queda da religacao.
  const regs = [];
  const agendados = [];
  let chamadas = 0;
  const socketFalso = () => {
    const s = { cbs: {} };
    for (const k of ['aoAbrir', 'aoMensagem', 'aoFechar', 'aoErro']) s[k] = (f) => { s.cbs[k] = f; };
    s.enviar = () => {}; s.fechar = () => {};
    return s;
  };
  const tr = t.criarTransporte({ canal: 'C', syncPath: SYNC_DESTRAVADO(), dryRun: true,
    fetchImpl: async () => {
      chamadas += 1;
      if (chamadas === 1) return { ok: true, json: async () => ({ ok: true, url: 'wss://x' }) };
      throw new Error('apps.connections.open em baixo');
    },
    abrirSocket: socketFalso,
    agendar: (fn) => { agendados.push(fn); return { unref() {} }; },
    registar: (r) => regs.push(r) });

  const r = await tr.correr({});
  await r.socket.cbs.aoMensagem(JSON.stringify({ type: 'disconnect', reason: 'warning' }));
  assert.equal(agendados.length, 1, 'a queda devia ter agendado uma tentativa');

  await agendados[0]();                                   // e esta FALHA
  assert.ok(regs.some((x) => x.tipo === 'religar_falhou'), 'nem sequer registou a falha');
  assert.equal(agendados.length, 2,
    'a tentativa falhou e NAO agendou outra — o daemon fica morto a espera de nada');

  const t2 = regs.filter((x) => x.tipo === 'a_religar');
  assert.equal(t2[1].tentativa, 2, 'o backoff nao avancou entre tentativas falhadas');
  assert.ok(t2[1].espera_ms > t2[0].espera_ms, 'a segunda tentativa nao esperou mais');
});

test('religar · a ancora AGUENTA entre tentativas falhadas (nao se larga a entrada)', async () => {
  // ⚠️ Este teste existe porque um mutante passou verde. Largar a ancora a entrada
  // do `correr()` deixa o processo sem nada a segura-lo se a tentativa falhar a
  // seguir — mas com um `fetchImpl` falso o loop nunca esvazia, e o teste de
  // processo nao via diferenca. A ancora so se larga quando o socket ABRE.
  const agendados = [];
  let chamadas = 0;
  const socketFalso = () => {
    const s = { cbs: {} };
    for (const k of ['aoAbrir', 'aoMensagem', 'aoFechar', 'aoErro']) s[k] = (f) => { s.cbs[k] = f; };
    s.enviar = () => {}; s.fechar = () => {};
    return s;
  };
  // sem `agendar` injectado nao havia ancora nenhuma; injecta-se o RELOGIO mas
  // deixa-se o caminho real do temporizador ligado atraves de `ancoraSempre`
  const tr = t.criarTransporte({ canal: 'C', syncPath: SYNC_DESTRAVADO(), dryRun: true,
    fetchImpl: async () => {
      chamadas += 1;
      if (chamadas === 1) return { ok: true, json: async () => ({ ok: true, url: 'wss://x' }) };
      throw new Error('em baixo');
    },
    abrirSocket: socketFalso,
    agendar: (fn) => { agendados.push(fn); return { unref() {} }; },
    ancoraSempre: true });
  t.mock?.reset?.();

  const r = await tr.correr({});
  r.socket.cbs.aoAbrir();
  assert.equal(tr.ancorado(), false, 'com o socket aberto a ancora nao devia estar posta');

  await r.socket.cbs.aoMensagem(JSON.stringify({ type: 'disconnect', reason: 'w' }));
  assert.equal(tr.ancorado(), true, 'caiu o socket e nada segura o processo');

  try {
    await agendados[0]();                     // a tentativa falha
    assert.equal(tr.ancorado(), true,
      'a tentativa falhou e a ancora foi largada — o processo fica sem nada a segura-lo');
  } finally {
    tr.largarAncora();   // sem isto o intervalo ref'd pendura o proprio node --test
  }
});

test('religar · gate a fechar entre tentativas ABORTA em voz alta e larga a ancora', async () => {
  // sem isto o daemon ficava vivo por causa da ancora, sem religar nunca, e sem
  // uma linha a dizer porque. Existir sem servir para nada, em silencio.
  const regs = [];
  const agendados = [];
  const sync = SYNC_DESTRAVADO();
  const socketFalso = () => {
    const s = { cbs: {} };
    for (const k of ['aoAbrir', 'aoMensagem', 'aoFechar', 'aoErro']) s[k] = (f) => { s.cbs[k] = f; };
    s.enviar = () => {}; s.fechar = () => {};
    return s;
  };
  const tr = t.criarTransporte({ canal: 'C', syncPath: sync, dryRun: true,
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, url: 'wss://x' }) }),
    abrirSocket: socketFalso,
    agendar: (fn) => { agendados.push(fn); return { unref() {} }; },
    ancoraSempre: true, registar: (r) => regs.push(r) });

  const r = await tr.correr({});
  try {
    await r.socket.cbs.aoMensagem(JSON.stringify({ type: 'disconnect', reason: 'w' }));
    assert.equal(tr.ancorado(), true);
    require('fs').writeFileSync(sync, '# SYNC\n\nkimi-egress ainda aberta.\n');   // o gate fecha
    await agendados[0]();
    assert.ok(regs.some((x) => x.tipo === 'religacao_abortada'),
      'abortou a religacao sem dizer porque');
    assert.equal(tr.ancorado(), false,
      'ficou a segurar o processo para uma religacao que nunca vai acontecer');
  } finally { tr.largarAncora(); }
});
