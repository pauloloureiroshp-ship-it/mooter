'use strict';

// Centralized Mooter glyph map (Wave 2.6 Day 3). Single source of truth for the
// bovine iconography used across the badge, statusline, Moo card, and dashboard
// — so a glyph change lands in one place instead of four. Pure, zero-dep.
//
// Vocabulary per docs/strategy/GLOSSARY.md: Mooter (entity) pastors the Moos
// (workers). Each tier is a different Moo; the provider says where it grazes.

// Tier → Moo glyph. T0_heavy is the larger local model variant (e.g. a 30B
// quant doing a T0 job) so the statusline can distinguish a featherweight Moo
// from a heavy one at a glance.
const TIER_GLYPHS = {
  T0: '🐄',
  T0_heavy: '🐃',
  T1: '🐎',
  T2: '🐂',
  T3: '🦬',
};

// Where the Moo grazes: local (🏠 home), cloud (☁ Anthropic/OpenAI API), or
// max (⚡ subscription / Codex CLI).
const PROVIDER_GLYPHS = {
  local: '🏠',
  cloud: '☁',
  max: '⚡',
};

// Mooter mood — the statusline headline glyph. Mirrors statusline-multi.js
// COLOR_GLYPH so both read from one table going forward.
const MOOD_GLYPHS = {
  healthy: '🐮',
  warning: '🐂',
  critical: '🚨',
  setup: '🛠',
  degraded: '⚪',
};

const FALLBACK = '🐮';

/**
 * Glyph for a Moo, combining its tier and (optionally) its provider.
 *   glyphFor({ tier: 'T2', provider: 'cloud' })                 → '🐂 ☁'
 *   glyphFor({ tier: 'T0', modelSize: 'large', provider: 'local' }) → '🐃 🏠'
 *   glyphFor({ tier: 'T0' })                                    → '🐄'
 * Unknown tier degrades to 🐮 rather than throwing.
 * @param {{ tier?: string, modelSize?: string, provider?: string }} spec
 * @returns {string}
 */
function glyphFor(spec) {
  const { tier, modelSize, provider } = spec || {};
  let tierKey = tier;
  if (tier === 'T0' && modelSize === 'large') tierKey = 'T0_heavy';
  const tierG = TIER_GLYPHS[tierKey] || FALLBACK;
  const provG = provider ? PROVIDER_GLYPHS[provider] : '';
  return provG ? `${tierG} ${provG}` : tierG;
}

/**
 * Map a router backend / provider hint to one of the three provider buckets.
 *   'ollama' → 'local' · 'sonnet'/'opus'/'haiku'/'openai_api' → 'cloud'
 *   'codex_cli' → 'max'
 * @param {unknown} backend
 * @returns {'local'|'cloud'|'max'|undefined}
 */
function providerBucket(backend) {
  const b = String(backend || '').toLowerCase();
  if (!b) return undefined;
  if (b.includes('ollama') || b.includes('local')) return 'local';
  if (b.includes('codex') || b.includes('max') || b.includes('subscription')) return 'max';
  if (/anthropic|claude|subagent|sonnet|opus|haiku|openai|gpt|gemini|cloud/.test(b)) return 'cloud';
  return undefined;
}

/**
 * Mood glyph for the statusline headline. Unknown mood → healthy 🐮.
 * @param {string|null|undefined} mood
 * @returns {string}
 */
function moodGlyph(mood) {
  return MOOD_GLYPHS[mood] || MOOD_GLYPHS.healthy;
}

module.exports = { TIER_GLYPHS, PROVIDER_GLYPHS, MOOD_GLYPHS, glyphFor, providerBucket, moodGlyph };
