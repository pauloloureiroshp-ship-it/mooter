#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * gsd-statusline-chips.test.js — Wave 58 A.5 (statusline unification).
 *
 * Spawns the WIRED statusline (gsd-statusline.js) with a hermetic empty
 * MOOTER_HOME and asserts the A.5 contract end-to-end:
 *   - the 🎯 matrix chip IS appended by default (default-ON);
 *   - the opt-in / always-on line-3-only chips are NOT present by default
 *     (agent-focus, conductor, sessions, bench, cca-f, mlwr, terminal-name);
 *   - MOOTER_STATUSLINE_MATRIX=0 suppresses the matrix chip (render collapses
 *     back to the base statusline — no appended chip line).
 *
 * Spawn-based because gsd-statusline.js reads its JSON from stdin and writes to
 * stdout; this exercises the real appendModularChips() boundary.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STATUSLINE_PATH = path.join(__dirname, 'gsd-statusline.js');
const SAMPLE_STDIN = JSON.stringify({
  model: { display_name: 'opus', id: 'claude-opus-4-7' },
  context_window: { remaining_percentage: 77 },
  session_id: 'chips-test',
});

function render(extraEnv) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-gsd-chips-'));
  try {
    const r = spawnSync(process.execPath, [STATUSLINE_PATH], {
      input: SAMPLE_STDIN,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        MOOTER_HOME: home,
        HOME: home,
        USERPROFILE: home,
        ...extraEnv,
      },
    });
    assert.equal(r.status, 0, `statusline exited ${r.status}: ${r.stderr}`);
    return r.stdout;
  } finally {
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

test('default render appends the 🎯 matrix chip (default-ON)', () => {
  const out = render({ MOOTER_STATUSLINE_MATRIX: undefined });
  assert.ok(out.includes('🎯 Matrix:'), `expected 🎯 Matrix: chip; got:\n${out}`);
  // Base statusline still present (the brand cow on line 1).
  assert.ok(out.includes('🐮'), 'base statusline (🐮) must still render');
});

test('default render does NOT surface opt-in / always-on line-3-only chips', () => {
  const out = render({ MOOTER_STATUSLINE_MATRIX: undefined });
  // Opt-in chips: silent until enabled.
  assert.ok(!out.includes('🧪'), 'bench chip must stay opt-in/silent');
  assert.ok(!out.includes('📜 cca-f'), 'cca-f chip must stay opt-in/silent');
  // Always-on line-3-only chips: only behind the legacy statusline_line3 opt-in.
  assert.ok(!out.includes('📊 local routes'), 'mlwr chip must not appear by default');
  assert.ok(!out.includes('🪟'), 'terminal-name chip must not appear by default');
});

test('MOOTER_STATUSLINE_MATRIX=0 suppresses the matrix chip (no appended line)', () => {
  const out = render({ MOOTER_STATUSLINE_MATRIX: '0' });
  assert.ok(!out.includes('🎯 Matrix:'), `matrix chip must be hidden; got:\n${out}`);
  // Exactly one rendered line (the base) → trailing newline yields 1 non-empty line.
  const lines = out.split('\n').filter((l) => l.trim().length > 0);
  assert.equal(lines.length, 1, `expected only the base line; got ${lines.length}:\n${out}`);
});
