'use strict';

/**
 * Única definição de terminalidade do bridge.
 *
 * O ledger é append-only e os seus leitores usam formas diferentes do mesmo
 * job (`event`, `state`, `last` e `status`). Um exit_code não-nulo prova que o
 * processo acabou, mesmo quando uma projecção antiga ainda diz `running`.
 */
const TERMINAL_STATES = Object.freeze([
  'done',
  'failed',
  'nao_verificado',
  'prep_timeout',
  'prep_failed_fallback',
]);
const TERMINAL_SET = new Set(TERMINAL_STATES);

function isTerminal(job) {
  if (job == null) return false;
  if (typeof job === 'string') return TERMINAL_SET.has(job);
  if (typeof job !== 'object') return false;
  if (job.exit_code != null) return true;
  return ['state', 'last', 'event', 'status'].some((field) => TERMINAL_SET.has(job[field]));
}

module.exports = { TERMINAL_STATES, isTerminal };
