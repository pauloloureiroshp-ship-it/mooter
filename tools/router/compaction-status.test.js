'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-compact-chip-'));
process.env.MOOTER_HOME = TMP;
delete process.env.MOOTER_STATUSLINE_COMPACTION;

const chip = require('./compaction-status.js');
const advisor = require('./compaction-advisor.js');

function setPrefs(obj) {
  fs.writeFileSync(path.join(TMP, 'preferences.json'), JSON.stringify(obj));
}

test('buildChip — pure render of decisions', () => {
  assert.strictEqual(chip.buildChip(null), '');
  assert.strictEqual(chip.buildChip({ last_decision: 'HOLD' }), '');
  assert.strictEqual(chip.buildChip({ last_decision: 'PREP_SNAPSHOT' }), '🪶 prep');
  assert.strictEqual(chip.buildChip({ last_decision: 'ADVISE_NOW' }), '🪶 compact?');
});

test('statusLine — default OFF returns empty (statusline byte-identical)', () => {
  setPrefs({}); // not opted in
  advisor.writeState('sX', { category: 'x', cwd: '/a', last_decision: 'ADVISE_NOW' });
  assert.strictEqual(chip.statusLine('sX'), '');
});

test('statusLine — opted in via prefs surfaces the advice', () => {
  setPrefs({ statusline_chips: { compaction: true } });
  advisor.writeState('sY', { category: 'x', cwd: '/a', last_decision: 'ADVISE_NOW' });
  assert.strictEqual(chip.statusLine('sY'), '🪶 compact?');
  advisor.writeState('sZ', { category: 'x', cwd: '/a', last_decision: 'HOLD' });
  assert.strictEqual(chip.statusLine('sZ'), ''); // opted in but no advice → silent
});

test('statusLine — env opt-in wins, and =0 forces off', () => {
  setPrefs({ statusline_chips: { compaction: true } });
  advisor.writeState('sE', { category: 'x', cwd: '/a', last_decision: 'PREP_SNAPSHOT' });
  process.env.MOOTER_STATUSLINE_COMPACTION = '0';
  assert.strictEqual(chip.statusLine('sE'), ''); // env off overrides prefs on
  process.env.MOOTER_STATUSLINE_COMPACTION = '1';
  setPrefs({}); // prefs off, env on
  assert.strictEqual(chip.statusLine('sE'), '🪶 prep');
  delete process.env.MOOTER_STATUSLINE_COMPACTION;
});

test('statusLine — unknown session / no breadcrumb → empty even when opted in', () => {
  setPrefs({ statusline_chips: { compaction: true } });
  assert.strictEqual(chip.statusLine('never-seen'), '');
});
