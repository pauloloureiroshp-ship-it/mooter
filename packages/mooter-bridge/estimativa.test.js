'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const eta = require('./eta.js');
const estimation = require('./estimativa.js');

function fixture(t, jobId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-estimativa-'));
  const id = jobId || 'job-live';
  const jobDir = path.join(dir, 'jobs', id);
  fs.mkdirSync(jobDir, { recursive: true });
  const outPath = path.join(jobDir, 'out.log');
  fs.writeFileSync(outPath, 'trabalho medido\n', 'utf8');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, jobId: id, indexPath: path.join(dir, 'eta-index.json'), outPath };
}

function seed(indexPath, durations, bytesFactor) {
  durations.forEach((duration, index) => {
    const result = eta.recordObservation({
      job_id: 'historico-' + index,
      agent: 'codex',
      goal: 'implementa código',
      prompt_chars: 2_000,
      duration_s: duration,
      bytes_finais: (index + 1) * 100 * (bytesFactor || 1),
      exit_code: 0,
      ts: '2026-07-27T12:00:00.000Z',
    }, { indexPath });
    assert.equal(result.ok, true);
  });
}

function liveJob(overrides) {
  return {
    agent: 'codex',
    goal: 'implementa código',
    prompt_chars: 2_000,
    elapsed_s: 180,
    steps_done: 1,
    steps_total: 2,
    ...(overrides || {}),
  };
}

test.beforeEach(() => estimation._resetLiveness());

test('1 — o estimador mais conservador ganha sem fazer médias', (t) => {
  const f = fixture(t);
  seed(f.indexPath, [900, 900, 900, 900, 900]);
  const result = estimation.estimateJob(f.jobId, liveJob(), {
    indexPath: f.indexPath, outPath: f.outPath, now: Date.now(), track: false,
  });
  assert.equal(result.falta_s.valor, 720);
  assert.equal(result.manda, 'E2');
  assert.match(result.falta_s.base, /p50 de 5 jobs codex\|codigo\|<4k/);
});

test('2 — o total projectado nunca encolhe abaixo do tempo já decorrido', (t) => {
  const f = fixture(t);
  seed(f.indexPath, [300, 300, 300, 300, 300]);
  const elapsed = 600;
  const result = estimation.estimateJob(f.jobId, liveJob({
    elapsed_s: elapsed, steps_done: 0, steps_total: null,
  }), { indexPath: f.indexPath, outPath: f.outPath, now: Date.now(), track: false });
  assert.equal(result.manda, 'E2');
  assert.equal(result.falta_s.valor, 0);
  assert.ok(elapsed + result.falta_s.valor >= elapsed);
});

test('3 — passar o p90 avisa e não cria nenhuma acção de cancelamento', (t) => {
  const f = fixture(t);
  seed(f.indexPath, [100, 200, 300, 400, 500]);
  const result = estimation.estimateJob(f.jobId, liveJob({
    elapsed_s: 501, steps_done: 0, steps_total: null,
  }), { indexPath: f.indexPath, outPath: f.outPath, now: Date.now(), track: false });
  assert.match(result.aviso, /passou o p90.*máximo histórico/i);
  assert.equal(/cancel/i.test(JSON.stringify(result)), false);
});

test('4 — sem histórico nem sinais medidos, tudo fica null com um porquê legível', (t) => {
  const f = fixture(t);
  fs.rmSync(f.outPath);
  const result = estimation.estimateJob(f.jobId, liveJob({
    prompt_chars: null, elapsed_s: null, steps_done: null, steps_total: null,
  }), { indexPath: f.indexPath, outPath: f.outPath, now: Date.now(), track: false });
  assert.equal(result.progresso.valor, null);
  assert.match(result.progresso.porque, /passos/i);
  assert.equal(result.falta_s.valor, null);
  assert.match(result.falta_s.porque, /n\/d|não|ainda/i);
  assert.equal(result.vivo.ultimo_crescimento_s, null);
  assert.match(result.vivo.porque, /não consegui medir/i);
  assert.equal(result.manda, null);
  assert.match(result.manda_porque, /n\/d|não|ainda/i);
  assert.equal(result.aviso, null);
});

test('5 — duplicar bytes históricos nunca altera a estimativa de tempo', (t) => {
  const a = fixture(t, 'job-a');
  const b = fixture(t, 'job-b');
  const durations = [600, 650, 700, 750, 800];
  seed(a.indexPath, durations, 1);
  seed(b.indexPath, durations, 2);
  const job = liveJob({ elapsed_s: 100, steps_done: 0, steps_total: null });
  const first = estimation.estimateJob(a.jobId, job, {
    indexPath: a.indexPath, outPath: a.outPath, now: Date.now(), track: false,
  });
  const doubled = estimation.estimateJob(b.jobId, job, {
    indexPath: b.indexPath, outPath: b.outPath, now: Date.now(), track: false,
  });
  assert.equal(first.falta_s.valor, doubled.falta_s.valor);
  assert.equal(first.manda, doubled.manda);
  assert.equal(first.falta_s.base, doubled.falta_s.base);
  const entryA = eta.lookup({ agent: 'codex', category: 'codigo', bucket: '<4k' }, { indexPath: a.indexPath });
  const entryB = eta.lookup({ agent: 'codex', category: 'codigo', bucket: '<4k' }, { indexPath: b.indexPath });
  assert.equal(entryB.valor.bytes_p50, entryA.valor.bytes_p50 * 2);
});

test('6 — o caminho de leitura abre o índice e faz stat ao log, nunca abre ledger.jsonl', (t) => {
  const f = fixture(t);
  seed(f.indexPath, [100, 200, 300, 400, 500]);
  const original = fs.readFileSync;
  const opened = [];
  fs.readFileSync = function watched(file, ...args) {
    opened.push(String(file));
    return original.call(this, file, ...args);
  };
  try {
    estimation.estimateJob(f.jobId, liveJob(), {
      indexPath: f.indexPath, outPath: f.outPath, now: Date.now(), track: false,
    });
  } finally {
    fs.readFileSync = original;
  }
  assert.deepEqual(opened, [f.indexPath]);
  assert.equal(opened.some((file) => /ledger\.jsonl$/i.test(file)), false);
});

test('7 — vivacidade compara amostras do próprio log sem contaminar a ETA', (t) => {
  const f = fixture(t);
  seed(f.indexPath, [600, 650, 700, 750, 800]);
  const firstMtime = fs.statSync(f.outPath).mtimeMs;
  const job = liveJob({ elapsed_s: 100, steps_done: 0, steps_total: null });
  const first = estimation.estimateJob(f.jobId, job, {
    indexPath: f.indexPath, outPath: f.outPath, now: firstMtime + 1_000,
  });
  assert.equal(first.vivo.estado, 'n/d');

  fs.appendFileSync(f.outPath, 'mais trabalho\n', 'utf8');
  const grownAt = firstMtime + 2_000;
  fs.utimesSync(f.outPath, new Date(grownAt), new Date(grownAt));
  const working = estimation.estimateJob(f.jobId, job, {
    indexPath: f.indexPath, outPath: f.outPath, now: grownAt + 1_000,
  });
  assert.equal(working.vivo.estado, 'a-trabalhar');
  const stopped = estimation.estimateJob(f.jobId, job, {
    indexPath: f.indexPath, outPath: f.outPath, now: grownAt + 4_000,
  });
  assert.equal(stopped.vivo.estado, 'parado');
  assert.equal(stopped.vivo.ultimo_crescimento_s, 4);
  assert.equal(working.falta_s.valor, stopped.falta_s.valor);
});
