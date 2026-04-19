#!/usr/bin/env node
// usage-estimator.js — per-subscription budget consumption tracker.
//
// Parses decisions.log to compute how much each LLM subscription has
// been used in the current billing cycle. Output feeds the statusline
// "Max 43%↑" pills and the beast/zen recommendation engine.
//
// Data source: decisions.log (router's authoritative log of every
// classified turn). Each entry has tier + recommended_backend which
// maps to a provider. Cost estimated via pricing.js.
//
// NOT tracking: direct Claude Code use OUTSIDE the router (e.g. user
// manually bypasses mooter). We only see what mooter saw.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Sensible defaults — the user pays roughly these amounts/month.
// All USD. Override via ~/.claude/tools/router/budget-config.json:
//   { "subscriptions": { "anthropic": { "monthly_usd": 200, "cycle_day": 10 } } }
const BUDGET_DEFAULTS = {
  anthropic: {
    max:  { monthly_usd: 200 },
    pro:  { monthly_usd: 20 },
    team: { monthly_usd: 25 },
    free: { monthly_usd: 0 },
  },
  openai: {
    plus: { monthly_usd: 20 },
    pro:  { monthly_usd: 200 },
    team: { monthly_usd: 25 },
    free: { monthly_usd: 0 },
  },
  google: {
    advanced: { monthly_usd: 19.99 },
    pro:      { monthly_usd: 19.99 },
    free:     { monthly_usd: 0 },
  },
  xai: {
    premium: { monthly_usd: 30 },
    free:    { monthly_usd: 0 },
  },
  mistral: {
    pro:  { monthly_usd: 20 },
    free: { monthly_usd: 0 },
  },
};

const DEFAULT_CYCLE_DAY = 1;

function loadJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function getRouterRoot() {
  return path.join(os.homedir(), '.claude', 'tools', 'router');
}

function loadSubscriptionProfile() {
  return loadJsonSafe(path.join(getRouterRoot(), 'subscription-profile.json'));
}

function loadBudgetConfig() {
  return loadJsonSafe(path.join(getRouterRoot(), 'budget-config.json'));
}

// Current billing cycle: if today >= cycle_day, cycle runs from this
// month's cycle_day to next month's cycle_day. Otherwise the cycle
// started last month.
function getCurrentCycle(now, cycleDay) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  let start, end;
  if (d >= cycleDay) {
    start = new Date(y, m, cycleDay, 0, 0, 0, 0);
    end   = new Date(y, m + 1, cycleDay, 0, 0, 0, 0);
  } else {
    start = new Date(y, m - 1, cycleDay, 0, 0, 0, 0);
    end   = new Date(y, m, cycleDay, 0, 0, 0, 0);
  }
  const DAY_MS = 24 * 3600 * 1000;
  const lengthDays = Math.max(1, Math.round((end - start) / DAY_MS));
  const elapsedMs = Math.max(0, now - start);
  const elapsedDays = elapsedMs / DAY_MS;
  const progressPct = Math.min(100, (elapsedDays / lengthDays) * 100);
  return {
    start_ms: start.getTime(),
    end_ms:   end.getTime(),
    length_days:  lengthDays,
    elapsed_days: elapsedDays,
    progress_pct: progressPct,
  };
}

// Infer which subscription's quota a classified turn consumed.
// T0 → local (free, no subscription burn). Others → recommended_backend
// or fall through to 'anthropic' as the default Claude-Code context.
function inferProvider(recommendedBackend, tier) {
  const b = String(recommendedBackend || '').toLowerCase();
  if (b.includes('ollama') || b.includes('local')) return 'local';
  if (b.includes('claude') || b.includes('anthropic')) return 'anthropic';
  if (b.includes('openai') || b.includes('gpt'))       return 'openai';
  if (b.includes('gemini') || b.includes('google'))    return 'google';
  if (b.includes('grok')   || b.includes('xai'))       return 'xai';
  if (b.includes('mistral'))                            return 'mistral';
  if (tier === 'T0') return 'local';
  return 'anthropic'; // default Claude-Code context
}

function budgetFor(provider, planTier, customConfig) {
  if (customConfig && customConfig.subscriptions && customConfig.subscriptions[provider]) {
    return customConfig.subscriptions[provider];
  }
  const map = BUDGET_DEFAULTS[provider] || {};
  const entry = map[String(planTier || '').toLowerCase()] || {};
  return {
    monthly_usd: entry.monthly_usd != null ? entry.monthly_usd : 0,
    cycle_day: DEFAULT_CYCLE_DAY,
  };
}

// Main entry — returns { anthropic: {...}, openai: {...}, ... } or null.
function computeSubscriptionUsage(nowOverride) {
  const now = nowOverride || new Date();
  const profile = loadSubscriptionProfile();
  const custom = loadBudgetConfig();

  // Providers the user has subscriptions for
  const profiles = (profile && profile.profiles) || { anthropic: 'max' };

  let pricing;
  try { pricing = require('./pricing'); }
  catch {
    try { pricing = require(path.join(getRouterRoot(), 'pricing.js')); }
    catch { return null; }
  }

  const usage = {};
  for (const [provider, planTier] of Object.entries(profiles)) {
    const cfg = budgetFor(provider, planTier, custom);
    const cycle = getCurrentCycle(now, cfg.cycle_day || DEFAULT_CYCLE_DAY);
    usage[provider] = {
      plan:         String(planTier).toLowerCase(),
      budget_usd:   cfg.monthly_usd,
      cost_usd:     0,
      call_count:   0,
      cycle,
    };
  }

  // Parse decisions.log tail (4MB — plenty for 1 month of heavy use)
  const logPath = path.join(getRouterRoot(), 'decisions.log');
  if (!fs.existsSync(logPath)) {
    return finalize(usage);
  }

  try {
    const stat = fs.statSync(logPath);
    const MAX = 4 * 1024 * 1024;
    const start = Math.max(0, stat.size - MAX);
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n');
    for (const line of lines) {
      if (!line) continue;
      let d;
      try { d = JSON.parse(line); } catch { continue; }
      if (d.event !== 'classified') continue;
      if (d.source === 'mooter-tester') continue;
      const ts = d.ts_ms || (d.ts ? new Date(d.ts).getTime() : 0);
      if (!ts) continue;
      const provider = inferProvider(d.recommended_backend, d.tier);
      if (!usage[provider]) continue; // local has no budget entry
      if (ts < usage[provider].cycle.start_ms) continue;
      if (ts > usage[provider].cycle.end_ms)   continue;
      const promptLen = d.prompt_len || d.prompt_length || 200;
      usage[provider].cost_usd += pricing.estimateTurnCost(d.tier, promptLen);
      usage[provider].call_count++;
    }
  } catch { /* non-fatal */ }

  return finalize(usage);
}

function finalize(usage) {
  for (const p in usage) {
    const u = usage[p];
    u.used_pct = u.budget_usd > 0 ? (u.cost_usd / u.budget_usd) * 100 : 0;
    // Projection: if we keep current pace for the rest of the cycle,
    // where will we land? > 100% means on pace to exceed budget.
    u.projected_pct = u.cycle.progress_pct > 0
      ? u.used_pct / (u.cycle.progress_pct / 100)
      : 0;
    // Ratio relative to cycle: >1 = spending faster than the cycle progresses
    u.pace_ratio = u.cycle.progress_pct > 0
      ? u.used_pct / u.cycle.progress_pct
      : 0;
  }
  return usage;
}

// Recommendation: given aggregated usage, should the user flip to
// beast (burn unused budget before reset) or zen (conserve)?
//
// Heuristic:
//   projected > 130%           → zen   (on pace to blow budget)
//   projected <  70% & day>60% → beast (under-using, cycle ending)
//   else                        → auto
function getRecommendation(usage) {
  if (!usage) return null;
  const entries = Object.values(usage).filter(u => u.budget_usd > 0);
  if (!entries.length) return null;
  // Average weighted by budget share
  const totalBudget = entries.reduce((s, u) => s + u.budget_usd, 0);
  if (totalBudget === 0) return null;
  const weightedProj = entries.reduce(
    (s, u) => s + u.projected_pct * (u.budget_usd / totalBudget), 0);
  const avgProgress = entries.reduce(
    (s, u) => s + u.cycle.progress_pct, 0) / entries.length;

  if (weightedProj > 130) {
    return { mode: 'zen', reason: `projection ${Math.round(weightedProj)}% — on pace to exceed budget` };
  }
  if (weightedProj < 70 && avgProgress > 60) {
    return { mode: 'beast', reason: `projection ${Math.round(weightedProj)}% — under-using plan at ${Math.round(avgProgress)}% cycle` };
  }
  return { mode: 'auto', reason: `projection ${Math.round(weightedProj)}% — on pace` };
}

// CLI — `node usage-estimator.js` prints a human-readable report.
if (require.main === module) {
  const usage = computeSubscriptionUsage();
  if (!usage) {
    console.log('no usage data (decisions.log missing or pricing unavailable)');
    process.exit(0);
  }
  console.log('mooter subscription usage — current billing cycle\n');
  for (const [provider, u] of Object.entries(usage)) {
    const pct = u.used_pct.toFixed(1);
    const proj = u.projected_pct.toFixed(0);
    const bar = '█'.repeat(Math.min(20, Math.round(u.used_pct / 5))) + '░'.repeat(Math.max(0, 20 - Math.round(u.used_pct / 5)));
    console.log(`  ${provider.padEnd(10)} ${u.plan.padEnd(6)} ${bar} ${pct}%  (projected ${proj}%)`);
    console.log(`  ${' '.repeat(10)} budget $${u.budget_usd}  used $${u.cost_usd.toFixed(2)}  calls ${u.call_count}`);
    console.log(`  ${' '.repeat(10)} cycle day ${u.cycle.elapsed_days.toFixed(1)}/${u.cycle.length_days} (${u.cycle.progress_pct.toFixed(0)}%)\n`);
  }
  const rec = getRecommendation(usage);
  if (rec) {
    console.log(`recommendation: ${rec.mode.toUpperCase()} — ${rec.reason}`);
  }
}

module.exports = { computeSubscriptionUsage, getRecommendation, getCurrentCycle, inferProvider };
