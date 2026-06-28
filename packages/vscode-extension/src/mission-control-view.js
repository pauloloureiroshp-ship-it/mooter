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
  // Clean a path-y name to its last segment ("…/frugal" → "frugal"). Render-only, honest.
  function cleanName(p) {
    var x = String(p == null ? '' : p).replace(/[\\/]+$/, '');
    var i = Math.max(x.lastIndexOf('/'), x.lastIndexOf('\\'));
    return i >= 0 ? x.slice(i + 1) : x;
  }
  // Loop kind → icon (mock identity): 🔁 autorev/inspection · ⚙️ evaluator · 🛸 fleet · 🔍 inspection.
  function loopIcon(kind) {
    var k = String(kind || '').toLowerCase();
    if (/fleet/.test(k)) return '🛸';
    if (/eval/.test(k)) return '⚙️';
    if (/inspect/.test(k)) return '🔍';
    return '🔁';
  }
  // Pillar (arquitectura) de uma sessão — derivado do tópico/nome (best-effort, honesto).
  function pillarOf(ss) {
    var x = String((ss && (ss.topic || ss.name)) || '').toLowerCase();
    if (/ux|\bui\b|cockpit|webview|css|design|interface|component|visual|polish|landing/.test(x)) return { id: 'ui', emoji: '🎨', name: 'UI/UX' };
    if (/router|routing|classif|algo|tier|pastor|\bmodel\b|prompt|eval/.test(x)) return { id: 'router', emoji: '🧮', name: 'Router' };
    if (/infra|hub|deploy|\bci\b|devops|sync|handoff|server|\bapi\b|pipeline|release|secur/.test(x)) return { id: 'infra', emoji: '🤝', name: 'Infra' };
    return { id: 'outros', emoji: '🧩', name: 'Outros' };
  }
  // Git state → branch colour class (git-graph): need > working > ahead > dirty > idle.
  function gitStateMc(ss) {
    var g = (ss && ss.git) || {};
    if (ss && ss.needsYou) return 'mc-st-need';
    if (ss && ss.status === 'working') return 'mc-st-work';
    if (g.ahead != null && g.ahead > 0) return 'mc-st-ahead';
    if (g.dirty != null && g.dirty > 0) return 'mc-st-dirty';
    return 'mc-st-idle';
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
    + '<div class="mc-title">🎛️ Mission Control <span class="mc-proj">' + nd(cleanName(s.project)) + '</span></div>'
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
  var realProj = {};
  if (projects.length) {
    for (var pi = 0; pi < projects.length; pi++) {
      var p = projects[pi] || {};
      var pn0 = p.name || '?';
      realProj[String(pn0).toLowerCase()] = true;
      var pdot = (p.status === 'active') ? '<span class="mc-dot mc-work"></span>' : '<span class="mc-dot mc-idle">⚪</span>';
      out += '<span class="mc-chip">' + pdot + esc(cleanName(pn0)) + ' <b>' + (p.sessions != null ? esc(p.sessions) : '0') + '</b></span>';
    }
  } else {
    out += '<span class="mc-nd">n/d — sem projectos no snapshot</span>';
  }
  // Frozen portfolio (mock identity): projectos sem sessões vivas → ❄ sem contagem (honesto, n/d).
  var PORTFOLIO = ['frugal', 'Cloude Home', 'Speaker', 'Marley'];
  for (var fz = 0; fz < PORTFOLIO.length; fz++) {
    if (!realProj[PORTFOLIO[fz].toLowerCase()]) {
      out += '<span class="mc-chip mc-frozen" title="portfolio — sem sessões vivas aqui (n/d, honesto)">❄ ' + esc(PORTFOLIO[fz]) + '</span>';
    }
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
    out += '<div class="mc-gpuact">' + btn('🔥 Overclock · Full Moo', 'spawnMoo', 'qwen3:30b', 'mc-ok mc-overclock', 'enche a GPU de workers locais — overclock total ($0)') + '</div>';
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
        + '<span class="mc-loopico" title="tipo de loop">' + loopIcon(lp.kind || lp.id) + '</span>'
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

  // ── 6 · Git-graph de worktrees — spine vertical do 🌿 main + ramos coloridos por estado
  //         (✎dirty ↑ahead · modelo·tokens · clicar ramo → openSession) ──────────────────
  var wtRows = [];
  for (var wi = 0; wi < sessions.length; wi++) {
    var ws = sessions[wi] || {};
    var wg = ws.git || {};
    if (ws.worktree || wg.branch) wtRows.push(ws);
  }
  out += '<div class="mc-card"><div class="mc-lbl">🌳 Git-graph · worktrees</div>';
  if (wtRows.length) {
    out += '<div class="mc-git"><div class="mc-gmain"><span class="mc-gnode mc-main"></span><b>🌿 main</b></div>';
    for (var wj = 0; wj < wtRows.length; wj++) {
      var t = wtRows[wj] || {};
      var tg = t.git || {};
      var marks = '';
      if (num(tg.dirty) != null && tg.dirty > 0) marks += ' <span class="mc-mark mc-warn" title="por commitar">✎' + tg.dirty + '</span>';
      if (num(tg.ahead) != null && tg.ahead > 0) marks += ' <span class="mc-mark" title="por enviar (push)">↑' + tg.ahead + '</span>';
      if (tg.pushNeeded === true) marks += ' <span class="mc-mark mc-warn">push</span>';
      var tmodel = t.model ? (' <span class="mc-gmodel" title="modelo">' + esc(t.model) + '</span>') : '';
      var ttok = (num(t.tokIn) != null || num(t.tokOut) != null) ? (' <span class="mc-gtok" title="tokens in/out">' + fmtk(t.tokIn || 0) + '↓ ' + fmtk(t.tokOut || 0) + '↑</span>') : '';
      var label = '<span class="mc-gnode ' + gitStateMc(t) + '"></span>'
        + '<span class="mc-tbr">' + esc('⎇ ') + nd(tg.branch) + '</span>'
        + (tg.sha ? '<span class="mc-tsha">' + esc(String(tg.sha).slice(0, 7)) + '</span>' : '')
        + marks
        + (t.worktree ? ' <span class="mc-twt" title="worktree">🌳 ' + esc(cleanName(t.worktree)) + '</span>' : '')
        + tmodel + ttok;
      // clicar → abre a sessão exacta deste ramo (openSession aceita o sid).
      if (t.sid) {
        out += '<button class="mc-gitrow mc-treerow ' + gitStateMc(t) + '" data-a="openSession" data-x="' + esc(t.sid) + '" title="abrir esta sessão no VSCode">' + label + '</button>';
      } else {
        out += '<div class="mc-gitrow mc-treerow mc-nolink" title="sem sessão ligada">' + label + '</div>';
      }
    }
    out += '</div>';
  } else {
    out += '<div class="mc-nd">⚪ n/d — nenhuma worktree/branch nas sessões actuais</div>';
  }
  out += '</div>';

  // ── 7 · Sessões agrupadas por arquitectura (🎨 UI/UX · 🧮 Router · 🤝 Infra · 🧩 Outros) ──
  //         Cada card: emoji+nome · modelo · tokens(ctx%) · 🐮 vaquinha · 🔁 loop · estado · N/O · 🔗git · 🌳+subtree.
  out += '<div class="mc-card"><div class="mc-lbl">🧵 Sessões <span class="mc-cnt">' + sessions.length + '</span></div>';
  if (sessions.length) {
    var CAP = 40;
    var shown = sessions.slice(0, CAP);
    function sessionCard(ss) {
      ss = ss || {};
      var sg = ss.git || {};
      var syn = ss.sync || {};
      var pil = pillarOf(ss);
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
      return '<div class="mc-srow ' + gitStateMc(ss) + '">'
        + '<div class="mc-sl">' + statusDot(ss.status) + '<span class="mc-cow" title="modo ' + esc(ss.mode || 'n/d') + '">' + mooEmoji(ss.mode) + '</span>'
        + '<span class="mc-stop" title="' + esc(pil.name) + '">' + pil.emoji + '</span>'
        + '<b class="mc-sname">' + nd(ss.name) + '</b>' + loopBadge + autoBadge + '</div>'
        + '<div class="mc-sm">' + tierChip(ss.tier) + ' <span class="mc-model">' + nd(ss.model) + '</span>'
        + ' · ' + (tok == null ? '<span class="mc-nd">tokens n/d</span>' : tok)
        + ' · ctx ' + (num(ss.ctxPct) == null ? nd(null) : (ss.ctxPct + '%'))
        + ' · ' + nflag + oflag + ' · ' + dev + ' · ' + gitChip
        + (ss.sid ? ' ' + btn('🌳＋', 'subtree', ss.sid, 'mc-mini', 'liga uma subárvore de moos a esta sessão') : '')
        + '</div></div>';
    }
    var order = ['ui', 'router', 'infra', 'outros'];
    var meta = { ui: { emoji: '🎨', name: 'UI/UX' }, router: { emoji: '🧮', name: 'Router' }, infra: { emoji: '🤝', name: 'Infra' }, outros: { emoji: '🧩', name: 'Outros' } };
    var groups = { ui: [], router: [], infra: [], outros: [] };
    for (var gi2 = 0; gi2 < shown.length; gi2++) {
      var pid = pillarOf(shown[gi2]).id;
      (groups[pid] || groups.outros).push(shown[gi2]);
    }
    for (var oi = 0; oi < order.length; oi++) {
      var key = order[oi];
      var arr = groups[key];
      if (!arr.length) continue;
      out += '<div class="mc-pgrp"><div class="mc-pgrp-h">' + meta[key].emoji + ' ' + esc(meta[key].name) + ' <span class="mc-cnt">' + arr.length + '</span></div><div class="mc-sess">';
      for (var ci = 0; ci < arr.length; ci++) out += sessionCard(arr[ci]);
      out += '</div></div>';
    }
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
