'use strict';

// Wave 60 Block B — session-affinity. node:test + assert/strict.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const aff = require('./session-affinity.js');
const { getEstablished, recordModel, affinityNote, hasStrongReason, STALE_MS } = aff;

function withTempHome(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-'));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = tmp;
  try { return fn(tmp); } finally {
    if (prev === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
  }
}

// ── record / get round-trip ──────────────────────────────────────────────────
test('getEstablished: null when no state', () => {
  withTempHome(() => assert.equal(getEstablished('sess-none'), null));
});

test('recordModel → getEstablished round-trips model + tier', () => {
  withTempHome(() => {
    recordModel('sess-1', 'claude-opus-4-7', 'T3');
    assert.deepEqual(getEstablished('sess-1'), { model: 'claude-opus-4-7', tier: 'T3' });
  });
});

test('getEstablished: null when stale (older than the window)', () => {
  withTempHome(() => {
    const now = 1_000_000_000_000;
    recordModel('sess-stale', 'claude-haiku-4-5', 'T1', now - STALE_MS - 1);
    assert.equal(getEstablished('sess-stale', now), null);
    recordModel('sess-fresh', 'claude-haiku-4-5', 'T1', now - STALE_MS + 1);
    assert.deepEqual(getEstablished('sess-fresh', now), { model: 'claude-haiku-4-5', tier: 'T1' });
  });
});

test('recordModel: path-traversal in session id is neutralized', () => {
  withTempHome((tmp) => {
    recordModel('../../evil', 'claude-haiku-4-5', 'T1');
    // the only file written stays inside the affinity dir
    const dir = path.join(tmp, 'session-affinity');
    const files = fs.readdirSync(dir);
    assert.equal(files.length, 1);
    assert.ok(!files[0].includes('/') && !files[0].includes('\\'));
  });
});

// ── hasStrongReason ──────────────────────────────────────────────────────────
test('hasStrongReason: true for high-risk / safety-floor / beast / override', () => {
  assert.equal(hasStrongReason({ risk_level: 'high' }), true);
  assert.equal(hasStrongReason({ safety_boost_applied: true }), true);
  assert.equal(hasStrongReason({ escalation_rule: 'x+safety_floor' }), true);
  assert.equal(hasStrongReason({ escalation_rule: 'beast_mode' }), true);
  assert.equal(hasStrongReason({ active_mode: 'beast' }), true);
  assert.equal(hasStrongReason({ user_override: { honored: true } }), true);
});

test('hasStrongReason: false for an ordinary low/medium decision', () => {
  assert.equal(hasStrongReason({ risk_level: 'low', escalation_rule: 'none' }), false);
});

// ── affinityNote (pure) ──────────────────────────────────────────────────────
const estOpus = { model: 'claude-opus-4-7', tier: 'T3' };

test('affinityNote: null when no established model', () => {
  assert.equal(affinityNote(null, { recommended_model: 'claude-haiku-4-5', tier: 'T1' }), null);
});

test('affinityNote: null when the model is already continuous', () => {
  assert.equal(affinityNote(estOpus, { recommended_model: 'claude-opus-4-7', tier: 'T3' }), null);
});

test('affinityNote: null when there is a strong reason (high-risk)', () => {
  assert.equal(
    affinityNote(estOpus, { recommended_model: 'claude-haiku-4-5', tier: 'T1', risk_level: 'high' }),
    null,
  );
});

test('affinityNote: null on a big tier jump (>=2 rungs — really needed)', () => {
  // T3 established, fresh T1 = 2 rungs apart → no note
  assert.equal(
    affinityNote(estOpus, { recommended_model: 'claude-haiku-4-5', tier: 'T1', risk_level: 'low' }),
    null,
  );
});

test('affinityNote: returns a note on a weak adjacent switch', () => {
  // T3 established, fresh T2 (1 rung), low risk → surface the affinity note
  const note = affinityNote(estOpus, { recommended_model: 'claude-sonnet-4-6', tier: 'T2', risk_level: 'low', escalation_rule: 'none' });
  assert.ok(note && note.includes('<session-affinity>'), 'emits a session-affinity note');
  assert.ok(note.includes('claude-opus-4-7') && note.includes('claude-sonnet-4-6'), 'names both models');
  assert.ok(note.includes('Advisory'), 'is explicitly advisory');
});
