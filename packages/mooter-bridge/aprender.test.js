'use strict';

const test = require('node:test');
const assert = require('node:assert');
const aprender = require('./aprender.js');
const fs = require('fs');
const path = require('path');

function syntheticLedger(count, options) {
  const opts = options || {};
  const events = [];
  const start = Date.parse('2026-07-26T12:00:00.000Z');
  for (let index = 0; index < count; index++) {
    const jobId = 'job-' + index;
    const done = opts.allDone === true || index < (opts.done == null ? count : opts.done);
    const shared = {
      job_id: jobId, agent: opts.agent || 'moo', worktree: opts.worktree || 'C:\\repo',
      goal: opts.goal || 'resume e explica este ficheiro', escrita: opts.escrita === true,
    };
    events.push({ ...shared, ts: new Date(start + index * 60_000).toISOString(), event: 'dispatched' });
    events.push({
      ...shared, ts: new Date(start + index * 60_000 + 30_000).toISOString(),
      event: done ? 'done' : 'failed', exit_code: done ? 0 : 1,
      tier_motor: opts.tier_motor || 'T0', duration_s: index + 1,
      tokens_in: (index + 1) * 10, tokens_out: (index + 1) * 5,
      prep_duration_s: (index + 1) / 10, tokens_poupados_estimados: index + 1,
      cost_usd: opts.withoutCost ? null : 0,
    });
  }
  return events;
}

test('ledger sintético de 10 jobs produz estatísticas por agente, tier e categoria', () => {
  const stats = aprender.statistics({ ledger: syntheticLedger(10, { done: 8 }) });
  const group = stats.by_key['moo|T0|leitura_resumo'];
  assert.strictEqual(stats.jobs, 10);
  assert.ok(group);
  assert.strictEqual(group.jobs, 10);
  assert.strictEqual(group.done, 8);
  assert.strictEqual(group.failed, 2);
  assert.strictEqual(group.success_rate, 0.8);
  assert.strictEqual(group.duration_median_s, 5.5);
  assert.strictEqual(group.tokens_median, 82.5);
  assert.strictEqual(group.prep_duration_median_s, 0.55);
  assert.strictEqual(group.tokens_saved_estimated_median, 5.5);
  assert.strictEqual(group.delivered_cost_median_usd, 0);
});

test('com menos de 5 observações recomendarAgente não decide', () => {
  const result = aprender.recomendarAgente({
    goal: 'resume este ficheiro', tier: 'T1', escrita: false,
    ledger: syntheticLedger(4, { allDone: true }),
  });
  assert.strictEqual(result, null);
});

test('8 jobs locais bem sucedidos recomendam moo e dizem a base', () => {
  const result = aprender.recomendarAgente({
    goal: 'resume e explica outro ficheiro', tier: 'T1', escrita: false,
    ledger: syntheticLedger(8, { allDone: true }),
  });
  assert.ok(result);
  assert.strictEqual(result.agente, 'moo');
  assert.ok(result.porque.includes('8/8'), result.porque);
  assert.strictEqual(result.base.observations, 8);
  assert.strictEqual(result.base.success_rate, 1);
});

test('keep rate sem dados é n/d e nunca zero', () => {
  const result = aprender.measureKeepRate({
    job_id: 'sem-prova', worktree: 'C:\\repo',
    completed_at: '2026-07-26T12:00:00.000Z',
  });
  assert.strictEqual(result.keep_rate, 'n/d');
  assert.strictEqual(result.valor, 'n/d');
  assert.notStrictEqual(result.keep_rate, 0);
  assert.ok(result.porque);
});

test('keep rate medido usa o commit seguinte e o diff --stat actual', () => {
  const calls = [];
  const result = aprender.measureKeepRate({
    job_id: 'medido', worktree: 'C:\\repo',
    completed_at: '2026-07-26T12:00:00.000Z',
    files_touched: ['a.js', 'b.js'],
  }, {
    runGit(_worktree, args) {
      calls.push(args);
      if (args[0] === 'log') return 'abc123\n';
      if (args[0] === 'diff-tree') return 'a.js\nb.js\n';
      if (args[0] === 'diff' && args.includes('a.js')) return '';
      if (args[0] === 'diff' && args.includes('b.js')) return ' b.js | 2 +-\n';
      throw new Error('comando inesperado: ' + args.join(' '));
    },
  });
  assert.strictEqual(result.keep_rate, 50);
  assert.strictEqual(result.files_kept, 1);
  assert.strictEqual(result.files_measured, 2);
  assert.strictEqual(calls.filter((args) => args.includes('--stat')).length, 2);
});

test('satisfação inferida marca repeat parecido antes de 10 minutos como negativo', () => {
  const ledger = [
    { ts: '2026-07-26T12:00:00.000Z', event: 'dispatched', job_id: 'primeiro',
      agent: 'moo', worktree: 'C:\\repo', goal: 'resume e explica o ficheiro seamless.js' },
    { ts: '2026-07-26T12:05:00.000Z', event: 'dispatched', job_id: 'segundo',
      agent: 'moo', worktree: 'C:\\repo', goal: 'resume e explica o ficheiro seamless.js' },
  ];
  const signals = aprender.inferSatisfaction({ ledger });
  assert.strictEqual(signals.length, 1);
  assert.strictEqual(signals[0].signal, 'negativo');
  assert.strictEqual(signals[0].confidence, 'media');
  assert.ok(signals[0].similarity > 0.7);
});

test('handoff de preparação não finge ser repetição insatisfeita', () => {
  const ledger = [
    { ts: '2026-07-26T12:00:00.000Z', event: 'dispatched', job_id: 'prep',
      agent: 'moo', worktree: 'C:\\repo', goal: 'resume o ficheiro', preparation: true },
    { ts: '2026-07-26T12:01:00.000Z', event: 'dispatched', job_id: 'cloud',
      agent: 'cc', worktree: 'C:\\repo', goal: 'resume o ficheiro', preparation: false },
  ];
  assert.deepStrictEqual(aprender.inferSatisfaction({ ledger }), []);
});

test('resumo vazio não inventa números, diz n/d e respeita seis linhas', () => {
  const summary = aprender.resumoDeAprendizagem({ ledger: [] });
  assert.ok(summary.includes('n/d'), summary);
  assert.ok(summary.split('\n').length <= 6);
  assert.ok(!/\d/.test(summary), summary);
});

/**
 * ⚠️ GUARDA DE CUSTO (condutor, 2026-07-26) — captureGitBase custa 129 ms
 * medidos no Windows e é sincrona. Num job de escrita, que dura minutos, e' um
 * imposto de 0,1%. No caminho de LEITURA (o tier local, quente e barato) seria
 * 6% por nada. Este teste existe para que ninguem a mude de sitio sem dar por isso.
 */
test('nunca corre git no caminho de leitura — so em jobs de escrita', () => {
  const seamlessSrc = fs.readFileSync(path.join(__dirname, 'seamless.js'), 'utf8');
  const linha = seamlessSrc.split('\n').find((l) => l.includes('aprender.captureGitBase'));
  assert.ok(linha, 'captureGitBase deixou de ser chamado no seamless — o keep rate perdeu a base');
  assert.ok(/canWrite\s*\?/.test(linha),
    'captureGitBase passou a correr fora do ramo de escrita: ' + linha.trim());
});

test('recomendarAgente NUNCA contradiz um veto de risco', () => {
  const ledger = [];
  for (let i = 0; i < 12; i++) {
    ledger.push({ job_id: 'w' + i, agent: 'moo', event: 'dispatched',
      goal: 'implementa a funcao parse no ficheiro x.js', worktree: '/w', escrita: true,
      ts: new Date(Date.now() - i * 60000).toISOString() });
    ledger.push({ job_id: 'w' + i, agent: 'moo', event: 'done', duration_s: 5,
      ts: new Date(Date.now() - i * 60000 + 5000).toISOString() });
  }
  // mesmo com 12 sucessos locais, escrita continua a ir para a nuvem
  assert.strictEqual(aprender.recomendarAgente({ goal: 'implementa a funcao parse', tier: 'T2', escrita: true, ledger }), null,
    'a aprendizagem mandou trabalho de ESCRITA para o local — poupar nunca pode custar correccao');
  assert.strictEqual(aprender.recomendarAgente({ goal: 'faz commit e push', tier: 'T2', escrita: false, ledger }), null,
    'a aprendizagem nao vetou git/deploy');
  assert.strictEqual(aprender.recomendarAgente({ goal: 'audita a seguranca do modulo', tier: 'T2', escrita: false, ledger }), null,
    'a aprendizagem nao vetou auditoria');
  assert.strictEqual(aprender.recomendarAgente({ goal: 'resume o ficheiro', tier: 'T3', escrita: false, ledger }), null,
    'T3 e trabalho de alto risco — a aprendizagem nao pode desviar');
});
