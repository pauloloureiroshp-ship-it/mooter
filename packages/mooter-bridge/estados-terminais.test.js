'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-terminal-'));
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_REPO = __dirname;

const { TERMINAL_STATES, isTerminal } = require('./terminal.js');
const fleet = require('./fleet.js');
const seamless = require('./seamless.js');

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

test('há uma única definição canónica de terminalidade', () => {
  assert.deepStrictEqual(TERMINAL_STATES, [
    'done', 'failed', 'nao_verificado', 'prep_timeout', 'prep_failed_fallback',
  ]);

  const duplicates = [];
  for (const file of fs.readdirSync(__dirname)) {
    if (!file.endsWith('.js') || file.endsWith('.test.js') || file === 'terminal.js') continue;
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    if (/\b(?:TERMINAL\w*|EVENTOS_TERMINAIS)\s*=\s*new Set/.test(source)) duplicates.push(file);
  }
  assert.deepStrictEqual(duplicates, [], 'voltou a aparecer uma lista terminal paralela');
});

test('exit_code não-nulo vence um state running sem matar um job realmente vivo', () => {
  const stopped = { state: 'running', exit_code: 'agent-awaiting-approval' };
  const live = { state: 'running', exit_code: null };
  assert.strictEqual(isTerminal(stopped), true);
  assert.strictEqual(fleet.isLive(stopped), false);
  assert.strictEqual(isTerminal(live), false);
  assert.strictEqual(fleet.isLive(live), true);

  const waves = fleet.groupByWave([
    { ...stopped, wave: 'terminal-unico' },
    { ...live, wave: 'terminal-unico' },
  ]);
  assert.strictEqual(waves[0].live, 1);
});

test('nao_verificado não conta em live nem ocupa a worktree', () => {
  const worktree = path.join(HOME, 'repo');
  const events = [
    { job_id: 'job-stopped', wave: 'terminal-unico', worktree, event: 'dispatched' },
    { job_id: 'job-stopped', wave: 'terminal-unico', worktree, event: 'started' },
    { job_id: 'job-stopped', wave: 'terminal-unico', worktree, event: 'nao_verificado', exit_code: 'agent-awaiting-approval' },
    { job_id: 'job-live', wave: 'terminal-unico', worktree, event: 'started' },
  ];

  const jobs = fleet.foldJobs(events);
  assert.strictEqual(jobs.find((job) => job.job_id === 'job-stopped').state, 'nao_verificado');
  assert.strictEqual(jobs.filter(fleet.isLive).length, 1);
  assert.deepStrictEqual(fleet.activeJobsFromEvents(events, worktree), ['job-live']);
});

test('cancel reconcilia o ledger append-only e a releitura deixa o job fora de live', async () => {
  const jobId = 'job-awaiting-cancel';
  const worktree = path.join(HOME, 'repo-cancel');
  seamless.ledgerAppend({ job_id: jobId, wave: 'terminal-unico', agent: 'cc', worktree, event: 'dispatched' });
  seamless.ledgerAppend({ job_id: jobId, wave: 'terminal-unico', agent: 'cc', worktree, event: 'started' });
  seamless.ledgerAppend({
    job_id: jobId, wave: 'terminal-unico', agent: 'cc', worktree,
    event: 'nao_verificado', exit_code: 'agent-awaiting-approval',
  });

  const before = seamless.ledgerRead().length;
  const result = await seamless.toolCancel({ job_id: jobId });
  const after = seamless.ledgerRead();
  assert.strictEqual(result.reconciled, true);
  assert.ok(after.length > before, 'cancel não acrescentou a linha de fecho');
  assert.ok(after.some((event) => event.job_id === jobId && event.terminal_reconciled === true));

  const folded = fleet.foldJobs(after).find((job) => job.job_id === jobId);
  assert.ok(folded);
  assert.strictEqual(fleet.isLive(folded), false);
  assert.deepStrictEqual(fleet.activeJobsFromEvents(after, worktree), []);

  const stableCount = after.length;
  const second = await seamless.toolCancel({ job_id: jobId });
  assert.match(second.note, /idempotente/);
  assert.strictEqual(seamless.ledgerRead().length, stableCount);
});

test('sweep reconcilia nao_verificado antigo em vez de o ignorar', () => {
  const jobId = 'job-awaiting-sweep';
  const worktree = path.join(HOME, 'repo-sweep');
  seamless.ledgerAppend({ job_id: jobId, wave: 'terminal-unico', agent: 'cc', worktree, event: 'started' });
  seamless.ledgerAppend({
    job_id: jobId, wave: 'terminal-unico', agent: 'cc', worktree,
    event: 'nao_verificado', exit_code: 'agent-awaiting-approval',
  });

  assert.ok(seamless.sweepOrphans().includes(jobId));
  const events = seamless.ledgerRead().filter((event) => event.job_id === jobId);
  assert.ok(events.some((event) => event.terminal_reconciled === true));
  assert.deepStrictEqual(fleet.activeJobsFromEvents(events, worktree), []);
});
