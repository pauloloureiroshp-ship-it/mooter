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

// ══ v2 · EIXO SQUAD + FLUXO/WIP ═══════════════════════════════════════════════
const ROADMAP_V3 = [
  '## Squads',
  '| Squad | Tipo | Frente |',
  '|---|---|---|',
  '| 🛩️ Cockpit & UX | stream-aligned | a cabine |',
  '| 🧭 Routing & Inference | stream-aligned | motor $0 |',
  '## FASE NOW',
  '| # | Wave | Squad | Objectivo | Modo | Worktree | Effort | Dep | Estado |',
  '|---|---|---|---|---|---|---|---|---|',
  '| W13 | Delivery Cockpit | 🛩️ Cockpit & UX | build it | CC-once | `frugal-cockpit-tab` | L | — | 🟡 em curso |',
  '| W11 | Router bandit | 🧭 Routing & Inference | promote | CC-once | `frugal-router-v2` | M | — | 🔜 |',
].join('\n');

test('parseWaveExtras: squad + estado by wave id', () => {
  const ex = PC.parseWaveExtras(ROADMAP_V3);
  assert.match(ex.W13.squad, /Cockpit & UX/);
  assert.match(ex.W13.estado, /em curso/);
  assert.match(ex.W11.squad, /Routing & Inference/);
});

test('parseSquadDefs: type/frente keyed by emoji', () => {
  const defs = PC.parseSquadDefs(ROADMAP_V3);
  const cockpit = defs[PC.squadEmoji('🛩️ Cockpit & UX')];
  assert.ok(cockpit, 'cockpit squad def found by emoji');
  assert.strictEqual(cockpit.type, 'stream-aligned');
  assert.match(cockpit.frente, /cabine/);
});

test('parseWorktrees: porcelain → {path,branch,sha,bare}', () => {
  const porc = [
    'worktree C:/repo/main', 'HEAD aaaa1111', 'branch refs/heads/main', '',
    'worktree C:/repo/feat-x', 'HEAD bbbb2222', 'branch refs/heads/feat/x', '',
    'worktree C:/repo/bare', 'bare',
  ].join('\n');
  const wt = PC.parseWorktrees(porc);
  assert.strictEqual(wt.length, 3);
  assert.strictEqual(wt[1].branch, 'feat/x');
  assert.strictEqual(wt[1].sha, 'bbbb2222');
  assert.strictEqual(wt[2].bare, true);
});

test('deriveSquadHealth: DORMANT with zero signals — NEVER painted green', () => {
  const waves = [{ wave_id: 'W99', worktree: 'frugal-ghost', sessions: [] }];
  // no gitSignals, no sessions → dormant, never active/warm
  const h0 = PC.deriveSquadHealth(waves, { worktrees: [], commits: [] });
  assert.strictEqual(h0.level, 'dormant');
  assert.deepStrictEqual(h0.evidence, { live: 0, worktrees: 0, recentCommits: 0 });
  // a live session → active (the ONLY path to green)
  const hLive = PC.deriveSquadHealth([{ wave_id: 'W99', worktree: 'frugal-ghost', sessions: [{ status: 'working' }] }], { worktrees: [], commits: [] });
  assert.strictEqual(hLive.level, 'active');
  assert.strictEqual(hLive.evidence.live, 1);
  // a matching worktree but no live session → warm (never active)
  const hWarm = PC.deriveSquadHealth(waves, { worktrees: [{ path: 'C:/x/frugal-ghost', branch: 'feat/ghost', sha: 'z' }], commits: [] });
  assert.strictEqual(hWarm.level, 'warm');
  assert.ok(hWarm.evidence.worktrees >= 1);
});

test('buildFlow: WIP alert above the healthy ceiling; deploy freq from merges; needYou real', () => {
  const now = 1_700_000_000_000;
  const recentTs = Math.floor(now / 1000) - 3600; // 1h ago
  const worktrees = [];
  for (let i = 0; i < 8; i++) worktrees.push({ path: '/w' + i, branch: 'feat/w' + i, sha: 's' + i, bare: false });
  worktrees.push({ path: '/main', branch: 'main', sha: 'm', bare: false });
  const commits = worktrees.map((w) => ({ sha: w.sha, ts: recentTs, isMerge: false, subject: 'x' }));
  for (let i = 0; i < 5; i++) commits.push({ sha: 'mg' + i, ts: recentTs, isMerge: true, subject: 'merge' });
  const sessions = [{ sid: 'a', status: 'needs-you', git: { branch: 'feat/w0' } }];
  const flow = PC.buildFlow([], sessions, { worktrees, commits }, now);
  assert.strictEqual(flow.wip.total, 8, 'non-main worktrees');
  assert.ok(flow.wip.active >= 8, 'all recently committed → active WIP');
  assert.strictEqual(flow.wip.over, true, 'above the healthy limit → alert');
  assert.strictEqual(flow.wip.limit, PC.WIP_HEALTHY_LIMIT);
  assert.ok(flow.deploy_freq_per_week > 0, 'deploy freq derived from merges');
  assert.strictEqual(flow.need_you.length, 1, 'awaiting-you session surfaced');
  assert.strictEqual(flow.cycle_time, null, 'cycle time n/d until Ledger spans (cold-start honest)');
});

test('buildFlow: no git signal → WIP is n/d (null), NOT 0-as-fact; no alert; no fabricated freq', () => {
  const flow = PC.buildFlow([], [], { worktrees: [], commits: [] }, 1_700_000_000_000);
  assert.strictEqual(flow.wip.total, null, 'git unreadable → WIP unknown → n/d, never 0-as-fact');
  assert.strictEqual(flow.wip.active, null);
  assert.strictEqual(flow.wip.over, false, 'no alert without signal');
  assert.strictEqual(flow.wip.no_signal, true);
  assert.strictEqual(flow.deploy_freq_per_week, null, 'no signal → n/d, not 0-as-fact');
  assert.strictEqual(flow.need_you.length, 0);
});

test('buildFlow: worktrees present but only main → total 0 IS a fact (we looked), not n/d', () => {
  const flow = PC.buildFlow([], [], { worktrees: [{ path: '/r', branch: 'main', sha: 'm', bare: false }], commits: [] }, 1_700_000_000_000);
  assert.strictEqual(flow.wip.total, 0, 'we saw the worktree list and found 0 non-main → honest 0');
  assert.strictEqual(flow.wip.no_signal, undefined);
});

test('buildProjectCommand v2: schema/2, squads grouped, flow present, wave carries squad+estado', () => {
  const forecast = {
    schema: 'mooter.forecast/1', generated_ts: 't', scope_hash: 'h', injection_rate: 0, k: 8, window: 40,
    waves: [
      { wave_id: 'W13', name: 'Delivery Cockpit', phase: 'NOW', class: null, mode: 'CC', deps: [], no_base: true, note: 'x', p50_wall: null, samples_n: 0, drivers: [] },
      { wave_id: 'W11', name: 'Router bandit', phase: 'FRONTIER', class: null, mode: 'CC', deps: [], no_base: true, note: 'x', p50_wall: null, samples_n: 0, drivers: [] },
    ],
  };
  // name references W13 so it associates (honest: association is strict — intent/W-id/worktree-slug).
  const sessions = [{ sid: 's', name: 'W13 cockpit', status: 'working', git: { branch: 'feat/delivery-cockpit-ui', sha: 'abc1234', dirty: 2, ahead: 0 } }];
  const gitSignals = { worktrees: [{ path: '/x/frugal-cockpit-tab', branch: 'feat/delivery-cockpit-ui', sha: 'abc1234def', bare: false }], commits: [{ sha: 'abc1234def', ts: Math.floor(1_700_000_000_000 / 1000), isMerge: false, subject: 'W13 work' }] };
  const pc = PC.buildProjectCommand({ forecast, roadmapMd: ROADMAP_V3, sessions, gitSignals, ledgerDir: LEDGER, now: 1_700_000_000_000 });
  assert.strictEqual(pc.schema, 'mooter.projectcommand/2');
  assert.ok(Array.isArray(pc.squads) && pc.squads.length >= 2, 'squads grouped');
  assert.ok(pc.flow && pc.flow.wip, 'flow present');
  const cockpit = pc.squads.find((sq) => /Cockpit/.test(sq.label));
  assert.ok(cockpit, 'cockpit lane exists');
  assert.strictEqual(cockpit.health.level, 'active', 'cockpit has a live session → active');
  assert.strictEqual(cockpit.type, 'stream-aligned', 'type enriched from squad-def table');
  const routing = pc.squads.find((sq) => /Routing/.test(sq.label));
  assert.strictEqual(routing.health.level, 'dormant', 'routing has no signal → dormant (not green)');
  const w13 = pc.phases.flatMap((p) => p.waves).find((w) => w.wave_id === 'W13');
  assert.match(w13.squad, /Cockpit/);
  assert.match(w13.estado, /em curso/);
});
