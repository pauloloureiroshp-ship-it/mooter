// roadmap.test.js — parse the wave tables (phase, mode, worktree, effort, deps).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseRoadmap } = require('./roadmap.js');

const MD = [
  '## FASE NOW — aterrar valor',
  '| # | Wave | Objectivo | Modo | Worktree | Effort | Dep |',
  '|---|---|---|---|---|---|---|',
  '| **W1** | Land polish | ship o valor construído | **dynamic-workflow** | `frugal-land` | M | — |',
  '| **W2** | Housekeeping da base | arquivar legacy | **Loop $0** | `frugal-housekeep` | M | — |',
  '',
  '## FASE NEXT — fundações',
  '| # | Wave | Objectivo | Modo | Worktree | Effort | Dep |',
  '|---|---|---|---|---|---|---|',
  '| **W4** | Evolution Fleet | fleet commander | **CC-once** | `frugal-fleet` | L | W2 |',
  '| **W6** | Budget Cockpit | observability | **CC-once** | `frugal-budget` | M | W5 |',
].join('\n');

test('parses every wave with phase, mode, worktree, effort, deps', () => {
  const waves = parseRoadmap(MD);
  assert.equal(waves.length, 4);
  const by = Object.fromEntries(waves.map((w) => [w.wave_id, w]));

  assert.equal(by.W1.phase, 'NOW');
  assert.equal(by.W1.name, 'Land polish');
  assert.match(by.W1.mode, /dynamic-workflow/);
  assert.equal(by.W1.worktree, 'frugal-land');
  assert.equal(by.W1.effort, 'M');
  assert.deepEqual(by.W1.deps, [], '"—" → no deps');

  assert.equal(by.W2.phase, 'NOW');
  assert.match(by.W2.mode, /Loop/);

  assert.equal(by.W4.phase, 'NEXT');
  assert.deepEqual(by.W4.deps, ['W2']);
  assert.equal(by.W4.effort, 'L');

  assert.deepEqual(by.W6.deps, ['W5'], 'dep on a wave declared elsewhere is still captured');
});

test('no waves from prose without a table', () => {
  assert.deepEqual(parseRoadmap('# Just a title\n\nSome text about W9 in a sentence.'), []);
});
