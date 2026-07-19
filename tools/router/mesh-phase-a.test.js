'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'mesh');
const { parseWorktreeList, parseStatusZ } = require('./mesh-git');
const { checkOrphans } = require('./orphan-watch');
const { checkPointers } = require('./pointer-sentinel');
const { parseSyncProjection, checkProjectionDrift } = require('./projection-drift');
const { keepBriefs } = require('./brief-keeper');
const { readFleetCycleGate, runMeshCycle } = require('./mesh-cycle');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('shared Git parsers preserve worktree identity and NUL-safe dirty paths', () => {
  assert.deepEqual(parseWorktreeList([
    'worktree C:/repo',
    'HEAD abc123',
    'branch refs/heads/main',
    '',
    'worktree C:/repo-feature',
    'HEAD def456',
    'branch refs/heads/feat/x',
    '',
  ].join('\n')), [
    { path: 'C:/repo', head: 'abc123', branch: 'main', bare: false, prunable: false },
    { path: 'C:/repo-feature', head: 'def456', branch: 'feat/x', bare: false, prunable: false },
  ]);
  assert.deepEqual(parseStatusZ('?? new file.md\0R  renamed.md\0old.md\0'), [
    { xy: '??', path: 'new file.md', original_path: null },
    { xy: 'R ', path: 'renamed.md', original_path: 'old.md' },
  ]);
});

test('orphan-watch alerts only measured paths older than N hours', (t) => {
  const root = tempDir('mooter-orphan-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const old = path.join(root, 'old.md');
  const fresh = path.join(root, 'fresh.md');
  fs.writeFileSync(old, 'old');
  fs.writeFileSync(fresh, 'fresh');
  const nowMs = Date.parse('2026-07-18T12:00:00Z');
  fs.utimesSync(old, new Date(nowMs - 49 * 3_600_000), new Date(nowMs - 49 * 3_600_000));
  fs.utimesSync(fresh, new Date(nowMs - 2 * 3_600_000), new Date(nowMs - 2 * 3_600_000));
  const verdict = checkOrphans({
    root,
    nowMs,
    thresholdHours: 24,
    worktrees: [{ path: root, branch: 'feat/fc3', bare: false, prunable: false }],
    runGit: () => '?? old.md\0 M fresh.md\0 D deleted.md\0',
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.findings.length, 1);
  assert.equal(verdict.findings[0].path, 'old.md');
  assert.equal(verdict.findings[0].age_hours, 49);
  assert.equal(verdict.unageable_paths, 1, 'deleted files have no honest mtime and stay n/d');
});

test('FC-6 fixture reproduces a dead path:line pointer', () => {
  const fixture = path.join(FIXTURES, 'fc6-dead-pointer.md');
  const verdict = checkPointers({ root: REPO, files: [fixture] });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.findings.map((finding) => finding.reason), ['missing-path']);
  assert.equal(verdict.findings[0].path, 'docs/removed-three-weeks-ago.md:99');
});

test('pointer-sentinel validates both existence and line bounds', (t) => {
  const root = tempDir('mooter-pointer-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'live.md'), 'one\ntwo\n');
  const source = path.join(root, 'AGENTS.md');
  fs.writeFileSync(source, 'Good `docs/live.md:2`; bad `docs/live.md:9`.\n');
  const verdict = checkPointers({ root, files: [source] });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.pointers_checked, 2);
  assert.equal(verdict.findings.length, 1);
  assert.equal(verdict.findings[0].reason, 'line-out-of-range');
});

test('projection-drift compares SYNC main SHA, extension version and worktree count', () => {
  const projection = parseSyncProjection([
    '**Atualizado:** 2026-07-13 · **GitHub `main` @** `89ff3e3` ·',
    '**extensão em main:** `v0.16.67`',
    '| **Registrados** | **12** | old |',
  ].join('\n'));
  assert.deepEqual(projection, {
    main_sha: '89ff3e3', extension_version: '0.16.67', registered_worktrees: 12, updated_at: '2026-07-13',
  });
  const verdict = checkProjectionDrift({
    root: REPO,
    readFile: () => [
      '**GitHub `main` @** `89ff3e3`',
      '**extensão em main:** `v0.16.67`',
      '| **Registrados** | **12** |',
    ].join('\n'),
    actual: { main_ref: 'origin/main', main_sha: 'd108a4000000', extension_version: '0.16.78', registered_worktrees: 24 },
  });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.findings.map((finding) => finding.claim), [
    'main_sha', 'extension_version', 'registered_worktrees',
  ]);
});

test('FC-5 fixture is copied from a gitignored sibling into the primary briefs dir', (t) => {
  const base = tempDir('mooter-fc5-');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const primary = path.join(base, 'primary');
  const sibling = path.join(base, 'sibling');
  const sourceDir = path.join(sibling, '_handoff', 'agent-sync', 'briefs');
  fs.mkdirSync(sourceDir, { recursive: true });
  const fixture = path.join(FIXTURES, 'fc5-evaporating-brief.md');
  fs.copyFileSync(fixture, path.join(sourceDir, 'fc5.md'));
  const opts = {
    root: primary,
    targetRoot: primary,
    sourceDirs: [sourceDir],
    worktrees: [{ path: primary }, { path: sibling }],
  };
  const first = keepBriefs(opts);
  assert.equal(first.ok, true);
  assert.equal(first.copied.length, 1);
  const durable = path.join(primary, '_handoff', 'agent-sync', 'briefs', 'fc5.md');
  assert.equal(fs.readFileSync(durable, 'utf8'), fs.readFileSync(fixture, 'utf8'));
  const second = keepBriefs(opts);
  assert.equal(second.copied.length, 0);
  assert.equal(second.skipped.length, 1);
});

test('brief-keeper dry-run reports preservation without writing', (t) => {
  const base = tempDir('mooter-fc5-dry-');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sourceDir = path.join(base, 'source');
  const targetDir = path.join(base, 'target');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'brief.md'), 'brief\n');
  const verdict = keepBriefs({ root: base, sourceDirs: [sourceDir], targetDir, worktrees: [], dryRun: true });
  assert.equal(verdict.copied.length, 1);
  assert.equal(fs.existsSync(path.join(targetDir, 'brief.md')), false);
});

test('fleet cycle gate defaults safe, pauses immediately and auto-resumes', () => {
  const nowMs = Date.parse('2026-07-18T12:00:00Z');
  const fallback = readFleetCycleGate({ nowMs, preferences: {} });
  assert.equal(fallback.effective_effort, 'lazy');
  assert.equal(fallback.allow_fleet_generation, false);
  const paused = readFleetCycleGate({
    nowMs,
    preferences: { gpu_effort: 'crazy', pause_until: '2026-07-18T13:00:00Z' },
  });
  assert.equal(paused.effective_effort, 'paused');
  assert.equal(paused.allow_fleet_generation, false);
  const resumed = readFleetCycleGate({
    nowMs,
    preferences: { gpu_effort: 'crazy', pause_until: '2026-07-18T11:00:00Z' },
  });
  assert.equal(resumed.effective_effort, 'crazy');
  assert.equal(resumed.allow_l2, true);
  assert.equal(resumed.allow_fleet_generation, true);
});

test('mesh coordinator preserves the mandated checker order and continues after a red finding', () => {
  const calls = [];
  const make = (name, ok = true) => () => {
    calls.push(name);
    return { checker: name, layer: 'L0', ok, findings: ok ? [] : [{ reason: 'fixture' }], errors: [] };
  };
  const events = [];
  const verdict = runMeshCycle({
    root: REPO,
    force: true,
    emit: (event) => events.push(event),
    orphanWatch: make('orphan-watch'),
    pointerSentinel: make('pointer-sentinel', false),
    projectionDrift: make('projection-drift'),
    briefKeeper: make('brief-keeper'),
  });
  assert.deepEqual(calls, ['orphan-watch', 'pointer-sentinel', 'projection-drift', 'brief-keeper']);
  assert.equal(verdict.ok, false);
  assert.equal(events.filter((event) => event.event === 'mesh_check').length, 4);
  assert.equal(events.at(-1).event, 'mesh_cycle');
});

test('fleet integration enforces LazyMoo before dispatching any pillar', async () => {
  const moduleUrl = pathToFileURL(path.join(REPO, '_handoff', 'fleet', 'fleet-orchestrator.mjs')).href;
  const { runFleet } = await import(moduleUrl);
  const events = [];
  let dispatches = 0;
  const summary = await runFleet({
    fleet: {
      caps: { poolWidth: 1, gpuHeavyConcurrent: 1, cloudConcurrent: 1, budgetUsdPerDay: 0, perLoopOpen: 1, globalHumanQueue: 1 },
      pillars: [{ id: 'fixture', workdir: 'fixture', priority: 1, gpu_heavy: true, cloud_heavy: false, daysQuota: 1 }],
    },
    fleetDir: path.join(os.tmpdir(), 'mooter-mesh-fleet-fixture'),
    emit: (event) => events.push(event),
    mesh: false,
    preferences: { gpu_effort: 'lazy' },
    maxRounds: 1,
    runPillar: async () => { dispatches++; return {}; },
  });
  assert.equal(dispatches, 0);
  assert.equal(summary.ran, 0);
  assert.equal(summary.effort, 'lazy');
  assert.match(summary.idleReason, /LazyMoo/);
  assert.ok(events.some((event) => event.event === 'effort_gate' && event.allow_fleet_generation === false));
});
