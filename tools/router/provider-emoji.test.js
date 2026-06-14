// Wave 58.4 Block B — provider-emoji palette (Q4).
// Pure-function tests: the 8 brand mappings + the honest 📦 fallback, plus
// case/alias/specificity invariants. No filesystem — providerEmoji is pure.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { providerEmoji, FALLBACK } = require('./provider-emoji.js');

// ── The 8 canonical brand mappings (brief B.1) ────────────────────────────────

test('anthropic → 🟠', () => {
  assert.equal(providerEmoji('anthropic'), '🟠');
});

test('openai → 🟢', () => {
  assert.equal(providerEmoji('openai'), '🟢');
});

test('openai_codex_cli → 🤖 (codex beats openai)', () => {
  assert.equal(providerEmoji('openai_codex_cli'), '🤖');
});

test('gemini → 💎', () => {
  assert.equal(providerEmoji('gemini'), '💎');
});

test('ollama → 🦙', () => {
  assert.equal(providerEmoji('ollama'), '🦙');
});

test('deepseek → 🐳', () => {
  assert.equal(providerEmoji('deepseek'), '🐳');
});

test('groq → 🔥', () => {
  assert.equal(providerEmoji('groq'), '🔥');
});

test('moonshot → 🌙', () => {
  assert.equal(providerEmoji('moonshot'), '🌙');
});

// ── Fallback ──────────────────────────────────────────────────────────────────

test('unknown provider → 📦 fallback', () => {
  assert.equal(providerEmoji('some-random-provider'), FALLBACK);
  assert.equal(FALLBACK, '📦');
});

test('empty / null / undefined → 📦 fallback', () => {
  assert.equal(providerEmoji(''), '📦');
  assert.equal(providerEmoji(null), '📦');
  assert.equal(providerEmoji(undefined), '📦');
});

// ── Aliases (documented in the palette) ───────────────────────────────────────

test('aliases resolve to the same brand', () => {
  assert.equal(providerEmoji('claude'), '🟠');
  assert.equal(providerEmoji('claude_max'), '🟠');
  assert.equal(providerEmoji('google'), '💎');
  assert.equal(providerEmoji('kimi'), '🌙');
  assert.equal(providerEmoji('openai_codex'), '🤖');
  assert.equal(providerEmoji('codex'), '🤖');
});

// ── Invariants ────────────────────────────────────────────────────────────────

test('case-insensitive and whitespace-tolerant', () => {
  assert.equal(providerEmoji('  ANTHROPIC  '), '🟠');
  assert.equal(providerEmoji('OpenAI'), '🟢');
  assert.equal(providerEmoji('Ollama\n'), '🦙');
});

test('specificity: gpt resolves to openai green, not codex', () => {
  assert.equal(providerEmoji('gpt-5'), '🟢');
  assert.equal(providerEmoji('gpt-5-3-codex'), '🤖'); // codex wins when present
});
