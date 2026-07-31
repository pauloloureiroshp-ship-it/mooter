'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { fatiaLocal } = require('./fatia-local.js');

test('fatiaLocal: base cases', async (t) => {
  await t.test('empty ledger returns valor:null', () => {
    const result = fatiaLocal([], { escopo: 'test' });
    assert.strictEqual(result.valor, null);
    assert.strictEqual(result.jobs_total, 0);
    assert.strictEqual(result.jobs_local, 0);
  });

  await t.test('only non-concluded jobs returns valor:null', () => {
    const jobs = [
      { agent: 'moo', status: 'done', preparation: true },
      { agent: 'cloud', status: 'done', preparation: true },
    ];
    const result = fatiaLocal(jobs, { escopo: 'test' });
    assert.strictEqual(result.valor, null);
    assert.strictEqual(result.jobs_total, 0);
  });

  await t.test('concluded jobs without local agents returns 0', () => {
    const jobs = [
      { agent: 'cloud', status: 'done', preparation: false },
      { agent: 'cloud', status: 'failed', preparation: false },
    ];
    const result = fatiaLocal(jobs, { escopo: 'test' });
    assert.strictEqual(result.valor, 0);
    assert.strictEqual(result.jobs_total, 2);
    assert.strictEqual(result.jobs_local, 0);
  });

  await t.test('concluded jobs with local agents calculates percentage', () => {
    const jobs = [
      { agent: 'moo', status: 'done', preparation: false },
      { agent: 'moo', status: 'done', preparation: false },
      { agent: 'cloud', status: 'done', preparation: false },
      { agent: 'cloud', status: 'failed', preparation: false },
    ];
    const result = fatiaLocal(jobs, { escopo: 'test' });
    assert.strictEqual(result.valor, 50);
    assert.strictEqual(result.jobs_total, 4);
    assert.strictEqual(result.jobs_local, 2);
  });

  await t.test('filters out jobs with preparation:true', () => {
    const jobs = [
      { agent: 'moo', status: 'done', preparation: false },
      { agent: 'moo', status: 'done', preparation: true },
      { agent: 'cloud', status: 'done', preparation: false },
    ];
    const result = fatiaLocal(jobs, { escopo: 'test' });
    assert.strictEqual(result.valor, 50);
    assert.strictEqual(result.jobs_total, 2);
    assert.strictEqual(result.jobs_local, 1);
  });

  await t.test('supports cargo filter', () => {
    const jobs = [
      { agent: 'moo', status: 'done', preparation: false, cargo: 'MOO' },
      { agent: 'cloud', status: 'done', preparation: false, cargo: 'MOO' },
      { agent: 'moo', status: 'done', preparation: false, cargo: 'MFO' },
    ];
    const result = fatiaLocal(jobs, { escopo: 'test', cargo: 'MOO' });
    assert.strictEqual(result.valor, 50);
    assert.strictEqual(result.jobs_total, 2);
    assert.strictEqual(result.jobs_local, 1);
  });

  await t.test('supports fleet.js style jobs (state)', () => {
    const jobs = [
      { agent: 'moo', state: 'done' },
      { agent: 'moo', state: 'done' },
      { agent: 'cloud', state: 'done' },
      { agent: 'cloud', state: 'failed' },
    ];
    const result = fatiaLocal(jobs, { escopo: 'test' });
    assert.strictEqual(result.valor, 50);
    assert.strictEqual(result.jobs_total, 4);
    assert.strictEqual(result.jobs_local, 2);
  });

  await t.test('requires escopo parameter', () => {
    assert.throws(() => {
      fatiaLocal([], { cargo: 'MOO' });
    }, /escopo.*obrigatório/i);
  });
});

test('fatiaLocal: consistency across sources', async (t) => {
  // Simula ledger sintético com mix de agent moo/cloud, mix de status done/failed
  // Sem preparation para que a conversão fleet.js funcione correctamente
  const sharedLedger = [
    { agent: 'moo', status: 'done', preparation: false },
    { agent: 'moo', status: 'done', preparation: false },
    { agent: 'moo', status: 'failed', preparation: false },
    { agent: 'cloud', status: 'done', preparation: false },
    { agent: 'cloud', status: 'done', preparation: false },
    { agent: 'cloud', status: 'failed', preparation: false },
  ];

  const resultGlobal = fatiaLocal(sharedLedger, { escopo: 'global — todos os cargos' });

  // Simula board.js style: filtra concluídos (done/failed sem preparation) e depois calcula
  const boardConcluded = sharedLedger.filter((r) => (r.status === 'done' || r.status === 'failed') && !r.preparation);
  const boardLocal = boardConcluded.filter((r) => r.agent === 'moo').length;
  const boardExpected = boardConcluded.length ? Math.round(boardLocal / boardConcluded.length * 100 * 100) / 100 : null;

  await t.test('fatiaLocal matches manual board.js calculation', () => {
    assert.strictEqual(resultGlobal.valor, boardExpected);
    assert.strictEqual(resultGlobal.jobs_total, boardConcluded.length);
    assert.strictEqual(resultGlobal.jobs_local, boardLocal);
  });

  // Simula fleet.js style: converte para state field
  const fleetLedger = sharedLedger.map((r) => ({
    agent: r.agent,
    state: r.status === 'done' ? 'done' : r.status === 'failed' ? 'failed' : 'dispatched',
  }));

  const resultFleet = fatiaLocal(fleetLedger, { escopo: 'global — painel de frota' });

  await t.test('fatiaLocal works with fleet.js data (state field)', () => {
    assert.strictEqual(resultFleet.valor, resultGlobal.valor);
    assert.strictEqual(resultFleet.jobs_total, resultGlobal.jobs_total);
    assert.strictEqual(resultFleet.jobs_local, resultGlobal.jobs_local);
  });
});
