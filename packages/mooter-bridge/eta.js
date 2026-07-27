'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const aprender = require('./aprender.js');

const VERSION = 1;
const MIN_OBSERVATIONS = 5;
/**
 * ⚠️ Um índice que guarda tudo deixa de ser um índice.
 *
 * O requisito desta peça é que o caminho de leitura toque num ficheiro
 * pequeno — foi para isso que ele existe, depois de o `quota.estado`
 * síncrono nos ter custado 209 ms a varrer o ledger. Só que guardar as
 * amostras cruas sem tecto reintroduz o mesmo problema por outra porta:
 * ao fim de alguns milhares de jobs o `eta-index.json` fica gordo, e o
 * `recompute` de todas as chaves passa a percorrer tudo a cada job.
 *
 * Janela deslizante: cada chave retém as JANELA observações mais recentes.
 * A mediana de 200 jobs recentes descreve melhor a máquina de hoje do que
 * a mediana de 5 000 que inclui uma GPU que já não está cá.
 */
const JANELA = 200;
const TERMINAL_EVENTS = new Set(['done', 'failed', 'prep_timeout', 'prep_failed_fallback']);
const EXCLUDED_EXITS = new Set(['cancelled-by-user', 'orphaned-by-restart']);
const TIMEOUT_EXITS = new Set(['timeout', 'prep-timeout']);

function etaIndexPath(options) {
  const o = options || {};
  return o.indexPath || path.join(o.mooterHome || process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter'), 'eta-index.json');
}
function emptyIndex() { return { version: VERSION, atualizado_em: null, chaves: {} }; }

function loadIndex(options) {
  const o = options || {};
  const io = o.fs || fs;
  const file = etaIndexPath(o);
  try {
    const parsed = JSON.parse(io.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.chaves || typeof parsed.chaves !== 'object') {
      return { file, state: null, porque: 'eta-index.json existe mas não tem o formato v1 esperado' };
    }
    return { file, state: parsed, porque: null };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { file, state: emptyIndex(), porque: null };
    return { file, state: null, porque: 'não consegui ler eta-index.json: ' + ((error && error.message) || 'erro desconhecido') };
  }
}

function readIndex(options) {
  const loaded = loadIndex(options);
  return loaded.state || { ...emptyIndex(), porque: loaded.porque };
}
function contextBucket(promptChars) {
  if (promptChars == null) return null;
  const size = Number(promptChars);
  if (!Number.isFinite(size) || size < 0) return null;
  if (size < 4_000) return '<4k';
  if (size <= 32_000) return '4-32k';
  return '>32k';
}
function indexKey(agent, category, bucket) { return [agent, category, bucket].join('|'); }
function nearestRank(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil(percentile * sorted.length)) - 1];
}
function publicEntry(entry) {
  const out = {
    n: entry.n, p50: entry.p50, p75: entry.p75, p90: entry.p90, max: entry.max,
    bytes_n: entry.bytes_n || 0,
    bytes_p50: entry.bytes_p50 == null ? null : entry.bytes_p50,
    bytes_p75: entry.bytes_p75 == null ? null : entry.bytes_p75,
    bytes_p90: entry.bytes_p90 == null ? null : entry.bytes_p90,
    bytes_max: entry.bytes_max == null ? null : entry.bytes_max,
    medido_em: entry.medido_em,
  };
  if (entry.bytes_porque) out.bytes_porque = entry.bytes_porque;
  else if (out.bytes_n < MIN_OBSERVATIONS) {
    out.bytes_porque = 'só há ' + out.bytes_n + ' observação(ões) com bytes medidos; são precisas pelo menos ' + MIN_OBSERVATIONS + ' para normalizar a vivacidade';
  }
  return out;
}

function recompute(entry, measuredAt) {
  if (Array.isArray(entry._observacoes) && entry._observacoes.length > JANELA) {
    entry._observacoes = entry._observacoes.slice(-JANELA);
  }
  if (Array.isArray(entry._timeouts) && entry._timeouts.length > JANELA) {
    entry._timeouts = entry._timeouts.slice(-JANELA);
  }
  const observations = entry._observacoes || [];
  const timeoutObservations = entry._timeouts || [];
  const completed = observations.map((item) => Number(item.duration_s)).filter((value) => Number.isFinite(value) && value >= 0);
  const timeouts = timeoutObservations.map((item) => Number(item.duration_s)).filter((value) => Number.isFinite(value) && value >= 0);
  const all = completed.concat(timeouts);
  const completedBytes = observations
    .map((item) => item.bytes_finais == null ? null : Number(item.bytes_finais))
    .filter((value) => value != null && Number.isFinite(value) && value >= 0);
  const timeoutBytes = timeoutObservations
    .map((item) => item.bytes_finais == null ? null : Number(item.bytes_finais))
    .filter((value) => value != null && Number.isFinite(value) && value >= 0);
  const allBytes = completedBytes.concat(timeoutBytes);
  entry.n = completed.length;
  entry.p50 = completed.length >= MIN_OBSERVATIONS ? nearestRank(completed, 0.50) : null;
  entry.p75 = completed.length >= MIN_OBSERVATIONS ? nearestRank(completed, 0.75) : null;
  entry.p90 = completed.length >= MIN_OBSERVATIONS ? nearestRank(completed, 0.90) : null;
  entry.max = all.length ? Math.max(...all) : null;
  // Estes percentis normalizam apenas o sinal de vivacidade do out.log.
  // Nunca entram na ETA: bytes de log não medem duração nem trabalho feito.
  entry.bytes_n = completedBytes.length;
  entry.bytes_p50 = completedBytes.length >= MIN_OBSERVATIONS ? nearestRank(completedBytes, 0.50) : null;
  entry.bytes_p75 = completedBytes.length >= MIN_OBSERVATIONS ? nearestRank(completedBytes, 0.75) : null;
  entry.bytes_p90 = completedBytes.length >= MIN_OBSERVATIONS ? nearestRank(completedBytes, 0.90) : null;
  entry.bytes_max = allBytes.length ? Math.max(...allBytes) : null;
  entry.medido_em = measuredAt || entry.medido_em || null;
  entry.timeouts_n = timeouts.length;
  if (completed.length < MIN_OBSERVATIONS) {
    entry.porque = 'só há ' + completed.length + ' observação(ões) completa(s); são precisas pelo menos ' + MIN_OBSERVATIONS + ' para calcular percentis';
  } else delete entry.porque;
  if (completedBytes.length < MIN_OBSERVATIONS) {
    entry.bytes_porque = 'só há ' + completedBytes.length + ' observação(ões) com bytes medidos; são precisas pelo menos ' + MIN_OBSERVATIONS + ' para normalizar a vivacidade';
  } else delete entry.bytes_porque;
  return entry;
}

function writeIndex(state, options) {
  const o = options || {};
  const io = o.fs || fs;
  const file = etaIndexPath(o);
  io.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.tmp-' + process.pid + '-' + Math.random().toString(16).slice(2);
  io.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  io.renameSync(temp, file);
}

function recordObservation(observation, options) {
  const item = observation || {};
  if (EXCLUDED_EXITS.has(item.exit_code)) return { ok: true, excluded: true, porque: 'interrupções não medem duração de trabalho' };
  const duration = item.duration_s == null ? null : Number(item.duration_s);
  if (!Number.isFinite(duration) || duration < 0) return { ok: false, porque: 'duration_s não foi medido; o índice não aceita uma duração inventada' };
  const finalBytesValue = item.bytes_finais == null ? null : Number(item.bytes_finais);
  const finalBytes = Number.isFinite(finalBytesValue) && finalBytesValue >= 0 ? finalBytesValue : null;
  const bucket = contextBucket(item.prompt_chars);
  if (!bucket) return { ok: false, porque: 'o tamanho real do prompt não foi medido; a faixa de contexto fica n/d' };
  const agent = String(item.agent || '').trim();
  if (!agent) return { ok: false, porque: 'o agente do job é n/d' };
  const category = item.category || aprender.categoryForGoal(item.goal);
  const jobId = String(item.job_id || '').trim();
  if (!jobId) return { ok: false, porque: 'job_id é obrigatório para impedir observações duplicadas' };
  const loaded = loadIndex(options);
  if (!loaded.state) return { ok: false, porque: loaded.porque };
  const state = loaded.state;
  state.version = VERSION;
  state.chaves = state.chaves || {};
  for (const entry of Object.values(state.chaves)) {
    entry._observacoes = (entry._observacoes || []).filter((sample) => sample.job_id !== jobId);
    entry._timeouts = (entry._timeouts || []).filter((sample) => sample.job_id !== jobId);
  }
  const key = indexKey(agent, category, bucket);
  const entry = state.chaves[key] || { n: 0, p50: null, p75: null, p90: null, max: null, medido_em: null, _observacoes: [], _timeouts: [] };
  entry._observacoes = entry._observacoes || [];
  entry._timeouts = entry._timeouts || [];
  const sample = { job_id: jobId, duration_s: duration, bytes_finais: finalBytes };
  const timedOut = item.desfecho === 'expirou' || TIMEOUT_EXITS.has(item.exit_code);
  (timedOut ? entry._timeouts : entry._observacoes).push(sample);
  const measuredAt = item.ts || new Date().toISOString();
  state.chaves[key] = recompute(entry, measuredAt);
  for (const [otherKey, otherEntry] of Object.entries(state.chaves)) if (otherKey !== key) recompute(otherEntry, otherEntry.medido_em);
  state.atualizado_em = measuredAt;
  writeIndex(state, options);
  return { ok: true, key, valor: publicEntry(state.chaves[key]) };
}

function lookup(query, options) {
  const q = query || {};
  const state = readIndex(options);
  if (state.porque) return { valor: null, porque: state.porque };
  const key = q.key || indexKey(q.agent, q.category, q.bucket || contextBucket(q.prompt_chars));
  const entry = state.chaves[key];
  if (!entry) return { valor: null, porque: 'sem observações para ' + key };
  if (Number(entry.n) < MIN_OBSERVATIONS) return { valor: null, porque: entry.porque || 'menos de ' + MIN_OBSERVATIONS + ' observações completas' };
  return { valor: publicEntry(entry) };
}

function observeTerminal(event, options) {
  const ev = event || {};
  if (!TERMINAL_EVENTS.has(ev.event)) return { ok: true, ignored: true };
  if (EXCLUDED_EXITS.has(ev.exit_code)) return { ok: true, excluded: true, porque: 'interrupções não medem duração de trabalho' };
  const o = options || {};
  const io = o.fs || fs;
  if (!o.jobDir) return { ok: false, porque: 'jobDir é n/d; não consigo medir o prompt real' };
  let meta;
  let prompt;
  try {
    meta = JSON.parse(io.readFileSync(path.join(o.jobDir, 'meta.json'), 'utf8'));
    prompt = io.readFileSync(path.join(o.jobDir, 'masterprompt.md'), 'utf8');
  } catch (error) {
    return { ok: false, porque: 'não consegui ler a metadata do job: ' + ((error && error.message) || error) };
  }
  let duration = ev.duration_s == null ? null : Number(ev.duration_s);
  if (!Number.isFinite(duration) && meta.created_at && ev.ts) {
    const started = Date.parse(meta.created_at);
    const ended = Date.parse(ev.ts);
    if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) duration = Number(((ended - started) / 1000).toFixed(3));
  }
  let finalBytes = null;
  try {
    const measured = Number(io.statSync(path.join(o.jobDir, 'out.log')).size);
    if (Number.isFinite(measured) && measured >= 0) finalBytes = measured;
  } catch { /* sem out.log medido, a vivacidade degrada honestamente para n/d */ }
  return recordObservation({
    job_id: ev.job_id, agent: ev.agent || meta.agent, goal: ev.goal || meta.goal,
    prompt_chars: prompt.length, duration_s: duration, bytes_finais: finalBytes, exit_code: ev.exit_code,
    desfecho: ev.desfecho, ts: ev.ts,
  }, options);
}

module.exports = {
  VERSION, MIN_OBSERVATIONS, JANELA, etaIndexPath, contextBucket, indexKey,
  readIndex, recordObservation, lookup, observeTerminal, _nearestRank: nearestRank,
};
