// canonical-metrics.ts — a ÚNICA fonte do que esta landing pode afirmar.
//
// ─────────────────────────────────────────────────────────────────────────────
// REESCRITO A 2026-08-23, e a razão importa mais que o conteúdo.
//
// A versão anterior derivava tudo de três primitivos — `routedCalls: 658`,
// `allOpusBaselineUsd: 48.9`, `mooterPaidUsd: 25.95` — sob um comentário
// intitulado "HONESTY" que explicava com cuidado como um valor PAGO nunca podia
// aparecer com a etiqueta POUPADO.
//
// O cuidado era real. O problema era outro: **os três primitivos eram literais
// que nenhum script regenerava.** Ninguém sabia de que medição vinham, nem de
// quando. Um SSOT bem construído em cima de números que ninguém consegue
// reproduzir continua a ser uma alegação, só que com melhor arquitectura.
//
// Uma auditoria de 5 agentes encontrou CINCO números de poupança em circulação
// neste projecto, todos a contradizerem-se: 0% · 49,9% · 62,7% · 83,2% · 89,9%.
// Nenhum sobreviveu. Os defeitos, um a um:
//
//   0%     — o denominador eram chamadas Bash, não prompts (26 por prompt)
//   49,9%  — `d.tier || 'T3'` sem filtro de evento; o mesmo prompt contado 3×
//   62,7%  — é a quota de linhas T0, não um custo
//   83,2%  — bem formado, mas mede a RECOMENDAÇÃO, e ela não é executada
//   89,9%  — corpus de 16 de Abril, escrito à mão, nenhum código o produz
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE PODEMOS AFIRMAR, e nada mais.
//
// Tudo aqui em baixo foi contado a 2026-08-23 a partir de `decisions.log` e
// `execution.log`. Cada campo traz o seu denominador porque um número sem
// denominador é a coisa que este projecto passou a semana a desligar.
//
// A regra: se não foi medido, **não existe uma constante para isso**. Não há
// `savedPct` neste ficheiro. Não é um esquecimento — é a conclusão.

/** Janela exacta de que TODOS os números abaixo foram tirados. */
export const JANELA = {
  de: '2026-08-20T14:53Z',
  ate: '2026-08-23T17:15Z',
  fonte: 'decisions.log + execution.log, uma máquina, sessões reais',
} as const;

/**
 * O que o classificador RECOMENDOU. É comportamento medido do router.
 *
 * `promptsClassificados` conta só linhas com `event === 'classified'`. O
 * backtest não filtrava por evento e por isso contava `turn_end` e
 * `option_a_hit` como prompts — foi assim que 123 viraram 374.
 */
export const RECOMENDACAO = {
  promptsClassificados: 123,
  /** Destes, quantos o classificador mandou para tier local ou barato. */
  paraTierBarato: 101,
} as const;

/**
 * O que REALMENTE correu, nas mesmas sessões. Este é o número desconfortável e
 * é por isso que ele está aqui: sem ele, a recomendação lê-se como resultado.
 */
export const EXECUCAO = {
  chamadas: 3225,
  emOpus: 3193,
  local: 1,
} as const;

/**
 * O que NÃO é medido, escrito para que ninguém volte a preencher o vazio com um
 * palpite. Zero das 4.534 linhas de telemetria têm contagem de tokens — logo
 * qualquer valor em dólares é MODELADO a partir do comprimento do prompt, e
 * modelado não é medido.
 */
export const NAO_MEDIDO = {
  tokens: 'nenhum ficheiro de telemetria regista tokens_in/tokens_out',
  dolares: 'sem tokens não há custo medido; qualquer $ seria estimativa',
  poupanca: 'sem custo medido não há poupança medida — em nenhuma unidade',
} as const;

const pct = (n: number, d: number): number => Math.round((n / d) * 1000) / 10;

/** 82,1% — a percentagem de prompts que o router mandou para tier barato. */
export const recomendadoBaratoPct: number = pct(RECOMENDACAO.paraTierBarato, RECOMENDACAO.promptsClassificados);
/** 0,03% — a percentagem de execuções que de facto correram localmente. */
export const executadoLocalPct: number = pct(EXECUCAO.local, EXECUCAO.chamadas);

/**
 * Rótulos pré-formatados. Cada um diz o que É, com a sua unidade e o seu
 * denominador colados — para que copiar um destes para outra superfície não
 * consiga separar o número da sua condição.
 */
export const M = {
  promptsClassificados: String(RECOMENDACAO.promptsClassificados),
  recomendadoBaratoPct: `${recomendadoBaratoPct}%`,
  recomendadoBarato: `${RECOMENDACAO.paraTierBarato}/${RECOMENDACAO.promptsClassificados}`,
  execucoes: String(EXECUCAO.chamadas),
  execucoesLocal: String(EXECUCAO.local),
  execucoesOpus: String(EXECUCAO.emOpus),
  /** A frase inteira. É deliberadamente longa: encurtá-la perde a condição. */
  frase: `O router recomendou tier local ou barato em ${RECOMENDACAO.paraTierBarato} de ${RECOMENDACAO.promptsClassificados} prompts classificados (${recomendadoBaratoPct}%). Nas mesmas sessões, das ${EXECUCAO.chamadas} execuções registadas, ${EXECUCAO.emOpus} correram em Opus e ${EXECUCAO.local} correu localmente.`,
  /** A ressalva. Vai a par com a frase, sempre. */
  ressalva: 'Nenhum token é registado, por isso não há valor em dólares medido — e não publicamos nenhum.',
} as const;
