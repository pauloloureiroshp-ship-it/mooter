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

/**
 * LATÊNCIA — medida a 2026-08-27, e está aqui porque o site publicava dois
 * números que nenhuma medição produzia.
 *
 * O que estava no ar:
 *   `page.tsx:15`            → "<50ms overhead"
 *   `compare/page.tsx:31`    → "✓ 14ms p50"
 *   `HeroTerminal.tsx:32`    → classify: "14ms"
 *   `TwoTerminalDemo.tsx:327`→ classify 14ms
 *
 * O `14ms` aparecia como literal em três ficheiros e **nenhum o ligava a uma
 * medição** — apesar de existir um medidor real no repo desde sempre
 * (`tools/router/bench-hook.js`). Corrido hoje, 200 amostras: **p50 177,1 ms**.
 * O `14` não é nem uma coisa nem outra; está no meio, sem origem.
 *
 * E o "<50ms **overhead**" trocava duas grandezas diferentes:
 *
 *   classify() sozinho   p50 0,001 ms   ← a função. Regex puro, sem processo.
 *   o hook inteiro       p50 177,1 ms   ← o que o utilizador espera de facto.
 *
 * A diferença é quase toda o `spawn` de um processo Node — o próprio
 * `bench-hook.js:109` imprime "ms/sample **incl. spawn**". Chamar 177 ms de
 * "50 ms" seria uma alegação; chamar 0,001 ms de "overhead" seria outra, ao
 * contrário. Publicam-se os dois, cada um com o seu denominador.
 *
 * O número honesto é melhor do que o inventado: 0,001 ms é mil vezes menos do
 * que o "<50ms" que se afirmava sem medir.
 */
export const LATENCIA = {
  /** `classify()` em processo, 5.000 chamadas após aquecimento, sem spawn. */
  classifyP50Ms: 0.001,
  classifyP99Ms: 0.010,
  classifyAmostras: 5000,
  /** O hook completo via `node inject_context.js`, 200 amostras. Inclui o spawn. */
  hookP50Ms: 177.1,
  hookP95Ms: 231.3,
  hookAmostras: 200,
  /**
   * E o melhor número de todos, porque não é um bench — é o que aconteceu.
   * `~/.claude/tools/router/decisions.log` regista `classify_ms` em cada prompt
   * real. 660 amostras de sessões a sério, lidas a 2026-08-27:
   *   p50 121,6 ms · p95 173,1 ms · min 0,8 ms · max 325,9 ms
   * Fica **abaixo** do bench (177,1) porque o bench paga um spawn frio a cada
   * amostra e as sessões reais aproveitam ficheiros já em cache do SO.
   * Publica-se este quando se fala do que o utilizador sente, e o do
   * `classify()` quando se fala do classificador. Nunca os dois trocados.
   */
  realP50Ms: 121.6,
  realP95Ms: 173.1,
  realAmostras: 660,
  fonte: 'decisions.log (660 prompts reais) + tools/router/bench-hook.js (200) + classify() em processo (5.000) — 2026-08-27, 1 máquina',
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
  /* ⚠️ EM INGLÊS, e a razão não é estilo.
     Estas duas strings são renderizadas na home — `page.tsx:79` — que é uma
     página em inglês. Estiveram em PORTUGUÊS em produção: quem abrisse
     mooter.ai lia «Nenhum token é registado, por isso não há valor em dólares
     medido» a meio de um parágrafo inglês.
     E era precisamente a frase que existe para provar honestidade. Uma ressalva
     que o leitor não entende não é uma ressalva — é ruído que faz duvidar de
     tudo o resto na página. Medido no HTML servido por mooter.ai a 2026-08-27.
     O resto deste ficheiro fica em PT: são comentários, e o canon do repo é
     conversa em PT, código e superfície pública em EN. */

  /** A frase inteira. É deliberadamente longa: encurtá-la perde a condição. */
  frase: `The router recommended a local or cheap tier for ${RECOMENDACAO.paraTierBarato} of ${RECOMENDACAO.promptsClassificados} classified prompts (${recomendadoBaratoPct}%). In those same sessions, of the ${EXECUCAO.chamadas} recorded executions, ${EXECUCAO.emOpus} ran on Opus and ${EXECUCAO.local} ran locally.`,
  /** Latencia, com a unidade e o denominador colados — ver LATENCIA acima. */
  classifyP50: `${LATENCIA.classifyP50Ms} ms`,
  hookP50: `${LATENCIA.hookP50Ms} ms`,
  latenciaFrase: `Classification itself is ${LATENCIA.classifyP50Ms} ms p50 (${LATENCIA.classifyAmostras} in-process calls). What you actually wait for is the hook: ${LATENCIA.realP50Ms} ms p50 across ${LATENCIA.realAmostras} real prompts — almost all of it spawning a Node process, not deciding.`,
  /** A ressalva. Vai a par com a frase, sempre. */
  ressalva: 'No tokens are logged, so there is no measured dollar figure — and we publish none.',
} as const;
