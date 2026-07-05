'use strict';
// lp-stage.js — Live Preview · MP2 (App Stage · dev-server detector + honest stage state).
//
// PURE decision layer for the App Stage. Mirrors live-preview-view.js exactly:
//   • No `vscode`, no fs, no net — this module only PARSES text/objects it is handed and
//     RESOLVES a stage state from ports it is told are live. The fs reads (config files) and
//     the TCP probes (which ports actually listen) live HOST-SIDE in extension.js, same split
//     as live-preview-view.js keeps the file-bus tail-read host-side.
//   • Every function is fail-soft — never throws on garbage input.
//   • `renderStageStatus` is concat-only (NO backticks, NO ${…}) so it can be serialised into
//     the webview via fn.toString() and embedded inside getLivePreviewHtml()'s outer template
//     literal, exactly like renderDirectorsCut / renderBrain.
//
// ── SECURITY (red-team loop hole #3 — origin lock) ───────────────────────────────────────
//   normalizeStageUrl / isLocalhostUrl are the ONLY sanctioned way a URL enters the stage.
//   They accept ONLY http(s)://{localhost|127.0.0.1}:PORT — every other scheme/host
//   (javascript:, file:, data:, vscode-webview:, a remote host, an SSRF target) returns null.
//   IPv6 loopback ([::1]) is intentionally rejected: it must stay IN LOCKSTEP with the webview
//   CSP frame-src host-list, and the CSP cannot match [::1] without drift — accepting it here
//   would let the status strip claim a live server for a frame the CSP silently blocks.
//   The webview never sets iframe.src to anything the host did not first pass through here.
//
// ── HONESTY (red-team loop hole #4) ──────────────────────────────────────────────────────
//   The stage NEVER fabricates a "server is up". `degraded:true` (no dev server) and
//   `stale:true` (a URL we still show but whose port stopped answering) are surfaced with an
//   explicit PT-PT note — the preview says the truth, it does not pretend.

// ── esc() — module-scope, called as a free variable by renderStageStatus (same contract as
// live-preview-view.js): resolves via JS lexical scope in Node, and via the webview's OWN
// top-level esc() when the function is serialised in through fn.toString().
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// Common local dev-server ports, in priority order. 7819 first — it is the mooter.ai landing
// dev port (`next dev -H 127.0.0.1 -p 7819`), the dogfood target for the first App Stage.
// 3000 = Next default, 5173 = Vite default, 4321 = Astro, 8080 = generic.
function commonDevPorts() {
  return [7819, 3000, 5173, 4321, 8080];
}

function isValidPort(n) {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 65535;
}

// ── parseConfigPort(text) — PURE. Extract a dev-server port from any concatenated config text
// (a package.json "dev" script, a vite/next config). CLI flags (`-p 7819`, `--port=5173`) win
// over a `port:`/`PORT=` field. Returns the first in-range port, or null (→ caller falls back
// to commonDevPorts). Never throws; caps how much text it scans so a huge file can't stall it.
function parseConfigPort(text) {
  var s = String(text == null ? '' : text);
  if (s.length > 262144) s = s.slice(0, 262144);
  // 1) CLI flag: `-p 7819`, `-p=7819`, `--port 5173`, `--port:3000` (anchored on a boundary so
  //    `-p` inside a longer token is not matched). Preferred — it is what actually launches dev.
  var cli = /(?:^|[\s"'])--?p(?:ort)?[\s=:]+(\d{2,5})\b/gi;
  var m;
  while ((m = cli.exec(s)) !== null) {
    var p = parseInt(m[1], 10);
    if (isValidPort(p)) return p;
  }
  // 2) config field: `port: 5173`, `port = 3000`, `PORT=8080` (vite server.port / env).
  var cfg = /\bport\s*[:=]\s*['"]?(\d{2,5})\b/gi;
  while ((m = cfg.exec(s)) !== null) {
    var q = parseInt(m[1], 10);
    if (isValidPort(q)) return q;
  }
  return null;
}

// ── normalizeStageUrl(input) — PURE + SECURITY-CRITICAL. Accepts a user-pasted string OR a
// bare port number and returns { url, host, port, scheme } canonicalised, or null if it is not
// a localhost dev URL. This is the origin lock (loop hole #3): anything that is not
// http(s)://{localhost|127.0.0.1}:PORT is rejected (IPv6 loopback included — see header note).
// Never throws.
function normalizeStageUrl(input) {
  if (typeof input === 'number' && isValidPort(input)) {
    return { url: 'http://localhost:' + input, host: 'localhost', port: input, scheme: 'http' };
  }
  var raw = String(input == null ? '' : input).trim();
  if (!raw) return null;

  // Reject any explicit non-http(s) scheme up front (javascript:, file:, data:, vscode-webview:…).
  var schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw);
  var scheme = 'http';
  var rest = raw;
  if (schemeMatch) {
    var sch = schemeMatch[1].toLowerCase();
    if (sch !== 'http' && sch !== 'https') return null;
    scheme = sch;
    rest = raw.slice(schemeMatch[0].length);
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^\d+$/.test(raw) && !/^(localhost|127\.0\.0\.1)/i.test(raw)) {
    // Something like `javascript:alert(1)` with no `//` — reject (but let bare `localhost:7819`
    // and a bare port through: those match the host/port grammar below).
    return null;
  }

  // Bare port ("7819").
  if (/^\d{1,5}$/.test(rest)) {
    var bp = parseInt(rest, 10);
    return isValidPort(bp) ? { url: scheme + '://localhost:' + bp, host: 'localhost', port: bp, scheme: scheme } : null;
  }

  // host[:port][/...]. Strip any path/query/hash — only host:port matters for the origin.
  var authority = rest.split('/')[0].split('?')[0].split('#')[0];
  // A bracketed IPv6 authority ([::1]:port) never matches this grammar → falls through to null.
  var hp = /^([a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(authority);
  if (!hp) return null;
  var host = hp[1].toLowerCase();
  var portStr = hp[2] || null;

  // Origin lock: ONLY localhost / 127.0.0.1 — the exact host set the webview CSP frame-src
  // whitelists. Keeping this set === the CSP set is what stops a "green server up" over a frame
  // the CSP would silently block (loop hole #4 honesty). The liveness probe hits 127.0.0.1.
  if (host !== 'localhost' && host !== '127.0.0.1') return null;
  if (!portStr) return null; // a dev server always has an explicit port — reject bare host.
  var port = parseInt(portStr, 10);
  if (!isValidPort(port)) return null;

  return { url: scheme + '://' + host + ':' + port, host: host, port: port, scheme: scheme };
}

function isLocalhostUrl(url) {
  return normalizeStageUrl(url) !== null;
}

// ── candidatePortList(opts) — PURE. The ordered, de-duplicated union of ports worth probing:
// the override, then the sticky (last-good) URL's port, then the parsed config port, then the
// commons. Returns number[]. Used host-side to decide WHICH ports to TCP-probe.
function candidatePortList(opts) {
  opts = opts || {};
  var out = [];
  function push(p) { if (isValidPort(p) && out.indexOf(p) === -1) out.push(p); }
  var ov = normalizeStageUrl(opts.overrideUrl);
  if (ov) push(ov.port);
  var st = normalizeStageUrl(opts.stickyUrl);
  if (st) push(st.port);
  if (isValidPort(opts.configPort)) push(opts.configPort);
  var commons = commonDevPorts();
  for (var i = 0; i < commons.length; i++) push(commons[i]);
  return out;
}

// ── buildCandidates(opts) — PURE. Same order as candidatePortList but each entry tagged with
// its provenance so the picked stage can name its `source` honestly. Sticky/commons are 'probe'
// (found by probing), config is 'config', override is 'override'.
function buildCandidates(opts) {
  opts = opts || {};
  var out = [];
  var seen = {};
  function push(p, source) { if (isValidPort(p) && !seen[p]) { seen[p] = 1; out.push({ port: p, source: source }); } }
  var ov = normalizeStageUrl(opts.overrideUrl);
  if (ov) push(ov.port, 'override');
  var st = normalizeStageUrl(opts.stickyUrl);
  if (st) push(st.port, 'probe');
  if (isValidPort(opts.configPort)) push(opts.configPort, 'config');
  var commons = commonDevPorts();
  for (var i = 0; i < commons.length; i++) push(commons[i], 'probe');
  return out;
}

// ── pickDevServer(candidates, livePorts) — PURE. The first candidate whose port is actually
// listening. Returns { url, port, source } or null. candidates = buildCandidates() output;
// livePorts = the subset the host TCP-probe found alive.
function pickDevServer(candidates, livePorts) {
  var cand = Array.isArray(candidates) ? candidates : [];
  var live = {};
  var lp = Array.isArray(livePorts) ? livePorts : [];
  for (var i = 0; i < lp.length; i++) if (isValidPort(lp[i])) live[lp[i]] = 1;
  for (var j = 0; j < cand.length; j++) {
    var c = cand[j];
    if (c && live[c.port]) {
      return { url: 'http://localhost:' + c.port, port: c.port, source: c.source || 'probe' };
    }
  }
  return null;
}

// ── resolveStage(inputs) — PURE. The whole App Stage decision, from raw inputs to the honest
// stage object the webview renders. inputs:
//   { overrideUrl?, stickyUrl?, configPort?, livePorts:number[] }
// Returns:
//   { url, port, source, degraded, stale, reason }
//     • url/port      : the localhost URL to frame (null when degraded).
//     • source        : 'override' | 'config' | 'probe' | null — how it was found.
//     • degraded      : true → no web server at all; the panel shows only Director's Cut.
//     • stale         : true → we still show `url` but its port stopped answering (honest note;
//                       the iframe is kept so native HMR reconnects when the server returns).
//     • reason        : PT-PT human note (null when a live server is framed cleanly).
// Override is AUTHORITATIVE (the user pasted it): it is always framed, marked stale if the port
// is not (yet) answering — never silently dropped. Never throws.
function resolveStage(inputs) {
  inputs = inputs || {};
  var livePorts = Array.isArray(inputs.livePorts) ? inputs.livePorts : [];
  var liveSet = {};
  for (var i = 0; i < livePorts.length; i++) if (isValidPort(livePorts[i])) liveSet[livePorts[i]] = 1;

  var ov = normalizeStageUrl(inputs.overrideUrl);
  if (ov) {
    var ovLive = !!liveSet[ov.port];
    return {
      url: ov.url, port: ov.port, source: 'override', degraded: false,
      stale: !ovLive,
      reason: ovLive ? null : 'servidor não respondeu ainda em ' + ov.url + ' — a tentar mesmo assim',
    };
  }

  var configPort = isValidPort(inputs.configPort) ? inputs.configPort : null;
  var candidates = buildCandidates({ stickyUrl: inputs.stickyUrl, configPort: configPort });
  var picked = pickDevServer(candidates, livePorts);
  if (picked) {
    return { url: picked.url, port: picked.port, source: picked.source, degraded: false, stale: false, reason: null };
  }

  var st = normalizeStageUrl(inputs.stickyUrl);
  if (st) {
    return {
      url: st.url, port: st.port, source: 'probe', degraded: false, stale: true,
      reason: 'servidor offline? — o preview reconecta (HMR) quando voltar',
    };
  }

  return {
    url: null, port: null, source: null, degraded: true, stale: false,
    reason: 'nenhum dev server detetado (portas 7819 · 3000 · 5173 · 4321 · 8080) — corre `cd landing && npm run dev` ou cola o URL acima',
  };
}

// ── renderStageStatus(stage) — the honest one-line status strip above the iframe. Concat-only,
// `esc` as a free var (same contract as renderDirectorsCut/renderBrain). NEVER throws; a null/
// garbage stage degrades to a neutral "a detetar…" note. No fabricated "server up".
function renderStageStatus(stage) {
  var s = (stage && typeof stage === 'object') ? stage : null;
  if (!s) {
    return '<span class="lps-dot lps-wait"></span><span class="lps-txt lps-nd">a detetar o dev server…</span>';
  }
  if (s.degraded || !s.url) {
    var rd = s.reason ? esc(s.reason) : 'nenhum dev server detetado';
    return '<span class="lps-dot lps-off"></span><span class="lps-txt lps-nd">🎞️ só Director\'s Cut · ' + rd + '</span>';
  }
  var srcTxt = s.source ? (' · fonte: ' + esc(s.source)) : '';
  if (s.stale) {
    return '<span class="lps-dot lps-stale"></span><span class="lps-txt">⚠️ <b>' + esc(s.url) + '</b>'
      + srcTxt + (s.reason ? (' · <span class="lps-nd">' + esc(s.reason) + '</span>') : '') + '</span>';
  }
  // Honest copy (loop hole #4): we only know the PORT answered a TCP probe — not that the frame
  // rendered or that HMR is wired. "porta ativa" states exactly what was measured, no more.
  return '<span class="lps-dot lps-on"></span><span class="lps-txt">🌐 <b>' + esc(s.url) + '</b>'
    + srcTxt + ' · porta ativa</span>';
}

// ── MP3.3 multi-page navigation — PURE helpers (route discovery + address-bar resolution) ──────
// The App Stage detector resolves the ORIGIN (root URL). These helpers add the second half: which
// ROUTES the site has, and what a value typed in the address bar means — WITHOUT ever letting a
// non-localhost origin in (they defer to normalizeStageUrl for the origin lock). Host-side only
// (route discovery reads files host-side; nav resolution keeps the origin lock in one place).

// pagePathToRoute(relPath) — PURE. Map a Next App-Router page file path (relative to landing/app,
// e.g. "(marketing)/install/page.tsx" or "page.tsx") to its navigable URL route ("/install", "/").
// Route groups "(name)" are folder-only and contribute NOTHING to the URL. Dynamic segments
// ("[id]", "[[...slug]]") are not literally navigable → null (honest: we cannot fill the param, so
// it never enters the "known routes" picker). Parallel-route slots ("@modal") are dropped too.
function pagePathToRoute(relPath) {
  var s = String(relPath == null ? '' : relPath).replace(/\\/g, '/').trim();
  if (!s) return null;
  s = s.replace(/^\/+/, '').replace(/^landing\/app\//, '').replace(/^app\//, '');
  var m = /(^|\/)page\.(tsx|ts|jsx|js|mjs)$/.exec(s);
  if (!m) return null; // not a page file
  var dir = s.slice(0, s.length - m[0].length); // strip the trailing "/page.tsx" (or bare "page.tsx")
  var segs = dir.split('/').filter(Boolean);
  var out = [];
  for (var i = 0; i < segs.length; i++) {
    var seg = segs[i];
    if (/^\(.*\)$/.test(seg)) continue;        // route group — folder only, no URL segment
    if (seg.charAt(0) === '@') continue;        // parallel-route slot — no URL segment
    if (seg.indexOf('[') !== -1) return null;   // dynamic segment — not a literally-navigable route
    out.push(seg);
  }
  return '/' + out.join('/');
}

// discoverRoutes(relPaths) — PURE. Map a list of page-file paths (relative to landing/app) to a
// sorted, de-duplicated list of navigable routes. Non-pages / dynamic routes are dropped. "/" is
// pinned first (the home); the rest alphabetical. Never throws.
function discoverRoutes(relPaths) {
  var list = Array.isArray(relPaths) ? relPaths : [];
  var seen = {};
  var routes = [];
  for (var i = 0; i < list.length; i++) {
    var r = pagePathToRoute(list[i]);
    if (r == null || seen[r]) continue;
    seen[r] = true;
    routes.push(r);
  }
  routes.sort(function (a, b) {
    if (a === '/') return -1;
    if (b === '/') return 1;
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  return routes;
}

// sanitizeNavPath(input) — PURE. Coerce a user-typed path into a safe same-origin path: a single
// leading "/", no control chars/whitespace, capped length. Never throws.
function sanitizeNavPath(input) {
  var s = String(input == null ? '' : input).trim();
  s = s.replace(/[\s\x00-\x1f\x7f]/g, '');
  if (!s) return '/';
  if (s.charAt(0) !== '/') s = '/' + s;
  return s.slice(0, 2048);
}

// extractPath(raw) — PURE. The path+query (no host) from a URL-ish string; "" when there is none
// (so a bare "localhost:7819" navigates to the root, not "/").
function extractPath(raw) {
  var s = String(raw == null ? '' : raw).trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  var slash = s.indexOf('/');
  if (slash === -1) return '';
  return sanitizeNavPath(s.slice(slash));
}

// resolveNavTarget(currentOrigin, input) — PURE + SECURITY-relevant. Decide what a value typed in
// the address bar (or a picked route) means, WITHOUT ever letting a non-localhost origin enter:
//   • { kind:'path',   url } — same-origin navigation (bare path, or a full URL whose origin === the
//                              current stage origin): the frame just moves, the stage is NOT re-pointed.
//   • { kind:'origin', url } — a DIFFERENT localhost origin: the caller re-points the stage through
//                              the normal override lock (normalizeStageUrl re-runs host-side).
//   • { kind:'invalid' }     — not localhost / unparseable → refuse (honest error, no navigation).
// currentOrigin is the resolved stage root (normalizeStageUrl output .url). Never throws.
function resolveNavTarget(currentOrigin, input) {
  var origin = normalizeStageUrl(currentOrigin);
  var raw = String(input == null ? '' : input).trim();
  if (!raw) return { kind: 'invalid' };
  if (raw.charAt(0) === '/') { // a bare path is always same-origin navigation
    if (!origin) return { kind: 'invalid' };
    return { kind: 'path', url: origin.url + sanitizeNavPath(raw) };
  }
  var target = normalizeStageUrl(raw); // origin lock — drops the path; recover it below
  if (!target) return { kind: 'invalid' };
  if (origin && target.url === origin.url) {
    return { kind: 'path', url: target.url + extractPath(raw) };
  }
  return { kind: 'origin', url: target.url };
}

module.exports = {
  esc: esc,
  commonDevPorts: commonDevPorts,
  isValidPort: isValidPort,
  parseConfigPort: parseConfigPort,
  normalizeStageUrl: normalizeStageUrl,
  isLocalhostUrl: isLocalhostUrl,
  candidatePortList: candidatePortList,
  buildCandidates: buildCandidates,
  pickDevServer: pickDevServer,
  resolveStage: resolveStage,
  renderStageStatus: renderStageStatus,
  pagePathToRoute: pagePathToRoute,
  discoverRoutes: discoverRoutes,
  sanitizeNavPath: sanitizeNavPath,
  extractPath: extractPath,
  resolveNavTarget: resolveNavTarget,
};
