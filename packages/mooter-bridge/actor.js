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

/** true só quando o ator do evento é LEGÍVEL. Presente mas malformado não conta. */
function temActorValido(event) {
  return temActor(event) && normalizarActor(event.actor).ok;
}

/**
 * O `porque` do lado da LEITURA — canónico, uma vez só.
 *
 * G4 #2 MÉDIO: as seis projecções guardavam isto à mão com `actor == null`, e
 * todas falhavam no mesmo sítio — um ator PRESENTE mas malformado não é null,
 * por isso a guarda deixava passar o porque enquanto `actorDoEvento` degradava o
 * ator para `legacy`. Ficava "declarado por quem disparou" ao lado de um ator
 * que ninguém declarou. O porque só existe ao lado de um ator que se consegue ler.
 */
function porqueDoEvento(event) {
  if (!temActorValido(event)) return null;
  return (event && event.actor_porque) || null;
}

/**
 * O relógio de um evento, ou null quando não há relógio utilizável.
 * `Date.parse` devolve NaN para lixo; tratar NaN como 0 punha um evento com
 * `ts:"not-a-date"` ANTES de qualquer ISO válido — e um timestamp inválido
 * passava a poder roubar o job. (G4 #3 ALTO)
 */
function tsDoEvento(event) {
  const t = Date.parse((event && event.ts) || '');
  return Number.isFinite(t) ? t : null;
}

/**
 * A REGRA DE PROPRIEDADE, num sítio só.
 *
 * Isto existe porque a mesma regra estava escrita em quatro sítios — o mapa em
 * memória, a releitura do ledger, o fold do fleet e o fold do aprender — e cada
 * ronda do gauntlet encontrava mais um que discordava dos outros. Quatro cópias
 * de uma invariante não são uma invariante: são quatro oportunidades de mentir
 * sobre quem pediu o quê. Quem quiser saber o dono de um job chama isto.
 *
 * Decide se o `candidato` deve substituir o dono `actual`. Pela ordem:
 *   1. um ator DECLARADO promove um default/legacy — informação a chegar não é
 *      informação a mudar; e nunca se despromove.
 *   2. entre dois iguais em estatuto, ganha o mais ANTIGO: o job pertence a
 *      quem o pediu, não ao último a falar.
 *   3. um evento sem relógio utilizável nunca rouba a um que o tenha.
 *   4. empate real => fica quem já lá estava. É isto que torna o resultado
 *      independente da ordem por que os eventos são lidos.
 *
 * @param {{actor:object, porque:string, ts:number|null}|null} actual
 * @param {{actor:object, porque:string, ts:number|null}} candidato
 */
function substituiDono(actual, candidato) {
  if (!candidato || candidato.actor == null) return false;
  if (!actual || actual.actor == null) return true;

  const actualDeclarado = actual.porque === PORQUE_DECLARADO;
  const candidatoDeclarado = candidato.porque === PORQUE_DECLARADO;
  if (candidatoDeclarado !== actualDeclarado) return candidatoDeclarado;

  if (actual.ts == null && candidato.ts != null) return true;
  if (candidato.ts == null) return false;
  return candidato.ts < actual.ts;
}

/** Açúcar: monta o registo de dono a partir de um evento cru do ledger. */
function donoDoEvento(event) {
  return { actor: event && event.actor, porque: porqueDoEvento(event), ts: tsDoEvento(event) };
}

/**
 * Dois atores são o mesmo quando type+id batem. A `origem` NÃO entra: o mesmo
 * humano pode entrar pelo CC num evento e por outro caminho no seguinte, e isso
 * não é uma pessoa diferente. Comparar a origem transformaria mudança de porta
 * em reatribuição de identidade.
 */
function mesmoActor(a, b) {
  if (!a || !b) return false;
  return a.type === b.type && a.id === b.id;
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
  temActorValido,
  porqueDoEvento,
  tsDoEvento,
  substituiDono,
  donoDoEvento,
  mesmoActor,
  eEventoDeResultado,
  normalizarVisibilidade,
};
