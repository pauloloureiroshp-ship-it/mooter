'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const receipts = require('./ledger-receipts.js');
const preflight = require('../handoff-preflight.js');
const KEYS = receipts.RECEIPT_KEYS;

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-receipts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'AGENTS.md', '# AGENTS\n');
  write(root, 'tools/router/classify.js', 'module.exports = {};\n');
  write(root, 'docs/agent-context/AGENT_CONTEXT_PROTOCOL.md', [
    '| Type | Direction | Function | Target budget |',
    '|---|---|---|---:|',
    '| `MASTERPROMPT` | brain → executor | work to do | ≤ 8k tokens |',
    '| `HANDOFF` | executor → brain | verified real state | ≤ 4k tokens |',
    '| `DECISION CONTRACT` | brain → executor | typed response | ≤ 2k tokens |',
    '| `BRIEF` | executor → ledger | durable record | ≤ 1k tokens |',
    '',
  ].join('\n'));
  return root;
}

function write(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function typedHandoff(root) {
  const text = [
    '---',
    'type: HANDOFF',
    'id: receipt-fixture',
    '---',
    '',
    '# HANDOFF · synthetic receipt',
    '',
    'Measured evidence only.',
    '',
  ].join('\n');
  write(root, '_handoff/receipt.md', text);
  return text;
}

test('synthetic task joins explicit wall-clock, token budget, savings-tracker cost and mesh catches', (t) => {
  const root = tempRoot(t);
  const handoff = typedHandoff(root);
  const events = [
    {
      id: 'start', ts: '2026-07-18T10:00:00.000Z', kind: 'intent', status: 'in_progress',
      run_id: 'task-1', session_id: 's1', session_title: 'Receipts synthetic task', files: [],
    },
    {
      id: 'end', ts: '2026-07-18T10:02:00.000Z', kind: 'outcome', status: 'done',
      run_id: 'task-1', session_id: 's1', artifact: '_handoff/receipt.md', files: [],
    },
  ];
  const tasks = receipts.buildReceipts({
    root,
    events,
    decisionLines: [
      JSON.stringify({
        event: 'classified', session_id: 's1', tier: 'T1', prompt_len: 120,
        recommended_model: 'claude-haiku-4-5',
        ts_ms: Date.parse('2026-07-18T10:01:00.000Z'),
      }),
      JSON.stringify({
        event: 'classified', session_id: 's1', tier: 'T3', prompt_len: 9_999,
        ts_ms: Date.parse('2026-07-18T11:00:00.000Z'),
      }),
    ],
    journalBySession: { s1: [{ ts: '2026-07-18T10:00:30.000Z' }] },
    fleetEvents: [
      { ts: '2026-07-18T10:01:00.000Z', event: 'mesh_check', checker: 'pointer-sentinel', findings: 2 },
      { ts: '2026-07-18T10:01:30.000Z', event: 'mesh_check', checker: 'projection-drift', findings: 0 },
    ],
  }, {
    preflight,
    meshAvailable: true,
    savingsTracker: {
      computeMetrics: (lines) => {
        assert.equal(lines.length, 1, 'route cost is scoped to the task wall-clock interval');
        return { prompts: 1, real_cost_estimated: 0.0123 };
      },
    },
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].timing[KEYS.TASK_WALL_MS], 120_000);
  assert.equal(tasks[0].timing.basis, 'agent-sync:intent->outcome');
  assert.equal(tasks[0].journal_turns, 1);
  assert.equal(tasks[0].messages.length, 1);
  assert.equal(tasks[0].messages[0].type, 'HANDOFF');
  assert.equal(tasks[0].messages[0][KEYS.ARTIFACT_TOKENS], preflight.estimateTokens(handoff));
  assert.equal(tasks[0].messages[0][KEYS.BUDGET_TOKENS], 4000);
  assert.equal(tasks[0].messages[0].within_budget, true);
  assert.deepEqual(tasks[0].route, {
    [KEYS.COST_USD]: 0.0123, [KEYS.REQUEST_MODEL]: null, estimated: true, routes: 1,
    basis: 'savings-tracker.computeMetrics:real_cost_estimated',
  });
  assert.deepEqual(tasks[0].drift, {
    catches: 2, checks: 2, basis: 'fleet-ledger:mesh_check.findings',
  });
});

test('executed zero-dollar route remains measured zero, not n/d', () => {
  const route = receipts.routeReceipt('s-local', [{
    raw: '{}',
    value: {
      event: 'executed', session_id: 's-local', cost_usd: 0,
      model_used: 'qwen2.5:3b',
    },
  }], null);
  assert.equal(route[KEYS.COST_USD], 0);
  assert.equal(route[KEYS.REQUEST_MODEL], 'qwen2.5:3b');
  assert.equal(route.estimated, false);
  assert.equal(receipts.fmtCost(route), '$0.0000');
  const missing = receipts.routeReceipt('s-local', [{
    raw: '{}',
    value: {
      event: 'executed', session_id: 's-local', cost_usd: null,
      recommended_model: 'claude-sonnet-4-6',
    },
  }], null);
  assert.equal(missing[KEYS.COST_USD], null, 'null execution cost is unknown, never coerced to zero');
  assert.equal(missing[KEYS.REQUEST_MODEL], 'claude-sonnet-4-6', 'real executed model survives unknown cost');
});

test('journal supplies only an observed start when a terminal Ledger event exists', () => {
  const timing = receipts.timingReceipt([
    { ts: '2026-07-18T10:10:00.000Z', kind: 'handoff', status: 'ready' },
  ], [
    { ts: '2026-07-18T10:00:00.000Z', assistant_snippet: 'work observed' },
  ]);
  assert.equal(timing[KEYS.TASK_WALL_MS], 600_000);
  assert.equal(timing.basis, 'handoff-journal:first-observation->agent-sync:handoff');
  const open = receipts.timingReceipt([
    { ts: '2026-07-18T10:00:00.000Z', kind: 'turn', status: 'done' },
  ], [
    { ts: '2026-07-18T10:00:00.000Z' },
    { ts: '2026-07-18T10:05:00.000Z' },
  ]);
  assert.equal(open[KEYS.TASK_WALL_MS], null, 'two journal observations without a terminal event are not task duration');
  assert.equal(open.basis, 'n/d');
});

test('missing measurements render n/d instead of fabricated zero', (t) => {
  const root = tempRoot(t);
  const tasks = receipts.buildReceipts({
    root,
    events: [{ id: 'only', ts: '2026-07-18T10:00:00.000Z', kind: 'turn', status: 'done', session_id: 's2' }],
    decisionLines: [],
    fleetEvents: [],
  }, { meshAvailable: false, journalBySession: { s2: [] } });
  assert.equal(tasks[0].timing[KEYS.TASK_WALL_MS], null);
  assert.equal(tasks[0].messages.length, 0);
  assert.equal(tasks[0].route[KEYS.COST_USD], null);
  assert.equal(tasks[0].drift.catches, null);
  const out = receipts.renderHuman(tasks, { eventsAvailable: true, eventsFile: 'events.jsonl' });
  assert.match(out, /n\/d/);
  assert.doesNotMatch(out, /\$0\.0000/);
});

test('command is read-only over synthetic Ledger source files', (t) => {
  const root = tempRoot(t);
  typedHandoff(root);
  const eventsFile = write(root, '_handoff/agent-sync/events.jsonl', [
    JSON.stringify({ id: 'a', ts: '2026-07-18T10:00:00.000Z', kind: 'intent', status: 'in_progress', run_id: 'r', session_id: 's' }),
    JSON.stringify({ id: 'b', ts: '2026-07-18T10:00:05.000Z', kind: 'outcome', status: 'done', run_id: 'r', session_id: 's', artifact: '_handoff/receipt.md' }),
    '',
  ].join('\n'));
  const decisionsFile = write(root, 'decisions.log', JSON.stringify({
    event: 'executed', session_id: 's', cost_usd: 0,
    model_used: 'qwen2.5:3b', ts_ms: Date.parse('2026-07-18T10:00:02.000Z'),
  }) + '\n');
  const journalDir = path.join(root, 'journal');
  fs.mkdirSync(journalDir);
  const before = new Map([eventsFile, decisionsFile].map((file) => [file, fs.readFileSync(file, 'utf8')]));

  const out = receipts.command([
    '--root', root,
    '--ledger', eventsFile,
    '--decisions', decisionsFile,
    '--journal-dir', journalDir,
    '--fleet-ledger', path.join(root, 'missing-fleet.jsonl'),
  ], { preflight, meshAvailable: false, savingsTracker: { computeMetrics: () => ({ prompts: 0 }) } });

  assert.match(out, /mooter receipts/);
  assert.match(out, /HANDOFF/);

  const payload = JSON.parse(receipts.command([
    '--root', root,
    '--ledger', eventsFile,
    '--decisions', decisionsFile,
    '--journal-dir', journalDir,
    '--fleet-ledger', path.join(root, 'missing-fleet.jsonl'),
    '--json',
  ], { preflight, meshAvailable: false }));
  const task = payload.tasks[0];
  assert.equal(task.timing[KEYS.TASK_WALL_MS], 5000);
  assert.equal(Object.hasOwn(task.timing, 'wall_clock_ms'), false);
  assert.equal(task.messages[0][KEYS.ARTIFACT_TOKENS], preflight.estimateTokens(typedHandoff(root)));
  assert.equal(task.messages[0][KEYS.BUDGET_TOKENS], 4000);
  assert.equal(Object.hasOwn(task.messages[0], 'tokens'), false);
  assert.equal(Object.hasOwn(task.messages[0], 'budget_tokens'), false);
  assert.equal(task.route[KEYS.COST_USD], 0);
  assert.equal(task.route[KEYS.REQUEST_MODEL], 'qwen2.5:3b');
  assert.equal(Object.hasOwn(task.route, 'cost_usd'), false);
  assert.equal(JSON.stringify(payload).includes('gen_ai.usage.'), false, 'future per-call usage attributes are not fabricated');
  for (const [file, content] of before) assert.equal(fs.readFileSync(file, 'utf8'), content);
});
