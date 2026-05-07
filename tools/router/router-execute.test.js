#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * router-execute.test.js — Wave-2 executor invariants (I1..I10 from SPEC §9).
 *
 * Phased coverage:
 *   T-05  → I1, I1b, I2, I3, I3b, I3c            (defer cases)
 *   T-06  → I7, I7b                              (chain construction)
 *   T-07  → I4, I5, I6, I9                       (dispatch loop)
 *   T-08  → I10                                  (telemetry + sanitisation)
 *   T-09  → I8                                   (calibration trigger)
 *
 * Each phase appends to this file under its own describe-style header.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { runExecutorWithFixture, reset } = require('./router-execute.harness');

const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'router-execute.fixtures.json'), 'utf8')
);

function fixtureById(id) {
  const f = FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`fixture not found: ${id}`);
  return f;
}

// ── T-05 — defer cases (I1, I1b, I2, I3, I3b) ───────────────────────────

test('I1: T3 classification always defers to model-architect', async () => {
  reset();
  const { result } = await runExecutorWithFixture({ fixture: fixtureById('I1_t3_always_defers') });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'model-architect');
  assert.equal(result.reason, 'tier_t3');
  assert.deepEqual(result.fallback_chain, []);
  assert.equal(result.classification_ref.tier, 'T3');
});

test('I1b: T3 defers even when codex_cli is mocked to succeed', async () => {
  reset();
  const { result, telemetryWrites } = await runExecutorWithFixture({
    fixture: fixtureById('I1b_t3_defers_even_when_codex_available'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'model-architect');
  assert.equal(result.reason, 'tier_t3');
  // No provider was tried — chain stays empty even though codex would have succeeded.
  assert.deepEqual(result.fallback_chain, []);
  // Telemetry must still record the defer.
  assert.equal(telemetryWrites.length, 1);
  assert.equal(telemetryWrites[0].outcome, 'deferred');
});

test('I2: T3 with high_risk signal defers with reason high_risk_floor', async () => {
  reset();
  const { result } = await runExecutorWithFixture({ fixture: fixtureById('I2_high_risk_floor') });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'model-architect');
  assert.equal(result.reason, 'high_risk_floor');
  assert.deepEqual(result.fallback_chain, []);
});

test('I3: user_override pinning Opus defers to model-architect with reason user_override', async () => {
  reset();
  const { result } = await runExecutorWithFixture({ fixture: fixtureById('I3_user_override_opus') });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'model-architect');
  assert.equal(result.reason, 'user_override');
  assert.deepEqual(result.fallback_chain, []);
});

test('I3b: user_override pinning Haiku defers to cheap-triage', async () => {
  reset();
  const { result } = await runExecutorWithFixture({ fixture: fixtureById('I3b_user_override_haiku') });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'cheap-triage');
  assert.equal(result.reason, 'user_override');
});

test('I3c: user_override pinning Sonnet defers to model-reasoner (boundary, not in fixtures)', async () => {
  reset();
  const handcrafted = {
    prompt: 'use sonnet to reason about this',
    classification: {
      tier: 'T2',
      confidence: 0.99,
      recommended_backend: 'claude_subagent',
      recommended_model: 'claude-sonnet-4-6',
      suggested_providers: ['sonnet'],
      task_category: 'reasoning',
      escalation_rule: 'user_override_positive',
      reasoning: 'override_positive=sonnet',
      user_override: {
        kind: 'positive',
        requested: 'sonnet',
        label: 'Sonnet',
        honored: true,
        original_tier: 'T1',
      },
    },
    provider_state: {},
    provider_mocks: {},
  };
  const { result } = await runExecutorWithFixture({ fixture: handcrafted });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'model-reasoner');
  assert.equal(result.reason, 'user_override');
});

test('classification_ref carries tier, confidence, task_category', async () => {
  reset();
  const { result } = await runExecutorWithFixture({ fixture: fixtureById('I1_t3_always_defers') });
  assert.equal(result.classification_ref.tier, 'T3');
  assert.equal(result.classification_ref.confidence, 0.85);
  assert.equal(result.classification_ref.task_category, 'architecture');
});

test('execute() with a missing classification returns a structured error', async () => {
  reset();
  const handcrafted = {
    prompt: 'noop',
    classification: null,
    provider_state: {},
    provider_mocks: {},
  };
  const { result } = await runExecutorWithFixture({ fixture: handcrafted });
  assert.equal(result.ok, false);
  assert.ok(result.errors && result.errors.length >= 1);
  assert.equal(result.reason, 'classification_invalid');
});

test('execute() never throws — all error paths produce a structured value', async () => {
  reset();
  const handcrafted = {
    prompt: 'noop',
    classification: { tier: 'T0', confidence: 0.5 }, // missing required-ish fields
    provider_state: {},
    provider_mocks: {},
  };
  // Should resolve, not reject, even with sparse classification.
  const out = await runExecutorWithFixture({ fixture: handcrafted });
  assert.ok(out && out.result);
  assert.equal(typeof out.result.ok, 'boolean');
});
