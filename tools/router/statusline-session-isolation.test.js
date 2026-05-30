#!/usr/bin/env node
// @ts-check
/**
 * Tests for per-terminal session isolation in statusline-multi.js (Wave 2.5
 * Day 1). The digest() aggregator accepts a `sessionFilter` so each terminal
 * counts only the decisions it produced, while remaining backward compatible
 * with legacy events that pre-date session tagging.
 *
 * Run with:  node --test statusline-session-isolation.test.js
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { digest } = require('./statusline-multi.js');

const today = () => new Date().toISOString();

function evt(extra) {
  return JSON.stringify({ event: 'classified', ts: today(), tier: 'T2', confidence: 0.8, ...extra });
}

// ── Per-session filtering ────────────────────────────────────────────────

test('digest: filters out events from other sessions when sessionFilter set', () => {
  const lines = [
    evt({ session_id: 's1', tier: 'T2' }),
    evt({ session_id: 's2', tier: 'T3' }),
    evt({ session_id: 's1', tier: 'T0', suggested_providers: ['ollama'] }),
  ];
  const d = digest(lines, { sessionFilter: 's1' });
  assert.equal(d.total, 2, 'only the two s1 events should count');
  assert.equal(d.counts.T2, 1);
  assert.equal(d.counts.T0, 1);
  assert.equal(d.counts.T3, 0, 's2 T3 event must be excluded');
});

test('digest: no sessionFilter counts every session (global view)', () => {
  const lines = [
    evt({ session_id: 's1', tier: 'T2' }),
    evt({ session_id: 's2', tier: 'T3' }),
  ];
  const d = digest(lines);
  assert.equal(d.total, 2, 'global view counts both sessions');
  assert.equal(d.counts.T2, 1);
  assert.equal(d.counts.T3, 1);
});

test('digest: last/recent are scoped to the filtered session', () => {
  const lines = [
    evt({ session_id: 's1', tier: 'T0', suggested_providers: ['ollama'] }),
    evt({ session_id: 's2', tier: 'T3' }), // newest overall, but other session
  ];
  const d = digest(lines, { sessionFilter: 's1' });
  assert.ok(d.last, 'should still resolve a last event');
  assert.equal(d.last.tier, 'T0', 'last must be the s1 event, not the newer s2 one');
  assert.equal(d.recent.every((e) => e.session_id === 's1'), true);
});

// ── Backward compatibility ─────────────────────────────────────────────────

test('digest: legacy events without session_id count in any session', () => {
  const lines = [
    evt({ tier: 'T2' }),               // no session_id — legacy
    evt({ session_id: 's1', tier: 'T3' }),
  ];
  const d = digest(lines, { sessionFilter: 's1' });
  assert.equal(d.total, 2, 'legacy event must still count under a session filter');
  assert.equal(d.counts.T2, 1);
  assert.equal(d.counts.T3, 1);
});

test('digest: session_id="unknown" is treated as legacy (counts anywhere)', () => {
  const lines = [
    evt({ session_id: 'unknown', tier: 'T2' }),
    evt({ session_id: 's1', tier: 'T3' }),
  ];
  const d = digest(lines, { sessionFilter: 's1' });
  assert.equal(d.total, 2, '"unknown" session id is the inject_context fallback — never filtered out');
});

test('digest: tester events stay filtered regardless of session', () => {
  const lines = [
    evt({ session_id: 's1', source: 'mooter-tester', tier: 'T2' }),
    evt({ session_id: 's1', tier: 'T3' }),
  ];
  const d = digest(lines, { sessionFilter: 's1' });
  assert.equal(d.total, 1, 'tester noise excluded even within the same session');
  assert.equal(d.counts.T3, 1);
});
