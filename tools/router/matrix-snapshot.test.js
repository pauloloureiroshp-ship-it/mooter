'use strict';
// Wave 58 (A.15) — matrix-snapshot.js tests.
// Hermetic: all I/O is redirected to a temp dir; never touches real ~/.mooter.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  writeSnapshot,
  computeEvolution,
  pruneOldSnapshots,
  buildTesByCellFromCells,
  dateKey,
  snapshotDir,
  MAX_SNAPSHOT_DAYS,
} = require('./matrix-snapshot.js');

// ── shared temp dir ────────────────────────────────────────────────────────────

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-matrix-snap-'));
after(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ── dateKey ────────────────────────────────────────────────────────────────────

test('dateKey extracts YYYY-MM-DD in UTC', () => {
  assert.equal(dateKey(Date.parse('2026-06-12T23:59:59Z')), '2026-06-12');
  assert.equal(dateKey(Date.parse('2026-01-01T00:00:00Z')), '2026-01-01');
});

// ── snapshotDir ────────────────────────────────────────────────────────────────

test('snapshotDir: custom dir is returned as-is', () => {
  assert.equal(snapshotDir('/my/custom/dir'), '/my/custom/dir');
});

test('snapshotDir: no override → inside mooterHome', () => {
  const prevMH = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = tmp;
  try {
    const d = snapshotDir();
    assert.ok(d.startsWith(tmp), `expected ${d} to start with ${tmp}`);
    assert.ok(d.endsWith('matrix-snapshots'));
  } finally {
    if (prevMH === undefined) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = prevMH;
  }
});

// ── MAX_SNAPSHOT_DAYS ──────────────────────────────────────────────────────────

test('MAX_SNAPSHOT_DAYS is 90', () => {
  assert.equal(MAX_SNAPSHOT_DAYS, 90);
});

// ── buildTesByCellFromCells ────────────────────────────────────────────────────

test('buildTesByCellFromCells: empty cells → all zeros/empty', () => {
  const r = buildTesByCellFromCells([]);
  assert.deepEqual(r, { tes_by_cell: {}, cells_measured: 0, pricing_pending_count: 0 });
});

test('buildTesByCellFromCells: null/undefined input → all zeros/empty', () => {
  const r = buildTesByCellFromCells(null);
  assert.deepEqual(r, { tes_by_cell: {}, cells_measured: 0, pricing_pending_count: 0 });
});

test('buildTesByCellFromCells: cells without model/category are skipped', () => {
  const cells = [
    { model: '', category: 'coding.completion', benchmark_score: 0.5 },
    { model: 'sonnet', category: '', benchmark_score: 0.5 },
    { category: 'coding.completion', benchmark_score: 0.5 }, // missing model
  ];
  const r = buildTesByCellFromCells(cells);
  assert.deepEqual(r.tes_by_cell, {});
  assert.equal(r.cells_measured, 0);
});

test('buildTesByCellFromCells: without tes-calculator all cells are pending', () => {
  // The tes-calculator module does not exist in this test environment
  // (it is a Wave 58 sibling not yet written). The graceful require() in
  // matrix-snapshot.js sets tesCalculator = null; since we load the module
  // once, this invariant is already in effect. We verify via buildTesByCellFromCells
  // behavior when tesCalculator is absent.
  const cells = [
    { model: 'claude-sonnet-4-6', category: 'coding.completion', benchmark_score: 0.7 },
    { model: 'claude-haiku-4-5', category: 'reasoning.chain', benchmark_score: 0.5 },
  ];
  const r = buildTesByCellFromCells(cells);
  // All cells → null (pending) because tesCalculator is not available
  for (const [, tes] of Object.entries(r.tes_by_cell)) {
    assert.equal(tes, null, 'expected null TES when tes-calculator unavailable');
  }
  assert.equal(r.cells_measured, 0);
  assert.equal(r.pricing_pending_count, 2);
});

// ── writeSnapshot ──────────────────────────────────────────────────────────────

test('writeSnapshot: creates a dated JSON file in the given dir', () => {
  const dir = path.join(tmp, 'snap1');
  const now = Date.parse('2026-06-12T10:00:00Z');
  const result = writeSnapshot({ dir, now });
  assert.equal(result.written, true, 'written should be true');
  assert.ok(result.file.endsWith('2026-06-12.json'), `unexpected file name: ${result.file}`);
  assert.ok(fs.existsSync(result.file), 'snapshot file must exist on disk');
});

test('writeSnapshot: file is valid JSON with required keys', () => {
  const dir = path.join(tmp, 'snap2');
  const now = Date.parse('2026-06-12T10:00:00Z');
  const { file } = writeSnapshot({ dir, now });
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(parsed.date, '2026-06-12');
  assert.ok('coverage' in parsed, 'missing coverage key');
  assert.ok(typeof parsed.cells_measured === 'number', 'cells_measured must be a number');
  assert.ok(typeof parsed.tes_by_cell === 'object' && parsed.tes_by_cell !== null, 'tes_by_cell must be an object');
  assert.ok(typeof parsed.total_routings === 'number', 'total_routings must be a number');
  assert.ok(typeof parsed.pricing_pending_count === 'number', 'pricing_pending_count must be a number');
});

test('writeSnapshot: cells_measured and total_routings are non-negative integers', () => {
  const dir = path.join(tmp, 'snap3');
  const { snapshot } = writeSnapshot({ dir, now: Date.parse('2026-06-11T10:00:00Z') });
  assert.ok(Number.isInteger(snapshot.cells_measured) && snapshot.cells_measured >= 0);
  assert.ok(Number.isInteger(snapshot.total_routings) && snapshot.total_routings >= 0);
});

test('writeSnapshot: is idempotent — re-run on same date overwrites', () => {
  const dir = path.join(tmp, 'snap-idem');
  const now = Date.parse('2026-06-10T10:00:00Z');
  const r1 = writeSnapshot({ dir, now });
  const r2 = writeSnapshot({ dir, now });
  assert.equal(r2.written, true);
  assert.equal(r1.file, r2.file, 'same file path on same date');
  const files = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  assert.equal(files.length, 1, 'must not create duplicate files for the same date');
});

test('writeSnapshot: pruned count = 0 when <= MAX_SNAPSHOT_DAYS files', () => {
  const dir = path.join(tmp, 'snap-prune-small');
  const { pruned } = writeSnapshot({ dir, now: Date.parse('2026-06-12T10:00:00Z') });
  assert.equal(pruned, 0);
});

test('writeSnapshot: no modules → graceful (written=true, cells_measured=0)', () => {
  const dir = path.join(tmp, 'snap-no-modules');
  const { written, snapshot } = writeSnapshot({ dir, now: Date.parse('2026-06-12T10:00:00Z') });
  assert.equal(written, true);
  assert.equal(snapshot.cells_measured, 0);
  assert.equal(snapshot.coverage, null);
  assert.deepEqual(snapshot.tes_by_cell, {});
});

// ── pruneOldSnapshots ──────────────────────────────────────────────────────────

test('pruneOldSnapshots: removes files beyond maxDays (sorted oldest first)', () => {
  const dir = path.join(tmp, 'prune-test');
  fs.mkdirSync(dir, { recursive: true });
  // Create 95 fake day-files using a fixed base date + day offset
  const baseMs = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < 95; i++) {
    const date = new Date(baseMs + i * 86400000).toISOString().slice(0, 10);
    fs.writeFileSync(path.join(dir, `${date}.json`), '{}');
  }
  const before = fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).length;
  assert.equal(before, 95);
  const removed = pruneOldSnapshots(dir, 90);
  assert.equal(removed, 5, 'should remove 5 oldest files to get to 90');
  const after = fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).length;
  assert.equal(after, 90);
});

test('pruneOldSnapshots: no-op when dir does not exist', () => {
  const removed = pruneOldSnapshots(path.join(tmp, 'nonexistent-dir'), 90);
  assert.equal(removed, 0);
});

test('pruneOldSnapshots: no-op when <= maxDays files', () => {
  const dir = path.join(tmp, 'prune-noop');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-06-01.json'), '{}');
  fs.writeFileSync(path.join(dir, '2026-06-02.json'), '{}');
  const removed = pruneOldSnapshots(dir, 90);
  assert.equal(removed, 0);
});

// ── computeEvolution ───────────────────────────────────────────────────────────

function makeSnapDir(subDir) {
  const dir = path.join(tmp, subDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSnapFile(dir, date, tesByCell) {
  const snap = {
    date,
    coverage: null,
    cells_measured: Object.values(tesByCell).filter((v) => v !== null).length,
    tes_by_cell: tesByCell,
    total_routings: 0,
    pricing_pending_count: Object.values(tesByCell).filter((v) => v === null).length,
  };
  fs.writeFileSync(path.join(dir, `${date}.json`), JSON.stringify(snap));
}

test('computeEvolution: empty dir → []', () => {
  const dir = makeSnapDir('evo-empty');
  const result = computeEvolution({ category: 'coding.completion', dir, now: Date.parse('2026-06-12T00:00:00Z') });
  assert.deepEqual(result, []);
});

test('computeEvolution: nonexistent dir → []', () => {
  const result = computeEvolution({ category: 'coding.completion', dir: path.join(tmp, 'no-dir'), now: Date.now() });
  assert.deepEqual(result, []);
});

test('computeEvolution: missing category arg → []', () => {
  const dir = makeSnapDir('evo-nocat');
  assert.deepEqual(computeEvolution({ dir }), []);
  assert.deepEqual(computeEvolution({}), []);
});

test('computeEvolution: returns only days where TES data exists for category', () => {
  const dir = makeSnapDir('evo-honest');
  const now = Date.parse('2026-06-12T12:00:00Z');
  // Day 1: has data for coding.completion
  writeSnapFile(dir, '2026-06-10', {
    'claude-sonnet-4-6|coding.completion': 42.5,
    'claude-haiku-4-5|coding.completion': 30.0,
    'claude-sonnet-4-6|reasoning.chain': 20.0,
  });
  // Day 2: NO data for coding.completion (null values → should not appear)
  writeSnapFile(dir, '2026-06-11', {
    'claude-sonnet-4-6|coding.completion': null,
    'claude-haiku-4-5|coding.completion': null,
  });
  // Day 3: has data for coding.completion
  writeSnapFile(dir, '2026-06-12', {
    'claude-sonnet-4-6|coding.completion': 50.0,
    'claude-haiku-4-5|coding.completion': 35.0,
  });

  const result = computeEvolution({ category: 'coding.completion', period_days: 30, dir, now });
  // Day 2026-06-11 has no real TES → omitted (honest)
  assert.equal(result.length, 2, `expected 2 points, got ${result.length}`);
  assert.equal(result[0].date, '2026-06-10');
  assert.equal(result[1].date, '2026-06-12');
  // Verify TES values are numbers (medians)
  for (const pt of result) {
    assert.ok(typeof pt.tes === 'number' && Number.isFinite(pt.tes), `tes should be finite number, got ${pt.tes}`);
  }
});

test('computeEvolution: median computed correctly for odd and even cell counts', () => {
  const dir = makeSnapDir('evo-median');
  const now = Date.parse('2026-06-12T12:00:00Z');
  // Three values → median is the middle one
  writeSnapFile(dir, '2026-06-12', {
    'model-a|coding.completion': 10,
    'model-b|coding.completion': 30,
    'model-c|coding.completion': 20,
  });
  const [pt] = computeEvolution({ category: 'coding.completion', period_days: 1, dir, now });
  assert.equal(pt.tes, 20, 'median of [10, 20, 30] = 20');

  // Two values → median is average of middle two
  const dir2 = makeSnapDir('evo-median2');
  writeSnapFile(dir2, '2026-06-12', {
    'model-a|coding.completion': 10,
    'model-b|coding.completion': 30,
  });
  const [pt2] = computeEvolution({ category: 'coding.completion', period_days: 1, dir: dir2, now });
  assert.equal(pt2.tes, 20, 'median of [10, 30] = 20');
});

test('computeEvolution: period_days filter excludes files older than cutoff', () => {
  const dir = makeSnapDir('evo-period');
  const now = Date.parse('2026-06-12T12:00:00Z');
  // Old file (60 days ago) — should be excluded by period_days=30
  writeSnapFile(dir, '2026-04-13', { 'model-a|coding.completion': 99 });
  // Recent file (1 day ago) — should be included
  writeSnapFile(dir, '2026-06-11', { 'model-a|coding.completion': 55 });

  const result = computeEvolution({ category: 'coding.completion', period_days: 30, dir, now });
  assert.equal(result.length, 1, 'only the recent file should be included');
  assert.equal(result[0].date, '2026-06-11');
  assert.equal(result[0].tes, 55);
});

test('computeEvolution: only matches the exact category, not partial string', () => {
  const dir = makeSnapDir('evo-exact-cat');
  const now = Date.parse('2026-06-12T12:00:00Z');
  writeSnapFile(dir, '2026-06-12', {
    'model-a|coding.completion': 40,
    'model-a|coding': 99, // different category — must NOT match "coding.completion"
  });
  const result = computeEvolution({ category: 'coding.completion', period_days: 5, dir, now });
  assert.equal(result.length, 1);
  assert.equal(result[0].tes, 40);
});

test('computeEvolution: results are in chronological order', () => {
  const dir = makeSnapDir('evo-chrono');
  const now = Date.parse('2026-06-15T12:00:00Z');
  // Write out of order
  writeSnapFile(dir, '2026-06-15', { 'model-a|coding.completion': 60 });
  writeSnapFile(dir, '2026-06-13', { 'model-a|coding.completion': 40 });
  writeSnapFile(dir, '2026-06-14', { 'model-a|coding.completion': 50 });

  const result = computeEvolution({ category: 'coding.completion', period_days: 10, dir, now });
  assert.equal(result.length, 3);
  assert.equal(result[0].date, '2026-06-13');
  assert.equal(result[1].date, '2026-06-14');
  assert.equal(result[2].date, '2026-06-15');
});

test('computeEvolution: malformed snapshot files are skipped, valid ones included', () => {
  const dir = makeSnapDir('evo-malformed');
  const now = Date.parse('2026-06-12T12:00:00Z');
  // Valid
  writeSnapFile(dir, '2026-06-12', { 'model-a|coding.completion': 55 });
  // Malformed JSON
  fs.writeFileSync(path.join(dir, '2026-06-11.json'), 'NOT JSON {{{');
  // Missing tes_by_cell key
  fs.writeFileSync(path.join(dir, '2026-06-10.json'), JSON.stringify({ date: '2026-06-10', coverage: null }));

  const result = computeEvolution({ category: 'coding.completion', period_days: 10, dir, now });
  assert.equal(result.length, 1, 'only the well-formed file with data should appear');
  assert.equal(result[0].date, '2026-06-12');
});
