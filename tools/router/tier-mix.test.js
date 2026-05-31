'use strict';

// Tier-mix view suite (Wave 2.5 Day 3 sub-feature 2). Pure unit tests for the
// last-10 tier breakdown and the A↔B view rotation.

const { test } = require('node:test');
const assert = require('node:assert');
const { tierMixLast10, pickView } = require('./tier-mix.js');

test('tierMixLast10 counts last 10 events correctly', () => {
  const events = [
    ...Array(6).fill({ tier: 'T0' }),
    ...Array(2).fill({ tier: 'T1' }),
    ...Array(2).fill({ tier: 'T2' }),
  ];
  assert.equal(tierMixLast10(events), 'last10: T0:6 T1:2 T2:2 T3:0');
});

test('tierMixLast10 windows to the last 10 events only', () => {
  const events = [
    ...Array(20).fill({ tier: 'T3' }), // older, should be dropped
    ...Array(10).fill({ tier: 'T0' }), // most recent 10
  ];
  assert.equal(tierMixLast10(events), 'last10: T0:10 T1:0 T2:0 T3:0');
});

test('tierMixLast10 ignores unknown/absent tiers and is null-safe', () => {
  assert.equal(tierMixLast10([{ tier: 'T2' }, { tier: 'codex' }, {}]), 'last10: T0:0 T1:0 T2:1 T3:0');
  assert.equal(tierMixLast10([]), 'last10: T0:0 T1:0 T2:0 T3:0');
  assert.equal(tierMixLast10(null), 'last10: T0:0 T1:0 T2:0 T3:0');
});

test('pickView alternates every 5 ticks', () => {
  assert.equal(pickView([], 0), 'A');
  assert.equal(pickView([], 4), 'A');
  assert.equal(pickView([], 5), 'B');
  assert.equal(pickView([], 9), 'B');
  assert.equal(pickView([], 10), 'A');
});

test('pickView is robust to non-finite tick counts', () => {
  assert.equal(pickView([], NaN), 'A');
  assert.equal(pickView([], undefined), 'A');
});
