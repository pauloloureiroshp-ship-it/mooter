#!/usr/bin/env node
/**
 * Pattern-count parity tests (Wave 9 — prod parity fix).
 * Guarantees the "N regex patterns" claim shown in the landing dashboard is the
 * REAL count and can't silently drift. Run with: node --test pattern-count.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { PATTERN_COUNT } = require('./classify.js');
const { HIGH_RISK, MED_RISK, LOW_RISK, TRIVIAL } = require('./patterns.js');

test('classify.js exports a numeric PATTERN_COUNT', () => {
  assert.equal(typeof PATTERN_COUNT, 'number');
  assert.ok(PATTERN_COUNT > 0);
});

test('PATTERN_COUNT equals the sum of the four risk buckets', () => {
  const sum = HIGH_RISK.length + MED_RISK.length + LOW_RISK.length + TRIVIAL.length;
  assert.equal(PATTERN_COUNT, sum);
});

test('landing dashboard mirror constant matches the router source', () => {
  // Vercel builds with rootDirectory=landing, so the dashboard can't import the
  // router. It mirrors PATTERN_COUNT as a literal — this test enforces equality.
  const dash = path.join(__dirname, '..', '..', 'landing', 'app', '(app)', 'dashboard', 'page.tsx');
  const src = fs.readFileSync(dash, 'utf8');
  const m = src.match(/const\s+PATTERN_COUNT\s*=\s*(\d+)\s*;/);
  assert.ok(m, 'landing dashboard must declare `const PATTERN_COUNT = <n>;`');
  assert.equal(Number(m[1]), PATTERN_COUNT,
    `landing mirror (${m[1]}) drifted from router PATTERN_COUNT (${PATTERN_COUNT})`);
});
