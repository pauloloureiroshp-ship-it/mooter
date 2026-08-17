'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. O unico ficheiro que fala com o Slack.
 *
 * Socket Mode a mao, zero dependencias (nem `@slack/bolt` nem `ws`): o Node
 * traz `fetch` e `WebSocket` globais, e a app tem UM canal e UM utilizador.
 * Uma dependencia nova para isto seria mais superficie do que codigo.
 *
 * Contrato do Socket Mode usado aqui (docs.slack.dev, verificado 2026-08-17):
 *   POST https://slack.com/api/apps.connections.open   Bearer <xapp-…>
 *     -> { ok:true, url:"wss://…" }
 *   envelopes recebidos: hello · events_api · interactive · disconnect
 *   ack = devolver { envelope_id } pelo mesmo socket
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AS DUAS GUARDAS QUE CUSTAM DINHEIRO SE FALTAREM
 *
 * 1. **ACK ANTES DE TRATAR.** O Slack re-entrega o que nao foi confirmado. Se o
 *    ack viesse depois do handler, um despacho lento gerava uma re-entrega — e
 *    uma re-entrega de `app_mention` e um SEGUNDO job, pago. Confirma-se
 *    primeiro, trata-se depois. O preco e conhecido e aceite: se o processo
 *    morrer entre o ack e o tratamento, aquele evento perde-se. Perder um
 *    pedido e recuperavel (a pessoa repete); pagar dois nao.
 *
 * 2. **DEDUPE POR event_id.** O ack nao cobre tudo: o Slack pode entregar o
 *    mesmo evento duas vezes por razoes dele. `event_id` e estavel entre
 *    re-entregas, e um Set em memoria basta para um spike de UM utilizador.
 *
 * O CAS fica intacto: o botao carrega o `hash_esperado` que ESTAVA no cartao,
 * nao o actual. Ler o hash fresco no clique era exactamente o que o STALE existe
 * para apanhar — o clique atrasado passaria a valido e a demo perdia a cena que
 * o masterprompt manda gravar (kimi #4).
 * ─────────────────────────────────────────────────────────────────────────
 */

const gateOmissao = require('./gate.js');

const API = 'https://slack.com/api/';

/** Accoes que o cartao oferece -> action_id do bloco. */
const ACCOES = Object.freeze({ aprovar: 'mooter_aprovar', recusar: 'mooter_recusar' });

// ── nucleo puro (testavel sem rede) ─────────────────────────────────────────

/**
 * O texto que o Slack entrega vem com a mencao ao bot e com entidades HTML.
 * Tirar a mencao e obrigatorio: `<@U0BOT> arruma os testes` como goal punha o
 * id do bot dentro do prompt.
 */
function extrairGoal(texto, botUserId) {
  let t = String(texto == null ? '' : texto);
  if (botUserId) t = t.split('<@' + botUserId + '>').join(' ');
  t = t.replace(/^\s*<@[A-Z0-9]+>\s*/i, ' ');        // qualquer mencao a abrir
  t = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return t.replace(/\s+/g, ' ').trim();
}

/** Chave estavel entre re-entregas. `null` quando o envelope nao e deduplicavel. */
function chaveDeEvento(envelope) {
  const e = envelope || {};
  const p = e.payload || {};
  if (p.event_id) return 'ev:' + p.event_id;
  if (e.type === 'interactive') {
    // um clique nao traz event_id; a combinacao abaixo e unica por clique
    const u = (p.user && p.user.id) || '?';
    const a = (p.actions && p.actions[0]) || {};
    return 'int:' + u + ':' + (a.action_ts || a.action_id || '?') + ':' + (a.value || '');
  }
  return null;
}

/**
 * Traduz um envelope do Socket Mode para o que o `adapter.js` entende.
 * Note-se o que NAO viaja: `thread_context`, o texto das mensagens anteriores,
 * blocos, ficheiros. So `user_id` e `texto` — e o `texto` e o goal, que a pessoa
 * escreveu de proposito para o bot.
 */
function classificarEnvelope(envelope, botUserId) {
  const e = envelope || {};
  const envelope_id = e.envelope_id || null;
  if (e.type === 'hello') return { tipo: 'hello', envelope_id: null, precisa_ack: false };
  if (e.type === 'disconnect') {
    return { tipo: 'disconnect', envelope_id: null, precisa_ack: false, razao: e.reason || 'n/d' };
  }

  if (e.type === 'events_api') {
    const ev = (e.payload && e.payload.event) || {};
    if (ev.type !== 'app_mention') {
      return { tipo: 'ignorado', envelope_id, precisa_ack: true,
        porque: 'evento ' + (ev.type || 'sem tipo') + ' — o spike so ouve app_mention' };
    }
    if (ev.bot_id || ev.subtype) {
      return { tipo: 'ignorado', envelope_id, precisa_ack: true,
        porque: 'mencao de bot ou com subtype — nao se responde a maquinas' };
    }
    return { tipo: 'mencao', envelope_id, precisa_ack: true,
      dados: { user_id: ev.user || null, texto: extrairGoal(ev.text, botUserId),
        canal: ev.channel || null, thread_ts: ev.thread_ts || ev.ts || null } };
  }

  if (e.type === 'interactive') {
    const p = e.payload || {};
    if (p.type !== 'block_actions') {
      return { tipo: 'ignorado', envelope_id, precisa_ack: true,
        porque: 'interaccao ' + (p.type || 'sem tipo') + ' — o spike so tem botoes' };
    }
    const a = (p.actions && p.actions[0]) || {};
    const v = lerValorDoBotao(a.value);
    if (!v.ok) {
      return { tipo: 'ignorado', envelope_id, precisa_ack: true,
        porque: 'botao sem valor legivel: ' + v.porque };
    }
    return { tipo: 'interaccao', envelope_id, precisa_ack: true,
      dados: {
        user_id: (p.user && p.user.id) || null,
        request_id: v.job_id,               // no broker, request_id === job_id
        idem_key: v.job_id + ':' + v.accao, // clique repetido = replay, nao 2a decisao
        expected_state_hash: v.hash,        // o hash DO CARTAO — o CAS depende disto
        accao: v.accao,
        thread_ts: (p.message && p.message.thread_ts) || (p.message && p.message.ts) || null,
      } };
  }

  return { tipo: 'ignorado', envelope_id, precisa_ack: !!envelope_id,
    porque: 'envelope de tipo ' + (e.type || 'n/d') };
}

function valorDoBotao(jobId, accao, hash) {
  return JSON.stringify({ j: String(jobId), a: accao, h: String(hash == null ? '' : hash) });
}

function lerValorDoBotao(valor) {
  let o;
  try { o = JSON.parse(String(valor == null ? '' : valor)); } catch { return { ok: false, porque: 'nao e JSON' }; }
  if (!o || typeof o !== 'object') return { ok: false, porque: 'nao e objecto' };
  const accao = o.a === 'aprovar' ? 'aprovar' : (o.a === 'recusar' ? 'recusar' : null);
  if (!accao) return { ok: false, porque: 'accao desconhecida' };
  if (!o.j) return { ok: false, porque: 'sem job_id' };
  if (!o.h) return { ok: false, porque: 'sem hash — sem CAS nao se decide' };
  return { ok: true, job_id: String(o.j), accao, hash: String(o.h) };
}

/**
 * Blocos do Slack a partir do payload que JA atravessou o `publicar.js`.
 * Nao acrescenta campos: o texto e o que a porta deixou sair, e os botoes so
 * levam identificadores e o hash — nunca conteudo.
 */
function blocosDoCartao(texto, payload) {
  const p = payload || {};
  const blocos = [{ type: 'section', text: { type: 'mrkdwn', text: String(texto) } }];
  const accoes = [].concat(p.accoes || []);
  if (accoes.length && p.job_id && p.hash_esperado) {
    blocos.push({ type: 'actions', block_id: 'mooter_decisao', elements: accoes
      .filter((a) => ACCOES[a])
      .map((a) => ({ type: 'button', action_id: ACCOES[a],
        text: { type: 'plain_text', text: a === 'aprovar' ? 'Aprovar' : 'Recusar' },
        style: a === 'aprovar' ? 'primary' : 'danger',
        value: valorDoBotao(p.job_id, a, p.hash_esperado) })) });
  }
  return blocos;
}

// ── IO (injectavel) ─────────────────────────────────────────────────────────

async function chamarSlack(metodo, corpo, opcoes) {
  const o = opcoes || {};
  const fetchImpl = o.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('sem fetch disponivel para falar com o Slack');
  const res = await fetchImpl(API + metodo, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8',
      Authorization: 'Bearer ' + o.token },
    body: JSON.stringify(corpo || {}),
  });
  let j;
  try { j = await res.json(); } catch { j = { ok: false, error: 'resposta ilegivel' }; }
  if (!j || j.ok !== true) {
    // ⚠️ nunca se devolve o corpo enviado no erro: levava o texto consigo
    const err = new Error('slack ' + metodo + ' falhou: ' + ((j && j.error) || 'erro sem nome'));
    err.slack_error = (j && j.error) || 'n/d';
    throw err;
  }
  return j;
}

/** O URL do socket vive minutos e pede o token de APP (`xapp-`), nao o do bot. */
async function pedirUrlDoSocket(opcoes) {
  const o = opcoes || {};
  const j = await chamarSlack('apps.connections.open', {}, { token: o.appToken, fetchImpl: o.fetchImpl });
  if (!j.url) throw new Error('apps.connections.open respondeu ok mas sem url');
  return j.url;
}

/** WebSocket por omissao: o global do Node. Injectavel para os testes correrem sem rede. */
function abrirSocketPorOmissao(url) {
  const WS = globalThis.WebSocket;
  if (typeof WS !== 'function') throw new Error('sem WebSocket global — Node >= 22 ou injecta abrirSocket');
  const ws = new WS(url);
  return {
    aoAbrir: (cb) => ws.addEventListener('open', () => cb()),
    aoMensagem: (cb) => ws.addEventListener('message', (m) => cb(String(m.data))),
    aoFechar: (cb) => ws.addEventListener('close', () => cb()),
    aoErro: (cb) => ws.addEventListener('error', (e) => cb(e)),
    enviar: (obj) => ws.send(JSON.stringify(obj)),
    fechar: () => ws.close(),
  };
}

/**
 * @param {{botToken?:string, appToken?:string, canal:string, botUserId?:string,
 *          syncPath:string, gate?:object, fetchImpl?:Function, abrirSocket?:Function,
 *          dryRun?:boolean, registar?:Function}} opcoes
 */
function criarTransporte(opcoes) {
  const o = opcoes || {};
  const gate = o.gate || gateOmissao;
  const canal = o.canal;
  const dryRun = !!o.dryRun;
  const registar = o.registar || (() => {});
  if (!canal) throw new Error('criarTransporte precisa de `canal` — um spike de UM canal diz qual');
  if (!o.syncPath) throw new Error('criarTransporte precisa de `syncPath` — o gate le-o');

  const threads = new Map();      // job_id -> thread_ts
  const vistos = new Set();       // dedupe de re-entregas
  let threadCorrente = null;
  let tentativasLigacao = 0;    // persiste entre religacoes — ver religar()
  const enviados = [];            // o que saiu (ou sairia, em dry-run)

  /**
   * O gate governa a REDE. Onde a linha passa, exactamente:
   *
   *   `correr()`  -> SEMPRE trancado. Abrir o socket e falar com o Slack, e o
   *                  masterprompt guarda isso para o MODO VIVO.
   *   `enviar()`  -> trancado so quando ha envio a serio. Em `dryRun` nada sai
   *                  da maquina: e literalmente o MODO CONSTRUCAO que o
   *                  masterprompt autoriza («testes em dry-run, nenhum dispatch
   *                  real»), e tranca-lo tornava o modo de construcao inutil.
   *
   * Ou seja: nada toca a rede antes da linha no SYNC.md; tudo o que e local
   * corre hoje. Se alguem desligar o `dryRun`, o gate volta a mandar.
   */
  function trancado() {
    const g = gate.modoVivo({ syncPath: o.syncPath });
    return g.vivo ? null : g.porque;
  }
  function trancadoParaEnviar() {
    return dryRun ? null : trancado();
  }

  /** A porta do `publicar.js`: recebe o texto JA filtrado e o payload JA validado. */
  async function enviar(texto, payload) {
    const p = payload || {};
    const t = trancadoParaEnviar();
    if (t) { registar({ tipo: 'envio_trancado', porque: t }); return { enviado: false, porque: t }; }

    const thread = (p.job_id && threads.get(p.job_id)) || threadCorrente || null;
    const corpo = { channel: canal, text: String(texto), blocks: blocosDoCartao(texto, p) };
    if (thread) corpo.thread_ts = thread;

    enviados.push({ metodo: 'chat.postMessage', corpo });
    if (dryRun) return { enviado: true, dry_run: true, thread_ts: thread };
    const j = await chamarSlack('chat.postMessage', corpo, { token: o.botToken, fetchImpl: o.fetchImpl });
    if (p.job_id && j.ts && !threads.has(p.job_id)) threads.set(p.job_id, j.ts);
    return { enviado: true, dry_run: false, ts: j.ts || null, thread_ts: thread };
  }

  /**
   * Efemero: SO frases fixas escritas aqui. Nunca o `porque` do broker nem o
   * `porque_local` do despacho — esses citam estado interno, e um efemero e uma
   * mensagem enviada, com as mesmas regras de tudo o que sai.
   */
  async function enviarEfemero(userId, texto) {
    const t = trancadoParaEnviar();
    if (t) return { enviado: false, porque: t };
    const corpo = { channel: canal, user: userId, text: String(texto) };
    if (threadCorrente) corpo.thread_ts = threadCorrente;
    enviados.push({ metodo: 'chat.postEphemeral', corpo });
    if (dryRun) return { enviado: true, dry_run: true };
    await chamarSlack('chat.postEphemeral', corpo, { token: o.botToken, fetchImpl: o.fetchImpl });
    return { enviado: true, dry_run: false };
  }

  function lembrarThread(jobId, ts) { if (jobId && ts) threads.set(jobId, ts); }

  /**
   * Trata UM envelope. Devolve o que fez, para os testes e para o registo.
   * O ack e responsabilidade de quem chama (`correr`), e vem ANTES desta funcao.
   */
  async function tratarEnvelope(envelope, maos) {
    const h = maos || {};
    const c = classificarEnvelope(envelope, o.botUserId);
    if (c.tipo === 'hello' || c.tipo === 'disconnect') return { tipo: c.tipo, razao: c.razao };
    if (c.tipo === 'ignorado') { registar({ tipo: 'envelope_ignorado', porque: c.porque }); return { tipo: 'ignorado', porque: c.porque }; }

    const chave = chaveDeEvento(envelope);
    if (chave && vistos.has(chave)) {
      registar({ tipo: 'reentrega_ignorada', chave });
      return { tipo: 'duplicado', porque: 're-entrega do mesmo evento — nao se paga duas vezes' };
    }
    if (chave) vistos.add(chave);

    threadCorrente = (c.dados && c.dados.thread_ts) || null;
    try {
      if (c.tipo === 'mencao') {
        const r = h.aoMencionar ? await h.aoMencionar(c.dados) : null;
        if (r && r.job_id) lembrarThread(r.job_id, threadCorrente);
        return { tipo: 'mencao', resultado: r };
      }
      const r = h.aoInteragir ? await h.aoInteragir(c.dados) : null;
      // efemero SO para quem esta na allowlist: responder a um estranho
      // confirmava-lhe que o pedido existe (a regra do adapter, aqui cumprida)
      if (r && r.efemero && r.estado !== 'IGNORADO') {
        await enviarEfemero(c.dados.user_id, 'já decidido — nada a fazer');
      }
      return { tipo: 'interaccao', resultado: r };
    } finally {
      threadCorrente = null;
    }
  }

  /**
   * O loop. `abrirSocket` e injectavel: nos testes nao ha rede.
   *
   * ⚠️ RECONEXAO. O Slack manda `disconnect` (reason: refresh_requested) de horas
   * em horas e fecha o socket — e a propria doc diz que qualquer cliente tem de
   * lidar com isso. Ate aqui o `disconnect` era CLASSIFICADO e ignorado: o daemon
   * ficava com cara de "a ouvir" e nao ouvia mais nada, exactamente como aconteceu
   * hoje por outra razao. Uma demo que morre sozinha ao fim da tarde nao e uma
   * demo, e uma armadilha para o dia em que houver um estranho a ver.
   */
  async function correr(maos) {
    const t = trancado();
    if (t) return { correu: false, porque: 'MODO VIVO trancado: ' + t };
    const abrir = o.abrirSocket || abrirSocketPorOmissao;
    const agendar = o.agendar || ((fn, ms) => { const h = setTimeout(fn, ms); h.unref?.(); return h; });
    const reconectar = o.reconectar !== false;
    let vivo = true;   // por-socket: evita que close E erro contem como duas quedas

    /**
     * Uma reconexao por queda, com backoff e teto.
     *
     * O contador vive FORA desta funcao (em `criarTransporte`) de proposito: cada
     * religacao entra por um `correr()` novo, e um contador local reiniciava a zero
     * a cada tentativa — o "backoff" ficava preso em 1s para sempre e um Slack em
     * baixo levava um pedido por segundo, indefinidamente. Era um backoff a fingir.
     *
     * O callback agendado DEVOLVE a promise (sem chaves): sem isso quem agenda nao
     * consegue esperar pela religacao, e foi assim que os testes mentiram primeiro.
     */
    function religar(porque) {
      if (!reconectar || !vivo) return;
      vivo = false;                                  // este socket ja nao conta
      tentativasLigacao += 1;
      const espera = Math.min(30000, 1000 * Math.pow(2, tentativasLigacao - 1));
      registar({ tipo: 'a_religar', porque, tentativa: tentativasLigacao, espera_ms: espera });
      agendar(() => correr(maos).catch((e) => registar({ tipo: 'religar_falhou',
        porque: (e && e.message) || 'erro' })), espera);
    }

    const url = await pedirUrlDoSocket({ appToken: o.appToken, fetchImpl: o.fetchImpl });
    const s = abrir(url);

    // ⚠️ Sem isto o socket falhava em SILENCIO. `apps.connections.open` devolver um
    // URL nao prova que a ligacao se fez — e se o WebSocket nunca abrisse, ou
    // fechasse a seguir, o daemon ficava com cara de "a ouvir" sem ouvir nada.
    // Custou uma tentativa real do dono: escreveu no canal e nao houve UMA linha
    // de log a dizer o que faltava. Um daemon que nao sabe dizer se esta ligado
    // nao esta a ser observado, esta a ser assumido.
    if (typeof s.aoAbrir === 'function') {
      s.aoAbrir(() => { tentativasLigacao = 0; registar({ tipo: 'socket_aberto' }); });
    }
    if (typeof s.aoFechar === 'function') {
      s.aoFechar(() => { registar({ tipo: 'socket_fechado' }); religar('socket fechado'); });
    }
    if (typeof s.aoErro === 'function') {
      s.aoErro((e) => {
        registar({ tipo: 'socket_erro', porque: (e && (e.message || e.type)) || 'erro sem mensagem' });
        religar('socket em erro');
      });
    }

    s.aoMensagem(async (bruto) => {
      let env;
      try { env = JSON.parse(bruto); } catch { registar({ tipo: 'envelope_ilegivel' }); return; }
      // ── ACK PRIMEIRO (ver cabecalho) ──
      const c = classificarEnvelope(env, o.botUserId);
      // TODO envelope que chega fica registado, tipo incluido: e a unica forma de
      // distinguir "o Slack nao me manda nada" de "manda e eu descarto"
      registar({ tipo: 'envelope', slack_type: env && env.type, classificado: c.tipo,
        porque: c.porque || undefined });
      if (c.precisa_ack && c.envelope_id) {
        try { s.enviar({ envelope_id: c.envelope_id }); } catch (e) { registar({ tipo: 'ack_falhou', porque: (e && e.message) || 'erro' }); }
      }
      // o Slack avisa ANTES de fechar: religa-se aqui, nao a espera do close
      if (c.tipo === 'disconnect') religar('disconnect do Slack: ' + (c.razao || 'n/d'));
      try { await tratarEnvelope(env, maos); } catch (e) {
        registar({ tipo: 'handler_falhou', porque: (e && e.message) || 'erro' });
      }
    });
    return { correu: true, socket: s, url_obtido: true };
  }

  return { enviar, enviarEfemero, correr, tratarEnvelope, lembrarThread, enviados, threads, vistos };
}

module.exports = {
  ACCOES, API,
  extrairGoal, chaveDeEvento, classificarEnvelope, valorDoBotao, lerValorDoBotao, blocosDoCartao,
  chamarSlack, pedirUrlDoSocket, abrirSocketPorOmissao, criarTransporte,
};
