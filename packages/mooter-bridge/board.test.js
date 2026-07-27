'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const board = require('./board.js');

const AGORA = '2026-07-26T23:00:00.000Z';

function ledger30() {
  const eventos = [];
  const inicio = Date.parse('2026-07-26T12:00:00.000Z');
  for (let i = 0; i < 10; i++) {
    const job = 'j' + i;
    const base = inicio + i * 10 * 60_000;
    const falhou = i === 2 || i === 6;
    const comum = {
      job_id: job, wave: 'wave-1', agent: i % 2 === 0 ? 'moo' : 'cc',
      worktree: 'C:\\repo', goal: 'implementa teste ' + i, escrita: true,
    };
    eventos.push({ ...comum, ts: new Date(base).toISOString(), event: 'dispatched' });
    eventos.push({ ...comum, ts: new Date(base + 10_000).toISOString(), event: 'first_token' });
    eventos.push({
      ...comum, ts: new Date(base + 60_000).toISOString(),
      event: falhou ? 'failed' : 'done', exit_code: falhou ? 1 : 0,
      duration_s: 60, cost_usd: Number(((i + 1) / 10).toFixed(1)),
    });
  }
  return eventos;
}

function deps(extra) {
  return {
    ledger: ledger30(), agora: AGORA, persist: false,
    quotaState: { pressao: { valor: 0.5, porque: 'pressão sintética verificada no teste' } },
    gpuState: { available: true, name: 'GPU teste' },
    keepResults: [{ keep_rate: 80, files_kept: 8, files_measured: 10 }],
    ...(extra || {}),
  };
}

test('ledger sintético de 30 eventos bate com o cálculo feito à mão', () => {
  const card = board.scorecard(deps());
  const m = card.metricas;
  assert.strictEqual(card.ledger_eventos, 30);
  assert.strictEqual(m.entregas_por_dia.valor, 8);          // 8 done / 1 dia UTC
  assert.strictEqual(m.lead_time_primeiro_token_s.valor, 10); // mediana de 10 s
  assert.strictEqual(m.taxa_falha_pct.valor, 20);           // 2 / 10
  assert.strictEqual(m.tempo_recuperacao_min.valor, 10);    // falha → done seguinte
  assert.strictEqual(m.keep_rate_pct.valor, 80);            // 8 / 10 ficheiros
  assert.strictEqual(m.custo_por_tarefa_entregue_usd.valor, 0.55); // mediana dos 8 done
  assert.strictEqual(m.trabalho_zero_pct.valor, 50);        // 5 / 10 jobs no moo
  assert.strictEqual(m.pressao_quota.valor, 0.5);
  assert.strictEqual(m.wip_actual.valor, 0);
  for (const item of Object.values(m)) assert.strictEqual(item.estado, 'dentro', item.fonte);
});

test('métrica sem dados devolve n/d e valor null — nunca zero', () => {
  const card = board.scorecard({
    ledger: [], agora: AGORA, persist: false, quotaState: null, gpuState: null,
  });
  for (const [nome, item] of Object.entries(card.metricas)) {
    assert.strictEqual(item.estado, 'n/d', nome);
    assert.strictEqual(item.valor, null, nome);
    assert.notStrictEqual(item.valor, 0, nome);
    assert.ok(item.porque, nome);
  }
  assert.strictEqual(card.pode_ir_dormir.valor, null);
});

test('faixa calibrada em preferences.json sobrepõe o default e declara a origem', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-board-prefs-'));
  try {
    fs.writeFileSync(path.join(dir, 'preferences.json'), JSON.stringify({
      board_faixas: { taxa_falha_pct: [0, 5] },
    }));
    const card = board.scorecard(deps({ mooterHome: dir }));
    const falha = card.metricas.taxa_falha_pct;
    assert.deepStrictEqual(falha.faixa, [0, 5]);
    assert.match(falha.faixa_origem, /preferences\.json.+calibrada/i);
    assert.strictEqual(falha.estado, 'fora');
    assert.strictEqual(card.excepcoes[0].dono, 'MTO');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('uma excepção sem dono faz falhar', () => {
  assert.throws(() => board.excepcoes({
    gerado_em: AGORA,
    metricas: { metrica_orfa: { estado: 'fora', medido_em: AGORA } },
  }), /sem dono válido: metrica_orfa/);
});

test('scorecardAsync usa quota.estadoAsync e o pior gap com 5000 eventos fica abaixo de 120 ms', async () => {
  const ledger = [];
  const inicio = Date.parse('2026-07-26T12:00:00.000Z');
  for (let i = 0; i < 2500; i++) {
    const comum = { job_id: 'p' + i, wave: 'perf', agent: 'moo', escrita: false };
    ledger.push({ ...comum, event: 'dispatched', ts: new Date(inicio + i * 2).toISOString() });
    ledger.push({ ...comum, event: 'done', ts: new Date(inicio + i * 2 + 1).toISOString(), cost_usd: 0 });
  }
  let asyncChamado = 0;
  const quotaModule = {
    estado() { throw new Error('scorecardAsync chamou quota.estado síncrona'); },
    async estadoAsync() { asyncChamado++; return { pressao: { valor: 0.2, porque: 'teste' } }; },
  };
  let ultimo = performance.now();
  let pior = 0;
  const timer = setInterval(() => {
    const agora = performance.now();
    pior = Math.max(pior, agora - ultimo);
    ultimo = agora;
  }, 1);
  await board.scorecardAsync({
    ledger, agora: AGORA, persist: false, quotaModule, gpuState: null,
  });
  pior = Math.max(pior, performance.now() - ultimo);
  clearInterval(timer);
  assert.strictEqual(asyncChamado, 1);
  assert.ok(pior < 120, 'pior gap medido: ' + pior.toFixed(1) + ' ms');
});

test('escrever o histórico duas vezes no mesmo dia não duplica', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-board-history-'));
  try {
    board.scorecard(deps({ mooterHome: dir, persist: true }));
    board.scorecard(deps({ mooterHome: dir, persist: true }));
    const files = fs.readdirSync(path.join(dir, 'board'));
    assert.deepStrictEqual(files, ['2026-07-26.json']);
    const historico = JSON.parse(fs.readFileSync(path.join(dir, 'board', files[0]), 'utf8'));
    assert.strictEqual(historico.ledger_eventos, 30);
    assert.ok(fs.existsSync(path.join(dir, 'scorecard.json')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
