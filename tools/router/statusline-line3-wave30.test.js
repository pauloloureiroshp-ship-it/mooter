#!/usr/bin/env node
// @ts-check
/**
 * Wave 30 Phase N — line-3 chip builders:
 *   wave-status.js · dogfood-status.js · mlwr-status.js · limits-status.js · pastor-status.js
 *
 * Pure builders + statusLine() readers (temp MOOTER_HOME). Line-3 is opt-in and
 * default OFF, so lines 1-2 of statusline-multi.js are unaffected.
 *
 * Run with:  node --test statusline-line3-wave30.test.js
 */

'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const wave = require('./wave-status.js');
const dog = require('./dogfood-status.js');
const mlwr = require('./mlwr-status.js');
const limits = require('./limits-status.js');
const pastor = require('./pastor-status.js');

let HOME;
let SAVED;
beforeEach(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-l3w30-'));
  SAVED = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = HOME;
});
afterEach(() => {
  if (SAVED === undefined) delete process.env.MOOTER_HOME;
  else process.env.MOOTER_HOME = SAVED;
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {}
});

function write(rel, contents) {
  const p = path.join(HOME, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contents);
}

// ── wave chip ────────────────────────────────────────────────────────────────
test('wave chip: builds from central-state, null without active wave', () => {
  assert.equal(wave.buildWaveChip(null), null);
  assert.equal(wave.buildWaveChip({ currentWave: null }), null);
  assert.equal(
    wave.buildWaveChip({ currentWave: { number: 30, phases: [{ status: 'done' }, { status: 'todo' }] } }),
    '🔄 W30 1/2',
  );
});
test('wave statusLine reads state.json', () => {
  assert.equal(wave.statusLine(), null);
  write('state.json', JSON.stringify({ currentWave: { number: 30, phases: [{ status: 'done' }, { status: 'done' }, { status: 'todo' }] } }));
  assert.equal(wave.statusLine(), '🔄 W30 2/3');
});

// ── dogfood chip ──────────────────────────────────────────────────────────────
test('dogfood chip: counts today (UTC), null when none', () => {
  const now = new Date('2026-06-07T12:00:00Z');
  assert.equal(dog.buildDogfoodChip(0), null);
  assert.equal(dog.buildDogfoodChip(5), '🍖 5 friction today');
  const lines = [
    JSON.stringify({ ts: '2026-06-07T01:00:00Z' }),
    JSON.stringify({ ts: '2026-06-06T23:00:00Z' }),
    '',
  ];
  assert.equal(dog.countToday(lines, now), 1);
});
test('dogfood statusLine reads dogfood.jsonl', () => {
  assert.equal(dog.statusLine(new Date('2026-06-07T12:00:00Z')), null);
  write('dogfood.jsonl', JSON.stringify({ ts: '2026-06-07T05:00:00Z' }) + '\n');
  assert.equal(dog.statusLine(new Date('2026-06-07T12:00:00Z')), '🍖 1 friction today');
});

// ── mlwr chip ─────────────────────────────────────────────────────────────────
test('mlwr chip: overall % from snapshot', () => {
  assert.equal(mlwr.buildMlwrChip(null), null);
  assert.equal(mlwr.buildMlwrChip({ mlwr: { overall: 1 } }), '📊 MLWR 100% local');
  assert.equal(mlwr.buildMlwrChip({ mlwr: { overall: 0.68 } }), '📊 MLWR 68% local');
});
test('mlwr statusLine reads mlwr_snapshot.json', () => {
  assert.equal(mlwr.statusLine(), null);
  write('mlwr_snapshot.json', JSON.stringify({ mlwr: { overall: 0.9 } }));
  assert.equal(mlwr.statusLine(), '📊 MLWR 90% local');
});

// ── limits chip ───────────────────────────────────────────────────────────────
test('limits chip: status object wins, else config presence', () => {
  assert.equal(limits.buildLimitsChip(null, false), null);
  assert.equal(limits.buildLimitsChip(null, true), '🔒 limits OK');
  assert.equal(limits.buildLimitsChip({ ok: true }, true), '🔒 limits OK');
  assert.equal(limits.buildLimitsChip({ ok: false }, true), '🔓 limits HIT');
});
test('limits statusLine: limits.toml presence yields OK', () => {
  assert.equal(limits.statusLine(), null);
  write('limits.toml', '[limits]\n');
  assert.equal(limits.statusLine(), '🔒 limits OK');
});

// ── pastor chip ───────────────────────────────────────────────────────────────
test('pastor chip: label/hint or null', () => {
  assert.equal(pastor.buildPastorChip(null), null);
  assert.equal(pastor.buildPastorChip({ label: 'try local for refactors' }), '💡 try local for refactors');
  assert.equal(pastor.buildPastorChip({}), null);
});
