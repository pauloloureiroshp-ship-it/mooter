#!/usr/bin/env node
/**
 * capturar-ledger.mjs — o retrato do Ledger, e o TEMPO dele, medidos.
 *
 * Este ficheiro existe porque "o screenshot do Ledger demora mais de 5s" andou
 * a circular como facto sem nunca ter tido um comando. Medido aqui, no mac-mini,
 * Chrome headless, ledger real de 5142px: 150 ms. Uma ordem de grandeza abaixo
 * do tecto. Quem medir outra coisa esta a medir o instrumento dele — e agora ha
 * um instrumento comum para discordarem contra.
 *
 * Duas coisas, e as duas importam:
 *
 *  1. O TEMPO, com tecto. `--tecto-ms` (5000 por omissao) e a saida e 1 se
 *     estourar. Um numero sem limite nao e um portao.
 *  2. O RETRATO, em `?capture=1`. Um screenshot de pagina inteira nao e a
 *     pagina: o que e `fixed` desenha-se uma vez, do tamanho da JANELA. Medido:
 *     a textura do Ledger cobria os primeiros 800 px de 5142 e o resto saia
 *     liso. O modo retrato poe o fundo solido e o cabecalho estatico.
 *
 * Zero dependencias: CDP por WebSocket (global do Node 22), Chrome por spawn.
 * Sem Chrome nao inventa numero nenhum — diz `n/d` e sai 2.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(AQUI, '..', '..', '..');

/** O tecto acordado. Acima disto o retrato deixa de ser utilizavel ao vivo. */
export const TECTO_MS = 5000;

/**
 * Onde pode estar um Chrome. `MOO_CHROME` ganha sempre — numa maquina que nao
 * esta nesta lista, a alternativa a uma variavel de ambiente e adivinhar.
 */
export const CHROMES = Object.freeze([
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]);

export function acharChrome({ env = process.env, existsImpl = fs.existsSync } = {}) {
  if (env.MOO_CHROME) return existsImpl(env.MOO_CHROME) ? env.MOO_CHROME : null;
  return CHROMES.find((c) => existsImpl(c)) || null;
}

/**
 * O endereco a capturar, sempre com `?capture=1` — e sem o duplicar se ja la
 * estiver. Uma pagina capturada sem o modo retrato produz um artefacto errado
 * em silencio, que e a pior especie de erro: parece uma foto.
 */
export function urlDeCaptura(alvo, { repoRoot = REPO } = {}) {
  const cru = alvo || path.join(repoRoot, 'dist', 'moo-ledger.html');
  const base = /^https?:|^file:/.test(cru) ? cru : pathToFileURL(path.resolve(cru)).href;
  if (/[?&]capture=1(?:&|$)/.test(base)) return base;
  return base + (base.includes('?') ? '&' : '?') + 'capture=1';
}

/** O veredicto, separado da medicao para poder ser testado sem browser. */
export function veredicto({ ms, tecto = TECTO_MS }) {
  if (!Number.isFinite(ms)) {
    return { ok: false, medido: false, porque: 'n/d — nao houve captura, e um tempo nao medido nao se estima' };
  }
  return ms <= tecto
    ? { ok: true, medido: true, porque: `${ms} ms, tecto ${tecto} ms` }
    : { ok: false, medido: true, porque: `${ms} ms ACIMA do tecto de ${tecto} ms` };
}

/** Um cliente CDP de bolso: so os quatro metodos que este ficheiro usa. */
async function ligar(porta) {
  const alvo = await (await fetch(`http://127.0.0.1:${porta}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  const pendentes = new Map();
  let n = 0;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (pendentes.has(m.id)) { pendentes.get(m.id)(m.result); pendentes.delete(m.id); }
  });
  await new Promise((r, rej) => {
    ws.addEventListener('open', r);
    ws.addEventListener('error', () => rej(new Error('CDP recusou a ligacao')));
  });
  return {
    enviar: (method, params = {}) => new Promise((r) => {
      const id = (n += 1); pendentes.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    }),
    fechar: () => ws.close(),
  };
}

const esperar = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Captura e mede. `corridas` > 1 porque uma so medicao de tempo nao e uma
 * medicao — devolve todas, e o veredicto usa a MEDIANA.
 */
export async function capturar({
  alvo = null, saida = null, largura = 1280, altura = 800,
  corridas = 3, tecto = TECTO_MS, porta = 9377, repoRoot = REPO,
} = {}) {
  const chrome = acharChrome();
  if (!chrome) {
    return {
      ok: false, ms: null, altura_px: null, chrome: null,
      veredicto: veredicto({ ms: null, tecto }),
      porque: 'n/d — nenhum Chrome encontrado. Define MOO_CHROME=<caminho>.',
    };
  }
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-cdp-'));
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${porta}`, '--no-first-run',
    `--user-data-dir=${perfil}`, '--disable-gpu', '--hide-scrollbars',
  ], { stdio: 'ignore' });
  try {
    await esperar(2500);
    const cdp = await ligar(porta);
    await cdp.enviar('Page.enable');
    await cdp.enviar('Emulation.setDeviceMetricsOverride', {
      width: largura, height: altura, deviceScaleFactor: 1, mobile: false,
    });
    const url = urlDeCaptura(alvo, { repoRoot });
    await cdp.enviar('Page.navigate', { url });
    await esperar(1800);
    const metrics = await cdp.enviar('Page.getLayoutMetrics');
    const tempos = [];
    let ultima = null;
    for (let i = 0; i < corridas; i += 1) {
      const t0 = Date.now();
      ultima = await cdp.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      tempos.push(Date.now() - t0);
    }
    cdp.fechar();
    const ordenados = [...tempos].sort((a, b) => a - b);
    const ms = ordenados[Math.floor(ordenados.length / 2)];
    if (saida && ultima && ultima.data) fs.writeFileSync(saida, Buffer.from(ultima.data, 'base64'));
    const v = veredicto({ ms, tecto });
    return {
      ok: v.ok, ms, tempos, veredicto: v, url, chrome,
      altura_px: Math.round((metrics.cssContentSize || {}).height || 0),
      largura_px: Math.round((metrics.cssContentSize || {}).width || 0),
      saida: saida || null,
    };
  } finally {
    proc.kill();
    // O Chrome ainda esta a escrever o perfil quando o `kill` volta, e apagar
    // por baixo dele atirava ENOTEMPTY — uma medicao boa perdida por causa da
    // limpeza. Um ficheiro temporario que sobra e um problema do disco, nao da
    // medicao: espera-se um pouco e, se mesmo assim ficar, ignora-se.
    await esperar(300);
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* fica para o SO */ }
  }
}

async function main() {
  const arg = (nome, omissao) => {
    const i = process.argv.indexOf(nome);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : omissao;
  };
  const r = await capturar({
    alvo: arg('--alvo', null),
    saida: arg('--saida', null),
    tecto: Number(arg('--tecto-ms', TECTO_MS)),
    largura: Number(arg('--largura', 1280)),
    altura: Number(arg('--altura', 800)),
    corridas: Number(arg('--corridas', 3)),
  });
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  } else if (!r.veredicto.medido) {
    process.stdout.write(`captura: ${r.porque || r.veredicto.porque}\n`);
  } else {
    process.stdout.write(
      `captura: ${r.veredicto.ok ? 'OK' : 'ACIMA DO TECTO'} — ${r.veredicto.porque}\n` +
      `  pagina ${r.largura_px}x${r.altura_px} px · corridas ${r.tempos.join(' / ')} ms\n` +
      `  ${r.url}\n${r.saida ? `  escrito: ${r.saida}\n` : ''}`,
    );
  }
  process.exit(r.veredicto.medido ? (r.ok ? 0 : 1) : 2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
}
