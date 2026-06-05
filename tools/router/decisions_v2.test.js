// decisions_v2.js — unit tests (Wave 19 Day 3, 19.B).
// Proves: (1) a classify decision maps to the {ts,op,tier,llm,tokens_in,
// tokens_out,reason,via} schema with reasons derived from real fields only;
// (2) the writer is metadata-only — prompt / prompt_preview NEVER leak — and
// writes its own JSONL without touching decisions.log.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const v2 = require('./decisions_v2.js');

test('recordFromDecision maps the schema + derives reasons from real fields', () => {
  // classify_score path
  const r1 = v2.recordFromDecision(
    { task_category: 'cross_file_change', tier: 'T2', recommended_model: 'claude-sonnet-4-6', confidence: 0.75, recommended_backend: 'claude_subagent' },
    { ts: '2026-06-05T10:30:00Z' },
  );
  assert.deepEqual(r1, {
    ts: '2026-06-05T10:30:00Z',
    op: 'cross_file_change',
    tier: 'T2',
    llm: 'sonnet',
    tokens_in: 0,
    tokens_out: 0,
    reason: 'classify_score=0.75 T2',
    via: 'claude_subagent',
  });

  // escalation_rule wins over the score; subagent is the via
  const r2 = v2.recordFromDecision({ tier: 'T3', recommended_model: 'opus', escalation_rule: 'beast_intent_force_t3', suggested_subagent: 'model-architect' });
  assert.equal(r2.reason, 'beast_intent_force_t3');
  assert.equal(r2.via, 'model-architect');
  assert.equal(r2.llm, 'opus');

  // safety boost is normalized to its kind
  const r3 = v2.recordFromDecision({ tier: 'T3', safety_boost_applied: true, safety_boost_reason: 'architectural_keyword: schema' });
  assert.equal(r3.reason, 'safety_boost_architectural_keyword');

  // local tier default llm + tokens passthrough when present
  const r4 = v2.recordFromDecision({ tier: 'T0', task_category: 'summarize_file', tokens_in: 1200, tokens_out: 300, via: 'local-summarizer' });
  assert.equal(r4.llm, 'qwen3:30b');
  assert.equal(r4.tokens_in, 1200);
  assert.equal(r4.tokens_out, 300);
  assert.equal(r4.via, 'local-summarizer');
});

test('writer is metadata-only (zero PII) and does not touch decisions.log', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-v2-'));
  const v2log = path.join(dir, 'decisions_v2.jsonl');
  const legacy = path.join(dir, 'decisions.log');
  fs.writeFileSync(legacy, '{"event":"classified","tier":"T2"}\n'); // pre-existing legacy line
  const legacyBefore = fs.readFileSync(legacy, 'utf8');

  // A decision carrying prompt text + prompt_preview (the PII fields).
  v2.appendFromDecision(
    {
      tier: 'T0', task_category: 'summarize_file', recommended_model: 'qwen3:30b', confidence: 0.9,
      prompt: 'SECRET user prompt with private data',
      prompt_preview: 'SECRET user prompt with private data',
    },
    { logPath: v2log, ts: '2026-06-05T11:00:00Z' },
  );

  const written = fs.readFileSync(v2log, 'utf8').trim();
  const rec = JSON.parse(written);
  // Exactly the schema fields — nothing else.
  assert.deepEqual(Object.keys(rec).sort(), [...v2.SCHEMA_FIELDS].sort());
  assert.ok(!written.includes('SECRET'), 'no prompt text leaked');
  assert.ok(!('prompt' in rec) && !('prompt_preview' in rec), 'PII fields stripped');
  assert.equal(rec.op, 'summarize_file');
  assert.equal(rec.llm, 'qwen3:30b');

  // decisions.log is untouched by the v2 writer (backwards-compat).
  assert.equal(fs.readFileSync(legacy, 'utf8'), legacyBefore);

  fs.rmSync(dir, { recursive: true, force: true });
});
