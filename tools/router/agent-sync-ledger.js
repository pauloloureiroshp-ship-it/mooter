#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * agent-sync-ledger.js - multi-agent alignment ledger.
 *
 * This is the living layer above:
 *   - session-context.js: conversation memory for stateless providers.
 *   - handoff-journal.js: per-Claude-session working facts.
 *   - agent-context-bundle.js: onboarding/source manifest.
 *
 * It records small checkpoint events for Claude Code, Codex, Roo/Gemini and
 * local Ollama so every agent can read the same latest state before acting.
 * The generated ledger lives under _handoff/agent-sync/ by default and is meant
 * to be local operational state, not product source.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const reducer = require('./ledger-reduce.js');

const SCHEMA_VERSION = 'agent-sync-ledger.v2';
const EXPECTED_CLASSIFY_SHA =
  '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f';

const VALID_AGENTS = new Set(['claude-code', 'codex', 'gemini-roo', 'ollama', 'cowork', 'paulo', 'unknown']);
const VALID_CADENCES = new Set(['prompt', 'turn', 'checkpoint', 'handoff', 'pr', 'wave', 'release', 'manual']);
const VALID_STATUS = new Set(['in_progress', 'blocked', 'ready', 'done', 'needs_human', 'unknown']);
const VALID_KINDS = new Set(['sync', 'intent', 'brief', 'turn', 'decision', 'artifact', 'gate', 'handoff', 'outcome', 'review', 'blocker']);
const VALID_EVIDENCE = new Set(['code', 'test', 'git', 'doc', 'handoff', 'notion-export', 'obsidian-vault', 'runtime', 'connector', 'inference']);
const VALID_CONFIDENCE = new Set(['low', 'medium', 'high', 'unknown']);
const VALID_CHANNELS = new Set(['local', 'subscription', 'api', 'cloud', 'unknown']);
const MAX_CONTEXT_EVENTS = 50;
const CONTEXT_STICKY_KINDS = new Set(['intent', 'decision', 'outcome']);
const SYNC_AGENTS = ['claude-code', 'codex', 'gemini-roo', 'ollama'];
const SHARED_LANGUAGE = [
  ['intent', 'what Paulo or an agent is trying to accomplish'],
  ['brief', 'a scoped task packet from one agent to another'],
  ['turn', 'a single meaningful agent interaction'],
  ['decision', 'a choice that changes future work'],
  ['artifact', 'a file, command output, PR, report or generated prompt'],
  ['gate', 'a required proof before merge, wave close or handoff'],
  ['handoff', 'the compact state another agent must read first'],
  ['outcome', 'what actually happened, including blockers'],
  ['sync', 'the ledger event that keeps agents aligned'],
];

function clamp(s, n) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
}

function splitList(v, max) {
  if (Array.isArray(v)) return v.map((x) => clamp(x, 160)).filter(Boolean).slice(0, max);
  return String(v || '')
    .split(',')
    .map((x) => clamp(x, 160))
    .filter(Boolean)
    .slice(0, max);
}

function uniqueList(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function safeRead(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function sha256File(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return null; }
}

function findRepoRoot(start) {
  let dir = path.resolve(start || process.cwd());
  for (let i = 0; i < 10; i++) {
    if (
      fs.existsSync(path.join(dir, 'AGENTS.md')) &&
      fs.existsSync(path.join(dir, 'tools', 'router', 'classify.js'))
    ) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start || process.cwd());
}

function isMooterRoot(root) {
  return Boolean(
    root &&
    fs.existsSync(path.join(root, 'AGENTS.md')) &&
    fs.existsSync(path.join(root, 'tools', 'router', 'classify.js'))
  );
}

function defaultDir(root) {
  const override = process.env.MOOTER_AGENT_SYNC_DIR;
  if (!override) return path.join(root, '_handoff', 'agent-sync');
  // Treat the global override as a parent, never one shared ledger. A stable real-root key keeps
  // sibling worktrees/repositories isolated even when every agent inherits the same environment.
  let canonical;
  try { canonical = fs.realpathSync(root); } catch { canonical = path.resolve(root); }
  const base = (path.basename(canonical) || 'repo').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80) || 'repo';
  const rootHash = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 12);
  return path.join(path.resolve(override), base + '-' + rootHash);
}

function paths(root, dir) {
  const d = dir || defaultDir(root);
  return {
    dir: d,
    events: path.join(d, 'events.jsonl'),
    context: path.join(d, 'context.jsonl'),
    lock: path.join(d, '.writer.lock'),
    snapshot: path.join(d, 'snapshot.json'),
    latest: path.join(d, 'latest.md'),
    promptsDir: path.join(d, 'prompts'),
    briefsDir: path.join(d, 'briefs'),
  };
}

function gitSnapshot(root) {
  const out = { branch: null, head: null, dirty: null, ahead: null, error: null };
  try {
    const common = ['-C', root];
    const branch = childProcess.spawnSync('git', common.concat(['rev-parse', '--abbrev-ref', 'HEAD']), {
      encoding: 'utf8',
      timeout: 1200,
    });
    if (branch.status === 0) out.branch = branch.stdout.trim();
    const head = childProcess.spawnSync('git', common.concat(['rev-parse', '--short=12', 'HEAD']), {
      encoding: 'utf8',
      timeout: 1200,
    });
    if (head.status === 0) out.head = head.stdout.trim();
    const status = childProcess.spawnSync('git', common.concat(['status', '--porcelain']), {
      encoding: 'utf8',
      timeout: 2000,
      maxBuffer: 512 * 1024,
    });
    if (status.status === 0) {
      out.dirty = status.stdout.split('\n').filter(Boolean).length;
    }
    const ahead = childProcess.spawnSync('git', common.concat(['rev-list', '--count', 'origin/main..HEAD']), {
      encoding: 'utf8',
      timeout: 1200,
    });
    if (ahead.status === 0) out.ahead = Number(ahead.stdout.trim()) || 0;
  } catch (err) {
    out.error = err && err.message ? err.message : String(err);
  }
  return out;
}

function classifySnapshot(root) {
  const file = path.join(root, 'tools', 'router', 'classify.js');
  const sha = sha256File(file);
  return { path: 'tools/router/classify.js', sha256: sha, intact: sha === EXPECTED_CLASSIFY_SHA };
}

function normalizeAgent(v) {
  const raw = String(v || 'unknown').toLowerCase().replace(/_/g, '-');
  if (raw === 'claude' || raw === 'claude-code' || raw === 'cc') return 'claude-code';
  if (raw === 'gemini' || raw === 'roo' || raw === 'roo-code') return 'gemini-roo';
  if (raw === 'local' || raw === 'moo' || raw === 'ollama') return 'ollama';
  return VALID_AGENTS.has(raw) ? raw : 'unknown';
}

function normalizeAgents(v, max) {
  return uniqueList(splitList(v, max || 8).map(normalizeAgent)).slice(0, max || 8);
}

function normalizeKind(v, cadence) {
  const raw = String(v || '').toLowerCase().replace(/_/g, '-');
  if (VALID_KINDS.has(raw)) return raw;
  if (cadence === 'handoff') return 'handoff';
  return 'sync';
}

function normalizeConfidence(v) {
  const raw = String(v || '').toLowerCase();
  return VALID_CONFIDENCE.has(raw) ? raw : 'unknown';
}

function normalizeChannel(v) {
  const raw = String(v || '').toLowerCase();
  return VALID_CHANNELS.has(raw) ? raw : 'unknown';
}

function normalizeEvidence(v) {
  const values = uniqueList(splitList(v, 16).map((x) => x.toLowerCase().replace(/_/g, '-')));
  return values.filter((x) => VALID_EVIDENCE.has(x));
}

function normalizeBrief(input) {
  const task = clamp(input.task || input.brief || input.goal || '', 700);
  const context = clamp(input.context || input.background || '', 900);
  const deliverable = clamp(input.deliverable || input.output || '', 500);
  const acceptance = splitList(input.acceptance || input.gate, 12);
  const guard = splitList(input.guard || input.guardrails, 12);
  if (!task && !context && !deliverable && !acceptance.length && !guard.length) return null;
  return { task, context, deliverable, acceptance, guard };
}

function normalizeEvent(input, opts) {
  opts = opts || {};
  const root = opts.root || findRepoRoot(process.cwd());
  const now = opts.now || new Date().toISOString();
  const cadence = VALID_CADENCES.has(String(input.cadence || '').toLowerCase())
    ? String(input.cadence).toLowerCase()
    : 'checkpoint';
  const status = VALID_STATUS.has(String(input.status || '').toLowerCase())
    ? String(input.status).toLowerCase()
    : 'unknown';
  const agent = normalizeAgent(input.agent);
  const brief = normalizeBrief(input);
  const rawSummary = input.summary || input.message || input.text || (brief && brief.task ? `Brief: ${brief.task}` : '');
  const summary = clamp(rawSummary, 700);
  const kind = normalizeKind(input.kind || input.type, cadence);
  const event = {
    schema_version: SCHEMA_VERSION,
    id: input.id || crypto.createHash('sha256')
      .update([now, agent, cadence, summary, Math.random()].join('|'))
      .digest('hex').slice(0, 16),
    ts: now,
    agent,
    provider: clamp(input.provider || '', 80) || null,
    model: clamp(input.model || '', 120) || null,
    execution_channel: normalizeChannel(input.execution_channel || input.channel),
    kind,
    cadence,
    status,
    confidence: normalizeConfidence(input.confidence),
    target_agents: normalizeAgents(input.target_agents || input.targets || input.to, 8),
    evidence: normalizeEvidence(input.evidence),
    scope: clamp(input.scope || '', 180) || null,
    summary: summary || '(no summary supplied)',
    next: clamp(input.next || input.next_step || '', 500) || null,
    risk: clamp(input.risk || '', 300) || null,
    files: splitList(input.files, 24),
    decisions: splitList(input.decisions, 12),
    acceptance: splitList(input.acceptance || input.gate, 12),
    guard: splitList(input.guard || input.guardrails, 12),
    artifact: clamp(input.artifact || '', 160) || null,
    brief,
    links: splitList(input.links, 12),
    session_id: clamp(input.session_id || input.sid || '', 120) || null,
    session_title: clamp(input.session_title || input.title || '', 160) || null,
    run_id: clamp(input.run_id || '', 120) || null,
    wave: clamp(input.wave || '', 120) || null,
    pr: clamp(input.pr || '', 120) || null,
    notion_ref: clamp(input.notion_ref || input.notion || '', 240) || null,
    obsidian_ref: clamp(input.obsidian_ref || input.obsidian || '', 240) || null,
    source: clamp(input.source || 'manual', 80),
    git: opts.git === false ? null : gitSnapshot(root),
    classify: opts.classify === false ? null : classifySnapshot(root),
  };
  return event;
}

function readEvents(root, dir) {
  const p = paths(root, dir).events;
  const raw = safeRead(p);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line) => safeJson(line)).filter(Boolean);
}

function selectContextEvents(events, maxEvents) {
  const list = Array.isArray(events) ? events : [];
  const max = Number.isInteger(maxEvents) && maxEvents > 0 ? maxEvents : MAX_CONTEXT_EVENTS;
  const indexed = list.map((event, index) => ({ event, index }));
  const sticky = indexed.filter(({ event }) => event && CONTEXT_STICKY_KINDS.has(event.kind));
  if (sticky.length >= max) return sticky.slice(-max).map(({ event }) => event);
  const stickyIndexes = new Set(sticky.map(({ index }) => index));
  const recent = indexed
    .filter(({ index }) => !stickyIndexes.has(index))
    .slice(-(max - sticky.length));
  return sticky.concat(recent).sort((a, b) => a.index - b.index).map(({ event }) => event);
}

function readContextEvents(root, dir) {
  const raw = safeRead(paths(root, dir).context);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line) => safeJson(line)).filter(Boolean);
}

function writeContextEvents(root, events, dir) {
  const ps = paths(root, dir);
  fs.mkdirSync(ps.dir, { recursive: true });
  const context = selectContextEvents(events);
  reducer.materializeProjectionFile(
    ps.context,
    context.map((e) => JSON.stringify(e)).join('\n') + (context.length ? '\n' : ''),
  );
  return context;
}

function appendEvent(root, event, dir, opts) {
  opts = opts || {};
  const ps = paths(root, dir);
  fs.mkdirSync(ps.dir, { recursive: true });
  return reducer.withFileLock(ps.lock, () => {
    reducer.appendFileDurablySync(ps.events, JSON.stringify(event) + '\n');
    const events = readEvents(root, dir);
    writeContextEvents(root, events, dir);
    const snapshot = buildSnapshot(root, events, dir, opts);
    writeSnapshot(root, snapshot, dir, { lockHeld: true });
    return snapshot;
  }, opts.lock || {});
}

function buildSnapshot(root, events, dir, opts) {
  opts = opts || {};
  const latestByAgent = {};
  for (const e of events) latestByAgent[e.agent || 'unknown'] = e;
  const open = events
    .filter((e) => e.status === 'blocked' || e.status === 'needs_human' || e.next)
    .slice(-12)
    .map((e) => ({
      ts: e.ts,
      agent: e.agent,
      status: e.status,
      scope: e.scope,
      next: e.next,
      risk: e.risk,
    }));
  const activeBriefs = events
    .filter((e) => e.kind === 'brief' && e.status !== 'done' && e.status !== 'blocked')
    .slice(-8)
    .map((e) => ({
      id: e.id,
      ts: e.ts,
      from: e.agent,
      to: e.target_agents || [],
      status: e.status,
      scope: e.scope,
      task: e.brief && e.brief.task ? e.brief.task : e.summary,
      files: e.files || [],
      acceptance: e.acceptance || [],
      guard: e.guard || [],
    }));
  const recentDecisions = events
    .filter((e) => e.kind === 'decision' || (e.decisions && e.decisions.length))
    .slice(-10)
    .map((e) => ({
      ts: e.ts,
      agent: e.agent,
      summary: e.summary,
      decisions: e.decisions || [],
      evidence: e.evidence || [],
      confidence: e.confidence || 'unknown',
    }));
  const recentGates = events
    .filter((e) => e.kind === 'gate' || e.kind === 'outcome')
    .slice(-10)
    .map((e) => ({
      ts: e.ts,
      agent: e.agent,
      status: e.status,
      summary: e.summary,
      evidence: e.evidence || [],
      files: e.files || [],
    }));
  const last = events[events.length - 1] || null;
  const latestProjection = (key) => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i] && events[i][key]) return events[i][key];
    }
    return null;
  };
  const now = opts.now instanceof Date ? opts.now.toISOString() : opts.now;
  const projection = (key) => {
    if (opts[key] === false) return null;
    if (opts[key] && typeof opts[key] === 'object') return opts[key];
    return latestProjection(key);
  };
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: now || (last && last.ts) || '1970-01-01T00:00:00.000Z',
    repo_root: root,
    dir: paths(root, dir).dir,
    event_count: events.length,
    last_event: last,
    latest_by_agent: latestByAgent,
    open_items: open,
    active_briefs: activeBriefs,
    recent_decisions: recentDecisions,
    recent_gates: recentGates,
    classify: projection('classify'),
    git: projection('git'),
  };
}

function sharedLanguageLines() {
  return SHARED_LANGUAGE.map(([term, meaning]) => `- ${term}: ${meaning}`);
}

function renderSnapshot(snapshot) {
  const events = [];
  if (snapshot.last_event) events.push(snapshot.last_event);
  const agents = Object.keys(snapshot.latest_by_agent || {}).sort();
  const agentLines = agents.length
    ? agents.map((a) => {
      const e = snapshot.latest_by_agent[a];
      return `- ${a}: ${e.status} / ${e.cadence} - ${e.summary}${e.next ? ` | next: ${e.next}` : ''}`;
    })
    : ['- none'];
  const openLines = (snapshot.open_items || []).length
    ? snapshot.open_items.map((i) => `- ${i.status} ${i.agent}: ${i.next || i.scope || 'n/d'}${i.risk ? ` (risk: ${i.risk})` : ''}`)
    : ['- none'];
  const briefLines = (snapshot.active_briefs || []).length
    ? snapshot.active_briefs.map((b) => `- ${b.id} ${b.from} -> ${(b.to || []).join(', ') || 'n/d'}: ${b.task}${b.acceptance && b.acceptance.length ? ` | gate: ${b.acceptance.join('; ')}` : ''}`)
    : ['- none'];
  const decisionLines = (snapshot.recent_decisions || []).length
    ? snapshot.recent_decisions.map((d) => `- ${d.agent}: ${d.summary}${d.decisions && d.decisions.length ? ` | decisions: ${d.decisions.join('; ')}` : ''}`)
    : ['- none'];
  const gateLines = (snapshot.recent_gates || []).length
    ? snapshot.recent_gates.map((g) => `- ${g.status} ${g.agent}: ${g.summary}${g.evidence && g.evidence.length ? ` | evidence: ${g.evidence.join(', ')}` : ''}`)
    : ['- none'];
  const git = snapshot.git || {};
  const classify = snapshot.classify || {};
  return [
    '# Mooter Agent Sync',
    '',
    `generated_at: ${snapshot.generated_at}`,
    `events: ${snapshot.event_count}`,
    `git: ${git.branch || 'n/d'} @${git.head || 'n/d'} dirty=${git.dirty == null ? 'n/d' : git.dirty} ahead=${git.ahead == null ? 'n/d' : git.ahead}`,
    `classify.js: ${classify.intact ? 'intact' : 'MISMATCH/unknown'} ${classify.sha256 || ''}`,
    '',
    '## Latest By Agent',
    '',
    ...agentLines,
    '',
    '## Shared Language',
    '',
    ...sharedLanguageLines(),
    '',
    '## Active Briefs',
    '',
    ...briefLines,
    '',
    '## Recent Decisions',
    '',
    ...decisionLines,
    '',
    '## Recent Gates / Outcomes',
    '',
    ...gateLines,
    '',
    '## Open Items',
    '',
    ...openLines,
    '',
    '## Use',
    '',
    '- Before acting: read this file plus `_handoff/agent-context/bundle.md` if present.',
    '- After a prompt/checkpoint: append one compact typed event.',
    '- When delegating to another agent or a local Moo, write a `brief` event.',
    '- At PR/wave/release boundaries: append an event with gate evidence and next step.',
    '',
  ].join('\n');
}

function renderAgentPrompt(snapshot, agent) {
  const name = normalizeAgent(agent);
  const latest = renderSnapshot(snapshot);
  const roleLine = {
    'claude-code': 'You usually own repo execution, hooks, test gates and Cowork-facing handoffs.',
    codex: 'You usually own implementation, review, protocol hardening and Codex plugin alignment.',
    'gemini-roo': 'You usually own adversarial review, long-context critique and Roo rule alignment.',
    ollama: 'You usually own local summarization, extraction, classification and cheap scoped checks.',
  }[name] || 'Use the shared ledger before acting.';
  return [
    `You are ${name} in the Mooter multi-agent team.`,
    '',
    roleLine,
    '',
    'Read this sync state before acting. Treat it as operational context, not as proof; verify against code/git when work is risky.',
    '',
    latest,
    '',
    'Contract:',
    '- Do not touch tools/router/classify.js.',
    '- Keep changes small and scoped to the active handoff/goal.',
    '- If docs, code and handoffs disagree, name the contradiction.',
    '- After your prompt/checkpoint/PR/wave, record a compact sync event.',
    '- Use event kinds consistently: sync, intent, brief, turn, decision, artifact, gate, handoff, outcome, review, blocker.',
    '- Evidence values must be concrete: code, test, git, doc, handoff, notion-export, obsidian-vault, runtime, connector, inference.',
    name === 'ollama'
      ? '- You are a stateless local model unless the caller passes files, a brief, or this sync state explicitly.'
      : '- Report real git state in handoffs; never claim tests passed without a run.',
    '',
  ].join('\n');
}

function renderBriefPrompt(event, snapshot, agent) {
  const target = normalizeAgent(agent);
  const brief = event.brief || {};
  const files = event.files && event.files.length ? event.files : ['none'];
  const acceptance = uniqueList([].concat(event.acceptance || [], brief.acceptance || []));
  const guard = uniqueList([].concat(event.guard || [], brief.guard || []));
  const last = snapshot && snapshot.last_event ? snapshot.last_event : null;
  return [
    `# Mooter Brief: ${target}`,
    '',
    `event_id: ${event.id}`,
    `from: ${event.agent}`,
    `to: ${target}`,
    `status: ${event.status}`,
    `scope: ${event.scope || 'n/d'}`,
    `confidence: ${event.confidence || 'unknown'}`,
    `evidence: ${(event.evidence || []).join(', ') || 'none'}`,
    '',
    '## Task',
    '',
    brief.task || event.summary,
    '',
    '## Context',
    '',
    brief.context || event.summary,
    '',
    '## Expected Deliverable',
    '',
    brief.deliverable || event.next || 'Return a compact result with evidence and uncertainty.',
    '',
    '## Files',
    '',
    ...files.map((f) => `- ${f}`),
    '',
    '## Guardrails',
    '',
    ...(guard.length ? guard.map((g) => `- ${g}`) : ['- Do not edit tools/router/classify.js.', '- Do not invent test, connector, Notion or Obsidian access.']),
    '',
    '## Acceptance',
    '',
    ...(acceptance.length ? acceptance.map((g) => `- ${g}`) : ['- Name files inspected and evidence used.', '- Report blockers honestly.']),
    '',
    '## Shared State',
    '',
    last ? `Last ledger event: ${last.agent} / ${last.kind || 'sync'} / ${last.status} - ${last.summary}` : 'No previous ledger event.',
    '',
    '## Response Contract',
    '',
    '- Answer only the scoped task.',
    '- Separate verified facts from inference.',
    '- Return one recommended next event if another agent should act.',
    target === 'ollama'
      ? '- You are stateless; do not assume filesystem or previous chat access beyond this brief.'
      : '- Validate against code or git before making risky claims.',
    '',
  ].join('\n');
}

function writeBriefPrompts(root, event, snapshot, dir) {
  const ps = paths(root, dir);
  const targets = event.target_agents && event.target_agents.length ? event.target_agents : ['ollama'];
  fs.mkdirSync(ps.briefsDir, { recursive: true });
  return reducer.withFileLock(ps.lock, () => reducer.materializeProjectionFiles(
    targets.map((target) => ({
      file: path.join(ps.briefsDir, `${event.id}-${target}.md`),
      data: renderBriefPrompt(event, snapshot, target) + '\n',
    })),
  ).map((entry) => entry.file));
}

function writeSnapshot(root, snapshot, dir, opts) {
  opts = opts || {};
  const ps = paths(root, dir);
  const write = () => {
    fs.mkdirSync(ps.promptsDir, { recursive: true });
    reducer.materializeProjectionFiles([
      { file: ps.snapshot, data: JSON.stringify(snapshot, null, 2) + '\n' },
      { file: ps.latest, data: renderSnapshot(snapshot) + '\n' },
      ...SYNC_AGENTS.map((agent) => ({
        file: path.join(ps.promptsDir, `${agent}.md`),
        data: renderAgentPrompt(snapshot, agent) + '\n',
      })),
    ]);
  };
  if (opts.lockHeld) return write();
  return reducer.withFileLock(ps.lock, write, opts.lock || {});
}

function simulationEvents() {
  return [
    {
      agent: 'claude-code',
      provider: 'anthropic',
      model: 'claude-code',
      execution_channel: 'subscription',
      kind: 'handoff',
      cadence: 'handoff',
      status: 'ready',
      scope: 'agent-sync-simulation',
      summary: 'Claude Code prepared a typed handoff and named Codex as verifier.',
      next: 'Codex validates the repo-local protocol and plugin.',
      files: ['AGENTS.md', 'CLAUDE.md', 'SYNC.md'],
      decisions: ['Use a local sync ledger instead of direct LLM-to-LLM chat'],
      evidence: ['doc', 'handoff'],
      confidence: 'high',
    },
    {
      agent: 'claude-code',
      provider: 'anthropic',
      model: 'claude-code',
      execution_channel: 'subscription',
      kind: 'brief',
      cadence: 'handoff',
      status: 'ready',
      scope: 'agent-sync-simulation',
      target_agents: ['codex', 'gemini-roo', 'ollama'],
      summary: 'Brief all agents from the same ledger snapshot.',
      task: 'Validate the same sync state and return compact evidence without assuming private memory.',
      context: 'This is an offline simulation of Claude Code, Codex, Roo/Gemini and a local Moo sharing one ledger.',
      deliverable: 'One compact checkpoint per agent, with evidence and uncertainty.',
      acceptance: ['latest.md and per-agent prompts come from one ledger', 'no live connector or model call is required'],
      guard: ['do not edit tools/router/classify.js', 'do not fabricate tests or connector access'],
      files: ['_handoff/agent-sync/latest.md', '_handoff/agent-sync/prompts/*.md'],
      evidence: ['handoff', 'doc'],
      confidence: 'high',
    },
    {
      agent: 'codex',
      provider: 'openai',
      model: 'codex',
      execution_channel: 'subscription',
      kind: 'review',
      cadence: 'checkpoint',
      status: 'in_progress',
      scope: 'agent-sync-simulation',
      summary: 'Codex read the handoff state and validated the agent sync surfaces.',
      next: 'Roo/Gemini performs adversarial review from the same snapshot.',
      files: ['docs/agent-context/AGENT_CONTEXT_PROTOCOL.md', 'tools/codex/plugins/mooter-agent-sync/skills/mooter-agent-sync/SKILL.md'],
      decisions: ['Do not claim live Notion or Obsidian access unless a connector is exposed'],
      evidence: ['code', 'doc'],
      confidence: 'medium',
    },
    {
      agent: 'gemini-roo',
      provider: 'google',
      model: 'gemini-roo',
      execution_channel: 'cloud',
      kind: 'review',
      cadence: 'checkpoint',
      status: 'ready',
      scope: 'agent-sync-simulation',
      summary: 'Roo/Gemini reviewed the same snapshot and returned a compact critique.',
      next: 'Local Ollama receives only the compact prompt and explicit files.',
      files: ['.roo/rules/mooter-agent-sync.md', '_handoff/agent-sync/latest.md'],
      decisions: ['Keep generated sync state short enough for cross-agent reuse'],
      evidence: ['doc', 'handoff'],
      confidence: 'medium',
    },
    {
      agent: 'ollama',
      provider: 'ollama',
      model: 'local-moo',
      execution_channel: 'local',
      kind: 'outcome',
      cadence: 'checkpoint',
      status: 'done',
      scope: 'agent-sync-simulation',
      summary: 'Local Moo summarized explicit sync context without assuming filesystem access.',
      next: 'Paulo reviews the simulated handoff proof before wiring automation.',
      files: ['_handoff/agent-sync/prompts/ollama.md'],
      decisions: ['Treat local models as stateless unless context is passed explicitly'],
      evidence: ['handoff', 'inference'],
      confidence: 'medium',
    },
  ];
}

function simulateConversation(root, dir, opts) {
  opts = opts || {};
  const simDir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agent-sync-sim-'));
  const base = opts.now ? new Date(opts.now) : new Date('2026-07-09T00:00:00.000Z');
  const events = simulationEvents().map((e, idx) => normalizeEvent({
    ...e,
    source: 'agent-sync-sim',
  }, {
    root,
    now: new Date(base.getTime() + idx * 1000).toISOString(),
    git: opts.git === false ? false : true,
  }));
  for (const ev of events) {
    const snap = appendEvent(root, ev, simDir);
    if (ev.kind === 'brief') writeBriefPrompts(root, ev, snap, simDir);
  }
  const all = readEvents(root, simDir);
  const snapshot = buildSnapshot(root, all, simDir);
  writeSnapshot(root, snapshot, simDir);
  const ps = paths(root, simDir);
  const presentAgents = SYNC_AGENTS.filter((a) => snapshot.latest_by_agent && snapshot.latest_by_agent[a]);
  const missingAgents = SYNC_AGENTS.filter((a) => !presentAgents.includes(a));
  const missingPrompts = SYNC_AGENTS
    .map((a) => path.join(ps.promptsDir, `${a}.md`))
    .filter((p) => !fs.existsSync(p));
  const briefEvent = events.find((e) => e.kind === 'brief');
  const briefTargets = briefEvent && briefEvent.target_agents ? briefEvent.target_agents : [];
  const missingBriefs = briefTargets
    .map((a) => path.join(ps.briefsDir, `${briefEvent.id}-${a}.md`))
    .filter((p) => !fs.existsSync(p));
  return {
    ok: missingAgents.length === 0 && missingPrompts.length === 0 && missingBriefs.length === 0 && snapshot.event_count >= SYNC_AGENTS.length,
    dir: simDir,
    latest: ps.latest,
    snapshot: ps.snapshot,
    events: ps.events,
    promptsDir: ps.promptsDir,
    briefsDir: ps.briefsDir,
    eventCount: snapshot.event_count,
    agents: presentAgents,
    missingAgents,
    missingPrompts,
    missingBriefs,
    classify: snapshot.classify,
    git: snapshot.git,
  };
}

function renderSimulationReport(result) {
  return [
    '# Mooter Agent Sync Simulation',
    '',
    `SIMULATION=${result.ok ? 'pass' : 'fail'}`,
    `dir: ${result.dir}`,
    `events: ${result.eventCount}`,
    `agents: ${result.agents.join(', ') || 'none'}`,
    `missing_agents: ${result.missingAgents.join(', ') || 'none'}`,
    `missing_prompts: ${result.missingPrompts.length}`,
    `missing_briefs: ${result.missingBriefs ? result.missingBriefs.length : 0}`,
    `classify.js: ${result.classify && result.classify.intact ? 'intact' : 'MISMATCH/unknown'} ${result.classify && result.classify.sha256 ? result.classify.sha256 : ''}`,
    '',
    'Flow:',
    '- claude-code writes a handoff plus one typed brief',
    '- codex and gemini-roo review the same snapshot',
    '- ollama receives only compact explicit context',
    '- latest.md, per-agent prompts and brief prompts are regenerated from the same ledger',
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function command(argv, opts) {
  opts = opts || {};
  const args = parseArgs(argv);
  const cmd = args._[0] || 'status';
  const root = findRepoRoot(args.root || opts.root || process.cwd());
  const dir = args.dir || opts.dir || defaultDir(root);
  if (cmd === 'hook') {
    const raw = opts.stdin != null ? opts.stdin : safeRead(0);
    const payload = safeJson(raw || '') || {};
    const hookRoot = findRepoRoot(args.root || payload.cwd || payload.project_dir || opts.root || process.cwd());
    if (!isMooterRoot(hookRoot)) return '';
    const hookDir = args.dir || opts.dir || defaultDir(hookRoot);
    const sid = payload.session_id || (payload.session && payload.session.id) || payload.sessionId || null;
    const ev = normalizeEvent({
      agent: 'claude-code',
      provider: payload.provider || 'anthropic',
      model: payload.model || null,
      execution_channel: payload.execution_channel || payload.channel || 'subscription',
      kind: args.kind || 'turn',
      cadence: args.cadence || 'turn',
      status: args.status || 'done',
      summary: args.summary || payload.summary || 'Claude Code turn completed',
      next: args.next || '',
      session_id: sid,
      session_title: payload.session_title || payload.sessionTitle || null,
      wave: payload.wave || null,
      pr: payload.pr || null,
      notion_ref: payload.notion_ref || payload.notion || null,
      obsidian_ref: payload.obsidian_ref || payload.obsidian || null,
      source: args.source || 'claude-code-hook',
    }, { root: hookRoot, now: opts.now, git: false });
    appendEvent(hookRoot, ev, hookDir, { git: false });
    return '';
  }
  if (cmd === 'record' || cmd === 'checkpoint') {
    const ev = normalizeEvent({
      agent: args.agent,
      provider: args.provider,
      model: args.model,
      execution_channel: args.channel,
      kind: args.kind || args.type,
      cadence: args.cadence || (cmd === 'checkpoint' ? 'checkpoint' : 'manual'),
      status: args.status,
      confidence: args.confidence,
      target_agents: args.to || args.targets || args.target_agents,
      evidence: args.evidence,
      scope: args.scope,
      summary: args.summary || args._.slice(1).join(' '),
      next: args.next,
      risk: args.risk,
      files: args.files,
      decisions: args.decisions,
      acceptance: args.acceptance || args.gate,
      guard: args.guard || args.guardrails,
      artifact: args.artifact,
      task: args.task,
      context: args.context,
      deliverable: args.deliverable,
      links: args.links,
      session_id: args.session || args.sid,
      session_title: args['session-title'] || args.title,
      run_id: args.run,
      wave: args.wave,
      pr: args.pr,
      notion_ref: args.notion,
      obsidian_ref: args.obsidian,
      source: args.source || 'manual',
    }, { root, now: opts.now, git: args.git === 'false' ? false : true });
    if (args['dry-run']) return JSON.stringify(ev, null, 2) + '\n';
    const snapshot = appendEvent(root, ev, dir);
    return renderSnapshot(snapshot) + '\n';
  }
  if (cmd === 'brief') {
    const targets = args.to || args.targets || args._[1] || 'ollama';
    const targetList = normalizeAgents(targets, 8);
    const task = args.task || args.summary || args._.slice(2).join(' ') || args._.slice(1).join(' ');
    const ev = normalizeEvent({
      agent: args.from || args.agent || 'claude-code',
      provider: args.provider,
      model: args.model,
      execution_channel: args.channel,
      kind: 'brief',
      cadence: args.cadence || 'handoff',
      status: args.status || 'ready',
      confidence: args.confidence,
      target_agents: targetList,
      evidence: args.evidence || 'handoff',
      scope: args.scope,
      summary: args.summary || `Brief to ${targetList.join(', ') || 'ollama'}: ${task}`,
      next: args.next || task,
      risk: args.risk,
      files: args.files,
      decisions: args.decisions,
      acceptance: args.acceptance || args.gate,
      guard: args.guard || args.guardrails,
      task,
      context: args.context,
      deliverable: args.deliverable,
      links: args.links,
      session_id: args.session || args.sid,
      session_title: args['session-title'] || args.title,
      run_id: args.run,
      wave: args.wave,
      pr: args.pr,
      notion_ref: args.notion,
      obsidian_ref: args.obsidian,
      source: args.source || 'agent-sync-brief',
    }, { root, now: opts.now, git: args.git === 'false' ? false : true });
    if (args['dry-run']) return JSON.stringify(ev, null, 2) + '\n';
    const snapshot = appendEvent(root, ev, dir);
    const written = args.write === 'false' ? [] : writeBriefPrompts(root, ev, snapshot, dir);
    return renderSnapshot(snapshot) + [
      '',
      'Brief prompts:',
      ...(written.length ? written.map((f) => `- ${f}`) : ['- skipped']),
      '',
    ].join('\n');
  }
  if (cmd === 'prompt') {
    const events = readEvents(root, dir);
    const snapshot = events.length ? buildSnapshot(root, events, dir) : buildSnapshot(root, [], dir);
    return renderAgentPrompt(snapshot, args.agent || args._[1] || 'codex');
  }
  if (cmd === 'simulate' || cmd === 'test-flow') {
    const simDir = args.dir || null;
    const result = simulateConversation(root, simDir, {
      now: opts.now,
      git: args.git === 'false' ? false : true,
    });
    if (args.json) return JSON.stringify(result, null, 2) + '\n';
    return renderSimulationReport(result) + '\n';
  }
  if (cmd === 'status') {
    const events = readEvents(root, dir);
    const snapshot = events.length ? buildSnapshot(root, events, dir) : buildSnapshot(root, [], dir);
    if (!args['no-write']) writeSnapshot(root, snapshot, dir);
    return renderSnapshot(snapshot) + '\n';
  }
  throw new Error(`unknown command: ${cmd}`);
}

module.exports = {
  SCHEMA_VERSION,
  EXPECTED_CLASSIFY_SHA,
  VALID_KINDS,
  VALID_EVIDENCE,
  SHARED_LANGUAGE,
  findRepoRoot,
  isMooterRoot,
  defaultDir,
  paths,
  normalizeAgent,
  normalizeAgents,
  normalizeChannel,
  normalizeEvent,
  readEvents,
  readContextEvents,
  selectContextEvents,
  writeContextEvents,
  appendEvent,
  buildSnapshot,
  renderSnapshot,
  renderAgentPrompt,
  renderBriefPrompt,
  writeBriefPrompts,
  simulationEvents,
  simulateConversation,
  renderSimulationReport,
  command,
};

if (require.main === module) {
  try {
    process.stdout.write(command(process.argv.slice(2)));
  } catch (err) {
    process.stderr.write((err && err.message ? err.message : String(err)) + '\n');
    process.exitCode = 1;
  }
}
