'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sentinela = require('./sentinela.js');

function tempHome(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-sentinela-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function card(ts, state, value) {
  return {
    gerado_em: ts,
    metricas: { taxa_falha_pct: { estado: state, valor: value, medido_em: ts } },
  };
}

function lines(home, day) {
  const file = path.join(home, 'sentinela', day + '.jsonl');
  return fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
}

test('regista entrou_fora apenas na transição e chama o scorecard sem persistir nem interromper', async (t) => {
  const home = tempHome(t);
  const cards = [
    card('2026-07-27T10:00:00.000Z', 'fora', 20),
    card('2026-07-27T11:00:00.000Z', 'fora', 21),
  ];
  const receivedOptions = [];
  let interruptions = 0;
  const boardModule = {
    async scorecardAsync(options) {
      receivedOptions.push(options);
      return cards.shift();
    },
    registarInterrupcao() { interruptions++; },
  };

  const first = await sentinela.correrSentinela({
    mooterHome: home, agora: '2026-07-27T10:00:00.000Z', boardModule,
  });
  const second = await sentinela.correrSentinela({
    mooterHome: home, agora: '2026-07-27T11:00:00.000Z', boardModule,
  });

  assert.strictEqual(first.metricas_fora.length, 1);
  assert.strictEqual(first.metricas_fora[0].transicao, 'entrou_fora');
  assert.deepStrictEqual(second.metricas_fora, []);
  assert.deepStrictEqual(second.metricas_recuperadas, []);
  assert.strictEqual(second.delta_por_metrica.taxa_falha_pct, 1);
  assert.ok(receivedOptions.every((options) => options.persist === false));
  assert.strictEqual(interruptions, 0);

  const state = JSON.parse(fs.readFileSync(path.join(home, 'sentinela', 'estado.json'), 'utf8'));
  assert.strictEqual(state.metricas.taxa_falha_pct.fora_desde, '2026-07-27T10:00:00.000Z');
  assert.strictEqual(state.metricas.taxa_falha_pct.horas_fora, 1);
  assert.strictEqual(lines(home, '2026-07-27').length, 2);
});

test('falha do scorecard escreve erro e não lança', async (t) => {
  const home = tempHome(t);
  const result = await sentinela.correrSentinela({
    mooterHome: home,
    agora: '2026-07-27T12:00:00.000Z',
    boardModule: {
      async scorecardAsync() { throw new Error('quota sintética indisponível'); },
    },
  });

  assert.strictEqual(result.erro, 'scorecard_falhou');
  assert.match(result.porque, /quota sintética indisponível/);
  const saved = lines(home, '2026-07-27');
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].erro, 'scorecard_falhou');
  assert.match(saved[0].porque, /quota sintética indisponível/);
});

test('resumo conta duas horas fora e as duas transições em três execuções', async (t) => {
  const home = tempHome(t);
  const cards = [
    card('2026-07-27T10:00:00.000Z', 'fora', 20),
    card('2026-07-27T11:00:00.000Z', 'fora', 20),
    card('2026-07-27T12:00:00.000Z', 'dentro', 5),
  ];
  const boardModule = { async scorecardAsync() { return cards.shift(); } };

  for (const hour of [10, 11, 12]) {
    await sentinela.correrSentinela({
      mooterHome: home,
      agora: '2026-07-27T' + String(hour).padStart(2, '0') + ':00:00.000Z',
      boardModule,
    });
  }

  const summary = sentinela.resumoDaSentinela(1, {
    mooterHome: home, agora: '2026-07-27T12:00:00.000Z',
  });
  assert.strictEqual(summary.metricas.taxa_falha_pct.horas_fora, 2);
  assert.strictEqual(summary.horas_fora_por_metrica.taxa_falha_pct, 2);
  assert.deepStrictEqual(
    summary.transicoes.map((item) => item.transicao),
    ['entrou_fora', 'recuperou'],
  );
  const saved = lines(home, '2026-07-27');
  assert.deepStrictEqual(saved[1].metricas_fora, []);
  assert.strictEqual(saved[2].metricas_recuperadas[0].horas_fora, 2);
});

test('resumo distingue histórico inexistente de registos ilegíveis', (t) => {
  const home = tempHome(t);
  const vazio = sentinela.resumoDaSentinela(1, {
    mooterHome: home, agora: '2026-07-27T12:00:00.000Z',
  });
  assert.deepStrictEqual(vazio.metricas, {}, 'ENOENT é histórico legitimamente vazio');

  const bloqueado = path.join(home, 'nao-e-pasta');
  fs.writeFileSync(bloqueado, 'x');
  const incerto = sentinela.resumoDaSentinela(1, {
    sentinelaDir: bloqueado, agora: '2026-07-27T12:00:00.000Z',
  });
  assert.strictEqual(incerto.metricas, null);
  assert.strictEqual(incerto.horas_fora_por_metrica, null);
  assert.strictEqual(incerto.transicoes, null);
  assert.match(incerto.porque, /^n\/d — não consegui ler/);
});
