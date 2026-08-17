'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack.
 *
 * DIA 0 (kimi #3) EM CODIGO. A regra do masterprompt: antes de escrever o
 * adapter, provar que custo/modelo/autor sao LEGIVEIS do ledger de hoje; campo
 * em falta => corta-se do pendente ou mostra-se "estimativa" ROTULADA — nunca
 * se toca no nucleo para o obter.
 *
 * Auditoria feita a 2026-08-17 sobre o ledger real (4757 eventos, 12 pendentes
 * com exit_code=agent-awaiting-approval):
 *
 *   cost_usd        presente 12/12 · nao-nulo  6/12  -> mostrar SO com fonte
 *   cost_usd_fonte  presente 12/12 · nao-nulo 12/12  -> o ledger ja se auto-rotula
 *   model_used      presente  6/12 · nao-nulo  6/12  -> n/d quando falta
 *   files_touched   presente  6/12 · nao-nulo  0/12  -> CORTADO
 *   actor           presente  9/12 · SEMPRE system   -> autor humano e n/d hoje
 *
 * Vocabulario REAL de `cost_usd_fonte` no ledger (contagens de 08-17):
 *   139 "n/d" · 99 "inferência local sem custo de API" ·
 *    13 "reportado pelo CLI" · 3 "calculado a partir de tokens e tabela de precos"
 *
 * Cada campo sai como {valor, rotulo, fonte, porque}. Nunca um numero nu: um
 * numero sem proveniencia num canal publico e exactamente a metrica fabricada
 * que a doutrina do repo proibe.
 */

const identidade = require('../mooter-bridge/actor.js');

/** Fontes que sao CALCULO, nao medicao — obrigam ao rotulo "estimativa". */
const FONTE_E_ESTIMATIVA = /calculad[oa]|tabela|estimativ/i;
const FONTE_AUSENTE = /^n\/d$/i;

function derivarDoPendente(evento) {
  const e = evento || {};

  // ── autor ───────────────────────────────────────────────────────────────
  // `actorDoEvento` degrada para system/legacy quando ninguem declarou. Isso
  // NAO e um autor: escrever "paulo" por baixo seria fabricar proveniencia.
  const actor = identidade.actorDoEvento(e);
  const humano = actor && actor.type === 'human' && typeof actor.id === 'string' && actor.id;
  const autor = humano
    ? { valor: actor.id, rotulo: 'autor', fonte: 'actor declarado no evento', porque: null }
    : { valor: null, rotulo: 'autor', fonte: null,
      porque: e.actor_porque || 'n/d — ator nao declarado por quem disparou; nunca inferido' };

  // O MOTOR nao e o autor. Sao dois campos porque confundi-los era o erro facil:
  // `agent:"cc"` esta em 100% dos eventos e daria um "autor" sempre preenchido
  // — e sempre errado.
  const motor = e.agent
    ? { valor: e.agent, rotulo: 'motor (nao e o autor)', fonte: 'campo agent do ledger', porque: null }
    : { valor: null, rotulo: 'motor (nao e o autor)', fonte: null, porque: 'n/d — o evento nao traz agent' };

  // ── modelo ──────────────────────────────────────────────────────────────
  const modelo = e.model_used
    ? { valor: e.model_used, rotulo: 'modelo', fonte: 'model_used', porque: null }
    : { valor: null, rotulo: 'modelo', fonte: null,
      porque: 'n/d — o pendente nao traz model_used; o tier e um patamar de custo e nao um '
        + 'modelo, e converter um no outro seria inventar' };

  // ── custo ───────────────────────────────────────────────────────────────
  const fonte = e.cost_usd_fonte == null ? null : String(e.cost_usd_fonte);
  const semFonte = !fonte || FONTE_AUSENTE.test(fonte);
  let custo;
  if (e.cost_usd == null || semFonte) {
    custo = { valor: null, rotulo: 'custo', fonte: semFonte ? null : fonte, estimativa: false,
      porque: 'n/d — ' + (e.cost_usd == null ? 'o pendente nao traz cost_usd'
        : 'a fonte do custo e n/d') + '; um numero sem proveniencia nao se publica' };
  } else {
    const estimativa = FONTE_E_ESTIMATIVA.test(fonte);
    custo = { valor: e.cost_usd, rotulo: estimativa ? 'custo (ESTIMATIVA)' : 'custo',
      fonte, estimativa, porque: null };
  }

  // ── diff-stat ───────────────────────────────────────────────────────────
  // CORTADO por decisao do Dia 0, nao por esquecimento.
  const diff_stat = { valor: null, rotulo: 'diff-stat', fonte: null,
    porque: 'CORTADO no Dia 0: files_touched aparece em 6/12 pendentes reais e nunca '
      + 'preenchido (0/12 nao-nulo). Mostrar 0 seria mentir; derivar do nucleo seria '
      + 'mexer no nucleo, que este spike tem proibido' };

  return { autor, motor, modelo, custo, diff_stat };
}

module.exports = { derivarDoPendente, FONTE_E_ESTIMATIVA };
