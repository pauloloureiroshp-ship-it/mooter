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
 *   'ollama' → 'local' · 'sonnet'/'opus'/'haiku'/'openai_api'/'kimi' → 'cloud'
 *   'codex_cli' → 'max'
 *
 * ⚠️ `kimi`/`moonshot` é `cloud`, não `max`, e a distinção importa para o dono:
 * `max` é capacidade JÁ PAGA por subscrição (Claude, Codex CLI) — gastá-la não
 * acrescenta custo marginal. `cloud` é pago ao token. O kimi-k3 custa USD reais
 * ($3/M in, $15/M out; $0,30/M com cache hit), portanto pertence ao mesmo balde
 * das APIs medidas, mesmo sendo de outro fornecedor. Quem lê o badge distingue-o
 * na etiqueta do modelo (`☁ kimi` vs `☁ sonnet`), não no glifo do provedor.
 *
 * @param {unknown} backend
 * @returns {'local'|'cloud'|'max'|undefined}
 */
function providerBucket(backend) {
  const b = String(backend || '').toLowerCase();
  if (!b) return undefined;
  if (b.includes('ollama') || b.includes('local')) return 'local';
  if (b.includes('codex') || b.includes('max') || b.includes('subscription')) return 'max';
  if (/anthropic|claude|subagent|sonnet|opus|haiku|openai|gpt|gemini|kimi|moonshot|cloud/.test(b)) return 'cloud';
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

// ── Wave 55 (Phase A.4) — ASCII glyph fallback ──────────────────────────────
// Some terminals/fonts (notably a few macOS setups) render the bovine emoji as
// tofu or at the wrong cell width. `MOOTER_GLYPH_MODE=ascii` opts into a plain
// transcription. Default (env unset) is byte-identical — nothing here runs.
//
// Box-drawing/block/geometric glyphs (│ · ▰▱▓░█ and the ▁-▇ sparkline) are NOT
// touched: they render 1-cell consistently everywhere and are the line's
// structure, not its iconography. We only fold the emoji that misrender.
const ASCII_GLYPHS = {
  // mood (headline)
  '🐮': '[M]', '🐂': '[!]', '🚨': '[X]', '🛠': '[~]', '⚪': '[o]',
  // tier Moos
  '🐃': 'T0+', '🐄': 'T0', '🐎': 'T1', '🦬': 'T3',
  // providers
  '🏠': 'local', '☁': 'cloud', '⚡': 'max',
  // chips
  '🪙': '$', '🧬': 'adapter', '🎮': 'GPU', '📊': 'stat', '🔧': 'setup',
  '👤': 'user', '🔥': 'burn', '🧪': 'bench', '📜': 'audit', '🐝': 'spawn',
  '🔒': 'lock', '🪟': 'win', '🤖': 'agent', '🧠': 'mem', '💎': 'model',
  '🐺': 'herd', '🧭': 'nav', '🪜': 'ladder', '🖼': 'img', '📚': 'packs',
  '⏱': 'time', '⇄': 'sync', '🐄': 'T0',
};

// Strip any emoji we didn't explicitly map, so ascii mode never leaves a
// half-rendered glyph. Ranges deliberately EXCLUDE U+2500–25FF (box/block/
// geometric — the bars and separators we keep).
const LEFTOVER_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu;

/**
 * Transcribe Mooter's emoji glyphs to ASCII tokens. Pure; ANSI codes and
 * box/block glyphs pass through untouched. Wave 55 (Phase A.4).
 * @param {string} str
 * @returns {string}
 */
function toAscii(str) {
  if (typeof str !== 'string') return str;
  let out = str;
  for (const [emoji, ascii] of Object.entries(ASCII_GLYPHS)) {
    if (out.includes(emoji)) out = out.split(emoji).join(ascii);
  }
  out = out.replace(LEFTOVER_EMOJI, '');
  // collapse spaces a removed glyph may have doubled, but preserve newlines
  return out.replace(/[^\S\n]{2,}/g, ' ').replace(/[^\S\n]+\n/g, '\n');
}

/** True when the ASCII glyph fallback is opted in. */
function asciiGlyphs(env) {
  return (env || process.env).MOOTER_GLYPH_MODE === 'ascii';
}

module.exports = {
  TIER_GLYPHS, PROVIDER_GLYPHS, MOOD_GLYPHS, glyphFor, providerBucket, moodGlyph,
  ASCII_GLYPHS, toAscii, asciiGlyphs,
};
