'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fleet = require('./fleet.js');

function estimate(overrides) {
  return {
    progresso: { valor: null, porque: 'o job não declarou um total de passos fiável' },
    falta_s: { valor: null, porque: 'só há 3 observações; são precisas pelo menos 5' },
    vivo: { estado: 'n/d', ultimo_crescimento_s: null, porque: 'primeira amostra' },
    manda: null,
    manda_porque: 'sem histórico suficiente',
    aviso: null,
    porque: 'nenhum estimador tem base medida',
    ...(overrides || {}),
  };
}

test('estimativa null devolve barra indeterminada, nunca barra a 0%', () => {
  const model = fleet.etaBarModel({ elapsed_s: 20, estimativa: estimate() });
  assert.strictEqual(model.type, 'indeterminate');
  assert.strictEqual(model.fill_pct, null);
  assert.strictEqual(model.percentage, null);
  assert.match(model.message, /n\/d — sem histórico suficiente/i);
});

test('percentagem só existe quando a fonte são passos declarados', () => {
  const steps = fleet.etaBarModel({ elapsed_s: 60, estimativa: estimate({
    progresso: { passo: 3, de: 5, fonte: 'passos declarados' },
    falta_s: { valor: 40, base: '3 de 5 passos declarados em 60 s', percentil_actual: null },
    manda: 'E1', porque: 'E1 é o único estimador com base medida',
  }) });
  const history = fleet.etaBarModel({ elapsed_s: 60, estimativa: estimate({
    progresso: { valor: null, porque: 'sem passos' },
    falta_s: { valor: 40, base: 'p50 de 9 jobs', percentil_actual: 'p60' },
    manda: 'E2', porque: 'E2 é o único estimador com base medida',
  }) });
  assert.strictEqual(steps.percentage, 60);
  assert.strictEqual(steps.fill_pct, 60);
  assert.strictEqual(history.percentage, null);
  assert.strictEqual(history.fill_pct, 60);
});

test('depois do p90 pulsa em aviso e não oferece cancelamento', () => {
  const model = fleet.etaBarModel({ elapsed_s: 95, estimativa: estimate({
    falta_s: { valor: 0, base: 'p50 de 9 jobs', percentil_actual: 'p95' },
    manda: 'E2', aviso: 'passou o p90 — o máximo histórico foi 2 min',
    porque: 'E2 é o único estimador com base medida',
  }) });
  assert.strictEqual(model.state, 'warning');
  assert.strictEqual(model.pulsing, true);
  assert.deepStrictEqual(model.actions, []);
  assert.doesNotMatch(JSON.stringify(model), /cancel|parar/i);
});

test('pulso E3 morto é independente de uma barra a 60%', () => {
  const model = fleet.etaBarModel({ elapsed_s: 60, estimativa: estimate({
    progresso: { passo: 3, de: 5, fonte: 'passos declarados' },
    falta_s: { valor: 40, base: '3 de 5 passos declarados em 60 s', percentil_actual: null },
    vivo: { estado: 'parado', ultimo_crescimento_s: 180, porque: 'out.log não cresceu' },
    manda: 'E1', porque: 'E1 é o único estimador com base medida',
  }) });
  assert.strictEqual(model.fill_pct, 60);
  assert.strictEqual(model.pulse.state, 'parado');
  assert.match(model.pulse.text, /sem crescimento há 3 min/i);
});

test('refresh de 3 jobs abre um índice, faz 3 stat e nunca abre ledger.jsonl', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-barra-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const indexPath = path.join(root, 'eta-index.json');
  fs.writeFileSync(indexPath, JSON.stringify({ version: 1, chaves: {} }), 'utf8');
  const ids = ['job-a', 'job-b', 'job-c'];
  for (const id of ids) {
    const dir = path.join(root, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'out.log'), 'medido\n', 'utf8');
  }
  const originalRead = fs.readFileSync;
  const originalStat = fs.statSync;
  const opened = [];
  const stated = [];
  fs.readFileSync = function watchedRead(file, ...args) {
    opened.push(String(file));
    return originalRead.call(this, file, ...args);
  };
  fs.statSync = function watchedStat(file, ...args) {
    stated.push(String(file));
    return originalStat.call(this, file, ...args);
  };
  try {
    const jobs = ids.map((job_id) => ({
      job_id, state: 'running', agent: 'codex', goal: 'implementa código',
      prompt_chars: 2000, elapsed_s: 60, steps_done: 3, steps_total: 5,
    }));
    const result = await fleet.toolFleet({ view: 'eta', jobs }, {
      now: Date.parse('2026-07-27T12:00:00.000Z'),
      etaReadIndex() { return JSON.parse(fs.readFileSync(indexPath, 'utf8')); },
      estimateJob(jobId, job) {
        fs.statSync(path.join(root, jobId, 'out.log'));
        return estimate({
          progresso: { passo: job.steps_done, de: job.steps_total, fonte: 'passos declarados' },
          falta_s: { valor: 40, base: 'passos reais', percentil_actual: null },
          vivo: { estado: 'a-trabalhar', ultimo_crescimento_s: 1, porque: 'cresceu' },
          manda: 'E1', porque: 'E1 é o único estimador com base medida',
        });
      },
    });
    assert.strictEqual(result.jobs.length, 3);
    assert.strictEqual(opened.filter((file) => file.endsWith('eta-index.json')).length, 1);
    assert.strictEqual(stated.filter((file) => file.endsWith('out.log')).length, 3);
    assert.ok(opened.every((file) => !file.endsWith('ledger.jsonl')), opened.join('\n'));
    assert.strictEqual(result.refresh_ms, fleet.ETA_REFRESH_MS);

    let ioCalls = 0;
    const idle = fleet.refreshEtaJobs([], {
      etaReadIndex() { ioCalls++; throw new Error('não devia ler índice'); },
      estimateJob() { ioCalls++; throw new Error('não devia fazer stat'); },
    });
    assert.strictEqual(ioCalls, 0);
    assert.deepStrictEqual(idle.jobs, []);
    assert.strictEqual(idle.refresh_ms, result.refresh_ms,
      'o ritmo de refresh não depende do número de jobs');
  } finally {
    fs.readFileSync = originalRead;
    fs.statSync = originalStat;
  }
});
