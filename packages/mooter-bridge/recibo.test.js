'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const receipt = require('./recibo.js');
const seamless = require('./seamless.js');
const tools6 = require('./tools6.js');

const START = Date.parse('2026-07-28T10:00:00.000Z');

function event(jobId, state, extra, seconds) {
  return Object.assign({
    ts: new Date(START + Number(seconds || 0) * 1000).toISOString(),
    job_id: jobId,
    wave: 'w1',
    agent: 'cc',
    event: state,
  }, extra || {});
}

function scope(extra) {
  return Object.assign({
    periodo: 'sessao',
    desde: '2026-07-28T09:00:00.000Z',
    agora: '2026-07-28T12:00:00.000Z',
    excepcoes: [],
  }, extra || {});
}

function cargo(result, name) {
  return result.cargos.find((item) => item.cargo === name);
}

test('S1 — wave sem cargo fica n/d com porquê e o texto nunca decide o cargo', () => {
  const common = {
    wave: 'sem-cargo', agent: 'cc', cargo: null,
    cargo_porque: 'n/d — cargo não declarado por quem disparou; nunca inferido do texto',
    goal: 'o MFO deve analisar este custo',
  };
  const ledger = [
    event('novo-sem-cargo', 'dispatched', common, 0),
    event('novo-sem-cargo', 'done', Object.assign({}, common, { cost_usd: 0.2 }), 1),
  ];
  const result = receipt.project(ledger, scope());
  assert.equal(result.sem_cargo.waves.valor, 1);
  assert.match(result.sem_cargo.porque, /não declarado/i);
  assert.equal(cargo(result, 'MFO').waves.valor, 0, 'inferiu MFO a partir do goal');
});

test('S1 — cargo inválido é recusado com a lista completa dos válidos', async () => {
  const normalized = seamless._normalizarCargo('CEO');
  assert.equal(normalized.ok, false);
  assert.deepEqual(normalized.cargos_validos, receipt.VALID_CARGOS);
  assert.match(normalized.error, /MOO.*MTO.*MFO.*MIO.*MRO.*MCC.*MEO/);
  const result = await seamless.toolWork({ goal: 'faz uma leitura curta', cargo: 'CEO' });
  assert.match(result.error, /cargo.*desconhecido/i);
  assert.deepEqual(result.cargos_validos, receipt.VALID_CARGOS);
});

test('S1 — todos os eventos novos de um job herdam o cargo declarado', () => {
  const previousHome = process.env.MOOTER_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-cargo-'));
  process.env.MOOTER_HOME = home;
  const jobId = 'cargo-' + Date.now();
  try {
    seamless.ledgerAppend(event(jobId, 'dispatched', {
      cargo: 'MIO', cargo_porque: 'declarado por quem disparou', local: false,
    }, 0));
    seamless.ledgerAppend(event(jobId, 'started', {}, 1));
    seamless.ledgerAppend(event(jobId, 'done', { cost_usd: 0.1 }, 2));
    const events = seamless.ledgerRead().filter((item) => item.job_id === jobId);
    assert.ok(events.length >= 3, 'inclui também recibos de diagnóstico do job');
    assert.ok(events.every((item) => item.cargo === 'MIO'));
    assert.ok(events.every((item) => item.cargo_porque === 'declarado por quem disparou'));
  } finally {
    if (previousHome === undefined) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S2 — três jobs done na mesma wave contam como uma entrega', () => {
  const ledger = [];
  for (let index = 0; index < 3; index++) {
    const common = { wave: 'uma-entrega', cargo: 'MTO', cargo_porque: 'declarado', local: false };
    ledger.push(event('job-' + index, 'dispatched', common, index * 2));
    ledger.push(event('job-' + index, 'done', Object.assign({}, common, { cost_usd: 0.1 }), index * 2 + 1));
  }
  const result = receipt.project(ledger, scope());
  assert.equal(cargo(result, 'MTO').waves.valor, 1);
  assert.equal(cargo(result, 'MTO').entregas.valor, 1);
});

test('S2 — cargo sem trabalho aparece com zero e porquê', () => {
  const ledger = [
    event('mto', 'dispatched', { cargo: 'MTO', cargo_porque: 'declarado', local: false }, 0),
    event('mto', 'done', { cargo: 'MTO', cargo_porque: 'declarado', local: false, cost_usd: 0.1 }, 1),
  ];
  const empty = cargo(receipt.project(ledger, scope()), 'MRO');
  assert.equal(empty.waves.valor, 0);
  assert.equal(empty.entregas.valor, 0);
  assert.equal(empty.custo.valor, 0);
  assert.match(empty.porque, /nenhum trabalho/i);
  assert.match(empty.custo.porque, /nenhum job/i);
});

test('S2 — custo fica parcial quando há jobs sem medição', () => {
  const common = { wave: 'custo-parcial', cargo: 'MFO', cargo_porque: 'declarado', local: false };
  const ledger = [
    event('medido', 'dispatched', common, 0),
    event('medido', 'done', Object.assign({}, common, { cost_usd: 0.3 }), 1),
    event('sem-medicao', 'dispatched', common, 2),
    event('sem-medicao', 'done', common, 3),
  ];
  const cost = cargo(receipt.project(ledger, scope()), 'MFO').custo;
  assert.equal(cost.valor, 0.3);
  assert.equal(cost.parcial, true);
  assert.equal(cost.jobs_medidos, 1);
  assert.equal(cost.jobs_sem_medicao, 1);
  assert.match(cost.porque, /parcial/i);
});

test('S2 — handoff mostra from → to, agentes e poupança medida', () => {
  const common = { wave: 'handoff', cargo: 'MTO', cargo_porque: 'declarado' };
  const ledger = [
    event('prep', 'dispatched', Object.assign({}, common, { agent: 'moo', local: true }), 0),
    event('prep', 'done', Object.assign({}, common, {
      agent: 'moo', local: true, cost_usd: 0, tokens_out: 40,
      tokens_poupados_estimados: 120,
      tokens_poupados_estimados_nota: 'estimativa local registada',
    }), 1),
    event('cloud', 'dispatched', Object.assign({}, common, {
      agent: 'cc', local: false, handoff_from: 'prep',
    }), 2),
    event('cloud', 'done', Object.assign({}, common, {
      agent: 'cc', local: false, handoff_from: 'prep', cost_usd: 0.2,
    }), 3),
  ];
  const handoff = cargo(receipt.project(ledger, scope()), 'MTO').passou_trabalho_a[0];
  assert.equal(handoff.seta, 'prep → cloud');
  assert.equal(handoff.agente_from, 'moo');
  assert.equal(handoff.agente_to, 'cc');
  assert.equal(handoff.poupanca.valor, 120);
});

test('S2 — excepções do board só aparecem no cargo dono', () => {
  const exceptions = [
    { metrica: 'pressao_quota', dono: 'MFO' },
    { metrica: 'taxa_falha_pct', dono: 'MTO' },
  ];
  const result = receipt.project([], scope({ excepcoes: exceptions }));
  assert.deepEqual(cargo(result, 'MFO').excepcoes.map((item) => item.metrica), ['pressao_quota']);
  assert.deepEqual(cargo(result, 'MTO').excepcoes.map((item) => item.metrica), ['taxa_falha_pct']);
  assert.deepEqual(cargo(result, 'MEO').excepcoes, []);
});

test('S4 — moo em baixo não derruba o recibo nem altera um número', async () => {
  const ledger = [
    event('feito', 'dispatched', { cargo: 'MOO', cargo_porque: 'declarado', local: true }, 0),
    event('feito', 'done', { cargo: 'MOO', cargo_porque: 'declarado', local: true, cost_usd: 0, tokens_out: 20 }, 1),
  ];
  const factual = receipt.project(ledger, scope());
  const result = await receipt.generate(Object.assign(scope(), {
    ledger,
    scorecard: { excepcoes: [] },
    pedirVeredicto: async () => { throw new Error('Ollama down'); },
  }));
  assert.equal(result.veredicto.valor, null);
  assert.equal(result.veredicto.texto, 'n/d — o moo não respondeu');
  assert.deepEqual(result.cargos, factual.cargos);
  assert.deepEqual(result.sem_cargo, factual.sem_cargo);
});

test('S1/S5 — histórico anterior à instrumentação fica n/d e não é reclassificado', () => {
  const ledger = [
    event('historico', 'dispatched', { wave: 'antiga', goal: 'trabalho de custos do MFO' }, 0),
    event('historico', 'done', { wave: 'antiga', goal: 'trabalho de custos do MFO', cost_usd: 0.4 }, 1),
  ];
  const result = receipt.project(ledger, scope());
  assert.equal(result.sem_cargo.waves.valor, 1);
  assert.match(result.sem_cargo.porque, /anterior à instrumentação/i);
  assert.equal(cargo(result, 'MFO').waves.valor, 0);
});

test('S2 — o mesmo gerador suporta sessão, dia e semana', () => {
  assert.equal(receipt.buildWindow(scope({ periodo: 'sessao' })).periodo, 'sessao');
  assert.equal(receipt.buildWindow({ periodo: 'dia', agora: '2026-07-28T12:00:00Z' }).periodo, 'dia');
  assert.equal(receipt.buildWindow({ periodo: 'semana', agora: '2026-07-28T12:00:00Z' }).periodo, 'semana');
  assert.throws(() => receipt.buildWindow({ periodo: 'sessao', agora: '2026-07-28T12:00:00Z' }), /desde é obrigatório/);
});

test('S3 — pulso só nasce quando toda a wave está terminal e cabe em três linhas', async () => {
  const common = { wave: 'pulso', cargo: 'MOO', cargo_porque: 'declarado', agent: 'moo', local: true };
  const open = [
    event('a', 'dispatched', common, 0),
    event('a', 'done', Object.assign({}, common, { cost_usd: 0, tokens_out: 10 }), 1),
    event('b', 'dispatched', common, 2),
    event('b', 'started', common, 3),
  ];
  assert.equal(receipt.pulse(open, 'pulso'), null);
  const closed = open.concat(event('b', 'done', Object.assign({}, common, { cost_usd: 0, tokens_out: 5 }), 4));
  const pulse = receipt.pulse(closed, 'pulso');
  assert.equal(pulse.cargo, 'MOO');
  assert.deepEqual(pulse.agentes, ['moo']);
  assert.equal(pulse.custo.valor, 0);
  assert.equal(pulse.moo_a_zero.jobs.valor, 2);
  assert.ok(pulse.resumo.split('\n').length <= 3);

  const seam = {
    VALID_CARGOS: receipt.VALID_CARGOS,
    ledgerRead: () => closed,
    toolStatus: async () => ({ jobs: [{ job_id: 'a', wave: 'pulso', last: 'done' }] }),
    toolCollect: async () => ({}),
  };
  const check = tools6.build(seam, {}, {}).find((tool) => tool.name === 'mooter_check');
  const checked = await check.handler({ wave: 'pulso' });
  assert.equal(checked.pulso.wave, 'pulso');
});
test('S2 — uma wave não vira entrega se tiver um job fora da janela ainda aberto', () => {
  const common = { wave: 'atravessa-janela', cargo: 'MTO', cargo_porque: 'declarado', local: false };
  const oldOpen = event('antigo-aberto', 'dispatched', common, 0);
  oldOpen.ts = '2026-07-28T08:00:00.000Z';
  const ledger = [
    oldOpen,
    event('novo-feito', 'dispatched', common, 0),
    event('novo-feito', 'done', Object.assign({}, common, { cost_usd: 0.1 }), 1),
  ];
  const result = receipt.project(ledger, scope());
  assert.equal(cargo(result, 'MTO').waves.valor, 1);
  assert.equal(cargo(result, 'MTO').entregas.valor, 0);
});
/**
 * ⚠️ Duas garantias que estavam escritas e não impostas. Um refutador construiu
 * os dois contra-exemplos em 2026-07-28, e ambos passavam.
 */
test('D7 — o veredicto recebe uma cópia congelada e não consegue mexer num número', async () => {
  const agora = new Date().toISOString();
  const out = await receipt.gerar({
    ledger: [{ event: 'done', job_id: 'j1', agent: 'moo', wave: 'w1', cargo: 'MTO', cost_usd: 0.05, ts: agora }],
    pedirVeredicto: (r) => {
      try { r.cargos.find((c) => c.cargo === 'MTO').custo.valor = 999999; } catch { /* congelado */ }
      return 'tentei alterar o custo';
    },
  });
  const mto = out.cargos.find((c) => c.cargo === 'MTO');
  assert.notStrictEqual(mto.custo.valor, 999999, 'a opinião conseguiu corromper um facto');
  assert.strictEqual(mto.custo.valor, 0.05);
});

test('D6 — um moo PENDURADO (que nunca resolve) não bloqueia o recibo', async () => {
  const agora = new Date().toISOString();
  const t0 = Date.now();
  const out = await receipt.gerar({
    ledger: [{ event: 'done', job_id: 'j2', agent: 'moo', wave: 'w2', cargo: 'MIO', ts: agora }],
    pedirVeredicto: () => new Promise(() => {}), // nunca resolve, nunca rejeita
    veredictoTimeoutMs: 300,
  });
  assert.ok(Date.now() - t0 < 5_000, 'o generate ficou preso à espera do moo');
  assert.strictEqual(out.cargos.length, receipt.VALID_CARGOS.length, 'o recibo saiu incompleto');
  assert.match(out.veredicto.texto, /n\/d/);
});
