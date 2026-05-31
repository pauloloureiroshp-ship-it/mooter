// Wave 2.6 Day 3 — Moo card Stop hook. node:test + assert.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

const { mooCardEnabled, aggregateLastTurn, buildMooCard, shortModel } = require('./stop_hook.js');

const STATS = {
  tier: 'T2', model: 'claude-sonnet-4-6', backend: 'anthropic',
  confidence: 0.84, promptLen: 42, tierMix: 'T0:6 T1:2 T2:2 T3:0',
};

test('mooCardEnabled: default OFF — only true when explicitly enabled', () => {
  assert.equal(mooCardEnabled({}), false);
  assert.equal(mooCardEnabled({ moo_card_enabled: false }), false);
  assert.equal(mooCardEnabled(null), false);
  assert.equal(mooCardEnabled({ moo_card_enabled: true }), true);
});

test('buildMooCard: renders Moo glyph + model + tier + confidence + mix', () => {
  const card = buildMooCard(STATS, null);
  assert.match(card, /🐮 Moo card/);
  assert.match(card, /🐂 ☁ sonnet \(T2\)/, 'glyph (tier+provider) + short model + tier');
  assert.match(card, /confidence 0\.84/);
  assert.match(card, /prompt    42 chars/);
  assert.match(card, /last10    T0:6 T1:2 T2:2 T3:0/);
});

test('buildMooCard: cost line appears only when tracker data present (no fabrication)', () => {
  const without = buildMooCard(STATS, null);
  assert.ok(!/cost/.test(without), 'no cost line when tracker offline');
  const withCost = buildMooCard(STATS, { turn: 0.012, saved: 0.034 });
  assert.match(withCost, /cost      \$0\.0120 turn · saved \$0\.0340 vs T3/);
});

test('buildMooCard: degrades when confidence/promptLen absent', () => {
  const card = buildMooCard({ ...STATS, confidence: null, promptLen: null }, null);
  assert.match(card, /confidence —/);
  assert.ok(!/prompt /.test(card), 'prompt line omitted when length unknown');
});

test('aggregateLastTurn: reads last classified event for the session + tier-mix', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-'));
  const log = path.join(tmp, 'decisions.log');
  fs.writeFileSync(log, [
    JSON.stringify({ event: 'classified', session_id: 's1', tier: 'T0', recommended_model: 'qwen3:30b', recommended_backend: 'ollama', confidence: 0.9, prompt_len: 10 }),
    JSON.stringify({ event: 'option_a_miss' }), // noise
    JSON.stringify({ event: 'classified', session_id: 's1', tier: 'T2', recommended_model: 'sonnet', recommended_backend: 'anthropic', confidence: 0.84, prompt_len: 50 }),
    JSON.stringify({ event: 'classified', session_id: 'other', tier: 'T3', recommended_model: 'opus', confidence: 0.99, prompt_len: 99 }),
  ].join('\n') + '\n');

  const s = aggregateLastTurn('s1', log);
  assert.equal(s.tier, 'T2', 'last classified for s1');
  assert.equal(s.model, 'sonnet');
  assert.equal(s.confidence, 0.84);
  assert.equal(s.promptLen, 50);
  assert.equal(s.tierMix, 'T0:1 T1:0 T2:1 T3:0', 'other-session event excluded from mix');
});

test('aggregateLastTurn: null when log missing or no events', () => {
  assert.equal(aggregateLastTurn('s1', '/nonexistent/decisions.log'), null);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-'));
  const empty = path.join(tmp, 'decisions.log');
  fs.writeFileSync(empty, '');
  assert.equal(aggregateLastTurn('s1', empty), null);
});

test('shortModel: collapses full ids', () => {
  assert.equal(shortModel('claude-sonnet-4-6'), 'sonnet');
  assert.equal(shortModel('qwen3:30b'), 'ollama');
  assert.equal(shortModel(undefined), 'unknown');
});
