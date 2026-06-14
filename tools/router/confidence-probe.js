'use strict';

// confidence-probe.js — Wave 62.5 Block A (Local-First Confidence Cascade).
//
// Pure, deterministic assessment of a LOCAL draft's trustworthiness, computed
// from the draft text Option A already produced (inject_context.js) — ZERO extra
// LLM calls, zero network, zero IO. This is the cascade's decision signal: a
// confident draft is kept (stay local); a shaky draft is withheld so the agent
// reasons it out / escalates instead of echoing a low-quality regurgitation.
//
// It is a ROUTING SIGNAL, not a cloud proxy (NO-PROXY, mission §3/§5): the score
// never depends on a cloud model and never mutates the classifier tier. Mean-
// logprob / self-consistency scoring is a documented future enhancement — Ollama
// returns only text here, and re-sampling in the hook is latency-prohibited.

// Apostrophe class covers straight (') and curly (’) forms.
const AP = "['’]?";
// Explicit non-answer / refusal markers (EN + PT-PT) — strong "weak draft" signal.
const REFUSAL = [
  new RegExp(`\\bi\\s+do${AP}?n${AP}t\\s+know\\b`, 'i'),
  new RegExp(`\\bi\\s+can${AP}t(?:\\s+help)?\\b`, 'i'),
  /\bcannot\s+help\b/i,
  /\bnot\s+sure\b/i,
  /\bunable\s+to\b/i,
  /\bas\s+an?\s+ai\b/i,
  /\bnão\s+sei\b/i,
  /\bnão\s+(?:consigo|posso|sou capaz)\b/i,
  /\bnão\s+tenho\s+a\s+certeza\b/i,
];
// Hedging markers — mild, count-scaled signal of uncertainty.
const HEDGE = [
  /\bmight\b/i, /\bmaybe\b/i, /\bpossibly\b/i, /\bperhaps\b/i, /\bprobably\b/i,
  /\bi\s+think\b/i, /\bi\s+guess\b/i, /\bnot\s+certain\b/i,
  /\btalvez\b/i, /\bacho\s+que\b/i, /\bse\s+calhar\b/i, /\bprovavelmente\b/i,
];

const DEFAULT_LOW = 0.45; // score < this ⇒ band 'low' ⇒ escalate
const HIGH_BAND = 0.7;     // score >= this ⇒ band 'high'

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

/**
 * Score a local draft's self-confidence in [0,1] from its text alone.
 * Pure & total: any non-string / empty input returns a deterministic low score,
 * never throws. `opts.task_category` enables code-specific checks; `opts.lowThreshold`
 * (e.g. from calibrateLowThreshold) overrides the medium/low boundary.
 * @returns {{score:number, band:'high'|'medium'|'low', reasons:string[]}}
 */
function draftConfidence(text, opts = {}) {
  const reasons = [];
  const raw = typeof text === 'string' ? text : '';
  const t = raw.trim();
  if (t.length < 5) return { score: 0, band: 'low', reasons: ['empty_or_degenerate'] };

  let score = 0.9; // local drafts for high-classifier-confidence T0 are usually fine

  if (REFUSAL.some((re) => re.test(t))) { score -= 0.6; reasons.push('refusal_or_nonanswer'); }

  const hedges = HEDGE.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  if (hedges) { score -= Math.min(0.3, 0.1 * hedges); reasons.push(`hedging_x${hedges}`); }

  // Degeneracy: a line repeated across the draft.
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 4 && new Set(lines).size / lines.length < 0.5) {
    score -= 0.5; reasons.push('repeated_lines');
  }
  // Degeneracy: a single token dominating the output.
  const words = t.split(/\s+/);
  if (words.length >= 12) {
    const counts = Object.create(null);
    let max = 0;
    for (const w of words) { const k = w.toLowerCase(); counts[k] = (counts[k] || 0) + 1; if (counts[k] > max) max = counts[k]; }
    if (max / words.length > 0.3) { score -= 0.4; reasons.push('token_repetition'); }
  }

  // Truncation suspicion: a long draft ending mid-sentence (num_predict cap hit).
  const endsClean = /[.!?:）)\]}"'`’]$|```$/.test(t);
  if (!endsClean && t.length > 600) { score -= 0.2; reasons.push('possible_truncation'); }

  // Code drafts: unbalanced fences / brackets ⇒ low confidence the code is whole.
  const cat = String(opts.task_category || '');
  const codeish = /code|gen|refactor|bug|test/i.test(cat) || /```/.test(t) || /[{};]\s*$/.test(t);
  if (codeish) {
    if ((t.match(/```/g) || []).length % 2 !== 0) { score -= 0.25; reasons.push('unbalanced_code_fence'); }
    const open = (t.match(/[{[(]/g) || []).length;
    const close = (t.match(/[)\]}]/g) || []).length;
    if (Math.abs(open - close) > 2) { score -= 0.2; reasons.push('unbalanced_brackets'); }
  }

  score = clamp01(score);
  const low = typeof opts.lowThreshold === 'number' ? opts.lowThreshold : DEFAULT_LOW;
  const band = score >= HIGH_BAND ? 'high' : score >= low ? 'medium' : 'low';
  if (!reasons.length) reasons.push('clean');
  return { score: Number(score.toFixed(3)), band, reasons };
}

/**
 * Percentile-based calibration of the low/escalate threshold (Block D). Given the
 * session's recent confidence scores, set the cutoff at a percentile so a
 * consistently-cautious (or confident) local model isn't mis-escalated. Falls back
 * to the static default with too few samples, and is clamped to a sane band so it
 * can never collapse to 0 or saturate to 1. Pure; never throws.
 */
function calibrateLowThreshold(scores, opts = {}) {
  const fallback = typeof opts.fallback === 'number' ? opts.fallback : DEFAULT_LOW;
  const pct = clamp01(typeof opts.percentile === 'number' ? opts.percentile : 0.25);
  const xs = (Array.isArray(scores) ? scores : [])
    .filter((s) => typeof s === 'number' && s >= 0 && s <= 1)
    .sort((a, b) => a - b);
  if (xs.length < 8) return fallback;
  const idx = pct * (xs.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  const v = xs[lo] + (xs[hi] - xs[lo]) * (idx - lo);
  return Number(Math.min(0.6, Math.max(0.3, v)).toFixed(3));
}

module.exports = { draftConfidence, calibrateLowThreshold, DEFAULT_LOW, HIGH_BAND };
