// class-taxonomy.test.js — DC-01: sessions map to a CLASS, or to nothing.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { classifySession, classifyWave, detectMode, bucketKey } = require('./class-taxonomy.js');

test('each declared class is recognized from its launching intent', () => {
  assert.equal(classifySession('Perfect handoff da sessão para o Cowork').class, 'handoff');
  assert.equal(classifySession('Auditoria E2E red-team ao plugin').class, 'audit');
  assert.equal(classifySession('treino QLoRA do adapter, nightly').class, 'adapter_train');
  assert.equal(classifySession('housekeeping: arquivar masterprompts legacy').class, 'md_cleanup');
  assert.equal(classifySession('constrói a nova aba do cockpit com slider').class, 'feature_impl');
});

test('an unclassifiable prompt → class null ("sem base comparável")', () => {
  const r = classifySession('você usou qual modelo de LLM ontem?');
  assert.equal(r.class, null);
  assert.equal(r.matched, false);
});

test('mode detection: Loop/Schedule vs CC (default)', () => {
  assert.equal(detectMode('lança como Moo Loop Session $0'), 'Loop');
  assert.equal(detectMode('nightly schedule de treino'), 'Loop');
  assert.equal(detectMode('sessão CC para o merge'), 'CC');
  assert.equal(detectMode('texto neutro sem pistas'), 'CC');
});

test('classifyWave uses the roadmap-declared mode', () => {
  const w = classifyWave({ name: 'Adapter Forge · F1', goal: '1 adapter OSFT/DoRA', mode: 'Schedule nightly' });
  assert.equal(w.class, 'adapter_train');
  assert.equal(w.mode, 'Loop');
  const h = classifyWave({ name: 'Housekeeping da base', goal: 'arquivar masterprompts', mode: 'Loop $0' });
  assert.equal(h.class, 'md_cleanup');
  assert.equal(h.mode, 'Loop');
});

test('bucketKey is null for a class-less wave (no bucket, no cone)', () => {
  assert.equal(bucketKey(null, 'CC'), null);
  assert.equal(bucketKey('audit', 'Loop'), 'audit::Loop');
  assert.equal(bucketKey('audit', 'weird'), 'audit::CC', 'unknown mode → CC');
});
