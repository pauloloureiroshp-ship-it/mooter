// Wave 29 (29.I/29.K) — /v1/pastor-v2 decision telemetry ingestion.
//
// Layers (mirrors sync_events.test.js conventions):
//   · partitionDecisions()  — pure, per-item Zod validation incl. privacy refine
//   · pastorV2DecisionSchema — real schema (accept valid, reject content/bad id)
//   · handlePastorV2()       — handler behaviour against a labelled D1 stub.
// Real D1 path is covered by the E2E smoke against deployed prod.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlePastorV2, partitionDecisions, RATE_LIMIT_PER_HOUR } from '../pastor-v2.js';
import { pastorV2DecisionSchema } from '../../lib/schemas.js';

function fakeDb(opts = {}) {
  const state = { rows: [] };
  const stmt = (sql) => ({
    sql, _args: [],
    bind(...a) { this._args = a; return this; },
    async first() {
      if (/COUNT\(\*\)/.test(sql)) return { cnt: opts.recentCount ?? state.rows.filter((r) => r.device_id === this._args[0]).length };
      return null;
    },
    async all() { return { results: [] }; },
    async run() {
      if (/INSERT OR IGNORE INTO pastor_v2_decisions/.test(sql)) {
        const a = this._args; // 0 decision_id, 1 device_id
        if (!state.rows.some((r) => r.decision_id === a[0])) state.rows.push({ decision_id: a[0], device_id: a[1] });
      }
      return {};
    },
  });
  return { _state: state, prepare: (sql) => stmt(sql), async batch(stmts) { for (const s of stmts) await s.run(); return []; } };
}

function req(method, body) {
  return { method, json: async () => body };
}
function validDecision(over = {}) {
  return {
    decision_id: 'd-' + Math.random().toString(16).slice(2),
    device_id: 'a1b2c3d4e5f6',
    ts: 1717718400000,
    prompt_class: 'T2',
    tier_chosen: 'T2',
    model_chosen: 'sonnet',
    classify_confidence: 0.8,
    tokens_in: 100,
    tokens_out: 40,
    cost_usd: 0.01,
    ...over,
  };
}

// ── partitionDecisions (pure) ──────────────────────────────────────────
test('partitionDecisions accepts valid, rejects bad device_id', () => {
  const { valid, rejection_reasons } = partitionDecisions([validDecision(), validDecision({ device_id: 'NOTHEX' })]);
  assert.equal(valid.length, 1);
  assert.equal(rejection_reasons.length, 1);
});

test('partitionDecisions rejects decisions carrying prompt content (privacy)', () => {
  const { valid, rejection_reasons } = partitionDecisions([{ ...validDecision(), prompt_text: 'secret user prompt' }]);
  assert.equal(valid.length, 0);
  assert.equal(rejection_reasons.length, 1);
  assert.match(rejection_reasons[0], /privacy field/);
});

test('partitionDecisions reports truncation past 100', () => {
  const many = Array.from({ length: 101 }, () => validDecision());
  const { valid, rejection_reasons } = partitionDecisions(many);
  assert.equal(valid.length, 100);
  assert.ok(rejection_reasons.some((r) => /truncated/.test(r)));
});

test('schema: privacy refine on a single decision', () => {
  assert.equal(pastorV2DecisionSchema.safeParse(validDecision()).success, true);
  assert.equal(pastorV2DecisionSchema.safeParse({ ...validDecision(), content: 'x' }).success, false);
});

// ── handlePastorV2 (handler) ───────────────────────────────────────────
test('handlePastorV2 rejects non-POST', async () => {
  const res = await handlePastorV2(req('GET'), { DB: fakeDb() });
  assert.equal(res.status, 405);
});

test('handlePastorV2 accepts a valid batch → 202', async () => {
  const db = fakeDb();
  const res = await handlePastorV2(req('POST', { decisions: [validDecision(), validDecision()] }), { DB: db });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.accepted, 2);
  assert.equal(body.rejected, 0);
  assert.equal(db._state.rows.length, 2);
});

test('handlePastorV2 with no valid decisions → 422 validation', async () => {
  const res = await handlePastorV2(req('POST', { decisions: [{ bad: true }] }), { DB: fakeDb() });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.isError, true);
});

test('handlePastorV2 enforces the rate limit → 429', async () => {
  const res = await handlePastorV2(req('POST', { decisions: [validDecision()] }), { DB: fakeDb({ recentCount: RATE_LIMIT_PER_HOUR }) });
  assert.equal(res.status, 429);
});

test('handlePastorV2 never persists a content key (defence in depth)', async () => {
  const db = fakeDb();
  await handlePastorV2(req('POST', { decisions: [validDecision(), { ...validDecision(), prompt: 'leak' }] }), { DB: db });
  // Only the clean decision is stored; the content-bearing one is rejected.
  assert.equal(db._state.rows.length, 1);
});
