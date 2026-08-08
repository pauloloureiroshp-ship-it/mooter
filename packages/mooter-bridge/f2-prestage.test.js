'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-f2-prestage-'));
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';

const seamless = require('./seamless.js');
const fleet = require('./fleet.js');
const recibo = require('./recibo.js');

const SEAMLESS_SOURCE = fs.readFileSync(path.join(__dirname, 'seamless.js'), 'utf8');
const START = Date.parse('2026-08-08T12:00:00.000Z');

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

function event(jobId, state, extra, seconds) {
  return Object.assign({
    ts: new Date(START + Number(seconds || 0) * 1000).toISOString(),
    job_id: jobId,
    wave: 'f2-prestage',
    cargo: 'MRO',
    cargo_porque: 'fixture F2',
    local: false,
    agent: 'cc',
    worktree: __dirname,
    event: state,
  }, extra || {});
}

function terminalEvents(jobId) {
  return [
    event(jobId, 'dispatched', { tier_pedido: 'T0' }, 0),
    event(jobId, 'started', {}, 1),
    event(jobId, 'done', {
      exit_code: 0,
      duration_s: 2,
      cost_usd: 0.01,
      tier_pedido: 'T0',
      tier_motor: 'T1',
    }, 2),
  ];
}

function escalatedEvent(jobId) {
  return event(jobId, 'escalated', {
    source_event_id: 'oracle-event-1',
    from_tier: 'T1',
    to_tier: 'T2',
    reason: 'oráculo mecânico detectou regressão',
    mechanical_score: 0,
    child_job_id: jobId + '-retry',
  }, 3);
}

function referenceLastStateRecord(events) {
  const sideband = new Set([
    'cross_check', 'step', 'eta_observacao_recusada', 'collected', 'escalated',
  ]);
  for (let index = events.length - 1; index >= 0; index--) {
    if (!sideband.has(events[index].event)) return events[index];
  }
  return null;
}

/**
 * Exercita a função privada real sem alterar seamless.js: compila apenas o Set
 * NON_STATE_EVENTS e lastStateRecord, delimitados pelo início de lastStateEvent.
 */
function currentLastStateRecord() {
  const start = SEAMLESS_SOURCE.indexOf('const NON_STATE_EVENTS = new Set(');
  const end = SEAMLESS_SOURCE.indexOf('function lastStateEvent(events)', start);
  assert.ok(start >= 0 && end > start,
    'fixture partida: não localizou NON_STATE_EVENTS/lastStateRecord em seamless.js');
  const snippet = SEAMLESS_SOURCE.slice(start, end);
  return new Function(snippet + '\nreturn lastStateRecord;')(); // eslint-disable-line no-new-func
}

function controlPersistPostOracle(input, opts) {
  const reason = String(input.reason || '').trim();
  if (!reason) throw new Error('reason obrigatório');
  const record = {
    event: 'escalated',
    source_event_id: input.source_event_id,
    from_tier: input.from_tier,
    to_tier: seamless.tierDoMotor(input.child.agent, input.child.model),
    reason,
    mechanical_score: input.mechanical_score,
    child_job_id: input.child.job_id,
  };
  opts.append(record);
  return record;
}

function probeRuntimePersistence(input) {
  const persist = seamless._persistPostOracleEscalation;
  if (typeof persist !== 'function') return { supported: false, records: [] };
  const records = [];
  const returned = persist(input, { append: (record) => records.push(record) });
  return { supported: true, records, returned };
}

function escalationScenario() {
  return {
    source_event_id: 'oracle-event-1',
    from_tier: 'T1',
    reason: 'oráculo mecânico detectou regressão',
    mechanical_score: 0,
    child: {
      job_id: 'child-effective-tier',
      agent: 'cc',
      model: 'claude-sonnet-4-6',
      tier: 'T0',
    },
  };
}

test('VERMELHO + CONTROLO — lastStateRecord ignora escalated como sideband NÃO-STATE', () => {
  const events = [...terminalEvents('last-state'), escalatedEvent('last-state')];
  assert.equal(referenceLastStateRecord(events).event, 'done',
    'CONTROLO partido: a implementação-alvo não preservou done');

  const actual = currentLastStateRecord()(events);
  assert.equal(actual && actual.event, 'done',
    'F2 ausente: NON_STATE_EVENTS ainda não contém escalated; lastStateRecord substituiu done pelo sideband');
});

test('VERMELHO + CONTROLO — toolStatus mantém done depois do evento escalated', async () => {
  const jobId = 'tool-status';
  for (const item of terminalEvents(jobId)) seamless.ledgerAppend(item);

  const before = await seamless.toolStatus({ job_id: jobId });
  assert.equal(before.jobs[0].last, 'done',
    'CONTROLO partido: toolStatus não reconheceu o terminal antes do sideband');

  seamless.ledgerAppend(escalatedEvent(jobId));
  const persisted = seamless.ledgerRead().filter((item) => item.job_id === jobId);
  assert.equal(referenceLastStateRecord(persisted).event, 'done',
    'CONTROLO partido: a projecção-alvo não preservou done');

  const after = await seamless.toolStatus({ job_id: jobId });
  assert.equal(after.jobs[0].last, 'done',
    'F2 ausente: toolStatus tratou escalated como estado actual em vez de sideband');
});

test('CONTROLO/CONSUMIDOR — fleet.foldJobs já sobrevive a escalated sem perder done', () => {
  const base = terminalEvents('fleet');
  const control = fleet.foldJobs(base)[0];
  const withSideband = fleet.foldJobs([...base, escalatedEvent('fleet')])[0];
  assert.equal(control.state, 'done', 'CONTROLO partido: a fixture não fechou o job');
  assert.equal(withSideband.state, control.state,
    'F2 ausente: fleet.foldJobs deixou escalated substituir o estado terminal');
  assert.equal(withSideband.tier_motor, control.tier_motor,
    'F2 ausente: fleet.foldJobs deixou o sideband reescrever o tier efectivo do terminal');
});

test('CONTROLO/CONSUMIDOR — recibo já fecha a wave na presença de escalated', () => {
  const base = terminalEvents('recibo');
  const control = recibo.pulse(base, 'f2-prestage');
  const withSideband = recibo.pulse([...base, escalatedEvent('recibo')], 'f2-prestage');
  assert.ok(control, 'CONTROLO partido: a fixture não produziu recibo terminal');
  assert.deepEqual(withSideband, control,
    'F2 ausente: recibo mudou ou deixou de fechar quando apareceu o sideband escalated');
});

test('VERMELHO + CONTROLO — escalation_reason (ledger reason) é persistido e não vazio', () => {
  const scenario = escalationScenario();
  const controlRecords = [];
  controlPersistPostOracle(scenario, { append: (record) => controlRecords.push(record) });
  assert.equal(controlRecords[0].reason, scenario.reason,
    'CONTROLO partido: a implementação-alvo não persistiu reason');

  const runtime = probeRuntimePersistence(scenario);
  assert.equal(runtime.supported, true,
    'F2 ausente: não existe persistência pós-Oráculo do evento escalated com reason obrigatório');
  assert.equal(runtime.records.length, 1,
    'F2 ausente: a escalada pós-Oráculo não escreveu exactamente um evento no ledger');
  assert.equal(String(runtime.records[0].reason || '').trim(), scenario.reason,
    'F2 ausente: escalation_reason chegou vazio ou não foi persistido no campo ledger reason');
});

test('VERMELHO + CONTROLO — escalada pós-Oráculo grava o tier efectivo, não o pedido', () => {
  const scenario = escalationScenario();
  const controlRecords = [];
  controlPersistPostOracle(scenario, { append: (record) => controlRecords.push(record) });
  assert.equal(scenario.child.tier, 'T0', 'CONTROLO partido: tier pedido deixou de divergir');
  assert.equal(controlRecords[0].to_tier, 'T2',
    'CONTROLO partido: tierDoMotor não derivou o Sonnet efectivo como T2');

  const runtime = probeRuntimePersistence(scenario);
  assert.equal(runtime.supported, true,
    'F2 ausente: não existe persistência pós-Oráculo capaz de derivar o tier efectivo do child');
  assert.equal(runtime.records.length, 1,
    'F2 ausente: a escalada pós-Oráculo não escreveu exactamente um evento no ledger');
  assert.equal(runtime.records[0].to_tier, 'T2',
    'F2 ausente: to_tier registou o tier pedido do child em vez de tierDoMotor(agent, model)');
  assert.notEqual(runtime.records[0].to_tier, scenario.child.tier,
    'F2 ausente: tier efectivo e tier pedido foram colapsados no mesmo campo');
});
