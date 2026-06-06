// Wave 26 (26.A/B/D) — /v1/events ingestion + pull-based Pastor.
//
// Layers:
//   · computePastor()      — pure, fully unit-tested (threshold + each hint branch)
//   · syncWindowSchema     — real Zod schema (accept valid, reject privacy/bad id)
//   · handleSyncEvents()   — handler behaviour against a LABELLED stub D1 boundary.
//
// Per test-conventions.md the real D1 path is exercised by the 26.F E2E script
// against deployed prod (no miniflare harness is wired in hub/). This stub is a
// controlled boundary for the handler's branching + response shape only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleSyncEvents, computePastor, PASTOR_MIN_DECISIONS } from '../sync_events.js';
import { syncWindowSchema } from '../../lib/schemas.js';

// ── A minimal, faithful-enough D1 stub ─────────────────────────────────
// Records sync_events INSERTs and answers the COUNT / SUM / pastor queries the
// handler actually issues. Statement arg order mirrors bindSyncEventInsert.
function fakeDb() {
  const state = { rows: [], pastor: {} };
  const stmt = (sql) => ({
    sql, _args: [],
    bind(...a) { this._args = a; return this; },
    async first() {
      if (/COUNT\(\*\)/.test(sql)) return { cnt: state.rows.filter((r) => r.client_id === this._args[0]).length };
      if (/SUM\(t0\)/.test(sql)) {
        const cid = this._args[0];
        const rs = state.rows.filter((r) => r.client_id === cid);
        return {
          T0: rs.reduce((s, r) => s + r.t0, 0), T1: rs.reduce((s, r) => s + r.t1, 0),
          T2: rs.reduce((s, r) => s + r.t2, 0), T3: rs.reduce((s, r) => s + r.t3, 0),
        };
      }
      if (/FROM pastor_state/.test(sql)) return state.pastor[this._args[0]] || null;
      return null;
    },
    async all() { return { results: [] }; },
    async run() {
      if (/INSERT OR IGNORE INTO sync_events/.test(sql)) {
        const a = this._args; // 0 event_id,1 client_id,...,6 t0,7 t1,8 t2,9 t3
        if (!state.rows.some((r) => r.event_id === a[0])) {
          state.rows.push({ event_id: a[0], client_id: a[1], t0: a[6], t1: a[7], t2: a[8], t3: a[9] });
        }
      } else if (/pastor_state/.test(sql)) {
        const a = this._args;
        state.pastor[a[0]] = { client_id: a[0], total_decisions: a[1], ollama_available: a[6], hint: a[7] };
      }
      return {};
    },
  });
  return {
    _state: state,
    prepare: (sql) => stmt(sql),
    async batch(stmts) { for (const s of stmts) await s.run(); return []; },
  };
}

function req(method, body) {
  return { method, json: async () => body };
}
function validWindow(over = {}) {
  return {
    schema_version: 1,
    event_id: 'evt-' + Math.random().toString(16).slice(2),
    client_id_pseudonymous: 'a1b2c3d4e5f6',
    emitted_at_utc: '2026-06-06T00:00:00.000Z',
    tier_distribution: { counts: { T0: 5, T1: 1, T2: 0, T3: 0 }, avg_confidence: 0.8 },
    hardware_info: { os: 'linux', gpu_class: 'discrete', ram_class: 'high', ollama_available: true },
    ...over,
  };
}

// ── computePastor (pure) ───────────────────────────────────────────────

test('computePastor: below threshold → no hint', () => {
  const p = computePastor({ T0: 5, T1: 2, T2: 1, T3: 0 }, true); // 8 < 20
  assert.equal(p.total_decisions, 8);
  assert.equal(p.hint, null);
});

test('computePastor: no Ollama + low T0 → install_ollama', () => {
  const p = computePastor({ T0: 1, T1: 10, T2: 10, T3: 4 }, false); // 25, t0=0.04
  assert.equal(p.hint.code, 'install_ollama');
});

test('computePastor: heavy T3 with Ollama → high_t3', () => {
  const p = computePastor({ T0: 10, T1: 0, T2: 0, T3: 15 }, true); // 25, t3=0.6
  assert.equal(p.hint.code, 'high_t3');
});

test('computePastor: balanced mix → balanced', () => {
  const p = computePastor({ T0: 18, T1: 2, T2: 1, T3: 1 }, true); // 22, t0 high, t3 low
  assert.equal(p.hint.code, 'balanced');
});

test('PASTOR_MIN_DECISIONS is the documented 20', () => {
  assert.equal(PASTOR_MIN_DECISIONS, 20);
});

// ── schema ─────────────────────────────────────────────────────────────

test('syncWindowSchema: accepts a valid window', () => {
  assert.equal(syncWindowSchema.safeParse(validWindow()).success, true);
});

test('syncWindowSchema: rejects a privacy field (prompt text never leaves the box)', () => {
  const r = syncWindowSchema.safeParse(validWindow({ prompt_content: 'rm -rf /' }));
  assert.equal(r.success, false);
});

test('syncWindowSchema: rejects a malformed client id', () => {
  const r = syncWindowSchema.safeParse(validWindow({ client_id_pseudonymous: 'NOT-HEX!!' }));
  assert.equal(r.success, false);
});

// ── handler ────────────────────────────────────────────────────────────

test('handleSyncEvents: GET → 405 (brief 26.C smoke)', async () => {
  const res = await handleSyncEvents(req('GET'), { DB: fakeDb() });
  assert.equal(res.status, 405);
});

test('handleSyncEvents: empty batch → 400', async () => {
  const res = await handleSyncEvents(req('POST', { events: [] }), { DB: fakeDb() });
  assert.equal(res.status, 400);
});

test('handleSyncEvents: valid { events: [...] } → 202 accepted, persisted', async () => {
  const db = fakeDb();
  const res = await handleSyncEvents(req('POST', { events: [validWindow()] }), { DB: db });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.accepted, 1);
  assert.equal(body.rejected, 0);
  assert.equal(db._state.rows.length, 1, 'row persisted');
});

test('handleSyncEvents: bare array also accepted', async () => {
  const db = fakeDb();
  const res = await handleSyncEvents(req('POST', [validWindow()]), { DB: db });
  assert.equal(res.status, 202);
  assert.equal((await res.json()).accepted, 1);
});

test('handleSyncEvents: privacy-tainted window is rejected, clean one accepted', async () => {
  const db = fakeDb();
  const res = await handleSyncEvents(
    req('POST', { events: [validWindow(), validWindow({ prompt: 'leak' })] }), { DB: db });
  const body = await res.json();
  assert.equal(body.accepted, 1);
  assert.equal(body.rejected, 1);
});

test('handleSyncEvents: pastor_hint returned once a client crosses the threshold', async () => {
  const db = fakeDb();
  // One window with 26 T3 decisions, no Ollama → high_t3 hint (>= 20 threshold).
  const w = validWindow({
    tier_distribution: { counts: { T0: 2, T1: 0, T2: 0, T3: 24 }, avg_confidence: 0.7 },
    hardware_info: { os: 'linux', ollama_available: true },
  });
  const res = await handleSyncEvents(req('POST', { events: [w] }), { DB: db });
  const body = await res.json();
  assert.equal(res.status, 202);
  assert.ok(body.pastor_hint, 'hint present above threshold');
  assert.equal(body.pastor_hint.code, 'high_t3');
});

test('handleSyncEvents: small window → no hint yet (below threshold)', async () => {
  const db = fakeDb();
  const res = await handleSyncEvents(req('POST', { events: [validWindow()] }), { DB: db }); // 6 decisions
  const body = await res.json();
  assert.equal(body.pastor_hint, null);
});
