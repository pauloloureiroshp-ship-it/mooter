'use strict';
// Keeper 4: the watcher scans cheaply, coalesces fs.watch bursts, refreshes only for a new
// transcript while visible, and fails soft. git/gh remain behind DataService's deep budget.

const { test } = require('node:test');
const assert = require('node:assert');
const { newSessionFileKeys, recentRefreshAllowed, watchRecentSessions } = require('./host-extra.js');

test('newSessionFileKeys reports only newly enumerated transcript paths', () => {
  assert.deepStrictEqual(newSessionFileKeys(['a.jsonl'], ['a.jsonl', 'b.jsonl']), ['b.jsonl']);
  assert.deepStrictEqual(newSessionFileKeys(['a.jsonl'], ['a.jsonl']), []);
});

test('recentRefreshAllowed enforces visibility, overlap and the existing deep cadence', () => {
  assert.strictEqual(recentRefreshAllowed(false, false, 0, 100, 21), false);
  assert.strictEqual(recentRefreshAllowed(true, true, 0, 100, 21), false);
  assert.strictEqual(recentRefreshAllowed(true, false, 90, 100, 21), false);
  assert.strictEqual(recentRefreshAllowed(true, false, 79, 100, 21), true);
});

test('watchRecentSessions coalesces bursts and refreshes once for a new visible transcript', async () => {
  let emit = null; let files = [{ file: 'a.jsonl' }]; let refreshes = 0; let closed = false;
  const watcher = watchRecentSessions(() => { refreshes++; }, {
    root: 'test-root', debounceMs: 10, visible: () => true,
    list: () => files,
    watch: (_root, options, cb) => { assert.strictEqual(options.recursive, true); emit = cb; return { close() { closed = true; } }; },
  });
  files = [{ file: 'a.jsonl' }, { file: 'b.jsonl' }];
  emit(); emit(); emit();
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.strictEqual(refreshes, 1);
  watcher.close();
  assert.strictEqual(closed, true);
});

test('watchRecentSessions updates its baseline while hidden without refreshing', async () => {
  let emit = null; let files = [{ file: 'a.jsonl' }]; let refreshes = 0; let isVisible = false;
  const watcher = watchRecentSessions(() => { refreshes++; }, {
    debounceMs: 5, visible: () => isVisible, list: () => files,
    watch: (_root, _options, cb) => { emit = cb; return { close() {} }; },
  });
  files = [{ file: 'a.jsonl' }, { file: 'b.jsonl' }]; emit();
  await new Promise((resolve) => setTimeout(resolve, 20));
  isVisible = true; emit();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(refreshes, 0, 'visibility restore is handled by setVisible(true), never by a stale watcher event');
  watcher.close();
});

test('watchRecentSessions returns null when fs.watch is unavailable', () => {
  const watcher = watchRecentSessions(() => { throw new Error('must not run'); }, {
    list: () => [], watch: () => { throw new Error('unsupported'); },
  });
  assert.strictEqual(watcher, null);
});
