#!/usr/bin/env node
// @ts-check
/**
 * holdout-validator.js — train/test split for backtest.js.
 *
 * Why this exists: backtest.js currently fits tuning recommendations on
 * the same decisions.log it then evaluates against. That's a textbook
 * train/test leak — overfitting to user-specific quirks looks like
 * universal improvement on the in-sample report. Without an independent
 * holdout, we cannot tell whether a proposed demote pattern generalises
 * or just memorises a recent burst.
 *
 * Approach: chronological split. The last `holdoutPct` of decisions
 * (sorted by timestamp) are reserved as the test set; backtest.analyze
 * runs on the earlier rows, then we check how the resulting tuning
 * would have classified the holdout — does it agree with the user's
 * observed outcomes (explicit ratings, retry signals)?
 *
 * Why chronological, not random: real drift is temporal. A random split
 * lets the model peek at "the future" through neighbouring same-day
 * prompts, hiding actual generalisation gaps.
 *
 * Pure helpers, no I/O. backtest.js wires this in via a `--holdout` flag.
 *
 * CLI:
 *   (this module is library-only — invoke via backtest.js --holdout)
 */

'use strict';

const DEFAULT_HOLDOUT_PCT = 0.2;

// ── Chronological split ───────────────────────────────────────────────

/**
 * Sort decisions by timestamp (older first), then split off the last
 * `holdoutPct` as the holdout set. Non-classified events (turn_end,
 * quality_feedback, shadow_judgment, …) are kept inside their cohort
 * so the train side still has full feedback context for analyze().
 *
 * @param {Array<Record<string, any>>} decisions
 * @param {number} [holdoutPct=0.2]
 * @returns {{ train: Array<Record<string, any>>, holdout: Array<Record<string, any>> }}
 */
function splitChronological(decisions, holdoutPct) {
  const pct = typeof holdoutPct === 'number' ? holdoutPct : DEFAULT_HOLDOUT_PCT;
  if (!Array.isArray(decisions) || !decisions.length) {
    return { train: [], holdout: [] };
  }
  if (pct <= 0 || pct >= 1) {
    throw new Error(`holdoutPct must be in (0,1); got ${pct}`);
  }
  // Stable sort by ts_ms (fallback to ts string parse, then preserve order).
  const sorted = decisions
    .map((d, i) => ({ d, i, ms: tsMs(d) }))
    .sort((a, b) => (a.ms - b.ms) || (a.i - b.i))
    .map((x) => x.d);

  // We split on classified events to avoid the holdout being "all noise".
  // Find the index in sorted[] where 80% of CLASSIFIED events have passed.
  const classifiedIdx = [];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] && sorted[i].event === 'classified') classifiedIdx.push(i);
  }
  if (classifiedIdx.length < 5) {
    // Not enough signal to bother splitting — everything goes to train.
    return { train: sorted.slice(), holdout: [] };
  }
  const cutClassifiedIdx = Math.floor(classifiedIdx.length * (1 - pct));
  const cutInSorted = classifiedIdx[cutClassifiedIdx] || sorted.length;
  return {
    train:   sorted.slice(0, cutInSorted),
    holdout: sorted.slice(cutInSorted),
  };
}

function tsMs(d) {
  if (!d) return 0;
  if (typeof d.ts_ms === 'number') return d.ts_ms;
  if (d.ts) {
    const ms = Date.parse(d.ts);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

// ── Holdout validation ────────────────────────────────────────────────

/**
 * Apply a candidate tuning's promote/demote pattern lists to each
 * classified holdout decision, then bucket the proposed flips by their
 * agreement with the user's observed outcome.
 *
 * Buckets:
 *   - agreed       — flip + holdout had explicit_rating=0 (user said
 *                     this tier was wrong). Tuning would have helped.
 *   - conflicted   — flip + holdout had explicit_rating=1 (user said
 *                     the original tier was right). Tuning would have
 *                     regressed; veto-list candidate.
 *   - ambiguous    — flip + no rating. Counts toward neither side.
 *   - no_flip      — tuning would have left the decision alone.
 *
 * Accuracy is `agreed / (agreed + conflicted)` — the proposal's hit rate
 * on the prompts that actually had ground-truth feedback. NaN when the
 * denominator is zero (cannot judge with zero ratings).
 *
 * @param {{ promote_to_t0_patterns?: string[], demote_from_t3_patterns?: string[] }} tuning
 * @param {Array<Record<string, any>>} holdout
 * @param {(preview: string | undefined) => string} signatureFn
 *        — pass `backtest.signature` so the matcher uses identical
 *          tokenisation to the training side.
 * @returns {{
 *   total_classified: number,
 *   flips_proposed:   number,
 *   agreed:           number,
 *   conflicted:       number,
 *   ambiguous:        number,
 *   no_flip:          number,
 *   accuracy:         number | null,
 *   conflict_signatures: string[],
 * }}
 */
function validateAgainstHoldout(tuning, holdout, signatureFn) {
  const promote = new Set(Array.isArray(tuning && tuning.promote_to_t0_patterns) ? tuning.promote_to_t0_patterns : []);
  const demote  = new Set(Array.isArray(tuning && tuning.demote_from_t3_patterns) ? tuning.demote_from_t3_patterns : []);
  const result = {
    total_classified: 0,
    flips_proposed:   0,
    agreed:           0,
    conflicted:       0,
    ambiguous:        0,
    no_flip:          0,
    /** @type {string[]} */
    conflict_signatures: [],
  };
  if (!Array.isArray(holdout) || !holdout.length) {
    return Object.assign(result, { accuracy: null });
  }
  const sig = typeof signatureFn === 'function'
    ? signatureFn
    : ((p) => String(p || '').toLowerCase().split(/\s+/).slice(0, 3).join(' '));

  for (const d of holdout) {
    if (!d || d.event !== 'classified') continue;
    if (d.source === 'mooter-tester') continue;
    result.total_classified++;
    const s = sig(d.prompt_preview);
    if (!s) { result.no_flip++; continue; }
    const tier = String(d.tier || '');
    const wouldFlip =
      (promote.has(s) && (tier === 'T2' || tier === 'T3')) ||
      (demote.has(s)  && (tier === 'T2' || tier === 'T3'));
    if (!wouldFlip) { result.no_flip++; continue; }
    result.flips_proposed++;
    const rating = d.explicit_rating;
    if (rating === 0) {
      result.agreed++;
    } else if (rating === 1) {
      result.conflicted++;
      if (result.conflict_signatures.length < 10) result.conflict_signatures.push(s);
    } else {
      result.ambiguous++;
    }
  }
  const denom = result.agreed + result.conflicted;
  const accuracy = denom > 0 ? result.agreed / denom : null;
  return Object.assign(result, { accuracy });
}

// ── Reporting helper ──────────────────────────────────────────────────

/**
 * Render a holdout-validation result into a short, readable block. Used
 * by backtest.js report() when --holdout is set.
 *
 * @param {ReturnType<typeof validateAgainstHoldout>} v
 */
function formatHoldoutReport(v) {
  const lines = ['── Holdout validation ─────────────────────────────────────────'];
  lines.push(`  Holdout size:        ${v.total_classified} classified events`);
  lines.push(`  Flips proposed:      ${v.flips_proposed}`);
  lines.push(`    agreed (good):     ${v.agreed}     ← user rated bad, tuning would fix`);
  lines.push(`    conflicted (bad):  ${v.conflicted} ← user rated good, tuning would regress`);
  lines.push(`    ambiguous:         ${v.ambiguous}  ← no rating either way`);
  if (v.accuracy === null) {
    lines.push(`  Accuracy:            n/a (no rated flips in holdout)`);
  } else {
    const pct = (v.accuracy * 100).toFixed(1);
    const verdict = v.accuracy >= 0.7 ? '✓ ship' : v.accuracy >= 0.5 ? '⚠ marginal' : '✗ regress risk';
    lines.push(`  Accuracy:            ${pct}%  ${verdict}`);
  }
  if (v.conflict_signatures.length) {
    lines.push(`  Conflict signatures: ${v.conflict_signatures.slice(0, 5).join(' | ')}`);
  }
  return lines.join('\n');
}

module.exports = {
  splitChronological,
  validateAgainstHoldout,
  formatHoldoutReport,
  DEFAULT_HOLDOUT_PCT,
};
