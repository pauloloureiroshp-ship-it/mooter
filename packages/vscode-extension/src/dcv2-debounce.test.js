'use strict';
// dcv2-debounce.test.js — Director's Cut v2 · F2, Unit B.
// Proves mkDebounce (host-extra.js) coalesces rapid fs.watch bursts into a single trailing
// call, that flush() fires immediately (and the pending timer never double-fires), and that
// cancel() drops a pending call entirely. Real timers with small awaits — no fake clocks.

const { test } = require('node:test');
const assert = require('node:assert');

const { mkDebounce } = require('./host-extra.js');

test('mkDebounce: 5 rapid calls -> fn not called synchronously, then called exactly once after ms', async () => {
  let n = 0;
  const g = mkDebounce(() => { n++; }, 40);
  g(); g(); g(); g(); g();
  assert.strictEqual(n, 0, 'fn must not fire synchronously');
  await new Promise((r) => setTimeout(r, 90));
  assert.strictEqual(n, 1, 'fn must fire exactly once after the trailing edge');
});

test('mkDebounce: flush() fires fn immediately and the pending timer does not double-fire', async () => {
  let n = 0;
  const g = mkDebounce(() => { n++; }, 40);
  g();
  g.flush();
  assert.strictEqual(n, 1, 'flush must call fn synchronously');
  await new Promise((r) => setTimeout(r, 90));
  assert.strictEqual(n, 1, 'the original pending timer must not fire again after flush');
});

test('mkDebounce: cancel() after g() -> fn never called', async () => {
  let n = 0;
  const g = mkDebounce(() => { n++; }, 40);
  g();
  g.cancel();
  await new Promise((r) => setTimeout(r, 90));
  assert.strictEqual(n, 0, 'a cancelled pending call must never fire');
});
