'use strict';
// Wave 53 Phase B.5 — pluggable custom segment.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveSegmentFn, sanitize, statusLine } = require('./custom-status.js');

// ── resolveSegmentFn: accepted module shapes ────────────────────────────────
test('resolveSegmentFn accepts fn / {segment} / default fn / default.segment', () => {
  const f = () => 'x';
  assert.strictEqual(resolveSegmentFn(f), f);
  assert.strictEqual(resolveSegmentFn({ segment: f }), f);
  assert.strictEqual(resolveSegmentFn({ default: f }), f);
  assert.strictEqual(resolveSegmentFn({ default: { segment: f } }), f);
  assert.strictEqual(resolveSegmentFn({}), null);
  assert.strictEqual(resolveSegmentFn(null), null);
});

// ── sanitize ─────────────────────────────────────────────────────────────────
test('sanitize: non-string → empty', () => {
  assert.strictEqual(sanitize(42), '');
  assert.strictEqual(sanitize(undefined), '');
  assert.strictEqual(sanitize({}), '');
});

test('sanitize: collapses newlines/tabs to a single line', () => {
  assert.strictEqual(sanitize('a\nb\tc'), 'a b c');
  assert.strictEqual(sanitize('  spaced  '), 'spaced');
  assert.strictEqual(sanitize('   '), '');
});

test('sanitize: clamps overly long segments', () => {
  const out = sanitize('x'.repeat(120));
  assert.ok(out.length <= 48 && out.endsWith('…'), out);
});

// ── statusLine integration ───────────────────────────────────────────────────
function withCustom(content, prefsObj, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-custom-'));
  const prevMH = process.env.MOOTER_HOME;
  const prevHome = process.env.HOME;
  process.env.MOOTER_HOME = dir;
  process.env.HOME = dir;
  try {
    fs.mkdirSync(path.join(dir, 'statusline'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.mooter'), { recursive: true });
    if (content != null) fs.writeFileSync(path.join(dir, 'statusline', 'custom.js'), content);
    if (prefsObj) fs.writeFileSync(path.join(dir, '.mooter', 'preferences.json'), JSON.stringify(prefsObj));
    return fn();
  } finally {
    if (prevMH === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prevMH;
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
  }
}

test('statusLine silent when custom.js absent', () => {
  assert.strictEqual(withCustom(null, null, statusLine), '');
});

test('statusLine renders the user segment', () => {
  const out = withCustom("module.exports = { segment: () => '🎵 now playing' };", null, statusLine);
  assert.strictEqual(out, '🎵 now playing');
});

test('statusLine swallows a throwing segment', () => {
  const out = withCustom("module.exports = { segment: () => { throw new Error('boom'); } };", null, statusLine);
  assert.strictEqual(out, '');
});

test('statusLine honours hidden_chips opt-out', () => {
  const out = withCustom("module.exports = () => 'hi';", { hidden_chips: ['custom'] }, statusLine);
  assert.strictEqual(out, '');
});
