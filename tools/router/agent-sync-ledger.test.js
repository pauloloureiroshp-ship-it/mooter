'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const sync = require('./agent-sync-ledger.js');

function write(root, rel, text) {
  const fp = path.join(root, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, text);
  return fp;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agent-sync-'));
  write(root, 'AGENTS.md', '# Agents\n');
  const classify = write(root, 'tools/router/classify.js', 'module.exports = {}\n');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(classify)).digest('hex');
  return { root, sha };
}

test('global ledger override remains isolated per real repo/worktree root', () => {
  const a = fixture();
  const b = fixture();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agent-sync-global-'));
  const previous = process.env.MOOTER_AGENT_SYNC_DIR;
  try {
    process.env.MOOTER_AGENT_SYNC_DIR = parent;
    const dirA = sync.defaultDir(a.root);
    const dirB = sync.defaultDir(b.root);
    assert.strictEqual(path.dirname(dirA), parent);
    assert.strictEqual(path.dirname(dirB), parent);
    assert.notStrictEqual(dirA, dirB, 'two roots never co-mingle into one global ledger');
    assert.strictEqual(sync.defaultDir(a.root), dirA, 'the per-root key is stable');
  } finally {
    if (previous == null) delete process.env.MOOTER_AGENT_SYNC_DIR;
    else process.env.MOOTER_AGENT_SYNC_DIR = previous;
    fs.rmSync(a.root, { recursive: true, force: true });
    fs.rmSync(b.root, { recursive: true, force: true });
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('normalizeEvent clamps and normalizes agent/cadence/status', () => {
  const { root } = fixture();
  try {
    const ev = sync.normalizeEvent({
      agent: 'roo',
      cadence: 'prompt',
      status: 'ready',
      summary: '  hello   world  ',
      files: 'a.js,b.js',
    }, { root, git: false, classify: false, now: '2026-07-09T00:00:00.000Z' });
    assert.equal(ev.agent, 'gemini-roo');
    assert.equal(ev.cadence, 'prompt');
    assert.equal(ev.status, 'ready');
    assert.equal(ev.kind, 'sync');
    assert.equal(ev.summary, 'hello world');
    assert.deepEqual(ev.files, ['a.js', 'b.js']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('normalizeEvent captures typed brief contract', () => {
  const { root } = fixture();
  try {
    const ev = sync.normalizeEvent({
      agent: 'cc',
      kind: 'brief',
      status: 'ready',
      to: 'codex,roo,moo',
      task: 'review the sync protocol',
      context: 'use the same ledger snapshot',
      deliverable: 'return compact evidence',
      evidence: 'doc,handoff,unknown-kind',
      confidence: 'high',
      acceptance: 'no fabricated connector access',
      guard: 'do not edit classify.js',
    }, { root, git: false, classify: false, now: '2026-07-09T00:00:00.000Z' });
    assert.equal(ev.agent, 'claude-code');
    assert.equal(ev.kind, 'brief');
    assert.deepEqual(ev.target_agents, ['codex', 'gemini-roo', 'ollama']);
    assert.deepEqual(ev.evidence, ['doc', 'handoff']);
    assert.equal(ev.confidence, 'high');
    assert.equal(ev.brief.task, 'review the sync protocol');
    assert.deepEqual(ev.acceptance, ['no fabricated connector access']);
    assert.deepEqual(ev.guard, ['do not edit classify.js']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('appendEvent writes events, snapshot, latest and prompts', () => {
  const { root, sha } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    const ev = sync.normalizeEvent({
      agent: 'codex',
      cadence: 'checkpoint',
      status: 'in_progress',
      summary: 'implemented sync ledger',
      next: 'run tests',
    }, { root, git: false, now: '2026-07-09T00:00:00.000Z' });
    ev.classify = { path: 'tools/router/classify.js', sha256: sha, intact: false };
    const snap = sync.appendEvent(root, ev, dir);
    assert.equal(snap.event_count, 1);
    assert.ok(fs.existsSync(path.join(dir, 'events.jsonl')));
    assert.ok(fs.existsSync(path.join(dir, 'context.jsonl')));
    assert.ok(fs.existsSync(path.join(dir, 'snapshot.json')));
    assert.ok(fs.existsSync(path.join(dir, 'latest.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'gemini-roo.md')));
    assert.match(fs.readFileSync(path.join(dir, 'latest.md'), 'utf8'), /implemented sync ledger/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Gate 1: context rolls at 50 while the durable ledger preserves intent, decision and outcome', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    const structural = ['intent', 'decision', 'outcome'].map((kind, index) => sync.normalizeEvent({
      id: `structural-${kind}`,
      agent: 'codex',
      kind,
      cadence: 'checkpoint',
      status: kind === 'outcome' ? 'done' : 'ready',
      summary: `${kind} must survive context rollover`,
    }, { root, git: false, classify: false, now: `2026-07-09T00:00:0${index}.000Z` }));
    for (const event of structural) sync.appendEvent(root, event, dir, { git: false, classify: false });
    for (let i = 0; i < 60; i++) {
      const turn = sync.normalizeEvent({
        id: `turn-${i}`,
        agent: 'claude-code',
        kind: 'turn',
        cadence: 'turn',
        status: 'done',
        summary: `turn ${i}`,
      }, { root, git: false, classify: false, now: `2026-07-09T00:01:${String(i).padStart(2, '0')}.000Z` });
      sync.appendEvent(root, turn, dir, { git: false, classify: false });
    }

    const ledger = sync.readEvents(root, dir);
    const context = sync.readContextEvents(root, dir);
    assert.equal(ledger.length, 63, 'append-only ledger never drops events at context rollover');
    assert.equal(context.length, 50, 'context buffer stays bounded');
    for (const event of structural) {
      assert.ok(ledger.some((item) => item.id === event.id), `${event.kind} remains durable`);
      assert.ok(context.some((item) => item.id === event.id), `${event.kind} remains in bounded context`);
    }
    assert.equal(context.at(-1).id, 'turn-59', 'latest turn remains available to stateless consumers');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('command brief writes targeted brief prompts', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    const out = sync.command([
      'brief', '--root', root, '--dir', dir, '--from', 'claude-code',
      '--to', 'codex,ollama', '--task', 'verify handoff state',
      '--context', 'same ledger for every agent',
      '--acceptance', 'report evidence',
      '--guard', 'do not edit classify.js',
      '--git', 'false',
    ], { now: '2026-07-09T00:00:00.000Z' });
    assert.match(out, /Brief prompts:/);
    const events = sync.readEvents(root, dir);
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, 'brief');
    assert.deepEqual(events[0].target_agents, ['codex', 'ollama']);
    const files = fs.readdirSync(path.join(dir, 'briefs')).sort();
    assert.equal(files.length, 2);
    assert.match(files[0], /codex\.md$/);
    assert.match(files[1], /ollama\.md$/);
    const prompt = fs.readFileSync(path.join(dir, 'briefs', files[1]), 'utf8');
    assert.match(prompt, /You are stateless/);
    assert.match(prompt, /verify handoff state/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('command prompt renders stateless warning for ollama', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    sync.command([
      'record', '--root', root, '--dir', dir, '--agent', 'claude',
      '--summary', 'handoff ready', '--status', 'ready',
    ], { now: '2026-07-09T00:00:00.000Z' });
    const prompt = sync.command(['prompt', '--root', root, '--dir', dir, '--agent', 'ollama']);
    assert.match(prompt, /stateless local model/);
    assert.match(prompt, /handoff ready/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hook mode writes only inside a Mooter root', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    const out = sync.command(['hook', '--dir', dir], {
      root,
      now: '2026-07-09T00:00:00.000Z',
      stdin: JSON.stringify({ cwd: root, session_id: 's1', session_title: 'MEO control tower', model: 'claude-opus-4-8' }),
    });
    assert.equal(out, '');
    const events = sync.readEvents(root, dir);
    assert.equal(events.length, 1);
    assert.equal(events[0].agent, 'claude-code');
    assert.equal(events[0].kind, 'turn');
    assert.equal(events[0].provider, 'anthropic');
    assert.equal(events[0].model, 'claude-opus-4-8');
    assert.equal(events[0].execution_channel, 'subscription');
    assert.equal(events[0].session_title, 'MEO control tower');
    assert.equal(events[0].source, 'claude-code-hook');
    assert.equal(events[0].git, null, 'automatic Stop capture must not spawn git');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('normalizeEvent preserves executive session, delivery and mirror references', () => {
  const { root } = fixture();
  try {
    const ev = sync.normalizeEvent({
      agent: 'codex', session_id: 'codex-1', session_title: 'MEO max effort',
      channel: 'subscription',
      wave: 'wave/meo-cto', pr: '#247', notion_ref: 'notion://mooter/meo',
      obsidian_ref: 'Mooter/meo.md', summary: 'implemented the control tower',
    }, { root, git: false, classify: false, now: '2026-07-12T00:00:00.000Z' });
    assert.equal(ev.session_title, 'MEO max effort');
    assert.equal(ev.execution_channel, 'subscription');
    assert.equal(ev.wave, 'wave/meo-cto');
    assert.equal(ev.pr, '#247');
    assert.equal(ev.notion_ref, 'notion://mooter/meo');
    assert.equal(ev.obsidian_ref, 'Mooter/meo.md');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('simulateConversation writes one shared flow for all sync agents', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync-sim');
  try {
    const result = sync.simulateConversation(root, dir, {
      now: '2026-07-09T00:00:00.000Z',
      git: false,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.agents, ['claude-code', 'codex', 'gemini-roo', 'ollama']);
    assert.equal(result.missingAgents.length, 0);
    assert.equal(result.missingPrompts.length, 0);
    assert.equal(result.missingBriefs.length, 0);
    assert.ok(fs.existsSync(path.join(dir, 'latest.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'claude-code.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'codex.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'gemini-roo.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'ollama.md')));
    assert.ok(fs.existsSync(path.join(result.briefsDir)));
    const latest = fs.readFileSync(path.join(dir, 'latest.md'), 'utf8');
    assert.match(latest, /Claude Code prepared a typed handoff/);
    assert.match(latest, /Brief all agents from the same ledger snapshot/);
    assert.match(latest, /Codex read the handoff state/);
    assert.match(latest, /Roo\/Gemini reviewed the same snapshot/);
    assert.match(latest, /Local Moo summarized explicit sync context/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('command simulate reports pass and writes to requested dir', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync-sim');
  try {
    const out = sync.command(['simulate', '--root', root, '--dir', dir, '--git', 'false'], {
      now: '2026-07-09T00:00:00.000Z',
    });
    assert.match(out, /SIMULATION=pass/);
    assert.match(out, /claude-code, codex, gemini-roo, ollama/);
    assert.match(out, /missing_briefs: 0/);
    assert.ok(fs.existsSync(path.join(dir, 'events.jsonl')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
