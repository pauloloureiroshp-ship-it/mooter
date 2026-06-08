// Wave 31 — /v1/pastor-adapters per-task adapter usage ingestion.
//
// Mirrors pastor_v2.test.js conventions:
//   · partitionAdapters()    — pure, per-item Zod validation incl. privacy refine
//   · pastorAdapterSchema    — real schema (accept valid, reject content/bad id)
//   · handlePastorAdapters() — handler behaviour against a labelled D1 stub.
// Real D1 path is covered by the E2E smoke against deployed prod.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlePastorAdapters, partitionAdapters, RATE_LIMIT_PER_HOUR } from '../pastor-adapters.js';
import { pastorAdapterSchema } from '../../lib/schemas.js';

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
      if (/INTO pastor_adapters/.test(sql)) {
        const a = this._args; // 0 adapter_id, 1 device_id
        const existing = state.rows.find((r) => r.adapter_id === a[0]);
        if (existing) existing.device_id = a[1];
        else state.rows.push({ adapter_id: a[0], device_id: a[1] });
      }
      return {};
    },
  });
  return { _state: state, prepare: (sql) => stmt(sql), async batch(stmts) { for (const s of stmts) await s.run(); return []; } };
}

function req(method, body) {
  return { method, json: async () => body };
}
function validAdapter(over = {}) {
  return {
    adapter_id: 'ad-' + Math.random().toString(16).slice(2),
    device_id: 'a1b2c3d4e5f6',
    adapter_name: 'pastor-frontend',
    task_type: 'coding-frontend',
    usage_count: 12,
    avg_score: 0.83,
    first_used: 1717718400000,
    last_used: 1717722000000,
    ...over,
  };
}

// ── partitionAdapters (pure) ───────────────────────────────────────────
test('partitionAdapters accepts valid, rejects bad device_id', () => {
  const { valid, rejection_reasons } = partitionAdapters([validAdapter(), validAdapter({ device_id: 'NOTHEX' })]);
  assert.equal(valid.length, 1);
  assert.equal(rejection_reasons.length, 1);
});

test('partitionAdapters rejects rows carrying prompt content (privacy)', () => {
  const { valid, rejection_reasons } = partitionAdapters([{ ...validAdapter(), prompt_text: 'secret user prompt' }]);
  assert.equal(valid.length, 0);
  assert.match(rejection_reasons[0], /privacy field/);
});

test('partitionAdapters reports truncation past 100', () => {
  const many = Array.from({ length: 101 }, () => validAdapter());
  const { valid, rejection_reasons } = partitionAdapters(many);
  assert.equal(valid.length, 100);
  assert.ok(rejection_reasons.some((r) => /truncated/.test(r)));
});

test('schema: avg_score out of range rejected; valid accepted', () => {
  assert.equal(pastorAdapterSchema.safeParse(validAdapter()).success, true);
  assert.equal(pastorAdapterSchema.safeParse(validAdapter({ avg_score: 2 })).success, false);
  assert.equal(pastorAdapterSchema.safeParse({ ...validAdapter(), content: 'x' }).success, false);
});

// ── handlePastorAdapters (handler) ─────────────────────────────────────
test('handlePastorAdapters rejects non-POST', async () => {
  const res = await handlePastorAdapters(req('GET'), { DB: fakeDb() });
  assert.equal(res.status, 405);
});

test('handlePastorAdapters accepts a valid batch → 202', async () => {
  const db = fakeDb();
  const res = await handlePastorAdapters(req('POST', { adapters: [validAdapter(), validAdapter()] }), { DB: db });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.accepted, 2);
  assert.equal(body.rejected, 0);
  assert.equal(db._state.rows.length, 2);
});

test('handlePastorAdapters with empty body → 422 validation (gate: POST {} → 422)', async () => {
  const res = await handlePastorAdapters(req('POST', {}), { DB: fakeDb() });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.isError, true);
});

test('handlePastorAdapters enforces the rate limit → 429', async () => {
  const res = await handlePastorAdapters(req('POST', { adapters: [validAdapter()] }), { DB: fakeDb({ recentCount: RATE_LIMIT_PER_HOUR }) });
  assert.equal(res.status, 429);
});

test('handlePastorAdapters never persists a content key (defence in depth)', async () => {
  const db = fakeDb();
  await handlePastorAdapters(req('POST', { adapters: [validAdapter(), { ...validAdapter(), response: 'leak' }] }), { DB: db });
  assert.equal(db._state.rows.length, 1);
});
