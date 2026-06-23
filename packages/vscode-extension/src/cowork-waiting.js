// cowork-waiting.js - drop-in for the Mooter VS Code plugin (packages/vscode-extension/src/).
// Adds the live-session state "waiting for Cowork - <conversation title>" (event-driven HITL handoff).
// 100% ADITIVO: nao altera classify.js nem a logica working/your-turn; so acrescenta um 3o estado.
const fs = require("fs"); const path = require("path"); const os = require("os");
const ROUTER = path.join(os.homedir(), ".claude", "tools", "router");
const SIGNAL = path.join(ROUTER, ".cowork-pending.json");

// Le o ficheiro de correlacao escrito por signal.ps1 / Cowork. -> {session_id,status,note,coworkTitle,ts} | null
function readCoworkPending() {
  try { const j = JSON.parse(fs.readFileSync(SIGNAL, "utf8")); return j && j.session_id ? j : null; }
  catch { return null; }
}
// Decora uma row de recentSessions(). Estado "waiting for Cowork" GANHA a working/needsYou (mutuamente exclusivos).
function decorate(row, pending) {
  const hit = pending && pending.session_id === row.fullId && pending.status !== "answered";
  row.waitingForCowork = !!hit;
  row.coworkStatus = hit ? (pending.status || "pending") : null; // "pending" | "cowork_working"
  row.coworkTitle = hit ? (pending.coworkTitle || null) : null;
  row.coworkProject = hit ? (pending.coworkProject || null) : null;
  if (hit && pending.coworkProject) row.project = pending.coworkProject;
  if (hit) { row.working = false; row.needsYou = false; }
  return row;
}
// HTML do badge para o webview (string) ou null se nao aplicavel.
function badge(r) {
  if (!r.waitingForCowork) return null;
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const label = r.coworkStatus === "cowork_working"
    ? ("waiting for Cowork — " + esc(r.coworkTitle || "deciding…"))
    : "signalled Cowork…";
  return '<span class="coworkdot"></span><span class="coworktitle">' + label + "</span>";
}
// CSS a juntar ao bloco de estilos do getHtml() (escopado, nao vaza).
const CSS = [
  ".coworkdot{width:8px;height:8px;border-radius:50%;background:#61afef;flex:none;animation:coworkpulse 1.2s ease-in-out infinite}",
  "@keyframes coworkpulse{0%,100%{opacity:.45}50%{opacity:1}}",
  ".coworktitle{color:#61afef;font-weight:600;font-size:11px}",
  ".livecow.cowork{animation:moowait 1.6s ease-in-out infinite}",
  "@keyframes moowait{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px) rotate(8deg)}}",
  "@media (prefers-reduced-motion:reduce){.livecow.cowork{animation:none}}",
].join("\n");
module.exports = { readCoworkPending, decorate, badge, CSS, SIGNAL };
