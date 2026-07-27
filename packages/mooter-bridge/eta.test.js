'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const eta = require('./eta.js');
const seamless = require('./seamless.js');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-eta-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'eta-index.json');
}

function observe(indexPath, jobId, duration, exitCode) {
  return eta.recordObservation({
    job_id: jobId,
    agent: 'codex',
    goal: 'implementa testes de código',
    prompt_chars: 2_000,
    duration_s: duration,
    exit_code: exitCode == null ? 0 : exitCode,
    ts: '2026-07-27T12:00:00.000Z',
  }, { indexPath });
}

function estimate(indexPath) {
  return eta.lookup({ agent: 'codex', category: 'codigo', bucket: '<4k' }, { indexPath });
}

test('1 — uma chave com n=4 devolve null e explica a amostra insuficiente', (t) => {
  const indexPath = fixture(t);
  for (let i = 1; i <= 4; i++) assert.equal(observe(indexPath, 'job-' + i, i).ok, true);
  const result = estimate(indexPath);
  assert.equal(result.valor, null);
  assert.match(result.porque, /4 observação|pelo menos 5/i);
});

test('2 — cancelled-by-user e orphaned-by-restart não entram nos percentis', (t) => {
  const indexPath = fixture(t);
  for (let i = 1; i <= 5; i++) observe(indexPath, 'done-' + i, i);
  observe(indexPath, 'cancelled', 900, 'cancelled-by-user');
  observe(indexPath, 'orphaned', 1_000, 'orphaned-by-restart');
  const result = estimate(indexPath);
  assert.equal(result.valor.n, 5);
  assert.equal(result.valor.p50, 3);
  assert.equal(result.valor.max, 5);
});

test('3 — timeout levanta max sem contaminar p50', (t) => {
  const indexPath = fixture(t);
  [10, 20, 30, 40, 50].forEach((duration, i) => observe(indexPath, 'done-' + i, duration));
  observe(indexPath, 'timeout', 999, 'timeout');
  const result = estimate(indexPath);
  assert.equal(result.valor.n, 5);
  assert.equal(result.valor.p50, 30);
  assert.equal(result.valor.max, 999);
});

test('4 — ler o índice abre só eta-index.json, nunca ledger.jsonl', (t) => {
  const indexPath = fixture(t);
  for (let i = 1; i <= 5; i++) observe(indexPath, 'done-' + i, i);
  const original = fs.readFileSync;
  const opened = [];
  fs.readFileSync = function watched(file, ...args) {
    opened.push(String(file));
    return original.call(this, file, ...args);
  };
  try {
    assert.equal(estimate(indexPath).valor.n, 5);
  } finally {
    fs.readFileSync = original;
  }
  assert.deepEqual(opened, [indexPath]);
  assert.equal(opened.some((file) => /ledger\.jsonl$/i.test(file)), false);
});

/**
 * O índice existe para o caminho de leitura tocar num ficheiro pequeno. Guardar
 * as amostras cruas sem tecto reintroduziria, por outra porta, o problema que
 * ele veio resolver — por isso a janela é um invariante, não uma optimização.
 */
test('6 — a janela deslizante impede o índice de crescer sem fim', (t) => {
  const indexPath = fixture(t);
  const total = eta.JANELA + 50;
  for (let i = 1; i <= total; i++) observe(indexPath, 'job-' + i, i);
  const state = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const entry = state.chaves[eta.indexKey('codex', 'codigo', '<4k')];
  assert.equal(entry._observacoes.length, eta.JANELA);
  // ficaram as MAIS RECENTES: a primeira retida é a de duração 51, não a de 1
  assert.equal(entry._observacoes[0].duration_s, total - eta.JANELA + 1);
  assert.equal(estimate(indexPath).valor.n, eta.JANELA);
});

test('5 — codex sem denominador fiável mantém steps_total null com porque', () => {
  const total = seamless.stepsTotalFor('codex', null);
  assert.equal(total.steps_total, null);
  assert.match(total.porque, /não fornece um total fiável/i);
  const advances = [];
  const tracker = seamless.createStreamStepTracker('codex', (index) => advances.push(index));
  tracker.observe(JSON.stringify({
    type: 'item.completed',
    item: { id: 'tool-1', type: 'command_execution', command: 'node --test' },
  }) + '\n');
  assert.deepEqual(advances, [1]);
  assert.equal(seamless.stepsTotalFor('codex', 3).steps_total, 3);
  assert.equal(seamless.stepsTotalFor('moo', null).steps_total, 1);
});
