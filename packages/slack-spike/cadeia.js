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

  // ⚠️ SO CONTA QUEM EXISTE. Um `handoff_from` a apontar para um job que nunca foi
  // despachado (ledger truncado, evento perdido) fazia esse fantasma entrar na
  // lista e inflacionava o «N pedidos encadeados» com um pedido que nao existe.
  const existe = new Set();
  for (const e of es) if (e.job_id) existe.add(e.job_id);

  // ⚠️ `pai` e `filhos` derivam da MESMA fonte, e nao de dois loops. Antes o `pai`
  // guardava o ultimo elo e o `filhos` guardava TODOS os historicos: um job
  // re-despachado com outro pai aparecia em duas cadeias com totais diferentes —
  // a mesma conversa dava US$ 3 ou US$ 12 conforme o cartao por onde se entrasse.
  const pai = new Map();
  for (const e of es) {
    if (e.event !== 'dispatched' || !e.job_id) continue;
    const p = paiDe(e);
    if (p && existe.has(p)) pai.set(e.job_id, p);     // o ultimo dispatch manda
  }
  const filhos = new Map();
  for (const [f, p] of pai) {
    if (!filhos.has(p)) filhos.set(p, []);
    filhos.get(p).push(f);
  }

  let raiz = jobId;
  const visto = new Set([raiz]);          // guarda contra um ciclo no ledger
  while (pai.has(raiz) && !visto.has(pai.get(raiz))) { raiz = pai.get(raiz); visto.add(raiz); }

  const jobs = [];
  const doConjunto = new Set();
  const porVer = [raiz];
  const jaVi = new Set();
  while (porVer.length) {
    const j = porVer.shift();
    if (jaVi.has(j)) continue;
    jaVi.add(j);
    jobs.push(j);
    doConjunto.add(j);   // (todo o `j` aqui ou e o jobId ou existe: ver o filtro em `pai`)
    for (const f of filhos.get(j) || []) porVer.push(f);
  }

  // o ULTIMO evento com custo de cada job — a reconciliacao do motor re-carimba
  // ⚠️ O ULTIMO CARIMBO MANDA, com ou sem fonte. Antes o loop escrevia direito no
  // mapa: um re-carimbo SEM fonte deixava la o valor ANTIGO e a fonte antiga, e a
  // cadeia publicava US$ 10 com a procedencia de US$ 1 (achado do codex). Agora
  // guarda-se o ultimo evento de custo de cada job — valor E fonte juntos — e so
  // depois se decide. Um custo sem procedencia nao entra na soma e torna o total
  // um piso: `n/d` conta como ausente, a mesma regra do `leitura.js`.
  const ultimo = new Map();
  for (const e of es) {
    if (!e.job_id || !doConjunto.has(e.job_id) || e.cost_usd == null) continue;
    const v = Number(e.cost_usd);
    if (!Number.isFinite(v) || v < 0) continue;
    const f = e.cost_usd_fonte == null ? '' : String(e.cost_usd_fonte).trim();
    ultimo.set(e.job_id, { v, f: !f || f.toLowerCase() === 'n/d' ? null : f });
  }

  const custo = new Map();
  const fontes = new Map();
  const semFonte = [];
  for (const [job, u] of ultimo) {
    if (!u.f) { semFonte.push(job); continue; }
    custo.set(job, u.v);
    fontes.set(job, u.f);
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
    todosMedidos: custo.size === jobs.length && semFonte.length === 0,
    fontes: [...new Set(fontes.values())],
    semFonte,          // jobs com custo mas sem procedencia — nao somados, e tornam o total um piso
  };
}

module.exports = { cadeiaDe, paiDe, ELOS };
