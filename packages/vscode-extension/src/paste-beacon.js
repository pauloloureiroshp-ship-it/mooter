'use strict';

// paste-beacon.js — VS-W1 · o Paste Beacon do Semáforo Moo.
// StatusBarItem SEMPRE visível que responde à pergunta "onde colo o próximo?": mostra o próximo
// dispatch pendente pré-endereçado (📥 colar <lane> <id>), copia o corpo já endereçado ao clicar,
// e — com a fila vazia — mostra os gates humanos pendentes (🔒 N pushes te esperam).
//
// PROJEÇÃO PURA + guard #3 (Cowork DECISION vs-w1-go-20260719): o beacon é SINALIZAÇÃO, não trilho.
// Copia/deep-link APENAS — nunca cria terminal nem duplica src/dispatch.js (esse é o dono do trilho).
//
// Contrato da fila = dispatch-queue.json (array de itens do schema VS-W0). Guard #1: valida-se
// ITEM A ITEM com o validador do Codex (dispatch-queue-validate.validateDocument); [] é legítimo.
// backgroundColor: só os dois oficiais do VS Code — warningBackground (📥 paste) e errorBackground
// (🚨 blocker). Gate/idle não têm cor de fundo (issue microsoft/vscode#152053).

const SEM = require('./semaforo-decorations.js'); // LANE_EMOJI (sem dependência de 'vscode')

const SEVERITY_RANK = { critical: 0, high: 1, routine: 2, fyi: 3 };
const DEFAULT_COMMAND = 'mooter.pasteBeacon.copy';

/** Itens `pending` que PASSAM a validação por-item do Codex (guard #1). */
function validPendingItems(queue, validate) {
  if (!Array.isArray(queue)) return [];
  const check = typeof validate === 'function' ? validate : () => ({ ok: true });
  return queue.filter((item) => {
    if (!item || item.estado !== 'pending') return false;
    let verdict;
    try { verdict = check(item); } catch { return false; }
    return !!(verdict && verdict.ok);
  });
}

/** Ordena por urgência: severity (critical→fyi) e, empatando, created_at mais antigo primeiro. */
function sortByUrgency(items) {
  return [...items].sort((a, b) => {
    const ra = SEVERITY_RANK[a && a.severity] ?? 9;
    const rb = SEVERITY_RANK[b && b.severity] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a && a.created_at).localeCompare(String(b && b.created_at));
  });
}

function laneTag(item) {
  const e = item && item.lane ? SEM.LANE_EMOJI[item.lane] : null;
  return e ? `${e} ` : '';
}

/**
 * Estado do beacon a partir da fila validada + contagem de gates. Puro (sem vscode/fs).
 * @returns {{kind:'blocker'|'paste'|'gate'|'idle', item:object|null, count:number,
 *            text:string, tooltip:string, background:'error'|'warning'|null}}
 */
function beaconState(input) {
  const { queue = [], gateCount = 0, validate } = input || {};
  const pending = sortByUrgency(validPendingItems(queue, validate));
  const blocker = pending.find((i) => i.severity === 'critical') || null;
  if (blocker) {
    return {
      kind: 'blocker', item: blocker, count: pending.length,
      text: `🚨 blocker: ${laneTag(blocker)}${blocker.id}`,
      tooltip: `🚨 BLOCKER pendente — colar em ${blocker.destino && blocker.destino.sessao_id}. Clique para copiar o corpo.`,
      background: 'error',
    };
  }
  if (pending.length) {
    const next = pending[0];
    return {
      kind: 'paste', item: next, count: pending.length,
      text: `📥 colar ${laneTag(next)}${next.id}`,
      tooltip: `📥 Próximo dispatch (${pending.length} na fila) → sessão ${next.destino && next.destino.sessao_id}. Clique para copiar o corpo já endereçado.`,
      background: 'warning',
    };
  }
  if (gateCount > 0) {
    return {
      kind: 'gate', item: null, count: gateCount,
      text: `🔒 ${gateCount} ${gateCount === 1 ? 'gate te espera' : 'gates te esperam'}`,
      tooltip: `🔒 ${gateCount} ação(ões) humana(s) pendente(s) (push/decisão). Fila de pastes vazia.`,
      background: null,
    };
  }
  return {
    kind: 'idle', item: null, count: 0,
    text: '🐮 sem ações pendentes',
    tooltip: 'Semáforo Moo: nenhum paste na fila, nenhum gate pendente.',
    background: null,
  };
}

/** Contagem para o ViewBadge = pastes pendentes + gates. Puro. */
function pendingActionCount(input) {
  const { queue = [], gateCount = 0, validate } = input || {};
  return validPendingItems(queue, validate).length + Math.max(0, gateCount | 0);
}

/** Resolve o corpo a copiar: inline (`corpo`) ou lido de `corpo_path` via readFile injetado. */
function resolveBody(item, readFile) {
  if (!item) return null;
  if (typeof item.corpo === 'string' && item.corpo.length) return item.corpo;
  if (typeof item.corpo_path === 'string' && item.corpo_path.length && typeof readFile === 'function') {
    try { return readFile(item.corpo_path); } catch { return null; }
  }
  return null;
}

/**
 * Cria e liga o Paste Beacon ao VS Code. Toda a I/O é injetada (deps): o wiring lê a fila, conta
 * os gates, e fornece readFile/validate. Devolve { item, refresh, dispose, command, state }.
 */
function create(vscode, deps) {
  const d = deps || {};
  const commandId = d.commandId || DEFAULT_COMMAND;
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    typeof d.priority === 'number' ? d.priority : 1000,
  );
  item.command = commandId;

  let current = beaconState({ queue: [], gateCount: 0 });

  const refresh = () => {
    let queue = [];
    let gateCount = 0;
    try { queue = (d.readQueue && d.readQueue()) || []; } catch { queue = []; }
    try { gateCount = (d.gateCount && d.gateCount()) || 0; } catch { gateCount = 0; }
    current = beaconState({ queue, gateCount, validate: d.validate });
    item.text = current.text;
    item.tooltip = current.tooltip;
    item.backgroundColor = current.background
      ? new vscode.ThemeColor(current.background === 'error' ? 'statusBarItem.errorBackground' : 'statusBarItem.warningBackground')
      : undefined;
    item.show();
    return current;
  };

  const copy = async () => {
    const body = resolveBody(current.item, d.readFile);
    if (!body) {
      try { vscode.window.showInformationMessage('Semáforo Moo: nada para colar agora.'); } catch { /* best-effort */ }
      return null;
    }
    try { await vscode.env.clipboard.writeText(body); } catch { /* best-effort */ }
    // Deep-link opcional (loose-coupled por command id) — NÃO cria terminal, NÃO chama dispatch.js.
    if (d.deepLinkCommand) {
      try { await vscode.commands.executeCommand(d.deepLinkCommand, current.item); } catch { /* best-effort */ }
    }
    try { vscode.window.showInformationMessage(`📥 Copiado: ${current.item.id} → cole na sessão ${current.item.destino && current.item.destino.sessao_id}.`); } catch { /* best-effort */ }
    return body;
  };

  const command = vscode.commands.registerCommand(commandId, copy);
  refresh();

  return {
    item, command, refresh, copy,
    get state() { return current; },
    dispose() {
      try { command && command.dispose && command.dispose(); } catch { /* best-effort */ }
      try { item.dispose(); } catch { /* best-effort */ }
    },
  };
}

module.exports = {
  SEVERITY_RANK, DEFAULT_COMMAND,
  validPendingItems, sortByUrgency, beaconState, pendingActionCount, resolveBody, create,
};
