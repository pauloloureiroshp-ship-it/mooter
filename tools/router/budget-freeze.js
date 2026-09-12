'use strict';
/**
 * budget-freeze.js — UMA definição do congelamento do orçamento.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * D15 (medido 2026-09-10)
 *
 * `.budget-cache.json` entra no `estado_vivo_sha` de qualquer A/B nesta
 * máquina: alimenta o `applyBudgetCap`, muda o tecto de tier, muda o sujeito da
 * experiência. Matou a corrida 3 do R-24 a meio, porque o dono continuou a usar
 * o Claude Code enquanto ela corria.
 *
 * O cache tem DOIS escritores, e a primeira correcção só tapou um:
 *
 *   1. `refresh-budget.js` — assíncrono, lançado destacado quando o cache passa
 *      as 2 h.
 *   2. `inject_context.js :: fetchBudgetSyncLegacy()` — SÍNCRONO, tomado quando
 *      o cache passa as 4 h **e** o prompt é HIGH_RISK, e também sempre que
 *      `MOOTER_V07_DISABLE=1`.
 *
 * Congelar só o primeiro **tornava o segundo inevitável**: sem refresh o cache
 * nunca rejuvenesce, passa as 4 h, e a partir daí cada prompt de deploy, push
 * ou migração reescreve-o. Fechava-se a porta das 2 h e abria-se a das 4 h.
 * Apanhado por revisão adversarial, não por leitura.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PORQUE É UM FICHEIRO, E NÃO `process.env`
 *
 * O `refresh-budget.js` é lançado **destacado** pelo hook na sessão do dono:
 * não herda o ambiente de quem corre a experiência noutra shell. O disco é a
 * única coisa que os dois lados vêem.
 *
 * PORQUE NÃO TEM TTL
 *
 * Um TTL expira a meio da corrida e descongela sozinho — reintroduzia o D15
 * precisamente na experiência mais longa, que é o caso que motivou isto.
 * Trocava um defeito ruidoso por um silencioso. O risco de um sentinela
 * esquecido é real (o cache fica eternamente stale, e o caminho síncrono de
 * 3 s passa a ser tomado em todos os prompts de alto risco), mas a falha aí é
 * **silêncio**, não duração: trata-se tornando-o visível, não expirando-o.
 * Por isso o sentinela carrega motivo e hora, e quem o lê imprime a idade.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NOME = '.budget-freeze';

/** O sentinela vive ao lado do cache que protege. */
function caminhoDoSentinela(home) {
  return path.join(home || os.homedir(), '.claude', 'tools', 'router', NOME);
}

/**
 * Congelado ou não. **Presença basta** — o conteúdo é para humanos.
 * Fazer depender do conteúdo daria a alguém a hipótese de desligar a guarda
 * escrevendo uma nota no ficheiro, em silêncio.
 */
function congelado(deps = {}) {
  const fsImpl = deps.fsImpl || fs;
  try { return fsImpl.existsSync(caminhoDoSentinela(deps.home)); } catch { return false; }
}

/** O que lá estiver escrito, para quem congelou poder dizer porquê. */
function motivo(deps = {}) {
  const fsImpl = deps.fsImpl || fs;
  try {
    return String(fsImpl.readFileSync(caminhoDoSentinela(deps.home), 'utf8')).trim();
  } catch { return ''; }
}

/** Há quanto tempo está posto, em horas, ou `null` se não der para saber. */
function idadeEmHoras(deps = {}) {
  const fsImpl = deps.fsImpl || fs;
  const agora = deps.agora || Date.now();
  try {
    const st = fsImpl.statSync(caminhoDoSentinela(deps.home));
    // Nunca negativa. O `mtimeMs` pode vir microssegundos à frente do
    // `Date.now()` num ficheiro acabado de escrever, e `(-2.3e-7).toFixed(1)`
    // dá `-0.0` — que fazia a linha de aviso oscilar entre corridas.
    return Math.max(0, (agora - st.mtimeMs) / 3_600_000);
  } catch { return null; }
}

/** Uma linha para stderr, com idade e motivo — a visibilidade que substitui o TTL. */
function linhaDeAviso(deps = {}) {
  const h = idadeEmHoras(deps);
  const m = motivo(deps);
  const idade = h === null ? 'idade desconhecida' : `posto ha ${h.toFixed(1)}h`;
  return `orcamento CONGELADO por ${NOME} (${idade})${m ? ` — ${m}` : ''}`;
}

module.exports = { congelado, motivo, idadeEmHoras, linhaDeAviso, caminhoDoSentinela, NOME };
