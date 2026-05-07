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

// ── Validation 2026-05-07 fixes — mechanical-trivial fast-path ────────────

test('mechanical_trivial: rename variable in single file → T0 conf 0.9', () => {
  const r = classify('rename variable userId to accountId in auth.ts');
  assert.equal(r.tier, 'T0', `expected T0 got ${r.tier}: ${r.reasoning}`);
  assert.equal(r.task_category, 'mechanical_trivial');
  assert.ok(r.confidence >= 0.9, `confidence should be ≥0.9 got ${r.confidence}`);
});

test('mechanical_trivial: format JSON file → T0', () => {
  const r = classify('format this JSON file with 2-space indentation');
  assert.equal(r.tier, 'T0');
  assert.equal(r.task_category, 'mechanical_trivial');
});

test('mechanical_trivial: ARCH_SIGNALS guardrail still escalates → T3', () => {
  // Even a "rename" verb cannot bypass ARCH_SIGNALS when 2+ architecture
  // keywords appear in the prompt.
  const r = classify('rename the entire distributed payment system architecture to multi-tenant');
  assert.equal(r.tier, 'T3', `ARCH_SIGNALS must override mechanical_trivial: ${r.reasoning}`);
});

// ── Validation 2026-05-07 fixes — advisory override ───────────────────────

test('advisory_override: compare refactor approaches → T2 (not T3)', () => {
  // HIGH_RISK regex /\brefactor/i would force T3 — advisory override
  // catches comparison/recommendation prompts and routes to T2.
  const r = classify('compare these two refactor approaches: extract-component vs prop-drill — recommend one');
  assert.equal(r.tier, 'T2', `comparison prompts should be T2 not T3: ${r.reasoning}`);
  assert.equal(r.escalation_rule, 'advisory_override');
});

test('advisory_override: PT-PT "qual é o melhor" → T2', () => {
  const r = classify('qual é o melhor: redux ou zustand para uma app pequena');
  assert.equal(r.tier, 'T2');
  assert.equal(r.escalation_rule, 'advisory_override');
});

test('advisory_override does NOT bypass HIGH_RISK for actionable prompts', () => {
  // "deploy this to production" is an action, not a comparison. HIGH_RISK
  // must still force T3.
  const r = classify('deploy this to production now');
  assert.equal(r.tier, 'T3');
});

// ── Validation 2026-05-07 fixes — IIFE guard (require side effect) ────────

test('require("./classify") does not invoke CLI IIFE', () => {
  // Before the fix, requiring this module read stdin and printed
  // classification of an empty prompt to stdout, polluting test runners.
  const r = spawnSync(process.execPath, [
    '-e',
    'const c = require("./classify"); process.stdout.write(typeof c.classify);',
  ], {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'function', `require should return module exports only: ${r.stdout}`);
});

// ── Validation 2026-05-07 fixes — explain difference (PT-PT) ──────────────

test('explain_difference_override: PT-PT "qual a diferença" → T1', () => {
  const r = classify('qual a diferença entre mutex e semaphore');
  assert.equal(r.tier, 'T1');
  assert.equal(r.escalation_rule, 'explain_difference_override');
});
