// Wave 2.6 Day 3 — centralized glyph map. node:test + assert.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { glyphFor, moodGlyph, providerBucket, TIER_GLYPHS } = require('./glyphs.js');

test('glyphFor: tier + provider combinations', () => {
  assert.equal(glyphFor({ tier: 'T0', provider: 'local' }), '🐄 🏠');
  assert.equal(glyphFor({ tier: 'T0', modelSize: 'large', provider: 'local' }), '🐃 🏠');
  assert.equal(glyphFor({ tier: 'T1', provider: 'cloud' }), '🐎 ☁');
  assert.equal(glyphFor({ tier: 'T2', provider: 'cloud' }), '🐂 ☁');
  assert.equal(glyphFor({ tier: 'T3', provider: 'max' }), '🦬 ⚡');
});

test('glyphFor: tier only (no provider) omits the provider glyph', () => {
  assert.equal(glyphFor({ tier: 'T0' }), '🐄');
  assert.equal(glyphFor({ tier: 'T3' }), '🦬');
});

test('glyphFor: unknown tier falls back to 🐮', () => {
  assert.equal(glyphFor({ tier: 'T99', provider: 'local' }), '🐮 🏠');
  assert.equal(glyphFor({}), '🐮');
  assert.equal(glyphFor(null), '🐮');
});

test('providerBucket: maps backends to local/cloud/max', () => {
  assert.equal(providerBucket('ollama'), 'local');
  assert.equal(providerBucket('sonnet'), 'cloud');
  assert.equal(providerBucket('opus'), 'cloud');
  assert.equal(providerBucket('openai_api'), 'cloud');
  assert.equal(providerBucket('codex_cli'), 'max');
  assert.equal(providerBucket(''), undefined);
  assert.equal(providerBucket(null), undefined);
});

test('moodGlyph: maps moods, unknown → healthy', () => {
  assert.equal(moodGlyph('healthy'), '🐮');
  assert.equal(moodGlyph('warning'), '🐂');
  assert.equal(moodGlyph('critical'), '🚨');
  assert.equal(moodGlyph('setup'), '🛠');
  assert.equal(moodGlyph(null), '🐮');
  assert.equal(moodGlyph('bogus'), '🐮');
});

test('TIER_GLYPHS: all four tiers present + heavy variant', () => {
  for (const k of ['T0', 'T0_heavy', 'T1', 'T2', 'T3']) {
    assert.equal(typeof TIER_GLYPHS[k], 'string');
    assert.ok(TIER_GLYPHS[k].length > 0);
  }
});

// Wave 55 (Phase A.4) — ASCII glyph fallback.
const { toAscii, asciiGlyphs } = require('./glyphs.js');

test('toAscii: maps mood/provider glyphs, strips unmapped emoji, keeps structure', () => {
  assert.equal(toAscii('🐮 saved'), '[M] saved');
  assert.equal(toAscii('🐂 warn'), '[!] warn');
  assert.equal(toAscii('☁ Claude · 🪙 T0:0'), 'cloud Claude · $ T0:0', 'provider+chip mapped, · and bars kept');
  // an unmapped emoji is stripped, never left half-rendered
  assert.ok(!/[\u{1F000}-\u{1FAFF}]/u.test(toAscii('🥳 party')), 'unmapped emoji removed');
  // box-drawing / block bars are preserved (structure, not iconography)
  assert.equal(toAscii('[▓▓░░] │ ▅▅'), '[▓▓░░] │ ▅▅');
  // non-strings pass through
  assert.equal(toAscii(null), null);
  // newlines preserved
  assert.equal(toAscii('🐮 a\n☁ b'), '[M] a\ncloud b');
});

test('asciiGlyphs: reads MOOTER_GLYPH_MODE from the given env', () => {
  assert.equal(asciiGlyphs({ MOOTER_GLYPH_MODE: 'ascii' }), true);
  assert.equal(asciiGlyphs({ MOOTER_GLYPH_MODE: 'emoji' }), false);
  assert.equal(asciiGlyphs({}), false);
});

// ── kimi / Moonshot (2026-08-16) ────────────────────────────────────────────
// O kimi estava implementado, pago e configurado, e NENHUM ficheiro do router
// o conhecia: badge.js, post_tool_badge.js, inject_context.js e gsd-statusline.js
// davam todos 0 ocorrencias. Um motor que o dono paga e que nao aparece em lado
// nenhum e capacidade a render zero.
test('providerBucket: kimi e moonshot sao cloud, nao max', () => {
  assert.equal(providerBucket('kimi'), 'cloud');
  assert.equal(providerBucket('moonshot'), 'cloud');
  assert.equal(providerBucket('kimi-k3'), 'cloud');
  // a distincao que importa ao dono: `max` e capacidade JA PAGA por subscricao
  // (gasta-la nao acrescenta custo marginal); `cloud` e pago ao token. O kimi
  // custa USD reais, logo nao pode partilhar balde com o Codex CLI.
  assert.notEqual(providerBucket('kimi'), 'max');
  assert.equal(providerBucket('codex_cli'), 'max');
});

