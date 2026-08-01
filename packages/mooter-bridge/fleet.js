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
const { execFile } = require('child_process');
const telemetry = require('./telemetry.js');
const plan = require('./plan.js');
const journal = require('./journal.js');
const gpuMod = require('./gpu.js');
const P = require('./paths.js');
const arvore = require('./arvore.js');
const probe = require('./probe.js');
const quota = require('./quota.js');
const capacidades = require('./capacidades.js');
const { suspeita } = require('./worktrees.js');
const board = require('./board.js');
const afericao = require('./afericao.js');
const eta = require('./eta.js');
const estimation = require('./estimativa.js');
const { fatiaLocal } = require('./fatia-local.js');

const UI_URI = 'ui://mooter/fleet';
const UI_MIME = 'text/html;profile=mcp-app';
const MOOTER_DIR = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
const LEDGER = path.join(MOOTER_DIR, 'ledger.jsonl');
const JOBS_DIR = path.join(MOOTER_DIR, 'jobs');
const ETA_INDEX = path.join(MOOTER_DIR, 'eta-index.json');
const ETA_REFRESH_MS = 2000;
const SESSION_FILE = path.join(MOOTER_DIR, 'cowork-session.json');
const UI_FILE = path.join(__dirname, 'fleet-ui.html');
const REPO = process.env.MOOTER_REPO || path.resolve(__dirname, '..', '..');

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
const PANEL_PROBE_TIMEOUT_MS = 1200;

const AGENT_LABEL = {
  cc: 'Claude Code', codex: 'Codex', gemini: 'Gemini',
  moo: 'Ollama · local', kimi: 'Moonshot · nuvem',
};
const LOCAL_AGENTS = new Set(['moo']);

// P.chave() em vez de manipulação de string à mão: em Windows o mesmo sítio tem
// duas grafias (8.3 e longa) e comparar texto dava falsos negativos. A versão
// TOLERANTE (e não canon) porque os cwd das sessões vêm de ficheiros escritos
// por outros processos, com separadores e barra final ao acaso — e podem
// apontar para pastas que já não existem.
function norm(p) { return P.chave(p); }
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
            cargo: Object.prototype.hasOwnProperty.call(e, 'cargo') ? e.cargo : null,
            cargo_porque: e.cargo_porque || 'n/d — anterior à instrumentação de cargos',
            local: typeof e.local === 'boolean' ? e.local : e.agent === 'moo',
            state: null, dispatched_at: null, started_at: null, ended_at: null, exit_code: null, duration_s: null };
      byId.set(e.job_id, j);
    }
    if (e.wave) j.wave = e.wave;
    if (e.agent) j.agent = e.agent;
    if (e.worktree) j.worktree = e.worktree;
    if (Object.prototype.hasOwnProperty.call(e, 'cargo')) j.cargo = e.cargo;
    if (e.cargo_porque) j.cargo_porque = e.cargo_porque;
    if (typeof e.local === 'boolean') j.local = e.local;
    if (e.event === 'dispatched') { j.dispatched_at = e.ts; j.state = 'dispatched'; }
    else if (e.event === 'started') { j.started_at = e.ts; j.state = 'running'; }
    else if (e.event === 'done') { j.ended_at = e.ts; j.state = 'done'; }
    else if (e.event === 'failed') { j.ended_at = e.ts; j.state = 'failed'; }
    else if (e.event === 'prep_timeout' || e.event === 'prep_failed_fallback') { j.ended_at = e.ts; j.state = 'failed'; }
    else if (e.event === 'collected' && j.state !== 'failed') { j.state = j.state === 'running' ? 'done' : j.state; }
    if (e.exit_code != null) j.exit_code = e.exit_code;
    if (e.duration_s != null) j.duration_s = e.duration_s;
    if (e.cost_usd != null) j.cost_usd = e.cost_usd;
    // v1.2 — the ledger now carries the truth about the model, so the panel
    // never has to infer it. model_used comes from the job's own stream;
    // model_recommended is what the FROZEN router asked for. Both, always.
    if (e.model_used) j.model_used = e.model_used;
    if (e.model_recommended) j.model_recommended = e.model_recommended;
    if (e.tier) j.tier_pedido = e.tier;
    if (e.tier_pedido) j.tier_pedido = e.tier_pedido;
    if (e.tier_motor) j.tier_motor = e.tier_motor;
    if (e.step) j.step = e.step;
    if (e.session_id) j.session_id = e.session_id;
    if (e.prep_duration_s != null) j.prep_duration_s = e.prep_duration_s;
    if (e.prep_chars != null) j.prep_chars = e.prep_chars;
    if (e.tokens_poupados_estimados != null) j.tokens_poupados_estimados = e.tokens_poupados_estimados;
    if (e.tokens_poupados_estimados_nota) j.tokens_poupados_estimados_nota = e.tokens_poupados_estimados_nota;
    if (e.note) j.note = e.note;
    if (e.prep_from) j.prep_from = e.prep_from;
    if (e.tokens_in != null) j.tokens_in = e.tokens_in;
    if (e.tokens_out != null) j.tokens_out = e.tokens_out;
    if (e.handoff_from) j.handoff_from = e.handoff_from;
    if (e.goal) j.goal = e.goal;
    if (e.prompt_chars != null) j.prompt_chars = e.prompt_chars;
    if (e.event === 'started' && Object.prototype.hasOwnProperty.call(e, 'steps_total')) {
      j.steps_total = e.steps_total;
      if (e.steps_total == null) j.steps_total_porque = e.porque || 'o total de passos é n/d';
    }
    if (e.event === 'step') {
      j.steps_done = Math.max(Number(j.steps_done) || 0, Number(e.step_index) || 0);
      if (Object.prototype.hasOwnProperty.call(e, 'steps_total')) j.steps_total = e.steps_total;
      if (e.steps_total == null && e.porque) j.steps_total_porque = e.porque;
    }
    // v1.4.2 — porque é que ESTE modelo local e não outro. O painel deixa de ter
    // de adivinhar se um 3B foi escolha ou acidente.
    if (e.modelo_porque) j.modelo_porque = e.modelo_porque;
    if (e.modelo_trocou_residente) j.modelo_trocou_residente = e.modelo_trocou_residente;
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

function measuredMetric(jobs, field, label) {
  const selected = Array.isArray(jobs) ? jobs : [];
  const measured = selected.filter((job) => job[field] != null && Number.isFinite(Number(job[field])));
  const missing = selected.length - measured.length;
  const raw = measured.reduce((sum, job) => sum + Number(job[field]), 0);
  const value = measured.length ? Number(raw.toFixed(field === 'cost_usd' ? 6 : 3)) : null;
  let why;
  if (!selected.length) why = 'não há jobs desta origem no retrato';
  else if (!measured.length) why = 'nenhum dos ' + selected.length + ' job(s) trouxe ' + label + ' medido';
  else if (missing) why = 'soma parcial: ' + measured.length + ' job(s) medidos e ' + missing + ' sem medição de ' + label;
  else why = 'soma das ' + measured.length + ' parcela(s) de ' + label + ' reportadas pelos próprios jobs';
  return {
    valor: value,
    porque: why,
    jobs_medidos: measured.length,
    jobs_sem_medicao: missing,
  };
}

function countMetric(value, label, measuredJobs) {
  return {
    valor: value,
    porque: label,
    jobs_medidos: measuredJobs,
    jobs_sem_medicao: 0,
  };
}

/**
 * Uma única agregação alimenta a lista plana e o resumo da árvore. Os objectos
 * são partilhados de propósito: uma segunda soma não pode voltar a divergir.
 */
function aggregatePanel(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const cloud = list.filter((job) => !LOCAL_AGENTS.has(job.agent));
  const local = list.filter((job) => LOCAL_AGENTS.has(job.agent));
  const cloudIn = measuredMetric(cloud, 'tokens_in', 'tokens de entrada cloud');
  const cloudOut = measuredMetric(cloud, 'tokens_out', 'tokens de saída cloud');
  const localIn = measuredMetric(local, 'tokens_in', 'tokens de entrada locais');
  const localOut = measuredMetric(local, 'tokens_out', 'tokens de saída locais');

  let cost;
  if (!cloud.length && local.length) {
    cost = {
      valor: 0,
      porque: 'todos os jobs do retrato correram localmente; custo real de subscrição zero',
      jobs_medidos: local.length,
      jobs_sem_medicao: 0,
    };
  } else {
    cost = measuredMetric(cloud, 'cost_usd', 'custo cloud');
  }

  const outputMeasured = cloudOut.jobs_medidos + localOut.jobs_medidos;
  const outputMissing = cloudOut.jobs_sem_medicao + localOut.jobs_sem_medicao;
  const outputTotal = Number((Number(cloudOut.valor || 0) + Number(localOut.valor || 0)).toFixed(3));
  let shareTokenValue = null;
  let shareTokenWhy;
  if (!outputMeasured) shareTokenWhy = 'nenhum job trouxe tokens de saída medidos';
  else if (outputMissing) shareTokenWhy = 'percentagem n/d: há ' + outputMissing + ' job(s) sem tokens de saída medidos';
  else if (!outputTotal) shareTokenWhy = 'os jobs medidos reportaram zero tokens de saída';
  else {
    shareTokenValue = Math.round((Number(localOut.valor || 0) / outputTotal) * 100);
    shareTokenWhy = 'tokens de saída locais divididos pelo total de saída medido';
  }
  const localShareTokensSaida = {
    valor: shareTokenValue,
    porque: shareTokenWhy,
    jobs_medidos: outputMeasured,
    jobs_sem_medicao: outputMissing,
  };

  // Novo local_share usando fatiaLocal (jobs concluídos agent=moo)
  const fatia = fatiaLocal(list, { escopo: 'global — painel de frota' });
  const localShare = {
    valor: fatia.valor,
    porque: fatia.porque,
    jobs_medidos: fatia.jobs_total,
    jobs_sem_medicao: 0,
  };

  const totals = {
    cloud_in: cloudIn,
    cloud_out: cloudOut,
    local_in: localIn,
    local_out: localOut,
    cost_usd: cost,
    jobs_cloud: countMetric(cloud.length, 'contagem directa dos jobs não locais no ledger', cloud.length),
    jobs_local: countMetric(local.length, 'contagem directa dos jobs locais no ledger', local.length),
    local_share: localShare,
    local_share_tokens_saida: localShareTokensSaida,
    live_cloud: countMetric(cloud.filter(isLive).length, 'jobs cloud com estado running ou dispatched', cloud.length),
    live_local: countMetric(local.filter(isLive).length, 'jobs locais com estado running ou dispatched', local.length),
  };
  return {
    totals,
    /**
     * ⚠️ Auditoria E2E 2026-08-01 — `quota_local_pct` tinha de voltar a ser tokens.
     *
     * `arvore.js:222` já a calculava por TOKENS (tokLocal/total). Esta agregação
     * sobrepunha-lhe `localShare`, que é CONTAGEM DE JOBS — e `fleet-ui.html:492`
     * mostra esse valor debaixo de «dos tokens sairam da tua GPU», com o title a
     * dizer «percentagem dos tokens de saída medidos». Duas promessas de tokens
     * sobre um número de jobs. Medido no ledger: 50,9% (jobs) vs 16,1% (tokens).
     *
     * Agora `quota_local_pct` = a métrica por tokens (n/d honesto quando algum
     * job não traz `tokens_out`), e a contagem de jobs fica no seu próprio campo
     * `quota_local_jobs_pct`, para quem a quiser mostrar COM esse nome. Ver G12.
     */
    arvore_resumo: {
      tokens_local: localOut,
      tokens_nuvem: cloudOut,
      quota_local_pct: localShareTokensSaida,
      quota_local_jobs_pct: localShare,
      custo_usd: cost,
      custo_jobs_sem_medicao: cost.jobs_sem_medicao,
    },
  };
}

function addFreshness(block, measuredAt, now, thresholdMinutes) {
  if (!block || typeof block !== 'object') return null;
  const threshold = Number.isFinite(Number(thresholdMinutes)) && Number(thresholdMinutes) > 0
    ? Number(thresholdMinutes) : 15;
  const measuredMs = Date.parse(measuredAt || '');
  if (Number.isNaN(measuredMs)) {
    return {
      ...block,
      medido_em: { valor: null, porque: 'a origem não forneceu um instante de medição válido' },
      fresco: false,
      idade_h: { valor: null, porque: 'sem medido_em válido não é possível calcular a idade' },
    };
  }
  const ageHours = Number((Math.max(0, Number(now) - measuredMs) / 3600000).toFixed(2));
  return {
    ...block,
    medido_em: new Date(measuredMs).toISOString(),
    fresco: ageHours * 60 <= threshold,
    idade_h: ageHours,
  };
}

function freshnessThreshold(blockName, deps) {
  const configured = deps && deps.freshnessMinutes;
  if (Number.isFinite(Number(configured)) && Number(configured) > 0) return Number(configured);
  if (configured && Number.isFinite(Number(configured[blockName])) && Number(configured[blockName]) > 0) {
    return Number(configured[blockName]);
  }
  const envKey = 'MOOTER_FRESHNESS_' + String(blockName).toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_MINUTES';
  const specific = envOrNull(envKey);
  if (Number.isFinite(Number(specific)) && Number(specific) > 0) return Number(specific);
  const common = envOrNull('MOOTER_FRESHNESS_MINUTES');
  if (Number.isFinite(Number(common)) && Number(common) > 0) return Number(common);
  return 15;
}

function closePercentages(percentages) {
  if (!percentages || typeof percentages !== 'object') return percentages;
  const entries = Object.entries(percentages)
    .filter(([, value]) => Number.isFinite(Number(value)));
  if (!entries.length) return { ...percentages };
  const out = { ...percentages };
  for (const [key, value] of entries) out[key] = Number(Number(value).toFixed(1));
  const total = entries.reduce((sum, [key]) => sum + out[key], 0);
  const lastKey = entries[entries.length - 1][0];
  out[lastKey] = Number(Math.max(0, out[lastKey] + (100 - total)).toFixed(1));
  return out;
}

function sanitizeFuel(fuel) {
  if (!fuel || typeof fuel !== 'object') return null;
  let out;
  try { out = JSON.parse(JSON.stringify(fuel)); } catch { return fuel; }
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.suspeitas != null) {
      const hasItems = Array.isArray(value.suspeitas_itens) && value.suspeitas_itens.length > 0;
      if (!hasItems) {
        delete value.suspeitas;
        delete value.aviso_saidas;
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(out);
  if (out.arrastar && out.arrastar.percentagens) {
    out.arrastar.percentagens = closePercentages(out.arrastar.percentagens);
  }
  return out;
}

/**
 * ⚠️ CAMPOS DE CONTRATO — nunca desaparecem, mesmo a null.
 *
 * Apanhado pelo teste T6 do path.test.js ao fechar a L1: ao remover blocos
 * vazios, o `tok_s` de um job passou de `null` a AUSENTE, e o guard que exige
 * que `mooter_status` e `mooter_fleet` digam a mesma coisa sobre o mesmo facto
 * imutável falhou com "status disse null e fleet disse undefined".
 *
 * Limpar ruído é remover BLOCOS sem conteúdo. Não é apagar um campo que outra
 * vista promete — isso não é limpeza, é fazer duas vistas discordarem. Um `null`
 * declarado vale mais do que um campo que some.
 */
const CAMPOS_DE_CONTRATO = new Set([
  'tok_s', 'tok_s_basis', 'model', 'model_used', 'model_recommended',
  'tier_pedido', 'tier_motor', 'exit_code', 'duration_s', 'elapsed_s',
  'cost_usd', 'tokens_in', 'tokens_out', 'state', 'job_id',
  'cargo', 'cargo_porque',
]);

function compactPayload(value) {
  const compact = (item, parentExplainsNull, key) => {
    if (CAMPOS_DE_CONTRATO.has(key) && (item === null || item === undefined)) return null;
    if (item === null || item === undefined) return parentExplainsNull ? null : undefined;
    if (Array.isArray(item)) {
      const array = item.map((child) => compact(child, false, null)).filter((child) => child !== undefined);
      return array.length ? array : undefined;
    }
    if (typeof item !== 'object') return item;
    const explainsNull = ['porque', 'base', 'reason', 'nota']
      .some((k) => typeof item[k] === 'string' && item[k].trim());
    const object = {};
    for (const [k, child] of Object.entries(item)) {
      const next = compact(child, explainsNull, k);
      if (next !== undefined) object[k] = next;
      else if (k === 'plans' && Array.isArray(child)) object[k] = [];
    }
    return Object.keys(object).length ? object : undefined;
  };
  return compact(value, false, null) || {};
}

function metricValue(value) {
  return value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'valor')
    ? value.valor : value;
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

function probeWithin(fn, timeoutMs, fallback) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), timeoutMs);
    // Uma sonda pode ser síncrona e cara na primeira leitura (quota percorre os
    // rollouts). Ceder um ciclo deixa spawn/close já pendentes avançarem antes
    // do painel; uma microtask aqui bloqueava o ciclo de vida dos próprios jobs.
    setImmediate(() => {
      if (settled) return;
      Promise.resolve()
        .then(fn)
        .then(finish)
        .catch(() => finish(fallback));
    });
  });
}

function activeJobsFromEvents(events, worktree) {
  const key = norm(worktree);
  const state = new Map();
  for (const e of (events || [])) {
    if (!e || !e.job_id || (e.worktree && norm(e.worktree) !== key)) continue;
    if (e.event === 'dispatched' || e.event === 'started') state.set(e.job_id, e.event);
    if (e.event === 'done' || e.event === 'failed' || e.event === 'prep_timeout' || e.event === 'prep_failed_fallback') state.delete(e.job_id);
  }
  return [...state.keys()];
}

// S4 — espelha o critério de worktrees.js:list(): detached e checkouts
// suspeitos em %TEMP% nunca são candidatos reais a trabalho, por isso ficam
// fora do total elegível. O bruto continua exposto (worktrees) e explicado
// (total_bruto), nunca escondido.
function summarizeWorktrees(rows) {
  const worktrees = Array.isArray(rows) ? rows : [];
  const elegiveis = worktrees.filter((row) => !row.detached && !suspeita(row, REPO));
  const excluidas = worktrees.length - elegiveis.length;
  const occupied = elegiveis.filter((row) => row.busy === true).length;
  const free = elegiveis.length - occupied;
  return {
    total: countMetric(elegiveis.length, 'worktrees candidatas a trabalho: exclui detached e checkouts suspeitos em %TEMP% (ver total_bruto)', worktrees.length),
    total_bruto: countMetric(worktrees.length, excluidas
      ? `${excluidas} worktree(s) excluída(s) do total: detached e/ou checkout suspeito em %TEMP%`
      : 'nenhuma worktree foi excluída — bruto e elegível coincidem', worktrees.length),
    occupied: countMetric(occupied, 'worktrees elegíveis cujo busy deriva de pelo menos um job vivo', worktrees.length),
    free: countMetric(free, 'total elegível menos as worktrees marcadas busy pela mesma fonte', worktrees.length),
    worktrees,
  };
}

// Projecção read-only do inventário: usa execFile assíncrono porque o listador
// canónico é síncrono e uma chamada git presa não pode congelar o painel.
function probeWorktrees(timeoutMs, events) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    let child;
    try {
      child = execFile('git', ['worktree', 'list', '--porcelain'], {
        cwd: REPO, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
      }, (err, stdout) => {
        if (err) return finish(null);
        const rows = [];
        let current = null;
        for (const line of String(stdout || '').split('\n')) {
          const text = line.trim();
          if (text.startsWith('worktree ')) { current = { path: text.slice(9), branch: null, detached: false }; rows.push(current); }
          else if (!current) continue;
          else if (text.startsWith('branch ')) current.branch = text.slice(7).replace(/^refs\/heads\//, '');
          else if (text === 'detached') current.detached = true;
        }
        for (const row of rows) {
          const jobs = activeJobsFromEvents(events, row.path);
          row.name = leaf(row.path);
          row.busy = jobs.length > 0;
          row.busy_jobs = jobs.length ? jobs : null;
          try { row.exists = fs.existsSync(row.path); } catch { row.exists = false; }
        }
        finish(summarizeWorktrees(rows));
      });
      child.on('error', () => finish(null));
    } catch { finish(null); }
  });
}

// ── 3. which Cowork session/project is driving ───────────────────────────
function normalizarFolder(value) {
  if (value == null) return null;
  let folder = String(value).trim();
  if (!folder) return null;
  try { if (/^file:/i.test(folder)) folder = require('url').fileURLToPath(folder); }
  catch { return null; }
  return path.resolve(folder);
}

function folderValida(value) {
  const folder = normalizarFolder(value);
  if (!folder) return null;
  try { return fs.statSync(folder).isDirectory() ? folder : null; }
  catch { return null; }
}

function manualSessionContext() {
  try {
    const value = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch { return null; }
}

function rootsSessionContext(manual) {
  try {
    const cap = capacidades.estado();
    const rootsDeclaradas = cap.capacidades && cap.capacidades.roots
      && cap.capacidades.roots.suportado === true;
    if (!rootsDeclaradas || !Array.isArray(cap.roots)) return null;
    let root = null; let folder = null;
    for (const candidate of cap.roots) {
      const resolved = candidate && candidate.uri ? folderValida(candidate.uri) : null;
      if (resolved) { root = candidate; folder = resolved; break; }
    }
    if (!root || !folder) return null;
    return {
      bound_at: cap.medido_em,
      session_id: manual ? manual.session_id || null : null,
      project: root.nome || leaf(folder),
      folder,
      folder_name: root.nome || leaf(folder),
      files: manual && Array.isArray(manual.files) ? manual.files : [],
      note: 'contexto recebido por MCP roots/list',
      fonte: 'mcp-capabilities.json → roots/list',
      session_model: manual ? manual.session_model || null : null,
      session_model_em: manual ? manual.session_model_em || null : null,
      session_model_fonte: manual ? manual.session_model_fonte || null : null,
    };
  } catch { return null; }
}

function readSessionContext() {
  const manual = manualSessionContext();
  return rootsSessionContext(manual) || manual;
}

function registarBindRecusado(args, porque) {
  try {
    fs.mkdirSync(MOOTER_DIR, { recursive: true });
    fs.appendFileSync(LEDGER, JSON.stringify({
      ts: new Date().toISOString(), event: 'session_bind_rejected',
      project_requested: args && args.project ? String(args.project) : null,
      folder_requested: args && args.folder ? String(args.folder) : null,
      reason: porque,
    }) + '\n', 'utf8');
    return true;
  } catch { return false; }
}

/**
 * mooter_session_bind — the MCP server is spawned by the desktop app and has no
 * idea which Cowork session, folder or project is driving it. Nothing in the
 * protocol tells it. So the model binds it explicitly, once per session, and
 * every later snapshot is scoped and labelled.
 */
async function toolSessionBind(args) {
  const a = args || {};
  /**
   * ⚠️ HERDAR NÃO É DECLARAR.
   *
   * A v1.5 passou a preservar o contexto anterior para que declarar só o
   * `session_model` não apagasse o projecto. Efeito colateral apanhado pelo
   * gate: uma chamada VAZIA passava a "ter" projecto — herdado — e o guard
   * deixava-a passar. Uma chamada vazia voltava a carimbar `bound_at` e a
   * dizer que estava tudo bem, sem ninguém ter declarado nada.
   *
   * O guard olha para o que ESTA chamada trouxe. A herança vem depois.
   */
  if (!a.project && !a.folder && !a.session_model) {
    return { error: 'nada para ligar — dá pelo menos project, folder ou session_model' };
  }
  const hasProject = Object.prototype.hasOwnProperty.call(a, 'project');
  const hasFolder = Object.prototype.hasOwnProperty.call(a, 'folder');
  const wantsScope = hasProject || hasFolder;
  let requestedFolder = null;
  if (wantsScope) {
    const project = hasProject ? String(a.project || '').trim() : '';
    requestedFolder = hasFolder ? folderValida(a.folder) : null;
    if (!project || !requestedFolder) {
      const porque = !project
        ? 'bind parcial recusado: project válido e folder válida têm de chegar juntos'
        : 'bind parcial recusado: folder não existe ou não é uma pasta; project e folder válidos têm de chegar juntos';
      const ledgerRegistado = registarBindRecusado(a, porque);
      return {
        error: porque,
        bind_recusado: 'parcial',
        contexto_preservado: readSessionContext(),
        ledger_registado: ledgerRegistado,
        ledger_porque: ledgerRegistado ? null : 'não foi possível escrever o evento session_bind_rejected',
      };
    }
  }
  const antes = readSessionContext() || {};
  const ctx = {
    bound_at: new Date().toISOString(),
    session_id: a.sessionId ? String(a.sessionId) : (antes.session_id || null),
    project: wantsScope ? String(a.project).trim() : (antes.project || null),
    folder: wantsScope ? requestedFolder : (antes.folder || null),
    folder_name: wantsScope ? leaf(requestedFolder) : (antes.folder_name || null),
    files: Array.isArray(a.files) ? a.files.slice(0, 40).map(String) : (antes.files || []),
    note: a.note ? String(a.note).slice(0, 200) : (antes.note || null),
    /**
     * ⚠️ v1.5 — QUEM CONDUZ A CONVERSA.
     *
     * O MCP não expõe o modelo do host: `clientInfo` traz o nome e a versão da
     * aplicação, e mais nada. Inferi-lo pela pasta ou pela hora seria repetir o
     * erro de 2026-07-25, em que um job foi etiquetado com o modelo de uma
     * sessão 18 horas mais velha só por partilharem a pasta.
     *
     * Por isso é DECLARADO por quem chama, e a declaração fica com carimbo de
     * quando foi feita. Se ninguém declarar, o painel escreve n/d e diz porquê.
     */
    session_model: a.session_model ? String(a.session_model).slice(0, 80) : (antes.session_model || null),
    session_model_em: a.session_model ? new Date().toISOString() : (antes.session_model_em || null),
    session_model_fonte: a.session_model ? 'declarado por quem chama' : (antes.session_model_fonte || null),
  };

  try {
    fs.mkdirSync(MOOTER_DIR, { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(ctx, null, 2), 'utf8');
  } catch (e) {
    return { error: 'could not write session context: ' + ((e && e.message) || e) };
  }
  const efectivo = readSessionContext() || ctx;
  const rootsPreferidas = efectivo.fonte === 'mcp-capabilities.json → roots/list';
  return {
    ok: true, context: efectivo, file: SESSION_FILE,
    manual_context: rootsPreferidas ? ctx : null,
  };
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
    try { timer.unref(); } catch { /* ambiente sem unref */ }
    Promise.resolve(listFn({ limit: 20 }))
      .then((r) => {
        const list = (r && Array.isArray(r.sessions)) ? r.sessions : [];
        SESSIONS_CACHE = { at: Date.now(), sessions: list };   // aquece para a proxima
        clearTimeout(timer); finish(list, true);
      })
      .catch(() => { clearTimeout(timer); finish(SESSIONS_CACHE.sessions, false); });
  });
}

function publicJob(job, now, verbose) {
  const out = { ...(job || {}) };
  if (out.goal != null) out.goal = resumoGoal(out.goal, verbose);
  let value = null;
  let why = 'o ledger não trouxe duração nem timestamps válidos';
  if (job && job.duration_s != null && Number.isFinite(Number(job.duration_s))) {
    value = Number(job.duration_s);
    why = 'reportada pelo campo duration_s do ledger';
  } else if (job) {
    const start = Date.parse(job.started_at || job.dispatched_at || '');
    const end = Date.parse(job.ended_at || '');
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      value = Math.max(0, Math.round((end - start) / 1000));
      why = 'derivada de started_at e ended_at do ledger';
    } else if (isLive(job) && !Number.isNaN(start)) {
      value = Math.max(0, Math.round((Number(now) - start) / 1000));
      why = 'derivada do início no ledger até ao instante deste retrato';
    }
  }
  delete out.duration_s;
  delete out.elapsed_s;
  out.duracao_s = { valor: value, porque: why };
  if (out.model == null) {
    out.model = { valor: null, porque: 'o stream do job e a sessão não declararam um modelo atribuível' };
  }
  if (out.tier_motor == null) {
    out.tier_motor = { valor: null, porque: 'o motor não escreveu tier_motor no ledger' };
  }
  return out;
}

function measuredNumber(value) {
  const number = value == null ? null : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function measuredPercentile(value) {
  const match = /^p(\d{1,3})$/.exec(String(value || ''));
  if (!match) return null;
  return Math.max(1, Math.min(100, Number(match[1])));
}

function stalledInterval(seconds) {
  const value = measuredNumber(seconds);
  if (value == null) return 'n/d';
  if (value < 60) return Math.round(value) + ' s';
  return Math.floor(value / 60) + ' min';
}

/**
 * Converte a estimativa medida num contrato visual. O browser não recalcula
 * percentis nem inventa denominadores: limita-se a desenhar este objecto.
 */
function etaBarModel(job) {
  const source = job || {};
  const estimate = source.estimativa || {};
  const progress = estimate.progresso || {};
  const realSteps = progress.fonte === 'passos declarados'
    && Number.isInteger(Number(progress.passo))
    && Number.isInteger(Number(progress.de))
    && Number(progress.de) > 0;
  const percentage = realSteps
    ? Math.max(0, Math.min(100, Math.round((Number(progress.passo) / Number(progress.de)) * 100)))
    : null;
  const remaining = measuredNumber(estimate.falta_s && estimate.falta_s.valor);
  const elapsed = measuredNumber(source.elapsed_s != null
    ? source.elapsed_s
    : (source.duracao_s && source.duracao_s.valor));
  let fill = percentage;
  if (fill == null && remaining != null && elapsed != null) {
    const total = elapsed + remaining;
    fill = total > 0 ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100))) : 100;
  }
  const indeterminate = remaining == null || fill == null;
  const percentile = measuredPercentile(estimate.falta_s && estimate.falta_s.percentil_actual);
  const pulsing = typeof estimate.aviso === 'string' && estimate.aviso.length > 0;
  const reason = (estimate.falta_s && estimate.falta_s.porque)
    || estimate.manda_porque || estimate.porque || 'a estimativa não trouxe uma base medida';
  const withoutHistory = /hist[oó]ric|observa|eta-index/i.test(reason);
  const liveness = estimate.vivo || {};
  let pulse = {
    state: 'n/d',
    text: 'vivacidade n/d — ' + (liveness.porque || 'out.log ainda não foi medido'),
    stalled_s: null,
  };
  if (liveness.estado === 'a-trabalhar') {
    pulse = { state: 'a-trabalhar', text: 'out.log a crescer', stalled_s: null };
  } else if (liveness.estado === 'parado') {
    pulse = {
      state: 'parado',
      text: 'sem crescimento há ' + stalledInterval(liveness.ultimo_crescimento_s),
      stalled_s: measuredNumber(liveness.ultimo_crescimento_s),
    };
  }
  return {
    type: indeterminate ? 'indeterminate' : 'determinate',
    fill_pct: indeterminate ? null : fill,
    percentage,
    remaining_s: remaining,
    state: pulsing || (percentile != null && percentile >= 50) ? 'warning' : 'calm',
    pulsing,
    warning: pulsing ? estimate.aviso : null,
    message: indeterminate
      ? (withoutHistory ? 'n/d — sem histórico suficiente' : 'n/d — ' + reason)
      : null,
    estimator: {
      name: estimate.manda || null,
      reason: estimate.porque || estimate.manda_porque || reason,
      base: estimate.falta_s && estimate.falta_s.base ? estimate.falta_s.base : null,
      percentile: percentile == null ? null : 'p' + percentile,
    },
    pulse,
    actions: [],
  };
}

/**
 * Refresh barato da barra: zero jobs = zero I/O; com jobs, um índice comum e
 * uma estimativa por job. Esta vista recebe os jobs já conhecidos pelo painel,
 * portanto nunca precisa de abrir ledger.jsonl.
 */
function refreshEtaJobs(jobs, deps) {
  const d = deps || {};
  const list = (Array.isArray(jobs) ? jobs : [])
    .filter((job) => job && job.job_id && isLive(job))
    .slice(0, 32);
  const now = d.now == null ? Date.now() : Number(d.now);
  if (!list.length) {
    return { ok: true, view: 'eta', ts: new Date(now).toISOString(), refresh_ms: ETA_REFRESH_MS, jobs: [] };
  }
  const index = typeof d.etaReadIndex === 'function'
    ? d.etaReadIndex()
    : estimation.readIndex({ indexPath: ETA_INDEX });
  const estimate = typeof d.estimateJob === 'function' ? d.estimateJob : estimation.estimateJob;
  const refreshed = list.map((job) => {
    const measured = estimate(String(job.job_id), {
      agent: job.agent, goal: job.goal, prompt_chars: job.prompt_chars,
      started_at: job.started_at || job.dispatched_at, elapsed_s: job.elapsed_s,
      steps_done: job.steps_done, steps_total: job.steps_total,
      steps_total_porque: job.steps_total_porque,
    }, {
      index, indexPath: ETA_INDEX,
      outPath: path.join(JOBS_DIR, String(job.job_id), 'out.log'), now,
    });
    return {
      job_id: String(job.job_id),
      estimativa: measured,
      eta_bar: etaBarModel({ ...job, estimativa: measured }),
    };
  });
  return { ok: true, view: 'eta', ts: new Date(now).toISOString(), refresh_ms: ETA_REFRESH_MS, jobs: refreshed };
}

function environmentNoise(message) {
  const text = String(message || '');
  return /^ambiente \(não é do job\):/i.test(text)
    || /\brg:.*(?:os error 123|filename, directory name, or volume label syntax)/i.test(text)
    || /apply_patch verification failed/i.test(text);
}

function filterCoherence(entries) {
  return (Array.isArray(entries) ? entries : []).filter((entry) => !environmentNoise(entry && entry.msg));
}

/**
 * ⚠️ DIETA (J-0d, 2026-07-31) — medido no conector v1.29.1: `view=jobs` chegava
 * a ~40 KB porque o MESMO goal aparecia 4 vezes no mesmo payload
 * (wave_activa.goal, wave_activa.current_step, e outra vez dentro de cada job).
 * Um goal de 3 000 caracteres custava 12 000 caracteres de payload sem
 * acrescentar um único facto.
 *
 * O corte é por linha inteira e declara-se: quem quiser o goal por extenso
 * pede `verbose:true`. O `goal_chars` fica sempre, para que ninguém tenha de
 * adivinhar quanto foi cortado.
 */
const GOAL_RESUMO_CHARS = 180;

function resumoGoal(goal, verbose) {
  if (goal == null) return null;
  const texto = String(goal);
  if (verbose || texto.length <= GOAL_RESUMO_CHARS) return goal;
  const primeiraLinha = texto.split('\n')[0].trim();
  const base = primeiraLinha.length && primeiraLinha.length <= GOAL_RESUMO_CHARS
    ? primeiraLinha
    : texto.slice(0, GOAL_RESUMO_CHARS).trimEnd();
  return {
    resumo: base + ' …',
    goal_chars: texto.length,
    porque: 'goal cortado para o painel — pede verbose:true para o texto completo',
  };
}

function waveSummary(waveId, jobs, plans, verbose) {
  if (!waveId) return null;
  const inWave = jobs.filter((job) => job.wave === waveId);
  const wavePlan = plans.find((item) => item && item.wave === waveId);
  return {
    wave: waveId,
    goal: wavePlan ? resumoGoal(wavePlan.goal, verbose) : null,
    live: inWave.filter(isLive).length,
    done: inWave.filter((job) => job.state === 'done').length,
    failed: inWave.filter((job) => job.state === 'failed').length,
    total: inWave.length,
    steps_done: wavePlan ? wavePlan.done : null,
    steps_total: wavePlan ? wavePlan.total : null,
    current_step: wavePlan && wavePlan.current ? resumoGoal(wavePlan.current.title, verbose) : null,
    high_risk_open: wavePlan ? wavePlan.high_risk_open : null,
  };
}

function waveFocus(jobs, plans, verbose) {
  const list = Array.isArray(jobs) ? jobs : [];
  const planList = Array.isArray(plans) ? plans : [];
  const live = list.filter(isLive);
  const activeId = live.length ? live[0].wave : null;
  const recent = list.slice().sort((a, b) => String(b.ended_at || b.dispatched_at || '')
    .localeCompare(String(a.ended_at || a.dispatched_at || '')));
  const lastId = !activeId && recent.length ? recent[0].wave : null;
  return {
    active_wave: waveSummary(activeId, list, planList, verbose),
    ultima_wave: waveSummary(lastId, list, planList, verbose),
  };
}

function explainMissing(value, because) {
  return value == null ? { valor: null, porque: because } : value;
}

function decorateTree(tree, aggregateSummary) {
  if (!tree || typeof tree !== 'object') return tree;
  for (const wave of (tree.waves || [])) {
    for (const task of (wave.tarefas || [])) {
      for (const floor of [task.remate].concat(task.preparadores || [])) {
        if (!floor) continue;
        floor.modelo = explainMissing(floor.modelo,
          'o job não declarou o modelo usado no stream nem numa sessão temporalmente compatível');
        floor.tier_motor = explainMissing(floor.tier_motor,
          'o motor não escreveu tier_motor no ledger deste job');
      }
    }
  }
  tree.resumo = { ...(tree.resumo || {}), ...(aggregateSummary || {}) };
  return tree;
}

function sessionPayload(context, now, thresholdMinutes) {
  const model = context && context.session_model ? String(context.session_model) : null;
  const block = {
    modelo: explainMissing(model,
      'o MCP não expõe o modelo do host; ninguém o declarou para esta sessão'),
    fonte: model ? (context.session_model_fonte || 'declarado por quem chama') : null,
    nota: model ? null : 'declara-o com mooter_setup({session_model}) ou fica n/d',
  };
  return addFreshness(block, context && context.session_model_em, now, thresholdMinutes);
}

// ── the snapshot the panel polls ─────────────────────────────────────────
async function toolFleet(args, deps) {
  const d = deps || {};
  if (args && args.view === 'eta') return refreshEtaJobs(args.jobs, d);
  if (args && args.view === 'afericao') {
    const captureLedger = typeof d.ledgerRead === 'function'
      ? await d.ledgerRead() : (readLedgerLines(LEDGER) || []);
    const captureIndex = typeof d.etaReadIndex === 'function'
      ? await d.etaReadIndex() : eta.readIndex({ indexPath: ETA_INDEX });
    const capturaPorAgente = eta.captureRates(captureLedger, captureIndex);
    const ultima = typeof d.afericaoLatest === 'function'
      ? await d.afericaoLatest({}) : afericao.lerUltimaAfericao({});
    if (!ultima || ultima.estado === 'n/d') {
      const porque = ultima && ultima.porque
        ? ultima.porque : 'nunca foi guardada uma aferição nesta máquina';
      return {
        resumo: '🐮 aferição n/d — ' + porque,
        estado: 'n/d',
        porque,
        afericao: null,
        captura_por_agente: capturaPorAgente,
      };
    }
    return {
      resumo: '🐮 última aferição medida em ' + ultima.medido_em,
      estado: 'medido',
      porque: 'medição lida do histórico local guardado pelo condutor',
      afericao: ultima.resultado,
      ficheiro: ultima.ficheiro,
      captura_por_agente: capturaPorAgente,
    };
  }
  if (args && args.view === 'board') {
    const card = await (typeof d.boardScorecard === 'function'
      ? d.boardScorecard({}) : board.scorecardAsync({}));
    const dormir = card.pode_ir_dormir && card.pode_ir_dormir.valor;
    return {
      resumo: dormir === true ? '🐮 scorecard dentro da faixa — podes ir dormir'
        : (dormir === false ? '⚠ scorecard com ' + card.excepcoes.length + ' excepção(ões)'
          : '🐮 scorecard n/d — faltam medições para fechar o estado'),
      pode_ir_dormir: card.pode_ir_dormir,
      scorecard: card,
      excepcoes: card.excepcoes,
    };
  }
  const now = Date.now();
  const windowMin = Math.min(Math.max(Number(args && args.windowMinutes) || 30, 1), 1440);
  const waveFilter = args && args.wave ? String(args.wave) : null;
  const includeLocal = !(args && args.includeLocal === false);

  const context = readSessionContext();
  const events = readLedgerLines(LEDGER);
  const sessionProbe = typeof d.sessionsList === 'function'
    ? () => sessionsFast(d.sessionsList)
    : () => ({ sessions: [], fresh: true });
  const [local, gpu, vault, livePreview, fuel, worktrees, sessionResult, capabilityState] = await Promise.all([
    probeWithin(
      includeLocal
        ? () => (typeof d.probeOllama === 'function' ? d.probeOllama(OLLAMA_TIMEOUT_MS) : probeOllama(OLLAMA_TIMEOUT_MS))
        : () => null,
      PANEL_PROBE_TIMEOUT_MS, null,
    ),
    probeWithin(
      () => (typeof d.gpuSnapshot === 'function' ? d.gpuSnapshot(null) : gpuMod.gpuSnapshot(null)),
      PANEL_PROBE_TIMEOUT_MS, null,
    ),
    probeWithin(
      () => (typeof d.vaultStatus === 'function' ? d.vaultStatus() : journal.vaultStatus()),
      PANEL_PROBE_TIMEOUT_MS, null,
    ),
    probeWithin(
      () => (typeof d.uiProbe === 'function' ? d.uiProbe() : probe.estado()),
      PANEL_PROBE_TIMEOUT_MS, null,
    ),
    probeWithin(
      // ⚠️ estadoAsync, NUNCA estado: a versão síncrona lê 47 ficheiros e prendeu
      // o event loop 209 ms — tempo em que nem o `close` de um job corre.
      () => (typeof d.quotaEstado === 'function' ? d.quotaEstado({}) : quota.estadoAsync({})),
      PANEL_PROBE_TIMEOUT_MS, null,
    ),
    probeWithin(
      () => (typeof d.worktreesList === 'function'
        ? d.worktreesList(PANEL_PROBE_TIMEOUT_MS, events || [])
        : probeWorktrees(PANEL_PROBE_TIMEOUT_MS, events || [])),
      PANEL_PROBE_TIMEOUT_MS, null,
    ),
    probeWithin(sessionProbe, PANEL_PROBE_TIMEOUT_MS, { sessions: SESSIONS_CACHE.sessions, fresh: false }),
    probeWithin(
      () => (typeof d.capabilityState === 'function' ? d.capabilityState() : capacidades.estado()),
      PANEL_PROBE_TIMEOUT_MS, null,
    ),
  ]);
  const sessions = (sessionResult && sessionResult.sessions) || [];
  const sessionsFresh = !!(sessionResult && sessionResult.fresh);
  if (gpu && gpu.live && Array.isArray(local) && typeof gpuMod.headroom === 'function') {
    gpu.headroom = gpuMod.headroom(gpu.live, { memory_total_mb: gpu.memory_total_mb }, local.length);
  }
  const measuredNow = new Date(now).toISOString();
  const fuelMeasured = sanitizeFuel(fuel);
  const freshBlocks = {
    live_preview: addFreshness(livePreview,
      livePreview && livePreview.relatorio && livePreview.relatorio.at,
      now, freshnessThreshold('live_preview', d)),
    capacidades: addFreshness(capabilityState,
      capabilityState && capabilityState.medido_em,
      now, freshnessThreshold('capacidades', d)),
    gpu: addFreshness(gpu, gpu ? measuredNow : null, now, freshnessThreshold('gpu', d)),
    vault: addFreshness(vault, vault ? measuredNow : null, now, freshnessThreshold('vault', d)),
    combustivel: addFreshness(fuelMeasured, fuelMeasured ? measuredNow : null,
      now, freshnessThreshold('combustivel', d)),
    sessao: sessionPayload(context, now, freshnessThreshold('sessao', d)),
  };

  if (events === null) {
    const emptyAggregate = aggregatePanel([]);
    return compactPayload({
      ok: true, ts: new Date(now).toISOString(), context,
      live: 0, waves: [], jobs: [], sessions: [],
      plans: [], handoffs: [], coherence: [], active_wave: null,
      totals: emptyAggregate.totals,
      ...freshBlocks,
      worktrees,
      local, local_available: local !== null, local_host: OLLAMA_HOST,
      sessions_fresh: sessionsFresh,
      notice: 'sem ledger — nenhum job foi despachado nesta máquina',
    });
  }

  let jobs = foldJobs(events);
  if (waveFilter) jobs = jobs.filter((j) => j.wave === waveFilter);

  const cutoff = now - windowMin * 60 * 1000;
  jobs = jobs.filter((j) => {
    if (isLive(j)) return true;
    const t = j.ended_at ? Date.parse(j.ended_at) : NaN;
    return !Number.isNaN(t) && t >= cutoff;
  });

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
    // finished jobs freeze their rate on duration_s; live ones estimate and say so
    {
      try {
        const t = telemetry.readJobTelemetry(path.join(JOBS_DIR, j.job_id, 'out.log'), j.elapsed_s,
          { finished: !isLive(j), duration_s: j.duration_s });
        if (t) {
          j.activity = t.activity || null;
          j.tokens_in = t.tokens_in != null ? t.tokens_in : j.tokens_in;
          j.tokens_out = t.tokens_out != null ? t.tokens_out : j.tokens_out;
          j.tok_s = t.tok_s != null ? t.tok_s : null;
          j.tok_s_basis = t.tok_s_basis || null;
          j.steps_done = Math.max(Number(j.steps_done) || 0, Number(t.steps_done) || 0);
          j.files_read = t.files_read && t.files_read.length ? t.files_read.slice(-6) : null;
          j.files_written = t.files_written && t.files_written.length ? t.files_written.slice(-6) : null;
          j.commands = t.commands && t.commands.length ? t.commands.slice(-3) : null;
          if (t.model) { j.model = t.model; j.model_source = 'stream do job'; }
        }
      } catch { /* the panel must never die because a log is mid-write */ }
    }
  }

  // Um único índice alimenta todos os jobs deste retrato; cada job vivo paga
  // apenas o seu próprio stat(out.log). Não há barra nem estimativa por wave.
  const liveForEstimate = jobs.filter(isLive);
  const etaIndex = liveForEstimate.length
    ? (typeof d.etaReadIndex === 'function' ? d.etaReadIndex() : estimation.readIndex({ indexPath: ETA_INDEX }))
    : null;
  for (const j of liveForEstimate) {
    const estimate = typeof d.estimateJob === 'function' ? d.estimateJob : estimation.estimateJob;
    j.estimativa = estimate(j.job_id, {
      agent: j.agent, goal: j.goal, prompt_chars: j.prompt_chars,
      started_at: j.started_at, elapsed_s: j.elapsed_s,
      steps_done: j.steps_done, steps_total: j.steps_total,
      steps_total_porque: j.steps_total_porque,
    }, {
      index: etaIndex, indexPath: ETA_INDEX,
      outPath: path.join(JOBS_DIR, j.job_id, 'out.log'), now,
    });
    j.eta_bar = etaBarModel(j);
  }

  // wave plans: the steps, who did them, and which ones are dangerous
  const planWaves = [...new Set(jobs.map((j) => j.wave).filter(Boolean))];
  if (waveFilter && !planWaves.includes(waveFilter)) planWaves.push(waveFilter);
  // A7 — o plano é reconciliado contra o ledger ANTES de ser contado
  const ledgerStates = new Map();
  for (const e of events) { if (e && e.job_id && e.event) ledgerStates.set(e.job_id, e.event); }
  const plans = [];
  for (const w of planWaves) {
    try { const p = plan.readPlan(w); if (p) plans.push(plan.summarize(plan.reconcile(p, ledgerStates))); } catch { /* */ }
  }

  // Uma só soma alimenta totals e arvore.resumo; sem parcelas, o valor é n/d.
  const aggregate = aggregatePanel(jobs);
  const totals = aggregate.totals;

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
        ? 'preparação local: '
          + (src.prep_chars != null ? src.prep_chars + ' chars' : 'chars n/d')
          + ' em ' + (src.prep_duration_s != null ? src.prep_duration_s + 's' : 'n/d')
          + ' · ' + (src.tokens_poupados_estimados != null ? '~' + src.tokens_poupados_estimados : 'n/d')
          + ' tokens poupados (estimativa)'
        : null,
    });
  }

  // v1.3 — coherence: the panel checks ITSELF and shows what does not add up.
  // Two costs for one job differed by 2.5x on 2026-07-25 and nobody noticed for
  // a day. A cockpit that cannot detect its own contradictions is decoration.
  const coherence = [];
  // ⚠️ A4 — três regras novas, cada uma nascida de um número impossível visto
  // na auditoria de 2026-07-25.
  for (const j of jobs) {
    const local = LOCAL_AGENTS.has(j.agent);
    if (local && j.tier_motor && j.tier_motor !== 'T0') {
      coherence.push({ level: 'aviso', job: j.job_id, msg: 'motor local marcado ' + j.tier_motor + ' — local é sempre T0' });
    }
    if (!local && j.tier_motor === 'T0') {
      coherence.push({ level: 'aviso', job: j.job_id, msg: 'motor pago marcado T0 — T0 é a GPU local' });
    }
    if (j.tokens_in != null && j.tokens_in < 20 && (j.tokens_out == null || j.tokens_out > 50)) {
      coherence.push({ level: 'aviso', job: j.job_id, msg: 'tokens_in=' + j.tokens_in + ' é impossível para um prompt real — o parser não leu o usage' });
    }
  }
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
  for (const p of plans) {
    if (p && p.running > 0 && !jobs.some((j) => isLive(j) && j.wave === p.wave)) {
      coherence.push({ level: 'aviso', job: null, msg: 'plano ' + p.wave + ' diz ' + p.running + ' etapa(s) a correr mas não há job vivo nessa wave' });
    }
  }
  if (!sessionsFresh && jobs.some((j) => isLive(j))) {
    coherence.push({ level: 'info', job: null, msg: 'sessões do cockpit vieram de cache — nomes de modelo podem estar em atraso' });
  }
  // ⚠️ v1.3.3 — erros reais viviam SÓ no stderr_tail e nunca chegavam ao painel.
  // Um job `done exit 0` trazia "failed to load skill … missing YAML frontmatter"
  // e "AuthRequired … mcp.vercel.com" sem que nada aparecesse. Promovê-los a
  // coerência é o que este array existe para fazer — e separa o que é ambiente
  // (skill mal formada, OAuth em falta) do que é falha do job.
  for (const j of jobs) {
    try {
      const errPath = path.join(JOBS_DIR, j.job_id, 'err.log');
      const lines = fs.readFileSync(errPath, 'utf8').split('\n').filter(Boolean).slice(-40);
      const seen = new Set();
      for (const l of lines) {
        if (!/\b(error|fatal|failed|auth\s*required|refused|denied)\b/i.test(l)) continue;
        if (/no stdin data received/i.test(l)) continue;      // ruído conhecido e benigno
        const msg = l.trim().slice(0, 160);
        if (seen.has(msg)) continue;
        const ambiente = /(skill|frontmatter|AuthRequired|mcp\.|oauth|\.mcp\.json)/i.test(msg);
        if (ambiente || environmentNoise(msg)) continue;       // fica no err.log, não no painel
        seen.add(msg);
        coherence.push({
          level: 'aviso',
          job: j.job_id,
          msg: 'stderr: ' + msg,
        });
        if (seen.size >= 3) break;                            // no máximo 3 por job
      }
    } catch { /* sem err.log é normal */ }
  }

  jobs.sort((a, b) => {
    const rank = (x) => (isLive(x) ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return String(b.ended_at || b.dispatched_at || '').localeCompare(String(a.ended_at || a.dispatched_at || ''));
  });

  const verboseGoals = !!(args && args.verbose === true);
  const focus = waveFocus(jobs, plans, verboseGoals);
  const shown = jobs.slice(0, 16);
  const publicJobs = shown.map((job) => publicJob(job, now, verboseGoals));
  const tree = decorateTree(arvore.construir(jobs, plans), aggregate.arvore_resumo);
  return compactPayload({
    ok: true,
    ts: new Date(now).toISOString(),
    context,
    live: shown.filter(isLive).length,
    waves: groupByWave(publicJobs),
    jobs: publicJobs,
    sessions: sessions
      .filter((s) => s.status === 'working')
      .map((s) => ({ id: s.id, title: s.title, model: s.model || null, project: s.project || null, cwd: s.cwd || null })),
    plans,                       // steps × risk × who did them
    totals,                      // tokens split cloud vs local, real cost
    handoffs,                    // proven chains: who prepared for whom
    coherence: filterCoherence(coherence),
    active_wave: focus.active_wave,
    ultima_wave: focus.ultima_wave,
    // ── v1.5 · A CABINE ────────────────────────────────────────────────────
    // A lista plana responde "o que corre". A árvore responde à pergunta de
    // quem paga: quanto do meu trabalho foi feito de graça, e por quem.
    arvore: tree,
    sessao: freshBlocks.sessao,
    live_preview: freshBlocks.live_preview,
    capacidades: freshBlocks.capacidades,
    /**
     * ⚠️ O MEDIDOR DE COMBUSTÍVEL — e a razão de ele existir.
     *
     * "approaching weekly limit" apareceu na caixa de texto do Paulo enquanto
     * trabalhávamos. Não há API de quota em lado nenhum; o que há são os
     * ficheiros de sessão que o próprio `/usage` do Claude Code lê. Lemos os
     * mesmos, e a leitura viaja sempre com a ressalva de que é um LIMITE
     * INFERIOR — o contador do servidor conta também o claude.ai e outras
     * máquinas, e está sempre à frente deste.
     */
    combustivel: freshBlocks.combustivel,
    /**
     * ⚠️ O utilizador não pode ser o último a saber que há versão nova.
     * Até aqui, só descobria se alguém lho dissesse — e um vibe coder podia
     * ficar meses numa build com bugs já corrigidos.
     */
    /**
     * ⚠️ 37,9 KB DE 2 EM 2 SEGUNDOS. Medido no registo do servidor.
     *
     * O painel repolla continuamente e esta resposta levava a lista COMPLETA de
     * todos os bundles alguma vez construídos — 22 entradas com caminho, bytes e
     * contagem de ficheiros. Ninguém olha para isso, e passava pelo mesmo tubo
     * stdio por onde os jobs são despachados.
     *
     * O painel só precisa de saber: que versão corre, e se há uma mais nova.
     */
    versao: (() => {
      try {
        const r = require('./update.js').procurar({});
        return { versao_instalada: r.versao_instalada, nova: r.nova, resumo: r.resumo };
      } catch { return null; }
    })(),
    // ⚠️ a porta que funcionou da última vez. O painel arranca já com ela em vez
    // de exigir que o utilizador saiba a porta do próprio dev server.
    preview_ultima: (() => {
      try { return require('./preview.js').lembrar ? JSON.parse(require('fs').readFileSync(require('./preview.js').MEM, 'utf8')) : null; }
      catch { return null; }
    })(),
    gpu: freshBlocks.gpu,
    vault: freshBlocks.vault,
    worktrees,                     // projecção read-only; null quando a sonda excede o orçamento
    local,                       // null = Ollama unreachable (n/d), [] = up with nothing loaded
    local_available: local !== null,
    local_host: OLLAMA_HOST,
    // false = o enriquecimento de modelo estourou o orcamento; o retrato e' valido,
    // so os nomes concretos podem estar em cache ou ausentes. Honesto, nao inventado.
    sessions_fresh: sessionsFresh,
  });
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
        const who = metricValue(j.model) || j.agent_label || '?';
        const tk = (j.tokens_out != null) ? (' · ' + j.tokens_out + ' tok out' + (j.tok_s ? ' · ' + j.tok_s + ' tok/s' : '')) : '';
        const seconds = metricValue(j.duracao_s);
        L.push('    · ' + (j.where || j.job_id) + ' — ' + who + (seconds != null ? ' — ' + seconds + 's' : '') + tk);
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
  if (d.totals && (metricValue(d.totals.cloud_out) != null || metricValue(d.totals.local_out) != null)) {
    const t = d.totals;
    const cloudIn = metricValue(t.cloud_in); const cloudOut = metricValue(t.cloud_out);
    const localIn = metricValue(t.local_in); const localOut = metricValue(t.local_out);
    const cost = metricValue(t.cost_usd);
    /**
     * ⚠️ Auditoria E2E 2026-08-01 — o rótulo mentia, não o número.
     *
     * Esta linha dizia «X% do output foi local» lendo `local_share`, que é uma
     * CONTAGEM DE JOBS (`fatiaLocal`, jobs concluídos com agent==='moo'). Medido
     * no ledger real: 50,9% por jobs contra 15,0% por tokens de entrada — o
     * rótulo prometia tokens e mostrava jobs, inflando o fosso ~3,4×.
     *
     * `local_share_tokens_saida` já existia (calculada acima), com n/d honesto
     * quando algum job não traz `tokens_out` — e nenhum consumidor a lia.
     * Agora: tokens quando forem medíveis, jobs quando não — e o rótulo diz
     * SEMPRE qual dos dois está a ser mostrado. Ver G12 do MEO_GAUNTLET.
     */
    const shareTok = metricValue(t.local_share_tokens_saida);
    const shareJobs = metricValue(t.local_share);
    let shareTxt = '';
    if (shareTok != null) {
      shareTxt = '  ·  ' + shareTok + '% dos tokens de saída foram locais';
    } else if (shareJobs != null) {
      shareTxt = '  ·  ' + shareJobs + '% dos JOBS foram locais (por tokens: n/d — '
        + ((t.local_share_tokens_saida && t.local_share_tokens_saida.porque) || 'sem medição') + ')';
    }
    L.push('', 'TOKENS  cloud ' + (cloudIn == null ? 'n/d' : cloudIn) + ' in / ' + (cloudOut == null ? 'n/d' : cloudOut)
      + ' out  ·  local ' + (localIn == null ? 'n/d' : localIn) + ' in / ' + (localOut == null ? 'n/d' : localOut) + ' out'
      + shareTxt
      + (cost != null ? '  ·  $' + Number(cost).toFixed(4) : ''));
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
    for (const j of done) {
      const seconds = metricValue(j.duracao_s);
      L.push('    ' + (j.state === 'failed' ? 'x' : 'v') + ' ' + (j.where || j.job_id) + ' — '
        + (metricValue(j.model) || j.agent_label || '?') + (seconds != null ? ' — ' + seconds + 's' : ''));
    }
  }
  if (d.notice) L.push('', d.notice);
  return L.join('\n');
}

/**
 * As origens locais que o painel pode tocar. Portas típicas de dev server —
 * Vite, Next, CRA, Astro, e a porta do Live Preview do plugin do VS Code.
 * ❌ Nunca um domínio externo: ver a nota em UI_RESOURCE._meta.ui.csp.
 */
/**
 * ⚠️ 11434 SAIU DAQUI. Auditoria do Codex, 2026-07-26:
 *
 * `frameDomains` autoriza DOCUMENTOS dentro de iframes. A 11434 é a API REST do
 * Ollama — não serve documentos, e o painel nunca lhe fala directamente (quem
 * fala é o servidor, em Node). Tê-la na lista era uma porta aberta sem nenhuma
 * porta do outro lado: risco sem benefício.
 *
 * `connectDomains` fica igualmente vazio, e pela mesma razão: nada no painel
 * faz fetch. Se um dia fizer, entra aqui uma origem de cada vez, com motivo.
 */
const LOCAL_PORTS = [3000, 3001, 4000, 4173, 5000, 5173, 5174, 8000, 8080, 8081, 8788, 9000, 39215];
const LOCAL_ORIGINS = [];
for (const h of ['http://localhost', 'http://127.0.0.1']) {
  for (const p of LOCAL_PORTS) LOCAL_ORIGINS.push(h + ':' + p);
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
      /**
       * ⚠️ v1.5 — o painel continua a NÃO carregar script, estilo ou fonte de
       * fora. O que passa a declarar é o mínimo para o Live Preview:
       *
       *   frameDomains   → embeber o teu servidor de preview local num iframe
       *   connectDomains → perguntar-lhe se está vivo antes de o embeber
       *
       * Só `localhost`/`127.0.0.1`. Nenhum domínio da internet, em lado nenhum:
       * um painel que pudesse falar para fora seria um canal de exfiltração com
       * vista para o teu código.
       *
       * A spec (SEP-1865, Final na revisão 2026-07-28) permite isto. Se ESTE
       * host o implementa é outra pergunta — e é a `mooter_ui_probe` que a
       * responde, com medição, em vez de nós assumirmos.
       */
      csp: {
        resourceDomains: [],
        connectDomains: [],          // o painel não faz fetch nenhum
        frameDomains: LOCAL_ORIGINS, // só documentos de servidores de preview locais
      },
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
        view: { type: 'string', enum: ['eta'], description: 'Refresh barato das barras já visíveis, sem abrir o ledger.' },
        jobs: {
          type: 'array', maxItems: 32,
          description: 'Jobs vivos já conhecidos pelo painel; usados apenas quando view=eta.',
          items: {
            type: 'object',
            properties: {
              job_id: { type: 'string' }, state: { type: 'string' }, agent: { type: 'string' },
              goal: { type: 'string' }, prompt_chars: { type: 'number' },
              started_at: { type: 'string' }, dispatched_at: { type: 'string' }, elapsed_s: { type: 'number' },
              steps_done: { type: 'number' }, steps_total: { type: 'number' }, steps_total_porque: { type: 'string' },
            },
            required: ['job_id', 'state'],
            additionalProperties: false,
          },
        },
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
        session_model: { type: 'string', description: 'O modelo que conduz esta conversa (ex.: claude-opus-5). O MCP não o expõe — declara-o ou o painel diz n/d.' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Bind the Cowork session', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolSessionBind,
  },
];

module.exports = {
  TOOLS, UI_RESOURCE, UI_URI, UI_MIME, LOCAL_ORIGINS, LOCAL_PORTS,
  toolFleet, toolSessionBind, readUiHtml, formatFleetText,
  foldJobs, elapsedSeconds, attachModels, groupByWave, probeOllama, readSessionContext,
  aggregatePanel, addFreshness, closePercentages, summarizeWorktrees, compactPayload,
  filterCoherence, publicJob, sanitizeFuel, waveFocus, etaBarModel, refreshEtaJobs,
  LEDGER, SESSION_FILE, OLLAMA_HOST, envOrNull, sessionsFast, SESSIONS_BUDGET_MS, ETA_REFRESH_MS,
  _resumoGoal: resumoGoal, GOAL_RESUMO_CHARS,
};
