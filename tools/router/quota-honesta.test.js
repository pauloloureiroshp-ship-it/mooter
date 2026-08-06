'use strict';
/**
 * P1-E — o teste vermelho é o hint desta sessão.
 *
 * 2026-08-06T20:13Z: `<router-hint>` publicou `codex_quota: 0% remaining
 * (5h window)`. 20:24Z: job codex job-mshys18a-bffe correu 30+ passos sem uma
 * única falha de quota. O número era de um orçamento local a fingir-se de
 * quota do fornecedor. Estes testes existem para que essa linha não volte.
 */
const test = require('node:test');
const assert = require('node:assert');
const q = require('./quota-honesta.js');

const trackerComCodexAZero = () => ({ anthropic_remaining_pct: 100, codex_remaining_pct: 0, codex_exhausted: true });

test('codex_quota é n/d — um orçamento local esgotado não é quota do fornecedor esgotada', () => {
  const m = q.estado({ readQuotaLive: () => null, trackerSummary: trackerComCodexAZero });
  assert.strictEqual(m.codex.quota_remaining_pct, null,
    'o 0% do orçamento local voltou a ser publicado como quota — foi isto que mandou trabalho para longe de um motor vivo');
  assert.strictEqual(m.codex.quota_fonte, null);
  assert.match(m.codex.quota_porque, /não existe fonte oficial/);
  assert.strictEqual(m.codex.budget_local_pct, 0, 'o contador local não desaparece — muda de nome e de significado');
  assert.match(m.codex.budget_porque, /nunca quota do fornecedor/);
});

test('a linha do hint para o codex diz n/d com o porquê, nunca uma percentagem', () => {
  const linhas = q.linhasDoHint(q.estado({ readQuotaLive: () => null, trackerSummary: trackerComCodexAZero }));
  const linha = linhas.find((l) => l.startsWith('codex_quota:'));
  assert.ok(linha, 'a linha codex_quota desapareceu — calar não é o mesmo que declarar n/d');
  assert.match(linha, /^codex_quota: n\/d \(/);
  assert.ok(!/\d+% remaining/.test(linha), `o hint continua a publicar uma percentagem: ${linha}`);
});

test('anthropic_quota só sai com número quando a fonte é o rate_limits oficial e está fresco', () => {
  const oficial = { source: 'cc-statusline-stdin', fresh: true, age_ms: 4000, five_hour_pct: 62, seven_day_pct: 81 };
  const m = q.estado({ readQuotaLive: () => oficial, trackerSummary: trackerComCodexAZero });
  assert.strictEqual(m.anthropic.quota_fonte, 'cc-statusline-stdin');
  assert.match(m.anthropic.quota_porque, /oficial/);
  // O campo do quota-live é percentagem USADA (`used_percentage`,
  // quota-live.js:97). 62 gasto ⇒ 38 disponível. Copiar o número sem converter
  // faria o router relaxar exactamente quando devia apertar.
  assert.strictEqual(m.anthropic.quota_usada_pct, 62);
  assert.strictEqual(m.anthropic.quota_remaining_pct, 38,
    'percentagem usada publicada como disponível — o sinal está invertido');
});

test('quota usada a 100% é 0% disponível, e 0% usada é 100% — sem saltos nem negativos', () => {
  const em = (usada) => q.estado({
    readQuotaLive: () => ({ source: 'cc-statusline-stdin', fresh: true, age_ms: 1, five_hour_pct: usada }),
    trackerSummary: () => null,
  }).anthropic.quota_remaining_pct;
  assert.strictEqual(em(100), 0);
  assert.strictEqual(em(0), 100);
  assert.strictEqual(em(150), 0, 'um valor fora da escala não pode virar negativo');
});

test('quota-live obsoleto ou de outra fonte degrada para n/d — nunca ao contador local', () => {
  const obsoleto = { source: 'cc-statusline-stdin', fresh: false, age_ms: 3_600_000, five_hour_pct: 62 };
  const outra = { source: 'palpite-do-agente', fresh: true, age_ms: 10, five_hour_pct: 5 };
  for (const [nome, live] of [['obsoleto', obsoleto], ['fonte não oficial', outra]]) {
    const m = q.estado({ readQuotaLive: () => live, trackerSummary: trackerComCodexAZero });
    assert.strictEqual(m.anthropic.quota_remaining_pct, null, `${nome} passou por medição oficial`);
    assert.strictEqual(m.anthropic.quota_fonte, null);
    assert.strictEqual(m.anthropic.budget_local_pct, 100,
      'o contador local continua disponível — o que não pode é ocupar o lugar da quota');
  }
});

test('um pong prova saúde, não percentagem', () => {
  const m = q.estado({
    readQuotaLive: () => null,
    trackerSummary: trackerComCodexAZero,
    health: { codex: { pong: true, at: '2026-08-06T20:24:15.649Z', porque: 'job-mshys18a-bffe arrancou' } },
  });
  assert.strictEqual(m.codex.engine_health, 'vivo');
  assert.strictEqual(m.codex.engine_health_at, '2026-08-06T20:24:15.649Z');
  assert.strictEqual(m.codex.quota_remaining_pct, null,
    'o pong contaminou a quota — é exactamente a confusão que este módulo separa');
});

test('saúde sem prova é n/d, e n/d não bloqueia dispatch', () => {
  const m = q.estado({ readQuotaLive: () => null, trackerSummary: () => null });
  assert.strictEqual(m.codex.engine_health, null);
  assert.match(m.codex.engine_health_porque, /não é prova/);
  const d = q.podeDespachar(m, 'codex');
  assert.strictEqual(d.pode, true, 'não medir a saúde não pode valer avaria — isso pararia a frota por silêncio');
});

test('dispatch a motor provadamente sem resposta falha depressa e com motivo', () => {
  const m = q.estado({
    readQuotaLive: () => null, trackerSummary: () => null,
    health: { gemini: { pong: false, at: '2026-08-06T20:00:00.000Z', porque: 'conta individual: auth recusada' } },
  });
  const d = q.podeDespachar(m, 'gemini');
  assert.strictEqual(d.pode, false);
  assert.match(d.porque, /conta individual/, 'a recusa tem de dizer PORQUÊ, senão o utilizador adivinha');
});

test('motor com saúde mas sem fonte de quota entra no roster como n/d, não fica de fora', () => {
  const m = q.estado({
    readQuotaLive: () => null, trackerSummary: () => null,
    health: { kimi: { pong: true, at: '2026-08-06T20:05:00.000Z' } },
  });
  assert.ok(m.kimi, 'um motor com prova de saúde desapareceu do roster');
  assert.strictEqual(m.kimi.quota_remaining_pct, null);
  assert.strictEqual(m.kimi.engine_health, 'vivo');
});
