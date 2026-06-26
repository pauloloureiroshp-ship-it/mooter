// mode-registry.js - drop-in for the Mooter VS Code plugin + the loop runner.
// Fonte unica de verdade do estado POR-SESSAO: modo Mooter (lazy|moo|crazy), modelo LLM,
// auto-pilot on/off, projeto Cowork e titulo da conversa (brain). Escrita atomica (anti-corrupcao).
// 100% ADITIVO: nao toca classify.js nem engine; so um ficheiro de estado novo.
const fs = require("fs"); const path = require("path"); const os = require("os");
const { execFileSync } = require("child_process");
const ROUTER = path.join(os.homedir(), ".claude", "tools", "router");
const FILE = path.join(ROUTER, ".mooter-sessions.json");
// WCOCKPIT-9 (Bloco A): mapa persistente CC<->Cowork escrito pelo LADO Cowork (sdk-runner/signal.ps1).
// Distinto do .cowork-pending.json (estado "waiting" instantâneo de UMA sessão): este é o
// espelho durável { session_id: {coworkProject, coworkTitle, coworkConversationId, coworkUpdatedAt} }
// para TODAS as sessões que o Cowork associou. decorate() lê-o (read-only do lado do cockpit).
const COWORK_MAP = path.join(ROUTER, ".cowork-sessions.json");

const MODES = ["lazy", "moo", "crazy"];           // LazyMoo | Moo | CrazyMoo
// WCOCKPIT-2: extended with Notion + Obsidian integration fields
// WCOCKPIT-9 (Bloco A): cowork* mirror fields. (Bloco F): loop = LoopMoo armado para a sessão.
const DEFAULT = { mode: "moo", model: null, auto: false, project: null, brainTitle: null,
  notionPageId: null, notionSyncedAt: null, obsidianPath: null, obsidianSyncedAt: null, archivedAt: null,
  coworkProject: null, coworkTitle: null, coworkConversationId: null, coworkUpdatedAt: null, loop: false,
  nextSlash: null, handoffSentAt: null };

function readAll() {
  try { const j = JSON.parse(fs.readFileSync(FILE, "utf8")); return j && typeof j === "object" ? j : {}; }
  catch { return {}; }
}
// Escrita atomica: tmp + rename (nunca deixa o ficheiro meio-escrito/truncado).
function writeAll(obj) {
  try {
    if (!fs.existsSync(ROUTER)) fs.mkdirSync(ROUTER, { recursive: true });
    const tmp = FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); fs.renameSync(tmp, FILE);
    return true;
  } catch { return false; }
}
function get(sessionId) { const e = readAll()[sessionId]; return { ...DEFAULT, ...(e || {}) }; }
// Patch parcial validado (modo tem de ser valido; resto passthrough).
function set(sessionId, patch) {
  if (!sessionId) return false;
  if (patch && patch.mode && !MODES.includes(patch.mode)) delete patch.mode;
  const all = readAll(); all[sessionId] = { ...DEFAULT, ...(all[sessionId] || {}), ...(patch || {}) };
  return writeAll(all);
}
// WCOCKPIT-9 (Bloco A): lê o mapa persistente CC<->Cowork (read-only). Nunca lança; {} se ausente.
// Aceita ser pré-lido uma vez por refresh e passado a decorate() para evitar N leituras no loop.
function readCoworkMap() {
  try { const j = JSON.parse(fs.readFileSync(COWORK_MAP, "utf8").replace(/^\uFEFF/, "")); return j && typeof j === "object" ? j : {}; }
  catch { return {}; }
}
// WCOCKPIT-9 (Bloco A): grava a associação Cowork desta sessão no REGISTO (.mooter-sessions.json).
// É o caminho "o cockpit aprendeu o mapeamento"; o lado Cowork escreve o .cowork-sessions.json.
// decorate() prefere o mapa Cowork (autoritativo) e cai para estes campos do registo.
function setCowork(sessionId, info) {
  if (!sessionId) return false;
  info = info || {};
  return set(sessionId, {
    coworkProject: info.project != null ? String(info.project) : null,
    coworkTitle: info.title != null ? String(info.title) : null,
    coworkConversationId: info.conversationId != null ? String(info.conversationId) : null,
    coworkUpdatedAt: new Date().toISOString(),
  });
}
// WCOCKPIT-9 (Bloco F): arma/desarma o LoopMoo para a sessão (estado persistente; o runner inscreve).
function setLoop(sessionId, on) { if (!sessionId) return false; return set(sessionId, { loop: !!on }); }
// WCOCKPIT-9 (Bloco E): regista o slash-command escolhido para usar no PRÓXIMO prompt da sessão.
// '' / null limpa. A ponte CC pode consumi-lo; o cartão mostra "next ▶ /x" como feedback honesto.
function setNextSlash(sessionId, cmd) { if (!sessionId) return false; const c = cmd ? String(cmd) : null; return set(sessionId, { nextSlash: c }); }
// ⇄ Handoff (aditivo): regista quando o último handoff desta sessão foi gerado/copiado.
function setHandoff(sessionId, ts) { if (!sessionId) return false; return set(sessionId, { handoffSentAt: ts || new Date().toISOString() }); }
// Decora uma row de recentSessions() com modo/modelo/auto/projeto/brain + integrações (mutuamente seguro).
// coworkMap (opcional) = .cowork-sessions.json pré-lido; se ausente, lê uma vez aqui.
function decorate(row, coworkMap) {
  const e = get(row.fullId);
  row.mode = e.mode; row.model = e.model || row.model || null; row.auto = !!e.auto;
  row.project = e.project || row.project || "Unassigned"; row.brainTitle = e.brainTitle || null;
  row.loop = !!e.loop; // WCOCKPIT-9 (Bloco F)
  row.nextSlash = e.nextSlash || null; // WCOCKPIT-9 (Bloco E)
  row.handoffSentAt = e.handoffSentAt || null; // ⇄ Handoff
  // WCOCKPIT-2: integration fields
  row.notionPageId = e.notionPageId || null;
  row.notionSyncedAt = e.notionSyncedAt || null;
  row.obsidianPath = e.obsidianPath || null;
  row.obsidianSyncedAt = e.obsidianSyncedAt || null;
  // WCOCKPIT-9 (Bloco A): espelho Cowork. Mapa persistente (lado Cowork) é autoritativo;
  // cai para os campos do registo (setCowork). cowork-waiting.decorate() pode sobrepor com o
  // estado "waiting" instantâneo, mas NUNCA limpa estes valores persistentes (ver cowork-waiting.js).
  const cm = (coworkMap || readCoworkMap())[row.fullId] || {};
  row.coworkProject = cm.coworkProject || e.coworkProject || null;
  row.coworkTitle = cm.coworkTitle || e.coworkTitle || row.brainTitle || null;
  row.coworkConversationId = cm.coworkConversationId || e.coworkConversationId || null;
  row.coworkUpdatedAt = cm.coworkUpdatedAt || e.coworkUpdatedAt || null;
  return row;
}
// Agrupa rows por projeto Cowork -> { project: [rows...] } (para os dropdowns).
function byProject(rows) {
  const g = {}; for (const r of rows) { const p = r.project || "Unassigned"; (g[p] = g[p] || []).push(r); } return g;
}
// WCOCKPIT-2: parse git worktree list --porcelain in a given cwd.
// Returns [{path, head, branch, bare, linked}] — safe (never throws; timeout=3s).
function worktrees(cwd) {
  if (!cwd) return [];
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'],
      { cwd, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    const trees = []; let cur = null;
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (cur) trees.push(cur);
        cur = { path: line.slice(9).trim(), head: null, branch: null, bare: false };
      } else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5).trim();
      else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '').trim();
      else if (cur && line === 'bare') cur.bare = true;
    }
    if (cur) trees.push(cur);
    return trees.map((t, i) => ({ ...t, linked: i > 0 }));
  } catch { return []; }
}
// WCOCKPIT-2: atomic update of notionSyncedAt or obsidianSyncedAt for a session.
function touchSync(sid, which) {
  if (!sid || !['notion', 'obsidian'].includes(which)) return false;
  const field = which === 'notion' ? 'notionSyncedAt' : 'obsidianSyncedAt';
  return set(sid, { [field]: new Date().toISOString() });
}
// WCOCKPIT-7: archive = "close from cockpit". Reversible; a session reappears automatically
// if it becomes active again (lastActiveTs > archivedAt). Never deletes logs or touches git.
function archive(sessionId) { return set(sessionId, { archivedAt: Date.now() }); }
function unarchive(sessionId) { return set(sessionId, { archivedAt: null }); }
function isArchived(sessionId, lastActiveTs) { const e = get(sessionId); return !!(e.archivedAt && e.archivedAt >= (lastActiveTs || 0)); }

module.exports = { readAll, writeAll, get, set, decorate, byProject, worktrees, touchSync, archive, unarchive, isArchived,
  readCoworkMap, setCowork, setLoop, setNextSlash, setHandoff, MODES, DEFAULT, FILE, COWORK_MAP };
