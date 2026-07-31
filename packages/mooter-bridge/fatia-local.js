'use strict';

/**
 * fatiaLocal: calcula o % de trabalho concluído que rodou localmente (agent==='moo').
 *
 * Este é o ÚNICO sítio onde "fatia local" deve ser calculada no repo.
 * Usado por board.js, recibo.js, fleet.js para garantir consistência.
 *
 * @param {Array} jobs - Array de job records (do aprender._jobRecords ou ledger)
 * @param {Object} opts - Opções
 * @param {string} opts.escopo - (obrigatório) descrição do escopo (ex: 'global — todos os cargos')
 * @param {string} [opts.cargo] - (opcional) filtro de cargo específico
 * @returns {Object} {valor, denominador, porque, jobs_local, jobs_total, escopo, cargo}
 */
function fatiaLocal(jobs, opts) {
  const o = opts || {};

  if (!o.escopo || typeof o.escopo !== 'string') {
    throw new Error('fatiaLocal: opts.escopo é obrigatório e deve ser uma string');
  }

  const lista = Array.isArray(jobs) ? jobs : [];

  // Filtro 1: concluídos
  // board.js style: status === 'done' ou 'failed', preparation falso/ausente
  // fleet.js style: state === 'done' ou 'failed'
  const concluidos = lista.filter((r) => {
    if (!r) return false;
    if ((r.status === 'done' || r.status === 'failed') && !r.preparation) return true;
    if (r.state && (r.state === 'done' || r.state === 'failed')) return true;
    return false;
  });

  // Filtro 2: por cargo, se indicado
  const filtrados = o.cargo
    ? concluidos.filter((r) => r.cargo === o.cargo)
    : concluidos;

  // Contar locais (agent === 'moo')
  const locais = filtrados.filter((r) => r.agent === 'moo').length;
  const total = filtrados.length;

  // Calcular valor
  let valor = null;
  let porque = null;

  if (total === 0) {
    valor = null;
    porque = o.cargo
      ? 'nenhum job concluído para o cargo ' + o.cargo
      : 'nenhum job concluído';
  } else {
    valor = arredondar(locais / total * 100, 2);
    porque = locais + '/' + total + ' jobs concluídos correram no moo local';
  }

  return {
    valor,
    denominador: 'jobs_concluidos_agent_moo',
    porque,
    jobs_local: locais,
    jobs_total: total,
    escopo: o.escopo,
    cargo: o.cargo || null,
  };
}

function arredondar(valor, casas) {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(casas == null ? 3 : casas));
}

module.exports = {
  fatiaLocal,
};
