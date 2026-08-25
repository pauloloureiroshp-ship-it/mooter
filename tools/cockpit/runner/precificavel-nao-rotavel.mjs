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
 * ── O ARAME PAGOU-SE: 2026-08-25, o invariante mudou-se para o motor ─────────
 *
 * Ate essa data este ficheiro dizia, por extenso, que o sitio certo era uma
 * exclusao dentro do `decideAgent` e que ela nao existia — verificado por grep,
 * o motor nao conhecia "T5" a nao ser como mais um valor da tabela heuristica.
 * O que faltava nao era a ideia, era a autorizacao: `decide-agent.ts` e motor
 * congelado, e o allowlist de Wave 58 so cobria ficheiros NOVOS.
 *
 * O dono autorizou a entrada de allowlist a 2026-08-25 e a exclusao existe:
 * `OPT_IN_ONLY_MODELS` / `isOptInOnly()` em `decide-agent.ts`, aplicada ANTES
 * dos portoes de `min_score` e de orcamento. Medido depois de a por la, com o
 * Fable ja precificado a $10/$50 no snapshot: 0 das 24 categorias o escolhem;
 * com a exclusao desligada, `reasoning.science` devolve-o com TES 3784.
 *
 * Isso muda a PERGUNTA deste modulo, e por isso ele nao foi apagado:
 *
 *   ANTES  "nenhum modelo nao-rotavel pode reunir preco + score medido"
 *          — uma proibicao sobre os DADOS, que so se podia cumprir mantendo o
 *          snapshot incompleto. Cumpria-se por omissao.
 *
 *   AGORA  "todo o modelo que reune preco + score medido e esta declarado
 *          nao-rotavel no SSOT tem de estar coberto pela guarda do motor"
 *          — uma exigencia sobre o CODIGO. Os dados podem finalmente estar
 *          completos.
 *
 * A prova COMPORTAMENTAL (o motor recusa mesmo) vive onde o motor corre:
 * `packages/router/tests/decide-agent.test.ts`. Este ficheiro guarda o flanco
 * que essa suite nao ve — um modelo NOVO que chegue a condicao de violacao sem
 * ninguem se ter lembrado de o cobrir.
 *
 * ── A REGRA, EM UMA LINHA ────────────────────────────────────────────────────
 *
 * Um modelo e auto-escolhivel pelo `decideAgent` quando tem (i) uma celula
 * medida com score numerico, (ii) um preco no snapshot e (iii) NAO estar
 * coberto pela guarda de opt-in-only. Um modelo que o SSOT declarou
 * nao-rotavel nunca pode ter as tres coisas ao mesmo tempo.
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

// ── a guarda do motor, lida do motor ────────────────────────────────────────

/**
 * O roster `OPT_IN_ONLY_MODELS` declarado em `decide-agent.ts`, lido da FONTE.
 *
 * Ler o codigo em vez de o importar e deliberado: o motor e TypeScript e este
 * modulo corre em `node --test` sem tsx. A alternativa — copiar a lista para
 * aqui — criava uma segunda verdade sobre quem e opt-in-only, que e exactamente
 * a classe de defeito que este ficheiro existe para apanhar.
 *
 * Devolve `null` quando nao consegue ler ou nao encontra a declaracao. `null`
 * NAO e "lista vazia": quem chama tem de tratar os dois casos de forma
 * diferente, senao a guarda desaparecer parece a guarda nao cobrir ninguem.
 */
export function rosterOptInOnly(fonteDecideAgent) {
  if (typeof fonteDecideAgent !== 'string') return null;
  const m = /OPT_IN_ONLY_MODELS\s*:\s*readonly\s+string\[\]\s*=\s*\[([^\]]*)\]/.exec(fonteDecideAgent);
  if (!m) return null;
  const ids = [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
  return ids;
}

/**
 * Dos modelos que REUNEM as duas condicoes de rotabilidade, quais e que a
 * guarda do motor NAO cobre.
 *
 * Cobre-se por qualquer uma das duas vias que o `isOptInOnly()` usa — o roster
 * nomeado OU `tier: "T5"` no snapshot. Aceitar as duas aqui nao e frouxidao: e
 * espelhar a guarda real. Um portao que exigisse so uma delas acusaria como
 * violacao um estado que o motor recusa na mesma.
 */
export function semGuardaNoMotor(rotaveis, roster, snapshot) {
  const nomeados = new Set(roster ?? []);
  const out = [];
  for (const r of rotaveis ?? []) {
    const modelo = typeof r === 'string' ? r : r.modelo;
    if (nomeados.has(modelo)) continue;
    if (snapshot?.models?.[modelo]?.tier === 'T5') continue;
    out.push(modelo);
  }
  return out;
}

/** Relatorio unico, para o teste e para quem quiser imprimir. */
export function auditarGuarda(snapshot, precosVivos, celulas, fonteDecideAgent) {
  const rotaveis = rotaveisPorEngano(snapshot, precosVivos, celulas);
  const roster = rosterOptInOnly(fonteDecideAgent);
  return {
    rotaveis,
    roster,
    // `null` propaga-se: sem roster legivel nao se pode dizer que alguem esta
    // coberto, e o teste tem de falhar por AI, nao por lista vazia.
    sem_guarda: roster === null ? null : semGuardaNoMotor(rotaveis, roster, snapshot),
  };
}
