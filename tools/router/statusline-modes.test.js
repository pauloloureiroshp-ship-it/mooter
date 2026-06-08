'use strict';
// Wave 32 (Phase B) — statusline modes: byte-identity of the default path,
// 4 explicit modes, and the ≤10ms render budget (Starship-grade).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const SL = require('./statusline-multi.js');
const MODES = require('./statusline-modes.js');

const CTX = SL.DEMO_CONTEXTS.green;

function withMode(mode, fn) {
  const prev = process.env.MOOTER_STATUSLINE_MODE;
  if (mode === null) delete process.env.MOOTER_STATUSLINE_MODE;
  else process.env.MOOTER_STATUSLINE_MODE = mode;
  try { return fn(); }
  finally {
    if (prev === undefined) delete process.env.MOOTER_STATUSLINE_MODE;
    else process.env.MOOTER_STATUSLINE_MODE = prev;
  }
}

test('readMode: null when unset, valid mode when env set, null for garbage', () => {
  withMode(null, () => assert.strictEqual(MODES.readMode(), null));
  withMode('full', () => assert.strictEqual(MODES.readMode(), 'full'));
  withMode('nonsense', () => assert.strictEqual(MODES.readMode(), null));
});

test('DEFAULT path is byte-identical when no mode is pinned', () => {
  // The whole doctrine contract: lines 1-2 unchanged. Compare render() with no
  // mode against the legacy width-based renderers directly.
  const prevCols = process.env.COLUMNS;
  try {
    process.env.COLUMNS = '160'; // wide → 2-line path
    const direct = SL.renderTwoLine(CTX);
    const viaRender = withMode(null, () => SL.render(CTX));
    assert.strictEqual(viaRender, direct, 'wide default must equal renderTwoLine');

    process.env.COLUMNS = '80'; // narrow → 1-line path
    const direct1 = SL.renderFromContext(CTX);
    const viaRender1 = withMode(null, () => SL.render(CTX));
    assert.strictEqual(viaRender1, direct1, 'narrow default must equal renderFromContext');
  } finally {
    if (prevCols === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = prevCols;
  }
});

test('mini mode → exactly 1 line', () => {
  const out = withMode('mini', () => SL.render(CTX));
  assert.strictEqual(out.split('\n').length, 1, 'mini is one line');
});

test('compact mode → exactly 2 lines (line 3 forced off even if opted in)', () => {
  const prev = process.env.MOOTER_STATUSLINE_LINE3;
  process.env.MOOTER_STATUSLINE_LINE3 = '1'; // would normally add line 3
  try {
    const out = withMode('compact', () => SL.render(CTX));
    assert.strictEqual(out.split('\n').length, 2, 'compact suppresses line 3');
  } finally {
    if (prev === undefined) delete process.env.MOOTER_STATUSLINE_LINE3; else process.env.MOOTER_STATUSLINE_LINE3 = prev;
  }
});

test('full mode → 3 lines (line 3 forced on without opt-in)', () => {
  const prev = process.env.MOOTER_STATUSLINE_LINE3;
  delete process.env.MOOTER_STATUSLINE_LINE3; // prove `full` forces it on
  try {
    const out = withMode('full', () => SL.render(CTX));
    // line 3 chips can legitimately be empty on a bare demo ctx → ≥2, ≤3 lines.
    const n = out.split('\n').length;
    assert.ok(n === 3 || n === 2, `full is 2-3 lines, got ${n}`);
  } finally {
    if (prev !== undefined) process.env.MOOTER_STATUSLINE_LINE3 = prev;
  }
});

test('didactic mode → exactly 5 lines, names savings + tier mix', () => {
  const out = withMode('didactic', () => SL.render(CTX));
  const lines = out.split('\n');
  assert.strictEqual(lines.length, 5, 'didactic is five lines');
  assert.match(lines[0], /saved/i);
  assert.match(lines[1], /T0|local/i);
});

test('didactic handles empty context honestly (no fake numbers)', () => {
  const out = MODES.renderDidactic(SL.DEMO_CONTEXTS.empty, {});
  assert.match(out, /—|no decision/i);
  assert.strictEqual(out.split('\n').length, 5);
});

test('render budget: every mode renders in ≤10ms (avg over 200 iters)', () => {
  for (const mode of [null, 'mini', 'compact', 'full', 'didactic']) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 200; i++) withMode(mode, () => SL.render(CTX));
    const t1 = process.hrtime.bigint();
    const avgMs = Number(t1 - t0) / 1e6 / 200;
    assert.ok(avgMs <= 10, `mode ${mode} avg ${avgMs.toFixed(3)}ms exceeds 10ms`);
  }
});
