#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * handoff-preflight.test.js
 *
 * The point of the preflight is that it CANNOT lie and CANNOT silently omit.
 * These tests pin exactly those two properties — anything else is detail.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const TOOL = path.join(__dirname, 'handoff-preflight.js');
const REPO = path.resolve(__dirname, '..');
const pre = require('./handoff-preflight.js');

function run(args = []) {
  return execFileSync(process.execPath, [TOOL, ...args], {
    cwd: REPO, encoding: 'utf8', timeout: 30000,
  });
}

test('--check passes: the skeleton covers every field the spec names', () => {
  // This is the anti-drift gate. If it fails, the spec grew a field and the
  // handoff would ship with a silent hole — the exact bug this tool exists for.
  const out = run(['--check']);
  assert.match(out, /OK — esqueleto cobre todos os campos do spec/);
});

test('spec parsing finds the canonical fields (not an empty set)', () => {
  const { ok, fields } = pre.specFields();
  assert.equal(ok, true, 'PERFECT_HANDOFF_SPEC.md must be readable');
  // A silently-empty parse would make --check pass vacuously — the worst
  // possible failure, since it looks green while asserting nothing.
  assert.ok(fields.length >= 5, `expected the spec to name ≥5 fields, got ${fields.length}`);
  for (const required of ['STATE', 'GATE', 'WORK', 'WORKTREE']) {
    assert.ok(fields.includes(required), `spec must name ${required}`);
  }
});

test('every judgement field renders as a loud TODO, never as blank', () => {
  const out = run();
  // An omitted field must be impossible to mistake for "nothing to report".
  for (const field of ['GOAL', 'INTENT', 'A ÚNICA COISA', 'PENDING', 'RISK']) {
    assert.match(out, new RegExp(`${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,120}?<<TODO`),
      `${field} must render a <<TODO>> marker`);
  }
});

test('GATE never claims tests are green without running them', () => {
  const out = run();
  // The golden rule (spec:95): never say ✓ unless it is true. This preflight
  // does not execute suites, so it must say n/d — never a pass.
  assert.match(out, /testes n\/d/);
  assert.doesNotMatch(out, /testes \d+\/\d+ ✓/);
});

test('classify.js sha is measured, not asserted', () => {
  const gate = pre.gateFacts();
  // Either a real verdict or n/d — never an unconditional ✓.
  assert.ok(
    gate.classifySha === 'n/d' || /^✓ intacto$|^✗ DIVERGE/.test(gate.classifySha),
    `unexpected sha verdict: ${gate.classifySha}`,
  );
});

test('STATE is derived from measured git facts, never hardcoded', () => {
  const git = pre.gitFacts();
  assert.ok(
    ['landed', 'parked (precisa push)', 'in-progress', 'in-progress (dirty)'].includes(git.state),
    `unexpected derived STATE: ${git.state}`,
  );
  // STATE must agree with the numbers it was derived from.
  if (git.state === 'landed') {
    assert.equal(git.ahead, 0);
    assert.equal(git.dirty, 0);
  }
  if (git.state === 'parked (precisa push)') {
    assert.ok(git.ahead > 0, 'parked implies unpushed commits');
    assert.equal(git.dirty, 0, 'parked implies a clean tree');
  }
});

test('council footer refuses to sign 8/8 when the 8 questions are unreachable', () => {
  const canon = pre.canonChecks();
  const out = run();
  if (!canon.council.startsWith('✓')) {
    // This is the exact failure of the 2026-07-16 cycle: the protocol points at
    // a Cowork memory, so no agent can honestly sign 8/8.
    assert.match(out, /assina n\/d, NUNCA 8\/8/);
    assert.doesNotMatch(out, /🔍 council: 8\/8/);
  }
});

test('--json emits machine-readable facts with the load-bearing keys', () => {
  const j = JSON.parse(run(['--json']));
  for (const k of ['git', 'wts', 'gate', 'canon', 'drift']) {
    assert.ok(k in j, `--json must expose ${k}`);
  }
  assert.ok(Array.isArray(j.wts), 'worktrees must be an array');
});

test('Q&A is recovered verbatim from the transcript, with every option intact', () => {
  const qa = pre.extractQA(null);
  if (!qa.ok) {
    // No transcript on this machine is a legitimate state — but it must degrade
    // to n/d, never to a fabricated decisions block.
    assert.match(pre.renderQA(qa), /^\s*n\/d — /);
    return;
  }
  for (const round of qa.rounds) {
    for (const q of round.questions) {
      assert.ok(q.question.length > 0, 'question text must be present');
      // The spec's hole nº2: a truncated question is worse than no question.
      assert.doesNotMatch(q.question, /\.\.\.$|…$/, 'question must not be truncated');
      assert.ok(q.options.length >= 2, 'a question must carry ALL its options');
      for (const o of q.options) {
        assert.ok(o.label && o.description, 'each option needs label + description');
      }
      assert.ok(q.chosen, 'chosen answer must be present or explicit n/d');
    }
  }
});

test('renderQA never invents a choice it did not find', () => {
  const fake = {
    ok: true,
    file: '/tmp/x.jsonl',
    rounds: [{
      round: 1,
      questions: [{
        question: 'Q?',
        header: 'h',
        options: [{ label: 'A', description: 'da' }, { label: 'B', description: 'db' }],
        chosen: 'n/d (sem resposta registada no transcript)',
      }],
    }],
  };
  const out = pre.renderQA(fake);
  assert.match(out, /n\/d \(sem resposta registada/);
  // Both options must survive into the render — no silent dropping.
  assert.match(out, /1\) A — da/);
  assert.match(out, /2\) B — db/);
});

test('UNPUSHED spans every worktree, not just the current one', () => {
  const wts = pre.worktrees();
  // A handoff that reports only the current worktree is how unpushed work goes
  // missing — the spec asks for "a soma de todos os worktrees".
  assert.ok(wts.length >= 1);
  for (const w of wts) assert.ok(w.path, 'each worktree needs a path');
});
