'use strict';
// Wave 32 (Phase NEW2) — effort-status line-3 chip.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { statusLine } = require('./effort-status.js');

function withHome(mode, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-effchip-'));
  const prev = process.env.HOME;
  process.env.HOME = dir;
  try {
    fs.mkdirSync(path.join(dir, '.mooter'), { recursive: true });
    if (mode) fs.writeFileSync(path.join(dir, '.mooter', 'effort.json'), JSON.stringify({ mode }));
    return fn();
  } finally {
    if (prev === undefined) delete process.env.HOME; else process.env.HOME = prev;
  }
}

test('ultramoo → 🐄 chip', () => {
  assert.strictEqual(withHome('ultramoo', statusLine), '🐄 ultramoo');
});
test('high → ⚡ chip', () => {
  assert.strictEqual(withHome('high', statusLine), '⚡ effort:high');
});
test('default / absent → silent', () => {
  assert.strictEqual(withHome('default', statusLine), '');
  assert.strictEqual(withHome(null, statusLine), '');
});
