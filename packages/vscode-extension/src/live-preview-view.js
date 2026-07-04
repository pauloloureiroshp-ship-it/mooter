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

  function clock(ts) {
    var s = String(ts == null ? '' : ts);
    return (s.length >= 19) ? s.slice(11, 19) : '';
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

module.exports = {
  esc: esc,
  parseBusJsonl: parseBusJsonl,
  detectActiveSid: detectActiveSid,
  filterBySession: filterBySession,
  buildBrainData: buildBrainData,
  renderDirectorsCut: renderDirectorsCut,
  renderBrain: renderBrain,
};
