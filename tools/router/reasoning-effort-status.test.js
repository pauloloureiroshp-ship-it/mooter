'use strict';

// Wave 60.5 Block C — 🧠 reasoning-effort statusline chip. node:test + assert/strict.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildEffortChip, optedIn, statusLine, STALE_MS } = require('./reasoning-effort-status.js');

// ── pure renderer ──────────────────────────────────────────────────────────
test('buildEffortChip: renders the level when fresh', () => {
  const now = 1_000_000_000_000;
  assert.equal(buildEffortChip({ effort: 'high', ts: now }, now), '🧠 eff:high');
  assert.equal(buildEffortChip({ effort: 'low', ts: now }, now), '🧠 eff:low');
  assert.equal(buildEffortChip({ effort: 'none', ts: now }, now), '🧠 eff:none');
});

test('buildEffortChip: silent on missing/invalid/empty state', () => {
  const now = 1_000_000_000_000;
  assert.equal(buildEffortChip(null, now), '');
  assert.equal(buildEffortChip({}, now), '');
  assert.equal(buildEffortChip({ effort: 'extreme', ts: now }, now), '', 'unknown level → silent');
  assert.equal(buildEffortChip({ effort: 'high' }, now), '', 'no ts → silent');
});

test('buildEffortChip: silent when stale (older than the window)', () => {
  const now = 1_000_000_000_000;
  assert.equal(buildEffortChip({ effort: 'high', ts: now - STALE_MS - 1 }, now), '', 'stale → silent');
  assert.equal(buildEffortChip({ effort: 'high', ts: now - STALE_MS + 1 }, now), '🧠 eff:high', 'within window → shown');
});

// ── opt-in gate ──────────────────────────────────────────────────────────────
test('optedIn: default off; on via pref or env', () => {
  const prevEnv = process.env.MOOTER_STATUSLINE_REASONING_EFFORT;
  delete process.env.MOOTER_STATUSLINE_REASONING_EFFORT;
  try {
    assert.equal(optedIn({}), false, 'empty prefs → off');
    assert.equal(optedIn({ statusline_chips: { reasoning_effort: false } }), false);
    assert.equal(optedIn({ statusline_chips: { reasoning_effort: true } }), true);
    process.env.MOOTER_STATUSLINE_REASONING_EFFORT = '1';
    assert.equal(optedIn({}), true, 'env opt-in wins');
  } finally {
    if (prevEnv === undefined) delete process.env.MOOTER_STATUSLINE_REASONING_EFFORT;
    else process.env.MOOTER_STATUSLINE_REASONING_EFFORT = prevEnv;
  }
});

// ── statusLine() end-to-end with a temp MOOTER_HOME ──────────────────────────
test('statusLine: silent when not opted in even if state exists', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 're-'));
  fs.writeFileSync(path.join(tmp, 'reasoning-effort.json'), JSON.stringify({ effort: 'high', ts: Date.now() }));
  const prevHome = process.env.MOOTER_HOME;
  const prevEnv = process.env.MOOTER_STATUSLINE_REASONING_EFFORT;
  process.env.MOOTER_HOME = tmp;
  delete process.env.MOOTER_STATUSLINE_REASONING_EFFORT;
  try {
    assert.equal(statusLine(), '', 'not opted in → silent (byte-identical default)');
  } finally {
    if (prevHome === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prevHome;
    if (prevEnv === undefined) delete process.env.MOOTER_STATUSLINE_REASONING_EFFORT; else process.env.MOOTER_STATUSLINE_REASONING_EFFORT = prevEnv;
  }
});

test('statusLine: renders when opted in via env and state is fresh', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 're-'));
  fs.writeFileSync(path.join(tmp, 'reasoning-effort.json'), JSON.stringify({ effort: 'medium', ts: Date.now() }));
  const prevHome = process.env.MOOTER_HOME;
  const prevEnv = process.env.MOOTER_STATUSLINE_REASONING_EFFORT;
  process.env.MOOTER_HOME = tmp;
  process.env.MOOTER_STATUSLINE_REASONING_EFFORT = '1';
  try {
    assert.equal(statusLine(), '🧠 eff:medium');
  } finally {
    if (prevHome === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prevHome;
    if (prevEnv === undefined) delete process.env.MOOTER_STATUSLINE_REASONING_EFFORT; else process.env.MOOTER_STATUSLINE_REASONING_EFFORT = prevEnv;
  }
});
