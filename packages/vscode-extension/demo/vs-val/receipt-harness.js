'use strict';

// demo/vs-val/receipt-harness.js — o "recibo da mágica" de VS-VAL, headless. NÃO é código de produção.
// (a) valida as fixtures da FILA (dispatch-queue.demo.json) ITEM-A-ITEM com o validador do Codex;
//     nota: sessions.demo.json NÃO é validada por schema (não há validador de sessões).
// (b) prova o MECANISMO de runWithReceipt (exit code + duração=fim−início) com um clock INJETADO
//     determinístico — NÃO é latência wall-clock (essa mede-se no F5) — e o fallback honesto `n/d`
//     quando não há shell integration (o "cego" de antes). Rode: node demo/vs-val/receipt-harness.js

const fs = require('node:fs');
const path = require('node:path');
const AGENT_SYNC = path.join(__dirname, '..', '..', '..', '..', 'tools', 'agent-sync');
const { validateDocument } = require(path.join(AGENT_SYNC, 'dispatch-queue-validate.js'));
const { runWithReceipt } = require('../../src/terminal-receipts.js');

const line = (s) => process.stdout.write(s + '\n');

// ── (a) validação por-item das fixtures da demo ──
const queue = JSON.parse(fs.readFileSync(path.join(__dirname, 'dispatch-queue.demo.json'), 'utf8'));
line('== (a) validacao da fila da demo (validador do Codex, por item) ==');
let allOk = true;
queue.forEach((item, i) => {
  const v = validateDocument(item);
  allOk = allOk && v.ok;
  line(`  item[${i}] ${item.id} · severity=${item.severity} · estado=${item.estado} -> ${v.ok ? 'VALID' : 'INVALID ' + JSON.stringify(v.errors)}`);
});

// ── harness de terminal (mesmo idioma dos testes do Codex) ──
function createTermHarness(integration) {
  const endListeners = new Set();
  const terminal = { shellIntegration: integration || undefined, sendText() {} };
  const vscode = {
    window: {
      createTerminal() { return terminal; },
      onDidChangeTerminalShellIntegration() { return { dispose() {} }; },
      onDidEndTerminalShellExecution(l) { endListeners.add(l); return { dispose() { endListeners.delete(l); } }; },
    },
  };
  return { vscode, terminal, end(execution, exitCode) { for (const l of [...endListeners]) l({ terminal, execution, exitCode }); } };
}
const execOut = (...chunks) => ({ async *read() { for (const c of chunks) yield c; } });

(async () => {
  line('\n== (b) runWithReceipt — CAPTURADO (shell integration) ==');
  const execution = execOut('demo output\n');
  const h = createTermHarness({ executeCommand() { queueMicrotask(() => h.end(execution, 0)); return execution; } });
  const clock = [1000, 1057];
  const captured = await runWithReceipt({ vscode: h.vscode, terminal: h.terminal, now: () => clock.shift() }, 'printf demo');
  line('  recibo: ' + JSON.stringify(captured));

  line('\n== (b) runWithReceipt — CEGO -> n/d (sem shell integration) ==');
  const h2 = createTermHarness();
  const ndClock = [2000, 2000]; // clock injetado -> durationMs determinístico (0), reproduzível verbatim
  const nd = await runWithReceipt({ vscode: h2.vscode, terminal: h2.terminal, shellIntegrationTimeoutMs: 0, now: () => ndClock.shift() }, 'npm test');
  line('  recibo: ' + JSON.stringify(nd));

  line('\n== RESUMO (durationMs vem de clock INJETADO determinístico — mecanismo, não wall-clock) ==');
  line('  fixtures da fila validas: ' + (allOk ? 'SIM (' + queue.length + '/' + queue.length + ')' : 'NAO'));
  line('  exit code capturado: ' + (captured.exitCode === 0 ? 'SIM (0 · dur=' + captured.durationMs + 'ms [clock 1000->1057] · output="' + (captured.output || '').trim() + '")' : 'NAO'));
  line('  fallback honesto: ' + (nd.receipt && nd.exitCode === null ? 'SIM ("' + nd.receipt + '" · dur=' + nd.durationMs + 'ms [clock 2000->2000])' : 'NAO'));
  process.exitCode = allOk ? 0 : 1;
})();
