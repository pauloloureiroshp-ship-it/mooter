/**
 * metrica-mae.test.mjs
 *
 * O teste que mais importa aqui não é o da aritmética — é o que garante que a
 * metade não-medida **nunca** ganha um número. Um router que publica «97% da
 * qualidade» sem ter medido qualidade nenhuma é exactamente o género de
 * afirmação que este repositório existe para não fazer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  metricaMae, quotaPorMotor, cobertura, emUmaLinha,
  TIERS_FORTES, TIERS_LOCAIS, SEM_QUALIDADE, OWNER_TZ,
} from './metrica-mae.mjs';

const dec = (o) => JSON.stringify({ ts: '2026-08-25T12:00:00Z', tier: 'T0', llm: 'qwen2.5:3b', tokens_in: 0, tokens_out: 0, ...o });

// ── a metade que se mede ────────────────────────────────────────────────────

test('a fracção no modelo forte é contada, não estimada', () => {
  const m = metricaMae([
    dec({ tier: 'T3', llm: 'opus' }), dec({ tier: 'T3', llm: 'opus' }),
    dec({ tier: 'T0' }), dec({ tier: 'T0' }), dec({ tier: 'T0' }),
    dec({ tier: 'T1', llm: 'haiku' }), dec({ tier: 'T2', llm: 'sonnet' }),
    dec({ tier: 'T0' }), dec({ tier: 'T0' }), dec({ tier: 'T0' }),
  ]);
  assert.equal(m.total, 10);
  assert.equal(m.chamadas_no_forte.n, 2);
  assert.equal(m.chamadas_no_forte.pct, 20);
  assert.equal(m.chamadas_locais.pct, 60);
});

test('T5 conta como forte — nunca é auto-encaminhado, mas é o topo', () => {
  assert.ok(TIERS_FORTES.has('T3') && TIERS_FORTES.has('T5'));
  assert.ok(!TIERS_FORTES.has('T2'), 'o Sonnet não é o modelo forte desta métrica');
  assert.ok(TIERS_LOCAIS.has('T0') && !TIERS_LOCAIS.has('T1'));
  const m = metricaMae([dec({ tier: 'T5', llm: 'claude-fable-5' }), dec({ tier: 'T0' })]);
  assert.equal(m.chamadas_no_forte.pct, 50);
});

test('conta por tier e por motor sem juntar os dois eixos', () => {
  const m = metricaMae([dec({ tier: 'T3', llm: 'opus' }), dec({ tier: 'T3', llm: 'opus' }), dec({ tier: 'T0', llm: 'qwen2.5:3b' })]);
  assert.deepEqual(m.por_tier, { T3: 2, T0: 1 });
  assert.deepEqual(m.por_motor, { opus: 2, 'qwen2.5:3b': 1 });
});

test('um tier ausente é `n/d`, não some da contagem', () => {
  const m = metricaMae([dec({ tier: undefined, llm: undefined })]);
  assert.equal(m.por_tier['n/d'], 1);
  assert.equal(m.por_motor['n/d'], 1);
  assert.equal(m.total, 1);
});

// ── a metade que NÃO se mede: a regra dura ─────────────────────────────────

test('qualidade_mantida é SEMPRE null, com o motivo — em qualquer entrada', () => {
  for (const entrada of [
    [], [dec({})], [dec({ tier: 'T3' })],
    [dec({ tier: 'T0' }), dec({ tier: 'T3' })],
  ]) {
    const m = metricaMae(entrada);
    assert.equal(m.qualidade_mantida.pct, null,
      'nenhum caminho pode dar um número a uma metade que não foi medida');
    assert.equal(m.qualidade_mantida.porque, SEM_QUALIDADE);
  }
});

test('o motivo explica que a qualidade vive noutra POPULAÇÃO, não que falta ligar um campo', () => {
  assert.match(SEM_QUALIDADE, /outra\s+população/);
  assert.match(SEM_QUALIDADE, /inventado/);
});

test('a linha do painel não inventa a metade que falta', () => {
  const l = emUmaLinha(metricaMae([dec({ tier: 'T3' }), dec({ tier: 'T0' })]));
  assert.match(l, /50% no forte/);
  assert.match(l, /qualidade n\/d/);
  assert.ok(!/\d+% de qualidade/.test(l));
});

test('sem decisões, a linha di-lo em vez de mostrar 0%', () => {
  assert.match(emUmaLinha(metricaMae([])), /n\/d \(sem decisões\)/);
});

// ── tokens: n/d argumentável ────────────────────────────────────────────────

test('cobertura devolve presentes/total/pct, e não rebenta com zero linhas', () => {
  assert.deepEqual(cobertura([], 'tokens_in'), { presentes: 0, total: 0, pct: null });
  assert.deepEqual(cobertura([{ tokens_in: 5 }, { tokens_in: 0 }], 'tokens_in'),
    { presentes: 1, total: 2, pct: 50 });
});

test('tokens a zero dão n/d COM os números — nunca um n/d mudo', () => {
  const m = metricaMae([dec({}), dec({}), dec({})]);
  assert.equal(m.tokens.pct_cobertura, 0);
  assert.match(m.tokens.porque, /nenhuma das 3 decisões traz tokens/);
  assert.match(m.tokens.porque, /0\/3 entrada/);
});

test('cobertura parcial de tokens diz que é parcial', () => {
  const m = metricaMae([dec({ tokens_in: 100, tokens_out: 20 }), dec({}), dec({}), dec({})]);
  assert.equal(m.tokens.pct_cobertura, 25);
  assert.match(m.tokens.porque, /cobertura parcial/);
});

test('uma linha corrompida é contada, não engolida', () => {
  const m = metricaMae([dec({ tier: 'T3' }), 'isto-nao-e-json', dec({ tier: 'T0' })]);
  assert.equal(m.total, 2);
  assert.equal(m.corrompidas, 1);
});

test('janela em dias corta pelo ts, e um ts ilegível não entra na janela', () => {
  const agora = Date.parse('2026-08-25T12:00:00Z');
  const m = metricaMae([
    dec({ ts: '2026-08-25T11:00:00Z', tier: 'T3' }),
    dec({ ts: '2026-08-01T11:00:00Z', tier: 'T3' }),
    dec({ ts: 'ontem', tier: 'T3' }),
  ], { agora, janelaDias: 7 });
  assert.equal(m.total, 1);
});

// ── quota por motor, por dia DO DONO ───────────────────────────────────────

test('agrupa por dia do dono (America/Sao_Paulo), não pelo do host', () => {
  // 02:00Z de 26/08 é ainda dia 25 em São Paulo (UTC-3). É a regra do CLAUDE.md,
  // e já custou uma "correcção" errada a dois ficheiros normativos.
  const q = quotaPorMotor([dec({ ts: '2026-08-26T02:00:00Z', tier: 'T3', llm: 'opus' })]);
  assert.equal(q.length, 1);
  assert.equal(q[0].dia, '2026-08-25');
  assert.equal(q[0].tz, OWNER_TZ);
});

test('conta chamadas por motor e ordena o dia mais recente primeiro', () => {
  const q = quotaPorMotor([
    dec({ ts: '2026-08-24T12:00:00Z', llm: 'opus', tier: 'T3' }),
    dec({ ts: '2026-08-25T12:00:00Z', llm: 'opus', tier: 'T3' }),
    dec({ ts: '2026-08-25T13:00:00Z', llm: 'opus', tier: 'T3' }),
    dec({ ts: '2026-08-25T14:00:00Z', llm: 'qwen2.5:3b', tier: 'T0' }),
  ]);
  assert.equal(q[0].dia, '2026-08-25');
  assert.equal(q[0].total_chamadas, 3);
  assert.equal(q[0].motores[0].motor, 'opus');
  assert.equal(q[0].motores[0].chamadas, 2);
  assert.equal(q[1].dia, '2026-08-24');
});

test('USD é sempre null, e o motivo distingue "sem preço" de "sem tokens"', () => {
  const semTokens = quotaPorMotor([dec({ llm: 'opus', tier: 'T3' })]);
  assert.equal(semTokens[0].motores[0].usd, null);
  assert.match(semTokens[0].motores[0].porque_usd, /zero aqui quer dizer não-medido/);

  const comTokens = quotaPorMotor([dec({ llm: 'opus', tier: 'T3', tokens_out: 500 })]);
  assert.equal(comTokens[0].motores[0].usd, null);
  assert.match(comTokens[0].motores[0].porque_usd, /preço por modelo ainda não/);
});

test('tokens_out é null quando nenhuma chamada os trouxe — nunca 0', () => {
  const q = quotaPorMotor([dec({ llm: 'opus', tier: 'T3' }), dec({ llm: 'opus', tier: 'T3' })]);
  assert.equal(q[0].motores[0].tokens_out, null,
    '0 tokens somados de 0 medições é "não medido", e mostrar 0 seria afirmar gratuitidade');
});

test('um ts ilegível não cria um dia fantasma', () => {
  assert.deepEqual(quotaPorMotor([dec({ ts: 'qualquer coisa' })]), []);
});
