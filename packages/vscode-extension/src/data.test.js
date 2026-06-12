// data.test.js — backend audit suite (node --test). Fixtures = REAL log lines (F0).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const http = require('http');
const d = require('./data.js');

const REAL_LINE = '{"ts":"2026-06-11T19:24:14.289Z","ts_ms":1781205854290,"event":"classified","session_id":"validate-test","prompt_len":50,"prompt_preview":"refactor the auth middleware to add refresh tokens","tier":"T3","task_category":"architecture_or_critical","recommended_backend":"claude_subagent","recommended_model":"claude-opus-4-6","confidence":0.75,"escalation_rule":"none","quality_intent":false,"cache_hit":false}';

test('parseDecisions: real line parses with all UI fields', () => {
  const r = d.parseDecisions(REAL_LINE);
  assert.equal(r.length, 1);
  assert.equal(r[0].tier, 'T3');
  assert.equal(r[0].task_category, 'architecture_or_critical');
  assert.equal(r[0].confidence, 0.75);
});

test('parseDecisions: garbage, partial lines, other events tolerated', () => {
  const text = ['NOT JSON{{{', '{"event":"other","x":1}', REAL_LINE, '{"truncated...', ''].join('\n');
  const r = d.parseDecisions(text);
  assert.equal(r.length, 1);
});

test('parseDecisions: newest-first ordering + maxN cap', () => {
  const lines = [];
  for (let i = 0; i < 100; i++) lines.push(JSON.stringify({ event: 'classified', tier: 'T0', n: i }));
  const r = d.parseDecisions(lines.join('\n'), 40);
  assert.equal(r.length, 40);
  assert.equal(r[0].n, 99); // newest first
});

test('readDecisions: missing file → [] (never throws)', () => {
  assert.deepEqual(d.readDecisions(10, '/nonexistent/decisions.log'), []);
});

test('readDecisions: tail window on a big file (>256KB)', () => {
  const p = path.join(os.tmpdir(), 'big-decisions.log');
  const filler = JSON.stringify({ event: 'classified', tier: 'T0', pad: 'x'.repeat(400) }) + '\n';
  fs.writeFileSync(p, filler.repeat(1200)); // ~480KB
  const last = JSON.stringify({ event: 'classified', tier: 'T3', marker: 'END' }) + '\n';
  fs.appendFileSync(p, last);
  const r = d.readDecisions(5, p);
  assert.equal(r[0].marker, 'END');
  fs.unlinkSync(p);
});

test('publicSnapshot: caps preview at 90 chars, 40 items, only UI fields', () => {
  const s = { runtimeInstalled: true, decisions: Array.from({ length: 60 }, (_, i) => ({ tier: 'T0', prompt_preview: 'p'.repeat(300), secret_field: 'leak', ts: 't' + i })) };
  const p = d.publicSnapshot(s);
  assert.equal(p.decisions.length, 40);
  assert.equal(p.decisions[0].preview.length, 90);
  assert.equal(p.decisions[0].secret_field, undefined); // no leaking extra fields
});

test('statusBarText: setup / normal / no-metrics', () => {
  assert.equal(d.statusBarText({ runtimeInstalled: false }), '🐮 mooter: setup');
  assert.equal(d.statusBarText({ runtimeInstalled: true, last: { tier: 'T2' }, metrics: { saved: 1.5839 } }), '🐮 T2 · $1.58↓');
  assert.equal(d.statusBarText({ runtimeInstalled: true, decisions: [{ tier: 'T0' }] }), '🐮 T0');
});

test('tierCounts: counts only known tiers', () => {
  const c = d.tierCounts([{ tier: 'T0' }, { tier: 'T0' }, { tier: 'T3' }, { tier: 'T9' }, {}]);
  assert.deepEqual(c, { T0: 2, T1: 0, T2: 0, T3: 1 });
});

test('httpJson: tracker down → null (never throws/hangs)', async () => {
  const r = await d.httpJson(59999, '/metrics', 300);
  assert.equal(r, null);
});

test('httpJson: live mock server → parsed JSON', async () => {
  const srv = http.createServer((_q, res) => { res.end('{"ok":true,"saved":1.49}'); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const r = await d.httpJson(srv.address().port, '/metrics');
  assert.equal(r.saved, 1.49);
  srv.close();
});

test('httpJson: non-JSON body → null', async () => {
  const srv = http.createServer((_q, res) => { res.end('frugal — savings summary'); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const r = await d.httpJson(srv.address().port, '/summary');
  assert.equal(r, null);
  srv.close();
});

// ── v0.4 parser fixtures (real CLI output 2026-06-12) ──
const x = require('./host-extra.js');
test('parseEffort: real output', () => {
  assert.equal(x.parseEffort('🐮 effort: default\n  LLMLingua compression ... off'), 'default');
  assert.equal(x.parseEffort('🐮 effort: ultramoo'), 'ultramoo');
  assert.equal(x.parseEffort('garbage'), null);
});
test('parseIntent: real output', () => {
  const r = x.parseIntent('→ resolved to: mooter help\n   (rule: fallback, confidence 0.30)');
  assert.equal(r.cmd, 'mooter help');
  assert.equal(r.conf, 0.3);
  assert.equal(r.rule, 'fallback');
  assert.equal(x.parseIntent('no match here'), null);
});
test('parseSpanIds: defensive hex extraction', () => {
  const out = 'span a1b2c3d4e5f6 · T0 · rename variable\nno id line\nspan 99887766-aaaa · T3 · drop table';
  const m = x.parseSpanIds(out);
  assert.equal(m.length, 2);
  assert.equal(m[0].id, 'a1b2c3d4e5f6');
});

// ── v0.6 Herd fixtures (real decisions_v2 line) ──
test('parseV2 + herdMatrix: real line, pivot via×llm', () => {
  const L1 = '{"ts":"2026-06-11T19:24:14.291Z","op":"architecture_or_critical","tier":"T3","llm":"opus","tokens_in":1200,"tokens_out":8400,"reason":"none","via":"model-architect"}';
  const L2 = '{"ts":"x","op":"trivial_local","tier":"T0","llm":"qwen","tokens_in":300,"tokens_out":900,"via":"inline"}';
  const rows = x.parseV2(L1 + '\n' + 'garbage\n' + L2);
  assert.equal(rows.length, 2);
  const m = x.matrixForUi(rows);
  assert.ok(m.llms.includes('opus') && m.llms.includes('qwen'));
  const arch = m.rows.find((r) => r.via === 'model-architect');
  const cell = arch.cells[m.llms.indexOf('opus')];
  assert.equal(cell.tok, 9600);
  assert.equal(cell.n, 1);
  assert.equal(m.rows[0].via, 'model-architect');
});
