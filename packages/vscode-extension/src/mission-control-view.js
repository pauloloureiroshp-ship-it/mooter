'use strict';
// mission-control-view.js — Frente G · Página Mission Control (+ assistente Moo).
//
// `renderMissionControl(snapshot)` renders the WHOLE Mission Control tab PURELY from the
// MissionControlSnapshot (Frente 0, mc-snapshot.js §6). It is **concat-only / CSP-safe**:
// no template literals, no `${}`, no inline event handlers — every interactive element is a
// `<button data-a=…>` (wired host-side by the webview's generic wireButtons) or a Moo input
// (wired by wireMc). This matters because the host serialises this function via
// `.toString()` straight INTO the getHtml() template literal (same trick as renderRow); a
// backtick or `${` here would break the outer template and the webview-syntax test.
//
// Honesty rule (§6/§9): EVERY field is nullable. Missing → `n/d` / `⚪`, never fabricated.
// remote/sync arrive `null` until Frente F lands → we render an explicit "sync pending".
// The function NEVER throws: it is wrapped defensively and every section is independent.

function renderMissionControl(snapshot) {
  // Self-contained helpers (serialised with the function — must not reference module scope).
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    });
  }
  function nd(v, suffix) {
    if (v == null || v === '') return '<span class="mc-nd">n/d</span>';
    return esc(v) + (suffix || '');
  }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function fmtk(n) {
    if (n == null) return null;
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  }
  function usd(v) { return (v == null) ? null : ('$' + Number(v).toFixed(2)); }
  // Vaquinha por modo (identidade do mock): 🐮 Moo · 😴 Lazy · 🌀 Crazy.
  function mooEmoji(mode) {
    var m = String(mode || '').toLowerCase();
    if (m === 'beast' || m === 'crazy') return '🌀';
    if (m === 'zen' || m === 'lazy') return '😴';
    return '🐮';
  }
  function statusDot(st) {
    if (st === 'working') return '<span class="mc-dot mc-work" title="a trabalhar (últimos 90s)"></span>';
    if (st === 'needs-you') return '<span class="mc-dot mc-need" title="precisa de ti">🟡</span>';
    return '<span class="mc-dot mc-idle" title="idle">⚪</span>';
  }
  function tierChip(tier) {
    if (!tier) return '<span class="mc-tier mc-tnd">n/d</span>';
    return '<span class="mc-tier mc-' + esc(tier) + '">' + esc(tier) + '</span>';
  }
  function btn(label, cmd, arg, cls, title) {
    var x = (arg == null) ? '' : ' data-x="' + esc(arg) + '"';
    var t = title ? ' title="' + esc(title) + '"' : '';
    return '<button class="mc-btn ' + (cls || '') + '" data-a="' + esc(cmd) + '"' + x + t + '>' + label + '</button>';
  }

  var s = snapshot || {};
  var sessions = Array.isArray(s.sessions) ? s.sessions : [];
  var scope = s.scope || {};
  var projects = Array.isArray(scope.projects) ? scope.projects : [];
  var architecture = Array.isArray(scope.architecture) ? scope.architecture : [];
  var totals = s.totals || {};
  var loops = Array.isArray(s.loops) ? s.loops : [];
  var gpu = s.gpu || null;
  var remote = s.remote || null;
  var sync = s.sync || null;

  var out = '';

  // ── 1 · Cabeçalho + pilot actions ─────────────────────────────────────────
  out += '<div class="mc-head">'
    + '<div class="mc-title">🎛️ Mission Control <span class="mc-proj">' + nd(s.project) + '</span></div>'
    + '<div class="mc-pilot">'
    + btn('⏸ Pausar tudo', 'pauseAll', null, 'mc-warn', 'escreve a flag global de pausa (os runners honram-na)')
    + btn('▶ Retomar', 'resumeAll', null, '', 'limpa a flag de pausa')
    + btn('＋ Moo', 'spawnMoo', 'qwen3:30b', 'mc-ok', 'enche a GPU com um worker local ($0)')
    + btn('⇄ Handoff projecto', 'projHandoff', (s.project || ''), '', 'gera o handoff do projecto e copia')
    + btn('🔄 Refresh', 'refresh', null, '', 'força um refresh do snapshot')
    + '</div></div>';

  // ── 2 · Totais (honesto: n/d quando falta) ────────────────────────────────
  function totCell(label, value, cls) {
    return '<div class="mc-tot ' + (cls || '') + '"><div class="mc-totv">' + (value == null ? '<span class="mc-nd">n/d</span>' : value) + '</div><div class="mc-totl">' + esc(label) + '</div></div>';
  }
  out += '<div class="mc-card mc-totals">'
    + totCell('poupado hoje', usd(num(totals.savedToday)), 'mc-ok')
    + totCell('% local', (num(totals.pctLocal) == null ? null : (totals.pctLocal + '%')))
    + totCell('tokens hoje', fmtk(num(totals.tokensToday)))
    + totCell('commits pendentes', (totals.commitsPending != null ? totals.commitsPending : null), (totals.commitsPending ? 'mc-warn' : ''))
    + totCell('push pendentes', (totals.pushPending != null ? totals.pushPending : null), (totals.pushPending ? 'mc-warn' : ''))
    + totCell('precisam de ti', (totals.needYou != null ? totals.needYou : null), (totals.needYou ? 'mc-need' : ''))
    + totCell('contexto cheio', (totals.ctxFull != null ? totals.ctxFull : null), (totals.ctxFull ? 'mc-warn' : ''))
    + '</div>';

  // ── 3 · Breakdown por projecto ────────────────────────────────────────────
  out += '<div class="mc-card"><div class="mc-lbl">📦 Por projecto</div><div class="mc-chips">';
  if (projects.length) {
    for (var pi = 0; pi < projects.length; pi++) {
      var p = projects[pi] || {};
      var pdot = (p.status === 'active') ? '<span class="mc-dot mc-work"></span>' : '<span class="mc-dot mc-idle">⚪</span>';
      out += '<span class="mc-chip">' + pdot + esc(p.name || '?') + ' <b>' + (p.sessions != null ? esc(p.sessions) : '0') + '</b></span>';
    }
  } else {
    out += '<span class="mc-nd">n/d — sem projectos no snapshot</span>';
  }
  out += '</div>';

  // ── 3b · Breakdown por arquitectura (pilares) — sem fonte ainda → honesto ──
  out += '<div class="mc-lbl mc-lbl2">🏛️ Por arquitectura</div><div class="mc-chips">';
  if (architecture.length) {
    for (var ai = 0; ai < architecture.length; ai++) {
      var pil = architecture[ai];
      var pn = (pil && (pil.name || pil.id)) ? (pil.name || pil.id) : pil;
      out += '<span class="mc-chip mc-pillar">🏛️ ' + esc(pn) + (pil && pil.sessions != null ? ' <b>' + esc(pil.sessions) + '</b>' : '') + '</span>';
    }
  } else {
    out += '<span class="mc-nd">⚪ pilares ainda sem fonte (n/d) — chegam quando o snapshot os mapear</span>';
  }
  out += '</div></div>';

  // ── 4 · GPU gauge + spawn ─────────────────────────────────────────────────
  out += '<div class="mc-card"><div class="mc-lbl">🎮 GPU</div>';
  if (gpu) {
    var totMb = num(gpu.totalMb), freeMb = num(gpu.freeMb);
    var usedMb = (totMb != null && freeMb != null) ? Math.max(0, totMb - freeMb) : null;
    var usedPct = (totMb && usedMb != null) ? Math.max(0, Math.min(100, Math.round(usedMb / totMb * 100))) : null;
    out += '<div class="mc-gpubar"><div class="mc-gpufill" style="width:' + (usedPct == null ? 0 : usedPct) + '%"></div></div>';
    out += '<div class="mc-gpumeta">'
      + 'VRAM ' + (totMb == null ? nd(null) : ((freeMb == null ? nd(null) : (freeMb / 1024).toFixed(1) + 'GB livre') + ' / ' + (totMb / 1024).toFixed(1) + 'GB'))
      + ' · util ' + (num(gpu.utilPct) == null ? nd(null) : gpu.utilPct + '%')
      + ' · cabem <b>' + (num(gpu.fitsMoos) == null ? nd(null) : gpu.fitsMoos) + '</b> moos'
      + '</div>';
    if (Array.isArray(gpu.gpus) && gpu.gpus.length) {
      out += '<div class="mc-sub">';
      for (var gi = 0; gi < gpu.gpus.length; gi++) {
        var g = gpu.gpus[gi] || {};
        out += '<div>' + esc(g.name || ('GPU ' + (g.index != null ? g.index : gi))) + ' — ' + (num(g.utilPct) == null ? nd(null) : g.utilPct + '%') + ' · ' + (num(g.totalMb) == null ? nd(null) : (g.totalMb / 1024).toFixed(0) + 'GB') + '</div>';
      }
      out += '</div>';
    }
    out += '<div class="mc-gpuact">' + btn('＋ spawn moo na GPU', 'spawnMoo', 'qwen3:30b', 'mc-ok') + '</div>';
  } else {
    out += '<div class="mc-nd">⚪ n/d — nvidia-smi não escreveu cache (sem GPU NVIDIA ou monitor parado)</div>';
  }
  out += '</div>';

  // ── 5 · Banda de loops / schedules ────────────────────────────────────────
  out += '<div class="mc-card"><div class="mc-lbl">🔁 Loops &amp; schedules</div>';
  if (loops.length) {
    out += '<div class="mc-loops">';
    for (var li = 0; li < loops.length; li++) {
      var lp = loops[li] || {};
      var rnd = (num(lp.round) != null) ? (lp.round + (num(lp.maxRounds) != null ? '/' + lp.maxRounds : '')) : null;
      out += '<div class="mc-loop ' + (lp.active ? 'mc-on' : '') + '">'
        + (lp.active ? '<span class="mc-dot mc-work"></span>' : '<span class="mc-dot mc-idle">⚪</span>')
        + '<b>' + esc(lp.kind || lp.id || 'loop') + '</b>'
        + ' · ronda ' + (rnd == null ? nd(null) : rnd)
        + ' · ' + nd(lp.model)
        + (num(lp.nextInMs) != null ? ' · próx em ' + Math.round(lp.nextInMs / 1000) + 's' : '')
        + '</div>';
    }
    out += '</div>';
  } else {
    out += '<div class="mc-nd">⚪ nenhum loop activo (heartbeat &lt;90s ausente)</div>';
  }
  out += '</div>';

  // ── 6 · Git-graph de worktrees (clicar ramo → openSession) ────────────────
  var wtRows = [];
  for (var wi = 0; wi < sessions.length; wi++) {
    var ws = sessions[wi] || {};
    var wg = ws.git || {};
    if (ws.worktree || wg.branch) wtRows.push(ws);
  }
  out += '<div class="mc-card"><div class="mc-lbl">🌳 Worktrees</div>';
  if (wtRows.length) {
    out += '<div class="mc-tree">';
    for (var wj = 0; wj < wtRows.length; wj++) {
      var t = wtRows[wj] || {};
      var tg = t.git || {};
      var marks = '';
      if (num(tg.dirty) != null && tg.dirty > 0) marks += ' <span class="mc-mark mc-warn">✎' + tg.dirty + '</span>';
      if (num(tg.ahead) != null && tg.ahead > 0) marks += ' <span class="mc-mark">↑' + tg.ahead + '</span>';
      if (tg.pushNeeded === true) marks += ' <span class="mc-mark mc-warn">push</span>';
      var label = '<span class="mc-twt">🌳 ' + nd(t.worktree) + '</span>'
        + '<span class="mc-tbr">' + esc('⎇ ') + nd(tg.branch) + '</span>'
        + (tg.sha ? '<span class="mc-tsha">' + esc(String(tg.sha).slice(0, 7)) + '</span>' : '')
        + marks;
      // clicar → abre a sessão exacta deste ramo (openSession aceita o sid).
      if (t.sid) {
        out += '<button class="mc-treerow" data-a="openSession" data-x="' + esc(t.sid) + '" title="abrir esta sessão no VSCode">' + label + '</button>';
      } else {
        out += '<div class="mc-treerow mc-nolink" title="sem sessão ligada">' + label + '</div>';
      }
    }
    out += '</div>';
  } else {
    out += '<div class="mc-nd">⚪ n/d — nenhuma worktree/branch nas sessões actuais</div>';
  }
  out += '</div>';

  // ── 7 · Sessões (agrupadas por worktree quando há; senão lista única) ──────
  out += '<div class="mc-card"><div class="mc-lbl">🧵 Sessões <span class="mc-cnt">' + sessions.length + '</span></div>';
  if (sessions.length) {
    var CAP = 40;
    var shown = sessions.slice(0, CAP);
    out += '<div class="mc-sess">';
    for (var si = 0; si < shown.length; si++) {
      var ss = shown[si] || {};
      var sg = ss.git || {};
      var syn = ss.sync || {};
      var nflag = (syn.notion ? '<span class="mc-syn mc-ok" title="Notion sincronizado">N</span>' : '<span class="mc-syn mc-off" title="Notion n/d">N</span>');
      var oflag = (syn.obsidian ? '<span class="mc-syn mc-ok" title="Obsidian sincronizado">O</span>' : '<span class="mc-syn mc-off" title="Obsidian n/d">O</span>');
      var dev = ss.device ? ('<span class="mc-dev" title="dispositivo remoto">🛰️ ' + esc(ss.device) + '</span>') : '<span class="mc-dev mc-local" title="esta máquina">💻</span>';
      var tok = (num(ss.tokIn) != null || num(ss.tokOut) != null)
        ? (fmtk(ss.tokIn || 0) + '↓ ' + fmtk(ss.tokOut || 0) + '↑')
        : null;
      var gitChip = sg.branch
        ? (ss.sid
          ? '<button class="mc-link" data-a="openSession" data-x="' + esc(ss.sid) + '" title="abrir sessão">🔗 ' + esc(sg.branch) + '</button>'
          : '<span class="mc-link mc-nolink">🔗 ' + esc(sg.branch) + '</span>')
        : '<span class="mc-nd">🔗 n/d</span>';
      var loopBadge = ss.loop ? '<span class="mc-badge" title="loop">🔁</span>' : '';
      var autoBadge = ss.auto ? '<span class="mc-badge" title="auto">⚡</span>' : '';
      out += '<div class="mc-srow">'
        + '<div class="mc-sl">' + statusDot(ss.status) + '<span class="mc-cow" title="modo ' + esc(ss.mode || 'n/d') + '">' + mooEmoji(ss.mode) + '</span>'
        + '<b class="mc-sname">' + nd(ss.name) + '</b>' + loopBadge + autoBadge + '</div>'
        + '<div class="mc-sm">' + tierChip(ss.tier) + ' <span class="mc-model">' + nd(ss.model) + '</span>'
        + ' · ' + (tok == null ? '<span class="mc-nd">tokens n/d</span>' : tok)
        + ' · ctx ' + (num(ss.ctxPct) == null ? nd(null) : (ss.ctxPct + '%'))
        + ' · ' + nflag + oflag + ' · ' + dev + ' · ' + gitChip
        + (ss.sid ? ' ' + btn('🌳＋', 'subtree', ss.sid, 'mc-mini', 'liga uma subárvore de moos a esta sessão') : '')
        + '</div></div>';
    }
    out += '</div>';
    if (sessions.length > CAP) out += '<div class="mc-sub">+' + (sessions.length - CAP) + ' sessões não mostradas</div>';
  } else {
    out += '<div class="mc-nd">⚪ sem sessões no snapshot</div>';
  }
  out += '</div>';

  // ── 8 · Dispositivos remotos (Frente F · sync pending até aterrar) ─────────
  out += '<div class="mc-card"><div class="mc-lbl">🛰️ Dispositivos remotos</div>';
  if (remote && Array.isArray(remote.devices) && remote.devices.length) {
    out += '<div class="mc-chips">';
    for (var di = 0; di < remote.devices.length; di++) {
      var d = remote.devices[di] || {};
      var don = d.online ? '<span class="mc-dot mc-work"></span>' : '<span class="mc-dot mc-idle">⚪</span>';
      out += '<span class="mc-chip">' + don + esc(d.os || '?') + ' · ' + (d.sessions != null ? esc(d.sessions) : '0') + ' sess.</span>';
    }
    out += '</div>';
  } else {
    out += '<div class="mc-nd">⚪ sync pending — chega com a Frente F (hub cross-machine)</div>';
  }
  out += '</div>';

  // ── 9 · Assistente Moo (input → askMoo; stream renderizado por wireMc) ─────
  out += '<div class="mc-card mc-mooask"><div class="mc-lbl">🐮 Pergunta ao Moo <span class="mc-sub2">local · $0 · só responde do snapshot</span></div>'
    + '<div class="mc-mooin"><input id="mcMooIn" placeholder="🐮 o que precisa de ti agora? quantos tokens poupei? que loops estão activos?…" autocomplete="off"><button class="mc-btn mc-ok" id="mcMooGo">→</button></div>'
    + '<div class="mc-chips mc-eg">'
    + '<button class="mc-chip mc-q" data-q="O que precisa de mim agora?">O que precisa de mim?</button>'
    + '<button class="mc-chip mc-q" data-q="Quantos tokens poupei hoje?">Tokens poupados?</button>'
    + '<button class="mc-chip mc-q" data-q="Que loops estão activos?">Loops activos?</button>'
    + '<button class="mc-chip mc-q" data-q="Que sessões têm push pendente?">Push pendente?</button>'
    + '</div>'
    + '<div class="mc-mooout" id="mcMooOut"></div></div>';

  // ── 10 · Rodapé: totais + links externos ──────────────────────────────────
  out += '<div class="mc-foot">'
    + '<span>' + nd(usd(num(totals.savedToday))) + ' poupado · ' + (num(totals.pctLocal) == null ? nd(null) : totals.pctLocal + '% local') + '</span>'
    + '<span class="mc-flinks">'
    + btn('Notion', 'openUrl:https://www.notion.so', null, 'mc-mini')
    + btn('Obsidian', 'openUrl:obsidian://open', null, 'mc-mini')
    + btn('Hub', 'openUrl:https://mooter.ai', null, 'mc-mini')
    + '</span></div>';

  return out;
}

// Defensive wrapper: the host calls this; it must NEVER throw on the render path (§7/§9).
function renderMissionControlSafe(snapshot) {
  try { return renderMissionControl(snapshot); }
  catch (e) { return '<div class="mc-nd">Mission Control — erro de render (' + String(e && e.message || e) + ')</div>'; }
}

module.exports = { renderMissionControl, renderMissionControlSafe };
