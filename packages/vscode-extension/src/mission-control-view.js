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
  // ── MCV2 helpers (serialised with the function — concat-only, no module-scope refs) ──
  // Dependency state from the Lineage deps field (contrato Ledger/Lineage). Honest:
  // unknown/absent → independente (🟢); never fabricate a warning we can't back from deps.
  // deps may be an object ({ irreversibleAhead, waitMerge, waitPush, blockedBy[] }) or an
  // array of edge strings ("merge", "push", "irreversible", …). Worst state wins (⚠ > 🟡 > 🟢).
  function depState(deps) {
    if (deps == null) return { dot: '🟢', label: 'independente', cls: 'mcv2-dep-ok' };
    var irrev = false, wait = false;
    function scanStr(x) {
      var v = String(x || '').toLowerCase();
      if (/irrevers|irreversible|destruct|drop|reset|force.?push|migrat/.test(v)) irrev = true;
      else if (/merge|push|rebase|pull|depend|block|wait|espera/.test(v)) wait = true;
    }
    if (Array.isArray(deps)) {
      for (var di = 0; di < deps.length; di++) {
        var e = deps[di];
        if (e && typeof e === 'object') { scanStr(e.kind || e.type || e.label || e.on); }
        else scanStr(e);
      }
    } else if (typeof deps === 'object') {
      if (deps.irreversibleAhead === true || deps.irreversible === true) irrev = true;
      if (deps.waitMerge === true || deps.waitPush === true || deps.waitsMerge === true ||
          deps.waitsPush === true || deps.blocked === true) wait = true;
      if (Array.isArray(deps.blockedBy) && deps.blockedBy.length) wait = true;
      if (Array.isArray(deps.edges)) {
        for (var dj = 0; dj < deps.edges.length; dj++) {
          var ed = deps.edges[dj];
          if (ed && typeof ed === 'object') scanStr(ed.kind || ed.type || ed.label || ed.on);
          else scanStr(ed);
        }
      }
    } else {
      scanStr(deps);
    }
    if (irrev) return { dot: '⚠️', label: 'irreversível à frente', cls: 'mcv2-dep-irr' };
    if (wait) return { dot: '🟡', label: 'espera merge/push', cls: 'mcv2-dep-wait' };
    return { dot: '🟢', label: 'independente', cls: 'mcv2-dep-ok' };
  }
  // Heartbeat → alive/idle. Honest: explicit alive flag wins; else infer from recency of
  // lastEventTs (≤90s ⇒ vivo, matching the loop heartbeat window), else n/d (⚪).
  function fleetAlive(m) {
    if (m && (m.alive === true)) return { dot: '🟢', label: 'vivo' };
    if (m && (m.alive === false)) return { dot: '⚪', label: 'idle' };
    var ts = (m && num(m.lastEventTs)) != null ? num(m.lastEventTs) : null;
    if (ts != null) {
      var ageMs = Date.now() - ts;
      if (ageMs >= 0 && ageMs <= 90000) return { dot: '🟢', label: 'vivo' };
      return { dot: '⚪', label: 'idle' };
    }
    return { dot: '⚪', label: 'n/d' };
  }
  function agoTxt(ts) {
    var t = num(ts);
    if (t == null) return null;
    var sec = Math.round((Date.now() - t) / 1000);
    if (sec < 0) return null;
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.round(sec / 60) + 'm';
    return Math.round(sec / 3600) + 'h';
  }
  function tsTxt(ts) {
    var t = num(ts);
    if (t == null) return null;
    try { return new Date(t).toISOString().slice(11, 19); } catch (e) { return null; }
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
  // ── MCV2 snapshot reads (optional; render n/d until the live Ledger/Lineage lands) ──
  var fleet = Array.isArray(s.fleet) ? s.fleet.filter(Boolean) : [];
  var ledger = Array.isArray(s.audit) ? s.audit : (Array.isArray(s.ledger) ? s.ledger : []);

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
    + btn('🔥 Overclock', 'overclockMoo', null, 'mc-overclock', 'reclamar GPU ociosa com moos locais ($0)')
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

  // ══════════════════════════════════════════════════════════════════════════
  // ── MCV2 ── "bater-o-olho-e-saber": poupança em destaque + saúde da frota +
  // sessões agrupadas por task_group (deps) + painel Audit (replay do ledger).
  // Attention-first: o que precisa de ti / o que pode correr mal fica em cima.
  // Tudo PURELY do snapshot; cada campo nullable → n/d. Live data (fleet/ledger/
  // deps/task_group) chega com o Ledger+Lineage; até lá, rende n/d honesto.
  // ══════════════════════════════════════════════════════════════════════════

  // ── MCV2 · A · Poupança em destaque (strip attention-first) ──────────────
  var mcv2Saved = usd(num(totals.savedToday));
  var mcv2Pct = (num(totals.pctLocal) == null) ? null : (totals.pctLocal + '%');
  out += '<div class="mc-card mcv2-savings">'
    + '<span class="mcv2-sv-k">💰 poupado hoje</span> '
    + '<span class="mcv2-sv-hero">' + (mcv2Saved == null ? '<span class="mc-nd">n/d</span>' : mcv2Saved) + '</span>'
    + '<span class="mcf-vrule"></span>'
    + '<span class="mcv2-sv-k">local</span> '
    + '<span class="mcv2-sv-pct">' + (mcv2Pct == null ? '<span class="mc-nd">n/d</span>' : esc(mcv2Pct)) + '</span>'
    + '<span class="mcv2-sv-tag">$0 = moo local</span>'
    + '</div>';

  // ── MCV2 · B · Saúde da frota de moos (heartbeat · fila · tok/s · $0) ─────
  out += '<div class="mc-card mcv2-fleet"><div class="mc-lbl">🚜 Frota de moos <span class="mc-sub">— heartbeat · fila · tok/s · custo local</span></div>';
  if (fleet.length) {
    out += '<div class="mcv2-fleetrows">';
    for (var fi = 0; fi < fleet.length; fi++) {
      var fm = fleet[fi] || {};
      var alive = fleetAlive(fm);
      var fname = (fm.name || fm.id);
      var last = agoTxt(fm.lastEventTs);
      var lastLbl = (last != null) ? ('há ' + last) : (fm.lastEvent ? esc(fm.lastEvent) : '<span class="mc-nd">n/d</span>');
      var qd = num(fm.queueDepth);
      var tps = num(fm.toksPerSec);
      var fcost = (fm.costUsd === 0 || num(fm.costUsd) === 0) ? '$0' : (num(fm.costUsd) != null ? usdp(fm.costUsd) : null);
      out += '<div class="mcv2-fleetrow">'
        + '<span class="mcv2-fhb" title="' + esc(alive.label) + '">' + alive.dot + '</span>'
        + '<span class="mcv2-fname">' + nd(fname) + '</span>'
        + '<span class="mcv2-fk">último</span> <span class="mcv2-fv">' + lastLbl + '</span>'
        + '<span class="mcv2-fk">fila</span> <span class="mcv2-fv">' + (qd == null ? '<span class="mc-nd">n/d</span>' : esc(qd)) + '</span>'
        + '<span class="mcv2-fk">tok/s</span> <span class="mcv2-fv">' + (tps == null ? '<span class="mc-nd">n/d</span>' : Math.round(tps)) + '</span>'
        + '<span class="mcv2-f0">' + (fcost == null ? '<span class="mc-nd">n/d</span>' : esc(fcost)) + '</span>'
        + '</div>';
    }
    out += '</div>';
  } else {
    out += '<div class="mc-nd">⚪ n/d — supervisor heartbeat ainda não aterrou (chega com o Ledger)</div>';
  }
  out += '</div>';

  // ── MCV2 · C · Sessões agrupadas por task_group (estado de dependência) ──
  out += '<div class="mc-card mcv2-tg"><div class="mc-lbl">🧬 Sessões por tarefa <span class="mc-sub">— task_group · 🟢 indep · 🟡 espera merge/push · ⚠️ irreversível à frente</span></div>';
  if (sessions.length) {
    var tgMap = {}, tgOrder = [];
    for (var tgi = 0; tgi < sessions.length; tgi++) {
      var tss = sessions[tgi];
      var gkey = (tss.taskGroup != null && tss.taskGroup !== '') ? String(tss.taskGroup) : '__nogroup';
      if (!tgMap[gkey]) { tgMap[gkey] = []; tgOrder.push(gkey); }
      tgMap[gkey].push(tss);
    }
    for (var tgj = 0; tgj < tgOrder.length; tgj++) {
      var gk2 = tgOrder[tgj];
      var rows = tgMap[gk2];
      // worst dep state in the group bubbles to the header (attention-first)
      var hdrWorst = 0;
      for (var hwi = 0; hwi < rows.length; hwi++) {
        var dsw = depState(rows[hwi].deps);
        var rank = (dsw.dot === '⚠️') ? 2 : (dsw.dot === '🟡' ? 1 : 0);
        if (rank > hdrWorst) hdrWorst = rank;
      }
      var hdrDot = hdrWorst === 2 ? '⚠️' : (hdrWorst === 1 ? '🟡' : '🟢');
      var gLabel = (gk2 === '__nogroup') ? '<span class="mc-nd">n/d — sem task_group</span>' : esc(gk2);
      out += '<div class="mcv2-tghd"><span class="mcv2-tgdot">' + hdrDot + '</span>🧬 <b>' + gLabel + '</b> <span class="mcv2-tgcnt">' + rows.length + '</span></div>';
      out += '<div class="mcv2-tgrows">';
      for (var tri = 0; tri < rows.length; tri++) {
        var rss = rows[tri];
        var ds = depState(rss.deps);
        var rname = nd(rss.name);
        var rmodel = rss.model ? (famEmoji(rss.model) + ' ' + esc(modelShort(rss.model))) : nd(null);
        var openTail = rss.sid
          ? '<button class="mcv2-tgopen" data-a="openSession" data-x="' + esc(rss.sid) + '" title="abrir esta sessão">🔗</button>'
          : '<span class="mc-nd">🔗 n/d</span>';
        out += '<div class="mcv2-tgrow ' + ds.cls + '" title="' + esc(ds.label) + '">'
          + '<span class="mcv2-depdot">' + ds.dot + '</span>'
          + '<span class="mcv2-tgname">' + rname + '</span>'
          + '<span class="mcv2-deplbl">' + esc(ds.label) + '</span>'
          + '<span class="mcv2-tgmodel">' + tierChip(rss.tier) + ' ' + rmodel + '</span>'
          + openTail
          + '</div>';
      }
      out += '</div>';
    }
  } else {
    out += '<div class="mc-nd">⚪ sem sessões no snapshot</div>';
  }
  out += '</div>';

  // ── MCV2 · D · Painel Audit (replay do ledger · read-only · who/model/tier/kind/ts) ──
  out += '<div class="mc-card mcv2-audit"><div class="mc-lbl">🧾 Audit <span class="mc-sub">— replay do ledger · read-only · registo auditável</span></div>';
  if (ledger.length) {
    // Filter chips: "all" + distinct task_group/sid seen in the ledger. Presentation +
    // host-wire affordance (data-a="auditFilter"); host filtering is follow-up — replay is full.
    var seenF = {}, chips = '<button class="mc-btn mcv2-afilter on" data-a="auditFilter" data-x="all" title="mostrar todos os eventos">todos</button>';
    for (var fci = 0; fci < ledger.length; fci++) {
      var fev = ledger[fci] || {};
      var fkey = (fev.taskGroup != null && fev.taskGroup !== '') ? String(fev.taskGroup)
        : ((fev.sid != null && fev.sid !== '') ? String(fev.sid) : null);
      if (fkey && !seenF[fkey]) {
        seenF[fkey] = 1;
        chips += '<button class="mc-btn mcv2-afilter" data-a="auditFilter" data-x="' + esc(fkey) + '" title="filtrar por ' + esc(fkey) + '">' + esc(fkey) + '</button>';
      }
    }
    out += '<div class="mcv2-afilters">' + chips + '</div>';
    out += '<div class="mcv2-audrows">';
    var AUDIT_CAP = 60;
    var shown = Math.min(ledger.length, AUDIT_CAP);
    for (var evi = 0; evi < shown; evi++) {
      var ev = ledger[evi] || {};
      var who = (ev.agent != null && ev.agent !== '') ? ev.agent : (ev.who != null ? ev.who : null);
      var when = tsTxt(ev.ts);
      var kind = (ev.kind != null && ev.kind !== '') ? ev.kind : null;
      var emodel = ev.model ? (famEmoji(ev.model) + ' ' + esc(modelShort(ev.model))) : nd(null);
      out += '<div class="mcv2-audrow">'
        + '<span class="mcv2-audts">' + (when == null ? '<span class="mc-nd">n/d</span>' : esc(when)) + '</span>'
        + '<span class="mcv2-audkind">' + (kind == null ? '<span class="mc-nd">n/d</span>' : esc(kind)) + '</span>'
        + '<span class="mcv2-audwho">' + nd(who) + '</span>'
        + '<span class="mcv2-audtier">' + (ev.tier ? tierChip(ev.tier) : '<span class="mc-nd">n/d</span>') + '</span>'
        + '<span class="mcv2-audmodel">' + emodel + '</span>'
        + '</div>';
    }
    out += '</div>';
    if (ledger.length > AUDIT_CAP) {
      out += '<div class="mcv2-audmore">+' + (ledger.length - AUDIT_CAP) + ' mais</div>';
    }
  } else {
    out += '<div class="mc-nd">⚪ n/d — ledger vazio (replay chega quando o Ledger+Lineage aterrar)</div>';
  }
  out += '</div>';
  // ══════════════════════════════════ end ── MCV2 ── ══════════════════════════

  // ── 4 · GPU gauge (segmentado) + Overclock Moo counter ──────────────────
  // overclock sub-object: set by mc-snapshot when there is a recent run (nullable all fields).
  var oc = (gpu && gpu.overclock) ? gpu.overclock : null;
  // Honest overclock counter string. ALL null fields render as n/d. METR caveat mandatory.
  function ocCounter(o) {
    if (!o) return null;
    var idleB = (o.idleBefore != null) ? esc(String(o.idleBefore)) + '%' : 'n/d';
    var utilD = (o.utilDuring != null) ? esc(String(o.utilDuring)) + '%' : 'n/d';
    var jobsN = (o.jobs != null) ? esc(String(o.jobs)) : 'n/d';
    var minR = (o.humanMinRecovered != null) ? esc(String(o.humanMinRecovered)) : 'n/d';
    var usdA = (o.cloudUsdAvoided != null) ? ('$' + esc(Number(o.cloudUsdAvoided).toFixed(4))) : 'n/d';
    var parts = 'GPU ociosa ' + idleB + '→' + utilD
      + ' · ' + jobsN + ' moos'
      + ' · ⏳ ~' + minR + ' min recuperados <span style="font-size:9px;opacity:.75">(est, METR)</span>'
      + ' · 💰 ~' + usdA + ' cloud evitado'
      + ' · <span style="color:var(--g)">$0 local</span>';
    // throughputX: secondary, labelled, omitted if null
    if (o.throughputX != null) {
      parts += ' <span style="font-size:9px;opacity:.6">· throughput ~' + esc(String(o.throughputX)) + '× (secundário)</span>';
    }
    return '<div class="mcf-oc-counter" style="font-size:10.5px;margin-top:6px;line-height:1.55;border-top:1px solid var(--vscode-widget-border);padding-top:5px">'
      + '🔥 <b>Overclock Moo</b> · ' + parts + '</div>';
  }
  out += '<div class="mc-card">';
  if (gpu && (gpu.totalMb != null || gpu.freeMb != null || gpu.gpus)) {
    var totMb = num(gpu.totalMb), freeMb = num(gpu.freeMb);
    var usedMb = (totMb != null && freeMb != null) ? Math.max(0, totMb - freeMb) : null;
    var usedPct = (totMb && usedMb != null) ? Math.max(0, Math.min(100, Math.round(usedMb / totMb * 100))) : null;
    var fits = num(gpu.fitsMoos);
    // aggregate local throughput (sum of per-session tok/s) — honest n/d when none.
    var tps = null;
    for (var ti = 0; ti < sessions.length; ti++) { var v = num(sessions[ti].tokPerSec); if (v != null) tps = (tps || 0) + v; }
    var gpuName = (Array.isArray(gpu.gpus) && gpu.gpus[0] && gpu.gpus[0].name) ? gpu.gpus[0].name : 'GPU';
    // When there is a recent overclock run the head visually lights up (orange glow accent).
    var headStyle = oc ? ' style="background:linear-gradient(90deg,transparent,rgba(209,154,102,.08))"' : '';
    out += '<div class="mcf-gpuhead"' + headStyle + '>'
      + '<span>🖥️ <b>' + esc(gpuName) + '</b>' + (oc ? ' <span style="color:var(--acc-orange);font-size:10px">🔥</span>' : '') + '</span>'
      + '<span class="mcf-bk">VRAM <b>' + (usedMb == null || totMb == null ? nd(null) : ((usedMb / 1024).toFixed(1) + ' / ' + (totMb / 1024).toFixed(1) + ' GB')) + '</b>' + (usedPct == null ? '' : ' (' + usedPct + '%)') + '</span>'
      + (tps == null ? '' : '<span class="mcf-bk"><b>' + Math.round(tps) + '</b> tok/s</span>')
      + '<span class="mcf-spacer"></span>'
      + '<span class="mcf-star">🏆 ' + (freeMb == null ? nd(null) : (freeMb / 1024).toFixed(1) + ' GB livre') + ' → cabem <b>' + (fits == null ? 'n/d' : ('+' + fits)) + '</b> moos</span>'
      + btn('＋ spawn', 'spawnMoo', 'qwen3:30b', 'mc-ok')
      + btn('🔥 Overclock', 'overclockMoo', null, 'mc-overclock', 'reclamar GPU ociosa com moos locais ($0)')
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
    // Overclock counter — only when there is recent data; otherwise silent.
    var ocHtml = ocCounter(oc);
    if (ocHtml) out += ocHtml;
  } else if (gpu && gpu.overclock) {
    // gpu-snapshot absent (no nvidia-smi) but we have overclock data — show minimal header + counter.
    out += '<div class="mc-lbl">🖥️ GPU</div>'
      + '<div class="mc-nd" style="font-size:10.5px">⚪ n/d — nvidia-smi cache ausente (monitor parado?)</div>';
    var ocHtml2 = ocCounter(oc);
    if (ocHtml2) out += ocHtml2;
    out += '<div style="margin-top:6px">'
      + btn('🔥 Overclock', 'overclockMoo', null, 'mc-overclock', 'reclamar GPU ociosa com moos locais ($0)')
      + '</div>';
  } else {
    out += '<div class="mc-lbl">🖥️ GPU</div><div class="mc-nd">⚪ n/d — nvidia-smi não escreveu cache (sem GPU NVIDIA ou monitor parado)</div>';
    out += '<div style="margin-top:6px">'
      + btn('🔥 Overclock', 'overclockMoo', null, 'mc-overclock', 'reclamar GPU ociosa com moos locais ($0)')
      + '</div>';
  }
  out += '</div>';

  // ── 5 · Worktree git-graph ────────────────────────────────────────────────
  var wtRows = [];
  for (var wi = 0; wi < sessions.length; wi++) { var ws = sessions[wi]; if (ws.worktree || (ws.git && ws.git.branch)) wtRows.push(ws); }
  var WTCOL = ['var(--ok)', 'var(--teal)', 'var(--acc-warm)', 'var(--blue-bright)', 'var(--purple)', 'var(--acc-orange)'];
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
    // -- GUARDIAN:F1 -- pressure chip next to the ctx bar. guardianChip is a webview-injected
    // sibling (shared with the herd); typeof-guarded so a host-side render simply omits the chip.
    // Concat-only: no backticks here (renderMissionControl is embedded via fn.toString()).
    var gChip = (typeof guardianChip === 'function' && ctxv != null) ? guardianChip(ctxv, esc) : '';
    var modelLine = tierChip(ss.tier) + ' ' + (ss.model ? (famEmoji(ss.model) + ' ' + esc(modelShort(ss.model))) : nd(null)) + ' · ' + costTxt + (ctxBlock ? ' ' + ctxBlock : '') + gChip;
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
    // ── GUARDIAN:F3 ── "⇄ Saltar para fresca": surge SÓ no limiar de delírio (advise ≥90,
    // contrato F1 pressureLadder). ss.ctxPct já vem do snapshot MC (mc-snapshot). Clique → handler
    // guardianJump: abre sessão CC nova + entrega o handoff pré-cozinhado (semeado no input; Ctrl+V
    // se não aparecer — já vai no clipboard). A sessão velha fica intacta.
    var jumpRow = (num(ss.ctxPct) != null && ss.ctxPct >= 90 && ss.sid)
      ? '<div class="mcf-jumprow">' + btn('⇄ Saltar para fresca · ' + ss.ctxPct + '%', 'guardianJump', ss.sid, 'mc-jump mc-mini',
          'A janela de contexto está a ' + ss.ctxPct + '% — perto do limiar de delírio (a sessão começa a perder coerência). Abre uma sessão CC NOVA e entrega-lhe o handoff pré-cozinhado (semeado no input da sessão nova; se não aparecer, Ctrl+V — já vai no clipboard). A sessão velha fica intacta.') + '</div>'
      : '';
    return '<div class="' + cardCls + '">'
      + '<div class="mcf-stop"><span class="mcf-sname"><span class="mcf-let">' + esc(ss.__letter) + '</span> ' + ss.__temoji + ' ' + nd(ss.name) + '</span>' + (hot ? '<span class="mcf-warnx mcf-spacer">⚠️</span>' : '') + '</div>'
      + '<div class="mcf-smodel">' + modelLine + '</div>'
      + '<div class="mcf-sicons">' + icons + '</div>'
      + jumpRow
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
