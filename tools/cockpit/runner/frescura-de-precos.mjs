/**
 * frescura-de-precos.mjs
 *
 * O snapshot de precos (`data/pricing-snapshot-2026-05-27.json`) alimenta um
 * router de CUSTO (`packages/router/src/decide-agent.ts:40` importa-o). Um
 * snapshot velho num router de custo nao falha ruidosamente: decide barato ou
 * caro com numeros de outro mes e ninguem ve.
 *
 * Ha DUAS verdades aqui e elas nao sao a mesma:
 *
 *   - o snapshot e um contrato de REPRODUTIBILIDADE dos benchmarks (wave1/wave2
 *     precificam contra ele de proposito, para uma corrida antiga dar o mesmo
 *     numero hoje);
 *   - `tools/router/pricing.js` (PRICES) e o SSOT VIVO, revisto a 2026-08-03.
 *
 * Este modulo nao decide qual vence — mede a distancia entre as duas e obriga a
 * que seja declarada. Tres classes de mentira, todas medidas, nenhuma inventada:
 *
 *   1. IDADE — quanto tempo desde a ultima verificacao declarada.
 *   2. DIVERGENCIA — o snapshot poe um preco que o SSOT vivo contradiz.
 *   3. FALSO-PENDING — o snapshot diz "nao ha fonte para este modelo" enquanto o
 *      SSOT vivo tem o preco. Esta e a pior, e vale dizer com precisao o que faz:
 *      o modelo sai do sort por TES ("you cannot rank what you cannot price") e
 *      passa a so ser alcancavel pelo fallback heuristico de tier, ja marcado
 *      pending (decide-agent.ts:165). Nao e "nunca escolhido" — e escolhido, se
 *      for, sem que o custo tenha entrado na decisao.
 *      O segundo efeito e no custo: `computeCostMicros` devolve 0 para um modelo
 *      sem preco (cost.ts:77). Esse 0 e uma sentinela DECLARADA, nao um numero
 *      inventado — mas e byte a byte o mesmo 0 que a funcao devolve para um
 *      modelo local verdadeiramente gratis (cost.ts:74). Quem le o resultado nao
 *      consegue distinguir "de graca" de "sem preco", e e por isso que um
 *      pending que nao devia existir custa caro.
 *
 * Funcoes puras: recebem os objectos ja lidos, nao tocam no disco, nunca atiram.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/** Um modelo esta "pending" se se declara pending OU se nao tem preco de entrada. */
export function estaPending(entrada) {
  if (!entrada || typeof entrada !== 'object') return true;
  return entrada.pricing_status === 'pending' || entrada.input_per_mtok == null;
}

/**
 * Idade em dias inteiros desde a ultima verificacao declarada.
 * Devolve `null` (ignorancia, nunca 0) se o snapshot nao declarar data nenhuma —
 * um 0 aqui leria-se como "verificado hoje", que e exactamente a mentira a evitar.
 */
export function idadeEmDias(snapshot, hoje) {
  const declarada = snapshot?.last_verified_at ?? snapshot?.snapshot_date ?? null;
  if (!declarada) return null;
  const t = Date.parse(declarada);
  const agora = Date.parse(hoje);
  if (Number.isNaN(t) || Number.isNaN(agora)) return null;
  return Math.floor((agora - t) / DIA_MS);
}

/** Modelos cujo preco no snapshot contradiz o SSOT vivo. */
export function divergencias(snapshot, precosVivos) {
  const out = [];
  for (const [modelo, v] of Object.entries(snapshot?.models ?? {})) {
    if (estaPending(v)) continue;
    const vivo = precosVivos?.[modelo];
    if (!vivo || vivo.input == null) continue; // ausente do SSOT: outra classe, ver `ausentesDoSsot`
    if (vivo.input !== v.input_per_mtok || vivo.output !== v.output_per_mtok) {
      out.push({
        modelo,
        snapshot: { input: v.input_per_mtok, output: v.output_per_mtok },
        vivo: { input: vivo.input, output: vivo.output },
      });
    }
  }
  return out;
}

/**
 * Modelos que o snapshot marca "pending" mas que o SSOT vivo sabe precificar.
 * Cada um destes e um modelo que o router de custo nao consegue ranquear apesar
 * de o preco existir dentro do proprio repositorio.
 */
export function falsosPending(snapshot, precosVivos) {
  const out = [];
  for (const [modelo, v] of Object.entries(snapshot?.models ?? {})) {
    if (!estaPending(v)) continue;
    // Excepcao DECLARADA: um modelo pode ficar sem preco de proposito, e a razao
    // vive no proprio snapshot (nao numa lista dentro deste teste). Uma excepcao
    // escrita nos dados le-se; uma escondida no gate apodrece sem ninguem ver.
    if (v.pricing_withheld_reason) continue;
    const vivo = precosVivos?.[modelo];
    if (vivo && vivo.input != null) {
      out.push({ modelo, vivo: { input: vivo.input, output: vivo.output } });
    }
  }
  return out;
}

/** Modelos precificados no snapshot que o SSOT vivo nem conhece. */
export function ausentesDoSsot(snapshot, precosVivos) {
  const out = [];
  for (const [modelo, v] of Object.entries(snapshot?.models ?? {})) {
    if (estaPending(v)) continue;
    if (!precosVivos?.[modelo]) out.push(modelo);
  }
  return out;
}

/** Relatorio unico, para o teste e para quem quiser imprimir. */
export function auditar(snapshot, precosVivos, hoje, limiteDias = 30) {
  const idade = idadeEmDias(snapshot, hoje);
  return {
    idade_dias: idade,
    limite_dias: limiteDias,
    // `null` (sem data declarada) conta como estagnado: ignorancia nao e frescura.
    estagnado: idade === null || idade > limiteDias,
    divergencias: divergencias(snapshot, precosVivos),
    falsos_pending: falsosPending(snapshot, precosVivos),
    ausentes_do_ssot: ausentesDoSsot(snapshot, precosVivos),
  };
}
