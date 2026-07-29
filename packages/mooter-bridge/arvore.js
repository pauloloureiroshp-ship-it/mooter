'use strict';
/**
 * arvore.js — mooter-bridge v1.5: quem trabalhou para quem, num só bloco.
 *
 * O PEDIDO, e porque é que a lista plana não chegava:
 *
 * O painel mostrava jobs em fila, por ordem de chegada. Isso responde a "o que
 * está a correr" mas não à pergunta que interessa a quem paga: **quanto do meu
 * trabalho foi feito de graça?** Um moo local que prepara o terreno e um Opus
 * que remata apareciam como dois cartões lado a lado, como se fossem duas
 * tarefas — quando são uma tarefa com dois andares.
 *
 * A estrutura aqui é a do trabalho, não a do ledger:
 *
 *   wave
 *    └── tarefa (o objectivo que pediste)
 *         ├── ☁ motor de subscrição   ← quem rematou, e quanto custou
 *         └── 🐮 moos locais           ← quem preparou, sempre a $0
 *
 * A ligação vem do `handoff_from` que o `seamless.js` já escreve no ledger
 * quando encadeia moo → agente pago. Não é inferida por pasta nem por tempo —
 * essa foi a heurística que em 2026-07-25 etiquetou um job com o modelo de uma
 * sessão 18 horas mais velha.
 *
 * ❌ Nada aqui inventa números. Um job sem custo reportado fica `null` e a
 * eficiência que ele representa fica de fora da conta, declarada em `sem_medicao`.
 */

const LOCAIS = new Set(['moo']);

/** Preço por milhão de tokens de OUTPUT, para a estimativa de poupança. */
const PRECO_OUT_POR_MTOK = {
  'claude-opus-4-8': 75, 'claude-opus-5': 75,
  'claude-sonnet-4-6': 15, 'claude-sonnet-5': 15,
  'claude-haiku-4-5': 4,
};

/** O preço mais barato da tabela — usado para NÃO exagerar a poupança. */
function precoConservador() {
  let min = Infinity;
  for (const v of Object.values(PRECO_OUT_POR_MTOK)) if (v < min) min = v;
  return Number.isFinite(min) ? min : null;
}

function ehLocal(j) { return LOCAIS.has(String(j && j.agent)) || j.local === true; }

/**
 * Constrói a árvore a partir dos jobs já dobrados pelo `fleet.foldJobs`.
 * @param {Array} jobs
 * @param {Array} planos  planos por wave (para dar o objectivo em texto)
 */
function construir(jobs, planos) {
  const lista = Array.isArray(jobs) ? jobs.slice() : [];
  const porId = new Map(lista.map((j) => [j.job_id, j]));

  /**
   * ⚠️ DOIS BUGS REAIS, encontrados pelo Opus a auditar este ficheiro em
   * 2026-07-26 e reproduzidos antes de acreditar. Ambos atacavam exactamente
   * o número que este produto existe para não falsear — a poupança.
   *
   *   1. CADEIA de três andares (moo A → pago B → pago C):
   *      A e B eram ambos marcados como "já usados", só C ficava no topo, e
   *      `tarefa(C, [B])` não descia até A. Resultado medido: 1000 tokens
   *      locais viravam **0**. A poupança desaparecia por completo.
   *
   *   2. LEQUE (um moo A prepara B e C):
   *      A era anexado às duas tarefas e os seus tokens contados nas duas.
   *      Resultado medido: 1000 tokens locais viravam **2000**. A poupança
   *      duplicava — o pecado exacto que a doutrina proíbe.
   *
   * A correcção é a mesma para os dois: seguir a cadeia INTEIRA para cima, e
   * contar cada job UMA vez, por identidade.
   */
  const paisDe = new Map();            // job -> ancestrais, do mais próximo ao mais distante
  for (const j of lista) {
    const cadeia = [];
    const vistos = new Set([j.job_id]);   // ❌ um ciclo no ledger não pode pendurar o painel
    let cur = j;
    while (cur && cur.handoff_from && !vistos.has(cur.handoff_from)) {
      const pai = porId.get(cur.handoff_from);
      if (!pai) break;
      vistos.add(pai.job_id);
      cadeia.push(pai);
      cur = pai;
    }
    if (cadeia.length) paisDe.set(j.job_id, cadeia);
  }
  const filhosDe = paisDe;

  // um job que preparou alguém não é uma tarefa própria — é um andar
  const usadosComoFilho = new Set();
  for (const arr of filhosDe.values()) for (const f of arr) usadosComoFilho.add(f.job_id);

  const porWave = new Map();
  const todosDaWave = new Map();
  for (const j of lista) {
    const w = j.wave || '(sem wave)';
    if (!todosDaWave.has(w)) todosDaWave.set(w, []);
    todosDaWave.get(w).push(j);
    if (usadosComoFilho.has(j.job_id)) continue;
    if (!porWave.has(w)) porWave.set(w, []);
    porWave.get(w).push(j);
  }
  /**
   * ⚠️ Um CICLO no ledger (A aponta para B e B aponta para A) deixa a wave sem
   * nenhum job de topo — e a wave inteira desaparecia do painel. Descoberto ao
   * escrever o teste da correcção acima, não em produção.
   *
   * Um ledger é append-only e escrito por vários processos; assumir que nunca
   * terá um ciclo é uma aposta, não uma garantia. Quando não há topo, mostramos
   * tudo em lista plana: pior hierarquia é muito melhor do que trabalho
   * invisível.
   */
  for (const [w, todos] of todosDaWave) {
    if (!porWave.has(w) && todos.length) porWave.set(w, todos.slice());
  }

  const objetivoDe = new Map();
  for (const p of (Array.isArray(planos) ? planos : [])) {
    if (p && p.wave && p.goal) objetivoDe.set(p.wave, p.goal);
  }

  const waves = [];
  for (const [wave, principais] of porWave) {
    const tarefas = principais
      .sort((a, b) => String(b.dispatched_at || '').localeCompare(String(a.dispatched_at || '')))
      .map((j) => tarefa(j, filhosDe.get(j.job_id) || []));
    waves.push({
      wave,
      objetivo: objetivoDe.get(wave) || null,
      tarefas,
      resumo: somar(tarefas),
    });
  }
  waves.sort((a, b) => {
    const va = a.tarefas[0] && a.tarefas[0].em || '';
    const vb = b.tarefas[0] && b.tarefas[0].em || '';
    return String(vb).localeCompare(String(va));
  });

  return { waves, resumo: somar(waves.flatMap((w) => w.tarefas)) };
}

function andar(j) {
  return {
    job_id: j.job_id,
    agente: j.agent || null,
    etiqueta: j.agent_label || j.agent || null,
    local: ehLocal(j),
    modelo: j.model_used || j.model || null,
    modelo_fonte: j.model_source || null,
    modelo_porque: j.modelo_porque || null,
    trocou_residente: j.modelo_trocou_residente || null,
    tier_pedido: j.tier_pedido || j.tier || null,
    tier_motor: j.tier_motor || null,
    estado: j.state || null,
    exit_code: j.exit_code != null ? j.exit_code : null,
    segundos: j.elapsed_s != null ? j.elapsed_s : (j.duration_s != null ? j.duration_s : null),
    tokens_in: j.tokens_in != null ? j.tokens_in : null,
    tokens_out: j.tokens_out != null ? j.tokens_out : null,
    tok_s: j.tok_s != null ? j.tok_s : null,
    tok_s_base: j.tok_s_basis || null,
    // ⚠️ `null` é abstenção, `0` é afirmação. Um local custa mesmo 0.
    custo_usd: ehLocal(j) ? 0 : (j.cost_usd != null ? j.cost_usd : null),
    a_fazer: j.activity || null,
    onde: j.where || null,
    ficheiros_lidos: j.files_read || null,
    ficheiros_escritos: j.files_written || null,
  };
}

function tarefa(principal, preparadores) {
  const topo = andar(principal);
  const abaixo = preparadores.map(andar);
  const locais = abaixo.filter((a) => a.local).concat(topo.local ? [topo] : []);
  const nuvem = (topo.local ? [] : [topo]).concat(abaixo.filter((a) => !a.local));

  const tokLocal = locais.reduce((s, a) => s + (a.tokens_out || 0), 0);
  const tokNuvem = nuvem.reduce((s, a) => s + (a.tokens_out || 0), 0);
  const custo = nuvem.reduce((s, a) => (a.custo_usd == null ? s : s + a.custo_usd), 0);
  const semMedicao = nuvem.filter((a) => a.custo_usd == null).length;

  return {
    job_id: principal.job_id,
    titulo: principal.step || principal.job_id,
    em: principal.dispatched_at || null,
    estado: principal.state || null,
    remate: topo,                       // quem entregou o resultado final
    preparadores: abaixo,               // quem lhe amaciou o caminho, a $0
    andares: 1 + abaixo.length,
    tokens_local: tokLocal,
    tokens_nuvem: tokNuvem,
    custo_usd: semMedicao && !custo ? null : custo,
    custo_jobs_sem_medicao: semMedicao,
  };
}

function somar(tarefas) {
  const t = Array.isArray(tarefas) ? tarefas : [];
  /**
   * ⚠️ Somar TAREFAS conta a dobrar quando um preparador serve duas delas.
   * Somamos JOBS DISTINTOS, por `job_id`. Um andar partilhado aparece nas duas
   * tarefas — porque é verdade que trabalhou para ambas — mas conta uma vez.
   */
  const vistos = new Map();
  for (const x of t) {
    for (const a of [x.remate].concat(x.preparadores || [])) {
      if (a && a.job_id && !vistos.has(a.job_id)) vistos.set(a.job_id, a);
    }
  }
  const andares = [...vistos.values()];
  const tokLocal = andares.filter((a) => a.local).reduce((s, a) => s + (a.tokens_out || 0), 0);
  const tokNuvem = andares.filter((a) => !a.local).reduce((s, a) => s + (a.tokens_out || 0), 0);
  const nuvem = andares.filter((a) => !a.local);
  const custo = nuvem.reduce((s, a) => (a.custo_usd == null ? s : s + a.custo_usd), 0);
  const semMedicao = nuvem.filter((a) => a.custo_usd == null).length;
  const total = tokLocal + tokNuvem;
  return {
    tarefas: t.length,
    tokens_local: tokLocal,
    tokens_nuvem: tokNuvem,
    quota_local_pct: total ? Math.round((tokLocal / total) * 100) : null,
    custo_usd: (custo || semMedicao === 0) ? custo : null,
    custo_jobs_sem_medicao: semMedicao,
    poupanca: poupanca(tokLocal, semMedicao),
  };
}

/**
 * ⚠️ ISTO É UMA ESTIMATIVA, E DIZ-SE ANTES DO NÚMERO.
 *
 * Não sabemos o que a nuvem teria cobrado por trabalho que ela não fez — só
 * sabemos quantos tokens saíram de graça da GPU. Multiplicamos pelo preço do
 * modelo pago MAIS BARATO da tabela, de propósito: assim o número peca sempre
 * por defeito. Um produto que vende poupança não pode arredondar a poupança
 * para cima.
 */
function poupanca(tokensLocais, semMedicao) {
  const preco = precoConservador();
  if (!tokensLocais || preco == null) {
    return { usd: null, base: 'sem tokens locais medidos', estimativa: true };
  }
  return {
    usd: Number(((tokensLocais / 1e6) * preco).toFixed(4)),
    tokens_locais: tokensLocais,
    base: 'ESTIMATIVA — ' + tokensLocais + ' tokens gerados na GPU a $0, valorizados ao preço do modelo pago mais barato ($'
      + preco + '/Mtok de output). O valor real seria maior se o trabalho tivesse ido para um modelo melhor.',
    estimativa: true,
    ressalva: semMedicao ? semMedicao + ' job(s) de nuvem sem custo reportado pelo CLI — ficam de fora da conta' : null,
  };
}

module.exports = { construir, tarefa, andar, somar, poupanca, precoConservador, PRECO_OUT_POR_MTOK };
