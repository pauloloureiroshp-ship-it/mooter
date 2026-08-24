/**
 * autopilot.mjs — quanto da maquina o dono empresta, e quanto do trabalho o
 * loop pode fechar sozinho.
 *
 * Tres coisas vivem aqui, e vivem juntas de proposito:
 *
 *  1. A REGRA DE SEVERIDADE. Deterministica, zero-LLM. Um modelo a julgar os
 *     achados de outro modelo seria mais um numero sem procedencia; esta regra
 *     esta escrita, ve-se, e corrige-se. Foi lida dos dados: a 2026-08-20, dos
 *     32 achados na fila deste device, os DOIS que valiam eram numeros sem
 *     procedencia em codigo que o cliente le. Os outros 30 eram valores de
 *     estilo, defaults e constantes nomeadas.
 *
 *  2. OS PORTOES. Cada nivel de autonomia abre com um NUMERO MEDIDO, nunca com
 *     um clique de coragem. Um autopilot que se liga porque o dono confia e um
 *     autopilot sem freio; um que se liga porque a taxa de citacao inventada
 *     esta abaixo de 2% e um instrumento. Se o numero piorar, o nivel fecha
 *     sozinho — e isso e a caracteristica, nao o defeito.
 *
 *  3. O ORCAMENTO DE GPU. A maquina e do dono, nao do loop. `baixo` deixa-a
 *     utilizavel enquanto ele trabalha; `alto` e para quando ele sai.
 *
 * Nada aqui chama a rede, nenhum modelo, e nenhuma funcao escreve no repo.
 */

/* ─────────────────────────── 1. severidade ─────────────────────────── */

/** Codigo que um cliente le. Um numero errado aqui e uma promessa quebrada. */
export const SEV_PUBLICO = /^(landing\/|docs\/|site\/|README|packages\/[^/]+\/(public|assets)\/)/i;
/** Ferramenta interna: um numero errado aqui nunca chega a ninguem de fora. */
export const SEV_INTERNO = /^(tools\/|scripts\/|_handoff\/)|\.test\.|(^|\/)test/i;
/**
 * Estilo e layout NAO sao afirmacoes. `borderRadius: 14` tem um numero e nao
 * promete nada a ninguem. Esta lista corre PRIMEIRO — e a diferenca medida
 * entre 16 "alto" inuteis e os 5 que valem.
 */
export const SEV_ESTILO = /\b(border[A-Za-z]*|font[A-Za-z]*|width|maxWidth|minWidth|height|maxHeight|minHeight|padding[A-Za-z]*|margin[A-Za-z]*|lineHeight|letterSpacing|top|left|right|bottom|inset|zIndex|opacity|gap|flex[A-Za-z]*|grid[A-Za-z]*|size|count|rows|cols|columns|strokeWidth|viewBox|duration|delay|radius|offset|scale|blur|spread)\s*[:=]/;
/** Uma AFIRMACAO tem unidade ou comparacao. Um inteiro nu nao e uma afirmacao. */
export const SEV_CLAIM = /\d+([.,]\d+)?\s*(%|GB|MB|TB|KB|ms\b|s\b|x\b|×)|[$€£]\s?\d|\b\d+([.,]\d+)?\s*(vezes|times|faster|slower|less|more|cheaper|savings?)\b/i;
/** Uma constante exportada com nome JA e a correccao, nao o defeito. */
export const SEV_CONST = /export\s+const\s+[A-Z0-9_]{3,}\s*=/;
/** O numero vive dentro de texto que alguem le, nao num valor de codigo. */
export const SEV_EM_TEXTO = /['"`][^'"`]*\d[^'"`]*[A-Za-z]{3,}[^'"`]*['"`]/;

/* ──────────────── 1b. a citacao suporta o que o achado afirma? ──────────────── */

/**
 * `citacao-ok` responde a UMA pergunta: a linha citada existe no disco. Nunca
 * respondeu a "essa linha contem o que o achado diz". Sao coisas diferentes, e a
 * diferenca foi medida a 2026-08-20:
 *
 *   HandoffStory.tsx — o achado diz "numero hardcoded $0" e cita a linha 28, que
 *   e `title: 'The time back',`. Nao tem `$0` nenhum. O `$0` existe mesmo no
 *   ficheiro, nas linhas 8, 24 e 103 — o achado esta CERTO e a citacao esta
 *   ERRADA. Passou como `citacao-ok` e chegou a fila do dono como HIGH.
 *
 *   layout.tsx — o achado diz "47%" e cita `description: ${M.savedPct} saved…`.
 *   O 47 nao esta na linha: vem de um import com procedencia optima. Mesmo caso.
 *
 * Isto le-se do que JA viaja no payload — o `evidencia` traz o snippet depois do
 * ` => `. Zero mudancas no motor, zero mudancas no ledger, e vale
 * retroactivamente para todos os achados que ja estao na fila.
 *
 * O que NAO faz: descartar. Um achado mal citado pode ser verdadeiro, e deitar
 * fora o HandoffStory era perder um `$0` que esta mesmo no ecra. Limita a
 * severidade e diz porque — a decisao continua do dono.
 */
const TOKEN_AFIRMADO = /[$€£]?\d+(?:[.,]\d+)?\s?%?/g;

/** O que vem depois de ` => ` na evidencia e a linha real, lida do disco. */
export function snippetDaEvidencia(evidencia) {
  const s = String(evidencia || '');
  const i = s.indexOf(' => ');
  return i >= 0 ? s.slice(i + 4) : '';
}

/**
 * @returns {{ok: boolean|null, porque: string}} `null` quando o achado nao
 *   afirma numero nenhum — ai nao ha nada para confrontar, e fingir um veredicto
 *   seria o mesmo defeito noutro sitio.
 */
export function suporteDaCitacao(a) {
  const diz = String((a && (a.resultado_resumo || a.resumo)) || '');
  const snippet = snippetDaEvidencia(a && a.evidencia);
  if (!snippet) return { ok: null, porque: 'the receipt carries no snippet to compare against' };
  // So o que o modelo AFIRMA, nao o caminho do ficheiro que vem antes do ` => `.
  const afirmado = String(diz.split(/PROVA:|PROOF:/i)[0] || diz).match(TOKEN_AFIRMADO) || [];
  const numeros = afirmado.map((x) => x.trim()).filter((x) => /\d/.test(x));
  if (!numeros.length) return { ok: null, porque: 'the finding claims no number — nothing to confront' };
  const nu = (x) => String(x).replace(/[\s,]/g, '').replace(/[$€£%]/g, '');
  const alvo = nu(snippet);
  const bate = numeros.some((n) => alvo.includes(nu(n)));
  return bate
    ? { ok: true, porque: 'the cited line does contain the number the finding claims' }
    : { ok: false, porque: 'the cited line does NOT contain the number the finding claims — right finding, wrong line, or wrong finding' };
}

/**
 * @returns {{n:1|2|3, k:'low'|'med'|'high', porque:string, motivo:string|null}}
 *   `motivo` e o motivo tipado de descarte quando o nivel 1 pode fechar isto
 *   sozinho; `null` quando a decisao tem de ser do dono.
 */
export function severidade(a) {
  const f = String((a && a.ficheiro) || '');
  const diz = String((a && (a.resultado_resumo || a.resumo)) || '');
  const prova = String((a && a.evidencia) || '');
  const publico = SEV_PUBLICO.test(f);
  const claim = SEV_CLAIM.test(diz) || SEV_CLAIM.test(prova) || SEV_EM_TEXTO.test(prova);

  if (SEV_CONST.test(prova)) {
    return { n: 1, k: 'low', porque: 'a named exported constant is already the fix, not the defect', motivo: 'nao-e-um-problema' };
  }
  if (SEV_ESTILO.test(prova) && !SEV_EM_TEXTO.test(prova)) {
    return { n: 1, k: 'low', porque: 'a style or layout value — it states nothing to anyone', motivo: 'trivial' };
  }
  if (publico && claim) {
    // Um achado cuja citacao nao contem o numero que ele afirma NAO pode ser
    // `high`: nao esta provado onde esta o defeito. Nao se descarta — desce, e
    // diz porque. Foi isto que apanhou o HandoffStory e o layout.tsx.
    const sup = suporteDaCitacao(a);
    if (sup.ok === false) {
      return { n: 2, k: 'med', porque: 'claim with a number, but ' + sup.porque, motivo: null, suporte: false };
    }
    return { n: 3, k: 'high', porque: 'a claim with a number and no provenance, in code the customer reads', motivo: null, suporte: sup.ok };
  }
  if (publico) return { n: 2, k: 'med', porque: 'customer-facing file, but the number makes no claim', motivo: null };
  if (SEV_INTERNO.test(f)) {
    return { n: 1, k: 'low', porque: 'internal tooling — it never reaches a user', motivo: 'trivial' };
  }
  if (claim) return { n: 2, k: 'med', porque: 'a claim with a number, in shipped code', motivo: null };
  return { n: 1, k: 'low', porque: 'no claim, and not customer-facing', motivo: 'trivial' };
}

/* ─────────────────────────── 2. niveis e portoes ─────────────────────────── */

export const NIVEIS = [
  {
    n: 0,
    id: 'observar',
    nome: 'Observe',
    faz: 'the loop runs and reports. It writes nothing anywhere.',
  },
  {
    n: 1,
    id: 'curar',
    nome: 'Curate',
    faz: 'the loop closes its own low findings with a typed reason, so only what needs you reaches you. It still writes nothing to the repo.',
  },
  {
    n: 2,
    id: 'propor',
    nome: 'Propose',
    faz: 'the loop writes a patch in an isolated worktree and runs the suite. It only reaches you if it compiles and the tests pass. Never merges.',
  },
  {
    n: 3,
    id: 'aplicar',
    nome: 'Apply',
    faz: 'a patch that passed level 2 merges on its own, and only inside an allowlist of paths. Never packages/, never a frozen file.',
  },
];

export const TETO_REFUTADO_PCT = 2;
export const MIN_TRIADOS = 20;
export const MIN_PRECISAO_PCT = 70;
export const MIN_PATCHES_LIMPOS = 20;

/**
 * O estado de cada portao, com o numero que o abre e o numero que ele tem.
 * Um portao que nao consegue ser medido fica FECHADO — nunca aberto por omissao.
 */
export function portoes({ recibos = {}, triagem = {}, patches = {} } = {}) {
  const total = Number(recibos.total) || 0;
  const refutado = Number(recibos.refutado) || 0;
  const refPct = total ? (refutado / total) * 100 : null;

  // LISTA BRANCA, nao lista negra. O portao 2 le `do_dono` — o balde que so
  // aceita `por === 'dono'` EXPLICITO (`contarTriagem`) — e nunca os totais.
  //
  // A versao anterior subtraia `por_autor.agente` dos totais, o que e uma lista
  // negra: fechava a porta a UMA assinatura e deixava todas as outras entrar.
  // Medido a 2026-08-24: 1448 decisoes `por:'claude'` (escritas por tres
  // scripts) contavam como triagem do dono, e o painel dizia-lhe que ele
  // mantinha 0% do que o loop encontra. Zero dessas decisoes eram dele.
  //
  // `do_dono` ausente => zero => portao FECHADO. Um portao que nao consegue ser
  // medido nunca abre por omissao, e o caminho de quem passa `triagem: {}`
  // (o tique do nivel 1) continua a medir-se a si proprio como fechado.
  //
  // A contagem tem de ser um INTEIRO NAO-NEGATIVO, e a validacao nao e
  // cerimonia: com `Number(x) || 0`, uma string "20", um float 14.5 ou um -100
  // passavam, e o portao chegava a abrir a dizer "500% kept (100 of 20)". Hoje
  // quem enche este campo e o `contarTriagem`, que so produz inteiros — mas um
  // portao documentado como fail-closed nao pode depender de o chamador ser
  // bem-comportado. O que nao e uma contagem vale zero, e zero fecha.
  const contagem = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : 0);
  const doDono = triagem.do_dono || null;
  const aceite = contagem(doDono && doDono.aceite);
  const descartado = contagem(doDono && doDono.descartado);
  const issue = contagem(doDono && doDono.issue);
  // So contam as decisoes do DONO. O nivel 1 assina as suas como `agente`, e
  // conta-las aqui seria o autopilot a validar-se a si proprio: ao fim de 20
  // descartes automaticos o portao mediria 0% de precisao e ficava fechado para
  // sempre — pela razao errada. Medido a 2026-08-20, quando 26 descartes do
  // agente puseram o L2 a dizer "you keep 0% of what it finds".
  // Quantas decisoes NAO SAO do dono, so para as poder NOMEAR. Nao entram em
  // nenhuma conta — o denominador ja e a lista branca acima.
  //
  // Chamar-lhes "agentes" seria mentir por arredondamento: neste balde cabem
  // tambem as linhas sem assinatura (`n-d`) e autores que nao reconhecemos. A
  // unica coisa que se sabe delas, e portanto a unica que se diz, e que NAO sao
  // do dono.
  const naoDoDono = Object.entries(triagem.por_autor || {})
    .filter(([autor]) => autor !== 'dono')
    .reduce((soma, [, n]) => soma + contagem(n), 0);
  const triados = aceite + descartado + issue;
  const precisao = triados ? ((aceite + issue) / triados) * 100 : null;

  const limpos = Number(patches.aceites_sem_rollback) || 0;

  return [
    {
      nivel: 1,
      regra: `invented citations under ${TETO_REFUTADO_PCT}%`,
      medido: refPct == null ? null : Math.round(refPct * 10) / 10,
      unidade: '%',
      alvo: TETO_REFUTADO_PCT,
      base: `${refutado} refuted of ${total} rounds`,
      aberto: refPct != null && refPct < TETO_REFUTADO_PCT,
      porque_fechado: refPct == null
        ? 'no rounds yet — nothing to measure'
        : `the model is inventing line numbers in ${Math.round(refPct * 10) / 10}% of rounds`,
    },
    {
      nivel: 2,
      regra: `${MIN_TRIADOS} findings triaged by you, and at least ${MIN_PRECISAO_PCT}% of them kept`,
      medido: triados,
      unidade: ' triaged',
      alvo: MIN_TRIADOS,
      // Denominador zero diz NO DATA YET — nunca 0%. Um portao que mostra
      // "you keep 0%" quando o dono nunca decidiu nada esta a acusa-lo de um
      // juizo que ele nao fez, e foi exactamente isso que 1448 decisoes de
      // script fizeram ao painel dele.
      medido_ha_dados: triados > 0,
      // "no CURRENT decisions signed by you" e nao "you have not decided": a
      // ultima decisao por chave e a que vale, portanto o dono pode ter
      // decidido e um agente ter sobreposto depois. Dizer-lhe que ele nunca
      // decidiu nada seria falso — e ele sabe que e falso, o que e pior.
      base: precisao == null
        ? `no data yet — no current decisions signed by you${naoDoDono ? ` (the ${naoDoDono} not signed by you do not count here)` : ''}`
        : `${Math.round(precisao)}% kept (${aceite + issue} of ${triados} decided by you)`,
      aberto: triados >= MIN_TRIADOS && precisao != null && precisao >= MIN_PRECISAO_PCT,
      porque_fechado: triados === 0
        ? `no data yet — no finding carries a current decision signed by YOU${naoDoDono ? `; the ${naoDoDono} not signed by you never count` : ''}`
        : triados < MIN_TRIADOS
          ? `only ${triados} of ${MIN_TRIADOS} findings have a decision from YOU — the loop cannot learn what you keep`
          : `you keep ${Math.round(precisao || 0)}% of what it finds; ${MIN_PRECISAO_PCT}% is the bar`,
    },
    {
      nivel: 3,
      regra: `${MIN_PATCHES_LIMPOS} level-2 patches accepted with no rollback`,
      medido: limpos,
      unidade: ' patches',
      alvo: MIN_PATCHES_LIMPOS,
      base: `${limpos} clean so far`,
      aberto: limpos >= MIN_PATCHES_LIMPOS,
      porque_fechado: `level 2 has not produced ${MIN_PATCHES_LIMPOS} clean patches yet`,
    },
  ];
}

/** O nivel mais alto que os numeros permitem, agora. */
export function tectoPermitido(ps) {
  let teto = 0;
  for (const p of ps) {
    if (p.aberto && p.nivel === teto + 1) teto = p.nivel;
    else break;
  }
  return teto;
}

/* ─────────────────────────── 3. orcamento de GPU ─────────────────────────── */

/**
 * A maquina e do dono. Isto e o unico sitio onde se decide quanto dela o loop
 * pode ocupar, e mapeia para a pausa entre rondas — o botao mais honesto que ha,
 * porque o efeito e imediato e reversivel.
 */
export const ORCAMENTOS = {
  baixo: { rotulo: 'Low — I am working', min_s: 150, max_s: 300, diz: 'a round every 2 to 5 minutes' },
  medio: { rotulo: 'Balanced', min_s: 45, max_s: 90, diz: 'a round every 45 to 90 seconds' },
  alto: { rotulo: 'High — the machine is yours', min_s: 15, max_s: 30, diz: 'a round every 15 to 30 seconds' },
};
export const ORCAMENTO_OMISSAO = 'medio';

export function orcamento(nome) {
  return ORCAMENTOS[nome] || ORCAMENTOS[ORCAMENTO_OMISSAO];
}

/* ─────────────────────────── 4. estado em disco ─────────────────────────── */

export const ESTADO_OMISSAO = { nivel: 0, orcamento: ORCAMENTO_OMISSAO };

/** Ilegivel, ausente ou fora do dominio => nivel 0. Fail-closed, sempre. */
export function normalizar(bruto) {
  const nivel = Number(bruto && bruto.nivel);
  const orc = String((bruto && bruto.orcamento) || '');
  return {
    nivel: Number.isInteger(nivel) && nivel >= 0 && nivel <= 3 ? nivel : 0,
    orcamento: Object.prototype.hasOwnProperty.call(ORCAMENTOS, orc) ? orc : ORCAMENTO_OMISSAO,
  };
}

export function lerEstado(ficheiro, readImpl) {
  try {
    return normalizar(JSON.parse(String(readImpl(ficheiro, 'utf8'))));
  } catch {
    return { ...ESTADO_OMISSAO };
  }
}

/**
 * O nivel EFECTIVO: o que o dono pediu, cortado pelo que os numeros permitem.
 * Pedir 3 com o portao 1 fechado da 0 — e o painel diz porque.
 */
export function efectivo(pedido, ps) {
  const teto = tectoPermitido(ps);
  return Math.min(Number(pedido) || 0, teto);
}

/* ─────────────────────────── 5. nivel 1: curar ─────────────────────────── */

/**
 * Escolhe os achados que o nivel 1 pode fechar sozinho.
 *
 * So `low`, so com motivo tipado, e nunca mais do que `cap` de uma vez — um
 * autopilot que despeja 200 decisoes num ficheiro de uma vez e indistinguivel
 * de um acidente. Devolve o que HA para fazer; nao escreve nada.
 */
export function curar(fila, { cap = 25 } = {}) {
  const escolhidos = [];
  for (const a of fila || []) {
    if (escolhidos.length >= cap) break;
    const s = severidade(a);
    if (s.k !== 'low' || !s.motivo) continue;
    escolhidos.push({
      chave: a.chave,
      decisao: 'descartado',
      por: 'agente',
      motivo: s.motivo,
      nota: `autopilot L1: ${s.porque}`,
      recibo: a,
    });
  }
  return escolhidos;
}
