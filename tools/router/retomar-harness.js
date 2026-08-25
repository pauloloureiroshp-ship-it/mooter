#!/usr/bin/env node
'use strict';

// Deterministic, local-only measurement harness for Retomar layer 1.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const retomar = require('./retomar.js');

const DEFAULT_COUNT = 20;
const DEFAULT_MIN_BYTES = 32 * 1024;

function listTranscripts(root) {
  const files = [];
  const visit = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
    }
  };
  visit(root);
  return files;
}

// Sort by SHA-256(relative name), then take evenly spaced positions through the
// hash order. This is deterministic and avoids a cluster of today's sessions.
function deterministicSpread(files, count, root) {
  if (files.length < count) throw new Error(`só existem ${files.length} transcripts elegíveis para uma amostra de ${count}`);
  const ranked = files.map((file) => {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    return { file, relative, hash: retomar.sha256Name(relative) };
  }).sort((left, right) => left.hash.localeCompare(right.hash) || left.relative.localeCompare(right.relative));
  const selected = [];
  for (let index = 0; index < count; index += 1) {
    selected.push(ranked[Math.floor((index + 0.5) * ranked.length / count)]);
  }
  return selected;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1)];
}

function tsvCell(value) {
  return String(value == null ? '' : value).replace(/[\t\r\n]+/g, ' ').trim();
}

function gitIdentityFromFiles(cwd) {
  const dotGit = path.join(cwd, '.git');
  let gitDir = dotGit;
  try {
    const stat = fs.statSync(dotGit);
    if (stat.isFile()) {
      const match = /^gitdir:\s*(.+)$/im.exec(fs.readFileSync(dotGit, 'utf8'));
      if (!match) throw new Error('.git sem gitdir');
      gitDir = path.resolve(cwd, match[1].trim());
    }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const ref = /^ref:\s+refs\/heads\/(.+)$/.exec(head);
    return {
      branch: ref ? retomar.measured(ref[1], 'HEAD do worktree atual') : retomar.unavailable('HEAD destacado', path.join(gitDir, 'HEAD')),
      worktree: retomar.measured(cwd, '.git do worktree atual'),
    };
  } catch (error) {
    const because = `identidade do worktree atual n/d: ${String((error && error.message) || error)}`;
    return {
      branch: retomar.unavailable(because, dotGit),
      worktree: retomar.unavailable(because, dotGit),
    };
  }
}

function historicalGitFacts(cwd) {
  const identity = gitIdentityFromFiles(cwd);
  const because = 'modo histórico: o estado Git atual não é projetado para a sessão passada';
  return {
    git_unpushed_commits: retomar.unavailable(because, 'harness histórico'),
    git_uncommitted_files: retomar.unavailable(because, 'harness histórico'),
    git_branch: identity.branch,
    git_worktree: identity.worktree,
  };
}

function runHarness(options = {}) {
  const root = path.resolve(options.root || path.join(os.homedir(), '.claude', 'projects'));
  const cwd = path.resolve(options.cwd || path.resolve(__dirname, '..', '..'));
  const output = path.resolve(options.output || path.join(cwd, '_handoff', 'retomar-camada1-rotulacao.tsv'));
  const count = Number(options.count || DEFAULT_COUNT);
  const minBytes = Number(options.minBytes || DEFAULT_MIN_BYTES);
  const all = listTranscripts(root);
  // A Claude session lives directly under one project directory. Nested JSONL
  // files are subagents/workflows, not independent past sessions for Resume.
  const sessions = all.filter((file) => path.relative(root, file).split(path.sep).length === 2);
  const eligible = sessions.filter((file) => fs.statSync(file).size >= minBytes);
  const selected = deterministicSpread(eligible, count, root);
  const sharedDiagnostics = [];
  const gitFacts = historicalGitFacts(cwd);
  const pendingChips = retomar.unavailable('modo histórico: não existe snapshot de chips por sessão', 'harness histórico');
  const sessionRows = [];
  const labelRows = [];
  let failures = 0;

  for (const selectedSession of selected) {
    const started = process.hrtime.bigint();
    try {
      const diagnostics = [];
      const report = retomar.reportForTranscript(selectedSession.file, {
        cwd,
        gitFacts,
        pendingChips,
        diagnostics,
      });
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      sessionRows.push({
        session_id: report.meta.session_id || path.basename(selectedSession.file, '.jsonl'),
        transcript: selectedSession.relative,
        hash: selectedSession.hash,
        suggestions: report.suggestions.length,
        nd_facts: retomar.countNdFacts(report.facts),
        duration_ms: Number(elapsedMs.toFixed(3)),
        diagnostics: diagnostics.length,
      });
      report.suggestions.forEach((suggestion, index) => {
        labelRows.push([
          report.meta.session_id || path.basename(selectedSession.file, '.jsonl'),
          selectedSession.relative,
          index + 1,
          suggestion.rule,
          suggestion.text,
          '',
          '',
        ]);
      });
    } catch (error) {
      failures += 1;
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      sessionRows.push({
        session_id: path.basename(selectedSession.file, '.jsonl'),
        transcript: selectedSession.relative,
        hash: selectedSession.hash,
        suggestions: 0,
        nd_facts: null,
        duration_ms: Number(elapsedMs.toFixed(3)),
        error: String((error && error.message) || error),
      });
    }
  }

  const header = ['session_id', 'transcript', 'ordem', 'regra', 'sugestao', 'rotulo(util|inutil|errada)', 'nota'];
  const tsv = [header, ...labelRows].map((row) => row.map(tsvCell).join('\t')).join('\n') + '\n';
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, tsv, 'utf8');

  const suggestionCounts = sessionRows.map((row) => row.suggestions);
  const durations = sessionRows.map((row) => row.duration_ms);
  const summary = {
    layer: 1,
    model_calls: 0,
    transcript_root: root,
    jsonl_found_total: all.length,
    transcripts_found: sessions.length,
    transcripts_eligible: eligible.length,
    selection: 'sha256(relative_name), 20 pontos igualmente espaçados na ordem do hash',
    sessions_requested: count,
    sessions_processed: sessionRows.length,
    sessions_failed: failures,
    suggestions_total: suggestionCounts.reduce((sum, value) => sum + value, 0),
    suggestions_per_session_median: median(suggestionCounts),
    suggestions_per_session_min: Math.min(...suggestionCounts),
    nd_facts_total: sessionRows.reduce((sum, row) => sum + (row.nd_facts || 0), 0),
    duration_ms_median: Number(median(durations).toFixed(3)),
    duration_ms_p95: Number(percentile(durations, 0.95).toFixed(3)),
    duration_ms_max: Number(Math.max(...durations).toFixed(3)),
    output,
    shared_diagnostics: sharedDiagnostics,
    sessions: sessionRows,
  };
  return summary;
}

function main() {
  const args = process.argv.slice(2);
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  try {
    const summary = runHarness({
      root: valueAfter('--root'),
      cwd: valueAfter('--cwd'),
      output: valueAfter('--out'),
      count: valueAfter('--count'),
      minBytes: valueAfter('--min-bytes'),
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.sessions_failed > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`[retomar-harness] ${String((error && error.message) || error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { deterministicSpread, listTranscripts, median, runHarness };

if (require.main === module) main();
