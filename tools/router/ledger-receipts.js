#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * Read-only receipts projection over the existing Mooter ledgers.
 *
 * Sources stay authoritative and append-only:
 *   - agent-sync events identify tasks, explicit starts/finishes and artifacts;
 *   - handoff-journal entries provide an observed start only when an explicit
 *     terminal event exists (they never become invented "active time");
 *   - savings-tracker.computeMetrics owns route-cost estimation;
 *   - Harmony Mesh fleet events own drift-catch counts once those checkers land.
 *
 * This module never writes any source or projection file.
 *
 * OTel GenAI namespace boundary (receipts-otel-v2-20260719):
 *
 * | campo atual | novo nome | racional |
 * |---|---|---|
 * | tokens | mooter.artifact.tokens | mede o artefacto tipado, não consumo de chamada |
 * | budget_tokens | mooter.budget.tokens | budget Lingua Franca ≠ gen_ai.request.max_tokens |
 * | cost_usd | mooter.cost.usd | OTel não tem atributo oficial de custo — não inventar no namespace deles |
 * | wall (da tarefa) | mooter.task.wall_ms | tarefa ≠ gen_ai.client.operation.duration (que é por chamada) |
 * | model (quando houver registro de chamada real) | gen_ai.request.model | semântica bate — adotar |
 * | (futuro, telemetria por chamada) | gen_ai.usage.input_tokens / output_tokens · spans invoke_agent/execute_tool | adotar SÓ quando a fonte for consumo real de chamada |
 *
 * Official references:
 * - https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-metrics.md
 * - https://github.com/open-telemetry/semantic-conventions/blob/main/model/gen-ai/spans.yaml
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const agentSync = require('./agent-sync-ledger.js');
const handoffJournal = require('./handoff-journal.js');

const TERMINAL_KINDS = new Set(['outcome', 'handoff', 'blocker']);
const TERMINAL_STATUS = new Set(['done', 'ready', 'blocked', 'needs_human']);
const START_KINDS = new Set(['intent', 'brief']);
const RECEIPT_KEYS = Object.freeze({
  ARTIFACT_TOKENS: 'mooter.artifact.tokens',
  BUDGET_TOKENS: 'mooter.budget.tokens',
  COST_USD: 'mooter.cost.usd',
  TASK_WALL_MS: 'mooter.task.wall_ms',
  REQUEST_MODEL: 'gen_ai.request.model',
});

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function readText(file, readFile = fs.readFileSync) {
  try { return readFile(file, 'utf8'); } catch { return null; }
}

function parseJsonl(text) {
  if (!text) return [];
  return String(text).split(/\r?\n/).filter(Boolean).map(safeJson).filter(Boolean);
}

function readJsonl(file, readFile = fs.readFileSync) {
  return parseJsonl(readText(file, readFile));
}

function finiteTime(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : null;
}

function taskKey(event) {
  return event.task_id || event.run_id || event.session_id || event.scope || (event.id ? `event:${event.id}` : null);
}

function shortText(value, max = 42) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? clean.slice(0, Math.max(1, max - 1)) + '…' : clean;
}

function usableTitle(value) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean && !/^[-=*_]{4,}$/.test(clean) ? clean : '';
}

function labelFor(events, key) {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    const title = usableTitle(event.session_title);
    if (title) return shortText(title);
    if (event.brief && event.brief.task) return shortText(event.brief.task);
    if (event.scope) return shortText(event.scope);
    if (event.summary) return shortText(event.summary);
  }
  return shortText(key);
}

function loadPreflight(root, opts = {}) {
  if (opts.preflight) return opts.preflight;
  const candidates = [
    path.join(root, 'tools', 'handoff-preflight.js'),
    path.resolve(__dirname, '..', 'handoff-preflight.js'),
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* try the next repo-local candidate */ }
  }
  return null;
}

function normalizeArtifactRef(root, ref) {
  const raw = String(ref || '').trim();
  if (!raw || /^[a-z]+:\/\//i.test(raw)) return null;
  let candidate = raw;
  if (!fs.existsSync(candidate)) candidate = candidate.replace(/:(\d+)(?:-(\d+))?$/, '');
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(path.resolve(root), absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return { absolute, relative: relative.split(path.sep).join('/') };
}

function detectMessageType(text, preflight) {
  if (!preflight || typeof preflight.normalizeMessageType !== 'function') return null;
  const source = String(text || '');
  const frontmatter = source.match(/^---\s*\n[\s\S]*?^type:\s*["']?([^\n"']+)["']?\s*$[\s\S]*?^---\s*$/mi);
  if (frontmatter) {
    const type = preflight.normalizeMessageType(frontmatter[1]);
    if (type) return type;
  }
  const head = source.split(/\r?\n/).slice(0, 12).join('\n');
  const heading = head.match(/(?:^|·|#)\s*(MASTERPROMPT|HANDOFF|DECISION[ _-]+CONTRACT|BRIEF)\b/im);
  return heading ? preflight.normalizeMessageType(heading[1]) : null;
}

function measureArtifact(root, ref, opts = {}) {
  const resolved = normalizeArtifactRef(root, ref);
  if (!resolved) return null;
  const text = readText(resolved.absolute, opts.readFile);
  if (text == null) return null;
  const preflight = loadPreflight(root, opts);
  if (!preflight) {
    return {
      type: null, source: resolved.relative,
      [RECEIPT_KEYS.ARTIFACT_TOKENS]: null,
      [RECEIPT_KEYS.BUDGET_TOKENS]: null,
      within_budget: null, basis: 'n/d', reason: 'token-warden unavailable',
    };
  }
  const type = detectMessageType(text, preflight);
  if (!type) return null;
  const protocolText = readText(path.join(root, 'docs', 'agent-context', 'AGENT_CONTEXT_PROTOCOL.md'), opts.readFile);
  const parsed = typeof preflight.parseMessageContracts === 'function'
    ? preflight.parseMessageContracts(protocolText == null ? '' : protocolText)
    : { ok: false, contracts: [] };
  const contract = parsed.contracts && parsed.contracts.find((entry) => entry.type === type);
  const tokens = typeof preflight.estimateTokens === 'function' ? preflight.estimateTokens(text) : null;
  const budget = contract && Number.isFinite(contract.budgetTokens) ? contract.budgetTokens : null;
  return {
    type,
    source: resolved.relative,
    [RECEIPT_KEYS.ARTIFACT_TOKENS]: Number.isFinite(tokens) ? tokens : null,
    [RECEIPT_KEYS.BUDGET_TOKENS]: budget,
    within_budget: Number.isFinite(tokens) && Number.isFinite(budget) ? tokens <= budget : null,
    basis: Number.isFinite(tokens) ? 'tools/handoff-preflight.js#estimateTokens' : 'n/d',
    reason: budget == null ? (parsed.err || 'typed-message budget unavailable') : null,
  };
}

function messageReceipts(root, events, opts = {}) {
  const refs = [];
  for (const event of events) {
    if (event.artifact) refs.push(event.artifact);
    if (Array.isArray(event.files)) refs.push(...event.files);
  }
  const seen = new Set();
  const receipts = [];
  for (const ref of refs) {
    const measured = measureArtifact(root, ref, opts);
    if (!measured || seen.has(measured.source)) continue;
    seen.add(measured.source);
    receipts.push(measured);
  }
  return receipts;
}

function journalEntries(sessionId, opts = {}) {
  if (!sessionId) return [];
  if (opts.journalBySession && Object.prototype.hasOwnProperty.call(opts.journalBySession, sessionId)) {
    return opts.journalBySession[sessionId] || [];
  }
  if (opts.journalDir) return readJsonl(path.join(opts.journalDir, `${sessionId}.jsonl`), opts.readFile);
  try { return handoffJournal.readJournal(sessionId); } catch { return []; }
}

function timingReceipt(events, journal) {
  const chronological = events
    .map((event) => ({ event, ms: finiteTime(event.ts) }))
    .filter((entry) => entry.ms != null)
    .sort((a, b) => a.ms - b.ms);
  const start = chronological.find((entry) => START_KINDS.has(entry.event.kind));
  const terminal = chronological
    .filter((entry) => TERMINAL_KINDS.has(entry.event.kind) && TERMINAL_STATUS.has(entry.event.status))
    .at(-1);
  let startMs = start ? start.ms : null;
  let basis = start ? `agent-sync:${start.event.kind}->${terminal ? terminal.event.kind : 'n/d'}` : null;
  if (startMs == null && terminal) {
    const firstJournal = (journal || [])
      .map((entry) => finiteTime(entry && entry.ts))
      .filter((ms) => ms != null)
      .sort((a, b) => a - b)[0];
    if (firstJournal != null) {
      startMs = firstJournal;
      basis = `handoff-journal:first-observation->agent-sync:${terminal.event.kind}`;
    }
  }
  if (startMs == null || !terminal || terminal.ms <= startMs) {
    return {
      [RECEIPT_KEYS.TASK_WALL_MS]: null,
      started_at: startMs == null ? null : new Date(startMs).toISOString(),
      completed_at: null,
      basis: 'n/d',
    };
  }
  return {
    [RECEIPT_KEYS.TASK_WALL_MS]: terminal.ms - startMs,
    started_at: new Date(startMs).toISOString(),
    completed_at: new Date(terminal.ms).toISOString(),
    basis,
  };
}

function decisionTime(entry) {
  const value = entry && entry.value;
  if (!value) return null;
  const tsMs = Number(value.ts_ms);
  if (Number.isFinite(tsMs) && tsMs > 0) return tsMs;
  return finiteTime(value.ts);
}

function routeReceipt(sessionId, decisionRecords, timing = null, opts = {}) {
  const empty = (model = null) => ({
    [RECEIPT_KEYS.COST_USD]: null,
    [RECEIPT_KEYS.REQUEST_MODEL]: model,
    estimated: null,
    routes: null,
    basis: 'n/d',
  });
  if (!sessionId) return empty();
  const start = timing ? finiteTime(timing.started_at) : null;
  const end = timing ? finiteTime(timing.completed_at) : null;
  if (timing && (start == null || end == null)) {
    return empty();
  }
  const scoped = decisionRecords.filter((entry) => {
    if (!entry || !entry.value || entry.value.session_id !== sessionId) return false;
    if (!timing) return true;
    const ts = decisionTime(entry);
    return ts != null && ts >= start && ts <= end;
  });
  const executed = scoped.filter((entry) => entry.value.event === 'executed');
  const models = new Set(executed
    .map((entry) => entry.value.model_used || entry.value.model || entry.value.recommended_model)
    .filter((model) => typeof model === 'string' && model.trim())
    .map((model) => model.trim()));
  const recordedModel = models.size === 1 ? [...models][0] : null;
  const fullyMeasured = executed.length > 0 && executed.every((entry) => (
    typeof entry.value.cost_usd === 'number' && Number.isFinite(entry.value.cost_usd)
  ));
  if (fullyMeasured) {
    return {
      [RECEIPT_KEYS.COST_USD]: executed.reduce((sum, entry) => sum + Number(entry.value.cost_usd), 0),
      [RECEIPT_KEYS.REQUEST_MODEL]: recordedModel,
      estimated: false,
      routes: executed.length,
      basis: 'savings-tracker:executed.cost_usd',
    };
  }
  if (!scoped.length) return empty();
  let tracker = opts.savingsTracker;
  if (!tracker) {
    try { tracker = require('./savings-tracker.js'); } catch { tracker = null; }
  }
  if (!tracker || typeof tracker.computeMetrics !== 'function') {
    return empty(recordedModel);
  }
  try {
    const metrics = tracker.computeMetrics(scoped.map((entry) => entry.raw));
    if (!metrics || !Number.isFinite(metrics.prompts) || metrics.prompts <= 0 || !Number.isFinite(metrics.real_cost_estimated)) {
      return empty(recordedModel);
    }
    return {
      [RECEIPT_KEYS.COST_USD]: metrics.real_cost_estimated,
      [RECEIPT_KEYS.REQUEST_MODEL]: recordedModel,
      estimated: true,
      routes: metrics.prompts,
      basis: 'savings-tracker.computeMetrics:real_cost_estimated',
    };
  } catch {
    return empty(recordedModel);
  }
}

function meshState(root, fleetEvents, timing, opts = {}) {
  const available = opts.meshAvailable !== undefined
    ? !!opts.meshAvailable
    : fs.existsSync(path.join(root, 'tools', 'router', 'mesh-cycle.js'));
  if (!available || timing.started_at == null || timing.completed_at == null) {
    return { catches: null, checks: null, basis: 'n/d' };
  }
  const start = finiteTime(timing.started_at);
  const end = finiteTime(timing.completed_at);
  const checks = fleetEvents.filter((event) => {
    const ts = finiteTime(event && event.ts);
    return event && event.event === 'mesh_check' && ts != null && start != null && end != null && ts >= start && ts <= end;
  });
  if (!checks.length) return { catches: null, checks: null, basis: 'n/d' };
  return {
    catches: checks.reduce((sum, event) => sum + (Number.isFinite(Number(event.findings)) ? Number(event.findings) : 0), 0),
    checks: checks.length,
    basis: 'fleet-ledger:mesh_check.findings',
  };
}

function decisionEntries(lines) {
  return (lines || []).map((raw) => ({ raw, value: safeJson(raw) })).filter((entry) => entry.value);
}

function buildReceipts(input, opts = {}) {
  const root = path.resolve(input.root || process.cwd());
  const groups = new Map();
  for (const event of input.events || []) {
    const key = taskKey(event);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const decisions = decisionEntries(input.decisionLines || []);
  const tasks = [];
  for (const [key, events] of groups) {
    events.sort((a, b) => (finiteTime(a.ts) || 0) - (finiteTime(b.ts) || 0));
    const sessionId = events.map((event) => event.session_id).find(Boolean) || null;
    const journal = journalEntries(sessionId, { ...opts, journalBySession: input.journalBySession, journalDir: input.journalDir });
    const timing = timingReceipt(events, journal);
    const messages = messageReceipts(root, events, opts);
    const route = routeReceipt(sessionId, decisions, timing, opts);
    const drift = meshState(root, input.fleetEvents || [], timing, opts);
    tasks.push({
      task_id: key,
      label: labelFor(events, key),
      session_id: sessionId,
      status: events.at(-1).status || 'unknown',
      events: events.length,
      journal_turns: journal.length,
      timing,
      messages,
      route,
      drift,
    });
  }
  tasks.sort((a, b) => (finiteTime(b.timing.completed_at || b.timing.started_at) || 0) - (finiteTime(a.timing.completed_at || a.timing.started_at) || 0));
  return tasks;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { out._.push(arg); continue; }
    const eq = arg.indexOf('=');
    if (eq >= 0) out[arg.slice(2, eq)] = arg.slice(eq + 1);
    else out[arg.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

function resolveEventsFile(root, raw) {
  if (!raw) return agentSync.paths(root).events;
  const resolved = path.resolve(String(raw));
  try { if (fs.statSync(resolved).isDirectory()) return path.join(resolved, 'events.jsonl'); } catch { /* missing remains a file candidate */ }
  return resolved;
}

function loadInputs(argv, opts = {}) {
  const args = parseArgs(argv);
  const root = agentSync.findRepoRoot(args.root || opts.root || process.cwd());
  const eventsFile = resolveEventsFile(root, args.ledger || args.dir || opts.ledger);
  const decisionsFile = path.resolve(String(args.decisions || opts.decisions || path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log')));
  const journalDir = path.resolve(String(args['journal-dir'] || opts.journalDir || path.join(__dirname, 'handoff')));
  const fleetFile = path.resolve(String(args['fleet-ledger'] || opts.fleetLedger || path.join(root, '_handoff', 'fleet', 'fleet-ledger.jsonl')));
  const eventText = readText(eventsFile, opts.readFile);
  const decisionText = readText(decisionsFile, opts.readFile);
  const fleetText = readText(fleetFile, opts.readFile);
  return {
    args,
    root,
    files: { events: eventsFile, decisions: decisionsFile, journal: journalDir, fleet: fleetFile },
    availability: { events: eventText != null, decisions: decisionText != null, journal: fs.existsSync(journalDir), fleet: fleetText != null },
    input: {
      root,
      events: parseJsonl(eventText),
      decisionLines: decisionText == null ? [] : decisionText.split(/\r?\n/).filter(Boolean),
      journalDir,
      fleetEvents: parseJsonl(fleetText),
    },
  };
}

function fmtDuration(ms) {
  if (!Number.isFinite(ms)) return 'n/d';
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function fmtCost(route) {
  const cost = route && route[RECEIPT_KEYS.COST_USD];
  if (!Number.isFinite(cost)) return 'n/d';
  return `${route.estimated ? '~' : ''}$${cost.toFixed(4)}`;
}

function fmtTokens(message) {
  const tokens = message && message[RECEIPT_KEYS.ARTIFACT_TOKENS];
  const budget = message && message[RECEIPT_KEYS.BUDGET_TOKENS];
  if (!Number.isFinite(tokens) || !Number.isFinite(budget)) return 'n/d';
  return `${tokens}/${budget} ${message.within_budget ? '✓' : '!'}`;
}

function table(rows) {
  const headers = ['TASK', 'WALL', 'MESSAGE', 'TOKENS/BUDGET', 'ROUTE $', 'DRIFT'];
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[index]).length)));
  const line = (row) => row.map((cell, index) => String(cell).padEnd(widths[index])).join('  ').trimEnd();
  return [line(headers), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join('\n');
}

function renderHuman(tasks, meta = {}) {
  const rows = [];
  for (const task of tasks) {
    const messages = task.messages.length ? task.messages : [null];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      rows.push([
        i === 0 ? shortText(task.label || task.task_id, 34) : '↳',
        i === 0 ? fmtDuration(task.timing[RECEIPT_KEYS.TASK_WALL_MS]) : '',
        message ? message.type : 'n/d',
        fmtTokens(message),
        i === 0 ? fmtCost(task.route) : '',
        i === 0 ? (Number.isFinite(task.drift.catches) ? String(task.drift.catches) : 'n/d') : '',
      ]);
    }
  }
  return [
    'mooter receipts',
    `ledger: ${meta.eventsAvailable ? meta.eventsFile : 'n/d'}`,
    'basis: wall = explicit intent/brief -> outcome/handoff/blocker; ~$ = savings-tracker estimate; drift = mesh catches observed inside wall interval; n/d = not measured',
    '',
    rows.length ? table(rows) : 'No receipt-bearing Ledger tasks found.',
    '',
  ].join('\n');
}

function command(argv, opts = {}) {
  const loaded = loadInputs(argv, opts);
  let tasks = buildReceipts(loaded.input, {
    ...opts,
    journalDir: loaded.input.journalDir,
  });
  const last = Number(loaded.args.last);
  if (Number.isFinite(last) && last > 0) tasks = tasks.slice(0, last);
  const payload = {
    schema_version: 'mooter-receipts.v1',
    generated_at: new Date().toISOString(),
    read_only: true,
    sources: {
      agent_sync: loaded.availability.events ? loaded.files.events : null,
      handoff_journal: loaded.availability.journal ? loaded.files.journal : null,
      savings_tracker: loaded.availability.decisions ? loaded.files.decisions : null,
      mesh_fleet: loaded.availability.fleet && fs.existsSync(path.join(loaded.root, 'tools', 'router', 'mesh-cycle.js')) ? loaded.files.fleet : null,
    },
    tasks,
  };
  if (loaded.args.json) return JSON.stringify(payload, null, 2) + '\n';
  return renderHuman(tasks, { eventsAvailable: loaded.availability.events, eventsFile: loaded.files.events });
}

module.exports = {
  RECEIPT_KEYS,
  safeJson,
  parseJsonl,
  taskKey,
  detectMessageType,
  measureArtifact,
  messageReceipts,
  timingReceipt,
  routeReceipt,
  meshState,
  buildReceipts,
  fmtDuration,
  fmtCost,
  fmtTokens,
  renderHuman,
  command,
};

if (require.main === module) {
  try { process.stdout.write(command(process.argv.slice(2))); }
  catch (error) {
    process.stderr.write((error && error.message ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  }
}
