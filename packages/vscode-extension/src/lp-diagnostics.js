'use strict';
// lp-diagnostics.js — Live Preview · MP4 (Honest Diagnostics strip).
//
// PURE decision layer for the in-panel error/console strip. Same split as lp-stage.js:
//   • No `vscode`, no fs, no net — this module only PARSES the `lp-error` payloads the tap
//     relays and RESOLVES the honest strip state + the host-side actions (open file, copy).
//     The fs.existsSync (file resolve) and the clipboard write live HOST-SIDE in extension.js.
//   • Every function is fail-soft — never throws on garbage input.
//   • `renderErrorStrip` is concat-only (NO backticks, NO ${…}) and calls `esc` as a FREE
//     variable, exactly like lp-stage.renderStageStatus, so it can be serialised into the
//     webview via fn.toString() and executed there against the webview's own top-level esc().
//
// ── SECURITY (MP4 origin lock) ───────────────────────────────────────────────────────────────
//   The App Stage <iframe> is CROSS-ORIGIN (vscode-webview:// ↔ http://localhost:PORT); the host
//   cannot read its DOM/console (same-origin policy), so the dev-only tap inside the landing does
//   `window.parent.postMessage({type:'lp-error',…})`. That message is UNTRUSTED. `acceptTapOrigin`
//   is the ONLY sanctioned gate: it accepts a tap message ONLY when `event.origin` is EXACTLY the
//   localhost origin currently framed (reusing lp-stage's origin allowlist — one source of truth).
//   It rejects '*', 'null', a stale origin, and anything non-localhost. The webview additionally
//   checks `event.source === iframe.contentWindow`, so a sibling frame cannot spoof the origin.
//
// ── HONESTY (honest-controls) ──────────────────────────────────────────────────────────────────
//   The strip NEVER fabricates "all good". Zero errors → it renders '' (hidden) — it does not
//   claim health it cannot measure. A runtime error is red, a build error amber, and the "abrir
//   ficheiro" button is DISABLED with an honest tooltip when there is no file:line to open.

const LPS = require('./lp-stage.js');

// esc() — module-scope free var (same contract as lp-stage.js): resolves via JS lexical scope in
// Node, and via the webview's OWN top-level esc() when renderErrorStrip is serialised in.
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function clampStr(s, n) {
  var out = String(s == null ? '' : s);
  return out.length > n ? out.slice(0, n) : out;
}

// A positive 1..9_999_999 integer line/column, or null (no location).
function normLineNo(v) {
  var n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isInteger(n) && n > 0 && n < 10000000 ? n : null;
}

// ── MP4-polish · honest severity — fatal (red) vs warning (amber), and DROP our own noise ────────
// The strip once lit RED for `:host { all: initial }` — a benign CSS warning the browser emits about
// the Live Preview's OWN shadow-DOM highlight (the `direction`/`unicode-bidi` shorthand it drops).
// That is not the app's problem and must never light the strip; a CSS PARSE warning from the app's
// styles is a nit, not a runtime error, so it goes amber, never red. These two PURE predicates are
// the single source of truth (serialised into the webview's lpIngest too — no JS/TS drift).

// isLivePreviewSelfNoise(message) — PURE. True when the message is the Live Preview highlight's OWN
// injected shadow-DOM CSS noise (`:host { all: initial }` + the `direction`/`unicode-bidi` shorthand
// warning Chromium raises for it). We generated it — so we drop it (never shown, not even amber).
function isLivePreviewSelfNoise(message) {
  var m = String(message == null ? '' : message);
  if (!m) return false;
  var hasAllInitial = /\ball\s*:\s*initial\b/i.test(m);
  if (!hasAllInitial) return false;
  return /:host\b/.test(m) || /\bdirection\b/i.test(m) || /\bunicode-bidi\b/i.test(m);
}

// isBenignCssWarning(message) — PURE. True when the message is a CSS PARSE warning (the browser
// dropping a declaration/selector it could not parse) — a styling nit, NEVER a runtime error of the
// app. We demote these red→amber `warning` instead of lighting the fatal runtime strip.
function isBenignCssWarning(message) {
  var m = String(message == null ? '' : message);
  if (!m) return false;
  return /error in parsing value for|declaration dropped|invalid property value|unknown property|ruleset ignored due to bad selector|expected .*but found|was not declared/i.test(m);
}

// ── normalizeTapError(m) — PURE. Coerce a raw lp-error payload from the tap into the normalized
// shape the strip renders and the host acts on. Fail-soft; clamps every field so a hostile/huge
// payload can neither stall nor inject. Never throws.
//   { kind:'runtime'|'build'|'console'|'promise'|'warning', message, file, line, col, stack, ts }
function normalizeTapError(m) {
  var o = m && typeof m === 'object' ? m : {};
  var kind =
    o.kind === 'build' || o.kind === 'console' || o.kind === 'promise' || o.kind === 'warning' ? o.kind : 'runtime';
  var message = clampStr(o.message, 2000).trim();
  if (!message) message = '(erro sem mensagem)';
  // A benign CSS parse warning is a styling nit, not a runtime failure → demote red→amber `warning`.
  if ((kind === 'runtime' || kind === 'console') && isBenignCssWarning(message)) kind = 'warning';
  var file = clampStr(o.file, 1024).trim();
  var stack = clampStr(o.stack, 8000);
  var ts = typeof o.ts === 'number' && isFinite(o.ts) ? o.ts : null;
  return {
    kind: kind,
    message: message,
    file: file,
    line: normLineNo(o.line),
    col: normLineNo(o.col),
    stack: stack,
    ts: ts,
  };
}

// ── tapErrorKey(e) — PURE. Dedup identity: same kind + message + file + line collapse into one
// ×N row, so a component that throws every render does not flood the strip.
function tapErrorKey(e) {
  var o = e || {};
  return (
    String(o.kind || 'runtime') +
    '|' +
    String(o.message || '') +
    '|' +
    String(o.file || '') +
    '|' +
    String(o.line == null ? '' : o.line)
  );
}

// ── ingestErrors(list, incoming, cap) — PURE. Fold a new error into the grouped list. Returns a
// NEW array (never mutates its input): a duplicate bumps `count` and moves to the front; a new
// error is unshifted; the list is capped (default 50) most-recent-first. Never throws.
function ingestErrors(list, incoming, cap) {
  var arr = Array.isArray(list) ? list.slice() : [];
  // Drop the Live Preview highlight's OWN shadow-DOM noise before it can ever reach the strip.
  if (isLivePreviewSelfNoise(incoming && incoming.message)) return arr;
  var e = normalizeTapError(incoming);
  var k = tapErrorKey(e);
  var max = typeof cap === 'number' && cap > 0 ? cap : 50;
  var idx = -1;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && tapErrorKey(arr[i]) === k) { idx = i; break; }
  }
  if (idx !== -1) {
    var prev = arr[idx];
    arr.splice(idx, 1);
    arr.unshift({
      kind: e.kind, message: e.message, file: e.file, line: e.line, col: e.col,
      stack: e.stack || prev.stack, ts: e.ts != null ? e.ts : prev.ts,
      count: (prev.count || 1) + 1, key: k,
    });
  } else {
    arr.unshift({
      kind: e.kind, message: e.message, file: e.file, line: e.line, col: e.col,
      stack: e.stack, ts: e.ts, count: 1, key: k,
    });
  }
  if (arr.length > max) arr = arr.slice(0, max);
  return arr;
}

// ── clearErrors(list, kind) — PURE. Remove every entry of `kind`; a falsy kind or 'all' clears
// the whole strip. Used when the Next overlay for a build error is removed (error fixed → the
// strip empties itself, honestly) and by the "dispensar" button.
function clearErrors(list, kind) {
  var arr = Array.isArray(list) ? list : [];
  if (!kind || kind === 'all') return [];
  return arr.filter(function (e) { return !e || e.kind !== kind; });
}

// ── acceptTapOrigin(evOrigin, stageUrl) — PURE + SECURITY-CRITICAL. True ONLY when a tap message's
// event.origin is EXACTLY the localhost origin currently framed. Reuses lp-stage.normalizeStageUrl
// as the single origin allowlist, so this can never drift from the CSP frame-src / stage lock.
// Rejects '*', 'null', empty, a different port, and any non-localhost origin. Never throws.
function acceptTapOrigin(evOrigin, stageUrl) {
  if (typeof evOrigin !== 'string') return false;
  var o = evOrigin.trim();
  if (!o || o === '*' || o === 'null') return false;
  var n = LPS.normalizeStageUrl(stageUrl);
  if (!n) return false;
  return o === n.url; // n.url is the canonical origin (scheme://host:port, path stripped)
}

// ── resolveErrorFileCandidates(file) — PURE. Turn a tap `file` string (a source path, a dev URL,
// a webpack-internal path) into an ORDERED list of workspace-relative candidates the host then
// tries with fs.existsSync. Returns [] when nothing plausibly maps to a real file (→ host disables
// the open button, honestly). This is the first brick of MP5's click-to-code. Never throws.
function resolveErrorFileCandidates(file) {
  var f = String(file == null ? '' : file).trim();
  if (!f) return [];
  f = f
    .replace(/^webpack-internal:\/\/\//, '')
    .replace(/^webpack:\/\/_N_E\//, '')
    .replace(/^webpack:\/\//, '')
    .replace(/^rsc:\/\/React\/[^/]+\//, '')
    .replace(/^https?:\/\/[^/]+\//, '') // strip a dev-server origin
    .replace(/\?.*$/, '') // strip query (?123, ?rsc=…)
    .replace(/^\([^)]*\)\//, '') // strip (app-pages-browser)/ , (rsc)/ , (ssr)/ markers
    .replace(/^\.\//, '')
    .trim();
  // A remaining scheme (file://, node:internal, chrome-extension://) is not a workspace file.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(f) || /^node:/.test(f) || /^internal\//.test(f)) return [];
  f = f.replace(/^\/+/, ''); // collapse a leading slash → relative
  if (!f || /^[.][.]/.test(f)) return []; // guard against path traversal upfront
  var out = [];
  function push(p) { if (p && p.indexOf('..') === -1 && out.indexOf(p) === -1) out.push(p); }
  push(f);
  // Dogfood target: the landing dev server. Try with/without the `landing/` prefix so a bare
  // `app/page.tsx` resolves under <ws>/landing and a `landing/app/page.tsx` resolves at the root.
  if (f.indexOf('landing/') === 0) push(f.slice('landing/'.length));
  else push('landing/' + f);
  return out;
}

// ── formatForClipboard(e) — PURE. The "enviar à sessão CC" payload: message + location + stack,
// ready to paste into a Claude Code prompt. Host-side (no concat-only constraint). Never throws.
function formatForClipboard(e) {
  var o = e || {};
  var tag = o.kind === 'build' ? '[build] ' : o.kind === 'console' ? '[console] ' : o.kind === 'promise' ? '[promise] ' : '[runtime] ';
  var lines = [tag + String(o.message == null ? '' : o.message)];
  if (o.file) {
    var loc = 'at ' + String(o.file);
    if (o.line != null) { loc += ':' + o.line; if (o.col != null) loc += ':' + o.col; }
    lines.push(loc);
  }
  if (o.stack) { lines.push(''); lines.push(String(o.stack)); }
  return lines.join('\n');
}

// ── renderErrorStrip(state) — the honest diagnostics strip. state = { errors:[…], expanded:bool }.
// Concat-only, `esc` as a free var (serialised into the webview exactly like renderStageStatus).
// Honest: zero errors → '' (hidden — no fabricated "all good"); runtime → red, build → amber; the
// "abrir ficheiro" button is DISABLED with an honest tooltip when there is no file:line. Each row
// carries data-idx so the webview looks the full error (incl. stack) up before messaging the host —
// no giant data-* blobs, no inline handlers (CSP-safe). Never throws on garbage.
function renderErrorStrip(state) {
  var s = state && typeof state === 'object' ? state : {};
  var errs = Array.isArray(s.errors) ? s.errors : [];
  var live = [];
  for (var i = 0; i < errs.length; i++) { if (errs[i]) live.push(errs[i]); }
  if (live.length === 0) return ''; // honest: nothing measured → strip hidden, no claim

  var expanded = !!s.expanded;
  var shown = expanded ? live : live.slice(0, 1);

  var runtimeN = 0, buildN = 0, consoleN = 0, warnN = 0;
  for (var a = 0; a < live.length; a++) {
    var kA = live[a].kind;
    if (kA === 'build') buildN++;
    else if (kA === 'console') consoleN++;
    else if (kA === 'warning') warnN++; // amber CSS/parse warning — NOT the red fatal count
    else runtimeN++; // runtime + promise → the red count
  }
  var sum = [];
  if (runtimeN) sum.push('⛔ ' + runtimeN + ' runtime');
  if (buildN) sum.push('⚠ ' + buildN + ' build');
  if (warnN) sum.push('⚠ ' + warnN + ' aviso');
  if (consoleN) sum.push('⚠ ' + consoleN + ' console');
  var head =
    '<div class="lpd-head"><span class="lpd-sum">' + esc(sum.join(' · ')) + '</span>' +
    '<span class="lpd-spacer"></span>';
  if (live.length > 1) {
    head += '<button class="lpd-x" type="button" data-act="toggle" title="' + (expanded ? 'mostra apenas o erro mais recente' : 'mostra todos os erros registados neste strip') + '">' +
      (expanded ? 'ocultar' : 'ver todos (' + live.length + ')') + '</button>';
  }
  head += '<button class="lpd-x" type="button" data-act="dismiss" title="Limpar o strip até ao próximo erro">dispensar</button></div>';

  var rows = '';
  for (var j = 0; j < shown.length; j++) {
    var e = shown[j];
    var kind = e.kind === 'build' ? 'build' : e.kind === 'console' ? 'console' : e.kind === 'warning' ? 'warning' : e.kind === 'promise' ? 'promise' : 'runtime';
    var rowCls = kind === 'build' ? 'lpd-build' : kind === 'warning' ? 'lpd-warning' : kind === 'console' ? 'lpd-console' : 'lpd-runtime';
    var badge = kind === 'build' ? '⚠ build' : kind === 'warning' ? '⚠ aviso' : kind === 'console' ? '⚠ console' : kind === 'promise' ? '⛔ promise' : '⛔ runtime';
    // Index into the ORIGINAL errors array so the webview can recover the full object by data-idx.
    var origIdx = live.indexOf(e);
    var count = e.count && e.count > 1 ? '<span class="lpd-n">×' + esc(e.count) + '</span>' : '';
    var loc = '';
    // The open button is enabled whenever there is a FILE — the host opens it at the top when the
    // line is unknown (see _openErrorFile). It is disabled (honest tooltip) ONLY when there is no
    // file at all: promising an action the host cannot perform would be a lying control.
    var hasFile = !!e.file;
    if (hasFile && e.line != null) loc = '<span class="lpd-loc">' + esc(e.file) + ':' + esc(e.line) + '</span>';
    else if (hasFile) loc = '<span class="lpd-loc">' + esc(e.file) + '</span>';

    var openBtn = hasFile
      ? '<button class="lpd-btn" type="button" data-act="open" data-idx="' + esc(origIdx) + '" title="abre no editor o ficheiro e a linha associados a este erro">abrir ficheiro</button>'
      : '<button class="lpd-btn" type="button" disabled title="sem localização — abre a consola do dev server">abrir ficheiro</button>';
    var copyBtn = '<button class="lpd-btn" type="button" data-act="copy" data-idx="' + esc(origIdx) + '" title="copia este erro para o input da sessão Claude Code; não o envia automaticamente">enviar à CC</button>';

    rows +=
      '<div class="lpd-row ' + rowCls + '">' +
      '<span class="lpd-badge">' + badge + '</span>' +
      '<span class="lpd-msg" title="' + esc(e.message) + '">' + esc(e.message) + '</span>' +
      count + loc +
      '<span class="lpd-acts">' + openBtn + copyBtn + '</span>' +
      '</div>';
  }
  return head + rows;
}

module.exports = {
  esc: esc,
  isLivePreviewSelfNoise: isLivePreviewSelfNoise,
  isBenignCssWarning: isBenignCssWarning,
  normalizeTapError: normalizeTapError,
  tapErrorKey: tapErrorKey,
  ingestErrors: ingestErrors,
  clearErrors: clearErrors,
  acceptTapOrigin: acceptTapOrigin,
  resolveErrorFileCandidates: resolveErrorFileCandidates,
  formatForClipboard: formatForClipboard,
  renderErrorStrip: renderErrorStrip,
};
