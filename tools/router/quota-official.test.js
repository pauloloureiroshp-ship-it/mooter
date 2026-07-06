#!/usr/bin/env node
'use strict';
// MP-Q Q2 — official-first quota in quota-tracker.js.
//
// Isolates MOOTER_CLAUDE_DIR (tracker state) and MOOTER_HOME (quota-live.json)
// in tmp dirs. Run with:  node --test quota-official.test.js

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let TMP;

function freshTracker() {
  delete require.cache[require.resolve('./paths.js')];
  delete require.cache[require.resolve('./quota-tracker.js')];
  delete require.cache[require.resolve('./quota-live.js')];
  return require('./quota-tracker.js');
}

function writeLive(rec) {
  const home = process.env.MOOTER_HOME;
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'quota-live.json'), JSON.stringify(Object.assign({
    v: 1, source: 'cc-statusline-stdin', ts: Date.now(),
  }, rec)));
}

beforeEach(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-qofficial-'));
  fs.mkdirSync(path.join(TMP, 'tools', 'router'), { recursive: true });
  process.env.MOOTER_CLAUDE_DIR = TMP;
  process.env.MOOTER_HOME = path.join(TMP, '.mooter');
});

afterEach(() => {
  delete process.env.MOOTER_CLAUDE_DIR;
  delete process.env.MOOTER_HOME;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows lag */ }
});

test('fresh quota-live → basis:official, remaining from most-binding window', () => {
  writeLive({ five_hour_pct: 48, seven_day_pct: 89, opus_or_fable_pct: null,
    resets: { five_hour: null, seven_day: '2026-07-09T00:00:00.000Z' } });
  const t = freshTracker();
  const d = t.getQuotaRemainingDetailed('anthropic');
  assert.equal(d.basis, 'official');
  assert.equal(d.seven_day_pct, 89);
  assert.ok(Math.abs(d.remaining - 0.11) < 1e-9, `weekly 89% used → 0.11 remaining, got ${d.remaining}`);
  assert.equal(t.getQuotaRemaining('anthropic'), d.remaining, 'numeric contract follows detailed');
});

test('no quota-live → basis:estimated (legacy path intact)', () => {
  const t = freshTracker();
  const d = t.getQuotaRemainingDetailed('anthropic');
  assert.equal(d.basis, 'estimated');
  assert.equal(d.remaining, 1, 'empty estimate state → fully fresh');
});

test('stale quota-live (>10min) → falls back to estimated', () => {
  writeLive({ five_hour_pct: 48, seven_day_pct: 89, ts: Date.now() - 11 * 60 * 1000 });
  const t = freshTracker();
  assert.equal(t.getQuotaRemainingDetailed('anthropic').basis, 'estimated');
});

test('non-anthropic providers keep the estimate path', () => {
  writeLive({ five_hour_pct: 99, seven_day_pct: 99 });
  const t = freshTracker();
  assert.equal(t.getQuotaRemainingDetailed('openai_codex_cli').basis, 'estimated');
  assert.equal(t.getQuotaRemaining('ollama'), 1);
});

test('summary: exposes weekly pct, basis and reset when official', () => {
  writeLive({ five_hour_pct: 48, seven_day_pct: 89,
    resets: { five_hour: null, seven_day: '2026-07-09T00:00:00.000Z' } });
  const t = freshTracker();
  const s = t.summary();
  assert.equal(s.anthropic_basis, 'official');
  assert.equal(s.anthropic_weekly_pct, 89);
  assert.equal(s.anthropic_five_hour_pct, 48);
  assert.equal(s.anthropic_weekly_reset_at, '2026-07-09T00:00:00.000Z');
  assert.equal(s.anthropic_remaining_pct, 11);
});

test('summary: honest nulls when estimated', () => {
  const t = freshTracker();
  const s = t.summary();
  assert.equal(s.anthropic_basis, 'estimated');
  assert.equal(s.anthropic_weekly_pct, null);
  assert.equal(s.anthropic_weekly_reset_at, null);
});

test('getOfficialQuota: null when file missing, snapshot when fresh', () => {
  const t = freshTracker();
  assert.equal(t.getOfficialQuota(), null);
  writeLive({ five_hour_pct: 10, seven_day_pct: 20 });
  const t2 = freshTracker();
  const q = t2.getOfficialQuota();
  assert.equal(q.seven_day_pct, 20);
  assert.equal(q.fresh, true);
});
