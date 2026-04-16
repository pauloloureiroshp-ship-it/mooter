#!/usr/bin/env node
/**
 * shadow-mode.test.js — unit tests for shadow-mode.js
 * Run: node shadow-mode.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const shadow = require('./shadow-mode');

describe('isEnabled', () => {
  it('returns false when no config and no env', () => {
    const saved = process.env.SHADOW_MODE_ENABLED;
    delete process.env.SHADOW_MODE_ENABLED;
    assert.equal(shadow.isEnabled(), false);
    if (saved !== undefined) process.env.SHADOW_MODE_ENABLED = saved;
  });

  it('returns true when env is "true"', () => {
    const saved = process.env.SHADOW_MODE_ENABLED;
    process.env.SHADOW_MODE_ENABLED = 'true';
    assert.equal(shadow.isEnabled(), true);
    if (saved !== undefined) process.env.SHADOW_MODE_ENABLED = saved;
    else delete process.env.SHADOW_MODE_ENABLED;
  });

  it('returns false when env is "false"', () => {
    const saved = process.env.SHADOW_MODE_ENABLED;
    process.env.SHADOW_MODE_ENABLED = 'false';
    assert.equal(shadow.isEnabled(), false);
    if (saved !== undefined) process.env.SHADOW_MODE_ENABLED = saved;
    else delete process.env.SHADOW_MODE_ENABLED;
  });
});

describe('shouldSample', () => {
  it('rejects T0 prompts', () => {
    assert.equal(shadow.shouldSample('hello', 'T0', {}), false);
  });

  it('rejects T1 prompts', () => {
    assert.equal(shadow.shouldSample('hello', 'T1', {}), false);
  });

  it('rejects HIGH_RISK prompts', () => {
    assert.equal(shadow.shouldSample('deploy', 'T3', { risk_level: 'high' }), false);
  });

  it('rejects empty/null prompt', () => {
    assert.equal(shadow.shouldSample(null, 'T2', {}), false);
    assert.equal(shadow.shouldSample('', 'T2', {}), false);
  });

  it('accepts T2 prompt when random < SAMPLE_RATE (mocked)', () => {
    const origRandom = Math.random;
    Math.random = () => 0.01; // below 0.05
    try {
      assert.equal(shadow.shouldSample('fix the bug', 'T2', { risk_level: 'medium' }), true);
    } finally {
      Math.random = origRandom;
    }
  });

  it('rejects T2 prompt when random >= SAMPLE_RATE (mocked)', () => {
    const origRandom = Math.random;
    Math.random = () => 0.06; // above 0.05
    try {
      assert.equal(shadow.shouldSample('fix the bug', 'T2', { risk_level: 'medium' }), false);
    } finally {
      Math.random = origRandom;
    }
  });

  it('accepts T3 prompt within sampling window', () => {
    const origRandom = Math.random;
    Math.random = () => 0.02;
    try {
      assert.equal(shadow.shouldSample('redesign vault', 'T3', { risk_level: 'medium' }), true);
    } finally {
      Math.random = origRandom;
    }
  });
});

describe('shadowTierFor', () => {
  it('maps T3 → T2', () => {
    assert.equal(shadow.shadowTierFor('T3'), 'T2');
  });

  it('maps T2 → T1', () => {
    assert.equal(shadow.shadowTierFor('T2'), 'T1');
  });

  it('maps T1 → T0', () => {
    assert.equal(shadow.shadowTierFor('T1'), 'T0');
  });

  it('returns null for T0', () => {
    assert.equal(shadow.shadowTierFor('T0'), null);
  });

  it('returns null for unknown', () => {
    assert.equal(shadow.shadowTierFor('T99'), null);
  });
});

describe('logShadowPair', () => {
  it('truncates previews to PREVIEW_MAX_CHARS', () => {
    const longStr = 'x'.repeat(500);
    const evt = shadow.logShadowPair('d1', 's1', 'T3', 'T2', longStr, longStr);
    assert.equal(evt.primary_preview.length, shadow.PREVIEW_MAX_CHARS);
    assert.equal(evt.shadow_preview.length, shadow.PREVIEW_MAX_CHARS);
  });

  it('sets judge_verdict to null', () => {
    const evt = shadow.logShadowPair('d2', 's2', 'T2', 'T1', 'hello', 'world');
    assert.equal(evt.judge_verdict, null);
  });
});

describe('constants', () => {
  it('SAMPLE_RATE is 5%', () => {
    assert.equal(shadow.SAMPLE_RATE, 0.05);
  });

  it('MIN_ELIGIBLE_TIER is T2', () => {
    assert.equal(shadow.MIN_ELIGIBLE_TIER, 'T2');
  });

  it('TIER_ORDER has 4 entries', () => {
    assert.equal(shadow.TIER_ORDER.length, 4);
  });
});
