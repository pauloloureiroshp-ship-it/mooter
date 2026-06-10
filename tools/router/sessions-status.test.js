'use strict';
// Wave 53 Phase A′ — sessions-status line-3 cross-session chip.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildSessionsChip, isLive, labelFor, ageStr, statusLine,
} = require('./sessions-status.js');

const SELF = 'self-sess';
const NOW = 1_000_000_000_000;
const STALE_MS = 30000;

function hb(over = {}) {
  return {
    session_id: 'sis-1',
    terminal_name: 'unknown',
    worktree_path: '/repo/frugal',
    branch: 'wave52',
    intent: '',
    last_heartbeat: new Date(NOW).toISOString(),
    last_heartbeat_ms: NOW,
    active_locks: [],
    pending_intents: [],
    pid: 123,
    ...over,
  };
}

// ── pure renderer ────────────────────────────────────────────────────────
test('no selfSessionId → silent (never mislabel self)', () => {
  assert.strictEqual(buildSessionsChip([hb()], { selfSessionId: null, now: NOW }), '');
});

test('empty / no live sisters → silent', () => {
  assert.strictEqual(buildSessionsChip([], { selfSessionId: SELF, now: NOW }), '');
});

test('self is excluded by session_id', () => {
  const out = buildSessionsChip([hb({ session_id: SELF })], { selfSessionId: SELF, now: NOW });
  assert.strictEqual(out, '');
});

test('one live sister → labelled with branch + age', () => {
  const out = buildSessionsChip([hb({ last_heartbeat_ms: NOW - 4000 })], { selfSessionId: SELF, now: NOW });
  assert.strictEqual(out, '⇄ 1 sister (wave52 4s)');
});

test('stale sister (older than STALE_MS) is excluded', () => {
  const out = buildSessionsChip([hb({ last_heartbeat_ms: NOW - STALE_MS - 1 })], { selfSessionId: SELF, now: NOW });
  assert.strictEqual(out, '');
});

test('exactly STALE_MS old is still live (boundary inclusive)', () => {
  const out = buildSessionsChip([hb({ last_heartbeat_ms: NOW - STALE_MS })], { selfSessionId: SELF, now: NOW });
  assert.strictEqual(out, '⇄ 1 sister (wave52 30s)');
});

test('multiple sisters → plural + freshest first', () => {
  const out = buildSessionsChip([
    hb({ session_id: 'a', branch: 'wave-mega', last_heartbeat_ms: NOW - 12000 }),
    hb({ session_id: 'b', branch: 'wave52', last_heartbeat_ms: NOW - 4000 }),
  ], { selfSessionId: SELF, now: NOW });
  assert.strictEqual(out, '⇄ 2 sisters (wave52 4s · wave-mega 12s)');
});

test('more than MAX_NAMED → +K tail', () => {
  const sisters = ['a', 'b', 'c', 'd', 'e'].map((id, i) =>
    hb({ session_id: id, branch: id, last_heartbeat_ms: NOW - (i + 1) * 1000 }));
  const out = buildSessionsChip(sisters, { selfSessionId: SELF, now: NOW });
  assert.match(out, /^⇄ 5 sisters \(a 1s · b 2s · c 3s · \+2\)$/);
});

test('privacy: chip never leaks model/tier/tokens/savings for a sister', () => {
  // Even if a future Heartbeat carries such fields, they must never render.
  const out = buildSessionsChip([
    hb({ session_id: 'a', branch: 'wave52', model: 'opus', tier: 'T3', tokens_total: 12345, saved_usd: 0.42, last_heartbeat_ms: NOW - 4000 }),
  ], { selfSessionId: SELF, now: NOW });
  assert.strictEqual(out, '⇄ 1 sister (wave52 4s)');
  assert.doesNotMatch(out, /opus|sonnet|haiku|tokens?|saved|\$|T[0-5]\b/i);
});

// ── helpers ──────────────────────────────────────────────────────────────
test('labelFor falls back branch → terminal → basename → session', () => {
  assert.strictEqual(labelFor(hb({ branch: 'feat/x' })), 'feat/x');
  assert.strictEqual(labelFor(hb({ branch: null, terminal_name: 'paulo-2121' })), 'paulo-2121');
  assert.strictEqual(labelFor(hb({ branch: null, terminal_name: 'unknown', worktree_path: '/a/b/frugal-wave53' })), 'frugal-wave53');
  assert.strictEqual(labelFor(hb({ branch: null, terminal_name: 'unknown', worktree_path: '' })), 'session');
});

test('labelFor clamps long names', () => {
  const out = labelFor(hb({ branch: 'wave53-local-cc-mirror-extra-long' }));
  assert.ok(out.length <= 16 && out.endsWith('…'), out);
});

test('ageStr: seconds under a minute, minutes above', () => {
  assert.strictEqual(ageStr(4000), '4s');
  assert.strictEqual(ageStr(59000), '59s');
  assert.strictEqual(ageStr(90000), '2m');
});

test('isLive boundary', () => {
  assert.strictEqual(isLive(hb({ last_heartbeat_ms: NOW }), NOW), true);
  assert.strictEqual(isLive(hb({ last_heartbeat_ms: NOW - STALE_MS }), NOW), true);
  assert.strictEqual(isLive(hb({ last_heartbeat_ms: NOW - STALE_MS - 1 }), NOW), false);
  assert.strictEqual(isLive({}, NOW), false);
});

// ── statusLine integration (real fs read under MOOTER_HOME) ───────────────
function withMooterHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-sesschip-'));
  const prevMH = process.env.MOOTER_HOME;
  const prevHome = process.env.HOME;
  process.env.MOOTER_HOME = dir;       // heartbeatsDir base
  process.env.HOME = dir;              // prefs() reads $HOME/.mooter/preferences.json
  try {
    fs.mkdirSync(path.join(dir, 'orchestration', 'heartbeats'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.mooter'), { recursive: true });
    return fn(dir);
  } finally {
    if (prevMH === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prevMH;
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
  }
}

test('statusLine reads heartbeat files and excludes self', () => {
  withMooterHome((dir) => {
    const hbDir = path.join(dir, 'orchestration', 'heartbeats');
    fs.writeFileSync(path.join(hbDir, 'self-sess.json'), JSON.stringify(hb({ session_id: SELF, last_heartbeat_ms: Date.now() })));
    fs.writeFileSync(path.join(hbDir, 'sis.json'), JSON.stringify(hb({ session_id: 'sis', branch: 'wave52', last_heartbeat_ms: Date.now() })));
    const out = statusLine(SELF);
    assert.match(out, /^⇄ 1 sister \(wave52 \ds\)$/, out);
  });
});

test('statusLine honours hidden_chips opt-out', () => {
  withMooterHome((dir) => {
    fs.writeFileSync(path.join(dir, '.mooter', 'preferences.json'), JSON.stringify({ hidden_chips: ['sessions'] }));
    const hbDir = path.join(dir, 'orchestration', 'heartbeats');
    fs.writeFileSync(path.join(hbDir, 'sis.json'), JSON.stringify(hb({ session_id: 'sis', last_heartbeat_ms: Date.now() })));
    assert.strictEqual(statusLine(SELF), '');
  });
});

test('statusLine silent when no heartbeats dir', () => {
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = path.join(os.tmpdir(), 'mooter-nonexistent-' + process.pid);
  try {
    assert.strictEqual(statusLine(SELF), '');
  } finally {
    if (prev === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
  }
});
