'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const afericao = require('./afericao.js');

test('a bateria versionada contém cinco factos verificáveis do pacote', () => {
  assert.strictEqual(afericao.TASK_SET.version, 1);
  assert.strictEqual(afericao.TASK_SET.tasks.length, 5);

  const localfirst = require('./localfirst.js');
  const aprender = require('./aprender.js');
  const quota = require('./quota.js');
  const expected = Object.fromEntries(afericao.TASK_SET.tasks.map((task) => [task.id, task.expected]));
  assert.strictEqual(expected.so_nuvem_rule_count, localfirst.SO_NUVEM.length);
  assert.strictEqual(expected.local_context_limit, localfirst.CONTEXTO_MAX_LOCAL_CHARS);
  assert.strictEqual(expected.learning_minimum_observations, aprender.MIN_OBSERVATIONS);
  assert.strictEqual(expected.quota_long_window_days, quota.JANELA_LONGA_D);
  assert.strictEqual(expected.quota_forced_field, 'forcado_por_quota');
  const forced = localfirst.cabeNoLocal({
    goal: 'resume este ficheiro', tier: 'T1', contextoChars: 10,
    temModeloLocal: true, escrita: false, vramLivreMb: 8000, forcar: true,
  });
  assert.strictEqual(forced[expected.quota_forced_field], true);
});

test('avaliarResposta tolera formatação sem transformar incerteza em erro', () => {
  const task = afericao.TASK_SET.tasks.find((item) => item.id === 'so_nuvem_rule_count');
  for (const answer of ['6', '6 regras', 'São 6.']) {
    assert.strictEqual(afericao.avaliarResposta(task, answer).acertou, true, answer);
  }
  assert.strictEqual(afericao.avaliarResposta(task, 'algumas').acertou, null);
  assert.strictEqual(afericao.avaliarResposta(task, 'São 7.').acertou, false);
});

test('avaliarResposta verifica identificadores e deixa prosa ambígua como n/d', () => {
  const task = afericao.TASK_SET.tasks.find((item) => item.id === 'quota_forced_field');
  assert.strictEqual(afericao.avaliarResposta(task, 'O campo é forcado_por_quota.').acertou, true);
  assert.strictEqual(afericao.avaliarResposta(task, 'quota_forcada').acertou, false);
  assert.strictEqual(afericao.avaliarResposta(task, 'não me recordo do nome').acertou, null);
});

test('resultadoDaAfericao agrega medianas e mantém zero local por resposta certa', () => {
  const result = afericao.resultadoDaAfericao([
    { motor: 'moo', acertou: true, tempo_s: 5, custo_usd: 0 },
    { motor: 'moo', acertou: true, tempo_s: 7, custo_usd: 0 },
    { motor: 'moo', acertou: true, tempo_s: 9, custo_usd: 0 },
  ]);
  assert.deepStrictEqual(result.moo, {
    acertos: 3,
    total: 3,
    acerto_pct: 100,
    tempo_mediano_s: 7,
    custo_mediano_usd: 0,
    custo_por_resposta_certa: 0,
  });
});

test('resultadoDaAfericao não divide por zero nem inventa custos ausentes', () => {
  const result = afericao.resultadoDaAfericao([
    { motor: 'gemini', acertou: false, tempo_s: 6, custo_usd: null },
    { motor: 'gemini', acertou: false, tempo_s: 8 },
    { motor: 'cc', acertou: null, tempo_s: 40, custo_usd: 0.44 },
  ]);
  assert.strictEqual(result.gemini.acertos, 0);
  assert.strictEqual(result.gemini.total, 2);
  assert.strictEqual(result.gemini.acerto_pct, 0);
  assert.strictEqual(result.gemini.custo_mediano_usd, null);
  assert.strictEqual(result.gemini.custo_por_resposta_certa, null);
  assert.strictEqual(result.cc.total, 0, 'n/d não pode entrar no denominador como erro');
  assert.strictEqual(result.cc.acerto_pct, null);
  assert.strictEqual(result.cc.custo_por_resposta_certa, null);
});

test('lerUltimaAfericao é read-only e escolhe a medição mais recente', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-afericao-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const missing = path.join(root, 'nao-existe');
  const before = fs.existsSync(missing);
  const none = afericao.lerUltimaAfericao({ dir: missing });
  assert.strictEqual(none.estado, 'n/d');
  assert.match(none.porque, /ainda não correu/);
  assert.strictEqual(fs.existsSync(missing), before, 'o loader não deve criar histórico');

  fs.writeFileSync(path.join(root, '2026-07-26.json'), JSON.stringify({ motores: { moo: 1 } }));
  fs.writeFileSync(path.join(root, '2026-07-27.json'), JSON.stringify({ motores: { moo: 3 } }));
  const latest = afericao.lerUltimaAfericao({ dir: root });
  assert.strictEqual(latest.estado, 'medido');
  assert.strictEqual(latest.medido_em, '2026-07-27');
  assert.deepStrictEqual(latest.resultado, { motores: { moo: 3 } });
});
