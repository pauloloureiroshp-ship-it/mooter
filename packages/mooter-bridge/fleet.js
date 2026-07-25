#!/usr/bin/env node
'use strict';
/**
 * fleet.js — mooter-bridge: live fleet state + the MCP Apps UI resource.
 *
 * Purely ADDITIVE. server.js / seamless.js / server-seamless.js are untouched.
 *
 * Three sources, three honesty levels:
 *   1. ~/.mooter/ledger.jsonl        -> dispatched jobs (subscription agents)
 *   2. GET 127.0.0.1:11434/api/ps    -> models actually resident on the GPU (local fleet)
 *   3. ~/.mooter/cowork-session.json -> which Cowork session/project/folder is driving
 * Unknown => null, NEVER fabricated. Read-only except the session bind.
 *
 * Wire format (MCP Apps, spec 2026-01-26):
 *   tool._meta.ui       = { resourceUri: 'ui://mooter/fleet', visibility: ['model','app'] }
 *   resource mimeType   = 'text/html;profile=mcp-app'
 *   resource._meta.ui   = { csp, prefersBorder }
 *
 * NOTE: the SERVER declares no UI capability — per spec the CLIENT advertises
 * `extensions["io.modelcontextprotocol/ui"]`. The server only owes `resources`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const telemetry = require('./telemetry.js');
const plan = require('./plan.js');
const journal = require('./journal.js');
const gpuMod = require('./gpu.js');

const UI_URI = 'ui://mooter/fleet';
const UI_MIME = 'text/html;profile=mcp-app';
const MOOTER_DIR = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
const LEDGER = path.join(MOOTER_DIR, 'ledger.jsonl');
const JOBS_DIR = path.join(MOOTER_DIR, 'jobs');
const SESSION_FILE = path.join(MOOTER_DIR, 'cowork-session.json');
const UI_FILE = path.join(__dirname, 'fleet-ui.html');

// A plugin .mcp.json declares env as "${OLLAMA_HOST}". When the variable is not
// set on the machine, some hosts pass the placeholder through VERBATIM — the probe
// then fails forever and the panel says n/d while Ollama is running fine.
// Treat an unexpanded placeholder as "not set". (Reproduced, then fixed.)
function envOrNull(name) {
  const v = process.env[name];
  if (!v) return null;
  const t = String(v).trim();
  if (!t || t.indexOf('${') >= 0) return null;
  return t;
}
const OLLAMA_HOST = envOrNull('OLLAMA_HOST') || '127.0.0.1:11434';
const OLLAMA_TIMEOUT_MS = 700; // the panel polls every 3s — never block on a dead daemon

const AGENT_LABEL = { cc: 'Claude Code', codex: 'Codex', gemini: 'Gemini', moo: 'Ollama · local' };
const LOCAL_AGENTS = new Set(['moo']);

function norm(p) { return String(p || '').replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase(); }
function leaf(p) { return String(p || '').split(/[\\/]/).filter(Boolean).pop() || ''; }

// ── 1. ledger ─────────────────────────────────────────────────────────────
function readLedgerLines(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const out = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* skip malformed, never guess */ }
  }
  return out;
}

function foldJobs(events) {
  const byId = new Map();
  for (const e of events) {
    if (!e || !e.job_id) continue;
    let j = byId.get(e.job_id);
    if (!j) {
      j = { job_id: e.job_id, wave: e.wave || null, agent: e.agent || null, worktree: e.worktree || null,
            state: null, dispatched_at: null, started_at: null, ended_at: null, exit_code: null, duration_s: null };
      byId.set(e.job_id, j);
    }
    if (e.wave) j.wave = e.wave;
    if (e.agent) j.agent = e.agent;
    if (e.worktree) j.worktree = e.worktree;
    if (e.event === 'dispatched') { j.dispatched_at = e.ts; j.state = 'dispatched'; }
    else if (e.event === 'started') { j.started_at = e.ts; j.state = 'running'; }
    else if (e.event === 'done') { j.ended_at = e.ts; j.state = 'done'; }
    else if (e.event === 'failed') { j.ended_at = e.ts; j.state = 'failed'; }
    else if (e.event === 'collected' && j.state !== 'failed') { j.state = j.state === 'running' ? 'done' : j.state; }
    if (e.exit_code != null) j.exit_code = e.exit_code;
    if (e.duration_s != null) j.duration_s = e.duration_s;
    if (e.cost_usd != null) j.cost_usd = e.cost_usd;
    // v1.2 — the ledger now carries the truth about the model, so the panel
    // never has to infer it. model_used comes from the job's own stream;
    // model_recommended is what the FROZEN router asked for. Both, always.
    if (e.model_used) j.model_used = e.model_used;
    if (e.model_recommended) j.model_recommended = e.model_recommended;
    if (e.tier) j.tier = e.tier;
    if (e.step) j.step = e.step;
    if (e.session_id) j.session_id = e.session_id;
    if (e.tokens_in != null) j.tokens_in = e.tokens_in;
    if (e.tokens_out != null) j.tokens_out = e.tokens_out;
    if (e.handoff_from) j.handoff_from = e.handoff_from;
  }
  return [...byId.values()];
}

function elapsedSeconds(job, now) {
  const from = job.started_at || job.dispatched_at;
  if (!from) return null;
  const t0 = Date.parse(from);
  if (Number.isNaN(t0)) return null;
  if (job.state === 'running' || job.state === 'dispatched') return Math.max(0, Math.round((now - t0) / 1000));
  if (job.duration_s != null) return job.duration_s;
  const t1 = job.ended_at ? Date.parse(job.ended_at) : NaN;
  return Number.isNaN(t1) ? null : Math.max(0, Math.round((t1 - t0) / 1000));
}

/**
 * v1.2 — THE BUG THIS FIXES, in full, because it must never come back:
 *
 * v1.1 matched a job to a cockpit session by folder alone and copied its model.
 * On 2026-07-25 job-ms0aezxg-1c8f (11:30–11:32) was labelled `claude-opus-4-8`
 * from session a00885ef — a session **18 hours old** that merely shared the
 * `frugal-w2` folder. The right session (fe11d2a3) was already known: it comes
 * back in mooter_collect. So the panel was confidently wrong while the truth
 * sat one field away. Confidently wrong is worse than `n/d`.
 *
 * New order of trust:
 *   1. j.model_used   — the job's own stream. Cannot lie.
 *   2. j.session_id   — the id the job itself reported; look it up by ID.
 *   3. cwd match      — ONLY if that session started inside the job's window.
 *   4. null.
 */
const CWD_MATCH_SLACK_MS = 5 * 60 * 1000;   // clock skew + startup, nothing more

function attachModels(jobs, sessions) {
  const byCwd = new Map();
  const cwdCount = new Map();
  const byId = new Map();
  for (const s of (Array.isArray(sessions) ? sessions : [])) {
    if (!s) continue;
    if (s.cwd) {
      const k = norm(s.cwd);
      byCwd.set(k, s);
      cwdCount.set(k, (cwdCount.get(k) || 0) + 1);   // ambiguity is a fact worth keeping
    }
    if (s.id) byId.set(String(s.id), s);
    if (s.fullId) byId.set(String(s.fullId), s);
  }
  for (const j of jobs) {
    // 1 — the stream already told us
    if (j.model_used) { j.model = j.model_used; j.model_source = 'stream do job'; continue; }

    // 2 — the job reported its session id; that is an identity, not a guess
    if (j.session_id) {
      const s = byId.get(String(j.session_id)) || byId.get(String(j.session_id).slice(0, 8));
      if (s) { j.model = s.model || null; j.session_status = s.status || null; j.model_source = 'sessão (por id)'; continue; }
    }

    // 3 — folder match, but ONLY inside the job's own time window, and ONLY
    // when the folder identifies exactly one session. Two sessions in the same
    // cwd make the Map keep whichever came last — a coin toss dressed as data.
    const key = norm(j.worktree);
    const s = (cwdCount.get(key) || 0) === 1 ? byCwd.get(key) : null;
    if ((cwdCount.get(key) || 0) > 1) {
      j.model_source = 'n/d — ' + cwdCount.get(key) + ' sessões na mesma pasta, impossível distinguir';
    }
    if (s) {
      const jobStart = Date.parse(j.started_at || j.dispatched_at || '');
      const jobEnd = j.ended_at ? Date.parse(j.ended_at) : Date.now();
      const sessStart = (s.ageMs != null && Number.isFinite(s.ageMs)) ? (Date.now() - Number(s.ageMs)) : NaN;
      const overlaps = Number.isFinite(jobStart) && Number.isFinite(sessStart)
        && sessStart >= jobStart - CWD_MATCH_SLACK_MS
        && sessStart <= jobEnd + CWD_MATCH_SLACK_MS;
      if (overlaps) {
        j.model = s.model || null; j.session_id = s.id || null; j.session_status = s.status || null;
        j.model_source = 'sessão (pasta + janela temporal)';
        continue;
      }
      // deliberately NOT attaching: a session in the same folder from another
      // hour is not this job. Say nothing rather than something plausible.
      j.model_source = 'n/d — sessão na mesma pasta mas fora da janela do job';
    }
    if (j.model === undefined) j.model = null;
  }
  return jobs;
}

function isLive(j) { return j.state === 'running' || j.state === 'dispatched'; }

// group live/done rows by wave so the panel can draw a header per wave
function groupByWave(jobs) {
  const order = [];
  const map = new Map();
  for (const j of jobs) {
    const k = j.wave || '(sem wave)';
    if (!map.has(k)) { map.set(k, []); order.push(k); }
    map.get(k).push(j);
  }
  return order.map((wave) => ({
    wave,
    jobs: map.get(wave),
    live: map.get(wave).filter(isLive).length,
    done: map.get(wave).filter((j) => j.state === 'done').length,
    total: map.get(wave).length,
  }));
}

// ── 2. local fleet: what is actually resident on the GPU right now ────────
// GET /api/ps is read-only and answers in single-digit ms when Ollama is up.
// Unreachable => null (the panel says "n/d"), never an empty list pretending zero.
function probeOllama(timeoutMs) {
  return new Promise((resolve) => {
    const [host, port] = OLLAMA_HOST.replace(/^https?:\/\//, '').split(':');
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let req;
    try {
      req = http.get({ host: host || '127.0.0.1', port: Number(port) || 11434, path: '/api/ps', timeout: timeoutMs }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { body += d; if (body.length > 200000) req.destroy(); });
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            const models = (j && j.models) || [];
            finish(models.map((m) => ({
              model: m.model || m.name || null,
              parameter_size: (m.details && m.details.parameter_size) || null,
              quantization: (m.details && m.details.quantization_level) || null,
              vram_bytes: m.size_vram != null ? m.size_vram : null,
              context_length: m.context_length != null ? m.context_length : null,
              expires_at: m.expires_at || null,
            })));
          } catch { finish(null); }
        });
      });
    } catch { return finish(null); }
    req.on('timeout', () => { try { req.destroy(); } catch { /* */ } finish(null); });
    req.on('error', () => finish(null));
  });
}

// ── 3. which Cowork session/project is driving ───────────────────────────
function readSessionContext() {
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); } catch { return null; }
}

/**
 * mooter_session_bind — the MCP server is spawned by the desktop app and has no
 * idea which Cowork session, folder or project is driving it. Nothing in the
 * protocol tells it. So the model binds it explicitly, once per session, and
 * every later snapshot is scoped and labelled.
 */
async function toolSessionBind(args) {
  const a = args || {};
  const ctx = {
    bound_at: new Date().toISOString(),
    session_id: a.sessionId ? String(a.sessionId) : null,
    project: a.project ? String(a.project) : null,
    folder: a.folder ? String(a.folder) : null,
    folder_name: a.folder ? leaf(a.folder) : null,
    files: Array.isArray(a.files) ? a.files.slice(0, 40).map(String) : [],
    note: a.note ? String(a.note).slice(0, 200) : null,
  };
  if (!ctx.project && !ctx.folder) return { error: 'project or folder is required' };
  try {
    fs.mkdirSync(MOOTER_DIR, { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(ctx, null, 2), 'utf8');
  } catch (e) {
    return { error: 'could not write session context: ' + ((e && e.message) || e) };
  }
  return { ok: true, context: ctx, file: SESSION_FILE };
}

// ── enriquecimento de modelo: nunca no caminho critico ───────────────────
// `recentSessions()` chama git/gh por sessao. No disco do Paulo isso demorava
// ~9 SEGUNDOS por chamada, medido no diario do servidor (RX -> TX de cada
// mooter_fleet). O painel repolla de 3 em 3s: com 9s de latencia ele nunca via
// uma resposta a tempo. O nome da modelo e' um extra; nunca vale bloquear o
// retrato da frota por ele.
let SESSIONS_CACHE = { at: 0, sessions: [] };
const SESSIONS_BUDGET_MS = 1200;

function sessionsFast(listFn) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v, fresh) => { if (!settled) { settled = true; resolve({ sessions: v, fresh }); } };
    const timer = setTimeout(() => finish(SESSIONS_CACHE.sessions, false), SESSIONS_BUDGET_MS);
    Promise.resolve(listFn({ limit: 20 }))
      .then((r) => {
        const list = (r && Array.isArray(r.sessions)) ? r.sessions : [];
        SESSIONS_CACHE = { at: Date.now(), sessions: list };   // aquece para a proxima
        clearTimeout(timer); finish(list, true);
      })
      .catch(() => { clearTimeout(timer); finish(SESSIONS_CACHE.sessions, false); });
  });
}

// ── the snapshot the panel polls ─────────────────────────────────────────
async function toolFleet(args, deps) {
  const now = Date.now();
  const windowMin = Math.min(Math.max(Number(args && args.windowMinutes) || 30, 1), 1440);
  const waveFilter = args && args.wave ? String(args.wave) : null;
  const includeLocal = !(args && args.includeLocal === false);

  const context = readSessionContext();
  const events = readLedgerLines(LEDGER);
  const local = includeLocal ? await probeOllama(OLLAMA_TIMEOUT_MS) : null;

  if (events === null) {
    // Even with no ledger the panel must render its full shape: an empty
    // cockpit with a working GPU gauge is informative; a cockpit missing half
    // its fields looks broken. Same keys, honest zeros and nulls.
    let gpu0 = null;
    try { gpu0 = await gpuMod.gpuSnapshot(Array.isArray(local) ? local.length : null); } catch { gpu0 = null; }
    return {
      ok: true, ts: new Date(now).toISOString(), context,
      live: 0, waves: [], jobs: [], sessions: [],
      plans: [], handoffs: [], coherence: [], active_wave: null,
      totals: { cloud_in: 0, cloud_out: 0, local_in: 0, local_out: 0, cost_usd: 0, jobs_cloud: 0, jobs_local: 0, local_share: null, live_cloud: 0, live_local: 0 },
      gpu: gpu0,
      vault: (() => { try { return journal.vaultStatus(); } catch { return null; } })(),
      local, local_available: local !== null, local_host: OLLAMA_HOST,
      sessions_fresh: true,
      notice: 'sem ledger — nenhum job foi despachado nesta máquina',
    };
  }

  let jobs = foldJobs(events);
  if (waveFilter) jobs = jobs.filter((j) => j.wave === waveFilter);

  const cutoff = now - windowMin * 60 * 1000;
  jobs = jobs.filter((j) => {
    if (isLive(j)) return true;
    const t = j.ended_at ? Date.parse(j.ended_at) : NaN;
    return !Number.isNaN(t) && t >= cutoff;
  });

  let sessions = [];
  let sessionsFresh = true;
  try {
    const listFn = deps && deps.sessionsList;
    if (typeof listFn === 'function') {
      const r = await sessionsFast(listFn);
      sessions = r.sessions || [];
      sessionsFresh = r.fresh;
    }
  } catch { /* the panel must never die because the cockpit is unavailable */ }

  attachModels(jobs, sessions);

  for (const j of jobs) {
    j.elapsed_s = elapsedSeconds(j, now);
    j.agent_label = AGENT_LABEL[j.agent] || j.agent || null;
    j.local = LOCAL_AGENTS.has(j.agent);
    j.where = leaf(j.worktree);
    if (j.subagents === undefined) j.subagents = null;
    if (j.model === undefined) j.model = null;

    // v1.2 — live telemetry straight from the job's own NDJSON: what it is
    // doing right now, tokens so far, tok/s. This is the whole reason the panel
    // stopped being a list of ids and became something you can watch.
    if (isLive(j)) {
      try {
        const t = telemetry.readJobTelemetry(path.join(JOBS_DIR, j.job_id, 'out.log'), j.elapsed_s);
        if (t) {
          j.activity = t.activity || null;
          j.tokens_in = t.tokens_in != null ? t.tokens_in : j.tokens_in;
          j.tokens_out = t.tokens_out != null ? t.tokens_out : j.tokens_out;
          j.tok_s = t.tok_s != null ? t.tok_s : null;
          j.steps_done = t.steps_done || 0;
          j.files_read = t.files_read && t.files_read.length ? t.files_read.slice(-6) : null;
          j.files_written = t.files_written && t.files_written.length ? t.files_written.slice(-6) : null;
          j.commands = t.commands && t.commands.length ? t.commands.slice(-3) : null;
          if (t.model) { j.model = t.model; j.model_source = 'stream do job'; }
        }
      } catch { /* the panel must never die because a log is mid-write */ }
    }
  }

  // wave plans: the steps, who did them, and which ones are dangerous
  const planWaves = [...new Set(jobs.map((j) => j.wave).filter(Boolean))];
  if (waveFilter && !planWaves.includes(waveFilter)) planWaves.push(waveFilter);
  const plans = [];
  for (const w of planWaves) {
    try { const p = plan.readPlan(w); if (p) plans.push(plan.summarize(p)); } catch { /* */ }
  }

  // token totals split by where the work happened — the number that shows
  // whether the local-first doctrine is actually happening or is just a slogan
  const totals = { cloud_in: 0, cloud_out: 0, local_in: 0, local_out: 0, cost_usd: 0, jobs_cloud: 0, jobs_local: 0 };
  for (const j of jobs) {
    const isLocal = LOCAL_AGENTS.has(j.agent);
    if (j.tokens_in != null) totals[isLocal ? 'local_in' : 'cloud_in'] += Number(j.tokens_in);
    if (j.tokens_out != null) totals[isLocal ? 'local_out' : 'cloud_out'] += Number(j.tokens_out);
    if (j.cost_usd != null) totals.cost_usd += Number(j.cost_usd);
    totals[isLocal ? 'jobs_local' : 'jobs_cloud']++;
  }
  totals.cost_usd = Number(totals.cost_usd.toFixed(6));
  const totalOut = totals.cloud_out + totals.local_out;
  totals.local_share = totalOut > 0 ? Math.round((totals.local_out / totalOut) * 100) : null;
  // v1.3 — "quantidade de agentes subscription e local em progresso"
  totals.live_cloud = jobs.filter((j) => isLive(j) && !LOCAL_AGENTS.has(j.agent)).length;
  totals.live_local = jobs.filter((j) => isLive(j) && LOCAL_AGENTS.has(j.agent)).length;

  // v1.3 — handoff chains: who prepared the ground for whom.
  // A handoff is not a slogan here: it is a ledger fact. A job carries
  // `handoff_from` only when its masterprompt literally embedded a previous
  // job's output. No embedding, no chain — we do not draw arrows we cannot prove.
  const handoffs = [];
  for (const j of jobs) {
    if (!j.handoff_from) continue;
    const src = jobs.find((x) => x.job_id === j.handoff_from);
    handoffs.push({
      from: j.handoff_from,
      from_agent: src ? (AGENT_LABEL[src.agent] || src.agent) : null,
      from_model: src ? (src.model || null) : null,
      from_local: src ? LOCAL_AGENTS.has(src.agent) : null,
      to: j.job_id,
      to_agent: AGENT_LABEL[j.agent] || j.agent,
      to_model: j.model || null,
      state: j.state,
      saved_note: src && LOCAL_AGENTS.has(src.agent)
        ? 'preparado localmente ($0) antes de gastar tokens de subscrição'
        : null,
    });
  }

  // v1.3 — coherence: the panel checks ITSELF and shows what does not add up.
  // Two costs for one job differed by 2.5x on 2026-07-25 and nobody noticed for
  // a day. A cockpit that cannot detect its own contradictions is decoration.
  const coherence = [];
  for (const j of jobs) {
    if (j.state === 'done' && j.cost_usd == null && !LOCAL_AGENTS.has(j.agent)) {
      coherence.push({ level: 'aviso', job: j.job_id, msg: 'job terminou sem custo registado — o CLI não reportou total_cost_usd' });
    }
    if (j.model_recommended && j.model_used && String(j.model_used).indexOf(String(j.model_recommended)) < 0
        && !String(j.model_recommended).includes(String(j.model_used).split('-')[1] || 'x')) {
      coherence.push({ level: 'aviso', job: j.job_id, msg: 'router pediu ' + j.model_recommended + ' e correu ' + j.model_used });
    }
    if (j.state === 'done' && j.tokens_out == null) {
      coherence.push({ level: 'info', job: j.job_id, msg: 'sem tokens medidos — bundle antigo ou saída não-stream' });
    }
    if (j.model && !j.model_source) {
      coherence.push({ level: 'aviso', job: j.job_id, msg: 'modelo sem proveniência declarada' });
    }
  }
  if (!sessionsFresh && jobs.some((j) => isLive(j))) {
    coherence.push({ level: 'info', job: null, msg: 'sessões do cockpit vieram de cache — nomes de modelo podem estar em atraso' });
  }

  jobs.sort((a, b) => {
    const rank = (x) => (isLive(x) ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return String(b.ended_at || b.dispatched_at || '').localeCompare(String(a.ended_at || a.dispatched_at || ''));
  });

  // v1.3 — WHICH WAVE IS BEING WORKED. The panel grouped by wave but never
  // said which one is live now, so a user with three waves in the window had to
  // infer it. Live jobs decide; if none, the most recent wave to have ended.
  const liveJobs = jobs.filter(isLive);
  const activeWaveId = liveJobs.length
    ? liveJobs[0].wave
    : (jobs.length ? jobs[0].wave : null);
  const activeWavePlan = activeWaveId ? plans.find((p) => p && p.wave === activeWaveId) : null;
  const activeWave = activeWaveId ? {
    wave: activeWaveId,
    goal: activeWavePlan ? activeWavePlan.goal : null,
    live: liveJobs.filter((j) => j.wave === activeWaveId).length,
    done: jobs.filter((j) => j.wave === activeWaveId && j.state === 'done').length,
    failed: jobs.filter((j) => j.wave === activeWaveId && j.state === 'failed').length,
    total: jobs.filter((j) => j.wave === activeWaveId).length,
    steps_done: activeWavePlan ? activeWavePlan.done : null,
    steps_total: activeWavePlan ? activeWavePlan.total : null,
    current_step: activeWavePlan && activeWavePlan.current ? activeWavePlan.current.title : null,
    high_risk_open: activeWavePlan ? activeWavePlan.high_risk_open : null,
  } : null;

  // v1.3 — the actual card, and how hard it is working
  let gpu = null;
  try { gpu = await gpuMod.gpuSnapshot(Array.isArray(local) ? local.length : null); } catch { gpu = null; }

  const shown = jobs.slice(0, 16);
  return {
    ok: true,
    ts: new Date(now).toISOString(),
    context,
    live: shown.filter(isLive).length,
    waves: groupByWave(shown),
    jobs: shown,
    sessions: sessions
      .filter((s) => s.status === 'working')
      .map((s) => ({ id: s.id, title: s.title, model: s.model || null, project: s.project || null, cwd: s.cwd || null })),
    plans,                       // steps × risk × who did them
    totals,                      // tokens split cloud vs local, real cost
    handoffs,                    // proven chains: who prepared for whom
    coherence,                   // the panel auditing itself
    active_wave: activeWave,     // the wave being worked right now
    gpu,                         // which card, how hard it is working
    vault: (() => { try { return journal.vaultStatus(); } catch { return null; } })(),
    local,                       // null = Ollama unreachable (n/d), [] = up with nothing loaded
    local_available: local !== null,
    local_host: OLLAMA_HOST,
    // false = o enriquecimento de modelo estourou o orcamento; o retrato e' valido,
    // so os nomes concretos podem estar em cache ou ausentes. Honesto, nao inventado.
    sessions_fresh: sessionsFresh,
  };
}

/**
 * Human-readable fallback. If the host does not render MCP Apps, the tool result
 * must still read like something a person wrote — not a wall of JSON. This is the
 * difference between "the panel is missing" and "the connector looks broken".
 */
function formatFleetText(d) {
  if (!d || d.error) return 'Frota: ' + ((d && d.error) || 'sem dados');
  const L = [];
  const c = d.context;
  const head = d.live ? (d.live + ' agente' + (d.live > 1 ? 's' : '') + ' a trabalhar') : 'frota parada';
  L.push(c && (c.project || c.folder_name) ? (head + '  ·  ' + [c.project, c.folder_name].filter(Boolean).join(' / ')) : head);
  const live = (d.jobs || []).filter((j) => j.state === 'running' || j.state === 'dispatched');
  const done = (d.jobs || []).filter((j) => j.state === 'done' || j.state === 'failed');
  if (live.length) {
    L.push('', 'A TRABALHAR');
    for (const w of (d.waves || [])) {
      const rows = w.jobs.filter((j) => j.state === 'running' || j.state === 'dispatched');
      if (!rows.length) continue;
      L.push('  ' + w.wave);
      for (const j of rows) {
        const who = j.model || j.agent_label || '?';
        const tk = (j.tokens_out != null) ? (' · ' + j.tokens_out + ' tok out' + (j.tok_s ? ' · ' + j.tok_s + ' tok/s' : '')) : '';
        L.push('    · ' + (j.where || j.job_id) + ' — ' + who + (j.elapsed_s != null ? ' — ' + j.elapsed_s + 's' : '') + tk);
        if (j.activity) L.push('        ' + j.activity);
      }
    }
  }
  // the plan: what is mapped, what is done, by whom, and what is dangerous
  for (const p of (d.plans || [])) {
    if (!p || !p.steps || !p.steps.length) continue;
    L.push('', 'PLANO · ' + p.wave + '  (' + p.done + '/' + p.total + ')');
    for (const s of p.steps) {
      const mark = { feito: 'v', falhou: 'x', 'a-correr': '>', pendente: '·', saltado: '-' }[s.state] || '·';
      const risk = s.risk === 'alto' ? ' [RISCO ALTO]' : (s.risk === 'médio' ? ' [risco medio]' : '');
      L.push('  ' + mark + ' ' + s.title + risk + (s.by ? '  — ' + s.by : ''));
    }
    if (p.high_risk_open) L.push('  ! ' + p.high_risk_open + ' etapa(s) de risco alto por fazer — exigem o teu OK');
  }
  if (d.totals && (d.totals.cloud_out || d.totals.local_out)) {
    const t = d.totals;
    L.push('', 'TOKENS  cloud ' + t.cloud_in + ' in / ' + t.cloud_out + ' out  ·  local ' + t.local_in + ' in / ' + t.local_out + ' out'
      + (t.local_share != null ? '  ·  ' + t.local_share + '% do output foi local' : '')
      + (t.cost_usd ? '  ·  $' + t.cost_usd.toFixed(4) : ''));
  }
  if (d.vault) {
    L.push('', 'VAULT  ' + (d.vault.available
      ? (d.vault.root + (d.vault.last_note ? '  · ultima nota ' + d.vault.last_note.at.slice(0, 16).replace('T', ' ') : '  · sem notas ainda'))
      : 'n/d — nenhum candidato tem .obsidian/ (' + d.vault.reason + ')'));
  }
  L.push('', 'LOCAL · GPU');
  if (d.local == null) L.push('  n/d — Ollama nao respondeu em ' + (d.local_host || '127.0.0.1:11434'));
  else if (!d.local.length) L.push('  Ollama a correr, nenhum modelo residente');
  else for (const m of d.local) L.push('    · ' + m.model + [m.parameter_size, m.quantization].filter(Boolean).map((x) => ' — ' + x).join(''));
  if (done.length) {
    L.push('', 'CONCLUIDAS');
    for (const j of done) L.push('    ' + (j.state === 'failed' ? 'x' : 'v') + ' ' + (j.where || j.job_id) + ' — ' + (j.model || j.agent_label || '?') + (j.elapsed_s != null ? ' — ' + j.elapsed_s + 's' : ''));
  }
  if (d.notice) L.push('', d.notice);
  return L.join('\n');
}

function readUiHtml() {
  try { return fs.readFileSync(UI_FILE, 'utf8'); }
  catch { return '<p style="font:14px system-ui">fleet-ui.html missing next to fleet.js</p>'; }
}

const UI_RESOURCE = {
  uri: UI_URI,
  name: 'Mooter fleet',
  description: 'Live panel: which agent is working, on what, with which model — subscription and local.',
  mimeType: UI_MIME,
  _meta: {
    ui: {
      // the panel is fully self-contained: no external script, style, font or fetch.
      csp: { resourceDomains: [], connectDomains: [] },
      prefersBorder: false,
    },
  },
};

const TOOLS = [
  {
    name: 'mooter_fleet',
    description: 'Snapshot of what the Mooter fleet is doing right now, grouped by wave: dispatched jobs (agent, concrete model when known, worktree, state, elapsed), the models actually resident on the local GPU via Ollama, and the bound Cowork session/project. Read-only; unknown fields are null, never guessed. Cheap enough to poll every few seconds.',
    inputSchema: {
      type: 'object',
      properties: {
        wave: { type: 'string', description: 'Optional wave id filter.' },
        windowMinutes: { type: 'number', description: 'How far back finished jobs stay visible (1-1440, default 30). Live jobs always show.' },
        includeLocal: { type: 'boolean', description: 'Probe the local Ollama daemon for resident models (default true).' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Mooter fleet', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      ui: { resourceUri: UI_URI, visibility: ['model', 'app'] },
      // deprecated flat key — kept for hosts that shipped before 2026-01-26
      'ui/resourceUri': UI_URI,
    },
    handler: null, // wired by server-apps.js so this file stays dependency-free
  },
  {
    name: 'mooter_session_bind',
    description: 'Tell Mooter which Cowork session is driving it: project name, connected folder, and the files being worked on. The MCP server is spawned by the desktop app and cannot discover this by itself — nothing in the protocol carries it. Call once at the start of a session so the fleet panel is scoped and labelled. Writes a single small JSON file under ~/.mooter/.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name, e.g. "Mooter.ai".' },
        folder: { type: 'string', description: 'Absolute path of the connected folder.' },
        files: { type: 'array', items: { type: 'string' }, description: 'Files currently being worked on (max 40).' },
        sessionId: { type: 'string', description: 'Cowork session id, when known.' },
        note: { type: 'string', description: 'One line on what this session is doing.' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Bind the Cowork session', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolSessionBind,
  },
];

module.exports = {
  TOOLS, UI_RESOURCE, UI_URI, UI_MIME,
  toolFleet, toolSessionBind, readUiHtml, formatFleetText,
  foldJobs, elapsedSeconds, attachModels, groupByWave, probeOllama, readSessionContext,
  LEDGER, SESSION_FILE, OLLAMA_HOST, envOrNull, sessionsFast, SESSIONS_BUDGET_MS,
};
