#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(REPO, 'plugin', 'mooter', 'skills', 'cockpit', 'cockpit.html');
const OUTPUT = path.join(REPO, 'dist', 'cockpit-snapshot.html');
const VIEWS = ['jobs', 'board', 'recibo', 'pastas'];
const SNAPSHOT_BEGIN = '<!-- MOOTER_SNAPSHOT:BEGIN -->';
const SNAPSHOT_END = '<!-- MOOTER_SNAPSHOT:END -->';
const REPORTED_VIEWS = [...VIEWS, 'setup', 'preview'];
const SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;

function literalError(error) {
  return String((error && error.message) || error || 'erro sem mensagem');
}

function scriptSafeJson(value) {
  return JSON.stringify(value)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\u0021--');
}

function stripSnapshotBlocks(html) {
  let clean = String(html);
  while (clean.includes(SNAPSHOT_BEGIN)) {
    const start = clean.indexOf(SNAPSHOT_BEGIN);
    const end = clean.indexOf(SNAPSHOT_END, start);
    if (end < 0) throw new Error('bloco de snapshot abre mas não fecha');
    clean = clean.slice(0, start) + clean.slice(end + SNAPSHOT_END.length);
  }
  return clean;
}

function injectSnapshot(html, snapshot) {
  const clean = stripSnapshotBlocks(html);
  const scriptAt = clean.search(/<script(?:\s|>)/i);
  if (scriptAt < 0) throw new Error('cockpit.html não tem script principal');
  const block = SNAPSHOT_BEGIN + '\n'
    + '<script>window.__MOOTER_SNAPSHOT__ = ' + scriptSafeJson(snapshot) + ';</script>\n'
    + SNAPSHOT_END + '\n';
  return clean.slice(0, scriptAt) + block + clean.slice(scriptAt);
}

function jobIds(view) {
  const jobs = view && Array.isArray(view.jobs) ? view.jobs : [];
  return jobs.map((job) => {
    if (typeof job === 'string') return job;
    return job && (job.job_id || job.id);
  }).filter(Boolean);
}

function totalIsEmpty(total) {
  if (total == null) return true;
  if (typeof total !== 'object' || Array.isArray(total)) return total == null;
  if (!Object.prototype.hasOwnProperty.call(total, 'valor')) return false;
  if (total.valor == null) return true;
  return total.valor === 0 && Number(total.jobs_medidos) === 0;
}

function boardMetrics(view) {
  const scorecard = view && view.scorecard;
  const metrics = (scorecard && scorecard.metricas) || (view && view.metricas);
  return metrics && typeof metrics === 'object' && !Array.isArray(metrics) ? metrics : {};
}

function metricHasValue(metric) {
  if (metric == null) return false;
  if (typeof metric !== 'object' || Array.isArray(metric)) return true;
  return Object.prototype.hasOwnProperty.call(metric, 'valor') && metric.valor != null;
}

function folderCount(view) {
  return view && Array.isArray(view.pastas) ? view.pastas.length : 0;
}

function isInsideRepo(repoPath, ownRepo) {
  if (typeof repoPath !== 'string' || !repoPath.trim()) return false;
  const relative = path.relative(path.resolve(ownRepo), path.resolve(repoPath));
  return relative === '' || (!relative.startsWith('..' + path.sep)
    && relative !== '..' && !path.isAbsolute(relative));
}

function emptyViews(snapshot, ownRepo = REPO) {
  const totals = snapshot.jobs && snapshot.jobs.totais;
  const totalValues = totals && typeof totals === 'object' ? Object.values(totals) : [];
  const metrics = Object.values(boardMetrics(snapshot.board));
  const findings = [];

  if (jobIds(snapshot.jobs).length === 0 && totalValues.every(totalIsEmpty)) {
    findings.push({
      view: 'jobs',
      reason: 'nenhum id de job e totais sem medição (null ou zero sem jobs medidos)',
    });
  }
  if (metrics.filter(metricHasValue).length === 0) {
    findings.push({ view: 'board', reason: 'scorecard sem métricas com valor não-null' });
  }
  if (!isInsideRepo(snapshot.pastas && snapshot.pastas.repo, ownRepo)) {
    findings.push({
      view: 'pastas',
      reason: 'repo fora do directório do gerador: '
        + String((snapshot.pastas && snapshot.pastas.repo) || 'n/d'),
    });
  }
  if (!snapshot.setup || snapshot.setup.contexto == null) {
    findings.push({ view: 'setup', reason: 'contexto null' });
  }
  return findings;
}

function markEmptyView(snapshot, finding) {
  const current = snapshot[finding.view];
  snapshot[finding.view] = current && typeof current === 'object' && !Array.isArray(current)
    ? { ...current, vazia: true, motivo: finding.reason }
    : { valor: current == null ? null : current, vazia: true, motivo: finding.reason };
}

function emptyPreview(preview) {
  if (!preview || typeof preview !== 'object' || !Array.isArray(preview.candidatas)
      || preview.candidatas.length > 0) return null;
  return {
    view: 'preview',
    reason: 'nenhuma candidata encontrada'
      + (preview.nota ? ': ' + String(preview.nota) : ''),
  };
}

function viewReport(name, value) {
  const bytes = Buffer.byteLength(JSON.stringify(value == null ? null : value), 'utf8');
  let signal;
  if (name === 'jobs') signal = jobIds(value).length + ' ids';
  else if (name === 'board') {
    signal = Object.values(boardMetrics(value)).filter(metricHasValue).length + ' métricas com valor';
  } else if (name === 'pastas') signal = folderCount(value) + ' pastas';
  else if (name === 'setup') signal = 'contexto=' + (value && value.contexto != null ? 'sim' : 'não');
  else if (name === 'preview') signal = ((value && Array.isArray(value.candidatas)) ? value.candidatas.length : 0) + ' candidatas';
  else signal = Object.keys(value && typeof value === 'object' ? value : {}).length + ' campos';
  return {
    name,
    bytes,
    signal,
    empty: !!(value && value.vazia),
    reason: value && value.motivo,
  };
}

function defaultReaders() {
  const fleet = require(path.join(REPO, 'packages', 'mooter-bridge', 'fleet.js'));
  const seamless = require(path.join(REPO, 'packages', 'mooter-bridge', 'seamless.js'));
  const tools6 = require(path.join(REPO, 'packages', 'mooter-bridge', 'tools6.js'));
  const base = require(path.join(REPO, 'packages', 'mooter-bridge', 'server.js'));
  const board = require(path.join(REPO, 'packages', 'mooter-bridge', 'board.js'));
  const preview = require(path.join(REPO, 'packages', 'mooter-bridge', 'preview.js'));
  const tools = tools6.build(seamless, fleet, base);
  const fleetTool = tools.find((tool) => tool.name === 'mooter_fleet');
  const setupTool = tools.find((tool) => tool.name === 'mooter_setup');
  if (!fleetTool || !setupTool) throw new Error('mooter_fleet/mooter_setup não estão registadas');
  return {
    // A vista board calcula a fotografia mas não a volta a persistir: o gerador
    // é leitor. O handler normal persiste scorecard.json para o cockpit vivo.
    readView: (view) => view === 'board'
      ? fleet.toolFleet({ view }, { boardScorecard:() => board.scorecardAsync({ persist:false }) })
      : fleetTool.handler({ view }),
    readSetup: () => setupTool.handler({}),
    readPreview: () => preview.descobrir({ retrato: true }),
    readPreviewCompact: () => preview.descobrir({
      retrato: true,
      retrato_opts: { largura: 1000, altura: 640 },
    }),
  };
}

async function generateSnapshot(options = {}) {
  const sourcePath = options.sourcePath || SOURCE;
  const outputPath = options.outputPath || OUTPUT;
  const now = options.now instanceof Date
    ? options.now
    : (typeof options.now === 'function' ? options.now() : new Date());
  const iso = now.toISOString();
  const readers = options.readView && options.readSetup && options.readPreview ? options : defaultReaders();
  const snapshot = { __tirado_em: iso };
  let successes = 0;

  for (const view of VIEWS) {
    try {
      snapshot[view] = await readers.readView(view);
      successes++;
    } catch (error) {
      snapshot[view] = { erro: literalError(error) };
    }
  }
  try {
    snapshot.setup = await readers.readSetup();
  } catch (error) {
    snapshot.setup = { erro: literalError(error) };
  }
  try {
    snapshot.preview = await readers.readPreview();
  } catch (error) {
    snapshot.preview = { erro: literalError(error) };
  }

  const resolvedHome = options.homeDir || os.homedir();
  const mooterHome = options.mooterHome || process.env.MOOTER_HOME
    || path.join(resolvedHome, '.mooter');
  const findings = emptyViews(snapshot, options.repoPath || REPO);
  if (findings.length >= 2) {
    throw new Error('vistas vazias: ' + findings.map((item) => item.view).join(', ')
      + ' · HOME resolvido: ' + resolvedHome
      + ' · .mooter tentado: ' + mooterHome
      + ' · snapshot NÃO escrito — uma fotografia vazia lê-se como facto');
  }
  if (findings.length === 1) markEmptyView(snapshot, findings[0]);
  const previewFinding = emptyPreview(snapshot.preview);
  if (previewFinding) {
    markEmptyView(snapshot, previewFinding);
    findings.push(previewFinding);
  }

  const source = fs.readFileSync(sourcePath, 'utf8');
  let rendered = injectSnapshot(source, snapshot);
  let bytes = Buffer.byteLength(rendered, 'utf8');
  if (bytes > SNAPSHOT_MAX_BYTES && typeof readers.readPreviewCompact === 'function') {
    snapshot.preview = await readers.readPreviewCompact();
    rendered = injectSnapshot(source, snapshot);
    bytes = Buffer.byteLength(rendered, 'utf8');
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rendered, 'utf8');
  const reports = REPORTED_VIEWS.map((name) => viewReport(name, snapshot[name]));
  const logger = options.logger || console.log;
  for (const report of reports) {
    logger('cockpit snapshot · ' + report.name + ': ' + report.bytes + ' bytes · '
      + report.signal + (report.empty ? ' · VAZIA: ' + report.reason : ''));
  }
  logger('cockpit snapshot escrito: ' + bytes + ' bytes · ' + iso + ' · ' + outputPath);
  return {
    outputPath, bytes, instant: iso, successes, total: VIEWS.length, snapshot,
    reports, emptyViews: findings,
  };
}

async function runCli(options = {}) {
  try {
    await generateSnapshot(options);
    return 0;
  } catch (error) {
    (options.errorLogger || console.error)('cockpit snapshot failed: ' + literalError(error));
    return 1;
  }
}

if (require.main === module) {
  runCli().then((code) => { process.exitCode = code; });
}

module.exports = {
  generateSnapshot,
  injectSnapshot,
  stripSnapshotBlocks,
  scriptSafeJson,
  emptyViews,
  emptyPreview,
  viewReport,
  runCli,
  SNAPSHOT_BEGIN,
  SNAPSHOT_END,
  SOURCE,
  OUTPUT,
  REPO,
  SNAPSHOT_MAX_BYTES,
};
