// Wave 28 (Phase H) — POST /v1/workflows ingestion.
//
// Layers:
//   · validateRun()       — pure; required fields + status whitelist + coercion
//   · handleWorkflows()   — handler behaviour against a labelled stub D1 boundary
//
// Per test-conventions.md the real D1 path is exercised by an E2E curl against
// deployed prod. This stub is a controlled boundary for branching + the upsert
// shape + response shape only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleWorkflows, validateRun } from '../workflows.js';

// ── A minimal D1 stub that records workflow_runs upserts keyed by run_id ───────
function fakeDb() {
  const state = { runs: new Map() };
  const stmt = (sql) => ({
    sql, _args: [],
    bind(...a) { this._args = a; return this; },
    async first() { return null; },
    async all() { return { results: [] }; },
    async run() {
      if (/INSERT INTO workflow_runs/.test(sql)) {
        const a = this._args; // see UPSERT_SQL bind order
        const run_id = a[0];
        const prev = state.runs.get(run_id) || {};
        // Emulate ON CONFLICT ... COALESCE upsert (new value wins unless null).
        const coalesce = (next, old) => (next === null || next === undefined ? old : next);
        state.runs.set(run_id, {
          run_id,
          device_id: a[1],
          workflow_name: coalesce(a[2], prev.workflow_name),
          ts_start: prev.ts_start ?? a[3],
          ts_end: coalesce(a[4], prev.ts_end),
          num_phases: coalesce(a[5], prev.num_phases),
          num_agents_total: coalesce(a[6], prev.num_agents_total),
          num_agents_local: coalesce(a[7], prev.num_agents_local),
          num_agents_cloud: coalesce(a[8], prev.num_agents_cloud),
          duration_ms: coalesce(a[9], prev.duration_ms),
          status: a[10],
          estimated_savings_usd: coalesce(a[11], prev.estimated_savings_usd),
          actual_cost_usd: coalesce(a[12], prev.actual_cost_usd),
          doctrine_violations: a[13],
          received_at: a[14],
        });
      }
      return {};
    },
  });
  return { _state: state, prepare: (sql) => stmt(sql) };
}

function req(method, body) {
  return { method, json: async () => body };
}
function validRun(over = {}) {
  return {
    run_id: 'run-abc',
    device_id: 'a1b2c3d4e5f6',
    workflow_name: 'audit-unused-exports',
    ts_start: 1717999200000,
    num_phases: 4,
    num_agents_total: 50,
    num_agents_local: 49,
    num_agents_cloud: 1,
    status: 'running',
    actual_cost_usd: 0,
    ...over,
  };
}

// ── validateRun (pure) ────────────────────────────────────────────────────────

test('validateRun: accepts a well-formed run', () => {
  const { run, error } = validateRun(validRun());
  assert.equal(error, undefined);
  assert.equal(run.run_id, 'run-abc');
  assert.equal(run.status, 'running');
  assert.equal(run.doctrine_violations, 0, 'defaults to 0');
});

test('validateRun: run_id and device_id are required', () => {
  assert.match(validateRun(validRun({ run_id: '' })).error, /run_id/);
  assert.match(validateRun(validRun({ device_id: undefined })).error, /device_id/);
});

test('validateRun: ts_start is required', () => {
  assert.match(validateRun(validRun({ ts_start: undefined })).error, /ts_start/);
});

test('validateRun: status must be in the whitelist', () => {
  assert.match(validateRun(validRun({ status: 'pwned' })).error, /status must be/);
  assert.equal(validateRun(validRun({ status: 'completed' })).error, undefined);
});

test('validateRun: rejects a non-object body', () => {
  assert.match(validateRun(null).error, /object/);
  assert.match(validateRun([1, 2]).error, /object/);
});

// ── handleWorkflows (handler) ─────────────────────────────────────────────────

test('handleWorkflows: non-POST → 405', async () => {
  const resp = await handleWorkflows(req('GET'), { DB: fakeDb() });
  assert.equal(resp.status, 405);
});

test('handleWorkflows: invalid JSON → 400', async () => {
  const bad = { method: 'POST', json: async () => { throw new Error('boom'); } };
  const resp = await handleWorkflows(bad, { DB: fakeDb() });
  assert.equal(resp.status, 400);
});

test('handleWorkflows: missing run_id → 400 structured error', async () => {
  const resp = await handleWorkflows(req('POST', validRun({ run_id: '' })), { DB: fakeDb() });
  assert.equal(resp.status, 400);
  const body = JSON.parse(await resp.text());
  assert.equal(body.isError, true);
  assert.equal(body.errorCategory, 'bad_request');
});

test('handleWorkflows: valid run → 202 + row persisted', async () => {
  const db = fakeDb();
  const resp = await handleWorkflows(req('POST', validRun()), { DB: db });
  assert.equal(resp.status, 202);
  const body = JSON.parse(await resp.text());
  assert.equal(body.ok, true);
  assert.equal(body.run_id, 'run-abc');
  assert.equal(body.status, 'running');
  const row = db._state.runs.get('run-abc');
  assert.ok(row, 'row persisted');
  assert.equal(row.num_agents_local, 49);
  assert.ok(row.received_at, 'received_at stamped');
});

test('handleWorkflows: idempotent upsert (running → completed)', async () => {
  const db = fakeDb();
  await handleWorkflows(req('POST', validRun({ status: 'running' })), { DB: db });
  await handleWorkflows(
    req('POST', validRun({ status: 'completed', ts_end: 1717999260000, actual_cost_usd: 0.012, estimated_savings_usd: 2.5 })),
    { DB: db },
  );
  const row = db._state.runs.get('run-abc');
  assert.equal(db._state.runs.size, 1, 'same run_id, no duplicate row');
  assert.equal(row.status, 'completed');
  assert.equal(row.ts_end, 1717999260000);
  assert.equal(row.actual_cost_usd, 0.012);
  assert.equal(row.workflow_name, 'audit-unused-exports', 'preserved via COALESCE');
});

test('handleWorkflows: DB failure → structured error', async () => {
  const db = { prepare: () => ({ bind() { return this; }, async run() { throw new Error('d1 down'); } }) };
  const resp = await handleWorkflows(req('POST', validRun()), { DB: db });
  assert.equal(JSON.parse(await resp.text()).isError, true);
  assert.ok(resp.status >= 500 || resp.status === 503);
});
