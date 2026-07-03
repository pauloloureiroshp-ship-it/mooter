// ledger-read.test.js — events → sessions: two clocks (DC-07), degenerate
// sessions excluded, blocker detection (DC-03), class bucketing (DC-01).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { sessionFromEvents, sessionsFromMap, bucketSessions } = require('./ledger-read.js');

const ISO = (min) => new Date(Date.UTC(2026, 6, 1, 10, 0, 0) + min * 60000).toISOString();

test('two clocks: WORK counts active bursts; WALL includes the idle wait (DC-07)', () => {
  const evs = [
    { ts: ISO(0), kind: 'intent', input: { q: 'constrói o cockpit engine feature' } },
    { ts: ISO(10), kind: 'turn', assistant_snippet: 'a trabalhar' },   // 10-min active gap
    { ts: ISO(130), kind: 'turn', assistant_snippet: 'de volta' },      // 2-h idle gap (human away)
  ];
  const s = sessionFromEvents('sess-1', evs);
  assert.equal(s.wall_ms, 130 * 60000, 'wall = last − first');
  assert.equal(s.work_ms, 10 * 60000, 'work = only the ≤30min active burst');
  assert.equal(s.awaiting_ms, 120 * 60000, 'the 2h gap is awaiting-you, not moos');
  assert.equal(s.class, 'feature_impl');
  assert.equal(s.valid, true);
});

test('degenerate sessions are excluded (no fabricated duration)', () => {
  const single = sessionFromEvents('a', [{ ts: ISO(0), kind: 'intent', input: { q: 'constrói x' } }]);
  assert.equal(single.valid, false, 'one event → not a duration sample');

  const zero = sessionFromEvents('b', [
    { ts: ISO(5), kind: 'intent', input: { q: 'constrói x' } },
    { ts: ISO(5), kind: 'outcome', output: { done: 'y' } }, // same ts (backfill) → wall 0
  ]);
  assert.equal(zero.wall_ms, 0);
  assert.equal(zero.valid, false, 'zero-second session describes nothing');
});

test('blocker cause detected from event text (DC-03), else none', () => {
  const oauth = sessionFromEvents('c', [
    { ts: ISO(0), kind: 'intent', input: { q: 'liga o adapter ao notion' } },
    { ts: ISO(20), kind: 'outcome', output: { done: 'falhou: oauth token expired, re-auth' } },
  ]);
  assert.equal(oauth.blocker_cause, 'oauth');
  const clean = sessionFromEvents('d', [
    { ts: ISO(0), kind: 'intent', input: { q: 'constrói a aba' } },
    { ts: ISO(20), kind: 'outcome', output: { done: 'feito' } },
  ]);
  assert.equal(clean.blocker_cause, 'none');
});

test('work_signal counts substantive artefacts, not turns (DC-08/09/10)', () => {
  const s = sessionFromEvents('e', [
    { ts: ISO(0), kind: 'intent', input: { q: 'constrói o engine' } },
    { ts: ISO(15), assistant_snippet: 'edit', tools: [
      { name: 'Edit', target: 'router.js' },
      { name: 'Write', target: 'notes.md' },       // MD → not substantive
      { name: 'Bash', target: 'node forecast.test.js' },
    ] },
  ]);
  assert.ok(s.work_signal >= 1, 'non-MD edit + test counted: ' + s.work_signal);
});

test('bucketSessions groups only valid sessions by class×mode', () => {
  const map = {
    s1: [{ ts: ISO(0), kind: 'intent', input: { q: 'constrói o cockpit' } }, { ts: ISO(20), kind: 'turn', assistant_snippet: 'x' }],
    s2: [{ ts: ISO(0), kind: 'intent', input: { q: 'auditoria e2e' } }, { ts: ISO(25), kind: 'turn', assistant_snippet: 'y' }],
    s3: [{ ts: ISO(0), kind: 'intent', input: { q: 'pergunta solta sem trabalho' } }], // 1 event → invalid
  };
  const sessions = sessionsFromMap(map);
  const buckets = bucketSessions(sessions);
  assert.ok(buckets['feature_impl::CC'] && buckets['feature_impl::CC'].length === 1);
  assert.ok(buckets['audit::CC'] && buckets['audit::CC'].length === 1);
  const total = Object.values(buckets).reduce((n, arr) => n + arr.length, 0);
  assert.equal(total, 2, 'the invalid single-event session is not bucketed');
});
