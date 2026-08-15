'use strict';

/**
 * f-mu0 · PARTE A — identidade no ledger. Definição canónica ÚNICA.
 *
 * Porque é que isto é um módulo e não três linhas dentro do seamless.js: o
 * `terminal.js` já provou o padrão. Uma segunda lista de tipos de ator noutro
 * ficheiro seria uma segunda verdade, e a suite proíbe-o (ver actor.test.js A5).
 *
 * Duas regras que valem mais do que o código:
 *
 * 1. **Nunca omissão silenciosa.** Um evento NOVO sem ator é um bug. Quando o
 *    chamador não declara nada, grava-se o default EXPLÍCITO `system/system`
 *    com o seu `porque` — não se deixa o campo de fora. (kimi #6)
 * 2. **Nunca inventar uma pessoa.** Um evento ANTIGO não tem ator e não vai
 *    passar a ter: a leitura degrada para `legacy`. Escrever "paulo" num evento
 *    que não sabe quem o pediu seria fabricar proveniência — o oposto do que
 *    este ledger serve. (regra 3 da migração codex)
 *
 * A visibilidade nasce aqui pela mesma razão: um default inseguro nunca mais se
 * corrige depois. O ENFORCEMENT da posting-policy é F-MU1; o DEFAULT fail-closed
 * é hoje. (simulação 2-utilizadores 08-15, furo c)
 */

/** Quem pode ser ator. `human` decide, `agent` executa, `system` é o próprio Mooter. */
const ACTOR_TYPES = ['human', 'agent', 'system'];

/** Fail-closed: nada sai da máquina sem alguém ter dito explicitamente que pode. */
const VISIBILIDADES = ['local_only', 'shareable'];

const ACTOR_SYSTEM = Object.freeze({ type: 'system', id: 'system', origem: null });
const ACTOR_LEGACY = Object.freeze({
  type: 'system',
  id: 'legacy',
  origem: 'evento anterior à instrumentação de identidade (f-mu0)',
});

const PORQUE_DEFAULT = 'n/d — ator não declarado por quem disparou; nunca inferido';
const PORQUE_DECLARADO = 'declarado por quem disparou';

/**
 * Eventos que carregam (ou apontam para) o que o job PRODUZIU. São estes que
 * um consumidor poderia querer partilhar para fora, e portanto são estes que
 * nascem fechados. `started`/`step` não carregam resultado — etiquetá-los seria
 * ruído sem ganho de segurança.
 */
const EVENTOS_RESULTADO = ['collected', 'done', 'failed', 'nao_verificado'];

/**
 * Valida e normaliza o que o chamador declarou.
 * @returns {{ok:true, actor:object, porque:string}|{ok:false, error:string}}
 * Meio-ator é pior do que nenhum: `{id:'ana'}` sem type passaria a parecer
 * identidade sem o ser. Por isso recusa-se em vez de completar à sorte.
 */
function normalizarActor(raw) {
  if (raw == null) return { ok: true, actor: { ...ACTOR_SYSTEM }, porque: PORQUE_DEFAULT };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'actor tem de ser um objecto {type, id, origem}; recebi ' + typeof raw };
  }
  if (!ACTOR_TYPES.includes(raw.type)) {
    return {
      ok: false,
      error: 'actor.type "' + String(raw.type) + '" desconhecido; válidos: ' + ACTOR_TYPES.join(', '),
    };
  }
  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    return { ok: false, error: 'actor.id tem de ser uma string não vazia' };
  }
  return {
    ok: true,
    actor: {
      type: raw.type,
      id: raw.id.trim(),
      origem: raw.origem == null ? null : String(raw.origem),
    },
    porque: PORQUE_DECLARADO,
  };
}

/**
 * Lado da LEITURA. O que o evento diz — ou `legacy` quando não diz nada.
 * Um evento com ator ilegível também degrada para legacy, mas guarda o motivo
 * na origem: um leitor cego é o risco que a Parte A existe para fechar.
 */
function actorDoEvento(event) {
  const raw = event && event.actor;
  if (raw == null) return { ...ACTOR_LEGACY };
  const norm = normalizarActor(raw);
  if (norm.ok) return norm.actor;
  return { ...ACTOR_LEGACY, origem: 'ator ilegível no evento: ' + norm.error };
}

/** true só quando o evento traz identidade própria — não conta o degradar para legacy. */
function temActor(event) {
  return !!(event && event.actor != null);
}

function eEventoDeResultado(event) {
  if (!event) return false;
  if (EVENTOS_RESULTADO.includes(event.event)) return true;
  return Object.prototype.hasOwnProperty.call(event, 'resultado');
}

/**
 * @returns {{ok:true, visibilidade:string}|{ok:false, error:string}}
 * Valor fora do enum REBENTA. Um typo que caísse em fail-open publicava o que
 * devia ficar em casa — é a mesma classe de furo que a ronda 7 do duelo fecha.
 */
function normalizarVisibilidade(raw) {
  if (raw == null) return { ok: true, visibilidade: 'local_only' };
  if (!VISIBILIDADES.includes(raw)) {
    return {
      ok: false,
      error: 'visibilidade "' + String(raw) + '" desconhecida; válidas: ' + VISIBILIDADES.join(', '),
    };
  }
  return { ok: true, visibilidade: raw };
}

module.exports = {
  ACTOR_TYPES,
  VISIBILIDADES,
  ACTOR_SYSTEM,
  ACTOR_LEGACY,
  PORQUE_DEFAULT,
  PORQUE_DECLARADO,
  EVENTOS_RESULTADO,
  normalizarActor,
  actorDoEvento,
  temActor,
  eEventoDeResultado,
  normalizarVisibilidade,
};
