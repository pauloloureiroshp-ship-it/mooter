'use strict';

/**
 * DIETA E SCHEMA — Wave J-0d / J-5 (2026-07-31)
 *
 * Estes testes existem por causa de três medições feitas no conector v1.29.1 em
 * produção, não por causa de uma suspeita:
 *
 *  1. `mooter_fleet view=recibo` ≈ 11 KB, dos quais 7 dos 8 blocos de cargo
 *     diziam «nenhum trabalho deste cargo na janela» com ~1 KB de zeros cada.
 *  2. `mooter_fleet view=jobs` ≈ 40 KB porque o MESMO goal aparecia 4 vezes.
 *  3. `sessao` tinha um slot único e o handoff só existia em moo→nuvem, ambos
 *     porque faltava uma linha no schema — o código já suportava os dois.
 *
 * A regra que estes testes defendem: a dieta pode ENCURTAR, nunca ESCONDER.
 * Uma primeira tentativa suprimiu os blocos vazios e partiu 5 testes — entre
 * eles a garantia da v1.22 de que nenhum agregado nasce a zero sem explicação.
 * Estes testes existem para que essa lição não se perca.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const recibo = require('./recibo.js');
const fleet = require('./fleet.js');
const tools = require('./tools6.js');

const T0 = Date.parse('2026-07-31T09:00:00.000Z');
const AGORA = '2026-07-31T10:00:00.000Z';

function evento(jobId, event, extra, minuto) {
  return Object.assign({
    job_id: jobId, event, ts: new Date(T0 + (minuto || 0) * 60000).toISOString(),
  }, extra || {});
}

function ledgerComUmJob() {
  return [
    evento('a', 'dispatched', { wave: 'w1', cargo: 'MTO', cargo_porque: 'declarado', local: true }, 1),
    evento('a', 'done', { wave: 'w1', cargo: 'MTO', cargo_porque: 'declarado', local: true, cost_usd: 0 }, 2),
  ];
}

const EXCEPCOES = [
  { metrica: 'trabalho_zero_pct', dono: 'MOO' },
  { metrica: 'pressao_quota', dono: 'MFO' },
];

function opcoes(extra) {
  return Object.assign({ periodo: 'dia', agora: AGORA, excepcoes: EXCEPCOES }, extra || {});
}

// ───────────────────────────────────────────── recibo: encurtar, não esconder ──

test('D1 — o bloco de um cargo sem trabalho encolhe mas continua a dizer zero e porquê', () => {
  const p = recibo.project(ledgerComUmJob(), opcoes());
  const vazio = p.cargos.find((c) => c.cargo === 'MRO');

  assert.equal(vazio.sem_trabalho, true, 'o bloco compacto identifica-se');
  assert.equal(vazio.waves.valor, 0);
  assert.equal(vazio.entregas.valor, 0);
  assert.equal(vazio.custo.valor, 0);
  assert.match(vazio.porque, /nenhum trabalho/i, 'o porquê do topo continua lá');
  assert.match(vazio.custo.porque, /nenhum job/i, 'a soma vazia continua explicada');
});

test('D2 — uma excepção aberta NUNCA desaparece por o cargo não ter trabalho', () => {
  const p = recibo.project(ledgerComUmJob(), opcoes());
  const moo = p.cargos.find((c) => c.cargo === 'MOO');
  const mfo = p.cargos.find((c) => c.cargo === 'MFO');

  assert.equal(moo.sem_trabalho, true, 'MOO não teve trabalho na janela');
  assert.equal(moo.excepcoes.length, 1, 'e mesmo assim a excepção sobrevive');
  assert.equal(moo.excepcoes[0].metrica, 'trabalho_zero_pct');
  assert.match(moo.excepcoes_porque, /preservada/i, 'e a preservação é explicada');

  assert.equal(mfo.excepcoes.length, 1);
  assert.equal(mfo.excepcoes[0].dono, 'MFO');
});

test('D3 — nenhum cargo desaparece da lista: continuam os 7', () => {
  const p = recibo.project(ledgerComUmJob(), opcoes());
  assert.equal(p.cargos.length, recibo.VALID_CARGOS.length);
  for (const nome of recibo.VALID_CARGOS) {
    assert.ok(p.cargos.some((c) => c.cargo === nome), 'falta o cargo ' + nome);
  }
});

test('D4 — verbose:true devolve o bloco por extenso, com os campos que a dieta omite', () => {
  const led = ledgerComUmJob();
  const compacto = recibo.project(led, opcoes());
  const extenso = recibo.project(led, opcoes({ verbose: true }));

  const vazioCompacto = compacto.cargos.find((c) => c.cargo === 'MRO');
  const vazioExtenso = extenso.cargos.find((c) => c.cargo === 'MRO');

  assert.equal(vazioExtenso.sem_trabalho, undefined, 'no extenso não há marca de compactação');
  assert.ok(vazioExtenso.trabalho_a_zero.tokens_locais, 'o extenso traz os tokens locais');
  assert.equal(vazioCompacto.trabalho_a_zero.tokens_locais, undefined, 'o compacto omite-os');
  assert.ok(Array.isArray(vazioExtenso.passou_trabalho_a), 'o extenso traz os handoffs');
});

test('D5 — a dieta corta pelo menos 40% do recibo quando há cargos parados', () => {
  const led = ledgerComUmJob();
  const compacto = JSON.stringify(recibo.project(led, opcoes())).length;
  const extenso = JSON.stringify(recibo.project(led, opcoes({ verbose: true }))).length;
  const reducao = 100 - (100 * compacto) / extenso;

  assert.ok(extenso > compacto, 'o compacto tem de ser menor que o extenso');
  assert.ok(reducao >= 40, 'redução medida foi de apenas ' + reducao.toFixed(1) + '%');
});

test('D6 — um cargo COM trabalho mantém o bloco completo', () => {
  const p = recibo.project(ledgerComUmJob(), opcoes());
  const mto = p.cargos.find((c) => c.cargo === 'MTO');

  assert.equal(mto.sem_trabalho, undefined, 'quem trabalhou não é compactado');
  assert.ok(mto.trabalho_a_zero.tokens_locais, 'e mantém os tokens locais');
  assert.equal(mto.trabalho_a_zero.jobs.total, 1);
});

// ─────────────────────────────────────────────── fleet: o goal deixa de repetir ──

test('D7 — um goal longo é cortado e declara quantos caracteres tinha', () => {
  const longo = 'WAVE J — '.repeat(80);
  const cortado = fleet._resumoGoal(longo, false);

  assert.equal(typeof cortado, 'object', 'um goal longo passa a resumo estruturado');
  assert.ok(cortado.resumo.length < longo.length, 'o resumo é mais curto que o original');
  assert.equal(cortado.goal_chars, longo.length, 'o comprimento original nunca se perde');
  assert.match(cortado.porque, /verbose/i, 'e diz como obter o texto completo');
});

test('D8 — verbose:true devolve o goal completo, sem tocar numa vírgula', () => {
  const longo = 'WAVE J — '.repeat(80);
  assert.equal(fleet._resumoGoal(longo, true), longo);
});

test('D9 — um goal curto passa intacto: a dieta não mexe no que já é pequeno', () => {
  const curto = 'lê o worktrees.js e diz se valida frescura';
  assert.equal(fleet._resumoGoal(curto, false), curto);
});

test('D10 — o corte prefere a primeira linha, que é onde vive o título do trabalho', () => {
  const goal = 'WAVE J-1 "A RÉGUA" — fazer o Mooter reter memória\n\n' + 'detalhe irrelevante. '.repeat(60);
  const cortado = fleet._resumoGoal(goal, false);
  assert.match(cortado.resumo, /^WAVE J-1 "A RÉGUA"/, 'a primeira linha sobrevive inteira');
  assert.ok(!cortado.resumo.includes('detalhe irrelevante'), 'o corpo não entra no resumo');
});

test('D11 — goal nulo continua nulo: a dieta nunca inventa um resumo', () => {
  assert.equal(fleet._resumoGoal(null, false), null);
  assert.equal(fleet._resumoGoal(undefined, false), null);
});

// ────────────────────────────────────────── schema: as linhas que faltavam ──

/**
 * `build(seam, fleet, base)` lê `seam.VALID_CARGOS` ao montar o schema, por isso
 * não se pode chamar sem dependências. Passamos os módulos reais: o objectivo
 * é validar o schema que o conector serve de facto, não uma imitação dele.
 */
function todasAsTools() {
  return tools.build(require('./seamless.js'), fleet, {});
}

function schemaDe(nome) {
  const encontrada = todasAsTools().find((t) => t && t.name === nome);
  assert.ok(encontrada, 'não encontrei a tool ' + nome);
  return encontrada.inputSchema.properties;
}

test('D12 — mooter_setup aceita `id`: sem isto todas as sessões partilham um slot', () => {
  const props = schemaDe('mooter_setup');
  assert.ok(props.id, 'o schema tem de expor `id` — o sessao.js já o lia e o schema rejeitava-o');
  assert.equal(props.id.type, 'string');
});

test('D13 — mooter_work aceita `handoff_from`: sem isto o handoff só ia moo→nuvem', () => {
  const props = schemaDe('mooter_work');
  assert.ok(props.handoff_from, 'o schema tem de expor `handoff_from` — o toolDispatch já o aceitava');
  assert.equal(props.handoff_from.type, 'string');
});

test('D14 — mooter_fleet aceita `verbose`: a dieta tem de ter marcha-atrás', () => {
  const props = schemaDe('mooter_fleet');
  assert.ok(props.verbose, 'sem `verbose` no schema a dieta seria irreversível');
  assert.equal(props.verbose.type, 'boolean');
});

test('D15 — os schemas continuam fechados: additionalProperties never true', () => {
  for (const t of todasAsTools()) {
    if (!t || !t.inputSchema) continue;
    assert.equal(t.inputSchema.additionalProperties, false,
      t.name + ' deixou de recusar propriedades desconhecidas');
  }
});
