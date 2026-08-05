'use strict';
/**
 * lp-demo-snapshot.js — provar a cadeia inteira do Live Preview de uma vez só.
 *
 * PORQUE É QUE ISTO EXISTE, e não é um teste a mais:
 *
 * O LP só se vê funcionar quando QUATRO coisas estão de pé ao mesmo tempo —
 * um servidor vivo, a atribuição a medir, o retrato a capturar, e o snapshot a
 * levar tudo lá dentro. Verificar uma de cada vez obriga a um ciclo de ida e
 * volta por cada uma, e foi assim que se perdeu a tarde. Isto põe as quatro na
 * mesma execução e devolve o veredicto numa linha.
 *
 * ⚠️ O SERVIDOR É ESTE PRÓPRIO PROCESSO, e isso não é um detalhe de
 * conveniência: a linha de comandos deste processo cita o caminho absoluto
 * deste ficheiro, que está dentro da pasta do projecto. É exactamente o sinal
 * que o `dono.js` mede num dev server lançado por npm — o shim absoluto em
 * `node_modules/.bin`. Por isso a atribuição aqui é a mesma que lá, e não uma
 * simulação com regras próprias.
 *
 * O que aparece no painel é uma PÁGINA DE DEMONSTRAÇÃO. Quando o dev server a
 * sério estiver de pé nesta pasta, ocupa o lugar desta sem nada mudar.
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

/** ⚠️ dois níveis: este ficheiro vive em `tools/cockpit/`, não em `tools/`. */
const REPO = path.resolve(__dirname, '..', '..');
const PORTA = Number(process.env.LP_DEMO_PORTA || 4173);

const PAGINA = `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<title>Mooter · live preview desta pasta</title>
<script type="module" src="/@vite/client"></script>
<style>
 body{margin:0;font:16px ui-sans-serif,system-ui;background:#0b1020;color:#e8ecf8;
      display:grid;place-items:center;height:100vh}
 .c{text-align:center;max-width:32rem;padding:2rem}
 h1{font-size:1.5rem;margin:0 0 .5rem} code{color:#7dd3fc}
 .p{margin-top:1.25rem;font-size:.85rem;color:#94a3b8;line-height:1.6}
</style></head><body><div class="c" id="root">
<h1>🎬 este quadro é servido por esta pasta</h1>
<p>porta <code>${PORTA}</code> · dono medido por <code>netstat + Win32_Process</code></p>
<p class="p">Não é a tua app — é uma página de demonstração lançada de dentro de
<code>frugal</code> para provar a cadeia. Arranca o teu dev server nesta pasta e
ele toma este lugar sem mais nada mudar.</p>
</div></body></html>`;

/**
 * ⚠️ RELANÇAR-SE A SI PRÓPRIO POR CAMINHO ABSOLUTO — e a razão é a medição.
 *
 * O `dono.js` lê a LINHA DE COMANDOS do processo que escuta a porta, porque o
 * Windows não expõe o directório de trabalho. Quem lançar isto como
 * `node tools/cockpit/lp-demo-snapshot.js` deixa uma linha de comandos sem
 * caminho absoluto nenhum — e a atribuição, correctamente, recusa-se a adivinhar.
 * Aconteceu à primeira: `estado: nenhuma_minha`, com o motivo por extenso.
 *
 * Um dev server a sério não tem este problema: o `npm run dev` arranca pelo shim
 * absoluto em `node_modules/.bin`. Este relançamento não contorna a medição —
 * põe a demonstração na mesma forma que a coisa real tem, para que o que se vê
 * aqui seja o que se vai ver lá.
 *
 * ⚠️ E fica dito o que isto revela: **um servidor lançado só com caminhos
 * relativos é inatribuível**, e o painel vai dizê-lo em vez de escolher por ti.
 */
if (!process.argv.includes('--abs')) {
  const meAbs = spawn(process.execPath, [__filename, '--abs'], { stdio: 'inherit', windowsHide: true });
  meAbs.on('exit', (c) => process.exit(c == null ? 1 : c));
  return;
}

const servidor = http.createServer((_, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(PAGINA);
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log('demo a servir em http://127.0.0.1:' + PORTA + ' (pid ' + process.pid + ')');
  const filho = spawn(process.execPath, [path.join(REPO, 'tools', 'cockpit', 'build-snapshot.js')],
    { cwd: REPO, stdio: 'inherit', windowsHide: true });
  filho.on('exit', (codigo) => {
    servidor.close(() => {
      // ⚠️ o veredicto lê-se do ficheiro gerado, não do que este script julga
      // ter feito. Um gerador a dar-se a si próprio como aprovado não é prova.
      let veredicto = 'n/d — o snapshot não pôde ser lido';
      try {
        const fs = require('fs');
        const html = fs.readFileSync(path.join(REPO, 'dist', 'cockpit-snapshot.html'), 'utf8');
        const m = html.match(/window\.__MOOTER_SNAPSHOT__ = (.+?);<\/script>/s);
        const snap = JSON.parse(m[1]);
        const pv = snap.preview || {};
        veredicto = JSON.stringify({
          estado: pv.atribuicao && pv.atribuicao.estado,
          pasta_sessao: pv.atribuicao && pv.atribuicao.pasta_sessao,
          escolhida: pv.escolhida && pv.escolhida.url,
          minha: pv.escolhida && pv.escolhida.minha,
          dono: pv.escolhida && pv.escolhida.dono && pv.escolhida.dono.pasta,
          base: pv.escolhida && pv.escolhida.dono && pv.escolhida.dono.base,
          retrato_ok: !!(pv.retrato && pv.retrato.ok),
          retrato_bytes: pv.retrato && pv.retrato.bytes,
          candidatas: Array.isArray(pv.candidatas) ? pv.candidatas.length : null,
          nota: pv.nota,
        }, null, 1);
      } catch (e) { veredicto = 'n/d — ' + ((e && e.message) || e); }
      console.log('\n=== VEREDICTO DO LIVE PREVIEW NO SNAPSHOT ===\n' + veredicto);
      process.exit(codigo || 0);
    });
  });
});
