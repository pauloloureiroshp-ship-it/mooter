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
  assert.strictEqual(m.divergencias_por_dia.valor, 0);      // nenhum cross-check divergente
  assert.strictEqual(m.tempo_recuperacao_min.valor, 10);    // falha → done seguinte
  assert.strictEqual(m.keep_rate_pct.valor, 80);            // 8 / 10 ficheiros
  assert.strictEqual(m.custo_por_tarefa_entregue_usd.valor, 0.55); // mediana dos 8 done
  assert.strictEqual(m.trabalho_zero_pct.valor, 50);        // 5 / 10 jobs no moo
  assert.strictEqual(m.pressao_quota.valor, 0.5);
  assert.strictEqual(m.wip_actual.valor, 0);
  for (const [nome, item] of Object.entries(m)) {
    if (nome === 'custo_total_usd' || nome === 'cobertura_custo_pct') {
      assert.strictEqual(item.estado, 'n/d', nome);
      assert.strictEqual(item.faixa, null, nome);
    } else assert.strictEqual(item.estado, 'dentro', item.fonte);
  }
  assert.strictEqual(card.pode_ir_dormir.valor, true,
    'uma métrica medida sem faixa não pode contar como dado ausente');
});

test('custo total e cobertura coexistem com a mediana sem esconder zero medido', () => {
  const base = { wave: 'onda1', agent: 'cc', worktree: 'C:\\repo', escrita: false };
  const ledger = [0, 0, 0.6054].flatMap((cost, index) => {
    const shared = { ...base, job_id: 'custo-' + index };
    return [
      { ...shared, event: 'dispatched', ts: `2026-07-26T12:0${index}:00.000Z` },
      { ...shared, event: 'done', exit_code: 0, cost_usd: cost, ts: `2026-07-26T12:0${index}:01.000Z` },
    ];
  });
  const metrics = board.scorecard(deps({ ledger, keepResults: [] })).metricas;
  assert.strictEqual(metrics.custo_por_tarefa_entregue_usd.valor, 0);
  assert.strictEqual(metrics.custo_total_usd.valor, 0.6054);
  assert.strictEqual(metrics.custo_total_usd.jobs_medidos, 3);
  assert.strictEqual(metrics.custo_total_usd.jobs_sem_medicao, 0);
  assert.strictEqual(metrics.cobertura_custo_pct.valor, 100);
});

test('custo total declara entregas sem medição e a cobertura conta zero como medido', () => {
  const base = { wave: 'onda1', agent: 'cc', worktree: 'C:\\repo', escrita: false };
  const ledger = [0, null, null].flatMap((cost, index) => {
    const shared = { ...base, job_id: 'cobertura-' + index };
    const terminal = {
      ...shared, event: 'done', exit_code: 0, ts: `2026-07-26T13:0${index}:01.000Z`,
    };
    if (cost != null) terminal.cost_usd = cost;
    return [
      { ...shared, event: 'dispatched', ts: `2026-07-26T13:0${index}:00.000Z` },
      terminal,
    ];
  });
  const metrics = board.scorecard(deps({ ledger, keepResults: [] })).metricas;
  assert.strictEqual(metrics.custo_total_usd.valor, 0);
  assert.strictEqual(metrics.custo_total_usd.jobs_medidos, 1);
  assert.strictEqual(metrics.custo_total_usd.jobs_sem_medicao, 2);
  assert.strictEqual(metrics.cobertura_custo_pct.valor, 33.33);
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

test('interrupções excluem divergências e o MTO recebe a soma diária dos cross-checks', () => {
  const limiares = Array.from({ length: 4 }, (_, index) => ({
    ts: `2026-07-26T10:0${index}:00.000Z`, event: 'meo_interrupcao', motivo: 'limiar',
    metrica: 'wip_actual-' + index,
  }));
  const divergencias = Array.from({ length: 15 }, (_, index) => [
    { ts: `2026-07-26T12:${String(index).padStart(2, '0')}:00.000Z`, event: 'cross_check',
      job_id: 'div-' + index, divergencias_count: index + 1 },
    { ts: `2026-07-26T12:${String(index).padStart(2, '0')}:01.000Z`, event: 'meo_interrupcao',
      motivo: 'divergencia', metrica: 'cross_check' },
  ]).flat();
  const card = board.scorecard(deps({ ledger: [...limiares, ...divergencias], keepResults: [] }));

  assert.strictEqual(card.metricas.interrupcoes_por_dia.valor, 4);
  assert.match(card.metricas.interrupcoes_por_dia.porque, /exclui 15 evento\(s\) motivo=divergencia/i);
  assert.strictEqual(card.metricas.divergencias_por_dia.valor, 15);
  assert.deepStrictEqual(card.metricas.divergencias_por_dia.faixa, [0, 10]);
  assert.match(card.metricas.divergencias_por_dia.porque, /15 job\(s\).+soma de divergencias_count: 120/i);
  assert.strictEqual(card.excepcoes.find((item) => item.metrica === 'divergencias_por_dia').dono, 'MTO');
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
    /**
     * ⚠️ Eram 3 eventos; passaram a 4 — e o quarto é uma entrega da onda Y1,
     * não uma regressão. O `done` deste teste não tem jobDir, por isso o
     * `observeTerminal` recusa a observação — e essa recusa DEIXOU DE SER
     * SILENCIOSA: fica no ledger como `eta_observacao_recusada`. Era
     * exactamente o buraco que fazia o Codex aparecer com 10% de captura sem
     * ninguém saber porquê. O teste conta os quatro e prova qual é o novo, em
     * vez de aceitar um número maior sem perguntar de onde veio.
     */
    assert.strictEqual(card.ledger_eventos, 4);
    const eventos = fs.readFileSync(path.join(dir, 'ledger.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((linha) => JSON.parse(linha));
    const recusa = eventos.find((e) => e.event === 'eta_observacao_recusada');
    assert.ok(recusa, 'a recusa do observeTerminal voltou a desaparecer em silêncio');
    assert.ok(recusa.porque, 'a recusa entrou no ledger sem dizer porquê');
    const persistido = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'));
    assert.strictEqual(persistido.metricas.interrupcoes_por_dia.valor, 1);
    assert.strictEqual(persistido.ledger_eventos, 4);
  } finally {
    if (anterior == null) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = anterior;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scorecard tem pode_ir_dormir como primeira chave', () => {
  const card = board.scorecard(deps());
  const keys = Object.keys(card);
  assert.strictEqual(keys[0], 'pode_ir_dormir', 'pode_ir_dormir deve ser a primeira chave do objeto retornado');
});

test('K3: pressao_quota declara-se n/d quando calibrando é true', () => {
  const quotaState = {
    pressao: {
      valor: 0.7,
      calibrando: true,
      dias_historico: 3,
      porque: 'pressão de teste',
      referencia: { peso_semana: 4000 },
    },
  };
  const card = board.scorecard(deps({ quotaState }));
  const m = card.metricas.pressao_quota;
  assert.strictEqual(m.estado, 'n/d', 'pressao_quota deve ter estado n/d quando calibrando é true');
  assert.ok(/a calibrar/.test(m.porque), 'o porque deve mencionar que está a calibrar');
  assert.ok(/3\/7/.test(m.porque), 'o porque deve mostrar o progresso dos dias (3/7)');
  assert.strictEqual(m.valor, 0.7, 'o valor numérico não deve mudar — estado é que muda');
});

test('interrupcoes_por_dia: deduplicação por (métrica + dia) — oscilação no mesmo dia gera 1 interrupção', () => {
  const ledgerEvents = [];
  const opts = {
    agora: AGORA,
    ledgerAppend(event) { ledgerEvents.push(event); },
  };
  // Simula: wip_actual sai da faixa, volta a entrar, sai outra vez no mesmo dia
  board.registarInterrupcao({
    motivo: 'limiar', quem_pediu: 'MOO', metrica: 'wip_actual',
    o_que: 'métrica wip_actual fora da faixa [0, 5]: 6',
  }, opts);
  // Segunda chamada para a mesma métrica no mesmo dia — sem campo metrica no ledgerEvents
  // Simula: scorecard rodou novamente, wip_actual oscilou, tentou registar outra interrupção
  const cardComDedup = board.scorecard(deps({
    ledger: ledgerEvents,
    donos: { wip_actual: 'MOO' },
    persist: false,
    keepResults: [],
  }));
  // Apenas 1 interrupção deve estar registada (a primeira)
  assert.strictEqual(ledgerEvents.filter((e) => e.event === 'meo_interrupcao').length, 1);
});

test('interrupcoes_por_dia: duas métricas diferentes fora no mesmo dia geram 2 interrupções', () => {
  const ledgerEvents = [];
  const opts = {
    agora: AGORA,
    ledgerAppend(event) { ledgerEvents.push(event); },
  };
  board.registarInterrupcao({
    motivo: 'limiar', quem_pediu: 'MOO', metrica: 'wip_actual',
    o_que: 'métrica wip_actual fora da faixa [0, 5]: 6',
  }, opts);
  board.registarInterrupcao({
    motivo: 'limiar', quem_pediu: 'MTO', metrica: 'taxa_falha_pct',
    o_que: 'métrica taxa_falha_pct fora da faixa [0, 10]: 15',
  }, opts);
  assert.strictEqual(ledgerEvents.filter((e) => e.event === 'meo_interrupcao').length, 2);
  assert.ok(ledgerEvents.some((e) => e.event === 'meo_interrupcao' && e.metrica === 'wip_actual'));
  assert.ok(ledgerEvents.some((e) => e.event === 'meo_interrupcao' && e.metrica === 'taxa_falha_pct'));
});

test('interrupcoes_por_dia: métrica fora ontem e ainda fora hoje gera 0 novas interrupções hoje (guarda antiga)', () => {
  const dia_ontem = '2026-07-25T12:00:00.000Z';
  const dia_hoje = '2026-07-26T23:00:00.000Z';
  const ledgerComOntem = [
    {
      ts: dia_ontem, event: 'meo_interrupcao', motivo: 'limiar',
      o_que: 'métrica wip_actual fora da faixa [0, 5]: 6', quem_pediu: 'MOO', metrica: 'wip_actual',
    },
    ...ledger30().slice(0, 15),
  ];
  const anterior = board.scorecard(deps({
    ledger: ledgerComOntem.filter((e) => !e.ts || e.ts.slice(0, 10) === '2026-07-25'),
    agora: dia_ontem,
    persist: false,
  }));
  const hoje = board.scorecard(deps({
    ledger: ledgerComOntem,
    agora: dia_hoje,
    persist: false,
  }));
  // Verificar que a anterior tem wip_actual fora (ou n/d)
  const nInterrupcoesHoje = ledgerComOntem.filter((e) => e.event === 'meo_interrupcao' && String(e.ts || '').slice(0, 10) === '2026-07-26').length;
  // Não deve haver novas interrupções hoje para wip_actual porque já estava fora ontem
  assert.strictEqual(nInterrupcoesHoje, 0, 'nenhuma nova interrupção deve ser registada hoje se a métrica já estava fora ontem');
});

// --- W1 PASSO 3 · ledger_janela ------------------------------------------------
// Regressão do buraco de 2026-08-05: o ledger foi apagado e o painel continuou a
// publicar "entregas_por_dia" sobre uma janela de minutos sem o dizer. O defeito
// não é o número — é o denominador invisível. Estes testes falham em `main`
// (onde `ledgerJanela` não existe e as métricas agregadas não levam
// `dias_representados`) e passam com o fix.

test('ledgerJanela mede a profundidade real do ficheiro, não a que se assume', () => {
  const janela = board.ledgerJanela(ledger30());
  assert.strictEqual(janela.eventos, 30);
  assert.strictEqual(janela.dias_representados, 1);
  assert.strictEqual(typeof janela.dias_representados, 'number',
    'dias_representados é um número — o consumidor decide como o mostra, não interpreta texto');
  assert.strictEqual(janela.primeiro_ts, '2026-07-26T12:00:00.000Z');
  assert.strictEqual(janela.ultimo_ts, '2026-07-26T13:31:00.000Z');
  assert.match(janela.porque, /janela real do ficheiro/);
});

test('ledgerJanela conta dias UTC distintos, não o intervalo entre extremos', () => {
  const doisDias = [
    { ts: '2026-08-04T23:59:00.000Z', event: 'done' },
    { ts: '2026-08-05T00:01:00.000Z', event: 'done' },
  ];
  // 2 minutos de intervalo real, mas 2 dias UTC representados — e vice-versa:
  // 23h no mesmo dia continuam a ser 1. Confundir os dois é o bug.
  assert.strictEqual(board.ledgerJanela(doisDias).dias_representados, 2);
  assert.strictEqual(board.ledgerJanela([
    { ts: '2026-08-05T00:30:00.000Z', event: 'done' },
    { ts: '2026-08-05T23:30:00.000Z', event: 'done' },
  ]).dias_representados, 1);
});

test('ledger vazio ou sem ts válido devolve janela n/d com porquê — nunca um dia inventado', () => {
  const vazio = board.ledgerJanela([]);
  assert.strictEqual(vazio.primeiro_ts, null);
  assert.strictEqual(vazio.ultimo_ts, null);
  assert.strictEqual(vazio.dias_representados, 0);
  assert.strictEqual(vazio.eventos, 0);
  assert.match(vazio.porque, /não tem eventos/);

  const semTs = board.ledgerJanela([{ event: 'done' }, { ts: 'não é uma data', event: 'done' }]);
  assert.strictEqual(semTs.eventos, 2, 'os eventos contam-se mesmo quando o ts é inutilizável');
  assert.strictEqual(semTs.dias_representados, 0);
  assert.strictEqual(semTs.primeiro_ts, null);
  assert.match(semTs.porque, /indetermin/);
});

test('toda a métrica agregada viaja com dias_representados ao lado (regra dura da W1)', () => {
  const card = board.scorecard(deps());
  assert.strictEqual(card.ledger_janela.dias_representados, 1);
  assert.strictEqual(card.fontes.ledger.dias_representados, 1);
  // W1 :131 — um denominador de minutos apresentado como um dia é a mesma classe
  // de mentira que um snapshot apresentado como leitura viva.
  for (const nome of ['entregas_por_dia', 'taxa_falha_pct', 'custo_por_tarefa_entregue_usd', 'trabalho_zero_pct']) {
    assert.strictEqual(card.metricas[nome].dias_representados, 1,
      `${nome} publicada sem dias_representados — o denominador volta a ficar invisível`);
  }
});

test('uma janela de minutos não se disfarça de dia inteiro', () => {
  // 3 entregas em 12 minutos: entregas_por_dia diz 3, e só dias_representados
  // impede que isso seja lido como "3 por dia" sobre história real.
  const curto = [0, 1, 2].flatMap((i) => {
    const comum = { job_id: 'curto' + i, wave: 'w', agent: 'moo', worktree: 'C:\\repo', goal: 'g', escrita: true };
    return [
      { ...comum, event: 'dispatched', ts: `2026-08-05T09:0${i}:00.000Z` },
      { ...comum, event: 'done', exit_code: 0, ts: `2026-08-05T09:0${i}:30.000Z` },
    ];
  });
  const card = board.scorecard(deps({ ledger: curto, keepResults: [] }));
  assert.strictEqual(card.metricas.entregas_por_dia.valor, 3);
  assert.strictEqual(card.metricas.entregas_por_dia.dias_representados, 1);
  assert.strictEqual(card.ledger_janela.primeiro_ts, '2026-08-05T09:00:00.000Z');
  assert.strictEqual(card.ledger_janela.ultimo_ts, '2026-08-05T09:02:30.000Z');
  assert.strictEqual(card.ledger_janela.eventos, 6);
});

test('interrupcoes_por_dia: mesma métrica em dias UTC diferentes gera 1 interrupção por dia', () => {
  const ledgerEvents = [];
  const opts1 = {
    agora: '2026-07-26T12:00:00.000Z',
    ledgerAppend(event) { ledgerEvents.push(event); },
  };
  const opts2 = {
    agora: '2026-07-27T12:00:00.000Z',
    ledgerAppend(event) { ledgerEvents.push(event); },
  };
  // Dia 1: registar interrupção
  board.registarInterrupcao({
    motivo: 'limiar', quem_pediu: 'MOO', metrica: 'wip_actual',
    o_que: 'métrica wip_actual fora da faixa [0, 5]: 6',
  }, opts1);
  // Dia 2: registar outra para a mesma métrica (dia diferente)
  board.registarInterrupcao({
    motivo: 'limiar', quem_pediu: 'MOO', metrica: 'wip_actual',
    o_que: 'métrica wip_actual fora da faixa [0, 5]: 7',
  }, opts2);
  // Deve haver 2 interrupções (1 por dia)
  assert.strictEqual(ledgerEvents.filter((e) => e.event === 'meo_interrupcao').length, 2);
  const dia1 = ledgerEvents.filter((e) => e.event === 'meo_interrupcao' && e.ts.slice(0, 10) === '2026-07-26').length;
  const dia2 = ledgerEvents.filter((e) => e.event === 'meo_interrupcao' && e.ts.slice(0, 10) === '2026-07-27').length;
  assert.strictEqual(dia1, 1, 'deve haver 1 interrupção no dia 1');
  assert.strictEqual(dia2, 1, 'deve haver 1 interrupção no dia 2');
});
