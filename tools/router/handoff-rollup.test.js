// handoff-rollup.test.js — Live Context Accumulator PASSO 2 (throttled rolling summary).
'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let HOME;
before(() => { HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-rollup-')); process.env.MOOTER_HOME = HOME; });
after(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} delete process.env.MOOTER_HOME; });

const journal = require('./handoff-journal.js');
const rollup = require('./handoff-rollup.js');

const MODELS = [{ name: 'nomic-embed-text', size: 1e8 }, { name: 'qwen2.5:3b', size: 2e9 }];
function listModels() { return Promise.resolve(MODELS); }

function seed(sid, n) { for (let i = 0; i < n; i++) journal.appendTurn(sid, { assistant_snippet: 'doing step ' + i, tools: [{ name: 'Edit', target: 'f' + i + '.js' }], n_turn: i }); }

test('maybeRollup picks the GEN model (never embeddings), writes summary + rollup-ts', async () => {
  const sid = 'roll-a';
  seed(sid, 3);
  let calls = 0; let seenPrompt = null; let seenModel = null;
  const generate = (model, prompt) => { calls++; seenModel = model; seenPrompt = prompt; return Promise.resolve('Resumo: a ligar o acumulador de contexto ao handoff'); };
  const r = await rollup.maybeRollup(sid, { now: 1000, generate, listModels });
  assert.equal(r.ok, true);
  assert.equal(seenModel, 'qwen2.5:3b', 'embedding model excluded');
  assert.equal(calls, 1);
  assert.equal(r.model, 'qwen2.5:3b');
  const summary = journal.readSummary(sid);
  assert.ok(summary && summary.length > 0, 'summary written');
  assert.ok(!/^resumo\s*:/i.test(summary), 'preamble label stripped');
  const ts = JSON.parse(fs.readFileSync(journal.rollupTsPath(sid), 'utf8'));
  assert.equal(ts.turns, 3);
  assert.equal(ts.model, 'qwen2.5:3b');
});

test('prompt forbids echo/preamble/invention (no-echo contract)', async () => {
  const sid = 'roll-prompt';
  seed(sid, 2);
  let seenPrompt = '';
  await rollup.maybeRollup(sid, { now: 1, generate: (m, p) => { seenPrompt = p; return Promise.resolve('a fazer X'); }, listModels });
  assert.match(seenPrompt, /NÃO repitas/, 'prompt forbids echoing entries');
  assert.match(seenPrompt, /Output APENAS o resumo/, 'prompt forbids preamble');
  // the written summary is the model output, NOT the journal entries verbatim
  const summary = journal.readSummary(sid);
  assert.ok(!summary.includes('doing step 0'), 'journal entry not echoed into the summary');
});

test('throttle: does not re-run within 90s AND <5 new turns', async () => {
  const sid = 'roll-throttle';
  seed(sid, 3);
  let calls = 0;
  const generate = () => { calls++; return Promise.resolve('first summary'); };
  const a = await rollup.maybeRollup(sid, { now: 10_000, generate, listModels });
  assert.equal(a.ok, true); assert.equal(calls, 1);
  // 1s later, no new turns → throttled
  const b = await rollup.maybeRollup(sid, { now: 11_000, generate, listModels });
  assert.equal(b.skipped, true);
  assert.equal(b.reason, 'throttled');
  assert.equal(calls, 1, 'generate not called again');
});

test('throttle releases after >=5 new turns even within 90s', async () => {
  const sid = 'roll-turns';
  seed(sid, 3);
  let calls = 0;
  const generate = () => { calls++; return Promise.resolve('summary ' + calls); };
  await rollup.maybeRollup(sid, { now: 1000, generate, listModels });
  assert.equal(calls, 1);
  seed(sid, 5); // +5 entries
  const r = await rollup.maybeRollup(sid, { now: 2000, generate, listModels }); // elapsed 1s < 90s but turnsDelta>=5
  assert.equal(r.ok, true);
  assert.equal(calls, 2, 'ran again because >=5 new turns');
});

test('never throws — generate throwing yields a skip, not an exception', async () => {
  const sid = 'roll-throw';
  seed(sid, 2);
  let r;
  await assert.doesNotReject(async () => { r = await rollup.maybeRollup(sid, { now: 1, generate: () => { throw new Error('boom'); }, listModels }); });
  assert.equal(r.ok, false);
  assert.equal(journal.readSummary(sid), null, 'no summary written on failure');
});

test('no gen model installed → skip "no_model", no summary', async () => {
  const sid = 'roll-nomodel';
  seed(sid, 2);
  const r = await rollup.maybeRollup(sid, { now: 1, generate: () => Promise.resolve('x'), listModels: () => Promise.resolve([{ name: 'nomic-embed-text' }]) });
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'no_model');
});

test('empty journal → skip "empty_journal"', async () => {
  const r = await rollup.maybeRollup('roll-empty', { now: 1, generate: () => Promise.resolve('x'), listModels });
  assert.equal(r.reason, 'empty_journal');
});

test('pickLocalGenModel excludes embeddings, prefers smallest gen', () => {
  assert.equal(rollup.pickLocalGenModel(MODELS), 'qwen2.5:3b');
  assert.equal(rollup.pickLocalGenModel([{ name: 'bge-small' }, { name: 'nomic-embed-text' }]), null);
  assert.equal(rollup.pickLocalGenModel([{ name: 'qwen3:30b', size: 3e10 }, { name: 'qwen2.5:3b', size: 2e9 }]), 'qwen2.5:3b');
});

test('cleanSummary strips preamble labels and caps at 3 lines', () => {
  const out = rollup.cleanSummary('Summary: line one\nTopic: ignore\nline two\nline three\nline four');
  const lines = out.split('\n');
  assert.ok(lines.length <= 3);
  assert.ok(!/^summary/i.test(out) && !/^topic/i.test(lines[0]));
});
