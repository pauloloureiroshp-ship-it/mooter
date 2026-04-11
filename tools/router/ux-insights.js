#!/usr/bin/env node
/**
 * ux-insights.js — Analyzes decisions.log for UX friction signals.
 *
 * Looks for patterns that indicate user frustration or router inadequacy:
 *   - User overrides (explicitly requested a different model)
 *   - Low confidence decisions (<0.5)
 *   - Arbiter activations (semantic uncertainty)
 *   - Quality-intent signals ("pensa bem", "think hard")
 *   - Repeated misrouting patterns
 *
 * Output: JSON with actionable UX/UI improvement suggestions.
 *
 * Usage:
 *   node ux-insights.js              → human-readable report
 *   node ux-insights.js --json       → machine-readable JSON
 *   node ux-insights.js --append     → append to ux-insights-history.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const HISTORY_PATH = path.join(ROUTER_DIR, 'ux-insights-history.json');

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const appendMode = args.includes('--append');

if (!fs.existsSync(LOG_PATH)) {
  console.log(jsonMode ? '{"error":"no decisions.log"}' : 'No decisions.log found.');
  process.exit(0);
}

const lines = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

if (events.length === 0) {
  console.log(jsonMode ? '{"error":"empty log"}' : 'decisions.log is empty.');
  process.exit(0);
}

// ── Analysis ────────────────────────────────────────────────────

const insights = {
  timestamp: new Date().toISOString(),
  total_prompts: events.length,
  period: {
    first: events[0]?.ts || 'unknown',
    last: events[events.length - 1]?.ts || 'unknown',
  },
  friction_signals: {},
  suggestions: [],
};

// 1. User overrides
const overrides = events.filter(e =>
  e.escalation_rule && /user_override|USER_OVERRIDE/.test(e.escalation_rule)
);
insights.friction_signals.user_overrides = {
  count: overrides.length,
  pct: +(overrides.length / events.length * 100).toFixed(1),
  samples: overrides.slice(0, 5).map(e => ({
    preview: (e.prompt_preview || '').slice(0, 80),
    original_tier: e.task_category,
    override_to: e.tier,
  })),
};
if (overrides.length / events.length > 0.10) {
  insights.suggestions.push({
    area: 'classifier',
    priority: 'high',
    suggestion: `${overrides.length} user overrides (${(overrides.length/events.length*100).toFixed(0)}%) — users don't trust the router. Review override patterns and add missing classification rules.`,
  });
}

// 2. Low confidence
const lowConf = events.filter(e => e.confidence && e.confidence < 0.5);
insights.friction_signals.low_confidence = {
  count: lowConf.length,
  pct: +(lowConf.length / events.length * 100).toFixed(1),
};
if (lowConf.length / events.length > 0.15) {
  insights.suggestions.push({
    area: 'patterns',
    priority: 'medium',
    suggestion: `${lowConf.length} low-confidence decisions — add more patterns to reduce ambiguity.`,
  });
}

// 3. Quality intent (user wanted better quality)
const qualityIntent = events.filter(e => e.quality_intent === true);
insights.friction_signals.quality_intent = {
  count: qualityIntent.length,
  pct: +(qualityIntent.length / events.length * 100).toFixed(1),
};
if (qualityIntent.length / events.length > 0.15) {
  insights.suggestions.push({
    area: 'ux',
    priority: 'medium',
    suggestion: `${qualityIntent.length} quality-intent signals — users frequently ask for "better" responses. Consider: (a) improving default quality, (b) making beast mode more discoverable, (c) adding a "careful mode" toggle in the statusline.`,
  });
}

// 4. Arbiter activations
const arbiterUsed = events.filter(e =>
  e.escalation_rule && /arbiter/.test(e.escalation_rule)
);
insights.friction_signals.arbiter_activations = {
  count: arbiterUsed.length,
  pct: +(arbiterUsed.length / events.length * 100).toFixed(1),
};

// 5. Tier distribution health
const tiers = { T0: 0, T1: 0, T2: 0, T3: 0 };
events.forEach(e => { if (e.tier) tiers[e.tier]++; });
const total = Object.values(tiers).reduce((a, b) => a + b, 0);
insights.tier_health = {
  distribution: Object.fromEntries(
    Object.entries(tiers).map(([k, v]) => [k, +(v / total * 100).toFixed(1)])
  ),
  free_tier_pct: +((tiers.T0 + tiers.T1) / total * 100).toFixed(1),
  t3_pct: +(tiers.T3 / total * 100).toFixed(1),
};

if (insights.tier_health.t3_pct > 15) {
  insights.suggestions.push({
    area: 'cost',
    priority: 'high',
    suggestion: `T3 at ${insights.tier_health.t3_pct}% — too many prompts going to Opus. Review T3 prompts for demotion candidates.`,
  });
}

if (insights.tier_health.free_tier_pct < 60) {
  insights.suggestions.push({
    area: 'cost',
    priority: 'high',
    suggestion: `Free tier at ${insights.tier_health.free_tier_pct}% — should be >70%. More prompts can be handled locally.`,
  });
}

// 6. Category analysis — which categories dominate?
const cats = {};
events.forEach(e => { if (e.task_category) cats[e.task_category] = (cats[e.task_category] || 0) + 1; });
const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 5);
insights.top_categories = topCats.map(([cat, count]) => ({
  category: cat,
  count,
  pct: +(count / events.length * 100).toFixed(1),
}));

// 7. UX suggestions based on usage patterns
if (tiers.T1 === 0 && total > 50) {
  insights.suggestions.push({
    area: 'ui',
    priority: 'low',
    suggestion: 'T1 (Haiku) tier is unused. If ANTHROPIC_API_KEY is present, consider adding a Haiku-specific skill or showing Haiku availability in the statusline.',
  });
}

const uniqueCategories = Object.keys(cats).length;
if (uniqueCategories < 5 && total > 100) {
  insights.suggestions.push({
    area: 'ux',
    priority: 'low',
    suggestion: `Only ${uniqueCategories} task categories seen — the classifier may be too coarse. Consider adding finer-grained categories for better UX feedback.`,
  });
}

// Always add forward-looking suggestions
insights.suggestions.push({
  area: 'landing',
  priority: 'info',
  suggestion: (() => {
    // Compute savings via pricing.js (SSOT) — no more hardcoded constants
    try {
      const pricing = require('./pricing');
      let actual = 0, naive = 0;
      Object.entries(tiers).forEach(([t, n]) => {
        actual += n * pricing.estimateTurnCost(t, 200);
        naive += n * pricing.naiveOpusCost(200);
      });
      const pct = naive > 0 ? Math.round((1 - actual / naive) * 100) : 0;
      return `Update landing page metrics: ${total} prompts classified, ${insights.tier_health.free_tier_pct}% free tier, ~${pct}% savings.`;
    } catch {
      return `Update landing page metrics: ${total} prompts classified, ${insights.tier_health.free_tier_pct}% free tier.`;
    }
  })(),
});

// ── Output ──────────────────────────────────────────────────────

if (jsonMode) {
  console.log(JSON.stringify(insights, null, 2));
} else {
  console.log('frugal — UX insights\n');
  console.log(`Period: ${insights.period.first.slice(0, 10)} → ${insights.period.last.slice(0, 10)}`);
  console.log(`Prompts: ${insights.total_prompts}`);
  console.log('');
  console.log('Friction signals:');
  console.log(`  User overrides:     ${insights.friction_signals.user_overrides.count} (${insights.friction_signals.user_overrides.pct}%)`);
  console.log(`  Low confidence:     ${insights.friction_signals.low_confidence.count} (${insights.friction_signals.low_confidence.pct}%)`);
  console.log(`  Quality intent:     ${insights.friction_signals.quality_intent.count} (${insights.friction_signals.quality_intent.pct}%)`);
  console.log(`  Arbiter activated:  ${insights.friction_signals.arbiter_activations.count} (${insights.friction_signals.arbiter_activations.pct}%)`);
  console.log('');
  console.log('Tier health:');
  console.log(`  Free tier: ${insights.tier_health.free_tier_pct}%  |  T3: ${insights.tier_health.t3_pct}%`);
  console.log('');
  if (insights.suggestions.length) {
    console.log('Suggestions:');
    insights.suggestions.forEach(s => {
      const icon = s.priority === 'high' ? '!' : s.priority === 'medium' ? '~' : '.';
      console.log(`  [${icon}] ${s.area}: ${s.suggestion}`);
    });
  }
}

// Append to history if requested
if (appendMode) {
  let history = [];
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    }
  } catch { /* fresh start */ }
  history.push(insights);
  // Keep last 90 entries (3 months of daily runs)
  if (history.length > 90) history = history.slice(-90);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  if (!jsonMode) console.log('\n✓ Appended to ' + HISTORY_PATH);
}
