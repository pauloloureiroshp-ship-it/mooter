'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

// isolate the run root per test process
const RUN_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-run-'));
process.env.MOOTER_RUN_ROOT = RUN_ROOT;
const h = require('./handoff-bus');

test('distilled state is NOT a dump: a huge input is capped under the byte ceiling', () => {
  const huge = Array.from({ length: 1000 }, (_, i) => `verbose transcript line ${i} ` + 'x'.repeat(300));
  const md = h.renderState({ goal: 'ship', state: huge, decisions: ['a', 'b'] });
  assert.ok(Buffer.byteLength(md, 'utf8') <= h.MAX_TOTAL_BYTES, 'must be capped');
  assert.match(md, /## Goal/);
  assert.match(md, /## State/);
});

test('byte cap holds on multibyte input (regression: slice on bytes, capped provider)', () => {
  const md = h.renderState({
    goal: '長'.repeat(2000),                 // multibyte goal
    maestro_provider: '✨'.repeat(2000),      // multibyte, must be length-capped
    state: Array.from({ length: 500 }, () => '日本語のログ行 '.repeat(20)),
  });
  assert.ok(Buffer.byteLength(md, 'utf8') <= h.MAX_TOTAL_BYTES, `bytes=${Buffer.byteLength(md, 'utf8')} must be <= ${h.MAX_TOTAL_BYTES}`);
});

test('runId cannot escape RUN_ROOT via bare-dot segments', () => {
  const p = h.statePath('..');
  assert.ok(!p.includes(`${require('path').sep}..${require('path').sep}`), 'must neutralise ".."');
});

test('distillSection dedupes and caps line count', () => {
  const out = h.distillSection(['same', 'same', 'same', ...Array.from({ length: 50 }, (_, i) => `u${i}`)]);
  assert.ok(out.length <= 13); // 12 + truncation marker
  assert.strictEqual(out.filter((l) => l === 'same').length, 1);
});

test('write then read round-trips the structured sections', () => {
  const p = h.writeState('run-A', { goal: 'do X', decisions: ['chose local'], open: ['wire cockpit'], maestro_provider: 'claude' });
  assert.ok(fs.existsSync(p));
  const md = h.readState('run-A');
  assert.match(md, /## Goal\n- do X/);
  assert.match(md, /maestro_provider: claude/);
});

test('empty sections render as — (honest, not blank)', () => {
  const md = h.renderState({ goal: 'g' });
  assert.match(md, /## Decisions\n- —/);
});

// ── arbiter: one paid thread per provider (preserve cache) ──────────────────
test('first cloud lane pins the provider', () => {
  const r = h.arbitrate({ candidateProvider: 'claude' });
  assert.strictEqual(r.provider, 'claude');
  assert.strictEqual(r.switched, false);
});

test('subsequent handoff stays on the pinned provider (cache preserved)', () => {
  const r = h.arbitrate({ pinnedProvider: 'claude', candidateProvider: 'gpt' });
  assert.strictEqual(r.provider, 'claude');
  assert.strictEqual(r.switched, false);
  assert.match(r.reason, /preserves prompt cache/);
});

test('a forced switch is allowed and flagged (cache reset accepted)', () => {
  const r = h.arbitrate({ pinnedProvider: 'claude', candidateProvider: 'gpt', forced: true });
  assert.strictEqual(r.provider, 'gpt');
  assert.strictEqual(r.switched, true);
});

test.after(() => { try { fs.rmSync(RUN_ROOT, { recursive: true, force: true }); } catch { /* none */ } });
