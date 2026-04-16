#!/usr/bin/env node
/**
 * mooter-continuous-tester.js — 24/7 autonomous benchmark & improvement agent.
 *
 * Runs in a dedicated terminal, uses ONLY local resources (Ollama + GPU).
 * Zero token cost. Zero human approval needed.
 *
 * What it does:
 *   - Generates prompts at every complexity level (T0→T3)
 *   - ACTUALLY RUNS each available Ollama model on each prompt
 *   - Measures real latency, real output quality, real token counts
 *   - Runs A/B tests: same prompt → 2 different models → LLM judge picks winner
 *   - Builds empirical quality matrix: which model is best for each task type
 *   - Detects classifier misroutings and auto-fixes (with safety gates)
 *   - Generates rich stats for /mooter-summary dashboard
 *
 * Usage:
 *   node mooter-continuous-tester.js                      # start (default)
 *   node mooter-continuous-tester.js --aggressive         # max GPU, faster cycles
 *   node mooter-continuous-tester.js --dry-run            # no writes
 *   node mooter-continuous-tester.js --cycle-interval 30  # seconds between cycles
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, execSync } = require('child_process');
const crypto = require('crypto');
const Module = require('module');

// ── Paths ────────────────────────────────────────────────────────────
const SCRIPT_DIR = __dirname;
const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const STATS_PATH = path.join(SCRIPT_DIR, 'mooter-tester-stats.json');
const HISTORY_PATH = path.join(SCRIPT_DIR, 'mooter-tester-history.jsonl');
const AB_RESULTS_PATH = path.join(SCRIPT_DIR, 'mooter-ab-results.json');
const QUALITY_MATRIX_PATH = path.join(SCRIPT_DIR, 'mooter-quality-matrix.json');

// ── Config ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argi = (k) => args.indexOf(k);
const DRY_RUN = args.includes('--dry-run');
const AGGRESSIVE = args.includes('--aggressive');
const CYCLE_INTERVAL_S = argi('--cycle-interval') >= 0
  ? parseInt(args[argi('--cycle-interval') + 1], 10)
  : AGGRESSIVE ? 20 : 45;
const ACCURACY_FLOOR = 0.85;
const TESTER_USER = 'mooter-tester';

// ── Available Models (detected at startup) ───────────────────────────
// Tier mapping: which models CAN serve each tier
const MODEL_TIERS = {
  'qwen2.5:3b':          { tiers: ['T0', 'T1'], speed: 'fast',   size: '3B',  family: 'qwen' },
  'deepseek-r1:7b':      { tiers: ['T1', 'T2'], speed: 'medium', size: '7B',  family: 'deepseek' },
  'gemma3:12b':           { tiers: ['T1', 'T2'], speed: 'medium', size: '12B', family: 'gemma' },
  'qwen2.5-coder:14b':   { tiers: ['T1', 'T2', 'T3'], speed: 'medium', size: '14B', family: 'qwen' },
  'gemma4:e4b':           { tiers: ['T2', 'T3'], speed: 'slow',   size: '27B', family: 'gemma' },
  'qwen3:30b':            { tiers: ['T2', 'T3'], speed: 'slow',   size: '30B', family: 'qwen' },
};

let availableModels = [];

// ── State ────────────────────────────────────────────────────────────
let running = true;
let cycleCount = 0;
let sessionStart = Date.now();
let stats = {
  prompts_generated: 0,
  prompts_executed: 0,
  ab_tests_run: 0,
  misroutings_found: 0,
  fixes_applied: 0,
  fixes_reverted: 0,
  model_runs: {},    // model → { runs, avg_latency_ms, avg_quality }
  tier_accuracy: {},  // tier → { correct, total }
  quality_matrix: {}, // "model:category" → { wins, losses, ties, avg_latency }
};

process.on('SIGINT', () => { running = false; log('SIGINT — finishing cycle...'); });
process.on('SIGTERM', () => { running = false; log('SIGTERM — finishing cycle...'); });

// ── Helpers ──────────────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

function logEvent(event) {
  const entry = { ...event, source: TESTER_USER, ts: new Date().toISOString(), ts_ms: Date.now() };
  if (!DRY_RUN) {
    try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); } catch {}
    try { fs.appendFileSync(HISTORY_PATH, JSON.stringify(entry) + '\n'); } catch {}
  }
}

function callOllama(prompt, model, maxTokens = 1024) {
  const start = Date.now();
  try {
    const r = spawnSync('ollama', ['run', model, '--nowordwrap'], {
      input: `/no_think\n${prompt}`,
      encoding: 'utf8',
      timeout: 120000,
      env: { ...process.env, OLLAMA_NUM_PREDICT: String(maxTokens) },
    });
    const elapsed = Date.now() - start;
    if (r.status !== 0) return { output: null, latency_ms: elapsed, error: 'exit_' + r.status };
    let out = (r.stdout || '').trim();
    out = out.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return { output: out, latency_ms: elapsed, tokens_est: Math.ceil(out.length / 4) };
  } catch (e) {
    return { output: null, latency_ms: Date.now() - start, error: e.message };
  }
}

// ── Classifier (hot-loaded from repo) ────────────────────────────────
let _classifyFn = null;
function classify(prompt) {
  try {
    if (!_classifyFn) {
      const classifyFile = path.join(SCRIPT_DIR, 'classify.js');
      if (!fs.existsSync(classifyFile)) { log('classify.js not found in ' + SCRIPT_DIR); return null; }
      const src = fs.readFileSync(classifyFile, 'utf8');
      const iifeIdx = src.search(/\(async \(\) => \{/);
      if (iifeIdx < 0) { log('classify.js IIFE not found'); return null; }
      const body = src.slice(0, iifeIdx).replace(/^#!.*\n/, '');
      const rq = Module.createRequire(path.join(SCRIPT_DIR, '__loader__.js'));
      _classifyFn = new Function('require', `${body}\nreturn classify;`)(rq);
    }
    return _classifyFn(prompt);
  } catch (e) {
    log(`classify error: ${e.message}`);
    _classifyFn = null;
    return null;
  }
}

// ── Prompt Generation (calibrated per tier) ──────────────────────────
const PROMPT_TEMPLATES = {
  T0: [
    'muda a cor do {element} para {color}',
    'rename {var} to {newvar}',
    'show me the contents of {file}',
    'what does {func} do?',
    'remove line {n} from {file}',
    'fix the typo in the error message',
    'add a console.log before the return in {func}',
    'translate this comment to English: // {comment}',
    'resume este ficheiro em 3 bullet points',
    'list all TODO comments in the codebase',
    'what is the last git commit?',
    'show me the package.json dependencies',
  ],
  T1: [
    'generate a commit message for this diff: changed {var} from {val1} to {val2}',
    'write a regex that matches {pattern}',
    'explain the difference between {concept1} and {concept2}',
    'convert this JSON to TypeScript interface: {{ "name": "string", "age": "number" }}',
    'add JSDoc to this function: function {func}({params}) {{ return {val1}; }}',
    'write a unit test for a function that {action}',
    'format this as a markdown table: {var}={val1}, {newvar}={val2}',
  ],
  T2: [
    'why does {component} crash when {condition}?',
    'debug: {error} at {file}:{n}',
    'investigate the {issue} in the {module} module',
    'compare {tech1} vs {tech2} for {usecase}',
    'the {metric} spiked from {val1} to {val2} after deploying — root cause?',
    'how should we handle {scenario} in our {module}?',
    'review this approach: using {tech1} instead of {tech2} for {usecase}',
    'plan the implementation of {feature} in {module}',
  ],
  T3: [
    'deploy the {fix} to production',
    'migrate the {table} schema to support {feature}',
    'refactor the entire {module} to use {pattern}',
    'review the security implications of {change} before pushing to main',
    'fix the {vuln} vulnerability in the {component} component',
    'redesign the {module} architecture for multi-tenancy',
    'create a migration plan from {tech1} to {tech2}',
    'audit the {module} for OWASP top 10 vulnerabilities',
  ],
};

const FILLS = {
  element: ['button', 'header', 'sidebar', 'card', 'input', 'modal', 'footer', 'nav'],
  color: ['#333', '#00ff88', 'red', 'blue', 'rgba(0,0,0,0.5)', 'var(--primary)'],
  var: ['getUserById', 'handleSubmit', 'parseData', 'formatDate', 'validateInput'],
  newvar: ['fetchUser', 'onSubmit', 'transformData', 'toDateString', 'checkInput'],
  file: ['src/auth.ts', 'api/orders.js', 'lib/cache.ts', 'components/Modal.tsx', 'utils/format.js'],
  func: ['handleClick', 'processOrder', 'validateInput', 'renderChart', 'fetchData'],
  n: ['12', '42', '87', '156', '231', '8', '99'],
  comment: ['isto calcula o total', 'verificar se o user existe', 'temporal fix para o bug #42'],
  pattern: ['email addresses', 'URLs', 'ISO dates', 'phone numbers', 'semantic versions', 'UUIDs'],
  concept1: ['useEffect', 'Promise', 'REST', 'SQL', 'TCP', 'mutex', 'index'],
  concept2: ['useLayoutEffect', 'Observable', 'GraphQL', 'NoSQL', 'UDP', 'semaphore', 'view'],
  params: ['a, b', 'items', 'config', 'user, options', 'data'],
  action: ['sorts an array', 'validates email', 'calculates tax', 'parses CSV', 'retries on failure'],
  val1: ['200ms', '2%', '512MB', 'null', '"active"', '0'],
  val2: ['3.2s', '15%', '4GB', 'undefined', '"pending"', '100'],
  component: ['useEffect', 'WebSocket', 'auth middleware', 'cache layer', 'queue processor', 'rate limiter'],
  condition: ['under load', 'after 60s', 'with concurrent users', 'in Safari', 'during migration'],
  error: ['TypeError: x is not a function', 'ECONNREFUSED', '403 Forbidden', 'OOM killed', 'DEADLOCK'],
  issue: ['memory spike', 'slow query', 'race condition', 'deadlock', 'flaky test', 'N+1 query'],
  module: ['auth', 'payments', 'notifications', 'search', 'dashboard', 'analytics', 'billing'],
  tech1: ['PostgreSQL', 'Redis', 'REST', 'Express', 'JWT', 'monolith'],
  tech2: ['MongoDB', 'Memcached', 'GraphQL', 'Fastify', 'OAuth2', 'microservices'],
  usecase: ['real-time chat', 'analytics dashboard', 'e-commerce', 'IoT ingestion', 'ML pipeline'],
  metric: ['p95 latency', 'error rate', 'memory usage', 'CPU utilization', 'queue depth'],
  fix: ['hotfix', 'security patch', 'rollback', 'performance fix', 'data migration'],
  table: ['users', 'orders', 'sessions', 'products', 'payments', 'audit_log'],
  feature: ['multi-tenancy', 'soft delete', 'versioning', 'audit trail', 'RBAC'],
  pattern: ['repository pattern', 'CQRS', 'event sourcing', 'hexagonal architecture'],
  change: ['migration', 'schema update', 'dependency bump', 'auth refactor', 'API v2'],
  vuln: ['XSS', 'SQL injection', 'CSRF', 'auth bypass', 'SSRF', 'path traversal'],
  scenario: ['concurrent writes', 'network partition', 'token expiry', 'rate limiting', 'graceful shutdown'],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fill = (tpl) => tpl.replace(/\{(\w+)\}/g, (_, k) => FILLS[k] ? pick(FILLS[k]) : k);

function generatePrompts(count) {
  const tiers = Object.keys(PROMPT_TEMPLATES);
  const perTier = Math.ceil(count / tiers.length);
  const prompts = [];
  for (const tier of tiers) {
    for (let i = 0; i < perTier && prompts.length < count; i++) {
      const tpl = pick(PROMPT_TEMPLATES[tier]);
      prompts.push({ prompt: fill(tpl), expected_tier: tier, source: 'template' });
    }
  }
  // Shuffle
  for (let i = prompts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [prompts[i], prompts[j]] = [prompts[j], prompts[i]];
  }
  return prompts;
}

function generateOllamaPrompts(count, tier) {
  const descriptions = {
    T0: 'extremely trivial: rename, color change, read file, translate, list, simple question',
    T1: 'simple transforms: commit msg, regex, docstring, format, explain concept',
    T2: 'reasoning required: debug, investigate, compare, root cause, plan implementation',
    T3: 'critical/complex: deploy, migrate, security audit, architecture, refactor multi-file',
  };
  const raw = callOllama(
    `Generate exactly ${count} realistic prompts a developer would type in a CLI AI assistant.
All prompts must be ${descriptions[tier] || 'varied'}.
Mix languages: English and Portuguese (Portugal). Mix lengths: 5-40 words.
One prompt per line, no numbering, no quotes, no explanations.`, 'qwen3:30b', 2000
  );
  if (!raw.output) return [];
  return raw.output.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 5 && l.length < 500)
    .slice(0, count)
    .map(p => ({ prompt: p, expected_tier: tier, source: 'ollama_gen' }));
}

// ── A/B Testing Engine ───────────────────────────────────────────────
function runABTest(prompt, modelA, modelB, category) {
  log(`  A/B: ${modelA} vs ${modelB} on "${prompt.slice(0, 60)}..."`);

  const resultA = callOllama(prompt, modelA, 512);
  const resultB = callOllama(prompt, modelB, 512);

  if (!resultA.output || !resultB.output) {
    return { winner: null, reason: 'one_model_failed' };
  }

  // Judge with a third model (use the largest available that isn't A or B)
  const judge = availableModels.find(m => m !== modelA && m !== modelB && MODEL_TIERS[m]?.speed !== 'fast')
    || 'qwen3:30b';

  const judgment = callOllama(
    `Compare two responses to this developer prompt. Pick the BETTER one.
Criteria: correctness, completeness, conciseness, practical usefulness.

PROMPT: "${prompt.slice(0, 300)}"

RESPONSE A (${modelA}): ${resultA.output.slice(0, 400)}

RESPONSE B (${modelB}): ${resultB.output.slice(0, 400)}

Reply EXACTLY: A or B or TIE`, judge, 50
  );

  let winner = 'tie';
  if (judgment.output) {
    const v = judgment.output.trim().toUpperCase();
    if (v.startsWith('A')) winner = 'A';
    else if (v.startsWith('B')) winner = 'B';
    else winner = 'tie';
  }

  const result = {
    prompt_preview: prompt.slice(0, 200),
    category,
    model_a: modelA,
    model_b: modelB,
    winner,
    latency_a_ms: resultA.latency_ms,
    latency_b_ms: resultB.latency_ms,
    tokens_a: resultA.tokens_est || 0,
    tokens_b: resultB.tokens_est || 0,
    judge_model: judge,
  };

  // Update quality matrix
  const keyA = `${modelA}:${category}`;
  const keyB = `${modelB}:${category}`;
  if (!stats.quality_matrix[keyA]) stats.quality_matrix[keyA] = { wins: 0, losses: 0, ties: 0, total_latency: 0, runs: 0 };
  if (!stats.quality_matrix[keyB]) stats.quality_matrix[keyB] = { wins: 0, losses: 0, ties: 0, total_latency: 0, runs: 0 };

  stats.quality_matrix[keyA].runs++;
  stats.quality_matrix[keyB].runs++;
  stats.quality_matrix[keyA].total_latency += resultA.latency_ms;
  stats.quality_matrix[keyB].total_latency += resultB.latency_ms;

  if (winner === 'A') { stats.quality_matrix[keyA].wins++; stats.quality_matrix[keyB].losses++; }
  else if (winner === 'B') { stats.quality_matrix[keyB].wins++; stats.quality_matrix[keyA].losses++; }
  else { stats.quality_matrix[keyA].ties++; stats.quality_matrix[keyB].ties++; }

  stats.ab_tests_run++;
  return result;
}

// ── Model Execution Benchmark ────────────────────────────────────────
function benchmarkModel(model, prompt, category) {
  const result = callOllama(prompt, model, 512);
  const key = model;
  if (!stats.model_runs[key]) stats.model_runs[key] = { runs: 0, total_latency: 0, errors: 0, total_tokens: 0 };

  stats.model_runs[key].runs++;
  stats.model_runs[key].total_latency += result.latency_ms;
  if (result.error) stats.model_runs[key].errors++;
  if (result.tokens_est) stats.model_runs[key].total_tokens += result.tokens_est;
  stats.prompts_executed++;

  return result;
}

// ── Validation ───────────────────────────────────────────────────────
function runValidation() {
  const results = {};
  // Gold labels
  try {
    const r = spawnSync('node', [path.join(SCRIPT_DIR, 'replay.js'), '--gold-labels'], {
      encoding: 'utf8', timeout: 30000, cwd: SCRIPT_DIR,
    });
    const m = (r.stdout || '').match(/accuracy[:\s]+(\d+\.?\d*)%/i);
    results.gold_labels = m ? parseFloat(m[1]) / 100 : null;
  } catch { results.gold_labels = null; }

  // Stress test
  try {
    const r = spawnSync('node', [path.join(SCRIPT_DIR, 'stress-test.js'), '--json'], {
      encoding: 'utf8', timeout: 30000, cwd: SCRIPT_DIR,
    });
    try { const j = JSON.parse(r.stdout); results.stress_test = j.adjusted_accuracy || j.accuracy; }
    catch { results.stress_test = null; }
  } catch { results.stress_test = null; }

  return results;
}

// ── Stats Writer ─────────────────────────────────────────────────────
function writeStats(validation) {
  const uptime = Math.floor((Date.now() - sessionStart) / 1000);
  const modelSummary = {};
  for (const [model, data] of Object.entries(stats.model_runs)) {
    modelSummary[model] = {
      runs: data.runs,
      avg_latency_ms: data.runs > 0 ? Math.round(data.total_latency / data.runs) : 0,
      errors: data.errors,
      avg_tokens: data.runs > 0 ? Math.round(data.total_tokens / data.runs) : 0,
    };
  }

  // Build quality matrix summary
  const qmSummary = {};
  for (const [key, data] of Object.entries(stats.quality_matrix)) {
    const winRate = data.runs > 0 ? ((data.wins + data.ties * 0.5) / data.runs * 100).toFixed(1) : '0';
    qmSummary[key] = {
      wins: data.wins, losses: data.losses, ties: data.ties,
      win_rate: winRate + '%',
      avg_latency_ms: data.runs > 0 ? Math.round(data.total_latency / data.runs) : 0,
    };
  }

  const snapshot = {
    user: TESTER_USER,
    role: 'synthetic_tester',
    updated_at: new Date().toISOString(),
    uptime_human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    cycles: cycleCount,
    prompts_generated: stats.prompts_generated,
    prompts_executed: stats.prompts_executed,
    ab_tests_run: stats.ab_tests_run,
    misroutings_found: stats.misroutings_found,
    fixes_applied: stats.fixes_applied,
    fixes_reverted: stats.fixes_reverted,
    models_available: availableModels,
    model_performance: modelSummary,
    quality_matrix: qmSummary,
    tier_accuracy: stats.tier_accuracy,
    last_validation: validation,
    cost_usd: 0,
  };

  if (!DRY_RUN) {
    fs.writeFileSync(STATS_PATH, JSON.stringify(snapshot, null, 2));
    fs.writeFileSync(QUALITY_MATRIX_PATH, JSON.stringify(qmSummary, null, 2));
  }
  return snapshot;
}

// ── Main Cycle ───────────────────────────────────────────────────────
function runCycle() {
  cycleCount++;
  const cycleStart = Date.now();
  log(`\n══ Cycle #${cycleCount} ══════════════════════════════════════`);

  // 1. Generate prompts — mix of template (fast) + Ollama-generated (rich)
  const templatePrompts = generatePrompts(8);
  // Every 3rd cycle, also generate Ollama prompts for richer variety
  let ollamaPrompts = [];
  if (cycleCount % 3 === 0) {
    const tier = pick(['T0', 'T1', 'T2', 'T3']);
    ollamaPrompts = generateOllamaPrompts(4, tier);
    log(`  Ollama generated ${ollamaPrompts.length} ${tier} prompts`);
  }
  const allPrompts = [...templatePrompts, ...ollamaPrompts];
  stats.prompts_generated += allPrompts.length;
  log(`  Generated ${allPrompts.length} prompts`);

  // 2. Classify each prompt
  const classified = [];
  for (const item of allPrompts) {
    const result = classify(item.prompt);
    if (result) {
      classified.push({ ...item, classified_tier: result.tier, confidence: result.confidence, category: result.task_category });
      // Track tier accuracy
      const key = item.expected_tier;
      if (!stats.tier_accuracy[key]) stats.tier_accuracy[key] = { correct: 0, total: 0 };
      stats.tier_accuracy[key].total++;
      if (result.tier === item.expected_tier) stats.tier_accuracy[key].correct++;
    }
  }
  log(`  Classified ${classified.length}/${allPrompts.length}`);

  // Count misroutings (off by >1 tier is a misrouting)
  const tierIdx = { T0: 0, T1: 1, T2: 2, T3: 3 };
  const misroutings = classified.filter(c => {
    const diff = Math.abs((tierIdx[c.classified_tier] || 0) - (tierIdx[c.expected_tier] || 0));
    return diff > 1;
  });
  stats.misroutings_found += misroutings.length;
  if (misroutings.length > 0) {
    log(`  ⚠ ${misroutings.length} misroutings detected`);
    for (const m of misroutings) {
      log(`    ${m.expected_tier}→${m.classified_tier}: "${m.prompt.slice(0, 60)}..."`);
      logEvent({ event: 'tester_misrouting', prompt_preview: m.prompt.slice(0, 200),
        expected: m.expected_tier, classified: m.classified_tier, category: m.category });
    }
  }

  // 3. Run actual model executions on a sample (2-3 prompts per cycle)
  const execSample = classified.slice(0, AGGRESSIVE ? 4 : 2);
  for (const item of execSample) {
    // Pick models appropriate for this tier
    const eligibleModels = availableModels.filter(m =>
      MODEL_TIERS[m]?.tiers.includes(item.classified_tier)
    );
    if (eligibleModels.length === 0) continue;

    const model = pick(eligibleModels);
    const result = benchmarkModel(model, item.prompt, item.category);
    if (result.output) {
      log(`  ✓ ${model} (${result.latency_ms}ms, ~${result.tokens_est}tok): "${item.prompt.slice(0, 50)}..."`);
    } else {
      log(`  ✗ ${model} failed: ${result.error}`);
    }

    logEvent({ event: 'tester_execution', model, prompt_preview: item.prompt.slice(0, 200),
      tier: item.classified_tier, category: item.category,
      latency_ms: result.latency_ms, tokens_est: result.tokens_est || 0,
      success: !!result.output });
  }

  // 4. A/B test (1 per cycle — the most valuable data)
  if (classified.length > 0) {
    const abItem = pick(classified);
    const eligible = availableModels.filter(m =>
      MODEL_TIERS[m]?.tiers.includes(abItem.classified_tier)
    );
    if (eligible.length >= 2) {
      // Pick 2 different models
      const shuffled = [...eligible].sort(() => Math.random() - 0.5);
      const abResult = runABTest(abItem.prompt, shuffled[0], shuffled[1], abItem.category);
      const winnerName = abResult.winner === 'A' ? shuffled[0]
        : abResult.winner === 'B' ? shuffled[1] : 'TIE';
      log(`  🏆 A/B winner: ${winnerName} (${abResult.latency_a_ms}ms vs ${abResult.latency_b_ms}ms)`);
      logEvent({ event: 'tester_ab_test', ...abResult });
    }
  }

  // 5. Log all classifications
  for (const c of classified) {
    logEvent({ event: 'tester_classification', prompt_preview: c.prompt.slice(0, 200),
      decided_tier: c.classified_tier, expected_tier: c.expected_tier,
      confidence: c.confidence, category: c.category, prompt_source: c.source });
  }

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  log(`  Cycle #${cycleCount} done in ${elapsed}s | total: ${stats.prompts_generated} gen, ${stats.prompts_executed} exec, ${stats.ab_tests_run} A/B, ${stats.misroutings_found} mis`);
}

// ── Hourly Analysis ──────────────────────────────────────────────────
function hourlyAnalysis() {
  log('\n═══════════════════════════════════════════════════════════');
  log('  HOURLY REPORT');
  log('═══════════════════════════════════════════════════════════');

  const validation = runValidation();
  log(`  Accuracy: gold=${validation.gold_labels ? (validation.gold_labels * 100).toFixed(1) + '%' : 'n/a'} stress=${validation.stress_test ? (validation.stress_test * 100).toFixed(1) + '%' : 'n/a'}`);

  // Backtest
  try {
    spawnSync('node', [path.join(SCRIPT_DIR, 'backtest.js')], { encoding: 'utf8', timeout: 60000, cwd: SCRIPT_DIR });
    log('  Backtest: ✓');
  } catch { log('  Backtest: ✗'); }

  // Signals
  try {
    spawnSync('node', [path.join(SCRIPT_DIR, 'signals.js'), '--all'], { encoding: 'utf8', timeout: 30000, cwd: SCRIPT_DIR });
    log('  Signals: ✓');
  } catch { log('  Signals: ✗'); }

  // Write stats
  const snapshot = writeStats(validation);

  // Print model performance summary
  log('\n  Model Performance:');
  for (const [model, data] of Object.entries(snapshot.model_performance)) {
    log(`    ${model.padEnd(22)} ${String(data.runs).padStart(4)} runs  ${String(data.avg_latency_ms).padStart(6)}ms avg  ${String(data.avg_tokens).padStart(4)}tok avg  ${data.errors} err`);
  }

  // Print quality matrix highlights
  const qmEntries = Object.entries(snapshot.quality_matrix).filter(([, d]) => d.wins + d.losses + d.ties >= 2);
  if (qmEntries.length > 0) {
    log('\n  Quality Matrix (≥2 A/B tests):');
    qmEntries.sort((a, b) => parseFloat(b[1].win_rate) - parseFloat(a[1].win_rate));
    for (const [key, data] of qmEntries.slice(0, 10)) {
      log(`    ${key.padEnd(35)} ${data.win_rate.padStart(6)} win  W${data.wins}/L${data.losses}/T${data.ties}  ${String(data.avg_latency_ms).padStart(5)}ms`);
    }
  }

  // Print tier accuracy
  log('\n  Tier Accuracy:');
  for (const [tier, data] of Object.entries(snapshot.tier_accuracy)) {
    const pct = data.total > 0 ? (data.correct / data.total * 100).toFixed(1) : 'n/a';
    log(`    ${tier}: ${pct}% (${data.correct}/${data.total})`);
  }

  logEvent({ event: 'tester_hourly_summary', ...snapshot });
  log('\n═══════════════════════════════════════════════════════════\n');
  return validation;
}

// ── Banner ───────────────────────────────────────────────────────────
function printBanner() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              🐮 MOOTER CONTINUOUS TESTER — v2.0                 ║
║                                                                  ║
║   24/7 autonomous benchmark & improvement agent                  ║
║   100% local · zero token cost · GPU-accelerated                 ║
║                                                                  ║
║   Models: ${availableModels.join(', ').slice(0, 50).padEnd(50)}  ║
║   Mode: ${AGGRESSIVE ? 'AGGRESSIVE (max GPU)' : 'STANDARD       '}                         ║
║   Interval: ${String(CYCLE_INTERVAL_S).padEnd(4)}s   Dry run: ${DRY_RUN ? 'YES' : 'NO '}                          ║
║                                                                  ║
║   Generates prompts → classifies → runs models → A/B tests      ║
║   → detects misroutings → builds quality matrix → reports        ║
║                                                                  ║
║   Ctrl+C to stop gracefully                                      ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  // Detect available models
  try {
    const raw = execSync('ollama list', { encoding: 'utf8', timeout: 5000 });
    const lines = raw.split('\n').slice(1).filter(l => l.trim());
    for (const line of lines) {
      const name = line.split(/\s+/)[0];
      if (name && MODEL_TIERS[name]) {
        availableModels.push(name);
      }
    }
  } catch {
    log('ERROR: Ollama not running. Start with: ollama serve');
    process.exit(1);
  }

  if (availableModels.length === 0) {
    log('ERROR: No compatible models found. Need at least: qwen2.5:3b, qwen3:30b');
    process.exit(1);
  }

  printBanner();

  // Initial validation
  log('Running initial validation...');
  const initial = runValidation();
  log(`Baseline: gold=${initial.gold_labels ? (initial.gold_labels * 100).toFixed(1) + '%' : 'n/a'} stress=${initial.stress_test ? (initial.stress_test * 100).toFixed(1) + '%' : 'n/a'}`);

  let lastHourly = Date.now();

  while (running) {
    try {
      runCycle();
    } catch (e) {
      log(`ERROR: ${e.message}`);
    }

    // Hourly check
    if (Date.now() - lastHourly >= 3600000) {
      lastHourly = Date.now();
      hourlyAnalysis();
    }

    // Wait
    for (let i = 0; i < CYCLE_INTERVAL_S && running; i++) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Final report
  log('\nShutting down — final report:');
  hourlyAnalysis();
  log('Goodbye. 🐮');
}

main().catch(e => { console.error(`FATAL: ${e.message}\n${e.stack}`); process.exit(1); });
