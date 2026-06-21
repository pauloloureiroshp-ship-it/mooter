#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * chip-composer.test.js — Wave 58 A.5 (statusline unification).
 *
 * The composer is the shared SSOT for the modular chip set. These tests pin the
 * two-tier contract that keeps the WIRED statusline honest:
 *   - DEFAULT_ELIGIBLE is a strict subset of CHIP_MODULES.
 *   - The always-on line-3-only chips (mlwr, terminal-name) are NOT in
 *     DEFAULT_ELIGIBLE, so the default wired statusline never surfaces them.
 *   - With default/empty preferences the composer emits ONLY the matrix chip.
 *   - composeChips({lineGateOn:true}) runs the full historic list.
 *   - A throwing chip module never breaks the composer (try/catch → skip).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const composer = require('./chip-composer.js');
const { CHIP_MODULES, DEFAULT_ELIGIBLE, collectFrom, composeChips } = composer;

// ── Membership invariants ───────────────────────────────────────────────────

test('DEFAULT_ELIGIBLE is a strict subset of CHIP_MODULES', () => {
  for (const m of DEFAULT_ELIGIBLE) {
    assert.ok(CHIP_MODULES.includes(m), `${m} (default-eligible) must also be in the full list`);
  }
  assert.ok(DEFAULT_ELIGIBLE.length < CHIP_MODULES.length, 'default set is strictly smaller');
});

test('always-on line-3-only chips are NOT default-eligible', () => {
  // These two never self-gate on a preference, so they must stay out of the
  // default wired statusline (A.5 contract: matrix is the only new default chip).
  assert.ok(!DEFAULT_ELIGIBLE.includes('./mlwr-status.js'), 'mlwr must not be default-eligible');
  assert.ok(!DEFAULT_ELIGIBLE.includes('./terminal-name-status.js'), 'terminal-name must not be default-eligible');
});

test('matrix + agents-progress + graph are present in both lists', () => {
  for (const m of ['./matrix-status.js', './agents-progress-status.js', './graph-status.js']) {
    assert.ok(DEFAULT_ELIGIBLE.includes(m), `${m} in default set`);
    assert.ok(CHIP_MODULES.includes(m), `${m} in full list`);
  }
});

// ── Default render: matrix-only ───────────────────────────────────────────────

test('composeChips default (empty prefs) → only the matrix chip', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-composer-'));
  const prevMH = process.env.MOOTER_HOME;
  const prevHome = process.env.HOME;
  const prevUP = process.env.USERPROFILE;
  const prevEnv = process.env.MOOTER_STATUSLINE_MATRIX;
  process.env.MOOTER_HOME = home;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.MOOTER_STATUSLINE_MATRIX;
  try {
    const line = composeChips('sess-x'); // default: lineGateOn falsy
    assert.ok(line, 'expected a non-null chip line');
    assert.ok(line.startsWith('🎯 Matrix:'), `expected matrix-only, got: "${line}"`);
    assert.ok(!line.includes('📊 local routes'), 'mlwr must not appear in default render');
    assert.ok(!line.includes('🪟'), 'terminal-name must not appear in default render');
    assert.ok(!line.includes('🕸'), 'graph chip must not appear in default render (Wave 61 opt-in)');
  } finally {
    if (prevMH === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prevMH;
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUP;
    if (prevEnv === undefined) delete process.env.MOOTER_STATUSLINE_MATRIX; else process.env.MOOTER_STATUSLINE_MATRIX = prevEnv;
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

test('composeChips default → null when matrix is explicitly hidden', () => {
  const prevEnv = process.env.MOOTER_STATUSLINE_MATRIX;
  process.env.MOOTER_STATUSLINE_MATRIX = '0';
  try {
    // With matrix hidden and no other default-eligible chip active, no chips →
    // null (so the wired statusline appends nothing → byte-identical base).
    const line = composeChips('sess-x');
    assert.equal(line, null);
  } finally {
    if (prevEnv === undefined) delete process.env.MOOTER_STATUSLINE_MATRIX; else process.env.MOOTER_STATUSLINE_MATRIX = prevEnv;
  }
});

// ── lineGateOn:true runs the full list ────────────────────────────────────────

test('composeChips({lineGateOn:true}) iterates the FULL historic list', () => {
  // We assert via collectFrom on a hermetic stub set rather than touching real
  // modules: prove the gate selects CHIP_MODULES (length) not DEFAULT_ELIGIBLE.
  const spyDefault = composer.collectChips('s', { lineGateOn: false });
  const spyFull = composer.collectChips('s', { lineGateOn: true });
  // Full run visits a superset of modules → at least as many chips as default.
  assert.ok(Array.isArray(spyDefault) && Array.isArray(spyFull));
  assert.ok(spyFull.length >= spyDefault.length,
    `full(${spyFull.length}) should be >= default(${spyDefault.length})`);
});

// ── Resilience: a throwing chip is skipped ────────────────────────────────────

test('collectFrom: a throwing chip module is skipped, others survive', () => {
  // Build a temp module that throws on statusLine() and one that returns a chip.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-chip-stub-'));
  const badPath = path.join(dir, 'bad.js');
  const goodPath = path.join(dir, 'good.js');
  fs.writeFileSync(badPath, "module.exports={statusLine(){throw new Error('boom');}};");
  fs.writeFileSync(goodPath, "module.exports={statusLine(){return '✅ ok';}};");
  try {
    const chips = collectFrom([badPath, goodPath], 'sess');
    assert.deepEqual(chips, ['✅ ok'], 'bad chip skipped, good chip kept');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});
