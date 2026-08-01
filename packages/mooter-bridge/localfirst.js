'use strict';
/**
 * localfirst.js — mooter-bridge v1.4.1: decidir quando a GPU chega.
 *
 * A tese do produto é "local-first". A realidade medida em 2026-07-25 era
 * **0% de output local em 8 sessões** — porque o `classify.js` (FROZEN, e bem)
 * classifica o TEXTO do pedido e nada sabe sobre o que a máquina consegue
 * executar, e porque o tier local não tinha como ler ficheiros.
 *
 * Agora tem (`context.js`). Isso muda a fronteira: uma boa fatia do trabalho de
 * um vibe coder é ler-e-explicar, resumir, comparar, classificar, rascunhar —
 * tarefas que um 7B com o ficheiro à frente faz bem e de graça.
 *
 * ❌ O que este módulo NÃO faz: tocar no `classify.js`. Ele continua a decidir
 * o tier. Isto decide outra coisa, a seguir: **este trabalho, com este contexto,
 * cabe na máquina?** É uma pergunta que o classificador nunca teve dados para
 * responder.
 *
 * E nunca decide sozinho quando há risco: escrita, git, deploy e tudo o que
 * tenha efeito no disco vai para a nuvem, sempre. Poupar dinheiro nunca pode
 * custar correcção.
 */

// ── o que a GPU faz bem, com o ficheiro à frente ──────────────────────────
const BOM_PARA_LOCAL = [
  /\b(resum[ei]|resumo|sumariza|summariz)/i,
  /\b(explica|explique|o que faz|para que serve|como funciona)\b/i,
  /\b(lista|enumera|extrai|identifica)\b/i,
  /\b(classifica|categoriza|etiqueta)\b/i,
  /\b(traduz|reescreve|reformula|encurta)\b/i,
  /\b(compara|diferen[çc]a entre)\b/i,
  /\b(rascunho|esbo[çc]o|brainstorm|ideias para)\b/i,
  /\b(nomes? para|sugere)\b/i,
];

// ── o que NUNCA vai para local, por muito barato que fosse ────────────────
const SO_NUVEM = [
  /\b(escrev|edita|corrige|implementa|refactor|cria o ficheiro|apaga|remove)\b/i,
  /\b(git|commit|push|merge|rebase|branch|PR|pull request)\b/i,
  /\b(deploy|publica|lan[çc]a|migra)\b/i,
  /\b(corre os testes|npm|instala|build|compila)\b/i,
  /\b(audita|auditoria|seguran[çc]a|vulnerabilidad)/i,   // exige rigor, não velocidade
  /\b(arquitectura|arquitetura|desenha o sistema|decide)\b/i,
];

/**
 * Um 7B lida bem com contexto pequeno. Acima disto a qualidade cai a pique e o
 * "grátis" passa a ser uma resposta má de graça — que custa mais do que Sonnet.
 */
const CONTEXTO_MAX_LOCAL_CHARS = 18000;

/**
 * @returns {{local:boolean, porque:string, confianca:'alta'|'media'|'baixa'}}
 */
function cabeNoLocal({ goal, tier, contextoChars, temModeloLocal, escrita, vramLivreMb,
  motivoNaoLocal, modeloJaResidente, forcar }) {
  const texto = String(goal || '');

  if (escrita) {
    return { local: false, porque: 'o trabalho pode escrever ficheiros — isso vai sempre para a nuvem', confianca: 'alta' };
  }
  for (const re of SO_NUVEM) {
    if (re.test(texto)) {
      return { local: false, porque: 'é trabalho onde um erro custa caro (' + String(re).slice(2, 28).replace(/\\b|\)$/g, '') + '…)', confianca: 'alta' };
    }
  }
  if (contextoChars != null && contextoChars > CONTEXTO_MAX_LOCAL_CHARS) {
    return {
      local: false,
      porque: 'o contexto tem ' + Math.round(contextoChars / 1000) + 'k caracteres e um modelo local perde qualidade acima de '
        + Math.round(CONTEXTO_MAX_LOCAL_CHARS / 1000) + 'k',
      confianca: 'alta',
    };
  }
  if (motivoNaoLocal === 'falta_vram') {
    return {
      local: false,
      porque: 'nenhum modelo novo cabe sem consumir a folga mínima de VRAM',
      confianca: 'alta',
      motivo_nao_local: 'falta_vram',
      forcado_por_quota: false,
    };
  }
  if (!temModeloLocal) {
    return { local: false, porque: 'não há modelo local capaz de gerar texto', confianca: 'alta' };
  }
  if (!modeloJaResidente && vramLivreMb != null && vramLivreMb < 1500) {
    return {
      local: false,
      porque: 'só há ' + Math.round(vramLivreMb) + ' MB de VRAM livre',
      confianca: 'alta',
      motivo_nao_local: 'falta_vram',
      forcado_por_quota: false,
    };
  }

  /**
   * ── FORÇAR LOCAL (Onda 0.6, 2026-07-26) ─────────────────────────────────
   * A quota crítica calculava `forcar_local` e ninguém o lia — código a fingir
   * que decidia. Agora decide: com a quota no limite, o default "na dúvida,
   * nuvem" inverte-se para "na dúvida, GPU ($0)".
   * ⚠️ SÓ o default. Os vetos acima (escrita, git/deploy, contexto grande,
   * VRAM) já correram e continuam a mandar — poupar nunca pode custar correcção.
   */
  if (forcar) {
    return {
      local: true,
      porque: 'quota perto do limite: tudo o que a GPU consegue fazer vai para ela ($0); os vetos de risco continuam a valer',
      confianca: 'media',
      forcado_por_quota: true,
    };
  }

  const bom = BOM_PARA_LOCAL.find((re) => re.test(texto));
  if (bom) {
    return {
      local: true,
      porque: contextoChars ? 'é leitura-e-explicação e eu já li os ficheiros por ti' : 'é trabalho de linguagem que não precisa de ferramentas',
      confianca: 'alta',
    };
  }
  // T0 do classificador continua a mandar quando nada o contradiz
  if (String(tier || '').toUpperCase() === 'T0') {
    return { local: true, porque: 'o classificador deu T0 e nada aqui exige a nuvem', confianca: 'media' };
  }
  return { local: false, porque: 'não é claramente uma tarefa de linguagem simples — na dúvida, nuvem', confianca: 'media' };
}

/**
 * Quanto é que este job teria custado na nuvem — para o recibo.
 *
 * ⚠️ É uma ESTIMATIVA e diz-se que é. A tabela vem do repo (advisory) e a
 * contagem de tokens é aproximada (~4 chars/token). Nunca apresentar isto como
 * custo medido: o produto inteiro assenta em não confundir as duas coisas.
 */
const PRECO_POR_1M = { haiku: [1, 5], sonnet: [3, 15], opus: [5, 25] };

function poupancaEstimada(promptChars, outputChars, tierEvitado) {
  const t = String(tierEvitado || 'sonnet').toLowerCase();
  const p = PRECO_POR_1M[t] || PRECO_POR_1M.sonnet;
  const tin = Math.round((promptChars || 0) / 4);
  const tout = Math.round((outputChars || 0) / 4);
  const usd = (tin * p[0] + tout * p[1]) / 1e6;
  return {
    usd_estimado: Number(usd.toFixed(6)),
    tokens_in_estimados: tin,
    tokens_out_estimados: tout,
    baseline: t,
    /**
     * ⚠️ Auditoria E2E 2026-08-01 — a nota tinha de dizer o que o número É.
     *
     * `tokens_out_estimados` = `outputChars / 4` = os tokens que o modelo LOCAL
     * escreveu. Não são tokens que a nuvem deixou de gastar. `prepMetrics`
     * (seamless.js) só chama esta função no ramo da CADEIA moo→nuvem — e nessa
     * cadeia o job pago **corre à mesma**: a saída local é COLADA no prompt dele,
     * não o substitui.
     *
     * Medido no ledger real: prompts pagos precedidos de preparação local são
     * MAIORES que os sem (mediana 2774 vs 2601 chars), e a preparação acrescenta
     * ~16% ao tempo de parede da cadeia.
     *
     * A fórmula continua válida para um job **só-moo** (o local substitui a nuvem
     * de facto). O que estava errado era a nota deixar passar a leitura de
     * "poupança líquida" num caso onde ela é, por construção, zero. Ver G12 do
     * MEO_GAUNTLET: o número está certo, o que ele afirma é que não estava.
     */
    nota: 'ESTIMATIVA (~4 chars/token, tabela advisory do repo) — é o VOLUME QUE O MODELO LOCAL PRODUZIU, '
      + 'não uma poupança líquida medida. Numa cadeia moo→nuvem o job pago corre à mesma e recebe este texto '
      + 'no prompt: aí a poupança líquida é n/d. Só num job só-local o volume equivale a nuvem evitada.',
  };
}

module.exports = { cabeNoLocal, poupancaEstimada, BOM_PARA_LOCAL, SO_NUVEM, CONTEXTO_MAX_LOCAL_CHARS };
