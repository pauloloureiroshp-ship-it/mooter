// Wave 58 A.13 — matrix-status chip (specialization matrix coverage).
// Hermetic: pure buildMatrixChip with injected data+now; filesystem tests use
// a temp MOOTER_HOME so they never touch ~/.mooter on the developer's machine.
'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildMatrixChip,
  countMeasured,
  fmtAge,
  loadMerged,
  optedIn,
  parseAsOf,
  statusLine,
  MATRIX_TOTAL_CELLS,
  MATRIX_MODELS_COUNT,
  MATRIX_CATEGORIES_COUNT,
} = require('./matrix-status.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

// A timestamp we pin for all "now" arguments so tests are deterministic.
// "2026-06-12T12:00:00Z" — one day after the seed's as_of "2026-06-01" (normalised).
// Days since 2026-06-01: 11 days → age "11d"
const NOW = Date.parse('2026-06-12T12:00:00Z');

/** Minimal valid merged-data object with N measured cells and a given as_of. */
function makeData(measuredCount, asOf = '2026-06') {
  const cells = [];
  for (let i = 0; i < measuredCount; i++) {
    cells.push({ model: `model-${i}`, category: `cat-${i}`, measured: true });
  }
  return { cells, meta: { as_of: asOf } };
}

// ── Temp home for statusLine() integration tests ──────────────────────────────

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-matrix-'));
after(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ── MATRIX_TOTAL_CELLS constant ───────────────────────────────────────────────

test('MATRIX_TOTAL_CELLS equals 14 × 24 = 336', () => {
  assert.equal(MATRIX_TOTAL_CELLS, 336);
  assert.equal(MATRIX_MODELS_COUNT * MATRIX_CATEGORIES_COUNT, 336);
});

// ── countMeasured ─────────────────────────────────────────────────────────────

test('countMeasured: empty array → 0', () => {
  assert.equal(countMeasured([]), 0);
});

test('countMeasured: counts only cells with measured === true', () => {
  const cells = [
    { model: 'a', category: 'x', measured: true },
    { model: 'b', category: 'y', measured: false },
    { model: 'c', category: 'z', measured: true },
    { model: 'd', category: 'w' }, // no measured field
  ];
  assert.equal(countMeasured(cells), 2);
});

test('countMeasured: null/undefined cells are skipped gracefully', () => {
  assert.equal(countMeasured([null, undefined, { measured: true }]), 1);
});

// ── parseAsOf ─────────────────────────────────────────────────────────────────

test('parseAsOf: null/undefined/empty → null', () => {
  assert.equal(parseAsOf(null), null);
  assert.equal(parseAsOf(undefined), null);
  assert.equal(parseAsOf(''), null);
});

test('parseAsOf: full ISO date string returns Date', () => {
  const d = parseAsOf('2026-06-12');
  assert.ok(d instanceof Date);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 5); // June (0-indexed)
});

test('parseAsOf: "YYYY-MM" shortform is normalised to 1st of month', () => {
  const d = parseAsOf('2026-06');
  assert.ok(d instanceof Date);
  // Validate using UTC methods to avoid local-timezone surprises on Windows.
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 5); // June (0-indexed)
  assert.equal(d.getUTCDate(), 1);
});

test('parseAsOf: garbage string → null', () => {
  assert.equal(parseAsOf('not-a-date'), null);
  assert.equal(parseAsOf('abcdef'), null);
});

// ── fmtAge ────────────────────────────────────────────────────────────────────

test('fmtAge: null date → ?', () => {
  assert.equal(fmtAge(null, NOW), '?');
});

test('fmtAge: same day → 0d', () => {
  assert.equal(fmtAge(new Date(NOW), NOW), '0d');
});

test('fmtAge: future date → 0d (clamp)', () => {
  assert.equal(fmtAge(new Date(NOW + 86400000), NOW), '0d');
});

test('fmtAge: 1 day ago → 1d', () => {
  assert.equal(fmtAge(new Date(NOW - 86400000), NOW), '1d');
});

test('fmtAge: 30 days ago → 30d', () => {
  assert.equal(fmtAge(new Date(NOW - 30 * 86400000), NOW), '30d');
});

test('fmtAge: 31 days ago → 1mo', () => {
  assert.equal(fmtAge(new Date(NOW - 31 * 86400000), NOW), '1mo');
});

test('fmtAge: 365 days ago → 12mo (< 1y threshold)', () => {
  // 365 days = 12.1 months; threshold is months < 13 so it renders in months
  assert.equal(fmtAge(new Date(NOW - 365 * 86400000), NOW), '12mo');
});

test('fmtAge: 400 days ago → 1y', () => {
  assert.equal(fmtAge(new Date(NOW - 400 * 86400000), NOW), '1y');
});

// ── buildMatrixChip — anti-fabrication ───────────────────────────────────────

test('buildMatrixChip: null data → 🎯 Matrix: ?', () => {
  assert.equal(buildMatrixChip(null, NOW), '🎯 Matrix: ?');
});

test('buildMatrixChip: data without cells array → 🎯 Matrix: ?', () => {
  assert.equal(buildMatrixChip({ meta: { as_of: '2026-06' } }, NOW), '🎯 Matrix: ?');
  assert.equal(buildMatrixChip({}, NOW), '🎯 Matrix: ?');
});

test('buildMatrixChip: absent as_of → age shows ?', () => {
  const chip = buildMatrixChip({ cells: [], meta: null }, NOW);
  assert.match(chip, /refreshed \? ago/);
});

test('buildMatrixChip: no measured cells → 0/336 measured', () => {
  const chip = buildMatrixChip(makeData(0, '2026-06'), NOW);
  assert.match(chip, /0\/336 measured/);
});

// ── buildMatrixChip — real data renders honestly ──────────────────────────────

test('buildMatrixChip: 14 measured cells renders correct chip', () => {
  // as_of "2026-06" normalises to 2026-06-01; NOW is 2026-06-12 → 11 days ago
  const chip = buildMatrixChip(makeData(14, '2026-06'), NOW);
  assert.equal(chip, '🎯 Matrix: 14 mod × 24 cat · 14/336 measured · refreshed 11d ago');
});

test('buildMatrixChip: chip always starts with 🎯 Matrix:', () => {
  assert.ok(buildMatrixChip(makeData(5, '2026-06'), NOW).startsWith('🎯 Matrix:'));
});

test('buildMatrixChip: chip format includes mod × cat', () => {
  const chip = buildMatrixChip(makeData(1, '2026-06-01'), NOW);
  assert.match(chip, /14 mod × 24 cat/);
});

test('buildMatrixChip: uses provided now for age calculation', () => {
  const asOf = new Date('2026-01-01T00:00:00Z');
  // 100 days before NOW
  const t = NOW - 100 * 86400000;
  const chip = buildMatrixChip(makeData(1, asOf.toISOString()), t);
  // asOf = 2026-01-01; t is 100 days before NOW (2026-06-12) = ~2026-03-04
  // diff from 2026-01-01 to ~2026-03-04 = ~62 days = ~2mo
  assert.match(chip, /refreshed \d+(d|mo|y) ago/);
});

// ── optedIn ───────────────────────────────────────────────────────────────────

test('optedIn: requires statusline_chips.matrix === true', () => {
  assert.equal(optedIn({ statusline_chips: { matrix: true } }), true);
  assert.equal(optedIn({ statusline_chips: { matrix: false } }), false);
  assert.equal(optedIn({ statusline_chips: {} }), false);
  assert.equal(optedIn({}), false);
  assert.equal(optedIn(null), false);
  assert.equal(optedIn(undefined), false);
});

test('optedIn: MOOTER_STATUSLINE_MATRIX=1 env overrides prefs', () => {
  const prev = process.env.MOOTER_STATUSLINE_MATRIX;
  process.env.MOOTER_STATUSLINE_MATRIX = '1';
  try {
    assert.equal(optedIn({}), true);
    assert.equal(optedIn(null), true);
  } finally {
    if (prev === undefined) delete process.env.MOOTER_STATUSLINE_MATRIX;
    else process.env.MOOTER_STATUSLINE_MATRIX = prev;
  }
});

// ── loadMerged — reads the real seed in the repo ──────────────────────────────

test('loadMerged: reads real benchmark seed from repo data/', () => {
  // This test does NOT set MOOTER_REPO_ROOT — it relies on the __dirname-relative
  // path resolution in matrix-status.js.  The seed ships in the repo so this
  // should always find data/benchmark-seed-2026.json relative to tools/router/.
  const data = loadMerged();
  assert.ok(Array.isArray(data.cells), 'cells is an array');
  assert.ok(data.cells.length > 0, 'at least one seed cell loaded');
  // The seed _meta documents 14 seeded cells
  const measuredCount = countMeasured(data.cells);
  assert.ok(measuredCount > 0, `at least 1 measured cell; got ${measuredCount}`);
  assert.ok(data.meta && data.meta.as_of, '_meta.as_of is present in seed');
});

test('loadMerged: overrides JSON from MOOTER_HOME wins over seed for same cell', () => {
  // mooterHome() returns MOOTER_HOME directly (no .mooter subdir appended).
  // overridesFilePath() = path.join(mooterHome(), 'benchmarks-overrides.json')
  //   → <home>/benchmarks-overrides.json (not <home>/.mooter/...)
  const home = path.join(tmp, 'override-home');
  fs.mkdirSync(home, { recursive: true });

  // Write a user override that modifies the first seed cell we read.
  // We use a model+category combo we know exists in the seed.
  const override = {
    cells: [{
      model: 'claude-opus-4-8',
      category: 'coding.backend',
      score: 0.999,
      source: 'override-test',
      measured: true,
      as_of: '2099-01',
    }],
  };
  fs.writeFileSync(path.join(home, 'benchmarks-overrides.json'), JSON.stringify(override));

  const prevMH = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = home;
  try {
    const data = loadMerged();
    const cell = data.cells.find(
      (c) => c.model === 'claude-opus-4-8' && c.category === 'coding.backend'
    );
    assert.ok(cell, 'cell is present after merge');
    assert.equal(cell.source, 'override-test', 'override wins over seed');
    assert.equal(cell.score, 0.999);
  } finally {
    if (prevMH === undefined) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = prevMH;
  }
});

// ── statusLine() integration ──────────────────────────────────────────────────

test('statusLine: silent when not opted in', () => {
  // mooterHome() returns MOOTER_HOME directly; prefs() reads mooterHome()/preferences.json.
  const home = path.join(tmp, 'not-opted-in');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(
    path.join(home, 'preferences.json'),
    JSON.stringify({ statusline_chips: { matrix: false } })
  );

  const prevMH = process.env.MOOTER_HOME;
  const prevHome = process.env.HOME;
  const prevUP = process.env.USERPROFILE;
  const prevEnv = process.env.MOOTER_STATUSLINE_MATRIX;
  process.env.MOOTER_HOME = home;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.MOOTER_STATUSLINE_MATRIX;
  try {
    assert.equal(statusLine(), '', 'silent when not opted in');
  } finally {
    if (prevMH === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prevMH;
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUP;
    if (prevEnv === undefined) delete process.env.MOOTER_STATUSLINE_MATRIX;
    else process.env.MOOTER_STATUSLINE_MATRIX = prevEnv;
  }
});

test('statusLine: opted in via prefs → returns chip starting with 🎯', () => {
  // mooterHome() returns MOOTER_HOME directly; prefs() reads mooterHome()/preferences.json.
  const home = path.join(tmp, 'opted-in');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(
    path.join(home, 'preferences.json'),
    JSON.stringify({ statusline_chips: { matrix: true } })
  );

  const prevMH = process.env.MOOTER_HOME;
  const prevHome = process.env.HOME;
  const prevUP = process.env.USERPROFILE;
  const prevEnv = process.env.MOOTER_STATUSLINE_MATRIX;
  process.env.MOOTER_HOME = home;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.MOOTER_STATUSLINE_MATRIX;
  try {
    const line = statusLine();
    assert.ok(line.startsWith('🎯'), `expected chip starting with 🎯, got: "${line}"`);
    assert.match(line, /\d+\/336 measured/);
  } finally {
    if (prevMH === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prevMH;
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUP;
    if (prevEnv === undefined) delete process.env.MOOTER_STATUSLINE_MATRIX;
    else process.env.MOOTER_STATUSLINE_MATRIX = prevEnv;
  }
});
