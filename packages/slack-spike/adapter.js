'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. O adapter inteiro.
 *
 * Regra de ouro deste ficheiro: NAO altera nada do nucleo. Importa
 * `broker.js` e `actor.js` como qualquer consumidor, e recebe a porta de
 * despacho INJECTADA — em MODO CONSTRUCAO e um duplo (zero dispatch real), em
 * MODO VIVO liga-se ao `toolWork` do seamless.js.
 *
 * O loop, incluindo o infeliz:
 *   1. mencao -> allowlist -> despacho com actor do Slack
 *   2. pendente -> cartao com campos DERIVADOS (nunca conteudo)
 *   3. clique  -> A MESMA allowlist (kimi #1) -> broker.decide
 *   4. decisao -> confirmacao + entrada de auditoria do ledger (kimi #8)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { derivarDoPendente } = require('./leitura.js');
const { cadeiaDe } = require('./cadeia.js');
const { FRASES } = require('./esquema.js');
// a regra do CAS vive numa constante NOMEADA, e e ela que governa — nao um literal
// inline. Uma constante congelada e exportada que nada le mente sobre onde a regra vive.
const { ACCOES_COM_CAS_ESTRITO } = require('./cartao.js');

/** Leitor de ledger por omissao: SO LE. Nunca escreve — quem escreve e o broker. */
function lerLedgerPorOmissao() {
  const home = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  try {
    return fs.readFileSync(path.join(home, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

/** Motivos do broker que significam "este pedido ja tem dono": resposta efemera. */
const JA_DECIDIDO = ['ja_decidido', 'replay_exacto'];

function criarAdaptador(opcoes) {
  const o = opcoes || {};
  const allowlist = o.allowlist;
  // mesma fonte que o poller usa para nao anunciar (ver `silenciadosDoAmbiente`)
  const silenciados = o.silenciados instanceof Set ? o.silenciados : new Set();
  const publicador = o.publicador;
  const broker = o.broker;
  const despachar = o.despachar;
  const lerEventos = o.lerEventos || lerLedgerPorOmissao;

  /**
   * A cadeia vai em TODOS os cartoes que levam custo — pendente, decisao, parado e
   * fecho. Um cartao que mostra o total da conversa e outro, na mesma thread, que
   * so mostra o do pedido, e pior que nenhum: o dono fica com dois numeros e
   * nenhuma regra para saber qual e qual.
   */
  const cadeiaDoJob = (job, ledger) => {
    const c = cadeiaDe(ledger || lerEventos(), job);
    // A aritmetica tambem devolve jobs/semFonte para diagnostico local. A porta
    // publica recebe apenas o subesquema de quatro campos que o cartao consome.
    return { pedidos: c.pedidos, total: c.total, fontes: c.fontes,
      todosMedidos: c.todosMedidos };
  };
  for (const [nome, v] of [['allowlist', allowlist], ['publicador', publicador],
    ['broker', broker], ['despachar', despachar]]) {
    if (!v) throw new Error('criarAdaptador precisa de `' + nome + '` — nada aqui e opcional');
  }

  /** Tudo o que foi ignorado fica REGISTADO. Ignorar em silencio nao e ignorar. */
  const registo = [];
  const agora = () => new Date().toISOString();
  function publicar(payload) {
    const r = publicador.publicar(payload);
    if (!r.publicado && r.porque) {
      const recusado = { tipo: 'publicacao_RECUSADA', job: payload.job_id || null,
        porque: r.porque, ts: agora() };
      registo.push(recusado);
      if (typeof o.registar === 'function') o.registar(recusado);
    }
    if (r.degradados && r.degradados.length) {
      const d = { tipo: 'payload_degradado', job: payload.job_id || null,
        degradados: [...r.degradados], ts: agora() };
      registo.push(d);
      if (typeof o.registar === 'function') o.registar(d);
    }
    return r;
  }

  function actorDe(userId) {
    return { type: 'human', id: 'slack:' + userId, origem: 'slack' };
  }

  // ── 1 · a mencao ────────────────────────────────────────────────────────
  async function receberMencao(m) {
    const ev = m || {};
    const p = allowlist.permite(ev.user_id);
    if (!p.ok) {
      registo.push({ tipo: 'mencao_de_fora', user_id: ev.user_id, ts: agora(), porque: p.porque });
      return { aceite: false, porque: p.porque };
    }
    const goal = String(ev.texto == null ? '' : ev.texto).trim();
    if (!goal) return { aceite: false, porque: 'mencao sem goal' };

    // ⚠️ O CONTEXTO DO THREAD NAO ENTRA AQUI. `ev.thread_context` existe no
    // objecto que o Slack entrega e e deliberadamente ignorado: arrastar as
    // mensagens anteriores para dentro do prompt seria mandar para um modelo
    // tudo o que se disse no canal, incluindo o que ninguem escreveu para o bot.
    const r = await despachar({ goal, agent: 'cc', wave: 'slack-spike', actor: actorDe(ev.user_id) });
    const jobId = r && r.job_id ? r.job_id : null;

    // ⚠️ O `porque_local` MORRIA AQUI. O primeiro despacho real falhou e o thread
    // disse «nao despachou» — verdade, e inutil: a razao (a guarda do worktree)
    // existia dentro do `r` e nunca chegava a lado nenhum. O canal continua a NAO
    // a ver (cita o goal, por isso o `publicar.js` recusa-a por construcao), mas
    // quem opera o daemon TEM de a ler. Uma recusa sem razao legivel obriga a
    // adivinhar, e adivinhar em cima de dinheiro real e o que se quer evitar.
    if (!jobId) {
      registo.push({ tipo: 'despacho_recusado', ts: agora(),
        porque_local: (r && r.porque_local) || 'sem razao declarada' });
      if (typeof o.registar === 'function') {
        o.registar({ tipo: 'despacho_recusado',
          porque_local: (r && r.porque_local) || 'sem razao declarada' });
      }
    }

    const estado = jobId ? broker.estadoDoJob(jobId, lerEventos()) : null;
    const inicial = { tipo: 'estado',
      texto: jobId ? FRASES.DESPACHADO : FRASES.NAO_DESPACHOU };
    if (jobId) {
      inicial.job_id = jobId;
      inicial.hash_esperado = (estado && estado.state_hash) || null;
    }
    publicar(inicial);
    return { aceite: true, job_id: jobId };
  }

  // ── 2 · o cartao do pendente ────────────────────────────────────────────
  function cartaoDe(pendente, ledger) {
    // o ultimo evento de ESTADO do job — nao o ultimo evento (um `step` a seguir
    // ao pendente nao pode roubar-lhe os campos)
    const evento = broker.estadoCorrente(pendente.job_id, ledger);
    const d = derivarDoPendente(evento);
    return { tipo: 'pendente', job_id: pendente.job_id, wave: pendente.wave || null,
      autor: d.autor, motor: d.motor, modelo: d.modelo, custo: d.custo, diff_stat: d.diff_stat,
      cadeia: cadeiaDoJob(pendente.job_id, ledger),
      // O hash VAI no cartao porque e o cartao que o botao carrega de volta. Sem
      // ele o clique chegaria sem `expected_state_hash` e havia duas saidas, as
      // duas mas: recusar toda a decisao, ou ler o hash fresco no clique — e ler
      // fresco fazia o clique atrasado passar por valido, matando o STALE que o
      // masterprompt manda gravar (kimi #4). Ja estava em CAMPOS_PERMITIDOS.
      hash_esperado: pendente.state_hash || null,
      accoes: ['aprovar', 'recusar'],
      texto: FRASES.PENDENTE };
  }

  /**
   * @param {{filtro?:object, jaVisto?:Function}} [opcoes]
   *   `filtro`  passa direito ao `broker.listPending` — em MODO VIVO leva
   *             `{actor:'slack:U…'}`, porque o canal so deve mostrar os pedidos
   *             que NASCERAM no Slack. Sem isso, o primeiro tique do poller
   *             despejava no canal os pendentes historicos do ledger (12, no dia
   *             em que isto se escreveu) — uma demo a abrir com 12 cartoes de
   *             trabalho que ninguem no Slack pediu.
   *   `jaVisto` evita republicar o MESMO cartao a cada tique. A chave e
   *             (job_id, state_hash) e nao so o job: se o estado mudar, o hash
   *             muda, e o cartao antigo passou a ter um botao que ja da STALE —
   *             ai um cartao novo e a coisa certa a publicar.
   */
  /**
   * ⚠️ UM PENDENTE NOSSO NAO PODE DESAPARECER PORQUE O MOTOR SE ESQUECEU DE QUEM PEDIU.
   *
   * Visto ao vivo em 2026-08-17 21:14:50: a reconciliacao do motor
   * (`appendTerminalReconciliation` <- `sweepOrphans`, disparada por um dispatch
   * qualquer) RE-CARIMBA o estado de um job antigo com um evento novo — e esse
   * evento vai SEM `actor`. O `estadoCorrente` passa a devolver o carimbo novo, o
   * actor degrada para `legacy`, e um `listPending({actor:'slack:U…'})` deixa de o
   * ver. O pedido continua a espera no motor e some do Slack. Ninguem dava por isso.
   *
   * Por isso a pertenca deriva do LEDGER INTEIRO e nao do estado corrente: um job e
   * nosso se ALGUM dos seus eventos alguma vez declarou o nosso actor. Isso e
   * imune a re-carimbos e sobrevive a religares do daemon (ao contrario de um mapa
   * em memoria).
   */
  function jobsNossos(ledger, actorId) {
    const meus = new Set();
    for (const e of ledger) {
      if (e.job_id && e.actor && e.actor.id === actorId) meus.add(e.job_id);
    }
    // e os encadeados: o job que ACABA e filho da preparacao
    for (const e of ledger) {
      const pai = e.prep_from || e.handoff_from;
      if (e.job_id && pai && meus.has(pai)) meus.add(e.job_id);
    }
    return meus;
  }

  async function publicarPendentes(opcoes) {
    const oo = opcoes || {};
    const jaVisto = typeof oo.jaVisto === 'function' ? oo.jaVisto : () => false;
    const ledger = lerEventos();
    // `pertence` (derivado do ledger) SUBSTITUI o filtro por actor quando existe:
    // o filtro do broker olha para o estado corrente, que a reconciliacao apaga.
    const pertence = typeof oo.pertence === 'function' ? oo.pertence : null;
    const out = [];
    for (const pend of broker.listPending(pertence ? null : oo.filtro)) {
      if (pertence && !pertence(pend.job_id)) continue;
      if (jaVisto(pend)) {
        out.push({ job_id: pend.job_id, state_hash: pend.state_hash, publicado: false,
          porque: 'cartao ja publicado para este estado' });
        continue;
      }
      const r = publicar(cartaoDe(pend, ledger));
      // ⚠️ o `envio` TEM de viajar. Construir aqui um objecto novo e esquecer um
      // campo foi, pela terceira vez hoje, a forma de um valor morrer numa
      // fronteira de camada — e este diz se o Slack ACEITOU. Sem ele, um cartao
      // recusado por rate_limit era marcado como visto e nunca mais tentado.
      out.push({ job_id: pend.job_id, state_hash: pend.state_hash, publicado: r.publicado,
        envio: r.envio, porque: r.porque || null, degradados: r.degradados || [] });
    }
    return out;
  }

  // ── 3 · o clique ────────────────────────────────────────────────────────
  async function receberInteraccao(i) {
    const ev = i || {};
    // kimi #1 (ALTO): a MESMA allowlist do caminho da mencao. Um clique de
    // terceiro nem chega ao broker — e nao se responde no canal, porque
    // responder confirmaria a um estranho que o pedido existe.
    const p = allowlist.permite(ev.user_id);
    if (!p.ok) {
      registo.push({ tipo: 'clique_de_fora', user_id: ev.user_id, request_id: ev.request_id,
        accao: ev.accao, ts: agora(), porque: p.porque });
      return { estado: 'IGNORADO', porque: p.porque, efemero: true };
    }

    // ⚠️ SILENCIADO NAO PODE GASTAR MAIS — mas TEM de poder ser travado.
    // O silencio vivia so no poller (publicacao). O caminho do clique nunca o via,
    // e um cartao ja publicado ficava no canal com o [Aprovar] quente: um clique
    // re-despachava. Visto no #mooter-demo — o cartao do ciclo mau, opus, com
    // US$ 0,66 ja gastos, a um clique de gastar outra vez.
    // So o `aprovar` e bloqueado: `recusar` e `parar` sao as accoes que MANDAM
    // PARAR, e bloquea-las prendia o dono dentro do proprio cartao.
    if (ev.accao === 'aprovar' && silenciados.has(ev.request_id)) {
      registo.push({ tipo: 'aprovar_de_job_silenciado', job: ev.request_id, ts: agora() });
      if (typeof o.registar === 'function') {
        o.registar({ tipo: 'aprovar_de_job_silenciado', job: ev.request_id });
      }
      return { estado: 'SILENCIADO', efemero: true,
        porque: 'este pedido foi silenciado — Aprovar nao gasta mais nada. Recusar e Parar continuam a funcionar.' };
    }

    // ── o botao PARAR ──────────────────────────────────────────────────────
    // Caminho proprio: nao passa pelo broker (nao e uma decisao sobre um pedido,
    // e um stop sobre um job) e NAO recusa por CAS — ver `cancelar.js`.
    if (!ACCOES_COM_CAS_ESTRITO.includes(ev.accao)) {
      if (typeof o.cancelar !== 'function') {
        registo.push({ tipo: 'parar_sem_porta', job: ev.request_id, ts: agora() });
        return { estado: 'SEM_STOP', porque: 'nao ha porta de cancelamento ligada', efemero: true };
      }
      const c = await o.cancelar({ job_id: ev.request_id, actor: actorDe(ev.user_id),
        hash_visto: ev.expected_state_hash || null });
      if (!c.parado) {
        registo.push({ tipo: 'stop_recusado', job: ev.request_id, ts: agora(),
          porque_local: c.porque_local || 'sem razao declarada' });
        if (typeof o.registar === 'function') {
          o.registar({ tipo: 'stop_recusado', job: ev.request_id,
            porque_local: c.porque_local || 'sem razao declarada' });
        }
        return { estado: c.estado, porque: c.porque_local || null, efemero: true };
      }
      // o custo ATE AO STOP e a informacao mais util deste cartao («parei-o aos
      // US$ 0,40»). Deriva-se do ledger, como no cartao da decisao — a variante
      // nova nao pode repetir o bug de mostrar n/d com o numero gravado.
      const dc = derivarDoPendente(broker.estadoCorrente(ev.request_id, lerEventos()));
      publicar({ tipo: 'decisao', job_id: ev.request_id,
        estado: c.estado === 'JA_TERMINADO' ? 'JA_TERMINADO' : 'PARADO',
        custo: dc.custo, modelo: dc.modelo, cadeia: cadeiaDoJob(ev.request_id),
        autor: { valor: actorDe(ev.user_id).id },
        auditoria: { request: ev.request_id, accao: 'parar', estado: c.estado,
          actor: actorDe(ev.user_id).id, hash: ev.expected_state_hash || null },
        texto: c.estado === 'JA_TERMINADO'
          ? FRASES.JA_TERMINADO : FRASES.PARADO });
      return { estado: c.estado, efemero: false };
    }

    const veredicto = ev.accao === 'aprovar' ? 'aprovar' : 'recusar';
    const r = await broker.decide({
      actor: actorDe(ev.user_id),
      request_id: ev.request_id,
      idem_key: ev.idem_key,
      expected_state_hash: ev.expected_state_hash,
      decision_id: ev.decision_id || ('slack-' + ev.idem_key),
      veredicto,
    });

    // pendente ja decidido -> efemero, nao se publica no canal
    if (JA_DECIDIDO.includes(r.motivo)) {
      return { estado: r.estado, porque: 'ja decidido — nada a fazer', efemero: true };
    }

    // clique atrasado -> o CAS a trabalhar, com os DOIS hashes a vista
    if (r.estado === 'STALE') {
      publicar({ tipo: 'decisao', job_id: ev.request_id, estado: 'STALE',
        hash_esperado: r.expected_state_hash, hash_actual: r.actual_state_hash,
        texto: FRASES.STALE });
      return { estado: 'STALE', porque: r.porque || 'estado mudou', efemero: false };
    }

    // decisao final -> confirmacao + auditoria (kimi #8)
    // ⚠️ O CARTAO DA DECISAO TEM DE LEVAR OS NUMEROS. Sem isto publicava-se
    // `{estado, auditoria}` e mais nada — e o cartao mostrava «Já gasto: n/d — sem
    // fonte no ledger» e «Impressão: n/d» num pedido onde o custo ESTAVA no ledger
    // (US$ 0,65, reportado pelo CLI). Um cartao de custodia que mostra n/d onde tem
    // o numero nao parece honesto, parece avariado — e destroi exactamente o
    // argumento que a demo existe para fazer. Deriva-se do mesmo sitio que o
    // cartao do pendente: o estado corrente do job no ledger.
    const dec = derivarDoPendente(broker.estadoCorrente(ev.request_id, lerEventos()));
    const frasesPorMotivo = Object.freeze({
      aprovado: FRASES.APROVADO,
      recusa_humana: FRASES.RECUSADO,
      despacho_recusado: FRASES.RECUSADO,
    });
    publicar({ tipo: 'decisao', job_id: ev.request_id, estado: r.estado,
      autor: dec.autor, motor: dec.motor, modelo: dec.modelo, custo: dec.custo,
      cadeia: cadeiaDoJob(ev.request_id),
      hash_esperado: ev.expected_state_hash || null,
      auditoria: { request: ev.request_id, veredicto, estado: r.estado,
        actor: actorDe(ev.user_id).id, hash: ev.expected_state_hash || null,
        autorizacao: r.autorizacao || null, job_novo: r.job_novo || null },
      texto: frasesPorMotivo[r.motivo] || FRASES.SEM_DECISAO });

    return { estado: r.estado, motivo: r.motivo, porque: r.porque || null, efemero: false };
  }

  /**
   * ⚠️ O FIM TEM DE SE DIZER. Um job que acaba SEM pedir decisao nao produzia
   * mensagem nenhuma: o thread ficava no «Recebido, volto quando precisar de uma
   * decisao» para sempre, enquanto o trabalho corria, gastava e terminava bem.
   * Foi exactamente isso que nos cegou ao vivo — «status no thread» so conta se o
   * thread contar o FIM.
   *
   * So se reportam jobs ANUNCIADOS (os que este adapter despachou), e so estados
   * REALMENTE terminais. Um `prep_timeout` nao se reporta: o motor encadeia um job
   * novo a seguir, e anunciar «falhou» ali seria mentir sobre trabalho que continua.
   *
   * @param {{jobs:string[], jaVisto?:Function}} opcoes
   */
  async function publicarFechos(opcoes) {
    const oo = opcoes || {};
    const jaVisto = typeof oo.jaVisto === 'function' ? oo.jaVisto : () => false;
    const ledger = lerEventos();
    const out = [];
    for (const job of [].concat(oo.jobs || [])) {
      if (jaVisto(job)) continue;
      const ev = broker.estadoCorrente(job, ledger);
      if (!ev) continue;
      if (ev.exit_code === 'agent-awaiting-approval') continue;   // esse tem cartao
      // ⚠️ UMA PREPARACAO NAO E O TRABALHO. O job com `preparation:true` termina
      // com `done exit=0 custo=0` e entrega o trabalho a um FILHO pago. Anunciar
      // esse `done` como «Trabalho concluido · US$ 0,00» foi exactamente o que
      // aconteceu ao vivo: o dono viu «de graca» e o trabalho real custou US$ 0,12
      // num filho que nunca apareceu no Slack. O fecho e do FILHO, nunca do pai.
      if (ev.preparation === true) continue;
      const estado = ev.event === 'done' ? 'concluido' : (ev.event === 'failed' ? 'falhou' : null);
      if (!estado) continue;                                     // ainda a correr, ou encadeado
      const d = derivarDoPendente(ev);
      const r = publicar({ tipo: 'fecho', job_id: job, estado,
        custo: d.custo, modelo: d.modelo, cadeia: cadeiaDoJob(job, ledger) });
      out.push({ job_id: job, estado, publicado: r.publicado, envio: r.envio,
        porque: r.porque || null, degradados: r.degradados || [] });
    }
    return out;
  }

  /**
   * ⚠️ O FILTRO DE DONO É OBRIGATÓRIO, e o silêncio é verificado AQUI.
   *
   * Achado MÉDIO do codex: esta função itera TODOS os jobs `dispatched` do ledger.
   * A garantia de dono e de silêncio vivia só no chamador (`poller.js`), e provou-se
   * explorável: chamada sem `jaBateu`, publicou o batimento de um job de OUTRO actor
   * e de um job silenciado. Hoje há um só chamador e ele passa o filtro certo — mas
   * um guarda que depende de quem chama é a mesma família de defeito que este pacote
   * passou dois dias a fechar, e aqui o preço é publicar o trabalho de outra pessoa
   * no canal.
   *
   * Agora: sem `jaBateu` ESTOIRA (como o `poller.js` estoira sem esta função), e o
   * silêncio é verificado dentro, com a lista que o adapter já tem.
   */
  async function publicarBatimentos(opcoes) {
    const oo = opcoes || {};
    if (typeof oo.jaBateu !== 'function') {
      throw new Error('publicarBatimentos precisa de `jaBateu` — um batimento sem '
        + 'filtro de dono publica o trabalho de outra pessoa no canal');
    }
    const agoraMs = Number(oo.agora);
    const limiarMs = Number(oo.limiarMs);
    const jaBateu = oo.jaBateu;
    if (!Number.isFinite(agoraMs) || !Number.isFinite(limiarMs) || limiarMs < 0) return [];

    const ledger = lerEventos();
    const jobs = [...new Set(ledger.filter((e) => e && e.event === 'dispatched' && e.job_id)
      .map((e) => e.job_id))];
    const out = [];
    for (const job of jobs) {
      if (silenciados.has(job)) continue;   // defesa em profundidade: nao depende do chamador
      if (jaBateu(job)) continue;
      const corrente = broker.estadoCorrente(job, ledger);
      if (!corrente || !['dispatched', 'started'].includes(corrente.event)) continue;
      const primeiro = ledger.find((e) => e && e.job_id === job && e.event === 'dispatched');
      const nascido = Date.parse((primeiro && primeiro.ts) || '');
      if (!Number.isFinite(nascido)) continue;
      if (agoraMs - nascido < limiarMs) continue;
      const estado = broker.estadoDoJob(job, ledger);
      if (!estado || !estado.state_hash) continue;
      const passos = ledger.filter((e) => e && e.job_id === job && e.event === 'step').length;
      const r = publicar({ tipo: 'estado', job_id: job, passos,
        segundos: Math.floor((agoraMs - nascido) / 1000), hash_esperado: estado.state_hash });
      out.push({ job_id: job, publicado: r.publicado, envio: r.envio,
        porque: r.porque || null });
    }
    return out;
  }

  return { receberMencao, receberInteraccao, publicarPendentes, publicarFechos, publicarBatimentos, cartaoDe,
    jobsNossos, registo };
}

module.exports = { criarAdaptador, lerLedgerPorOmissao, JA_DECIDIDO };
