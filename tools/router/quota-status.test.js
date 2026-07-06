#!/usr/bin/env node
'use strict';
// MP-Q Q4 — 📅 weekly-quota chip tests.
// Run with:  node --test quota-status.test.js

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const QS = require('./quota-status.js');
const STATUSLINE = path.join(__dirname, 'gsd-statusline.js');

let TMP;

beforeEach(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-qchip-'));
  process.env.MOOTER_HOME = TMP;
  delete process.env.MOOTER_STATUSLINE_QUOTA;
});

afterEach(() => {
  delete process.env.MOOTER_HOME;
  delete process.env.MOOTER_STATUSLINE_QUOTA;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows lag */ }
});

const NOW = Date.parse('2026-07-06T12:00:00Z');

// ── pure renderer ────────────────────────────────────────────────────────────

test('chip: fresh 89% → 📅 semana 89% 🔴 (reset 2d)', () => {
  const live = { fresh: true, seven_day_pct: 89,
    resets: { seven_day: '2026-07-08T18:00:00Z' } };
  assert.equal(QS.buildQuotaChip(live, NOW), '📅 semana 89% 🔴 (reset 2d)');
});

test('chip: green band + no reset info → minimal honest form', () => {
  assert.equal(QS.buildQuotaChip({ fresh: true, seven_day_pct: 41.2, resets: {} }, NOW),
    '📅 semana 41% 🟢');
});

test('chip: missing / stale / shapeless → n/d, never a remembered number', () => {
  assert.equal(QS.buildQuotaChip(null, NOW), '📅 semana n/d');
  assert.equal(QS.buildQuotaChip({ fresh: false, seven_day_pct: 89 }, NOW), '📅 semana n/d');
  assert.equal(QS.buildQuotaChip({ fresh: true }, NOW), '📅 semana n/d');
});

// ── opt-in gate ──────────────────────────────────────────────────────────────

test('gate: default OFF → statusLine returns empty string', () => {
  assert.equal(QS.statusLine(), '');
});

test('gate: env opt-in without data → honest n/d', () => {
  process.env.MOOTER_STATUSLINE_QUOTA = '1';
  assert.equal(QS.statusLine(), '📅 semana n/d');
});

test('gate: prefs opt-in + fresh data → full chip; hidden_chips wins', () => {
  fs.writeFileSync(path.join(TMP, 'preferences.json'),
    JSON.stringify({ statusline_chips: { quota: true } }));
  fs.writeFileSync(path.join(TMP, 'quota-live.json'), JSON.stringify({
    v: 1, source: 'cc-statusline-stdin', ts: Date.now(),
    five_hour_pct: 48, seven_day_pct: 89, resets: {},
  }));
  assert.match(QS.statusLine(), /^📅 semana 89% 🔴$/);

  fs.writeFileSync(path.join(TMP, 'preferences.json'),
    JSON.stringify({ statusline_chips: { quota: true }, hidden_chips: ['quota'] }));
  assert.equal(QS.statusLine(), '');
});

// ── default statusline byte-identical ───────────────────────────────────────

function renderMock(extraEnv) {
  const env = Object.assign({}, process.env, { MOOTER_MOCK: '1', MOOTER_HOME: TMP }, extraEnv || {});
  const res = spawnSync(process.execPath, [STATUSLINE], { encoding: 'utf8', timeout: 20000, env });
  return res.stdout || '';
}

test('wired statusline: default render carries NO quota chip; opt-in adds it', () => {
  const def = renderMock();
  assert.ok(def.length > 0, 'mock render must produce output');
  assert.ok(!def.includes('📅 semana'), 'default must be byte-identical (no quota chip)');

  fs.writeFileSync(path.join(TMP, 'quota-live.json'), JSON.stringify({
    v: 1, source: 'cc-statusline-stdin', ts: Date.now(),
    five_hour_pct: 48, seven_day_pct: 89, resets: {},
  }));
  const opted = renderMock({ MOOTER_STATUSLINE_QUOTA: '1' });
  assert.ok(opted.includes('📅 semana 89% 🔴'), `opt-in render must show the chip, got: ${opted}`);
});
