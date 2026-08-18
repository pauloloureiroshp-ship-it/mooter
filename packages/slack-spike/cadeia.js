'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. A CADEIA: quanto custou a CONVERSA, nao o pedido.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PORQUE ESTE FICHEIRO EXISTE
 *
 * O cartao dizia «Já gasto até agora neste pedido: US$ 1,24». Literalmente
 * verdadeiro. Mas a thread onde estava ja tinha queimado US$ 2,88 em tres pedidos
 * encadeados — cada aprovacao gera um pedido novo, e cada cartao novo so sabe de si.
 * O dono lia 1,24 e a conta era 2,88.
 *
 * Para uma cabine de custodia, isto e enganar por omissao: e exactamente o numero
 * que um estranho vai querer conferir. Nao havia mentira em nenhum cartao — havia
 * mentira no CONJUNTO. Um numero honesto por peca pode somar um total desonesto.
 *
 * SEPARACAO: este modulo faz ARITMETICA e nao formata nada. O `cartao.js` formata e
 * nao calcula nada. Assim o teste do total nao passa por Block Kit, e o teste da
 * apresentacao nao precisa de um ledger.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * DOIS elos, os mesmos do `poller.js`: `prep_from` quando a preparacao EXPIRA,
 * `handoff_from` quando ela tem SUCESSO. Conhecer so um partia o caminho feliz.
 */
const ELOS = Object.freeze(['prep_from', 'handoff_from']);

function paiDe(e) {
  for (const k of ELOS) if (e && e[k]) return e[k];
  return null;
}

/**
 * A cadeia inteira a que `jobId` pertence: sobe ate a raiz e desce a apanhar todos
 * os descendentes. Nao e so «os anteriores» — se o dono estiver a olhar para o do
 * meio, o total tem de incluir o que veio depois.
 *
 * @returns {{jobs:string[], pedidos:number, total:number, todosMedidos:boolean, fontes:string[]}}
 */
function cadeiaDe(ledger, jobId) {
  const es = Array.isArray(ledger) ? ledger : [];
  const pai = new Map();
  const filhos = new Map();
  for (const e of es) {
    if (e.event !== 'dispatched' || !e.job_id) continue;
    const p = paiDe(e);
    if (!p) continue;
    pai.set(e.job_id, p);
    if (!filhos.has(p)) filhos.set(p, []);
    filhos.get(p).push(e.job_id);
  }

  let raiz = jobId;
  const visto = new Set([raiz]);          // guarda contra um ciclo no ledger
  while (pai.has(raiz) && !visto.has(pai.get(raiz))) { raiz = pai.get(raiz); visto.add(raiz); }

  const jobs = [];
  const porVer = [raiz];
  const jaVi = new Set();
  while (porVer.length) {
    const j = porVer.shift();
    if (jaVi.has(j)) continue;
    jaVi.add(j);
    jobs.push(j);
    for (const f of filhos.get(j) || []) porVer.push(f);
  }

  // o ULTIMO evento com custo de cada job — a reconciliacao do motor re-carimba
  const custo = new Map();
  const fontes = new Map();
  for (const e of es) {
    if (!e.job_id || !jobs.includes(e.job_id) || e.cost_usd == null) continue;
    const v = Number(e.cost_usd);
    if (!Number.isFinite(v) || v < 0) continue;
    custo.set(e.job_id, v);
    if (e.cost_usd_fonte) fontes.set(e.job_id, String(e.cost_usd_fonte));
  }

  let total = 0;
  for (const v of custo.values()) total += v;

  return {
    jobs,
    pedidos: jobs.length,
    total,
    // ⚠️ um job da cadeia sem custo gravado (ainda a correr, ou interrompido antes
    // de reportar) torna o total um PISO, nao um total. Publicar um piso como total
    // seria a mesma mentira em ponto mais pequeno.
    todosMedidos: custo.size === jobs.length,
    fontes: [...new Set(fontes.values())],
  };
}

module.exports = { cadeiaDe, paiDe, ELOS };
