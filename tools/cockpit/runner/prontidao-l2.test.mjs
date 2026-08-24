/**
 * prontidao-l2.test.mjs — o relatorio nao pode mentir na direccao confortavel.
 *
 * Um instrumento que mede a distancia a um objectivo tem uma tentacao muito
 * concreta: converter "ainda nao ha dados" em "0%", porque 0% e um numero e n/d
 * nao e. Estes testes existem para trancar o contrario.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-prontidao-'));
process.env.MOOTER_HOME = HOME_TMP;

const { prontidao, proveniencia } = await import('./prontidao-l2.mjs');
const { MIN_TRIADOS, AUDITORIA_1_EM, naAmostraDeAuditoria } = await import('./autopilot.mjs');

const achado = (chave, o = {}) => ({
  ts: '2026-08-20T10:00:00Z', pilar: 'P2', chave,
  ficheiro: 'tools/x.js', janela: '10-20', verdict: 'citacao-ok', conclusao: 'achado',
  evidencia: 'tools/x.js:12 => n = 5', resultado_resumo: 'ACHADO: x', ...o,
});
const dec = (o) => ({ decisao: 'aceite', ...o });

/* ───────────────────────── proveniencia ───────────────────────── */

test('PROVENIENCIA: os voids em massa nao se disfarcam de triagem do dono', () => {
  const d = new Map([
    ['a', dec({ por: 'dono' })],
    ['b', dec({ por: 'claude', decisao: 'descartado', motivo: 'instrumento-nao-discrimina' })],
    ['c', dec({ por: 'claude', decisao: 'descartado', motivo: 'nao-e-um-problema' })],
    ['d', dec({ por: 'agente', decisao: 'descartado', motivo: 'trivial' })],
    ['e', dec({})],
  ]);
  const p = proveniencia(d);
  assert.equal(p.dono, 1);
  assert.equal(p.varredura_ensaio, 1, 'claude + instrumento-nao-discrimina = varredura do ensaio');
  assert.equal(p.filtro_mecanico, 1, 'claude + nao-e-um-problema e filtro mecanico, com balde proprio');
  assert.equal(p.agente, 1);
  assert.equal(p.sem_assinatura, 1, 'sem `por` cai no seu proprio balde — nunca no do dono');
});

test('PROVENIENCIA: um ledger vazio nao inventa baldes', () => {
  const p = proveniencia(new Map());
  assert.deepEqual(p, { dono: 0, varredura_ensaio: 0, filtro_mecanico: 0, agente: 0, outro: 0, sem_assinatura: 0 });
  assert.deepEqual(proveniencia(null), p, 'sem mapa nenhum tambem nao rebenta');
});

/* ───────────────────────── prontidao ───────────────────────── */

/**
 * O caso medido no device real a 2026-08-24: 1448 decisoes, ZERO do dono. O
 * painel dizia-lhe "you keep 0% of what it finds". Dizer 0% a quem nunca
 * decidiu nada e acusa-lo de um juizo que ele nao fez.
 */
test('SEM DADOS: a precisao e null, nunca 0 — a diferenca entre informar e acusar', () => {
  const receipts = Array.from({ length: 50 }, (_, i) => achado(`k${i}`));
  const decisoes = new Map(receipts.slice(0, 40).map((r) => [
    r.chave, dec({ por: 'claude', decisao: 'descartado', motivo: 'instrumento-nao-discrimina' }),
  ]));
  const r = prontidao({ receipts, decisoes });
  assert.equal(r.triados_pelo_dono, 0);
  assert.equal(r.precisao, null, 'null, e nao 0');
  assert.notEqual(r.precisao, 0);
  assert.equal(r.faltam, MIN_TRIADOS);
  assert.equal(r.portao.aberto, false);
  assert.match(r.portao.porque_fechado, /no data yet/);
  assert.equal(r.proveniencia.varredura_ensaio, 40);
  assert.equal(r.proveniencia.dono, 0);
});

test('COM DADOS DO DONO: a precisao e a dele, e as dos agentes nao a movem', () => {
  const receipts = Array.from({ length: 100 }, (_, i) => achado(`k${i}`));
  const decisoes = new Map();
  // 20 decisoes do dono: 15 aceites + 2 issues mantidos, 3 descartados => 85%.
  for (let i = 0; i < 15; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'aceite' }));
  for (let i = 15; i < 17; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'issue' }));
  for (let i = 17; i < 20; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'descartado', motivo: 'trivial' }));
  // E 60 de um script, que nao podem tocar no numero dele.
  for (let i = 20; i < 80; i += 1) decisoes.set(`k${i}`, dec({ por: 'claude', decisao: 'descartado', motivo: 'instrumento-nao-discrimina' }));

  const r = prontidao({ receipts, decisoes });
  assert.equal(r.triados_pelo_dono, 20);
  assert.equal(r.mantidos, 17);
  assert.equal(Math.round(r.precisao), 85);
  assert.equal(r.faltam, 0);
  assert.equal(r.portao.aberto, true, '20 decisoes a 85% passam os dois criterios');
  assert.equal(r.proveniencia.varredura_ensaio, 60, 'contadas, mas fora do numero dele');
});

test('o dono a deitar tudo fora fecha o portao — e a mensagem e sobre ELE, com dados', () => {
  const receipts = Array.from({ length: 30 }, (_, i) => achado(`k${i}`));
  const decisoes = new Map();
  for (let i = 0; i < 5; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'aceite' }));
  for (let i = 5; i < 25; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'descartado', motivo: 'trivial' }));
  const r = prontidao({ receipts, decisoes });
  assert.equal(r.triados_pelo_dono, 25);
  assert.equal(Math.round(r.precisao), 20);
  assert.equal(r.portao.aberto, false, '20% esta muito abaixo da barra');
  assert.match(r.portao.porque_fechado, /you keep 20%/, 'aqui SIM: ha dados, e o numero e dele');
});

/* ─────────────── de onde saem as decisoes que faltam ─────────────── */

/**
 * O TESTE QUE ESTAVA AQUI ERA CIRCULAR e o adversario da FASE 3 disse-o: repetia
 * a formula do codigo e verificava que nao existia um campo chamado `previsao`.
 * Verificar que uma mentira nao esta escrita com aquele nome nao prova que ela
 * nao esta escrita.
 *
 * O que se prova agora e a propriedade que interessa: o numero NAO e aritmetica.
 * 160 chaves diferentes dao contagens diferentes — logo o campo tem de se
 * chamar expectativa e trazer os pressupostos, e e isso que se assere.
 */
test('EXPECTATIVA: o numero de achados novos NAO e uma conta — a prova', () => {
  const contagens = ['P2.future-', 'x-', 'P9.abc|f'].map(
    (pfx) => Array.from({ length: 160 }, (_, i) => `${pfx}${i}`).filter((k) => naAmostraDeAuditoria(k)).length,
  );
  assert.ok(new Set(contagens).size > 1,
    `160 chaves deviam dar contagens DIFERENTES conforme o hash, e deram ${JSON.stringify(contagens)}`);
  const previstoPelaFormula = 160 / AUDITORIA_1_EM;
  assert.ok(contagens.some((n) => n !== previstoPelaFormula),
    'se todas batessem com 160/N, entao seria mesmo aritmetica e o nome antigo estaria certo');
});

test('EXPECTATIVA: o campo chama-se expectativa e traz os pressupostos a vista', () => {
  const receipts = Array.from({ length: 40 }, (_, i) => achado(`P2.${i}|f${i}.js:1-9:s${i}`));
  const r = prontidao({ receipts, decisoes: new Map() });
  assert.ok('achados_novos_em_expectativa' in r);
  assert.ok(!('achados_novos_necessarios' in r), 'o nome antigo prometia uma certeza que nao existe');
  assert.ok(Array.isArray(r.expectativa_pressupostos) && r.expectativa_pressupostos.length >= 3,
    'um numero de expectativa sem os pressupostos escritos e um numero disfarcado de conta');
  // E o relatorio continua sem campo de data ou prazo nenhum.
  for (const proibido of ['quando', 'eta', 'previsao', 'data', 'prazo']) {
    assert.ok(!(proibido in r), `uma data estimada seria a unica mentira que este relatorio podia contar: ${proibido}`);
  }
});

test('EXPECTATIVA: com a reserva a chegar, nao se pedem achados novos', () => {
  const receipts = Array.from({ length: 30 }, (_, i) => achado(`k${i}`));
  const decisoes = new Map();
  for (let i = 0; i < 20; i += 1) decisoes.set(`k${i}`, dec({ por: 'dono', decisao: 'aceite' }));
  const r = prontidao({ receipts, decisoes });
  assert.equal(r.faltam, 0);
  assert.equal(r.reserva_chega, true);
  assert.equal(r.achados_novos_em_expectativa, 0);
});

/**
 * Desde a FASE 2 a reserva olha para o alvo, e por isso a fila viva quase
 * sempre CHEGA. O caso "faltam achados novos" so aparece quando a fila e mesmo
 * mais curta do que o que o portao exige.
 */
test('EXPECTATIVA: so se pedem achados novos quando a fila e curta de mais', () => {
  const receipts = Array.from({ length: 5 }, (_, i) => achado(`k${i}`));
  const r = prontidao({ receipts, decisoes: new Map() });
  assert.equal(r.fila, 5);
  assert.equal(r.reservados, 5, 'reserva-se a fila inteira, e ainda assim nao chega');
  assert.equal(r.reserva_chega, false);
  assert.equal(r.achados_novos_em_expectativa, (MIN_TRIADOS - 5) * AUDITORIA_1_EM);
});

test('sem recibos nenhuns nada rebenta, e nada e inventado', () => {
  const r = prontidao({});
  assert.equal(r.triados_pelo_dono, 0);
  assert.equal(r.precisao, null);
  assert.equal(r.fila, 0);
  assert.equal(r.reservados, 0);
  assert.equal(r.portao.aberto, false);
  assert.equal(r.dreno.base, null, 'sem dreno datado nao ha linha de base');
});

/* ────────── os buracos que o adversario da FASE 3 encontrou ────────── */

/**
 * `proveniencia()` ignorava o `decisao`. O adversario passou um `aceite`, um
 * `issue` e um `descartado`, todos com `instrumento-nao-discrimina`, e os tres
 * sairam contados como "voids em massa". Um aceite NAO e um void.
 */
test('BURACO 1: um aceite do `claude` nao e um "void em massa"', () => {
  const d = new Map([
    ['a', dec({ decisao: 'aceite', por: 'claude', motivo: 'instrumento-nao-discrimina' })],
    ['b', dec({ decisao: 'issue', por: 'claude', motivo: 'instrumento-nao-discrimina' })],
    ['c', dec({ decisao: 'descartado', por: 'claude', motivo: 'instrumento-nao-discrimina' })],
  ]);
  const p = proveniencia(d);
  assert.equal(p.varredura_ensaio, 1, 'so o DESCARTE e um void');
  assert.equal(p.outro, 2, 'o aceite e o issue ficam visiveis como nao-classificados');
});

/**
 * `outro` era um balde-caixote: as 325 decisoes `nao-e-um-problema` do `claude`
 * — o segundo maior grupo do ledger real, produzido pelos verificadores
 * deterministas — viviam numa gaveta chamada "resto".
 */
test('BURACO 2: os filtros mecanicos tem balde proprio, nao "outro"', () => {
  const d = new Map([
    ['a', dec({ decisao: 'descartado', por: 'claude', motivo: 'nao-e-um-problema' })],
    ['b', dec({ decisao: 'descartado', por: 'claude', motivo: 'instrumento-nao-discrimina' })],
    ['c', dec({ decisao: 'descartado', por: 'claude', motivo: 'trivial' })],
  ]);
  const p = proveniencia(d);
  assert.equal(p.filtro_mecanico, 1);
  assert.equal(p.varredura_ensaio, 1);
  assert.equal(p.outro, 1, 'o que nao se sabe classificar continua a aparecer, e nao se disfarca');
});

/**
 * Com o ledger de decisoes VAZIO, o denominador era forcado a 1 (`|| 1`) e o
 * relatorio imprimia `0.0%` em todas as linhas — percentagens de uma divisao
 * que nao existe. Sem dados a resposta e `n/d`, aqui como em todo o lado.
 */
test('BURACO 3: sem decisoes nenhumas, a proveniencia nao imprime 0.0%', () => {
  const p = proveniencia(new Map());
  const total = Object.values(p).reduce((a, b) => a + b, 0);
  assert.equal(total, 0, 'e este zero que o CLI tem de tratar como n/d, e nao como denominador 1');
});
