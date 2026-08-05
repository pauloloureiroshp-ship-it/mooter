#!/usr/bin/env node
'use strict';
/**
 * server-seamless.js — mooter-bridge v0.2 entrypoint (P0 + P1 + seamless tools).
 *
 * Purely ADDITIVE: server.js (P0/P1, tracked, tested) is not modified — this
 * entry requires it, extends its TOOLS registry with the seamless quartet
 * (route/dispatch/status/collect) and runs the same newline-delimited JSON-RPC
 * stdio loop. Register THIS file in claude_desktop_config.json:
 *
 *   { "mcpServers": { "mooter": { "command": "node",
 *     "args": ["C:/Users/Paulo Loureiro/frugal/packages/mooter-bridge/server-seamless.js"] } } }
 *
 * Why a new entrypoint instead of editing server.js: the device-commit rule
 * (protocolo item 10 — overwriting a tracked file that grew truncates) plus
 * "reuse, never rewrite". server.js keeps working standalone as P0/P1.
 */

const base = require('./server.js');
const seam = require('./seamless.js');

// extend the shared registry — base.handle() reads the same array reference
for (const t of seam.TOOLS) {
  if (!base.TOOLS.find((x) => x.name === t.name)) base.TOOLS.push(t);
}

/**
 * ⚠️ AS TOOLS DO PAINEL TÊM DE SER REGISTADAS AQUI TAMBÉM.
 *
 * Estavam só no `server-apps.js`. Mas o `claude_desktop_config.json` arranca
 * **este** ficheiro — `server-seamless.js` — e este só carrega `server.js` e
 * `seamless.js`. Resultado: o painel do Cowork pedia `mooter_ui_mapa` a um
 * servidor que nunca ouvira falar dela, e a resposta era indistinguível de
 * "a funcionalidade não existe".
 *
 * Custou duas horas a encontrar, e a razão foi eu procurar o conector numa
 * pasta de extensões que **não existe** nesta máquina: o Desktop corre-o
 * directamente do repo. Registar nos dois pontos de entrada custa quatro
 * linhas; assumir qual deles está vivo custou a noite.
 * (Registo de 2026-08-05, medido no gate pré-push: o entrypoint VIVO nesta
 * máquina é `server-apps.js`, via extensão MCPB — `mcpServers` está vazio no
 * claude_desktop_config.json. Este ficheiro é o entrypoint de dev/manual.)
 *
 * `visibility:['app']` mantém-se — o modelo continua a não as ver.
 * ⚠️ E isso tem de ser MECANISMO, não legenda: este entrypoint não tem o
 * filtro das seis do server-apps.js, e o server.js copia TODAS as TOOLS para
 * o `tools/list` sem olhar ao `_meta`. Medido no gate pré-push da v1.48.0:
 * 18 tools anunciadas, incluindo as quatro `mooter_ui_*` e a `mooter_trilha`
 * — uma delas instala código (`mooter_ui_update`) e outra devolve caminhos
 * absolutos. O filtro em `handle()` abaixo é o que torna a frase verdadeira;
 * `trilha-tool.test.js` verifica a RESPOSTA do tools/list, não o campo.
 */
const probe = require('./probe.js');
const trilhaTool = require('./trilha-tool.js');
for (const t of [probe.TOOL, probe.TOOL_DESCOBRIR, probe.TOOL_UPDATE, probe.TOOL_MAPA, trilhaTool.TOOL]) {
  if (t && !base.TOOLS.find((x) => x.name === t.name)) base.TOOLS.push(t);
}

/** Uma tool é só-do-painel quando o registo declara visibility sem 'model'. */
function soDoPainel(nome) {
  const t = base.TOOLS.find((x) => x.name === nome);
  const vis = t && t._meta && t._meta.ui && t._meta.ui.visibility;
  return Array.isArray(vis) && !vis.includes('model');
}

/** base.handle + o filtro que faz `visibility:['app']` ser verdade aqui.
 *  As tools ficam CHAMÁVEIS por `tools/call` (o painel chama por ui/call-tool,
 *  que passa pelo mesmo dispatcher) — só deixam de ser ANUNCIADAS ao modelo. */
async function handle(msg) {
  const res = await base.handle(msg);
  if (msg && msg.method === 'tools/list' && res && res.result && Array.isArray(res.result.tools)) {
    res.result.tools = res.result.tools.filter((t) => !soDoPainel(t.name));
  }
  return res;
}

function log(...a) { try { process.stderr.write('[mooter-bridge v0.2] ' + a.join(' ') + '\n'); } catch { /* */ } }
function send(msg) { try { process.stdout.write(JSON.stringify(msg) + '\n'); } catch (e) { log('send fail', (e && e.message) || ''); } }

function main() {
  let buf = '';
  let pending = 0;
  let stdinEnded = false;
  const maybeExit = () => { if (stdinEnded && pending === 0 && seam.REGISTRY.size === 0) process.exit(0); };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { log('bad json line'); continue; }
      pending++;
      Promise.resolve(handle(msg))
        .then((res) => { if (res) send(res); })
        .catch((e) => log('handle err', (e && e.message) || ''))
        .finally(() => { pending--; maybeExit(); });
    }
  });
  // Drain in-flight calls AND live jobs before exiting on stdin end — a killed
  // parent must not orphan-lose ledger `done` events for running jobs.
  process.stdin.on('end', () => {
    stdinEnded = true; maybeExit();
    if (seam.REGISTRY.size > 0) {
      const iv = setInterval(() => { if (seam.REGISTRY.size === 0 && pending === 0) { clearInterval(iv); maybeExit(); } }, 1000);
      try { iv.unref(); } catch { /* ambiente sem unref */ }
      iv.unref && iv.unref();
    }
  });
  log('ready (v0.2 seamless) · tools: ' + base.TOOLS.map((t) => t.name).join(', '));
}

if (require.main === module) main();
module.exports = { main, handle };
