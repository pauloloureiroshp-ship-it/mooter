#!/usr/bin/env node
// budget-wizard.js — interactive CLI to set per-subscription budgets.
//
// Reads subscription-profile.json to discover which LLM providers the
// user has declared. For each, prompts for monthly budget (USD) and
// billing cycle anchor day. Writes budget-config.json which overrides
// the defaults in usage-estimator.js.
//
// Usage:
//   node tools/router/budget-wizard.js
//   node tools/router/budget-wizard.js --show    → print current config
//   node tools/router/budget-wizard.js --reset   → delete config

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const ROUTER_ROOT = path.join(os.homedir(), '.claude', 'tools', 'router');
const PROFILE_FILE = path.join(ROUTER_ROOT, 'subscription-profile.json');
const CONFIG_FILE = path.join(ROUTER_ROOT, 'budget-config.json');

// ANSI colors (small palette — keep consistent with statusline)
const RESET   = '\x1b[0m';
const DIM     = '\x1b[2m';
const BOLD    = '\x1b[1m';
const BRAND   = '\x1b[38;2;194;95;101m';
const GREEN   = '\x1b[38;2;50;220;120m';
const WARN    = '\x1b[38;2;220;220;170m';
const DANGER  = '\x1b[38;2;227;70;70m';

// Sensible default budgets per plan — mirrors usage-estimator.js so the
// wizard starts with realistic suggestions.
const PLAN_DEFAULTS = {
  anthropic: { max: 200, pro: 20, team: 25, free: 0 },
  openai:    { plus: 20, pro: 200, team: 25, free: 0 },
  google:    { advanced: 19.99, pro: 19.99, free: 0 },
  xai:       { premium: 30, free: 0 },
  mistral:   { pro: 20, free: 0 },
};

const PROVIDER_LABEL = {
  anthropic: 'Anthropic',
  openai:    'OpenAI',
  google:    'Google',
  xai:       'xAI',
  mistral:   'Mistral',
};

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

function prompt(rl, q, def) {
  return new Promise((resolve) => {
    const suffix = def !== undefined ? ` ${DIM}[${def}]${RESET}` : '';
    rl.question(`${q}${suffix}: `, (ans) => {
      const s = String(ans || '').trim();
      resolve(s.length === 0 ? def : s);
    });
  });
}

function showCurrent() {
  const cfg = loadJson(CONFIG_FILE);
  if (!cfg) {
    console.log(`\n  ${DIM}(no budget-config.json — using defaults from usage-estimator.js)${RESET}\n`);
    console.log(`  run without flags to create one.\n`);
    return;
  }
  console.log(`\n  ${BOLD}Current budget config${RESET}  ${DIM}${CONFIG_FILE}${RESET}\n`);
  if (!cfg.subscriptions || Object.keys(cfg.subscriptions).length === 0) {
    console.log(`  ${DIM}(empty)${RESET}\n`);
    return;
  }
  for (const [provider, sub] of Object.entries(cfg.subscriptions)) {
    const label = PROVIDER_LABEL[provider] || provider;
    console.log(`  ${BOLD}${label}${RESET}`);
    console.log(`    monthly budget: ${GREEN}$${sub.monthly_usd}${RESET}`);
    console.log(`    cycle day:      ${sub.cycle_day || 1}`);
  }
  console.log('');
}

function resetConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
    console.log(`\n  ${WARN}✓ removed${RESET} ${DIM}${CONFIG_FILE}${RESET}`);
    console.log(`  defaults from usage-estimator.js will now apply.\n`);
  } else {
    console.log(`\n  ${DIM}no config file to reset.${RESET}\n`);
  }
}

async function run() {
  console.log(`\n${BRAND}${BOLD}🐮 mooter budget wizard${RESET}\n`);
  console.log(`  This sets per-subscription monthly budgets so the router can`);
  console.log(`  recommend beast/zen mode and flag when you're over/under pace.\n`);

  // Load providers from subscription-profile.json
  const profile = loadJson(PROFILE_FILE);
  if (!profile || !profile.profiles) {
    console.log(`  ${DANGER}⚠ subscription-profile.json not found or malformed.${RESET}`);
    console.log(`  Run \`node setup-profile.js\` first to declare your providers.\n`);
    process.exit(1);
  }
  const providers = Object.entries(profile.profiles); // [ [provider, plan], ... ]
  console.log(`  Detected ${BOLD}${providers.length}${RESET} subscription(s): ${providers.map(p => p[0]).join(', ')}\n`);

  // Load any existing config to merge with
  const existing = loadJson(CONFIG_FILE) || { subscriptions: {} };
  const nextConfig = { subscriptions: {} };

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  for (const [provider, plan] of providers) {
    const label = PROVIDER_LABEL[provider] || provider;
    const defaultBudget = (PLAN_DEFAULTS[provider] || {})[String(plan).toLowerCase()] || 0;
    const cur = (existing.subscriptions && existing.subscriptions[provider]) || {};
    const existingBudget = cur.monthly_usd;
    const existingCycleDay = cur.cycle_day;

    console.log(`${BRAND}━━ ${label} (${plan}) ━━${RESET}`);
    const suggestedBudget = existingBudget != null ? existingBudget : defaultBudget;
    const budgetRaw = await prompt(rl, `  monthly budget (USD)`, suggestedBudget);
    const budget = Number(budgetRaw);
    if (!Number.isFinite(budget) || budget < 0) {
      console.log(`  ${DANGER}invalid number — using ${suggestedBudget}${RESET}`);
    }
    const suggestedDay = existingCycleDay || 1;
    const dayRaw = await prompt(rl, `  billing cycle day (1-28)`, suggestedDay);
    const cycleDay = Math.max(1, Math.min(28, parseInt(dayRaw) || suggestedDay));

    nextConfig.subscriptions[provider] = {
      monthly_usd: Number.isFinite(budget) && budget >= 0 ? budget : suggestedBudget,
      cycle_day: cycleDay,
    };
    console.log('');
  }
  rl.close();

  // Preserve metadata
  nextConfig.updated_at = new Date().toISOString();
  nextConfig._note = 'Generated by budget-wizard. Re-run to change. Delete to reset to defaults.';

  saveJson(CONFIG_FILE, nextConfig);

  console.log(`${GREEN}${BOLD}✓ saved${RESET} ${DIM}${CONFIG_FILE}${RESET}\n`);
  showCurrent();
  console.log(`  ${DIM}Next: run \`node usage-estimator.js\` to see your budget tracking live.${RESET}\n`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--show')) { showCurrent(); process.exit(0); }
  if (args.includes('--reset')) { resetConfig(); process.exit(0); }
  run().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { showCurrent, resetConfig };
