'use strict';
// lp-task-view.test.js — LP-4.5 · the one-box heuristic SUGGESTS the local chip, never decides.
// The two REAL prompts that exposed the LP-4 dead-end (the CommunityPulse case) must NOT look
// node-local — a false "local" hint there would point the user straight back into the trap.
const { test } = require('node:test');
const assert = require('node:assert');

const LTV = require('./lp-task-view.js');

test('node-local asks (color/text/class) suggest the local chip', () => {
  const yes = [
    'muda a cor deste título para rosa',
    'põe o texto em bold',
    'cantos arredondados e borda fina',
    'aumenta o padding e centra o label',
    'change the color to blue',
    'make the font size bigger',
    'esconde este elemento',
  ];
  for (const t of yes) assert.strictEqual(LTV.suggestLocalChip(t), true, 'should suggest local: ' + t);
});

test("project asks NEVER suggest local — including Paulo's two real CommunityPulse prompts", () => {
  const no = [
    // The exact pain that created this wave:
    'valida se estes números estão coerentes com o projecto',
    'põe números reais em função do projecto',
    'atualiza para os números reais do projecto',
    'estes valores batem certo com o repo?',
    'verifica se este total está correto',
    'check if this data matches the API',
    'usa os dados reais de todos os ficheiros',
    // Color word + project context → project context wins:
    'valida no projecto se a cor desta métrica está certa',
  ];
  for (const t of no) assert.strictEqual(LTV.suggestLocalChip(t), false, 'must NOT suggest local: ' + t);
});

test('empty/garbage input suggests nothing (no hint noise)', () => {
  assert.strictEqual(LTV.suggestLocalChip(''), false);
  assert.strictEqual(LTV.suggestLocalChip('   '), false);
  assert.strictEqual(LTV.suggestLocalChip(null), false);
  assert.strictEqual(LTV.suggestLocalChip(undefined), false);
  assert.strictEqual(LTV.suggestLocalChip('faz qualquer coisa'), false, 'no smell either way → no hint');
});

test('serialisation contract: concat-only source (no backticks/${}), esc as a free variable', () => {
  const src = LTV.suggestLocalChip.toString();
  assert.ok(src.indexOf('`') === -1, 'no template literals — the fn embeds in the host template');
  assert.ok(src.indexOf('${') === -1, 'no ${} interpolation');
});
