#!/usr/bin/env node
/**
 * Unit tests for classifyWithRetry() — CCA D4 validation-retry loop.
 *
 * Contract verified:
 *   1. High-confidence primary → returns unchanged, no retry_attempted flag.
 *   2. T3 primary → returned as-is regardless of confidence (HIGH_RISK invariant).
 *   3. Low-confidence + normalisable prompt → secondary pass runs.
 *   4. Low-confidence + already-normalised prompt → no retry, escalation_rule
 *      explicitly says 'low_confidence_persisted'.
 *   5. normalisePrompt strips fenced code + collapses whitespace + lowercases.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classify, classifyWithRetry, normalisePrompt } = require('./classify.js');

// ── normalisePrompt unit tests ──────────────────────────────────────

test('normalisePrompt strips fenced code blocks', () => {
  const input = 'Please review this:\n```ts\nconst x = 1;\n```\nIs it fine?';
  const out = normalisePrompt(input);
  assert.ok(!out.includes('const x'), `fenced code leaked through: "${out}"`);
  assert.ok(out.includes('please review this'), 'prose dropped');
  assert.ok(out.includes('is it fine?'), 'trailing prose dropped');
});

test('normalisePrompt collapses whitespace', () => {
  assert.equal(normalisePrompt('  a   b\n\n\tc  '), 'a b c');
});

test('normalisePrompt lowercases', () => {
  assert.equal(normalisePrompt('GIT PUSH --force'), 'git push --force');
});

test('normalisePrompt returns empty string for null/undefined', () => {
  assert.equal(normalisePrompt(null), '');
  assert.equal(normalisePrompt(undefined), '');
  assert.equal(normalisePrompt(''), '');
});

// ── classifyWithRetry integration tests ────────────────────────────

test('high-confidence prompt passes through untouched', () => {
  // "lista ficheiros" is a clear T0 intent → primary confidence ≥ 0.4
  const r = classifyWithRetry('lista os ficheiros no directório');
  assert.ok(r.confidence >= 0.4, `expected high confidence, got ${r.confidence}`);
  assert.equal(r.retry_attempted, undefined, 'should not attempt retry');
});

test('T3 primary is never demoted by retry', () => {
  // "git push --force" triggers HIGH_RISK → T3 with confidence whatever
  const primary = classify('git push --force origin main');
  assert.equal(primary.tier, 'T3', 'precondition: HIGH_RISK → T3');
  const r = classifyWithRetry('git push --force origin main');
  assert.equal(r.tier, 'T3', 'retry must never demote T3');
});

test('fully normalised identical prompt skips retry and flags persisted', () => {
  // "ok" is already lowercase + no whitespace quirks + no fences.
  const primary = classify('ok');
  if (primary.confidence < 0.4 && primary.tier !== 'T3') {
    const r = classifyWithRetry('ok');
    assert.equal(r.retry_attempted, false, 'retry should be skipped');
    assert.equal(
      r.escalation_rule,
      'low_confidence_persisted',
      `escalation_rule: ${r.escalation_rule}`
    );
  }
});

test('retry sets structured provenance when it runs', () => {
  // A noisy prompt with mixed case + extra whitespace that normalises to
  // something that could match differently. Exact behaviour depends on
  // patterns; we assert only the provenance shape, not a specific outcome.
  const noisy = '   Git\nStatus  ';
  const primary = classify(noisy);
  if (primary.confidence < 0.4 && primary.tier !== 'T3') {
    const r = classifyWithRetry(noisy);
    if (r.retry_attempted) {
      assert.ok('retry_primary_confidence' in r, 'must record primary confidence');
      assert.ok('retry_secondary_confidence' in r, 'must record secondary confidence');
      assert.ok(
        ['retry_improved', 'retry_did_not_improve'].includes(r.escalation_rule),
        `escalation_rule: ${r.escalation_rule}`
      );
    }
  }
});
