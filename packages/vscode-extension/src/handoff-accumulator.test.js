// handoff-accumulator.test.js — Live Context Accumulator PASSO 4/5 (handoff READS the ready
// rolling summary + journal instead of resuming on-demand). MOOTER_HOME isolates the handoff dir;
// MOOTER_OLLAMA_PORT points at a dead port to PROVE the summary path never needs Ollama.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let HOME, HOFF, extra;

before(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-acc-'));
  process.env.MOOTER_HOME = HOME;
  process.env.MOOTER_OLLAMA_PORT = '59599'; // nobody listens → on-demand path = "Ollama down"
  HOFF = path.join(HOME, 'handoff');
  fs.mkdirSync(HOFF, { recursive: true });
  fs.writeFileSync(path.join(HOFF, 'acc-1.summary.txt'), 'a ligar o acumulador ao handoff\nsegunda linha de contexto');
  fs.writeFileSync(path.join(HOFF, 'acc-1.rollup-ts'), JSON.stringify({ ts: 1, turns: 3, model: 'qwen2.5:3b' }));
  fs.writeFileSync(path.join(HOFF, 'acc-1.jsonl'), JSON.stringify({ ts: 'x', assistant_snippet: 'snip', tools: [{ name: 'Edit', target: 'host-extra.js' }], n_turn: 3 }) + '\n');
  fs.writeFileSync(path.join(HOFF, 'acc-2.summary.txt'), 'outra sessão a testar o projecto');
  delete require.cache[require.resolve('./host-extra.js')];
  extra = require('./host-extra.js');
});
after(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} delete process.env.MOOTER_HOME; delete process.env.MOOTER_OLLAMA_PORT; });

test('readRollingSummary returns the summary text + the producing model', () => {
  const s = extra.readRollingSummary('acc-1');
  assert.ok(s && s.text.includes('acumulador'));
  assert.equal(s.model, 'qwen2.5:3b', 'model from rollup-ts (honest engine label)');
  assert.equal(extra.readRollingSummary('does-not-exist'), null);
});

test('composeHandoff USES the rolling summary (instant, no Ollama) — DOING + RECAP + honest engine', async () => {
  const row = { fullId: 'acc-1', id: 'acc-1', name: 'live context', turns: 20, branch: 'wave/cockpit-live-context', model: 'claude-opus-4-8', mode: 'moo' };
  const pending = { lastAssistantText: 'EXACT pending question — verbatim?', lastToolActions: [], stopped: true };
  const t0 = Date.now();
  const c = await extra.composeHandoff(row, pending);
  const ms = Date.now() - t0;
  assert.equal(c.fromSummary, true, 'short-circuited on the ready summary');
  assert.ok(ms < 1000, `summary path is instant (took ${ms}ms, no cold-start)`);
  assert.equal(c.mode, 'full', 'turns 20 → full');
  assert.equal(c.model, 'qwen2.5:3b');
  assert.ok(c.text.includes('DOING:  a ligar o acumulador ao handoff'), 'DOING = first summary line');
  assert.ok(c.text.includes('RECAP:'), 'RECAP present in full mode');
  assert.ok(c.text.includes('PENDING:"EXACT pending question — verbatim?"'), 'PENDING copied verbatim (LLM never touches it)');
  assert.ok(c.text.includes('T0 · qwen2.5:3b · $0'), 'honest engine label from the rolling-summary model');
});

test('composeHandoff backfills LAST STEP from the journal when live pending has no tools', async () => {
  const row = { fullId: 'acc-1', id: 'acc-1', name: 'live context', turns: 20 };
  const pending = { lastAssistantText: 'Q?', lastToolActions: [] };
  const c = await extra.composeHandoff(row, pending);
  assert.ok(c.text.includes('LAST:   Edit host-extra.js'), 'LAST STEP (full mode) backfilled from the journal entry');
});

test('fallback: no summary → on-demand path (Ollama down) ships the deterministic skeleton', async () => {
  const row = { fullId: 'no-summary-sid', id: 'no-summary-sid', name: 'fresh session', turns: 5 };
  const pending = { lastAssistantText: 'still verbatim?', lastToolActions: [{ name: 'Read', target: 'x.js' }] };
  const c = await extra.composeHandoff(row, pending);
  assert.ok(!c.fromSummary, 'no summary → not the summary path');
  assert.equal(c.model, null, 'Ollama down → no narrative model');
  assert.ok(c.text.includes('⇄ MOO HANDOFF'), 'deterministic skeleton present');
  assert.ok(c.text.includes('PENDING:"still verbatim?"'), 'PENDING verbatim on the fallback path too');
});

test('opts.noSummary forces the on-demand path even when a summary exists', async () => {
  const row = { fullId: 'acc-1', id: 'acc-1', name: 'live context', turns: 20 };
  const c = await extra.composeHandoff(row, { lastAssistantText: 'P?', lastToolActions: [] }, { noSummary: true });
  assert.ok(!c.fromSummary, 'noSummary bypassed the rolling summary');
});

test('projectSynthFromSummaries aggregates the ready per-session summaries (no echo)', () => {
  const synth = extra.projectSynthFromSummaries([{ fullId: 'acc-1' }, { fullId: 'acc-2' }]);
  assert.ok(synth.includes('a ligar o acumulador ao handoff'), 'first line of acc-1');
  assert.ok(synth.includes('outra sessão a testar o projecto'), 'first line of acc-2');
  assert.equal(extra.projectSynthFromSummaries([{ fullId: 'none-1' }, { fullId: 'none-2' }]), null, 'no summaries → null (caller falls back)');
  assert.equal(extra.projectSynthFromSummaries([]), null);
});

// ── B4: localMooState — estado vivo do moo local por sessão (read-only) ──
test('B4 localMooState: journal count + rolling summary + honest updating flag', () => {
  // acc-1: journal 1 entry, rollup turns 3 → rollup já absorveu → NOT updating; summary presente.
  const s1 = extra.localMooState('acc-1');
  assert.ok(s1 && s1.journalN === 1, 'journal entry counted');
  assert.ok(s1.summary && s1.summary.includes('acumulador'), 'rolling summary surfaced');
  assert.equal(s1.model, 'qwen2.5:3b', 'honest engine model from rollup-ts');
  assert.equal(s1.updating, false, 'rollup absorbed the journal → não está a actualizar');
  assert.ok(Array.isArray(s1.lastTools) && s1.lastTools[0].name === 'Edit', 'last tools surfaced from the journal');
  // sessão cujo journal está À FRENTE do último rollup → updating true ("a actualizar…").
  fs.writeFileSync(path.join(HOFF, 'b4-upd.summary.txt'), 'old summary');
  fs.writeFileSync(path.join(HOFF, 'b4-upd.rollup-ts'), JSON.stringify({ ts: 1, turns: 1, model: 'qwen2.5:3b' }));
  fs.writeFileSync(path.join(HOFF, 'b4-upd.jsonl'), [JSON.stringify({ n_turn: 1, tools: [] }), JSON.stringify({ n_turn: 2, tools: [] }), JSON.stringify({ n_turn: 3, tools: [] })].join('\n') + '\n');
  const s2 = extra.localMooState('b4-upd');
  assert.equal(s2.journalN, 3, '3 journal entries counted');
  assert.equal(s2.updating, true, 'journal ahead of rollup → a actualizar…');
  // sem journal nem summary → null (honest empty), nunca lança.
  assert.equal(extra.localMooState('b4-nothing'), null, 'no journal nor summary → null');
  assert.equal(extra.localMooState(''), null, 'empty id → null (never throws)');
});
