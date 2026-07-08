'use strict';
// live-preview-view.js — Live Preview · MP1 (Painel + Director's Cut + Brain).
//
// Pure module, dual-use like row-renderer.js: required by tests (node:test) AND the
// `renderDirectorsCut`/`renderBrain` functions are serialised into the webview via
// `fn.toString()` (see extension.js's LivePreviewPanel/getLivePreviewHtml). ALL functions
// use string concatenation only — NO template literals, NO `${...}` — so the serialised
// source embeds safely inside getLivePreviewHtml()'s outer template literal.
// Pure: no Node.js APIs, no VSCode APIs, no require() calls anywhere in this file — the
// fs-touching tail-read of the file-bus lives HOST-SIDE in extension.js (mirrors data.js's
// readDecisions tail technique); this module only PARSES text/objects it is handed.
//
// ── HONESTY RULES (mirrors hook-collector.js's schema contract) ─────────────────────────
//   • Every bus event field is nullable — a field absent from the payload stays null/omitted
//     in the render, NEVER guessed (no fabricated tier/model/cost/path).
//   • Brain shows the REAL number (tier mix, $ cost, % local) or an explicit `n/d` — never
//     a fabricated "$0" or "uau". A cost only appears when some producer actually wrote a
//     non-null `cost` on a bus event; until then it is honestly `n/d`.
//   • Session scoping degrades honestly: when the active session id is unknown, Director's
//     Cut says so instead of silently mixing sessions.

// ── esc() — same discipline as row-renderer.js: module-scope, called as a free variable by
// the render functions below. When required in Node it resolves via normal JS lexical scope;
// when a render function is serialised via fn.toString() into the webview, `esc` resolves to
// the webview's OWN top-level `esc()` (already defined there for row-renderer, same contract).
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// ── parseBusJsonl(text, maxN) — PURE JSONL parser for the file-bus contract (hook-collector.js
// schema: ts/sid/kind/tool/path/summary/tier/model/cost/local). Tolerates garbage/truncated
// lines (fail-soft, never throws) and caps the returned list to the last `maxN` valid events
// (file order preserved — oldest first, mirrors how the bus is appended). The fs tail-read
// itself (last ~128KB, never the whole file) lives host-side in extension.js; this function
// only ever sees the text it is handed.
function parseBusJsonl(text, maxN) {
  var out = [];
  var lines = String(text == null ? '' : text).split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line || !line.trim()) continue;
    try {
      var j = JSON.parse(line);
      if (j && typeof j === 'object' && typeof j.kind === 'string' && j.kind) out.push(j);
    } catch (e) {
      // tolerate a truncated/garbage line — fail-soft, never throws
    }
  }
  var cap = (typeof maxN === 'number' && maxN > 0) ? maxN : 500;
  return out.length > cap ? out.slice(out.length - cap) : out;
}

// ── detectActiveSid(events) — PURE heuristic: the bus is append-only/chronological, so the
// most-recently-appended event that carries a non-null `sid` names the active session. This
// is honest and documented, not a guess dressed up as certainty: when NO event in the window
// carries a sid (e.g. a very early bus, or a producer that never learned the session id),
// this returns null and callers must degrade (Director's Cut says so explicitly).
function detectActiveSid(events) {
  var list = Array.isArray(events) ? events : [];
  for (var i = list.length - 1; i >= 0; i--) {
    var e = list[i];
    if (e && typeof e.sid === 'string' && e.sid) return e.sid;
  }
  return null;
}

// ── filterBySession(events, sid) — PURE. sid == null → cannot filter what we don't know, so
// it returns the full list unmodified (renderDirectorsCut then shows the honest "sessão activa
// desconhecida" note via opts.sidKnown=false). Otherwise keeps only events whose sid matches.
function filterBySession(events, sid) {
  var list = Array.isArray(events) ? events : [];
  if (!sid) return list.slice();
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].sid === sid) out.push(list[i]);
  }
  return out;
}

// ── tierCountsOf(list) — PURE. Mirrors data.js's tierCounts() shape (T0..T3 only — T5/Fable is
// opt-in-only per the tier ladder and never auto-routed, so it is intentionally excluded from
// the "local mix" the Brain overlay shows here).
function tierCountsOf(list) {
  var c = { T0: 0, T1: 0, T2: 0, T3: 0 };
  var arr = Array.isArray(list) ? list : [];
  for (var i = 0; i < arr.length; i++) {
    var t = arr[i] && arr[i].tier;
    if (c[t] != null) c[t]++;
  }
  return c;
}

// ── buildBrainData(decisions, sid, busEvents, gpu) — PURE aggregator for the Brain overlay.
//   decisions: parsed decisions.log entries (data.js readDecisions shape, newest-first).
//   sid:       the active session id (or null) — scopes the tier mix when we can.
//   busEvents: the file-bus events (any kind) — the ONLY source for a real $ cost, since
//              decisions.log entries do not carry one; a bus event's `cost` field is nullable
//              and only ever real when a producer wrote it (honesty — no invented $0/$2).
//   gpu:       the GPU snapshot cache object (or null) — read host-side via mc-snapshot.js's
//              readCache('gpu', ...) — reused here, NOT reinvented.
// Returns a plain object; NEVER throws (every field degrades to null on missing input).
function buildBrainData(decisions, sid, busEvents, gpu) {
  var all = Array.isArray(decisions) ? decisions : [];
  var scoped = sid ? all.filter(function (d) { return d && d.session_id === sid; }) : [];
  var scope = scoped.length ? 'session' : (all.length ? 'global' : 'none');
  var pool = scoped.length ? scoped : all;
  var last = pool.length ? pool[0] : null; // readDecisions() already returns newest-first
  var counts = tierCountsOf(pool);
  var total = counts.T0 + counts.T1 + counts.T2 + counts.T3;
  var pctLocal = total > 0 ? Math.round((counts.T0 / total) * 100) : null;

  var costUsd = null;
  var events = Array.isArray(busEvents) ? busEvents : [];
  for (var i = events.length - 1; i >= 0; i--) {
    var e = events[i];
    if (e && typeof e.cost === 'number' && isFinite(e.cost)) { costUsd = e.cost; break; }
  }

  return {
    scope: scope,
    sid: sid || null,
    lastTier: last ? (last.tier || null) : null,
    lastModel: last ? (last.recommended_model || null) : null,
    counts: counts,
    total: total,
    pctLocal: pctLocal,
    costUsd: costUsd,
    gpu: (gpu && typeof gpu === 'object') ? gpu : null,
  };
}

// ── renderDirectorsCut(events, opts) — 🎞️ live stream of the file-bus for the active session.
// events: ALREADY filtered host-side (filterBySession) — this function only renders. opts:
// { sidKnown }. Newest event first. Every field that is null on the event is simply omitted
// (never a fabricated placeholder like "unknown.js"). Self-contained except `esc` (free var —
// see the module-header note above); concat-only (no backticks/${} — embedded via toString()).
function renderDirectorsCut(events, opts) {
  opts = opts || {};
  var list = Array.isArray(events) ? events : [];
  var sidKnown = !!opts.sidKnown;

  function glyph(kind) {
    if (kind === 'reason') return '🧠'; // 🧠
    if (kind === 'file') return '✎';        // ✎
    if (kind === 'task') return '🤖';   // 🤖
    if (kind === 'server') return '⏹️'; // ⏹️
    if (kind === 'asset') return '🖼️'; // 🖼️
    if (kind === 'route') return '🔗';  // 🔗
    return '•'; // •
  }

  // Local timezone, honest. The old impl sliced chars 11..19 of the ISO string = ALWAYS UTC
  // (an event at 08:29 Sao Paulo showed 11:29). Now: new Date(ts).toLocaleTimeString honours the
  // OS/browser timezone both in Node (respects TZ) and in the serialised webview. ts == null is
  // guarded explicitly because new Date(null) is a VALID date (epoch 1970) -- never fabricate a
  // time; an absent/unparseable ts degrades to an honest n/d. (No backticks: this comment travels
  // inside renderDirectorsCut.toString() and must stay concat-safe.)
  function clock(ts) {
    if (ts == null) return 'n/d';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return 'n/d';
    return d.toLocaleTimeString(undefined, { hour12: false });
  }

  function line(e) {
    var g = glyph(e.kind);
    var parts = [];
    if (e.tool) parts.push(esc(e.tool));
    if (e.path) parts.push(esc(e.path));
    if (e.summary) parts.push(esc(e.summary));
    var body = parts.length ? parts.join(' · ') : '<span class="lpdc-nd">sem detalhe</span>';
    var meta = [];
    if (e.tier) meta.push(esc(e.tier));
    if (e.model) meta.push(esc(e.model));
    var metaHtml = meta.length ? (' <span class="lpdc-meta">' + meta.join(' · ') + '</span>') : '';
    return '<div class="lpdc-row lpdc-' + esc(e.kind || 'unknown') + '">'
      + '<span class="lpdc-time">' + esc(clock(e.ts)) + '</span>'
      + '<span class="lpdc-glyph">' + g + '</span>'
      + '<span class="lpdc-body">' + body + metaHtml + '</span>'
      + '</div>';
  }

  if (!list.length) {
    return '<div class="lpdc lpdc-empty"><div class="lpdc-hd">🎞️ Director\'s Cut</div>'
      + '<div class="lpdc-nd" style="margin-top:6px">nenhum evento ainda — corre uma sessão e o stream aparece aqui</div></div>';
  }

  var rows = '';
  for (var i = list.length - 1; i >= 0; i--) rows += line(list[i]);

  var scopeNote = sidKnown ? '' : '<div class="lpdc-nd" style="margin-top:2px">sessão activa desconhecida — a mostrar todos os eventos do bus</div>';
  return '<div class="lpdc"><div class="lpdc-hd">🎞️ Director\'s Cut · <b>' + list.length + '</b> evento' + (list.length === 1 ? '' : 's') + '</div>'
    + scopeNote
    + '<div class="lpdc-stream">' + rows + '</div></div>';
}

// ── renderBrain(brain) — 🧠 tier/model/$/GPU overlay. `brain` is buildBrainData()'s output (or
// null/garbage — never throws). Honest-copy: every unknown reads `n/d`, never a fabricated
// number. Self-contained except `esc` (same free-var contract as renderDirectorsCut above).
function renderBrain(brain) {
  var b = (brain && typeof brain === 'object') ? brain : {};

  function nd(v) {
    return (v == null || v === '') ? '<span class="lpbr-nd">n/d</span>' : esc(v);
  }

  var tierChip = b.lastTier ? ('<span class="lpbr-tier lpbr-' + esc(b.lastTier) + '">' + esc(b.lastTier) + '</span>') : nd(null);
  var modelTxt = nd(b.lastModel);
  var pctTxt = (typeof b.pctLocal === 'number') ? (b.pctLocal + '% local') : nd(null);
  var costTxt = (typeof b.costUsd === 'number' && isFinite(b.costUsd))
    ? ('$' + b.costUsd.toFixed((b.costUsd > 0 && b.costUsd < 0.01) ? 4 : 2))
    : nd(null);
  var scopeTxt = b.scope === 'session' ? '(sessão activa)' : (b.scope === 'global' ? '(global — sem decisões desta sessão)' : '');

  var c = b.counts || {};
  var total = b.total || 0;
  var mix;
  if (total > 0) {
    var order = [['T0', 'var(--t0,#4CAF6A)'], ['T1', 'var(--t1,#5A9BD4)'], ['T2', 'var(--t2,#A78BFA)'], ['T3', 'var(--t3,#D46A5A)']];
    var seg = '';
    for (var i = 0; i < order.length; i++) {
      var k = order[i][0];
      var n = c[k] || 0;
      var pct = Math.round(100 * n / total);
      if (pct > 0) seg += '<span style="width:' + pct + '%;background:' + order[i][1] + '" title="' + k + ' ' + n + '"></span>';
    }
    mix = '<div class="lpbr-mix">' + seg + '</div>';
  } else {
    mix = '<div class="lpbr-nd">sem decisões ainda</div>';
  }

  var gpu = b.gpu;
  var gpuName = (gpu && gpu.gpus && gpu.gpus[0] && gpu.gpus[0].name) ? esc(gpu.gpus[0].name) : null;
  var gpuUtil = (gpu && typeof gpu.utilPct === 'number') ? (gpu.utilPct + '% util') : null;
  var gpuTxt = (gpuName || gpuUtil) ? ((gpuName || nd(null)) + ' · ' + (gpuUtil || nd(null))) : nd(null);

  return '<div class="lpbr"><div class="lpbr-hd">🧠 Brain</div>'
    + '<div class="lpbr-row">tier <b>' + tierChip + '</b> · modelo ' + modelTxt + ' ' + esc(scopeTxt) + '</div>'
    + '<div class="lpbr-row">custo <b>' + costTxt + '</b> · ' + pctTxt + '</div>'
    + mix
    + '<div class="lpbr-row lpbr-gpu">GPU ' + gpuTxt + '</div>'
    + '</div>';
}

// ── renderDayBreakdown(byDay) — 📅 per-day rollup lens (Director's Cut v2 · F2, Unit A).
// byDay is the host-side day-bucket aggregate (newest day FIRST) or null/malformed — never
// throws. Concat-only + ES5, same serialisation contract as renderDirectorsCut/renderBrain
// above: relies ONLY on the free-var esc, no module state, no closures over outer vars.
function renderDayBreakdown(byDay) {
  var b = (byDay && typeof byDay === 'object') ? byDay : null;
  var days = (b && Array.isArray(b.days)) ? b.days : null;
  if (!b || !days || !days.length) {
    return '<div class="lpx lpdc-empty">sem decisões ainda</div>';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  var now = new Date();
  var today = ymd(now);
  var yestDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  var yesterday = ymd(yestDate);

  // dayLabel() already returns safe/escaped HTML — never wrap its result in esc() again at the
  // call site (that would double-escape a raw 'YYYY-MM-DD' day string containing entities).
  function dayLabel(day) {
    if (day === today) return 'Hoje';
    if (day === yesterday) return 'Ontem';
    return esc(day);
  }

  var newest = days[0] || {};
  var newestDec = newest.decisions || {};
  var heroPct = (typeof newestDec.pctLocal === 'number') ? newestDec.pctLocal : null;
  var heroNum = (heroPct != null) ? (esc(heroPct) + '% local') : '<span class="lpdc-nd">n/d</span>';
  var heroLabel = (newest.day === today) ? 'local hoje' : dayLabel(newest.day);

  var order = [['T0', 'var(--t0,#4CAF6A)'], ['T1', 'var(--t1,#5A9BD4)'], ['T2', 'var(--t2,#A78BFA)'], ['T3', 'var(--t3,#D46A5A)']];

  var rows = '';
  for (var i = 0; i < days.length; i++) {
    var d = days[i] || {};
    var ev = d.events || {};
    var dec = d.decisions || {};
    var tiers = dec.tiers || {};
    var total = dec.total || 0;
    var mix;
    if (total > 0) {
      var seg = '';
      var legend = '';
      for (var j = 0; j < order.length; j++) {
        var k = order[j][0];
        var n = tiers[k] || 0;
        var pct = Math.round(100 * n / total);
        if (pct > 0) seg += '<span style="width:' + pct + '%;background:' + order[j][1] + '" title="' + k + ' ' + n + '"></span>';
        legend += (legend ? ' ' : '') + k + ':' + n;
      }
      mix = '<div class="lpbr-mix">' + seg + '</div><span class="lpx-cell">' + legend + '</span>';
    } else {
      mix = '<span class="lpdc-nd">n/d</span>';
    }
    var pctTxt = (typeof dec.pctLocal === 'number') ? (esc(dec.pctLocal) + '%') : '<span class="lpdc-nd">n/d</span>';
    var costTxt = (typeof dec.costEstUsd === 'number' && isFinite(dec.costEstUsd)) ? ('~est. $' + dec.costEstUsd.toFixed(4)) : '<span class="lpdc-nd">n/d</span>';
    if (dec.costUncounted > 0) costTxt += ' · ' + esc(dec.costUncounted) + ' sem ~est.';
    rows += '<div class="lpx-tr">'
      + '<span class="lpx-cell">' + dayLabel(d.day) + '</span>'
      + '<span class="lpx-cell">' + (ev.total != null ? ev.total : 0) + '</span>'
      + '<span class="lpx-cell">' + total + '</span>'
      + '<span class="lpx-cell">' + mix + '</span>'
      + '<span class="lpx-cell">' + pctTxt + '</span>'
      + '<span class="lpx-cell">' + costTxt + '</span>'
      + '</div>';
  }

  var win = (b.window && typeof b.window === 'object') ? b.window : {};
  var winEvents = (win.events != null) ? win.events : 0;
  var winDecisions = (win.decisions != null) ? win.decisions : 0;
  // Honest scope (adversarial F2 finding): only the bus events are workspace-scoped; the
  // decisions/tiers/cost come from the machine-wide ~/.claude decisions.log (no cwd filter),
  // so each scope is labelled where it belongs rather than a single misleading "workspace".
  var foot = 'janela recente: ' + winEvents + ' eventos (deste workspace) · ' + winDecisions + ' decisões (todas as sessões desta máquina) — não é histórico completo';
  if (win.unplaced > 0) foot += ' · ' + win.unplaced + ' sem data';

  return '<div class="lpx">'
    + '<div class="lpx-hero"><div class="lpx-hero-n">' + heroNum + '</div><div class="lpx-hero-l">' + heroLabel + '</div></div>'
    + '<div class="lpx-tbl">'
    + '<div class="lpx-tr"><span class="lpx-cell">dia</span><span class="lpx-cell">eventos</span><span class="lpx-cell">decisões</span><span class="lpx-cell">tiers</span><span class="lpx-cell">local</span><span class="lpx-cell">custo</span></div>'
    + rows
    + '</div>'
    + '<div class="lpx-foot">' + foot + '</div>'
    + '</div>';
}

// ── renderModelBreakdown(byModel) — 🤖 per-model rollup lens (Director's Cut v2 · F2, Unit A).
// byModel is the host-side model aggregate or null/malformed — never throws. Concat-only + ES5,
// same serialisation contract as above; relies ONLY on the free-var esc. "ops reais" (from
// execution.log, ops.total) and "rotas" (from decisions.log, routes) are DISTINCT numbers and
// are NEVER merged into one column — that distinction is the whole point of this lens.
function renderModelBreakdown(byModel) {
  var b = (byModel && typeof byModel === 'object') ? byModel : null;
  var models = (b && Array.isArray(b.models)) ? b.models : null;
  if (!b || !models || !models.length) {
    return '<div class="lpx lpdc-empty">sem decisões ainda</div>';
  }

  var totals = (b.totals && typeof b.totals === 'object') ? b.totals : {};
  var win = (b.window && typeof b.window === 'object') ? b.window : {};

  var savedTxt = (typeof totals.savedEstUsd === 'number' && isFinite(totals.savedEstUsd))
    ? ('$' + totals.savedEstUsd.toFixed(4))
    : '<span class="lpdc-nd">n/d</span>';

  var tierColors = { T0: 'var(--t0,#4CAF6A)', T1: 'var(--t1,#5A9BD4)', T2: 'var(--t2,#A78BFA)', T3: 'var(--t3,#D46A5A)', T5: 'var(--t5,#C9A227)' };

  var rows = '';
  for (var i = 0; i < models.length; i++) {
    var m = models[i] || {};
    var ops = m.ops || {};
    var tier = m.tier || null;
    var isFable = tier === 'T5';
    var tierStyle = tier ? (' style="background:' + (tierColors[tier] || 'var(--vscode-descriptionForeground,#8a8a8a)') + '"') : '';
    var tierChip = '<span class="lpx-chip"' + tierStyle + '>' + esc(tier || 'n/d') + '</span>';
    var localChip = (m.local === true) ? ' <span class="lpx-chip">$0 local</span>' : '';
    var optInChip = isFable ? ' <span class="lpx-chip">opt-in</span>' : '';
    var opsTotal = (ops.total != null) ? ops.total : 0;
    var routes = (m.routes != null) ? m.routes : 0;
    var costTxt;
    if (isFable) {
      costTxt = '<span class="lpx-chip">opt-in</span>';
    } else if (typeof m.costEstUsd === 'number' && isFinite(m.costEstUsd)) {
      costTxt = '~est. $' + m.costEstUsd.toFixed(4);
    } else {
      costTxt = '<span class="lpdc-nd">n/d</span>';
    }
    rows += '<div class="lpx-tr">'
      + '<span class="lpx-cell">' + esc(m.model) + '</span>'
      + '<span class="lpx-cell">' + tierChip + optInChip + '</span>'
      + '<span class="lpx-cell">' + localChip + '</span>'
      + '<span class="lpx-cell">' + opsTotal + '</span>'
      + '<span class="lpx-cell">' + routes + '</span>'
      + '<span class="lpx-cell">' + costTxt + '</span>'
      + '</div>';
  }

  var winDecisions = (win.decisions != null) ? win.decisions : 0;
  var winExecOps = (win.execOps != null) ? win.execOps : 0;
  var foot = 'janela recente: ' + winDecisions + ' rotas · ' + winExecOps + ' ops — todas as sessões desta máquina';
  if (win.opsUnattributed > 0) foot += ' · ' + win.opsUnattributed + ' ops sem modelo resolvido';
  if (totals.costUncounted > 0) foot += ' · ' + totals.costUncounted + ' sem ~est.';

  var totalsCostTxt = (typeof totals.costEstUsd === 'number' && isFinite(totals.costEstUsd)) ? ('$' + totals.costEstUsd.toFixed(4)) : '<span class="lpdc-nd">n/d</span>';
  var totalsSavedTxt = (typeof totals.savedEstUsd === 'number' && isFinite(totals.savedEstUsd)) ? ('$' + totals.savedEstUsd.toFixed(4)) : '<span class="lpdc-nd">n/d</span>';
  var footTotals = '~est. ' + totalsCostTxt + ' · poupança vs all-Opus ~est. ' + totalsSavedTxt;

  return '<div class="lpx">'
    + '<div class="lpx-hero"><div class="lpx-hero-n">' + savedTxt + '</div><div class="lpx-hero-l">poupança vs all-Opus ~est.</div></div>'
    + '<div class="lpx-tbl">'
    + '<div class="lpx-tr"><span class="lpx-cell">modelo</span><span class="lpx-cell">tier</span><span class="lpx-cell">local</span><span class="lpx-cell">ops reais</span><span class="lpx-cell">rotas</span><span class="lpx-cell">custo</span></div>'
    + rows
    + '</div>'
    + '<div class="lpx-foot">' + foot + '<br>' + footTotals + '</div>'
    + '</div>';
}

// ── renderFleetLanes(fleet) — 🚦 GSD fleet swimlanes lens (Director's Cut v2 · F2, Unit A).
// fleet is the host-side mission-control snapshot or null/malformed — never throws. Concat-only
// + ES5, same serialisation contract as above; relies ONLY on the free-var esc. A rest banner
// NEVER hides a stale heartbeat — the age is always computed and shown beside the raw timestamp.
function renderFleetLanes(fleet) {
  var f = (fleet && typeof fleet === 'object') ? fleet : null;
  if (!f) {
    return '<div class="lpx lpdc-empty">sem sinais da frota ainda</div>';
  }

  function ageTxt(ts) {
    var t = Date.parse(ts);
    if (isNaN(t)) return null;
    var diffMs = Date.now() - t;
    if (diffMs < 0) diffMs = 0;
    var s = Math.floor(diffMs / 1000);
    if (s < 60) return 'há ' + s + 's';
    var mnt = Math.floor(s / 60);
    if (mnt < 60) return 'há ' + mnt + 'm';
    var h = Math.floor(mnt / 60);
    if (h < 24) return 'há ' + h + 'h';
    var dd = Math.floor(h / 24);
    return 'há ' + dd + 'd';
  }

  var hb = (f.heartbeat && typeof f.heartbeat === 'object') ? f.heartbeat : null;

  var restBanner = (f.resting === true) ? '<div class="lpx-hero"><span class="lpx-chip">frota em repouso</span></div>' : '';

  var hbTxt;
  if (hb && hb.ts) {
    var age = ageTxt(hb.ts);
    hbTxt = 'último sinal: ' + esc(hb.ts) + (age ? ' (' + age + ')' : '');
  } else {
    hbTxt = '<span class="lpdc-nd">n/d (sem heartbeat)</span>';
  }
  var dryRunChip = (hb && hb.dryRun === true) ? ' <span class="lpx-chip">dry-run</span>' : '';

  var pillars = (f.pillars && Array.isArray(f.pillars)) ? f.pillars : [];
  var lanes = '';
  for (var i = 0; i < pillars.length; i++) {
    var p = pillars[i] || {};
    var gpuTag = (p.gpuHeavy === true) ? ' 🔥GPU' : '';
    var status = (p.status != null && p.status !== '') ? esc(p.status) : 'n/d';
    var roundTxt = (p.round != null) ? ('round ' + esc(p.round)) : '';
    var runTxt;
    if (p.running === true) runTxt = 'a correr';
    else if (p.running === false) runTxt = 'parado';
    else runTxt = '<span class="lpdc-nd">n/d (sem heartbeat)</span>';

    lanes += '<div class="lpx-lane">'
      + '<div class="lpx-lane-hd">' + esc(p.id) + gpuTag + '</div>'
      + '<div class="lpx-lane-meta">' + status + (roundTxt ? ' · ' + roundTxt : '') + ' · ' + runTxt + '</div>'
      + '</div>';
  }

  var noPillarsNote = (!pillars.length && hb) ? '<div class="lpdc-nd">sem pilares</div>' : '';

  return '<div class="lpx">'
    + restBanner
    + '<div class="lpx-foot">' + hbTxt + dryRunChip + '</div>'
    + lanes
    + noPillarsNote
    + '</div>';
}

// ── renderWorkPill(events, nowMs) — 🐮 honest work heartbeat (Director's Cut v2 · F3). Pure +
// concat-only + ES5, same serialisation contract as the other lenses (free-var esc only, no
// backtick, no dollar-brace even in this comment). Derives state from the most-recent MEANINGFUL
// bus event (a work verb OR a Stop). A crash NEVER looks like work: >=90s with no Stop reads
// "sem sinal ha Xs", never an eternal spinner. nowMs is injectable for tests; defaults to now.
function renderWorkPill(events, nowMs) {
  var list = (events && Array.isArray(events)) ? events : [];
  var now = (typeof nowMs === 'number') ? nowMs : Date.now();
  function ageShort(ms) {
    var s = Math.floor((ms < 0 ? 0 : ms) / 1000);
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    return Math.floor(h / 24) + 'd';
  }
  var VERBS = { file: 'a editar…', task: 'a tarefar…', route: 'a rotear…', reason: 'a pensar (local $0)…' };
  var best = null;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    var k = e.kind;
    if (k !== 'server' && !VERBS[k]) continue;
    var t = Date.parse(e.ts);
    if (isNaN(t)) continue;
    if (!best || t > best.t) best = { t: t, kind: k };
  }
  var cls, label;
  if (!best) { cls = 'idle'; label = 'sem sinal ainda'; }
  else if (best.kind === 'server') { cls = 'done'; label = '✓ pronto'; }
  else {
    var age = now - best.t;
    if (age < 90000) { cls = 'working'; label = VERBS[best.kind]; }
    else { cls = 'stale'; label = 'sem sinal há ' + ageShort(age); }
  }
  return '<div class="lp-work ' + cls + '" role="status" aria-live="polite">'
    + '<span class="lpw-cow" aria-hidden="true">🐮</span>'
    + '<span class="lpw-txt">' + esc(label) + '</span>'
    + '</div>';
}

module.exports = {
  esc: esc,
  parseBusJsonl: parseBusJsonl,
  detectActiveSid: detectActiveSid,
  filterBySession: filterBySession,
  buildBrainData: buildBrainData,
  renderDirectorsCut: renderDirectorsCut,
  renderBrain: renderBrain,
  renderDayBreakdown: renderDayBreakdown,
  renderModelBreakdown: renderModelBreakdown,
  renderFleetLanes: renderFleetLanes,
  renderWorkPill: renderWorkPill,
};
