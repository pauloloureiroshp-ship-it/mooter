'use strict';

// speed-meter.test.js — WS1 (perf-validation). Verifies the speed meter is
// honest and safe: never throws, distinguishes measured vs estimated, marks
// missing numbers estimated (never invents them), and persists best-effort.
// NO live Ollama is required — network paths are tested against a dead host so
// this runs green in CI (where Ollama is absent).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sm = require('./speed-meter.js');

const DEAD_HOST = 'http://127.0.0.1:1'; // nothing listens here

test('median is pure and handles garbage', () => {
  assert.strictEqual(sm.median([3, 1, 2]), 2);
  assert.strictEqual(sm.median([4, 1, 2, 3]), 2.5);
  assert.strictEqual(sm.median([]), null);
  assert.strictEqual(sm.median(['x', null, undefined]), null);
  assert.strictEqual(sm.median(null), null);
});

test('nsToMs converts and rejects bad input', () => {
  assert.strictEqual(sm.nsToMs(1e6), 1);
  assert.strictEqual(sm.nsToMs(0), 0);
  assert.strictEqual(sm.nsToMs(undefined), null);
  assert.strictEqual(sm.nsToMs(-5), null);
});

test('estimateCloud is marked estimated, never invents a measurement', () => {
  const opus = sm.estimateCloud('claude-opus-4-6');
  assert.strictEqual(opus.estimated, true);
  assert.strictEqual(opus.source, 'estimated');
  assert.ok(opus.basis && /NOT measured/i.test(opus.basis));
  assert.ok(opus.tps > 0);
  assert.ok(opus.tpot_ms > 0);
  // Unknown model still returns a marked estimate, not a fabricated measurement.
  const unknown = sm.estimateCloud('some-future-model');
  assert.strictEqual(unknown.estimated, true);
  assert.ok(unknown.tps > 0);
});

test('measureOllamaOnce never throws and returns ok:false on a dead host', async () => {
  const r = await sm.measureOllamaOnce({ model: 'qwen2.5:3b', host: DEAD_HOST, timeoutMs: 800 });
  assert.strictEqual(r.ok, false);
  assert.ok(r.error, 'carries an error string, never a fabricated number');
  assert.strictEqual(r.ttft_ms, undefined);
});

test('measureOllamaOnce rejects a call with no model (no throw)', async () => {
  const r = await sm.measureOllamaOnce({});
  assert.strictEqual(r.ok, false);
});

test('benchmarkModel never throws and reports ok:false when nothing measured', async () => {
  const r = await sm.benchmarkModel({
    model: 'qwen2.5:3b',
    host: DEAD_HOST,
    warmups: 1,
    runs: 1,
    measureCold: true,
    timeoutMs: 600,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.warm, null);
  assert.strictEqual(r.cold, null);
  assert.strictEqual(r.model, 'qwen2.5:3b');
});

test('listLocalModels returns null on a dead host (never throws, never fakes an empty list)', async () => {
  // `[]` significaria "o Ollama respondeu e não tem modelos" — com o host morto
  // isso seria uma medição inventada.
  const list = await sm.listLocalModels(DEAD_HOST);
  assert.strictEqual(list, null);
});

test('summariseWarm medians ok samples and ignores failures', () => {
  const w = sm.summariseWarm([
    { ok: true, ttft_ms: 100, tps: 50, tpot_ms: 20, tokens_out: 100, decode_ms: 2000, total_ms: 2100 },
    { ok: true, ttft_ms: 200, tps: 60, tpot_ms: 16, tokens_out: 100, decode_ms: 1600, total_ms: 1800 },
    { ok: false },
  ]);
  assert.strictEqual(w.n, 2);
  assert.strictEqual(w.ttft_ms, 150);
  assert.strictEqual(w.estimated, false);
  assert.strictEqual(sm.summariseWarm([{ ok: false }]), null);
});

test('appendMetric + readMetrics + lastLocalTps round-trip in a temp file', () => {
  const tmp = path.join(os.tmpdir(), `speed-meter-test-${process.pid}.jsonl`);
  try {
    fs.rmSync(tmp, { force: true });
  } catch {}
  assert.strictEqual(sm.appendMetric({ model: 'qwen2.5:3b', warm: { tps: 112 } }, { logPath: tmp, now: 1 }), true);
  assert.strictEqual(sm.appendMetric({ model: 'qwen3:30b', warm: { tps: 40 } }, { logPath: tmp, now: 2 }), true);
  const recs = sm.readMetrics({ logPath: tmp });
  assert.strictEqual(recs.length, 2);
  assert.ok(recs[0].ts, 'records carry a timestamp');
  const last = sm.lastLocalTps({ logPath: tmp });
  assert.strictEqual(last.model, 'qwen3:30b');
  assert.strictEqual(last.tps, 40);
  const lastQwen = sm.lastLocalTps({ logPath: tmp, model: 'qwen2.5:3b' });
  assert.strictEqual(lastQwen.tps, 112);
  try {
    fs.rmSync(tmp, { force: true });
  } catch {}
});

test('appendMetric never throws on an unwritable path', () => {
  // A path whose parent does not exist → write fails → must return null, not throw.
  const bad = path.join(os.tmpdir(), 'speed-meter-no-such-dir-xyz', 'nested', 'x.jsonl');
  assert.strictEqual(sm.appendMetric({ model: 'x' }, { logPath: bad }), null);
});

test('readMetrics returns [] for a missing file and skips junk lines', () => {
  assert.deepStrictEqual(sm.readMetrics({ logPath: path.join(os.tmpdir(), 'nope-missing.jsonl') }), []);
  const tmp = path.join(os.tmpdir(), `speed-meter-junk-${process.pid}.jsonl`);
  fs.writeFileSync(tmp, '{"model":"a","tps":1}\nnot-json\n{"model":"b","warm":{"tps":2}}\n');
  const recs = sm.readMetrics({ logPath: tmp });
  assert.strictEqual(recs.length, 2);
  fs.rmSync(tmp, { force: true });
});
