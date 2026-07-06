#!/usr/bin/env node
'use strict';
// Unit tests for quota-live.js (MP-Q Q0/Q1).
//
// Each test points MOOTER_HOME at a fresh tmp dir so we never touch the
// user's real ~/.mooter. Run with:  node --test quota-live.test.js

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const QL = require('./quota-live.js');

let TMP;

beforeEach(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-live-test-'));
  process.env.MOOTER_HOME = TMP;
});

afterEach(() => {
  delete process.env.MOOTER_HOME;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows lag */ }
});

// Documented payload shape (official statusline docs, 2026-07-06).
function docPayload() {
  return {
    session_id: 'abc',
    model: { display_name: 'Opus' },
    rate_limits: {
      five_hour: { used_percentage: 23.5, resets_at: 1738425600 },
      seven_day: { used_percentage: 89, resets_at: 1738857600 },
    },
  };
}

// ── extractRateLimits ────────────────────────────────────────────────────────

test('extract: documented shape → normalized pcts + ISO resets', () => {
  const x = QL.extractRateLimits(docPayload());
  assert.equal(x.five_hour_pct, 23.5);
  assert.equal(x.seven_day_pct, 89);
  assert.equal(x.opus_or_fable_pct, null);
  assert.equal(x.resets.five_hour, new Date(1738425600 * 1000).toISOString());
  assert.deepEqual(x.raw_keys, ['five_hour', 'seven_day']);
});

test('extract: payload without rate_limits → null (never invent)', () => {
  assert.equal(QL.extractRateLimits({ session_id: 'x' }), null);
  assert.equal(QL.extractRateLimits(null), null);
  assert.equal(QL.extractRateLimits({ rate_limits: 'garbage' }), null);
  assert.equal(QL.extractRateLimits({ rate_limits: { surprise_key: {} } }), null);
});

test('extract: tolerates bare-number windows and ISO resets', () => {
  const x = QL.extractRateLimits({ rate_limits: { five_hour: 12, seven_day: { used_percentage: 50, resets_at: '2026-07-09T00:00:00Z' } } });
  assert.equal(x.five_hour_pct, 12);
  assert.equal(x.seven_day_pct, 50);
  assert.equal(x.resets.seven_day, '2026-07-09T00:00:00.000Z');
});

test('extract: model-scoped opus/fable window is picked up when present', () => {
  const x = QL.extractRateLimits({ rate_limits: {
    seven_day: { used_percentage: 89 },
    seven_day_opus: { used_percentage: 100 },
  } });
  assert.equal(x.opus_or_fable_pct, 100);
});

// ── captureStdinSample (Q0) ──────────────────────────────────────────────────

test('sample: written once, second call is a no-op', () => {
  assert.equal(QL.captureStdinSample({ a: 1 }), true);
  assert.equal(QL.captureStdinSample({ a: 2 }), false);
  const rec = JSON.parse(fs.readFileSync(path.join(TMP, QL.SAMPLE_BASENAME), 'utf8'));
  assert.equal(rec.payload.a, 1, 'first payload wins');
});

// ── writeQuotaLive / readQuotaLive (Q1) ─────────────────────────────────────

test('write+read roundtrip: fresh official snapshot', () => {
  assert.equal(QL.writeQuotaLive(docPayload()), true);
  const live = QL.readQuotaLive();
  assert.equal(live.source, 'cc-statusline-stdin');
  assert.equal(live.five_hour_pct, 23.5);
  assert.equal(live.seven_day_pct, 89);
  assert.equal(live.fresh, true);
  assert.ok(live.age_ms >= 0);
});

test('write: payload without rate_limits writes NOTHING', () => {
  assert.equal(QL.writeQuotaLive({ session_id: 'x' }), false);
  assert.equal(fs.existsSync(path.join(TMP, QL.LIVE_BASENAME)), false);
  assert.equal(QL.readQuotaLive(), null);
});

test('write: unchanged values within heartbeat window are throttled', () => {
  assert.equal(QL.writeQuotaLive(docPayload()), true);
  assert.equal(QL.writeQuotaLive(docPayload()), false, 'same values, young file → skip');
  const p = docPayload();
  p.rate_limits.seven_day.used_percentage = 90;
  assert.equal(QL.writeQuotaLive(p), true, 'changed values → rewrite');
  assert.equal(QL.readQuotaLive().seven_day_pct, 90);
});

test('read: stale file (ts older than maxAgeMs) → fresh:false', () => {
  QL.writeQuotaLive(docPayload());
  const f = path.join(TMP, QL.LIVE_BASENAME);
  const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  rec.ts = Date.now() - 11 * 60 * 1000; // 11 min ago
  fs.writeFileSync(f, JSON.stringify(rec));
  const live = QL.readQuotaLive();
  assert.equal(live.fresh, false);
  const liveWide = QL.readQuotaLive({ maxAgeMs: 60 * 60 * 1000 });
  assert.equal(liveWide.fresh, true);
});

test('read: malformed file → null (fail-soft)', () => {
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, QL.LIVE_BASENAME), '{not json');
  assert.equal(QL.readQuotaLive(), null);
});

test('onStatuslineRender: never throws on garbage', () => {
  assert.doesNotThrow(() => QL.onStatuslineRender(undefined));
  assert.doesNotThrow(() => QL.onStatuslineRender({ rate_limits: 42 }));
});
