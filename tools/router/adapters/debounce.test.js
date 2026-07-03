'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const debounce = require('./debounce.js');
const { WINDOW_MS, MAX_PER_WINDOW } = debounce;

function withHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmadapt-deb-'));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = dir;
  try { return fn(dir); }
  finally {
    if (prev === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

const stamped = (id) => ({ ledger_event_id: id, source: 'mooter-ledger' });

test('coalescing: many events in a window drain as ONE summary, at most once per window', () => {
  withHome(() => {
    debounce.enqueue('notion', stamped('a'), 0);
    debounce.enqueue('notion', stamped('b'), 10);
    debounce.enqueue('notion', stamped('c'), 20);
    assert.equal(debounce.pendingCount('notion'), 3);
    // window not elapsed yet
    assert.equal(debounce.shouldFlush('notion', 100), false);
    // at WINDOW_MS it may flush
    assert.equal(debounce.shouldFlush('notion', WINDOW_MS), true);
    const summary = debounce.drain('notion', WINDOW_MS);
    assert.equal(summary.count, 3);
    assert.deepEqual(summary.ledger_event_ids, ['a', 'b', 'c']);
    assert.equal(debounce.pendingCount('notion'), 0);
    // immediately after a flush, the window is closed again — no second summary
    debounce.enqueue('notion', stamped('d'), WINDOW_MS + 5);
    assert.equal(debounce.shouldFlush('notion', WINDOW_MS + 5), false);
    assert.equal(debounce.shouldFlush('notion', WINDOW_MS * 2), true);
  });
});

test('kill-switch trips when events exceed the loop threshold, then blocks all outbound', () => {
  withHome(() => {
    let last;
    for (let i = 0; i <= MAX_PER_WINDOW; i++) last = debounce.enqueue('slack', stamped('e' + i), 0);
    assert.equal(last.tripped, true);
    assert.equal(debounce.isTripped('slack'), true);
    // further enqueues are refused, not buffered
    const after = debounce.enqueue('slack', stamped('more'), 1);
    assert.equal(after.queued, false);
    assert.equal(after.tripped, true);
    // a tripped tool never flushes
    assert.equal(debounce.shouldFlush('slack', WINDOW_MS * 10), false);
    assert.equal(debounce.drain('slack', WINDOW_MS * 10), null);
  });
});

test('human reset clears a tripped kill-switch', () => {
  withHome(() => {
    for (let i = 0; i <= MAX_PER_WINDOW; i++) debounce.enqueue('slack', stamped('x' + i), 0);
    assert.equal(debounce.isTripped('slack'), true);
    assert.equal(debounce.reset('slack'), true);
    assert.equal(debounce.isTripped('slack'), false);
    assert.equal(debounce.enqueue('slack', stamped('fresh'), 0).queued, true);
  });
});

test('pending survives a process restart (persisted to disk)', () => {
  withHome(() => {
    debounce.enqueue('notion', stamped('persist'), 0);
    // simulate restart: re-require the module (fresh in-memory), state re-read from disk
    delete require.cache[require.resolve('./debounce.js')];
    const d2 = require('./debounce.js');
    assert.equal(d2.pendingCount('notion'), 1);
    // restore the shared reference for later tests
    delete require.cache[require.resolve('./debounce.js')];
  });
});
