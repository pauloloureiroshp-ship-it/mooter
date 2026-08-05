'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════════
 * trilha-tool.js — a porta MCP da Trilha.
 *
 * `trilha.js` é o MODELO (puro: recebe dados, devolve estrutura). Este ficheiro
 * é a única coisa que lhe toca no disco: lê o transcrito do host, lê o ledger,
 * funde, e devolve. Toda a I/O é injectável para que a suite exercite o caminho
 * real em vez de uma cópia.
 *
 * ⚠️ `require('./trilha.js')` é PREGUIÇOSO, e a razão é dura: um `require` no
 * topo faz o servidor inteiro morrer no arranque se o módulo faltar num bundle
 * mal empacotado — e o host reporta «could not attach» sem dizer porquê. Uma
 * tool que falha a dizer o que lhe falta é um problema; um conector que não
 * arranca é o fim da sessão. A falha fica visível na resposta da tool, com a
 * mensagem do erro, nunca engolida.
 *
 * ⚠️ `visibility:['app']` — esta tool devolve o CAMINHO ABSOLUTO do transcrito
 * que leu (é isso a proveniência: qual sessão é que eu li). O painel chama-a;
 * o modelo não a vê em `tools/list`. É a mesma regra das `mooter_ui_*`.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Só a Trilha sabe ler-se a si própria — mas a falha tem de ser legível. */
function carregarModelo() {
  try { return { mod: require('./trilha.js'), erro: null }; }
  catch (e) { return { mod: null, erro: (e && e.message) || String(e) }; }
}

/**
 * A pergunta que nenhum concorrente responde: em cada passo desta sessão, quem
 * trabalhou, quanto custou, e onde ficou registo.
 *
 * @param {object} args  {wave, desde, formato}
 * @param {object} deps  I/O injectável: {trilha, ledgerRead, foldJobs}
 */
async function construir(args, deps) {
  const a = args || {};
  const d = deps || {};
  const carga = d.trilha ? { mod: d.trilha, erro: null } : carregarModelo();
  if (!carga.mod) {
    return {
      resumo: '⛔ nao consegui carregar o modelo da Trilha',
      error: carga.erro,
      porque: 'trilha.js nao esta ao lado de trilha-tool.js neste pacote — o conector continua vivo, esta tool e que nao responde',
    };
  }
  const trilha = carga.mod;

  const desdeMs = a.desde ? (Date.parse(a.desde) || null) : null;
  const desdeInvalido = !!(a.desde && !desdeMs);

  /* 1 · o host. Numa sessão Cowork isto não existe, e dizer-se é o ponto. */
  const host = trilha.lerHost({ desdeMs: desdeMs || undefined });

  /* 2 · o ledger. Os jobs existem nas duas superfícies — é o conector que os
     escreve. Sem ledger legível não se finge zero: a lista vem vazia e o
     `porque` do host continua a explicar o resto. */
  const eventos = (d.ledgerRead || (() => require('./seamless.js').ledgerRead()))();
  const foldJobs = d.foldJobs || require('./fleet.js').foldJobs;
  let jobs = foldJobs(eventos);
  if (a.wave) jobs = jobs.filter((j) => j.wave === a.wave);

  /* ⚠️ `registos` fica VAZIO e declarado. Hoje só o Obsidian escreve nota
     (`journal.writeNote`), e o `jobs:` que ela leva no frontmatter não é
     indexado em lado nenhum que o conector possa ler de volta. O Notion não
     tem recibo de escrita nenhum. Inventar aqui um destino era exactamente a
     métrica fabricada que este produto existe para não ter. */
  const linhasDoLedger = trilha.dosJobs(jobs, { registos: {} });

  /* 3 · a janela. Cortamos LINHAS (uma linha = uma cadeia inteira), nunca jobs
     soltos: filtrar jobs partia a cadeia e o filho aparecia como trabalho
     independente — a mesma peça contada duas vezes, ao contrário. */
  const antes = linhasDoLedger.length;
  const doLedger = desdeMs ? linhasDoLedger.filter((l) => !l.at || l.at >= desdeMs) : linhasDoLedger;
  const cortadas = antes - doLedger.length;

  const modelo = trilha.fundir(host, doLedger, { tecto_vivos: a.tecto_vivos });
  const texto = trilha.texto(modelo, { projecto: a.projecto || null });

  const out = {
    resumo: texto.split('\n')[0],
    texto,
    host: modelo.host,
    medido: modelo.resumo,
    corrente: modelo.corrente,
    passos_total: modelo.linhas.length,
    /* O índice da corrente refere-se à lista ORDENADA — e a lista ordenada é
       `passos`. Quem só pedir o texto tem de saber a que é que o índice se
       refere, senão indexa a coisa errada (foi assim que o Cockpit abriu o job
       errado: renderizava a ordem crua e indexava a ordenada). */
    corrente_indice_refere: 'passos[] — a lista JA ORDENADA por tempo',
    registos_fonte: {
      disponivel: false,
      porque: 'so o vault Obsidian escreve recibo hoje, e a ligacao job->nota nao fica indexada em lado nenhum que o conector leia de volta',
      destinos_com_recibo: [],
    },
  };
  if (cortadas) {
    out.passos_cortados = cortadas;
    out.passos_cortados_porque = cortadas + ' cadeia(s) comecaram antes de ' + a.desde + ' — cortadas inteiras, nunca a meio';
  }
  if (desdeInvalido) out.desde_ignorado = 'nao consegui ler "' + a.desde + '" como instante ISO — mostrei tudo';
  if (a.formato === 'tudo') out.passos = modelo.linhas;
  else out.passos_omitidos = 'pede formato:"tudo" para receber os ' + modelo.linhas.length + ' passos em estrutura';
  return out;
}

const TOOL = {
  name: 'mooter_trilha',
  description: 'The audit trail of this session, step by step: who worked (local GPU, Claude, Codex, Kimi, Gemini), what each step cost, and where a receipt was written. Two sources, never interchangeable: the host transcript (may not exist at all in a cloud session - it says so instead of faking it) and the Mooter ledger, which always exists. Panel-internal: it returns the absolute path of the transcript it read.',
  inputSchema: {
    type: 'object',
    properties: {
      wave: { type: 'string', description: 'Only the jobs of this wave.' },
      desde: { type: 'string', description: 'ISO instant. Whole chains that started earlier are dropped, never cut in half.' },
      formato: { type: 'string', enum: ['texto', 'tudo'], description: 'texto (default) = the rendered trail plus the counters; tudo = every step as structure.' },
      projecto: { type: 'string', description: 'Project name for the header.' },
      tecto_vivos: { type: 'number', minimum: 1, maximum: 8, description: 'Above this many live steps the "here" marker stays quiet and says why. Default 3.' },
    },
    additionalProperties: false,
  },
  annotations: { title: '🐄 Mooter · the session audit trail', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { ui: { visibility: ['app'] } },
  handler: (args) => construir(args, {}),
};

module.exports = { TOOL, construir };
