// ledger-decision.test.js — Ledger Spine L0: MECHANICAL decision capture.
// Proves: an AskUserQuestion + its following tool_result derive a kind:decision
// record with question/options/chosen/answered_by taken FROM the transcript
// (never invented); no AskUserQuestion → zero; unanswered → zero; and the
// derived decision lands as a deduped kind:decision event in the journal.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { deriveDecisions } = require('./ledger-decision.js');
const { provHash } = require('./ledger-prov.js');

// A realistic transcript tail: assistant asks via AskUserQuestion (tool_use id
// "ask-1"), then the user answer arrives as a tool_result (answers map keyed by
// the question). This mirrors the host's transcript JSONL shape.
function fixtureAnswered() {
  return [
    JSON.stringify({ message: { role: 'user', content: 'should we land the spine first?' } }),
    JSON.stringify({ message: { role: 'assistant', content: [
      { type: 'text', text: 'I need a call on ordering.' },
      { type: 'tool_use', name: 'AskUserQuestion', id: 'ask-1', input: { questions: [
        { question: 'Build the Ledger Spine before Guardian F2/F3?', header: 'Order',
          options: [{ label: 'Spine first (Recommended)' }, { label: 'Guardian first' }], multiSelect: false },
      ] } },
    ] } }),
    JSON.stringify({ message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'ask-1',
        content: JSON.stringify({ answers: { 'Build the Ledger Spine before Guardian F2/F3?': 'Spine first (Recommended)' } }) },
    ] } }),
  ];
}

test('derives a decision from AskUserQuestion + the following answer (mechanical)', () => {
  const decisions = deriveDecisions(fixtureAnswered());
  assert.equal(decisions.length, 1);
  const d = decisions[0];
  assert.equal(d.question, 'Build the Ledger Spine before Guardian F2/F3?');
  assert.deepEqual(d.options, ['Spine first (Recommended)', 'Guardian first'], 'options from the tool_use input');
  assert.equal(d.chosen, 'Spine first (Recommended)', 'chosen from the tool_result, not invented');
  assert.equal(d.answered_by, 'human');
  assert.equal(d.tool_use_id, 'ask-1');
});

test('no AskUserQuestion in the tail → zero decisions', () => {
  const lines = [
    JSON.stringify({ message: { role: 'assistant', content: [
      { type: 'text', text: 'just working' },
      { type: 'tool_use', name: 'Edit', id: 'e1', input: { file_path: 'a.js' } },
    ] } }),
    JSON.stringify({ message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'e1', content: 'ok' }] } }),
  ];
  assert.deepEqual(deriveDecisions(lines), []);
});

test('an unanswered AskUserQuestion (no following result) → zero decisions', () => {
  const lines = [
    JSON.stringify({ message: { role: 'assistant', content: [
      { type: 'tool_use', name: 'AskUserQuestion', id: 'ask-x', input: { questions: [
        { question: 'Pick A or B?', options: [{ label: 'A' }, { label: 'B' }] },
      ] } },
    ] } }),
  ];
  assert.deepEqual(deriveDecisions(lines), [], 'unanswered prompt is not a decision');
});

test('never throws on garbage; accepts pre-parsed objects', () => {
  assert.doesNotThrow(() => deriveDecisions(['{bad', '', null, 42, { message: null }]));
  assert.deepEqual(deriveDecisions(null), []);
  // pre-parsed objects (not strings) are also accepted
  const parsed = fixtureAnswered().map((l) => JSON.parse(l));
  assert.equal(deriveDecisions(parsed).length, 1);
});

test('freeform text answer matches against the offered options', () => {
  const lines = [
    JSON.stringify({ message: { role: 'assistant', content: [
      { type: 'tool_use', name: 'AskUserQuestion', id: 'ask-2', input: { questions: [
        { question: 'Deploy now?', options: [{ label: 'Yes' }, { label: 'No' }] },
      ] } },
    ] } }),
    JSON.stringify({ message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'ask-2', content: [{ type: 'text', text: 'No, wait for the gate' }] },
    ] } }),
  ];
  const d = deriveDecisions(lines);
  assert.equal(d.length, 1);
  assert.equal(d[0].chosen, 'No', 'matched the offered option inside the freeform answer');
});

test('the derived decision lands as a deduped kind:decision event in the journal', () => {
  const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-dec-evt-'));
  process.env.MOOTER_HOME = HOME;
  try {
    delete require.cache[require.resolve('./handoff-journal.js')];
    const j = require('./handoff-journal.js');
    const sid = 'dec-sess';
    const decisions = deriveDecisions(fixtureAnswered());
    // Wire exactly as the hook will: stamp a stable idem_key over the decision.
    for (const dec of decisions) {
      const idem_key = 'decision:' + provHash({ sid, q: dec.question, chosen: dec.chosen });
      j.appendEvent({ sid, agent: 'cc', kind: 'decision', output: dec, idem_key });
    }
    // Re-running the same turn (same tail) must NOT duplicate the decision.
    for (const dec of decisions) {
      const idem_key = 'decision:' + provHash({ sid, q: dec.question, chosen: dec.chosen });
      j.appendEvent({ sid, agent: 'cc', kind: 'decision', output: dec, idem_key });
    }
    const evs = j.readEvents(sid, 'decision');
    assert.equal(evs.length, 1, 'idempotent: one decision event despite two turn passes');
    assert.equal(evs[0].output.chosen, 'Spine first (Recommended)');
    assert.equal(evs[0].output.answered_by, 'human');
  } finally {
    fs.rmSync(HOME, { recursive: true, force: true });
    delete process.env.MOOTER_HOME;
    delete require.cache[require.resolve('./handoff-journal.js')];
  }
});
