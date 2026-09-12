// TESTE DE MORDIDA — «não medido» não é «mau».
//
// PORQUE ESTE FICHEIRO EXISTE
//
// Até 2026-08-27 o primeiro ecrã de um utilizador novo dizia, na mesma linha:
//
//     🐮 no data yet ............................. ● all-Opus
//                                                  ^^^ a VERMELHO
//
// `calcSavings` devolve `{ savingsPct: 0, signal: 'empty' }` numa máquina fresca
// — zero prompts, zero execuções — e `renderHealthPill` tinha três ramos e
// nenhum era «não sei»: o 0 caía no ramo de perigo. O sistema afirmava um
// FRACASSO que ninguém tinha medido, que é o mesmo defeito da poupança
// fabricada, virado ao contrário. A regra do dono já existia para o lado
// positivo — «em dúvida, null» — e faltava do lado negativo, que é onde custa
// confiança: ninguém desconfia de um produto por ele se elogiar de menos.
//
// Cada teste PLANTA o defeito e exige que o portão o apanhe. Um teste que só
// verifica o caminho feliz não prova nada: o bug original passava todos os
// testes que existiam.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const sl = require('./gsd-statusline.js');
const { healthDot, healthLabel, renderHealthPill, semMedicao } = sl;

const DANGER_RGB = '38;2;227;70;70';   // o vermelho, tal como definido no módulo
const semAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// ── semMedicao: o predicado ────────────────────────────────────────────────
test('semMedicao: uma máquina fresca não tem medição', () => {
  assert.equal(semMedicao({ savingsPct: 0, promptCount: 0, executionCount: 0, signal: 'empty' }), true);
  assert.equal(semMedicao(null), true);
  assert.equal(semMedicao(undefined), true);
});

test('semMedicao: um único prompt já é medição', () => {
  assert.equal(semMedicao({ savingsPct: 0, promptCount: 1, executionCount: 0, signal: 'real_exec' }), false);
  assert.equal(semMedicao({ savingsPct: 0, promptCount: 0, executionCount: 1, signal: 'real_exec' }), false);
});

// ── o defeito plantado: 0% sem dados NÃO pode ficar vermelho ───────────────
test('MORDIDA · sem medição, o rótulo não é all-Opus', () => {
  assert.equal(healthLabel(null), 'not measured');
  assert.notEqual(healthLabel(null), 'all-Opus');
});

test('MORDIDA · sem medição, o ponto não é vermelho', () => {
  const dot = healthDot(null);
  assert.ok(!dot.includes(DANGER_RGB), `o ponto de "não medido" acendeu a vermelho: ${JSON.stringify(dot)}`);
});

test('MORDIDA · a pastilha inteira, sem medição, não é vermelha nem diz all-Opus', () => {
  const pill = renderHealthPill(null);
  assert.ok(!pill.includes(DANGER_RGB), 'a pastilha de "não medido" acendeu a vermelho');
  assert.ok(!/all-Opus/.test(semAnsi(pill)), 'a pastilha de "não medido" afirmou all-Opus');
  assert.match(semAnsi(pill), /not measured/);
});

// ── e o ramo vermelho TEM de continuar a morder quando há dados ────────────
// Sem isto, «arranjar» o falso positivo podia ter desligado o alarme a sério.
test('MORDIDA INVERSA · com dados reais e 0% de poupança, o vermelho FICA', () => {
  assert.equal(healthLabel(0), 'all-Opus');
  assert.ok(healthDot(0).includes(DANGER_RGB), 'o alarme a sério deixou de acender');
  assert.ok(renderHealthPill(0).includes(DANGER_RGB), 'a pastilha real deixou de acender');
});

test('os degraus saudáveis não se moveram', () => {
  assert.equal(healthLabel(30), 'healthy');
  assert.equal(healthLabel(10), 'ok');
  assert.equal(healthLabel(9), 'all-Opus');
});
