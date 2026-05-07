#!/usr/bin/env node
/**
 * user-profile.js — consolidator for ~/.claude/tools/router/user-profile.json.
 *
 * Produces a single profile object per METHODOLOGY.md §4 by merging:
 *   - hw-capability.json         (GPU / VRAM, probed at boot)
 *   - subscription-profile.json  (Anthropic Pro, Copilot, etc.)
 *   - decisions.log              (observed usage pattern, last 30d)
 *   - router-tuning.json         (learned per-category preferences)
 *   - Whatever the user set via CLI flags (budget, preferences)
 *
 * The profile is load-bearing for the router: budget caps a tier, subscriptions
 * shift effective cost, quality_threshold gates downgrades, learned patterns
 * bias the classifier. Anti-one-size-fits-all is implemented here.
 *
 * Cadences (per METHODOLOGY §4.3):
 *   hardware        — on-change (gpu-probe.js)
 *   subscriptions   — manual CLI
 *   budget          — manual CLI
 *   preferences     — manual CLI
 *   usage_pattern   — weekly (weekly-evolution.js)
 *   learned         — weekly (backtest.js delta)
 *
 * Usage:
 *   node user-profile.js                       # print current profile
 *   node user-profile.js --show                # same
 *   node user-profile.js --rebuild             # rebuild from sources (no manual fields touched)
 *   node user-profile.js --set-budget 50       # set monthly USD cap
 *   node user-profile.js --set-quality 0.95    # set quality threshold
 *   node user-profile.js --set-latency 30      # set max latency tolerance (s)
 *   node user-profile.js --json                # machine-readable to stdout
 *
 * Never writes to ~/.claude/* directly from a subcommand unless explicitly
 * invoked. Reads are cheap and idempotent.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const ROUTER_DIR = path.join(HOME, '.claude', 'tools', 'router');
const PROFILE_PATH = path.join(ROUTER_DIR, 'user-profile.json');
const HW_PATH = path.join(ROUTER_DIR, 'hw-capability.json');
const SUB_PATH = path.join(ROUTER_DIR, 'subscription-profile.json');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const TUNING_PATH = path.join(ROUTER_DIR, 'router-tuning.json');

const PROFILE_VERSION = 1;

// ────────────────────────────────────────────────────────────────────────
// Defaults — applied only when creating a profile from scratch.
// ────────────────────────────────────────────────────────────────────────
function defaultProfile() {
  return {
    version: PROFILE_VERSION,
    updated_at: new Date().toISOString(),
    hardware: {
      source: 'hw-capability.json',
      gpu_vendor: 'unknown',
      gpu_name: 'unknown',
      vram_mb: 0,
      hw_tier: 'unknown',
      t0_capable: false,
      t0_max_model_size: null,
    },
    subscriptions: {
      source: 'subscription-profile.json',
      anthropic_pro: false,
      copilot: false,
      gemini_advanced: false,
      openai_plus: false,
      other: [],
    },
    // NOTE: budget.monthly_budget_usd matches the field name read by
    // budget-engine.js:183 (`profile.monthly_budget_usd`). Do not rename
    // without coordinating with budget-engine.js. The runtime chain is:
    //   user-profile.json  →  budget-engine.js  →  budget-config.json
    //                         →  inject_context.js (applyBudgetCap)
    budget: {
      monthly_budget_usd: null,
      monthly_spent_usd: 0.0,
      reset_day: 1,
      alert_at_pct: [50, 80, 95],
      hard_cap_behavior: 'downgrade_one_tier',
    },
    preferences: {
      max_latency_tolerance_s: 30,
      quality_threshold: 0.95,
      prefer_local_t0: true,
      allow_shadow_mode: true,
      allow_hub_aggregation: false,
    },
    usage_pattern: {
      dominant_languages: [],
      dominant_categories: {},
      tier_distribution_last_30d: {},
      avg_session_length_prompts: 0,
      peak_hours_utc: [],
    },
    learned: {
      preferred_model_per_category: {},
      rejection_patterns: [],
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Helpers — lightweight readers for source files. All optional.
// ────────────────────────────────────────────────────────────────────────
function safeReadJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

function extractHardware() {
  const hw = safeReadJson(HW_PATH);
  if (!hw) return null;
  const maxModel = Array.isArray(hw.t0_models_available)
    ? hw.t0_models_available
        .filter((m) => m && m.can_run && m.model)
        .map((m) => m.model)
        .pop() || null
    : null;
  return {
    source: 'hw-capability.json',
    gpu_vendor: hw.vendor || 'unknown',
    gpu_name: hw.name || 'unknown',
    vram_mb: hw.vram_mb || 0,
    hw_tier: hw.hw_tier || 'unknown',
    t0_capable: Array.isArray(hw.t0_models_available) && hw.t0_models_available.some((m) => m.can_run),
    t0_max_model_size: maxModel,
  };
}

function extractSubscriptions() {
  const sub = safeReadJson(SUB_PATH);
  if (!sub) return null;
  const p = sub.profiles || {};
  const hints = sub.routing_hints || {};
  // ChatGPT Plus / Pro is distinct from an OpenAI API key — track both.
  // Schema accepts either the legacy `p.openai === 'plus'` or the new boolean
  // `p.openai_plus` written by `mooter init`.
  const openaiPlus = p.openai_plus === true || p.openai === 'plus';
  return {
    source: 'subscription-profile.json',
    anthropic_pro: p.anthropic === 'pro' || p.anthropic === 'max' || hints.haiku_available === true,
    claude_code: p.claude_code || (p.anthropic === 'max' ? 'max' : 'none'),
    copilot: p.github === 'copilot' || p.copilot === true || false,
    cursor_pro: p.cursor === 'pro' || false,
    gemini_advanced: p.google === 'advanced' || p.gemini === 'advanced' || false,
    openai_plus: openaiPlus,
    other: [],
  };
}

function extractUsagePattern() {
  if (!fs.existsSync(LOG_PATH)) return null;
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  const horizonMs = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const langCount = {};
  const catCount = {};
  const tierCount = { T0: 0, T1: 0, T2: 0, T3: 0 };
  const hourCount = {};
  const sessions = new Map(); // session_id → count
  let totalClassified = 0;

  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.event !== 'classified') continue;
      if (typeof e.ts_ms === 'number' && now - e.ts_ms > horizonMs) continue;
      totalClassified++;
      if (e.lang_detected && e.lang_detected !== 'other') langCount[e.lang_detected] = (langCount[e.lang_detected] || 0) + 1;
      if (e.task_category) catCount[e.task_category] = (catCount[e.task_category] || 0) + 1;
      if (e.tier && tierCount[e.tier] !== undefined) tierCount[e.tier]++;
      if (e.ts) {
        const h = new Date(e.ts).getUTCHours();
        hourCount[h] = (hourCount[h] || 0) + 1;
      }
      if (e.session_id) sessions.set(e.session_id, (sessions.get(e.session_id) || 0) + 1);
    } catch (_) { /* skip */ }
  }

  if (totalClassified === 0) return null;

  const sortByValDesc = (obj) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]);

  const topLangs = sortByValDesc(langCount).slice(0, 5).map(([k]) => k);
  const topCats = {};
  sortByValDesc(catCount).slice(0, 8).forEach(([k, v]) => {
    topCats[k] = +(v / totalClassified).toFixed(3);
  });
  const tierDist = {};
  Object.entries(tierCount).forEach(([k, v]) => {
    tierDist[k] = totalClassified > 0 ? +(v / totalClassified).toFixed(3) : 0;
  });
  const peakHours = sortByValDesc(hourCount)
    .slice(0, 5)
    .map(([h]) => parseInt(h, 10))
    .sort((a, b) => a - b);
  const sessionCounts = [...sessions.values()];
  const avgSession = sessionCounts.length > 0
    ? Math.round(sessionCounts.reduce((a, b) => a + b, 0) / sessionCounts.length)
    : 0;

  return {
    dominant_languages: topLangs,
    dominant_categories: topCats,
    tier_distribution_last_30d: tierDist,
    avg_session_length_prompts: avgSession,
    peak_hours_utc: peakHours,
  };
}

function extractLearned() {
  const tuning = safeReadJson(TUNING_PATH);
  if (!tuning) return null;
  return {
    preferred_model_per_category: tuning.preferred_model_per_category || {},
    rejection_patterns: tuning.rejection_patterns || [],
  };
}

// ────────────────────────────────────────────────────────────────────────
// Rebuild — merges sources into the profile, preserving manual fields.
// ────────────────────────────────────────────────────────────────────────
function rebuildProfile(existing) {
  const profile = existing && existing.version ? existing : defaultProfile();
  profile.version = PROFILE_VERSION;
  profile.updated_at = new Date().toISOString();

  const hw = extractHardware();
  if (hw) profile.hardware = hw;

  const subs = extractSubscriptions();
  if (subs) profile.subscriptions = subs;

  const pattern = extractUsagePattern();
  if (pattern) profile.usage_pattern = pattern;

  const learned = extractLearned();
  if (learned) profile.learned = learned;

  // Budget, preferences — manual fields, preserved as-is.
  return profile;
}

// ────────────────────────────────────────────────────────────────────────
// I/O
// ────────────────────────────────────────────────────────────────────────
function loadProfile() {
  return safeReadJson(PROFILE_PATH) || defaultProfile();
}

function saveProfile(profile) {
  if (!fs.existsSync(ROUTER_DIR)) {
    fs.mkdirSync(ROUTER_DIR, { recursive: true });
  }
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2) + '\n');
}

// ────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────
function prettyPrint(profile) {
  const lines = [];
  const money = (n) => (n == null ? '(not set)' : `$${n.toFixed(2)}`);
  const bool = (b) => (b ? 'yes' : 'no');

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════════╗');
  lines.push('║                    USER PROFILE                                  ║');
  lines.push('╚══════════════════════════════════════════════════════════════════╝');
  lines.push(`  Profile version:  ${profile.version}`);
  lines.push(`  Last updated:     ${profile.updated_at}`);
  lines.push('');
  lines.push('  ── Hardware ──────────────────────────────────────────────────');
  lines.push(`    GPU:            ${profile.hardware.gpu_name} (${profile.hardware.gpu_vendor})`);
  lines.push(`    VRAM:           ${profile.hardware.vram_mb} MB  (${profile.hardware.hw_tier})`);
  lines.push(`    T0 capable:     ${bool(profile.hardware.t0_capable)}  max=${profile.hardware.t0_max_model_size || 'n/a'}`);
  lines.push('');
  lines.push('  ── Subscriptions ─────────────────────────────────────────────');
  lines.push(`    Anthropic Pro:  ${bool(profile.subscriptions.anthropic_pro)}`);
  lines.push(`    Claude Code:    ${profile.subscriptions.claude_code || 'none'}`);
  lines.push(`    Copilot:        ${bool(profile.subscriptions.copilot)}`);
  lines.push(`    Cursor Pro:     ${bool(profile.subscriptions.cursor_pro)}`);
  lines.push(`    Gemini Adv:     ${bool(profile.subscriptions.gemini_advanced)}`);
  lines.push(`    OpenAI Plus:    ${bool(profile.subscriptions.openai_plus)}`);
  lines.push('');
  lines.push('  ── Budget ────────────────────────────────────────────────────');
  lines.push(`    Monthly cap:    ${money(profile.budget.monthly_budget_usd)}`);
  lines.push(`    Spent MTD:      ${money(profile.budget.monthly_spent_usd)}`);
  lines.push(`    Reset day:      ${profile.budget.reset_day}`);
  lines.push(`    Hard-cap:       ${profile.budget.hard_cap_behavior}`);
  lines.push('');
  lines.push('  ── Preferences ───────────────────────────────────────────────');
  lines.push(`    Max latency:    ${profile.preferences.max_latency_tolerance_s}s`);
  lines.push(`    Quality thresh: ${profile.preferences.quality_threshold}`);
  lines.push(`    Prefer T0:      ${bool(profile.preferences.prefer_local_t0)}`);
  lines.push(`    Shadow mode:    ${bool(profile.preferences.allow_shadow_mode)}`);
  lines.push(`    Hub aggregate:  ${bool(profile.preferences.allow_hub_aggregation)}`);
  lines.push('');
  lines.push('  ── Usage pattern (last 30d) ──────────────────────────────────');
  const langs = profile.usage_pattern.dominant_languages;
  lines.push(`    Top languages:  ${langs.length ? langs.join(', ') : '(no data)'}`);
  const cats = Object.entries(profile.usage_pattern.dominant_categories);
  if (cats.length > 0) {
    lines.push(`    Top categories:`);
    cats.slice(0, 5).forEach(([k, v]) => lines.push(`      ${k.padEnd(28)} ${(v * 100).toFixed(1)}%`));
  } else {
    lines.push(`    Top categories: (no data)`);
  }
  const td = profile.usage_pattern.tier_distribution_last_30d;
  if (Object.keys(td).length > 0) {
    const parts = Object.entries(td).map(([k, v]) => `${k}:${(v * 100).toFixed(0)}%`);
    lines.push(`    Tier mix:       ${parts.join('  ')}`);
  }
  lines.push(`    Avg session:    ${profile.usage_pattern.avg_session_length_prompts} prompts`);
  lines.push(`    Peak hours UTC: ${(profile.usage_pattern.peak_hours_utc || []).join(', ') || '(no data)'}`);
  lines.push('');
  const prefCats = Object.entries(profile.learned.preferred_model_per_category);
  if (prefCats.length > 0) {
    lines.push('  ── Learned preferences ───────────────────────────────────────');
    prefCats.forEach(([k, v]) => lines.push(`    ${k.padEnd(28)} → ${v}`));
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const has = (k) => args.indexOf(k) >= 0;
  const valAfter = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : null;
  };

  let profile = loadProfile();

  // --set-* mutations
  let mutated = false;
  const setBudget = valAfter('--set-budget');
  if (setBudget != null) {
    profile.budget.monthly_budget_usd = +setBudget;
    mutated = true;
  }
  const setQuality = valAfter('--set-quality');
  if (setQuality != null) {
    profile.preferences.quality_threshold = +setQuality;
    mutated = true;
  }
  const setLatency = valAfter('--set-latency');
  if (setLatency != null) {
    profile.preferences.max_latency_tolerance_s = +setLatency;
    mutated = true;
  }
  const setSubAnthropic = valAfter('--set-sub-anthropic');
  if (setSubAnthropic != null) {
    profile.subscriptions.anthropic_pro = setSubAnthropic === 'true' || setSubAnthropic === '1';
    mutated = true;
  }

  // --rebuild (or implicit rebuild when file didn't exist)
  if (has('--rebuild') || !fs.existsSync(PROFILE_PATH)) {
    profile = rebuildProfile(profile);
    mutated = true;
  }

  if (mutated) {
    profile.updated_at = new Date().toISOString();
    saveProfile(profile);
  }

  if (has('--json')) {
    process.stdout.write(JSON.stringify(profile, null, 2) + '\n');
    return;
  }

  // Default: print human-readable
  process.stdout.write(prettyPrint(profile) + '\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  PROFILE_VERSION,
  PROFILE_PATH,
  defaultProfile,
  loadProfile,
  saveProfile,
  rebuildProfile,
  extractHardware,
  extractSubscriptions,
  extractUsagePattern,
  extractLearned,
};
