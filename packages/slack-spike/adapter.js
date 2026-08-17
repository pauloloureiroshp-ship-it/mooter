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
  const publicador = o.publicador;
  const broker = o.broker;
  const despachar = o.despachar;
  const lerEventos = o.lerEventos || lerLedgerPorOmissao;
  for (const [nome, v] of [['allowlist', allowlist], ['publicador', publicador],
    ['broker', broker], ['despachar', despachar]]) {
    if (!v) throw new Error('criarAdaptador precisa de `' + nome + '` — nada aqui e opcional');
  }

  /** Tudo o que foi ignorado fica REGISTADO. Ignorar em silencio nao e ignorar. */
  const registo = [];
  const agora = () => new Date().toISOString();

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

    publicador.publicar({ tipo: 'estado', job_id: jobId,
      texto: jobId ? 'despachado — sigo neste thread' : 'nao despachou' });
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
      // O hash VAI no cartao porque e o cartao que o botao carrega de volta. Sem
      // ele o clique chegaria sem `expected_state_hash` e havia duas saidas, as
      // duas mas: recusar toda a decisao, ou ler o hash fresco no clique — e ler
      // fresco fazia o clique atrasado passar por valido, matando o STALE que o
      // masterprompt manda gravar (kimi #4). Ja estava em CAMPOS_PERMITIDOS.
      hash_esperado: pendente.state_hash || null,
      accoes: ['aprovar', 'recusar'],
      texto: 'aprova ou recusa este pedido' };
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
      if (e.job_id && e.prep_from && meus.has(e.prep_from)) meus.add(e.job_id);
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
      const r = publicador.publicar(cartaoDe(pend, ledger));
      out.push({ job_id: pend.job_id, state_hash: pend.state_hash, publicado: r.publicado,
        porque: r.porque || null });
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

    // ── o botao PARAR ──────────────────────────────────────────────────────
    // Caminho proprio: nao passa pelo broker (nao e uma decisao sobre um pedido,
    // e um stop sobre um job) e NAO recusa por CAS — ver `cancelar.js`.
    if (ev.accao === 'parar') {
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
      publicador.publicar({ tipo: 'decisao', job_id: ev.request_id,
        estado: c.estado === 'JA_TERMINADO' ? 'JA_TERMINADO' : 'PARADO',
        custo: dc.custo, modelo: dc.modelo,
        autor: { valor: actorDe(ev.user_id).id },
        auditoria: ['request=' + ev.request_id, 'accao=parar', 'estado=' + c.estado,
          'actor=' + actorDe(ev.user_id).id,
          'hash_visto=' + String(ev.expected_state_hash || 'n/d').slice(0, 12) + '…'].join(' · '),
        texto: c.estado === 'JA_TERMINADO'
          ? 'o trabalho já tinha acabado — nada foi interrompido'
          : 'o trabalho foi interrompido a teu pedido' });
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
      publicador.publicar({ tipo: 'decisao', job_id: ev.request_id, estado: 'STALE',
        hash_esperado: r.expected_state_hash, hash_actual: r.actual_state_hash,
        texto: 'o estado mudou entre o cartao e o clique — o pedido CONTINUA a espera' });
      return { estado: 'STALE', porque: r.porque || 'estado mudou', efemero: false };
    }

    // decisao final -> confirmacao + auditoria (kimi #8)
    const linhaAuditoria = [
      'request=' + ev.request_id,
      'veredicto=' + veredicto,
      'estado=' + r.estado,
      'actor=' + actorDe(ev.user_id).id,
      'hash_decidido=' + String(ev.expected_state_hash || 'n/d').slice(0, 12) + '…',
      'autorizacao=' + (r.autorizacao || 'n/d'),
      r.job_novo ? 'job_novo=' + r.job_novo : 'job_novo=n/d',
    ].join(' · ');

    // ⚠️ O CARTAO DA DECISAO TEM DE LEVAR OS NUMEROS. Sem isto publicava-se
    // `{estado, auditoria}` e mais nada — e o cartao mostrava «Já gasto: n/d — sem
    // fonte no ledger» e «Impressão: n/d» num pedido onde o custo ESTAVA no ledger
    // (US$ 0,65, reportado pelo CLI). Um cartao de custodia que mostra n/d onde tem
    // o numero nao parece honesto, parece avariado — e destroi exactamente o
    // argumento que a demo existe para fazer. Deriva-se do mesmo sitio que o
    // cartao do pendente: o estado corrente do job no ledger.
    const dec = derivarDoPendente(broker.estadoCorrente(ev.request_id, lerEventos()));
    publicador.publicar({ tipo: 'decisao', job_id: ev.request_id, estado: r.estado,
      autor: dec.autor, motor: dec.motor, modelo: dec.modelo, custo: dec.custo,
      hash_esperado: ev.expected_state_hash || null,
      auditoria: linhaAuditoria,
      texto: r.estado === 'APPROVED' ? 'aprovado — re-despachado'
        : (r.estado === 'REJECTED' ? 'recusado por quem decide'
          : 'sem decisao: ' + (r.motivo || 'motivo n/d')) });

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
      const estado = ev.event === 'done' ? 'concluido' : (ev.event === 'failed' ? 'falhou' : null);
      if (!estado) continue;                                     // ainda a correr, ou encadeado
      const d = derivarDoPendente(ev);
      const r = publicador.publicar({ tipo: 'fecho', job_id: job, estado,
        custo: d.custo, modelo: d.modelo });
      out.push({ job_id: job, estado, publicado: r.publicado, porque: r.porque || null });
    }
    return out;
  }

  return { receberMencao, receberInteraccao, publicarPendentes, publicarFechos, cartaoDe,
    jobsNossos, registo };
}

module.exports = { criarAdaptador, lerLedgerPorOmissao, JA_DECIDIDO };
