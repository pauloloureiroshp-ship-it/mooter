'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const board = require('./board.js');
const seamless = require('./seamless.js');

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
      worktree_criada: { path: 'C:\\repo' }, git_base_clean: true,
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
  assert.strictEqual(m.taxa_interrupcao_pct.valor, 0);      // 0 / 10
  assert.strictEqual(m.interrupcoes_por_dia.valor, 0);      // ledger cobre o dia
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

function ledgerDesfechos(explicitos) {
  const inicio = Date.parse('2026-07-26T12:00:00.000Z');
  const finais = [
    { job_id: 'entregue', event: 'done', exit_code: 0, desfecho: 'entregue' },
    { job_id: 'falhou', event: 'failed', exit_code: 1, desfecho: 'falhou' },
    { job_id: 'cancelado', event: 'failed', exit_code: 'cancelled-by-user', desfecho: 'interrompido' },
    { job_id: 'timeout', event: 'failed', exit_code: 'timeout', desfecho: 'expirou' },
  ];
  const events = [];
  finais.forEach((final, index) => {
    const comum = { job_id: final.job_id, wave: 'm15', agent: 'cc', worktree: 'C:\\repo', escrita: false };
    events.push({ ...comum, event: 'dispatched', ts: new Date(inicio + index * 1000).toISOString() });
    const terminal = { ...comum, ...final, ts: new Date(inicio + index * 1000 + 500).toISOString() };
    if (!explicitos) delete terminal.desfecho;
    events.push(terminal);
  });
  return events;
}

test('falha exclui cancelamento/timeout e interrupção conta só o que foi interrompido', () => {
  const card = board.scorecard(deps({ ledger: ledgerDesfechos(true), keepResults: [] }));
  assert.strictEqual(card.metricas.taxa_falha_pct.valor, 50);       // 1 / (1 entregue + 1 falha)
  assert.strictEqual(card.metricas.taxa_interrupcao_pct.valor, 25); // 1 / 4 desfechos conhecidos
});

test('eventos históricos sem desfecho são classificados na leitura sem mudar o resultado', () => {
  const novo = board.scorecard(deps({ ledger: ledgerDesfechos(true), keepResults: [] }));
  const antigo = board.scorecard(deps({ ledger: ledgerDesfechos(false), keepResults: [] }));
  assert.strictEqual(antigo.metricas.taxa_falha_pct.valor, novo.metricas.taxa_falha_pct.valor);
  assert.strictEqual(antigo.metricas.taxa_interrupcao_pct.valor, novo.metricas.taxa_interrupcao_pct.valor);
});

test('done histórico sem exit_code fica indeterminado e não entra na taxa de falha', () => {
  const ledger = [
    { job_id: 'sem-exit', event: 'dispatched', ts: '2026-07-26T12:00:00.000Z' },
    { job_id: 'sem-exit', event: 'done', ts: '2026-07-26T12:00:01.000Z' },
  ];
  const card = board.scorecard(deps({ ledger, keepResults: [] }));
  assert.strictEqual(card.metricas.taxa_falha_pct.valor, null);
  assert.strictEqual(card.metricas.taxa_falha_pct.estado, 'n/d');
});

test('motivos não locais agregam e ordenam sem contar preparação', () => {
  const evento = (porque, preparation) => ({ event: 'dispatched', preparation,
    local_decisao: { local: false, porque, confianca: 'alta', forcado_por_quota: false } });
  assert.deepStrictEqual(board._motivosNaoLocal([
    evento('risco', false), evento('capacidade', false), evento('risco', false), evento('ignorar prep', true),
  ]), [{ porque: 'risco', n: 2 }, { porque: 'capacidade', n: 1 }]);
});

test('job sem token de conteúdo mantém ttft null e lead time n/d, nunca zero', () => {
  const card = board.scorecard(deps({ ledger: [
    { job_id: 'sem-token', wave: 'm15', agent: 'cc', event: 'dispatched', ts: '2026-07-26T12:00:00.000Z' },
    { job_id: 'sem-token', wave: 'm15', agent: 'cc', event: 'failed', exit_code: 'empty-output',
      ttft_ms: null, ts: '2026-07-26T12:00:01.000Z' },
  ], keepResults: [] }));
  assert.strictEqual(card.metricas.lead_time_primeiro_token_s.valor, null);
  assert.strictEqual(card.metricas.lead_time_primeiro_token_s.estado, 'n/d');
  assert.notStrictEqual(card.metricas.lead_time_primeiro_token_s.valor, 0);
});

test('registarInterrupcao incrementa o dia e a faixa [0,1] abre excepção MEO', () => {
  const ledger = [];
  const opts = { agora: AGORA, ledgerAppend(event) { ledger.push(event); } };
  board.registarInterrupcao({ motivo: 'irreversivel', o_que: 'push', quem_pediu: 'MRO' }, opts);
  board.registarInterrupcao({ motivo: 'limiar', o_que: 'WIP acima da faixa', quem_pediu: 'MOO' }, opts);
  const card = board.scorecard(deps({ ledger, keepResults: [] }));
  const metrica = card.metricas.interrupcoes_por_dia;
  assert.strictEqual(metrica.valor, 2);
  assert.deepStrictEqual(metrica.faixa, [0, 1]);
  assert.strictEqual(metrica.estado, 'fora');
  assert.strictEqual(card.excepcoes.find((item) => item.metrica === 'interrupcoes_por_dia').dono, 'MEO');
});

test('keep rate só é numérico em worktree criada de fresco com base limpa provada', () => {
  const terminal = { job_id: 'write', wave: 'm15', agent: 'cc', worktree: 'C:\\repo', escrita: true };
  const semFresh = [
    { ...terminal, event: 'dispatched', ts: '2026-07-26T12:00:00.000Z' },
    { ...terminal, event: 'done', exit_code: 0, ts: '2026-07-26T12:01:00.000Z' },
  ];
  const nd = board.scorecard(deps({ ledger: semFresh, keepResults: [{ keep_rate: 80 }] }));
  assert.strictEqual(nd.metricas.keep_rate_pct.valor, null);
  const fresh = semFresh.map((event) => event.event === 'dispatched'
    ? { ...event, worktree_criada: { path: 'C:\\repo' }, git_base_clean: true } : event);
  const medido = board.scorecard(deps({ ledger: fresh, keepResults: [{ keep_rate: 80 }] }));
  assert.strictEqual(medido.metricas.keep_rate_pct.valor, 80);
  const divergente = semFresh.map((event) => event.event === 'dispatched'
    ? { ...event, worktree_criada: { path: 'C:\\outra' }, git_base_clean: true } : event);
  const aindaNd = board.scorecard(deps({ ledger: divergente, keepResults: [{ keep_rate: 80 }] }));
  assert.strictEqual(aindaNd.metricas.keep_rate_pct.valor, null);
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

test('nova excepção automática entra logo no contador e no scorecard persistido', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-board-auto-meo-'));
  const anterior = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = dir;
  try {
    fs.writeFileSync(path.join(dir, 'preferences.json'), JSON.stringify({
      board_faixas: { entregas_por_dia: [2, 1000] },
    }));
    const comum = { job_id: 'entrega-unica', wave: 'm15', agent: 'moo', escrita: false };
    seamless.ledgerAppend({ ...comum, event: 'dispatched', ts: '2026-07-26T12:00:00.000Z' });
    seamless.ledgerAppend({ ...comum, event: 'done', exit_code: 0, cost_usd: 0,
      ts: '2026-07-26T12:01:00.000Z' });
    const card = board.scorecard({ mooterHome: dir, agora: AGORA, quotaState: null, gpuState: null });
    assert.strictEqual(card.metricas.interrupcoes_por_dia.valor, 1);
    assert.strictEqual(card.ledger_eventos, 3);
    const persistido = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'));
    assert.strictEqual(persistido.metricas.interrupcoes_por_dia.valor, 1);
    assert.strictEqual(persistido.ledger_eventos, 3);
  } finally {
    if (anterior == null) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = anterior;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
