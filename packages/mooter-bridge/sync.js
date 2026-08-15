#!/usr/bin/env node
'use strict';

// `npm run sync:check` só estabiliza (código 0 sem diff espúrio) com a frota
// parada: o SYNC.md gerado inclui estado lido ao vivo do ledger, e um job a
// correr entre duas chamadas muda esse conteúdo por razões alheias ao HEAD.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { isTerminal } = require('./terminal.js');
const {
  PORQUE_DEFAULT, PORQUE_DECLARADO, actorDoEvento, porqueDoEvento,
} = require('./actor.js');

const HUMAN_START = '<!-- HUMANO:INICIO -->';
const HUMAN_END = '<!-- HUMANO:FIM -->';
const DEFAULT_MAX_JOBS = 30;
const yes = (value, source) => ({ available: true, value, source });
const no = (because) => ({ available: false, because });

function explain(fact) {
  return fact && fact.available
    ? String(fact.value)
    : `n/d (porque ${(fact && fact.because) || 'a fonte não forneceu este valor'})`;
}

function readJson(file, label) {
  try {
    return {
      available: true,
      value: JSON.parse(fs.readFileSync(file, 'utf8')),
      source: file,
      observedAt: fs.statSync(file).mtime.toISOString(),
    };
  } catch (error) {
    return no(error && error.code === 'ENOENT'
      ? `${label} não existe em ${file}`
      : `${label} não pôde ser lido: ${(error && error.message) || error}`);
  }
}

function defaultRunGit(args, root) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, timeout: 10_000,
  });
  if (result.error) return { ok: false, because: result.error.message };
  if (result.status !== 0) {
    return { ok: false, because: String(result.stderr || result.stdout || '').trim() || `exit ${result.status}` };
  }
  return { ok: true, stdout: String(result.stdout || '').trim() };
}

function gitCall(run, args, root) {
  try {
    const result = run(args, root);
    if (typeof result === 'string') return { ok: true, stdout: result.trim() };
    if (result && result.ok) return { ok: true, stdout: String(result.stdout || '').trim() };
    return { ok: false, because: (result && result.because) || 'resultado git indisponível' };
  } catch (error) {
    return { ok: false, because: (error && error.message) || String(error) };
  }
}

function parseGitLog(text) {
  return String(text || '').split('\x1e').map((row) => row.trim()).filter(Boolean).map((row) => {
    const [hash, shortHash, date, ...subject] = row.split('\x1f');
    return { hash, shortHash, date, subject: subject.join('\x1f') };
  }).filter((commit) => commit.hash);
}

function readGit(root, run = defaultRunGit) {
  const head = gitCall(run, ['rev-parse', 'HEAD'], root);
  const branch = gitCall(run, ['rev-parse', '--abbrev-ref', 'HEAD'], root);
  const upstream = gitCall(run, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], root);
  const log = gitCall(run, ['log', '-n', '1000', '--format=%H%x1f%h%x1f%aI%x1f%s%x1e'], root);
  let divergence = no(`não foi possível determinar o upstream: ${upstream.because || 'branch sem upstream local'}`);
  if (upstream.ok) {
    const counts = gitCall(run, ['rev-list', '--left-right', '--count', `HEAD...${upstream.stdout}`], root);
    const match = counts.ok && counts.stdout.match(/^(\d+)\s+(\d+)$/);
    divergence = match
      ? yes({ ahead: Number(match[1]), behind: Number(match[2]), upstream: upstream.stdout }, 'git rev-list')
      : no(`git não devolveu ahead/behind: ${counts.because || counts.stdout || 'formato inesperado'}`);
  }
  return {
    head: head.ok ? yes(head.stdout, 'git rev-parse HEAD') : no(`git rev-parse HEAD falhou: ${head.because}`),
    branch: branch.ok ? yes(branch.stdout, 'git rev-parse --abbrev-ref HEAD') : no(`git não forneceu o branch: ${branch.because}`),
    divergence,
    commits: log.ok ? parseGitLog(log.stdout) : [],
    logBecause: log.ok ? null : `git log falhou: ${log.because}`,
  };
}

function readLedger(file) {
  try {
    const records = [];
    let invalidLines = 0;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { records.push(JSON.parse(line)); } catch { invalidLines += 1; }
    }
    return { available: true, records, invalidLines, observedAt: fs.statSync(file).mtime.toISOString() };
  } catch (error) {
    return { ...no(error && error.code === 'ENOENT' ? `ledger não existe em ${file}` : `ledger ilegível: ${error.message}`), records: [] };
  }
}

function terminalJobs(records, maxJobs = DEFAULT_MAX_JOBS) {
  const jobs = new Map();
  for (const record of records || []) {
    if (!isTerminal(record)) continue;
    const key = record.job_id || `sem-job-id:${record.ts || jobs.size}`;
    const previous = jobs.get(key);
    if (!previous || String(record.ts || '') >= String(previous.ts || '')) jobs.set(key, record);
  }
  return [...jobs.values()]
    .map((record) => {
      const actor = actorDoEvento(record);
      return {
        ...record,
        actor,
        actor_porque: porqueDoEvento(record),
      };
    })
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))
    .slice(0, maxJobs);
}

function extractHumanBlock(current) {
  const text = String(current || '');
  const start = text.indexOf(HUMAN_START);
  const end = text.indexOf(HUMAN_END);
  const duplicateStart = start >= 0 && text.indexOf(HUMAN_START, start + HUMAN_START.length) >= 0;
  const duplicateEnd = end >= 0 && text.indexOf(HUMAN_END, end + HUMAN_END.length) >= 0;
  if (start < 0 && end < 0) {
    if (!text) return `${HUMAN_START}\n## Decisões, bloqueios e próximo passo\n\n- n/d (porque a zona humana ainda não foi preenchida)\n${HUMAN_END}`;
    return `${HUMAN_START}\n${text}${text.endsWith('\n') ? '' : '\n'}${HUMAN_END}`;
  }
  if (start < 0 || end < start || duplicateStart || duplicateEnd) {
    throw new Error('marcadores HUMANO inválidos ou duplicados; SYNC.md não foi alterado');
  }
  return text.slice(start, end + HUMAN_END.length);
}

function compareVersions(left, right) {
  const a = String(left).replace(/^v/i, '').split('.').map((part) => Number(part) || 0);
  const b = String(right).replace(/^v/i, '').split('.').map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return String(left).localeCompare(String(right));
}

function findVersionCommit(version, commits) {
  const parts = String(version).replace(/^v/i, '').split('.').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(^|[^0-9])v?${parts.join('\\.')}${parts.length === 2 ? '(?:\\.0)?' : ''}([^0-9]|$)`, 'i');
  return (commits || []).find((commit) => pattern.test(commit.subject || '')) || null;
}

const cell = (value) => String(value).replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');

function renderDeliveries(source, git) {
  if (!source.available) return `- n/d (porque ${source.because})`;
  const entries = Object.entries(source.value || {}).sort(([a], [b]) => compareVersions(a, b));
  if (!entries.length) return '- n/d (porque entregas-por-versao.json não contém versões)';
  const rows = ['| Versão | Entrega medida | Commit que a trouxe |', '|---|---|---|'];
  for (const [version, delivered] of entries) {
    const items = Array.isArray(delivered) && delivered.length
      ? delivered.join(', ')
      : 'n/d (porque a versão não tem entregas descritas na fonte)';
    const commit = findVersionCommit(version, git.commits);
    const commitText = commit
      ? `${commit.shortHash || commit.hash} — ${commit.subject}`
      : `n/d (porque nenhum commit do branch menciona v${version}${git.logBecause ? `; ${git.logBecause}` : ''})`;
    rows.push(`| v${cell(version)} | ${cell(items)} | ${cell(commitText)} |`);
  }
  return rows.join('\n');
}

function measured(job, field) {
  const value = job && job[field];
  return value === null || typeof value === 'undefined' || value === ''
    ? `n/d (porque o ledger do job não contém ${field})`
    : `${value} (fonte: ledger.${field})`;
}

function renderActorPorque(job) {
  const porque = job && job.actor_porque;
  if (porque === PORQUE_DEFAULT) return `DEFAULT (${PORQUE_DEFAULT})`;
  if (porque === PORQUE_DECLARADO) return `DECLARADO (${PORQUE_DECLARADO})`;
  return porque == null
    ? 'n/d (porque o evento não contém actor_porque; nunca inferido)'
    : `n/d (actor_porque desconhecido: ${porque})`;
}

function renderJobs(ledger, maxJobs) {
  if (!ledger.available) return `- n/d (porque ${ledger.because})`;
  const jobs = terminalJobs(ledger.records, maxJobs);
  if (!jobs.length) return '- n/d (porque o ledger não contém jobs terminais)';
  const groups = new Map();
  for (const job of jobs) {
    const wave = job.wave || 'n/d (porque o ledger do job não contém wave)';
    if (!groups.has(wave)) groups.set(wave, []);
    groups.get(wave).push(job);
  }
  const lines = [];
  for (const [wave, waveJobs] of groups) {
    lines.push(`### ${wave}`, '');
    for (const job of waveJobs) {
      lines.push(`- \`${job.job_id || 'n/d'}\` · agente=${job.agent || 'n/d (porque o ledger do job não contém agent)'} · actor=${cell(JSON.stringify(job.actor))} · actor_porque=${cell(renderActorPorque(job))} · duração=${measured(job, 'duration_s')} · desfecho=${job.desfecho || job.event || 'n/d (porque o ledger do job não contém desfecho)'} · custo=${measured(job, 'cost_usd')} USD`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/**
 * A linha "- HEAD: ..." muda em QUALQUER commit — incluindo o commit que grava
 * o próprio SYNC.md gerado, o que a torna estruturalmente incapaz de coincidir
 * consigo própria depois de comitada (o HEAD real avança para o commit que a
 * escreve, mas o texto ficou com o HEAD de antes). Mascará-la antes de comparar
 * deixa o --check detectar deriva real (entregas, ledger, zona humana) em vez de
 * falhar para sempre por causa deste paradoxo auto-referencial.
 */
function semHead(texto) {
  return String(texto || '').replace(/^- HEAD: .*$/m, '- HEAD: <mascarado>');
}

function newestObservedAt(values) {
  const dates = values.filter(Boolean).map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
  return dates.length
    ? yes(new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString(), 'fontes')
    : no('nenhuma fonte forneceu timestamp observável');
}

function renderSync({ manifest, deliveries, git, ledger, humanBlock, maxJobs = DEFAULT_MAX_JOBS }) {
  const version = manifest.available && manifest.value && manifest.value.version
    ? yes(manifest.value.version, 'manifest.json#version')
    : no(manifest.available ? 'manifest.json não contém version' : manifest.because);
  const divergence = git.divergence.available
    ? `${git.divergence.value.ahead} à frente / ${git.divergence.value.behind} atrás de ${git.divergence.value.upstream} (fonte: git rev-list)`
    : explain(git.divergence);
  const ledgerDate = ledger.available
    ? ledger.records.map((row) => row && row.ts).filter(Boolean).sort().at(-1)
    : null;
  const generatedAt = newestObservedAt([
    manifest.observedAt, deliveries.observedAt, ledger.observedAt, ledgerDate,
    git.commits[0] && git.commits[0].date,
  ]);
  return [
    '# SYNC — projecção verificável do estado Mooter', '',
    '> Este bloco é gerado por `packages/mooter-bridge/sync.js`. Edita apenas a zona humana delimitada no fim.', '',
    '## Cabeçalho', '',
    `- versão instalada: ${explain(version)}`,
    `- HEAD: ${explain(git.head)}`,
    `- branch: ${explain(git.branch)}`,
    `- remoto: ${divergence}`,
    `- gerado_em: ${explain(generatedAt)} (derivado do último facto observado; não do relógio da execução)`, '',
    '## Entregas', '', renderDeliveries(deliveries, git), '',
    `## Trabalho recente (até ${maxJobs} jobs terminais)`, '', renderJobs(ledger, maxJobs), '',
    '## Zona humana', '', humanBlock, '',
  ].join('\n');
}

function resolvePaths(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..', '..'));
  return {
    root,
    manifestPath: path.resolve(options.manifestPath || path.join(root, 'packages', 'mooter-bridge', 'manifest.json')),
    deliveriesPath: path.resolve(options.deliveriesPath || path.join(root, 'packages', 'mooter-bridge', 'entregas-por-versao.json')),
    ledgerPath: path.resolve(options.ledgerPath || process.env.MOOTER_LEDGER || path.join(os.homedir(), '.mooter', 'ledger.jsonl')),
    syncPath: path.resolve(options.syncPath || path.join(root, 'SYNC.md')),
  };
}

function projectSync(options = {}) {
  const paths = resolvePaths(options);
  const current = fs.existsSync(paths.syncPath) ? fs.readFileSync(paths.syncPath, 'utf8') : '';
  const content = renderSync({
    manifest: readJson(paths.manifestPath, 'manifest.json'),
    deliveries: readJson(paths.deliveriesPath, 'entregas-por-versao.json'),
    git: readGit(paths.root, options.runGit || defaultRunGit),
    ledger: readLedger(paths.ledgerPath),
    humanBlock: extractHumanBlock(current),
    maxJobs: options.maxJobs || DEFAULT_MAX_JOBS,
  });
  // `changed` decide se ESCREVE: o HEAD real tem de ficar sempre fresco no
  // ficheiro gerado, por isso compara o conteúdo inteiro sem máscara.
  // `changedSemHead` decide o --check: ignora só a linha do HEAD, porque essa
  // linha nunca pode coincidir depois de comitada (ver semHead acima) — sem a
  // máscara, --check saía 1 para sempre a partir do primeiro commit seguinte.
  const changed = current !== content;
  const changedSemHead = semHead(current) !== semHead(content);
  if (options.check) return { code: changedSemHead ? 1 : 0, changed: changedSemHead, wrote: false, content, ...paths };
  if (!changed) return { code: 0, changed: false, wrote: false, content, ...paths };
  const temporary = `${paths.syncPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, content, 'utf8');
    fs.renameSync(temporary, paths.syncPath);
  } finally {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort */ }
  }
  return { code: 0, changed: true, wrote: true, content, ...paths };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--root') options.root = argv[++index];
    else if (arg === '--manifest') options.manifestPath = argv[++index];
    else if (arg === '--deliveries') options.deliveriesPath = argv[++index];
    else if (arg === '--ledger') options.ledgerPath = argv[++index];
    else if (arg === '--sync') options.syncPath = argv[++index];
    else if (arg === '--max-jobs') options.maxJobs = Number(argv[++index]);
    else throw new Error(`argumento desconhecido: ${arg}`);
  }
  if (options.maxJobs && (!Number.isInteger(options.maxJobs) || options.maxJobs < 1)) {
    throw new Error('--max-jobs tem de ser um inteiro positivo');
  }
  return options;
}

function runCli(argv, io = process, dependencies = {}) {
  try {
    const options = { ...parseArgs(argv), ...dependencies };
    const result = projectSync(options);
    const message = options.check
      ? `SYNC.md ${result.changed ? 'desactualizado' : 'actualizado'}: ${result.syncPath}\n`
      : `SYNC.md ${result.wrote ? 'gerado' : 'já estava actualizado'}: ${result.syncPath}\n`;
    (options.check && result.changed ? io.stderr : io.stdout).write(message);
    return result.code;
  } catch (error) {
    io.stderr.write(`sync falhou: ${(error && error.message) || error}\n`);
    return 2;
  }
}

if (require.main === module) process.exitCode = runCli(process.argv.slice(2));
module.exports = { HUMAN_START, HUMAN_END, extractHumanBlock, findVersionCommit, parseGitLog, projectSync, readGit, readLedger, renderSync, runCli, semHead, terminalJobs };
