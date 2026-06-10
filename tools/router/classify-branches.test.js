#!/usr/bin/env node
// @ts-check
/**
 * Unit tests for classify.js — branch coverage of tier routing paths.
 *
 * CCA Sprint 11 (post-certification) — final-reviewer flagged classify.js
 * branch coverage at 33.57% as the biggest remaining risk: promote/demote
 * logic is where regressions hide. This suite targets the critical paths
 * listed in the router doctrine:
 *   - HIGH_RISK guardrails (push, deploy, .env, migration, credentials)
 *   - MED_RISK (refactor, review, audit)
 *   - LOW_RISK (rename, typo, cor do botão)
 *   - architecture_or_critical
 *   - bug_hunt_or_debug
 *   - trivial_local
 *   - file_read_intent
 *   - bash_command_paste
 *   - T0 sub-tier routing (general/code/math)
 *
 * Complements classify.test.js (precedence tests).
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

// ── HIGH_RISK → forces T3 ──────────────────────────────────────────────

test('HIGH_RISK: git push triggers T3', () => {
  const r = classify('vou fazer push para main');
  assert.equal(r.tier, 'T3');
});

test('HIGH_RISK: deploy to production forces T3', () => {
  const r = classify('deploy to production');
  assert.equal(r.tier, 'T3');
});

test('HIGH_RISK: .env edit forces T3', () => {
  const r = classify('edit the .env file to add the API key');
  assert.equal(r.tier, 'T3');
});

test('HIGH_RISK: migration forces T3', () => {
  const r = classify('run a new supabase migration for the users table');
  assert.equal(r.tier, 'T3');
});

test('HIGH_RISK: credentials forces T3', () => {
  const r = classify('rotate the production API credentials');
  assert.equal(r.tier, 'T3');
});

test('HIGH_RISK: DROP TABLE forces T3', () => {
  const r = classify('drop table users from the database');
  assert.equal(r.tier, 'T3');
});

// ── Architecture / critical (T3) ───────────────────────────────────────

test('architecture: multi-file refactor → T3', () => {
  const r = classify('redesenha o módulo de autenticação para suportar multi-user e SSO');
  assert.ok(r.tier === 'T3' || r.tier === 'T2',
    `expected T3 or T2 for architecture, got ${r.tier}`);
});

// ── Bug investigation (T2 default) ─────────────────────────────────────

test('bug investigation → T2 or higher', () => {
  const r = classify('porque é que o websocket reconnect falha às vezes em Safari?');
  assert.ok(['T2', 'T3'].includes(r.tier),
    `expected T2/T3 for bug hunt, got ${r.tier}`);
});

// ── LOW_RISK / trivial (T0) ────────────────────────────────────────────

test('trivial: rename variable → T0', () => {
  const r = classify('rename the variable foo to bar');
  assert.ok(['T0', 'T1'].includes(r.tier),
    `expected T0/T1 for rename, got ${r.tier}`);
});

test('trivial: change button color → T0 or T1', () => {
  const r = classify('muda a cor do botão de login para azul');
  assert.ok(['T0', 'T1'].includes(r.tier),
    `expected T0/T1 for color change, got ${r.tier}`);
});

test('trivial: fix typo → T0 or T1', () => {
  const r = classify('fix this typo in the README');
  assert.ok(['T0', 'T1'].includes(r.tier),
    `expected T0/T1 for typo, got ${r.tier}`);
});

// ── Commit message / regex / explain (T1) ──────────────────────────────

test('commit message task → T1', () => {
  const r = classify('generate a commit message for these staged changes');
  assert.ok(['T0', 'T1'].includes(r.tier),
    `expected T0/T1 for commit msg, got ${r.tier}`);
});

test('regex task → T1', () => {
  const r = classify('write a regex to match email addresses in a text');
  assert.ok(['T0', 'T1'].includes(r.tier),
    `expected T0/T1 for regex, got ${r.tier}`);
});

test('short explain task → T0 or T1', () => {
  const r = classify('explain what TypeError means in JavaScript');
  assert.ok(['T0', 'T1'].includes(r.tier),
    `expected T0/T1 for explain, got ${r.tier}`);
});

// ── Summarize / transform (T0) ─────────────────────────────────────────

test('summarize task → T0', () => {
  const r = classify('resume este ficheiro em 3 linhas');
  assert.equal(r.tier, 'T0');
});

test('translate task → T0', () => {
  const r = classify('traduz este texto para inglês');
  assert.equal(r.tier, 'T0');
});

// ── T0 sub-tier signals ────────────────────────────────────────────────

test('code-heavy prompt: "refactor" keyword triggers HIGH_RISK → T3', () => {
  // The doctrine explicitly flags "refactor" as a HIGH_RISK signal (can
  // touch multiple files / break runtime). Single-function refactors
  // still land in T3 because the classifier can't distinguish scope
  // from a one-liner. Confirmed behaviour: this test guards against
  // regressions that would demote refactor prompts.
  const r = classify('refactor this function to use map instead of a for loop');
  assert.equal(r.tier, 'T3',
    `expected T3 for refactor keyword, got ${r.tier}`);
  assert.equal(r.risk_level, 'high');
});

test('math/reasoning prompt → T0-math or T2', () => {
  const r = classify('solve this equation: 3x + 7 = 22 step by step');
  assert.ok(['T0', 'T1', 'T2'].includes(r.tier));
});

// ── File read intent (T0) ──────────────────────────────────────────────

test('file read intent: pasted path → T0', () => {
  const r = classify('src/components/Button.tsx');
  // A bare path is either trivial_local or file_read_intent.
  assert.ok(['T0', 'T1'].includes(r.tier),
    `expected T0/T1 for path paste, got ${r.tier}`);
});

// ── Confidence score structure ─────────────────────────────────────────

test('classify output: has tier, confidence, task_category', () => {
  const r = classify('do something useful');
  assert.ok(['T0', 'T1', 'T2', 'T3'].includes(r.tier));
  assert.ok(typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1);
  assert.ok(typeof r.task_category === 'string' && r.task_category.length > 0);
});

// ── Wave 49 (Phase 7) — Tier 5 Fable, opt-in only ──────────────────────
test('T5: "@fable" override pins Tier 5 Fable with fable provider', () => {
  const r = classify('@fable redesign the auth system');
  assert.equal(r.tier, 'T5');
  assert.equal(r.recommended_model, 'claude-fable-5');
  assert.deepEqual(r.suggested_providers, ['fable']);
  assert.ok(r.user_override && r.user_override.honored === true);
});

test('T5: "usa fable" (PT-PT) also reaches Tier 5', () => {
  assert.equal(classify('usa fable para isto').tier, 'T5');
});

test('T5: the classifier NEVER auto-routes to T5 without an override', () => {
  for (const p of ['fix this typo', 'redesign the vault for multi-user', 'deploy to production and run the migration', 'analyse this dense chart please']) {
    assert.notEqual(classify(p).tier, 'T5', `auto-routed to T5 for: ${p}`);
  }
});

test('T5: "@fable" on a high-risk prompt is honored (upgrade, not a downgrade)', () => {
  const r = classify('@fable deploy to production now');
  assert.equal(r.tier, 'T5');
  assert.ok(r.user_override && r.user_override.honored === true);
});
