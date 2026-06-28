// Frente F — /v1/live-sessions cross-machine mirror.
//
// Layers (mirrors sync_events.test.js conventions):
//   · shapeDevice()           — pure: stored row → wire object + HONEST offline calc.
//   · liveSessionStateSchema  — real Zod schema (accept valid, reject privacy taint).
//   · handleLiveSessions()    — handler behaviour against a LABELLED stub D1 boundary.
//
// The real D1 path is exercised by the human smoke (gate #3) against deployed
// prod; this stub is a controlled boundary for branching + response shape only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleLiveSessions, shapeDevice, LIVE_SESSION_STALE_MIN } from '../live_sessions.js';
import { liveSessionStateSchema } from '../../lib/schemas.js';

// ── A minimal, faithful-enough D1 stub for live_session_state ───────────
function fakeDb() {
  const state = { rows: [] }; // one row per device_id (latest wins)
  const stmt = (sql) => ({
    sql, _args: [],
    bind(...a) { this._args = a; return this; },
    async first() {
      if (/COUNT\(\*\) as cnt FROM live_session_state/.test(sql)) {
        const [deviceId, cutoff] = this._args;
        const n = state.rows.filter((r) => r.device_id === deviceId && r.updated_at > cutoff).length;
        return { cnt: n };
      }
      return null;
    },
    async all() {
      if (/FROM live_session_state/.test(sql)) {
        const [owner, exclude, limit] = this._args;
        const results = state.rows
          .filter((r) => r.owner_hash === owner && r.device_id !== exclude)
          .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
          .slice(0, limit);
        return { results };
      }
      return { results: [] };
    },
    async run() {
      if (/INSERT INTO live_session_state/.test(sql)) {
        // bind order: device_id, owner_hash, os_type, device_label, payload, updated_at
        const [device_id, owner_hash, os_type, device_label, payload, updated_at] = this._args;
        const existing = state.rows.find((r) => r.device_id === device_id);
        const row = { device_id, owner_hash, os_type, device_label, payload, updated_at };
        if (existing) Object.assign(existing, row); else state.rows.push(row);
      }
      return {};
    },
  });
  return { _state: state, prepare: (sql) => stmt(sql) };
}

function req(method, body, urlQuery) {
  return {
    method,
    url: 'https://hub.example/v1/live-sessions' + (urlQuery ? `?${urlQuery}` : ''),
    json: async () => body,
  };
}

const OWNER = 'a1b2c3d4e5f6a1b2';
const DEV_A = 'deadbeefdeadbeef';
const DEV_B = 'cafebabecafebabe';

function validState(over = {}) {
  return {
    device_id: DEV_A,
    owner_hash: OWNER,
    os_type: 'windows',
    device_label: 'PC do escritório',
    sessions: [{ sid: 'sess-1', name: 'wiring the bridge', model: 'opus', tier: 'T3', branch: 'feat/x', status: 'working' }],
    handoff: '⇄ MOO HANDOFF · …',
    at: '2026-06-28T10:00:00.000Z',
    ...over,
  };
}

// ── schema ─────────────────────────────────────────────────────────────

test('liveSessionStateSchema: accepts a valid state', () => {
  assert.equal(liveSessionStateSchema.safeParse(validState()).success, true);
});

test('liveSessionStateSchema: rejects a privacy field (prompt text never leaves the box)', () => {
  const r = liveSessionStateSchema.safeParse(validState({ prompt_text: 'rm -rf /' }));
  assert.equal(r.success, false);
});

test('liveSessionStateSchema: rejects a privacy field nested in a session row', () => {
  const r = liveSessionStateSchema.safeParse(validState({
    sessions: [{ sid: 's', name: 'ok', content: 'leak of the actual prompt' }],
  }));
  assert.equal(r.success, false);
});

test('liveSessionStateSchema: rejects a malformed owner_hash', () => {
  const r = liveSessionStateSchema.safeParse(validState({ owner_hash: 'NOT-HEX!!' }));
  assert.equal(r.success, false);
});

// ── shapeDevice (pure, honest offline) ─────────────────────────────────

test('shapeDevice: fresh row → online, offlineForMin 0', () => {
  const now = 1_780_000_000_000;
  const d = shapeDevice(
    { device_id: DEV_B, os_type: 'macos', device_label: 'Mac', updated_at: new Date(now - 30_000).toISOString(), payload: JSON.stringify({ sessions: [{ sid: 'x' }], handoff: 'h' }) },
    now, LIVE_SESSION_STALE_MIN,
  );
  assert.equal(d.online, true);
  assert.equal(d.offlineForMin, 0);
  assert.equal(d.handoff, 'h');
  assert.equal(d.sessions.length, 1);
});

test('shapeDevice: stale row → offline with honest minutes', () => {
  const now = 1_780_000_000_000;
  const d = shapeDevice(
    { device_id: DEV_B, os_type: 'macos', updated_at: new Date(now - 12 * 60_000).toISOString(), payload: '{}' },
    now, LIVE_SESSION_STALE_MIN,
  );
  assert.equal(d.online, false);
  assert.equal(d.offlineForMin, 12);
});

test('shapeDevice: unparsable payload → empty sessions, never throws', () => {
  const d = shapeDevice({ device_id: DEV_B, updated_at: 'not-a-date', payload: 'NOT JSON' }, Date.now(), 5);
  assert.deepEqual(d.sessions, []);
  assert.equal(d.handoff, null);
  assert.equal(d.offlineForMin, null);
  assert.equal(d.online, false);
});

// ── handler ────────────────────────────────────────────────────────────

test('handleLiveSessions: PUT → 405', async () => {
  const res = await handleLiveSessions(req('PUT'), { DB: fakeDb() });
  assert.equal(res.status, 405);
});

test('handleLiveSessions: POST valid → 202, persisted', async () => {
  const db = fakeDb();
  const res = await handleLiveSessions(req('POST', validState()), { DB: db });
  assert.equal(res.status, 202);
  assert.equal((await res.json()).ok, true);
  assert.equal(db._state.rows.length, 1);
});

test('handleLiveSessions: POST privacy-tainted → 422, not persisted', async () => {
  const db = fakeDb();
  const res = await handleLiveSessions(req('POST', validState({ prompt: 'leak' })), { DB: db });
  assert.equal(res.status, 422);
  assert.equal(db._state.rows.length, 0);
});

test('handleLiveSessions: GET without owner → 400', async () => {
  const res = await handleLiveSessions(req('GET', null, 'self=' + DEV_A), { DB: fakeDb() });
  assert.equal(res.status, 400);
});

test('handleLiveSessions: GET returns the OTHER device, never self', async () => {
  const db = fakeDb();
  await handleLiveSessions(req('POST', validState({ device_id: DEV_A })), { DB: db });
  await handleLiveSessions(req('POST', validState({ device_id: DEV_B, os_type: 'macos', device_label: 'Mac' })), { DB: db });

  const res = await handleLiveSessions(req('GET', null, `owner=${OWNER}&self=${DEV_A}`), { DB: db });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.devices.length, 1, 'only the other device, self excluded');
  assert.equal(body.devices[0].device_id, DEV_B);
  assert.equal(body.devices[0].os_type, 'macos');
  assert.equal(body.stale_min, LIVE_SESSION_STALE_MIN);
});

test('handleLiveSessions: GET scoped to owner — a different owner sees nothing', async () => {
  const db = fakeDb();
  await handleLiveSessions(req('POST', validState({ device_id: DEV_A, owner_hash: OWNER })), { DB: db });
  const res = await handleLiveSessions(req('GET', null, `owner=ffffffffffffffff&self=zzz`), { DB: db });
  const body = await res.json();
  assert.equal(body.devices.length, 0);
});
