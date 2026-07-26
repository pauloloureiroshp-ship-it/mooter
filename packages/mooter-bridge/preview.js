'use strict';
/**
 * preview.js — mooter-bridge v1.6: descobrir sozinho onde é que a app está.
 *
 * O PROBLEMA, dito como o Paulo o disse:
 *
 *   "não vejo problema no final ter o abrir aqui, só que não mostra nada,
 *    talvez o localhost não está no endereço correto."
 *
 * Ele tinha razão e a culpa era do desenho. A v1.5 punha uma caixa de texto com
 * `http://localhost:5173` lá dentro e esperava que o utilizador soubesse a porta
 * do próprio dev server. Isso é exigir conhecimento a quem comprou o produto
 * precisamente para não ter de o ter — o mesmo erro que já tínhamos cometido
 * com as worktrees do git, e que já tínhamos escrito que não voltaríamos a
 * cometer.
 *
 * A OBSERVAÇÃO QUE RESOLVE:
 *
 * O painel vive num iframe com CSP apertada e não pode sondar nada. Mas o
 * servidor MCP corre em Node, na máquina do utilizador, sem restrição nenhuma.
 * Quem procura é o servidor; o painel só mostra o que ele encontrou. É a mesma
 * inversão que deu olhos ao modelo local em `context.js`.
 *
 * REGRAS QUE NÃO SE NEGOCEIAM:
 *   · só 127.0.0.1 e ::1 — nunca um endereço de rede, nunca um domínio
 *   · GET simples, sem corpo, sem cookies, sem seguir redireccionamentos para
 *     fora de localhost
 *   · uma porta que responde não é uma app: tem de devolver HTML
 *   · o que se aprende sobre a máquina fica na máquina (`~/.mooter/preview.json`)
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MOOTER_DIR = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
const MEM = path.join(MOOTER_DIR, 'preview.json');

/**
 * Portas por ordem de probabilidade real, não numérica.
 * Vite (5173) e Next (3000) são de longe as mais prováveis em 2026.
 */
const PORTAS = [5173, 3000, 4173, 5174, 3001, 8080, 8000, 4000, 4321, 1420, 5000, 8788, 9000, 39215];

/** Sinais de que aquilo é MESMO um servidor de desenvolvimento, com hot reload. */
const SINAIS_DEV = [
  { re: /\/@vite\/client|\/@react-refresh|vite\/dist\/client/i, nome: 'Vite', peso: 100 },
  { re: /\/_next\/static|__NEXT_DATA__|next\/dist\/client/i, nome: 'Next.js', peso: 100 },
  { re: /webpack-dev-server|__webpack_hmr|sockjs-node/i, nome: 'webpack dev server', peso: 90 },
  { re: /astro:scripts|\/@astrojs/i, nome: 'Astro', peso: 90 },
  { re: /\/@id\/|\/node_modules\/\.vite\//i, nome: 'Vite (módulos)', peso: 80 },
  { re: /livereload|browser-sync|hot-update/i, nome: 'hot reload genérico', peso: 70 },
  { re: /<div id="root"|<div id="app"|<div id="__next"/i, nome: 'app de página única', peso: 40 },
];

/**
 * ⚠️ Portas que respondem HTML mas NÃO são a app do utilizador. Mostrar uma
 * destas no Live Preview seria pior do que não mostrar nada: parece que
 * funcionou e não é o que ele quer ver.
 */
const NAO_E_APP = [
  { re: /ollama is running/i, nome: 'Ollama' },
  { re: /grafana|prometheus|kibana/i, nome: 'ferramenta de observabilidade' },
  { re: /jupyter|notebook server/i, nome: 'Jupyter' },
  { re: /minio|portainer|pgadmin|adminer/i, nome: 'painel de administração' },
];

function lerMemoria() {
  try { return JSON.parse(fs.readFileSync(MEM, 'utf8')); } catch { return { ultima: null, historico: {} }; }
}
function gravarMemoria(m) {
  try { fs.mkdirSync(MOOTER_DIR, { recursive: true }); fs.writeFileSync(MEM, JSON.stringify(m, null, 2)); }
  catch { /* a memória é um luxo; a descoberta funciona sem ela */ }
}

/**
 * Um GET a uma porta local. Devolve sempre — nunca lança.
 *
 * ⚠️ Lê no máximo 64 KB do corpo e corta. Um dev server pode servir um bundle de
 * megabytes e não precisamos de mais do que o `<head>` para o identificar.
 */
function sondar(porta, timeoutMs, host) {
  const alvo = host || '127.0.0.1';
  return new Promise((resolve) => {
    const t0 = Date.now();
    let feito = false;
    const fim = (r) => { if (!feito) { feito = true; resolve(Object.assign({ porta, host: alvo, ms: Date.now() - t0 }, r)); } };
    let req;
    try {
      req = http.get({
        host: alvo, port: porta, path: '/', timeout: timeoutMs || 700,
        // ❌ sem cookies, sem credenciais, sem keep-alive: uma sonda não é um cliente
        headers: { accept: 'text/html', 'user-agent': 'mooter-preview-probe' },
        agent: false,
      }, (res) => {
        const tipo = String(res.headers['content-type'] || '');
        const status = res.statusCode || 0;
        /**
         * ⚠️ UM DEV SERVER PODE RECUSAR SER EMBEBIDO — e descobrir uma porta que
         * o iframe vai depois rejeitar é pior do que não descobrir nada: parece
         * que funcionou e o utilizador fica com um rectângulo branco sem
         * explicação. (Codex, 2026-07-26.)
         */
        const xfo = String(res.headers['x-frame-options'] || '');
        const csp = String(res.headers['content-security-policy'] || '');
        const fa = (csp.match(/frame-ancestors([^;]*)/i) || [])[1] || '';
        const recusaIframe = /deny|sameorigin/i.test(xfo)
          || (!!fa && !/\*|localhost|127\.0\.0\.1|'self'/i.test(fa));
        // não é HTML → não é uma app para ver. Descarta sem ler o corpo.
        if (!/text\/html/i.test(tipo) || status >= 400) {
          res.destroy();
          return fim({ viva: status > 0, html: false, status, tipo, recusa_iframe: recusaIframe });
        }
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { corpo += d; if (corpo.length > 65536) res.destroy(); });
        res.on('end', () => fim({ viva: true, html: true, status, tipo, corpo, recusa_iframe: recusaIframe }));
        res.on('close', () => fim({ viva: true, html: true, status, tipo, corpo, recusa_iframe: recusaIframe }));
      });
    } catch { return fim({ viva: false, html: false, erro: 'não consegui abrir a ligação' }); }
    req.on('timeout', () => { try { req.destroy(); } catch { /* */ } fim({ viva: false, html: false, erro: 'timeout' }); });
    req.on('error', (e) => fim({ viva: false, html: false, erro: (e && e.code) || 'erro' }));
  });
}

/** Que tipo de coisa está a responder nesta porta, e quão certos estamos. */
function classificar(r) {
  if (!r.html || !r.corpo) return null;
  if (r.recusa_iframe) {
    return { descartar: true, porque: 'este servidor recusa ser embebido (X-Frame-Options / frame-ancestors) — o preview ficaria em branco' };
  }
  for (const n of NAO_E_APP) {
    if (n.re.test(r.corpo)) return { descartar: true, porque: 'isto é ' + n.nome + ', não a tua app' };
  }
  let peso = 10;                       // HTML sozinho já vale alguma coisa
  const sinais = [];
  for (const s of SINAIS_DEV) {
    if (s.re.test(r.corpo)) { peso = Math.max(peso, s.peso); sinais.push(s.nome); }
  }
  const titulo = (r.corpo.match(/<title[^>]*>([^<]{1,80})<\/title>/i) || [])[1] || null;
  return { peso, sinais, titulo: titulo ? titulo.trim() : null, descartar: false };
}

/**
 * Procura a app do utilizador em localhost.
 *
 * @param {object} opts  { timeout_ms, portas, incluir_mortas }
 * @returns {Promise<{candidatas:Array, escolhida:object|null, sondadas:number, nota:string}>}
 */
async function descobrir(opts) {
  const o = opts || {};
  const timeout = Math.min(Math.max(Number(o.timeout_ms) || 700, 150), 4000);
  const mem = lerMemoria();

  // a porta que funcionou da última vez vai à frente: o mesmo utilizador
  // tende a usar sempre o mesmo projecto, e acertar à primeira parece magia
  const lista = Array.isArray(o.portas) && o.portas.length
    ? o.portas.map(Number).filter((p) => p > 0 && p < 65536)
    : PORTAS.slice();
  if (mem.ultima && !lista.includes(mem.ultima)) lista.unshift(mem.ultima);
  else if (mem.ultima) { lista.splice(lista.indexOf(mem.ultima), 1); lista.unshift(mem.ultima); }

  /**
   * ⚠️ IPv4 **E** IPv6. Um dev server que escute só em `::1` era invisível a uma
   * sonda que só falasse 127.0.0.1 — e o utilizador via "não encontrei nada"
   * com a app dele a correr à frente. (Codex, 2026-07-26.)
   */
  const pares = [];
  for (const p of lista) { pares.push([p, '127.0.0.1']); pares.push([p, '::1']); }
  const brutos = await Promise.all(pares.map(([p, h]) => sondar(p, timeout, h)));
  // por porta, fica a melhor das duas famílias
  const porPorta = new Map();
  for (const r of brutos) {
    const ant = porPorta.get(r.porta);
    if (!ant || (r.html && !ant.html)) porPorta.set(r.porta, r);
  }
  const res = [...porPorta.values()];

  const candidatas = [];
  const descartadas = [];
  for (const r of res) {
    const c = classificar(r);
    if (!c) continue;
    if (c.descartar) { descartadas.push({ porta: r.porta, porque: c.porque }); continue; }
    candidatas.push({
      url: 'http://localhost:' + r.porta,
      porta: r.porta,
      titulo: c.titulo,
      sinais: c.sinais.length ? c.sinais : null,
      confianca: c.peso >= 90 ? 'alta' : (c.peso >= 40 ? 'media' : 'baixa'),
      peso: c.peso + (mem.historico && mem.historico[r.porta] ? Math.min(mem.historico[r.porta] * 5, 25) : 0),
      ms: r.ms,
    });
  }
  candidatas.sort((a, b) => (b.peso - a.peso) || (a.ms - b.ms));

  const escolhida = candidatas[0] || null;
  return {
    candidatas,
    escolhida,
    descartadas: descartadas.length ? descartadas : null,
    sondadas: lista.length,
    // ⚠️ nunca dizer "não tens nada a correr" — dizer o que se procurou e onde
    nota: escolhida
      ? ('encontrei ' + candidatas.length + ' servidor(es) local(is); escolhi ' + escolhida.url
         + (escolhida.sinais ? ' (' + escolhida.sinais.join(', ') + ')' : ''))
      : ('sondei ' + lista.length + ' portas em 127.0.0.1 e ::1 e nenhuma devolveu HTML utilizável. '
         + (descartadas.length ? 'Descartei ' + descartadas.length + ': ' + descartadas.map((x) => x.porta + ' (' + x.porque + ')').join('; ') + '. ' : '')
         + 'Arranca o teu servidor de desenvolvimento (npm run dev) e volta a procurar, '
         + 'ou diz-me a porta se ela não estiver na lista.'),
  };
}

/** Confirmar que a escolha do utilizador funcionou, para acertar melhor à próxima. */
function lembrar(porta) {
  const p = Number(porta);
  if (!(p > 0 && p < 65536)) return { ok: false, erro: 'porta inválida' };
  const mem = lerMemoria();
  mem.ultima = p;
  mem.historico = mem.historico || {};
  mem.historico[p] = (mem.historico[p] || 0) + 1;
  mem.em = new Date().toISOString();
  gravarMemoria(mem);
  return { ok: true, ultima: p, vezes: mem.historico[p] };
}

module.exports = { descobrir, lembrar, sondar, classificar, PORTAS, SINAIS_DEV, NAO_E_APP, MEM };
