// Wave 30 (Phase O) — /v1/wave-status: validate + handler.
//
//   · validateWaveEvent() — pure normaliser (positive wave_number required)
//   · handleWaveStatus()   — POST 202 / 422, GET latest shipped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWaveEvent, handleWaveStatus } from '../wave-status.js';

function fakeDb() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return {
        _args: [],
        bind(...a) {
          this._args = a;
          return this;
        },
        async run() {
          rows.push(this._args);
          return { success: true };
        },
        async first() {
          return rows.length ? { wave_number: 30, status: 'shipped' } : null;
        },
      };
    },
  };
}

function post(body) {
  return new Request('https://hub/v1/wave-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('validateWaveEvent requires a positive wave_number', () => {
  assert.equal(validateWaveEvent(null).ok, false);
  assert.equal(validateWaveEvent({}).ok, false);
  assert.equal(validateWaveEvent({ wave_number: 0 }).ok, false);
  assert.equal(validateWaveEvent({ wave_number: -3 }).ok, false);
  assert.equal(validateWaveEvent({ wave_number: 30 }).ok, true);
});

test('validateWaveEvent normalises status + truncates strings + defaults device', () => {
  const v = validateWaveEvent({ wave_number: 30, phase: 'O', done: 14, total: 15, tag: 'v1.18.0', status: 'bogus' });
  assert.equal(v.ok, true);
  assert.equal(v.event.status, 'in_progress'); // unknown status → in_progress
  assert.equal(v.event.device_id, 'anonymous');
  assert.equal(v.event.phase, 'O');
  assert.equal(v.event.done, 14);
  const shipped = validateWaveEvent({ wave_number: 30, status: 'shipped' });
  assert.equal(shipped.event.status, 'shipped');
});

test('handleWaveStatus POST valid → 202 and inserts', async () => {
  const db = fakeDb();
  const res = await handleWaveStatus(post({ wave_number: 30, phase: 'O', status: 'shipped', tag: 'v1.18.0-mega' }), { DB: db });
  assert.equal(res.status, 202);
  const json = await res.json();
  assert.equal(json.accepted, true);
  assert.equal(db.rows.length, 1);
});

test('handleWaveStatus POST invalid → 422', async () => {
  const res = await handleWaveStatus(post({ phase: 'O' }), { DB: fakeDb() });
  assert.equal(res.status, 422);
});

test('handleWaveStatus GET → latest', async () => {
  const db = fakeDb();
  await handleWaveStatus(post({ wave_number: 30, status: 'shipped' }), { DB: db });
  const res = await handleWaveStatus(new Request('https://hub/v1/wave-status', { method: 'GET' }), { DB: db });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.latest.wave_number, 30);
});
