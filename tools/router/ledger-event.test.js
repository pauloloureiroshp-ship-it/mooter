// ledger-event.test.js — Ledger Spine L0: appendEvent provenance + idempotency.
// Proves: events get mechanical hashes; idem_key dedupes; events coexist with
// legacy turn entries without breaking either; and the writer never throws on fs
// failure (degrades). appendTurn output stays byte-identical (back-compat).
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { canonicalize } = require('./ledger-prov.js');

let HOME;
before(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-ledger-evt-'));
  process.env.MOOTER_HOME = HOME;
});
after(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} delete process.env.MOOTER_HOME; });

function fresh() { delete require.cache[require.resolve('./handoff-journal.js')]; return require('./handoff-journal.js'); }

test('appendEvent stamps ts + mechanical input/output hashes; readEvents reads it back', () => {
  const j = fresh();
  const sid = 'evt-a';
  const r = j.appendEvent({
    sid, agent: 'moo-summarizer', model: 'qwen3:30b', tier: 'T0', kind: 'summary',
    input: { text: 'long file body' }, output: { summary: 'short' },
  });
  assert.deepEqual(r, { ok: true, deduped: false });
  const evs = j.readEvents(sid);
  assert.equal(evs.length, 1);
  const e = evs[0];
  assert.equal(e.kind, 'summary');
  assert.equal(e.agent, 'moo-summarizer');
  assert.equal(e.tier, 'T0');
  assert.ok(/\d{4}-\d{2}-\d{2}T/.test(e.ts), 'ts stamped ISO');
  // Hash is mechanical: matches a fresh sha-256 over the canonical payload.
  const crypto = require('crypto');
  const expectIn = crypto.createHash('sha256').update(canonicalize({ text: 'long file body' }), 'utf8').digest('hex');
  assert.equal(e.input_hash, expectIn, 'input_hash stamped by the runner, not the caller');
  assert.match(e.output_hash, /^[0-9a-f]{64}$/);
});

test('appendEvent is idempotent on idem_key — two appends → one effective entry', () => {
  const j = fresh();
  const sid = 'evt-idem';
  const ev = { sid, agent: 'cc', kind: 'decision', idem_key: 'dec-42', output: { chosen: 'A' } };
  const r1 = j.appendEvent(ev);
  const r2 = j.appendEvent(ev); // same idem_key
  assert.equal(r1.deduped, false);
  assert.equal(r2.deduped, true, 'second append deduped');
  assert.equal(j.readEvents(sid, 'decision').length, 1, 'only one effective entry');
});

test('events and legacy turn entries coexist in one journal without interference', () => {
  const j = fresh();
  const sid = 'evt-mix';
  j.appendTurn(sid, { assistant_snippet: 'doing work', n_turn: 1 });
  j.appendEvent({ sid, kind: 'handoff', agent: 'cc', output: { markdown: '# handoff' } });
  j.appendTurn(sid, { assistant_snippet: 'more work', n_turn: 2 });
  // readJournal sees all 3 raw lines; readEvents sees only the 1 with a kind.
  assert.equal(j.readJournal(sid).length, 3);
  assert.equal(j.readEvents(sid).length, 1);
  // The legacy reader path (lastEntry) still returns a turn-shaped entry.
  const last = j.lastEntry(sid);
  assert.equal(last.assistant_snippet, 'more work');
  assert.equal(last.n_turn, 2);
  // lastEventOfKind locates the handoff regardless of the surrounding turns.
  assert.equal(j.lastEventOfKind(sid, 'handoff').output.markdown, '# handoff');
});

test('appendTurn output is byte-identical to the pre-ledger format (back-compat)', () => {
  const j = fresh();
  const sid = 'evt-bc';
  j.appendTurn(sid, {
    ts: '2026-06-30T00:00:00.000Z',
    assistant_snippet: 'wiring  the  spine', tools: [{ name: 'Edit', target: 'a.js' }],
    git: { head: '0123456789abcdef', branch: 'feat/x', dirty: 1, ahead: 0 }, n_turn: 7,
  });
  const raw = fs.readFileSync(j.journalPath(sid), 'utf8').trim();
  const parsed = JSON.parse(raw);
  // The legacy turn shape — exactly these keys, no `kind`/provenance leakage.
  assert.deepEqual(Object.keys(parsed), ['ts', 'assistant_snippet', 'tools', 'git', 'n_turn']);
  assert.equal('kind' in parsed, false, 'turn entries carry no kind field');
  assert.equal(raw, JSON.stringify({
    ts: '2026-06-30T00:00:00.000Z',
    assistant_snippet: 'wiring the spine',
    tools: [{ name: 'Edit', target: 'a.js' }],
    git: { head: '0123456789ab', branch: 'feat/x', dirty: 1, ahead: 0 },
    n_turn: 7,
  }), 'byte-identical serialization');
});

test('appendEvent never throws and degrades on a write failure', () => {
  const j = fresh();
  assert.deepEqual(j.appendEvent({ kind: 'turn' }), { ok: false, deduped: false }, 'no sid → ok:false');
  // Inject an fs failure (shared require("fs") object) and assert it degrades.
  const orig = fs.appendFileSync;
  fs.appendFileSync = () => { throw new Error('disk full'); };
  try {
    let r;
    assert.doesNotThrow(() => { r = j.appendEvent({ sid: 'evt-err', kind: 'handoff', output: { markdown: 'x' } }); });
    assert.equal(r.ok, false, 'fs error → ok:false, no throw');
  } finally { fs.appendFileSync = orig; }
});
