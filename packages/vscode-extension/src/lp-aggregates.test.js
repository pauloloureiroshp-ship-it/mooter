'use strict';
// lp-aggregates.test.js — Director's Cut v2 · F1 (host-side aggregates, zero UI).
// Proves: execution.log parsing follows the exec-logger.js line contract (incl. the
// 'unknown' sentinels → honest null and the agent:<type> marker); byDay buckets by LOCAL
// day and never places an unplaceable ts; byModel only creates rows from real sources and
// keeps costs as labelled tier-ESTIMATES (null without pricing — never a fabricated $0);
// fleet lanes degrade honestly (dry_run/empty → resting, no heartbeat → running:null);
// and collectAggregates is fail-soft end-to-end (one broken source never nulls the rest).

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fsm = require('node:fs');
const osm = require('node:os');

const LPA = require('./lp-aggregates.js');

// ── fixtures shaped EXACTLY like the real producers ─────────────────────────────────────

// exec-logger.js line contract (newer lines carry resolve_ms/mode; older ones don't).
const EXEC_LINES = [
  '[2026-07-07T09:00:00.000Z] session=sid-1 model=claude-sonnet-4-6 role=orchestrator cmd=npm test resolve_ms=12 mode=transcript_scan',
  '[2026-07-07T09:05:00.000Z] session=sid-1 model=qwen2.5:3b role=worker cmd=node tools/router/x.js resolve_ms=3 mode=decisions_log',
  '[2026-07-08T10:00:00.000Z] session=sid-2 model=claude-haiku-4-5-20251001 role=worker cmd=agent:Explore resolve_ms=8 mode=transcript_scan',
  '[2026-07-08T10:01:00.000Z] session=unknown model=unknown role=n/a cmd=git status', // old format + sentinels
  'garbage line that is not an exec entry',
  '{"json":"noise"}',
].join('\n');

// data.js::readDecisions shape (decisions.log v1 'classified' entries).
function mkDecision(over) {
  return Object.assign({
    ts: '2026-07-08T10:00:00.000Z', ts_ms: 1783850400000, event: 'classified',
    session_id: 'sid-2', prompt_len: 50, prompt_preview: 'refactor the auth middleware',
    tier: 'T2', task_category: 'code', recommended_backend: 'claude_subagent',
    recommended_model: 'claude-sonnet-4-6', confidence: 0.75, escalation_rule: 'none',
    quality_intent: false, cache_hit: false,
  }, over || {});
}

// hook-collector.js bus schema (every field nullable).
function mkEvent(over) {
  return Object.assign({
    ts: '2026-07-08T10:00:00.000Z', sid: 'sid-2', kind: 'file', tool: 'Write',
    path: 'C:\\ws\\a.js', summary: null, tier: null, model: null, cost: null, local: null,
  }, over || {});
}

// A fake pricing module with the pricing.js surface the aggregator uses.
const FAKE_PRICING = {
  PRICES: {
    'claude-sonnet-4-6': { input: 3, output: 15, tier: 'T2' },
    'qwen2.5:3b': { input: 0, output: 0, tier: 'T0' },
  },
  estimateTurnCost: function (tier, len) {
    const per = { T0: 0, T1: 0.01, T2: 0.03, T3: 0.09 };
    if (per[tier] == null) return 0; // real pricing.js returns 0 for unknown tiers
    return per[tier] + (len || 0) * 0.0001;
  },
  naiveOpusCost: function (len) { return 0.2 + (len || 0) * 0.0001; },
};

// ── parseExecutionLog ────────────────────────────────────────────────────────────────────

test('parseExecutionLog: parses real-format lines, strips perf suffix, tolerates garbage', () => {
  const ops = LPA.parseExecutionLog(EXEC_LINES, 400);
  assert.strictEqual(ops.length, 4, 'garbage lines dropped, 4 real entries kept');
  assert.strictEqual(ops[0].model, 'claude-sonnet-4-6');
  assert.strictEqual(ops[0].cmd, 'npm test', 'resolve_ms/mode suffix stripped from cmd');
  assert.strictEqual(ops[0].op, 'bash');
});

test('parseExecutionLog: agent:<type> marker → op=agent with the subagent type', () => {
  const ops = LPA.parseExecutionLog(EXEC_LINES, 400);
  assert.strictEqual(ops[2].op, 'agent');
  assert.strictEqual(ops[2].agent, 'Explore');
});

test('parseExecutionLog: unknown sentinels → honest null (never a fake model/sid)', () => {
  const ops = LPA.parseExecutionLog(EXEC_LINES, 400);
  assert.strictEqual(ops[3].model, null);
  assert.strictEqual(ops[3].sid, null);
  assert.strictEqual(ops[3].cmd, 'git status', 'old format without perf suffix still parses');
});

test('parseExecutionLog: never throws on null/garbage input, caps to maxN', () => {
  assert.deepStrictEqual(LPA.parseExecutionLog(null, 10), []);
  assert.deepStrictEqual(LPA.parseExecutionLog(undefined, 10), []);
  const many = [];
  for (let i = 0; i < 20; i++) many.push('[2026-07-08T10:00:0' + (i % 10) + '.000Z] session=s model=m role=r cmd=c' + i);
  assert.strictEqual(LPA.parseExecutionLog(many.join('\n'), 5).length, 5);
});

// ── dayKeyOf ─────────────────────────────────────────────────────────────────────────────

test('dayKeyOf: local-day key; null/invalid ts → null (never epoch-1970 fabrication)', () => {
  const iso = '2026-07-08T10:00:00.000Z';
  const d = new Date(iso);
  const p2 = (n) => (n < 10 ? '0' + n : String(n));
  const expected = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  assert.strictEqual(LPA.dayKeyOf(iso), expected, 'matches the LOCAL date of the same Date');
  assert.strictEqual(LPA.dayKeyOf(null), null);
  assert.strictEqual(LPA.dayKeyOf(undefined), null);
  assert.strictEqual(LPA.dayKeyOf('not-a-date'), null);
});

// ── buildByDay ───────────────────────────────────────────────────────────────────────────

test('buildByDay: buckets events+decisions+exec per day; unplaceable ts counted, not guessed', () => {
  const events = [
    mkEvent({ ts: '2026-07-08T10:00:00.000Z', kind: 'file' }),
    mkEvent({ ts: '2026-07-08T11:00:00.000Z', kind: 'task' }),
    mkEvent({ ts: '2026-07-07T09:00:00.000Z', kind: 'reason' }),
    mkEvent({ ts: null, kind: 'file' }), // unplaceable — must NOT land in any day
  ];
  const decisions = [mkDecision({ ts: '2026-07-08T10:00:00.000Z', tier: 'T0', recommended_model: 'qwen2.5:3b' })];
  const exec = LPA.parseExecutionLog(EXEC_LINES, 400);
  const r = LPA.buildByDay({ events, decisions, exec, pricing: null });
  assert.ok(r && Array.isArray(r.days));
  assert.strictEqual(r.window.unplaced, 1, 'the null-ts event is counted as unplaced');
  assert.ok(r.days.length >= 2);
  assert.ok(r.days[0].day > r.days[1].day, 'newest day first');
  const d8 = r.days.find((x) => x.day === LPA.dayKeyOf('2026-07-08T10:00:00.000Z'));
  assert.ok(d8);
  assert.strictEqual(d8.events.file, 1);
  assert.strictEqual(d8.events.task, 1);
  assert.strictEqual(d8.decisions.tiers.T0, 1);
  assert.strictEqual(d8.decisions.pctLocal, 100);
});

test('buildByDay: without pricing every costEstUsd stays null (never a fabricated $0)', () => {
  const r = LPA.buildByDay({ events: [], decisions: [mkDecision()], exec: [], pricing: null });
  assert.strictEqual(r.days[0].decisions.costEstUsd, null);
  assert.strictEqual(r.days[0].decisions.costUncounted, 1);
  assert.strictEqual(r.costBasis, null);
});

test('buildByDay: with pricing costs sum as tier-estimates and are labelled tier-est', () => {
  const decisions = [mkDecision({ tier: 'T2' }), mkDecision({ tier: 'T5' })]; // T5 = not costable
  const r = LPA.buildByDay({ events: [], decisions, exec: [], pricing: FAKE_PRICING });
  const day = r.days[0];
  assert.ok(day.decisions.costEstUsd > 0);
  assert.strictEqual(day.decisions.costCounted, 1);
  assert.strictEqual(day.decisions.costUncounted, 1, 'T5 decision is counted, never priced');
  assert.strictEqual(r.costBasis, 'tier-est');
});

test('buildByDay: nothing placeable → null (render shows "sem dados ainda")', () => {
  assert.strictEqual(LPA.buildByDay({ events: [], decisions: [], exec: [], pricing: null }), null);
  assert.strictEqual(LPA.buildByDay(null), null);
});

// ── buildByModel ─────────────────────────────────────────────────────────────────────────

test('buildByModel: rows only from real sources; unattributed ops counted, not invented', () => {
  const exec = LPA.parseExecutionLog(EXEC_LINES, 400);
  const decisions = [mkDecision(), mkDecision({ tier: 'T0', recommended_model: 'qwen2.5:3b' })];
  const r = LPA.buildByModel({ decisions, exec, pricing: null });
  assert.ok(r && Array.isArray(r.models));
  assert.strictEqual(r.window.opsUnattributed, 1, 'model=unknown op is counted, not a row');
  const names = r.models.map((m) => m.model);
  assert.ok(names.includes('claude-sonnet-4-6'));
  assert.ok(names.includes('qwen2.5:3b'));
  assert.ok(!names.includes('unknown'), 'no fabricated "unknown" model row');
  const sonnet = r.models.find((m) => m.model === 'claude-sonnet-4-6');
  assert.strictEqual(sonnet.ops.bash, 1);
  assert.strictEqual(sonnet.routes, 1);
  const haiku = r.models.find((m) => m.model === 'claude-haiku-4-5-20251001');
  assert.strictEqual(haiku.ops.agent, 1, 'agent:Explore op lands on the subagent model');
});

test('buildByModel: without pricing → tier falls back to router votes, local/costs null', () => {
  const r = LPA.buildByModel({ decisions: [mkDecision({ tier: 'T2' })], exec: [], pricing: null });
  const m = r.models[0];
  assert.strictEqual(m.tier, 'T2', 'tier from the router decision itself (honest fallback)');
  assert.strictEqual(m.local, null, 'no pricing table → local is unknowable, stays null');
  assert.strictEqual(m.costEstUsd, null);
  assert.strictEqual(r.totals.costEstUsd, null);
  assert.strictEqual(r.totals.savedEstUsd, null);
});

test('buildByModel: with pricing → local flag, ~est totals and savings vs all-Opus', () => {
  const decisions = [
    mkDecision({ tier: 'T2', recommended_model: 'claude-sonnet-4-6' }),
    mkDecision({ tier: 'T0', recommended_model: 'qwen2.5:3b' }),
  ];
  const r = LPA.buildByModel({ decisions, exec: [], pricing: FAKE_PRICING });
  const qwen = r.models.find((m) => m.model === 'qwen2.5:3b');
  assert.strictEqual(qwen.local, true);
  assert.strictEqual(qwen.tier, 'T0');
  assert.ok(r.totals.costEstUsd != null && r.totals.naiveOpusUsd != null);
  assert.ok(r.totals.savedEstUsd > 0, 'router mix estimates cheaper than all-Opus');
  assert.strictEqual(r.totals.costCounted, 2);
  assert.strictEqual(r.costBasis, 'tier-est');
});

test('buildByModel: no model named anywhere → null', () => {
  assert.strictEqual(LPA.buildByModel({ decisions: [], exec: [], pricing: FAKE_PRICING }), null);
  assert.strictEqual(LPA.buildByModel(null), null);
});

// ── buildFleet ───────────────────────────────────────────────────────────────────────────

// Real-shaped fixtures (verbatim field names from _handoff/fleet/*).
const HB_RESTING = { ts: '2026-06-23T03:35:19.429Z', pid: 52440, dry_run: true, total_rounds: 4, running: [], pillars_idle: 10, pillars_done: 0, global_fails: 0 };
const ROSTER = { version: 1, pillars: [
  { id: 'council', workdir: '_handoff/fleet/council', priority: 0.7, gpu_heavy: false, cloud_heavy: true, daysQuota: 2 },
  { id: 'matriz', workdir: '_handoff/fleet/matriz', priority: 0.8, gpu_heavy: true, cloud_heavy: false, daysQuota: 2 },
] };
const STATES = [
  { id: 'council', state: { status: 'awaiting_eval', round: 6, pillar: 'council', updated_at: '2026-06-23T03:35:19.239Z', lastOk: true } },
];

test('buildFleet: dry_run/empty running → resting:true (a frota em repouso é um estado válido)', () => {
  const f = LPA.buildFleet({ heartbeat: HB_RESTING, roster: ROSTER, states: STATES });
  assert.ok(f);
  assert.strictEqual(f.resting, true);
  assert.strictEqual(f.heartbeat.dryRun, true);
  assert.deepStrictEqual(f.heartbeat.running, []);
  const council = f.pillars.find((p) => p.id === 'council');
  assert.strictEqual(council.status, 'awaiting_eval');
  assert.strictEqual(council.round, 6);
  assert.strictEqual(council.running, false, 'heartbeat exists → we KNOW it is not running');
  const matriz = f.pillars.find((p) => p.id === 'matriz');
  assert.strictEqual(matriz.status, null, 'no STATE.json → status honestly null');
  assert.strictEqual(matriz.gpuHeavy, true);
});

test('buildFleet: running pillars are flagged and sorted first', () => {
  const hb = Object.assign({}, HB_RESTING, { dry_run: false, running: ['matriz'] });
  const f = LPA.buildFleet({ heartbeat: hb, roster: ROSTER, states: STATES });
  assert.strictEqual(f.resting, false);
  assert.strictEqual(f.pillars[0].id, 'matriz');
  assert.strictEqual(f.pillars[0].running, true);
});

test('buildFleet: no heartbeat → running is null (unknown ≠ false); no data at all → null', () => {
  const f = LPA.buildFleet({ heartbeat: null, roster: ROSTER, states: STATES });
  assert.strictEqual(f.resting, null, 'sem heartbeat não sabemos — n/d, nunca inventado');
  assert.strictEqual(f.pillars[0].running, null);
  assert.strictEqual(LPA.buildFleet({ heartbeat: null, roster: null, states: [] }), null);
  assert.strictEqual(LPA.buildFleet(null), null);
});

// ── readFleet / readExecutionTail / loadPricing (fs level, fail-soft) ───────────────────

test('readFleet: reads real-shaped files from disk; missing dir → honest empties', () => {
  const tmp = fsm.mkdtempSync(path.join(osm.tmpdir(), 'lpa-fleet-'));
  fsm.writeFileSync(path.join(tmp, 'fleet-heartbeat.json'), JSON.stringify(HB_RESTING));
  fsm.writeFileSync(path.join(tmp, 'fleet.json'), JSON.stringify(ROSTER));
  fsm.mkdirSync(path.join(tmp, 'council'));
  fsm.writeFileSync(path.join(tmp, 'council', 'STATE.json'), JSON.stringify(STATES[0].state));
  const raw = LPA.readFleet(tmp);
  assert.strictEqual(raw.heartbeat.dry_run, true);
  assert.strictEqual(raw.roster.pillars.length, 2);
  assert.strictEqual(raw.states.length, 1);
  const missing = LPA.readFleet(path.join(tmp, 'nope'));
  assert.strictEqual(missing.heartbeat, null);
  assert.deepStrictEqual(missing.states, []);
  assert.deepStrictEqual(LPA.readFleet(null), { heartbeat: null, roster: null, states: [] });
});

test('readExecutionTail: tail-reads a real-format log; missing file → []', () => {
  const tmp = fsm.mkdtempSync(path.join(osm.tmpdir(), 'lpa-exec-'));
  const f = path.join(tmp, 'execution.log');
  fsm.writeFileSync(f, EXEC_LINES + '\n');
  const ops = LPA.readExecutionTail(400, f);
  assert.strictEqual(ops.length, 4);
  assert.deepStrictEqual(LPA.readExecutionTail(400, path.join(tmp, 'absent.log')), []);
});

test('pricingCandidates: NEVER offers a workspace path (untrusted-workspace promise)', () => {
  // The manifest declares untrustedWorkspaces:supported with "never executes workspace
  // code" — so the runtime candidate list must contain ONLY the ~/.claude mirror.
  const cands = LPA.pricingCandidates();
  assert.ok(Array.isArray(cands) && cands.length <= 1);
  for (const c of cands) {
    assert.ok(c.indexOf(path.join(osm.homedir(), '.claude')) === 0, 'only the ~/.claude runtime mirror: ' + c);
  }
});

test('loadPricing: loads the REAL repo pricing.js; bad/missing candidates → null', () => {
  const repoPricing = path.join(__dirname, '..', '..', '..', 'tools', 'router', 'pricing.js');
  const p = LPA.loadPricing([repoPricing]);
  assert.ok(p, 'repo pricing.js loads');
  assert.ok(p.estimateTurnCost('T2', 100) > 0, 'T2 estimate is a positive ~est number');
  assert.strictEqual(LPA.loadPricing(['/definitely/not/here.js']), null);
  assert.strictEqual(LPA.loadPricing(null), null);
});

// ── collectAggregates (end-to-end, fail-soft per lens) ───────────────────────────────────

test('collectAggregates: end-to-end over real-shaped fixtures on disk', () => {
  const tmp = fsm.mkdtempSync(path.join(osm.tmpdir(), 'lpa-e2e-'));
  const execLog = path.join(tmp, 'execution.log');
  fsm.writeFileSync(execLog, EXEC_LINES + '\n');
  const fleetDir = path.join(tmp, 'fleet');
  fsm.mkdirSync(path.join(fleetDir, 'council'), { recursive: true });
  fsm.writeFileSync(path.join(fleetDir, 'fleet-heartbeat.json'), JSON.stringify(HB_RESTING));
  fsm.writeFileSync(path.join(fleetDir, 'fleet.json'), JSON.stringify(ROSTER));
  fsm.writeFileSync(path.join(fleetDir, 'council', 'STATE.json'), JSON.stringify(STATES[0].state));
  const repoPricing = path.join(__dirname, '..', '..', '..', 'tools', 'router', 'pricing.js');

  const agg = LPA.collectAggregates({
    wsRoot: tmp,
    events: [mkEvent()],
    decisions: [mkDecision()],
    execLogPath: execLog,
    pricingPaths: [repoPricing],
    fleetDir: fleetDir,
  });
  assert.ok(agg.byDay && agg.byDay.days.length >= 1);
  assert.ok(agg.byModel && agg.byModel.models.length >= 1);
  assert.strictEqual(agg.byModel.costBasis, 'tier-est');
  assert.ok(agg.fleet && agg.fleet.resting === true);
});

test('collectAggregates: every source broken/absent → {null,null,null}, never a throw', () => {
  const agg = LPA.collectAggregates({
    wsRoot: null, events: null, decisions: null,
    execLogPath: '/definitely/not/here.log',
    pricingPaths: ['/nope.js'],
    fleetDir: '/definitely/not/here',
  });
  assert.deepStrictEqual(agg, { byDay: null, byModel: null, fleet: null });
  assert.doesNotThrow(() => LPA.collectAggregates(null));
});

test('collectAggregates output is webview-postable (JSON-serialisable, no Sets/functions)', () => {
  const agg = LPA.collectAggregates({
    wsRoot: null, events: [mkEvent()], decisions: [mkDecision()],
    execLogPath: '/absent.log', pricingPaths: [], fleetDir: null,
  });
  const round = JSON.parse(JSON.stringify(agg));
  assert.deepStrictEqual(round, agg, 'survives the postMessage JSON round-trip unchanged');
});
