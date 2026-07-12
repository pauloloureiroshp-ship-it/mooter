'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const stamp = require('./stamp.js');

const EVENT = { kind: 'outcome', ts: 1720000000000, agent: 'gsd-executor', model: 'opus', tier: 'T3', gate: 'pass', cost_usd: 0.12, idem_key: 'abc123', input: 'SECRET PROMPT', output: 'SECRET REPLY', sid: 'sess-xyz' };

test('every outbound payload carries the unidirectional watermark', () => {
  const p = stamp.stampOutbound(EVENT, { tool: 'notion', at: 'T' });
  assert.equal(p.source, 'mooter-ledger');
  assert.equal(typeof p.ledger_event_id, 'string');
  assert.equal(p.tool, 'notion');
  assert.ok(stamp.isStamped(p));
});

test('verbatim input/output NEVER leave the machine (privacy)', () => {
  const p = stamp.stampOutbound(EVENT, { tool: 'notion' });
  const flat = JSON.stringify(p);
  assert.ok(!('input' in p) && !('output' in p));
  assert.ok(!flat.includes('SECRET PROMPT'));
  assert.ok(!flat.includes('SECRET REPLY'));
  // but the useful projection survives
  assert.equal(p.summary.tier, 'T3');
  assert.equal(p.summary.gate, 'pass');
});

test('ledger_event_id is deterministic for the same event', () => {
  assert.equal(stamp.ledgerEventId(EVENT), stamp.ledgerEventId(EVENT));
});

test('ledger_event_id differs when the event differs', () => {
  const a = stamp.ledgerEventId(EVENT);
  const b = stamp.ledgerEventId({ ...EVENT, idem_key: 'different' });
  assert.notEqual(a, b);
});

test('a malformed event still produces a stamped payload (never throws)', () => {
  const p = stamp.stampOutbound(null, { tool: 'slack' });
  assert.ok(stamp.isStamped(p));
  assert.equal(p.summary.kind, null);
});
