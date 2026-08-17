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
 * @param {{toolWork:Function, syncPath:string, gate?:object}} opcoes
 * @returns {{despachar:Function, CAMPOS_PARA_O_MOTOR:string[]}}
 */
function criarDespachador(opcoes) {
  const o = opcoes || {};
  const toolWork = o.toolWork;
  const syncPath = o.syncPath;
  const gate = o.gate || gateOmissao;
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

    // 3 · o motor
    let r;
    try {
      r = await toolWork({ goal: p.goal, agent: p.agent, wave: p.wave, actor: p.actor });
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

  return { despachar, CAMPOS_PARA_O_MOTOR };
}

module.exports = { criarDespachador, CAMPOS_PARA_O_MOTOR };
