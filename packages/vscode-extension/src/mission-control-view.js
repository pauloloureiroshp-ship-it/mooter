'use strict';
// mission-control-view.js — Frente G · Página Mission Control (+ assistente Moo).
//
// `renderMissionControl(snapshot)` renders the WHOLE Mission Control tab PURELY from the
// MissionControlSnapshot (Frente 0, mc-snapshot.js §6). MOCK-FAITHFUL rebuild (mc-fidelity):
// project pills · dense summary band · segmented GPU gauge · real git-graph spine ·
// loops as pills · session cards grouped by architecture topic (attention-first) · Moo.
//
// It is **concat-only / CSP-safe**: no template literals, no `${}`, no inline event handlers —
// every interactive element is a `<button data-a=…>` (wired host-side by wireButtons) or the
// Moo input (wired by wireMc). The host serialises this via `.toString()` straight INTO the
// getHtml() template literal; a backtick or `${` here would break the outer template and the
// webview-syntax test. Topic/group/letter are DERIVED in-view (no new snapshot field needed).
//
// Honesty rule (§6/§9): EVERY field is nullable. Missing → `n/d` / `⚪`, never fabricated.
// remote/sync arrive `null` until Frente F lands → explicit "sync pending". NEVER throws.

function renderMissionControl(snapshot) {
  // ── Self-contained helpers (serialised with the function — no module-scope refs) ──
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
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  }
  function usd(v) { return (v == null) ? null : ('$' + Number(v).toFixed(2)); }
  function usdp(v) { return (v == null) ? null : ('$' + Number(v).toFixed(4)); }
  function mooEmoji(mode) {
    var m = String(mode || '').toLowerCase();
    if (m === 'beast' || m === 'crazy') return '🌀';
    if (m === 'zen' || m === 'lazy') return '😴';
    return '🐮';
  }
  function famEmoji(model) {
    var x = String(model || '').toLowerCase();
    if (!x) return '';
    if (x.indexOf('fable') >= 0) return '🌟';
    if (/claude|opus|sonnet|haiku/.test(x)) return '✨';
    if (/qwen|llama|gemma|deepseek|mistral|phi|ollama/.test(x) || x.indexOf(':') >= 0) return '🦙';
    if (x.indexOf('gemini') >= 0) return '💎';
    if (/gpt|codex|openai/.test(x)) return '🟢';
    return '🤖';
  }
  function modelShort(model) {
    var x = String(model || '');
    if (!x) return null;
    return x.replace(/^claude-/, '').replace(/\[1m\]/, '').replace(/-/g, ' ').trim();
  }
  function tierChip(tier) {
    if (!tier) return '';
    return '<span class="mc-tier mc-' + esc(tier) + '">' + esc(tier) + '</span>';
  }
  // Topic → emoji (per session). Default neutral dot (never fabricate).
  function topicEmoji(s) {
    var t = String((s && (s.topic || s.name)) || '').toLowerCase();
    var b = String((s && s.git && s.git.branch) || '').toLowerCase();
    var x = t + ' ' + b;
    if (/\bux\b|usab|paint|brush/.test(x)) return '🖌️';
    if (/lane|labor|interface|\bui\b|component|css|webview|cockpit|arch.?tree|render|design/.test(x)) return '🎨';
    if (/inspect|\bqa\b|test|quality/.test(x)) return '🔍';
    if (/review|reviewer|verify|draft/.test(x)) return '👀';
    if (/algo|algorit|classif|routing|router|council|frontier|adapter|pastor|lora/.test(x)) return '🧮';
    if (/secur|seguran|auth|vuln/.test(x)) return '🛡️';
    if (/site|web|landing|marketing|launch|growth/.test(x)) return '🌐';
    if (/financ|cost|saving|budget|poupan/.test(x)) return '💰';
    if (/handoff|bridge/.test(x)) return '🤝';
    if (/devops|\bci\b|deploy|infra|pipeline|sync/.test(x)) return '⚙️';
    if (/loop/.test(x)) return '🔁';
    return '·';
  }
  // Topic group (architecture lane) for a session.
  function topicGroup(s) {
    var t = String((s && (s.topic || s.name)) || '').toLowerCase();
    var b = String((s && s.git && s.git.branch) || '').toLowerCase();
    var x = t + ' ' + b;
    if (/\bui\b|\bux\b|cockpit|webview|css|component|lane|labor|arch.?tree|design|render/.test(x)) return { key: 'gui', label: 'UI / UX', emoji: '🎨' };
    if (/router|algo|classif|routing|council|inspect|verify|draft|benchmark|frontier|adapter|pastor|lora/.test(x)) return { key: 'grouter', label: 'Router / Algoritmo', emoji: '🧮' };
    if (/infra|handoff|sync|bridge|deploy|\bci\b|hub|devops|pipeline/.test(x)) return { key: 'ginfra', label: 'Infra / Handoff', emoji: '🤝' };
    return { key: 'gother', label: 'Outros', emoji: '🗂️' };
  }
  function letterFor(i) { return (i < 26) ? String.fromCharCode(65 + i) : String(i + 1); }
  function btn(label, cmd, arg, cls, title) {
    var x = (arg == null) ? '' : ' data-x="' + esc(arg) + '"';
    var t = title ? ' title="' + esc(title) + '"' : '';
    return '<button class="mc-btn ' + (cls || '') + '" data-a="' + esc(cmd) + '"' + x + t + '>' + label + '</button>';
  }

  var s = snapshot || {};
  var sessions = Array.isArray(s.sessions) ? s.sessions.filter(Boolean) : [];
  var scope = s.scope || {};
  var projects = Array.isArray(scope.projects) ? scope.projects : [];
  var architecture = Array.isArray(scope.architecture) ? scope.architecture : [];
  var totals = s.totals || {};
  var loops = Array.isArray(s.loops) ? s.loops : [];
  var gpu = s.gpu || null;
  var remote = s.remote || null;

  // Stable per-session letter (mock A,B,C…) + derived topic/group, computed once.
  for (var i0 = 0; i0 < sessions.length; i0++) {
    var s0 = sessions[i0];
    s0.__letter = letterFor(i0);
    s0.__temoji = topicEmoji(s0);
    s0.__group = topicGroup(s0);
  }

  var out = '';

  // ── 1 · Header: title + project pills + menu ──────────────────────────────
  out += '<div class="mc-head"><div class="mc-title">🎛️ Mission Control</div>';
  out += '<div class="mcf-pills">';
  if (projects.length) {
    for (var pi = 0; pi < projects.length; pi++) {
      var p = projects[pi] || {};
      var active = (p.status === 'active');
      var cls = 'mcf-pill' + (active ? ' on' : ' frozen');
      var inner = active
        ? '<span class="mcf-pdot"></span>' + esc(p.name || p.id || '?') + ' <span class="mcf-cnt">' + (p.sessions != null ? esc(p.sessions) : '0') + '</span>'
        : '❄️ ' + esc(p.name || p.id || '?');
      out += '<span class="' + cls + '">' + inner + '</span>';
    }
  } else {
    out += '<span class="mc-nd">n/d — sem projectos no snapshot</span>';
  }
  out += '</div><div class="mcf-menu" title="mais">⋯</div></div>';

  // ── 2 · Pilot actions ─────────────────────────────────────────────────────
  out += '<div class="mc-pilot">'
    + btn('❚❚ pausar tudo', 'pauseAll', null, 'mc-warn', 'escreve a flag global de pausa (os runners honram-na)')
    + btn('▶ retomar', 'resumeAll', null, '', 'limpa a flag de pausa')
    + btn('＋ spawn moo', 'spawnMoo', 'qwen3:30b', 'mc-ok', 'enche a GPU com um worker local ($0)')
    + btn('⇄ handoff geral', 'projHandoff', (s.project || ''), '', 'gera o handoff do projecto e copia')
    + btn('🔄', 'refresh', null, '', 'força um refresh do snapshot')
    + '</div>';

  // ── 3 · Summary band ──────────────────────────────────────────────────────
  // Architecture pillars: from scope.architecture, else distinct session group labels.
  var pillars = [];
  if (architecture.length) {
    for (var ai = 0; ai < architecture.length; ai++) {
      var pa = architecture[ai];
      pillars.push(esc((pa && (pa.name || pa.id)) ? (pa.name || pa.id) : pa));
    }
  } else {
    var seenG = {};
    for (var gi = 0; gi < sessions.length; gi++) {
      var gl = sessions[gi].__group.label;
      if (!seenG[gl]) { seenG[gl] = 1; pillars.push(esc(gl)); }
    }
  }
  var savedTxt = usd(num(totals.savedToday));
  var pctTxt = (num(totals.pctLocal) == null) ? null : (totals.pctLocal + '% local');
  var toksTxt = fmtk(num(totals.tokensToday));
  out += '<div class="mc-card"><div class="mcf-band">'
    + '<span class="mcf-bseg">🐮 <b>Mooter · ' + nd(s.project) + '</b></span>'
    + '<span class="mcf-vrule"></span>'
    + '<span class="mcf-bseg mcf-arch"><span class="mcf-bk">arquitectura:</span> <b>' + (pillars.length ? pillars.join(' · ') : '<span class="mc-nd">n/d</span>') + '</b></span>'
    + '<span class="mcf-vrule"></span>'
    + '<span class="mcf-bseg"><span class="mcf-bk">💰 hoje</span> <span class="mcf-hero">' + (savedTxt == null ? '<span class="mc-nd">n/d</span>' : savedTxt) + '</span> <span class="mcf-bk">(' + (pctTxt == null ? '<span class="mc-nd">n/d</span>' : esc(pctTxt)) + ')</span></span>'
    + '<span class="mcf-vrule"></span>'
    + '<span class="mcf-bseg"><span class="mcf-bk">tokens</span> <span class="mcf-toks">' + (toksTxt == null ? '<span class="mc-nd">n/d</span>' : toksTxt) + '</span></span>'
    + '</div>'
    + '<div class="mcf-mini"><span>🖥️ ' + sessions.length + ' sessões</span>'
    + '<span>🍅 ' + (totals.needYou != null ? esc(totals.needYou) : '0') + ' a precisar de ti</span></div>'
    + '</div>';

  // ── 4 · GPU gauge (segmentado) ────────────────────────────────────────────
  out += '<div class="mc-card">';
  if (gpu) {
    var totMb = num(gpu.totalMb), freeMb = num(gpu.freeMb);
    var usedMb = (totMb != null && freeMb != null) ? Math.max(0, totMb - freeMb) : null;
    var usedPct = (totMb && usedMb != null) ? Math.max(0, Math.min(100, Math.round(usedMb / totMb * 100))) : null;
    var fits = num(gpu.fitsMoos);
    // aggregate local throughput (sum of per-session tok/s) — honest n/d when none.
    var tps = null;
    for (var ti = 0; ti < sessions.length; ti++) { var v = num(sessions[ti].tokPerSec); if (v != null) tps = (tps || 0) + v; }
    var gpuName = (Array.isArray(gpu.gpus) && gpu.gpus[0] && gpu.gpus[0].name) ? gpu.gpus[0].name : 'GPU';
    out += '<div class="mcf-gpuhead">'
      + '<span>🖥️ <b>' + esc(gpuName) + '</b></span>'
      + '<span class="mcf-bk">VRAM <b>' + (usedMb == null || totMb == null ? nd(null) : ((usedMb / 1024).toFixed(1) + ' / ' + (totMb / 1024).toFixed(1) + ' GB')) + '</b>' + (usedPct == null ? '' : ' (' + usedPct + '%)') + '</span>'
      + (tps == null ? '' : '<span class="mcf-bk"><b>' + Math.round(tps) + '</b> tok/s</span>')
      + '<span class="mcf-spacer"></span>'
      + '<span class="mcf-star">🏆 ' + (freeMb == null ? nd(null) : (freeMb / 1024).toFixed(1) + ' GB livre') + ' → cabem <b>' + (fits == null ? 'n/d' : ('+' + fits)) + '</b> moos</span>'
      + btn('＋ spawn', 'spawnMoo', 'qwen3:30b', 'mc-ok')
      + '</div>';
    // segmented gauge: 10 slots; filled = used VRAM; trailing fits slots = ghost capacity.
    var SEG = 10;
    var filled = (usedPct == null) ? 0 : Math.max(0, Math.min(SEG, Math.round(usedPct / 10)));
    var freeSlots = (fits == null) ? 0 : Math.max(0, Math.min(SEG - filled, fits));
    out += '<div class="mcf-gauge">';
    for (var gx = 0; gx < SEG; gx++) {
      var gc = 'mcf-gseg';
      if (gx < filled) { gc += (gx === filled - 1 && usedPct != null && usedPct >= 70) ? ' mcf-gused mcf-gusedhot' : ' mcf-gused'; }
      else if (gx >= SEG - freeSlots) { gc += ' mcf-gfree'; }
      out += '<div class="' + gc + '"></div>';
    }
    out += '</div>';
    out += '<div class="mcf-glegend">'
      + '<span><i class="mcf-swatch" style="background:var(--g)"></i>VRAM em uso (compute)</span>'
      + (freeSlots ? '<span><i class="mcf-swatch mcf-gfree"></i>folga p/ +' + freeSlots + ' (Overclock)</span>' : '')
      + '</div>';
  } else {
    out += '<div class="mc-lbl">🖥️ GPU</div><div class="mc-nd">⚪ n/d — nvidia-smi não escreveu cache (sem GPU NVIDIA ou monitor parado)</div>';
  }
  out += '</div>';

  // ── 5 · Worktree git-graph ────────────────────────────────────────────────
  var wtRows = [];
  for (var wi = 0; wi < sessions.length; wi++) { var ws = sessions[wi]; if (ws.worktree || (ws.git && ws.git.branch)) wtRows.push(ws); }
  var WTCOL = ['#54b56a', '#56b6c2', '#e5c07b', '#61afef', '#9d7cd8', '#d19a66'];
  out += '<div class="mc-card"><div class="mc-lbl">⛙ Worktree · ' + nd(s.project) + ' <span class="mc-sub">— clica num ramo para abrir a sessão</span></div>';
  out += '<div class="mcf-graph">';
  // root (main)
  out += '<div class="mcf-grow"><div class="mcf-spine"><div class="mcf-line"></div><div class="mcf-node"></div></div>'
    + '<div class="mcf-branch"><div class="mcf-groot">⚪ <b>main</b> · <span class="mcf-gsha">' + (s.mainSha ? esc(String(s.mainSha).slice(0, 7)) : 'workspace') + '</span> · <span class="mcf-gok">sha ✓</span></div></div></div>';
  if (wtRows.length) {
    for (var wj = 0; wj < wtRows.length; wj++) {
      var t = wtRows[wj];
      var tg = t.git || {};
      var col = WTCOL[wj % WTCOL.length];
      var last = (wj === wtRows.length - 1);
      var dirty = num(tg.dirty), ahead = num(tg.ahead);
      var stCls = (t.status === 'working') ? 'work' : (t.status === 'needs-you' ? 'warn' : (tg.pushNeeded === true ? 'push' : 'idle'));
      var hot = (num(t.ctxPct) != null && t.ctxPct >= 80);
      var chips = '<span class="mcf-bchip' + (dirty ? ' dirty' : '') + '">✎' + (dirty == null ? 0 : dirty) + '</span>'
        + '<span class="mcf-bchip' + (ahead ? ' ahead' : '') + '">↑' + (ahead == null ? 0 : ahead) + '</span>';
      var tail = (tg.pushNeeded === true && !(dirty))
        ? '<span class="mcf-bchip push">por push ↑</span>'
        : '<span class="mc-model">' + (t.model ? (famEmoji(t.model) + ' ' + esc(modelShort(t.model)) + (num(t.tokOut) != null || num(t.tokIn) != null ? ' ' + fmtk((t.tokIn || 0) + (t.tokOut || 0)) : '')) : nd(null)) + '</span>'
        + (hot ? ' <span class="mcf-warnx" title="contexto quase cheio">⚠️</span>' : '');
      var label = '<span>' + t.__temoji + '</span><span class="mcf-bname">' + nd(tg.branch) + '</span>' + chips
        + '<span class="mcf-slet"><span class="mcf-sdot ' + stCls + '"></span>' + esc(t.__letter) + '</span>' + tail;
      var spine = '<div class="mcf-spine"><div class="mcf-line' + (last ? ' half' : '') + '"></div>'
        + '<div class="mcf-node" style="border-color:' + col + '"></div><div class="mcf-conn" style="background:' + col + '"></div></div>';
      if (t.sid) {
        out += '<div class="mcf-grow">' + spine + '<div class="mcf-branch"><button class="mcf-brow' + (stCls === 'push' ? ' attn' : (hot ? ' hot' : '')) + '" data-a="openSession" data-x="' + esc(t.sid) + '" title="abrir esta sessão no VSCode">' + label + '</button></div></div>';
      } else {
        out += '<div class="mcf-grow">' + spine + '<div class="mcf-branch"><div class="mcf-brow nolink" title="sem sessão ligada">' + label + '</div></div></div>';
      }
    }
  } else {
    out += '<div class="mc-nd" style="padding-left:30px">⚪ n/d — nenhuma worktree/branch nas sessões actuais</div>';
  }
  out += '</div></div>';

  // ── 6 · Loops & schedules (pills) ─────────────────────────────────────────
  out += '<div class="mc-card"><div class="mc-lbl">🔁 Loops &amp; schedules</div>';
  if (loops.length) {
    out += '<div class="mcf-loops">';
    for (var li = 0; li < loops.length; li++) {
      var lp = loops[li] || {};
      var kind = String(lp.kind || lp.id || 'loop');
      var kemoji = /eval/.test(kind.toLowerCase()) ? '⚙️' : (/fleet/.test(kind.toLowerCase()) ? '🚜' : (/sched/.test(kind.toLowerCase()) ? '⏰' : '🧊'));
      var rnd = (num(lp.round) != null) ? (lp.round + (num(lp.maxRounds) != null ? '/' + lp.maxRounds : '')) : null;
      var meta = [];
      if (rnd != null) meta.push('r' + rnd);
      if (lp.model) meta.push(esc(modelShort(lp.model)));
      if (num(lp.nextInMs) != null) meta.push('próx ' + Math.round(lp.nextInMs / 1000) + 's');
      var localLoop = /qwen|llama|gemma|local|ollama|:/.test(String(lp.model || '').toLowerCase());
      out += '<span class="mcf-loop' + (lp.active ? ' on' : '') + '">' + kemoji + ' <b>' + esc(kind) + '</b>'
        + (meta.length ? ' <span class="mcf-lmeta">' + meta.join(' · ') + '</span>' : '')
        + (localLoop ? ' <span class="mcf-free0">$0</span>' : '')
        + '</span>';
    }
    out += '</div>';
  } else {
    out += '<div class="mc-nd">⚪ nenhum loop activo (heartbeat &lt;90s ausente)</div>';
  }
  out += '</div>';

  // ── 7 · Sessions grouped by architecture topic (attention-first) ──────────
  var ORDER = ['gui', 'grouter', 'ginfra', 'gother'];
  var groups = {};
  for (var sgi = 0; sgi < sessions.length; sgi++) {
    var sg = sessions[sgi];
    var k = sg.__group.key;
    if (!groups[k]) groups[k] = { meta: sg.__group, rows: [] };
    groups[k].rows.push(sg);
  }
  function sessionCard(ss) {
    var stCls = (ss.status === 'working') ? 'work' : (ss.status === 'needs-you' ? 'warn' : (ss.git && ss.git.pushNeeded === true ? 'push' : 'idle'));
    var hot = (num(ss.ctxPct) != null && ss.ctxPct >= 80);
    var cardCls = 'mcf-scard ' + (ss.__group.key)
      + (ss.needsYou ? ' attn mc-need' : (hot ? ' hot' : ''));
    var ctxv = num(ss.ctxPct);
    var ctxBlock = (ctxv != null)
      ? '<span class="mcf-ctxbar"><span class="mcf-ctxfill' + (hot ? ' hot' : '') + '" style="width:' + ctxv + '%"></span></span> <span' + (hot ? ' class="mcf-ctxhot"' : '') + '>' + ctxv + '%</span>'
      : '';
    var tok = (num(ss.tokIn) != null || num(ss.tokOut) != null) ? fmtk((ss.tokIn || 0) + (ss.tokOut || 0)) : null;
    var costTxt = (tok == null && num(ss.cost) != null) ? ('<span class="mcf-cost">' + usdp(ss.cost) + '</span>') : (tok == null ? '<span class="mc-nd">tokens n/d</span>' : tok);
    var modelLine = tierChip(ss.tier) + ' ' + (ss.model ? (famEmoji(ss.model) + ' ' + esc(modelShort(ss.model))) : nd(null)) + ' · ' + costTxt + (ctxBlock ? ' ' + ctxBlock : '');
    var cow = '<span class="mcf-cow ' + (ss.loop && ss.status === 'working' ? 'loop' : (ss.status === 'working' ? 'work' : '')) + '" title="modo ' + esc(ss.mode || 'n/d') + '">' + mooEmoji(ss.mode) + '</span>';
    var loopBadge = ss.loop ? '<span title="loop">🔁</span>' : '';
    var autoBadge = ss.auto ? '<span title="auto">⚡</span>' : '';
    var icons = cow + loopBadge + autoBadge + '<span class="mcf-sdot ' + stCls + '" style="width:9px;height:9px"></span>'
      + (hot ? '<span class="mcf-bchip" style="color:var(--t3);margin-left:auto">🟡 ctx quase cheio</span>' : '');
    var syn = ss.sync || {};
    var nOn = (syn.notion ? 'mcf-on' : 'mcf-off'), oOn = (syn.obsidian ? 'mcf-on' : 'mcf-off');
    var dev = ss.device ? ('🛰️ ' + esc(ss.device)) : '💻';
    var foot = '<span class="mcf-syn">N<span class="mcf-d ' + nOn + '"></span></span>'
      + '<span class="mcf-syn">O<span class="mcf-d ' + oOn + '"></span></span>'
      + '<span class="mcf-sdot ' + stCls + '" style="width:8px;height:8px"></span><span>' + dev + '</span>'
      + (ss.git && ss.git.pushNeeded === true && ss.sid
        ? '<button class="mcf-pushbtn" data-a="openSession" data-x="' + esc(ss.sid) + '" title="abrir para rever e enviar">✅ push?</button>'
        : (ss.sid
          ? '<button class="mcf-gitlink" data-a="openSession" data-x="' + esc(ss.sid) + '" title="abrir sessão">🔗 git</button>'
          : '<span class="mc-nd">🔗 n/d</span>'));
    return '<div class="' + cardCls + '">'
      + '<div class="mcf-stop"><span class="mcf-sname"><span class="mcf-let">' + esc(ss.__letter) + '</span> ' + ss.__temoji + ' ' + nd(ss.name) + '</span>' + (hot ? '<span class="mcf-warnx mcf-spacer">⚠️</span>' : '') + '</div>'
      + '<div class="mcf-smodel">' + modelLine + '</div>'
      + '<div class="mcf-sicons">' + icons + '</div>'
      + '<div class="mcf-sfoot">' + foot + '</div>'
      + '</div>';
  }
  if (sessions.length) {
    for (var oi = 0; oi < ORDER.length; oi++) {
      var gk = ORDER[oi];
      var grp = groups[gk];
      if (!grp || !grp.rows.length) continue;
      // attention-first inside each group
      grp.rows.sort(function (a, b) { return (b.needsYou ? 1 : 0) - (a.needsYou ? 1 : 0); });
      out += '<div class="mcf-grph">' + grp.meta.emoji + ' ' + esc(grp.meta.label) + '</div><div class="mcf-scards">';
      for (var ri = 0; ri < grp.rows.length; ri++) out += sessionCard(grp.rows[ri]);
      out += '</div>';
    }
  } else {
    out += '<div class="mc-card"><div class="mc-nd">⚪ sem sessões no snapshot</div></div>';
  }

  // ── 8 · Dispositivos remotos (Frente F · sync pending até aterrar) ─────────
  out += '<div class="mc-card"><div class="mc-lbl">🛰️ Dispositivos remotos</div>';
  if (remote && Array.isArray(remote.devices) && remote.devices.length) {
    out += '<div class="mcf-loops">';
    for (var di = 0; di < remote.devices.length; di++) {
      var d = remote.devices[di] || {};
      out += '<span class="mcf-loop' + (d.online ? ' on' : '') + '">' + (d.online ? '🟢' : '⚪') + ' ' + esc(d.os || '?') + ' <span class="mcf-lmeta">' + (d.sessions != null ? esc(d.sessions) : '0') + ' sess.</span></span>';
    }
    out += '</div>';
  } else {
    out += '<div class="mc-nd">⚪ sync pending — chega com a Frente F (hub cross-machine)</div>';
  }
  out += '</div>';

  // ── 9 · Assistente Moo (input → askMoo; stream renderizado por wireMc) ─────
  out += '<div class="mc-card"><div class="mc-lbl">🐮 Pergunta ao Moo <span class="mc-sub">local · $0 · só mission control + handoff</span></div>'
    + '<div class="mc-mooin"><input id="mcMooIn" placeholder="ex: o que precisa de mim agora?" autocomplete="off"><button class="mc-btn mc-ok" id="mcMooGo">→</button></div>'
    + '<div class="mc-eg">'
    + '<button class="mc-chip mc-q" data-q="O que precisa de mim agora?">o que precisa de mim?</button>'
    + '<button class="mc-chip mc-q" data-q="Gera o handoff geral do projecto.">handoff geral</button>'
    + '<button class="mc-chip mc-q" data-q="Qual a sessão com maior gasto de tokens?">maior gasto de tokens</button>'
    + '<button class="mc-chip mc-q" data-q="Quanta folga de GPU tenho para mais moos?">folga de GPU?</button>'
    + '</div>'
    + '<div class="mc-mooout" id="mcMooOut"></div></div>';

  return out;
}

// Defensive wrapper: the host calls this; it must NEVER throw on the render path (§7/§9).
function renderMissionControlSafe(snapshot) {
  try { return renderMissionControl(snapshot); }
  catch (e) { return '<div class="mc-nd">Mission Control — erro de render (' + String(e && e.message || e) + ')</div>'; }
}

module.exports = { renderMissionControl, renderMissionControlSafe };
