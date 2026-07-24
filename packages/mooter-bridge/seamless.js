'use strict';
/**
 * seamless.js — mooter-bridge v0.2: the seamless dispatch loop (Fase 0 / Marco 1).
 *
 * Adds 4 tools on top of the P0/P1 bridge: mooter_route, mooter_dispatch,
 * mooter_status, mooter_collect. Doctrine unchanged: zero npm deps, stdout is
 * MCP-only, logs to stderr, nothing fabricated — unknown = null, never a guess.
 *
 * Pipeline (per HANDOFF mooter-seamless Fase 0):
 *   dispatch → guard (⇄ + posse + path allowlist) → spawn headless CLI with
 *   cwd = worktree → append `dispatched`/`started` to the ledger → return
 *   {job_id} immediately (never waits) → `done|failed` appended on close.
 *
 * Ledger v1 (single-writer = THIS server process; append-only JSONL):
 *   ~/.mooter/ledger.jsonl
 *   {ts, job_id, wave, agent, worktree, event, mp_hash, exit_code?, cost_usd?, duration_s?}
 *
 * Guard v0 — DIVERGENCE, on purpose, reported in the BACK: the handoff names
 * `handoff-guard.js`, which does not exist in the repo under that name (closest:
 * tools/handoff-preflight.js = Perfect-Handoff scaffold, not a dispatch gate).
 * guardCheck() below implements the contract the handoff describes (⇄ header,
 * posse/ownership via ledger, worktree allowlist, vault deny) behind one seam —
 * swap in the canonical guard the moment it exists, adapt THIS side, never it.
 *
 * Masterprompt delivery: written to ~/.mooter/jobs/<id>/masterprompt.md and the
 * CLI gets a short fixed bootstrap prompt pointing at that file. Rationale:
 * Windows .cmd shims force shell:true spawns; keeping user content out of the
 * command line kills the whole quoting/injection class. Paths are ours (no user
 * input), quotes are rejected by the guard in every arg we do interpolate.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

// ── config (env-overridable; defaults follow the handoff) ─────────────────
const REPO = process.env.MOOTER_REPO || path.resolve(__dirname, '..', '..');
const MOOTER_HOME = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
const LEDGER_PATH = () => path.join(MOOTER_HOME_DIR(), 'ledger.jsonl');
const JOBS_DIR = () => path.join(MOOTER_HOME_DIR(), 'jobs');
let _home = MOOTER_HOME;
function MOOTER_HOME_DIR() { return process.env.MOOTER_HOME || _home; }
const JOB_TIMEOUT_MS = () => Number(process.env.MOOTER_JOB_TIMEOUT_MS) || 30 * 60 * 1000;
const COLLECT_LIMIT = 100_000; // chars; above this: excerpt + path (tool-result ~150k cap)

function log(...a) { try { process.stderr.write('[mooter-seamless] ' + a.join(' ') + '\n'); } catch { /* */ } }
function ensureDirs() {
  fs.mkdirSync(JOBS_DIR(), { recursive: true });
}
function nowIso() { return new Date().toISOString(); }
function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }

// ── ledger (append-only JSONL; this process is the single writer) ─────────
function ledgerAppend(ev) {
  ensureDirs();
  const line = JSON.stringify({ ts: nowIso(), ...ev });
  fs.appendFileSync(LEDGER_PATH(), line + '\n');
  return line;
}
function ledgerRead() {
  try {
    return fs.readFileSync(LEDGER_PATH(), 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}
const TERMINAL = new Set(['done', 'failed']);
function activeJobsByWorktree(worktree) {
  const norm = path.resolve(worktree).toLowerCase();
  const state = new Map(); // job_id → last event
  for (const ev of ledgerRead()) {
    if (!ev.job_id) continue;
    if (ev.worktree && path.resolve(ev.worktree).toLowerCase() !== norm) continue;
    if (ev.event === 'dispatched' || ev.event === 'started') state.set(ev.job_id, ev.event);
    if (TERMINAL.has(ev.event)) state.delete(ev.job_id);
  }
  return [...state.keys()];
}

// ── guard v0 (seam for the canonical guard — see header) ──────────────────
const KNOWN_AGENTS = ['cc', 'codex', 'gemini'];
function guardCheck({ agent, worktree, masterprompt, wave, allowedTools }) {
  const reasons = [];
  if (!KNOWN_AGENTS.includes(agent)) reasons.push(`agent "${agent}" desconhecido (esperado: ${KNOWN_AGENTS.join('|')})`);
  const mp = String(masterprompt || '');
  if (!mp.trim()) reasons.push('masterprompt vazio');
  else if (!mp.includes('⇄')) reasons.push('masterprompt sem cabeçalho ⇄ (ROUTING/posse) — exigido pela constituição de handoff');
  for (const [k, v] of Object.entries({ wave, allowedTools, agent })) {
    if (v != null && /["\r\n]/.test(String(v))) reasons.push(`arg "${k}" contém aspas/quebra de linha — recusado (higiene de shell)`);
  }
  const wt = String(worktree || '');
  if (!wt) reasons.push('worktree vazio');
  else {
    const norm = path.resolve(wt);
    if (/paulo-vault/i.test(norm)) reasons.push('worktree dentro do vault — PROIBIDO (constituição §5)');
    const root = process.env.MOOTER_WORKTREE_ROOT || path.dirname(path.resolve(REPO));
    if (!norm.toLowerCase().startsWith(path.resolve(root).toLowerCase())) {
      reasons.push(`worktree fora da raiz permitida (${root})`);
    }
    if (!fs.existsSync(norm) || !fs.statSync(norm).isDirectory()) {
      reasons.push(`worktree não existe: ${norm}`);
    } else {
      try {
        execFileSync('git', ['-C', norm, 'rev-parse', '--is-inside-work-tree'], { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch { reasons.push(`worktree não é uma git worktree: ${norm}`); }
      const owners = activeJobsByWorktree(norm);
      if (owners.length) reasons.push(`posse: worktree já tem job ativo (${owners.join(', ')}) — WIP guard`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

// ── agent command builders (flags validated against official docs 2026-07-24) ─
function bootstrapPrompt(mpPath) {
  return `Lê o ficheiro ${mpPath} e executa integralmente o masterprompt nele contido. O conteúdo do ficheiro são as tuas instruções de wave.`;
}
function buildCommand(agent, jobDir, allowedTools) {
  const mpPath = path.join(jobDir, 'masterprompt.md');
  const outFile = path.join(jobDir, 'last-message.txt');
  const boot = bootstrapPrompt(mpPath);
  if (agent === 'cc') {
    const args = ['-p', boot, '--output-format', 'json'];
    // v1 WITHOUT --bare (D3: subscription auth + Mooter router hooks fire).
    // Docs 2026-07-24: --bare will become the -p default in a future release — revisit then.
    args.push('--allowedTools', allowedTools || 'Read');
    return { bin: 'claude', args };
  }
  if (agent === 'codex') {
    return { bin: 'codex', args: ['exec', boot, '--json', '--sandbox', 'workspace-write', '--output-last-message', outFile] };
  }
  if (agent === 'gemini') {
    return { bin: 'gemini', args: ['-p', boot, '--output-format', 'json', '--approval-mode', 'auto_edit'] };
  }
  throw new Error('unknown agent ' + agent);
}
function quoteArg(a) {
  // our own paths/flags only — guard already rejected quotes in caller args
  return /[\s]/.test(a) ? '"' + a + '"' : a;
}

// ── spawner (injectable for hermetic tests) ───────────────────────────────
function realSpawnJob(cmd, cwd, outStream, errStream) {
  const isWin = process.platform === 'win32';
  const child = isWin
    ? spawn([cmd.bin, ...cmd.args.map(quoteArg)].join(' '), { cwd, shell: true, windowsHide: true, env: process.env })
    : spawn(cmd.bin, cmd.args, { cwd, env: process.env });
  child.stdout.pipe(outStream);
  child.stderr.pipe(errStream);
  return child;
}
let spawnJob = realSpawnJob;
function setJobSpawner(fn) { spawnJob = fn; }

// ── job registry (live children in this server instance) ──────────────────
const REGISTRY = new Map(); // job_id → { child, timer, startedAt }

function parseCostFromOut(agent, jobDir) {
  // CC --output-format json → total_cost_usd. Codex/Gemini: cost n/d (honest null).
  try {
    if (agent !== 'cc') return { cost_usd: null, session_id: null, resultJson: null };
    const raw = fs.readFileSync(path.join(jobDir, 'out.log'), 'utf8').trim();
    const start = raw.indexOf('{');
    if (start < 0) return { cost_usd: null, session_id: null, resultJson: null };
    const j = JSON.parse(raw.slice(start));
    return { cost_usd: j.total_cost_usd != null ? j.total_cost_usd : null, session_id: j.session_id || null, resultJson: j };
  } catch { return { cost_usd: null, session_id: null, resultJson: null }; }
}

// ── tools ─────────────────────────────────────────────────────────────────
async function toolRoute(args) {
  const text = String((args && args.text) || '').trim();
  if (!text) return { error: 'text is required' };
  let classify;
  try { classify = require(path.join(REPO, 'tools', 'router', 'classify.js')).classify; }
  catch (e) { return { error: 'classify.js indisponível em ' + REPO + ': ' + ((e && e.message) || e) }; }
  let d;
  try { d = classify(text); } catch (e) { return { error: 'classify falhou: ' + ((e && e.message) || e) }; }
  const tierToAgent = { T0: 'moo', T1: 'cc', T2: 'cc', T3: 'cc' };
  return {
    agent: tierToAgent[d.tier] || 'cc',
    tier: d.tier || null,
    confidence: d.confidence != null ? d.confidence : null,
    rationale: d.reasoning || null,
    recommended_model: d.recommended_model || null,
    routing_note: 'classify.js (FROZEN, read-only) decide TIER; codex/gemini são escolha de doutrina de wave, não do classifier. T0/moo não é dispatchável na v0.',
  };
}

async function toolDispatch(args) {
  const agent = String((args && args.agent) || '').trim();
  const worktree = String((args && args.worktree) || '').trim();
  const masterprompt = String((args && args.masterprompt) || '');
  const wave = String((args && args.wave) || 'adhoc').trim();
  const allowedTools = args && args.allowedTools ? String(args.allowedTools) : null;

  const g = guardCheck({ agent, worktree, masterprompt, wave, allowedTools });
  if (!g.ok) return { error: '❌ guard recusou o dispatch', reasons: g.reasons };

  ensureDirs();
  const job_id = 'job-' + Date.now().toString(36) + '-' + crypto.randomBytes(2).toString('hex');
  const jobDir = path.join(JOBS_DIR(), job_id);
  fs.mkdirSync(jobDir, { recursive: true });
  const mpPath = path.join(jobDir, 'masterprompt.md');
  fs.writeFileSync(mpPath, masterprompt, 'utf8');
  const mp_hash = sha256(masterprompt);
  const cmd = buildCommand(agent, jobDir, allowedTools);
  const wtNorm = path.resolve(worktree);
  fs.writeFileSync(path.join(jobDir, 'meta.json'), JSON.stringify({
    job_id, wave, agent, worktree: wtNorm, mp_hash, cmd: [cmd.bin, ...cmd.args].join(' '), created_at: nowIso(), depth: 1,
  }, null, 2));

  ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'dispatched', mp_hash });

  const outStream = fs.createWriteStream(path.join(jobDir, 'out.log'));
  const errStream = fs.createWriteStream(path.join(jobDir, 'err.log'));
  const t0 = Date.now();
  let child;
  try { child = spawnJob(cmd, wtNorm, outStream, errStream); }
  catch (e) {
    ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'failed', mp_hash, exit_code: 'spawn-error' });
    return { error: 'spawn falhou: ' + ((e && e.message) || e), job_id };
  }
  const timer = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch { /* */ }
    REGISTRY.delete(job_id);
    ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'failed', mp_hash, exit_code: 'timeout', duration_s: Math.round((Date.now() - t0) / 1000) });
  }, JOB_TIMEOUT_MS());
  REGISTRY.set(job_id, { child, timer, startedAt: t0 });

  let startedLogged = false;
  const logStarted = () => { if (!startedLogged) { startedLogged = true; ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'started', mp_hash }); } };
  child.once('spawn', logStarted);
  child.once('error', (e) => {
    clearTimeout(timer); REGISTRY.delete(job_id);
    ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'failed', mp_hash, exit_code: 'proc-error:' + ((e && e.message) || ''), duration_s: Math.round((Date.now() - t0) / 1000) });
  });
  child.once('close', (code) => {
    clearTimeout(timer); REGISTRY.delete(job_id);
    logStarted(); // shells emit no 'spawn' reliably; a close implies it ran
    const { cost_usd } = parseCostFromOut(agent, jobDir);
    ledgerAppend({
      job_id, wave, agent, worktree: wtNorm, event: code === 0 ? 'done' : 'failed', mp_hash,
      exit_code: code, cost_usd, duration_s: Math.round((Date.now() - t0) / 1000),
    });
  });

  return { job_id, wave, agent, worktree: wtNorm, mp_hash, note: 'dispatch aceito; acompanhar com mooter_status, resultado via mooter_collect' };
}

async function toolStatus(args) {
  const jobId = args && args.job_id ? String(args.job_id) : null;
  const wave = args && args.wave ? String(args.wave) : null;
  if (!jobId && !wave) return { error: 'passa job_id ou wave' };
  const evs = ledgerRead().filter((e) => (jobId ? e.job_id === jobId : e.wave === wave));
  if (!evs.length) return { error: 'nada no ledger para ' + (jobId || wave) };
  const byJob = {};
  for (const e of evs) {
    const j = byJob[e.job_id] || (byJob[e.job_id] = { job_id: e.job_id, wave: e.wave, agent: e.agent, worktree: e.worktree, events: [], last: null });
    j.events.push({ ts: e.ts, event: e.event, exit_code: e.exit_code, cost_usd: e.cost_usd, duration_s: e.duration_s });
    j.last = e.event;
  }
  for (const j of Object.values(byJob)) {
    j.alive = REGISTRY.has(j.job_id);
    try {
      const errPath = path.join(JOBS_DIR(), j.job_id, 'err.log');
      const tail = fs.readFileSync(errPath, 'utf8').split('\n').filter(Boolean).slice(-5);
      if (tail.length) j.stderr_tail = tail;
    } catch { /* */ }
  }
  return { jobs: Object.values(byJob), ledger_lines: evs.length };
}

async function toolCollect(args) {
  const jobId = String((args && args.job_id) || '').trim();
  if (!jobId) return { error: 'job_id is required' };
  const jobDir = path.join(JOBS_DIR(), jobId);
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(path.join(jobDir, 'meta.json'), 'utf8')); }
  catch { return { error: 'job desconhecido: ' + jobId }; }
  const evs = ledgerRead().filter((e) => e.job_id === jobId);
  const last = evs.length ? evs[evs.length - 1].event : null;
  if (!TERMINAL.has(last) && !['collected'].includes(last)) {
    return { job_id: jobId, state: last || 'unknown', note: 'job ainda não terminou — usa mooter_status e volta' };
  }
  const { cost_usd, session_id, resultJson } = parseCostFromOut(meta.agent, jobDir);
  let body = null;
  if (meta.agent === 'cc' && resultJson) body = resultJson.result != null ? String(resultJson.result) : null;
  if (meta.agent === 'codex') { try { body = fs.readFileSync(path.join(jobDir, 'last-message.txt'), 'utf8'); } catch { body = null; } }
  if (body == null) { try { body = fs.readFileSync(path.join(jobDir, 'out.log'), 'utf8'); } catch { body = null; } }
  let truncated = false; let full_path = null;
  if (body && body.length > COLLECT_LIMIT) {
    truncated = true;
    full_path = path.join(jobDir, 'out.log');
    body = body.slice(0, 3000) + `\n\n[… truncado: ${body.length} chars — conteúdo completo em ${full_path} …]\n\n` + body.slice(-3000);
  }
  const already = evs.some((e) => e.event === 'collected');
  if (!already) ledgerAppend({ job_id: jobId, wave: meta.wave, agent: meta.agent, worktree: meta.worktree, event: 'collected', mp_hash: meta.mp_hash });
  return {
    job_id: jobId, state: last, agent: meta.agent, wave: meta.wave,
    result: body, session_id: session_id || null, cost_usd: cost_usd,
    truncated, full_path, idempotent: already ? 'já tinha sido coletado (evento não duplicado)' : 'primeira coleta',
  };
}

// ── MCP tool descriptors (annotations per MCP directory requirements) ─────
const TOOLS = [
  {
    name: 'mooter_route',
    description: 'Classify a task with the FROZEN Mooter router (tools/router/classify.js, read-only, <50ms, $0) and return {agent, tier, confidence, rationale}. Deterministic heuristics, no LLM call. Use before dispatching to pick the minimum viable tier.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'The task/prompt text to classify.' } }, required: ['text'], additionalProperties: false },
    annotations: { title: 'Route a task (Mooter classifier)', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolRoute,
  },
  {
    name: 'mooter_dispatch',
    description: 'Dispatch a masterprompt to a headless agent CLI (cc = claude -p | codex exec | gemini -p) with cwd set to the given git worktree. The guard validates FIRST (⇄ header, worktree ownership via ledger, path allowlist, vault deny) and refuses with reasons. Appends `dispatched` to the append-only ledger (~/.mooter/ledger.jsonl) and returns {job_id} IMMEDIATELY — it never waits for the job. Follow with mooter_status / mooter_collect.',
    inputSchema: { type: 'object', properties: {
      agent: { type: 'string', enum: ['cc', 'codex', 'gemini'], description: 'Which CLI executes the job.' },
      worktree: { type: 'string', description: 'Absolute path of the git worktree the job runs in (cwd). Must exist and be free of active jobs.' },
      masterprompt: { type: 'string', description: 'Full masterprompt (must contain the ⇄ routing header). Written to the job dir; the CLI is pointed at the file.' },
      wave: { type: 'string', description: 'Wave id for the ledger (e.g. "mooter-seamless-m1").' },
      allowedTools: { type: 'string', description: 'cc only: --allowedTools permission list (role matrix). Default "Read".' },
    }, required: ['agent', 'worktree', 'masterprompt', 'wave'], additionalProperties: false },
    annotations: { title: 'Dispatch a headless Mooter job', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    handler: toolDispatch,
  },
  {
    name: 'mooter_status',
    description: 'Status of one job (job_id) or a whole wave: ledger events (dispatched/started/done/failed/collected), liveness, exit codes, cost and duration when known, last stderr lines. Read-only over the append-only ledger.',
    inputSchema: { type: 'object', properties: {
      job_id: { type: 'string', description: 'Job id returned by mooter_dispatch.' },
      wave: { type: 'string', description: 'Wave id — returns every job in the wave.' },
    }, additionalProperties: false },
    annotations: { title: 'Mooter job/wave status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolStatus,
  },
  {
    name: 'mooter_collect',
    description: 'Collect the result of a finished job: result text (CC json result / Codex last message / raw output), session id and cost when known. Results >100k chars come back as head+tail excerpt plus the full-file path. Idempotent — the `collected` ledger event is appended once.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string', description: 'Job id returned by mooter_dispatch.' } }, required: ['job_id'], additionalProperties: false },
    annotations: { title: 'Collect a Mooter job result', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolCollect,
  },
];

module.exports = {
  TOOLS, guardCheck, ledgerAppend, ledgerRead, activeJobsByWorktree,
  toolRoute, toolDispatch, toolStatus, toolCollect,
  buildCommand, bootstrapPrompt, setJobSpawner, REGISTRY,
  _paths: { REPO, LEDGER_PATH, JOBS_DIR },
};
