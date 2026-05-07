#!/usr/bin/env node
// @ts-check
/**
 * Unit tests for profile-refresh.js (Wave-1.5 task #2).
 *
 * Tests the pure helpers (hashContent, shouldSkip). The runNode integration
 * is covered by the smoke run in WAVE-1.5-VERDICT.md.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { hashContent, shouldSkip } = require('./profile-refresh.js');

test('hashContent: same projection produces same hash regardless of timestamps', () => {
  const a = {
    updated_at: '2026-05-07T00:00:00.000Z',
    profiles: { anthropic: 'max' },
    detected: { checked_at: '2026-05-07T00:00:00.000Z', anthropic: { plan: 'max' } },
    subscriptions: { detected_at: '2026-05-07', anthropic_pro: true },
  };
  const b = {
    updated_at: '2026-05-08T11:22:33.000Z',
    profiles: { anthropic: 'max' },
    detected: { checked_at: '2026-05-08T11:22:33.000Z', anthropic: { plan: 'max' } },
    subscriptions: { detected_at: '2026-05-08', anthropic_pro: true },
  };
  assert.equal(hashContent(a), hashContent(b));
});

test('hashContent: material change produces different hash', () => {
  const a = { profiles: { anthropic: 'max' } };
  const b = { profiles: { anthropic: 'pro' } };
  assert.notEqual(hashContent(a), hashContent(b));
});

test('shouldSkip: returns reason within window', () => {
  const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
  const reason = shouldSkip({ last_run_at: recent });
  assert.ok(reason, 'should skip');
  assert.match(reason, /below_7d_window/);
});

test('shouldSkip: returns null when stale', () => {
  const stale = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const reason = shouldSkip({ last_run_at: stale });
  assert.equal(reason, null);
});

test('shouldSkip: returns null when no prior run', () => {
  assert.equal(shouldSkip(null), null);
  assert.equal(shouldSkip({}), null);
});
