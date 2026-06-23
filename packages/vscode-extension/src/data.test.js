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
  const cwd = '/home/paulo/mooter-wave61'; // exact round-trip through JSON.stringify/parse
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

// ── WCOCKPIT: mode-registry unit tests ──
const mr = require('./mode-registry');
const tmpSession = 'test-session-wcockpit-' + process.pid;

test('mode-registry: DEFAULT is {mode:"moo", model:null, auto:false}', () => {
  assert.equal(mr.DEFAULT.mode, 'moo');
  assert.equal(mr.DEFAULT.model, null);
  assert.equal(mr.DEFAULT.auto, false);
});

test('mode-registry: MODES has exactly lazy/moo/crazy', () => {
  assert.deepEqual(mr.MODES.sort(), ['crazy', 'lazy', 'moo']);
});

test('mode-registry: get unknown session → DEFAULT fields', () => {
  const e = mr.get('__no_such_session_ever__');
  assert.equal(e.mode, 'moo');
  assert.equal(e.model, null);
  assert.equal(e.auto, false);
});

test('mode-registry: set + get roundtrip (atomic write)', () => {
  mr.set(tmpSession, { mode: 'lazy', auto: true });
  const e = mr.get(tmpSession);
  assert.equal(e.mode, 'lazy');
  assert.equal(e.auto, true);
});

test('mode-registry: set ignores invalid mode, keeps previous', () => {
  mr.set(tmpSession, { mode: 'lazy' });
  mr.set(tmpSession, { mode: 'INVALID_MODE' });
  const e = mr.get(tmpSession);
  assert.equal(e.mode, 'lazy'); // invalid patch → mode unchanged
});

test('mode-registry: decorate fills mode/model/auto/project/brainTitle on row', () => {
  mr.set(tmpSession, { mode: 'crazy', model: 'claude-opus-4-6', auto: true, project: 'Mooter.ai', brainTitle: 'wave test' });
  const row = { fullId: tmpSession };
  mr.decorate(row);
  assert.equal(row.mode, 'crazy');
  assert.equal(row.model, 'claude-opus-4-6');
  assert.equal(row.auto, true);
  assert.equal(row.project, 'Mooter.ai');
  assert.equal(row.brainTitle, 'wave test');
});

test('mode-registry: byProject groups rows by project', () => {
  const rows = [
    { fullId: 'a', project: 'Alpha' },
    { fullId: 'b', project: 'Beta' },
    { fullId: 'c', project: 'Alpha' },
  ];
  const g = mr.byProject(rows);
  assert.equal(g['Alpha'].length, 2);
  assert.equal(g['Beta'].length, 1);
});

test('mode-registry: rows with null project → Unassigned', () => {
  const rows = [{ fullId: 'x', project: null }, { fullId: 'y' }];
  const g = mr.byProject(rows);
  assert.equal(g['Unassigned'].length, 2);
});

test('mode-registry: mode mutual exclusivity in states (never working+needsYou after decorate)', () => {
  // decorate doesn't touch working/needsYou — those come from recentSessions; confirmed independent
  const row = { fullId: tmpSession, working: true, needsYou: false };
  mr.decorate(row);
  assert.ok(!(row.working && row.needsYou)); // still mutually exclusive
});

// ── WCOCKPIT: cowork-waiting unit tests ──
const cw = require('./cowork-waiting');

test('cowork-waiting: decorate with null pending → waitingForCowork=false', () => {
  const row = { fullId: 'sess-1', working: true, needsYou: false };
  cw.decorate(row, null);
  assert.equal(row.waitingForCowork, false);
  assert.equal(row.coworkStatus, null);
  assert.equal(row.coworkTitle, null);
  // working/needsYou unchanged when no pending
  assert.equal(row.working, true);
  assert.equal(row.needsYou, false);
});

test('cowork-waiting: decorate with matching pending status=pending → waitingForCowork=true, working cleared', () => {
  const row = { fullId: 'sess-2', working: true, needsYou: false };
  cw.decorate(row, { session_id: 'sess-2', status: 'pending', note: 'push?', coworkTitle: null, ts: 't' });
  assert.equal(row.waitingForCowork, true);
  assert.equal(row.coworkStatus, 'pending');
  assert.equal(row.coworkTitle, null);
  assert.equal(row.working, false);    // mutually exclusive
  assert.equal(row.needsYou, false);   // mutually exclusive
});

test('cowork-waiting: decorate with cowork_working → coworkTitle set', () => {
  const row = { fullId: 'sess-3', working: false, needsYou: true };
  cw.decorate(row, { session_id: 'sess-3', status: 'cowork_working', coworkTitle: 'Wave WCOCKPIT brain', ts: 't' });
  assert.equal(row.waitingForCowork, true);
  assert.equal(row.coworkStatus, 'cowork_working');
  assert.equal(row.coworkTitle, 'Wave WCOCKPIT brain');
  assert.equal(row.needsYou, false);  // mutually exclusive
});

test('cowork-waiting: status=answered → waitingForCowork=false (answered clears)', () => {
  const row = { fullId: 'sess-4', working: false, needsYou: false };
  cw.decorate(row, { session_id: 'sess-4', status: 'answered', coworkTitle: 'brain', ts: 't' });
  assert.equal(row.waitingForCowork, false);
});

test('cowork-waiting: decorate with different session_id → no effect', () => {
  const row = { fullId: 'sess-5', working: true, needsYou: false };
  cw.decorate(row, { session_id: 'OTHER_SESSION', status: 'pending', ts: 't' });
  assert.equal(row.waitingForCowork, false);
  assert.equal(row.working, true); // untouched
});

test('cowork-waiting: badge returns null when not waiting', () => {
  const row = { waitingForCowork: false };
  assert.equal(cw.badge(row), null);
});

test('cowork-waiting: badge pending → "signalled Cowork…" span', () => {
  const row = { waitingForCowork: true, coworkStatus: 'pending', coworkTitle: null };
  const b = cw.badge(row);
  assert.ok(typeof b === 'string' && b.includes('signalled Cowork'));
});

test('cowork-waiting: badge cowork_working → "waiting for Cowork — <title>" (XSS-escaped)', () => {
  const row = { waitingForCowork: true, coworkStatus: 'cowork_working', coworkTitle: '<b>evil</b>' };
  const b = cw.badge(row);
  assert.ok(b.includes('waiting for Cowork'));
  assert.ok(!b.includes('<b>evil</b>')); // title must be escaped
  assert.ok(b.includes('&lt;b&gt;evil&lt;/b&gt;'));
});

test('cowork-waiting: states are mutually exclusive (waitingForCowork wins)', () => {
  const row = { fullId: 'sess-6', working: true, needsYou: true };
  cw.decorate(row, { session_id: 'sess-6', status: 'cowork_working', coworkTitle: 'brain', ts: 't' });
  // when waiting: both working and needsYou must be false
  assert.ok(row.waitingForCowork);
  assert.ok(!row.working);
  assert.ok(!row.needsYou);
});

// ── WCOCKPIT: recentSessions now carries WCOCKPIT fields ──
test('recentSessions: WCOCKPIT — each entry has mode/auto/waitingForCowork fields', async () => {
  const rs = await x.recentSessions(3);
  assert.ok(Array.isArray(rs));
  for (const r of rs) {
    // mode-registry fields (default or from file)
    assert.ok(['lazy', 'moo', 'crazy'].includes(r.mode), 'mode must be a valid WCOCKPIT mode');
    assert.equal(typeof r.auto, 'boolean');
    // cowork-waiting fields
    assert.equal(typeof r.waitingForCowork, 'boolean');
    // mutual exclusivity: waitingForCowork clears working+needsYou
    if (r.waitingForCowork) {
      assert.ok(!r.working, 'waitingForCowork and working must be mutually exclusive');
      assert.ok(!r.needsYou, 'waitingForCowork and needsYou must be mutually exclusive');
    }
  }
});

// ── WCOCKPIT-2: mode-registry — novos campos + worktrees + touchSync ──

test('mode-registry WCOCKPIT-2: DEFAULT has notion/obsidian integration fields', () => {
  assert.ok('notionPageId' in mr.DEFAULT, 'DEFAULT must have notionPageId');
  assert.ok('notionSyncedAt' in mr.DEFAULT, 'DEFAULT must have notionSyncedAt');
  assert.ok('obsidianPath' in mr.DEFAULT, 'DEFAULT must have obsidianPath');
  assert.ok('obsidianSyncedAt' in mr.DEFAULT, 'DEFAULT must have obsidianSyncedAt');
  assert.equal(mr.DEFAULT.notionPageId, null);
  assert.equal(mr.DEFAULT.notionSyncedAt, null);
});

test('mode-registry WCOCKPIT-2: decorate fills integration fields on row', () => {
  const sid = 'wcockpit2-test-' + process.pid;
  mr.set(sid, { notionPageId: 'notion-abc', notionSyncedAt: '2026-06-23T00:00:00Z', obsidianPath: '/vault/note.md' });
  const row = { fullId: sid };
  mr.decorate(row);
  assert.equal(row.notionPageId, 'notion-abc');
  assert.equal(row.notionSyncedAt, '2026-06-23T00:00:00Z');
  assert.equal(row.obsidianPath, '/vault/note.md');
  assert.equal(row.obsidianSyncedAt, null);
});

test('mode-registry WCOCKPIT-2: touchSync updates notionSyncedAt atomically', () => {
  const sid = 'wcockpit2-touch-' + process.pid;
  mr.set(sid, { mode: 'moo' }); // fresh entry
  const before = mr.get(sid).notionSyncedAt;
  assert.equal(before, null); // not set yet
  const ok = mr.touchSync(sid, 'notion');
  assert.equal(ok, true);
  const after = mr.get(sid).notionSyncedAt;
  assert.ok(typeof after === 'string' && after.includes('T'), 'notionSyncedAt must be ISO timestamp');
});

test('mode-registry WCOCKPIT-2: touchSync updates obsidianSyncedAt independently', () => {
  const sid = 'wcockpit2-touch-obs-' + process.pid;
  mr.set(sid, { notionSyncedAt: '2026-01-01T00:00:00Z' });
  mr.touchSync(sid, 'obsidian');
  const e = mr.get(sid);
  assert.equal(e.notionSyncedAt, '2026-01-01T00:00:00Z'); // unchanged
  assert.ok(typeof e.obsidianSyncedAt === 'string' && e.obsidianSyncedAt.includes('T'));
});

test('mode-registry WCOCKPIT-2: touchSync rejects invalid `which` → false', () => {
  const sid = 'wcockpit2-bad-' + process.pid;
  assert.equal(mr.touchSync(sid, 'slack'), false);
  assert.equal(mr.touchSync('', 'notion'), false);
  assert.equal(mr.touchSync(null, 'notion'), false);
});

test('mode-registry WCOCKPIT-2: worktrees() returns [] for null/invalid cwd (never throws)', () => {
  assert.deepEqual(mr.worktrees(null), []);
  assert.deepEqual(mr.worktrees(''), []);
  assert.deepEqual(mr.worktrees('/no/such/dir/at/all/' + process.pid), []);
});

test('mode-registry WCOCKPIT-2: worktrees() returns array for a real git repo', () => {
  // Use the project root (which is a git repo)
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const wts = mr.worktrees(projectRoot);
  assert.ok(Array.isArray(wts), 'worktrees() must return an array');
  // The main worktree should be present
  if (wts.length > 0) {
    assert.ok('path' in wts[0], 'each worktree must have a path');
    assert.ok('linked' in wts[0], 'each worktree must have a linked flag');
    assert.equal(wts[0].linked, false, 'first worktree is never linked (it is the main)');
  }
});

test('mode-registry WCOCKPIT-2: worktrees() result — linked worktrees have linked=true', () => {
  // Unit test the parsing logic by verifying the linked flag assignment
  const wts = mr.worktrees(path.resolve(__dirname, '..', '..', '..'));
  for (let i = 0; i < wts.length; i++) {
    assert.equal(wts[i].linked, i > 0, 'only index > 0 should be linked');
  }
});

// ── WCOCKPIT-2: recentSessions sort order + new fields ──

test('recentSessions WCOCKPIT-2: each entry has lastActiveTs (epoch ms, > 0)', async () => {
  const rs = await x.recentSessions(3);
  for (const r of rs) {
    assert.ok(typeof r.lastActiveTs === 'number' && r.lastActiveTs > 0,
      'lastActiveTs must be a positive epoch ms timestamp');
  }
});

test('recentSessions WCOCKPIT-2: each entry has worktree (string|null, never fabricated)', async () => {
  const rs = await x.recentSessions(3);
  for (const r of rs) {
    assert.ok(r.worktree === null || typeof r.worktree === 'string',
      'worktree must be string|null — never fabricated');
  }
});

test('recentSessions WCOCKPIT-2: each entry has notion/obsidian integration fields', async () => {
  const rs = await x.recentSessions(3);
  for (const r of rs) {
    assert.ok('notionPageId' in r, 'row must have notionPageId');
    assert.ok('notionSyncedAt' in r, 'row must have notionSyncedAt');
    assert.ok('obsidianPath' in r, 'row must have obsidianPath');
    assert.ok('obsidianSyncedAt' in r, 'row must have obsidianSyncedAt');
  }
});

test('recentSessions WCOCKPIT-2: sort order — needsYou sessions come first', async () => {
  const rs = await x.recentSessions(8);
  // Find index of first non-needsYou and check nothing after is needsYou
  let firstNonNeeds = rs.findIndex(r => !r.needsYou);
  if (firstNonNeeds >= 0) {
    for (let i = firstNonNeeds + 1; i < rs.length; i++) {
      assert.ok(!rs[i].needsYou, 'needsYou sessions must precede non-needsYou sessions (sorted)');
    }
  }
  // also: among non-needsYou sessions, most recent first
  const nonNeeds = rs.filter(r => !r.needsYou);
  for (let i = 1; i < nonNeeds.length; i++) {
    assert.ok((nonNeeds[i - 1].lastActiveTs || 0) >= (nonNeeds[i].lastActiveTs || 0),
      'non-needsYou sessions must be ordered newest first');
  }
});

// ── WCOCKPIT-3: HTML-level tests — renderRow renders all required UI elements ──
const rr = require('./row-renderer');

const SAMPLE_ROW = {
  fullId: 'abc12345-dead-beef-1234-567890abcdef',
  id: 'abc12345',
  name: 'test session',
  mode: 'lazy',
  model: 'claude-opus-4-6',
  auto: false,
  project: 'Mooter.ai',
  brainTitle: null,
  working: false,
  needsYou: false,
  waitingForCowork: false,
  coworkStatus: null,
  coworkTitle: null,
  ageMs: 120000,
  branch: null,
  cwd: null,
  pr: null,
  worktree: null,
  notionPageId: null,
  notionSyncedAt: null,
  obsidianPath: null,
  obsidianSyncedAt: null,
  lastActiveTs: Date.now(),
};

test('WCOCKPIT-3 renderRow: mode segmented contains 3 mode buttons (lazy/moo/crazy)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('data-mmode="lazy"'), 'must have lazy mode button');
  assert.ok(html.includes('data-mmode="moo"'), 'must have moo mode button');
  assert.ok(html.includes('data-mmode="crazy"'), 'must have crazy mode button');
});

test('WCOCKPIT-3 renderRow: active mode button has .on class (lazy)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {}); // mode=lazy
  // The lazy button should have class "smode on"
  assert.ok(html.includes('class="smode on"'), 'lazy mode button must have .on class');
  // The moo and crazy buttons should NOT have .on
  assert.ok(!html.includes('data-mmode="moo" ') || html.includes('class="smode"'), 'moo must not be on');
});

test('WCOCKPIT-3 renderRow: moo mode — moo button is active', () => {
  const row = Object.assign({}, SAMPLE_ROW, { mode: 'moo' });
  const html = rr.renderRow(row, {});
  // Check that the moo button specifically has .on
  assert.ok(html.includes('data-mmode="moo"'), 'moo button must be present');
  // The "on" class is applied to the active mode
  const mooIdx = html.indexOf('data-mmode="moo"');
  const classAttr = html.lastIndexOf('class="smode', mooIdx);
  assert.ok(classAttr >= 0 && html.slice(classAttr, mooIdx).includes('on'), 'moo button must have .on class when mode=moo');
});

test('WCOCKPIT-3 renderRow: lazy mode cow has .lazy animation class', () => {
  const html = rr.renderRow(SAMPLE_ROW, {}); // mode=lazy, not working
  assert.ok(html.includes('class="livecow lazy"'), 'lazy cow must have .lazy animation class');
});

test('WCOCKPIT-3 renderRow: crazy mode cow has .crazy animation class', () => {
  const row = Object.assign({}, SAMPLE_ROW, { mode: 'crazy' });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('class="livecow crazy"'), 'crazy cow must have .crazy animation class');
});

test('WCOCKPIT-3 renderRow: model dropdown present with data-msess', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('class="smodsel"'), 'model select must have .smodsel class');
  assert.ok(html.includes('data-msess="' + SAMPLE_ROW.fullId + '"'), 'model select must have data-msess');
  assert.ok(html.includes('<option value="claude-opus-4-6"'), 'Opus option must be present');
  assert.ok(html.includes('<option value="claude-sonnet-4-6"'), 'Sonnet option must be present');
  assert.ok(html.includes('<option value="claude-haiku-4-5"'), 'Haiku option must be present');
});

test('WCOCKPIT-3 renderRow: selected model option correct (Opus selected)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {}); // model=claude-opus-4-6
  assert.ok(html.includes('<option value="claude-opus-4-6" selected>'), 'Opus option must be selected');
  assert.ok(!html.includes('<option value="claude-sonnet-4-6" selected>'), 'Sonnet must not be selected');
  assert.ok(!html.includes('<option value="" selected>'), 'Auto must not be selected');
});

test('WCOCKPIT-3 renderRow: auto=false — auto button present, no .on class', () => {
  const html = rr.renderRow(SAMPLE_ROW, {}); // auto=false
  assert.ok(html.includes('class="sauto"'), 'auto button must be present without .on');
  assert.ok(!html.includes('class="sauto on"'), 'auto button must NOT have .on when auto=false');
  assert.ok(html.includes('data-mauto="false"'), 'data-mauto must be false');
});

test('WCOCKPIT-3 renderRow: auto=true — auto button has .on class', () => {
  const row = Object.assign({}, SAMPLE_ROW, { auto: true });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('class="sauto on"'), 'auto button must have .on when auto=true');
  assert.ok(html.includes('data-mauto="true"'), 'data-mauto must be true');
  assert.ok(html.includes('⚡ auto'), 'auto button must show ⚡ auto when on');
});

test('WCOCKPIT-3 renderRow: Notion SVG chip present (intchip + N SVG)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('class="intchip"'), 'Notion chip must have .intchip class');
  assert.ok(html.includes('font-family="serif">N</text>'), 'Notion SVG N logo must be present');
  assert.ok(html.includes('title="Notion · not synced"'), 'Notion chip must show not synced when null');
  // amber CTA when not synced
  assert.ok(html.includes('class="intcta">link</span>'), 'Notion must show amber link CTA when not synced');
});

test('WCOCKPIT-3 renderRow: Notion chip shows ago time when notionSyncedAt set', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const row = Object.assign({}, SAMPLE_ROW, { notionSyncedAt: twoHoursAgo, obsidianSyncedAt: twoHoursAgo });
  const html = rr.renderRow(row, { nowMs: Date.now() });
  assert.ok(html.includes('title="Notion · 2h ago"'), 'Notion chip must show sync time when set');
  assert.ok(!html.includes('title="Notion · not synced"'), 'Notion must not show not-synced when synced');
  // When both are synced, no amber link CTA should appear
  assert.ok(!html.includes('class="intcta">link</span>'), 'must not show amber link CTA when both integrations synced');
});

test('WCOCKPIT-3 renderRow: Obsidian SVG chip present (purple gem)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('fill="#7c3aed"'), 'Obsidian SVG must have purple polygon');
  assert.ok(html.includes('title="Obsidian · not synced"'), 'Obsidian chip must show not synced');
});

test('WCOCKPIT-3 renderRow: ↺ refresh button present with data-a=refreshIntegrations', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('data-a="refreshIntegrations"'), '↺ refresh button must have correct data-a');
  assert.ok(html.includes('↺'), 'refresh icon must be present');
  assert.ok(html.includes('data-x="' + SAMPLE_ROW.fullId + '"'), 'data-x must be the session fullId');
});

test('WCOCKPIT-3 renderRow: worktree chip present when worktree set', () => {
  const row = Object.assign({}, SAMPLE_ROW, { worktree: 'wave-WCOCKPIT' });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('class="wtchip"'), 'worktree chip must have .wtchip class');
  assert.ok(html.includes('⌥ wt:wave-WCOCKPIT'), 'worktree chip must show wt: name');
});

test('WCOCKPIT-3 renderRow: worktree chip absent when worktree null', () => {
  const html = rr.renderRow(SAMPLE_ROW, {}); // worktree=null
  assert.ok(!html.includes('class="wtchip"'), 'worktree chip must be absent when worktree=null');
});

test('WCOCKPIT-3 renderRow: brain title shown when brainTitle set', () => {
  const row = Object.assign({}, SAMPLE_ROW, { brainTitle: 'Wave WCOCKPIT-3 brain' });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('🧠 Wave WCOCKPIT-3 brain'), 'brain title must be present when set');
});

test('WCOCKPIT-3 renderRow: brain title absent when brainTitle null', () => {
  const html = rr.renderRow(SAMPLE_ROW, {}); // brainTitle=null
  assert.ok(!html.includes('🧠'), 'brain title must be absent when brainTitle=null');
});

test('WCOCKPIT-3 renderGroupHeader: uses project key not repo name', () => {
  const group = [
    { fullId: 'a', needsYou: false },
    { fullId: 'b', needsYou: true },
  ];
  const html = rr.renderGroupHeader('Mooter.ai', group);
  assert.ok(html.includes('🗂 Mooter.ai'), 'header must show the Cowork project name');
  assert.ok(!html.includes('FRUGAL'), 'header must NOT show repo name');
  assert.ok(html.includes('1 need you'), 'header must count needsYou sessions');
  assert.ok(html.includes('2'), 'header must show total session count');
});

test('WCOCKPIT-3 renderGroupHeader: Unassigned fallback renders without crash', () => {
  const html = rr.renderGroupHeader('Unassigned', [{ fullId: 'x', needsYou: false }]);
  assert.ok(html.includes('🗂 Unassigned'), 'Unassigned fallback must render');
  assert.ok(!html.includes('need you'), 'no needsYou → no count shown');
});

test('WCOCKPIT-3 renderRow: XSS-escaped project and session id (esc guard)', () => {
  const row = Object.assign({}, SAMPLE_ROW, {
    fullId: 'abc123',
    id: 'abc123',
    name: '<b>evil</b>',
    worktree: '<script>alert(1)</script>',
    brainTitle: '<img onerror=x>',
  });
  const html = rr.renderRow(row, {});
  assert.ok(!html.includes('<b>evil</b>'), 'session name must be HTML-escaped');
  assert.ok(!html.includes('<script>'), 'worktree must be HTML-escaped');
  assert.ok(!html.includes('<img'), 'brainTitle must be HTML-escaped');
});

test('WCOCKPIT-3 esc helper: escapes all 4 HTML special chars', () => {
  assert.equal(rr.esc('<script>&"test"</script>'), '&lt;script&gt;&amp;&quot;test&quot;&lt;/script&gt;');
  assert.equal(rr.esc(null), '');
  assert.equal(rr.esc(undefined), '');
  assert.equal(rr.esc(0), '0');
});

test('WCOCKPIT-3 renderRow: sseg toolbar has aria-label for accessibility', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('role="toolbar"'), 'mode segmented must have role=toolbar');
  assert.ok(html.includes('aria-label="session mode"'), 'mode segmented must have aria-label');
});

// ── WCOCKPIT-4: gitStage unit tests ──

test('WCOCKPIT-4 gitStage: null/empty/non-string cwd → null (never throws)', async () => {
  // gitStage is now async (WCOCKPIT-5 fix: was spawnSync, now uses execTool)
  assert.equal(await x.gitStage(null), null);
  assert.equal(await x.gitStage(''), null);
  assert.equal(await x.gitStage(123), null);
});

test('WCOCKPIT-4 gitStage: non-git dir → null (never throws)', async () => {
  const nonGit = path.join(os.tmpdir(), 'no-git-wcockpit4-' + process.pid);
  assert.equal(await x.gitStage(nonGit), null); // not a repo, git returns non-zero → null
});

test('WCOCKPIT-4 gitStage: real git repo → valid state object', async () => {
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const gs = await x.gitStage(projectRoot);
  assert.ok(gs !== null, 'gitStage must return an object for a real git repo');
  assert.ok(['clean', 'uncommitted', 'staged', 'ahead'].includes(gs.state), 'state must be valid');
  assert.equal(typeof gs.dirty,  'number', 'dirty must be a number');
  assert.equal(typeof gs.staged, 'number', 'staged must be a number');
  assert.equal(typeof gs.ahead,  'number', 'ahead must be a number');
  assert.equal(typeof gs.behind, 'number', 'behind must be a number');
  assert.ok(gs.dirty >= 0 && gs.staged >= 0 && gs.ahead >= 0 && gs.behind >= 0,
    'all counts must be non-negative');
});

test('WCOCKPIT-4 gitStage: recentSessions entries have gitStage (object|null, never undefined)', async () => {
  const rs = await x.recentSessions(3);
  for (const r of rs) {
    assert.ok('gitStage' in r, 'row must have gitStage field');
    assert.ok(r.gitStage === null || (typeof r.gitStage === 'object' && r.gitStage !== null),
      'gitStage must be object or null — never undefined or string');
    if (r.gitStage !== null) {
      assert.ok(['clean', 'uncommitted', 'staged', 'ahead'].includes(r.gitStage.state),
        'gitStage.state must be valid');
    }
  }
});

// ── WCOCKPIT-4: renderRow HTML-level tests — git stage chip ──

test('WCOCKPIT-4 renderRow: clean state shows ✓ clean chip, no safety tip', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 0 } });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('class="gstage clean"'), 'clean chip must have .gstage.clean');
  assert.ok(html.includes('✓ clean'), 'clean chip must show ✓ clean text');
  assert.ok(!html.includes('não fechar'), 'clean state must NOT show safety tip');
  assert.ok(html.includes('class="sgit"'), 'sgit container must be present');
});

test('WCOCKPIT-4 renderRow: uncommitted state shows ● N uncommitted chip with safety tip', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'uncommitted', dirty: 3, staged: 0, ahead: 0, behind: 0 } });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('class="gstage dirty"'), 'uncommitted chip must have .gstage.dirty');
  assert.ok(html.includes('● 3 uncommitted'), 'uncommitted chip must show dirty count');
  assert.ok(html.includes('não fechar'), 'dirty state must show safety tip');
  assert.ok(html.includes('class="gtip"'), 'gtip class must be present');
});

test('WCOCKPIT-4 renderRow: staged state shows ◐ staged chip (no safety tip)', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'staged', dirty: 0, staged: 2, ahead: 0, behind: 0 } });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('class="gstage staged"'), 'staged chip must have .gstage.staged');
  assert.ok(html.includes('◐ staged'), 'staged chip must show ◐ staged');
  assert.ok(!html.includes('não fechar'), 'staged-only must NOT show safety tip');
});

test('WCOCKPIT-4 renderRow: ahead state shows ↑N to push chip with safety tip', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'ahead', dirty: 0, staged: 0, ahead: 2, behind: 0 } });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('class="gstage ahead"'), 'ahead chip must have .gstage.ahead');
  assert.ok(html.includes('↑2 to push'), 'ahead chip must show ahead count');
  assert.ok(html.includes('não fechar'), 'ahead state must show safety tip');
});

test('WCOCKPIT-4 renderRow: null gitStage → no git stage chip rendered', () => {
  // SAMPLE_ROW has no gitStage field → no chip
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(!html.includes('class="sgit"'), 'no sgit div when gitStage is absent/null');
  assert.ok(!html.includes('class="gstage'), 'no gstage chip when gitStage is absent/null');
});

test('WCOCKPIT-4 renderRow: worktree row has border-left-color accent (no left radius)', () => {
  const row = Object.assign({}, SAMPLE_ROW, { worktree: 'wave-WCOCKPIT' });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('border-left-color:'), 'worktree row must have border-left-color inline style');
  assert.ok(html.includes('border-top-left-radius:0'), 'worktree row must flatten top-left radius');
  assert.ok(html.includes('border-bottom-left-radius:0'), 'worktree row must flatten bottom-left radius');
});

test('WCOCKPIT-4 renderRow: no worktree → no border-left-color accent style', () => {
  // SAMPLE_ROW has worktree=null
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(!html.includes('border-left-color:'), 'no worktree → no border accent style');
});

test('WCOCKPIT-4 renderRow: two sessions with same worktree get same accent color (deterministic)', () => {
  const row1 = Object.assign({}, SAMPLE_ROW, { fullId: 'sess-a', worktree: 'my-feature' });
  const row2 = Object.assign({}, SAMPLE_ROW, { fullId: 'sess-b', worktree: 'my-feature' });
  const h1 = rr.renderRow(row1, {});
  const h2 = rr.renderRow(row2, {});
  const extractAccent = html => { const m = html.match(/border-left-color:([^;'"]+)/); return m ? m[1] : null; };
  assert.equal(extractAccent(h1), extractAccent(h2), 'same worktree name must produce same accent color');
});

test('WCOCKPIT-4 renderRow: two sessions with different worktrees may differ in accent (hash spread)', () => {
  const row1 = Object.assign({}, SAMPLE_ROW, { fullId: 'sess-c', worktree: 'alpha' });
  const row2 = Object.assign({}, SAMPLE_ROW, { fullId: 'sess-d', worktree: 'beta-long-name-123' });
  const h1 = rr.renderRow(row1, {});
  const h2 = rr.renderRow(row2, {});
  // Both must have a style — content may differ (hash-dependent)
  assert.ok(h1.includes('border-left-color:'), 'alpha worktree must have accent');
  assert.ok(h2.includes('border-left-color:'), 'beta worktree must have accent');
  // (not asserting they differ — hash collision theoretically possible, just verifying both render)
});

// ── WCOCKPIT-5: EXECUTION tests — fn.toString()+new Function() path (exact webview simulation) ──
// These tests replicate the actual failure mode: renderRow is serialised via fn.toString() and
// executed in the webview as a bare function. If it references any symbol outside its body, or
// throws on any real row shape, the webview message handler crashes and the cockpit goes blank.

// Webview-level helpers (mirrors of extension.js inline definitions — used only in these tests)
function _wv_esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function _wv_agoFmt(ms){ const t=Math.round((+ms||0)/1000); if(t<60)return t+'s'; const mi=Math.round(t/60); if(mi<60)return mi+'m'; const h=Math.round(mi/60); return h<24?h+'h':Math.round(h/24)+'d'; }
const _wv_MLABEL={'claude-opus-4-8':'Opus 4.8','claude-opus-4-7':'Opus 4.7','claude-opus-4-6':'Opus 4.6','claude-sonnet-4-6':'Sonnet 4.6','claude-haiku-4-5':'Haiku 4.5','claude-fable-5':'Fable 5'};
function _wv_modelLabel(m){ return _wv_MLABEL[String(m||'').toLowerCase()]||String(m||'').replace(/^claude-/,'').replace(/-/g,' '); }
function _wv_stageColor(st){ const x=String(st||''); if(x.indexOf('merged')===0)return 'var(--g)'; if(x.indexOf('ready')===0)return 'var(--g)'; if(x.indexOf('❌')>=0)return 'var(--t3)'; return 'var(--vscode-descriptionForeground)'; }
function _wv_famEmoji(model){ const x=String(model||'').toLowerCase(); if(/claude|opus|sonnet|haiku/.test(x))return '✨'; return '🤖'; }

// Build the renderRow function exactly as the webview does: fn.toString() + new Function()
const _wvRenderRow = new Function('esc','agoFmt','famEmoji','modelLabel','stageColor',
  'return (' + rr.renderRow.toString() + ')')(
  _wv_esc, _wv_agoFmt, _wv_famEmoji, _wv_modelLabel, _wv_stageColor);
const _wvRenderGroupHeader = new Function('esc',
  'return (' + rr.renderGroupHeader.toString() + ')')(
  _wv_esc);

test('WCOCKPIT-5 webview-sim: renderRow.toString() has no template literals (safe in outer getHtml template)', () => {
  const src = rr.renderRow.toString();
  assert.ok(!src.includes('`'), 'no backticks in renderRow source — would break getHtml() template literal');
  assert.ok(!src.includes('${'), 'no ${} in renderRow source — would break getHtml() template literal');
});

test('WCOCKPIT-5 webview-sim: renderRow parses and executes via new Function() (exact webview path)', () => {
  // If this throws, the webview script would fail to parse and the panel would be blank
  assert.ok(typeof _wvRenderRow === 'function', 'renderRow must be a function after new Function() deserialization');
  assert.ok(typeof _wvRenderGroupHeader === 'function', 'renderGroupHeader must be a function after deserialization');
});

test('WCOCKPIT-5 webview-sim: renderRow (webview fn) — no gitStage → no throw, non-empty HTML', () => {
  const html = _wvRenderRow(SAMPLE_ROW, {});
  assert.ok(typeof html === 'string' && html.length > 100, 'must return non-empty HTML string');
  assert.ok(html.includes('class="srow"') || html.includes('class="srow '), 'must contain .srow element');
});

test('WCOCKPIT-5 webview-sim: renderRow (webview fn) — gitStage=null → no throw, no chip', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: null });
  const html = _wvRenderRow(row, {});
  assert.ok(typeof html === 'string' && html.length > 100, 'null gitStage must render normally');
  assert.ok(!html.includes('class="sgit"'), 'null gitStage must not render stage chip');
});

test('WCOCKPIT-5 webview-sim: renderRow (webview fn) — gitStage uncommitted → no throw, chip rendered', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'uncommitted', dirty: 5, staged: 0, ahead: 0, behind: 0 } });
  const html = _wvRenderRow(row, {});
  assert.ok(typeof html === 'string' && html.length > 100, 'gitStage uncommitted must render');
  assert.ok(html.includes('● 5 uncommitted'), 'uncommitted chip must appear in webview-path HTML');
  assert.ok(html.includes('não fechar'), 'safety tip must appear');
});

test('WCOCKPIT-5 webview-sim: renderRow (webview fn) — gitStage staged → chip, no safety tip', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'staged', dirty: 0, staged: 2, ahead: 0, behind: 0 } });
  const html = _wvRenderRow(row, {});
  assert.ok(html.includes('◐ staged'), 'staged chip must appear');
  assert.ok(!html.includes('não fechar'), 'staged-only must not show safety tip');
});

test('WCOCKPIT-5 webview-sim: renderRow (webview fn) — gitStage ahead → chip + safety tip', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'ahead', dirty: 0, staged: 0, ahead: 3, behind: 0 } });
  const html = _wvRenderRow(row, {});
  assert.ok(html.includes('↑3 to push'), 'ahead chip must appear');
  assert.ok(html.includes('não fechar'), 'safety tip must appear for ahead');
});

test('WCOCKPIT-5 webview-sim: renderRow (webview fn) — worktree accent applied without throw', () => {
  const row = Object.assign({}, SAMPLE_ROW, { worktree: 'wave-WCOCKPIT', gitStage: { state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 0 } });
  const html = _wvRenderRow(row, {});
  assert.ok(typeof html === 'string' && html.length > 100, 'worktree+gitStage row must render');
  assert.ok(html.includes('border-left-color:'), 'worktree accent must be present');
  assert.ok(html.includes('✓ clean'), 'clean chip must be present');
});

test('WCOCKPIT-5 webview-sim: renderRow (webview fn) — brain title with gitStage → no throw', () => {
  const row = Object.assign({}, SAMPLE_ROW, { brainTitle: 'Wave WCOCKPIT-5 brain', gitStage: { state: 'uncommitted', dirty: 2, staged: 0, ahead: 0, behind: 0 } });
  const html = _wvRenderRow(row, {});
  assert.ok(html.includes('🧠 Wave WCOCKPIT-5 brain'), 'brain title must render');
  assert.ok(html.includes('● 2 uncommitted'), 'git stage chip must also render');
});

test('WCOCKPIT-5 webview-sim: renderRow (webview fn) — XSS guard still enforced after serialisation', () => {
  const row = Object.assign({}, SAMPLE_ROW, { name: '<b>evil</b>', worktree: '<script>x</script>' });
  const html = _wvRenderRow(row, {});
  assert.ok(!html.includes('<b>evil</b>'), 'name must be escaped in webview path');
  assert.ok(!html.includes('<script>'), 'worktree must be escaped in webview path');
});

test('WCOCKPIT-5 webview-sim: renderGroupHeader (webview fn) — no throw, non-empty HTML', () => {
  const group = [Object.assign({}, SAMPLE_ROW), Object.assign({}, SAMPLE_ROW, { needsYou: true })];
  const html = _wvRenderGroupHeader('Mooter.ai', group);
  assert.ok(typeof html === 'string' && html.length > 20, 'renderGroupHeader must return HTML');
  assert.ok(html.includes('Mooter.ai'), 'group key must appear');
  assert.ok(html.includes('1 need you'), 'needsYou count must appear');
});

test('WCOCKPIT-5 webview-sim: renderRow (webview fn) — gitStage clean, no safety tip (regression)', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 0 } });
  const html = _wvRenderRow(row, {});
  assert.ok(html.includes('✓ clean'), 'clean chip must be present');
  assert.ok(!html.includes('não fechar'), 'clean must NOT show safety tip (regression guard)');
});

test('WCOCKPIT-5 gitStage: async (returns Promise, not a sync value)', () => {
  const result = x.gitStage(null);
  assert.ok(result && typeof result.then === 'function', 'gitStage must return a Promise (async after WCOCKPIT-5 fix)');
  return result; // awaited by test runner
});

// ── WCOCKPIT-6: progressive disclosure + group rollup dedup ──
test('WCOCKPIT-6 renderRow: per-session controls wrapped in .sdrawer (hidden until hover/selected)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('class="sdrawer"'), 'controls must be wrapped in .sdrawer');
  const di = html.indexOf('class="sdrawer"');
  assert.ok(html.indexOf('class="sseg"') > di, 'mode segmented must be inside the drawer');
  assert.ok(html.indexOf('class="smodsel"') > di, 'model select must be inside the drawer');
  assert.ok(html.indexOf('class="smeta"') > di, 'integration meta must be inside the drawer');
});

test('WCOCKPIT-6 renderRow: git chip suppressed when groupGitKey matches (dedup)', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'uncommitted', dirty: 162, ahead: 0, behind: 0 } });
  const solo = rr.renderRow(row, {});
  assert.ok(solo.includes('162 uncommitted'), 'standalone card still shows its own git chip');
  const deduped = rr.renderRow(row, { groupGitKey: 'uncommitted:162:0' });
  assert.ok(!deduped.includes('162 uncommitted'), 'card must NOT repeat git chip already shown by group header');
});

test('WCOCKPIT-6 renderRow: git chip kept when groupGitKey differs', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'uncommitted', dirty: 3, ahead: 0, behind: 0 } });
  const html = rr.renderRow(row, { groupGitKey: 'uncommitted:162:0' });
  assert.ok(html.includes('3 uncommitted'), 'a session that differs from its group must still show its own git chip');
});

test('WCOCKPIT-6 renderRow: branch chip suppressed when groupBranch matches', () => {
  const row = Object.assign({}, SAMPLE_ROW, { branch: 'wave-WCOCKPIT', cwd: '/x' });
  const solo = rr.renderRow(row, {});
  assert.ok(solo.includes('wave-WCOCKPIT'), 'standalone card shows branch');
  const deduped = rr.renderRow(row, { groupBranch: 'wave-WCOCKPIT' });
  assert.ok(!deduped.includes('class="scmbr"'), 'branch chip removed when same as group');
  assert.ok(!deduped.includes('no PR'), 'no "no PR" filler when branch deduped and no PR');
});

test('WCOCKPIT-6 renderGroupHeader: rolls up branch + uncommitted git once for the project', () => {
  const group = [
    { fullId: 'a', needsYou: false, branch: 'wave-WCOCKPIT', gitStage: { state: 'uncommitted', dirty: 162, ahead: 0 } },
    { fullId: 'b', needsYou: false, branch: 'wave-WCOCKPIT', gitStage: { state: 'uncommitted', dirty: 162, ahead: 0 } },
  ];
  const html = rr.renderGroupHeader('FRUGAL', group);
  assert.ok(html.includes('wave-WCOCKPIT'), 'group header shows the shared branch');
  assert.ok(html.includes('162 uncommitted'), 'group header shows the rolled-up git stage');
  assert.ok(html.includes('class="ghd"'), 'group header uses .ghd container');
});
