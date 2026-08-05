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
const { spawn } = require('child_process');
const dono = require('./dono.js');
const { chave } = require('./paths.js');
const { portasDoProjecto } = require('./portas-do-projecto.js');

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

const RETRATO_TIMEOUT_MS = 15000;
const RETRATO_TAMANHO = { largura: 1280, altura: 800 };

/**
 * ⚠️ `[::1]` passou a ser aceite, e não é laxismo — é o contrário.
 *
 * A descoberta sonda IPv4 **e** IPv6. Quando quem responde é o `::1`, a única
 * forma de nomear esse servidor sem ambiguidade é `http://[::1]:porta`; dizer
 * `localhost` deixa a resolução ao sistema, que pode escolher a OUTRA família —
 * e aí os sinais mostrados vêm de um servidor e o retrato vem de outro, na
 * mesma porta. (codex, 2026-08-04.) `::1` é loopback tal como `127.0.0.1`: o
 * perímetro não se alargou, ficou é escrito com precisão.
 *
 * E escreve-se `[::1]` COM PARÊNTESES RECTOS, não `::1`.
 * `new URL('http://[::1]:5173').hostname` devolve `'[::1]'` — a WHATWG mantém
 * os parênteses no hostname de um literal IPv6. Escrever `'::1'` aqui deixava
 * a guarda a recusar exactamente o endereço que ela existe para permitir, e o
 * teste apanhou-o. Mais uma vez: valida o instrumento.
 */
const HOSTS_LOCAIS = ['localhost', '127.0.0.1', '[::1]'];

function urlLocalValida(valor) {
  const bruto = String(valor || '');
  if (!/^http:\/\//i.test(bruto)) return { ok: false, erro: 'só é permitido http:// em localhost' };
  const local = bruto.match(/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):(\d{1,5})(?:[/?#]|$)/i);
  if (!local) return { ok: false, erro: 'só é permitido localhost, 127.0.0.1 ou [::1] com porta explícita' };
  const porta = Number(local[2]);
  if (!(porta > 0 && porta < 65536)) return { ok: false, erro: 'a url local tem de declarar uma porta válida' };
  let url;
  try { url = new URL(bruto); }
  catch { return { ok: false, erro: 'url inválida' }; }
  if (!HOSTS_LOCAIS.includes(url.hostname)) {
    return { ok: false, erro: 'só é permitido localhost, 127.0.0.1 ou ::1' };
  }
  if (url.username || url.password) return { ok: false, erro: 'a url local não pode conter credenciais' };
  return { ok: true, url: url.href };
}

function candidatosBrowser() {
  const drive = process.env.SystemDrive || 'C:';
  const programFiles = process.env.ProgramFiles || path.join(drive + path.sep, 'Program Files');
  const programFilesX86 = process.env['ProgramFiles(x86)'] || path.join(drive + path.sep, 'Program Files (x86)');
  return [
    {
      browser: path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      comando: path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      absoluto: true,
    },
    {
      browser: path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      comando: path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      absoluto: true,
    },
    { browser: 'msedge', comando: 'msedge', absoluto: false },
    { browser: 'chrome', comando: 'chrome', absoluto: false },
  ];
}

function pngValido(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 24
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function capturarComBrowser(candidato, url, ficheiro, tamanho, timeoutMs) {
  return new Promise((resolve) => {
    if (!candidato.comando || (candidato.absoluto && !fs.existsSync(candidato.comando))) {
      resolve({ encontrado: false });
      return;
    }
    const argumentos = [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--window-size=' + tamanho.largura + ',' + tamanho.altura,
      '--screenshot=' + ficheiro, url,
    ];
    let terminou = false;
    let stderr = '';
    let processo;
    let timer;
    const concluir = (resultado) => {
      if (terminou) return;
      terminou = true;
      clearTimeout(timer);
      resolve(resultado);
    };
    try {
      processo = spawn(candidato.comando, argumentos, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    } catch (error) {
      resolve({ encontrado: error && error.code !== 'ENOENT', erro: (error && error.message) || 'não arrancou' });
      return;
    }
    timer = setTimeout(() => {
      try { processo.kill(); } catch { /* já terminou */ }
      concluir({ encontrado: true, erro: 'timeout após ' + timeoutMs + ' ms' });
    }, timeoutMs);
    processo.stderr.on('data', (chunk) => {
      if (stderr.length < 1000) stderr += String(chunk).slice(0, 1000 - stderr.length);
    });
    processo.on('error', (error) => {
      concluir({ encontrado: error && error.code !== 'ENOENT', erro: (error && error.message) || 'erro ao arrancar' });
    });
    processo.on('exit', (code) => {
      concluir({
        encontrado: true,
        erro: code === 0 ? null : ('browser terminou com código ' + code + (stderr.trim() ? ': ' + stderr.trim() : '')),
      });
    });
  });
}

/** Captura a app local sem nunca passar uma URL externa ao processo do browser. */
async function retrato(url, opts) {
  const t0 = Date.now();
  const valida = urlLocalValida(url);
  if (!valida.ok) return { ok: false, erro: valida.erro, ms: Date.now() - t0 };
  const o = opts || {};
  const alvo = new URL(valida.url);
  const porta = Number(alvo.port);
  const hosts = alvo.hostname === 'localhost' ? ['127.0.0.1', '::1'] : [alvo.hostname];
  const sondas = await Promise.all(hosts.map((host) => sondar(porta, o.sonda_timeout_ms, host)));
  const autorizou = sondas.find((r) => r.viva && Number(r.status) >= 200 && Number(r.status) < 400);
  const prova = autorizou || sondas.find((r) => Number(r.status) > 0) || sondas[0];
  const status = Number(prova.status) > 0 ? Number(prova.status) : null;
  if (!autorizou) {
    const detalhe = prova.erro || (status === null ? 'sem status HTTP' : 'HTTP ' + status);
    return {
      ok: false,
      erro: 'a porta ' + porta + ' não respondeu (' + detalhe
        + ') — não capturei para não fotografar a página de erro do browser',
      status,
      ms: Date.now() - t0,
    };
  }
  const tamanho = {
    largura: Number(o.largura) === 1000 ? 1000 : RETRATO_TAMANHO.largura,
    altura: Number(o.altura) === 640 ? 640 : RETRATO_TAMANHO.altura,
  };
  const capturarImpl = o.capturarImpl || capturarComBrowser;
  const ficheiro = path.join(os.tmpdir(), 'mooter-retrato-' + process.pid + '-' + Date.now()
    + '-' + Math.random().toString(16).slice(2) + '.png');
  const tentados = [];
  const falhas = [];
  let encontrou = false;
  try {
    for (const candidato of candidatosBrowser()) {
      tentados.push(candidato.browser);
      const captura = await capturarImpl(
        candidato, valida.url, ficheiro, tamanho, RETRATO_TIMEOUT_MS,
      );
      if (!captura.encontrado) continue;
      encontrou = true;
      if (captura.erro) {
        falhas.push(candidato.browser + ': ' + captura.erro);
        continue;
      }
      let png;
      try { png = fs.readFileSync(ficheiro); }
      catch (error) {
        falhas.push(candidato.browser + ': PNG não foi escrito (' + ((error && error.code) || 'erro') + ')');
        continue;
      }
      if (!pngValido(png)) {
        falhas.push(candidato.browser + ': resultado não é um PNG válido');
        continue;
      }
      return {
        ok: true,
        data_url: 'data:image/png;base64,' + png.toString('base64'),
        bytes: png.length,
        ms: Date.now() - t0,
        status,
        browser: candidato.browser,
        capturado_em: new Date().toISOString(),
        erro: null,
      };
    }
    if (!encontrou) return { ok: false, erro: 'nenhum browser headless encontrado', tentados, status, ms: Date.now() - t0 };
    return { ok: false, erro: falhas.join('; ') || 'o browser não produziu um PNG', tentados, status, ms: Date.now() - t0 };
  } finally {
    try { fs.unlinkSync(ficheiro); } catch { /* captura ausente ou já removida */ }
  }
}

/**
 * ⚠️ A MEMÓRIA ERA GLOBAL À MÁQUINA — e era isso que a tornava perigosa.
 *
 * `mem.ultima` ia para a frente da lista de portas e `mem.historico` dava até
 * +25 de peso, **em todas as sessões**. Confirmar a porta 5173 a trabalhar na
 * pasta A passava a empurrar a sessão da pasta B para a app da pasta A — e
 * quanto mais o utilizador confirmasse, mais errado ficava. Uma memória que
 * aprende a resposta errada com mais confiança a cada uso é pior do que não ter
 * memória nenhuma. (codex + kimi, ambos, 2026-08-04.)
 *
 * Agora a memória é POR PASTA. O ficheiro guarda `por_pasta` e a chave é a do
 * `paths.js`, para que `C:\Users\PAULOL~1\frugal` e `C:\Users\Paulo Loureiro\frugal`
 * não abram duas entradas para a mesma pasta.
 */
function lerMemoria() {
  try {
    const m = JSON.parse(fs.readFileSync(MEM, 'utf8'));
    return m && typeof m === 'object' ? m : { por_pasta: {} };
  } catch { return { por_pasta: {} }; }
}

function chaveDaPasta(pasta) { return pasta ? chave(pasta) : '_sem_pasta'; }

/**
 * O que se sabe sobre ESTA pasta. Nunca herda da entrada global antiga: herdar
 * seria reintroduzir exactamente o enviesamento que se está a fechar.
 */
function memoriaDaPasta(mem, pasta) {
  const e = (mem && mem.por_pasta && mem.por_pasta[chaveDaPasta(pasta)]) || null;
  return { ultima: (e && e.ultima) || null, historico: (e && e.historico) || {} };
}

function gravarMemoria(m) {
  try {
    fs.mkdirSync(MOOTER_DIR, { recursive: true });
    /**
     * Escrita atómica: duas sessões a confirmar portas ao mesmo tempo já não
     * deixam o ficheiro a meio.
     * ⚠️ Isto NÃO fecha a corrida ler-alterar-escrever — a última escrita ainda
     * ganha. O que a desarma na prática é o corte por pasta: duas sessões em
     * pastas diferentes escrevem chaves diferentes. Duas sessões na MESMA pasta
     * ainda se podem sobrepor, e essa dívida fica declarada aqui em vez de
     * fingida resolvida.
     */
    const tmp = MEM + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
    fs.renameSync(tmp, MEM);
  } catch { /* a memória é um luxo; a descoberta funciona sem ela */ }
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
 * @returns {Promise<{candidatas:Array, escolhida:object|null, sondadas:number, portas:Array, nota:string}>}
 */
async function descobrir(opts) {
  const o = opts || {};
  const timeout = Math.min(Math.max(Number(o.timeout_ms) || 700, 150), 4000);
  const pastaSessao = o.pasta_sessao || null;
  const mem = memoriaDaPasta(lerMemoria(), pastaSessao);

  const explicita = Array.isArray(o.portas) && o.portas.length > 0;
  const lista = explicita
    ? o.portas.map(Number).filter((p) => p > 0 && p < 65536)
    : PORTAS.slice();
  /**
   * ⚠️ UMA LISTA PEDIDA É UMA LISTA PEDIDA.
   * A versão anterior injectava aqui a porta memorizada mesmo quando o chamador
   * tinha dito exactamente quais queria sondar: `descobrir({portas:[3000]})`
   * acabava a sondar também a 5173 de outra pasta, e a devolvê-la como
   * candidata. (codex, 2026-08-04.) A memória só ordena o que já lá estava.
   */
  /**
   * ⚠️ AS PORTAS DO PROJECTO VÊM À FRENTE DAS 14 DA INDÚSTRIA.
   *
   * As 14 são as mais prováveis *em geral*. Não são as deste projecto: o
   * `landing` deste repo corre em **7819** e o `dashboard` em **7820**, e
   * nenhuma das duas lá estava. O Paulo podia ter a app dele de pé e o painel
   * dizia-lhe "não tens nada a correr" — depois de sondar catorze portas de
   * outra gente. Pior: se houvesse um servidor de outra worktree numa das 14,
   * era esse o encontrado.
   *
   * O projecto já declara isto nos `scripts` do `package.json`. Perguntar-lhe é
   * medição com fonte; adivinhar não é. E o resultado leva a proveniência para
   * o painel poder dizer de onde saiu cada porta.
   */
  const declaradas = explicita ? { portas: [], detalhe: [], porque: 'o chamador deu a lista de portas' }
    : portasDoProjecto(pastaSessao, { fsImpl: o.fsImpl });
  for (const porta of declaradas.portas.slice().reverse()) {
    const i = lista.indexOf(porta);
    if (i >= 0) lista.splice(i, 1);
    lista.unshift(porta);
  }

  // a que funcionou da última vez NESTA pasta fica em primeiro de todas
  if (!explicita && mem.ultima) {
    const i = lista.indexOf(mem.ultima);
    if (i >= 0) lista.splice(i, 1);
    lista.unshift(mem.ultima);
  }

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
      /**
       * ⚠️ A URL nomeia a FAMÍLIA que respondeu, não `localhost`.
       * Com dois servidores diferentes na mesma porta — um em 127.0.0.1, outro
       * em ::1 — `localhost` deixava a escolha ao resolvedor: os sinais e o
       * título vinham de um, e o iframe/retrato abriam o outro. (codex, 08-04.)
       */
      url: 'http://' + (r.host === '::1' ? '[::1]' : '127.0.0.1') + ':' + r.porta,
      porta: r.porta,
      host: r.host || '127.0.0.1',
      titulo: c.titulo,
      sinais: c.sinais.length ? c.sinais : null,
      /**
       * ⚠️ `confianca` mede QUE FRAMEWORK é, nunca DE QUEM é. Duas worktrees da
       * mesma base dão as duas "alta". Quem responde "de quem é" é o `minha`,
       * já a seguir — e são campos separados de propósito, para ninguém ler um
       * como se fosse o outro. (kimi, 08-04.)
       */
      confianca: c.peso >= 90 ? 'alta' : (c.peso >= 40 ? 'media' : 'baixa'),
      confianca_mede: 'o framework servido, não a pasta de origem',
      peso: c.peso + (mem.historico && mem.historico[r.porta] ? Math.min(mem.historico[r.porta] * 5, 25) : 0),
      ms: r.ms,
    });
  }
  candidatas.sort((a, b) => (b.peso - a.peso) || (a.ms - b.ms));

  /* ── DE QUEM É CADA PORTA ────────────────────────────────────────────────
     Até aqui só se sabe o que cada servidor É. Agora mede-se de quem É — e é
     esta medição, não o peso, que decide o que o painel mostra. */
  const atribuicao = await dono.donosDasPortas(candidatas.map((c) => c.porta), {
    pastas: o.pastas, plataforma: o.plataforma, execImpl: o.execImpl,
    timeout_ms: o.dono_timeout_ms,
  });
  for (const c of candidatas) {
    c.dono = atribuicao.porPorta.get(c.porta)
      || dono.semDono(c.porta, 'a porta não entrou na atribuição');
    c.minha = dono.eMinha(c.dono, pastaSessao);
  }

  /**
   * ⚠️ A ESCOLHA É A PARTE QUE MENTIA.
   *
   * `candidatas[0]` respondia sempre alguma coisa, e o painel rotulava-a "o
   * preview DESTA sessão" sem nunca ter medido de quem era. Passa a haver três
   * mundos, e cada um diz o seu nome:
   *   · medida            — há uma que é PROVADAMENTE desta pasta
   *   · nenhuma_minha     — há servidores, nenhum é desta pasta → não se escolhe
   *   · sem_pasta_sessao  — ninguém disse qual é a pasta → escolhe-se por peso,
   *                          mas fica escrito que a atribuição não foi feita
   */
  const minhas = candidatas.filter((c) => c.minha === true);
  /**
   * ⚠️ ZERO CANDIDATAS NÃO É "NENHUMA É TUA".
   * `nenhuma_minha` afirma que há servidores e que nenhum pertence a esta pasta
   * — uma frase sobre servidores que existem. Com a lista vazia essa frase é
   * falsa, e manda o utilizador procurar um conflito que não há em vez de
   * arrancar a app. Apanhado no veredicto real, não em teste.
   */
  const atribuicaoEstado = !candidatas.length ? 'nada_encontrado'
    : (!pastaSessao ? 'sem_pasta_sessao'
    : (minhas.length ? 'medida' : 'nenhuma_minha'));
  const escolhida = atribuicaoEstado === 'medida' ? minhas[0]
    : (atribuicaoEstado === 'sem_pasta_sessao' ? (candidatas[0] || null) : null);
  const deOutraPasta = candidatas.filter((c) => c.minha === false);
  const semAtribuicao = candidatas.filter((c) => c.minha === null);
  const listarOutras = () => deOutraPasta
    .map((c) => c.porta + ' → ' + path.basename(c.dono.pasta || '?')).join(', ');

  let nota;
  if (!candidatas.length) {
    // ⚠️ nunca dizer "não tens nada a correr" — dizer o que se procurou e onde
    /**
     * ⚠️ Quando o projecto declara portas, o conselho deixa de ser genérico.
     * "arranca o npm run dev" não ajuda quem não sabe em que pasta; dizer
     * `cd landing && npm run dev` (porta 7819, lida do package.json dele) é a
     * diferença entre uma mensagem simpática e uma que resolve.
     */
    const sugestao = declaradas.detalhe.length
      ? ('Este projecto declara ' + declaradas.detalhe.length + ' porta(s) e nenhuma respondeu: '
         + declaradas.detalhe.map((d) => d.porta + ' em ' + d.onde + ' → ' + d.script).join('; ')
         + '. Arranca uma delas e volta a procurar.')
      : ('Arranca o teu servidor de desenvolvimento (npm run dev) e volta a procurar, '
         + 'ou diz-me a porta se ela não estiver na lista.'
         + (declaradas.porque ? ' (' + declaradas.porque + ')' : ''));
    nota = 'sondei ' + lista.length + ' portas em 127.0.0.1 e ::1 e nenhuma devolveu HTML utilizável. '
      + (descartadas.length ? 'Descartei ' + descartadas.length + ': '
         + descartadas.map((x) => x.porta + ' (' + x.porque + ')').join('; ') + '. ' : '')
      + sugestao;
  } else if (atribuicaoEstado === 'medida') {
    nota = 'encontrei ' + candidatas.length + ' servidor(es) local(is); '
      + escolhida.url + ' é desta pasta — medido pela ' + escolhida.dono.base
      + (escolhida.sinais ? ' (' + escolhida.sinais.join(', ') + ')' : '')
      + (deOutraPasta.length ? '. Os outros são de outras pastas: ' + listarOutras() : '');
  } else if (atribuicaoEstado === 'nenhuma_minha') {
    /**
     * ⚠️ ESTE É O CAMINHO QUE JUSTIFICA A FEATURE INTEIRA.
     * Antes, aqui, o painel mostrava a app de outra pasta e chamava-lhe tua.
     * Agora recusa-se — e um preview vazio COM motivo é o resultado certo,
     * não uma falha.
     */
    nota = 'encontrei ' + candidatas.length + ' servidor(es) local(is), mas nenhum é desta pasta ('
      + path.basename(pastaSessao) + '), por isso não mostro nenhum: mostrar a app de outra pasta '
      + 'como se fosse a tua é a única coisa pior do que não mostrar nada.'
      + (deOutraPasta.length ? ' De outras pastas: ' + listarOutras() + '.' : '')
      + (semAtribuicao.length ? ' Sem dono medível: '
         + semAtribuicao.map((c) => c.porta + ' (' + c.dono.porque + ')').join('; ') + '.' : '')
      + ' Arranca o dev server nesta pasta, ou usa "abrir mesmo assim" numa das de cima.';
  } else {
    nota = 'encontrei ' + candidatas.length + ' servidor(es) local(is) e escolhi ' + escolhida.url
      + ' pelo peso — mas ninguém me disse qual é a pasta desta sessão, por isso '
      + '**não posso afirmar que é a tua app**'
      + (atribuicao.porque ? ' (' + atribuicao.porque + ')' : '') + '.';
  }

  const resultado = {
    candidatas,
    escolhida,
    /** Como é que a escolha foi feita — o painel precisa disto para não mentir no rótulo. */
    atribuicao: {
      estado: atribuicaoEstado,
      pasta_sessao: pastaSessao,
      base: atribuicao.base,
      porque: atribuicao.porque,
      minhas: minhas.length,
      de_outra_pasta: deOutraPasta.length,
      sem_dono: semAtribuicao.length,
    },
    descartadas: descartadas.length ? descartadas : null,
    sondadas: lista.length,
    portas: lista.slice(),
    /** De onde veio cada porta que não é das 14 genéricas — com ficheiro e script. */
    portas_declaradas: declaradas.detalhe.length ? declaradas.detalhe : null,
    portas_declaradas_porque: declaradas.porque,
    nota,
  };
  if (o.retrato === true && escolhida) resultado.retrato = await retrato(escolhida.url, o.retrato_opts);
  return resultado;
}

/**
 * Confirmar que a escolha do utilizador funcionou, para acertar melhor à
 * próxima — **nesta pasta e só nesta pasta**.
 *
 * ⚠️ Sem a pasta, a confirmação vai para o balde `_sem_pasta` e nunca enviesa
 * uma sessão que sabe onde está. O aprendizado sem contexto não contamina o
 * aprendizado com contexto.
 */
function lembrar(porta, pasta) {
  const p = Number(porta);
  if (!(p > 0 && p < 65536)) return { ok: false, erro: 'porta inválida' };
  const mem = lerMemoria();
  const k = chaveDaPasta(pasta);
  mem.por_pasta = mem.por_pasta || {};
  const entrada = mem.por_pasta[k] || { ultima: null, historico: {} };
  entrada.historico = entrada.historico || {};
  entrada.ultima = p;
  entrada.historico[p] = (entrada.historico[p] || 0) + 1;
  entrada.pasta = pasta || null;
  entrada.em = new Date().toISOString();
  mem.por_pasta[k] = entrada;
  mem.em = entrada.em;
  gravarMemoria(mem);
  return {
    ok: true, ultima: p, vezes: entrada.historico[p],
    pasta: pasta || null,
    escopo: pasta ? 'esta pasta' : 'sem pasta declarada — não influencia sessões que declarem a sua',
  };
}

module.exports = {
  descobrir, retrato, lembrar, sondar, classificar, urlLocalValida,
  lerMemoria, gravarMemoria, memoriaDaPasta, chaveDaPasta,
  PORTAS, SINAIS_DEV, NAO_E_APP, MEM, HOSTS_LOCAIS, RETRATO_TIMEOUT_MS, RETRATO_TAMANHO,
};
