#!/usr/bin/env node
/**
 * Unit tests for classify.js — quality_intent vs tuned_demote precedence.
 * Uses node:test (no deps). Run with: node classify.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const CLASSIFY = path.join(__dirname, 'classify.js');

function classify(prompt) {
  const r = spawnSync(process.execPath, [CLASSIFY, prompt], {
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, ANTHROPIC_API_KEY: '' },
  });
  return JSON.parse(r.stdout);
}

// ── quality_intent vs tuned_demote precedence ─────────────────────────────

test('quality_intent wins over tuned_demote when both match', () => {
  // "pensa bem" triggers quality_intent AND matches TUNED_DEMOTE_T3 pattern.
  // "investigar o bug" triggers MED_RISK → base T2. quality_intent → T3.
  // tuned_demote must NOT cancel the promotion back to T1.
  const result = classify('pensa bem antes de investigar o bug de websocket');
  assert.equal(result.tier, 'T3', `expected T3 but got ${result.tier}: ${result.reasoning}`);
  assert.ok(
    result.escalation_rule.includes('quality_intent'),
    `escalation_rule should mention quality_intent: ${result.escalation_rule}`
  );
});

test('tuned_demote still works when no quality_intent present', () => {
  // "sonnet diagnostica este" matches TUNED_DEMOTE_T3 pattern.
  // No quality_intent phrases → demote should fire normally.
  const result = classify('sonnet diagnostica este erro simples no login');
  // user_override for "sonnet" may fire first — if so, the override pins T2.
  // Either way, tuned_demote should bring it to T1 (no quality_intent to block it).
  assert.ok(
    result.tier === 'T1' || result.tier === 'T0',
    `expected T1 or T0 (demoted) but got ${result.tier}: ${result.reasoning}`
  );
});

test('user_override beats both tuned_demote and quality_intent', () => {
  // "@haiku" is an explicit user override → must pin to T1 regardless of
  // quality_intent ("pensa bem") or high-risk signals ("deploy").
  const result = classify('@haiku pensa bem neste problema simples');
  assert.equal(result.tier, 'T1', `expected T1 (user override) but got ${result.tier}: ${result.reasoning}`);
  assert.ok(
    result.user_override === true || result.escalation_rule.includes('user_override'),
    `should reflect user_override: ${JSON.stringify(result)}`
  );
});
