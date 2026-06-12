// Wave 58 Phase A.4 — llm-emoji-map.js
// node:test + assert/strict. All tests hermetic (no I/O).

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  FAMILY_MAP,
  STATUS_EMOJI_MAP,
  emojiForFamily,
  emojiForModel,
  statusEmoji,
  familyFromNorm,
  normalise,
} = require('./llm-emoji-map.js');

// ---------------------------------------------------------------------------
// FAMILY_MAP shape
// ---------------------------------------------------------------------------

test('FAMILY_MAP: all required families present with correct shape', () => {
  const required = ['mooter', 'claude', 'fable', 'openai', 'gemini', 'ollama', 'unknown'];
  for (const fam of required) {
    assert.ok(fam in FAMILY_MAP, `missing family: ${fam}`);
    const entry = FAMILY_MAP[fam];
    assert.equal(typeof entry.emoji, 'string', `${fam}.emoji must be string`);
    assert.equal(typeof entry.label, 'string', `${fam}.label must be string`);
    assert.equal(typeof entry.color, 'string', `${fam}.color must be string`);
    assert.ok(entry.emoji.length > 0, `${fam}.emoji must be non-empty`);
  }
});

test('FAMILY_MAP: canonical emoji values', () => {
  assert.equal(FAMILY_MAP.mooter.emoji, '🐮');
  assert.equal(FAMILY_MAP.claude.emoji, '✨');
  assert.equal(FAMILY_MAP.fable.emoji, '🌟');
  assert.equal(FAMILY_MAP.openai.emoji, '🟢');
  assert.equal(FAMILY_MAP.gemini.emoji, '💎');
  assert.equal(FAMILY_MAP.ollama.emoji, '🦙');
  assert.equal(FAMILY_MAP.unknown.emoji, '🤖');
});

test('FAMILY_MAP: canonical color values', () => {
  assert.equal(FAMILY_MAP.mooter.color, 'pink');
  assert.equal(FAMILY_MAP.claude.color, 'amber');
  assert.equal(FAMILY_MAP.fable.color, 'gold');
  assert.equal(FAMILY_MAP.openai.color, 'green');
  assert.equal(FAMILY_MAP.gemini.color, 'blue');
  assert.equal(FAMILY_MAP.ollama.color, 'tan');
  assert.equal(FAMILY_MAP.unknown.color, 'gray');
});

// ---------------------------------------------------------------------------
// STATUS_EMOJI_MAP
// ---------------------------------------------------------------------------

test('STATUS_EMOJI_MAP: all six states defined', () => {
  const states = ['thinking', 'executing', 'waiting', 'queued', 'complete', 'error'];
  for (const s of states) {
    assert.ok(s in STATUS_EMOJI_MAP, `missing state: ${s}`);
    assert.equal(typeof STATUS_EMOJI_MAP[s], 'string');
    assert.ok(STATUS_EMOJI_MAP[s].length > 0);
  }
});

test('STATUS_EMOJI_MAP: canonical emoji values', () => {
  assert.equal(STATUS_EMOJI_MAP.thinking,  '💭');
  assert.equal(STATUS_EMOJI_MAP.executing, '🛠');
  assert.equal(STATUS_EMOJI_MAP.waiting,   '⏳');
  assert.equal(STATUS_EMOJI_MAP.queued,    '❄️');
  assert.equal(STATUS_EMOJI_MAP.complete,  '✅');
  assert.equal(STATUS_EMOJI_MAP.error,     '❌');
});

// ---------------------------------------------------------------------------
// normalise
// ---------------------------------------------------------------------------

test('normalise: lowercases and trims', () => {
  assert.equal(normalise('Claude-Opus-4-8'), 'claude-opus-4-8');
  assert.equal(normalise('  GPT-4o '), 'gpt-4o');
  assert.equal(normalise('Qwen3 30B'), 'qwen3-30b');
});

test('normalise: non-string returns empty string', () => {
  assert.equal(normalise(null), '');
  assert.equal(normalise(undefined), '');
  assert.equal(normalise(42), '');
});

// ---------------------------------------------------------------------------
// familyFromNorm
// ---------------------------------------------------------------------------

test('familyFromNorm: empty/null → unknown', () => {
  assert.equal(familyFromNorm(''), 'unknown');
  assert.equal(familyFromNorm(null), 'unknown');
});

test('familyFromNorm: mooter models', () => {
  assert.equal(familyFromNorm('mooter'), 'mooter');
  assert.equal(familyFromNorm('mooter-sonnet-4-6'), 'mooter');
  assert.equal(familyFromNorm('mooter:local'), 'mooter');
});

test('familyFromNorm: fable models (before generic claude)', () => {
  assert.equal(familyFromNorm('claude-fable-5'), 'fable');
  assert.equal(familyFromNorm('fable-5'), 'fable');
  assert.equal(familyFromNorm('fable:5'), 'fable');
  assert.equal(familyFromNorm('us.anthropic.claude-fable-v1'), 'fable');
  assert.equal(familyFromNorm('model-with-fable-inside'), 'fable');
});

test('familyFromNorm: claude models', () => {
  assert.equal(familyFromNorm('claude-opus-4-8'), 'claude');
  assert.equal(familyFromNorm('claude-sonnet-4-6'), 'claude');
  assert.equal(familyFromNorm('claude-haiku-4-5'), 'claude');
  assert.equal(familyFromNorm('claude-3-5-sonnet-20241022'), 'claude');
  assert.equal(familyFromNorm('us.anthropic.claude-sonnet-4'), 'claude');
  assert.equal(familyFromNorm('anthropic/claude-opus'), 'claude');
});

test('familyFromNorm: openai / gpt / codex models', () => {
  assert.equal(familyFromNorm('gpt-4o'), 'openai');
  assert.equal(familyFromNorm('gpt-5-3-codex'), 'openai');
  assert.equal(familyFromNorm('o1-preview'), 'openai');
  assert.equal(familyFromNorm('o3-mini'), 'openai');
  assert.equal(familyFromNorm('o4-mini'), 'openai');
  assert.equal(familyFromNorm('codex-mini'), 'openai');
  assert.equal(familyFromNorm('openai/gpt-4'), 'openai');
  assert.equal(familyFromNorm('text-davinci-003'), 'openai');
});

test('familyFromNorm: gemini models', () => {
  assert.equal(familyFromNorm('gemini-2.5-pro'), 'gemini');
  assert.equal(familyFromNorm('gemini-flash'), 'gemini');
  assert.equal(familyFromNorm('google/gemini-pro'), 'gemini');
  assert.equal(familyFromNorm('models/gemini-1.5-flash'), 'gemini');
});

test('familyFromNorm: ollama / open-weight local models', () => {
  assert.equal(familyFromNorm('qwen3-30b'), 'ollama');
  assert.equal(familyFromNorm('qwen2.5:3b'), 'ollama');
  assert.equal(familyFromNorm('llama3.1:8b'), 'ollama');
  assert.equal(familyFromNorm('codellama:13b'), 'ollama');
  assert.equal(familyFromNorm('mistral:7b'), 'ollama');
  assert.equal(familyFromNorm('phi3:mini'), 'ollama');
  assert.equal(familyFromNorm('gemma:7b'), 'ollama');
  assert.equal(familyFromNorm('deepseek-coder'), 'ollama');
  assert.equal(familyFromNorm('mixtral:8x7b'), 'ollama');
  assert.equal(familyFromNorm('ollama:qwen3'), 'ollama');
  assert.equal(familyFromNorm('ollama/mistral'), 'ollama');
  assert.equal(familyFromNorm('model.gguf'), 'ollama');
  assert.equal(familyFromNorm('vicuna:13b'), 'ollama');
  assert.equal(familyFromNorm('falcon:7b'), 'ollama');
  assert.equal(familyFromNorm('starcoder2:3b'), 'ollama');
});

test('familyFromNorm: completely unknown → unknown', () => {
  assert.equal(familyFromNorm('totally-unknown-x99'), 'unknown');
  assert.equal(familyFromNorm('some-random-model'), 'unknown');
  assert.equal(familyFromNorm('xyz123'), 'unknown');
});

// ---------------------------------------------------------------------------
// emojiForFamily
// ---------------------------------------------------------------------------

test('emojiForFamily: valid families return their descriptor', () => {
  assert.deepEqual(emojiForFamily('claude'), FAMILY_MAP.claude);
  assert.deepEqual(emojiForFamily('ollama'), FAMILY_MAP.ollama);
  assert.deepEqual(emojiForFamily('gemini'), FAMILY_MAP.gemini);
});

test('emojiForFamily: unknown/invalid family falls back to unknown', () => {
  assert.deepEqual(emojiForFamily('bogus'), FAMILY_MAP.unknown);
  assert.deepEqual(emojiForFamily(null), FAMILY_MAP.unknown);
  assert.deepEqual(emojiForFamily(undefined), FAMILY_MAP.unknown);
  assert.deepEqual(emojiForFamily(''), FAMILY_MAP.unknown);
});

// ---------------------------------------------------------------------------
// emojiForModel — integration (the main public API)
// ---------------------------------------------------------------------------

test('emojiForModel: claude-opus-4-8 → ✨ Claude amber', () => {
  const r = emojiForModel('claude-opus-4-8');
  assert.equal(r.emoji, '✨');
  assert.equal(r.label, 'Claude');
  assert.equal(r.color, 'amber');
});

test('emojiForModel: gpt-5-3-codex → 🟢 OpenAI green (brief example)', () => {
  const r = emojiForModel('gpt-5-3-codex');
  assert.equal(r.emoji, '🟢');
  assert.equal(r.color, 'green');
});

test('emojiForModel: qwen3-30b → 🦙 Ollama tan (brief example)', () => {
  const r = emojiForModel('qwen3-30b');
  assert.equal(r.emoji, '🦙');
  assert.equal(r.color, 'tan');
});

test('emojiForModel: gemini-2.5-pro → 💎 Gemini blue', () => {
  const r = emojiForModel('gemini-2.5-pro');
  assert.equal(r.emoji, '💎');
  assert.equal(r.color, 'blue');
});

test('emojiForModel: claude-fable-5 → 🌟 Fable gold', () => {
  const r = emojiForModel('claude-fable-5');
  assert.equal(r.emoji, '🌟');
  assert.equal(r.color, 'gold');
});

test('emojiForModel: mooter-sonnet-4-6 → 🐮 Mooter pink', () => {
  const r = emojiForModel('mooter-sonnet-4-6');
  assert.equal(r.emoji, '🐮');
  assert.equal(r.color, 'pink');
});

test('emojiForModel: totally-unknown-x99 → 🤖 Unknown gray (no fabrication)', () => {
  const r = emojiForModel('totally-unknown-x99');
  assert.equal(r.emoji, '🤖');
  assert.equal(r.label, 'Unknown');
  assert.equal(r.color, 'gray');
});

test('emojiForModel: null/undefined/non-string → 🤖 Unknown (no fabrication)', () => {
  assert.equal(emojiForModel(null).emoji, '🤖');
  assert.equal(emojiForModel(undefined).emoji, '🤖');
  assert.equal(emojiForModel(42).emoji, '🤖');
  assert.equal(emojiForModel('').emoji, '🤖');
});

test('emojiForModel: case-insensitive matching', () => {
  assert.equal(emojiForModel('Claude-Opus-4-8').emoji, '✨');
  assert.equal(emojiForModel('GPT-4O').emoji, '🟢');
  assert.equal(emojiForModel('GEMINI-PRO').emoji, '💎');
  assert.equal(emojiForModel('Qwen3:30B').emoji, '🦙');
});

// ---------------------------------------------------------------------------
// statusEmoji
// ---------------------------------------------------------------------------

test('statusEmoji: all canonical states', () => {
  assert.equal(statusEmoji('thinking'),  '💭');
  assert.equal(statusEmoji('executing'), '🛠');
  assert.equal(statusEmoji('waiting'),   '⏳');
  assert.equal(statusEmoji('queued'),    '❄️');
  assert.equal(statusEmoji('complete'),  '✅');
  assert.equal(statusEmoji('error'),     '❌');
});

test('statusEmoji: case-insensitive', () => {
  assert.equal(statusEmoji('THINKING'), '💭');
  assert.equal(statusEmoji('Error'),    '❌');
  assert.equal(statusEmoji('  Complete  '), '✅');
});

test('statusEmoji: unknown state → 🤖 (no fabrication)', () => {
  assert.equal(statusEmoji('bogus'), '🤖');
  assert.equal(statusEmoji(''), '🤖');
});

test('statusEmoji: non-string → 🤖 (no fabrication)', () => {
  assert.equal(statusEmoji(null), '🤖');
  assert.equal(statusEmoji(undefined), '🤖');
  assert.equal(statusEmoji(42), '🤖');
});
