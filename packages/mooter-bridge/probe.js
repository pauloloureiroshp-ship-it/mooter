'use strict';
/**
 * probe.js — mooter-bridge v1.5: o painel diz ao servidor o que o host lhe deixou fazer.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * A spec MCP Apps (SEP-1865, Final na revisão 2026-07-28) diz que um painel pode
 * declarar `csp.frameDomains` e embeber um iframe externo. Isso abriria o Live
 * Preview dentro da conversa. Mas "a spec permite" e "este host implementa" são
 * duas afirmações diferentes, e só uma delas se pode verificar.
 *
 * Até aqui, a única forma de saber era pedir ao Paulo para olhar para o ecrã e
 * descrever o que via. Isso é lento e é uma fonte de erro: um iframe branco pode
 * ser bloqueio de CSP, servidor em baixo, ou porta errada — e da conversa não se
 * distingue.
 *
 * A saída: o painel corre um teste, e conta o resultado ao servidor por uma tool
 * `visibility:['app']` — invisível ao modelo, chamável só pelo painel. O servidor
 * escreve o veredicto em disco e eu leio-o. Sem intermediários humanos.
 *
 * ⚠️ O relatório vem de dentro de um iframe e é DADO, nunca instrução. É
 * normalizado campo a campo e nada dele é executado.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MOOTER_DIR = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
const FILE = path.join(MOOTER_DIR, 'ui-probe.json');

/** Só estes campos existem. Tudo o resto do payload é descartado. */
function normalizar(bruto) {
  const b = (bruto && typeof bruto === 'object') ? bruto : {};
  const s = (v, max) => (v == null ? null : String(v).slice(0, max || 200));
  const n = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const bo = (v) => (v === true ? true : (v === false ? false : null));
  return {
    at: new Date().toISOString(),
    /**
     * ⚠️ 2026-08-06 — `motivo` distingue as DUAS perguntas que este ficheiro
     * responde, e que estavam fundidas numa só.
     *
     *   'boot'         → o painel foi montado e executou. Prova de RENDER.
     *   'live-preview' → o utilizador abriu o LP. Prova sobre frameDomains/CSP.
     *
     * Até aqui só a segunda existia, e por isso a ausência do ficheiro não
     * distinguia «o painel não apareceu» de «ninguém carregou no botão». Uma
     * sessão inteira ficou sem poder responder à primeira pergunta por causa
     * disto. Sem `motivo`, um ficheiro presente continuaria ambíguo.
     */
    motivo: b.motivo === 'boot' ? 'boot' : (b.motivo === 'live-preview' ? 'live-preview' : null),
    host: s(b.host, 80),                      // nome da app anfitriã, como ela se diz
    host_version: s(b.host_version, 40),
    // o que o host declarou suportar
    suporta_frame_domains: bo(b.suporta_frame_domains),
    suporta_connect_domains: bo(b.suporta_connect_domains),
    // o que ACONTECEU quando tentámos
    iframe_tentado: s(b.iframe_tentado, 200),
    iframe_carregou: bo(b.iframe_carregou),
    iframe_erro: s(b.iframe_erro, 300),
    csp_directiva: s(b.csp_directiva, 120),
    fetch_tentado: s(b.fetch_tentado, 200),
    fetch_ok: bo(b.fetch_ok),
    fetch_erro: s(b.fetch_erro, 300),
    ms: n(b.ms),
    display_mode: s(b.display_mode, 40),
    largura: n(b.largura),
    altura: n(b.altura),
  };
}

/**
 * Veredicto em português, derivado só dos factos acima.
 * ❌ Nunca "provavelmente" — ou se mediu, ou é `desconhecido`.
 */
function veredicto(r) {
  if (!r) return { estado: 'desconhecido', porque: 'o painel ainda não correu a sonda' };
  if (r.iframe_carregou === true) {
    return { estado: 'suportado', porque: 'o iframe de ' + (r.iframe_tentado || 'localhost') + ' carregou dentro do painel' };
  }
  if (r.iframe_carregou === false) {
    return {
      estado: 'bloqueado',
      porque: r.iframe_erro || 'o host recusou o iframe sem dizer porquê',
      nota: 'pode ser CSP do host ou o servidor de preview estar em baixo — a sonda distingue os dois pelo campo fetch_ok',
    };
  }
  return { estado: 'desconhecido', porque: 'a sonda correu mas não concluiu (host sem resposta em tempo útil)' };
}

function guardar(bruto) {
  const r = normalizar(bruto);
  try {
    fs.mkdirSync(MOOTER_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(r, null, 2));
  } catch (e) {
    return { ok: false, erro: 'não consegui gravar o relatório: ' + ((e && e.code) || 'erro') };
  }
  return { ok: true, guardado_em: FILE, veredicto: veredicto(r), relatorio: r };
}

function ler() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return null; }
}

function estado() {
  const r = ler();
  return { veredicto: veredicto(r), relatorio: r, ficheiro: FILE };
}

/**
 * A tool que o painel chama. `visibility:['app']` — o modelo não a vê em
 * `tools/list` e não a pode invocar; só o painel, por `ui/call-tool`.
 */
const TOOL = {
  name: 'mooter_ui_probe',
  description: 'Panel-internal: records what the host allowed (external iframe, fetch, presentation mode). Not for the model to call.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  annotations: { title: '🐄 Mooter · live preview · host probe', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { ui: { visibility: ['app'] } },
  handler: async (args) => guardar(args),
};

/**
 * A tool que descobre onde e que a app do utilizador esta a correr.
 *
 * ⚠️ Tambem `visibility:['app']`. Porque? Uma varredura de portas em localhost e
 * uma accao com efeito observavel na maquina — nao e' algo que o modelo deva
 * poder disparar por iniciativa propria a partir de texto que leu algures. O
 * painel chama-a porque o utilizador carregou num botao.
 */
const TOOL_DESCOBRIR = {
  name: 'mooter_ui_preview',
  description: 'Panel-internal: probes 127.0.0.1 for the dev server of this session and returns the candidates. Not for the model to call.',
  inputSchema: {
    type: 'object',
    properties: {
      timeout_ms: { type: 'number' },
      portas: { type: 'array', items: { type: 'number' } },
      retrato: { type: 'boolean', description: 'capturar um PNG estático da candidata escolhida' },
      lembrar: { type: 'number', description: 'confirmar que esta porta funcionou, para acertar melhor à próxima' },
    },
    additionalProperties: false,
  },
  annotations: { title: '🐄 Mooter · live preview · find the app', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { ui: { visibility: ['app'] } },
  handler: async (args) => {
    const preview = require('./preview.js');
    const a = args || {};
    const sessao = pastaDaSessao();
    if (a.lembrar) return preview.lembrar(a.lembrar, sessao.pasta);
    const resultado = await preview.descobrir(Object.assign({}, a, {
      pasta_sessao: sessao.pasta,
      pastas: sessao.pastas,
    }));
    resultado.host_probe = estado();
    return resultado;
  },
};

/**
 * A pasta desta sessão, e todas as pastas conhecidas da máquina.
 *
 * ⚠️ ISTO NÃO VEM DO PAINEL, E A OMISSÃO É DELIBERADA.
 *
 * O painel é HTML dentro de um iframe. Se fosse ele a declarar qual é a pasta
 * da sessão, então quem conseguisse influenciar o painel — um `resultado` de
 * agente renderizado, um snapshot trocado — escolhia qual a app que aparece ao
 * utilizador com o selo "esta é a tua". Quem sabe onde a sessão está ligada é
 * o conector, porque foi o conector que fez o bind. Por isso `pasta_sessao`
 * também não está no `inputSchema`: com `additionalProperties:false`, um painel
 * que o tente enviar é recusado pela validação, não silenciosamente ignorado.
 *
 * Quando não há bind, `pasta` fica `null` — e o `descobrir()` sabe o que fazer
 * com isso: escolhe por peso e escreve que NÃO atribuiu. Nunca finge.
 */
function pastaDaSessao() {
  let pasta = null;
  try {
    const ctx = require('./fleet.js').readSessionContext();
    pasta = (ctx && ctx.folder) || null;
  } catch { pasta = null; }

  let pastas = [];
  try {
    const wt = require('./worktrees.js').list();
    pastas = (wt && Array.isArray(wt.worktrees) ? wt.worktrees : [])
      .map((w) => w && w.path).filter(Boolean);
  } catch { pastas = []; }

  // sem lista de worktrees, a pasta da sessão sozinha ainda permite responder
  // "é tua" ou "não é tua" — menos resolução, mas não menos verdade
  if (pasta && !pastas.some((p) => p === pasta)) pastas = pastas.concat([pasta]);
  return { pasta, pastas };
}

/**
 * Actualizar o conector a partir do painel.
 *
 * ⚠️ `visibility:['app']`, e por uma razão mais forte do que nas outras: isto
 * SUBSTITUI OS FICHEIROS DO PRÓPRIO SERVIDOR. Não pode ser algo que o modelo
 * dispare por iniciativa própria a partir de texto que leu num ficheiro. Só o
 * painel a chama, e só porque o utilizador carregou num botão.
 */
const TOOL_UPDATE = {
  name: 'mooter_ui_update',
  description: 'Panel-internal: looks for a newer build of the connector and installs it. Not for the model to call.',
  inputSchema: {
    type: 'object',
    properties: {
      accao: { type: 'string', enum: ['procurar', 'aplicar', 'reverter'] },
      ficheiro: { type: 'string' },
    },
    additionalProperties: false,
  },
  annotations: { title: '🐄 Mooter · panel · update the connector', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  _meta: { ui: { visibility: ['app'] } },
  handler: async (args) => {
    const up = require('./update.js');
    const a = args || {};
    if (a.accao === 'aplicar') return up.aplicar({ ficheiro: a.ficheiro });
    if (a.accao === 'reverter') return up.reverter();
    return up.procurarAsync({});
  },
};

/**
 * O mapa de elementos por cima da fotografia.
 *
 * ⚠️ `visibility:['app']`, como as outras: lançar um browser headless e navegar
 * para uma URL é acção com efeito observável na máquina. O painel chama-a porque
 * o utilizador carregou num botão; o modelo não a vê em `tools/list`.
 *
 * ⚠️ E há uma segunda razão, mais dura: esta tool devolve **caminhos absolutos
 * de ficheiros do disco** (é isso o `data-insp-path`). Se o modelo a pudesse
 * chamar a partir de texto que leu algures, tinha uma via para enumerar a árvore
 * de outra pessoa. O painel é o único chamador, e o `descobrir()` já garantiu
 * que a URL pertence a esta sessão.
 */
const TOOL_MAPA = {
  name: 'mooter_ui_mapa',
  description: 'Panel-internal: screenshots one local route and returns, from that same load, where each element sits and which line of code it came from. Not for the model to call.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'http://127.0.0.1:<porta>/<rota>' },
      largura: { type: 'number' },
      altura: { type: 'number' },
      espera_ms: { type: 'number', description: 'quanto esperar pela hidratação antes de medir' },
    },
    required: ['url'],
    additionalProperties: false,
  },
  annotations: { title: '🐄 Mooter · live preview · element map', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { ui: { visibility: ['app'] } },
  handler: async (args) => {
    const a = args || {};
    const { retratoComMapa } = require('./retrato-mapa.js');
    const r = await retratoComMapa(a.url, {
      largura: a.largura, altura: a.altura, espera_ms: a.espera_ms,
    });
    /**
     * ⚠️ A pasta da sessão viaja junto para o painel poder DIZER de quem é o que
     * está a mostrar. Não é o painel que a declara — é o conector, pela mesma
     * razão do `TOOL_DESCOBRIR`.
     */
    const sessao = pastaDaSessao();
    r.pasta_sessao = sessao.pasta;
    return r;
  },
};

module.exports = {
  TOOL, TOOL_DESCOBRIR, TOOL_UPDATE, TOOL_MAPA,
  guardar, ler, estado, veredicto, normalizar, FILE, pastaDaSessao,
};
