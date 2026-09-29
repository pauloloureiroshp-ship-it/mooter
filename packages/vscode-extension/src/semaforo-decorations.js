'use strict';

// semaforo-decorations.js — VS-W1 · CAMADA 1 do Semáforo Moo.
// Projeta o estado REAL das sessões nas pastas das worktrees, como badge + cor na UI nativa do
// VS Code (Explorer E abas de editor do recurso), via FileDecorationProvider. É PROJEÇÃO PURA:
// lê sessions.json (registry) + dispatch-queue.json (contrato VS-W0) + sinais de gate; NUNCA
// escreve. A fonte de verdade são os ficheiros de agent-sync — este módulo só os desenha.
//
// Mapa 6-estados (Cowork DECISION vs-w1-go-20260719 §2):
//   🟡 working  ← registry state 'active'
//   🅿️ parked   ← registry state 'parked'
//   ✅ closed   ← registry state 'closed'
//   📥 paste    ← dispatch-queue item estado 'pending' endereçado a esta sessão (destino.sessao_id)
//   🔒 gate     ← .cowork-pending (status≠answered) OU commits unpushed na worktree
//   🚨 blocker  ← dispatch-queue item severity 'critical' + estado 'pending' para esta sessão
//
// Decisões de design (assumidas — sinalizadas no handoff para o gate do Cowork):
//  • BADGE = 1 emoji do ESTADO. O FileDecoration.badge é documentado como ≤2 chars; dois emoji
//    (<lane><estado>) provavelmente não cabem e o comportamento com emoji é runtime, não spec.
//    Por isso o default honesto é estado-só; a lane vai no TOOLTIP e a COR codifica o estado.
//    Trocar para o par <lane><estado> só depois de um teste em runtime provar que 2 emoji cabem
//    (SE-ENTÃO do masterprompt VS-W1).
//  • COR = ThemeColor(charts.*) — ids built-in, tema-aware, sem contribuição em package.json.
//  • ESTADO = campo `state` do record tal como persistido pelo registry. A derivação stale→parked
//    é do registry (session-registry.js:deriveState); não a duplicamos aqui para não criar uma
//    2ª verdade da constante staleHours (gate #5 projeção-vs-2ª-verdade).
//  • PRECEDÊNCIA (o mais urgente ganha a decoração única de uma worktree):
//    🚨 blocker > 📥 paste > 🔒 gate > 🅿️ parked > 🟡 working > ✅ closed.

const STATES = {
  blocker: { emoji: '🚨', color: 'charts.red',    label: 'blocker — para tudo, olha isto' },
  paste:   { emoji: '📥', color: 'charts.blue',   label: 'aguarda o TEU paste' },
  gate:    { emoji: '🔒', color: 'charts.orange', label: 'gate humano — decisão/push tua' },
  parked:  { emoji: '🅿️', color: 'charts.purple', label: 'parked — handoff pronto para relay' },
  working: { emoji: '🟡', color: 'charts.yellow', label: 'a trabalhar — não mexer' },
  closed:  { emoji: '✅', color: 'charts.green',   label: 'fechado/merged' },
};

// Ordem de urgência: o primeiro estado aplicável ganha a decoração única da worktree.
const PRECEDENCE = ['blocker', 'paste', 'gate', 'parked', 'working', 'closed'];

// Lanes do Semáforo (spec §2). A lane é derivada do branch/queue; entra no tooltip, não no badge.
const LANE_EMOJI = {
  genesis: '🌱', registry: '🔐', mesh: '🕸️', receipts: '🧾',
  'context-card': '🗺️', 'schema-v11': '📡', 'bake-off': '🎨',
};

/** Normaliza um path para comparação robusta cross-plataforma (Windows: case-insensitive, `/`). */
function normalizePath(p) {
  return String(p == null ? '' : p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** Deriva a lane a partir de um nome de branch (heurística; null se desconhecida). */
function laneForBranch(branch) {
  if (!branch) return null;
  const b = String(branch).toLowerCase();
  if (b.includes('genesis')) return 'genesis';
  if (b.includes('registry')) return 'registry';
  if (b.includes('mesh')) return 'mesh';
  if (b.includes('receipt')) return 'receipts';
  if (b.includes('context')) return 'context-card';
  if (b.includes('schema') || b.includes('handoff')) return 'schema-v11';
  if (b.includes('bake')) return 'bake-off';
  return null;
}

/** Parse tolerante do ficheiro sessions.json do registry → array de records. */
function parseSessionsFile(text) {
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { return []; }
  if (!parsed || typeof parsed !== 'object') return [];
  const s = parsed.sessions;
  if (Array.isArray(s)) return s.filter(Boolean);
  if (s && typeof s === 'object') return Object.values(s).filter(Boolean);
  if (Array.isArray(parsed)) return parsed.filter(Boolean);
  return [];
}

/**
 * Estado efetivo de uma worktree, resolvendo por precedência.
 * @param {{record:object|null, pendingItems:Array, gate:boolean}} ctx
 * @returns {string|null} chave de STATES, ou null se nada é conhecido sobre a worktree.
 */
function stateForWorktree(ctx) {
  const { record = null, pendingItems = [], gate = false } = ctx || {};
  const items = Array.isArray(pendingItems) ? pendingItems : [];
  const hasBlocker = items.some((i) => i && i.severity === 'critical' && i.estado === 'pending');
  if (hasBlocker) return 'blocker';
  const hasPaste = items.some((i) => i && i.estado === 'pending');
  if (hasPaste) return 'paste';
  if (gate) return 'gate';
  if (record && record.state === 'parked') return 'parked';
  if (record && record.state === 'active') return 'working';
  if (record && record.state === 'closed') return 'closed';
  return null;
}

/**
 * Especificação (pura, sem vscode) da decoração de um estado. O provider converte colorId numa
 * vscode.ThemeColor. badge = 1 emoji do estado (default honesto sob o limite ≤2 chars).
 */
function decorationSpec(stateKey, opts) {
  const s = STATES[stateKey];
  if (!s) return null;
  const laneKey = opts && opts.laneKey ? opts.laneKey : null;
  const laneEmoji = laneKey ? LANE_EMOJI[laneKey] : null;
  const lanePrefix = laneEmoji ? `${laneEmoji} ${laneKey} · ` : '';
  return { badge: s.emoji, colorId: s.color, tooltip: lanePrefix + s.label, propagate: true, stateKey, laneKey };
}

/**
 * Constrói o mapa { normalizePath(worktree) → decorationSpec } a partir dos dados projetados.
 * @param {{worktrees:Array<{path:string,branch?:string}>, sessions:Array, queue:Array,
 *          gateFor?:(ctx:{record:object|null,worktreePath:string})=>boolean}} input
 */
function buildDecorationMap(input) {
  const { worktrees = [], sessions = [], queue = [], gateFor = null } = input || {};
  const byWt = new Map();
  for (const rec of sessions) {
    if (rec && rec.worktree) byWt.set(normalizePath(rec.worktree), rec);
  }
  const map = {};
  for (const wt of worktrees) {
    if (!wt || !wt.path) continue;
    const key = normalizePath(wt.path);
    const record = byWt.get(key) || null;
    const pendingItems = record
      ? queue.filter((i) => i && i.destino && i.destino.sessao_id === record.id && i.estado === 'pending')
      : [];
    const gate = gateFor ? !!gateFor({ record, worktreePath: wt.path }) : false;
    const stateKey = stateForWorktree({ record, pendingItems, gate });
    if (!stateKey) continue;
    const laneKey =
      laneForBranch(wt.branch) ||
      (record && laneForBranch(record.branch)) ||
      (pendingItems[0] && LANE_EMOJI[pendingItems[0].lane] ? pendingItems[0].lane : null);
    map[key] = decorationSpec(stateKey, { laneKey });
  }
  return map;
}

/**
 * Regista o FileDecorationProvider no VS Code. Toda a I/O é injetada via `deps.refreshData()`
 * (o wiring lê sessions.json + dispatch-queue.json + gates e devolve {worktrees,sessions,queue,gateFor}).
 * Devolve { provider, refresh, dispose }. Nada é lido/escrito aqui sem o wiring o fornecer.
 */
function register(vscode, deps) {
  const refreshData = (deps && deps.refreshData) || (() => ({ worktrees: [], sessions: [], queue: [] }));
  const emitter = new vscode.EventEmitter();
  let map = {};
  const provider = {
    onDidChangeFileDecorations: emitter.event,
    provideFileDecoration(uri) {
      const spec = map[normalizePath(uri && uri.fsPath)];
      if (!spec) return undefined;
      return {
        badge: spec.badge,
        color: new vscode.ThemeColor(spec.colorId),
        tooltip: spec.tooltip,
        propagate: spec.propagate,
      };
    },
  };
  const refresh = () => {
    try { map = buildDecorationMap(refreshData()) || {}; }
    catch { map = {}; }
    emitter.fire(undefined); // undefined = todas as decorações podem ter mudado
    return map;
  };
  const reg = vscode.window.registerFileDecorationProvider(provider);
  refresh();
  return {
    provider,
    refresh,
    get map() { return map; },
    dispose() {
      try { reg && reg.dispose && reg.dispose(); } catch { /* best-effort */ }
      try { emitter.dispose(); } catch { /* best-effort */ }
    },
  };
}

/** Contagem de commits unpushed de uma worktree (best-effort; 0 se sem upstream/erro). */
function defaultGitUnpushed(worktreePath) {
  if (!worktreePath) return 0;
  const cp = require('node:child_process');
  try {
    const out = cp.execFileSync('git', ['-C', worktreePath, 'rev-list', '--count', '@{u}..HEAD'],
      { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] });
    const n = parseInt(String(out).trim(), 10);
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}

/**
 * Lê o modelo do Semáforo a partir de agent-sync: sessions.json (registry) + dispatch-queue.json
 * (VS-W0) + sinais de gate (.cowork-pending + unpushed). Toda a I/O é injetável (fs/worktrees/
 * readCoworkPending/gitUnpushed) para teste; defaults reais para produção. Nunca lança.
 * @returns {{worktrees:Array, sessions:Array, queue:Array, gateFor:Function, gateCount:number}}
 */
function readAgentSync(deps) {
  const d = deps || {};
  const fs = d.fs || require('node:fs');
  const pathMod = d.path || require('node:path');
  const readText = (name) => {
    if (!d.syncDir) return null;
    try { return fs.readFileSync(pathMod.join(d.syncDir, name), 'utf8'); } catch { return null; }
  };
  const sessions = d.sessions || parseSessionsFile(readText('sessions.json') || '');
  let queue = d.queue;
  if (!queue) {
    const raw = readText('dispatch-queue.json');
    try { const p = raw ? JSON.parse(raw) : []; queue = Array.isArray(p) ? p : (p && Array.isArray(p.items) ? p.items : []); }
    catch { queue = []; }
  }
  const worktrees = d.worktrees ? (d.worktrees() || []) : [];
  let pending = null;
  try { pending = d.readCoworkPending ? d.readCoworkPending() : null; } catch { pending = null; }
  const gitUnpushed = d.gitUnpushed || defaultGitUnpushed;
  const gateFor = ({ record, worktreePath }) => {
    const coworkGate = !!(pending && record && pending.session_id === record.id && pending.status !== 'answered');
    let unpushed = false;
    try { unpushed = gitUnpushed(worktreePath) > 0; } catch { unpushed = false; }
    return coworkGate || unpushed;
  };
  const byWt = new Map(sessions.filter((s) => s && s.worktree).map((s) => [normalizePath(s.worktree), s]));
  let gateCount = 0;
  for (const wt of worktrees) {
    if (wt && wt.path && gateFor({ record: byWt.get(normalizePath(wt.path)) || null, worktreePath: wt.path })) gateCount += 1;
  }
  return { worktrees, sessions, queue, gateFor, gateCount };
}

module.exports = {
  STATES, PRECEDENCE, LANE_EMOJI,
  normalizePath, laneForBranch, parseSessionsFile,
  stateForWorktree, decorationSpec, buildDecorationMap, register,
  defaultGitUnpushed, readAgentSync,
};
