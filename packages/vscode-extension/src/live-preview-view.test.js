'use strict';
// live-preview-view.test.js — Live Preview · MP1.
// Proves: the file-bus JSONL parser is fail-soft; session detection/filtering is honest;
// Director's Cut renders reason/file/task/server + gracefully empty; Brain shows a real $
// cost when present and honestly falls back to n/d otherwise; XSS-safe escaping; and the
// concat-only contract that lets these functions be serialised via fn.toString() into the
// webview (mirrors row-renderer.js / mission-control-view.js / data.js WCOCKPIT-5 patterns).

const { test } = require('node:test');
const assert = require('node:assert');

const LPV = require('./live-preview-view.js');

// ── parseBusJsonl ────────────────────────────────────────────────────────────────────────

test('parseBusJsonl: parses valid JSONL, tolerates garbage/truncated lines', () => {
  const text = [
    JSON.stringify({ ts: '2026-07-04T12:00:00.000Z', sid: 's1', kind: 'reason', tool: null, path: null, summary: 'do the thing', tier: null, model: null, cost: null, local: null }),
    'not json at all',
    '{"broken":',
    '',
    JSON.stringify({ ts: '2026-07-04T12:00:01.000Z', sid: 's1', kind: 'file', tool: 'Write', path: '/a.js', summary: null, tier: null, model: null, cost: null, local: null }),
  ].join('\n');
  const events = LPV.parseBusJsonl(text, 500);
  assert.strictEqual(events.length, 2, 'garbage/blank lines are dropped, valid ones kept');
  assert.strictEqual(events[0].kind, 'reason');
  assert.strictEqual(events[1].kind, 'file');
});

test('parseBusJsonl: never throws on null/undefined/non-string input', () => {
  assert.doesNotThrow(() => LPV.parseBusJsonl(null, 10));
  assert.doesNotThrow(() => LPV.parseBusJsonl(undefined, 10));
  assert.deepStrictEqual(LPV.parseBusJsonl(null, 10), []);
});

test('parseBusJsonl: caps to the last maxN valid events (file order preserved)', () => {
  const lines = [];
  for (let i = 0; i < 10; i++) lines.push(JSON.stringify({ ts: 't' + i, sid: 's', kind: 'file', tool: null, path: 'f' + i, summary: null, tier: null, model: null, cost: null, local: null }));
  const events = LPV.parseBusJsonl(lines.join('\n'), 3);
  assert.strictEqual(events.length, 3);
  assert.strictEqual(events[0].path, 'f7');
  assert.strictEqual(events[2].path, 'f9');
});

// ── detectActiveSid / filterBySession ───────────────────────────────────────────────────

test('detectActiveSid: returns the most-recent sid in the bus', () => {
  const events = [
    { sid: 'old-session', kind: 'reason' },
    { sid: null, kind: 'server' },
    { sid: 'new-session', kind: 'file' },
  ];
  assert.strictEqual(LPV.detectActiveSid(events), 'new-session');
});

test('detectActiveSid: null when no event carries a sid (honest unknown)', () => {
  assert.strictEqual(LPV.detectActiveSid([{ sid: null, kind: 'file' }, { kind: 'task' }]), null);
  assert.strictEqual(LPV.detectActiveSid([]), null);
  assert.strictEqual(LPV.detectActiveSid(null), null);
});

test('filterBySession: keeps only events matching the active sid', () => {
  const events = [
    { sid: 'a', kind: 'reason', summary: 'from a' },
    { sid: 'b', kind: 'file', path: '/b.js' },
    { sid: 'a', kind: 'file', path: '/a.js' },
  ];
  const filtered = LPV.filterBySession(events, 'a');
  assert.strictEqual(filtered.length, 2);
  assert.ok(filtered.every((e) => e.sid === 'a'));
});

test('filterBySession: sid unknown (null) returns the full list unmodified (cannot filter what we don\'t know)', () => {
  const events = [{ sid: 'a', kind: 'reason' }, { sid: 'b', kind: 'file' }];
  assert.deepStrictEqual(LPV.filterBySession(events, null), events);
});

test('bus tail-reader+filter pure pipeline: parse -> detect -> filter, end to end', () => {
  const raw = [
    JSON.stringify({ ts: 't0', sid: 'sess-old', kind: 'reason', tool: null, path: null, summary: 'old work', tier: null, model: null, cost: null, local: null }),
    JSON.stringify({ ts: 't1', sid: 'sess-new', kind: 'reason', tool: null, path: null, summary: 'new work', tier: null, model: null, cost: null, local: null }),
    JSON.stringify({ ts: 't2', sid: 'sess-new', kind: 'file', tool: 'Edit', path: '/x.js', summary: null, tier: null, model: null, cost: null, local: null }),
  ].join('\n');
  const events = LPV.parseBusJsonl(raw, 500);
  const sid = LPV.detectActiveSid(events);
  assert.strictEqual(sid, 'sess-new');
  const scoped = LPV.filterBySession(events, sid);
  assert.strictEqual(scoped.length, 2);
  assert.ok(scoped.every((e) => e.sid === 'sess-new'));
});

// ── renderDirectorsCut ───────────────────────────────────────────────────────────────────

test('renderDirectorsCut: renders reason/file/task/server events', () => {
  const events = [
    { ts: '2026-07-04T12:00:00.000Z', sid: 's', kind: 'reason', tool: null, path: null, summary: 'muda a cor do botão', tier: null, model: null, cost: null, local: null },
    { ts: '2026-07-04T12:00:01.000Z', sid: 's', kind: 'file', tool: 'Write', path: '/src/x.ts', summary: null, tier: null, model: null, cost: null, local: null },
    { ts: '2026-07-04T12:00:02.000Z', sid: 's', kind: 'task', tool: 'model-reasoner', path: null, summary: 'bug hunt', tier: null, model: null, cost: null, local: null },
    { ts: '2026-07-04T12:00:03.000Z', sid: 's', kind: 'server', tool: null, path: null, summary: 'stop', tier: null, model: null, cost: null, local: null },
  ];
  const html = LPV.renderDirectorsCut(events, { sidKnown: true });
  assert.ok(html.includes('🧠'), 'reason glyph present');
  assert.ok(html.includes('✎'), 'file glyph present');
  assert.ok(html.includes('🤖'), 'task glyph present');
  assert.ok(html.includes('muda a cor do botão'), 'reason summary rendered');
  assert.ok(html.includes('/src/x.ts'), 'file path rendered');
  assert.ok(html.includes('model-reasoner'), 'task tool rendered');
  assert.ok(html.includes('stop'), 'server summary rendered');
  assert.ok(html.indexOf('sessão activa desconhecida') === -1, 'sidKnown=true suppresses the unknown-session note');
});

test('renderDirectorsCut: null fields are omitted, never rendered as "null"', () => {
  const html = LPV.renderDirectorsCut([{ ts: 't', sid: 's', kind: 'file', tool: null, path: null, summary: null, tier: null, model: null, cost: null, local: null }], {});
  assert.ok(html.indexOf('null') === -1, 'no literal "null" leaked into the HTML');
  assert.ok(html.includes('sem detalhe'), 'honest placeholder for a fieldless event');
});

test('renderDirectorsCut: sidKnown=false surfaces the honest unknown-session note', () => {
  const html = LPV.renderDirectorsCut([{ ts: 't', sid: null, kind: 'server', summary: 'stop' }], { sidKnown: false });
  assert.ok(html.includes('sessão activa desconhecida'), 'unknown session note shown');
});

test('renderDirectorsCut: empty bus -> graceful honest message, no throw', () => {
  const html = LPV.renderDirectorsCut([], {});
  assert.ok(html.includes('nenhum evento ainda'), 'empty-bus copy present');
  const html2 = LPV.renderDirectorsCut(null, undefined);
  assert.ok(html2.includes('nenhum evento ainda'), 'garbage input degrades to the same empty copy');
});

test('renderDirectorsCut: escapes HTML in path/summary/tool (no injection)', () => {
  const evil = [{
    ts: 't', sid: 's', kind: 'file', tool: '<script>bad</script>',
    path: '<img src=x onerror=alert(1)>', summary: '<b>hi</b>', tier: null, model: null, cost: null, local: null,
  }];
  const html = LPV.renderDirectorsCut(evil, { sidKnown: true });
  assert.ok(html.indexOf('<script>bad') === -1, 'raw script tag must be escaped');
  assert.ok(html.indexOf('<img src=x') === -1, 'raw img tag must be escaped');
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'), 'escaped tool present');
});

// ── clock() timezone (MP3.1) — rendered via renderDirectorsCut (clock is nested so it travels
//    with the fn.toString() into the webview; we assert through the real render path) ──────────

test('renderDirectorsCut clock: renders the OS-local time, NOT the UTC slice (São Paulo scenario)', () => {
  const prevTZ = process.env.TZ;
  process.env.TZ = 'America/Sao_Paulo'; // UTC-3
  try {
    const iso = '2026-07-05T11:29:00.000Z'; // 11:29 UTC = 08:29 in São Paulo
    const expectedLocal = new Date(iso).toLocaleTimeString(undefined, { hour12: false });
    const html = LPV.renderDirectorsCut([{ ts: iso, sid: 's', kind: 'file', path: '/a.js' }], { sidKnown: true });
    assert.ok(html.includes('>' + expectedLocal + '<'), 'time column shows the local (São Paulo) time');
    assert.ok(html.indexOf('>11:29:00<') === -1, 'must NOT show the raw UTC slice 11:29:00');
    assert.ok(expectedLocal !== iso.slice(11, 19), 'local tz differs from UTC for this fixture');
  } finally {
    if (prevTZ === undefined) delete process.env.TZ; else process.env.TZ = prevTZ;
  }
});

test('renderDirectorsCut clock: absent/unparseable ts degrades to an honest n/d (never a fabricated time)', () => {
  const nullTs = LPV.renderDirectorsCut([{ ts: null, sid: 's', kind: 'file', path: '/a.js' }], { sidKnown: true });
  assert.ok(nullTs.includes('>n/d<'), 'null ts -> n/d (new Date(null)=epoch 1970 must NOT leak a fabricated time)');
  const badTs = LPV.renderDirectorsCut([{ ts: 'not-a-date', sid: 's', kind: 'file', path: '/a.js' }], { sidKnown: true });
  assert.ok(badTs.includes('>n/d<'), 'unparseable ts -> n/d');
});

// ── buildBrainData / renderBrain ─────────────────────────────────────────────────────────

const DECISIONS = [
  { ts: 3, tier: 'T3', recommended_model: 'claude-opus-4-8', session_id: 'sess-a' },
  { ts: 2, tier: 'T0', recommended_model: 'qwen3:30b', session_id: 'sess-a' },
  { ts: 1, tier: 'T1', recommended_model: 'claude-haiku-4-5', session_id: 'sess-b' },
];

test('buildBrainData: scopes tier mix to the active session, falls back to global when session has none', () => {
  const scoped = LPV.buildBrainData(DECISIONS, 'sess-a', [], null);
  assert.strictEqual(scoped.scope, 'session');
  assert.strictEqual(scoped.total, 2);
  assert.strictEqual(scoped.lastTier, 'T3'); // newest-first within the session

  const noMatch = LPV.buildBrainData(DECISIONS, 'sess-unknown', [], null);
  assert.strictEqual(noMatch.scope, 'global');
  assert.strictEqual(noMatch.total, 3);

  const none = LPV.buildBrainData([], null, [], null);
  assert.strictEqual(none.scope, 'none');
  assert.strictEqual(none.pctLocal, null);
});

test('buildBrainData: real $ cost comes from the bus event, falls back to null (n/d) when absent', () => {
  const withCost = LPV.buildBrainData(DECISIONS, 'sess-a', [
    { sid: 'sess-a', kind: 'task', cost: null },
    { sid: 'sess-a', kind: 'server', cost: 2 }, // Opus at $2 — must show $2, never $0
  ], null);
  assert.strictEqual(withCost.costUsd, 2);

  const noCost = LPV.buildBrainData(DECISIONS, 'sess-a', [{ sid: 'sess-a', kind: 'task', cost: null }], null);
  assert.strictEqual(noCost.costUsd, null);
});

test('renderBrain: shows a real cost when present, and n/d when absent (never fabricates $0)', () => {
  const withCost = LPV.buildBrainData(DECISIONS, 'sess-a', [{ sid: 'sess-a', kind: 'server', cost: 2 }], null);
  const htmlWith = LPV.renderBrain(withCost);
  assert.ok(htmlWith.includes('$2.00'), 'real cost rendered honestly');

  const noCost = LPV.buildBrainData(DECISIONS, 'sess-a', [], null);
  const htmlWithout = LPV.renderBrain(noCost);
  assert.ok(htmlWithout.includes('n/d'), 'missing cost falls back to n/d, never $0');
  assert.ok(htmlWithout.indexOf('$0') === -1, 'never fabricates a "$0" when the real cost is unknown');
});

test('renderBrain: tier mix, model, GPU render honestly; empty snapshot never throws', () => {
  const gpu = { gpus: [{ name: 'RTX 4090', utilPct: 30 }], utilPct: 30 };
  const b = LPV.buildBrainData(DECISIONS, 'sess-a', [], gpu);
  const html = LPV.renderBrain(b);
  assert.ok(html.includes('T3'), 'last tier rendered');
  assert.ok(html.includes('claude-opus-4-8'), 'last model rendered');
  assert.ok(html.includes('RTX 4090'), 'GPU name rendered (reused snapshot)');
  assert.ok(html.includes('50% local'), 'pctLocal computed honestly (1 of 2 = T0)');

  assert.doesNotThrow(() => LPV.renderBrain(null));
  assert.doesNotThrow(() => LPV.renderBrain(undefined));
  assert.doesNotThrow(() => LPV.renderBrain({}));
  const emptyHtml = LPV.renderBrain({});
  assert.ok(emptyHtml.includes('n/d'), 'empty brain -> honest n/d, never fabricated');
});

test('renderBrain: escapes HTML in model name (no injection)', () => {
  const evil = LPV.buildBrainData([{ tier: 'T0', recommended_model: '<script>bad</script>', session_id: 's' }], 's', [], null);
  const html = LPV.renderBrain(evil);
  assert.ok(html.indexOf('<script>bad') === -1, 'raw script tag must be escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'escaped model name present');
});

// ── concat-only contract (safe to embed in getLivePreviewHtml's outer template literal) ───

test('concat-only guard: renderDirectorsCut/renderBrain source has no backticks or ${} interpolation', () => {
  for (const fn of [LPV.renderDirectorsCut, LPV.renderBrain]) {
    const src = fn.toString();
    assert.ok(src.indexOf('`') === -1, fn.name + ' source has no backticks');
    assert.ok(src.indexOf('${') === -1, fn.name + ' source has no ${ interpolation');
  }
});

// ── WCOCKPIT-5-style webview-sim: fn.toString() + new Function() (exact webview path) ─────

const _wv_esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _wvRenderDirectorsCut = new Function('esc', 'return (' + LPV.renderDirectorsCut.toString() + ')')(_wv_esc);
const _wvRenderBrain = new Function('esc', 'return (' + LPV.renderBrain.toString() + ')')(_wv_esc);

test('webview-sim: renderDirectorsCut/renderBrain parse and execute via new Function() (exact webview path)', () => {
  assert.strictEqual(typeof _wvRenderDirectorsCut, 'function');
  assert.strictEqual(typeof _wvRenderBrain, 'function');
  const html1 = _wvRenderDirectorsCut([{ ts: 't', sid: 's', kind: 'reason', summary: 'hi' }], { sidKnown: true });
  assert.ok(typeof html1 === 'string' && html1.includes('hi'));
  const html2 = _wvRenderBrain({ lastTier: 'T2', lastModel: 'claude-sonnet-4-6', counts: { T0: 1, T1: 0, T2: 1, T3: 0 }, total: 2, pctLocal: 50, costUsd: 0.03, scope: 'session' });
  assert.ok(typeof html2 === 'string' && html2.includes('T2'));
});
