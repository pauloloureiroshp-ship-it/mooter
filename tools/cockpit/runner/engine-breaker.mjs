/**
 * engine-breaker.mjs — o disjuntor do motor local.
 *
 * Porque existe: medido a 2026-08-18, o ledger tinha **1767 recibos
 * consecutivos** de `motor local indisponivel: fetch failed`, de
 * 2026-08-16T23:18:40Z a 2026-08-17T10:18:49Z — um apagao de 11 horas que
 * entrou no registo como se fosse trabalho. O loop chamava `appendReceipt` e
 * dormia 15-30s INCONDICIONALMENTE, por isso um motor em baixo produzia
 * exactamente o mesmo volume de linhas que um motor a trabalhar, e o painel
 * ficava verde-vivo por causa da frescura desses recibos vazios.
 *
 * A resposta tem duas metades, e as duas importam:
 *  1. **backoff exponencial** — parar de martelar um motor que nao responde;
 *  2. **silencio com principio** — o ledger regista o APAGAO (um `engine:down`
 *     com o instante de inicio, um `engine:up` com a duracao), nunca cada
 *     tentativa falhada. Contar tentativas nao e medir trabalho.
 *
 * Puro: sem I/O, sem relogio proprio, sem rede. O tempo entra por parametro,
 * o que torna um apagao de 11 horas testavel em milissegundos.
 */

/** Ao fim de quantas falhas SEGUIDAS o disjuntor abre e o ledger se cala. */
export const ENGINE_DOWN_AFTER = 3;
/** Primeira espera, em segundos. Duplica a cada falha. */
export const BACKOFF_BASE_S = 30;
/** Tecto da espera. Acima disto nao ha nada a ganhar em esperar mais. */
export const BACKOFF_CAP_S = 900;

/**
 * 30s, 60s, 120s, 240s, 480s, 900s (tecto). Zero falhas = zero espera extra.
 */
export function backoffSeconds(falhas, { baseS = BACKOFF_BASE_S, capS = BACKOFF_CAP_S } = {}) {
  if (!Number.isFinite(falhas) || falhas <= 0) return 0;
  const bruto = baseS * 2 ** (falhas - 1);
  // 2**n cresce depressa: sem o Number.isFinite o tecto perdia para Infinity
  // num apagao longo, e Math.min(Infinity, cap) devolveria cap na mesma — mas
  // um NaN a montante passaria. Preferimos o tecto a qualquer duvida.
  return Number.isFinite(bruto) ? Math.min(capS, bruto) : capS;
}

/**
 * Cria o disjuntor. Guarda estado (quantas falhas seguidas, quando comecou o
 * apagao), mas nao toca em ficheiros: quem chama e que decide o que fazer com
 * os recibos devolvidos.
 */
export function createEngineBreaker({
  downAfter = ENGINE_DOWN_AFTER,
  baseS = BACKOFF_BASE_S,
  capS = BACKOFF_CAP_S,
} = {}) {
  let falhas = 0;
  let inicio = null;
  let aberto = false;

  return {
    /**
     * Observa o recibo de uma ronda e diz o que gravar e quanto esperar.
     *
     * @param {object} receipt recibo devolvido por `runRound`
     * @param {string} nowIso instante actual, ISO
     * @returns {{recibos: object[], backoffS: number, aberto: boolean}}
     *   `recibos` e o que deve ir para o ledger — pode ser vazio, e e esse o
     *   ponto: durante um apagao aberto nao se grava nada.
     */
    observe(receipt, nowIso) {
      const falhou = Boolean(receipt && receipt.falha_motor);

      if (!falhou) {
        const recibos = [];
        if (aberto) {
          const desde = Date.parse(inicio);
          const ate = Date.parse(nowIso);
          const bruto = Number.isFinite(desde) && Number.isFinite(ate)
            ? Math.round((ate - desde) / 1000)
            : null;
          // Uma duracao negativa nao e zero: e um relogio que nao bate. A
          // primeira versao fazia `Math.max(0, ...)` e o smoke test apanhou-a
          // a publicar `apagao_s: 0` para um apagao real — exactamente a classe
          // de metrica-que-mente que este runner existe para caçar. Sem numero
          // fiavel, `null` e a resposta honesta.
          const apagao = bruto === null || bruto < 0 ? null : bruto;
          recibos.push({
            ts: nowIso,
            evento: 'engine:up',
            usd: 0,
            inicio,
            fim: nowIso,
            apagao_s: apagao,
            rondas_engolidas: falhas,
            resultado_resumo: apagao === null
              ? `motor local de volta apos ${falhas} rondas falhadas (duracao n/d: relogios nao batem)`
              : `motor local de volta apos ${apagao}s em baixo (${falhas} rondas falhadas)`,
          });
        }
        falhas = 0;
        inicio = null;
        aberto = false;
        recibos.push(receipt);
        return { recibos, backoffS: 0, aberto: false };
      }

      falhas += 1;
      // UM relogio so. O `ts` do recibo vem do clock do `runRound`, que e outro
      // relogio: misturar os dois deu um `inicio` de um e um `fim` do outro, e
      // uma duracao sem sentido. O disjuntor mede-se a si proprio.
      if (falhas === 1) inicio = nowIso;
      const backoffS = backoffSeconds(falhas, { baseS, capS });

      // Abaixo do limiar, uma falha e sinal: um blip merece o seu recibo.
      if (falhas < downAfter) return { recibos: [receipt], backoffS, aberto: false };

      // Exactamente no limiar, UMA linha diz tudo o que ha para dizer.
      if (!aberto) {
        aberto = true;
        return {
          recibos: [{
            ts: nowIso,
            evento: 'engine:down',
            usd: 0,
            inicio,
            falhas_seguidas: falhas,
            resultado_resumo: `motor local em baixo desde ${inicio} — ${falhas} falhas seguidas, disjuntor aberto`,
            evidencia: String((receipt && receipt.resultado_resumo) || 'n/d').slice(0, 160),
          }],
          backoffS,
          aberto: true,
        };
      }

      // Disjuntor ja aberto: o ledger cala-se ate o motor voltar.
      return { recibos: [], backoffS, aberto: true };
    },

    /** Estado legivel, para o log e para os testes. */
    get estado() {
      return { falhas, inicio, aberto };
    },
  };
}
