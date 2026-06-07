// Wave 29 (29.K) — /v1/federated skeleton + device_setup_profiles upsert.
//
//   · applyKAnonymity()  — pure, the k≥50 suppression gate
//   · handleFederated()  — GET cohort (gated), POST setup_profile upsert, POST {} deferred.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleFederated, applyKAnonymity, K_ANONYMITY_MIN } from '../federated.js';
import { deviceSetupProfileSchema } from '../../lib/schemas.js';

function fakeDb(opts = {}) {
  const state = { profiles: [], devices: opts.devices ?? 0, by: opts.by ?? {} };
  const stmt = (sql) => ({
    sql, _args: [],
    bind(...a) { this._args = a; return this; },
    async first() {
      if (/COUNT\(DISTINCT device_id\)/.test(sql)) return { devices: state.devices };
      return null;
    },
    async all() {
      if (/GROUP BY hardware_class/.test(sql)) return { results: Object.entries(state.by).map(([hardware_class, n]) => ({ hardware_class, n })) };
      return { results: [] };
    },
    async run() {
      if (/INSERT INTO device_setup_profiles/.test(sql)) {
        state.profiles.push({ device_id: this._args[0], hardware_class: this._args[1] });
        state.devices = state.profiles.length;
      }
      return {};
    },
  });
  return { _state: state, prepare: (sql) => stmt(sql) };
}
function req(method, body) {
  return { method, json: async () => body };
}
function validProfile(over = {}) {
  return { device_id: 'a1b2c3d4e5f6', hardware_class: 'nvidia-rtx-4090', vram_gb: 24, has_npu: 0, os_class: 'wsl2', ollama_models_count: 8, subscription_tier: 'claude-max', ...over };
}

// ── applyKAnonymity (pure) ─────────────────────────────────────────────
test('applyKAnonymity suppresses cohorts below the minimum', () => {
  const r = applyKAnonymity({ devices: 49, by_hardware_class: { 'apple-silicon': 49 } });
  assert.equal(r.suppressed, true);
  assert.equal(r.aggregate, null);
  assert.equal(r.k_anonymity_min, K_ANONYMITY_MIN);
});

test('applyKAnonymity exposes cohorts at/above the minimum', () => {
  const r = applyKAnonymity({ devices: 60, by_hardware_class: { 'apple-silicon': 60 } });
  assert.equal(r.suppressed, false);
  assert.deepEqual(r.aggregate.by_hardware_class, { 'apple-silicon': 60 });
});

// ── deviceSetupProfileSchema ───────────────────────────────────────────
test('setup profile schema rejects content + bad device_id', () => {
  assert.equal(deviceSetupProfileSchema.safeParse(validProfile()).success, true);
  assert.equal(deviceSetupProfileSchema.safeParse(validProfile({ device_id: 'NOPE' })).success, false);
  assert.equal(deviceSetupProfileSchema.safeParse({ ...validProfile(), prompt_text: 'x' }).success, false);
});

// ── handleFederated ────────────────────────────────────────────────────
test('GET returns a k-anonymity-gated cohort (suppressed when small)', async () => {
  const res = await handleFederated(req('GET'), { DB: fakeDb({ devices: 3, by: { 'apple-silicon': 3 } }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.suppressed, true);
  assert.equal(body.cohort_size, 3);
});

test('GET exposes aggregate when cohort ≥ 50', async () => {
  const res = await handleFederated(req('GET'), { DB: fakeDb({ devices: 80, by: { 'apple-silicon': 50, 'cpu-only': 30 } }) });
  const body = await res.json();
  assert.equal(body.suppressed, false);
  assert.equal(body.aggregate.by_hardware_class['apple-silicon'], 50);
});

test('POST setup_profile upserts → 202 stored', async () => {
  const db = fakeDb();
  const res = await handleFederated(req('POST', { setup_profile: validProfile() }), { DB: db });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.stored, true);
  assert.equal(db._state.profiles.length, 1);
});

test('POST without setup_profile → 202 deferred (nothing stored)', async () => {
  const db = fakeDb();
  const res = await handleFederated(req('POST', {}), { DB: db });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.stored, false);
  assert.equal(db._state.profiles.length, 0);
});

test('POST invalid setup_profile → 422', async () => {
  const res = await handleFederated(req('POST', { setup_profile: { device_id: 'NOPE' } }), { DB: fakeDb() });
  assert.equal(res.status, 422);
});
