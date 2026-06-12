'use strict';
// Wave 53 Phase H.1 — bench-status empirical evidence chip (anti-fabrication).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildBenchChip, isFresh, optedIn, statusLine, STALE_DAYS } = require('./bench-status.js');

const NOW = Date.parse('2026-06-10T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const fresh = (over = {}) => ({ accuracy: 0.6, total: 50, cohorts: 1, generated_at: iso(NOW - 86400000), ...over });

// ── anti-fabrication: `?` whenever there is no fresh real data ───────────────
test('absent results → 🧪 bench ?', () => {
  assert.strictEqual(buildBenchChip(null, NOW), '🧪 bench ?');
});

test('no generated_at → 🧪 bench ? (cannot prove freshness)', () => {
  assert.strictEqual(buildBenchChip({ accuracy: 0.6, total: 50 }, NOW), '🧪 bench ?');
});

test('stale results (> 30 days) → 🧪 bench ?', () => {
  const stale = fresh({ generated_at: iso(NOW - (STALE_DAYS + 1) * 86400000) });
  assert.strictEqual(buildBenchChip(stale, NOW), '🧪 bench ?');
});

test('non-numeric accuracy → 🧪 bench ?', () => {
  assert.strictEqual(buildBenchChip(fresh({ accuracy: 'NaN' }), NOW), '🧪 bench ?');
});

// ── real fresh data renders honestly ─────────────────────────────────────────
test('fresh fractional accuracy → formatted chip', () => {
  assert.strictEqual(buildBenchChip(fresh(), NOW), '🧪 bench 60% acc (50 wf, n=1)');
});

test('accuracy already in percent form is accepted', () => {
  assert.strictEqual(buildBenchChip(fresh({ accuracy: 60 }), NOW), '🧪 bench 60% acc (50 wf, n=1)');
});

test('missing total still shows cohort count', () => {
  assert.strictEqual(buildBenchChip(fresh({ total: 0 }), NOW), '🧪 bench 60% acc (n=1)');
});

test('isFresh boundary', () => {
  assert.strictEqual(isFresh(fresh({ generated_at: iso(NOW - STALE_DAYS * 86400000) }), NOW), true);
  assert.strictEqual(isFresh(fresh({ generated_at: iso(NOW - (STALE_DAYS * 86400000) - 1) }), NOW), false);
  assert.strictEqual(isFresh(null, NOW), false);
});

// ── opt-IN gating ────────────────────────────────────────────────────────────
test('optedIn requires statusline_chips.bench === true', () => {
  assert.strictEqual(optedIn({ statusline_chips: { bench: true } }), true);
  assert.strictEqual(optedIn({ statusline_chips: { bench: false } }), false);
  assert.strictEqual(optedIn({}), false);
  assert.strictEqual(optedIn(null), false);
});

test('statusLine: silent unless opted in, `?` when opted in without results', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-bench-'));
  const prevMH = process.env.MOOTER_HOME;
  const prevHome = process.env.HOME;
  const prevUP = process.env.USERPROFILE;
  process.env.MOOTER_HOME = dir;
  // os.homedir() (used by prefs()) reads USERPROFILE on Windows and HOME on
  // POSIX — set both so the opt-in write below is seen cross-platform. Without
  // USERPROFILE this test passed in CI (Linux) but failed locally on Windows.
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  try {
    fs.mkdirSync(path.join(dir, '.mooter'), { recursive: true });
    // not opted in → silent
    assert.strictEqual(statusLine(), '');
    // opted in, no RESULTS.json → honest `?`
    fs.writeFileSync(path.join(dir, '.mooter', 'preferences.json'), JSON.stringify({ statusline_chips: { bench: true } }));
    assert.strictEqual(statusLine(), '🧪 bench ?');
    // opted in + fresh RESULTS → real number
    fs.mkdirSync(path.join(dir, 'bench'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'bench', 'RESULTS.json'), JSON.stringify(fresh({ generated_at: new Date().toISOString() })));
    assert.strictEqual(statusLine(), '🧪 bench 60% acc (50 wf, n=1)');
  } finally {
    if (prevMH === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prevMH;
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUP;
  }
});
