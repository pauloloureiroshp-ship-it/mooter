/**
 * budget-cap.js — o tecto de tier em função do orçamento, e a leitura do
 * esquema da cache que o `inject_context.js` estava a fazer errada.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ISTO CORRIGE (medido 2026-09-05)
 *
 * `applyBudgetCap` fazia:
 *
 *     const fiveHour = budget.five_hour || budget.fiveHour || 0;
 *     if (fiveHour < 50) maxTier = 'T3'; else if (fiveHour < 70) …
 *
 * Desde 2026-05-07 a cache escreve `five_hour` como **objecto**:
 * `{ utilization: <número>, resets_at: <ISO> }`. O `statusline.sh:98-120` já
 * sabe disso — lê `.utilization`, tem fallback camelCase, fallback para o
 * número plano legado, e até uma guarda explícita para `[object Object]`.
 * Esta função nunca recebeu o mesmo tratamento.
 *
 * Comparar um objecto com um número devolve `false` nas três comparações:
 *
 *     ({utilization:3}) < 50   →  false
 *     ({utilization:3}) < 70   →  false
 *     ({utilization:3}) < 85   →  false
 *     ⇒ maxTier = 'T0'
 *
 * Ou seja: **com 3% do orçamento gasto, o tecto caía para T0** — o router
 * recusava tudo acima do modelo local, e nada no hint dizia porquê. A isenção
 * de Claude Max não salvava ninguém cujo `subscription-profile.json` diga
 * `"unknown"`, que é o que esta máquina diz.
 *
 * Estava DORMENTE porque a cache tinha um estado de erro (`OAuth expired`) e
 * `getBudget` devolvia `null`. Acordava na primeira renovação bem sucedida.
 *
 * Encontrado por uma auditoria adversarial ao aparato do R-24: o tecto de
 * orçamento é um confundidor da experiência, porque muda a meio da série e o
 * contrabalanço AB/BA não protege contra uma transição monótona.
 */

'use strict';

const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];

/**
 * A percentagem de utilização, seja qual for o esquema em que venha.
 *
 * Devolve `null` — e não zero — quando não há número nenhum a ler. Zero é uma
 * leitura legítima («não gastaste nada») e confundi-la com «não sei» é como
 * este defeito nasceu: um valor por omissão a fingir-se de medição.
 */
function normalizarUtilizacao(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'object' && Number.isFinite(v.utilization)) return v.utilization;
  return null;
}

/** A utilização de 5 h da cache, com os mesmos fallbacks que o statusline. */
function utilizacaoDe(budget) {
  if (!budget || typeof budget !== 'object') return null;
  const n = normalizarUtilizacao(budget.five_hour);
  if (n !== null) return n;
  return normalizarUtilizacao(budget.fiveHour);
}

/**
 * O tecto de tier. `perfil` é o valor de `profiles.anthropic` do
 * `subscription-profile.json` — injectado, para esta função ser pura.
 */
function applyBudgetCap(tier, budget, perfil) {
  if (!budget) return tier;
  if (perfil === 'max') return tier;

  const util = utilizacaoDe(budget);
  // Sem número legível não há tecto. Inventar zero aqui daria «T3 sempre»;
  // inventar 100 daria «T0 sempre». Ambos seriam uma decisão escondida atrás
  // de um valor por omissão — que é exactamente o defeito de origem.
  if (util === null) return tier;

  let maxTier;
  if (perfil === 'api-free') {
    if (util < 30) maxTier = 'T3';
    else if (util < 50) maxTier = 'T1';
    else maxTier = 'T0';
  } else if (util < 50) maxTier = 'T3';
  else if (util < 70) maxTier = 'T2';
  else if (util < 85) maxTier = 'T1';
  else maxTier = 'T0';

  const actual = TIER_ORDER.indexOf(tier);
  const max = TIER_ORDER.indexOf(maxTier);
  return actual > max ? maxTier : tier;
}

module.exports = { applyBudgetCap, normalizarUtilizacao, utilizacaoDe, TIER_ORDER };
