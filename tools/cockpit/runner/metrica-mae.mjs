/**
 * metrica-mae.mjs — a métrica que a concorrência publica, medida do ledger real.
 *
 * ── QUAL É A MÉTRICA ────────────────────────────────────────────────────────
 *
 * O RouteLLM (Ong et al., 2024) não se avalia por «quanto poupou». Avalia-se por
 * um par, e é o par que é honesto:
 *
 *    · que **percentagem das chamadas** foi ao modelo forte
 *    · que **percentagem da qualidade** se manteve na mesma
 *
 * Um número sozinho mente nas duas direcções: 0% no forte com metade da
 * qualidade não é poupança, é degradação; 100% de qualidade com 100% no forte
 * não é router nenhum, é um proxy caro.
 *
 * ── O QUE ESTE MÓDULO MEDE, E O QUE RECUSA MEDIR ────────────────────────────
 *
 * Medido em 2026-08-25 sobre os dois ledgers reais desta máquina:
 *
 *   `decisions_v2.jsonl`   224 decisões · tier e llm em **100%**
 *                          `tokens_in > 0` em **0%** · `tokens_out > 0` em **0%**
 *   `runner-ledger.jsonl`  5321 rondas · `engine` em 100% (tudo `ollama-local`)
 *                          `tokens_in` **não existe como campo**
 *
 * Portanto:
 *
 *   ✅ a metade das CHAMADAS calcula-se hoje, inteira, sem estimar nada.
 *   ❌ a metade da QUALIDADE sai `n/d`, e o motivo é estrutural, não preguiça:
 *      o `decisions_v2.jsonl` não tem sinal de qualidade nenhum. O único sinal
 *      de qualidade do sistema (`verdict: citacao-ok|refutado|…`) vive no ledger
 *      do runner, que é **outra população** — rondas de pilar, não prompts
 *      encaminhados. Juntá-los daria um número; seria um número inventado, e
 *      esse é o único erro que este projecto não pode cometer.
 *   ❌ tudo o que dependa de tokens sai `n/d` com a percentagem medida ao lado.
 *
 * Isto é a «flag» que o plano pedia: a métrica existe, corre, e declara com
 * precisão de que lhe falta a segunda metade — em vez de fabricar a correlação
 * que a tornaria publicável.
 *
 * PURO: recebe linhas já lidas. Sem fs, sem relógio próprio.
 */

import { OWNER_TZ, ownerDay } from './fleet-state.mjs';

export { OWNER_TZ };

/**
 * Que tiers contam como «o modelo forte».
 *
 * T3 é o topo auto-encaminhável (Opus). T5 (Fable) **nunca** é auto-encaminhado
 * — só entra por `@fable` — mas se aparecer numa decisão conta como forte, que
 * é o que ele é. Não conta como violação: quem julga isso é o portão
 * `precificavel-nao-rotavel`.
 */
export const TIERS_FORTES = new Set(['T3', 'T5']);

/** Tiers que correm na máquina do dono e custam $0. */
export const TIERS_LOCAIS = new Set(['T0']);

function ler(linhas) {
  const out = [];
  for (const l of linhas || []) {
    if (typeof l === 'object' && l) { out.push(l); continue; }
    const s = String(l || '').trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* uma linha corrompida é uma linha, não um ledger */ }
  }
  return out;
}

/**
 * Quantas linhas trazem mesmo um campo utilizável.
 *
 * Devolve `{presentes, total, pct}`. É o que permite dizer «n/d **porque** 0 de
 * 224» em vez de um `n/d` mudo, que é indistinguível de não se ter tentado.
 */
export function cobertura(decisoes, campo, util = (v) => Number(v) > 0, utilRegisto = null) {
  const total = decisoes.length;
  // `utilRegisto` vê o registo inteiro. Existe porque «este token foi medido?»
  // não se responde olhando só para o token: responde-se olhando para o campo
  // que diz de onde ele veio.
  const presentes = utilRegisto
    ? decisoes.filter((d) => utilRegisto(d)).length
    : decisoes.filter((d) => util(d && d[campo])).length;
  return { presentes, total, pct: total ? Math.round((1000 * presentes) / total) / 10 : null };
}

/**
 * Cobertura de tokens: quantas decisões trazem um número que ALGUÉM MEDIU.
 *
 * ⚠️ NÃO é «> 0», e não é «não é null» — é `tokens_fonte === 'medido'`.
 *
 * As 403 linhas que este ledger já tinha a 2026-09-02 trazem `tokens_in: 0`
 * escrito pelo hook de UserPromptSubmit, que corre ANTES da execução e nunca
 * pôde medir nada. Um predicado «não é null» contaria essas 403 como cobertura
 * total e a métrica saltaria para 100% sem uma única medição nova. A cobertura
 * subiria; a verdade não. Um zero legado sem proveniência declarada não conta,
 * e um zero MEDIDO conta — é para isso que o campo existe.
 */
export function coberturaDeTokens(decisoes, campo) {
  return cobertura(decisoes, campo, () => false, (d) => foiMedido(d, campo));
}

/**
 * O predicado UNICO de «este numero foi medido».
 *
 * Existe como funcao, e nao copiado em dois sitios, porque estava copiado em
 * dois sitios e os dois discordavam: o `quotaPorMotor` contava por
 * `tokens_out > 0`, o que classificava um zero REALMENTE MEDIDO como
 * nao-medido — a mesma confusao entre «gastou zero» e «ninguem contou» que o
 * C1.3 veio desfazer, sobrevivendo dentro do proprio ficheiro que a desfaz.
 * Apanhado pelo adversario (codex, 2026-09-03).
 */
export function foiMedido(d, campo) {
  return !!d
    && d.tokens_fonte === 'medido'
    && typeof d[campo] === 'number'
    && Number.isFinite(d[campo])
    && d[campo] >= 0;
}

/**
 * A métrica-mãe.
 *
 * @param {Array} linhas  linhas do `decisions_v2.jsonl` (objectos ou strings)
 */
export function metricaMae(linhas, { agora = Date.now(), janelaDias = null } = {}) {
  let d = ler(linhas);
  const corrompidas = (linhas || []).length - d.length;

  if (janelaDias) {
    const corte = agora - janelaDias * 86400_000;
    d = d.filter((x) => {
      const t = Date.parse(x && x.ts);
      return Number.isFinite(t) && t >= corte;
    });
  }

  const total = d.length;
  if (!total) {
    return {
      total: 0, corrompidas,
      chamadas_no_forte: { pct: null, n: 0, porque: 'sem decisões na janela' },
      qualidade_mantida: { pct: null, porque: SEM_QUALIDADE },
      tokens: { pct_cobertura: null, porque: 'sem decisões na janela' },
      por_tier: {}, por_motor: {},
    };
  }

  const porTier = {};
  const porMotor = {};
  for (const x of d) {
    const t = x && x.tier ? String(x.tier) : 'n/d';
    porTier[t] = (porTier[t] || 0) + 1;
    const m = x && x.llm ? String(x.llm) : 'n/d';
    porMotor[m] = (porMotor[m] || 0) + 1;
  }

  const forte = d.filter((x) => TIERS_FORTES.has(String(x && x.tier))).length;
  const local = d.filter((x) => TIERS_LOCAIS.has(String(x && x.tier))).length;

  /**
   * ⚠️ COBERTURA E «FOI MEDIDO», NAO «E MAIOR QUE ZERO» — C1.3.
   *
   * O predicado por omissao (`Number(v) > 0`) contava um zero medido como
   * ausencia, e — pior — nao conseguia distingui-lo de um zero inventado.
   * Ate 2026-09-02 o `decisions_v2.jsonl` escrevia `0` para todas as decisoes
   * do hook (que corre ANTES da execucao e nunca pode ter tokens), e a
   * cobertura de 0% estava certa por acidente: lia zeros que se apresentavam
   * como medicoes. Agora ausente e `null` e medido traz `tokens_fonte`.
   */
  const covIn = coberturaDeTokens(d, 'tokens_in');
  const covOut = coberturaDeTokens(d, 'tokens_out');
  const covFonte = cobertura(d, 'tokens_fonte', (v) => v === 'medido');

  return {
    total,
    corrompidas,
    /**
     * A metade que se mede. `pct` é a fracção de chamadas que subiu ao modelo
     * forte — quanto MAIS BAIXO, melhor, desde que a outra metade se aguente.
     */
    chamadas_no_forte: {
      pct: Math.round((1000 * forte) / total) / 10,
      n: forte,
      de: total,
      porque: null,
    },
    chamadas_locais: { pct: Math.round((1000 * local) / total) / 10, n: local, de: total },
    /**
     * A metade que NÃO se mede, e o motivo exacto. Nunca um número.
     */
    qualidade_mantida: { pct: null, porque: SEM_QUALIDADE },
    /**
     * Tokens: `n/d` com a cobertura medida, para o `n/d` ser argumentável.
     */
    tokens: {
      pct_cobertura: covIn.pct,
      entrada: covIn,
      saida: covOut,
      // Quem DECLAROU ter medido. `pct_cobertura` conta o campo presente;
      // isto conta a proveniencia declarada, e as duas juntas dizem se um
      // numero presente veio de algum lado.
      medidos: covFonte,
      porque: covIn.presentes === 0 && covOut.presentes === 0
        ? `nenhuma das ${total} decisões traz tokens medidos — as decisões do hook são escritas ANTES da execução e nunca podem trazê-los; `
          + 'o custo por chamada só é derivável para os despachos que medem (conector)'
        : `cobertura: ${covIn.pct}% entrada, ${covOut.pct}% saída · ${covFonte.presentes}/${total} com fonte declarada`,
    },
    por_tier: porTier,
    por_motor: porMotor,
  };
}

export const SEM_QUALIDADE =
  'o decisions_v2.jsonl não regista qualidade nenhuma por decisão. O único sinal '
  + 'de qualidade do sistema (`verdict`) vive no ledger do runner, que é outra '
  + 'população (rondas de pilar, não prompts encaminhados) — cruzá-los daria um '
  + 'número inventado';

/**
 * Consumo por motor, por DIA DO DONO.
 *
 * O tecto real de uma subscrição não se lê num total acumulado: lê-se no dia. E
 * o dia é o do Paulo (`America/Sao_Paulo`), não o do host — a regra está no
 * `CLAUDE.md` e já custou uma "correcção" errada a dois ficheiros normativos.
 *
 * O USD sai `n/d` de propósito quando não há tokens: um custo derivado de zero
 * tokens seria zero, e zero aqui quer dizer «não medido», não «grátis».
 */
export function quotaPorMotor(linhas, { tz = OWNER_TZ } = {}) {
  const d = ler(linhas);
  const dias = new Map();
  for (const x of d) {
    const t = Date.parse(x && x.ts);
    if (!Number.isFinite(t)) continue;
    const dia = ownerDay(t, tz);
    if (!dias.has(dia)) dias.set(dia, new Map());
    const m = dias.get(dia);
    const motor = x && x.llm ? String(x.llm) : 'n/d';
    if (!m.has(motor)) m.set(motor, { chamadas: 0, tier: x && x.tier ? String(x.tier) : 'n/d', tokens_out: 0, tokens_medidos: 0 });
    const e = m.get(motor);
    e.chamadas += 1;
    // `foiMedido`, e nao `> 0`: um zero medido e uma medicao. Ver o comentario
    // do predicado — ate 2026-09-03 esta linha discordava do resto do ficheiro.
    if (foiMedido(x, 'tokens_out')) { e.tokens_out += x.tokens_out; e.tokens_medidos += 1; }
  }
  return [...dias.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dia, motores]) => ({
      dia,
      tz,
      motores: [...motores.entries()]
        .sort((a, b) => b[1].chamadas - a[1].chamadas)
        .map(([motor, e]) => ({
          motor,
          tier: e.tier,
          chamadas: e.chamadas,
          // `null`, nunca `0`: zero tokens medidos quer dizer não-medido.
          tokens_out: e.tokens_medidos > 0 ? e.tokens_out : null,
          usd: null,
          porque_usd: e.tokens_medidos > 0
            ? 'preço por modelo ainda não ligado a esta projecção'
            : 'sem tokens medidos — um custo derivado de zero seria zero, e zero aqui quer dizer não-medido',
        })),
      total_chamadas: [...motores.values()].reduce((s, e) => s + e.chamadas, 0),
    }));
}

/** Uma linha para o painel/statusline. Nunca inventa a metade que falta. */
export function emUmaLinha(m) {
  if (!m || !m.total) return 'métrica-mãe: n/d (sem decisões)';
  const f = `${m.chamadas_no_forte.pct}% no forte (${m.chamadas_no_forte.n}/${m.total})`;
  const l = `${m.chamadas_locais.pct}% local`;
  const q = m.qualidade_mantida.pct == null ? 'qualidade n/d' : `${m.qualidade_mantida.pct}% de qualidade`;
  return `métrica-mãe: ${f} · ${l} · ${q}`;
}
