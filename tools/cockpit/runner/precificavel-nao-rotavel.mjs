/**
 * precificavel-nao-rotavel.mjs
 *
 * O invariante que este modulo vigia esta escrito por extenso no SSOT vivo,
 * `tools/router/pricing.js:62-64`:
 *
 *     // Fable 5 carries NO `tier`: T5 is opt-in only via `@fable` and must never
 *     // be reachable by tier-based selection. A price without a tier is exactly
 *     // "priceable, not routable".
 *
 * O `CLAUDE.md` diz o mesmo do lado da doutrina: T5 e opt-in **so** via `@fable`
 * e NUNCA e auto-encaminhado. A ausencia do campo `tier` no SSOT e a forma como
 * essa regra esta escrita nos dados.
 *
 * ── PORQUE ESTE FICHEIRO EXISTE (e nao e o `frescura-de-precos.mjs`) ─────────
 *
 * O `frescura-de-precos.mjs` mede se o snapshot MENTE sobre o preco. Este mede
 * se o snapshot torna ROTAVEL um modelo que o SSOT declarou nao-rotavel. Sao
 * perguntas diferentes e a segunda nao se deduz da primeira: um snapshot pode
 * estar perfeitamente sincronizado com o SSOT no preco e, exactamente por isso,
 * partir o invariante.
 *
 * ── A MEDICAO QUE ORIGINOU ISTO (2026-08-25, missao de fecho do Mac) ─────────
 *
 * O plano que chegou dizia: "remover o campo `tier` do fable-5 no snapshot
 * (deixa de ser ordenavel por custo) e so entao precifica-lo do SSOT". As duas
 * metades foram medidas contra o motor real, nao discutidas:
 *
 *   (a) `decideAgent({task_category:"reasoning.science"})` hoje devolve
 *       `chosen_model: null`. Nao e o `tier` que o impede — e o preco ausente:
 *       "you cannot rank what you cannot price" (decide-agent.ts).
 *   (b) Removido o `tier` E posto o preco de $10/$50 do SSOT, a MESMA chamada
 *       passou a devolver `chosen_model: "claude-fable-5"`, TES 3784, sem
 *       ninguem ter escrito `@fable` em lado nenhum.
 *
 * Duas conclusoes, ambas medidas:
 *
 *   1. "deixa de ser ordenavel por custo" e FALSO. O campo `tier` so alimenta o
 *      proxy heuristico usado quando NAO ha score medido (decide-agent.ts:104-119).
 *      A ordenacao por TES depende de PRECO, nunca de tier.
 *   2. Remover o campo tem um efeito colateral que o plano nao previa:
 *      `tierForModel()` devolve `"T2"` por omissao para um modelo sem tier
 *      (decide-agent.ts:101). Retirar `"T5"` nao apaga o tier — troca uma
 *      etiqueta verdadeira por uma falsa, e passa a haver superficies a dizer
 *      `tier-heuristic:T2` sobre o Fable.
 *
 * Porque e que o fable e escolhivel de todo: ESTA no roster (`MATRIX_MODELS`) e
 * tem uma celula medida real — `reasoning.science`, 0.946, GPQA Diamond
 * (`data/benchmark-seed-2026.json`). Nessa categoria e o UNICO modelo com score
 * medido; todos os outros sao heuristicos e portanto nao-ordenaveis. Basta-lhe
 * um preco para ganhar a categoria inteira sozinho.
 *
 * ── ONDE O INVARIANTE DEVIA VIVER, E PORQUE VIVE AQUI ────────────────────────
 *
 * O sitio certo e uma exclusao explicita dentro do `decideAgent`. Nao ha
 * nenhuma: verificado por grep, o motor nao conhece "T5" a nao ser como mais um
 * valor da tabela heuristica. Mas `packages/router/src/decide-agent.ts` e um
 * ficheiro de motor congelado — o allowlist de Wave 58 no `CLAUDE.md` autoriza
 * ADICOES a `packages/router/src/`, "new files only — no existing engine file
 * is modified". Alterar o motor exige uma entrada nova de allowlist e a
 * autorizacao do dono, que nao existe hoje.
 *
 * Entao isto e o que da para fazer sem mentir: um ARAME que dispara no CI no
 * instante em que a violacao se tornaria possivel. Nao impede o motor de
 * escolher o Fable — declara, mecanicamente, que a condicao para ele o escolher
 * passou a estar reunida. E divida assumida, nao correccao.
 *
 * ── A REGRA, EM UMA LINHA ────────────────────────────────────────────────────
 *
 * Um modelo e auto-escolhivel pelo `decideAgent` quando tem (i) uma celula
 * medida com score numerico e (ii) um preco no snapshot. Nada mais. Logo: um
 * modelo que o SSOT declarou nao-rotavel nunca pode ter as duas coisas ao mesmo
 * tempo.
 *
 * Funcoes puras: recebem os objectos ja lidos, nao tocam no disco, nunca atiram.
 */

/**
 * Modelos que o SSOT vivo PRECIFICA mas deixa sem `tier` — "priceable, not
 * routable". Modelos gratis (preco 0) ficam de fora: um local sem tier nao e
 * uma declaracao de nao-routabilidade, e so uma entrada incompleta.
 *
 * Conservador de proposito: apanha tambem as entradas legadas de compatibilidade
 * de logs (`claude-opus-4`, `claude-sonnet-4`, `claude-haiku-3-5`), que tambem
 * nao tem tier. Isso e a resposta certa — nenhuma delas devia ser rotavel — e o
 * custo de as incluir e zero enquanto o snapshot nao as carregar.
 */
export function semTierNoSsot(precosVivos) {
  const out = [];
  for (const [modelo, v] of Object.entries(precosVivos ?? {})) {
    if (!v || typeof v !== 'object') continue;
    if (v.tier) continue;
    if (v.input == null || v.output == null) continue;
    if (v.input === 0 && v.output === 0) continue; // local/gratis: outra classe
    out.push(modelo);
  }
  return out;
}

/** True se a entrada do snapshot tem um preco de entrada utilizavel. */
function temPreco(entrada) {
  return !!entrada && entrada.input_per_mtok != null;
}

/** True se o modelo tem pelo menos uma celula MEDIDA com score numerico. */
export function temScoreMedido(celulas, modelo) {
  for (const c of celulas ?? []) {
    if (c?.model === modelo && c?.measured === true && typeof c?.score === 'number') return true;
  }
  return false;
}

/**
 * A pergunta do dono: um modelo sem `tier` no SSOT que GANHA `tier` no snapshot.
 *
 * A divergencia em si nao e proibida — a medicao acima mostra que apagar o campo
 * do snapshot troca "T5" (verdade) por "T2" (omissao do `tierForModel`), o que e
 * pior. O que e proibido e a divergencia SILENCIOSA. Segue-se a convencao que o
 * proprio snapshot ja usa para o preco retido (`pricing_withheld_reason`): uma
 * excepcao escrita nos dados le-se; uma escondida no gate apodrece sem ninguem
 * ver. Declarar exige o campo `tier_diverges_from_ssot`.
 */
export function tiersNaoDeclarados(snapshot, precosVivos) {
  const semTier = new Set(semTierNoSsot(precosVivos));
  const out = [];
  for (const [modelo, v] of Object.entries(snapshot?.models ?? {})) {
    if (!semTier.has(modelo)) continue;
    if (!v?.tier) continue;
    if (v.tier_diverges_from_ssot) continue; // divergencia declarada nos dados
    out.push({ modelo, tier_no_snapshot: v.tier });
  }
  return out;
}

/**
 * O invariante a serio: modelos que o SSOT declarou nao-rotaveis e que o
 * snapshot ja poe em condicoes de serem escolhidos automaticamente.
 *
 * Deliberadamente NAO se aplica aqui o `min_score` por omissao (0.75): quem
 * chama o `decideAgent` pode baixa-lo. Um arame que so dispara na configuracao
 * por omissao nao e um arame.
 */
export function rotaveisPorEngano(snapshot, precosVivos, celulas) {
  const out = [];
  for (const modelo of semTierNoSsot(precosVivos)) {
    const entrada = snapshot?.models?.[modelo];
    if (!temPreco(entrada)) continue;              // sem preco: nao ordenavel por TES
    if (!temScoreMedido(celulas, modelo)) continue; // sem score medido: nao ordenavel por TES
    out.push({
      modelo,
      preco_no_snapshot: { input: entrada.input_per_mtok, output: entrada.output_per_mtok },
      porque: 'tem celula medida E preco no snapshot — reune as duas condicoes que o '
        + 'decideAgent exige para ordenar por TES e escolher, sem "@fable"',
    });
  }
  return out;
}

/** Relatorio unico, para o teste e para quem quiser imprimir. */
export function auditarRota(snapshot, precosVivos, celulas) {
  return {
    sem_tier_no_ssot: semTierNoSsot(precosVivos),
    tiers_nao_declarados: tiersNaoDeclarados(snapshot, precosVivos),
    rotaveis_por_engano: rotaveisPorEngano(snapshot, precosVivos, celulas),
  };
}
