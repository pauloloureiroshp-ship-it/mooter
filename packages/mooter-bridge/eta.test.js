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
  assert.equal(result.valor.bytes_n, 0);
  assert.equal(result.valor.bytes_p50, null);
  assert.match(result.valor.bytes_porque, /0 observação.*pelo menos 5/i);
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

test('7 — o fecho mede bytes_finais na mesma amostra sem fabricar percentis', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-eta-terminal-'));
  const indexPath = path.join(dir, 'eta-index.json');
  const jobDir = path.join(dir, 'jobs', 'job-terminal');
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, 'meta.json'), JSON.stringify({
    agent: 'codex', goal: 'implementa código', created_at: '2026-07-27T11:59:00.000Z',
    category: 'leitura_resumo', category_fonte: 'declarada',
  }));
  fs.writeFileSync(path.join(jobDir, 'masterprompt.md'), 'implementa código', 'utf8');
  const output = 'resultado medido\n';
  fs.writeFileSync(path.join(jobDir, 'out.log'), output, 'utf8');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const result = eta.observeTerminal({
    event: 'done', job_id: 'job-terminal', agent: 'codex',
    duration_s: 60, exit_code: 0, ts: '2026-07-27T12:00:00.000Z',
  }, { indexPath, jobDir });
  assert.equal(result.ok, true);
  const entry = Object.values(JSON.parse(fs.readFileSync(indexPath, 'utf8')).chaves)[0];
  assert.equal(entry._observacoes[0].bytes_finais, Buffer.byteLength(output));
  assert.equal(entry._observacoes[0].category_fonte, 'declarada');
  assert.deepEqual(entry.category_fontes, { declarada: 1, inferida: 0, legado: 0 });
  assert.equal(entry.bytes_n, 1);
  assert.equal(entry.bytes_p50, null);
  assert.match(entry.bytes_porque, /1 observação.*pelo menos 5/i);
});

test('8 — taxa de captura cruza jobs done com observações reais por agente', (t) => {
  const indexPath = fixture(t);
  eta.recordObservation({
    job_id: 'cc-observado', agent: 'cc', goal: 'implementa código',
    prompt_chars: 2_000, duration_s: 10,
  }, { indexPath });
  eta.recordObservation({
    job_id: 'moo-observado', agent: 'moo', goal: 'resume o ficheiro',
    prompt_chars: 2_000, duration_s: 5,
  }, { indexPath });
  const rates = eta.captureRates([
    { event: 'done', job_id: 'cc-observado', agent: 'cc' },
    { event: 'done', job_id: 'cc-perdido', agent: 'cc' },
    { event: 'eta_observacao_recusada', job_id: 'cc-perdido', agent: 'cc' },
    { event: 'done', job_id: 'moo-observado', agent: 'moo' },
  ], eta.readIndex({ indexPath }));
  assert.deepEqual(rates, [
    {
      agente: 'cc', done_no_ledger: 2, observacoes_no_indice: 1,
      recusas_no_ledger: 1, taxa_captura_pct: 50, porque: null,
    },
    {
      agente: 'moo', done_no_ledger: 1, observacoes_no_indice: 1,
      recusas_no_ledger: 0, taxa_captura_pct: 100, porque: null,
    },
  ]);
});

test('9 — índice truncado deixa a taxa histórica n/d em vez de a subestimar', () => {
  const samples = Array.from({ length: eta.JANELA }, (_, index) => ({ job_id: 'job-' + index }));
  const rates = eta.captureRates([
    { event: 'done', job_id: 'job-0', agent: 'cc' },
  ], { chaves: { 'cc|codigo|<4k': { _observacoes: samples, _timeouts: [] } } });
  assert.strictEqual(rates[0].taxa_captura_pct, null);
  assert.match(rates[0].porque, /janela deslizante/i);
});
