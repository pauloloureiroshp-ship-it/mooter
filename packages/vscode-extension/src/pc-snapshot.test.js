'use strict';
// pc-snapshot.test.js — Delivery Cockpit · Frente B host collector.
// Proves the ProjectCommandSnapshot honesty contract: cold-start never fabricates a cone,
// roadmap fields merge by wave_id, sessions associate to waves (intent / keyword / worktree),
// progress comes ONLY from Ledger kind:outcome gate events (and ADVANCES when a phase closes),
// deps lock a wave until its upstream is PROVEN complete, and nothing ever throws.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PC = require('./pc-snapshot.js');

// A minimal forecast.json object (the shape forecast.js emits) — two waves, both cold-start.
function fakeForecast() {
  return {
    schema: 'mooter.forecast/1',
    generated_ts: '2026-07-03T10:00:00Z',
    scope_hash: 'abcdef0123456789',
    injection_rate: 0.4,
    k: 8, window: 40,
    waves: [
      { wave_id: 'W1', name: 'Root wave', phase: 'NOW', class: null, mode: 'CC', deps: [], no_base: true, note: 'sem base comparável (classe não declarada)', p50_wall: null, samples_n: 0, drivers: [] },
      { wave_id: 'W2', name: 'Child wave', phase: 'NEXT', class: 'feature_impl', mode: 'CC', deps: ['W1'], calibrating: true, calibrating_progress: '3/8', p50_wall: null, samples_n: 3, drivers: [] },
    ],
  };
}

const ROADMAP = [
  '## FASE NOW',
  '| # | Wave | Objectivo | Modo | Worktree | Effort | Dep |',
  '|---|---|---|---|---|---|---|',
  '| **W1** | Root wave | land it | **CC-once** | `frugal-root` | S | — |',
  '## FASE NEXT',
  '| # | Wave | Objectivo | Modo | Worktree | Effort | Dep |',
  '|---|---|---|---|---|---|---|',
  '| **W2** | Child wave | build it | **Loop $0** | `frugal-child` | L | W1 |',
].join('\n');

let LEDGER;
before(() => { LEDGER = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-pcsnap-')); });
after(() => { try { fs.rmSync(LEDGER, { recursive: true, force: true }); } catch {} });

test('forecast_missing → honest run-the-CLI state, never a fabricated cone', () => {
  const pc = PC.buildProjectCommand({ forecast: null, roadmapMd: '', sessions: [], ledgerDir: LEDGER });
  assert.strictEqual(pc.forecast_missing, true);
  assert.ok(/forecast\.js/.test(pc.cli_hint), 'carries the CLI hint');
  assert.deepStrictEqual(pc.phases, []);
});

test('mergeRoadmap injects effort/type/worktree/goal by wave_id', () => {
  const merged = PC.mergeRoadmap(fakeForecast().waves, ROADMAP);
  const w1 = merged.find((w) => w.wave_id === 'W1');
  const w2 = merged.find((w) => w.wave_id === 'W2');
  assert.strictEqual(w1.effort, 'S');
  assert.match(w1.type, /CC-once/);
  assert.strictEqual(w1.worktree, 'frugal-root');
  assert.strictEqual(w2.effort, 'L');
  assert.match(w2.type, /Loop/);
});

test('associateSessions: intent > keyword > worktree slug, else unassigned', () => {
  const waves = PC.mergeRoadmap(fakeForecast().waves, ROADMAP);
  const sessions = [
    { sid: 's-intent', name: 'anon', git: {} },        // associated via Ledger intent below
    { sid: 's-kw', name: 'work on W2 now', git: {} },   // keyword W2
    { sid: 's-wt', name: 'x', git: { branch: 'frugal-root-fix' } }, // worktree slug frugal-root
    { sid: 's-none', name: 'unrelated', git: { branch: 'feat/other' } },
  ];
  const ledger = { 's-intent': [{ kind: 'intent', input: { q: 'run the W1 masterprompt' } }] };
  const a = PC.associateSessions(waves, sessions, ledger);
  assert.deepStrictEqual((a.byWave.W1 || []).map((s) => s.sid).sort(), ['s-intent', 's-wt']);
  assert.deepStrictEqual((a.byWave.W2 || []).map((s) => s.sid), ['s-kw']);
  assert.deepStrictEqual(a.unassigned.map((s) => s.sid), ['s-none']);
});

test('waveProgressFromEvents: null without outcomes; advances as phases close', () => {
  assert.strictEqual(PC.waveProgressFromEvents([]), null);
  assert.strictEqual(PC.waveProgressFromEvents([{ kind: 'intent' }]), null, 'no outcome → n/d');
  const two = PC.waveProgressFromEvents([
    { kind: 'outcome', output: { gate: 'pass', phase: 1, phase_total: 5 } },
    { kind: 'outcome', output: { gate: 'pass', phase: 2, phase_total: 5 } },
  ]);
  assert.strictEqual(two.passed, 2);
  assert.strictEqual(two.total, 5);
  assert.strictEqual(two.pct, 40);
  // close one more phase → the bar MUST advance (the gate's "barra a mover ao fechar uma fase").
  const three = PC.waveProgressFromEvents([
    { kind: 'outcome', output: { gate: 'pass', phase: 1, phase_total: 5 } },
    { kind: 'outcome', output: { gate: 'pass', phase: 2, phase_total: 5 } },
    { kind: 'outcome', output: { gate: 'pass', phase: 3, phase_total: 5 } },
  ]);
  assert.strictEqual(three.pct, 60);
  assert.ok(three.pct > two.pct, 'progress advances when a phase closes');
});

test('waveProgressFromEvents: only gate-passed count; a failed outcome does not', () => {
  const p = PC.waveProgressFromEvents([
    { kind: 'outcome', output: { gate: 'pass', phase: 1, phase_total: 3 } },
    { kind: 'outcome', output: { status: 'blocked', phase: 2, phase_total: 3 } },
  ]);
  assert.strictEqual(p.passed, 1, 'blocked phase not counted');
  assert.strictEqual(p.total, 3);
});

test('depsWithMet: locked until upstream is PROVEN 100% complete', () => {
  const unmet = PC.depsWithMet(['W1'], { W1: { pct: 60 } });
  assert.strictEqual(unmet[0].met, false);
  const met = PC.depsWithMet(['W1'], { W1: { pct: 100 } });
  assert.strictEqual(met[0].met, true);
  const noProof = PC.depsWithMet(['W1'], {});
  assert.strictEqual(noProof[0].met, false, 'no ledger proof → not met (never launch into the void)');
});

test('buildProjectCommand: honest cone states + phase grouping + dep lock', () => {
  const sessions = [{ sid: 's1', name: 'W1 land', status: 'working', git: { branch: 'frugal-root', sha: 'deadbeefcafe', dirty: 2, ahead: 1 } }];
  const pc = PC.buildProjectCommand({ forecast: fakeForecast(), roadmapMd: ROADMAP, sessions, ledgerDir: LEDGER });
  assert.strictEqual(pc.forecast_missing, false);
  assert.strictEqual(pc.injection_rate, 0.4);
  assert.deepStrictEqual(pc.phases.map((p) => p.key), ['NOW', 'NEXT']);
  const w1 = pc.phases[0].waves[0];
  const w2 = pc.phases[1].waves[0];
  assert.strictEqual(w1.forecast.state, 'no_base');
  assert.strictEqual(w2.forecast.state, 'calibrating');
  assert.strictEqual(w1.locked, false, 'root wave (no deps) is playable');
  assert.strictEqual(w2.locked, true, 'W2 depends on unproven W1 → locked');
  assert.match(w2.lock_reason, /W1/);
  // the working session associated to W1 → branch@sha + git chips present, honest
  assert.strictEqual(w1.running, true);
  assert.strictEqual(w1.sessions[0].branch, 'frugal-root');
  assert.strictEqual(w1.sessions[0].sha, 'deadbee');
  assert.strictEqual(w1.sessions[0].uncommitted, true);
  assert.strictEqual(pc.counts.no_base, 1);
  assert.strictEqual(pc.counts.calibrating, 1);
});

test('never throws on garbage input', () => {
  assert.doesNotThrow(() => PC.buildProjectCommand({}));
  assert.doesNotThrow(() => PC.buildProjectCommand({ forecast: { waves: 'nope' } }));
  assert.doesNotThrow(() => PC.waveProgressFromEvents(null));
  assert.doesNotThrow(() => PC.associateSessions([], null, null));
  assert.doesNotThrow(() => PC.mergeRoadmap([], null));
});
