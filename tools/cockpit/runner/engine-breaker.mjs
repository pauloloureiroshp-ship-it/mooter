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
/**
 * De que morreu a ronda. So o motor abre um `engine:down`; um poco seco e um
 * `pilar:esgotado`, e uma ronda que rebentou e um `ronda:falha`.
 */
export function classeDaFalha(receipt) {
  if (receipt && receipt.falha_motor) return 'motor';
  if (receipt && receipt.esgotado) return 'esgotado';
  return 'ronda';
}

const EVENTOS = {
  motor: { baixo: 'engine:down', cima: 'engine:up', diz: 'motor local em baixo' },
  esgotado: { baixo: 'pilar:esgotado', cima: 'pilar:retomado', diz: 'nada por rever — o poco secou' },
  ronda: { baixo: 'ronda:falha', cima: 'ronda:ok', diz: 'a ronda rebentou' },
};

export function createEngineBreaker({
  downAfter = ENGINE_DOWN_AFTER,
  baseS = BACKOFF_BASE_S,
  capS = BACKOFF_CAP_S,
} = {}) {
  let falhas = 0;
  // A CLASSE da falha que domina esta sequencia. O disjuntor trava bem, mas o
  // nome do evento tem de dizer a verdade: medido a 2026-08-18 no ledger vivo,
  // com o motor a responder HTTP 200 e dois pilares com o poco seco, saiu
  // `engine:down — motor local em baixo`. Travar era certo; o rotulo era uma
  // mentira, e da mesma familia das que este runner existe para caçar.
  let classe = 'motor';
  let inicio = null;
  let aberto = false;
  // As rondas que o ledger NAO registou. Nao e o mesmo que `falhas`: as
  // primeiras falhas de uma sequencia sao gravadas na mesma, e dizer que foram
  // engolidas era inflacionar o numero no proprio recibo que o publica.
  let engolidas = 0;

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
      // Uma violacao do $0 DURO NUNCA e silenciada, aconteca o que acontecer ao
      // disjuntor. E a promessa central do runner: se ela cair, o dono tem de
      // ver a linha, nao um silencio educado.
      if (receipt && receipt.violacao_zero) {
        return { recibos: [receipt], backoffS: backoffSeconds(falhas, { baseS, capS }), aberto };
      }

      // Tri-estado, de proposito. `motor_ok === true` e prova POSITIVA de que o
      // motor respondeu — a unica coisa que fecha o disjuntor. Uma ronda que
      // rebentou, ou que o dono abortou, nao prova nada: nao fecha, nao mente.
      const saudavel = Boolean(receipt && receipt.motor_ok === true);
      // FAIL-CLOSED, pela mesma razao que `isStopped` so aceita ENOENT como
      // prova de ausencia: a UNICA coisa neutra e uma paragem que o DONO pediu.
      // Tudo o resto que nao prova sucesso e falha. A versao anterior tratava
      // como neutro qualquer recibo sem bandeira, e media-se: 200 rondas dessas
      // davam 200 linhas com backoff ZERO, enquanto 200 com bandeira davam 3.
      const paradoPeloDono = Boolean(receipt && receipt.parado_pelo_dono);
      const falhouRonda = !saudavel && !paradoPeloDono;
      // Uma paragem pedida pelo dono passa ao lado do disjuntor sem o fechar.
      // Fechar aqui foi o que produziu um `engine:up` com `apagao_s: 330`
      // enquanto o motor continuava morto.
      if (paradoPeloDono) {
        return { recibos: [receipt], backoffS: aberto ? backoffSeconds(falhas, { baseS, capS }) : 0, aberto };
      }

      if (saudavel) {
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
            evento: EVENTOS[classe].cima,
            usd: 0,
            inicio,
            fim: nowIso,
            apagao_s: apagao,
            rondas_engolidas: engolidas,
            classe,
            resultado_resumo: apagao === null
              ? `${EVENTOS[classe].cima} apos ${falhas} rondas falhadas, ${engolidas} nao gravadas (duracao n/d: relogios nao batem)`
              : `${EVENTOS[classe].cima} apos ${apagao}s (${falhas} rondas falhadas, ${engolidas} nao gravadas)`,
          });
        }
        falhas = 0;
        classe = 'motor';
        inicio = null;
        aberto = false;
        engolidas = 0;
        recibos.push(receipt);
        return { recibos, backoffS: 0, aberto: false };
      }

      falhas += 1;
      // UM relogio so. O `ts` do recibo vem do clock do `runRound`, que e outro
      // relogio: misturar os dois deu um `inicio` de um e um `fim` do outro, e
      // uma duracao sem sentido. O disjuntor mede-se a si proprio.
      if (falhas === 1) {
        inicio = nowIso;
        classe = classeDaFalha(receipt);
      }
      const backoffS = backoffSeconds(falhas, { baseS, capS });

      // Abaixo do limiar, uma falha e sinal: um blip merece o seu recibo.
      if (falhas < downAfter) return { recibos: [receipt], backoffS, aberto: false };

      // Exactamente no limiar, UMA linha diz tudo o que ha para dizer.
      if (!aberto) {
        aberto = true;
        return {
          recibos: [{
            ts: nowIso,
            evento: EVENTOS[classe].baixo,
            usd: 0,
            classe,
            inicio,
            falhas_seguidas: falhas,
            resultado_resumo: `${EVENTOS[classe].diz} desde ${inicio} — ${falhas} falhas seguidas, disjuntor aberto`,
            evidencia: String((receipt && receipt.resultado_resumo) || 'n/d').slice(0, 160),
          }],
          backoffS,
          aberto: true,
        };
      }

      // Disjuntor ja aberto: o ledger cala-se ate o motor voltar.
      engolidas += 1;
      return { recibos: [], backoffS, aberto: true };
    },

    /** Estado legivel, para o log e para os testes. */
    get estado() {
      return { falhas, classe, inicio, aberto, engolidas };
    },
  };
}
