#!/usr/bin/env node
/**
 * budget-engine.js
 *
 * Given: subscription-profile.json + hw-capability.json + decisions.log (last 30 days)
 * Calculates: optimal routing config for this specific user
 * Output: budget-config.json — read by inject_context.js for applyBudgetCap()
 *
 * Usage:
 *   node budget-engine.js              # calculate and save config
 *   node budget-engine.js --dry-run    # show config without saving
 *   node budget-engine.js --profile    # show human-readable profile summary
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const FRUGAL_DIR = path.join(os.homedir(), '.frugal');
const OUTPUT_PATH = path.join(FRUGAL_DIR, 'budget-config.json');

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_BUDGET_USD = 30;
const PROMPTS_PER_MONTH = 100;
const AVG_INPUT_KTOK = 4;   // ~4k input tokens per prompt
const AVG_OUTPUT_KTOK = 0.8; // ~800 output tokens per prompt
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Tier → model key in model-profile.json (dynamic based on installed Ollama models)
function buildTierModelMap(hwCapability) {
  const available = new Set(
    ((hwCapability && hwCapability.available_ollama_models) || [])
      .map(m => (m.name || m).toLowerCase())
  );

  const pick = (candidates, fallback) =>
    candidates.find(c => available.has(c.toLowerCase())) || fallback;

  const t0Local = pick(
    ['qwen3:30b', 'gemma3:12b', 'deepseek-r1:7b', 'qwen2.5:3b'],
    'qwen3:30b'
  );

  const t1Local = pick(
    ['deepseek-r1:7b', 'gemma3:12b', 'qwen3:30b'],
    t0Local
  );

  return {
    T0: t0Local,
    T0_ALT: 'qwen2.5:3b',           // Option-A pre-compute — always fast
    T1: 'claude-haiku-4-5',          // API first
    T1_LOCAL: t1Local,               // fallback when no ANTHROPIC_API_KEY
    T2: 'claude-sonnet-4-6',
    T3: 'claude-opus-4-6',
  };
}

// Static fallback for callers that don't pass hwCapability
const TIER_MODEL_MAP = buildTierModelMap({});

// ─── Loaders ──────────────────────────────────────────────────────────────────

function loadProfile() {
  const p = path.join(ROUTER_DIR, 'subscription-profile.json');
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    // No profile → minimal defaults
    return {
      monthly_budget_usd: DEFAULT_BUDGET_USD,
      subscriptions: [],
      notes: '',
    };
  }
}

function loadHwCapability() {
  const p = path.join(ROUTER_DIR, 'hw-capability.json');
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const hw = JSON.parse(raw);
    // Normalise field names: hw-capability.json uses `name` + `vram_mb`;
    // internal code uses `name_short` + `vramMB`.
    hw.name_short = hw.name_short || hw.name || 'unknown';
    hw.vramMB = hw.vramMB ?? hw.vram_mb ?? null;
    return hw;
  } catch {
    // No hw file → assume CPU-only
    return {
      vendor: 'cpu',
      name_short: 'CPU-only',
      vramMB: null,
      ollama_available: false,
    };
  }
}

function loadModelProfile() {
  // model-profile.json lives alongside budget-engine.js in the project router dir.
  // Also try ROUTER_DIR (~/.claude/tools/router/) as fallback for installed deployments.
  const candidates = [
    path.join(__dirname, 'model-profile.json'),
    path.join(ROUTER_DIR, 'model-profile.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      return JSON.parse(raw);
    } catch { /* try next */ }
  }
  return { models: {} };
}

// ─── decisions.log analysis ───────────────────────────────────────────────────

/**
 * Returns { T0, T1, T2, T3 } as fractions summing to 1.
 * Falls back to empirical defaults if no data.
 */
function analyzeDistribution(logPath) {
  const fallback = { T0: 0.83, T1: 0.06, T2: 0.09, T3: 0.02 };

  try {
    const raw = fs.readFileSync(logPath, 'utf8');
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    const counts = { T0: 0, T1: 0, T2: 0, T3: 0 };
    let total = 0;

    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry.event !== 'classified') continue;
      const ts = entry.ts ? new Date(entry.ts).getTime() : 0;
      if (ts < cutoff) continue;

      const tier = entry.tier || entry.result?.tier;
      if (!tier || !counts.hasOwnProperty(tier)) continue;
      counts[tier]++;
      total++;
    }

    if (total === 0) return fallback;

    return {
      T0: counts.T0 / total,
      T1: counts.T1 / total,
      T2: counts.T2 / total,
      T3: counts.T3 / total,
    };
  } catch {
    return fallback;
  }
}

// ─── Cost calculation ─────────────────────────────────────────────────────────

/**
 * Returns cost in USD for one prompt at given model,
 * factoring in whether local (GPU available) → free.
 */
function costPerPrompt(modelKey, modelProfile, hasGpu) {
  const m = modelProfile.models[modelKey];
  if (!m) return 0;
  if (m.provider === 'ollama') return hasGpu ? 0 : 0; // local is always free
  // API cost: input + output (convert per-mtok to per-ktok)
  const inputCost = (m.cost_input_per_mtok / 1000) * AVG_INPUT_KTOK;
  const outputCost = (m.cost_output_per_mtok / 1000) * AVG_OUTPUT_KTOK;
  return inputCost + outputCost;
}

// ─── Core engine ──────────────────────────────────────────────────────────────

function calculateOptimalConfig(profile, hwCapability, distribution, modelProfile) {
  const budget = profile.monthly_budget_usd ?? DEFAULT_BUDGET_USD;

  // GPU available if vendor is not 'cpu' and ollama_available (or vendor is nvidia/amd/apple)
  const hasGpu = hwCapability.vendor !== 'cpu' &&
    (hwCapability.ollama_available !== false);

  // Build dynamic tier map using hw info
  const dynamicMap = buildTierModelMap(hwCapability);

  // Effective cost per tier, per prompt
  const tierCosts = {};
  for (const [tier, modelKey] of Object.entries(dynamicMap)) {
    if (tier.includes('_')) continue; // skip T0_ALT, T1_LOCAL etc
    tierCosts[tier] = costPerPrompt(modelKey, modelProfile, hasGpu);
  }

  // Projected monthly cost = distribution × prompts/month × cost per prompt
  let projected = 0;
  for (const [tier, fraction] of Object.entries(distribution)) {
    projected += fraction * PROMPTS_PER_MONTH * (tierCosts[tier] || 0);
  }

  const headroom = budget - projected;
  const headroomPct = budget > 0 ? (headroom / budget) * 100 : 0;

  // Tier caps
  const autoZenThreshold = budget * 0.80;
  const t2Permissive = headroomPct > 40;
  const t3GatesOnly = budget < 20;

  // Statusline hint
  const usedUsd = projected.toFixed(2);
  const remainUsd = headroom.toFixed(2);
  const statuslineHint = `budget: $${usedUsd}/$${budget} used · $${remainUsd} remaining`;

  return {
    monthly_budget_usd: budget,
    projected_monthly_usd: projected.toFixed(2),
    headroom_usd: headroom.toFixed(2),
    headroom_pct: headroomPct.toFixed(0),
    tier_caps: {
      auto_zen_threshold: autoZenThreshold,
      t2_permissive: t2Permissive,
      t3_gates_only: t3GatesOnly,
    },
    statusline_hint: statuslineHint,
    distribution,
    has_gpu: hasGpu,
    gpu_name: hwCapability.name_short || 'unknown',
    tier_costs_per_prompt: Object.fromEntries(
      Object.entries(tierCosts).map(([k, v]) => [k, parseFloat(v.toFixed(5))])
    ),
    calculated_at: new Date().toISOString(),
  };
}

// ─── Recommendation ───────────────────────────────────────────────────────────

function generateRecommendation(profile, hw, headroomPct, distribution) {
  const budget = profile.monthly_budget_usd ?? DEFAULT_BUDGET_USD;
  const hasGpu = hw.vendor !== 'cpu';

  if (budget < 10) {
    return 'Orçamento muito baixo (<$10). Considera usar apenas modelos locais (T0) ou aumentar o budget.';
  }
  if (headroomPct < 10) {
    return 'Atenção: orçamento quase esgotado. Activa zen-mode e reduz chamadas T2/T3.';
  }
  if (!hasGpu && distribution.T0 > 0.5) {
    return 'Sem GPU detectada: T0 ainda funciona via CPU mas é mais lento. Considera um GPU para maximizar poupanças.';
  }
  if (hasGpu && headroomPct > 40) {
    return 'Tens GPU e orçamento disponível: routing actual é óptimo.';
  }
  if (headroomPct > 20) {
    return 'Routing equilibrado. Podes activar t2_permissive para investigações mais profundas.';
  }
  return 'Routing conservador activado. Aumenta o budget ou reduz chamadas T3 para mais margem.';
}

// ─── --profile display ────────────────────────────────────────────────────────

function renderProfile(profile, hw, config, modelProfile) {
  const budget = profile.monthly_budget_usd ?? DEFAULT_BUDGET_USD;
  const subscriptions = Array.isArray(profile.subscriptions) && profile.subscriptions.length
    ? profile.subscriptions.join(', ')
    : '(nenhuma configurada)';

  const gpuLine = hw.vendor !== 'cpu'
    ? `${hw.name_short}${hw.vramMB ? ` (${Math.round(hw.vramMB / 1024)}GB VRAM)` : ''}`
    : 'CPU-only (sem GPU)';

  // Build tier rows (use dynamic map based on installed models)
  const dynamicMapForRender = buildTierModelMap(hw);
  const tierRows = Object.entries(dynamicMapForRender).map(([tier, modelKey]) => {
    const fraction = config.distribution[tier] ?? 0;
    const pct = (fraction * 100).toFixed(0);
    const costPerPrompt = config.tier_costs_per_prompt[tier] ?? 0;
    const monthlyEst = (fraction * PROMPTS_PER_MONTH * costPerPrompt).toFixed(0);
    const m = modelProfile.models[modelKey];
    const modelLabel = m
      ? (m.provider === 'ollama' ? `${modelKey} local` : `${modelKey.replace('claude-', '').replace('-4-', ' ')} API`)
      : modelKey;
    const costLabel = costPerPrompt === 0 ? '$0' : `~$${monthlyEst}`;
    return `  ${tier} → ${modelLabel.padEnd(20)} ${String(pct + '%').padEnd(4)} (${costLabel})`;
  });

  // Box inner width = 41 chars (between │ and │)
  const W = 41;
  const pad = (s) => s.padEnd(W);

  // Wrap recommendation at word boundaries to fit W-4 chars (4 = "│ ✓ " prefix)
  const recWords = config.recommendation.split(' ');
  const recLines = [];
  let cur = '';
  for (const word of recWords) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > W - 4) { recLines.push(cur); cur = word; }
    else { cur = next; }
  }
  if (cur) recLines.push(cur);

  const recRows = recLines.map((l, i) =>
    `│ ${i === 0 ? '✓ ' : '  '}${l.padEnd(W - 4)}  │`
  );

  const lines = [
    '╭─ frugal budget engine ──────────────────╮',
    `│ Hardware: ${gpuLine.substring(0, W - 11).padEnd(W - 11)} │`,
    `│ Subscriptions: ${subscriptions.substring(0, W - 17).padEnd(W - 17)} │`,
    `│ Budget: $${String(budget).padEnd(W - 10)} │`,
    `│${pad('')}│`,
    `│ Optimal routing:${' '.repeat(W - 18)}│`,
    ...tierRows.map(r => `│${r.padEnd(W)}│`),
    `│${pad('')}│`,
    `│ Projected: ~$${config.projected_monthly_usd}/month`.padEnd(W + 1) + '│',
    `│ Headroom: $${config.headroom_usd} remaining (${config.headroom_pct}%)`.padEnd(W + 1) + '│',
    `│${pad('')}│`,
    ...recRows,
    '╰─────────────────────────────────────────╯',
  ];

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const profileMode = args.includes('--profile');

  const profile = loadProfile();
  const hw = loadHwCapability();
  const modelProfile = loadModelProfile();

  const decisionsLog = path.join(ROUTER_DIR, 'decisions.log');
  const distribution = analyzeDistribution(decisionsLog);

  const config = calculateOptimalConfig(profile, hw, distribution, modelProfile);

  const headroomPct = parseFloat(config.headroom_pct);
  config.recommendation = generateRecommendation(profile, hw, headroomPct, distribution);

  if (profileMode) {
    process.stderr.write(renderProfile(profile, hw, config, modelProfile) + '\n');
    return;
  }

  const outputJson = JSON.stringify(config, null, 2);

  if (dryRun) {
    process.stderr.write('[budget-engine] dry-run — not saving\n');
    process.stdout.write(outputJson + '\n');
    return;
  }

  // Ensure output dir exists
  try {
    fs.mkdirSync(FRUGAL_DIR, { recursive: true });
  } catch (e) {
    process.stderr.write(`[budget-engine] warn: could not create ${FRUGAL_DIR}: ${e.message}\n`);
  }

  fs.writeFileSync(OUTPUT_PATH, outputJson, 'utf8');
  process.stderr.write(`[budget-engine] saved → ${OUTPUT_PATH}\n`);
  process.stdout.write(outputJson + '\n');
}

main();
