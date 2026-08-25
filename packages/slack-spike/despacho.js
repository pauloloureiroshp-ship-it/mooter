'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. A porta de despacho REAL.
 *
 * O `adapter.js` recebe `despachar` injectado: em MODO CONSTRUCAO e um duplo
 * (zero dispatch real), e aqui esta a versao de MODO VIVO — `toolWork` do
 * `seamless.js`, importado como qualquer consumidor. Zero alteracoes ao nucleo.
 *
 * Tres razoes para este ficheiro existir em vez de passar `toolWork` a seco:
 *
 * 1. **O gate outra vez.** O `daemon.js` ja verifica o SYNC.md ao arrancar, mas
 *    um daemon vive horas: entre o arranque e o despacho alguem pode reabrir a
 *    frente kimi-egress. Verifica-se por despacho, nao por processo. Custa um
 *    `readFileSync` de um ficheiro pequeno e fecha a janela.
 *
 * 2. **Allowlist de SAIDA.** O `publicar.js` tem a allowlist do que SAI para o
 *    Slack; esta e a simetrica — o que entra no motor. So passam `goal`,
 *    `agent`, `wave` e `actor`. Se um dia alguem juntar `thread_context` ao
 *    objecto da mencao (a tentacao obvia: «da mais contexto ao modelo»), morre
 *    aqui em vez de chegar a um prompt. A regra do masterprompt — o contexto do
 *    thread NUNCA entra no prompt — passa a ser uma barreira, nao um comentario.
 *
 * 3. **O erro do motor nao e publicavel.** As mensagens de erro do `toolWork`
 *    citam o goal (ha uma que devolve o texto que recusou). Por isso o erro sai
 *    daqui em `porque_local` — um nome que NAO esta em CAMPOS_PERMITIDOS do
 *    `publicar.js`. Se alguem tentar publicar isto, a porta recusa por
 *    construcao, nao por lembranca.
 */

const gateOmissao = require('./gate.js');

/** O que o motor recebe. Nada fora desta lista atravessa. */
const CAMPOS_PARA_O_MOTOR = Object.freeze(['goal', 'agent', 'wave', 'actor']);

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CONDICAO DURA DO GO CONDICIONADO (Cowork, 2026-08-17)
 *
 * O ALTO de CODIGO que ficou aberto na frente kimi-egress — a recusa por
 * `agent:"kimi"` deixa um plano no disco que o recibo nao declara — vive
 * EXCLUSIVAMENTE no caminho kimi/Moonshot. Com o vendor guardado fora da rota,
 * o ALTO nao e alcancavel pelo caminho vivo, e a demo pode correr.
 *
 * ALLOWLIST, nao denylist. A diferenca importa: com uma denylist, um vendor novo
 * entrava por omissao e ninguem dava por isso. Aqui um motor desconhecido e
 * recusado sem alguem ter de se lembrar de o proibir.
 *
 * E o motor tem de vir DECLARADO. Aceitar `agent` ausente era herdar o default
 * do `seamless.js` — hoje `moo`/`cc`, mas um default e um sitio onde um vendor
 * pode aparecer amanha sem passar por aqui.
 *
 * O kimi volta quando a kimi-egress mergear em main, por decisao explicita,
 * nunca por default. Isto e uma condicao do GO, nao uma sugestao: ha um teste
 * que prova a recusa, e a suite fica vermelha se alguem tirar esta barreira.
 *
 * ── 2026-08-25 · a exclusao dura vira ACEITACAO CONDICIONADA (decisao A6a) ──
 *
 * O dono decidiu por escrito que o kimi volta a rota. A frase acima ja dizia
 * como: «por decisao explicita, nunca por default» — e uma decisao escrita e
 * exactamente isso. O que mudou foi a FORMA da barreira, nao a existencia dela:
 * o kimi sai de `MOTORES_EXCLUIDOS` (uma porta soldada) e entra em
 * `MOTORES_PERMITIDOS` atras de uma condicao MECANICA (uma porta com chave).
 *
 * A condicao NAO e a linha de destrave do spike, e a razao esta medida:
 *
 *   - «kimi-egress FECHADA — slack-spike destravado» esta no SYNC.md desde
 *     2026-08-17 e destrava o MODO VIVO do spike. Nao afirma que o ALTO foi
 *     corrigido — o commit que a repos no sitio (`94a0d3e8`) escreve o
 *     contrario: «a condicao dura (exclusao do kimi por construcao) ainda esta
 *     em vigor».
 *   - Procurado em `main` a 2026-08-25: o veto de egress no caminho
 *     kimi/Moonshot NAO existe. O ALTO continua aberto.
 *
 * Reaproveitar essa linha teria chamado condicional a uma aceitacao
 * incondicional — a condicao ja estava cumprida antes de ser escolhida como
 * condicao. Por isso o kimi tem linha PROPRIA (`gate.LINHA_KIMI`), que hoje
 * nao existe em ficheiro nenhum. Consequencia honesta: nesta data o kimi
 * continua a ser recusado. O que mudou e o MOTIVO — deixou de ser «excluido
 * por construcao, sem prazo» e passou a ser «uma linha no SYNC.md de
 * distancia, escrita por quem fechar a frente».
 * ─────────────────────────────────────────────────────────────────────────
 */
const MOTORES_PERMITIDOS = Object.freeze(['cc', 'codex', 'gemini', 'kimi', 'moo']);

/**
 * Motor -> porque esta fora, INCONDICIONALMENTE. Estar aqui e uma decisao
 * datada, nao um esquecimento. Vazio desde 2026-08-25: o kimi era o unico
 * habitante e passou a condicionado (ver `MOTORES_CONDICIONADOS`). Fica de pe
 * porque a mecanica de exclusao dura tem de continuar a existir para o proximo
 * vendor que precise dela — e os testes dela continuam a correr.
 */
const MOTORES_EXCLUIDOS = Object.freeze({});

/**
 * Motor -> a condicao que o readmite. `verificar(gate, syncPath)` devolve
 * `{ok, porque}`; `false` recusa com o `porque`. Fail-closed: uma condicao que
 * rebenta e uma condicao nao cumprida, nunca uma porta aberta.
 */
const MOTORES_CONDICIONADOS = Object.freeze({
  kimi: {
    verificar: (gate, syncPath) => gate.kimiReadmitido({ syncPath }),
    contexto: 'o ALTO da kimi-egress (a recusa por agent:"kimi" deixa um plano no disco que o '
      + 'recibo nao declara) vive no caminho kimi/Moonshot e continua sem veto em main',
  },
});

/**
 * @param {string} agent
 * @param {{gate?:object, syncPath?:string}} [ctx] necessario so para motores
 *        CONDICIONADOS; sem ele um condicionado e recusado (fail-closed).
 * @returns {{ok:boolean, motor?:string, porque?:string, condicao?:string}}
 */
function validarMotor(agent, ctx) {
  const motor = String(agent == null ? '' : agent).trim().toLowerCase();
  if (!motor) {
    return { ok: false, porque: 'despacho sem motor declarado — o `agent` tem de vir explicito '
      + '(um default e um sitio onde um vendor pode aparecer sem passar por esta porta)' };
  }
  if (Object.prototype.hasOwnProperty.call(MOTORES_EXCLUIDOS, motor)) {
    return { ok: false, porque: 'motor "' + motor + '" EXCLUIDO POR CONSTRUCAO: '
      + MOTORES_EXCLUIDOS[motor] };
  }
  if (!MOTORES_PERMITIDOS.includes(motor)) {
    return { ok: false, porque: 'motor "' + motor + '" fora da allowlist de motores do spike ('
      + MOTORES_PERMITIDOS.join(', ') + ') — um motor desconhecido nao entra por omissao' };
  }
  const cond = MOTORES_CONDICIONADOS[motor];
  if (cond) {
    const c = ctx || {};
    let r;
    // Uma condicao que rebenta e uma condicao NAO cumprida. O `catch` existe
    // para isso e nao para esconder nada: o motivo vai no `porque`.
    try {
      r = c.gate && c.syncPath ? cond.verificar(c.gate, c.syncPath)
        : { ok: false, porque: 'sem gate/syncPath nao ha como verificar a condicao' };
    } catch (e) {
      r = { ok: false, porque: 'a condicao rebentou (' + ((e && e.message) || 'erro') + ')' };
    }
    if (!r || r.ok !== true) {
      return { ok: false, condicao: r && r.linha ? r.linha : null,
        porque: 'motor "' + motor + '" CONDICIONADO e a condicao nao esta cumprida: '
          + ((r && r.porque) || 'sem motivo') + '. Contexto: ' + cond.contexto };
    }
    return { ok: true, motor, condicao: r.linha || null };
  }
  return { ok: true, motor };
}

/**
 * @param {{toolWork:Function, syncPath:string, gate?:object}} opcoes
 * @returns {{despachar:Function, CAMPOS_PARA_O_MOTOR:string[]}}
 */
function criarDespachador(opcoes) {
  const o = opcoes || {};
  const toolWork = o.toolWork;
  const syncPath = o.syncPath;
  const gate = o.gate || gateOmissao;
  /**
   * ⚠️ ONDE O AGENTE ESCREVE. Sem isto, o `toolWork` resolve
   * `worktree = (ctx && ctx.folder) || REPO` — herda uma pasta AMBIENTE, e no
   * primeiro despacho real do Slack essa pasta caiu fora da raiz permitida:
   * «worktree fora da raiz permitida (…\.claude\worktrees)». A guarda do motor
   * estava certa; o que faltava era o spike DIZER onde quer trabalhar.
   *
   * Vem por configuracao e NAO pela allowlist de saida: o `worktree` e injectado
   * aqui, nao aceito do chamador. Assim a allowlist continua a ser 4 campos —
   * se alguem tentar passar `worktree` no pedido, e recusado como forasteiro. A
   * pasta onde um agente escreve nao e coisa que deva poder vir de uma mencao.
   */
  const worktree = o.worktree || null;
  /** `false` mata a preparacao local (os 20s). Ver a nota em `correr.js`. */
  const preDigest = o.preDigest !== false;
  if (typeof toolWork !== 'function') {
    throw new Error('criarDespachador precisa de `toolWork` — a porta do motor nao se adivinha');
  }
  if (!syncPath) {
    throw new Error('criarDespachador precisa de `syncPath` — sem SYNC.md nao ha gate, e sem gate '
      + 'nao ha despacho real');
  }

  async function despachar(pedido) {
    const p = pedido || {};

    // 1 · o gate, por despacho e nao por processo
    const g = gate.modoVivo({ syncPath });
    if (!g.vivo) {
      return { job_id: null,
        porque_local: 'despacho real recusado — MODO VIVO trancado: ' + g.porque };
    }

    // 2 · allowlist de saida
    const forasteiros = Object.keys(p).filter((k) => !CAMPOS_PARA_O_MOTOR.includes(k));
    if (forasteiros.length) {
      return { job_id: null,
        porque_local: 'campo(s) fora da allowlist de despacho: ' + forasteiros.join(', ')
          + ' — para o motor so vao goal, agent, wave e actor' };
    }
    if (!String(p.goal || '').trim()) {
      return { job_id: null, porque_local: 'despacho sem goal' };
    }

    // 3 · a allowlist de MOTORES — a condicao dura do GO CONDICIONADO.
    //     Antes de chamar o motor: um `agent:"kimi"` morre AQUI, na porta, e nao
    //     no ponto de estrangulamento do nucleo (que e onde esta o ALTO aberto).
    const m = validarMotor(p.agent, { gate, syncPath });
    if (!m.ok) {
      return { job_id: null, porque_local: m.porque };
    }

    // 4 · o motor. O `worktree` entra AQUI, de configuracao — nunca do pedido.
    const args = { goal: p.goal, agent: m.motor, wave: p.wave, actor: p.actor };
    if (worktree) args.worktree = worktree;
    if (!preDigest) args.pre_digest = false;
    let r;
    try {
      r = await toolWork(args);
    } catch (e) {
      return { job_id: null,
        porque_local: 'toolWork lancou: ' + ((e && e.message) || 'erro sem mensagem') };
    }
    if (!r || typeof r !== 'object') {
      return { job_id: null, porque_local: 'toolWork devolveu ' + typeof r + ' — sem job_id' };
    }
    if (r.error) {
      // ⚠️ o texto do erro pode citar o goal. Fica em porque_local de proposito.
      return { job_id: null, porque_local: 'o motor recusou: ' + String(r.error) };
    }
    if (!r.job_id) {
      return { job_id: null, porque_local: 'toolWork nao devolveu job_id' };
    }
    return { job_id: r.job_id };
  }

  return { despachar, CAMPOS_PARA_O_MOTOR, MOTORES_PERMITIDOS };
}

module.exports = { criarDespachador, CAMPOS_PARA_O_MOTOR, MOTORES_PERMITIDOS,
  MOTORES_EXCLUIDOS, MOTORES_CONDICIONADOS, validarMotor };
