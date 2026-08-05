'use strict';
/**
 * retrato-mapa.js — a fotografia deixa de ser só uma fotografia.
 *
 * O QUE ISTO DESBLOQUEIA
 *
 * O painel do Cowork não pode embeber o dev server: a CSP do host recusa
 * `frame-src` para localhost, medido a 2026-08-04. Por isso o Live Preview
 * mostra um PNG. Um PNG não se clica, e sem clique não há "escolhe este botão
 * e muda-o" — que é a coisa toda.
 *
 * A saída não é lutar com a CSP. É **capturar, junto com a imagem, onde está
 * cada elemento e de que linha de código ele veio**. O painel desenha zonas
 * invisíveis por cima da imagem; o utilizador carrega numa e o painel sabe
 * exactamente `ficheiro:linha:coluna`. A imagem é estática — o mapa não é.
 *
 * ⚠️ ISTO NÃO É UM IFRAME, E NÃO SE VENDE COMO TAL. Não há hover vivo, nem
 * scroll contínuo, nem formulários, nem animação. Cada rota é uma fotografia
 * nova. O que se ganha é a selecção e o caminho até ao código; o que se perde
 * é a página viva. Dizer o contrário seria a mesma mentira que o `onload` do
 * iframe contava sobre portas mortas.
 *
 * DE ONDE VEM A VERDADE DO MAPA
 *
 * `code-inspector-plugin` (ligado em `landing/next.config.ts:80`) carimba cada
 * elemento com `data-insp-path="ficheiro:linha:coluna:tag"`. Não somos nós a
 * adivinhar de que componente veio um botão — é o compilador a dizê-lo. E o
 * `landing/app/_components/lp-error-tap.ts` já usa o mesmo atributo do lado do
 * plugin VS Code: **uma fonte, dois consumidores**, em vez de duas verdades.
 *
 * PORQUÊ CDP E NÃO `--screenshot`
 *
 * O `chrome --headless --screenshot` tira a foto e cala-se: não há como
 * perguntar à página onde ficaram os elementos. O protocolo de depuração deixa
 * fazer as duas coisas na mesma sessão — navegar, medir e fotografar o MESMO
 * estado. Medir num carregamento e fotografar noutro daria um mapa desalinhado
 * com a imagem, e um mapa desalinhado é pior do que nenhum: o utilizador
 * carrega no título e edita o rodapé.
 *
 * ⚠️ SEM DEPENDÊNCIAS. O `WebSocket` é o nativo do Node (≥22). Não entra `ws`,
 * não entra puppeteer: este ficheiro vive dentro de um conector que o
 * utilizador instala, e cada dependência nova é uma superfície nova.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ARRANQUE_TIMEOUT_MS = 15000;
const COMANDO_TIMEOUT_MS = 20000;
const TAMANHO = { largura: 1280, altura: 900 };
/** Tecto de elementos no mapa. Uma página densa traz milhares; o painel não os desenha todos. */
const MAX_ZONAS = 400;

/**
 * O script que corre DENTRO da página.
 *
 * ⚠️ Só lê. Não clica, não submete, não navega. Um extractor que mexesse na
 * página mudaria aquilo que a fotografia ia mostrar a seguir — mediria o efeito
 * de si próprio.
 */
const EXTRACTOR = `(() => {
  const out = [];
  const vistos = new Set();
  const els = document.querySelectorAll('[data-insp-path]');
  for (const el of els) {
    const r = el.getBoundingClientRect();
    // fora do ecrã, ou sem área: não há onde carregar
    if (r.width < 4 || r.height < 4) continue;
    if (r.bottom < 0 || r.right < 0) continue;
    const bruto = el.getAttribute('data-insp-path') || '';
    // ⚠️ dividir A PARTIR DA DIREITA: "C:\\\\Users\\\\x\\\\a.tsx:12:4:div" tem
    // dois pontos no caminho do Windows. Da esquerda partia o "C:".
    const p = bruto.split(':');
    const tag = p.pop(); const col = p.pop(); const lin = p.pop();
    const ficheiro = p.join(':');
    if (!ficheiro) continue;
    const chave = ficheiro + ':' + lin + ':' + col;
    const texto = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
    out.push({
      ficheiro: ficheiro, linha: Number(lin) || null, coluna: Number(col) || null,
      tag: tag || el.tagName.toLowerCase(),
      x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY),
      w: Math.round(r.width), h: Math.round(r.height),
      area: Math.round(r.width * r.height),
      texto: texto || null,
      repetido: vistos.has(chave),
      classe: (el.className && typeof el.className === 'string') ? el.className.slice(0, 60) : null,
    });
    vistos.add(chave);
  }
  const links = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    // só rotas internas: um preview que navega para fora deixa de ser preview
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const r = a.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    links.push({ href: href, x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY),
                 w: Math.round(r.width), h: Math.round(r.height),
                 texto: (a.textContent || '').trim().slice(0, 60) || null });
  }
  return JSON.stringify({
    zonas: out,
    links: links,
    lp_root: (window.__NEXT_DATA__ && window.__NEXT_DATA__.props
              && window.__NEXT_DATA__.props.pageProps
              && window.__NEXT_DATA__.props.pageProps.__lpRoot) || null,
    titulo: document.title || null,
    altura_total: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    url: location.href,
  });
})()`;

/**
 * ⚠️ `MOOTER_BROWSER` existe para o mesmo motivo que o `execImpl` do `dono.js`:
 * um módulo que só se consegue exercitar na máquina do Paulo não é verificável.
 * Serve também a quem tem o Chrome fora do sítio habitual — e nesse caso a
 * alternativa seria dizer-lhe "não encontrei browser" sem saída nenhuma.
 */
function candidatosBrowser() {
  const declarado = process.env.MOOTER_BROWSER;
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  return [
    ...(declarado ? [declarado] : []),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'chrome', 'msedge', 'chromium',
  ];
}

function pedirJson(porta, caminho) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: porta, path: caminho, timeout: 2000 }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { b += d; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { try { req.destroy(); } catch { /* */ } resolve(null); });
  });
}

/**
 * Espera pela porta de depuração e devolve o endereço da PÁGINA.
 *
 * ⚠️ NÃO É O MESMO QUE O DO BROWSER. O `/json/version` dá o alvo do browser,
 * que só fala `Target` e `Browser` — pedir-lhe `Page.enable` devolve
 * *"'Page.enable' wasn't found"*, que se lê como versão incompatível e manda
 * quem depura para o caminho errado. Quem responde por `Page` e `Runtime` é o
 * alvo `type:"page"`, listado em `/json/list`. Sem adivinhar o tempo de
 * arranque: pergunta-se até haver, com tecto.
 */
async function esperarPorta(porta, atMs) {
  for (;;) {
    const lista = await pedirJson(porta, '/json/list');
    if (Array.isArray(lista)) {
      const pagina = lista.find((t) => t && t.type === 'page' && t.webSocketDebuggerUrl);
      if (pagina) return pagina;
    }
    if (Date.now() > atMs) return null;
    await new Promise((r) => setTimeout(r, 150));
  }
}

/**
 * Uma conversa CDP. Cada comando tem id próprio e a resposta é casada por id —
 * as respostas chegam fora de ordem e casá-las por ordem de chegada seria
 * atribuir a resposta de um comando a outro.
 */
function ligar(url) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket !== 'function') {
      reject(new Error('este Node não traz WebSocket nativo (é preciso Node 22 ou mais recente)'));
      return;
    }
    const ws = new WebSocket(url);
    const pendentes = new Map();
    let n = 0;
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.id && pendentes.has(m.id)) {
        const { ok, mau, timer } = pendentes.get(m.id);
        clearTimeout(timer);
        pendentes.delete(m.id);
        if (m.error) mau(new Error(m.error.message || 'erro do protocolo'));
        else ok(m.result);
      }
    });
    ws.addEventListener('error', () => reject(new Error('a ligação ao browser falhou')));
    ws.addEventListener('open', () => resolve({
      enviar(metodo, params) {
        return new Promise((ok, mau) => {
          const id = ++n;
          const timer = setTimeout(() => {
            pendentes.delete(id);
            mau(new Error(metodo + ' não respondeu em ' + COMANDO_TIMEOUT_MS + ' ms'));
          }, COMANDO_TIMEOUT_MS);
          pendentes.set(id, { ok, mau, timer });
          ws.send(JSON.stringify({ id, method: metodo, params: params || {} }));
        });
      },
      fechar() { try { ws.close(); } catch { /* já fechado */ } },
    }));
  });
}

/**
 * Fotografia + mapa da mesma rota, no mesmo carregamento.
 *
 * @param {string} url        http://127.0.0.1:7819/rota
 * @param {object} opts       { largura, altura, espera_ms, browserImpl }
 * @returns {Promise<object>} { ok, data_url, bytes, zonas, links, ms, porque }
 */
async function retratoComMapa(url, opts) {
  const o = opts || {};
  const t0 = Date.now();
  const alvo = String(url || '');
  if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}(\/|$)/.test(alvo)) {
    return { ok: false, porque: 'só é permitido http em localhost com porta explícita', ms: 0 };
  }

  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-cdp-'));
  const porta = 9333 + (process.pid % 500);
  let proc = null;
  let sessao = null;
  const tentados = [];

  try {
    for (const exe of candidatosBrowser()) {
      tentados.push(exe);
      if (path.isAbsolute(exe) && !fs.existsSync(exe)) continue;
      try {
        proc = spawn(exe, [
          '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
          '--no-first-run', '--no-default-browser-check',
          /**
           * ⚠️ O sandbox do Chromium não arranca com uid 0. Em Windows isto
           * nunca dispara — em Windows não há uid. Existe para o módulo poder
           * ser exercitado num container de CI, que é onde os testes correm;
           * baixar a defesa na máquina de quem instalou o produto por
           * conveniência de teste seria trocar segurança por comodidade.
           */
          ...(typeof process.getuid === 'function' && process.getuid() === 0 ? ['--no-sandbox'] : []),
          '--user-data-dir=' + perfil,
          '--remote-debugging-port=' + porta,
          '--window-size=' + (o.largura || TAMANHO.largura) + ',' + (o.altura || TAMANHO.altura),
          'about:blank',
        ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
        /**
         * ⚠️ SEM ISTO, UMA MÁQUINA SEM CHROME DERRUBAVA O CONECTOR INTEIRO.
         * `spawn` não lança para ENOENT — emite `error` de forma assíncrona, e
         * um `error` sem ouvinte num EventEmitter é excepção não apanhada que
         * mata o processo. O `try/catch` à volta do `spawn` dá uma falsa
         * sensação de cobertura: ele nunca vê este erro. Apanhado a correr o
         * teste, não em revisão.
         */
        proc.on('error', () => { /* candidato inexistente; o laço tenta o seguinte */ });
      } catch { proc = null; continue; }
      const v = await esperarPorta(porta, Date.now() + ARRANQUE_TIMEOUT_MS);
      if (v) { sessao = await ligar(v.webSocketDebuggerUrl); break; }
      try { proc.kill(); } catch { /* */ }
      proc = null;
    }
    if (!sessao) {
      return { ok: false, porque: 'nenhum browser aceitou abrir a porta de depuração', tentados, ms: Date.now() - t0 };
    }

    await sessao.enviar('Page.enable');
    await sessao.enviar('Runtime.enable');
    await sessao.enviar('Emulation.setDeviceMetricsOverride', {
      width: o.largura || TAMANHO.largura, height: o.altura || TAMANHO.altura,
      deviceScaleFactor: 1, mobile: false,
    });
    await sessao.enviar('Page.navigate', { url: alvo });

    // ⚠️ esperar o `load` E um tempo de assentamento: o Next hidrata depois do
    // load, e um mapa tirado antes da hidratação aponta para o esqueleto.
    await new Promise((r) => setTimeout(r, Math.min(Math.max(Number(o.espera_ms) || 1200, 300), 8000)));

    const av = await sessao.enviar('Runtime.evaluate', {
      expression: EXTRACTOR, returnByValue: true, awaitPromise: false,
    });
    if (av && av.exceptionDetails) {
      return { ok: false, porque: 'o extractor rebentou dentro da página: '
        + ((av.exceptionDetails.exception && av.exceptionDetails.exception.description) || 'sem detalhe'),
        ms: Date.now() - t0 };
    }
    let dados = {};
    try { dados = JSON.parse((av && av.result && av.result.value) || '{}'); } catch { dados = {}; }

    const tiro = await sessao.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const b64 = (tiro && tiro.data) || '';
    if (!b64) return { ok: false, porque: 'o browser não devolveu imagem', ms: Date.now() - t0 };

    const zonas = (dados.zonas || [])
      // as menores primeiro: um botão dentro de uma secção tem de ganhar o clique
      .sort((a, b) => a.area - b.area)
      .slice(0, MAX_ZONAS);

    return {
      ok: true,
      url: alvo,
      data_url: 'data:image/png;base64,' + b64,
      bytes: Math.round(b64.length * 0.75),
      largura: o.largura || TAMANHO.largura,
      altura: o.altura || TAMANHO.altura,
      titulo: dados.titulo || null,
      zonas,
      zonas_totais: (dados.zonas || []).length,
      zonas_cortadas: Math.max(0, (dados.zonas || []).length - zonas.length),
      links: dados.links || [],
      lp_root: dados.lp_root || null,
      // ⚠️ zero zonas não é "a página está vazia" — é quase sempre o injector desligado
      porque: (dados.zonas || []).length === 0
        ? 'a página não traz nenhum elemento com data-insp-path: o code-inspector-plugin '
          + 'não está a injectar (verifica se o dev server corre em webpack e não em turbopack)'
        : null,
      capturado_em: new Date().toISOString(),
      ms: Date.now() - t0,
    };
  } catch (erro) {
    return { ok: false, porque: (erro && erro.message) || String(erro), ms: Date.now() - t0 };
  } finally {
    if (sessao) sessao.fechar();
    if (proc) { try { proc.kill(); } catch { /* já morreu */ } }
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* o SO limpa */ }
  }
}

module.exports = { retratoComMapa, EXTRACTOR, TAMANHO, MAX_ZONAS };
