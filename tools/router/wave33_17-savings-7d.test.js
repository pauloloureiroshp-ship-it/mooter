#!/usr/bin/env node
// @ts-check
/**
 * Wave 33.17 — unit tests for the rolling 7-day savings window
 * (computeMetricsWindow). The window reuses the SAME computeMetrics() pipeline
 * over lines filtered by ts_ms, so these tests assert the FILTER is correct and
 * that a window containing every record equals the all-time figure (no drift).
 *
 * Loaded via require() — the tracker's `if (require.main === module)` guard means
 * no HTTP listener is started, so we call the pure functions directly.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeMetricsWindow, computeMetrics } = require('./savings-tracker.js');

const DAY = 24 * 60 * 60 * 1000;

// A classified user prompt — the only event computeMetrics scores. No
// `prompt_preview`, so isSystemPrompt() leaves it in; no `source`, so the
// mooter-tester filter leaves it in.
function line(tsMs, tier, promptLen) {
  return JSON.stringify({
    event: 'classified',
    ts_ms: tsMs,
    ts: new Date(tsMs).toISOString(),
    tier,
    prompt_len: promptLen,
    session_id: 's1',
  });
}

test('7d window: counts only records within the last 7 days', () => {
  const now = 1_800_000_000_000; // fixed epoch ms (no Date.now in assertions)
  const since = now - 7 * DAY;
  const recent = [line(now - 1 * DAY, 'T0', 400), line(now - 3 * DAY, 'T1', 400)];
  const old = [line(now - 30 * DAY, 'T3', 4000)];
  const all = [...old, ...recent];

  const wk = computeMetricsWindow(since, all);
  const recentOnly = computeMetrics(recent);

  assert.equal(wk.prompts, 2, 'only the 2 recent prompts counted');
  assert.equal(wk.saved, recentOnly.saved, 'windowed saved == recent-only saved (same pipeline)');
  assert.equal(wk.saved_pct, recentOnly.saved_pct, 'windowed pct matches');
  assert.ok(wk.saved >= 0, 'saved is floored at 0');
  assert.equal(wk.scope, 'window');
  assert.equal(wk.window_since_ms, since);
});

test('7d window edge case: no data in window → zeroed metrics, no crash', () => {
  const now = 1_800_000_000_000;
  const since = now - 7 * DAY;

  const onlyOld = [line(now - 30 * DAY, 'T2', 1000)];
  const wk = computeMetricsWindow(since, onlyOld);
  assert.equal(wk.prompts, 0, 'record older than the window is excluded');
  assert.equal(wk.saved, 0, 'no savings when the window is empty');

  // Empty input array is also safe.
  const empty = computeMetricsWindow(since, []);
  assert.equal(empty.prompts, 0);
  assert.equal(empty.saved, 0);
});

test('7d window: a record exactly at the boundary is included', () => {
  const now = 1_800_000_000_000;
  const since = now - 7 * DAY;
  const atBoundary = [line(since, 'T1', 400)]; // ts_ms === since → >= passes
  const wk = computeMetricsWindow(since, atBoundary);
  assert.equal(wk.prompts, 1, 'ts_ms === sinceMs is inside the window');
});

test('7d window: legacy record without ts_ms falls back to parsing ts', () => {
  const now = 1_800_000_000_000;
  const since = now - 7 * DAY;
  // Legacy decisions.log line: ISO `ts` only, no `ts_ms` (pre-Wave-19 shape).
  const legacyRecent = JSON.stringify({
    event: 'classified', ts: new Date(now - 2 * DAY).toISOString(),
    tier: 'T1', prompt_len: 400, session_id: 's1',
  });
  const legacyOld = JSON.stringify({
    event: 'classified', ts: new Date(now - 20 * DAY).toISOString(),
    tier: 'T3', prompt_len: 4000, session_id: 's1',
  });
  const wk = computeMetricsWindow(since, [legacyOld, legacyRecent]);
  assert.equal(wk.prompts, 1, 'ts is Date.parse-d when ts_ms is absent; only the recent one counts');
});
