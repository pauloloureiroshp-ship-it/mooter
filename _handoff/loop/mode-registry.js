// mode-registry.js - drop-in for the Mooter VS Code plugin + the loop runner.
// Fonte unica de verdade do estado POR-SESSAO: modo Mooter (lazy|moo|crazy), modelo LLM,
// auto-pilot on/off, projeto Cowork e titulo da conversa (brain). Escrita atomica (anti-corrupcao).
// 100% ADITIVO: nao toca classify.js nem engine; so um ficheiro de estado novo.
const fs = require("fs"); const path = require("path"); const os = require("os");
const ROUTER = path.join(os.homedir(), ".claude", "tools", "router");
const FILE = path.join(ROUTER, ".mooter-sessions.json");

const MODES = ["lazy", "moo", "crazy"];           // LazyMoo | Moo | CrazyMoo
const DEFAULT = { mode: "moo", model: null, auto: false, project: null, brainTitle: null };

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
// Decora uma row de recentSessions() com modo/modelo/auto/projeto/brain (mutuamente seguro).
function decorate(row) {
  const e = get(row.fullId);
  row.mode = e.mode; row.model = e.model || row.model || null; row.auto = !!e.auto;
  row.project = e.project || "Unassigned"; row.brainTitle = e.brainTitle || null;
  return row;
}
// Agrupa rows por projeto Cowork -> { project: [rows...] } (para os dropdowns).
function byProject(rows) {
  const g = {}; for (const r of rows) { const p = r.project || "Unassigned"; (g[p] = g[p] || []).push(r); } return g;
}
module.exports = { readAll, writeAll, get, set, decorate, byProject, MODES, DEFAULT, FILE };
