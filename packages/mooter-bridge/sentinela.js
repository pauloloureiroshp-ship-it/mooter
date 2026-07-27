'use strict';

/**
 * A Sentinela escreve, não grita: nunca regista interrupções, notifica ou abre
 * qualquer interface. O Conselho é o único responsável pelo aviso diário.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const board = require('./board.js');

function nowIso(opts) {
  const value = opts && opts.agora;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).toISOString();
  return new Date().toISOString();
}

function paths(opts) {
  const root = (opts && opts.sentinelaDir)
    || path.join((opts && opts.mooterHome) || process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter'), 'sentinela');
  return { root, state: path.join(root, 'estado.json') };
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundHours(start, end) {
  const startMs = Date.parse(start || '');
  const endMs = Date.parse(end || '');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.round(((endMs - startMs) / 3_600_000) * 1000) / 1000;
}

async function readState(file) {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function appendLine(root, record) {
  await fs.promises.mkdir(root, { recursive: true });
  const file = path.join(root, String(record.ts).slice(0, 10) + '.jsonl');
  await fs.promises.appendFile(file, JSON.stringify(record) + '\n', 'utf8');
  return file;
}

function makeSnapshot(card, previous, ts) {
  const previousMetrics = previous && previous.metricas && typeof previous.metricas === 'object'
    ? previous.metricas : {};
  const currentMetrics = card && card.metricas && typeof card.metricas === 'object'
    ? card.metricas : {};
  const metrics = {};
  const entered = [];
  const recovered = [];
  const deltas = {};

  for (const [name, current] of Object.entries(currentMetrics)) {
    if (!current || typeof current !== 'object') continue;
    const old = previousMetrics[name] || null;
    const oldOpenSince = old && old.fora_desde ? old.fora_desde : null;
    const isOutside = current.estado === 'fora';
    const isInside = current.estado === 'dentro';
    let outsideSince = oldOpenSince;

    if (isOutside && !oldOpenSince) {
      outsideSince = ts;
      entered.push({
        metrica: name, transicao: 'entrou_fora', fora_desde: outsideSince, horas_fora: 0,
      });
    } else if (isInside && oldOpenSince) {
      recovered.push({
        metrica: name, transicao: 'recuperou', fora_desde: oldOpenSince,
        horas_fora: roundHours(oldOpenSince, ts),
      });
      outsideSince = null;
    }

    const currentValue = finiteNumber(current.valor);
    const previousValue = finiteNumber(old && old.valor);
    deltas[name] = currentValue == null || previousValue == null
      ? null : currentValue - previousValue;
    metrics[name] = {
      estado: current.estado || 'n/d', valor: currentValue, fora_desde: outsideSince,
      horas_fora: outsideSince ? roundHours(outsideSince, ts) : 0,
    };
  }

  return {
    state: { atualizado_em: ts, metricas: metrics },
    record: { ts, metricas_fora: entered, metricas_recuperadas: recovered, delta_por_metrica: deltas },
  };
}

async function writeError(root, ts, error) {
  const record = {
    ts, erro: 'scorecard_falhou',
    porque: String((error && error.message) || error || 'erro desconhecido'),
  };
  try {
    await appendLine(root, record);
  } catch (writeErrorValue) {
    record.erro = 'sentinela_persistencia_falhou';
    record.porque += '; não consegui escrever o erro: '
      + String((writeErrorValue && writeErrorValue.message) || writeErrorValue);
  }
  return record;
}

async function correrSentinela(opts) {
  const options = opts || {};
  const files = paths(options);
  let ts;
  try {
    ts = nowIso(options);
    const boardModule = options.boardModule || board;
    const scorecardOptions = {
      ...(options.scorecardOpts || {}),
      agora: options.agora,
      mooterHome: options.mooterHome,
      persist: false,
    };
    const card = await boardModule.scorecardAsync(scorecardOptions);
    const previous = await readState(files.state);
    const snapshot = makeSnapshot(card, previous, ts);

    await appendLine(files.root, snapshot.record);
    await fs.promises.writeFile(files.state, JSON.stringify(snapshot.state, null, 2), 'utf8');
    return snapshot.record;
  } catch (error) {
    return writeError(files.root, ts || new Date().toISOString(), error);
  }
}

function transitionItems(record) {
  const transitions = [];
  const add = (item, fallback) => {
    if (typeof item === 'string') {
      transitions.push({ metrica: item, transicao: fallback });
      return;
    }
    if (!item || typeof item !== 'object' || !item.metrica) return;
    transitions.push({ ...item, transicao: item.transicao || fallback });
  };
  for (const item of Array.isArray(record.metricas_fora) ? record.metricas_fora : []) add(item, 'entrou_fora');
  for (const item of Array.isArray(record.metricas_recuperadas) ? record.metricas_recuperadas : []) add(item, 'recuperou');
  return transitions;
}

function readRecords(root) {
  let names;
  try {
    names = fs.readdirSync(root).filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort();
  } catch {
    return [];
  }
  const records = [];
  for (const name of names) {
    let content;
    try { content = fs.readFileSync(path.join(root, name), 'utf8'); } catch { continue; }
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (record && Number.isFinite(Date.parse(record.ts || ''))) records.push(record);
      } catch { /* Uma linha inválida não apaga as medições válidas do dia. */ }
    }
  }
  return records.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

function resumoDaSentinela(dias, opts) {
  const options = opts || {};
  const totalDays = Number.isInteger(dias) && dias > 0 ? dias : 1;
  const endMs = Date.parse(nowIso(options));
  const startMs = endMs - totalDays * 24 * 3_600_000;
  const records = readRecords(paths(options).root);
  const open = new Map();
  const metricSummaries = {};
  const transitions = [];

  const metric = (name) => {
    if (!metricSummaries[name]) metricSummaries[name] = { horas_fora: 0, transicoes: [] };
    return metricSummaries[name];
  };
  const addInterval = (name, from, to) => {
    const clippedStart = Math.max(Date.parse(from || ''), startMs);
    const clippedEnd = Math.min(Date.parse(to || ''), endMs);
    if (!Number.isFinite(clippedStart) || !Number.isFinite(clippedEnd) || clippedEnd <= clippedStart) return;
    metric(name).horas_fora += (clippedEnd - clippedStart) / 3_600_000;
  };

  for (const record of records) {
    const at = Date.parse(record.ts);
    if (at > endMs) break;
    for (const item of transitionItems(record)) {
      const name = item.metrica;
      if (item.transicao === 'entrou_fora') {
        if (!open.has(name)) open.set(name, item.fora_desde || record.ts);
      } else if (item.transicao === 'recuperou') {
        const from = open.get(name) || item.fora_desde;
        if (from) addInterval(name, from, record.ts);
        open.delete(name);
      } else {
        continue;
      }
      if (at >= startMs) {
        const event = { ...item, ts: record.ts };
        transitions.push(event);
        metric(name).transicoes.push(event);
      }
    }
  }

  for (const [name, from] of open) addInterval(name, from, new Date(endMs).toISOString());
  const hoursByMetric = {};
  for (const [name, summary] of Object.entries(metricSummaries)) {
    summary.horas_fora = Math.round(summary.horas_fora * 1000) / 1000;
    hoursByMetric[name] = summary.horas_fora;
  }

  return {
    dias: totalDays,
    desde: new Date(startMs).toISOString(),
    ate: new Date(endMs).toISOString(),
    metricas: metricSummaries,
    horas_fora_por_metrica: hoursByMetric,
    transicoes: transitions,
  };
}

module.exports = { correrSentinela, resumoDaSentinela, _paths: paths, _makeSnapshot: makeSnapshot };
