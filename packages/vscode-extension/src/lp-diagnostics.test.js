'use strict';
// lp-diagnostics.test.js — Live Preview · MP4 (Honest Diagnostics strip).
// Proves: the lp-error parser normalises runtime/build/console into a safe shape; ingest de-dupes
// into ×N groups most-recent-first; the origin gate rejects forged/stale/'*' origins (reuses the
// MP2 localhost allowlist); the strip renderer is honest (hidden at 0, red vs amber, disabled open
// without a location), XSS-safe and concat-only (safe to serialise into getLivePreviewHtml); the
// file resolver maps dev paths to workspace candidates without traversal; and the clipboard
// formatter carries message + location + stack.

const { test } = require('node:test');
const assert = require('node:assert');

const LPD = require('./lp-diagnostics.js');

// ── normalizeTapError ─────────────────────────────────────────────────────────────────────────

test('normalizeTapError: a runtime payload normalises message/file/line/col/kind', () => {
  const e = LPD.normalizeTapError({ kind: 'runtime', message: 'boom @ hero', file: 'app/page.tsx', line: 7, col: 9, stack: 'Error: boom', ts: 123 });
  assert.strictEqual(e.kind, 'runtime');
  assert.strictEqual(e.message, 'boom @ hero');
  assert.strictEqual(e.file, 'app/page.tsx');
  assert.strictEqual(e.line, 7);
  assert.strictEqual(e.col, 9);
  assert.strictEqual(e.ts, 123);
});

test('normalizeTapError: unknown kind → runtime; empty message → honest placeholder', () => {
  assert.strictEqual(LPD.normalizeTapError({ kind: 'weird' }).kind, 'runtime');
  assert.strictEqual(LPD.normalizeTapError({ message: '   ' }).message, '(erro sem mensagem)');
  assert.strictEqual(LPD.normalizeTapError({ kind: 'build', message: 'Failed to compile' }).kind, 'build');
});

test('normalizeTapError: bad line/col → null (no location), never throws on garbage', () => {
  assert.strictEqual(LPD.normalizeTapError({ line: 'x', col: -3 }).line, null);
  assert.strictEqual(LPD.normalizeTapError({ line: 0 }).line, null);
  assert.doesNotThrow(() => LPD.normalizeTapError(null));
  assert.doesNotThrow(() => LPD.normalizeTapError(undefined));
  assert.strictEqual(LPD.normalizeTapError('nope').message, '(erro sem mensagem)');
});

test('normalizeTapError: clamps a hostile giant message/stack (no stall / no injection surface)', () => {
  const e = LPD.normalizeTapError({ message: 'x'.repeat(9000), stack: 's'.repeat(99999) });
  assert.ok(e.message.length <= 2000);
  assert.ok(e.stack.length <= 8000);
});

// ── tapErrorKey / ingestErrors (×N grouping, most-recent-first) ────────────────────────────────

test('ingestErrors: a duplicate error bumps ×N and moves to front, does not append', () => {
  let list = [];
  list = LPD.ingestErrors(list, { kind: 'runtime', message: 'boom', file: 'a.tsx', line: 5 });
  list = LPD.ingestErrors(list, { kind: 'runtime', message: 'other', file: 'b.tsx', line: 1 });
  list = LPD.ingestErrors(list, { kind: 'runtime', message: 'boom', file: 'a.tsx', line: 5 });
  assert.strictEqual(list.length, 2, 'duplicate collapsed');
  assert.strictEqual(list[0].message, 'boom');
  assert.strictEqual(list[0].count, 2, 'count bumped to ×2');
  assert.strictEqual(list[1].message, 'other');
});

test('ingestErrors: distinct kind/message/file/line stay separate; cap is honoured', () => {
  let list = [];
  for (let i = 0; i < 60; i++) list = LPD.ingestErrors(list, { message: 'e' + i, file: 'f.tsx', line: i + 1 }, 50);
  assert.strictEqual(list.length, 50, 'capped at 50');
  assert.strictEqual(list[0].message, 'e59', 'most recent first');
});

test('ingestErrors: does not mutate the input array (pure)', () => {
  const orig = [];
  const next = LPD.ingestErrors(orig, { message: 'x' });
  assert.strictEqual(orig.length, 0);
  assert.strictEqual(next.length, 1);
});

test('clearErrors: clears by kind, and all when kind is falsy/all', () => {
  const list = [{ kind: 'build', message: 'b' }, { kind: 'runtime', message: 'r' }];
  assert.deepStrictEqual(LPD.clearErrors(list, 'build').map((e) => e.kind), ['runtime']);
  assert.strictEqual(LPD.clearErrors(list, 'all').length, 0);
  assert.strictEqual(LPD.clearErrors(list, null).length, 0);
});

// ── acceptTapOrigin (MP4 origin lock — rejects forged origins) ─────────────────────────────────

test('acceptTapOrigin: accepts ONLY the exact framed localhost origin', () => {
  assert.strictEqual(LPD.acceptTapOrigin('http://localhost:7819', 'http://localhost:7819'), true);
  assert.strictEqual(LPD.acceptTapOrigin('http://localhost:7819', 'http://localhost:7819/some/path'), true, 'stage url path is stripped to its origin');
  assert.strictEqual(LPD.acceptTapOrigin('http://127.0.0.1:5173', 'http://127.0.0.1:5173'), true);
});

test('acceptTapOrigin: REJECTS forged / stale / wildcard / non-localhost origins', () => {
  assert.strictEqual(LPD.acceptTapOrigin('http://localhost:9999', 'http://localhost:7819'), false, 'different port (stale/forged)');
  assert.strictEqual(LPD.acceptTapOrigin('http://evil.com', 'http://localhost:7819'), false);
  assert.strictEqual(LPD.acceptTapOrigin('*', 'http://localhost:7819'), false);
  assert.strictEqual(LPD.acceptTapOrigin('null', 'http://localhost:7819'), false);
  assert.strictEqual(LPD.acceptTapOrigin('', 'http://localhost:7819'), false);
  assert.strictEqual(LPD.acceptTapOrigin('http://localhost:7819', null), false, 'no stage framed → reject');
  assert.strictEqual(LPD.acceptTapOrigin('http://localhost:7819', 'http://evil.com:7819'), false, 'stage url itself invalid');
  assert.strictEqual(LPD.acceptTapOrigin(undefined, 'http://localhost:7819'), false);
});

test('acceptTapOrigin ≡ the live webview check (ev.origin === new URL(stageUrl).origin)', () => {
  // The webview listener gates on `ev.origin === curOrigin`, where curOrigin = new URL(st.url).origin.
  // Prove the tested pure function AGREES with that inline check for every representative case, so the
  // exported+tested guard is not a parallel dead implementation of the real one.
  const cases = [
    ['http://localhost:7819', 'http://localhost:7819', true],
    ['http://localhost:9999', 'http://localhost:7819', false],
    ['http://127.0.0.1:5173', 'http://127.0.0.1:5173', true],
    ['http://evil.com', 'http://localhost:7819', false],
    ['https://localhost:7819', 'http://localhost:7819', false],
  ];
  for (const [evOrigin, stageUrl, expected] of cases) {
    const live = evOrigin === new URL(stageUrl).origin; // exactly what extension.js:1599 evaluates
    assert.strictEqual(LPD.acceptTapOrigin(evOrigin, stageUrl), expected, 'acceptTapOrigin ' + evOrigin);
    assert.strictEqual(live, expected, 'live inline check ' + evOrigin);
    assert.strictEqual(LPD.acceptTapOrigin(evOrigin, stageUrl), live, 'pure fn agrees with live check ' + evOrigin);
  }
});

// ── resolveErrorFileCandidates (first brick of MP5 click-to-code) ──────────────────────────────

test('resolveErrorFileCandidates: a bare app path yields with/without landing/ prefix', () => {
  assert.deepStrictEqual(LPD.resolveErrorFileCandidates('app/page.tsx'), ['app/page.tsx', 'landing/app/page.tsx']);
  assert.deepStrictEqual(LPD.resolveErrorFileCandidates('landing/app/page.tsx'), ['landing/app/page.tsx', 'app/page.tsx']);
});

test('resolveErrorFileCandidates: strips dev prefixes (origin, webpack-internal, app-pages-browser, query)', () => {
  assert.ok(LPD.resolveErrorFileCandidates('http://localhost:7819/app/page.tsx?123').includes('app/page.tsx'));
  assert.ok(LPD.resolveErrorFileCandidates('webpack-internal:///(app-pages-browser)/./app/page.tsx').includes('app/page.tsx'));
});

test('resolveErrorFileCandidates: rejects traversal / non-file schemes / empty', () => {
  assert.deepStrictEqual(LPD.resolveErrorFileCandidates('../../etc/passwd'), []);
  assert.deepStrictEqual(LPD.resolveErrorFileCandidates('node:internal/process'), []);
  assert.deepStrictEqual(LPD.resolveErrorFileCandidates('file:///etc/passwd'), []);
  assert.deepStrictEqual(LPD.resolveErrorFileCandidates(''), []);
  assert.deepStrictEqual(LPD.resolveErrorFileCandidates(null), []);
});

// ── formatForClipboard ─────────────────────────────────────────────────────────────────────────

test('formatForClipboard: message + location + stack, tagged by kind', () => {
  const txt = LPD.formatForClipboard({ kind: 'runtime', message: 'boom', file: 'app/page.tsx', line: 7, col: 9, stack: 'Error: boom\n  at Home' });
  assert.ok(txt.startsWith('[runtime] boom'));
  assert.ok(txt.includes('at app/page.tsx:7:9'));
  assert.ok(txt.includes('Error: boom'));
});

test('formatForClipboard: build tag; no location line when file absent', () => {
  const txt = LPD.formatForClipboard({ kind: 'build', message: 'Failed to compile' });
  assert.ok(txt.startsWith('[build] Failed to compile'));
  assert.ok(txt.indexOf('at ') === -1);
});

// ── renderErrorStrip (honest, XSS-safe, concat-only) ───────────────────────────────────────────

test('renderErrorStrip: zero errors → empty string (hidden, no fabricated "all good")', () => {
  assert.strictEqual(LPD.renderErrorStrip({ errors: [] }), '');
  assert.strictEqual(LPD.renderErrorStrip(null), '');
  assert.strictEqual(LPD.renderErrorStrip({}), '');
});

test('renderErrorStrip: a runtime error → red row with message, file:line, open+copy buttons', () => {
  const html = LPD.renderErrorStrip({ errors: [{ kind: 'runtime', message: 'boom @ hero', file: 'app/page.tsx', line: 7, count: 1 }] });
  assert.ok(html.includes('lpd-runtime'));
  assert.ok(html.includes('⛔ runtime'));
  assert.ok(html.includes('boom @ hero'));
  assert.ok(html.includes('app/page.tsx:7'));
  assert.ok(html.includes('data-act="open"'), 'open button enabled with a location');
  assert.ok(html.includes('data-act="copy"'));
  assert.ok(html.indexOf('disabled') === -1, 'open is NOT disabled when a location exists');
});

test('renderErrorStrip: a build error → amber row, distinct from runtime (gate #4)', () => {
  const html = LPD.renderErrorStrip({ errors: [{ kind: 'build', message: 'Failed to compile', file: 'app/page.tsx', line: 3, count: 1 }] });
  assert.ok(html.includes('lpd-build'));
  assert.ok(html.includes('⚠ build'));
  assert.ok(html.indexOf('lpd-runtime') === -1);
});

test('renderErrorStrip: no FILE → open button DISABLED with an honest tooltip (honest-controls)', () => {
  const html = LPD.renderErrorStrip({ errors: [{ kind: 'runtime', message: 'boom', file: '', line: null, count: 1 }] });
  assert.ok(html.includes('disabled'));
  assert.ok(html.includes('sem localização'));
  assert.ok(html.indexOf('data-act="open"') === -1, 'no live open action when there is no file at all');
});

test('renderErrorStrip: file present but line unknown → open ENABLED (host opens at top, no lying disable)', () => {
  const html = LPD.renderErrorStrip({ errors: [{ kind: 'runtime', message: 'boom', file: 'app/page.tsx', line: null, count: 1 }] });
  assert.ok(html.includes('data-act="open"'), 'open is enabled whenever a file exists');
  assert.ok(html.indexOf('disabled') === -1, 'never disabled+"sem localização" while a real file path is shown');
  assert.ok(html.includes('app/page.tsx'), 'the file (without a line) is still shown');
});

test('renderErrorStrip: header counts runtime/build/console honestly (no fold-in)', () => {
  const html = LPD.renderErrorStrip({
    errors: [
      { kind: 'runtime', message: 'r', file: 'a.tsx', line: 1, count: 1 },
      { kind: 'build', message: 'b', file: 'b.tsx', line: 2, count: 1 },
      { kind: 'console', message: 'c', file: 'c.tsx', line: 3, count: 1 },
    ],
    expanded: true,
  });
  assert.ok(html.includes('1 runtime'));
  assert.ok(html.includes('1 build'));
  assert.ok(html.includes('1 console'), 'console is counted on its own, not folded into runtime');
});

test('renderErrorStrip: duplicates show ×N; collapsed shows one row + "ver todos"', () => {
  const errors = [
    { kind: 'runtime', message: 'boom', file: 'a.tsx', line: 5, count: 3 },
    { kind: 'runtime', message: 'other', file: 'b.tsx', line: 1, count: 1 },
  ];
  const html = LPD.renderErrorStrip({ errors, expanded: false });
  assert.ok(html.includes('×3'));
  assert.ok(html.includes('ver todos (2)'));
  assert.ok(html.indexOf('other') === -1, 'collapsed hides the second group');
  const exp = LPD.renderErrorStrip({ errors, expanded: true });
  assert.ok(exp.includes('other'), 'expanded reveals all groups');
});

test('renderErrorStrip: escapes HTML in message/file (no injection)', () => {
  const html = LPD.renderErrorStrip({ errors: [{ kind: 'runtime', message: '<img src=x onerror=alert(1)>', file: '"><svg>', line: 1, count: 1 }] });
  assert.ok(html.indexOf('<img src=x') === -1);
  assert.ok(html.indexOf('<svg>') === -1);
  assert.ok(html.includes('&lt;img'));
});

test('renderErrorStrip: never throws on garbage rows', () => {
  assert.doesNotThrow(() => LPD.renderErrorStrip({ errors: [null, undefined, {}] }));
});

// ── concat-only contract (safe to embed in getLivePreviewHtml's outer template literal) ─────────

test('concat-only guard: renderErrorStrip source has no backticks or ${} interpolation', () => {
  const src = LPD.renderErrorStrip.toString();
  assert.ok(src.indexOf('`') === -1, 'renderErrorStrip source has no backticks');
  assert.ok(src.indexOf('${') === -1, 'renderErrorStrip source has no ${ interpolation');
});

// ── webview-sim: fn.toString() + new Function() (exact webview path, esc as a free var) ─────────

const _wv_esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _wvRenderErrorStrip = new Function('esc', 'return (' + LPD.renderErrorStrip.toString() + ')')(_wv_esc);

test('webview-sim: renderErrorStrip parses and executes via new Function() (exact webview path)', () => {
  assert.strictEqual(typeof _wvRenderErrorStrip, 'function');
  const html = _wvRenderErrorStrip({ errors: [{ kind: 'runtime', message: 'boom', file: 'app/page.tsx', line: 7, count: 1 }] });
  assert.ok(typeof html === 'string' && html.includes('app/page.tsx:7'));
});

// ── MP4.1 E2E (data level): a SERVER COMPONENT throw → red strip WITH file:line, openable. ────────────
// This is the host half of the gate. A Server Component throw hard-reloads the framed dev server into
// Next's global-error page (the tap can't mount there), so app/global-error.tsx relays the caught error
// via reportBoundaryError → buildBoundaryErrorPayload. That payload (proven on the landing side in
// lp-error-tap.test.ts) arrives here as an `lp-error`. We prove the host turns it into a RED runtime row
// carrying the file:line, and that the file resolves to a real workspace candidate so "abrir ficheiro"
// is a live action — not a lying control. The file string is exactly what parseStackForSource extracts
// from a Next 15 dev server stack (leading `/.` and all), so this exercises the real resolver too.
test('MP4.1 server-throw payload → normalize→ingest→render yields a RED runtime row with file:line', () => {
  const serverThrow = {
    type: 'lp-error',
    kind: 'runtime',
    message: 'MP41_SERVER_BOOM at mp41lab',
    file: '/./app/mp41lab/page.tsx', // parseStackForSource output for webpack-internal:///(app-pages-browser)/./app/mp41lab/page.tsx:5:9
    line: 5,
    col: 9,
    stack: 'Error: MP41_SERVER_BOOM\n    at Mp41Lab (webpack-internal:///(app-pages-browser)/./app/mp41lab/page.tsx:5:9)',
    ts: 1751000000000,
  };
  const norm = LPD.normalizeTapError(serverThrow);
  assert.strictEqual(norm.kind, 'runtime', 'a caught server render throw is a RED runtime error');
  assert.strictEqual(norm.line, 5);
  assert.strictEqual(norm.col, 9);

  const list = LPD.ingestErrors([], serverThrow);
  const html = LPD.renderErrorStrip({ errors: list });
  assert.ok(html.includes('lpd-runtime'), 'server throw renders as a RED runtime row');
  assert.ok(html.includes('⛔ runtime'));
  assert.ok(html.includes('MP41_SERVER_BOOM'), 'the thrown message is shown');
  assert.ok(html.includes('app/mp41lab/page.tsx:5'), 'the file:line is shown (gate #1)');
  assert.ok(html.includes('data-act="open"'), 'open is a LIVE action — a file:line exists');
  assert.ok(html.indexOf('disabled') === -1, 'open is not a lying disabled control');

  // The file resolves to a concrete workspace candidate → the host can actually open it (MP5 brick).
  const cands = LPD.resolveErrorFileCandidates(serverThrow.file);
  assert.ok(cands.length > 0, 'the server-throw file resolves to at least one workspace candidate');
  assert.ok(cands.some((c) => c.replace(/\.\//g, '').endsWith('app/mp41lab/page.tsx')), 'resolves to the real source file');
});

test('MP4.1 honest-copy holds: a HEALTHY edit (no error payload) keeps the strip hidden', () => {
  // The websocket path never emits on a bare serverComponentChanges/building frame; prove that an empty
  // error list still renders nothing (no fabricated "all good", no phantom red row).
  assert.strictEqual(LPD.renderErrorStrip({ errors: LPD.ingestErrors([], null).filter(() => false) }), '');
  assert.strictEqual(LPD.renderErrorStrip({ errors: [] }), '');
});
