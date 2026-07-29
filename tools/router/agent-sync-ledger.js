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

const SCHEMA_VERSION = 'agent-sync-ledger.v3';
const RECEIPT_SCHEMA_VERSION = 'agent-sync-receipt.v2';
const EXPECTED_CLASSIFY_SHA =
  '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f';

const VALID_AGENTS = new Set(['claude-code', 'codex', 'gemini-roo', 'ollama', 'cowork', 'paulo', 'unknown']);
const VALID_CADENCES = new Set(['prompt', 'turn', 'checkpoint', 'handoff', 'pr', 'wave', 'release', 'manual']);
const VALID_STATUS = new Set(['in_progress', 'blocked', 'ready', 'done', 'needs_human', 'unknown']);
const VALID_KINDS = new Set(['sync', 'intent', 'brief', 'turn', 'decision', 'artifact', 'gate', 'handoff', 'outcome', 'review', 'blocker']);
const VALID_EVIDENCE = new Set(['code', 'test', 'git', 'doc', 'handoff', 'notion-export', 'obsidian-vault', 'runtime', 'connector', 'inference']);
const VALID_CONFIDENCE = new Set(['low', 'medium', 'high', 'unknown']);
const VALID_CHANNELS = new Set(['local', 'subscription', 'api', 'cloud', 'unknown']);
const MAX_SNAPSHOT_EVENTS = 400;
const SYNC_AGENTS = ['claude-code', 'codex', 'gemini-roo', 'ollama'];
const DURABLE_RECEIPT_KINDS = new Set(['decision', 'gate', 'handoff', 'outcome', 'review', 'blocker']);
const RECEIPT_ROOT = path.join('30-learnings', 'agent-sync');
const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}\b/i,
  /\b(?:api[_-]?key|access[_-]?token|token|password|secret)\s*[:=]\s*[^\s,;]{8,}/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
];
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

function atomicWrite(file, content) {
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temp, content, 'utf8');
  try {
    fs.renameSync(temp, file);
  } catch (err) {
    try { fs.unlinkSync(temp); } catch { /* best effort cleanup */ }
    throw err;
  }
}

function safeDeviceId(home) {
  // Identity lookup must be read-only. Requiring identity.js here used to run
  // its legacy credential migration as a module-load side effect.
  const base = home || os.homedir();
  for (const file of [
    path.join(base, '.mooter', 'device.id'),
    path.join(base, '.frugal', 'device.id'),
  ]) {
    const value = safeRead(file);
    if (value && value.trim()) return clamp(value.trim(), 120);
  }
  return null;
}

function parseIso(value) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizeDuration(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function timingSnapshot(input, now) {
  let startedAt = parseIso(input.started_at || input.startedAt);
  const endedAt = parseIso(input.ended_at || input.endedAt) || parseIso(now);
  let durationMs = normalizeDuration(input.duration_ms != null ? input.duration_ms : input.durationMs);
  if (startedAt && endedAt) durationMs = Math.max(0, Date.parse(endedAt) - Date.parse(startedAt));
  if (!startedAt && endedAt && durationMs != null) {
    startedAt = new Date(Date.parse(endedAt) - durationMs).toISOString();
  }
  const requestedBasis = String(input.timing_basis || input.timingBasis || '').toLowerCase();
  const timingBasis = ['wall_clock', 'runtime_reported'].includes(requestedBasis)
    ? requestedBasis
    : (startedAt && endedAt && durationMs != null ? 'wall_clock' : (durationMs != null ? 'runtime_reported' : 'unknown'));
  return { started_at: startedAt, ended_at: endedAt, duration_ms: durationMs, timing_basis: timingBasis };
}

function sanitizeRemote(value) {
  const remote = clamp(value, 500);
  if (!remote) return null;
  return remote
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/i, '$1')
    .replace(/(https?:\/\/)[^/\s@]+@/i, '$1');
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
    snapshot: path.join(d, 'snapshot.json'),
    latest: path.join(d, 'latest.md'),
    promptsDir: path.join(d, 'prompts'),
    briefsDir: path.join(d, 'briefs'),
    projectionLog: path.join(d, 'vault-projection.jsonl'),
  };
}

function gitSnapshot(root) {
  const out = {
    branch: null,
    head: null,
    dirty: null,
    ahead: null,
    worktree: path.resolve(root),
    remote: null,
    error: null,
  };
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
    const remote = childProcess.spawnSync('git', common.concat(['remote', 'get-url', 'origin']), {
      encoding: 'utf8',
      timeout: 1200,
    });
    if (remote.status === 0) out.remote = sanitizeRemote(remote.stdout.trim());
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

function deviceSnapshot(input, opts) {
  opts = opts || {};
  if (opts.device === false) return null;
  const canonicalId = safeDeviceId(opts.home);
  return {
    id: clamp(input.device_id || input.deviceId || canonicalId || '', 120) || null,
    name: clamp(input.device_name || input.deviceName || os.hostname(), 160) || null,
    platform: clamp(input.device_platform || input.devicePlatform || process.platform, 40) || null,
    arch: clamp(input.device_arch || input.deviceArch || process.arch, 40) || null,
  };
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
  const timing = timingSnapshot(input, now);
  const rawSummary = input.summary || input.message || input.text || (brief && brief.task ? `Brief: ${brief.task}` : '');
  const summary = clamp(rawSummary, 700);
  const kind = normalizeKind(input.kind || input.type, cadence);
  const event = {
    schema_version: SCHEMA_VERSION,
    id: input.id || crypto.createHash('sha256')
      .update([now, agent, cadence, summary, Math.random()].join('|'))
      .digest('hex').slice(0, 16),
    ts: now,
    started_at: timing.started_at,
    ended_at: timing.ended_at,
    duration_ms: timing.duration_ms,
    timing_basis: timing.timing_basis,
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
    parent_event_id: clamp(input.parent_event_id || input.parent || '', 120) || null,
    recorded_by: normalizeAgent(input.recorded_by || input.recorder || agent),
    wave: clamp(input.wave || '', 120) || null,
    pr: clamp(input.pr || '', 120) || null,
    notion_ref: clamp(input.notion_ref || input.notion || '', 240) || null,
    obsidian_ref: clamp(input.obsidian_ref || input.obsidian || '', 240) || null,
    source: clamp(input.source || 'manual', 80),
    device: deviceSnapshot(input, opts),
    git: opts.git === false ? null : gitSnapshot(root),
    classify: opts.classify === false ? null : classifySnapshot(root),
  };
  return event;
}

function readEvents(root, dir) {
  const p = paths(root, dir).events;
  const raw = safeRead(p);
  if (!raw) return [];
  const events = [];
  const malformed = [];
  for (const [index, line] of raw.split('\n').entries()) {
    if (!line) continue;
    const event = safeJson(line);
    if (event) events.push(event);
    else malformed.push(index + 1);
  }
  if (malformed.length) {
    throw new Error(`agent-sync ledger malformed JSON at ${p}:${malformed.slice(0, 10).join(',')}`);
  }
  return events;
}

function appendEvent(root, event, dir, opts) {
  const ps = paths(root, dir);
  fs.mkdirSync(ps.dir, { recursive: true });
  fs.appendFileSync(ps.events, JSON.stringify(event) + '\n');
  const events = readEvents(root, dir);
  // events.jsonl is append-only. Only derived projections are windowed.
  const snapshot = buildSnapshot(root, events.slice(-MAX_SNAPSHOT_EVENTS), dir, opts);
  writeSnapshot(root, snapshot, dir);
  if (process.env.MOOTER_AGENT_SYNC_VAULT_AUTO_PUBLISH === '1') {
    try {
      const published = publishVault(root, [event], {
        vault: process.env.VAULT_PATH,
        project: process.env.MOOTER_AGENT_SYNC_PROJECT || 'mooter',
      });
      fs.appendFileSync(ps.projectionLog, JSON.stringify({
        ts: new Date().toISOString(),
        event_id: event.id,
        status: published.published.length ? 'vault_local_published' : 'vault_local_unchanged',
        vault_remote: 'pending',
      }) + '\n');
    } catch (err) {
      // Hooks stay fail-soft, but projection failures must never be invisible.
      try {
        fs.appendFileSync(ps.projectionLog, JSON.stringify({
          ts: new Date().toISOString(),
          event_id: event.id,
          status: 'vault_local_failed',
          error: clamp(err && err.message ? err.message : String(err), 240),
        }) + '\n');
      } catch { /* the local ledger event itself is still durable */ }
    }
  }
  return snapshot;
}

function stringValues(value, out) {
  out = out || [];
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) {
    for (const item of value) stringValues(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) stringValues(item, out);
  }
  return out;
}

function containsSecret(value) {
  return stringValues(value).some((text) => SECRET_PATTERNS.some((pattern) => pattern.test(text)));
}

function validateEvent(event) {
  const errors = [];
  const warnings = [];
  const llmAgent = event && !['paulo', 'unknown'].includes(event.agent);
  if (!event || typeof event !== 'object') return { ok: false, complete: false, errors: ['event_missing'], warnings };
  if (!event.id) errors.push('id_missing');
  if (!parseIso(event.ts)) errors.push('ts_invalid');
  if (!event.agent || event.agent === 'unknown') errors.push('agent_unknown');
  if (!event.recorded_by || event.recorded_by === 'unknown') errors.push('recorded_by_unknown');
  if (event.agent === 'ollama' && event.recorded_by === 'ollama') errors.push('local_model_recorder_missing');
  if (llmAgent && !event.provider) errors.push('provider_missing');
  if (llmAgent && !event.model) errors.push('model_missing');
  if (llmAgent && (!event.execution_channel || event.execution_channel === 'unknown')) errors.push('execution_channel_unknown');
  if (!event.status || event.status === 'unknown') errors.push('status_unknown');
  if (!event.summary || event.summary === '(no summary supplied)') errors.push('summary_missing');
  if (!event.source) errors.push('source_missing');
  if (!event.device) errors.push('device_missing');
  else {
    if (!event.device.id) errors.push('device.id_missing');
    if (!event.device.name) errors.push('device.name_missing');
    if (!event.device.platform) errors.push('device.platform_missing');
    if (!event.device.arch) errors.push('device.arch_missing');
  }
  if (containsSecret(event)) errors.push('possible_secret');
  if (!parseIso(event.ended_at || event.ts)) warnings.push('ended_at_missing');
  if (!parseIso(event.started_at)) warnings.push('started_at_missing');
  if (normalizeDuration(event.duration_ms) == null) warnings.push('duration_ms_missing');
  if (normalizeDuration(event.duration_ms) != null && !['wall_clock', 'runtime_reported'].includes(event.timing_basis)) {
    warnings.push('timing_basis_unknown');
  }
  if (!event.next) warnings.push('next_missing');
  if (!Array.isArray(event.evidence) || event.evidence.length === 0) warnings.push('evidence_missing');
  if (!event.git) warnings.push('git_snapshot_missing');
  if (event.classify && event.classify.intact === false) errors.push('classify_sha_mismatch');
  return { ok: errors.length === 0, complete: errors.length === 0 && warnings.length === 0, errors, warnings };
}

function auditEvents(events) {
  const rows = (events || []).map((event) => ({ id: event.id || null, ...validateEvent(event) }));
  const byAgent = {};
  const byDevice = {};
  for (let i = 0; i < (events || []).length; i++) {
    const event = events[i] || {};
    const row = rows[i];
    const agent = event.agent || 'unknown';
    const device = event.device && (event.device.id || event.device.name) || 'unknown';
    if (!byAgent[agent]) byAgent[agent] = { events: 0, valid: 0, complete: 0 };
    if (!byDevice[device]) byDevice[device] = { events: 0, valid: 0, complete: 0 };
    byAgent[agent].events++;
    byDevice[device].events++;
    if (row.ok) {
      byAgent[agent].valid++;
      byDevice[device].valid++;
    }
    if (row.complete) {
      byAgent[agent].complete++;
      byDevice[device].complete++;
    }
  }
  const errors = rows.reduce((sum, row) => sum + row.errors.length, 0);
  const warnings = rows.reduce((sum, row) => sum + row.warnings.length, 0);
  return {
    schema_version: SCHEMA_VERSION,
    event_count: rows.length,
    valid_count: rows.filter((row) => row.ok).length,
    complete_count: rows.filter((row) => row.complete).length,
    errors,
    warnings,
    ok: rows.length > 0 && errors === 0,
    complete: rows.length > 0 && errors === 0 && warnings === 0,
    by_agent: byAgent,
    by_device: byDevice,
    rows,
  };
}

function renderAuditReport(audit) {
  const agentLines = Object.entries(audit.by_agent || {}).map(([name, row]) =>
    `- ${name}: ${row.valid}/${row.events} valid · ${row.complete}/${row.events} complete`);
  const deviceLines = Object.entries(audit.by_device || {}).map(([name, row]) =>
    `- ${name}: ${row.valid}/${row.events} valid · ${row.complete}/${row.events} complete`);
  const issueLines = (audit.rows || [])
    .filter((row) => row.errors.length || row.warnings.length)
    .slice(-20)
    .map((row) => `- ${row.id || 'n/d'}: errors=${row.errors.join(',') || 'none'} warnings=${row.warnings.join(',') || 'none'}`);
  return [
    '# Mooter Agent Sync Audit',
    '',
    `EVENT_AUDIT=${audit.ok ? (audit.complete ? 'pass' : 'pass_with_gaps') : 'fail'}`,
    'FLEET_COVERAGE=not_checked',
    `events: ${audit.event_count}`,
    `valid: ${audit.valid_count}`,
    `complete: ${audit.complete_count}`,
    `errors: ${audit.errors}`,
    `warnings: ${audit.warnings}`,
    '',
    '## By Agent',
    '',
    ...(agentLines.length ? agentLines : ['- none']),
    '',
    '## By Device',
    '',
    ...(deviceLines.length ? deviceLines : ['- none']),
    '',
    '## Gaps',
    '',
    ...(issueLines.length ? issueLines : ['- none']),
    '',
  ].join('\n');
}

function safeSegment(value, fallback) {
  return clamp(value || fallback || 'unknown', 120)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback || 'unknown';
}

function resolveVaultPath(explicitPath) {
  const isVault = (candidate) => Boolean(
    candidate &&
    fs.existsSync(path.join(candidate, 'AGENTS.md')) &&
    fs.existsSync(path.join(candidate, '00-core')) &&
    fs.existsSync(path.join(candidate, '10-projects')) &&
    fs.existsSync(path.join(candidate, '00-core', 'agent-sync-protocol.md'))
  );
  if (explicitPath) {
    const resolved = path.resolve(String(explicitPath));
    return isVault(resolved) ? resolved : null;
  }
  const candidates = [
    process.env.VAULT_PATH,
    path.join(os.homedir(), 'paulo-vault'),
    path.join(os.homedir(), 'Documents', 'paulo-vault'),
  ].filter(Boolean).map((item) => path.resolve(String(item)));
  return candidates.find(isVault) || null;
}

function receiptEvent(event, project) {
  const git = event.git || {};
  const receipt = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    project,
    event_id: event.id,
    ts: event.ts,
    started_at: event.started_at || null,
    ended_at: event.ended_at || event.ts || null,
    duration_ms: normalizeDuration(event.duration_ms),
    timing_basis: event.timing_basis || 'unknown',
    agent: event.agent,
    recorded_by: event.recorded_by || event.agent,
    provider: event.provider || null,
    model: event.model || null,
    execution_channel: event.execution_channel || 'unknown',
    kind: event.kind,
    cadence: event.cadence,
    status: event.status,
    confidence: event.confidence || 'unknown',
    source: event.source,
    session_id: event.session_id || null,
    run_id: event.run_id || null,
    parent_event_id: event.parent_event_id || null,
    device: event.device,
    git: event.git ? {
      branch: git.branch || null,
      head: git.head || null,
      dirty: git.dirty == null ? null : git.dirty,
      ahead: git.ahead == null ? null : git.ahead,
      worktree: git.worktree || null,
      remote: sanitizeRemote(git.remote),
    } : null,
    scope: event.scope || null,
    summary: event.summary,
    next: event.next || null,
    risk: event.risk || null,
    evidence: event.evidence || [],
    files: event.files || [],
    decisions: event.decisions || [],
    acceptance: event.acceptance || [],
    guard: event.guard || [],
    artifact: event.artifact || null,
    wave: event.wave || null,
    pr: event.pr || null,
    notion_ref: event.notion_ref || null,
    obsidian_ref: event.obsidian_ref || null,
  };
  receipt.integrity_sha256 = crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
  return receipt;
}

function yamlValue(value) {
  if (value == null) return '"n/d"';
  return JSON.stringify(value);
}

function renderVaultReceipt(event, project) {
  const receipt = receiptEvent(event, project);
  const timing = receipt.duration_ms == null ? 'n/d' : `${receipt.duration_ms} ms`;
  const device = receipt.device || {};
  const git = receipt.git || {};
  return [
    '---',
    `type: ${yamlValue('agent-sync-receipt')}`,
    `schema: ${yamlValue(RECEIPT_SCHEMA_VERSION)}`,
    `project: ${yamlValue(receipt.project)}`,
    `event_id: ${yamlValue(receipt.event_id)}`,
    `ts: ${yamlValue(receipt.ts)}`,
    `device_id: ${yamlValue(device.id)}`,
    `agent: ${yamlValue(receipt.agent)}`,
    `provider: ${yamlValue(receipt.provider)}`,
    `model: ${yamlValue(receipt.model)}`,
    `execution_channel: ${yamlValue(receipt.execution_channel)}`,
    `status: ${yamlValue(receipt.status)}`,
    `integrity_sha256: ${yamlValue(receipt.integrity_sha256)}`,
    '---',
    '',
    '<!-- agent-sync-receipt-json',
    JSON.stringify(receipt),
    '-->',
    '',
    `# Agent Sync · ${receipt.event_id}`,
    '',
    `- **Quando:** ${receipt.started_at || 'n/d'} → ${receipt.ended_at || receipt.ts || 'n/d'} · ${timing} · basis=${receipt.timing_basis || 'unknown'}`,
    `- **Onde:** ${device.name || 'n/d'} · ${device.id || 'n/d'} · ${device.platform || 'n/d'}/${device.arch || 'n/d'}`,
    `- **Git:** ${git.branch || 'n/d'} @ ${git.head || 'n/d'} · dirty=${git.dirty == null ? 'n/d' : git.dirty} · worktree=${git.worktree || 'n/d'}`,
    `- **Como:** ${receipt.agent || 'n/d'} via ${receipt.provider || 'n/d'}/${receipt.model || 'n/d'} (${receipt.execution_channel || 'n/d'}) · source=${receipt.source || 'n/d'}`,
    `- **Resultado:** ${receipt.status || 'n/d'} · ${receipt.summary || 'n/d'}`,
    `- **Próximo:** ${receipt.next || 'n/d'}`,
    `- **Evidência:** ${(receipt.evidence || []).join(', ') || 'n/d'}`,
    `- **Arquivos:** ${(receipt.files || []).join(', ') || 'n/d'}`,
    '',
  ].join('\n');
}

function isVaultEligible(event) {
  return Boolean(
    event &&
    (DURABLE_RECEIPT_KINDS.has(event.kind) || ['pr', 'wave', 'release'].includes(event.cadence))
  );
}

function vaultReceiptPath(vaultRoot, project, event) {
  const device = event.device || {};
  const month = (parseIso(event.ended_at || event.ts) || 'unknown').slice(0, 7);
  const stamp = (parseIso(event.ended_at || event.ts) || 'unknown').replace(/[:.]/g, '-');
  return path.join(
    vaultRoot,
    RECEIPT_ROOT,
    safeSegment(project, 'unknown-project'),
    safeSegment(device.id || device.name, 'unknown-device'),
    safeSegment(month, 'unknown-month'),
    `${safeSegment(stamp, 'unknown-time')}--${safeSegment(event.id, 'unknown-event')}.md`
  );
}

function publishVault(root, events, opts) {
  opts = opts || {};
  const vaultRoot = resolveVaultPath(opts.vault);
  if (!vaultRoot) throw new Error('vault not found; set VAULT_PATH or pass --vault <path>');
  const project = safeSegment(opts.project || path.basename(root), 'mooter');
  const result = {
    ok: true,
    complete: true,
    vault: vaultRoot,
    project,
    published: [],
    unchanged: [],
    filtered: [],
    gaps: [],
    skipped: [],
  };
  for (const event of events || []) {
    if (!opts.all && !isVaultEligible(event)) {
      result.filtered.push({ id: event && event.id || null, reason: 'not_durable' });
      continue;
    }
    const validation = validateEvent(event);
    if (!validation.ok) {
      result.skipped.push({ id: event && event.id || null, errors: validation.errors, warnings: validation.warnings });
      continue;
    }
    if (validation.warnings.length) {
      result.gaps.push({ id: event.id, warnings: validation.warnings });
    }
    const content = renderVaultReceipt(event, project);
    if (containsSecret(content)) {
      result.skipped.push({ id: event.id, errors: ['possible_secret'], warnings: [] });
      continue;
    }
    const file = vaultReceiptPath(vaultRoot, project, event);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const current = safeRead(file);
    if (current != null) {
      if (current !== content) throw new Error(`receipt collision for ${event.id}: ${file}`);
      result.unchanged.push(file);
      continue;
    }
    fs.writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' });
    result.published.push(file);
  }
  result.ok = result.skipped.length === 0 && (events || []).length > 0;
  result.complete = result.ok && result.gaps.length === 0;
  return result;
}

function verifyVaultReceipt(text) {
  const match = String(text || '').match(/<!-- agent-sync-receipt-json\n([^\n]+)\n-->/);
  if (!match) return { ok: false, receipt: null, errors: ['receipt_json_missing'], warnings: [] };
  const receipt = safeJson(match[1]);
  if (!receipt) return { ok: false, receipt: null, errors: ['receipt_json_invalid'], warnings: [] };
  if (receipt.schema_version === 'agent-sync-receipt.v1') {
    return { ok: true, receipt, errors: [], warnings: ['legacy_receipt_unverified'] };
  }
  if (receipt.schema_version !== RECEIPT_SCHEMA_VERSION) {
    return { ok: false, receipt, errors: ['receipt_schema_unknown'], warnings: [] };
  }
  const expected = receipt.integrity_sha256;
  const unsigned = { ...receipt };
  delete unsigned.integrity_sha256;
  const actual = crypto.createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
  return expected === actual
    ? { ok: true, receipt, errors: [], warnings: [] }
    : { ok: false, receipt, errors: ['receipt_integrity_mismatch'], warnings: [] };
}

function parseVaultReceipt(text) {
  const verified = verifyVaultReceipt(text);
  return verified.ok ? verified.receipt : null;
}

function readVaultReceipts(vaultRoot, project, options) {
  const base = path.join(vaultRoot, RECEIPT_ROOT, safeSegment(project, 'mooter'));
  if (!fs.existsSync(base)) return [];
  const requestedLimit = Number(options && options.maxFiles);
  const maxFiles = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 5000;
  const files = [];
  const queue = [base];
  while (queue.length) {
    const current = queue.shift();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(file);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        if (files.length >= maxFiles) {
          throw new Error(`vault receipt scan limit exceeded (${maxFiles}); refusing partial readiness`);
        }
        files.push(file);
      }
    }
  }
  return files.map((file) => {
    const verified = verifyVaultReceipt(safeRead(file));
    if (!verified.ok) throw new Error(`invalid vault receipt ${file}: ${verified.errors.join(',')}`);
    return { file, receipt: verified.receipt, warnings: verified.warnings };
  })
    .sort((a, b) => String(a.receipt.ended_at || a.receipt.ts).localeCompare(String(b.receipt.ended_at || b.receipt.ts)));
}

function agentSyncDoctor(root, options) {
  options = options || {};
  const home = path.resolve(options.home || os.homedir());
  const vaultRoot = resolveVaultPath(options.vault);
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const sourceLedgerPath = path.join(root, 'tools', 'router', 'agent-sync-ledger.js');
  const sourceHookPath = path.join(root, 'tools', 'router', 'gsd-turn-end.js');
  const installedLedgerPath = path.join(home, '.claude', 'tools', 'router', 'agent-sync-ledger.js');
  const installedHookPath = path.join(home, '.claude', 'hooks', 'gsd-turn-end.js');
  const settings = safeJson(safeRead(settingsPath) || '');
  const stopCommands = settings && settings.hooks && Array.isArray(settings.hooks.Stop)
    ? settings.hooks.Stop.flatMap((entry) => (entry && entry.hooks) || [])
      .map((hook) => hook && hook.command)
      .filter((command) => typeof command === 'string' && command.includes('gsd-turn-end.js'))
    : [];
  const pinnedNode = stopCommands.map((command) => {
    const match = command.match(/^\s*"([^"]+)"\s+/);
    return match && match[1];
  }).find(Boolean);
  const hookBody = safeRead(installedHookPath) || '';
  const runtimeBody = safeRead(installedLedgerPath) || '';
  const classifier = classifySnapshot(root);
  const device = deviceSnapshot({}, { home });
  const autoPublish = process.env.MOOTER_AGENT_SYNC_VAULT_AUTO_PUBLISH === '1';
  const checks = [
    { id: 'repo_root', required: true, ok: isMooterRoot(root), detail: root },
    { id: 'classifier_frozen', required: true, ok: classifier.intact, detail: classifier.sha256 || 'missing' },
    { id: 'device_identity', required: true, ok: Boolean(device && device.id), detail: device && device.id || 'missing' },
    {
      id: 'runtime_installed',
      required: true,
      ok: runtimeBody.includes(RECEIPT_SCHEMA_VERSION) &&
        sha256File(installedLedgerPath) === sha256File(sourceLedgerPath),
      detail: installedLedgerPath,
    },
    {
      id: 'stop_hook_capture',
      required: true,
      ok: hookBody.includes('agent-sync-ledger') &&
        hookBody.includes('accumulateAgentSync') &&
        sha256File(installedHookPath) === sha256File(sourceHookPath),
      detail: installedHookPath,
    },
    {
      id: 'settings_hook_wired',
      required: true,
      ok: Boolean(settings && JSON.stringify(settings.hooks || {}).includes('gsd-turn-end.js')),
      detail: settingsPath,
    },
    {
      id: 'settings_node_pinned',
      required: true,
      ok: Boolean(pinnedNode && fs.existsSync(pinnedNode)),
      detail: pinnedNode || 'bare or missing Node executable',
    },
    { id: 'vault_local', required: true, ok: Boolean(vaultRoot), detail: vaultRoot || 'missing' },
    {
      id: 'vault_protocol',
      required: true,
      ok: Boolean(vaultRoot && fs.existsSync(path.join(vaultRoot, '00-core', 'agent-sync-protocol.md'))),
      detail: vaultRoot ? path.join(vaultRoot, '00-core', 'agent-sync-protocol.md') : 'missing',
    },
    {
      id: 'vault_registry',
      required: true,
      ok: Boolean(vaultRoot && fs.existsSync(path.join(vaultRoot, '00-core', 'agent-sync-registry.json'))),
      detail: vaultRoot ? path.join(vaultRoot, '00-core', 'agent-sync-registry.json') : 'missing',
    },
    {
      id: 'auto_publish_enabled',
      required: true,
      ok: autoPublish,
      detail: autoPublish ? 'MOOTER_AGENT_SYNC_VAULT_AUTO_PUBLISH=1' : 'disabled',
    },
  ];
  return {
    schema_version: SCHEMA_VERSION,
    checked_at: new Date().toISOString(),
    device,
    vault: vaultRoot,
    remote_sync: 'not_checked',
    ok: checks.filter((row) => row.required).every((row) => row.ok),
    checks,
  };
}

function renderDoctorReport(doctor) {
  return [
    '# Mooter Agent Sync Doctor',
    '',
    `LOCAL_AGENT_SYNC=${doctor.ok ? 'pass' : 'fail'}`,
    'VAULT_REMOTE=not_checked',
    `device: ${doctor.device && doctor.device.id || 'n/d'} · ${doctor.device && doctor.device.name || 'n/d'} · ${doctor.device && doctor.device.platform || 'n/d'}/${doctor.device && doctor.device.arch || 'n/d'}`,
    `vault: ${doctor.vault || 'n/d'}`,
    '',
    '## Checks',
    '',
    ...doctor.checks.map((row) => `- ${row.ok ? 'PASS' : 'FAIL'} ${row.id}: ${row.detail}`),
    '',
  ].join('\n');
}

function buildVaultStatus(vaultRoot, project) {
  const rows = readVaultReceipts(vaultRoot, project);
  const latestByDevice = {};
  const latestByAgent = {};
  const latestByDeviceAgent = {};
  const latestByDeviceProvider = {};
  const latestByDeviceChannel = {};
  const receiptWarnings = [];
  for (const row of rows) {
    const event = row.receipt;
    const device = event.device && (event.device.id || event.device.name) || 'unknown';
    latestByDevice[device] = row;
    latestByAgent[event.agent || 'unknown'] = row;
    latestByDeviceAgent[`${device}:${event.agent || 'unknown'}`] = row;
    latestByDeviceProvider[`${device}:${event.provider || 'unknown'}`] = row;
    latestByDeviceChannel[`${device}:${event.execution_channel || 'unknown'}`] = row;
    for (const warning of row.warnings || []) receiptWarnings.push({ file: row.file, warning });
  }
  return {
    schema_version: RECEIPT_SCHEMA_VERSION,
    vault: vaultRoot,
    project,
    receipt_count: rows.length,
    latest_by_device: latestByDevice,
    latest_by_agent: latestByAgent,
    latest_by_device_agent: latestByDeviceAgent,
    latest_by_device_provider: latestByDeviceProvider,
    latest_by_device_channel: latestByDeviceChannel,
    receipt_warnings: receiptWarnings,
  };
}

function loadSyncRegistry(vaultRoot, explicitPath) {
  const file = explicitPath
    ? path.resolve(String(explicitPath))
    : path.join(vaultRoot, '00-core', 'agent-sync-registry.json');
  const raw = safeRead(file);
  if (!raw) return { file, registry: null, error: 'registry_missing' };
  const registry = safeJson(raw);
  if (!registry || !Array.isArray(registry.devices)) return { file, registry: null, error: 'registry_invalid' };
  return { file, registry, error: null };
}

function auditFleet(status, registryResult, now) {
  const checkedAt = parseIso(now) || new Date().toISOString();
  const registry = registryResult && registryResult.registry;
  const rows = [];
  if (!registry) {
    return {
      ok: false,
      checked_at: checkedAt,
      registry: registryResult && registryResult.file || null,
      errors: [registryResult && registryResult.error || 'registry_missing'],
      rows,
    };
  }
  const project = registry.project || status.project;
  const defaultMaxAgeHours = Number(registry.max_age_hours);
  for (const expected of registry.devices) {
    const label = clamp(expected.label || expected.hostname || expected.device_id || 'unnamed-device', 160);
    const errors = [];
    const warnings = [];
    if (expected.status !== 'active') errors.push('device_not_enrolled');
    if (!expected.device_id) errors.push('device_id_missing');
    const latest = expected.device_id ? status.latest_by_device[expected.device_id] : null;
    if (expected.status === 'active' && !latest) errors.push('device_receipt_missing');
    if (latest && expected.hostname && latest.receipt.device && latest.receipt.device.name !== expected.hostname) {
      errors.push('hostname_mismatch');
    }
    if (latest && expected.platform && latest.receipt.device && latest.receipt.device.platform !== expected.platform) {
      errors.push('platform_mismatch');
    }
    if (latest && expected.arch && latest.receipt.device && latest.receipt.device.arch !== expected.arch) {
      errors.push('arch_mismatch');
    }
    const maxAgeHours = Number(expected.max_age_hours || defaultMaxAgeHours);
    if (latest && Number.isFinite(maxAgeHours) && maxAgeHours > 0) {
      const seen = Date.parse(latest.receipt.ended_at || latest.receipt.ts);
      const ageHours = (Date.parse(checkedAt) - seen) / 3600000;
      if (!Number.isFinite(ageHours) || ageHours < -0.25) errors.push('clock_skew_future');
      else if (ageHours > maxAgeHours) errors.push('device_receipt_stale');
    }
    for (const agent of normalizeAgents(expected.required_agents, 16)) {
      const key = `${expected.device_id}:${agent}`;
      const agentLatest = status.latest_by_device_agent[key];
      if (expected.status === 'active' && !agentLatest) {
        errors.push(`agent_receipt_missing:${agent}`);
      } else if (agentLatest && Number.isFinite(maxAgeHours) && maxAgeHours > 0) {
        const seen = Date.parse(agentLatest.receipt.ended_at || agentLatest.receipt.ts);
        const ageHours = (Date.parse(checkedAt) - seen) / 3600000;
        if (!Number.isFinite(ageHours) || ageHours < -0.25) errors.push(`agent_clock_skew_future:${agent}`);
        else if (ageHours > maxAgeHours) errors.push(`agent_receipt_stale:${agent}`);
      }
    }
    for (const provider of splitList(expected.required_providers, 16).map((item) => item.toLowerCase())) {
      const providerLatest = status.latest_by_device_provider[`${expected.device_id}:${provider}`];
      if (expected.status === 'active' && !providerLatest) {
        errors.push(`provider_receipt_missing:${provider}`);
      } else if (providerLatest && Number.isFinite(maxAgeHours) && maxAgeHours > 0) {
        const seen = Date.parse(providerLatest.receipt.ended_at || providerLatest.receipt.ts);
        const ageHours = (Date.parse(checkedAt) - seen) / 3600000;
        if (!Number.isFinite(ageHours) || ageHours < -0.25) errors.push(`provider_clock_skew_future:${provider}`);
        else if (ageHours > maxAgeHours) errors.push(`provider_receipt_stale:${provider}`);
      }
    }
    for (const channel of splitList(expected.required_channels, 8).map((item) => item.toLowerCase())) {
      const channelLatest = status.latest_by_device_channel[`${expected.device_id}:${channel}`];
      if (expected.status === 'active' && !channelLatest) errors.push(`channel_receipt_missing:${channel}`);
    }
    if (!Array.isArray(expected.required_agents) || expected.required_agents.length === 0) {
      warnings.push('required_agents_not_declared');
    }
    rows.push({
      label,
      device_id: expected.device_id || null,
      status: expected.status || 'pending',
      latest_event_id: latest && latest.receipt.event_id || null,
      errors,
      warnings,
    });
  }
  const errors = rows.flatMap((row) => row.errors.map((error) => `${row.label}:${error}`));
  if (project !== status.project) errors.push('registry_project_mismatch');
  return {
    ok: errors.length === 0 && rows.length > 0,
    checked_at: checkedAt,
    registry: registryResult.file,
    errors,
    rows,
  };
}

function renderFleetAudit(audit) {
  return [
    '# Mooter Cross-device Readiness',
    '',
    `READINESS=${audit.ok ? 'pass' : 'fail'}`,
    `checked_at: ${audit.checked_at}`,
    `registry: ${audit.registry || 'n/d'}`,
    `errors: ${audit.errors.length}`,
    '',
    ...((audit.rows || []).length ? audit.rows.map((row) =>
      `- ${row.label}: ${row.status} · device=${row.device_id || 'n/d'} · latest=${row.latest_event_id || 'n/d'} · errors=${row.errors.join(',') || 'none'} · warnings=${row.warnings.join(',') || 'none'}`
    ) : ['- no registered devices']),
    '',
  ].join('\n');
}

function renderVaultStatus(status) {
  const render = (entries) => Object.entries(entries || {}).map(([key, row]) => {
    const event = row.receipt;
    return `- ${key}: ${event.ended_at || event.ts || 'n/d'} · ${event.agent || 'n/d'} · ${event.status || 'n/d'} · ${event.summary || 'n/d'} · next=${event.next || 'n/d'}`;
  });
  return [
    '# Mooter Vault Agent Sync',
    '',
    `vault: ${status.vault}`,
    `project: ${status.project}`,
    `receipts: ${status.receipt_count}`,
    `receipt_warnings: ${(status.receipt_warnings || []).length}`,
    '',
    '## Latest By Device',
    '',
    ...(render(status.latest_by_device).length ? render(status.latest_by_device) : ['- none']),
    '',
    '## Latest By Agent',
    '',
    ...(render(status.latest_by_agent).length ? render(status.latest_by_agent) : ['- none']),
    '',
  ].join('\n');
}

function buildSnapshot(root, events, dir, opts) {
  opts = opts || {};
  const latestByAgent = {};
  for (const e of events) latestByAgent[e.agent || 'unknown'] = e;
  const latestByDevice = {};
  for (const e of events) {
    if (!e.device) continue;
    const key = e.device.id || e.device.name || 'unknown';
    latestByDevice[key] = e;
  }
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
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    repo_root: root,
    dir: paths(root, dir).dir,
    event_count: events.length,
    last_event: last,
    latest_by_agent: latestByAgent,
    latest_by_device: latestByDevice,
    open_items: open,
    active_briefs: activeBriefs,
    recent_decisions: recentDecisions,
    recent_gates: recentGates,
    classify: opts.classify === false ? null : classifySnapshot(root),
    git: opts.git === false ? null : gitSnapshot(root),
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
  const devices = Object.keys(snapshot.latest_by_device || {}).sort();
  const deviceLines = devices.length
    ? devices.map((key) => {
      const e = snapshot.latest_by_device[key];
      const d = e.device || {};
      const elapsed = normalizeDuration(e.duration_ms);
      return `- ${d.name || 'n/d'} [${d.id || key}]: ${d.platform || 'n/d'}/${d.arch || 'n/d'} · ${e.ended_at || e.ts || 'n/d'} · ${elapsed == null ? 'n/d' : `${elapsed} ms`} · ${e.agent || 'unknown'} · ${e.status || 'unknown'} - ${e.summary || 'n/d'}`;
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
    '## Latest By Device',
    '',
    ...deviceLines,
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
  const written = [];
  for (const target of targets) {
    const file = path.join(ps.briefsDir, `${event.id}-${target}.md`);
    fs.writeFileSync(file, renderBriefPrompt(event, snapshot, target) + '\n');
    written.push(file);
  }
  return written;
}

function writeSnapshot(root, snapshot, dir) {
  const ps = paths(root, dir);
  fs.mkdirSync(ps.promptsDir, { recursive: true });
  atomicWrite(ps.snapshot, JSON.stringify(snapshot, null, 2) + '\n');
  atomicWrite(ps.latest, renderSnapshot(snapshot) + '\n');
  for (const agent of SYNC_AGENTS) {
    atomicWrite(path.join(ps.promptsDir, `${agent}.md`), renderAgentPrompt(snapshot, agent) + '\n');
  }
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
      recorded_by: 'claude-code',
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
      started_at: payload.started_at || payload.startedAt || null,
      ended_at: payload.ended_at || payload.endedAt || null,
      duration_ms: payload.duration_ms != null ? payload.duration_ms : payload.durationMs,
      parent_event_id: payload.parent_event_id || payload.parentEventId || null,
      recorded_by: payload.recorded_by || payload.recordedBy || 'claude-code',
      device_id: payload.device_id || payload.deviceId || null,
      device_name: payload.device_name || payload.deviceName || null,
      device_platform: payload.device_platform || payload.devicePlatform || null,
      device_arch: payload.device_arch || payload.deviceArch || null,
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
      parent_event_id: args.parent,
      recorded_by: args.recorder || args['recorded-by'],
      started_at: args['started-at'],
      ended_at: args['ended-at'],
      duration_ms: args['duration-ms'],
      timing_basis: args['timing-basis'],
      wave: args.wave,
      pr: args.pr,
      notion_ref: args.notion,
      obsidian_ref: args.obsidian,
      device_id: args['device-id'],
      device_name: args['device-name'],
      device_platform: args['device-platform'],
      device_arch: args['device-arch'],
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
      parent_event_id: args.parent,
      recorded_by: args.recorder || args['recorded-by'],
      started_at: args['started-at'],
      ended_at: args['ended-at'],
      duration_ms: args['duration-ms'],
      timing_basis: args['timing-basis'],
      wave: args.wave,
      pr: args.pr,
      notion_ref: args.notion,
      obsidian_ref: args.obsidian,
      device_id: args['device-id'],
      device_name: args['device-name'],
      device_platform: args['device-platform'],
      device_arch: args['device-arch'],
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
  if (cmd === 'audit') {
    const events = readEvents(root, dir);
    const selected = args.window ? events.slice(-Math.max(1, Number(args.window) || events.length)) : events;
    const audit = auditEvents(selected);
    if (args.strict && !audit.complete) throw new Error(renderAuditReport(audit));
    return args.json ? JSON.stringify(audit, null, 2) + '\n' : renderAuditReport(audit) + '\n';
  }
  if (cmd === 'doctor') {
    const doctor = agentSyncDoctor(root, { vault: args.vault, home: args.home });
    if (args.strict && !doctor.ok) throw new Error(renderDoctorReport(doctor));
    return args.json ? JSON.stringify(doctor, null, 2) + '\n' : renderDoctorReport(doctor) + '\n';
  }
  if (cmd === 'publish-vault' || cmd === 'vault-publish') {
    const events = readEvents(root, dir);
    const selected = args.event
      ? events.filter((event) => event.id === args.event)
      : (args.window ? events.slice(-Math.max(1, Number(args.window) || events.length)) : events);
    if (args.event && !selected.length) throw new Error(`event not found: ${args.event}`);
    const result = publishVault(root, selected, {
      vault: args.vault,
      project: args.project || 'mooter',
      all: Boolean(args.all),
    });
    if (args.strict && !result.complete) throw new Error(JSON.stringify(result, null, 2));
    if (args.json) return JSON.stringify(result, null, 2) + '\n';
    return [
      '# Mooter Vault Publish',
      '',
      `VAULT_LOCAL=${result.ok ? (result.complete ? 'pass' : 'pass_with_gaps') : 'fail'}`,
      'VAULT_REMOTE=pending',
      `vault: ${result.vault}`,
      `project: ${result.project}`,
      `published: ${result.published.length}`,
      `unchanged: ${result.unchanged.length}`,
      `filtered: ${result.filtered.length}`,
      `gaps: ${result.gaps.length}`,
      `skipped: ${result.skipped.length}`,
      ...(result.skipped.length ? ['', 'Gaps:', ...result.skipped.map((row) => `- ${row.id || 'n/d'}: ${row.errors.join(', ')}`)] : []),
      '',
    ].join('\n');
  }
  if (cmd === 'vault-status') {
    const vaultRoot = resolveVaultPath(args.vault);
    if (!vaultRoot) throw new Error('vault not found; set VAULT_PATH or pass --vault <path>');
    const status = buildVaultStatus(vaultRoot, args.project || 'mooter');
    const registry = loadSyncRegistry(vaultRoot, args.registry);
    const readiness = auditFleet(status, registry, args.now || opts.now);
    const result = { ...status, readiness };
    if (args.strict && !readiness.ok) throw new Error(renderFleetAudit(readiness));
    return args.json
      ? JSON.stringify(result, null, 2) + '\n'
      : renderVaultStatus(status) + '\n' + renderFleetAudit(readiness) + '\n';
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
  RECEIPT_SCHEMA_VERSION,
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
  timingSnapshot,
  deviceSnapshot,
  containsSecret,
  validateEvent,
  auditEvents,
  renderAuditReport,
  resolveVaultPath,
  receiptEvent,
  renderVaultReceipt,
  isVaultEligible,
  vaultReceiptPath,
  publishVault,
  parseVaultReceipt,
  verifyVaultReceipt,
  readVaultReceipts,
  buildVaultStatus,
  renderVaultStatus,
  loadSyncRegistry,
  auditFleet,
  renderFleetAudit,
  agentSyncDoctor,
  renderDoctorReport,
  readEvents,
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
