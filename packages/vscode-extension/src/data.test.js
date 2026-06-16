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

test('pollIntervalMs: brisk when visible, lazy when hidden', () => {
  assert.equal(d.pollIntervalMs(true), 7000);
  assert.equal(d.pollIntervalMs(false), 60000);
  assert.ok(d.pollIntervalMs(false) > d.pollIntervalMs(true)); // hidden never polls faster than visible
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
  const srv = http.createServer((_q, res) => { res.end('mooter — savings summary'); });
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

// ── v0.11 Token Ledger cost math (real captured usage) ──
test('priceFor: family match + unknown → null', () => {
  assert.deepEqual(x.priceFor('claude-opus-4-8'), [5, 25]);
  assert.deepEqual(x.priceFor('claude-sonnet-4-6'), [3, 15]);
  assert.deepEqual(x.priceFor('claude-haiku-4-5-20251001'), [1, 5]);
  assert.deepEqual(x.priceFor('claude-fable-5'), [10, 50]);
  assert.deepEqual(x.priceFor('something-with-opus-inside'), [5, 25]);
  assert.equal(x.priceFor('llama-3'), null);
});
test('costFor: cache-aware, matches the real fable-5 session', () => {
  // real capture: in 65065 · out 149013 · cache_w 768457 · cache_r 15063676
  const c = x.costFor('claude-fable-5', { in: 65065, out: 149013, cw: 768457, cr: 15063676 });
  // (65065*10 + 149013*50 + 768457*10*1.25 + 15063676*10*0.1)/1e6
  assert.ok(Math.abs(c - 32.7707) < 0.01, 'fable-5 session ≈ $32.77, got ' + c);
  assert.equal(x.costFor('unknown-model', { in: 1000, out: 1000 }), null); // honest: no price → null
  assert.equal(x.costFor('claude-haiku-4-5', { in: 1e6, out: 0 }), 1); // 1M input @ $1/M
});

// ── Coherence/honesty fixes (cockpit considerations #2, #5) ──
test('aggregateUsage: skips <synthetic> placeholders, tracks real lastModel (#5,#2)', () => {
  const p = path.join(os.tmpdir(), 'mooter-ledger-test-' + process.pid + '.jsonl');
  const lines = [
    JSON.stringify({ message: { model: 'claude-opus-4-8', usage: { input_tokens: 100, output_tokens: 50 }, id: 'm1' } }),
    JSON.stringify({ message: { model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 }, id: 'syn1' } }),
    JSON.stringify({ message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 200, output_tokens: 80 }, id: 'm2' } }),
  ];
  fs.writeFileSync(p, lines.join('\n') + '\n');
  const agg = x.aggregateUsage([p]);
  const models = agg.rows.map((r) => r.model);
  assert.ok(!models.includes('<synthetic>'), 'synthetic excluded from the ledger');
  assert.ok(models.includes('claude-opus-4-8') && models.includes('claude-sonnet-4-6'));
  assert.equal(agg.lastModel, 'claude-sonnet-4-6'); // most recent REAL usage line = host model
  assert.equal(agg.turns, 2); // synthetic not counted
  fs.unlinkSync(p);
});

test('liveRouting: executor = host model; recommendation kept separate as advisory (#2)', () => {
  const last = { model_full: 'claude-sonnet-4-6', tier: 'T2', confidence: 0.7, ts: 't1' };
  const r = x.liveRouting(last, { hostModel: 'claude-opus-4-8' });
  assert.equal(r.model, 'claude-opus-4-8'); // who ACTUALLY answered
  assert.equal(r.provider, 'cloud');
  assert.equal(r.real, true);
  assert.equal(r.scope, 'session');
  assert.equal(r.recommended.model, 'claude-sonnet-4-6'); // advisory recommendation, separate
  assert.notEqual(r.model, r.recommended.model); // the coherence fix: no longer conflated
});

test('liveRouting: no execution known → recommendation flagged real:false (#2)', () => {
  const r = x.liveRouting({ model_full: 'claude-sonnet-4-6', tier: 'T2', ts: 't' }, {});
  assert.equal(r.model, 'claude-sonnet-4-6');
  assert.equal(r.real, false);
  assert.equal(r.scope, 'recommended');
});

test('liveRouting: a real local dispatch is the executor (#2)', () => {
  const r = x.liveRouting({ model_full: 'claude-opus-4-8', tier: 'T3', ts: 't' }, { lastExecution: { ok: true, model: 'qwen2.5:3b' } });
  assert.equal(r.model, 'qwen2.5:3b');
  assert.equal(r.provider, 'local');
  assert.equal(r.scope, 'dispatch');
});

test('liveRouting: host identity + a local dispatch → dispatch surfaced as a chip (#2)', () => {
  const r = x.liveRouting({ model_full: 'claude-sonnet-4-6', tier: 'T2', ts: 't' }, { hostModel: 'claude-opus-4-8', lastExecution: { ok: true, model: 'qwen2.5:3b' } });
  assert.equal(r.model, 'claude-opus-4-8'); // the session host is the identity
  assert.ok(r.dispatch && r.dispatch.model === 'qwen2.5:3b'); // real local run shown as extra
});

test('liveRouting: nothing → null (never fabricates)', () => {
  assert.equal(x.liveRouting(null, {}), null);
  assert.equal(x.liveRouting({}, {}), null);
});

// ── Per-session scoping (cockpit considerations #3/#4 — "reflect the active session") ──
test('tokenLedger: sessionOnly skips the all-time aggregate (cheap per-session path)', () => {
  const led = x.tokenLedger('___no-such-session-id___', { sessionOnly: true });
  assert.deepEqual(led.all, { rows: [], turns: 0, lastModel: null }); // all-aggregate skipped
  assert.deepEqual(led.session.rows, []); // unknown session → empty, never throws
  assert.equal(typeof led.sessions, 'number');
});

test('recentSessions: each entry carries a full session id + 8-char short id', async () => {
  const rs = await x.recentSessions(3);
  assert.ok(Array.isArray(rs));
  for (const r of rs) {
    assert.equal(typeof r.fullId, 'string');
    assert.equal(r.id, r.fullId.slice(0, 8)); // id is the short prefix used in the picker
    assert.ok('working' in r && 'ageMs' in r); // honest activity heuristic fields present
    assert.equal(typeof r.working, 'boolean');
    assert.equal(typeof r.needsYou, 'boolean'); // "your turn" alert flag (turn_end / stalled)
    assert.ok(!(r.working && r.needsYou)); // mutually exclusive — never both at once
    assert.ok(r.name === null || typeof r.name === 'string'); // tab name (first prompt) or null — never fabricated
  }
});

test('activeSession: returns null or {id,ts} — never throws (auto-follow source)', () => {
  const a = x.activeSession();
  assert.ok(a === null || (a && typeof a.id === 'string' && a.id !== 'unknown'));
});

// ── Feature 1+2: prStage (pure) — derive the PR stage from gh JSON, honestly ──
test('prStage: MERGED state wins over everything', () => {
  assert.equal(x.prStage({ state: 'MERGED', isDraft: true, statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] }), 'merged ✓');
});
test('prStage: draft (open, not merged)', () => {
  assert.equal(x.prStage({ state: 'OPEN', isDraft: true, statusCheckRollup: [] }), 'draft');
});
test('prStage: a failed check → CI ❌ (failure beats pending/pass)', () => {
  const pr = { state: 'OPEN', isDraft: false, statusCheckRollup: [
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
  ] };
  assert.equal(x.prStage(pr), 'CI ❌');
});
test('prStage: a still-running check → CI ⏳', () => {
  const pr = { state: 'OPEN', isDraft: false, statusCheckRollup: [
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: null },
  ] };
  assert.equal(x.prStage(pr), 'CI ⏳');
});
test('prStage: COMPLETED check with null conclusion → CI ⏳ (not silently "open")', () => {
  // a cancelled/expired run can log status COMPLETED with no conclusion — ambiguous,
  // so we surface it as pending rather than reporting the PR as plain "open".
  const pr = { state: 'OPEN', isDraft: false, statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: null }] };
  assert.equal(x.prStage(pr), 'CI ⏳');
});
test('prStage: open + all checks passed → ready ✅', () => {
  const pr = { state: 'OPEN', isDraft: false, statusCheckRollup: [
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SKIPPED' },
  ] };
  assert.equal(x.prStage(pr), 'ready ✅');
});
test('prStage: open with no checks → open', () => {
  assert.equal(x.prStage({ state: 'OPEN', isDraft: false, statusCheckRollup: [] }), 'open');
  assert.equal(x.prStage({ state: 'OPEN', isDraft: false }), 'open'); // missing rollup tolerated
});
test('prStage: StatusContext (legacy) entries — FAILURE/PENDING/SUCCESS by state', () => {
  assert.equal(x.prStage({ state: 'OPEN', statusCheckRollup: [{ __typename: 'StatusContext', state: 'FAILURE' }] }), 'CI ❌');
  assert.equal(x.prStage({ state: 'OPEN', statusCheckRollup: [{ __typename: 'StatusContext', state: 'PENDING' }] }), 'CI ⏳');
  assert.equal(x.prStage({ state: 'OPEN', statusCheckRollup: [{ __typename: 'StatusContext', state: 'SUCCESS' }] }), 'ready ✅');
});
test('prStage: no PR / bad input → null (never fabricated)', () => {
  assert.equal(x.prStage(null), null);
  assert.equal(x.prStage(undefined), null);
  assert.equal(x.prStage('not an object'), null);
});

// ── Feature 1+2: prList always resolves to an array (graceful degradation) ──
test('prList: resolves to an array even with no gh / offline (never throws)', async () => {
  const r = await x.prList();
  assert.ok(Array.isArray(r)); // [] when gh absent/unauth/offline — honest empty, not a throw
});

// ── Feature 1+2: gitBranch null-safe contract ──
test('gitBranch: null/garbage cwd → null (never throws)', async () => {
  assert.equal(await x.gitBranch(null), null);
  assert.equal(await x.gitBranch(''), null);
  assert.equal(await x.gitBranch(123), null);
  assert.equal(await x.gitBranch('/no/such/dir/at/all/' + process.pid), null); // not a repo → null
});

// ── Feature 1+2: _sessionCwd reads cwd from a transcript head; null when absent ──
test('_sessionCwd: extracts top-level cwd from transcript head, null when absent', () => {
  const p = path.join(os.tmpdir(), 'mooter-cwd-test-' + process.pid + '.jsonl');
  const cwd = '/home/paulo/frugal-wave61'; // exact round-trip through JSON.stringify/parse
  fs.writeFileSync(p, JSON.stringify({ type: 'user', cwd, message: { role: 'user' } }) + '\n');
  assert.equal(x._sessionCwd(p), cwd);
  fs.writeFileSync(p, JSON.stringify({ type: 'user', message: { role: 'user' } }) + '\n'); // no cwd
  assert.equal(x._sessionCwd(p), null);
  fs.unlinkSync(p);
  assert.equal(x._sessionCwd('/nonexistent/' + process.pid + '.jsonl'), null); // missing file → null
});

// ── Feature 1+2: recentSessions now carries cwd + branch (null-safe) ──
test('recentSessions: async, each entry has cwd + branch (string|null, never fabricated)', async () => {
  const rs = await x.recentSessions(3);
  assert.ok(Array.isArray(rs));
  for (const r of rs) {
    assert.ok(r.cwd === null || typeof r.cwd === 'string'); // real cwd or null — never faked
    assert.ok(r.branch === null || typeof r.branch === 'string'); // real branch or null
    // prior contract still holds
    assert.equal(typeof r.fullId, 'string');
    assert.equal(typeof r.working, 'boolean');
    assert.equal(typeof r.needsYou, 'boolean');
  }
});
