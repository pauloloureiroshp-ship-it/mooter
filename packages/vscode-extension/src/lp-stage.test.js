'use strict';
// lp-stage.test.js — Live Preview · MP2 (App Stage).
// Proves: the port parser reads real dev scripts; the URL validator is a strict localhost
// origin lock (loop hole #3); candidate ordering honours override > sticky > config > commons;
// resolveStage is honest about degraded/stale (loop hole #4); the status renderer is XSS-safe
// and concat-only (safe to serialise into getLivePreviewHtml via fn.toString()).

const { test } = require('node:test');
const assert = require('node:assert');

const LPS = require('./lp-stage.js');

// ── parseConfigPort ────────────────────────────────────────────────────────────────────────

test('parseConfigPort: reads the real landing dev script (next dev -H 127.0.0.1 -p 7819)', () => {
  assert.strictEqual(LPS.parseConfigPort('next dev -H 127.0.0.1 -p 7819'), 7819);
});

test('parseConfigPort: handles --port=, --port , -p=, and vite config server.port', () => {
  assert.strictEqual(LPS.parseConfigPort('vite --port=5173'), 5173);
  assert.strictEqual(LPS.parseConfigPort('astro dev --port 4321'), 4321);
  assert.strictEqual(LPS.parseConfigPort('next dev -p=3001'), 3001);
  assert.strictEqual(LPS.parseConfigPort('server: { port: 5174 }'), 5174);
  assert.strictEqual(LPS.parseConfigPort('PORT=8081 npm run dev'), 8081);
});

test('parseConfigPort: CLI flag wins over a config field when both present', () => {
  // A vite.config with server.port:5173 but the script forces --port 4000 → the flag is what runs.
  assert.strictEqual(LPS.parseConfigPort('scripts dev: vite --port 4000\nserver: { port: 5173 }'), 4000);
});

test('parseConfigPort: no port / out-of-range / garbage → null (falls back to commons)', () => {
  assert.strictEqual(LPS.parseConfigPort('next dev'), null);
  assert.strictEqual(LPS.parseConfigPort('--port 99999'), null); // > 65535
  assert.strictEqual(LPS.parseConfigPort(''), null);
  assert.strictEqual(LPS.parseConfigPort(null), null);
  assert.strictEqual(LPS.parseConfigPort(undefined), null);
  assert.strictEqual(LPS.parseConfigPort('-H 127.0.0.1'), null); // an IP is not a port flag
});

// ── normalizeStageUrl / isLocalhostUrl (origin lock · loop hole #3) ───────────────────────

test('normalizeStageUrl: accepts localhost forms and canonicalises', () => {
  assert.deepStrictEqual(LPS.normalizeStageUrl('http://localhost:7819'), { url: 'http://localhost:7819', host: 'localhost', port: 7819, scheme: 'http' });
  assert.deepStrictEqual(LPS.normalizeStageUrl('localhost:3000'), { url: 'http://localhost:3000', host: 'localhost', port: 3000, scheme: 'http' });
  assert.deepStrictEqual(LPS.normalizeStageUrl('127.0.0.1:5173'), { url: 'http://127.0.0.1:5173', host: '127.0.0.1', port: 5173, scheme: 'http' });
  assert.deepStrictEqual(LPS.normalizeStageUrl('https://localhost:7819'), { url: 'https://localhost:7819', host: 'localhost', port: 7819, scheme: 'https' });
  assert.strictEqual(LPS.normalizeStageUrl('http://localhost:7819/some/path?q=1#h').url, 'http://localhost:7819');
});

test('normalizeStageUrl: a bare port number or numeric string → localhost URL', () => {
  assert.strictEqual(LPS.normalizeStageUrl(7819).url, 'http://localhost:7819');
  assert.strictEqual(LPS.normalizeStageUrl('7819').url, 'http://localhost:7819');
});

test('normalizeStageUrl: REJECTS non-localhost hosts and dangerous schemes (SSRF/XSS lock)', () => {
  assert.strictEqual(LPS.normalizeStageUrl('http://evil.com:7819'), null);
  assert.strictEqual(LPS.normalizeStageUrl('http://169.254.169.254/latest'), null); // cloud metadata SSRF
  assert.strictEqual(LPS.normalizeStageUrl('http://192.168.1.10:3000'), null);
  assert.strictEqual(LPS.normalizeStageUrl('javascript:alert(1)'), null);
  assert.strictEqual(LPS.normalizeStageUrl('file:///etc/passwd'), null);
  assert.strictEqual(LPS.normalizeStageUrl('data:text/html,<script>'), null);
  assert.strictEqual(LPS.normalizeStageUrl('vscode-webview://x'), null);
  assert.strictEqual(LPS.normalizeStageUrl('localhost'), null); // no explicit port → reject
  // IPv6 loopback is rejected on purpose — it must stay === the CSP frame-src host set
  // (which cannot cover [::1] without drift), else the status strip would claim a live
  // server for a frame the webview CSP silently blocks. See lp-stage.js header note.
  assert.strictEqual(LPS.normalizeStageUrl('[::1]:7819'), null);
  assert.strictEqual(LPS.normalizeStageUrl('http://[::1]:7819'), null);
  assert.strictEqual(LPS.normalizeStageUrl(''), null);
  assert.strictEqual(LPS.normalizeStageUrl(null), null);
});

test('isLocalhostUrl: boolean mirror of the origin lock', () => {
  assert.strictEqual(LPS.isLocalhostUrl('http://localhost:7819'), true);
  assert.strictEqual(LPS.isLocalhostUrl('http://evil.com'), false);
});

// ── candidatePortList / buildCandidates ──────────────────────────────────────────────────

test('candidatePortList: override > config > sticky > commons, de-duplicated', () => {
  const list = LPS.candidatePortList({ overrideUrl: 'http://localhost:9000', stickyUrl: 'http://localhost:4000', configPort: 3000 });
  assert.deepStrictEqual(list.slice(0, 3), [9000, 3000, 4000]);
  // no duplicate 3000 later even though it is a common
  assert.strictEqual(list.filter((p) => p === 3000).length, 1);
  // 7819 (a common) still present
  assert.ok(list.includes(7819));
});

test('candidatePortList: no inputs → just the commons in order', () => {
  assert.deepStrictEqual(LPS.candidatePortList({}), LPS.commonDevPorts());
  assert.ok(LPS.commonDevPorts().includes(5174), 'Vite auto-increment port is covered');
  assert.ok(LPS.commonDevPorts().includes(3005), 'Next auto-increment range is covered');
  assert.ok(LPS.commonDevPorts().includes(8787), 'common Workers dev port is covered');
});

test('buildCandidates: tags provenance (override/config/probe)', () => {
  const c = LPS.buildCandidates({ overrideUrl: 'localhost:9000', configPort: 7819 });
  assert.deepStrictEqual(c[0], { port: 9000, source: 'override' });
  assert.deepStrictEqual(c[1], { port: 7819, source: 'config' });
  assert.strictEqual(c[2].source, 'probe'); // first remaining common
});

// ── pickDevServer ─────────────────────────────────────────────────────────────────────────

test('pickDevServer: first candidate whose port is live wins', () => {
  const cand = LPS.buildCandidates({ configPort: 7819 }); // [7819:config, 3000, 5173, ...]
  assert.deepStrictEqual(LPS.pickDevServer(cand, [3000, 7819]), { url: 'http://localhost:7819', port: 7819, source: 'config' });
  assert.deepStrictEqual(LPS.pickDevServer(cand, [3000]), { url: 'http://localhost:3000', port: 3000, source: 'probe' });
  assert.strictEqual(LPS.pickDevServer(cand, []), null);
  assert.strictEqual(LPS.pickDevServer(null, [3000]), null);
});

// ── resolveStage (the honest decision · loop hole #4) ─────────────────────────────────────

test('resolveStage: a live common port → framed cleanly, not degraded, not stale', () => {
  const s = LPS.resolveStage({ configPort: 7819, livePorts: [7819] });
  assert.strictEqual(s.url, 'http://localhost:7819');
  assert.strictEqual(s.source, 'config');
  assert.strictEqual(s.degraded, false);
  assert.strictEqual(s.stale, false);
  assert.strictEqual(s.reason, null);
});

test('resolveStage: nothing live → degraded honestly (only MEO), never a fake URL', () => {
  const s = LPS.resolveStage({ configPort: 7819, livePorts: [] });
  assert.strictEqual(s.url, null);
  assert.strictEqual(s.degraded, true);
  assert.ok(/nenhum dev server/.test(s.reason));
});

test('resolveStage: override is authoritative — always framed, marked stale when its port is dead', () => {
  const live = LPS.resolveStage({ overrideUrl: 'http://localhost:6001', livePorts: [6001] });
  assert.deepStrictEqual([live.url, live.source, live.stale, live.degraded], ['http://localhost:6001', 'override', false, false]);

  const dead = LPS.resolveStage({ overrideUrl: 'http://localhost:6001', livePorts: [] });
  assert.strictEqual(dead.url, 'http://localhost:6001'); // still framed — user asked for it
  assert.strictEqual(dead.source, 'override');
  assert.strictEqual(dead.stale, true);
  assert.strictEqual(dead.degraded, false);
  assert.ok(/não respondeu/.test(dead.reason));
});

test('resolveStage: a live 127 override uses the localhost authority actually validated by the probe', () => {
  const s = LPS.resolveStage({
    overrideUrl: 'http://127.0.0.1:6001', livePorts: [6001],
    accepted: { port: 6001, url: 'http://localhost:6001', instrumented: false },
  });
  assert.strictEqual(s.url, 'http://localhost:6001');
  assert.strictEqual(s.source, 'override');
  assert.strictEqual(s.stale, false);
});

test('resolveStage: forced refresh may recover from an unreachable override using a detected config port', () => {
  const s = LPS.resolveStage({
    overrideUrl: 'http://localhost:6001', configPort: 7819,
    livePorts: [7819], accepted: { port: 7819, url: 'http://localhost:7819', instrumented: true },
    allowOverrideFallback: true,
  });
  assert.strictEqual(s.url, 'http://localhost:7819');
  assert.strictEqual(s.port, 7819);
  assert.strictEqual(s.source, 'config');
  assert.strictEqual(s.overrideFallback, true);
  assert.strictEqual(s.stale, false);
});

test('resolveStage: forced refresh never bypasses a positively broken override', () => {
  const s = LPS.resolveStage({
    overrideUrl: 'http://localhost:6001', configPort: 7819, livePorts: [7819],
    rejected: [{ port: 6001, statusCode: 500, reason: 'HTTP 500' }],
    allowOverrideFallback: true,
  });
  assert.strictEqual(s.url, null);
  assert.strictEqual(s.port, 6001);
  assert.strictEqual(s.blocked, true);
});

test('resolveStage: a reachable HTTP 500 is blocked instead of framed as a live preview', () => {
  const s = LPS.resolveStage({
    configPort: 7819,
    livePorts: [],
    rejected: [{ port: 7819, statusCode: 500, reason: 'HTTP 500 — dev server com erro interno' }],
  });
  assert.strictEqual(s.url, null);
  assert.strictEqual(s.degraded, true);
  assert.strictEqual(s.blocked, true);
  assert.strictEqual(s.statusCode, 500);
  assert.strictEqual(s.recovery, 'restart');
  assert.match(s.reason, /HTTP 500/);
});

test('resolveStage carries HTTP validation and instrumentation facts for the healthy stage', () => {
  const s = LPS.resolveStage({
    configPort: 7819,
    livePorts: [7819],
    accepted: { port: 7819, statusCode: 200, instrumented: true },
  });
  assert.strictEqual(s.validated, 'http-html');
  assert.strictEqual(s.instrumented, true);
  assert.strictEqual(s.blocked, false);
});

test('resolveStage frames localhost when the accepted probe required IPv6 loopback', () => {
  const s = LPS.resolveStage({
    configPort: 7819, livePorts: [7819],
    accepted: { port: 7819, url: 'http://localhost:7819', connectedHost: '::1', instrumented: true },
  });
  assert.strictEqual(s.url, 'http://localhost:7819');
  assert.strictEqual(s.instrumented, true);
});

test('resolveStage: an invalid override is ignored, not trusted', () => {
  const s = LPS.resolveStage({ overrideUrl: 'http://evil.com:7819', configPort: 7819, livePorts: [7819] });
  assert.strictEqual(s.source, 'config'); // fell through to detection, evil override dropped
  assert.strictEqual(s.url, 'http://localhost:7819');
});

test('resolveStage: sticky URL kept but marked stale when the server disappears (HMR reconnect)', () => {
  const s = LPS.resolveStage({ stickyUrl: 'http://localhost:7819', livePorts: [] });
  assert.strictEqual(s.url, 'http://localhost:7819');
  assert.strictEqual(s.stale, true);
  assert.strictEqual(s.degraded, false);
  assert.ok(/reconecta/.test(s.reason));
});

test('resolveStage: never throws on garbage input', () => {
  assert.doesNotThrow(() => LPS.resolveStage(null));
  assert.doesNotThrow(() => LPS.resolveStage({ livePorts: 'nope' }));
  assert.strictEqual(LPS.resolveStage(null).degraded, true);
});

// ── renderStageStatus (honest, XSS-safe, concat-only) ─────────────────────────────────────

test('renderStageStatus: live server shows the URL + source + honest HTTP validation, no over-claim', () => {
  const html = LPS.renderStageStatus({ url: 'http://localhost:7819', source: 'config', degraded: false, stale: false });
  assert.ok(html.includes('http://localhost:7819'));
  assert.ok(html.includes('config'));
  assert.ok(html.includes('HTML 2xx validado'), 'states the successful HTTP validation, not a bare listening port');
  assert.ok(html.indexOf('HMR') === -1, 'does not assert HMR from an HTTP probe');
  assert.ok(html.includes('lps-on'));
});

test('renderStageStatus: degraded → only MEO copy, no URL invented', () => {
  const html = LPS.renderStageStatus({ url: null, degraded: true, reason: 'nenhum dev server detetado' });
  assert.ok(html.includes('só MEO'));
  assert.ok(html.includes('lps-off'));
  assert.ok(html.indexOf('http://') === -1);
});

test('renderStageStatus: stale → warning + honest note', () => {
  const html = LPS.renderStageStatus({ url: 'http://localhost:7819', source: 'override', degraded: false, stale: true, reason: 'servidor offline?' });
  assert.ok(html.includes('⚠️'));
  assert.ok(html.includes('lps-stale'));
  assert.ok(html.includes('servidor offline?'));
});

test('renderStageStatus: null/garbage → neutral detecting note, never throws', () => {
  assert.doesNotThrow(() => LPS.renderStageStatus(null));
  assert.ok(LPS.renderStageStatus(null).includes('a detetar'));
  assert.doesNotThrow(() => LPS.renderStageStatus(undefined));
});

test('renderStageStatus: escapes HTML in url/reason (no injection)', () => {
  const evil = LPS.renderStageStatus({ url: 'http://localhost:7819"><img src=x onerror=alert(1)>', source: '<b>x</b>', degraded: false, stale: false });
  assert.ok(evil.indexOf('<img src=x') === -1, 'raw img tag must be escaped');
  assert.ok(evil.indexOf('<b>x</b>') === -1, 'raw source tag must be escaped');
  assert.ok(evil.includes('&lt;img'));
});

// ── MP3.3 multi-page navigation — route discovery + address-bar resolution ─────────────────

test('pagePathToRoute: maps page files to routes; strips route groups; drops non-pages', () => {
  assert.strictEqual(LPS.pagePathToRoute('app/page.tsx'), '/');
  assert.strictEqual(LPS.pagePathToRoute('(marketing)/install/page.tsx'), '/install');
  assert.strictEqual(LPS.pagePathToRoute('app/(app)/dashboard/page.tsx'), '/dashboard');
  assert.strictEqual(LPS.pagePathToRoute('landing/app/(marketing)/under-the-hood/page.tsx'), '/under-the-hood', 'hyphens preserved');
  assert.strictEqual(LPS.pagePathToRoute('app/(marketing)/layout.tsx'), null, 'layout is not a page');
  assert.strictEqual(LPS.pagePathToRoute('app/foo/route.ts'), null, 'API route handler is not a page');
});

test('pagePathToRoute: dynamic + parallel segments are not literally navigable (null)', () => {
  assert.strictEqual(LPS.pagePathToRoute('(marketing)/packs/[id]/page.tsx'), null);
  assert.strictEqual(LPS.pagePathToRoute('app/blog/[[...slug]]/page.tsx'), null);
  assert.strictEqual(LPS.pagePathToRoute('app/@modal/page.tsx'), '/', 'parallel slot folder contributes no URL segment');
});

test('discoverRoutes: sorted + de-duplicated, home first, dynamic dropped', () => {
  const routes = LPS.discoverRoutes([
    'app/(marketing)/install/page.tsx',
    'app/page.tsx',
    'app/(app)/dashboard/page.tsx',
    'app/(marketing)/packs/[id]/page.tsx', // dropped (dynamic)
    'app/(marketing)/packs/page.tsx',
    'app/page.tsx', // dup
    'app/(marketing)/layout.tsx', // not a page
  ]);
  assert.deepStrictEqual(routes, ['/', '/dashboard', '/install', '/packs']);
});

test('discoverRoutes: never throws on garbage input', () => {
  assert.deepStrictEqual(LPS.discoverRoutes(null), []);
  assert.deepStrictEqual(LPS.discoverRoutes(['', null, 'not-a-page.tsx', 42]), []);
});

test('sanitizeNavPath: single leading slash, strips whitespace/control, keeps hyphens', () => {
  assert.strictEqual(LPS.sanitizeNavPath('  /under-the-hood  '), '/under-the-hood');
  assert.strictEqual(LPS.sanitizeNavPath('install'), '/install');
  assert.strictEqual(LPS.sanitizeNavPath(''), '/');
  assert.strictEqual(LPS.sanitizeNavPath(null), '/');
  assert.strictEqual(LPS.sanitizeNavPath('/a\tb\nc'), '/abc', 'embedded whitespace removed');
});

test('resolveNavTarget: same-origin path/URL navigates within the stage (never re-points)', () => {
  const o = 'http://localhost:7819';
  assert.deepStrictEqual(LPS.resolveNavTarget(o, '/install'), { kind: 'path', url: 'http://localhost:7819/install' });
  assert.deepStrictEqual(LPS.resolveNavTarget(o, 'http://localhost:7819/packs'), { kind: 'path', url: 'http://localhost:7819/packs' });
  assert.deepStrictEqual(LPS.resolveNavTarget(o, 'localhost:7819'), { kind: 'path', url: 'http://localhost:7819' }, 'bare current origin → root, no trailing slash fabricated');
});

test('resolveNavTarget: a DIFFERENT localhost origin is a stage re-point (host lock re-runs)', () => {
  const r = LPS.resolveNavTarget('http://localhost:7819', 'localhost:3000/x');
  assert.strictEqual(r.kind, 'origin');
  assert.strictEqual(r.url, 'http://localhost:3000');
});

test('resolveNavTarget: origin lock — non-localhost / unparseable is refused (never navigates)', () => {
  assert.deepStrictEqual(LPS.resolveNavTarget('http://localhost:7819', 'http://evil.com/x'), { kind: 'invalid' });
  assert.deepStrictEqual(LPS.resolveNavTarget('http://localhost:7819', 'javascript:alert(1)'), { kind: 'invalid' });
  assert.deepStrictEqual(LPS.resolveNavTarget(null, '/install'), { kind: 'invalid' }, 'a bare path with no known origin cannot navigate');
  assert.deepStrictEqual(LPS.resolveNavTarget('http://localhost:7819', ''), { kind: 'invalid' });
});

// ── concat-only contract (safe to embed in getLivePreviewHtml's outer template literal) ────

test('concat-only guard: renderStageStatus source has no backticks or ${} interpolation', () => {
  const src = LPS.renderStageStatus.toString();
  assert.ok(src.indexOf('`') === -1, 'renderStageStatus source has no backticks');
  assert.ok(src.indexOf('${') === -1, 'renderStageStatus source has no ${ interpolation');
});

// ── webview-sim: fn.toString() + new Function() (exact webview path) ──────────────────────

const _wv_esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _wvRenderStageStatus = new Function('esc', 'return (' + LPS.renderStageStatus.toString() + ')')(_wv_esc);

test('webview-sim: renderStageStatus parses and executes via new Function() (exact webview path)', () => {
  assert.strictEqual(typeof _wvRenderStageStatus, 'function');
  const html = _wvRenderStageStatus({ url: 'http://localhost:7819', source: 'probe', degraded: false, stale: false });
  assert.ok(typeof html === 'string' && html.includes('http://localhost:7819'));
});
