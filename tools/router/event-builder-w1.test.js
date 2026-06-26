'use strict';

// event-builder W1 instrumentation tests — Cockpit v2 Wave 1 (PASSO 3).
// Covers the new per-decision signals: detectRetry (the retry writer's logic),
// tokens_out (REAL, not per-tier avg), tok_per_s (= tokens_out / latency), and
// auto_skill[_conf]. Honesty contract: every signal is null without a sample —
// never a fabricated 0. Also re-asserts the privacy validator still passes with
// the additive fields.

const test = require('node:test');
const assert = require('node:assert');
const eb = require('./event-builder.js');

function classified(extra) {
  return Object.assign({
    ts: '2026-06-26T10:00:00.000Z',
    ts_ms: 1782000000000,
    event: 'classified',
    session_id: 'sess-w1',
    prompt_len: 120,
    prompt_preview: 'please draw a diagram of the flow',
    tier: 'T1',
    task_category: 'diagram',
    confidence: 0.9,
    escalation_rule: 'none',
    has_file_refs: false,
    has_code_block: false,
  }, extra || {});
}

test('detectRetry: PT + EN retry phrases fire; neutral prompts do not', () => {
  const yes = [
    'try again please',
    'isso não funcionou, tenta de novo',
    'still broken after your change',
    "that's wrong",
    'não funciona',
    'refaz isto',
    "it doesn't work",
  ];
  for (const p of yes) assert.equal(eb.detectRetry(p), true, `should detect retry: ${p}`);

  const no = [
    'summarize this file',
    'add a new endpoint for users',
    'explain how the router works',
    '',
    null,
    undefined,
  ];
  for (const p of no) assert.equal(eb.detectRetry(p), false, `should NOT detect retry: ${p}`);
});

test('tokens_out: REAL count from opts, never the per-tier average; null without a sample', () => {
  const withTokens = eb.buildEvent(classified(), [], null, { tokens_out: 432 });
  assert.equal(withTokens.tokens_out, 432);

  const noTokens = eb.buildEvent(classified(), [], null, {});
  assert.equal(noTokens.tokens_out, null, 'no execution sample → null (not 0, not avg)');
});

test('tokens_out can come from a matching exec row that carries it', () => {
  const evt = eb.buildEvent(classified(), [{ ts_ms: 1, model: 'haiku', tokens_out: 210 }], null, {});
  assert.equal(evt.tokens_out, 210);
});

test('tok_per_s = tokens_out / latency; prefers exec duration, falls back to wall-clock; null otherwise', () => {
  // (a) explicit exec duration preferred: 300 tok / 2.0s = 150
  const a = eb.buildEvent(classified(), [], null, { tokens_out: 300, duration_ms: 2000 });
  assert.equal(a.tok_per_s, 150);

  // (b) wall-clock fallback: turn_end_ts - ts_ms = 4500ms → 300 / 4.5 = 66.7
  const last = { session_id: 'sess-w1', turn_end_ts: 1782000004500 };
  const b = eb.buildEvent(classified(), [], last, { tokens_out: 300 });
  assert.equal(b.tok_per_s, 66.7);

  // (c) no latency → null even with tokens
  const c = eb.buildEvent(classified(), [], null, { tokens_out: 300 });
  assert.equal(c.tok_per_s, null);

  // (d) no tokens → null even with latency
  const d = eb.buildEvent(classified(), [], last, {});
  assert.equal(d.tok_per_s, null);
});

test('retry_detected flows from .last-classified.json (the live writer output)', () => {
  const last = { session_id: 'sess-w1', retry_detected: 1 };
  const evt = eb.buildEvent(classified(), [], last, {});
  assert.equal(evt.retry_detected, 1);

  const evt0 = eb.buildEvent(classified(), [], { retry_detected: 0 }, {});
  assert.equal(evt0.retry_detected, 0);

  const evtNull = eb.buildEvent(classified(), [], null, {});
  assert.equal(evtNull.retry_detected, null, 'absent signal → null');
});

test('auto_skill[_conf]: recorded when a directive fired (opts or classified); null otherwise', () => {
  const viaOpts = eb.buildEvent(classified(), [], null, {
    auto_skill: 'anthropic-skills:canvas-design',
    auto_skill_conf: 0.92,
  });
  assert.equal(viaOpts.auto_skill, 'anthropic-skills:canvas-design');
  assert.equal(viaOpts.auto_skill_conf, 0.92);

  const viaClassified = eb.buildEvent(
    classified({ auto_skill: 'diagram-systems-skill', auto_skill_conf: 0.81 }), [], null, {});
  assert.equal(viaClassified.auto_skill, 'diagram-systems-skill');
  assert.equal(viaClassified.auto_skill_conf, 0.81);

  const none = eb.buildEvent(classified(), [], null, {});
  assert.equal(none.auto_skill, null);
  assert.equal(none.auto_skill_conf, null);
});

test('privacy validator still passes with the additive fields present', () => {
  const evt = eb.buildEvent(classified(), [], { session_id: 'sess-w1', turn_end_ts: 1782000004500 }, {
    tokens_out: 300, auto_skill: 'anthropic-skills:canvas-design', auto_skill_conf: 0.92,
  });
  assert.ok(evt, 'event must build');
  const val = eb.validateEventPrivacy(evt);
  assert.equal(val.ok, true, `validator rejected: ${val.reason}`);
  // Every key is allow-listed.
  for (const k of Object.keys(evt)) {
    assert.ok(eb.ALLOWED_FIELDS.has(k), `unexpected field on event: ${k}`);
  }
});
