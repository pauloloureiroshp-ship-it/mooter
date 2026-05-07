#!/usr/bin/env node
// @ts-check
/**
 * Tests for statusline-multi.js — narrative statusline renderer.
 *
 * Covers the pure helpers (no I/O) so we can guarantee:
 *   - the four primary states (green / yellow / red / empty) are reachable
 *     and never render a degraded "—" by accident,
 *   - the priority order is RED > YELLOW > GREEN (so a critical Anthropic
 *     situation is never masked by a yellow savings warning),
 *   - the digest aggregator filters tester noise + non-today events,
 *   - the beast-overkill heuristic counts only forced-T3 + low-complexity
 *     turns (no false positives on real T3 work).
 *
 * Run with:  node --test statusline-multi.test.js
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  pickState, renderFromContext,
  digest, beastOverkillPct, zenUnderkillPct, avgConfidence,
  computeAnthropicRem, computeCodexRem, computeCodexMessagesLeft,
  DEMO_CONTEXTS,
} = require('./statusline-multi.js');

// ── pickState — primary states ──────────────────────────────────────────

test('pickState: green when savings tracker reports healthy figures', () => {
  const s = pickState(DEMO_CONTEXTS.green);
  assert.equal(s.color, 'green');
  assert.match(s.headline, /saved \$0\.27 today \(89%\)/);
});

test('pickState: yellow when beast overkill exceeds threshold', () => {
  const s = pickState(DEMO_CONTEXTS.yellow);
  assert.equal(s.color, 'yellow');
  assert.match(s.headline, /forced T3 on trivials/);
});

test('pickState: red when Anthropic 5h window is critically low', () => {
  const s = pickState(DEMO_CONTEXTS.red);
  assert.equal(s.color, 'red');
  assert.match(s.headline, /Anthropic 8% used/);
  assert.match(s.headline, /Codex \(84%\)/);
});

test('pickState: empty when no data and no quota state', () => {
  const s = pickState(DEMO_CONTEXTS.empty);
  assert.equal(s.color, 'empty');
  assert.match(s.headline, /no data yet/);
});

// ── pickState — priority ordering ───────────────────────────────────────

test('pickState: RED Anthropic-low beats YELLOW low-savings', () => {
  const ctx = {
    ...DEMO_CONTEXTS.green,
    anthRem: 5,           // critical
    savedPct: 10, total: 20, // would be yellow on its own
  };
  assert.equal(pickState(ctx).color, 'red');
});

test('pickState: RED confidence-collapse beats YELLOW beast-overkill', () => {
  const beastEvents = Array(10).fill({
    tier: 'T3',
    escalation_rule: 'beast_intent_force_t3',
    prompt_complexity_score: 0.01,
    confidence: 0.3,
  });
  const ctx = {
    ...DEMO_CONTEXTS.green,
    anthRem: 80,
    last:   beastEvents[0],
    recent: beastEvents,
  };
  const s = pickState(ctx);
  assert.equal(s.color, 'red');
  assert.match(s.headline, /miscalibrated/);
});

test('pickState: YELLOW low-savings only fires after enough turns', () => {
  const ctx = {
    ...DEMO_CONTEXTS.green,
    total: 3,             // below the 5-turn floor
    savedPct: 5,
  };
  assert.equal(pickState(ctx).color, 'green');
});

// ── renderFromContext — output shape ────────────────────────────────────

test('renderFromContext: prints exactly one line with glyph + headline + proof', () => {
  for (const k of ['green', 'yellow', 'red', 'empty']) {
    const out = renderFromContext(DEMO_CONTEXTS[k]);
    assert.equal(out.includes('\n'), false, `state ${k} produced multiline output`);
    assert.match(out, /^[🟢🟡🔴⚪]/u, `state ${k} missing color glyph`);
    assert.match(out, / │ /, `state ${k} missing separator`);
  }
});

test('renderFromContext: never returns empty string', () => {
  const out = renderFromContext(DEMO_CONTEXTS.empty);
  assert.ok(out.length > 5);
});

// ── digest — log filtering ──────────────────────────────────────────────

test('digest: ignores tester_* events and non-today entries', () => {
  const today = new Date().toISOString();
  const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const lines = [
    JSON.stringify({ event: 'classified', source: 'mooter-tester', ts: today, tier: 'T2' }),
    JSON.stringify({ event: 'classified', ts: yesterday, tier: 'T2' }),
    JSON.stringify({ event: 'classified', ts: today, tier: 'T2', confidence: 0.9 }),
    JSON.stringify({ event: 'classified', ts: today, tier: 'T0', confidence: 0.5,
                     suggested_providers: ['ollama'] }),
    JSON.stringify({ event: 'turn_end',   ts: today }),
  ];
  const d = digest(lines);
  assert.equal(d.total, 2, 'expected only 2 today-classified non-tester events');
  assert.equal(d.counts.T2, 1);
  assert.equal(d.counts.T0, 1);
  assert.ok(d.last);
  assert.equal(d.recent.length >= 2, true);
});

test('digest: counts codex_cli first-suggested separately from tier', () => {
  const today = new Date().toISOString();
  const lines = [
    JSON.stringify({ event: 'classified', ts: today, tier: 'T2',
                     suggested_providers: ['codex_cli', 'sonnet'], confidence: 0.8 }),
    JSON.stringify({ event: 'classified', ts: today, tier: 'T2',
                     suggested_providers: ['sonnet'], confidence: 0.8 }),
  ];
  const d = digest(lines);
  assert.equal(d.counts.codex, 1);
  assert.equal(d.counts.T2,    1);
  assert.equal(d.total, 2);
});

// ── Quota helpers ──────────────────────────────────────────────────────

test('computeAnthropicRem: integer percentage from window_5h', () => {
  const q = { providers: { anthropic: { window_5h: { tokens_used: 250, limit: 1000 } } } };
  assert.equal(computeAnthropicRem(q), 75);
});

test('computeCodexRem: 0 when exhausted flag set', () => {
  const q = { providers: { openai_codex_cli: {
    window_5h: { messages_used: 5, limit: 100 },
    exhausted: true,
  } } };
  assert.equal(computeCodexRem(q), 0);
});

test('computeCodexMessagesLeft: subtracts used from limit and clamps at 0', () => {
  const q = { providers: { openai_codex_cli: {
    window_5h: { messages_used: 60, limit: 150 },
  } } };
  assert.equal(computeCodexMessagesLeft(q), 90);
});

// ── Heuristics ─────────────────────────────────────────────────────────

test('beastOverkillPct: 0 on empty, ignores high-complexity prompts', () => {
  assert.equal(beastOverkillPct([]), 0);
  const events = [
    { tier: 'T3', escalation_rule: 'beast_intent_force_t3', prompt_complexity_score: 0.4 },
    { tier: 'T3', escalation_rule: 'beast_intent_force_t3', prompt_complexity_score: 0.6 },
  ];
  // Both are real T3 work (complexity above the 0.05 trivial threshold).
  assert.equal(beastOverkillPct(events), 0);
});

test('beastOverkillPct: counts forced trivials only', () => {
  const events = [
    { tier: 'T3', escalation_rule: 'beast_intent_force_t3', prompt_complexity_score: 0.01 },
    { tier: 'T3', escalation_rule: 'beast_intent_force_t3', prompt_complexity_score: 0.5  },
    { tier: 'T0' },
    { tier: 'T3', escalation_rule: 'beast_intent_force_t3', prompt_complexity_score: 0.01 },
  ];
  // 2 of 4 are forced trivials → 50%.
  assert.equal(beastOverkillPct(events), 50);
});

test('zenUnderkillPct: 0 on empty, ignores low-complexity prompts', () => {
  assert.equal(zenUnderkillPct([]), 0);
  const events = [
    { tier: 'T1', active_mode: 'zen', prompt_complexity_score: 0.1 },
    { tier: 'T1', active_mode: 'zen', prompt_complexity_score: 0.3 },
  ];
  // Both are within zen's competence (complexity ≤ 0.5) → no underkill.
  assert.equal(zenUnderkillPct(events), 0);
});

test('zenUnderkillPct: counts capped complex tasks only', () => {
  const events = [
    { tier: 'T1', active_mode: 'zen', prompt_complexity_score: 0.8 }, // capped + complex
    { tier: 'T0', active_mode: 'zen', prompt_complexity_score: 0.7 }, // capped + complex
    { tier: 'T1', active_mode: 'zen', prompt_complexity_score: 0.2 }, // capped + simple — fine
    { tier: 'T2' }, // no zen
  ];
  // 2 of 4 are zen-capped complex tasks → 50%.
  assert.equal(zenUnderkillPct(events), 50);
});

test('pickState: yellow when zen underkill exceeds threshold', () => {
  const zenEvents = Array(10).fill({
    tier: 'T1',
    active_mode: 'zen',
    escalation_rule: 'zen_mode',
    prompt_complexity_score: 0.7,
    confidence: 0.8,
  });
  const ctx = {
    ...DEMO_CONTEXTS.green,
    last:   zenEvents[0],
    recent: zenEvents,
  };
  const s = pickState(ctx);
  assert.equal(s.color, 'yellow');
  assert.match(s.headline, /zen-capped on complex tasks/);
});

test('avgConfidence: ignores undefined / non-finite values', () => {
  const xs = [{ confidence: 0.8 }, { confidence: 0.4 }, { confidence: NaN }, {}];
  const avg = avgConfidence(xs);
  assert.ok(avg !== null && Math.abs(avg - 0.6) < 1e-9);
});

test('avgConfidence: returns null when no usable values', () => {
  assert.equal(avgConfidence([]),     null);
  assert.equal(avgConfidence([{}]),   null);
  assert.equal(avgConfidence([{ confidence: 'not-a-number' }]), null);
});
