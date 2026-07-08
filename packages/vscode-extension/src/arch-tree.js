// arch-tree.js — Aba "Arquitectura" · the system graph (Mission Control backend integration).
//
// C2 (POLISH_F3): collapsed from 3 modes to ONE. The old 🌳 tree and 📊 ceo modes duplicated
// the Mission Control tab (same MissionControlSnapshot, same per-session list / KPIs). The only
// view that gives an insight no other tab gives is the WORKING-TREE graph — your work (git
// branches) on one side, the structural connections/integrations (📜 contratos · 🛰 hub→devices
// · 📝 registo→Notion/Obsidian · 🔁 loops) on the other. So the tab is now that single graph:
// no mode switcher, no portfolio mock.
//
// renderArchTree(snapshot[, mode]) renders ONE MissionControlSnapshot (schema §6 of
// docs/strategy/MISSION_CONTROL_BACKEND_INTEGRATION.md). The `mode` arg is ignored (kept for
// call-site compatibility).
//
// Dual-use: required by tests (node:test) AND embedded into the webview via fn.toString().
// So it is CONCAT-ONLY — NO template literals, NO ${...} — and pure (no Node/VSCode APIs).
// It relies on a free `esc` (module-level here for tests; the webview global at runtime),
// exactly like row-renderer's renderLocalFleet. Every other helper is INLINE inside
// renderArchTree, so the serialised source carries everything it needs into the webview.
//
// Honesty rule (§6/§Gates): every field is nullable. Missing data → n/d / "sync pending".
// NEVER fabricate (remote/sync null is the normal state until Frente F lands).
'use strict';

// Mirror of the webview `esc` (single source of truth for tests). In the webview the global
// esc(1040) is used; behaviour is identical (escapes & < > ").
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"]/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}

// C2 — single canonical mode now (the working-tree system graph). Kept for call-site /
// import compatibility; always resolves to 'wt'.
function archMode() { return 'wt'; }

// ── Main renderer ────────────────────────────────────────────────────────────────
// snapshot = MissionControlSnapshot | null. Returns an HTML string. The `mode` arg is
// ignored (single mode). Never throws on malformed input (concat + fail-soft).
function renderArchTree(snapshot, mode) {
  var s = snapshot || null;

  // ── Inline helpers (self-contained so fn.toString() carries them into the webview) ──
  var nd = '<span class="arch-nd" title="sem dados — honesto, nunca inventado">n/d</span>';

  function fmtTok(v) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    if (v >= 1000) return (Math.round(v / 100) / 10) + 'k';
    return String(v);
  }
  function modelShort(model) {
    var x = String(model || '');
    if (!x) return null;
    return x.replace(/^claude-/, '').replace(/\[1m\]/, '').replace(/-/g, ' ').trim();
  }
  function famEmojiL(model) {
    var x = String(model || '').toLowerCase();
    if (x.indexOf('fable') >= 0) return '\u{1F31F}';
    if (/claude|opus|sonnet|haiku/.test(x)) return '✨';
    if (/qwen|llama|gemma|deepseek|mistral|phi|ollama/.test(x) || x.indexOf(':') >= 0) return '🦙';
    if (x.indexOf('gemini') >= 0) return '💎';
    if (/gpt|codex|openai/.test(x)) return '🟢';
    return '🤖';
  }
  // Clean a possibly-path-y name to its last segment ("…/frugal" → "frugal"). Render-only, honest.
  function cleanName(p) {
    var x = String(p == null ? '' : p).replace(/[\\/]+$/, '');
    var i = Math.max(x.lastIndexOf('/'), x.lastIndexOf('\\'));
    return i >= 0 ? x.slice(i + 1) : x;
  }
  // Git state → branch colour class (working-tree graph): need > working > ahead > dirty > idle.
  function gitState(sess) {
    var g = (sess && sess.git) || {};
    if (sess && sess.needsYou) return 'st-need';
    if (sess && sess.status === 'working') return 'st-work';
    if (g.ahead != null && g.ahead > 0) return 'st-ahead';
    if (g.dirty != null && g.dirty > 0) return 'st-dirty';
    return 'st-idle';
  }

  // ── Honest empty state (no snapshot yet) ──
  if (!s) {
    return '<div class="arch-wrap">'
      + '<div class="card" data-arch="empty" style="padding:14px 12px;text-align:center">'
      + '<div style="font-size:26px;line-height:1">🔌</div>'
      + '<div style="font-weight:600;margin-top:6px">System map — à espera do snapshot</div>'
      + '<div class="sub" style="margin-top:4px;opacity:.75">o Mission Control monta o snapshot host-side; abre uma sessão e espera o primeiro refresh.</div>'
      + '</div></div>';
  }

  var sessions = Array.isArray(s.sessions) ? s.sessions.filter(Boolean) : [];
  var rootName = s.project || 'workspace';

  // 🔌 WORKING-TREE — git-graph REAL: spine vertical do 🌿 main + ramos coloridos por estado,
  // cada frente clicável → openSession; à direita os nós/fluxos (contratos · hub→devices ·
  // registo→Notion/Obsidian) com setas animadas. remote/sync null → "sync pending" honesto.
  function conn(from, arrow, to, tip) {
    return '<div class="arch-conn" title="' + esc(tip || '') + '"><span class="arch-node">' + from + '</span>'
      + '<span class="arch-wire" aria-hidden="true">' + (arrow || '——') + '</span>'
      + '<span class="arch-node to">' + to + '</span></div>';
  }
  // One branch in the git-graph (clickable → openSession via the .arch-leaf wiring).
  function gitRow(sess) {
    if (!sess) return '';
    var g = sess.git || {};
    var sid = sess.sid || '';
    var marks = '';
    if (g.dirty != null && g.dirty > 0) marks += '<span class="arch-mk dirty" title="ficheiros por commitar">✎' + g.dirty + '</span>';
    if (g.ahead != null && g.ahead > 0) marks += '<span class="arch-mk ahead" title="commits por enviar (push)">↑' + g.ahead + '</span>';
    var model = sess.model ? ('<span class="arch-model">' + famEmojiL(sess.model) + ' ' + esc(modelShort(sess.model)) + '</span>') : ('<span class="arch-model">' + nd + '</span>');
    var tin = fmtTok(sess.tokIn), tout = fmtTok(sess.tokOut);
    // F2 · consistência — absent tokens use the styled honest-absence span (nd), like the model slot above.
    var tok = (tin != null || tout != null) ? ('<span class="arch-tok">↓' + (tin != null ? tin : nd) + ' ↑' + (tout != null ? tout : nd) + '</span>') : '';
    var open = sid ? ' data-arch-sid="' + esc(sid) + '" role="button" tabindex="0"' : '';
    var name = sess.topic || sess.name || '';
    return '<div class="arch-leaf arch-gitrow ' + gitState(sess) + '"' + open + ' aria-label="abrir ramo: ' + esc(name) + '" title="abrir esta sessão — ' + esc(name) + '">'
      + '<span class="arch-gnode" aria-hidden="true"></span>'
      + '<span class="arch-gbr">⎇ ' + esc(g.branch || '?') + '</span>'
      + marks + model + tok
      + (sid ? '<span class="arch-open">↗</span>' : '')
      + '</div>';
  }
  var gitRows = '', anyGit = false;
  for (var wi = 0; wi < sessions.length; wi++) {
    var ws = sessions[wi];
    if (ws && ((ws.git && ws.git.branch) || ws.sid)) { gitRows += gitRow(ws); anyGit = true; }
  }
  if (!anyGit) gitRows = '<div class="sub" style="opacity:.7;padding:3px 4px">sem ramos vivos.</div>';
  var graph = '<div class="arch-gitsec"><div class="lbl">🌿 main → frentes</div>'
    + '<div class="arch-git"><div class="arch-gitmain"><span class="arch-gnode main"></span><b>main</b> <span style="opacity:.6">· ' + esc(cleanName(rootName)) + '</span></div>'
    + gitRows + '</div></div>';

  // contratos — nó estrutural (todas as vistas renderizam do MESMO snapshot §6). Sem métricas inventadas.
  // F2 · honesto — this is a CONSTANT structural fact, not a live measurement, so it uses the STATIC dash
  // (no 'live' pulse). The animated flow is reserved for genuinely live signals (online devices, active loops).
  var contratos = conn('📜 contratos', '<span class="arch-dash"></span>', '🧩 schema §6 · 1 snapshot', 'contrato de dados — Cockpit/Mission Control/system map renderizam do mesmo snapshot');

  // hub → devices (Frente F). Live only when the remote cache carries devices.
  var remoteLive = !!(s.remote && Array.isArray(s.remote.devices) && s.remote.devices.length);
  var remoteBlock = '';
  if (remoteLive) {
    var drows = '';
    for (var di = 0; di < s.remote.devices.length; di++) {
      var dv = s.remote.devices[di];
      drows += conn('🛰 hub', '<span class="arch-dash' + (dv.online ? ' live' : '') + '"></span>', (dv.online ? '🟢 ' : '⚪ ') + esc(dv.os || 'device') + ' <span style="opacity:.6">(' + (dv.sessions != null ? dv.sessions : '?') + ')</span>', 'dispositivo remoto via hub');
    }
    remoteBlock = drows;
  }

  // registo → Notion/Obsidian. Aggregate per-session sync; live only when there is a real sync.
  var nCount = 0, oCount = 0;
  for (var si = 0; si < sessions.length; si++) {
    var sy = sessions[si] && sessions[si].sync;
    if (sy && sy.notion) nCount++;
    if (sy && sy.obsidian) oCount++;
  }
  var regLive = !!(nCount || oCount || s.sync);
  var regBlock = '';
  if (regLive) {
    regBlock = conn('📝 registo', '<span class="arch-dash live"></span>', 'Ⓝ Notion <b>' + nCount + '</b> · Ⓞ Obsidian <b>' + oCount + '</b>', 'sessões com registo sincronizado (Notion/Obsidian)');
  }

  // F2 · n/d agrupado + iconografia — the not-yet-landed Frente F absences collapse into ONE muted pending
  // block naming each pending sub-item once, with a distinct ⏳ glyph (🔌 stays reserved for the connected
  // root, not the pending state). Honest: still "sync pending · Frente F", nothing fabricated.
  var pending = '';
  if (!remoteLive || !regLive) {
    var pit = [];
    if (!remoteLive) pit.push('hub→devices');
    if (!regLive) pit.push('registo→Notion/Obsidian');
    pending = '<div class="arch-pending" title="o collector cross-machine (Frente F) ainda não escreveu o cache — estado normal até F aterrar">⏳ sync pending · Frente F · ' + esc(pit.join(' · ')) + '</div>';
  }
  var nodes = '<div class="arch-gitsec"><div class="lbl">🔗 nós &amp; fluxos</div>' + contratos + remoteBlock + regBlock + pending + '</div>';

  // loops (autopilot) as flow connections.
  var loopBlock = '';
  var loops = Array.isArray(s.loops) ? s.loops.filter(Boolean) : [];
  if (loops.length) {
    var lrows = '';
    for (var lpi = 0; lpi < loops.length; lpi++) {
      var lp = loops[lpi];
      // F2 · consistência — a numberless round renders the styled honest-absence span, not raw "n/d" text.
      var hasRound = (typeof lp.round === 'number');
      var roundHtml = hasRound ? esc(lp.round + (lp.maxRounds != null ? '/' + lp.maxRounds : '')) : nd;
      lrows += conn('🔁 ' + esc(lp.kind || 'loop'), '<span class="arch-dash' + (lp.active ? ' live' : '') + '"></span>', (lp.active ? '🟢 round ' : '⚪ round ') + roundHtml + (lp.model ? ' · ' + esc(modelShort(lp.model)) : ''), 'loop-runner — ' + (lp.active ? 'activo' : 'inactivo'));
    }
    loopBlock = '<div class="arch-gitsec"><div class="lbl">🔁 Loops</div>' + lrows + '</div>';
  }

  var body = '<div class="card" data-arch="wt" style="padding:10px 12px">'
    + '<div class="arch-root">🔌 <b>' + esc(cleanName(rootName)) + '</b> · system map <span class="arch-dev" style="opacity:.6">— o teu trabalho ligado ao resto do sistema</span></div>'
    + '<div class="arch-wtgrid">' + graph + '<div class="arch-wtright">' + nodes + loopBlock + '</div></div>'
    + '</div>';

  return '<div class="arch-wrap">' + body + '</div>';
}

module.exports = { renderArchTree, archMode, esc };
