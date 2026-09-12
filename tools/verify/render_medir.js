#!/usr/bin/env node
// render_medir.js — o verificador in-path: RENDERIZA o que um motor devolveu e
// MEDE-o contra quatro critérios, antes de alguém lhe chamar trabalho feito.
//
// ═════════════════════════════════════════════════════════════════════════════
// PORQUE ESTE FICHEIRO EXISTE
//
// O F3 do masterprompt de 2026-08-31 manda «copiar `tools/verify/render_medir.js`
// do `_handoff`», com o critério «o rascunho B do round 1 sai fail com os 4
// critérios certos». Nada disso existia. Busca exaustiva a 2026-09-01, citada:
//
//   · `render_medir` em todo o histórico git, na home inteira e no vault → a
//     ÚNICA ocorrência é o `SYNC.md`, na linha que diz que ele nunca existiu;
//   · `tools/verify/` não existe;
//   · não há «rascunho B», não há «round 1», não há duelo registado —
//     `_handoff/duelo-2026-08-31/` tem só o F1 (o probe, escrito no dia anterior
//     pela mesma razão).
//
// Logo o critério de aceitação original é **inverificável**, e foi substituído —
// não por conveniência, mas porque a palavra «rascunho» tem neste repo um
// significado MEDIDO, e ele dá o critério de volta com juros. Ver C1.
//
// ═════════════════════════════════════════════════════════════════════════════
// O QUE ESTE FICHEIRO NÃO FAZ (e é a parte importante)
//
// Não implementa critérios. Compõe quatro verificadores que já existem, cada um
// nascido de um defeito medido neste repo. Reimplementá-los seria criar a
// segunda verdade que eles próprios existem para eliminar:
//
//   · `evidence-verifier.mjs` — a citação aponta para código real, dentro da
//     janela mostrada? Nasceu de **174 achados alucinados contados como
//     trabalho**, porque o protótipo carimbava todo o recibo `nao-verificado`.
//   · `refutador.mjs` — quem julga não é quem produziu. Nasceu de **62 achados
//     do P4 com `citacao-ok` dos quais 0 de 78 eram verdade**: citar bem uma
//     linha e mentir sobre ela é um par perfeitamente possível, e era invisível.
//   · `runner-core.mjs` (#450) — o texto medido é `response`, nunca `thinking`.
//     **0% → 83%**, com duas linhas.
//   · `naoCorreu()` — uma ronda que nunca chegou ao modelo não é uma resposta
//     má. **209 de 275 `sem-citacao` (76%)** eram isto, e o painel contava-as
//     como o modelo a falhar.
//
// Este ficheiro é a cola, e a cola tem de ser fina. Se alguma vez crescer para
// dentro de um destes, está errado.
//
// ═════════════════════════════════════════════════════════════════════════════
// «RENDER» — porque o veredicto tem de ser LIDO, não só devolvido
//
// Todos os verificadores acima devolvem JSON para máquinas. O fosso declarado
// deste projecto (CLAUDE.md) é «an auditable receipt and adversarial
// verification (critic ≠ author) **on work a non-dev can check**». O dono não
// é dev. Um veredicto que só uma máquina lê não fecha esse fosso.
//
// Daí `imprimir()`: cada critério sai com o que foi medido, contra que limiar, e
// a prova. Um `n/d` sai com a razão por extenso. Nunca um ✓ sem número atrás.
//
// ═════════════════════════════════════════════════════════════════════════════
// n/d NÃO É FALHA, E FALHA NÃO É n/d
//
// A distinção custou caro duas vezes neste repo (as 209 rondas fantasma; o
// `codex_quota: 0%` que vinha de um orçamento local). Aqui é estrutural:
//
//   passa   — medido, dentro do limiar
//   falha   — medido, fora do limiar          → bloqueia
//   n/d     — NÃO medido, com a razão escrita → nunca bloqueia, nunca é verde
//
// Um veredicto só é `conforme` com os quatro em `passa`. Um `n/d` produz
// `indeciso`, jamais `nao-conforme`: não medir não é reprovar.
//
// ═════════════════════════════════════════════════════════════════════════════
// Uso:
//   node tools/verify/render_medir.js <resultado.json>
//   node tools/verify/render_medir.js <resultado.json> --json
//
// Exits:  0 conforme · 3 indeciso (não medi) · 4 não-conforme (chumbou)
//
// Nunca lança. Um verificador que rebenta deixa o chamador sem veredicto, que é
// pior do que um `n/d` honesto.

'use strict';

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário
// ─────────────────────────────────────────────────────────────────────────────

const ESTADO = Object.freeze({ PASSA: 'passa', FALHA: 'falha', ND: 'n/d' });

const VEREDICTO = Object.freeze({
  CONFORME: 'conforme',
  NAO_CONFORME: 'nao-conforme',
  INDECISO: 'indeciso',
});

/**
 * A ordem é fixa e faz parte do contrato: um recibo traz SEMPRE quatro
 * critérios, sempre por esta ordem, mesmo quando algum é `n/d`. Um recibo com
 * três critérios seria indistinguível de um recibo onde o quarto foi esquecido.
 */
const CRITERIOS = Object.freeze([
  'resposta-nao-rascunho',
  'a-ronda-correu',
  'citacao-ancorada',
  'critico-nao-e-autor',
]);

const EXIT = Object.freeze({ CONFORME: 0, INDECISO: 3, NAO_CONFORME: 4 });

// ─────────────────────────────────────────────────────────────────────────────
// Entrada
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida e normaliza. NUNCA adivinha um campo em falta — devolve o porquê.
 *
 * O corpo do motor entra CRU (`response`/`thinking`/`eval_count`/`esgotado`),
 * tal como o Ollama o devolve, e é aqui que se decide o que conta como resposta.
 * Deixar o chamador escolher entre `response` e `thinking` foi exactamente o
 * defeito do #450: quem chama não sabe que a escolha existe.
 */
function declararEntrada(bruto) {
  if (!bruto || typeof bruto !== 'object') {
    return { ok: false, entrada: null, porque: 'entrada ausente ou não é objecto' };
  }
  const corpo = bruto.resposta;
  if (!corpo || typeof corpo !== 'object') {
    return { ok: false, entrada: null, porque: 'falta `resposta` — o corpo cru devolvido pelo motor' };
  }
  const autor = bruto.autor || {};
  if (!autor.agente && !autor.modelo) {
    // Sem autor não há como saber se o crítico é o autor. Recusa-se a entrada
    // em vez de se deixar o C4 sair `n/d` por uma omissão que é do chamador.
    return { ok: false, entrada: null, porque: 'falta `autor` — sem ele o critério crítico≠autor é indecidível' };
  }

  return {
    ok: true,
    porque: null,
    entrada: {
      chave: String(bruto.chave || ''),
      ronda: Number.isFinite(bruto.ronda) ? bruto.ronda : null,
      rascunho: bruto.rascunho == null ? null : String(bruto.rascunho),
      autor: { agente: autor.agente || null, modelo: autor.modelo || null },
      juiz: bruto.juiz ? { agente: bruto.juiz.agente || null, modelo: bruto.juiz.modelo || null } : null,
      resposta: {
        response: typeof corpo.response === 'string' ? corpo.response : '',
        thinking: typeof corpo.thinking === 'string' ? corpo.thinking : '',
        eval_count: Number.isFinite(corpo.eval_count) ? corpo.eval_count : null,
        // `esgotado` é o carimbo do runner para «nunca chegou ao modelo».
        esgotado: corpo.esgotado === true || corpo.esgotado === 'true',
      },
      enunciado: bruto.enunciado
        ? {
          texto: String(bruto.enunciado.texto || ''),
          ficheirosPermitidos: Array.isArray(bruto.enunciado.ficheirosPermitidos)
            ? bruto.enunciado.ficheirosPermitidos : [],
          janela: bruto.enunciado.janela || null,
        }
        : null,
    },
  };
}

/** Fabrica um critério. `medido`/`limiar` podem ser `null` — mas nunca inventados. */
function criterio(id, estado, { medido = null, limiar = null, porque, provas = [] }) {
  return { id, estado, medido, limiar, porque, provas };
}

// ─────────────────────────────────────────────────────────────────────────────
// C1 · resposta-nao-rascunho
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O texto que se mede vem de `response`. Se vier vazio e houver `thinking`, isso
 * não é uma resposta curta — é um RASCUNHO, e pontuá-lo é dar nota ao raciocínio.
 *
 * MEDIDO (commit 865de8bc, 2026-08-29, N=12, mesmo excerto):
 *   granite4.2:3b  sem `think:false` **0%**  ·  com `think:false` **83,3%**
 *   granite4.2:8b  sem `think:false` **0%**  ·  com `think:false` **50%**
 * Dar mais espaço não resolve: `num_predict` 2500 deu 8,3% — o raciocínio expande
 * para encher o que lhe derem.
 *
 * É este o critério que devolve sentido ao «rascunho B sai fail» do enunciado
 * original. O rascunho B não falha por ser o segundo: falha por ser rascunho.
 */
function medirRespostaNaoRascunho({ resposta }) {
  const resp = resposta.response.trim();
  const think = resposta.thinking.trim();

  if (resp) {
    return criterio(CRITERIOS[0], ESTADO.PASSA, {
      medido: resp.length,
      limiar: '> 0 caracteres em `response`',
      porque: think
        ? `resposta com ${resp.length} caracteres (havia também ${think.length} de rascunho — ignorado, como deve ser)`
        : `resposta com ${resp.length} caracteres`,
      provas: [`response[0..80]=${JSON.stringify(resp.slice(0, 80))}`],
    });
  }

  if (think) {
    return criterio(CRITERIOS[0], ESTADO.FALHA, {
      medido: 0,
      limiar: '> 0 caracteres em `response`',
      porque: 'só há rascunho: `response` vazio e `thinking` com '
        + `${think.length} caracteres. O modelo gastou o orçamento a pensar e não `
        + 'chegou a escrever. Pontuar isto seria dar nota ao raciocínio (medido: 0% vs 83%).',
      provas: [`thinking[0..80]=${JSON.stringify(think.slice(0, 80))}`],
    });
  }

  return criterio(CRITERIOS[0], ESTADO.FALHA, {
    medido: 0,
    limiar: '> 0 caracteres em `response`',
    porque: 'resposta vazia e sem rascunho — o motor não devolveu texto nenhum',
    provas: [],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// C2 · a-ronda-correu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uma ronda que nunca chegou ao modelo não é uma resposta má: é a ausência de
 * resposta, e vestia-se de `sem-citacao`.
 *
 * MEDIDO no ledger do dono a 2026-08-19: **209 dos 275 `sem-citacao` (76%)** eram
 * rondas com 0 s de GPU, 0 tokens e o modelo nunca chamado. O painel mostrava-as
 * debaixo de um cartão que diz «what the GPU shipped». O número verdadeiro de «o
 * modelo respondeu sem citar» era 66, e ninguém o podia saber.
 *
 * Por isso este critério sai `n/d` — nunca `falha`. Castigar um motor por uma
 * ronda que não lhe foi entregue é a mesma falácia, com outra roupa.
 */
function medirRondaCorreu({ resposta }) {
  if (resposta.esgotado) {
    return criterio(CRITERIOS[1], ESTADO.ND, {
      medido: null,
      limiar: 'a ronda tem de ter chegado ao motor',
      porque: 'a ronda está carimbada `esgotado`: nunca chegou ao modelo. Não é uma '
        + 'resposta má — é a ausência de resposta, e n/d é o que se pode afirmar.',
      provas: ['esgotado=true'],
    });
  }

  const tok = resposta.eval_count;
  if (tok === null) {
    return criterio(CRITERIOS[1], ESTADO.ND, {
      medido: null,
      limiar: '`eval_count` > 0',
      porque: 'sem `eval_count` no corpo: não há como distinguir uma ronda que correu '
        + 'de uma que não correu. Ausência de prova não é prova de ausência.',
      provas: [],
    });
  }

  if (tok > 0) {
    return criterio(CRITERIOS[1], ESTADO.PASSA, {
      medido: tok,
      limiar: '`eval_count` > 0',
      porque: `o motor gerou ${tok} tokens — a ronda correu de facto`,
      provas: [`eval_count=${tok}`],
    });
  }

  return criterio(CRITERIOS[1], ESTADO.ND, {
    medido: 0,
    limiar: '`eval_count` > 0',
    porque: '0 tokens gerados: o motor foi chamado e não produziu nada. Isso é uma '
      + 'ronda que não correu, não uma resposta a avaliar.',
    provas: ['eval_count=0'],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// C3 · citacao-ancorada  (composto — zero parsing próprio)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cada `ficheiro:linha` da resposta é confrontado com o disco: existe? é ficheiro?
 * a linha cabe? está DENTRO da janela que foi mostrada ao motor?
 *
 * Isto é `verifyEvidence` do `tools/cockpit/runner/evidence-verifier.mjs`,
 * chamado verbatim. Não se reimplementa nada — e não é preguiça: aquele módulo
 * traz de graça a ordem certa (extrair citações ANTES de testar o carimbo de
 * «SEM ACHADO», senão uma resposta com o carimbo E uma citação fabricada saía
 * com o veredicto mais benigno sem o disco ser tocado) e o eixo `off_window`
 * («uma linha real que o modelo nunca viu não é prova de leitura — é sorte»).
 *
 * MEDIDO: o protótipo carimbava todo o recibo `nao-verificado`, e foi assim que
 * **174 achados alucinados** foram contados como trabalho.
 */
async function medirCitacaoAncorada(entrada, { repoRoot, verifyImpl }) {
  if (!entrada.enunciado) {
    return criterio(CRITERIOS[2], ESTADO.ND, {
      porque: 'sem `enunciado` na entrada: não há janela mostrada contra a qual ancorar '
        + 'as citações. Medir sem janela aceitaria como prova uma linha que o motor nunca viu.',
      provas: [],
    });
  }

  let verify = verifyImpl;
  if (!verify) {
    try {
      // `import()` dinâmico: o evidence-verifier é ESM e este ficheiro é CJS.
      // A fronteira é de formato de módulo, não de conhecimento — por isso
      // atravessa-se, em vez de se copiar o código para este lado.
      const mod = await import(caminhoDoVerificador());
      verify = mod.verifyEvidence;
    } catch (err) {
      return criterio(CRITERIOS[2], ESTADO.ND, {
        porque: 'não consegui carregar o `evidence-verifier.mjs`: '
          + `${(err && err.message) || 'erro sem mensagem'}. Sem ele, este critério é n/d — `
          + 'nunca um verde por omissão.',
        provas: [],
      });
    }
  }

  let r;
  try {
    r = verify({
      repoRoot,
      text: entrada.resposta.response,
      allowedFiles: entrada.enunciado.ficheirosPermitidos,
      window: entrada.enunciado.janela,
    });
  } catch (err) {
    return criterio(CRITERIOS[2], ESTADO.ND, {
      porque: `o verificador de evidência lançou: ${(err && err.message) || 'erro'}`,
      provas: [],
    });
  }

  const v = r && r.verdict;
  const provas = [`verdict=${v}`].concat(r && r.signal ? [String(r.signal)] : []);

  if (v === 'citacao-ok') {
    return criterio(CRITERIOS[2], ESTADO.PASSA, {
      medido: (r.citations && r.citations.length) || null,
      limiar: 'toda a citação existe no disco e cai dentro da janela mostrada',
      porque: 'as citações resistiram ao confronto com a fonte',
      provas,
    });
  }
  if (v === 'refutado') {
    return criterio(CRITERIOS[2], ESTADO.FALHA, {
      limiar: 'toda a citação existe no disco e cai dentro da janela mostrada',
      porque: 'a fonte desmente a citação — referência fabricada',
      provas,
    });
  }
  if (v === 'sem-citacao') {
    return criterio(CRITERIOS[2], ESTADO.FALHA, {
      medido: 0,
      limiar: '≥ 1 citação ancorada',
      porque: 'o motor respondeu e não ancorou nada. Não é `n/d`: houve resposta, e ela '
        + 'não trouxe prova.',
      provas,
    });
  }
  if (v === 'sem-achado') {
    return criterio(CRITERIOS[2], ESTADO.ND, {
      porque: 'o motor carimbou explicitamente que não encontrou nada. Um modelo que não '
        + 'acha nada tem de poder dizê-lo sem ser castigado.',
      provas,
    });
  }
  return criterio(CRITERIOS[2], ESTADO.ND, {
    porque: `veredicto de evidência não conclusivo: ${JSON.stringify(v)}`,
    provas,
  });
}

function caminhoDoVerificador() {
  const p = path.resolve(__dirname, '..', 'cockpit', 'runner', 'evidence-verifier.mjs');
  return require('node:url').pathToFileURL(p).href;
}

// ─────────────────────────────────────────────────────────────────────────────
// C4 · critico-nao-e-autor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quem julga não pode ser quem produziu.
 *
 * O `moo-verify.js` nomeia a razão: «SELF-PREFERENTIAL BIAS — a model prefers its
 * own output when asked to judge it. The fix is doctrine, not magic: the critic
 * must be EXTERNAL and MACHINE-CHECKABLE».
 *
 * E o `refutador.mjs` mostra o custo de o não ter: os **62 achados do pilar P4
 * passaram TODOS com `citacao-ok`**, e um verificador determinístico mostrou que
 * **0 de 78 eram verdade**. Citar bem uma linha e mentir sobre ela é um par
 * perfeitamente possível — e os critérios C1–C3 não o apanham. É por isso que
 * este quarto existe.
 *
 * Aqui não se JULGA: verifica-se que existe um juiz e que ele não é o autor.
 * O julgamento em si é advisory e vive fora deste ficheiro (a ponte adversarial),
 * porque a lente local está medida em 2/13 de precisão e não assina nada.
 */
function medirCriticoNaoEAutor({ autor, juiz }) {
  const id = (x) => (x ? `${x.agente || '?'}/${x.modelo || '?'}` : null);

  if (!juiz) {
    return criterio(CRITERIOS[3], ESTADO.ND, {
      limiar: 'juiz declarado e diferente do autor',
      porque: 'nenhum juiz declarado. Não é falha — é ausência de verificação adversarial, '
        + 'e o recibo tem de o dizer em vez de fingir que houve.',
      provas: [`autor=${id(autor)}`],
    });
  }

  const mesmoModelo = !!(autor.modelo && juiz.modelo && autor.modelo === juiz.modelo);
  const mesmoAgente = !!(autor.agente && juiz.agente && autor.agente === juiz.agente);

  if (mesmoModelo || mesmoAgente) {
    return criterio(CRITERIOS[3], ESTADO.FALHA, {
      limiar: 'juiz declarado e diferente do autor',
      porque: `o juiz é o autor (${mesmoModelo ? 'mesmo modelo' : 'mesmo agente'}). `
        + 'Auto-avaliação não é verificação: um modelo prefere o seu próprio output '
        + 'quando lhe pedem que o julgue.',
      provas: [`autor=${id(autor)}`, `juiz=${id(juiz)}`],
    });
  }

  return criterio(CRITERIOS[3], ESTADO.PASSA, {
    limiar: 'juiz declarado e diferente do autor',
    porque: 'o crítico é externo ao autor',
    provas: [`autor=${id(autor)}`, `juiz=${id(juiz)}`],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Conclusão
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `conforme` SSE os quatro em `passa`.
 * ≥1 `falha` → `nao-conforme`.  ≥1 `n/d` (e nenhuma falha) → `indeciso`.
 *
 * A ordem importa: uma falha medida ganha a um n/d. Não medir um critério não
 * apaga outro que reprovou.
 */
function concluir(criterios) {
  const bloqueiam = criterios.filter((c) => c.estado === ESTADO.FALHA).map((c) => c.id);
  const naoMedidos = criterios.filter((c) => c.estado === ESTADO.ND).map((c) => c.id);

  let veredicto = VEREDICTO.CONFORME;
  if (bloqueiam.length) veredicto = VEREDICTO.NAO_CONFORME;
  else if (naoMedidos.length) veredicto = VEREDICTO.INDECISO;

  return { veredicto, bloqueiam, nao_medidos: naoMedidos };
}

// ─────────────────────────────────────────────────────────────────────────────
// O composto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} bruto  o resultado cru de um motor (ver `declararEntrada`)
 * @param {object} [opts]
 * @param {string} [opts.repoRoot]
 * @param {function} [opts.verifyImpl]  injecção do verifyEvidence (testes)
 * @param {string}  [opts.agoraIso]
 * @returns {Promise<object>} recibo — nunca lança
 */
async function renderMedir(bruto, opts = {}) {
  const ts = opts.agoraIso || new Date().toISOString();
  const repoRoot = opts.repoRoot || path.resolve(__dirname, '..', '..');

  const d = declararEntrada(bruto);
  if (!d.ok) {
    // Entrada inválida sai `indeciso`, nunca `nao-conforme`: o defeito é de quem
    // chama, e reprovar o motor por isso seria acusá-lo do erro de outrem.
    return {
      ts, chave: null, ronda: null, rascunho: null, autor: null,
      criterios: CRITERIOS.map((id) => criterio(id, ESTADO.ND, {
        porque: `entrada não declarável: ${d.porque}`, provas: [],
      })),
      veredicto: VEREDICTO.INDECISO,
      bloqueiam: [], nao_medidos: [...CRITERIOS],
      entrada_porque: d.porque,
      motor: 'zero-llm', usd: 0,
    };
  }

  const e = d.entrada;
  const criterios = [
    medirRespostaNaoRascunho(e),
    medirRondaCorreu(e),
    await medirCitacaoAncorada(e, { repoRoot, verifyImpl: opts.verifyImpl }),
    medirCriticoNaoEAutor(e),
  ];

  // Guarda de forma: o contrato promete SEMPRE quatro, sempre por esta ordem.
  // Um recibo com três seria indistinguível de um com o quarto esquecido.
  const ordem = criterios.map((c) => c.id);
  const formaOk = ordem.length === CRITERIOS.length
    && ordem.every((id, i) => id === CRITERIOS[i]);

  return {
    ts,
    chave: e.chave || null,
    ronda: e.ronda,
    rascunho: e.rascunho,
    autor: e.autor,
    juiz: e.juiz,
    criterios,
    ...concluir(criterios),
    forma_ok: formaOk,
    motor: 'zero-llm',
    usd: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Render — a metade que o dono lê
// ─────────────────────────────────────────────────────────────────────────────

const SIMBOLO = { [ESTADO.PASSA]: 'ok  ', [ESTADO.FALHA]: 'FALHA', [ESTADO.ND]: 'n/d ' };

/**
 * Um veredicto que só uma máquina lê não fecha o fosso. Cada linha traz o que
 * foi medido, contra que limiar, e a prova — nunca um visto sem número atrás.
 */
function imprimir(recibo) {
  const L = [];
  const quem = recibo.autor ? `${recibo.autor.agente || '?'}/${recibo.autor.modelo || '?'}` : 'n/d';
  L.push(`render_medir · ${recibo.ts}`);
  L.push(`  trabalho: ${recibo.chave || '(sem chave)'}`
    + (recibo.ronda != null ? ` · ronda ${recibo.ronda}` : '')
    + (recibo.rascunho ? ` · rascunho ${recibo.rascunho}` : ''));
  L.push(`  autor: ${quem}`);
  L.push('');
  for (const c of recibo.criterios) {
    L.push(`  [${SIMBOLO[c.estado] || '?'}] ${c.id}`);
    const med = c.medido == null ? '—' : String(c.medido);
    if (c.limiar != null) L.push(`         medido ${med} · limiar: ${c.limiar}`);
    L.push(`         ${c.porque}`);
    for (const p of c.provas || []) L.push(`         · ${p}`);
  }
  L.push('');
  L.push(`  VEREDICTO: ${recibo.veredicto.toUpperCase()}`);
  if (recibo.bloqueiam.length) L.push(`  bloqueiam: ${recibo.bloqueiam.join(', ')}`);
  if (recibo.nao_medidos.length) L.push(`  não medidos: ${recibo.nao_medidos.join(', ')}`);
  if (recibo.veredicto === VEREDICTO.INDECISO) {
    L.push('  (indeciso ≠ reprovado: há critérios que não foram medidos, e a razão está acima)');
  }
  return L.join('\n');
}

function exitDe(recibo) {
  if (recibo.veredicto === VEREDICTO.CONFORME) return EXIT.CONFORME;
  if (recibo.veredicto === VEREDICTO.NAO_CONFORME) return EXIT.NAO_CONFORME;
  return EXIT.INDECISO;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main(argv) {
  const args = argv.filter((a) => a !== '--json');
  const comoJson = argv.includes('--json');
  const ficheiro = args[0];

  if (!ficheiro) {
    console.error('uso: node tools/verify/render_medir.js <resultado.json> [--json]');
    return EXIT.INDECISO;
  }

  let bruto = null;
  try {
    bruto = JSON.parse(fs.readFileSync(ficheiro, 'utf8'));
  } catch (err) {
    console.error(`não consegui ler ${ficheiro}: ${(err && err.message) || 'erro'}`);
    return EXIT.INDECISO;
  }

  const recibo = await renderMedir(bruto);
  console.log(comoJson ? JSON.stringify(recibo, null, 2) : imprimir(recibo));
  return exitDe(recibo);
}

module.exports = {
  renderMedir,
  declararEntrada,
  medirRespostaNaoRascunho,
  medirRondaCorreu,
  medirCitacaoAncorada,
  medirCriticoNaoEAutor,
  concluir,
  imprimir,
  exitDe,
  main,
  ESTADO,
  VEREDICTO,
  CRITERIOS,
  EXIT,
};

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`render_medir falhou: ${(err && err.message) || err}`);
      process.exit(EXIT.INDECISO);
    });
}
