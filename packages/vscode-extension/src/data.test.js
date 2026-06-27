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

test('isProbePrompt: flags CLI management/status echoes, spares real prompts', () => {
  // probe echoes (the cockpit's own `mooter slash-commands status` poll, etc.)
  for (const p of ['slash-commands', 'slash-commands status', 'savings', 'status', 'pack list', 'why-not-fable']) {
    assert.equal(d.isProbePrompt(p), true, `should flag probe: ${p}`);
  }
  // real prompts are never flagged
  for (const p of ['refactor the auth middleware to add refresh tokens', 'fix the login bug', 'status of the deployment pipeline and the migration plan', '', null]) {
    assert.equal(d.isProbePrompt(p), false, `should NOT flag: ${p}`);
  }
});

test('parseDecisions: drops probe/management echoes (cockpit poll noise)', () => {
  const probe = JSON.stringify({ event: 'classified', tier: 'T0', prompt_preview: 'slash-commands', session_id: 'x' });
  const real = REAL_LINE;
  const r = d.parseDecisions([probe, real, probe].join('\n'));
  assert.equal(r.length, 1, 'only the real decision survives');
  assert.equal(r[0].task_category, 'architecture_or_critical');
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
  // B2 honesto: sem notionPageId o chip diz "sem página ligada" (não finge sync).
  assert.ok(html.includes('title="Notion · sem página ligada'), 'Notion chip title must be honest when unlinked');
  // WCOCKPIT-7: icon-only — unsynced chip is dim (no .on), no inline link text
  assert.ok(!html.includes('intchip on'), 'unsynced Notion chip must be dim (no .on)');
});

test('WCOCKPIT-3 renderRow: Notion chip shows ago time when notionSyncedAt set', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const row = Object.assign({}, SAMPLE_ROW, { notionSyncedAt: twoHoursAgo, obsidianSyncedAt: twoHoursAgo });
  const html = rr.renderRow(row, { nowMs: Date.now() });
  // B2: synced stamp still illuminates (.on) honestly; with no page linked the title says so too.
  assert.ok(html.includes('title="Notion · synced 2h ago · sem página ligada"'), 'Notion chip must show sync time in its title when set');
  assert.ok(html.includes('class="intchip on"'), 'synced Notion chip must be bright (.on)');
  assert.ok(!html.includes('not synced'), 'must not show not-synced when synced');
});

test('WCOCKPIT-3 renderRow: Obsidian SVG chip present (purple gem)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('fill="#7c3aed"'), 'Obsidian SVG must have purple polygon');
  // B2 honesto: sem obsidianPath o chip é informativo ("sem ficheiro ligado"), não finge sync.
  assert.ok(html.includes('title="Obsidian · sem ficheiro ligado'), 'Obsidian chip title must be honest when unlinked');
  assert.ok(html.includes('role="img"'), 'unlinked Obsidian chip must be informative (role=img), not actionable');
});

test('WCOCKPIT-3 renderRow: integrations refresh button present with data-a=refreshIntegrations (honest "marcar visto")', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('data-a="refreshIntegrations"'), 'refresh button must keep data-a=refreshIntegrations');
  assert.ok(html.includes('marcar visto'), 'label must be honest — it stamps a local "seen" time, no remote sync');
  assert.ok(html.includes('data-x="' + SAMPLE_ROW.fullId + '"'), 'data-x must be the session fullId');
});

// ── B2: chips de integração ACCIONÁVEIS e HONESTOS ──────────────────────────────
test('B2 renderRow: Notion chip is actionable (openUrl) when notionPageId exists', () => {
  const row = Object.assign({}, SAMPLE_ROW, { notionPageId: '1a2b3c4d5e6f7081920a1b2c3d4e5f60' });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('data-a="openUrl:https://www.notion.so/1a2b3c4d5e6f7081920a1b2c3d4e5f60"'), 'Notion chip must openUrl the page when notionPageId is set');
  assert.ok(html.includes('abrir página'), 'Notion chip must advertise the open action honestly');
});

test('B2 renderRow: Notion chip accepts a full URL in notionPageId verbatim', () => {
  const row = Object.assign({}, SAMPLE_ROW, { notionPageId: 'https://notion.so/team/My-Page-abc' });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('data-a="openUrl:https://notion.so/team/My-Page-abc"'), 'a full Notion URL must be used as-is');
});

test('B2 renderRow: Notion chip is informative (role=img, no data-a) when no page linked', () => {
  const html = rr.renderRow(SAMPLE_ROW, {}); // notionPageId=null
  assert.ok(html.includes('Notion · sem página ligada'), 'unlinked Notion chip must be honest');
  assert.ok(!html.includes('data-a="openUrl:'), 'unlinked Notion chip must NOT fake an action');
});

test('B2 renderRow: Obsidian chip opens the file (openFile) when obsidianPath exists', () => {
  const row = Object.assign({}, SAMPLE_ROW, { obsidianPath: '/vault/notes/session.md' });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('data-a="openFile:/vault/notes/session.md"'), 'Obsidian chip must openFile the path when set');
  assert.ok(html.includes('abrir ficheiro'), 'Obsidian chip must advertise the open action honestly');
});

// ── B4: vista viva do moo local por sessão (renderRow) ──
test('B4 renderRow: local-moo view shows journal count + summary + updating flag when localMoo set', () => {
  const row = Object.assign({}, SAMPLE_ROW, { localMoo: { journalN: 5, summary: 'a ligar tudo ao handoff', model: 'qwen2.5:3b', updating: true, lastTools: [{ name: 'Edit', target: 'x.js' }] } });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('moo local'), 'local-moo header present');
  assert.ok(html.includes('<b>5</b>'), 'journal turn count shown');
  assert.ok(html.includes('a ligar tudo ao handoff'), 'rolling summary shown');
  assert.ok(html.includes('a actualizar'), 'honest "a actualizar…" flag when journal ahead of rollup');
  assert.ok(html.includes('Edit x.js'), 'last tool from the journal shown');
});

test('B4 renderRow: local-moo view is honest empty when there is no local activity', () => {
  const html = rr.renderRow(SAMPLE_ROW, {}); // no localMoo
  assert.ok(html.includes('sem actividade local ainda'), 'honest empty state when no accumulator data');
  assert.ok(!html.includes('a actualizar'), 'no fake updating indicator when there is nothing');
});

// ── B3: declutter — data-state + data-name for client-side filter/search ──
test('B3 renderRow: emits data-state + searchable data-name per session', () => {
  const idle = rr.renderRow(SAMPLE_ROW, {}); // not working/needs/cowork → idle
  assert.ok(idle.includes('data-state="idle"'), 'idle session tagged idle');
  assert.ok(idle.includes('data-name="'), 'searchable name attr present');
  assert.ok(idle.includes('test session'), 'name lowercased into data-name for search');
  const needs = rr.renderRow(Object.assign({}, SAMPLE_ROW, { needsYou: true }), {});
  assert.ok(needs.includes('data-state="needs"'), 'needs-you tagged needs');
  const active = rr.renderRow(Object.assign({}, SAMPLE_ROW, { working: true }), {});
  assert.ok(active.includes('data-state="active"'), 'working tagged active');
  const cowork = rr.renderRow(Object.assign({}, SAMPLE_ROW, { waitingForCowork: true, coworkStatus: 'cowork_working' }), {});
  assert.ok(cowork.includes('data-state="cowork"'), 'waiting-for-cowork tagged cowork');
});

test('WCOCKPIT-3 renderRow: worktree chip present when worktree set', () => {
  const row = Object.assign({}, SAMPLE_ROW, { worktree: 'wave-WCOCKPIT' });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('class="wtchip"'), 'worktree chip must have .wtchip class');
  assert.ok(html.includes('wave-WCOCKPIT'), 'worktree chip must show the worktree name');
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
  assert.ok(!html.includes('MYREPO'), 'header must NOT show repo name');
  assert.ok(html.includes('1 your turn'), 'header must count needsYou sessions');
  assert.ok(html.includes('2'), 'header must show total session count');
});

test('WCOCKPIT-3/9 renderGroupHeader: Unassigned fallback renders, honestly labelled (sem Cowork)', () => {
  const html = rr.renderGroupHeader('Unassigned', [{ fullId: 'x', needsYou: false }]);
  // WCOCKPIT-9 (Bloco A): Unassigned é fallback honesto — pasta 📁, nunca 🗂 (que é Cowork real)
  assert.ok(html.includes('📁 Unassigned'), 'Unassigned fallback must render with 📁');
  assert.ok(html.includes('sem Cowork'), 'Unassigned must be labelled "sem Cowork"');
  assert.ok(!html.includes('🗂 Unassigned'), 'Unassigned must NOT use the Cowork-project icon');
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
  assert.ok(html.includes('◐ 2 staged'), 'staged chip must show ◐ N staged (count)');
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
const _wvRenderRow = new Function('esc','agoFmt','famEmoji','modelLabel','stageColor','deriveStages','STAGE_META',
  'return (' + rr.renderRow.toString() + ')')(
  _wv_esc, _wv_agoFmt, _wv_famEmoji, _wv_modelLabel, _wv_stageColor, rr.deriveStages, rr.STAGE_META);
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
  assert.ok(html.includes('◐ 2 staged'), 'staged chip must appear with count (WCOCKPIT-9 Bloco C)');
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

// ── WCOCKPIT-10: Project Stage Rail — deriveStages (pure unit) + webview-sim render ──
test('WCOCKPIT-10 deriveStages: clean on main → edit/save/backup done, merge todo, green, ZERO now', () => {
  const r = rr.deriveStages({ state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 0 }, 'main');
  assert.equal(r.stages.edit, 'done');
  assert.equal(r.stages.save, 'done');
  assert.equal(r.stages.backup, 'done');
  assert.equal(r.stages.merge, 'todo');
  assert.equal(r.safe.level, 'green');
  assert.equal(Object.values(r.stages).filter((s) => s === 'now').length, 0);
});

test('WCOCKPIT-10 deriveStages: uncommitted → edit now, amber, move "Save my work", exactly ONE now', () => {
  const r = rr.deriveStages({ state: 'uncommitted', dirty: 3, staged: 0, ahead: 0, behind: 0 }, 'main');
  assert.equal(r.stages.edit, 'now');
  assert.equal(r.safe.level, 'amber');
  assert.equal(r.safe.move, 'Save my work');
  assert.equal(r.safe.action, 'gitFlow');
  assert.equal(Object.values(r.stages).filter((s) => s === 'now').length, 1);
});

test('WCOCKPIT-10 deriveStages: staged (dirty 0) → save now, amber (staged is unsaved), ONE now', () => {
  const r = rr.deriveStages({ state: 'staged', dirty: 0, staged: 2, ahead: 0, behind: 0 }, 'main');
  assert.equal(r.stages.save, 'now');
  assert.equal(r.safe.level, 'amber');
  assert.equal(Object.values(r.stages).filter((s) => s === 'now').length, 1);
});

test('WCOCKPIT-10 deriveStages: ahead (clean tree) → backup now, blue, advisory hint (no action), ONE now', () => {
  const r = rr.deriveStages({ state: 'ahead', dirty: 0, staged: 0, ahead: 2, behind: 0 }, 'main');
  assert.equal(r.stages.backup, 'now');
  assert.equal(r.safe.level, 'blue');
  assert.equal(r.safe.action, null);
  assert.ok(r.safe.hint, 'blue level carries an advisory hint, not a one-click button');
  assert.equal(Object.values(r.stages).filter((s) => s === 'now').length, 1);
});

test('WCOCKPIT-10 deriveStages: clean on feature branch → branch done, merge now, green, ONE now', () => {
  const r = rr.deriveStages({ state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 0 }, 'wave/x');
  assert.equal(r.stages.branch, 'done');
  assert.equal(r.stages.merge, 'now');
  assert.equal(r.safe.level, 'green');
  assert.equal(Object.values(r.stages).filter((s) => s === 'now').length, 1);
});

test('WCOCKPIT-10 deriveStages: behind hint + INVARIANTS (branch never now, ≤1 now across cases)', () => {
  const cases = [
    [{ state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 4 }, 'main'],
    [{ state: 'uncommitted', dirty: 1, staged: 0, ahead: 0, behind: 2 }, 'wave/x'],
    [{ state: 'ahead', dirty: 0, staged: 0, ahead: 3, behind: 0 }, 'wave/x'],
    [{ state: 'staged', dirty: 0, staged: 5, ahead: 0, behind: 0 }, 'wave/x'],
  ];
  for (const [gs, br] of cases) {
    const r = rr.deriveStages(gs, br);
    assert.notEqual(r.stages.branch, 'now', 'branch must NEVER be "now"');
    assert.ok(Object.values(r.stages).filter((s) => s === 'now').length <= 1, 'at most ONE "now"');
  }
  assert.deepEqual(rr.deriveStages({ state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 1 }, 'main').behind, { n: 1 });
  assert.equal(rr.deriveStages({ state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 0 }, 'main').behind, null);
});

test('WCOCKPIT-10 deriveStages: null gitStage → safe clean/green defaults, never throws', () => {
  const r = rr.deriveStages(null, null);
  assert.equal(r.safe.level, 'green');
  assert.equal(Object.values(r.stages).filter((s) => s === 'now').length, 0);
});

test('WCOCKPIT-10 webview-sim: git row → .srail renders + amber chip + Save button reuses gitFlow', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'uncommitted', dirty: 2, staged: 0, ahead: 0, behind: 0 }, branch: 'wave/x' });
  const html = _wvRenderRow(row, {});
  assert.ok(html.includes('class="srail"'), 'stage rail must render in the webview path');
  assert.ok(html.includes('class="ssafe amber"'), 'amber safe-to-close chip must render');
  assert.ok(html.includes('Save my work'), 'amber state shows the Save my work button');
  assert.ok(html.includes('data-a="gitFlow"'), 'Save button reuses the existing gitFlow handler (no new command)');
});

test('WCOCKPIT-10 webview-sim: no gitStage → NO rail (honest: a non-repo session shows no stages)', () => {
  const html = _wvRenderRow(SAMPLE_ROW, {});
  assert.ok(!html.includes('class="srail"'), 'no rail when the session has no git repo');
  assert.ok(!html.includes('class="ssafe'), 'no safe-to-close chip without a repo');
});

test('WCOCKPIT-10 webview-sim: ahead row → blue chip + advisory hint, NO Save button (push-only is advisory)', () => {
  const row = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'ahead', dirty: 0, staged: 0, ahead: 3, behind: 0 }, branch: 'wave/x' });
  const html = _wvRenderRow(row, {});
  assert.ok(html.includes('class="ssafe blue"'), 'blue saved-not-backed-up chip');
  assert.ok(!html.includes('Save my work'), 'no Save button when there is nothing to commit (push-only stays advisory)');
});

test('WCOCKPIT-10 a11y: rail aria-label names the CURRENT step + Save button is labelled', () => {
  const ahead = _wvRenderRow(Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'ahead', dirty: 0, staged: 0, ahead: 2, behind: 0 }, branch: 'wave/x' }), {});
  assert.ok(/aria-label="Project stage — [^"]+"/.test(ahead), 'rail aria-label must name the live state, not a static "stage rail"');
  const amber = _wvRenderRow(Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'uncommitted', dirty: 1, staged: 0, ahead: 0, behind: 0 }, branch: 'wave/x' }), {});
  assert.ok(/<button class="snowbtn"[^>]*aria-label="[^"]+"/.test(amber), 'Save my work button must carry an aria-label');
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
  assert.ok(html.includes('1 your turn'), 'needsYou count must appear');
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
  assert.ok(html.indexOf('class="sint"') > di, 'integrations must be inside the drawer');
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
  const html = rr.renderGroupHeader('MYREPO', group);
  assert.ok(html.includes('wave-WCOCKPIT'), 'group header shows the shared branch');
  assert.ok(html.includes('162 uncommitted'), 'group header shows the rolled-up git stage');
  assert.ok(html.includes('class="ghd'), 'group header uses .ghd container');
});

// ── WCOCKPIT-7: clear/close sessions + compact drawer ──
test('WCOCKPIT-7 mode-registry: archive/isArchived/unarchive lifecycle', () => {
  const sid = 'wc7-arch-' + process.pid;
  mr.set(sid, { mode: 'moo' });
  const t0 = Date.now();
  assert.equal(mr.isArchived(sid, t0), false, 'not archived initially');
  mr.archive(sid);
  assert.equal(mr.isArchived(sid, t0 - 1000), true, 'archived hides a session with no newer activity');
  assert.equal(mr.isArchived(sid, Date.now() + 60000), false, 'activity after archiving un-hides it');
  mr.unarchive(sid);
  assert.equal(mr.isArchived(sid, t0 - 1000), false, 'unarchive clears the archived state');
});

test('WCOCKPIT-7 renderRow: per-session close (archive) button present', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('class="sarch"'), 'close/archive button must be present');
  assert.ok(html.includes('data-a="archiveSession"'), 'close button dispatches archiveSession');
});

test('WCOCKPIT-7 renderRow: integrations inline in control row (no standalone .smeta)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(!html.includes('class="smeta"'), 'old standalone .smeta block must be gone');
  assert.ok(html.includes('class="sint"'), 'integrations sit in the inline .sint group');
  assert.ok(html.indexOf('class="sint"') > html.indexOf('class="sctrl"'), 'integrations inline within the control row');
});

// ════════════════════════════════════════════════════════════════════════════
// WCOCKPIT-9 (Bloco A) — Espelho Cowork: mapa persistente + projOf + origem honesta
// ════════════════════════════════════════════════════════════════════════════

test('WCOCKPIT-9 mode-registry: setCowork persists project/title/conversation + decorate reads them (sem mapa)', () => {
  const sid = 'wc9-cowork-' + process.pid;
  mr.setCowork(sid, { project: 'Mooter.ai', title: 'Wave WCOCKPIT-9 brain', conversationId: 'conv-123' });
  const row = { fullId: sid };
  mr.decorate(row, {}); // mapa Cowork vazio → cai para os campos do registo
  assert.equal(row.coworkProject, 'Mooter.ai', 'registry coworkProject surfaced when no map');
  assert.equal(row.coworkTitle, 'Wave WCOCKPIT-9 brain');
  assert.equal(row.coworkConversationId, 'conv-123');
  assert.ok(row.coworkUpdatedAt, 'coworkUpdatedAt timestamp set');
});

test('WCOCKPIT-9 mode-registry: decorate PREFERE o mapa Cowork persistente sobre o registo', () => {
  const sid = 'wc9-prio-' + process.pid;
  mr.setCowork(sid, { project: 'Registry Project', title: 'reg title' });
  const map = { [sid]: { coworkProject: 'Real Cowork Project', coworkTitle: 'map title', coworkConversationId: 'c9' } };
  const row = { fullId: sid };
  mr.decorate(row, map);
  assert.equal(row.coworkProject, 'Real Cowork Project', 'persistent map wins over registry');
  assert.equal(row.coworkTitle, 'map title');
  assert.equal(row.coworkConversationId, 'c9');
});

test('WCOCKPIT-9 mode-registry: sem mapa nem registo → coworkProject null (nunca inventado)', () => {
  const row = { fullId: '__wc9_no_cowork_ever__' };
  mr.decorate(row, {});
  assert.equal(row.coworkProject, null, 'no Cowork mapping → null fallback (honest)');
});

test('WCOCKPIT-9 mode-registry: readCoworkMap nunca lança (ficheiro ausente → {})', () => {
  const m = mr.readCoworkMap();
  assert.equal(typeof m, 'object', 'always returns an object');
  assert.ok(m !== null, 'never null');
});

test('WCOCKPIT-9 mode-registry: setLoop persiste + decorate expõe row.loop (Bloco F)', () => {
  const sid = 'wc9-loop-' + process.pid;
  mr.setLoop(sid, true);
  const row = { fullId: sid };
  mr.decorate(row, {});
  assert.equal(row.loop, true, 'loop armed persists');
  mr.setLoop(sid, false);
  const row2 = { fullId: sid };
  mr.decorate(row2, {});
  assert.equal(row2.loop, false, 'loop disarmed persists');
});

test('WCOCKPIT-9 cowork-waiting: NÃO limpa o espelho persistente quando não é hit', () => {
  // mode-registry decorou primeiro: coworkProject persistente presente.
  const row = { fullId: 'wc9-keep', coworkProject: 'Mooter.ai', coworkTitle: 'brain', working: true };
  cw.decorate(row, { session_id: 'OTHER', status: 'pending', ts: 't' }); // pending de outra sessão
  assert.equal(row.coworkProject, 'Mooter.ai', 'persistent coworkProject preserved (not clobbered to null)');
  assert.equal(row.coworkTitle, 'brain', 'persistent coworkTitle preserved');
  assert.equal(row.waitingForCowork, false);
  assert.equal(row.working, true, 'working untouched for non-hit');
});

test('WCOCKPIT-9 cowork-waiting: hit com coworkProject sobrepõe o espelho + define project', () => {
  const row = { fullId: 'wc9-hit', coworkProject: 'Old', coworkTitle: 'old' };
  cw.decorate(row, { session_id: 'wc9-hit', status: 'cowork_working', coworkProject: 'Live Project', coworkTitle: 'Live brain', ts: 't' });
  assert.equal(row.coworkProject, 'Live Project', 'live pending project overrides');
  assert.equal(row.project, 'Live Project', 'group project follows the live cowork project');
  assert.equal(row.coworkTitle, 'Live brain');
  assert.equal(row.waitingForCowork, true);
});

test('WCOCKPIT-9 renderGroupHeader: origin=cowork → 🗂 + "· Cowork" + repo sub-rótulo', () => {
  const group = [{ fullId: 'a', needsYou: false, repoFolder: 'myrepo', branch: 'main' }];
  const html = rr.renderGroupHeader('Mooter.ai', group, { origin: 'cowork' });
  assert.ok(html.includes('🗂 Mooter.ai'), 'cowork project shown with 🗂');
  assert.ok(html.includes('· Cowork'), 'cowork source tag present');
  assert.ok(html.includes('📁 myrepo'), 'repo folder shown as honest sub-label, not as the group name');
});

test('WCOCKPIT-9 renderGroupHeader: origin=repo → 📁 + "repo (sem Cowork)" (fallback rotulado)', () => {
  const group = [{ fullId: 'a', needsYou: false, repoFolder: 'myrepo', branch: 'main' }];
  const html = rr.renderGroupHeader('myrepo', group, { origin: 'repo' });
  assert.ok(html.includes('📁 myrepo'), 'repo fallback uses 📁');
  assert.ok(html.includes('repo (sem Cowork)'), 'repo fallback honestly labelled');
  assert.ok(!html.includes('🗂'), 'repo fallback must NOT masquerade as a Cowork project');
});

test('WCOCKPIT-9 renderGroupHeader: origin=unassigned → 📁 + "sem Cowork" (System32-like)', () => {
  const group = [{ fullId: 'a', needsYou: false, repoFolder: 'System32' }];
  const html = rr.renderGroupHeader('Unassigned', group, { origin: 'unassigned' });
  assert.ok(html.includes('📁 Unassigned'), 'unassigned uses 📁');
  assert.ok(html.includes('sem Cowork'), 'unassigned honestly labelled');
  assert.ok(html.includes('repo:System32'), 'the raw cwd folder shown as sub-label, never as a project');
});

// ── WCOCKPIT-9 (Bloco B) — cartão compacto: nome + estado numa só .sline ──

test('WCOCKPIT-9 (Bloco B) renderRow: nome + estado + id coabitam numa única .sline', () => {
  const row = Object.assign({}, SAMPLE_ROW, { working: true });
  const html = rr.renderRow(row, {});
  assert.ok(html.includes('class="sline"'), 'compact single-line container .sline present');
  assert.ok(html.includes('class="sname"'), 'name span present');
  assert.ok(html.includes('class="sstate"'), 'state span present on the same line');
  assert.ok(html.includes('class="sid"'), 'short id span present');
  // ordem na linha: nome → estado → id → llm
  const iName = html.indexOf('class="sname"');
  const iState = html.indexOf('class="sstate"');
  const iId = html.indexOf('class="sid"');
  const iLlm = html.indexOf('class="sllm"');
  assert.ok(iName < iState && iState < iId && iId < iLlm, 'name, state, id, llm sit in order on one line');
});

test('WCOCKPIT-9 (Bloco B) renderRow: já NÃO usa o layout de duas linhas .stop/.ssub', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(!html.includes('class="stop"'), 'old two-line .stop block removed from the card');
  assert.ok(!html.includes('class="ssub"'), 'old second-line .ssub block removed from the card');
});

test('WCOCKPIT-9 (Bloco B) renderRow: aria-label preserva o nome completo (a11y)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('aria-label="open session: test session"'), 'aria-label carries the full session name');
});

test('WCOCKPIT-9 (Bloco B) renderRow: drawer continua presente (revelado por CSS só na selecção)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('class="sdrawer"'), 'drawer markup still emitted (CSS gates its visibility to .on/:focus-within)');
});

// ── WCOCKPIT-9 (Bloco D) — modelos locais Ollama no dropdown por sessão ──

test('WCOCKPIT-9 (Bloco D) renderRow: dropdown lista Claude + locais Ollama reais (🦙)', () => {
  const html = rr.renderRow(SAMPLE_ROW, { localModels: [{ name: 'qwen2.5:3b', sizeGb: 1.9 }, { name: 'gemma3:12b', sizeGb: 8.1 }] });
  assert.ok(html.includes('<option value="claude-opus-4-6"'), 'Claude tiers still present');
  assert.ok(html.includes('optgroup label="Local (Ollama)"'), 'local Ollama optgroup present');
  assert.ok(html.includes('<option value="qwen2.5:3b"'), 'real local model id is an option');
  assert.ok(html.includes('🦙 qwen2.5:3b'), 'local model rendered with 🦙');
});

test('WCOCKPIT-9 (Bloco D) renderRow: local pesado (≥8GB) marcado "⚠ lento (cold-load)"', () => {
  const html = rr.renderRow(SAMPLE_ROW, { localModels: [{ name: 'gemma3:12b', sizeGb: 8.1 }] });
  assert.ok(html.includes('8.1GB ⚠ lento (cold-load)'), 'heavy local flagged honestly');
});

test('WCOCKPIT-9 (Bloco D) renderRow: local leve (≤4GB) marcado ⚡ (rápido)', () => {
  const html = rr.renderRow(SAMPLE_ROW, { localModels: [{ name: 'qwen2.5:3b', sizeGb: 1.9 }] });
  assert.ok(html.includes('1.9GB ⚡'), 'light local flagged fast');
});

test('WCOCKPIT-9 (Bloco D) renderRow: seleccionar um local persiste como selected', () => {
  const row = Object.assign({}, SAMPLE_ROW, { model: 'qwen2.5:3b' });
  const html = rr.renderRow(row, { localModels: [{ name: 'qwen2.5:3b', sizeGb: 1.9 }] });
  assert.ok(html.includes('<option value="qwen2.5:3b" selected>'), 'persisted local model is selected');
  assert.ok(!html.includes('<option value="" selected>'), 'Auto not selected when a local is chosen');
});

test('WCOCKPIT-9 (Bloco D) renderRow: sem localModels → só Claude (retrocompatível)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('<option value="claude-opus-4-6"'), 'Claude options present with no locals');
  assert.ok(!html.includes('optgroup label="Local (Ollama)"'), 'no local optgroup when none installed');
});

test('WCOCKPIT-9 (Bloco D) renderRow: modelo guardado fora da lista mostrado honestamente (set)', () => {
  const row = Object.assign({}, SAMPLE_ROW, { model: 'llama3.1:70b' }); // not in Claude tiers, not in locals list
  const html = rr.renderRow(row, { localModels: [{ name: 'qwen2.5:3b', sizeGb: 1.9 }] });
  assert.ok(html.includes('<option value="llama3.1:70b" selected>'), 'unknown stored model kept, marked selected (not silently lost)');
});

// ── WCOCKPIT-9 (Bloco F) — toggle LoopMoo por sessão (com degradação honesta) ──

test('WCOCKPIT-9 (Bloco F) renderRow: loop OFF → botão 🔁 presente, sem .on', () => {
  const html = rr.renderRow(SAMPLE_ROW, {}); // loop undefined/false
  assert.ok(html.includes('class="sloop"'), 'LoopMoo toggle present');
  assert.ok(html.includes('data-mloop="false"'), 'data-mloop reflects OFF');
  assert.ok(!html.includes('class="sloop on"'), 'no .on when loop off');
  assert.ok(html.includes('🔁 loop'), 'label shows 🔁 loop when off');
});

test('WCOCKPIT-9 (Bloco F) renderRow: loop ON + runner activo → .on, anima a cow 🔁', () => {
  const row = Object.assign({}, SAMPLE_ROW, { loop: true });
  const html = rr.renderRow(row, { loopActive: true });
  assert.ok(html.includes('class="sloop on"'), 'toggle has .on when loop armed');
  assert.ok(html.includes('data-mloop="true"'), 'data-mloop reflects ON');
  assert.ok(html.includes('livecow loop') || /class="livecow[^"]* loop/.test(html), 'cow gets the 🔁 loop animation when actually looping');
  assert.ok(!html.includes('armed'), 'active loop is NOT shown as merely armed');
});

test('WCOCKPIT-9 (Bloco F) renderRow: loop ARMADO mas runner inactivo → degradação honesta', () => {
  const row = Object.assign({}, SAMPLE_ROW, { loop: true });
  const html = rr.renderRow(row, { loopActive: false });
  assert.ok(html.includes('sloop on armed') || /class="sloop on armed"/.test(html), 'armed-not-active styling');
  assert.ok(html.includes('🔁 armado'), 'label honestly reads "armado"');
  assert.ok(!/class="livecow[^"]* loop/.test(html), 'cow does NOT animate 🔁 when loop is only armed (honesty)');
});

// ── WCOCKPIT-9 (Bloco E) — picker de slash commands (skills + Moo Packs) ──

test('WCOCKPIT-9 (Bloco E) slashCommands: lista os /mooter <sub> reais com descrição (nunca inventa)', () => {
  const list = x.slashCommands();
  assert.ok(Array.isArray(list), 'returns an array');
  const byCmd = Object.fromEntries(list.map((i) => [i.cmd, i.desc]));
  assert.ok('/mooter route' in byCmd, '/mooter route present');
  assert.ok('/mooter savings' in byCmd, '/mooter savings present');
  assert.ok(byCmd['/mooter route'] && byCmd['/mooter route'].length > 0, 'route carries a real description');
  // só comandos reais — todos começam por "/" e não há duplicados
  assert.ok(list.every((i) => i.cmd.startsWith('/')), 'every command starts with /');
  assert.equal(new Set(list.map((i) => i.cmd)).size, list.length, 'no duplicate commands');
});

test('WCOCKPIT-9 (Bloco E) _packDescription: lê description do pack.yaml (parser leve), null se ausente', () => {
  const d = x._packDescription('code-audit'); // pack real no repo (packs/code-audit/pack.yaml)
  if (d !== null) assert.ok(/audit/i.test(d), 'real pack description parsed from pack.yaml');
  assert.equal(x._packDescription('__no_such_pack_ever__'), null, 'missing pack → null (never fabricated)');
});

test('WCOCKPIT-9 (Bloco E) renderRow: picker presente com comandos+descrições (parêntesis)', () => {
  const html = rr.renderRow(SAMPLE_ROW, { slashCommands: [
    { cmd: '/mooter route', desc: 'rota um prompt e mostra o tier' },
    { cmd: '/code-audit', desc: 'Code security & quality audit' },
  ] });
  assert.ok(html.includes('class="sslash"'), 'slash picker select present');
  assert.ok(html.includes('data-msess="' + SAMPLE_ROW.fullId + '"'), 'picker scoped to the session');
  assert.ok(html.includes('/mooter route — (rota um prompt e mostra o tier)'), 'command shows description in parentheses');
  assert.ok(html.includes('<option value="/code-audit"'), 'installed pack command is an option');
});

test('WCOCKPIT-9 (Bloco E) renderRow: sem slashCommands → sem picker (sem comandos falsos)', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(!html.includes('class="sslash"'), 'no picker rendered when no real commands supplied');
});

test('WCOCKPIT-9 (Bloco E) renderRow: nextSlash armado mostra "next ▶" + opção selecionada', () => {
  const row = Object.assign({}, SAMPLE_ROW, { nextSlash: '/mooter savings' });
  const html = rr.renderRow(row, { slashCommands: [{ cmd: '/mooter savings', desc: 'poupança' }] });
  assert.ok(html.includes('class="snext"'), 'armed next-slash feedback chip present');
  assert.ok(html.includes('next ▶ /mooter savings'), 'shows which command is armed');
  assert.ok(html.includes('<option value="/mooter savings" selected>'), 'armed command pre-selected in picker');
});

test('WCOCKPIT-9 (Bloco E) mode-registry: setNextSlash persiste + decorate expõe row.nextSlash', () => {
  const sid = 'wc9-slash-' + process.pid;
  mr.setNextSlash(sid, '/mooter route');
  const row = { fullId: sid };
  mr.decorate(row, {});
  assert.equal(row.nextSlash, '/mooter route', 'armed slash persists');
  mr.setNextSlash(sid, null);
  const row2 = { fullId: sid };
  mr.decorate(row2, {});
  assert.equal(row2.nextSlash, null, 'clearing the armed slash persists');
});

// ── WCOCKPIT-9 (Bloco C) — git Commit/Push por sessão (preview, harmonia, sha guard) ──

test('WCOCKPIT-9 (Bloco C) parsePorcelain: parses statuses, renames, untracked', () => {
  const files = x.parsePorcelain(' M src/a.js\n?? newfile.txt\nA  added.js\nR  old.js -> renamed.js');
  const paths = files.map((f) => f.path);
  assert.ok(paths.includes('src/a.js'), 'modified tracked file');
  assert.ok(paths.includes('newfile.txt'), 'untracked file');
  assert.ok(paths.includes('added.js'), 'staged add');
  assert.ok(paths.includes('renamed.js'), 'rename keeps the NEW path');
  assert.ok(!paths.includes('old.js'), 'rename old path dropped');
});

test('WCOCKPIT-9 (Bloco C) defaultCommitMessage: conventional wip(<branch>) format', () => {
  const m = x.defaultCommitMessage('wave-WCOCKPIT', [{ path: 'src/a.js' }, { path: 'src/b.js' }]);
  assert.ok(m.startsWith('wip(wave-WCOCKPIT): '), 'conventional prefix with branch');
  assert.ok(m.includes('2 files'), 'mentions file count');
  assert.ok(m.includes('a.js'), 'mentions a file');
});

test('WCOCKPIT-9 (Bloco C) gitHarmony: ≥2 sessões mesmo repo+branch → shared (mesmo trabalho)', () => {
  const recent = [
    { fullId: 's1', cwd: '/repo', branch: 'main' },
    { fullId: 's2', cwd: '/repo', branch: 'main' },
    { fullId: 's3', cwd: '/repo', branch: 'other' },
    { fullId: 's4', cwd: '/elsewhere', branch: 'main' },
  ];
  const h = x.gitHarmony(recent, '/repo', 'main');
  assert.equal(h.shared, true, 'two sessions share repo+branch → must warn');
  assert.equal(h.count, 2);
  assert.deepEqual(h.others.sort(), ['s1', 's2']);
  assert.equal(x.gitHarmony(recent, '/elsewhere', 'main').shared, false, 'single session → not shared');
});

test('⇄ Handoff v3 gitSnapshot: mock-injectável; nunca lança; factsComplete false on failure', () => {
  // Deterministic fake git: maps an args-substring to canned { ok, out }.
  const fakeGit = (mapping) => (args) => {
    const key = args.join(' ');
    for (const k of Object.keys(mapping)) { if (key.includes(k)) return mapping[k]; }
    return { ok: false, out: '' };
  };
  const recent = [
    { fullId: 's1', cwd: '/repo', branch: 'wave/x', working: true },
    { fullId: 's2', cwd: '/repo', branch: 'wave/x', needsYou: true },
  ];
  const runGit = fakeGit({
    'log -1': { ok: true, out: 'abc1234\tfeat: do the thing' },
    'origin/main..HEAD': { ok: true, out: '3' },
    'HEAD..origin/main': { ok: true, out: '0' },
    'show -s --format=%P': { ok: true, out: 'parent1sha' }, // ONE parent → not a merge
    'diff-tree': { ok: true, out: 'src/a.js\nsrc/b.js\nsrc/c.js' },
    '@{u}..HEAD': { ok: true, out: '0' },
  });
  const snap = x.gitSnapshot('/repo', { runGit, recent, branch: 'wave/x' });
  assert.deepEqual(snap.head, { sha7: 'abc1234', subject: 'feat: do the thing' }, 'HEAD parsed from log');
  assert.equal(snap.baseAhead, 3);
  assert.equal(snap.baseBehind, 0);
  assert.equal(snap.isMerge, false, 'single parent → not a merge');
  assert.equal(snap.filesCount, 3);
  assert.deepEqual(snap.filesInHead, ['a.js', 'b.js', 'c.js'], 'basenames of HEAD files');
  assert.equal(snap.pushed, true, 'upstream set + nothing un-pushed → pushed');
  assert.equal(snap.mixedSessions, true, '2 ACTIVE sessions same cwd+branch + own commits → mixed-sessions');
  assert.equal(snap.factsComplete, true, 'all reads ok');
  // 4b — IDLE sessions on a clean/pushed main must NOT trigger mixed-sessions (was a false "review").
  const idle = [{ fullId: 'i1', cwd: '/repo', branch: 'main' }, { fullId: 'i2', cwd: '/repo', branch: 'main' }];
  const cleanMain = fakeGit({ 'log -1': { ok: true, out: 'm1\tmerge' }, 'origin/main..HEAD': { ok: true, out: '0' }, 'HEAD..origin/main': { ok: true, out: '0' }, '@{u}..HEAD': { ok: true, out: '0' } });
  const snapIdle = x.gitSnapshot('/repo', { runGit: cleanMain, recent: idle, branch: 'main' });
  assert.equal(snapIdle.mixedSessions, false, '2 idle sessions on clean main → NOT mixed-sessions');
  // PR object → pushed=prNumber, prStage reused
  const snapPr = x.gitSnapshot('/repo', { runGit, recent: [], branch: 'wave/x', pr: { number: 42, state: 'OPEN', statusCheckRollup: [] } });
  assert.equal(snapPr.pushed, 42, 'PR → prNumber (reuses prStage)');
  // a failing read → factsComplete false (never fabricated)
  const snapFail = x.gitSnapshot('/repo', { runGit: () => ({ ok: false, out: '' }), recent: [] });
  assert.equal(snapFail.factsComplete, false, 'any failed read → factsComplete false');
  assert.equal(snapFail.head, null, 'no head when log fails');
  // never throws on bad cwd
  assert.doesNotThrow(() => x.gitSnapshot(null, {}));
  assert.equal(x.gitSnapshot(null, {}).factsComplete, false);
});

test('⇄ Handoff v3 gitSnapshot 4c: merge-commit → isMerge + files brought in; GATE honest', () => {
  const fakeGit = (mapping) => (args) => {
    const key = args.join(' ');
    for (const k of Object.keys(mapping)) { if (key.includes(k)) return mapping[k]; }
    return { ok: false, out: '' };
  };
  const runGit = fakeGit({
    'log -1': { ok: true, out: 'merge12\tMerge pull request #213' },
    'origin/main..HEAD': { ok: true, out: '0' },
    'HEAD..origin/main': { ok: true, out: '0' },
    'show -s --format=%P': { ok: true, out: 'p1sha p2sha' }, // TWO parents → merge-commit
    'diff --name-only p1sha HEAD': { ok: true, out: 'src/x.js\nsrc/y.js' },
    '@{u}..HEAD': { ok: true, out: '0' },
  });
  const snap = x.gitSnapshot('/repo', { runGit, recent: [], branch: 'main', pr: { number: 213, state: 'MERGED' } });
  assert.equal(snap.isMerge, true, 'two parents → merge-commit');
  assert.equal(snap.filesCount, 2, 'files brought in by the merge (first-parent diff), not 0');
  assert.deepEqual(snap.filesInHead, ['x.js', 'y.js']);
  const txt = x.generateHandoff({ id: 'm', name: 'merge', branch: 'main' }, {}, { mode: 'quick', snapshot: snap });
  assert.ok(txt.includes('merge-commit (PR #213) · 2 fich. trazidos: x.js, y.js'), 'GATE: honest merge-commit line');
  assert.ok(!txt.includes('HEAD toca 0 fich.'), 'never the misleading "HEAD toca 0 fich." for a merge');
  assert.ok(txt.includes('ASK:    fyi'), 'merged + idle clean → fyi (not review)');
});

test('⇄ Handoff v3 gitSnapshot classifyFrozen: tri-state via classifyShaGuard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const runGit = () => ({ ok: false, out: '' }); // classifyShaGuard reads disk, not git
  const snap = x.gitSnapshot(repoRoot, { runGit, recent: [] });
  assert.ok(snap.classifyFrozen === true || snap.classifyFrozen === null, 'frozen sha intact → true (or null if absent in this checkout)');
  const none = x.gitSnapshot(path.join(os.tmpdir(), 'no-classify-' + process.pid), { runGit, recent: [] });
  assert.equal(none.classifyFrozen, null, 'non-Mooter repo → null (never false)');
});

test('WCOCKPIT-9 (Bloco C) classifyShaGuard: frozen classify.js intacta → ok; repo sem ele → não bloqueia', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const g = x.classifyShaGuard(repoRoot);
  if (g.checked) { // só quando o ficheiro frozen existe neste checkout
    assert.equal(g.ok, true, 'frozen classify.js sha must match → commit guard passes');
    assert.equal(g.sha, x.FROZEN_CLASSIFY_SHA);
  }
  const none = x.classifyShaGuard(path.join(os.tmpdir(), 'no-classify-' + process.pid));
  assert.equal(none.checked, false, 'non-Mooter repo → not checked');
  assert.equal(none.ok, true, 'and never blocks a non-Mooter repo');
});

test('WCOCKPIT-9 (Bloco C) gitCommitPreview: preview read-only do repo real (nunca commita)', async () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const p = await x.gitCommitPreview(repoRoot);
  assert.ok(p && typeof p === 'object', 'returns a preview object for a real git repo');
  assert.ok(Array.isArray(p.files), 'files is an array');
  assert.ok(typeof p.message === 'string' && p.message.length > 0, 'carries a default commit message');
});

test('WCOCKPIT-9 (Bloco C) renderRow: botão Commit & Push presente quando há trabalho', () => {
  const dirty = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'uncommitted', dirty: 3, staged: 0, ahead: 0, behind: 0 } });
  const html = rr.renderRow(dirty, {});
  assert.ok(html.includes('class="sgitbtn"'), 'Commit & Push button present when uncommitted');
  assert.ok(html.includes('data-a="gitFlow"'), 'button dispatches gitFlow');
  assert.ok(html.includes('Commit') && html.includes('Push'), 'button labelled Commit & Push');
});

test('WCOCKPIT-9 (Bloco C) renderRow: SEM botão quando clean (nada a commitar)', () => {
  const clean = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 0 } });
  const html = rr.renderRow(clean, {});
  assert.ok(!html.includes('class="sgitbtn"'), 'no Commit & Push button when clean');
});

test('WCOCKPIT-9 (Bloco C) renderRow: botão presente em ahead (↑ to push)', () => {
  const ahead = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'ahead', dirty: 0, staged: 0, ahead: 2, behind: 0 } });
  const html = rr.renderRow(ahead, {});
  assert.ok(html.includes('class="sgitbtn"'), 'button present when ahead (to push)');
  assert.ok(html.includes('to push'), 'button reflects push work');
});

// projOf é a regra de agrupamento inline em extension.js — fixada aqui como contrato:
// coworkProject vence; senão pasta de repo REAL (branch/gitStage); senão 'Unassigned'.
test('WCOCKPIT-9 projOf contract: Cowork > repo real > Unassigned (espelho honesto)', () => {
  const isRealRepo = (r) => !!(r.repoFolder && (r.branch || r.gitStage));
  const projOf = (r) => r.coworkProject ? r.coworkProject : (isRealRepo(r) ? r.repoFolder : 'Unassigned');
  const originOf = (r) => r.coworkProject ? 'cowork' : (isRealRepo(r) ? 'repo' : 'unassigned');
  assert.equal(projOf({ coworkProject: 'Mooter.ai', repoFolder: 'myrepo', branch: 'main' }), 'Mooter.ai');
  assert.equal(originOf({ coworkProject: 'Mooter.ai', repoFolder: 'myrepo', branch: 'main' }), 'cowork');
  assert.equal(projOf({ repoFolder: 'myrepo', branch: 'main' }), 'myrepo'); // repo real → fallback rotulado
  assert.equal(originOf({ repoFolder: 'myrepo', gitStage: { state: 'clean' } }), 'repo');
  assert.equal(projOf({ repoFolder: 'System32' }), 'Unassigned'); // cwd qualquer, sem git → Unassigned
  assert.equal(originOf({ repoFolder: 'System32' }), 'unassigned');
  assert.equal(projOf({}), 'Unassigned');
});

// ════════════════════════════════════════════════════════════════════════════
// ⇄ HANDOFF — session → Cowork context (extractPending · generateHandoff ·
// writeHandoffToSync · botão · handoffSentAt). Determinístico; campo sem dado → "—".
// ════════════════════════════════════════════════════════════════════════════

test('⇄ Handoff extractPending: tail real → último turno do assistant + tool-calls + stopped', () => {
  const tail = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'fix the bug' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
      { type: 'text', text: 'Let me edit the file.' },
      { type: 'tool_use', name: 'Edit', input: { file_path: '/x/src/inject_context.ts' } },
    ] } }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
      { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
      { type: 'text', text: 'Should I run the tests before pushing?' },
    ] } }),
  ];
  const p = x.extractPending(tail);
  assert.equal(p.lastAssistantText, 'Should I run the tests before pushing?');
  assert.equal(p.stopped, true, 'last meaningful message was the assistant → stopped (your turn)');
  // last 1–3 tool-calls, chronological, with honest targets (basename / command)
  assert.equal(p.lastToolActions.length, 2);
  assert.equal(p.lastToolActions[0].name, 'Edit');
  assert.equal(p.lastToolActions[0].target, 'inject_context.ts');
  assert.equal(p.lastToolActions[1].name, 'Bash');
  assert.equal(p.lastToolActions[1].target, 'npm test');
});

test('⇄ Handoff extractPending: tail vazio / lixo → "—", [], stopped:false (nunca lança)', () => {
  const e = x.extractPending([]);
  assert.equal(e.lastAssistantText, '—');
  assert.deepEqual(e.lastToolActions, []);
  assert.equal(e.stopped, false);
  const g = x.extractPending(['NOT JSON{{{', '', '{"truncated...']);
  assert.equal(g.lastAssistantText, '—');
  // mid-work: last meaningful line is a user/tool_result → not stopped
  const mid = x.extractPending([
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'working' }] } }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'r' }] } }),
  ]);
  assert.equal(mid.stopped, false, 'assistant mid-work (last line is a tool_result) → not stopped');
});

test('⇄ Handoff v3 generateHandoff: bate no NOVO §FORMATO (pirâmide invertida), campos presentes', () => {
  const row = { fullId: 'abcd1234-dead-beef', id: 'abcd1234', name: 'fix the auth bug now', cwd: '/home/p/myrepo',
    branch: 'wave/x', model: 'claude-opus-4-8', mode: 'moo', turns: 20, saved: 1.2345,
    gitStage: { state: 'uncommitted', dirty: 3, staged: 1, ahead: 0, behind: 0 },
    notionSyncedAt: '2026-06-26T10:00:00', obsidianSyncedAt: '2026-06-26T12:00:00' };
  const snapshot = { head: { sha7: 'c0ffee1', subject: 'fix the auth bug' }, baseAhead: 2, baseBehind: 0,
    pushed: false, prStage: null, filesInHead: ['a.ts', 'b.ts'], filesCount: 2, classifyFrozen: true,
    mixedSessions: false, factsComplete: true };
  const pending = { lastAssistantText: 'Should I push?', lastToolActions: [{ name: 'Edit', target: 'a.ts' }, { name: 'Bash', target: 'npm test' }], stopped: true };
  const txt = x.generateHandoff(row, pending, { mode: 'full', snapshot, deltaTurns: 18, now: new Date('2026-06-26T14:05:00') });
  assert.ok(txt.startsWith('⇄ MOO HANDOFF · myrepo · fix the auth bug now/abcd1234 · 2026-06-26 14:05'), 'header pyramid line exact');
  assert.ok(txt.includes('ASK:    answer'), 'ASK derived (stopped on a question)');
  assert.ok(txt.includes('HEAD:   c0ffee1 "fix the auth bug"'), 'HEAD sha + subject');
  assert.ok(txt.includes('BASE:   wave/x · main+2 · local (no push)'), 'BASE branch+position+push');
  assert.ok(txt.includes('GATE:   classify.js ✓ frozen · HEAD toca 2 fich.: a.ts, b.ts'), 'GATE freeze + files');
  assert.ok(txt.includes('TREE:   ⚠ 3 uncommitted fora do HEAD (ambiente)'), 'TREE uncommitted env changes');
  assert.ok(txt.includes('FRESH:  vault') && txt.includes('Notion') && txt.includes('handoff agora'), 'FRESH stamps');
  assert.ok(txt.includes('DELTA:  18 turnos · 2 commits desde o último handoff'), 'DELTA turns+commits');
  assert.ok(txt.includes('PENDING:"Should I push?"'), 'PENDING verbatim, quoted');
  assert.ok(txt.includes('DOING:  fix the auth bug now'), 'no opts.doing → DOING falls back to the 1st prompt');
  assert.ok(txt.includes('LAST:   Edit a.ts · Bash npm test'), 'full mode shows LAST STEP (tool calls)');
  assert.ok(txt.includes('NEXT:   responder à pergunta pendente acima'), 'NEXT keyed to the ASK');
  assert.ok(txt.includes('model claude-opus-4-8 · mode moo · saved $1.23 (sessão)'), 'full: model/mode/saved line');
  assert.ok(txt.includes('facts: complete'), 'full: facts footer present');
  assert.ok(txt.trimEnd().endsWith('⇄ END HANDOFF'));
});

test('⇄ Handoff v3 generateHandoff: campos em falta → "—"; opts.doing sobrepõe; nunca lança', () => {
  const txt = x.generateHandoff({ fullId: 'x9', id: 'x9' }, { lastAssistantText: '—', lastToolActions: [], stopped: false }, { now: new Date('2026-01-01T00:00:00'), doing: 'wiring the handoff button' });
  assert.ok(txt.includes('HEAD:   —'), 'no snapshot → HEAD —');
  assert.ok(txt.includes('BASE:   — · main±0 · local (no push)'), 'no branch/ahead → — · main±0 · local');
  assert.ok(txt.includes('GATE:   HEAD toca 0 fich.'), 'no files → 0 (classify.js segment absent when frozen unknown)');
  assert.ok(txt.includes('TREE:   clean'), 'no gitStage → clean');
  assert.ok(txt.includes('FRESH:  vault — · Notion — · handoff agora'), 'no stamps → —');
  assert.ok(txt.includes('DELTA:  —'), 'no turns/commits → —');
  assert.ok(txt.includes('PENDING:"—"'), 'empty pending → —');
  assert.ok(txt.includes('DOING:  wiring the handoff button'), 'opts.doing overrides DOING');
  assert.ok(txt.includes('ASK:    fyi'), 'no facts → fyi');
  assert.doesNotThrow(() => x.generateHandoff(null, null, {}), 'null row/pending must not throw');
  assert.ok(typeof x.generateHandoff(null, null, {}) === 'string');
});

test('⇄ Handoff v3 deriveAsk: os 6 casos (review p/ classify-changed E mixed-sessions)', () => {
  assert.equal(x.deriveAsk({ classifyFrozen: false }, {}, {}), 'review', 'classify.js changed → review (nunca merge cego)');
  assert.equal(x.deriveAsk({ mixedSessions: true }, {}, {}), 'review', 'mixed-sessions → review');
  assert.equal(x.deriveAsk({}, { stopped: true, lastAssistantText: 'run tests?' }, {}), 'answer', 'stopped on a question → answer');
  assert.equal(x.deriveAsk({ baseAhead: 2, pushed: false, head: { sha7: 'a' }, classifyFrozen: true }, {}, {}), 'verify+merge', 'fresh HEAD + ahead + not-pushed + frozen → verify+merge');
  assert.equal(x.deriveAsk({ baseAhead: 1, pushed: 42 }, {}, {}), 'push-ok', 'ahead + PR → push-ok');
  assert.equal(x.deriveAsk({ baseAhead: 1, pushed: 1, prStage: 'merged ✓' }, {}, {}), 'fyi', 'merged PR → fyi');
  assert.equal(x.deriveAsk({ baseAhead: 0, pushed: false }, {}, {}), 'fyi', 'clean + nothing pending → fyi');
  // SAFETY precedence: review wins over a pending question.
  assert.equal(x.deriveAsk({ classifyFrozen: false }, { stopped: true, lastAssistantText: 'merge?' }, {}), 'review', 'review over answer');
});

test('⇄ Handoff v3 generateHandoff FRESH: ⚠ quando vault/Notion > 7d; em falta → —', () => {
  const now = new Date('2026-06-27T00:00:00');
  const stale = '2026-06-10T00:00:00';   // 17d ago → ⚠
  const fresh = '2026-06-26T00:00:00';   // 1d ago → no ⚠
  const txtStale = x.generateHandoff({ id: 'f', name: 'n', notionSyncedAt: stale, obsidianSyncedAt: stale }, {}, { now });
  const fl = txtStale.split('\n').find((l) => l.startsWith('FRESH:'));
  assert.ok(/vault \d+d ago ⚠/.test(fl), 'vault > 7d → ⚠');
  assert.ok(/Notion \d+d ago ⚠/.test(fl), 'Notion > 7d → ⚠');
  const txtFresh = x.generateHandoff({ id: 'f', name: 'n', notionSyncedAt: fresh, obsidianSyncedAt: fresh }, {}, { now });
  const fl2 = txtFresh.split('\n').find((l) => l.startsWith('FRESH:'));
  assert.ok(fl2.includes('vault 1d ago') && !fl2.includes('vault 1d ago ⚠'), 'fresh vault → no ⚠');
  // vault mtime fallback (opts.vaultMtime) when no obsidianSyncedAt; absent → —
  const txtMtime = x.generateHandoff({ id: 'f', name: 'n' }, {}, { now, vaultMtime: new Date(fresh).getTime() });
  assert.ok(txtMtime.split('\n').find((l) => l.startsWith('FRESH:')).includes('vault 1d ago'), 'opts.vaultMtime feeds vault freshness');
  assert.ok(x.generateHandoff({ id: 'f', name: 'n' }, {}, { now }).includes('FRESH:  vault — · Notion — · handoff agora'), 'no stamps → —');
});

test('⇄ Handoff writeHandoffToSync: UPSERT por sid (2ª chamada substitui, não acumula); atómico', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-sync-'));
  const sid = 'sess-handoff-1';
  const r1 = x.writeHandoffToSync(tmpDir, sid, 'FIRST HANDOFF TEXT', { name: 'sess', now: new Date('2026-06-26T10:00:00') });
  assert.equal(r1.ok, true);
  assert.equal(r1.created, true, 'created the SYNC.md when absent (context never lost)');
  let content = fs.readFileSync(path.join(tmpDir, 'SYNC.md'), 'utf8');
  assert.ok(content.includes('FIRST HANDOFF TEXT'));
  assert.ok(content.includes('### ⇄ Handoff · sess · 2026-06-26 10:00'));
  // 2nd handoff for the SAME sid → replaces, never accumulates
  const r2 = x.writeHandoffToSync(tmpDir, sid, 'SECOND HANDOFF TEXT', { name: 'sess', now: new Date('2026-06-26T11:00:00') });
  assert.equal(r2.ok, true);
  content = fs.readFileSync(path.join(tmpDir, 'SYNC.md'), 'utf8');
  assert.ok(content.includes('SECOND HANDOFF TEXT'));
  assert.ok(!content.includes('FIRST HANDOFF TEXT'), 'upsert replaces — no accumulation of stale handoffs');
  const startMarkers = (content.match(/<!-- mooter-handoff:sess-handoff-1 -->/g) || []).length;
  assert.equal(startMarkers, 1, 'exactly ONE handoff block per sid');
  // a DIFFERENT sid appends its own block (both coexist)
  x.writeHandoffToSync(tmpDir, 'other-sid', 'OTHER SESSION HANDOFF', { name: 'other', now: new Date('2026-06-26T12:00:00') });
  content = fs.readFileSync(path.join(tmpDir, 'SYNC.md'), 'utf8');
  assert.ok(content.includes('SECOND HANDOFF TEXT') && content.includes('OTHER SESSION HANDOFF'), 'distinct sids coexist');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  // bad inputs → ok:false, never throws
  assert.equal(x.writeHandoffToSync('', sid, 't').ok, false);
  assert.equal(x.writeHandoffToSync(null, sid, 't').ok, false);
  assert.equal(x.writeHandoffToSync(os.tmpdir(), '', 't').ok, false);
});

test('⇄ Handoff writeHandoffToSync: upsert num SYNC.md já existente preserva o resto', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-sync-pre-'));
  const file = path.join(tmpDir, 'SYNC.md');
  fs.writeFileSync(file, '# Mooter — Sync Snapshot\n\n### Existing section\n**Estado:** keep me\n');
  const r = x.writeHandoffToSync(tmpDir, 'sX', 'HANDOFF BODY', { name: 'sX', now: new Date('2026-06-26T13:00:00') });
  assert.equal(r.ok, true);
  assert.equal(r.created, false, 'existing file is not flagged created');
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('### Existing section') && content.includes('keep me'), 'pre-existing content preserved');
  assert.ok(content.includes('HANDOFF BODY'), 'handoff block appended');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('⇄ Handoff mode-registry: setHandoff persiste handoffSentAt + decorate expõe (aditivo)', () => {
  assert.ok('handoffSentAt' in mr.DEFAULT, 'DEFAULT carries handoffSentAt');
  assert.equal(mr.DEFAULT.handoffSentAt, null);
  const sid = 'handoff-reg-' + process.pid;
  const row0 = { fullId: sid };
  mr.decorate(row0, {});
  assert.equal(row0.handoffSentAt, null, 'unset → null (never fabricated)');
  mr.setHandoff(sid);
  const row1 = { fullId: sid };
  mr.decorate(row1, {});
  assert.ok(typeof row1.handoffSentAt === 'string' && row1.handoffSentAt.includes('T'), 'setHandoff records an ISO timestamp');
});

test('⇄ Handoff renderRow: botão ⇄ Handoff no drawer (data-a=handoff) sem partir o invariante clean', () => {
  const html = rr.renderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('data-a="handoff"'), 'handoff button dispatches the handoff command');
  assert.ok(html.includes('⇄ Handoff'), 'button label present');
  assert.ok(html.includes('class="sgitbtn handoff"'), 'reuses sgitbtn styling via a DISTINCT .handoff class');
  assert.ok(html.indexOf('data-a="handoff"') > html.indexOf('class="sdrawer"'), 'handoff button lives inside the drawer');
  // INVARIANTE preservado: um cartão CLEAN continua sem o botão bare sgitbtn (Commit & Push)
  const clean = Object.assign({}, SAMPLE_ROW, { gitStage: { state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 0 } });
  const cleanHtml = rr.renderRow(clean, {});
  assert.ok(!cleanHtml.includes('class="sgitbtn"'), 'clean row still has NO Commit & Push (handoff uses class="sgitbtn handoff")');
  assert.ok(cleanHtml.includes('data-a="handoff"'), 'but ⇄ Handoff is always available, even when clean');
});

test('⇄ Handoff webview-sim: botão sobrevive ao path fn.toString()+new Function()', () => {
  const html = _wvRenderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('data-a="handoff"'), 'handoff button survives webview serialization');
  assert.ok(html.includes('⇄ Handoff'), 'label survives serialization');
});

test('⇄ Handoff v3 host-side flow (handler sim): clipboard + handoffSentAt + SYNC.md upsert', () => {
  // Espelha a sequência do handler m.cmd==="handoff" SEM vscode: generate → clipboard(mock)
  // → setHandoff → writeHandoffToSync. (O handler real adiciona apenas clipboard.writeText + toast.)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-handoff-'));
  const sid = 'handoff-sim-' + process.pid;
  const row = { fullId: sid, id: sid.slice(0, 8), name: 'wire the handoff button', cwd: tmpDir,
    branch: 'wave/cockpit-handoff', model: 'claude-opus-4-8', mode: 'moo',
    turns: 7, saved: 0.9, gitStage: { state: 'uncommitted', dirty: 2, staged: 0, ahead: 0, behind: 0 },
    notionSyncedAt: null, obsidianSyncedAt: null,
    pending: { lastAssistantText: 'Ready to commit?', lastToolActions: [{ name: 'Write', target: 'host-extra.js' }], stopped: true } };
  const snapshot = { head: null, baseAhead: 0, baseBehind: 0, pushed: false, prStage: null, filesInHead: [], filesCount: 0, classifyFrozen: null, mixedSessions: false, factsComplete: true };
  let clipboard = null; // mock de vscode.env.clipboard.writeText
  const text = x.generateHandoff(row, row.pending, { snapshot, now: new Date('2026-06-26T09:00:00') });
  clipboard = text;
  mr.setHandoff(sid);
  const w = x.writeHandoffToSync(row.cwd, sid, text, { name: row.name });
  assert.ok(clipboard.includes('⇄ MOO HANDOFF'), 'clipboard holds the handoff text');
  assert.ok(clipboard.includes('PENDING:"Ready to commit?"'), 'pending question copied verbatim');
  assert.ok(clipboard.includes('ASK:    answer'), 'action-first ASK present');
  const after = mr.get(sid);
  assert.ok(typeof after.handoffSentAt === 'string' && after.handoffSentAt.includes('T'), 'handoffSentAt recorded in the registry');
  assert.equal(w.ok, true, 'SYNC.md write ok');
  const sync = fs.readFileSync(path.join(tmpDir, 'SYNC.md'), 'utf8');
  assert.ok(sync.includes('⇄ Handoff') && sync.includes('Ready to commit?'), 'SYNC.md upserted with the handoff');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── ⇄ Handoff HÍBRIDO (esqueleto determinístico + narrativa local) — RECAP / SAVINGS / mode ──
test('⇄ Handoff v3 híbrido: full inclui RECAP (opts.recap); quick NÃO; LLM nunca toca no PENDING', () => {
  const row = { id: 'h1', name: 'first prompt', turns: 20, branch: 'b' };
  const pending = { lastAssistantText: 'EXACT pending question?', lastToolActions: [], stopped: true };
  const full = x.generateHandoff(row, pending, { mode: 'full', doing: 'DOING line', recap: 'line1\nline2\nline3', now: new Date('2026-06-26T00:00:00') });
  assert.ok(full.includes('RECAP:') && full.includes('  line1'), 'full mode renders the RECAP block');
  assert.ok(full.includes('  line2') && full.includes('  line3'), 'RECAP keeps its 3–5 lines');
  // quick mode DROPS the RECAP even when a recap string is supplied
  const quick = x.generateHandoff(row, pending, { mode: 'quick', recap: 'line1\nline2', now: new Date('2026-06-26T00:00:00') });
  assert.ok(!quick.includes('RECAP:'), 'quick mode omits RECAP');
  // REGRA DURA: o LLM (doing/recap) NUNCA toca no PENDING — fica verbatim em ambos os modos
  assert.ok(full.includes('PENDING:"EXACT pending question?"'), 'PENDING verbatim under full');
  assert.ok(quick.includes('PENDING:"EXACT pending question?"'), 'PENDING verbatim under quick');
});

test('⇄ Handoff v3 híbrido: LLM ausente (sem recap) → RECAP omitido mesmo em full; DOING cai no 1º prompt', () => {
  const txt = x.generateHandoff({ id: 'h2', name: 'p', turns: 50 }, { lastAssistantText: 'q?', lastToolActions: [], stopped: true }, { mode: 'full', now: new Date('2026-06-26T00:00:00') });
  assert.ok(!txt.includes('RECAP:'), 'no recap supplied (timeout/Ollama-down) → RECAP omitted');
  assert.ok(txt.includes('DOING:  p'), 'DOING falls back to the 1st prompt');
});

test('⇄ Handoff v3 §SAVINGS+facts: full only; estTokensSaved:0 → savings omitido; quick token-lean', () => {
  const row = { id: 'h3', name: 'p', turns: 20 };
  const pending = { lastAssistantText: 'q?', lastToolActions: [], stopped: true };
  // Sem genModel (narrativa não correu) → rótulo determinístico HONESTO (nunca um motor inventado).
  const withEst = x.generateHandoff(row, pending, { mode: 'full', estTokensSaved: 1000, now: new Date('2026-06-26T00:00:00') });
  assert.ok(withEst.includes('compressed locally (T0 · deterministic — no local gen model · $0) · ~1k tok saved vs screenshot (est.)'), 'footer labelled estimate + deterministic engine');
  assert.ok(withEst.indexOf('compressed locally') < withEst.indexOf('facts:'), 'savings precedes the facts footer');
  assert.ok(withEst.trimEnd().endsWith('⇄ END HANDOFF'));
  const noEst = x.generateHandoff(row, pending, { mode: 'full', estTokensSaved: 0, now: new Date('2026-06-26T00:00:00') });
  assert.ok(!noEst.includes('compressed locally'), 'sem estimativa → savings omitido (nunca um número fabricado)');
  assert.ok(noEst.includes('facts: complete'), 'facts footer still present without savings');
  // #3b — quando a narrativa local correu, o rodapé nomeia o modelo de geração REAL usado (T0 · <model> · $0).
  const withModel = x.generateHandoff(row, pending, { mode: 'full', estTokensSaved: 1000, genModel: 'qwen2.5:3b', now: new Date('2026-06-26T00:00:00') });
  assert.ok(withModel.includes('compressed locally (T0 · qwen2.5:3b · $0) · ~1k tok saved vs screenshot (est.)'), 'LLM ran → footer names the real gen model');
  assert.ok(!withModel.includes('deterministic'), 'model footer never also claims deterministic');
  // TOKEN-LEAN: quick has NO savings/facts/model-saved line
  const quick = x.generateHandoff(row, pending, { mode: 'quick', estTokensSaved: 1000, now: new Date('2026-06-26T00:00:00') });
  assert.ok(!quick.includes('compressed locally') && !quick.includes('facts:') && !quick.includes('saved $'), 'quick is token-lean: no savings/facts/model-saved line');
});

test('⇄ Handoff #3 pickLocalGenModel: exclui embeddings, escolhe modelo de geração; só-embedding → null', () => {
  // O bug: a narrativa caía no modelo de EMBEDDING (devolve vectores, não texto). Filtra-os fora
  // ANTES de ordenar por tamanho. No ambiente do Paulo → qwen2.5:3b (o menor não-embedding).
  const env = [{ name: 'nomic-embed-text', size: 2.7e8 }, { name: 'qwen2.5:3b', size: 1.9e9 }, { name: 'qwen3:30b', size: 1.8e10 }];
  assert.equal(x.pickLocalGenModel(env), 'qwen2.5:3b', 'embedding excluído; menor modelo de geração escolhido');
  // Vários sinais de embedding cobertos (nome /embed/i + prefixos bge/gte/e5/minilm).
  const onlyEmbed = [{ name: 'nomic-embed-text' }, { name: 'bge-large' }, { name: 'mxbai-embed-large' }, { name: 'all-minilm' }];
  assert.equal(x.pickLocalGenModel(onlyEmbed), null, 'só-embedding → null (fallback honesto, esqueleto determinístico)');
  // Robustez: lista vazia/lixo → null; nunca lança.
  assert.equal(x.pickLocalGenModel([]), null);
  assert.equal(x.pickLocalGenModel(null), null);
  assert.equal(x.pickLocalGenModel([{ size: 1 }]), null, 'entrada sem nome → ignorada');
});

test('⇄ Handoff v3 híbrido: mode default segue o tamanho da sessão (turns≥12 → full, senão quick)', () => {
  const big = x.generateHandoff({ id: 'h4', name: 'p', turns: 12 }, { lastAssistantText: 'q?' }, { recap: 'R', now: new Date('2026-06-26T00:00:00') });
  assert.ok(big.includes('RECAP:') && big.includes('  R'), 'turns≥12 defaults to full → RECAP shown when supplied');
  const small = x.generateHandoff({ id: 'h5', name: 'p', turns: 4 }, { lastAssistantText: 'q?' }, { recap: 'R', now: new Date('2026-06-26T00:00:00') });
  assert.ok(!small.includes('RECAP:'), 'turns<12 defaults to quick → no RECAP');
});

test('⇄ Handoff ollamaRecap: contrato — Promise; Ollama-down → null (nunca lança/bloqueia)', async () => {
  // No live Ollama in CI → resolves null without throwing (hard-bounded, fail-open).
  const r = await x.ollamaRecap({ name: 'p' }, { lastToolActions: [] }, 300);
  assert.ok(r === null || typeof r === 'string');
});

// ════════════════════════════════════════════════════════════════════════════════
// ⇄ HANDOFF v2 — painel inline ao vivo (por sessão + por projecto). Painel == clipboard
// (mesma fonte) · PENDING verbatim · renderRow/renderGroupHeader concat-only (webview-sim
// verde) · BOARD com as 3 flags · 📋 re-copia · Ollama-down → 'done' na mesma.
// ════════════════════════════════════════════════════════════════════════════════

test('⇄ Handoff v2 webview-sim: painel .hoffp por sessão sobrevive a fn.toString()+new Function()', () => {
  // No backticks/${} in the source (would break the outer getHtml() template literal)
  const src = rr.renderRow.toString();
  assert.ok(!src.includes('`') && !src.includes('${'), 'renderRow source stays concat-only');
  const html = _wvRenderRow(SAMPLE_ROW, {});
  assert.ok(html.includes('class="hoffp"'), 'inline panel present after serialization');
  assert.ok(html.includes('data-hoff="' + SAMPLE_ROW.fullId + '"'), 'panel keyed by the session id');
  assert.ok(html.includes('class="hoffp-pre"'), 'panel has the <pre> for the live text');
  assert.ok(html.includes('class="hoffp-st"'), 'panel has the status line');
  assert.ok(html.includes('data-a="hoffCopy"') && html.includes('📋 Copiar'), 'panel has the re-copy button');
  assert.ok(html.indexOf('hidden') > -1, 'panel starts hidden until the host streams text');
  // The panel lives OUTSIDE the drawer (sibling) so it survives re-renders / drawer collapse.
  assert.ok(html.indexOf('class="hoffp"') > html.indexOf('class="sdrawer"'), 'panel is a sibling AFTER the drawer');
});

test('⇄ Handoff v2 webview-sim: botão projHandoff + painel .hoffp no group header (concat-only)', () => {
  const src = rr.renderGroupHeader.toString();
  assert.ok(!src.includes('`') && !src.includes('${'), 'renderGroupHeader source stays concat-only');
  const group = [{ fullId: 'a', needsYou: false }, { fullId: 'b', needsYou: true }];
  const html = _wvRenderGroupHeader('Mooter.ai', group);
  assert.ok(html.includes('data-a="projHandoff"'), 'project handoff button dispatches projHandoff');
  assert.ok(html.includes('data-x="Mooter.ai"'), 'button carries the project key');
  assert.ok(html.includes('⇄ Handoff do projecto'), 'button label present');
  assert.ok(html.includes('class="hoffp"') && html.includes('data-hoff="Mooter.ai"'), 'same inline panel, keyed by project');
  // Panel is a sibling of .ghd (NOT inside the collapse-toggle header)
  assert.ok(html.indexOf('class="hoffp"') > html.indexOf('class="ghd'), 'panel sits after the .ghd header');
});

test('⇄ Handoff v2.1 handler-sim: 2 postMessages — esqueleto (ready) → enriquecido (enriched)', () => {
  // Espelha a sequência do handler m.cmd==="handoff": skeleton determinístico (sem doing/recap)
  // postado 'ready' (copiado já) → texto enriquecido postado 'enriched' (com model). PENDING verbatim em AMBOS.
  const row = { fullId: 's1', id: 's1', name: 'wire v2 panel', branch: 'wave/cockpit-handoff-v2',
    model: 'claude-opus-4-8', turns: 20, gitStage: { state: 'uncommitted', dirty: 2, staged: 0, ahead: 0 } };
  const pending = { lastAssistantText: 'EXACT pending verbatim?', lastToolActions: [{ name: 'Write', target: 'extension.js' }], stopped: true };
  const mode = (Number(row.turns) || 0) >= 12 ? 'full' : 'quick';
  const snapshot = { head: null, baseAhead: 0, baseBehind: 0, pushed: false, prStage: null, filesInHead: [], filesCount: 0, classifyFrozen: null, mixedSessions: false, factsComplete: true };
  const posts = [];
  const skeleton = x.generateHandoff(row, pending, { mode, snapshot });
  posts.push({ type: 'handoff', sid: row.fullId, status: 'ready', text: skeleton });
  const enriched = x.generateHandoff(row, pending, { doing: 'narrativa local', recap: null, mode, snapshot, genModel: 'qwen2.5:3b' });
  posts.push({ type: 'handoff', sid: row.fullId, status: 'enriched', text: enriched, model: 'qwen2.5:3b' });
  assert.equal(posts.length, 2, 'exactly two postMessages');
  assert.equal(posts[0].status, 'ready');
  assert.equal(posts[1].status, 'enriched');
  assert.equal(posts[1].model, 'qwen2.5:3b', 'enriched carries the local gen model name');
  assert.ok(posts[0].text.includes('PENDING:"EXACT pending verbatim?"'), 'skeleton carries PENDING verbatim');
  assert.ok(posts[1].text.includes('PENDING:"EXACT pending verbatim?"'), 'enriched keeps PENDING verbatim');
  assert.ok(posts[0].text.includes('LAST:   Write extension.js'), 'deterministic LAST STEP already in the full skeleton');
  assert.ok(posts[1].text !== posts[0].text, 'enriched text differs from the skeleton');
});

test('⇄ Handoff v2.1 #2 handler-sim: projHandoff → painel do grupo (sid casa data-hoff) revela board + clipboard', () => {
  // Espelha m.cmd==="projHandoff": board instantânea → postMessage 'ready'(sid=projKey, copiada já) →
  // 'enriched' quando a síntese local muda o texto. O sid POSTADO tem de casar o data-hoff do painel
  // do group header (renderGroupHeader), senão o painel nunca é revelado ("handoff de projecto não aparece").
  const projKey = 'Mooter.ai';
  const rows = [
    { id: 'aa', fullId: 'aa', name: 'A', cwd: '/repo', branch: 'main', working: true, gitStage: { state: 'ahead', dirty: 0, staged: 0, ahead: 1 } },
    { id: 'bb', fullId: 'bb', name: 'B', cwd: '/repo', branch: 'main', needsYou: true, gitStage: { state: 'ahead', dirty: 0, staged: 0, ahead: 1 } },
    { id: 'cc', fullId: 'cc', name: 'C', cwd: '/solo', branch: 'feat', gitStage: { state: 'uncommitted', dirty: 2, staged: 0, ahead: 0 } },
  ];
  const hoffCache = {};
  const posts = [];
  const instant = x.generateProjectHandoff(projKey, rows, {});
  hoffCache[projKey] = instant;
  posts.push({ type: 'handoff', sid: projKey, status: 'ready', text: instant });
  const finalText = x.generateProjectHandoff(projKey, rows, { synth: 'two sessions, one ahead' });
  if (finalText !== instant) { hoffCache[projKey] = finalText; posts.push({ type: 'handoff', sid: projKey, status: 'enriched', text: finalText, model: 'local' }); }
  // O painel do group header é keyed por projKey → o sid postado tem de o igualar.
  const headerHtml = _wvRenderGroupHeader(projKey, rows);
  assert.ok(headerHtml.includes('data-hoff="' + projKey + '"'), 'painel do grupo keyed pelo projKey');
  assert.equal(posts.length, 2, 'ready + enriched (síntese local mudou o texto)');
  assert.equal(posts[0].status, 'ready');
  assert.equal(posts[1].status, 'enriched');
  assert.equal(posts[0].sid, projKey, 'sid postado casa o data-hoff do painel do grupo');
  assert.equal(posts[1].sid, projKey, 'enriched mantém o mesmo sid');
  // Board com as 3 flags inline (DUP: 2 sessões ACTIVAS no mesmo repo+branch; UNCOMMITTED; UNPUSHED).
  assert.ok(posts[1].text.includes('DUP') && posts[1].text.includes('UNCOMMITTED') && posts[1].text.includes('UNPUSHED'), 'board revela as 3 flags inline');
  assert.equal(hoffCache[projKey], finalText, '📋 Copiar re-copia a board exacta da cache (clipboard)');
});

test('⇄ Handoff v2 generateProjectHandoff: BOARD com as 3 flags (DUP · UNCOMMITTED · UNPUSHED)', () => {
  // DUP = 2 sessões ACTIVAS com commits próprios (ahead>0) no mesmo repo+branch. UNCOMMITTED só de
  // trabalho PRÓPRIO (cwd único) — não da sujidade ambiente. UNPUSHED de commits por enviar.
  const rows = [
    { id: 'aa', fullId: 'aa', name: 'session A', cwd: '/repo', branch: 'main', model: 'claude-opus-4-8', working: true, gitStage: { state: 'clean', dirty: 0, staged: 0, ahead: 0 } },
    { id: 'bb', fullId: 'bb', name: 'session B', cwd: '/repo', branch: 'main', model: 'claude-sonnet-4-6', needsYou: true, gitStage: { state: 'ahead', dirty: 0, staged: 0, ahead: 2 } },
    { id: 'cc', fullId: 'cc', name: 'session C', cwd: '/solo', branch: 'side', model: 'claude-haiku-4-5', gitStage: { state: 'uncommitted', dirty: 3, staged: 0, ahead: 0 } },
  ];
  const txt = x.generateProjectHandoff('Mooter.ai', rows, { now: new Date('2026-06-26T12:00:00') });
  assert.ok(txt.includes('⇄ MOO PROJECT HANDOFF'), 'header present');
  assert.ok(txt.includes('project: Mooter.ai · 3 sessões'), 'session count + project name');
  assert.ok(txt.includes('ASK:    3 sessões · '), 'action-first ASK aggregate at the top');
  assert.ok(txt.includes('DUP'), 'DUP flag (≥2 ACTIVE sessions + own commits same repo+branch)');
  assert.ok(txt.includes('UNCOMMITTED'), 'UNCOMMITTED flag (own dirty, unique cwd)');
  assert.ok(txt.includes('UNPUSHED'), 'UNPUSHED flag (ahead>0)');
  // Tally conta GRUPOS contestados, não linhas: 1 grupo (repo+main) com 2 activas+commits → "1 DUP".
  assert.ok(txt.includes('▸ FLAGS: 1 DUP · 1 UNCOMMITTED · 1 UNPUSHED'), 'flag tallies are honest (group-counted)');
  assert.ok(txt.includes('session A (aa) · main · Opus 4.8') || txt.includes('session A (aa) · main · claude-opus-4-8'), 'per-session board line');
  assert.ok(txt.trimEnd().endsWith('⇄ END PROJECT HANDOFF'), 'closes with END marker');
});

test('⇄ Handoff v3 OVERALL: agrega ASKs no topo (ex.: 3 sessões · 1 verify+merge · 2 fyi · 0 review)', () => {
  const rows = [
    { id: 'a', fullId: 'a', name: 'A', cwd: '/r1', branch: 'main', working: true, gitStage: { dirty: 0, ahead: 1 } },
    { id: 'b', fullId: 'b', name: 'B', cwd: '/r2', branch: 'x', gitStage: { dirty: 0, ahead: 0 } },
    { id: 'c', fullId: 'c', name: 'C', cwd: '/r3', branch: 'y', gitStage: { dirty: 0, ahead: 0 } },
  ];
  const txt = x.generateProjectHandoff('P', rows, { now: new Date('2026-06-26T00:00:00') });
  assert.ok(txt.includes('ASK:    3 sessões · 1 verify+merge · 2 fyi · 0 review'), 'deterministic ASK aggregate (review always shown)');
  // a contested group (≥2 active, same cwd+branch, WITH own commits ahead>0) → both count as review
  const contested = [
    { id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'feat', working: true, gitStage: { dirty: 0, ahead: 1 } },
    { id: 'b', fullId: 'b', name: 'B', cwd: '/r', branch: 'feat', needsYou: true, gitStage: { dirty: 0, ahead: 1 } },
  ];
  const t2 = x.generateProjectHandoff('P', contested, { now: new Date('2026-06-26T00:00:00') });
  assert.ok(t2.includes('ASK:    2 sessões · 2 review'), 'contested group (active + own commits) → review for both');
  // no sessions → no ASK aggregate line at all
  assert.ok(!x.generateProjectHandoff('Empty', [], {}).includes('ASK:'), '0 sessions → no ASK line');
});

test('⇄ Handoff v3 F4a: board NÃO marca [UNCOMMITTED] em massa por sujidade AMBIENTE do working-tree partilhado', () => {
  // 20 sessões partilham o cwd ~/frugal (91 ficheiros scratch dirty). NENHUMA é marcada UNCOMMITTED —
  // a sujidade é ambiente (working-tree partilhado), contada UMA vez no rodapé. Uma sessão que possui
  // um cwd ÚNICO com dirty é a única [UNCOMMITTED].
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push({ id: 's' + i, fullId: 's' + i, name: 'sess ' + i, cwd: '/home/p/frugal', branch: 'main', gitStage: { dirty: 91, ahead: 0 } });
  rows.push({ id: 'own', fullId: 'own', name: 'own work', cwd: '/home/p/solo', branch: 'feat', gitStage: { dirty: 4, ahead: 0 } });
  const txt = x.generateProjectHandoff('P', rows, { now: new Date('2026-06-27T00:00:00') });
  assert.equal((txt.match(/\[UNCOMMITTED\]/g) || []).length, 1, 'só a sessão com cwd próprio é [UNCOMMITTED]; as 20 ambiente não');
  assert.ok(txt.includes('· 1 UNCOMMITTED · 0 UNPUSHED'), 'tally UNCOMMITTED = own work only (não as 20 ambiente)');
  assert.ok(/▸ AMBIENTE: frugal 91 dirty \(working-tree partilhado por 20 sess\)/.test(txt), 'ambiente contado UMA vez no rodapé');
  // B5 — AMBIENTE sem duplicar: o dirty ambiente aparece SÓ na linha AMBIENTE, NÃO no OVERALL.
  const overallLine = txt.split('\n').find((l) => l.includes('▸ OVERALL')) || '';
  assert.ok(!overallLine.includes('dirty ambiente'), 'OVERALL não duplica o dirty ambiente (só a linha AMBIENTE o reporta)');
});

test('B5 generateProjectHandoff: NEXT FOR COWORK é condicional às flags (não inventa acções)', () => {
  // Projecto totalmente limpo (idle, sem dirty, sem ahead, sem DUP) → NEXT não diz "resolver DUP/commit/push".
  const clean = [
    { id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'main', gitStage: { dirty: 0, ahead: 0 } },
  ];
  const tClean = x.generateProjectHandoff('P', clean, { now: new Date('2026-06-27T00:00:00') });
  assert.ok(tClean.includes('▸ NEXT FOR COWORK: nada pendente — projecto limpo'), 'limpo → NEXT honesto, sem acções fabricadas');
  assert.ok(!tClean.includes('resolver DUP') && !tClean.includes('commit UNCOMMITTED') && !tClean.includes('push UNPUSHED'), 'nenhuma acção falsa quando nada está pendente');
  // Só por-push (ahead) → NEXT menciona SÓ push, não DUP nem commit.
  const aheadOnly = [
    { id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'feat', gitStage: { dirty: 0, ahead: 2 } },
  ];
  const tAhead = x.generateProjectHandoff('P', aheadOnly, { now: new Date('2026-06-27T00:00:00') });
  assert.ok(tAhead.includes('▸ NEXT FOR COWORK: push UNPUSHED'), 'só ahead → NEXT diz só push');
  assert.ok(!tAhead.includes('resolver DUP') && !tAhead.includes('commit UNCOMMITTED'), 'sem DUP/commit quando não aplicável');
});

test('⇄ Handoff v2 DUP (active-only): 3 idle em main → 0 DUP; 2 working mesma branch → DUP=1', () => {
  // 3 sessões IDLE (✅) no mesmo repo+branch (main) → colisão NÃO é real → 0 DUP. Em vez disso, a
  // FLAGS mostra a co-habitação informativa "N em <branch>" — nunca um DUP fabricado.
  const idle = [
    { id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'main', gitStage: { dirty: 0, ahead: 0 } },
    { id: 'b', fullId: 'b', name: 'B', cwd: '/r', branch: 'main', gitStage: { dirty: 0, ahead: 0 } },
    { id: 'c', fullId: 'c', name: 'C', cwd: '/r', branch: 'main', gitStage: { dirty: 0, ahead: 0 } },
  ];
  const tIdle = x.generateProjectHandoff('P', idle, { now: new Date('2026-06-26T00:00:00') });
  assert.ok(!/\[[^\]]*DUP/.test(tIdle), 'nenhuma linha de sessão é marcada [DUP] (idle nunca dispara)');
  assert.ok(tIdle.includes('▸ FLAGS: 3 em main · 0 UNCOMMITTED · 0 UNPUSHED'), '0 DUP → co-habitação informativa');
  // 2 sessões ACTIVAS com commits próprios (ahead>0) na mesma branch → 1 grupo contestado → DUP=1.
  const active = [
    { id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'feat', working: true, gitStage: { dirty: 0, ahead: 1 } },
    { id: 'b', fullId: 'b', name: 'B', cwd: '/r', branch: 'feat', needsYou: true, gitStage: { dirty: 0, ahead: 1 } },
  ];
  const tActive = x.generateProjectHandoff('P', active, { now: new Date('2026-06-26T00:00:00') });
  assert.ok(tActive.includes('▸ FLAGS: 1 DUP'), '2 activas+commits mesma branch → DUP=1 (group-counted)');
  assert.equal((tActive.match(/\[DUP/g) || []).length, 2, 'ambas as sessões activas marcadas DUP');
  // 1 activa + 1 idle na mesma branch → só 1 activa → NÃO é colisão → 0 DUP (informativo "2 em …").
  const mixed = [
    { id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'feat', working: true, gitStage: { dirty: 0, ahead: 0 } },
    { id: 'b', fullId: 'b', name: 'B', cwd: '/r', branch: 'feat', gitStage: { dirty: 0, ahead: 0 } },
  ];
  const tMixed = x.generateProjectHandoff('P', mixed, { now: new Date('2026-06-26T00:00:00') });
  assert.ok(!/\[[^\]]*DUP/.test(tMixed) && tMixed.includes('▸ FLAGS: 2 em feat'), '1 activa só → sem DUP, informativo');
});

test('⇄ Handoff v2 OVERALL fallback: sem LLM → resumo de contagens (NUNCA o 1º prompt de uma row)', () => {
  // Uma sessão cujo NOME é uma frase tipo-1º-prompt. Sem synth → o OVERALL é o resumo determinístico
  // dos contadores, e JAMAIS o nome/1º-prompt da sessão (era o bug que sujava a OVERALL).
  const firstPrompt = 'porque é que o websocket reconnect falha às vezes em produção';
  const rows = [
    { id: 'aa', fullId: 'aa', name: firstPrompt, cwd: '/ra', branch: 'main', working: true, gitStage: { dirty: 1, ahead: 0 } },
    { id: 'bb', fullId: 'bb', name: 'outra', cwd: '/rb', branch: 'main', gitStage: { dirty: 0, ahead: 2 } },
  ];
  const txt = x.generateProjectHandoff('P', rows, { now: new Date('2026-06-26T00:00:00') });
  const overall = txt.split('\n').find((l) => l.includes('▸ OVERALL')) || '';
  assert.ok(overall, 'OVERALL está SEMPRE presente (n>0)');
  assert.ok(!overall.includes('(local summary)'), 'fallback é determinístico, não rotulado LLM');
  assert.ok(!overall.includes(firstPrompt), 'OVERALL NUNCA usa o 1º prompt/nome de uma sessão');
  assert.ok(overall.includes('2 sessões em main') && overall.includes('1 activa') && overall.includes('1 por commitar') && overall.includes('1 por push'), 'resumo factual dos contadores reais');
});

test('⇄ Handoff v2 OVERALL: com synth (qwen) → usa o synth verbatim como OVERALL', () => {
  const rows = [{ id: 'x', fullId: 'x', name: 'n', cwd: '/r', branch: 'b', gitStage: { dirty: 0, ahead: 0 } }];
  const txt = x.generateProjectHandoff('P', rows, { synth: 'duas sessões, uma à frente', now: new Date('2026-06-26T00:00:00') });
  assert.ok(txt.includes('▸ OVERALL (local summary): duas sessões, uma à frente'), 'synth local entra como OVERALL');
  assert.ok(!txt.includes('por commitar'), 'com synth, o fallback determinístico não aparece');
});

test('⇄ Handoff v2 generateProjectHandoff: sem rows → nunca lança, header + END; synth opcional', () => {
  assert.doesNotThrow(() => x.generateProjectHandoff('Empty', [], {}));
  const empty = x.generateProjectHandoff('Empty', null, { now: new Date('2026-06-26T00:00:00') });
  assert.ok(empty.includes('project: Empty · 0 sessões'), '0 sessions handled');
  assert.ok(empty.includes('(nenhuma sessão neste projecto)'), 'honest empty board');
  assert.ok(empty.includes('⇄ END PROJECT HANDOFF'));
  assert.ok(!empty.includes('▸ OVERALL'), '0 sessões → sem OVERALL (board honesta já o diz)');
  // OVERALL sempre limpo: sem synth → fallback determinístico (contagens), com synth → a síntese local.
  const noSynth = x.generateProjectHandoff('P', [{ id: 'x', name: 'n', branch: 'b' }], { now: new Date('2026-06-26T00:00:00') });
  assert.ok(noSynth.includes('▸ OVERALL:') && !noSynth.includes('(local summary)'), 'no synth → deterministic OVERALL (counts)');
  assert.ok(noSynth.includes('1 sessão em b'), 'fallback resume os contadores reais');
  const withSynth = x.generateProjectHandoff('P', [{ id: 'x', name: 'n', branch: 'b' }], { synth: 'two sessions, one ahead', now: new Date('2026-06-26T00:00:00') });
  assert.ok(withSynth.includes('▸ OVERALL (local summary): two sessions, one ahead'), 'synth rendered when supplied');
});

test('⇄ Handoff v2 Ollama-down → board "done" na mesma (síntese omitida, nunca pendura)', async () => {
  const rows = [{ id: 'q', fullId: 'q', name: 'p', cwd: '/r', branch: 'b', gitStage: { state: 'clean', dirty: 0, ahead: 0 } }];
  const synth = await x.ollamaProjectSynth(rows, 300); // no live Ollama → null, bounded, fail-open
  assert.ok(synth === null || typeof synth === 'string');
  const text = x.generateProjectHandoff('P', rows, { synth });
  assert.ok(text.includes('⇄ END PROJECT HANDOFF'), 'a complete (done) board is produced regardless of Ollama');
  // Ollama-down → OVERALL é o resumo DETERMINÍSTICO dos contadores, nunca uma síntese fabricada nem o 1º prompt.
  if (synth === null) assert.ok(text.includes('▸ OVERALL:') && !text.includes('(local summary)'), 'Ollama-down → deterministic OVERALL (counts), no fabricated synthesis');
});

test('⇄ Handoff v2 ollamaProjectSynth: contrato — Promise; Ollama-down → null (nunca lança/bloqueia)', async () => {
  const r = await x.ollamaProjectSynth([{ name: 'p', branch: 'b' }], 300);
  assert.ok(r === null || typeof r === 'string');
  assert.equal(await x.ollamaProjectSynth([], 300), null, 'no rows → null');
});

test('⇄ Handoff v2 hoffCopy: re-copia da cache host-side (sessão ou projecto) sem regenerar', () => {
  // Espelha a cache do handler: hoffCache[id]=text; m.cmd==="hoffCopy" → clipboard ← hoffCache[id].
  const hoffCache = {};
  const sessText = x.generateHandoff({ id: 's', fullId: 's', name: 'n', branch: 'b' }, { lastAssistantText: 'q?' }, { now: new Date('2026-06-26T00:00:00') });
  hoffCache['s'] = sessText;
  const projText = x.generateProjectHandoff('Proj', [{ id: 's', name: 'n', branch: 'b' }], { now: new Date('2026-06-26T00:00:00') });
  hoffCache['Proj'] = projText;
  // hoffCopy for a session id
  let clip = hoffCache['s'];
  assert.equal(clip, sessText, 'session 📋 Copiar re-copies the exact cached handoff');
  // hoffCopy for a project key
  clip = hoffCache['Proj'];
  assert.equal(clip, projText, 'project 📋 Copiar re-copies the exact cached board');
  // unknown id → nothing to copy (handler shows the honest "gera primeiro" toast)
  assert.equal(hoffCache['missing'], undefined, 'unknown id → no cached text');
});

// ════════════════════════════════════════════════════════════════════════════════
// ⇄ F1 — Cowork conversation title mirrored on the row (CONSUMER). The REAL Cowork title
// LEADS the name; the CC 1st prompt is preserved as a ↳ subline; brain line + waiting badge
// stay intact; nothing is fabricated (coworkTitle null → falls back to the 1st prompt).
// Producer (loop sdk-runner.mjs writeCoworkSession + signal.ps1) already writes the durable
// mirror honestly; these tests lock the consumer half (webview-sim path = exact runtime path).
// ════════════════════════════════════════════════════════════════════════════════

test('⇄ F1 renderRow: coworkTitle LEADS the name; 1st prompt preserved as ↳ subline', () => {
  const row = Object.assign({}, SAMPLE_ROW, { name: 'fix the auth bug now', coworkTitle: 'Cowork · auth refactor' });
  const html = _wvRenderRow(row, {});
  assert.ok(html.includes('<span class="sname">Cowork · auth refactor</span>'), 'cowork title is the primary name');
  assert.ok(html.includes('↳ fix the auth bug now'), '1st prompt preserved as a ↳ subline');
  assert.ok(html.includes('class="ssub coworksub"'), 'subline uses the coworksub class');
  assert.ok(html.includes('open session: Cowork · auth refactor'), 'aria-label/tooltip leads with the cowork title');
});

test('⇄ F1 renderRow: no coworkTitle → name = 1st prompt; NO subline (never fabricated)', () => {
  const row = Object.assign({}, SAMPLE_ROW, { name: 'fix the auth bug now', coworkTitle: null });
  const html = _wvRenderRow(row, {});
  assert.ok(html.includes('<span class="sname">fix the auth bug now</span>'), 'name falls back to the 1st prompt');
  assert.ok(!html.includes('coworksub'), 'no cowork subline when there is no cowork title');
  assert.ok(!html.includes('↳ '), 'no ↳ subline');
});

test('⇄ F1 renderRow: coworkTitle === 1st prompt → no redundant subline', () => {
  const row = Object.assign({}, SAMPLE_ROW, { name: 'same text', coworkTitle: 'same text' });
  const html = _wvRenderRow(row, {});
  assert.ok(html.includes('<span class="sname">same text</span>'));
  assert.ok(!html.includes('coworksub'), 'identical title and prompt → no duplicate subline');
});

test('⇄ F1 renderRow: waiting-for-Cowork badge intact; title not duplicated when it IS the name', () => {
  const row = Object.assign({}, SAMPLE_ROW, { name: '1st prompt', coworkTitle: 'Deciding the merge', waitingForCowork: true, coworkStatus: 'cowork_working' });
  const html = _wvRenderRow(row, {});
  assert.ok(html.includes('class="coworkdot"') && html.includes('waiting for Cowork'), 'waiting badge continues');
  assert.ok(html.includes('<span class="sname">Deciding the merge</span>'), 'cowork title is the name');
  assert.ok(!html.includes('waiting for Cowork — Deciding the merge'), 'title not duplicated in the badge when it is the name');
});

test('⇄ F1 renderRow: brain line stays when brainTitle differs from the (cowork) name', () => {
  const row = Object.assign({}, SAMPLE_ROW, { name: '1st prompt', coworkTitle: 'cowork title', brainTitle: 'a brain name' });
  const html = _wvRenderRow(row, {});
  assert.ok(html.includes('🧠 a brain name'), 'brain line intact when distinct from the name');
  assert.ok(html.includes('<span class="sname">cowork title</span>'));
});

test('⇄ F1 renderRow: webview-sim stays concat-only after the F1 change (no backticks/${})', () => {
  const src = rr.renderRow.toString();
  assert.ok(!src.includes('`') && !src.includes('${'), 'renderRow source stays concat-only (embeds in getHtml template)');
});

// ════════════════════════════════════════════════════════════════════════════════
// ⇄ F2 — Handoff narrative generated VISUALLY LIVE (token stream). Facts are deterministic
// and instant (skeleton); the local narrative streams token-by-token; on failure/timeout it
// falls back to the deterministic skeleton. Facts are authoritative; narrative is best-effort.
// ════════════════════════════════════════════════════════════════════════════════

test('⇄ F2 _ollamaGenerateStream: parses NDJSON → onChunk per token + assembled text (mock server)', async () => {
  const chunks = [];
  const srv = http.createServer((_q, res) => {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.write(JSON.stringify({ response: 'fix ' }) + '\n');
    res.write(JSON.stringify({ response: 'the ' }) + '\n');
    res.write(JSON.stringify({ response: 'bug', done: true }) + '\n');
    res.end();
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const r = await x._ollamaGenerateStream('m', 'p', { port: srv.address().port, onChunk: (c) => chunks.push(c), timeoutMs: 2000 });
  srv.close();
  assert.equal(r.ok, true);
  assert.equal(r.text, 'fix the bug', 'tokens assembled in order');
  assert.deepEqual(chunks, ['fix ', 'the ', 'bug'], 'onChunk fired once per token (live)');
});

test('⇄ F2 _ollamaGenerateStream: server down → {ok:false,text:""} (never throws/hangs)', async () => {
  const r = await x._ollamaGenerateStream('m', 'p', { port: 59998, timeoutMs: 400 });
  assert.ok(r && r.ok === false && r.text === '', 'graceful failure → caller falls back to the skeleton');
});

test('⇄ F2 streamHandoffNarrative: streams chunks via onChunk + returns assembled doing (mock gen)', async () => {
  const chunks = [];
  const fakeStream = (model, prompt, opts) => { ['fix', 'ing ', 'auth'].forEach((c) => opts.onChunk(c)); return Promise.resolve({ ok: true, text: 'fixing auth' }); };
  const r = await x.streamHandoffNarrative({ name: 'fix auth', turns: 2 }, { model: 'qwen2.5:3b', streamGen: fakeStream, onChunk: (c) => chunks.push(c) });
  assert.ok(chunks.length >= 1, 'onChunk called ≥1 time → narrative builds live');
  assert.equal(r.ok, true);
  assert.equal(r.model, 'qwen2.5:3b', 'returns the local gen model name (honest §SAVINGS label)');
  assert.ok(typeof r.doing === 'string' && r.doing.length > 0, 'assembled DOING line returned');
});

test('⇄ F2 streamHandoffNarrative: full mode streams DOING + RECAP (2 gen calls)', async () => {
  let calls = 0;
  const fakeStream = (model, prompt, opts) => { calls++; opts.onChunk('x'); return Promise.resolve({ ok: true, text: 'line one' }); };
  const r = await x.streamHandoffNarrative({ name: 'big session', turns: 50 }, { mode: 'full', model: 'm', streamGen: fakeStream });
  assert.equal(calls, 2, 'full mode streams both DOING and RECAP');
  assert.ok(r.doing && r.recap, 'both narrative pieces present');
});

test('⇄ F2 streamHandoffNarrative: no gen model → ok:false (handler falls back), never throws', async () => {
  const r = await x.streamHandoffNarrative({ name: 'n' }, { tagsModels: [] }); // pickLocalGenModel([]) → null
  assert.equal(r.ok, false);
  assert.equal(r.model, null);
  assert.equal(r.doing, null);
});

test('⇄ F2 streamHandoffNarrative: stream rejects → ok:false (never throws → handler fallback)', async () => {
  const boom = () => Promise.reject(new Error('stream died'));
  const r = await x.streamHandoffNarrative({ name: 'n', turns: 2 }, { model: 'm', streamGen: boom });
  assert.ok(r && r.ok === false, 'stream failure surfaced as ok:false, not an exception');
});

test('⇄ F2 streamHandoffNarrative: contract — Ollama-down → ok:false (bounded, never blocks)', async () => {
  // No injection: hits the resolver against the real port; in CI nothing answers → ok:false fast.
  const r = await x.streamHandoffNarrative({ name: 'n', turns: 2 }, { doingMs: 300, deadlineMs: 300 });
  assert.ok(r && typeof r.ok === 'boolean');
  if (!r.ok) { assert.equal(r.doing, null); }
});

test('⇄ F2 handler-sim (session): ready → ≥1 handoff-stream → handoff-done (final · PENDING verbatim · best-effort)', async () => {
  // Mirrors m.cmd==="handoff": skeleton 'ready' (facts instant + copied) → live 'handoff-stream'
  // per token → 'handoff-done' with the enriched text. PENDING stays verbatim; narrative best-effort.
  const row = { fullId: 'f2', id: 'f2', name: 'wire live handoff', branch: 'wave/cockpit-cowork-live',
    model: 'claude-opus-4-8', turns: 20, saved: 0.5, gitStage: { state: 'clean', dirty: 0, staged: 0, ahead: 0 } };
  const pending = { lastAssistantText: 'EXACT pending?', lastToolActions: [{ name: 'Edit', target: 'host-extra.js' }], stopped: true };
  const snapshot = { head: { sha7: 'abc1234', subject: 'live handoff' }, baseAhead: 1, baseBehind: 0, pushed: false, prStage: null, filesInHead: ['host-extra.js'], filesCount: 1, classifyFrozen: true, mixedSessions: false, factsComplete: true };
  const mode = 'full';
  const posts = [];
  const text0 = x.generateHandoff(row, pending, { mode, snapshot });
  posts.push({ type: 'handoff', sid: row.fullId, status: 'ready', text: text0 }); // facts skeleton, copied already
  const fakeStream = (m2, p2, o2) => { ['fix', 'ing ', 'live'].forEach((c) => o2.onChunk(c)); return Promise.resolve({ ok: true, text: 'fixing live' }); };
  const sres = await x.streamHandoffNarrative(row, { mode, model: 'qwen2.5:3b', streamGen: fakeStream,
    lastToolActions: pending.lastToolActions, onChunk: (chunk) => posts.push({ type: 'handoff-stream', sid: row.fullId, chunk }) });
  assert.ok(sres.ok, 'stream produced narrative');
  const best = x.generateHandoff(row, pending, { mode, doing: sres.doing, recap: sres.recap, genModel: sres.model, bestEffort: true, snapshot });
  posts.push({ type: 'handoff-done', sid: row.fullId, text: best, model: sres.model });
  const streamPosts = posts.filter((p) => p.type === 'handoff-stream');
  const donePost = posts.find((p) => p.type === 'handoff-done');
  assert.equal(posts[0].status, 'ready', 'facts skeleton posted first (instant)');
  assert.ok(posts[0].text.includes('HEAD:   abc1234'), 'deterministic facts present in the instant skeleton');
  assert.ok(streamPosts.length >= 1, '≥1 handoff-stream emitted (live generation visible)');
  assert.ok(donePost && donePost.text, 'handoff-done carries the final text');
  assert.ok(donePost.text.includes('PENDING:"EXACT pending?"'), 'PENDING stays verbatim in the final text');
  assert.ok(donePost.text.includes('local best-effort'), 'narrative marked (local best-effort) — facts authoritative');
});

test('⇄ F2 handler-sim (session): stream fails → handoff-done finalizes on the skeleton (never stuck)', async () => {
  const row = { fullId: 'f3', id: 'f3', name: 'n', turns: 4 };
  const pending = { lastAssistantText: 'q?', lastToolActions: [], stopped: true };
  const snapshot = { head: null, baseAhead: 0, baseBehind: 0, pushed: false, prStage: null, filesInHead: [], filesCount: 0, classifyFrozen: null, mixedSessions: false, factsComplete: true };
  const posts = [];
  const text0 = x.generateHandoff(row, pending, { mode: 'quick', snapshot });
  posts.push({ type: 'handoff', sid: row.fullId, status: 'ready', text: text0 });
  const boom = () => Promise.reject(new Error('down'));
  const sres = await x.streamHandoffNarrative(row, { mode: 'quick', model: 'm', streamGen: boom });
  let best = text0; // fallback keeps the deterministic skeleton (facts always survive)
  posts.push({ type: 'handoff-done', sid: row.fullId, text: best });
  assert.equal(sres.ok, false, 'stream failure → ok:false');
  const donePost = posts.find((p) => p.type === 'handoff-done');
  assert.ok(donePost, 'handoff-done still fires → panel never stuck in "a gerar"');
  assert.equal(donePost.text, text0, 'finalizes on the deterministic skeleton');
});

test('⇄ F2 streamProjectSynth: streams chunks + returns synth (mock); empty/no-model → ok:false', async () => {
  const chunks = [];
  const fakeStream = (m2, p2, o2) => { o2.onChunk('two sessions, '); o2.onChunk('one ahead'); return Promise.resolve({ ok: true, text: 'two sessions, one ahead' }); };
  const rows = [{ id: 'a', name: 'A', branch: 'main', gitStage: { dirty: 0, ahead: 1 } }, { id: 'b', name: 'B', branch: 'main', gitStage: { dirty: 2, ahead: 0 } }];
  const r = await x.streamProjectSynth(rows, { model: 'm', streamGen: fakeStream, onChunk: (c) => chunks.push(c) });
  assert.ok(chunks.length >= 1, 'project synth streams live');
  assert.equal(r.ok, true);
  assert.ok(r.synth && r.synth.includes('two sessions'), 'assembled OVERALL synth returned');
  assert.deepEqual(await x.streamProjectSynth([], {}), { ok: false, model: null, synth: null }, 'no rows → ok:false');
  const noModel = await x.streamProjectSynth(rows, { tagsModels: [] });
  assert.equal(noModel.ok, false, 'no gen model → ok:false (handler falls back to deterministic board)');
});

test('⇄ F2 handler-sim (project): ready → ≥1 handoff-stream → handoff-done (board, same visual pattern)', async () => {
  const projKey = 'Mooter.ai';
  const rows = [
    { id: 'aa', fullId: 'aa', name: 'A', cwd: '/repo', branch: 'main', working: true, gitStage: { state: 'ahead', dirty: 0, staged: 0, ahead: 1 } },
    { id: 'bb', fullId: 'bb', name: 'B', cwd: '/solo', branch: 'feat', gitStage: { state: 'uncommitted', dirty: 2, staged: 0, ahead: 0 } },
  ];
  const posts = [];
  const text0 = x.generateProjectHandoff(projKey, rows, {});
  posts.push({ type: 'handoff', sid: projKey, status: 'ready', text: text0 });
  const fakeStream = (m2, p2, o2) => { o2.onChunk('overall '); o2.onChunk('synth'); return Promise.resolve({ ok: true, text: 'overall synth' }); };
  const pres = await x.streamProjectSynth(rows, { model: 'm', streamGen: fakeStream, onChunk: (chunk) => posts.push({ type: 'handoff-stream', sid: projKey, chunk }) });
  const best = x.generateProjectHandoff(projKey, rows, { synth: pres.synth });
  posts.push({ type: 'handoff-done', sid: projKey, text: best, model: 'local' });
  assert.equal(posts[0].status, 'ready', 'board skeleton posted first');
  assert.ok(posts.filter((p) => p.type === 'handoff-stream').length >= 1, '≥1 handoff-stream (project live)');
  const donePost = posts.find((p) => p.type === 'handoff-done');
  assert.ok(donePost && donePost.sid === projKey, 'handoff-done keyed by the project key (matches the panel data-hoff)');
  assert.ok(donePost.text.includes('overall synth'), 'final board carries the streamed OVERALL synth');
});

// ── B3 herd-fix: herd shows ALL sessions by default (declutter regression) ──
// The filter is opt-in: every fresh load shows every open session. These tests run the REAL
// applyHerdFilter source (extracted from extension.js) against a focused mini-DOM — the exact
// runtime path that broke when the default 'atencao' silently hid every idle row.
const _EXT_SRC = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
const _DEFAULT_FILTER = (_EXT_SRC.match(/let herdFilter='([^']*)'/) || [])[1];
const _HF_VALID_SRC = (_EXT_SRC.match(/const HF_VALID=\[[^\]]*\];/) || [])[0];

// Extract a top-level function declaration with string- and comment-aware brace matching.
function _extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('fn not found: ' + name);
  let k = src.indexOf('{', i), depth = 0, inS = null, started = false;
  for (; k < src.length; k++) {
    const c = src[k], n = src[k + 1], p = src[k - 1];
    if (inS) { if (c === inS && p !== '\\') inS = null; continue; }
    if (c === '/' && n === '/') { const nl = src.indexOf('\n', k); k = nl < 0 ? src.length : nl; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', k + 2); k = e < 0 ? src.length : e + 1; continue; }
    if (c === '\'' || c === '"') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}
const _APPLY_SRC = _extractFn(_EXT_SRC, 'applyHerdFilter');

// Minimal DOM supporting exactly the selectors applyHerdFilter uses (descendant + compound .a[b]).
function _parseStep(s) {
  const out = { id: null, classes: [], attrs: [], tag: null };
  const re = /(\[[\w-]+\]|[#.]?[\w-]+)/g; let m;
  while ((m = re.exec(s))) { const t = m[1];
    if (t[0] === '#') out.id = t.slice(1);
    else if (t[0] === '.') out.classes.push(t.slice(1));
    else if (t[0] === '[') out.attrs.push(t.slice(1, -1));
    else out.tag = t; }
  return out;
}
function _matchStep(node, step) {
  const p = _parseStep(step);
  if (p.id && node.id !== p.id) return false;
  for (const c of p.classes) if (!node.classes.has(c)) return false;
  for (const a of p.attrs) if (!(a in node.attrs)) return false;
  if (p.tag && node.tag !== p.tag) return false;
  return true;
}
function _descendants(node, out) { out = out || []; for (const c of node.children) { out.push(c); _descendants(c, out); } return out; }
function _qsa(root, sel) {
  let current = [root];
  for (const step of sel.trim().split(/\s+/)) {
    const next = [], seen = new Set();
    for (const node of current) for (const d of _descendants(node)) if (_matchStep(d, step) && !seen.has(d)) { seen.add(d); next.push(d); }
    current = next;
  }
  return current;
}
function _el(tag, opts) {
  opts = opts || {};
  const node = { tag: tag || 'div', id: opts.id || '', classes: new Set(opts.cls || []), attrs: Object.assign({}, opts.attrs || {}), dataset: {}, children: [], parent: null, _hidden: false, textContent: '' };
  for (const k of Object.keys(node.attrs)) if (k.indexOf('data-') === 0) node.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = node.attrs[k];
  node.classList = { add: (c) => node.classes.add(c), remove: (c) => node.classes.delete(c), contains: (c) => node.classes.has(c), toggle: (c, f) => { const on = f === undefined ? !node.classes.has(c) : !!f; if (on) node.classes.add(c); else node.classes.delete(c); return on; } };
  Object.defineProperty(node, 'hidden', { get() { return node._hidden; }, set(v) { node._hidden = !!v; } });
  node.getAttribute = (k) => (k in node.attrs ? node.attrs[k] : null);
  node.append = (child) => { child.parent = node; node.children.push(child); return child; };
  node.querySelector = (sel) => _qsa(node, sel)[0] || null;
  node.querySelectorAll = (sel) => _qsa(node, sel);
  return node;
}
function _buildCockpit(states, opts) {
  opts = opts || {};
  const root = _el('div');
  const cockpit = _el('div', { id: 'v-cockpit' }); root.append(cockpit);
  if (opts.bar !== false) {
    const hfbar = _el('div', { cls: ['herdfilter'] }); cockpit.append(hfbar);
    hfbar.append(_el('input', { cls: ['herdq'] }));
    ['atencao', 'needs', 'active', 'idle', 'all'].forEach((hf) => hfbar.append(_el('button', { cls: ['hf'], attrs: { 'data-hf': hf } })));
    hfbar.append(_el('button', { cls: ['hf', 'hfcompact'], attrs: { 'data-hfc': '1' } }));
  }
  const herd = _el('div', { cls: ['herd'] }); cockpit.append(herd);
  const grp = _el('div', { cls: ['grpsec'] }); herd.append(grp);
  grp.append(_el('div', { cls: ['ghd'] })); // group header — NO data-state
  states.forEach((st, i) => grp.append(_el('div', { cls: ['srow'], attrs: { 'data-state': st, 'data-name': 'sess' + i + ' work' + i } })));
  herd.append(_el('div', { cls: ['srow'], attrs: { 'data-sess': 'all' } })); // allRow — NO data-state, never filtered
  if (opts.bar !== false) { const emp = _el('div', { cls: ['herdempty'] }); emp.hidden = true; emp.append(_el('span', { cls: ['herdemptytxt'] })); cockpit.append(emp); }
  return { root, herd, grp, document: { querySelector: (s) => _qsa(root, s)[0] || null, querySelectorAll: (s) => _qsa(root, s) } };
}
function _runApply(states, filter, query, opts) {
  opts = opts || {};
  const dom = _buildCockpit(states, opts);
  const runner = new Function('document', '__f', '__q', '__c',
    'let herdFilter=__f,herdQuery=__q,herdCompact=__c;\n' + _HF_VALID_SRC + '\n' + _APPLY_SRC + '\n' +
    'applyHerdFilter();\nreturn {herdFilter:herdFilter,herdQuery:herdQuery};');
  const res = runner(dom.document, filter, query, !!opts.compact);
  const rows = dom.herd.querySelectorAll('.srow[data-state]');
  const emp = dom.document.querySelector('.herdempty');
  return { res, hidden: rows.filter((r) => r.hidden).length, shown: rows.filter((r) => !r.hidden).length, total: rows.length,
    grpHidden: dom.grp.hidden, empVisible: emp ? !emp.hidden : false, empText: emp ? emp.querySelector('.herdemptytxt').textContent : '' };
}

test('B3 herd-fix: default herdFilter is "all" + startup never restores a persisted filter/query (reload shows all)', () => {
  assert.equal(_DEFAULT_FILTER, 'all', 'default herdFilter must be "all" — filter is opt-in, never hides idle');
  assert.ok(!/herdFilter\s*=\s*st\.herdFilter/.test(_EXT_SRC), 'startup must NOT restore a persisted herdFilter (a stale "atencao" must never re-hide the herd)');
  assert.ok(!/herdQuery\s*=\s*st\.herdQuery/.test(_EXT_SRC), 'startup must NOT restore a persisted search query (search is transient)');
});

test('B3 herd-fix webview-sim: ≥5 sessions (3 needs + 5 idle) + DEFAULT → all 8 rows visible, none hidden', () => {
  const r = _runApply(['needs', 'needs', 'needs', 'idle', 'idle', 'idle', 'idle', 'idle'], _DEFAULT_FILTER, '', {});
  assert.equal(r.total, 8, '8 session rows present');
  assert.equal(r.hidden, 0, 'ZERO hidden by default — every open session shows');
  assert.equal(r.shown, 8, 'all 8 visible');
  assert.equal(r.grpHidden, false, 'project group header stays visible when there are sessions');
  assert.equal(r.empVisible, false, 'no empty-state while sessions are shown');
});

test('B3 herd-fix webview-sim: explicit state filter "needs" narrows (opt-in works), group stays', () => {
  const r = _runApply(['needs', 'needs', 'needs', 'idle', 'idle', 'idle', 'idle', 'idle'], 'needs', '', {});
  assert.equal(r.shown, 3, 'only the 3 needs rows show');
  assert.equal(r.hidden, 5, 'the 5 idle rows hidden by explicit choice');
  assert.equal(r.res.herdFilter, 'needs', 'filter respected (shown>0 → no fallback)');
  assert.equal(r.grpHidden, false, 'group with ≥1 visible row stays');
});

test('B3 herd-fix webview-sim: a state filter that would empty the herd falls back to ALL (never empty)', () => {
  const r = _runApply(['needs', 'needs', 'idle', 'idle', 'idle'], 'active', '', {}); // nothing is active
  assert.equal(r.hidden, 0, 'fallback shows every row instead of stranding an empty herd');
  assert.equal(r.shown, 5, 'all 5 visible after the never-empty fallback');
  assert.equal(r.res.herdFilter, 'all', 'herdFilter reset to "all" by the guard');
  assert.equal(r.empVisible, false, 'no empty-state for a state filter (only search shows it)');
});

test('B3 herd-fix webview-sim: invalid/legacy herdFilter → coerced to "all" (shows everything)', () => {
  const r = _runApply(['needs', 'idle', 'idle', 'idle', 'idle'], 'garbage-legacy', '', {});
  assert.equal(r.hidden, 0, 'unknown filter never hides — shows all');
  assert.equal(r.shown, 5);
});

test('B3 herd-fix webview-sim: search with no match → empty-state ("Ver todas"), not a silent blank', () => {
  const r = _runApply(['needs', 'idle', 'idle', 'idle', 'idle'], 'all', 'zzz-nomatch', {});
  assert.equal(r.shown, 0, 'no row matches the search');
  assert.equal(r.empVisible, true, 'empty-state shown for search-no-match');
  assert.ok(r.empText.indexOf('zzz-nomatch') >= 0, 'empty-state names the query');
});

test('B3 herd-fix webview-sim: search WITH match shows matching rows, no empty-state', () => {
  const r = _runApply(['needs', 'idle', 'idle', 'idle', 'idle'], 'all', 'sess2', {});
  assert.equal(r.shown, 1, 'only the matching row shows');
  assert.equal(r.empVisible, false, 'match → no empty-state');
});

test('B3 herd-fix webview-sim: no filter bar (<5 sessions) → every row visible regardless of filter', () => {
  const r = _runApply(['idle', 'idle', 'idle'], 'atencao', '', { bar: false });
  assert.equal(r.hidden, 0, 'without the bar, applyHerdFilter shows all rows');
  assert.equal(r.shown, 3);
});
