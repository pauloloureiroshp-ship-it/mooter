#!/usr/bin/env node
/**
 * backtest.js — analyses ~/.claude/tools/router/decisions.log to discover
 * patterns where the classifier is over- or under-routing, and writes
 * router-tuning.json with concrete tuning suggestions.
 *
 * Output: ~/.claude/tools/router/router-tuning.json
 *         + human-readable report on stdout
 *
 * Pure stdlib. Run daily via scheduled task or `node backtest.js`.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const TUNING_PATH = path.join(ROUTER_DIR, 'router-tuning.json');

// Cost computation — delegated to pricing.js (single source of truth).
// Previously hardcoded as { T0: 0, T1: 0.002, T2: 0.008, T3: 0.045 } which
// drifted from real Anthropic pricing and produced savings numbers that
// didn't match the statusline or /frugal-savings command.
const pricing = require('./pricing');
function tierCostFor(tier, promptLen) {
  return pricing.estimateTurnCost(tier, promptLen || 200);
}
function naiveCostFor(promptLen) {
  return pricing.naiveOpusCost(promptLen || 200);
}

// Doctrine guardrail — signatures containing any of these markers must
// NEVER be proposed as demote candidates. Mirrors HIGH_RISK in classify.js
// (push/deploy/release/migration/.env/secret/architect/refactor/audit/CI etc).
// Kept in sync manually; update both when adding new risk markers.
// v0.7: HIGH_RISK_MARKERS is now imported from the shared patterns.js module.
// TUNING_EXCLUDE is a superset of classify.js HIGH_RISK plus v0.9 broader
// tuning-exclusion markers (bare `push`, `merge`, `review`, `database`,
// `schema`, `--force`, `force-push`, `ci`). Kept as HIGH_RISK_MARKERS for
// backwards compatibility with existing module exports.
const { TUNING_EXCLUDE: HIGH_RISK_MARKERS } = require('./patterns');

function hasHighRisk(text) {
  if (!text) return false;
  return HIGH_RISK_MARKERS.some(rx => rx.test(text));
}

function loadDecisions() {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

// Pattern signature: lowercased first 3 meaningful words
function signature(preview) {
  return (preview || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
}

// ── Sprint A (2026-04-15): Explicit feedback resolution ───────────────────
// Matches quality_feedback events (written by /mooter-good and /mooter-bad
// slash commands via feedback-collector.js) to the classified event they
// rated, tagging it with `explicit_rating` (1=good, 0=bad). Analyzer then
// uses these tags to bias demote candidates (bad-rated → promote to demote
// bucket even if prompt_len >= 50) and to VETO demotes of patterns the user
// explicitly rated as good.
//
// Matching rule: prefer same session_id; fall back to most recent classified
// event before the feedback event's timestamp.
function resolveExplicitFeedback(allEvents) {
  const counts = { good: 0, bad: 0, orphan: 0 };
  const feedbacks = allEvents.filter(e => e.event === 'quality_feedback');
  if (feedbacks.length === 0) return counts;

  const classified = allEvents.filter(e => e.event === 'classified');

  for (const fb of feedbacks) {
    const quality = fb.followup_quality; // 1=good, 0=bad
    if (quality !== 0 && quality !== 1) continue;
    const fbTs = Date.parse(fb.ts || '') || 0;

    let target = null;
    if (fb.session_id) {
      // Prefer last classified with same session_id
      for (let i = classified.length - 1; i >= 0; i--) {
        if (classified[i].session_id === fb.session_id) { target = classified[i]; break; }
      }
    }
    if (!target) {
      // Fallback: last classified before this feedback's timestamp
      for (let i = classified.length - 1; i >= 0; i--) {
        const cTs = Date.parse(classified[i].ts || '') || 0;
        if (cTs <= fbTs && cTs > 0) { target = classified[i]; break; }
      }
    }

    if (!target) { counts.orphan++; continue; }
    target.explicit_rating = quality;
    if (quality === 1) counts.good++; else counts.bad++;
  }

  return counts;
}

// ── v0.9.1: Implicit feedback resolution ──────────────────────────────────
// Resolves turn_end events with followup_pending: true by looking ahead in
// the log for the next classified event with the same session_id.
function resolveFeedback(allEvents) {
  const feedbackSignals = { accepted: 0, followup_immediate: 0 };
  const turnEnds = allEvents.filter(e => e.event === 'turn_end');
  const classified = allEvents.filter(e => e.event === 'classified');

  for (const te of turnEnds) {
    if (!te.followup_pending) continue;
    const teMs = te.ts_ms || 0;
    const sid = te.session_id;

    // Find next classified event with same session_id after this turn_end
    const next = classified.find(c =>
      c.session_id === sid && (c.ts_ms || 0) > teMs
    );

    if (next) {
      const delta = (next.ts_ms || 0) - teMs;
      if (delta < 30000) {
        te.followup_within_30s = true;
        te.feedback_signal = 'followup_immediate';
        feedbackSignals.followup_immediate++;
      } else {
        te.followup_within_30s = false;
        te.feedback_signal = 'accepted';
        feedbackSignals.accepted++;
      }
    } else {
      // No follow-up found — assume accepted
      te.followup_within_30s = false;
      te.feedback_signal = 'accepted';
      feedbackSignals.accepted++;
    }
  }

  return { feedbackSignals, turnEnds };
}

// Sprint B.1: resolve shadow judgments — shadow_better verdicts become
// demotion signals (same weight as explicit_rating=0). This amplifies
// the feedback signal ~10× without requiring human ratings.
function resolveShadowJudgments(allEvents) {
  const counts = { total: 0, primary_better: 0, shadow_better: 0, tie: 0, demoted: 0 };
  const judgments = allEvents.filter(e => e.event === 'shadow_judgment' && e.judge_verdict);
  if (judgments.length === 0) return counts;

  const classified = allEvents.filter(e => e.event === 'classified');
  const classifiedById = new Map();
  for (const c of classified) {
    if (c.session_id) classifiedById.set(c.session_id, c);
  }

  for (const j of judgments) {
    counts.total++;
    counts[j.judge_verdict] = (counts[j.judge_verdict] || 0) + 1;

    if (j.judge_verdict === 'shadow_better') {
      // Find the classified event for this decision and mark for demotion
      const target = j.session_id ? classifiedById.get(j.session_id) : null;
      if (target && (target.tier === 'T2' || target.tier === 'T3')) {
        target.shadow_demote = true;
        target.explicit_rating = 0; // treat as bad — same pipeline as /mooter-bad
        counts.demoted++;
      }
    }
  }
  return counts;
}

function analyze(decisions) {
  const total = decisions.length;
  const byTier = { T0: 0, T1: 0, T2: 0, T3: 0 };
  const sigToTiers = new Map(); // signature -> [tier...]
  const shortHighTier = []; // <50 chars on T2/T3
  const lowConfHighTier = []; // confidence < 0.6 on T2/T3 (escalation noise)
  let qualityIntentHits = 0;   // v0.7: natural-language quality promotion count
  let cacheHits = 0;           // v0.7: classify-cache hit count
  let optimizerHits = 0;       // Sprint 5-A: prompt_optimized event count
  let optimizerTokensSaved = 0;
  const optimizerStrategyCounts = {};
  // Sprint A (2026-04-15): explicit rating signals
  const goodSignatures = new Set();       // user-rated good → veto demote
  const explicitBadOnHighTier = [];        // user-rated bad on T2/T3 → force demote
  let explicitGood = 0;
  let explicitBad = 0;

  for (const d of decisions) {
    // Review #2 fix (2026-04-17): skip tester-generated events entirely.
    // Tester prompts include Ollama meta-instructions ("Thinking...",
    // "We are generating...") that pollute promote/demote candidates.
    // Only real user prompts should inform tuning decisions.
    if (d.source === 'mooter-tester' || d.event?.startsWith('tester_')) continue;

    // Sprint 5-A: count prompt_optimized events (separate event type)
    if (d.event === 'prompt_optimized') {
      optimizerHits++;
      optimizerTokensSaved += (d.tokens_saved_est || 0);
      const s = d.strategy || 'unknown';
      optimizerStrategyCounts[s] = (optimizerStrategyCounts[s] || 0) + 1;
      continue;
    }
    const tier = d.tier || 'T3';
    byTier[tier] = (byTier[tier] || 0) + 1;
    if (d.quality_intent === true) qualityIntentHits += 1;
    if (d.cache_hit === true) cacheHits += 1;
    const sig = signature(d.prompt_preview);
    if (sig) {
      if (!sigToTiers.has(sig)) sigToTiers.set(sig, []);
      sigToTiers.get(sig).push({ tier, conf: d.confidence, len: d.prompt_len });
    }
    // Guardrail: a prompt preview that carries HIGH_RISK markers is never
    // eligible as a demote/promote candidate, regardless of length/confidence.
    // The runtime guardrail in classify.js already blocks demote on HIGH_RISK
    // prompts, but filtering upstream keeps router-tuning.json clean and stops
    // the daily backtest from relearning the same bad patterns every 24h.
    const risky = hasHighRisk(d.prompt_preview);
    if (risky) continue;
    // Sprint A: explicit rating overrides length heuristic for T2/T3
    if (d.explicit_rating === 0 && (tier === 'T2' || tier === 'T3')) {
      explicitBadOnHighTier.push(d);
      shortHighTier.push(d); // force into demote candidate pool
      explicitBad++;
    } else if (d.explicit_rating === 1) {
      explicitGood++;
      if (sig) goodSignatures.add(sig); // protect this signature from demote
    }
    if ((d.prompt_len || 0) < 50 && (tier === 'T2' || tier === 'T3')) {
      shortHighTier.push(d);
    }
    if ((d.confidence || 0) < 0.6 && (tier === 'T2' || tier === 'T3')) {
      lowConfHighTier.push(d);
    }
  }

  // Repeated signatures: same first words seen ≥3 times always at T2/T3
  const repeated = [];
  for (const [sig, hits] of sigToTiers.entries()) {
    if (hits.length < 3) continue;
    const allHigh = hits.every(h => h.tier === 'T2' || h.tier === 'T3');
    if (allHigh) repeated.push({ sig, count: hits.length, tiers: hits.map(h => h.tier) });
  }
  repeated.sort((a, b) => b.count - a.count);

  // Top 3 demote candidates: signatures that appear in shortHighTier
  const demoteCandidates = new Map();
  for (const d of shortHighTier) {
    const sig = signature(d.prompt_preview);
    if (!sig) continue;
    demoteCandidates.set(sig, (demoteCandidates.get(sig) || 0) + 1);
  }
  const topDemote = [...demoteCandidates.entries()]
    .filter(([sig]) => !goodSignatures.has(sig)) // Sprint A: veto patterns user rated good
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sig, count]) => ({ pattern: sig, count }));

  // Promote-to-T0 patterns: short prompts (<30 chars) repeatedly classified
  // T2/T3 with low confidence — almost certainly noise (status pastes, "ok", etc.)
  const promoteCandidates = new Set();
  for (const d of lowConfHighTier) {
    if ((d.prompt_len || 0) < 30) {
      const sig = signature(d.prompt_preview);
      if (sig) promoteCandidates.add(sig);
    }
  }

  // Cost analysis: actual vs naive vs ideal-if-demoted (uses pricing.js)
  let actualCost = 0;
  let idealCost = 0;
  let naiveCost = 0;
  for (const d of decisions) {
    const t = d.tier || 'T3';
    const pl = d.prompt_length || d.prompt_len || 200;
    actualCost += tierCostFor(t, pl);
    naiveCost += naiveCostFor(pl);
    // ideal: if it was a demote candidate, drop one tier
    const sig = signature(d.prompt_preview);
    const isDemote = demoteCandidates.has(sig);
    if (isDemote && t === 'T3') idealCost += tierCostFor('T2', pl);
    else if (isDemote && t === 'T2') idealCost += tierCostFor('T1', pl);
    else idealCost += tierCostFor(t, pl);
  }
  const additionalSavings = Math.max(0, actualCost - idealCost);

  return {
    total,
    byTier,
    naiveCost,
    actualCost,
    idealCost,
    additionalSavings,
    shortHighTier: shortHighTier.length,
    lowConfHighTier: lowConfHighTier.length,
    repeated: repeated.slice(0, 10),
    topDemote,
    promoteToT0: [...promoteCandidates],
    qualityIntentHits,
    cacheHits,
    optimizerHits,
    optimizerTokensSaved,
    optimizerTopStrategies: Object.entries(optimizerStrategyCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, n]) => `${s} ×${n}`),
    // Sprint A: explicit rating signals
    explicitRatings: { good: explicitGood, bad: explicitBad },
    explicitBadOnHighTier: explicitBadOnHighTier.length,
    goodSignaturesProtected: goodSignatures.size,
  };
}

function buildTuning(stats) {
  // Heuristic: if >5% of prompts are short+high-tier, tighten the threshold
  const noiseRatio = stats.total ? stats.shortHighTier / stats.total : 0;
  const complexity_threshold = noiseRatio > 0.1 ? 0.25 : noiseRatio > 0.05 ? 0.3 : 0.35;
  return {
    generated_at: new Date().toISOString(),
    sample_size: stats.total,
    complexity_threshold,
    promote_to_t0_patterns: stats.promoteToT0,
    demote_from_t3_patterns: stats.topDemote.map(d => d.pattern),
    notes: [
      `Analysed ${stats.total} prompts.`,
      `Short prompts on high tier: ${stats.shortHighTier} (${(noiseRatio * 100).toFixed(1)}%).`,
      `Estimated additional savings if patterns demoted: $${stats.additionalSavings.toFixed(4)}.`,
    ],
  };
}

function report(stats, tuning) {
  const lines = [];
  lines.push('frugal — router backtest');
  lines.push('');
  lines.push(`Sample size:        ${stats.total} prompts`);
  lines.push(`Naive cost (T3):    $${stats.naiveCost.toFixed(4)}`);
  lines.push(`Actual cost:        $${stats.actualCost.toFixed(4)}`);
  lines.push(`Ideal (post-tune):  $${stats.idealCost.toFixed(4)}`);
  lines.push(`Additional savings: $${stats.additionalSavings.toFixed(4)}`);
  lines.push('');
  lines.push('Tier distribution:');
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    const n = stats.byTier[t] || 0;
    const pct = stats.total ? ((n / stats.total) * 100).toFixed(1) : '0.0';
    lines.push(`  ${t}  ${String(n).padStart(4)}  (${pct}%)`);
  }
  lines.push('');
  lines.push(`Short prompts on T2/T3:  ${stats.shortHighTier}`);
  lines.push(`Low-conf on T2/T3:        ${stats.lowConfHighTier}`);
  lines.push(`Quality-intent hits:      ${stats.qualityIntentHits || 0}  (natural-language quality promotions)`);
  lines.push(`Classify-cache hits:      ${stats.cacheHits || 0}  (avoided classifier respawn)`);
  if (stats.optimizerHits > 0) {
    const optRate = stats.total ? ((stats.optimizerHits / stats.total) * 100).toFixed(1) : '0.0';
    lines.push(`Prompt optimizer hits:    ${stats.optimizerHits}  (${optRate}% of prompts, ~${stats.optimizerTokensSaved} tokens saved)`);
    if (stats.optimizerTopStrategies.length > 0) {
      lines.push(`  top strategies:         ${stats.optimizerTopStrategies.join(', ')}`);
    }
  }
  // v0.7: if >10% of prompts trip quality_intent, surface a tuning nudge —
  // may mean the user has a new habitual phrase that would be cleaner as a
  // direct user_override keyword.
  const qiRatio = stats.total ? (stats.qualityIntentHits || 0) / stats.total : 0;
  if (qiRatio > 0.1) {
    lines.push('');
    lines.push(`⚠ ${(qiRatio * 100).toFixed(1)}% of prompts triggered quality_intent.`);
    lines.push('  Consider adding the most-used phrase as a user_override shortcut.');
  }
  lines.push('');
  lines.push('Top 3 demote candidates (short + high tier):');
  if (stats.topDemote.length === 0) lines.push('  (none)');
  for (const d of stats.topDemote) {
    lines.push(`  "${d.pattern}"  ×${d.count}`);
  }
  lines.push('');
  lines.push('Repeated signatures always on T2/T3 (≥3 hits):');
  if (stats.repeated.length === 0) lines.push('  (none)');
  for (const r of stats.repeated.slice(0, 5)) {
    lines.push(`  "${r.sig}"  ×${r.count}`);
  }
  lines.push('');
  // v0.9.1: feedback signals
  if (stats.feedbackSignals) {
    lines.push('Feedback signals (implicit):');
    lines.push(`  accepted:            ${stats.feedbackSignals.accepted}`);
    lines.push(`  followup_immediate:  ${stats.feedbackSignals.followup_immediate}`);
    lines.push('');
  }
  // Sprint A: explicit ratings from /mooter-good & /mooter-bad
  const er = stats.explicitRatings || { good: 0, bad: 0 };
  if (er.good + er.bad > 0) {
    lines.push('Feedback signals (explicit, user-rated):');
    lines.push(`  good:                ${er.good}`);
    lines.push(`  bad:                 ${er.bad}`);
    lines.push(`  bad on T2/T3 → forced into demote pool: ${stats.explicitBadOnHighTier || 0}`);
    lines.push(`  good signatures protected from demote:  ${stats.goodSignaturesProtected || 0}`);
    lines.push('');
  }
  lines.push(`Tuning written: ${TUNING_PATH}`);
  lines.push(`  complexity_threshold: ${tuning.complexity_threshold}`);
  lines.push(`  promote_to_t0_patterns: ${tuning.promote_to_t0_patterns.length}`);
  lines.push(`  demote_from_t3_patterns: ${tuning.demote_from_t3_patterns.length}`);
  return lines.join('\n');
}

// ── v0.9: --explain mode ──────────────────────────────────────────────────
// For each demote/promote candidate, print the anonymized prompt fingerprints
// that triggered it (length + keyword signals only — never raw text). Used by
// the Paulo when inspecting tuning suggestions before applying them.
function explainCandidates(decisions) {
  const lines = [];
  lines.push('frugal — backtest --explain');
  lines.push('');
  const stats = analyze(decisions);

  lines.push('Demote candidates (short prompts repeatedly high-tier):');
  if (stats.topDemote.length === 0) lines.push('  (none)');
  for (const d of stats.topDemote) {
    lines.push(`  pattern "${d.pattern}" ×${d.count}`);
    lines.push(`    current tier: T2/T3  →  suggested: T0/T1`);
    const rx = `/\\b${d.pattern.split(/\s+/).join('\\s+')}\\b/i`;
    lines.push(`    regex:        ${rx}`);
    const savingEst = d.count * (naiveCostFor(200) - tierCostFor('T1', 200));
    lines.push(`    saving est:   $${savingEst.toFixed(4)}`);
  }
  lines.push('');
  lines.push('Promote-to-T0 patterns (short, low-confidence, high-tier):');
  if (stats.promoteToT0.length === 0) lines.push('  (none)');
  for (const p of stats.promoteToT0) {
    const rx = `/\\b${p.split(/\s+/).join('\\s+')}\\b/i`;
    lines.push(`  "${p}"  →  ${rx}`);
  }
  lines.push('');
  lines.push(`Total sample: ${stats.total} prompts`);
  lines.push(`HIGH_RISK filter removed prompts from candidates silently.`);
  return lines.join('\n');
}

// ── v0.9: delta export (federated learning Phase 2) ──────────────────────
// Exports an anonymized fingerprint JSON with NO prompt text, NO paths,
// NO variable/function names. Safe to share via GitHub issue or PR.
//
// Privacy guarantees (see docs/FEDERATED_LEARNING.md):
//   - keyword_signals only contains tokens from KEYWORD_ALLOW_LIST
//   - prompt_len_bucket is a 50-char bucket, not the exact length
//   - session_hour is only the hour, no date
//   - instance_id is a SHA-256(machine-id) truncated to 8 chars
//   - has_file_refs / has_code_block are booleans

const KEYWORD_ALLOW_LIST = new Set([
  'commit', 'message', 'docstring', 'summarize', 'explain', 'fix',
  'bug', 'error', 'debug', 'trace', 'root cause', 'refactor', 'extract',
  'classify', 'plan', 'design', 'architect', 'review', 'test', 'deploy',
  'migration', 'secret', 'credentials', 'production', 'merge', 'schema',
  'math', 'proof', 'equation', 'step by step', 'reasoning',
]);

function lenBucket(n) {
  if (!n) return '0-50';
  const lo = Math.floor(n / 50) * 50;
  return `${lo}-${lo + 50}`;
}

function hourOf(tsIso) {
  try {
    const d = new Date(tsIso);
    return d.getUTCHours();
  } catch { return null; }
}

function extractKeywordSignals(preview) {
  if (!preview) return [];
  const low = preview.toLowerCase();
  const hits = [];
  for (const kw of KEYWORD_ALLOW_LIST) {
    if (low.includes(kw)) hits.push(kw);
  }
  return hits;
}

function instanceIdSync() {
  try {
    const mid = require('os').hostname() + '|' + (require('os').userInfo().username || '');
    return require('crypto').createHash('sha256').update(mid).digest('hex').slice(0, 8);
  } catch { return 'unknown0'; }
}

function hardwareTier() {
  try {
    const probe = require('./gpu-probe');
    const g = probe.probeSync ? probe.probeSync() : null;
    if (!g) return 'cpu-only';
    if (g.vendor === 'apple') return 'apple-silicon';
    if (g.vendor === 'cpu') return 'cpu-only';
    if (g.vendor === 'nvidia') {
      const n = (g.name_short || '').toLowerCase();
      if (/(4090|4080|3090)/.test(n)) return 'gpu-high';
      if (/(3080|4070|3070)/.test(n)) return 'gpu-mid';
      return 'gpu-low';
    }
    return 'gpu-low';
  } catch { return 'cpu-only'; }
}

function exportDelta(decisions) {
  // Bucket decisions by (decided_tier, prompt_len_bucket, keyword signals).
  const deltaBuckets = new Map();
  const promoteBuckets = new Map();

  for (const d of decisions) {
    if (!d || !d.tier || !d.prompt_preview) continue;
    if (hasHighRisk(d.prompt_preview)) continue; // never export HIGH_RISK
    const bucket = lenBucket(d.prompt_len || 0);
    const signals = extractKeywordSignals(d.prompt_preview);
    const key = `${d.tier}|${bucket}|${signals.join(',')}`;
    // Misroute heuristic: low confidence + high tier = candidate for T0.
    if ((d.confidence || 0) < 0.6 && (d.tier === 'T2' || d.tier === 'T3')) {
      const existing = deltaBuckets.get(key) || {
        delta_type: 'misroute',
        decided_tier: d.tier,
        correct_tier: 'T0',
        prompt_len_bucket: bucket,
        has_file_refs: /\.(js|ts|py|go|md|json)\b/.test(d.prompt_preview),
        has_code_block: /```/.test(d.prompt_preview),
        keyword_signals: signals,
        session_hour: hourOf(d.ts),
        n: 0,
      };
      existing.n += 1;
      deltaBuckets.set(key, existing);
    }
    // Underpowered: quality_intent promoted + bug/debug keywords at T1
    if (d.tier === 'T1' && signals.some((s) => ['bug', 'debug', 'trace', 'root cause'].includes(s))) {
      const existing = promoteBuckets.get(key) || {
        delta_type: 'underpowered',
        decided_tier: 'T1',
        correct_tier: 'T2',
        keyword_signals: signals,
        n: 0,
      };
      existing.n += 1;
      promoteBuckets.set(key, existing);
    }
  }

  // Filter: only keep buckets with n >= 3.
  const deltas = [...deltaBuckets.values()].filter((d) => d.n >= 3);
  const promote_signals = [...promoteBuckets.values()].filter((p) => p.n >= 3);

  return {
    frugal_version: '0.9.0',
    classifier_version: '1.0.0',
    generated_at: new Date().toISOString(),
    instance_id: instanceIdSync(),
    hardware_tier: hardwareTier(),
    deltas,
    promote_signals,
  };
}

function exportEvents(decisions, outputPath) {
  const eventBuilder = require('./event-builder.js');
  const events = [];

  for (const d of decisions) {
    const event = eventBuilder.buildEvent(d, [], null, {});
    if (!event) continue;
    const validation = eventBuilder.validateEventPrivacy(event);
    if (!validation.ok) continue;
    events.push(event);
  }

  fs.writeFileSync(outputPath, JSON.stringify(events, null, 2));
  console.log(`Exported ${events.length} events to ${outputPath} (privacy contract applied)`);
  console.log(`  Decisions scanned: ${decisions.length}`);
  console.log(`  Events filtered:   ${decisions.length - events.length} (HIGH_RISK / validation)`);
  console.log(`  Tip: run hub-submit-events.js to send these events to mooter-hub`);
}

// ── P5: --optimizer-dryrun (overnight-tuning 2026-04-12) ──────────────────
// Simulates the prompt optimizer against the full historical corpus.
// For each classified event, runs optimizer.optimize() and aggregates
// results: total optimized, est tokens saved, strategies by tier.
function optimizerDryrun(decisions) {
  const optimizer = require('./prompt-optimizer');
  const classifySrc = fs.readFileSync(path.join(__dirname, 'classify.js'), 'utf8');
  const iifeIdx = classifySrc.search(/\(async \(\) => \{/);
  const classifyBody = classifySrc.slice(0, iifeIdx).replace(/^#!.*\n/, '');
  const classifyFn = new Function('require', `${classifyBody}\nreturn classify;`)(require);

  const classified = decisions.filter(d => d.event === 'classified');
  let totalOptimized = 0;
  let totalTokensSaved = 0;
  const byTier = { T0: { n: 0, optimized: 0, tokens: 0 }, T1: { n: 0, optimized: 0, tokens: 0 }, T2: { n: 0, optimized: 0, tokens: 0 }, T3: { n: 0, optimized: 0, tokens: 0 } };
  const strategyCounts = {};

  for (const d of classified) {
    const preview = d.prompt_preview || '';
    if (!preview || preview.length < 30) continue;

    // Re-classify to get full decision object
    const decision = classifyFn(preview);
    const tier = decision.tier || 'T3';
    if (!byTier[tier]) byTier[tier] = { n: 0, optimized: 0, tokens: 0 };
    byTier[tier].n++;

    const result = optimizer.optimize(preview, decision);
    if (result) {
      totalOptimized++;
      totalTokensSaved += result.tokens_saved_est;
      byTier[tier].optimized++;
      byTier[tier].tokens += result.tokens_saved_est;
      const s = result.strategy || 'unknown';
      strategyCounts[s] = (strategyCounts[s] || 0) + 1;
    }
  }

  const lines = [];
  lines.push('frugal — optimizer dryrun (retrospective simulation)');
  lines.push('');
  lines.push(`Corpus:             ${classified.length} classified events`);
  lines.push(`Eligible (≥30ch):   ${Object.values(byTier).reduce((s, t) => s + t.n, 0)}`);
  lines.push(`Optimized:          ${totalOptimized} (${classified.length ? ((totalOptimized / classified.length) * 100).toFixed(1) : 0}%)`);
  lines.push(`Tokens saved (est): ${totalTokensSaved}`);
  lines.push('');
  lines.push('By tier:');
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    const b = byTier[t];
    if (b.n === 0) { lines.push(`  ${t}: 0 eligible`); continue; }
    const pct = ((b.optimized / b.n) * 100).toFixed(1);
    lines.push(`  ${t}: ${b.optimized}/${b.n} optimized (${pct}%), ~${b.tokens} tokens saved`);
  }
  lines.push('');
  lines.push('Strategy breakdown:');
  const sortedStrats = Object.entries(strategyCounts).sort((a, b) => b[1] - a[1]);
  if (sortedStrats.length === 0) lines.push('  (none)');
  for (const [s, n] of sortedStrats) {
    lines.push(`  ${s}: ${n} hits`);
  }

  console.log(lines.join('\n'));
}

function main() {
  const args = process.argv.slice(2);
  const explain = args.includes('--explain');
  const optimizerDryrunMode = args.includes('--optimizer-dryrun');
  const exportMode = args.includes('--export-delta');
  const exportEventsMode = args.includes('--export-events');
  const outputIdx = args.indexOf('--output');
  const exportEventsIdx = args.indexOf('--export-events');
  const exportEventsPath =
    exportEventsIdx >= 0 && args[exportEventsIdx + 1] && !args[exportEventsIdx + 1].startsWith('--')
      ? args[exportEventsIdx + 1]
      : path.join(ROUTER_DIR, 'events-export.json');
  const outputPath =
    outputIdx >= 0 && args[outputIdx + 1]
      ? args[outputIdx + 1]
      : path.join(ROUTER_DIR, 'backtest-delta.json');

  const decisions = loadDecisions();
  if (decisions.length === 0) {
    console.log('frugal backtest: decisions.log empty or missing.');
    process.exit(0);
  }

  if (exportEventsMode) {
    exportEvents(decisions.filter(d => d.event === 'classified'), exportEventsPath);
    return;
  }

  if (optimizerDryrunMode) {
    optimizerDryrun(decisions);
    return;
  }

  // v0.9.1: resolve feedback signals from turn_end events
  const { feedbackSignals } = resolveFeedback(decisions);
  // Sprint A: resolve explicit ratings from quality_feedback events
  const explicitRatings = resolveExplicitFeedback(decisions);
  // Sprint B.1: resolve shadow judgments — shadow_better → force demote
  const shadowCounts = resolveShadowJudgments(decisions);

  if (explain) {
    console.log(explainCandidates(decisions));
    console.log('');
    console.log('Feedback signals:');
    console.log(`  accepted:            ${feedbackSignals.accepted}`);
    console.log(`  followup_immediate:  ${feedbackSignals.followup_immediate}`);
    console.log(`Shadow judgments: ${shadowCounts.total} (primary=${shadowCounts.primary_better} shadow=${shadowCounts.shadow_better} tie=${shadowCounts.tie} demoted=${shadowCounts.demoted})`);
    return;
  }

  if (exportMode) {
    const delta = exportDelta(decisions);
    // v0.9.1: include feedback signals in delta
    delta.feedback_signals = feedbackSignals;
    delta.explicit_ratings = explicitRatings; // Sprint A
    delta.shadow_judgments = shadowCounts; // Sprint B.1
    fs.writeFileSync(outputPath, JSON.stringify(delta, null, 2));
    console.log(`frugal backtest: delta written to ${outputPath}`);
    console.log(`  deltas:          ${delta.deltas.length}`);
    console.log(`  promote_signals: ${delta.promote_signals.length}`);
    console.log(`  hardware_tier:   ${delta.hardware_tier}`);
    console.log(`  instance_id:     ${delta.instance_id}`);
    console.log(`  feedback:        ${JSON.stringify(feedbackSignals)}`);

    // ── Auto-push to mooter-hub (v0.9.2) ──────────────────────────────────────
    // Fire-and-forget: não bloqueia nem falha se hub offline.
    const hubPushPath = path.join(ROUTER_DIR, 'hub-push.js');
    if (fs.existsSync(hubPushPath)) {
      const child = spawn(process.execPath, [hubPushPath, outputPath], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      console.log('[backtest] delta queued for hub-push (background)');
    }
    // ─────────────────────────────────────────────────────────────────────────

    return;
  }

  const stats = analyze(decisions);
  stats.feedbackSignals = feedbackSignals;
  const tuning = buildTuning(stats);
  fs.writeFileSync(TUNING_PATH, JSON.stringify(tuning, null, 2));
  console.log(report(stats, tuning));

  // ── Auto-update metrics snapshot (v0.9.6+) ──────────────────────────────
  // Keeps metrics-snapshot.json in sync after every backtest run so the
  // corpus count in docs/statusline is always the real value from decisions.log
  // (not the stale 1,437 manual snapshot). Fire-and-forget — never blocks.
  const updateMetricsPath = path.join(ROUTER_DIR, 'update-metrics.js');
  if (fs.existsSync(updateMetricsPath)) {
    const metricsChild = spawn(process.execPath, [updateMetricsPath], {
      detached: true,
      stdio: 'ignore',
    });
    metricsChild.unref();
    console.log('[backtest] metrics-snapshot.json update queued (background)');
  }
  // ─────────────────────────────────────────────────────────────────────────
}

// Exports MUST be set before main() runs, because exportEvents() lazy-requires
// event-builder.js which circular-requires backtest.js at its top level.
module.exports = {
  analyze,
  buildTuning,
  signature,
  // v0.9 exports
  exportDelta,
  explainCandidates,
  KEYWORD_ALLOW_LIST,
  hardwareTier,
  HIGH_RISK_MARKERS,
  hasHighRisk,
  // v0.9.1 exports
  resolveFeedback,
  // Sprint A (2026-04-15) exports
  resolveExplicitFeedback,
  resolveShadowJudgments,
  // v0.9.5 exports
  exportEvents,
};

if (require.main === module) main();
