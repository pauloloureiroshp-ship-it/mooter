'use strict';

// lane-terminal.js — VS-W1 · provider FINO de cor/ícone de terminal por lane do Semáforo Moo.
//
// Guard #3 (Cowork DECISION vs-w1-go-20260719): o TERMINAL é do src/dispatch.js (o trilho de
// execução). Este módulo NÃO cria o terminal do fluxo nem duplica o dispatch.js — só PRODUZ o
// fragmento de TerminalOptions (name + color terminal.ansi* + iconPath) que o dispatch.js aplica
// quando cria o seu terminal. É sinalização visual, não execução.
//
// #4: `runInLaneTerminal` é um pass-through OPCIONAL que compõe as opções da lane e DELEGA no
// seam do Codex `terminal-receipts.runWithReceipt` — consome-o sem alterar o contrato nem
// reimplementar a medição. O dispatch.js pode chamá-lo para obter terminal colorido + recibo real.

const SEM = require('./semaforo-decorations.js'); // LANE_EMOJI (sem 'vscode')

// lane → { colorId (ThemeColor terminal.ansi*), icon (codicon), } . A cor é a IDENTIDADE da lane,
// distinta da cor de ESTADO das decorations (charts.*). Emoji vem de SEM.LANE_EMOJI.
const LANE_TERMINAL = {
  genesis:       { colorId: 'terminal.ansiGreen',       icon: 'sparkle' },
  registry:      { colorId: 'terminal.ansiBlue',        icon: 'key' },
  mesh:          { colorId: 'terminal.ansiCyan',        icon: 'globe' },
  receipts:      { colorId: 'terminal.ansiYellow',      icon: 'checklist' },
  'context-card':{ colorId: 'terminal.ansiMagenta',     icon: 'map' },
  'schema-v11':  { colorId: 'terminal.ansiBrightBlue',  icon: 'broadcast' },
  'bake-off':    { colorId: 'terminal.ansiRed',         icon: 'paintcan' },
};

/** Spec pura (sem vscode) da decoração de terminal de uma lane. null se a lane é desconhecida. */
function laneDecor(lane) {
  const d = lane ? LANE_TERMINAL[lane] : null;
  if (!d) return null;
  const emoji = SEM.LANE_EMOJI[lane] || '';
  return { colorId: d.colorId, icon: d.icon, name: `Moo · ${emoji} ${lane}`.trim() };
}

/**
 * Fragmento de TerminalOptions colorido por lane, para o dispatch.js aplicar ao criar o terminal.
 * Merge não-destrutivo sobre `base` (o dispatch.js mantém cwd/env/shellPath dele). Lane desconhecida
 * → devolve `base` inalterado (degradação graciosa).
 */
function laneTerminalOptions(vscode, lane, base) {
  const opts = { ...(base || {}) };
  const d = laneDecor(lane);
  if (!d) return opts;
  if (opts.name == null) opts.name = d.name;
  opts.color = new vscode.ThemeColor(d.colorId);
  opts.iconPath = new vscode.ThemeIcon(d.icon);
  return opts;
}

/**
 * Pass-through OPCIONAL (#4): compõe as opções da lane e delega no seam do Codex runWithReceipt.
 * NÃO cria fluxo próprio nem substitui o dispatch.js — apenas injeta cor/ícone nas terminalOptions
 * que o seam usa, e devolve o recibo do seam TAL E QUAL (sem alterar o contrato).
 * @param {{vscode:object, lane:string, runWithReceipt?:Function, terminalOptions?:object,
 *          receiptOpts?:object}} deps
 */
function runInLaneTerminal(deps, cmd) {
  const d = deps || {};
  const runWithReceipt = d.runWithReceipt || require('./terminal-receipts.js').runWithReceipt;
  const terminalOptions = laneTerminalOptions(d.vscode, d.lane, d.terminalOptions || {});
  return runWithReceipt({ vscode: d.vscode, terminalOptions, ...(d.receiptOpts || {}) }, cmd);
}

module.exports = { LANE_TERMINAL, laneDecor, laneTerminalOptions, runInLaneTerminal };
