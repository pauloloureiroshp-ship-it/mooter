// Wave 32 — /v1/transparency + /v1/forget-me. Pure validators + handler behaviour
// against a labelled D1 stub (mirrors pastor-adapters.test.js conventions).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  handleTransparency,
  handleForgetMe,
  validateTransparencyEvent,
  validateForgetMe,
} from '../transparency.js';

function fakeDb() {
  const state = { transparency: [], forget: [] };
  const stmt = (sql) => ({
    sql, _args: [],
    bind(...a) { this._args = a; return this; },
    async run() {
      if (/INTO transparency_events/.test(sql)) state.transparency.push(this._args);
      if (/INTO forget_me_requests/.test(sql)) state.forget.push(this._args);
      return {};
    },
    async first() { return null; },
  });
  return { _state: state, prepare: (sql) => stmt(sql) };
}

function req(method, body) {
  return { method, json: async () => body };
}

// ── validators ───────────────────────────────────────────────────────────────
test('validateTransparencyEvent accepts a feature-only event', () => {
  const r = validateTransparencyEvent({ event_id: 'e1', device_id: 'd1', ts: 1, event_type: 'effort_change', metadata: { mode: 'ultramoo' } });
  assert.ok(r.ok);
  assert.equal(r.value.metadata, JSON.stringify({ mode: 'ultramoo' }));
});

test('validateTransparencyEvent rejects content-like metadata keys', () => {
  const r = validateTransparencyEvent({ event_id: 'e', device_id: 'd', ts: 1, metadata: { prompt: 'secret' } });
  assert.equal(r.ok, false);
  assert.match(r.error, /content/);
});

test('validateTransparencyEvent rejects bad event_type + missing fields', () => {
  assert.equal(validateTransparencyEvent({ event_id: 'e', device_id: 'd', ts: 1, event_type: 'lol' }).ok, false);
  assert.equal(validateTransparencyEvent({ device_id: 'd', ts: 1 }).ok, false);
});

test('validateForgetMe requires device_id + ts', () => {
  assert.ok(validateForgetMe({ device_id: 'd', ts: 1, signature: 'sig' }).ok);
  assert.equal(validateForgetMe({ ts: 1 }).ok, false);
});

// ── handlers ─────────────────────────────────────────────────────────────────
test('POST /v1/transparency accepts valid events (202) and inserts', async () => {
  const db = fakeDb();
  const res = await handleTransparency(req('POST', { events: [{ event_id: 'e1', device_id: 'd1', ts: 1, event_type: 'dashboard_open' }] }), { DB: db });
  assert.equal(res.status, 202);
  const j = JSON.parse(await res.text());
  assert.equal(j.accepted, 1);
  assert.equal(db._state.transparency.length, 1);
});

test('POST /v1/transparency rejects all-invalid batch with validation error', async () => {
  const res = await handleTransparency(req('POST', { events: [{ ts: 1 }] }), { DB: fakeDb() });
  assert.equal(res.status >= 400 && res.status < 500, true);
});

test('GET /v1/transparency is method_not_allowed', async () => {
  const res = await handleTransparency(req('GET'), { DB: fakeDb() });
  assert.equal(res.status >= 400, true);
});

test('POST /v1/forget-me queues an erasure (202)', async () => {
  const db = fakeDb();
  const res = await handleForgetMe(req('POST', { device_id: 'd1', ts: 100, signature: 'abc' }), { DB: db });
  assert.equal(res.status, 202);
  const j = JSON.parse(await res.text());
  assert.equal(j.status, 'queued');
  assert.equal(db._state.forget.length, 1);
});
