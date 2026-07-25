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
const telemetry = require('./telemetry.js');
const moo = require('./moo.js');
const plan = require('./plan.js');
const journal = require('./journal.js');

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

// ── v1.2 · sweeper: jobs orphaned by a connector restart ──────────────────
// The 30-minute watchdog below lives ONLY in this process's memory. Every time
// the desktop app restarts the connector, in-flight timers die with it and the
// job stays `started` in the ledger FOREVER. activeJobsByWorktree() then reads
// that ghost and the WIP guard refuses every future dispatch on that worktree —
// permanently, with no tool to clear it. Measured on 2026-07-25 with a hung
// codex job that locked `frugal-integ`.
// So: on boot, close what this process cannot possibly own.
/**
 * ⚠️ Liveness is proven, not assumed.
 *
 * v1.2 declared a job orphaned whenever THIS process did not know it. The audit
 * caught the consequence: with two Claude Desktop windows, the second server
 * boots, sees the first one's running jobs, marks them `failed`, and frees the
 * WIP guard — so two agents can land in the same worktree. Fatal.
 *
 * Every dispatch now drops `<jobDir>/owner.json` with the owning pid. A job is
 * only an orphan if its owner process is genuinely gone.
 */
function ownerAlive(job_id) {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(JOBS_DIR(), job_id, 'owner.json'), 'utf8'));
    if (!o || !o.pid) return false;
    if (o.pid === process.pid) return REGISTRY.has(job_id);
    try { process.kill(o.pid, 0); return true; }   // signal 0 = "does it exist?"
    catch (e) { return e && e.code === 'EPERM'; }  // exists but not ours to signal
  } catch { return false; }
}

function sweepOrphans() {
  const swept = [];
  const state = new Map();
  for (const ev of ledgerRead()) {
    if (!ev.job_id) continue;
    if (ev.event === 'dispatched' || ev.event === 'started') state.set(ev.job_id, ev);
    if (TERMINAL.has(ev.event) || ev.event === 'collected') state.delete(ev.job_id);
  }
  for (const [job_id, ev] of state) {
    if (REGISTRY.has(job_id)) continue;   // ours and alive
    if (ownerAlive(job_id)) continue;     // someone else's, and still running
    ledgerAppend({
      job_id, wave: ev.wave, agent: ev.agent, worktree: ev.worktree,
      event: 'failed', mp_hash: ev.mp_hash, exit_code: 'orphaned-by-restart',
    });
    swept.push(job_id);
  }
  return swept;
}

// ── guard v0 (seam for the canonical guard — see header) ──────────────────
// v1.2: `moo` joins the enum. Until now the router mapped T0 → moo and then
// admitted in its own routing_note that moo "não é dispatchável" — the local
// tier was decoration. The GPU had a model resident and zero jobs.
const KNOWN_AGENTS = ['cc', 'codex', 'gemini', 'moo'];
const LOCAL_AGENTS = new Set(['moo']);
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
/**
 * v1.2 — TWO changes that turn the router from advisory into actual policy.
 *
 * 1. `model` is finally passed through. Until v1.1 `mooter_route` returned a
 *    `recommended_model` that NOTHING consumed: `grep -- "--model" *.js` = 0.
 *    Proof from a real job on 2026-07-25: the router said `claude-opus-4-6`,
 *    the CLI ran `claude-opus-4-8` — the subscription default. Every one of the
 *    six sessions measured that day was Opus, and `savedUsd` was negative in
 *    all six, because the saving baseline is all-Opus and everything WAS Opus.
 *    A local-first router that cannot pick the model is a slogan.
 *
 * 2. `stream-json` replaces `json`. Same final numbers, but the job now narrates
 *    itself line by line while it works: real model, tokens, and which file it
 *    is reading. That is what telemetry.js reads. (`--verbose` is required by
 *    the CLI when streaming in print mode.)
 */
function buildCommand(agent, jobDir, allowedTools, model) {
  const mpPath = path.join(jobDir, 'masterprompt.md');
  const outFile = path.join(jobDir, 'last-message.txt');
  const boot = bootstrapPrompt(mpPath);
  if (agent === 'cc') {
    const args = ['-p', boot, '--output-format', 'stream-json', '--verbose'];
    // v1 WITHOUT --bare (D3: subscription auth + Mooter router hooks fire).
    // Docs 2026-07-24: --bare will become the -p default in a future release — revisit then.
    args.push('--allowedTools', allowedTools || 'Read');
    if (model) args.push('--model', String(model));
    return { bin: 'claude', args };
  }
  if (agent === 'codex') {
    const args = ['exec', boot, '--json', '--sandbox', 'workspace-write', '--output-last-message', outFile];
    if (model) args.push('--model', String(model));
    return { bin: 'codex', args };
  }
  if (agent === 'gemini') {
    const args = ['-p', boot, '--output-format', 'json', '--approval-mode', 'auto_edit'];
    if (model) args.push('--model', String(model));
    return { bin: 'gemini', args };
  }
  if (agent === 'moo') {
    // handled in-process by moo.js — no CLI, no shell, no PATH lottery
    return { bin: '(ollama)', args: ['/api/chat', model || '(auto)'], local: true };
  }
  throw new Error('unknown agent ' + agent);
}
function quoteArg(a) {
  // our own paths/flags only — guard already rejected quotes in caller args
  return /[\s]/.test(a) ? '"' + a + '"' : a;
}

// ── spawner (injectable for hermetic tests) ───────────────────────────────
/**
 * v1.2 — `stdio[0] = 'ignore'`. This one word resurrects the Codex agent.
 *
 * Node's default is ['pipe','pipe','pipe'], so the child inherited a stdin pipe
 * that NEVER saw EOF. `claude -p` survives only because it gives up after 3s
 * ("no stdin data received in 3s, proceeding without it"). `codex exec` waits
 * forever: stderr reads "Reading additional input from stdin..." and the job
 * hangs until something kills it. Reproduced 2026-07-25 (job-ms0afc3y-aae0,
 * 8+ minutes, no output) and it is a known upstream bug with a unanimous
 * workaround — close stdin (`< /dev/null`). We do it at the source instead.
 */
function realSpawnJob(cmd, cwd, outStream, errStream) {
  const isWin = process.platform === 'win32';
  const opts = { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] };
  const child = isWin
    ? spawn([cmd.bin, ...cmd.args.map(quoteArg)].join(' '), Object.assign({ shell: true, windowsHide: true }, opts))
    : spawn(cmd.bin, cmd.args, opts);
  if (child.stdout) child.stdout.pipe(outStream);
  if (child.stderr) child.stderr.pipe(errStream);
  return child;
}

/**
 * Killing a job on Windows: `child.kill()` is not enough.
 * With `shell: true` the direct child is cmd.exe, so SIGKILL reaps the SHELL and
 * leaves the real CLI (claude.exe / codex.exe) orphaned and running — while the
 * ledger cheerfully writes `failed`. `taskkill /T` walks the whole process tree.
 */
function killTree(child) {
  if (!child) return false;
  const pid = child.pid;
  if (process.platform === 'win32' && pid) {
    try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: ['ignore', 'ignore', 'ignore'] }); return true; }
    catch { /* fall through to the plain kill */ }
  }
  try { child.kill('SIGKILL'); return true; } catch { return false; }
}
let spawnJob = realSpawnJob;
function setJobSpawner(fn) { spawnJob = fn; }

// ── job registry (live children in this server instance) ──────────────────
const REGISTRY = new Map(); // job_id → { child, timer, startedAt }

/**
 * v1.2 — reads the NDJSON stream instead of one final JSON blob.
 *
 * Returns the model the job ACTUALLY used, straight from its own stream. That
 * kills the worst bug in v1.1: fleet.js matched jobs to sessions by folder and
 * copied the model of whatever session shared that cwd — on 2026-07-25 a job
 * was labelled with the model of an 18-hour-old session. The stream cannot lie.
 *
 * `moo` reports a MEASURED zero (local inference costs nothing); codex/gemini
 * stay null, because unknown is unknown.
 */
function readJobResult(agent, jobDir, elapsedSeconds) {
  const empty = { cost_usd: null, session_id: null, model_used: null, body: null, telemetry: null };
  try {
    const t = telemetry.readJobTelemetry(path.join(jobDir, 'out.log'), elapsedSeconds);
    if (!t) return empty;
    let cost = t.cost_usd;
    if (cost == null && LOCAL_AGENTS.has(agent)) cost = 0;   // measured, not guessed
    if (cost == null && agent !== 'cc' && agent !== 'moo') cost = null;
    return {
      cost_usd: cost != null ? cost : null,
      session_id: t.session_id || null,
      model_used: t.model || null,
      body: t.finished && t.activity ? null : null,          // body comes from collect, not here
      telemetry: t,
    };
  } catch { return empty; }
}
// kept for callers/tests that still use the old name
function parseCostFromOut(agent, jobDir) {
  const r = readJobResult(agent, jobDir, null);
  return { cost_usd: r.cost_usd, session_id: r.session_id, resultJson: r.telemetry };
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
    cli_model: cliModelFor(d.tier, d.recommended_model),
    routing_note: 'classify.js (FROZEN, read-only) decide TIER; codex/gemini são escolha de doutrina de wave, não do classifier. v1.2: T0/moo É dispatchável (Ollama local, $0) e o modelo recomendado É passado ao CLI — o roteamento deixou de ser consultivo.',
  };
}

/**
 * Turn a tier into a flag the CLI accepts.
 *
 * The classifier speaks in product names ("haiku", "sonnet", "claude-opus-4-6").
 * `claude --model` takes an alias or a full name. We map to ALIASES on purpose:
 * an alias always resolves to the current model of that class, so a pinned
 * version cannot rot into an error six weeks from now. Unknown tier → null,
 * and null means "let the CLI decide" — never a fabricated model name.
 */
function cliModelFor(tier, recommended) {
  const t = String(tier || '').toUpperCase();
  if (t === 'T1') return 'haiku';
  if (t === 'T2') return 'sonnet';
  if (t === 'T3') return 'opus';
  if (t === 'T5') return null;               // Fable is opt-in via @fable, never auto-routed
  const r = String(recommended || '').toLowerCase();
  if (r.includes('haiku')) return 'haiku';
  if (r.includes('sonnet')) return 'sonnet';
  if (r.includes('opus')) return 'opus';
  return null;
}

/** Ask the FROZEN classifier directly. Returns null if it is unavailable. */
function classifyOrNull(text) {
  try {
    const { classify } = require(path.join(REPO, 'tools', 'router', 'classify.js'));
    return classify(String(text || ''));
  } catch { return null; }
}

/**
 * Pull a finished job's answer in, so the next agent starts where the last one
 * stopped. This is what makes a handoff REAL: not a slogan about collaboration,
 * but the previous output physically embedded in the next masterprompt — and
 * recorded in the ledger as `handoff_from`, so the panel can draw the arrow
 * without anyone inventing it.
 */
function embedHandoff(masterprompt, fromJobId) {
  if (!fromJobId) return { mp: masterprompt, ok: false };
  try {
    const jobDir = path.join(JOBS_DIR(), fromJobId);
    const meta = JSON.parse(fs.readFileSync(path.join(jobDir, 'meta.json'), 'utf8'));
    const tail = telemetry.readTail(path.join(jobDir, 'out.log'), telemetry.TAIL_BYTES) || '';
    const evs = telemetry.parseLines(tail);
    let body = null;
    for (let i = evs.length - 1; i >= 0; i--) {
      if (evs[i] && evs[i].result != null) { body = String(evs[i].result); break; }
    }
    if (!body) return { mp: masterprompt, ok: false };
    const who = meta.agent === 'moo' ? ('GPU local' + (meta.model ? ' · ' + meta.model : '')) : (meta.agent + (meta.model ? ' · ' + meta.model : ''));
    const block = [
      '',
      '---',
      '## ⇄ PREPARADO PARA TI POR ' + who.toUpperCase() + ' (job ' + fromJobId + ')',
      '',
      'Isto foi produzido antes de tu entrares, para não gastares tokens a redescobrir o óbvio.',
      'Trata como contexto, não como verdade absoluta — se algo estiver errado, corrige e diz.',
      '',
      body.slice(0, 12000),
      '---',
      '',
    ].join('\n');
    return { mp: masterprompt + block, ok: true, from_agent: meta.agent, from_model: meta.model || null };
  } catch { return { mp: masterprompt, ok: false }; }
}

async function toolDispatch(args) {
  const agent = String((args && args.agent) || '').trim();
  const worktree = String((args && args.worktree) || '').trim();
  let masterprompt = String((args && args.masterprompt) || '');
  const wave = String((args && args.wave) || 'adhoc').trim();
  const allowedTools = args && args.allowedTools ? String(args.allowedTools) : null;
  const stepId = args && args.step ? String(args.step) : null;
  const handoffFrom = args && args.handoff_from ? String(args.handoff_from) : null;
  const chain = args && args.__chain ? args.__chain : null;   // internal: set by mooter_work

  const g = guardCheck({ agent, worktree, masterprompt, wave, allowedTools });
  if (!g.ok) return { error: '❌ guard recusou o dispatch', reasons: g.reasons };

  // handoff: embed the previous job's answer BEFORE hashing, so mp_hash covers
  // what the agent actually receives — otherwise the audit trail is a lie
  let handoff = { ok: false };
  if (handoffFrom) {
    handoff = embedHandoff(masterprompt, handoffFrom);
    masterprompt = handoff.mp;
  }

  // ── v1.2: the model is decided HERE, and it is decided by the router ──────
  // Explicit arg wins (the human is always allowed to overrule). Otherwise the
  // FROZEN classifier picks the minimum viable tier and we pass it to the CLI.
  // Before this, `recommended_model` was computed and thrown away.
  const classified = classifyOrNull(masterprompt);
  const model_recommended = classified ? cliModelFor(classified.tier, classified.recommended_model) : null;
  const model = args && args.model ? String(args.model) : model_recommended;
  const tier = classified ? (classified.tier || null) : null;

  ensureDirs();
  const job_id = 'job-' + Date.now().toString(36) + '-' + crypto.randomBytes(2).toString('hex');
  const jobDir = path.join(JOBS_DIR(), job_id);
  fs.mkdirSync(jobDir, { recursive: true });
  const mpPath = path.join(jobDir, 'masterprompt.md');
  fs.writeFileSync(mpPath, masterprompt, 'utf8');
  const mp_hash = sha256(masterprompt);
  const cmd = buildCommand(agent, jobDir, allowedTools, model);
  const wtNorm = path.resolve(worktree);
  fs.writeFileSync(path.join(jobDir, 'meta.json'), JSON.stringify({
    job_id, wave, agent, worktree: wtNorm, mp_hash, cmd: [cmd.bin, ...cmd.args].join(' '),
    created_at: nowIso(), depth: 1, model, model_recommended, tier, step: stepId,
  }, null, 2));

  ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'dispatched', mp_hash, model, model_recommended, tier, step: stepId,
    handoff_from: handoff.ok ? handoffFrom : null });

  const outStream = fs.createWriteStream(path.join(jobDir, 'out.log'));
  const errStream = fs.createWriteStream(path.join(jobDir, 'err.log'));
  const t0 = Date.now();
  let child;
  try {
    if (agent === 'moo') {
      // local tier: no CLI, no shell, no PATH lottery — straight to the GPU
      const resident = await require('./fleet.js').probeOllama(700).catch(() => null);
      const chosen = await moo.pickModel(model, process.env.OLLAMA_HOST || '127.0.0.1:11434', resident);
      if (!chosen) {
        ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'failed', mp_hash, exit_code: 'no-local-model' });
        return { error: 'nenhum modelo local disponível (Ollama sem modelos ou inalcançável) — nada foi inventado', job_id };
      }
      child = moo.runLocal({
        hostStr: process.env.OLLAMA_HOST || '127.0.0.1:11434',
        model: chosen, prompt: masterprompt, outStream, errStream,
      });
      try {
        const m = JSON.parse(fs.readFileSync(path.join(jobDir, 'meta.json'), 'utf8'));
        m.model = chosen; fs.writeFileSync(path.join(jobDir, 'meta.json'), JSON.stringify(m, null, 2));
      } catch { /* */ }
    } else {
      child = spawnJob(cmd, wtNorm, outStream, errStream);
    }
  } catch (e) {
    ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'failed', mp_hash, exit_code: 'spawn-error' });
    return { error: 'spawn falhou: ' + ((e && e.message) || e), job_id };
  }
  const timer = setTimeout(() => {
    killTree(child);
    REGISTRY.delete(job_id);
    ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'failed', mp_hash, exit_code: 'timeout', duration_s: Math.round((Date.now() - t0) / 1000) });
  }, JOB_TIMEOUT_MS());
  REGISTRY.set(job_id, { child, timer, startedAt: t0, wave, agent, worktree: wtNorm, mp_hash, step: stepId });
  // proof of ownership: another connector instance must be able to tell whether
  // this job is alive before it dares to declare it orphaned
  try { fs.writeFileSync(path.join(jobDir, 'owner.json'), JSON.stringify({ pid: process.pid, at: nowIso() })); } catch { /* */ }
  if (stepId) {
    try {
      // title: the first meaningful line of the masterprompt, so a step created
      // by a bare dispatch still reads like something a human wrote
      const firstLine = String(masterprompt).split('\n').map((l) => l.trim())
        .find((l) => l && !l.startsWith('⇄') && !l.startsWith('#')) || ('job ' + agent);
      plan.updateStep(wave, stepId, {
        state: 'a-correr', job_id, title: firstLine.slice(0, 90), agent,
        by: (agent === 'moo' ? 'Ollama · local' : agent) + (model ? ' · ' + model : ''),
      });
    } catch { /* */ }
  }

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
    const dur = Math.round((Date.now() - t0) / 1000);
    // ⚠️ `close` fires when the process ends, NOT when our WriteStream has
    // drained. Reading immediately could miss the final `result` line — which
    // carries cost, model and tokens. Wait for the stream to finish, with a
    // short ceiling so a stuck pipe can never hold the ledger hostage.
    finalizeWhenFlushed(outStream, () => finish(code, dur));
  });

  function finalizeWhenFlushed(stream, done) {
    let fired = false;
    const go = () => { if (!fired) { fired = true; done(); } };
    try {
      if (stream.writableFinished || stream.closed) return go();
      stream.once('finish', go);
      stream.once('close', go);
      stream.end();
      setTimeout(go, 1500).unref?.();
    } catch { go(); }
  }

  function finish(code, dur) {
    const r = readJobResult(agent, jobDir, dur);
    const ok = code === 0;
    ledgerAppend({
      job_id, wave, agent, worktree: wtNorm, event: ok ? 'done' : 'failed', mp_hash,
      exit_code: code, cost_usd: r.cost_usd, duration_s: dur,
      // model_used comes from the job's own stream. model_recommended is what the
      // router asked for. Keeping both makes the gap between doctrine and reality
      // a metric instead of a surprise.
      model_used: r.model_used, model_recommended, tier,
      session_id: r.session_id,
      tokens_in: r.telemetry ? r.telemetry.tokens_in : null,
      tokens_out: r.telemetry ? r.telemetry.tokens_out : null,
      step: stepId,
    });
    if (stepId) {
      try {
        plan.updateStep(wave, stepId, {
          state: ok ? 'feito' : 'falhou',
          job_id,
          by: (agent === 'moo' ? 'Ollama · local' : agent) + (r.model_used ? ' · ' + r.model_used : ''),
          note: r.cost_usd != null ? '$' + Number(r.cost_usd).toFixed(4) + ' · ' + dur + 's' : dur + 's',
        });
      } catch { /* the plan is a convenience; it must never break a job */ }
    }
    // ── the chain: the local moo finished, now the paid agent starts, with the
    // moo's work already in its prompt. This is the "carregar o piano" step.
    if (ok && chain) {
      setImmediate(() => {
        toolDispatch(Object.assign({}, chain, { handoff_from: job_id }))
          .then((r2) => { if (r2 && r2.error) log('chain dispatch recusado: ' + JSON.stringify(r2.reasons || r2.error)); })
          .catch((e) => log('chain falhou: ' + ((e && e.message) || e)));
      });
    }
  }

  return {
    job_id, wave, agent, worktree: wtNorm, mp_hash,
    model: agent === 'moo' ? (model || '(auto local)') : model,
    model_recommended, tier,
    routed: model && model === model_recommended ? 'pelo classify.js (FROZEN)' : (args && args.model ? 'forçado pelo chamador' : 'default do CLI'),
    note: 'dispatch aceito; acompanhar com mooter_status (traz tokens e a acção em curso), resultado via mooter_collect',
  };
}

async function toolStatus(args) {
  const jobId = args && args.job_id ? String(args.job_id) : null;
  const wave = args && args.wave ? String(args.wave) : null;
  if (!jobId && !wave) return { error: 'passa job_id ou wave' };
  const evs = ledgerRead().filter((e) => (jobId ? e.job_id === jobId : e.wave === wave));
  if (!evs.length) return { error: 'nada no ledger para ' + (jobId || wave) };
  const byJob = {};
  for (const e of evs) {
    const j = byJob[e.job_id] || (byJob[e.job_id] = { job_id: e.job_id, wave: e.wave, agent: e.agent, worktree: e.worktree, events: [], last: null, started_ts: null });
    j.events.push({ ts: e.ts, event: e.event, exit_code: e.exit_code, cost_usd: e.cost_usd, duration_s: e.duration_s });
    j.last = e.event;
    if (e.event === 'started') j.started_ts = e.ts;
    if (e.model_used) j.model_used = e.model_used;
    if (e.model_recommended) j.model_recommended = e.model_recommended;
    if (e.tier) j.tier = e.tier;
    if (e.step) j.step = e.step;
  }
  for (const j of Object.values(byJob)) {
    j.alive = REGISTRY.has(j.job_id);
    // v1.2 — the third state that was missing. The ledger saying `started` while
    // this process knows nothing about the job does NOT mean it is running: it
    // means the connector restarted and the truth was lost. Reporting alive:false
    // next to last:"started" and calling it a day was two contradictory fields
    // with no name. Now it has a name, and the sweeper can act on it.
    j.stale = !j.alive && (j.last === 'started' || j.last === 'dispatched');
    if (j.stale) j.stale_note = 'o ledger diz "' + j.last + '" mas este processo não conhece o job — provável restart do conector. Usa mooter_cancel para o encerrar honestamente.';
    try {
      const errPath = path.join(JOBS_DIR(), j.job_id, 'err.log');
      const tail = fs.readFileSync(errPath, 'utf8').split('\n').filter(Boolean).slice(-5);
      if (tail.length) j.stderr_tail = tail;
    } catch { /* */ }
    // live telemetry, straight from the job's own stream
    try {
      const elapsed = j.started_ts ? Math.max(1, Math.round((Date.now() - Date.parse(j.started_ts)) / 1000)) : null;
      const t = telemetry.readJobTelemetry(path.join(JOBS_DIR(), j.job_id, 'out.log'), elapsed);
      if (t) {
        j.now = {
          model: t.model || null,
          activity: t.activity || null,
          tokens_in: t.tokens_in, tokens_out: t.tokens_out,
          tok_s: t.tok_s, steps_done: t.steps_done,
          tools_used: t.tools_used && t.tools_used.length ? t.tools_used : null,
          cost_usd: t.cost_usd,
        };
        if (t.model && !j.model_used) j.model_used = t.model;
      }
    } catch { /* telemetry is a bonus; status must never fail because of it */ }
  }
  return { jobs: Object.values(byJob), ledger_lines: evs.length };
}

/**
 * mooter_cancel — the exit that did not exist.
 *
 * v1.1 had no way to end a job: no tool, no protocol path. A hung job stayed
 * `started` in the ledger forever, and the WIP guard then refused every future
 * dispatch on that worktree. The only escape was killing a process by hand in
 * Windows. That is the opposite of "the vibe coder never leaves the chat".
 */
async function toolCancel(args) {
  const jobId = String((args && args.job_id) || '').trim();
  const sweep = !!(args && args.sweep);
  if (!jobId && !sweep) return { error: 'passa job_id, ou sweep:true para encerrar todos os órfãos' };

  if (sweep && !jobId) {
    const swept = sweepOrphans();
    return {
      swept, count: swept.length,
      note: swept.length
        ? 'órfãos encerrados no ledger (exit_code "orphaned-by-restart") — as worktrees ficaram livres'
        : 'nenhum órfão: todos os jobs do ledger têm estado terminal ou estão vivos neste processo',
    };
  }

  const live = REGISTRY.get(jobId);
  const evs = ledgerRead().filter((e) => e.job_id === jobId);
  if (!evs.length) return { error: 'job desconhecido: ' + jobId };
  const last = evs[evs.length - 1];
  if (TERMINAL.has(last.event)) return { job_id: jobId, state: last.event, note: 'já estava terminado — nada a fazer (idempotente)' };

  let killed = false;
  if (live) { clearTimeout(live.timer); killed = killTree(live.child); REGISTRY.delete(jobId); }
  ledgerAppend({
    job_id: jobId, wave: last.wave, agent: last.agent, worktree: last.worktree,
    event: 'failed', mp_hash: last.mp_hash,
    exit_code: killed ? 'cancelled-by-user' : 'cancelled-stale',
    duration_s: live ? Math.round((Date.now() - live.startedAt) / 1000) : null,
  });
  if (live && live.step) { try { plan.updateStep(live.wave, live.step, { state: 'falhou', note: 'cancelado' }); } catch { /* */ } }
  return {
    job_id: jobId, killed,
    note: killed
      ? 'processo morto (árvore inteira, taskkill /T no Windows) e ledger fechado'
      : 'o processo não vivia neste servidor (restart) — ledger fechado, worktree libertada',
  };
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
  const durEv = evs.find((e) => e.duration_s != null);
  const r = readJobResult(meta.agent, jobDir, durEv ? durEv.duration_s : null);
  const { cost_usd, session_id } = r;
  let body = null;
  // stream-json: the final `result` event carries the answer, on its own line
  if (meta.agent === 'cc' || meta.agent === 'moo') {
    try {
      const tail = telemetry.readTail(path.join(jobDir, 'out.log'), telemetry.TAIL_BYTES) || '';
      const evsJson = telemetry.parseLines(tail);
      for (let i = evsJson.length - 1; i >= 0; i--) {
        const e2 = evsJson[i];
        // `type:"result"` (stream-json) or a bare object carrying `result`
        // (`--output-format json`, and older bundles). Both are the final word.
        if (e2 && e2.result != null && (e2.type === 'result' || e2.total_cost_usd != null || evsJson.length === 1)) {
          body = String(e2.result); break;
        }
      }
    } catch { /* */ }
  }
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
    // v1.2: the model the job REALLY ran, from its own stream — never inferred
    model_used: r.model_used || null,
    model_recommended: meta.model_recommended || null,
    tier: meta.tier || null,
    tokens_in: r.telemetry ? r.telemetry.tokens_in : null,
    tokens_out: r.telemetry ? r.telemetry.tokens_out : null,
    tok_s: r.telemetry ? r.telemetry.tok_s : null,
    tools_used: r.telemetry && r.telemetry.tools_used && r.telemetry.tools_used.length ? r.telemetry.tools_used : null,
    truncated, full_path, idempotent: already ? 'já tinha sido coletado (evento não duplicado)' : 'primeira coleta',
  };
}

// ── v1.2 · plan / journal / work ─────────────────────────────────────────
async function toolPlan(args) {
  const a = args || {};
  const wave = String(a.wave || '').trim();
  if (!wave) return { error: 'wave é obrigatório' };
  const action = String(a.action || 'get');
  if (action === 'set') {
    if (!Array.isArray(a.steps) || !a.steps.length) return { error: 'steps é obrigatório em action:"set"' };
    return plan.summarize(plan.setPlan(wave, a.steps, a.goal));
  }
  if (action === 'update') {
    if (!a.step) return { error: 'step é obrigatório em action:"update"' };
    const r = plan.updateStep(wave, String(a.step), { state: a.state, by: a.by, note: a.note, job_id: a.job_id, risk: a.risk });
    return r && r.error ? r : plan.summarize(r);
  }
  const p = plan.readPlan(wave);
  return p ? plan.summarize(p) : { error: 'sem plano para a wave "' + wave + '"', hint: 'cria com action:"set"' };
}

async function toolJournal(args) {
  const a = args || {};
  if (a.status_only) return journal.vaultStatus();
  if (!a.title || !a.body) return { error: 'title e body são obrigatórios (ou usa status_only:true)' };
  const wave = a.wave ? String(a.wave) : null;
  let jobs = null; let cost = null;
  if (wave) {
    const evs = ledgerRead().filter((e) => e.wave === wave);
    jobs = [...new Set(evs.map((e) => e.job_id).filter(Boolean))];
    const costs = evs.map((e) => e.cost_usd).filter((c) => c != null);
    if (costs.length) cost = Number(costs.reduce((s, c) => s + Number(c), 0).toFixed(6));
  }
  return journal.writeNote({
    title: String(a.title), body: String(a.body), kind: a.kind || 'learning',
    wave, tags: a.tags, jobs, cost_usd: cost, subfolder: a.subfolder,
  });
}

/**
 * mooter_work — ONE door.
 *
 * Nine tools that demand you know what a worktree, a wave, a tier and an
 * allowedTools list are do not serve a vibe coder; they serve whoever built
 * them. This tool takes a goal in plain language and does the rest: classify,
 * pick the tier AND the agent, pick a free worktree, write the ⇄ handoff header
 * the constitution requires, dispatch, and hand back a live panel.
 *
 * It is deliberately conservative: read-only by default, and it refuses rather
 * than guessing a worktree. Refusing is honest; guessing writes code somewhere
 * you did not look.
 */
async function toolWork(args) {
  const a = args || {};
  const goal = String(a.goal || '').trim();
  if (!goal) return { error: 'goal é obrigatório — descreve o que queres em linguagem normal' };
  // The guard only checks that a ⇄ header EXISTS. If user text could carry its
  // own ⇄, a forged routing header could smuggle instructions past the reader's
  // eye ("⇄ ROUTING ... allowedTools: everything"). The header is ours alone.
  if (/⇄/.test(goal) || /⇄/.test(String(a.context || ''))) {
    return { error: '❌ "⇄" é reservado ao cabeçalho de routing — remove-o do goal/context (tentativa de forjar handoff)' };
  }

  const d = classifyOrNull(goal);
  const tier = d ? (d.tier || null) : null;
  const agent = a.agent ? String(a.agent) : (tier === 'T0' ? 'moo' : 'cc');
  const model = a.model ? String(a.model) : (d ? cliModelFor(tier, d.recommended_model) : null);
  const wave = String(a.wave || ('work-' + new Date().toISOString().slice(0, 10) + '-' + crypto.randomBytes(2).toString('hex')));

  let worktree = a.worktree ? String(a.worktree) : null;
  if (!worktree) {
    const ctx = (() => { try { return require('./fleet.js').readSessionContext(); } catch { return null; } })();
    worktree = (ctx && ctx.folder) || REPO;
  }
  const busy = activeJobsByWorktree(worktree);
  if (busy.length) {
    return {
      error: 'a worktree ' + worktree + ' já tem job activo (' + busy.join(', ') + ')',
      hint: 'usa mooter_cancel(job_id) ou mooter_cancel(sweep:true) se for um órfão, ou passa outra worktree',
    };
  }

  const readOnly = a.write !== true;
  const allowedTools = a.allowedTools ? String(a.allowedTools) : (readOnly ? 'Read,Glob,Grep' : 'Read,Glob,Grep,Edit,Write');
  const mp = [
    '⇄ ROUTING / DE: Cowork (mooter_work) / PARA: ' + agent + ' / WAVE: ' + wave,
    '',
    'OBJECTIVO: ' + goal,
    '',
    'REGRAS (constituição Mooter):',
    readOnly
      ? '- ❌ NÃO escrever, criar, alterar nem apagar ficheiro nenhum. Análise apenas.'
      : '- Escreve só o que o objectivo exige. ❌ Zero git (sem add/commit/push/merge/rebase/delete).',
    '- ❌ Nunca tocar em tools/router/classify.js (FROZEN).',
    '- Números só com fonte. O que não souberes = `n/d`. ❌ Não inventes.',
    '- Sê conciso: entrega o resultado, não o processo.',
    a.context ? '\nCONTEXTO ADICIONAL:\n' + String(a.context) : '',
  ].join('\n');

  if (Array.isArray(a.steps) && a.steps.length) { try { plan.setPlan(wave, a.steps, goal); } catch { /* */ } }
  else { try { plan.setPlan(wave, [{ title: goal, agent, state: 'a-correr' }], goal); } catch { /* */ } }

  // ── prepare: the local moo loads the piano before the expensive agent plays ──
  // Default ON when the GPU is available and the target is a paid agent. The
  // moo produces a short brief; the cloud job starts with it already embedded,
  // so the first paid token is spent on the actual problem instead of on
  // orientation. Costs $0 and is measured, not claimed.
  const wantsPrepare = a.prepare !== false && agent !== 'moo';
  if (wantsPrepare) {
    const resident = await require('./fleet.js').probeOllama(700).catch(() => null);
    const localModel = resident && resident.length ? await moo.pickModel(null, process.env.OLLAMA_HOST || '127.0.0.1:11434', resident) : null;
    if (localModel) {
      const prepMp = [
        '⇄ ROUTING / DE: Cowork (mooter_work) / PARA: moo (GPU local) / WAVE: ' + wave,
        '',
        'És o preparador. Um agente pago vai receber isto a seguir e não deve perder tokens a orientar-se.',
        '',
        'OBJECTIVO DA WAVE: ' + goal,
        a.context ? '\nCONTEXTO: ' + String(a.context) : '',
        '',
        'ENTREGA (≤250 palavras, sem preâmbulo):',
        '1. Reformula o objectivo em 1 frase precisa.',
        '2. Lista 3-6 passos concretos por ordem.',
        '3. Diz que ficheiros ou zonas do projecto são provavelmente relevantes.',
        '4. Nomeia 2 armadilhas prováveis.',
        '5. Diz o que NÃO deve ser feito.',
        '',
        '❌ Não inventes ficheiros nem factos. Se não souberes, escreve "a verificar".',
      ].join('\n');

      const prep = await toolDispatch({
        agent: 'moo', worktree, masterprompt: prepMp, wave, step: 'S0',
        __chain: { agent, worktree, masterprompt: mp, wave, allowedTools, model, step: 'S1' },
      });
      if (prep && prep.job_id) {
        return {
          ok: true, goal, wave, tier,
          phase: 'preparação local',
          agent: 'moo → ' + agent,
          model: (prep.model || localModel) + ' → ' + (model || '(default do CLI)'),
          job_id: prep.job_id,
          chained: true,
          worktree,
          mode: readOnly ? 'só leitura' : 'escrita permitida',
          note: 'a GPU local está a preparar o handoff ($0). Quando acabar, o ' + agent + ' arranca sozinho com esse trabalho já dentro do prompt — vê o painel.',
        };
      }
      // preparation refused (busy worktree, no model): fall through, never block
    }
  }

  const r = await toolDispatch({ agent, worktree, masterprompt: mp, wave, allowedTools, model, step: 'S1' });
  if (r && r.error) return Object.assign({ goal, wave, tier, agent, model }, r);
  return {
    ok: true, goal, wave, tier, agent,
    model: r.model || model || '(default do CLI)',
    routed: r.routed,
    job_id: r.job_id, worktree,
    prepared: false,
    mode: readOnly ? 'só leitura' : 'escrita permitida',
    note: 'a trabalhar. O painel actualiza-se sozinho; usa mooter_status para o texto e mooter_collect no fim.',
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
      agent: { type: 'string', enum: ['cc', 'codex', 'gemini', 'moo'], description: 'Which engine executes the job. `moo` = local Ollama on this machine ($0).' },
      worktree: { type: 'string', description: 'Absolute path of the git worktree the job runs in (cwd). Must exist and be free of active jobs.' },
      masterprompt: { type: 'string', description: 'Full masterprompt (must contain the ⇄ routing header). Written to the job dir; the CLI is pointed at the file.' },
      wave: { type: 'string', description: 'Wave id for the ledger (e.g. "mooter-seamless-m1").' },
      allowedTools: { type: 'string', description: 'cc only: --allowedTools permission list (role matrix). Default "Read".' },
      model: { type: 'string', description: 'Override the model (alias like "haiku"/"sonnet"/"opus", or a full name). Omit and the FROZEN classifier picks the minimum viable tier and passes it to the CLI.' },
      step: { type: 'string', description: 'Plan step id this job executes (see mooter_plan) — the step is marked running, then done/failed with who did it.' },
      handoff_from: { type: 'string', description: 'Job id whose result should be embedded into this masterprompt. Records a proven handoff chain in the ledger.' },
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
  {
    name: 'mooter_work',
    description: 'ONE DOOR: give it a goal in plain language and it does the rest — classifies with the FROZEN router, picks the minimum viable tier AND the engine (local Ollama for T0, Claude Code otherwise), picks a free worktree, writes the ⇄ handoff header the Mooter constitution requires, dispatches, and returns a live panel. Read-only unless you pass write:true. Use this instead of route+dispatch when you just want the work done.',
    inputSchema: { type: 'object', properties: {
      goal: { type: 'string', description: 'What you want, in normal language.' },
      write: { type: 'boolean', description: 'Allow the agent to modify files (default false = analysis only). Git is never allowed.' },
      worktree: { type: 'string', description: 'Where to work. Defaults to the bound Cowork folder.' },
      wave: { type: 'string', description: 'Wave id (auto-generated if omitted).' },
      agent: { type: 'string', enum: ['cc', 'codex', 'gemini', 'moo'], description: 'Force an engine. Omit to let the router decide.' },
      model: { type: 'string', description: 'Force a model. Omit to let the router decide.' },
      steps: { type: 'array', items: { type: 'string' }, description: 'Optional plan: the steps the panel should show, with risk inferred per step.' },
      prepare: { type: 'boolean', description: 'Let the local GPU write the handoff brief first, at $0, and start the paid agent with it already embedded. Default true when Ollama is up.' },
      allowedTools: { type: 'string', description: 'Override the permission list.' },
      context: { type: 'string', description: 'Extra context to inline in the masterprompt.' },
    }, required: ['goal'], additionalProperties: false },
    annotations: { title: 'Mooter: just do this', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    handler: toolWork,
  },
  {
    name: 'mooter_cancel',
    description: 'End a job honestly: kills the whole process tree (taskkill /T on Windows, because with shell:true a plain kill only reaps cmd.exe and orphans the real CLI) and closes it in the ledger, freeing the worktree. Pass sweep:true with no job_id to close every job left `started` by a connector restart — those ghosts block the WIP guard forever and there was previously no way out.',
    inputSchema: { type: 'object', properties: {
      job_id: { type: 'string', description: 'Job to cancel.' },
      sweep: { type: 'boolean', description: 'Close all orphaned jobs (no job_id needed).' },
    }, additionalProperties: false },
    annotations: { title: 'Cancel a Mooter job', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    handler: toolCancel,
  },
  {
    name: 'mooter_plan',
    description: 'The steps of a wave, who executed each one, and how risky it is. Risk is inferred from the step text (push/merge/delete/deploy/secrets = alto; writes = médio; reads = baixo) and can be overridden. The fleet panel renders this as a checklist so the user sees what is mapped, what is running, what is done and by whom — without opening an IDE.',
    inputSchema: { type: 'object', properties: {
      wave: { type: 'string', description: 'Wave id.' },
      action: { type: 'string', enum: ['get', 'set', 'update'], description: 'get (default) | set (replace the steps) | update (move one step).' },
      goal: { type: 'string', description: 'One line on what the wave is for.' },
      steps: { type: 'array', items: {}, description: 'For set: strings, or objects {id,title,risk,agent}.' },
      step: { type: 'string', description: 'For update: step id or title.' },
      state: { type: 'string', enum: ['pendente', 'a-correr', 'feito', 'falhou', 'saltado'] },
      by: { type: 'string', description: 'Who actually executed it (agent + model).' },
      job_id: { type: 'string' },
      note: { type: 'string' },
      risk: { type: 'string', enum: ['baixo', 'médio', 'alto'] },
    }, required: ['wave'], additionalProperties: false },
    annotations: { title: 'Mooter wave plan', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolPlan,
  },
  {
    name: 'mooter_journal',
    description: 'Write the wave outcome into the Obsidian vault. The vault root is DETECTED (a folder containing .obsidian/), never assumed — if none is found nothing is written and it says so, because scattering notes into a guessed folder is worse than not writing. Automatically attaches the wave job ids and the summed cost. Pass status_only:true to just report whether the vault is reachable and when the last note landed.',
    inputSchema: { type: 'object', properties: {
      title: { type: 'string' },
      body: { type: 'string', description: 'Markdown body.' },
      kind: { type: 'string', enum: ['learning', 'decision', 'project'], description: 'Decides the folder: 30-learnings | 20-decisions | 10-projects.' },
      wave: { type: 'string', description: 'Wave id — pulls job ids and cost into the frontmatter.' },
      tags: { type: 'array', items: { type: 'string' } },
      subfolder: { type: 'string', description: 'Override the destination folder.' },
      status_only: { type: 'boolean', description: 'Do not write; just report vault status.' },
    }, additionalProperties: false },
    annotations: { title: 'Write to the vault', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: toolJournal,
  },
];

module.exports = {
  TOOLS, guardCheck, ledgerAppend, ledgerRead, activeJobsByWorktree,
  toolRoute, toolDispatch, toolStatus, toolCollect, toolCancel, toolPlan, toolJournal, toolWork,
  buildCommand, bootstrapPrompt, setJobSpawner, REGISTRY,
  sweepOrphans, killTree, cliModelFor, classifyOrNull, readJobResult, parseCostFromOut,
  _paths: { REPO, LEDGER_PATH, JOBS_DIR },
};
