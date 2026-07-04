'use strict';

// fleet-view.test.js — WS3 (perf-validation). The Local Moo Fleet view must be
// read-only, idle-safe, never throw, and 100% concat (no template literals — its
// source is embedded into the webview via fn.toString()). Plus host-extra.localSpeed
// reads the WS1 speed log best-effort.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RR = require('./row-renderer.js');
const extra = require('./host-extra.js');

test('renderLocalFleet is concat-only (no template literals — webview-embeddable)', () => {
  const src = RR.renderLocalFleet.toString();
  assert.ok(src.indexOf('`') === -1, 'no backticks allowed in webview-embedded source');
});

test('renderLocalFleet idle: honest advisory copy (N prontos · advisory · 0 dispatches reais), never throws', () => {
  // Deck Floor (Fase 2) honest-copy: idle with 0 real dispatches ⇒ explicitly ADVISORY.
  const html = RR.renderLocalFleet([], { localSpeed: null, readyN: 3, dispatchN: 0 });
  assert.ok(/Local Moo Fleet/.test(html));
  assert.ok(/3 prontos/.test(html), 'surfaces N local models ready');
  assert.ok(/<b>advisory<\/b>/.test(html), '0 dispatches ⇒ advisory tag (no fabricated work)');
  assert.ok(/0 dispatches reais/.test(html), 'states the real dispatch count honestly');
  assert.ok(/data-fleet="idle"/.test(html));
  // garbage input must not throw
  assert.doesNotThrow(() => RR.renderLocalFleet(null, null));
  assert.doesNotThrow(() => RR.renderLocalFleet([{}, null, { localMoo: null }], {}));
});

test('renderLocalFleet idle: a real dispatch drops the advisory tag (honest)', () => {
  const html = RR.renderLocalFleet([], { localSpeed: null, readyN: 2, dispatchN: 4 });
  assert.ok(/4 dispatches reais/.test(html));
  assert.ok(!/<b>advisory<\/b>/.test(html), 'once work really dispatched, it is no longer advisory');
});

test('renderLocalFleet active: aggregates working moos with measured tok/s and $0', () => {
  const recent = [
    { id: 'aaaa', name: 'fix auth bug', localMoo: { journalN: 5, summary: 'did X', model: 'qwen2.5:3b', updating: true } },
    { id: 'bbbb', name: 'idle one', localMoo: null },
    { id: 'cccc', name: 'refactor', localMoo: { journalN: 2, summary: 'rolled up', model: 'qwen3:30b', updating: false } },
  ];
  const localSpeed = {
    latest: { model: 'qwen2.5:3b', tps: 241 },
    models: [{ model: 'qwen2.5:3b', tps: 241 }, { model: 'qwen3:30b', tps: 206 }],
    count: 2,
  };
  const html = RR.renderLocalFleet(recent, { localSpeed });
  assert.ok(/data-fleet="active"/.test(html));
  assert.ok(/<b>2<\/b>/.test(html), 'counts the 2 active local moos (not the idle one)');
  assert.ok(/241 tok\/s/.test(html), 'shows measured local throughput');
  assert.ok(/206 tok\/s/.test(html), 'per-moo tps matched by model');
  assert.ok(/\$0/.test(html), 'free local work');
  assert.ok(/paralelo ao CC/.test(html));
  assert.ok(/a acumular journal/.test(html), 'updating moo shows accumulating stage');
});

test('renderLocalFleet escapes session names (no HTML injection)', () => {
  const html = RR.renderLocalFleet(
    [{ id: 'x', name: '<img src=x onerror=alert(1)>', localMoo: { journalN: 1, summary: 's', model: 'q' } }],
    { localSpeed: null }
  );
  assert.ok(html.indexOf('<img src=x') === -1, 'raw tag must be escaped');
  assert.ok(/&lt;img/.test(html));
});

test('renderLocalFleet without speed data still renders (tok/s n/d, no fabrication)', () => {
  const html = RR.renderLocalFleet(
    [{ id: 'x', name: 's', localMoo: { journalN: 3, summary: 'y', model: 'qwen2.5:3b' } }],
    { localSpeed: null }
  );
  assert.ok(/n\/d/.test(html), 'missing measurement is marked n/d, never invented');
});

test('localSpeed: null on a missing log, parses the latest warm tps per model', () => {
  const prev = process.env.MOOTER_SPEED_METRICS_LOG;
  const tmp = path.join(os.tmpdir(), `fleet-speed-${process.pid}.jsonl`);
  try {
    fs.rmSync(tmp, { force: true });
    process.env.MOOTER_SPEED_METRICS_LOG = tmp;
    assert.strictEqual(extra.localSpeed(), null, 'missing log → null (no fabrication)');
    fs.writeFileSync(
      tmp,
      JSON.stringify({ ts: '2026-06-27T10:00:00Z', model: 'qwen2.5:3b', warm: { tps: 240, ttft_ms: 130 }, cold: { ttft_ms: 1900 } }) + '\n' +
      JSON.stringify({ ts: '2026-06-27T11:00:00Z', model: 'qwen3:30b', warm: { tps: 206, ttft_ms: 135 }, cold: { ttft_ms: 3900 } }) + '\n'
    );
    const ls = extra.localSpeed();
    assert.ok(ls && ls.count === 2);
    assert.strictEqual(ls.latest.model, 'qwen3:30b', 'newest ts wins');
    assert.strictEqual(ls.latest.tps, 206);
    const q = ls.models.find((m) => m.model === 'qwen2.5:3b');
    assert.strictEqual(q.tps, 240);
    assert.strictEqual(q.cold_ttft_ms, 1900);
  } finally {
    if (prev === undefined) delete process.env.MOOTER_SPEED_METRICS_LOG;
    else process.env.MOOTER_SPEED_METRICS_LOG = prev;
    fs.rmSync(tmp, { force: true });
  }
});

test('localSpeed never throws on a junk log', () => {
  const prev = process.env.MOOTER_SPEED_METRICS_LOG;
  const tmp = path.join(os.tmpdir(), `fleet-speed-junk-${process.pid}.jsonl`);
  try {
    fs.writeFileSync(tmp, 'not-json\n{"model":"q","warm":{"tps":5}}\n');
    process.env.MOOTER_SPEED_METRICS_LOG = tmp;
    const ls = extra.localSpeed();
    assert.ok(ls && ls.count === 1 && ls.latest.tps === 5);
  } finally {
    if (prev === undefined) delete process.env.MOOTER_SPEED_METRICS_LOG;
    else process.env.MOOTER_SPEED_METRICS_LOG = prev;
    fs.rmSync(tmp, { force: true });
  }
});
