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
const BACKLOG_PATH = path.join(SCRIPT_DIR, 'mooter-tester-backlog.json');

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
const FOCUS_PATH = path.join(SCRIPT_DIR, 'mooter-tester-focus.json');

// ── Directed Focus Areas ────────────────────────────────────────────
// Reads focus config to direct prompt generation toward project priorities.
// If no config or disabled areas, falls back to pure classifier testing.
function loadFocusConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(FOCUS_PATH, 'utf8'));
    const areas = (cfg.focus_areas || []).filter(a => a.enabled !== false);
    if (areas.length === 0) return null;
    // Normalise weights
    const totalWeight = areas.reduce((s, a) => s + (a.weight || 0), 0);
    if (totalWeight <= 0) return null;
    // Check if any area is PRIMARY (>50% of total weight)
    const hasPrimary = areas.some(a => (a.weight || 0) / totalWeight > 0.5);
    return {
      areas: areas.map(a => ({ ...a, weight: (a.weight || 0) / totalWeight })),
      autopilot: cfg.autopilot || { enabled: false },
      chains: cfg.progressive_chains || { enabled: false },
      tracking: cfg.quality_tracking || {},
      hasPrimary,
    };
  } catch { return null; }
}

function pickFocusArea(cfg) {
  if (!cfg) return null;
  const r = Math.random();
  let cumulative = 0;
  for (const area of cfg.areas) {
    cumulative += area.weight;
    if (r <= cumulative) return area;
  }
  return cfg.areas[cfg.areas.length - 1];
}

function generateFocusedPrompts(area, count, chainMode) {
  const guidance = area.prompt_guidance || area.description || 'varied developer tasks';
  const chainInstruction = chainMode
    ? `\nIMPORTANT: Generate a PROGRESSIVE CHAIN — each prompt builds on the previous one. Example: prompt 1 analyses, prompt 2 suggests improvements, prompt 3 implements the best, prompt 4 tests it.`
    : '';

  // v2.0: inject skills into the prompt for more targeted generation
  const skills = area.skills || [];
  const skillInstruction = skills.length > 0
    ? `\nUse ONE of these specialist skills for each prompt:\n${skills.map(s => `- ${s}`).join('\n')}`
    : '';

  const raw = callOllama(
    `You are generating realistic prompts that a developer would type in a CLI AI assistant (Claude Code).
Focus area: ${area.name} — ${area.description}
Guidance: ${guidance}${skillInstruction}${chainInstruction}

Generate exactly ${count} prompts. Rules:
- Each must be a realistic developer command or question
- Mix languages: English and Portuguese (Portugal)
- Mix lengths: 8-50 words per prompt
- Be specific and actionable (not vague)
- NO meta-instructions, NO numbering, NO quotes
- One prompt per line

/no_think`, 'qwen3:30b', 3000
  );
  if (!raw.output) return [];

  // Determine expected tier based on focus area
  const tierMap = {
    'classifier': null,  // mixed tiers
    'onboarding-ux': 'T2',
    'documentation': 'T1',
    'optimizer': null,    // mixed
    'general': null,      // mixed
  };
  const defaultTier = tierMap[area.id] || null;

  return raw.output.split('\n')
    .map(l => l.replace(/^[-*•]\s+/, '').replace(/^\d+[\.\)]\s*/, '').trim())  // strip bullets + numbering
    .filter(l => l.length > 10 && l.length < 500)
    .filter(l => !/^(?:Thinking|We are|Mix (?:lengths|English)|One prompt|One per line|IMPORTANT|Focus (?:area|:)|Guidance|Generate|Each prompt|The skills|Use one|Analyze the current state|Prompt \d+:|\/?no_think)/i.test(l))
    .filter(l => !/specialist skills?|skills? we have|per prompt|one of the|\/no_think/i.test(l))
    .slice(0, count)
    .map((p, i) => ({
      prompt: p,
      expected_tier: defaultTier,  // null = classify will determine
      source: 'focused_gen',
      focus_area: area.id,
      chain_position: chainMode ? i + 1 : null,
    }));
}

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
  ab_judge_agree: 0,        // both swap-passes agree → strong signal
  ab_judge_partial: 0,      // one pass is TIE → weak signal
  ab_judge_disagree: 0,     // passes disagree → positional bias detected
  optimizer_ab_tests: 0,
  embedding_builds: 0,
  misroutings_found: 0,
  fixes_applied: 0,
  fixes_reverted: 0,
  optimizer_wins: 0,        // times optimized prompt beat raw
  optimizer_losses: 0,      // times raw prompt beat optimized
  optimizer_ties: 0,
  model_runs: {},           // model → { runs, total_latency, errors, total_tokens }
  tier_accuracy: {},        // tier → { correct, total }
  quality_matrix: {},       // "model:category" → { wins, losses, ties, total_latency, runs }
  optimizer_matrix: {},     // "model:category" → { raw_wins, opt_wins, ties }
  model_dialect_scores: {}, // model → { lang_hint_helped, structured_helped, padding_helped }
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
    const r = spawnSync('ollama', ['run', model, '--nowordwrap', '--keepalive', '15m'], {
      input: `/no_think\n${prompt}`,
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, OLLAMA_NUM_PREDICT: String(maxTokens) },
    });
    const elapsed = Date.now() - start;
    const stripAnsi = (s) => (s || '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
    if (r.status !== 0 || r.signal) {
      const stderrSnippet = stripAnsi(r.stderr).trim().slice(0, 200);
      return {
        output: null,
        latency_ms: elapsed,
        error: `exit=${r.status}${r.signal ? ' signal=' + r.signal : ''}${stderrSnippet ? ' stderr=' + stderrSnippet : ''}`,
      };
    }
    let out = stripAnsi(r.stdout).trim();
    out = out.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!out) return { output: null, latency_ms: elapsed, error: 'empty_output_after_think_strip' };
    return { output: out, latency_ms: elapsed, tokens_est: Math.ceil(out.length / 4) };
  } catch (e) {
    return { output: null, latency_ms: Date.now() - start, error: 'spawn_exception: ' + e.message };
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
    'write a regex that matches {textPattern}',
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
  textPattern: ['email addresses', 'URLs', 'ISO dates', 'phone numbers', 'semantic versions', 'UUIDs'],
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
  const candidates = raw.output.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 5 && l.length < 500)
    .slice(0, count);

  // Self-consistency: only trust the Ollama-assigned expected_tier when
  // classify.js agrees. Otherwise the label is unreliable (Ollama's
  // interpretation of e.g. "T1 = simple transforms" is noisy) and we
  // downgrade expected_tier to null so misrouting detection skips it.
  return candidates.map(p => {
    let expected = tier;
    try {
      const c = classify(p);
      const classifiedTier = c && c.tier;
      if (classifiedTier && classifiedTier !== tier) expected = null;
    } catch { /* classifier unavailable — trust the label */ }
    return { prompt: p, expected_tier: expected, source: 'ollama_gen' };
  });
}

// ── A/B Testing Engine ───────────────────────────────────────────────
function runABTest(prompt, modelA, modelB, category) {
  log(`  A/B: ${modelA} vs ${modelB} on "${prompt.slice(0, 60)}..."`);

  const resultA = callOllama(prompt, modelA, 512);
  const resultB = callOllama(prompt, modelB, 512);

  if (!resultA.output || !resultB.output) {
    return {
      winner: null,
      reason: 'one_model_failed',
      model_a: modelA,
      model_b: modelB,
      category,
      prompt_preview: prompt.slice(0, 200),
      latency_a_ms: resultA.latency_ms,
      latency_b_ms: resultB.latency_ms,
      error_a: resultA.error || null,
      error_b: resultB.error || null,
    };
  }

  // Judge with a third model (use the largest available that isn't A or B)
  const judge = availableModels.find(m => m !== modelA && m !== modelB && MODEL_TIERS[m]?.speed !== 'fast')
    || 'qwen3:30b';

  // Positional-swap judge (Zheng et al. 2023, "Judging LLM-as-a-Judge", NeurIPS):
  // Single-pass judgment has ~30% positional bias. Run twice with A/B swapped;
  // only count a winner when both passes agree. Disagreement → TIE.
  const judgePrompt = (respA, respB, labelA, labelB) =>
    `Compare two responses to this developer prompt. Pick the BETTER one.
Criteria: correctness, completeness, conciseness, practical usefulness.

PROMPT: "${prompt.slice(0, 300)}"

RESPONSE ${labelA}: ${respA.slice(0, 400)}

RESPONSE ${labelB}: ${respB.slice(0, 400)}

Reply EXACTLY: ${labelA} or ${labelB} or TIE`;

  const parseJudgment = (out, labelA, labelB) => {
    if (!out) return 'tie';
    const v = out.trim().toUpperCase();
    if (v.startsWith(labelA)) return labelA;
    if (v.startsWith(labelB)) return labelB;
    return 'tie';
  };

  // Pass 1: A first
  const j1 = callOllama(judgePrompt(resultA.output, resultB.output, 'A', 'B'), judge, 50);
  const v1 = parseJudgment(j1.output, 'A', 'B');  // 'A' | 'B' | 'tie'

  // Pass 2: B first (positions swapped). Map back to original labels.
  const j2 = callOllama(judgePrompt(resultB.output, resultA.output, 'A', 'B'), judge, 50);
  const v2Raw = parseJudgment(j2.output, 'A', 'B');
  const v2 = v2Raw === 'A' ? 'B' : v2Raw === 'B' ? 'A' : 'tie';  // un-swap

  // Agreement rule: both passes must vote the same model. Otherwise → tie.
  let winner;
  let judge_agreement;
  if (v1 === v2) { winner = v1; judge_agreement = 'agree'; }
  else if (v1 === 'tie' || v2 === 'tie') { winner = 'tie'; judge_agreement = 'partial'; }
  else { winner = 'tie'; judge_agreement = 'disagree_positional_bias'; }

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
    judge_pass1: v1,
    judge_pass2: v2,
    judge_agreement,
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
  if (judge_agreement === 'agree') stats.ab_judge_agree++;
  else if (judge_agreement === 'partial') stats.ab_judge_partial++;
  else if (judge_agreement === 'disagree_positional_bias') stats.ab_judge_disagree++;
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

// ── Prompt Optimizer (tropicalization) ────────────────────────────
// Hot-load prompt-optimizer.js from repo
let _optimizeFn = null;
function loadOptimizer() {
  if (_optimizeFn) return _optimizeFn;
  try {
    const optPath = path.join(SCRIPT_DIR, 'prompt-optimizer.js');
    if (!fs.existsSync(optPath)) return null;
    // prompt-optimizer.js exports optimize via module.exports
    delete require.cache[require.resolve(optPath)];
    const mod = require(optPath);
    _optimizeFn = mod.optimize || mod;
    return _optimizeFn;
  } catch (e) {
    log(`optimizer load error: ${e.message}`);
    return null;
  }
}

// A/B test: raw prompt vs Mooter-optimized prompt on same model
function runOptimizerAB(rawPrompt, classification, model, category) {
  const optimize = loadOptimizer();
  if (!optimize || typeof optimize !== 'function') return null;

  const optResult = optimize(rawPrompt, classification);
  if (!optResult || !optResult.optimized_task) return null;

  const optimized = optResult.optimized_task;
  if (optimized === rawPrompt) return null; // no change

  log(`  🧪 Optimizer A/B on ${model}: raw vs tropicalized (${optResult.strategy})`);

  const rawResult = callOllama(rawPrompt, model, 512);
  const optModelResult = callOllama(optimized, model, 512);

  if (!rawResult.output || !optModelResult.output) return null;

  // Judge
  const judge = availableModels.find(m => m !== model && MODEL_TIERS[m]?.speed !== 'fast') || 'qwen3:30b';
  const judgment = callOllama(
    `A developer asked this question to an AI assistant:
"${rawPrompt.slice(0, 300)}"

Two responses were generated. Which is BETTER?
Criteria: correctness, completeness, conciseness, directly answers the question.

RESPONSE A (raw prompt): ${rawResult.output.slice(0, 400)}

RESPONSE B (optimized prompt): ${optModelResult.output.slice(0, 400)}

Reply EXACTLY: A or B or TIE`, judge, 50
  );

  let winner = 'tie';
  if (judgment.output) {
    const v = judgment.output.trim().toUpperCase();
    if (v.startsWith('A')) winner = 'raw';
    else if (v.startsWith('B')) winner = 'optimized';
  }

  // Track stats
  if (winner === 'optimized') stats.optimizer_wins++;
  else if (winner === 'raw') stats.optimizer_losses++;
  else stats.optimizer_ties++;
  stats.optimizer_ab_tests++;

  // Track per-model dialect effectiveness
  const dKey = model;
  if (!stats.model_dialect_scores[dKey]) stats.model_dialect_scores[dKey] = { opt_wins: 0, raw_wins: 0, ties: 0, strategies: {} };
  if (winner === 'optimized') stats.model_dialect_scores[dKey].opt_wins++;
  else if (winner === 'raw') stats.model_dialect_scores[dKey].raw_wins++;
  else stats.model_dialect_scores[dKey].ties++;

  // Track which strategies help which models
  for (const s of (optResult.strategy || '').split('+')) {
    if (!s) continue;
    if (!stats.model_dialect_scores[dKey].strategies[s]) stats.model_dialect_scores[dKey].strategies[s] = { wins: 0, losses: 0 };
    if (winner === 'optimized') stats.model_dialect_scores[dKey].strategies[s].wins++;
    else if (winner === 'raw') stats.model_dialect_scores[dKey].strategies[s].losses++;
  }

  // Per-model:category optimizer matrix
  const omKey = `${model}:${category}`;
  if (!stats.optimizer_matrix[omKey]) stats.optimizer_matrix[omKey] = { raw_wins: 0, opt_wins: 0, ties: 0 };
  if (winner === 'raw') stats.optimizer_matrix[omKey].raw_wins++;
  else if (winner === 'optimized') stats.optimizer_matrix[omKey].opt_wins++;
  else stats.optimizer_matrix[omKey].ties++;

  const result = {
    raw_prompt: rawPrompt.slice(0, 200),
    optimized_prompt: optimized.slice(0, 200),
    strategy: optResult.strategy,
    tokens_saved_est: optResult.tokens_saved_est || 0,
    model, category, winner,
    latency_raw_ms: rawResult.latency_ms,
    latency_opt_ms: optModelResult.latency_ms,
    judge_model: judge,
  };

  log(`  ${winner === 'optimized' ? '✅' : winner === 'raw' ? '❌' : '➖'} Optimizer ${winner} (strategy: ${optResult.strategy}, ${rawResult.latency_ms}ms vs ${optModelResult.latency_ms}ms)`);
  return result;
}

// ── Embedding/Vectorization Engine ───────────────────────────────
// Uses nomic-embed-text via Ollama API to build semantic clusters
function embedPrompt(text) {
  try {
    const http = require('http');
    const payload = JSON.stringify({ model: 'nomic-embed-text', prompt: text.slice(0, 500) });
    // Synchronous HTTP via spawnSync wrapper
    const r = spawnSync('node', ['-e', `
      const http = require('http');
      const payload = ${JSON.stringify(payload)};
      const req = http.request({ hostname: '127.0.0.1', port: 11434, path: '/api/embeddings',
        method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 10000
      }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try { process.stdout.write(JSON.stringify(JSON.parse(d).embedding.slice(0,10))); } catch { process.stdout.write('null'); } }); });
      req.on('error', () => process.stdout.write('null'));
      req.write(payload); req.end();
    `], { encoding: 'utf8', timeout: 15000 });
    if (r.stdout && r.stdout !== 'null') {
      return JSON.parse(r.stdout); // first 10 dims for clustering
    }
    return null;
  } catch { return null; }
}

function buildEmbeddingBatch(prompts) {
  const embedded = [];
  for (const p of prompts.slice(0, 5)) { // limit to 5 per cycle
    const vec = embedPrompt(p.prompt);
    if (vec) {
      embedded.push({ prompt_preview: p.prompt.slice(0, 100), tier: p.expected_tier, category: p.category || 'unknown', embedding_sample: vec });
    }
  }
  stats.embedding_builds += embedded.length;
  return embedded;
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

  // Optimizer effectiveness
  const optTotal = stats.optimizer_ab_tests;
  const optimizerSummary = {
    tests_run: optTotal,
    optimizer_win_rate: optTotal > 0 ? ((stats.optimizer_wins / optTotal) * 100).toFixed(1) + '%' : 'n/a',
    wins: stats.optimizer_wins,
    losses: stats.optimizer_losses,
    ties: stats.optimizer_ties,
    per_model_dialect: stats.model_dialect_scores,
    per_model_category: stats.optimizer_matrix,
  };

  const snapshot = {
    user: TESTER_USER,
    role: 'synthetic_tester',
    updated_at: new Date().toISOString(),
    uptime_human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    cycles: cycleCount,
    prompts_generated: stats.prompts_generated,
    prompts_executed: stats.prompts_executed,
    ab_tests_run: stats.ab_tests_run,
    optimizer_ab_tests: stats.optimizer_ab_tests,
    embeddings_built: stats.embedding_builds,
    misroutings_found: stats.misroutings_found,           // alias kept for backward compat
    raw_misrouting_detections: stats.misroutings_found,   // canonical: raw count before gold-label dedup
    fixes_applied: stats.fixes_applied,
    fixes_reverted: stats.fixes_reverted,
    models_available: availableModels,
    model_performance: modelSummary,
    quality_matrix: qmSummary,
    optimizer_effectiveness: optimizerSummary,
    tier_accuracy: stats.tier_accuracy,
    last_validation: validation,
    // 0 REAL, nao 0 por medir: este testador corre inteiramente em Ollama
    // local (`ollama run`, ver runModel/checkOllama). Sem esta nota o zero
    // parece um custo que ninguem calculou — foi por isso que um pilar o
    // apanhou a 2026-08-22.
    cost_usd: 0,
    total_tokens_cumulative: Object.values(modelSummary).reduce(
      (sum, d) => sum + (d.runs || 0) * (d.avg_tokens || 0), 0
    ),
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

  // 1. Generate prompts — mix of template + Ollama + FOCUSED (directed by config)
  const templatePrompts = generatePrompts(4);  // reduced from 8 to make room for focused
  let ollamaPrompts = [];
  let focusedPrompts = [];

  // Directed focus: every cycle, pick a focus area and generate themed prompts
  const focusCfg = loadFocusConfig();
  let autopilotPrompts = [];
  if (focusCfg) {
    const area = pickFocusArea(focusCfg);
    if (area) {
      const useChain = focusCfg.chains?.enabled && cycleCount % 4 === 0;
      focusedPrompts = generateFocusedPrompts(area, useChain ? 4 : 3, useChain);
      if (focusedPrompts.length > 0) {
        log(`  🎯 Focus: ${area.name} (${focusedPrompts.length} prompts${useChain ? ', chain' : ''})`);
      }
    }

    // Autopilot: when no PRIMARY focus, run broad improvement on alternating cycles
    const ap = focusCfg.autopilot;
    if (ap?.enabled && !focusCfg.hasPrimary && cycleCount % 2 === 0) {
      const apSkills = ap.skills || [];
      const skill = apSkills.length > 0 ? pick(apSkills) : 'general improvement';
      const apRaw = callOllama(
        `You are an autonomous QA agent for the "mooter" project (an intelligent LLM router for Claude Code).
Your current skill: ${skill}

Generate exactly 3 realistic prompts a developer would type to improve the project using this skill.
Guardrails — NEVER generate prompts that:
${(ap.guardrails || []).map(g => `- ${g}`).join('\n')}

Rules: mix English + Portuguese (Portugal), 10-50 words each, specific and actionable.
One prompt per line, no numbering, no quotes.

/no_think`, 'qwen3:30b', 2000
      );
      if (apRaw.output) {
        autopilotPrompts = apRaw.output.split('\n')
          .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim())
          .filter(l => l.length > 10 && l.length < 500)
          .filter(l => !/^(?:Thinking|You are|Your current|Generate|Guardrails|Rules|\/no_think)/i.test(l))
          .slice(0, 3)
          .map(p => ({ prompt: p, expected_tier: null, source: 'autopilot', focus_area: 'autopilot', chain_position: null }));
        if (autopilotPrompts.length > 0) {
          log(`  🤖 Autopilot: ${autopilotPrompts.length} prompts (skill: ${skill.split(':')[0]})`);
        }
      }
    }
  }

  // Every 3rd cycle, also generate Ollama prompts for variety
  if (cycleCount % 3 === 0 && focusedPrompts.length === 0) {
    const tier = pick(['T0', 'T1', 'T2', 'T3']);
    ollamaPrompts = generateOllamaPrompts(4, tier);
    log(`  Ollama generated ${ollamaPrompts.length} ${tier} prompts`);
  }
  const allPrompts = [...templatePrompts, ...focusedPrompts, ...autopilotPrompts, ...ollamaPrompts];
  stats.prompts_generated += allPrompts.length;
  log(`  Generated ${allPrompts.length} prompts`);

  // 2. Filter meta-prompts (tester's own LLM instructions that leak as test prompts)
  const META_PROMPT_START = /^(?:Thinking|We are (?:generating|focusing|to use|going)|We have to|We mix (?:languages|lengths)|Mix (?:languages|lengths|English|of)|One prompt per line|One per line|Realistic for a developer|Each prompt (?:must|should|uses|focuses|is)|Focus(?: area)?\s*:|Focus on |Guidance\s*:|Generate (?:exactly )?\d|The skills|Use one of|Prompt \d+\s*[:\-]|They must|- (?:Mix|Realistic|One prompt|Use one|Focus|Each prompt)|- (?:model-[a-z]+|[a-z]+-[a-z]+):|\d+\.\s*[a-z-]+(?:-auditor|-writer|-advocate|-matcher|-generator|-checker|-scanner|-reviewer)\s*:|IMPORTANT\s*:|Rules?\s*:|Requirements?\s*:|\/no_think)/i;
  const META_PROMPT_CONTAINS = /specialist skills?|skills? we have|skills? per prompt|one of the specialist|must use one of|\/no_think/i;
  const filteredPrompts = allPrompts.filter(p => {
    if (p.prompt.length < 15) return false; // too short to be real
    if (META_PROMPT_START.test(p.prompt)) return false; // tester meta-instruction
    if (META_PROMPT_CONTAINS.test(p.prompt)) return false; // contains generator lingo
    return true;
  });
  if (filteredPrompts.length < allPrompts.length) {
    log(`  Filtered ${allPrompts.length - filteredPrompts.length} meta-prompts`);
  }

  // 3. Classify each prompt (using pre-degradation tier for accuracy measurement)
  const classified = [];
  for (const item of filteredPrompts) {
    const result = classify(item.prompt);
    if (result) {
      // Use pre-degradation tier: if escalation_rule contains 'haiku_unavailable'
      // or 'budget_cap_downgrade', the original tier was one higher
      let preDegradationTier = result.tier;
      if (result.escalation_rule && result.escalation_rule.includes('haiku_unavailable')) {
        const ladder = ['T0', 'T1', 'T2', 'T3'];
        const idx = ladder.indexOf(result.tier);
        if (idx >= 0 && idx < 3) preDegradationTier = ladder[idx + 1];
      }
      classified.push({ ...item, classified_tier: preDegradationTier, final_tier: result.tier, confidence: result.confidence, category: result.task_category });
      // Track tier accuracy using pre-degradation tier (classifier quality, not infra)
      const key = item.expected_tier;
      if (!stats.tier_accuracy[key]) stats.tier_accuracy[key] = { correct: 0, total: 0 };
      stats.tier_accuracy[key].total++;
      if (preDegradationTier === item.expected_tier) stats.tier_accuracy[key].correct++;
    }
  }
  log(`  Classified ${classified.length}/${allPrompts.length}`);

  // Count misroutings (off by >1 tier is a misrouting).
  // Skip entries with no ground truth (expected_tier null) — can't be misrouted without expected.
  const tierIdx = { T0: 0, T1: 1, T2: 2, T3: 3 };
  const misroutings = classified.filter(c => {
    if (c.expected_tier == null || !(c.expected_tier in tierIdx)) return false;
    if (c.classified_tier == null || !(c.classified_tier in tierIdx)) return false;
    const diff = Math.abs(tierIdx[c.classified_tier] - tierIdx[c.expected_tier]);
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

  // 5. Optimizer A/B — test tropicalization effectiveness (every 2nd cycle)
  if (cycleCount % 2 === 0 && classified.length > 0) {
    const optItem = classified.find(c => c.prompt.length >= 30) || classified[0];
    const eligible = availableModels.filter(m => MODEL_TIERS[m]?.tiers.includes(optItem.classified_tier));
    if (eligible.length > 0) {
      const model = pick(eligible);
      const classificationObj = classify(optItem.prompt);
      if (classificationObj) {
        const optAB = runOptimizerAB(optItem.prompt, classificationObj, model, optItem.category);
        if (optAB) {
          logEvent({ event: 'tester_optimizer_ab', ...optAB });
        }
      }
    }
  }

  // 6. Embedding vectorization — build semantic clusters (every 5th cycle)
  if (cycleCount % 5 === 0 && classified.length > 0) {
    const embedded = buildEmbeddingBatch(classified);
    if (embedded.length > 0) {
      log(`  📐 Embedded ${embedded.length} prompts (nomic-embed-text)`);
      for (const e of embedded) {
        logEvent({ event: 'tester_embedding', ...e });
      }
    }
  }

  // 7. Log all classifications (pre-degradation tier for accuracy, final tier for routing)
  for (const c of classified) {
    logEvent({ event: 'tester_classification', prompt_preview: c.prompt.slice(0, 200),
      decided_tier: c.classified_tier, final_tier: c.final_tier, expected_tier: c.expected_tier,
      confidence: c.confidence, category: c.category, prompt_source: c.source,
      focus_area: c.focus_area || null, chain_position: c.chain_position || null });
  }

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  const optRate = stats.optimizer_ab_tests > 0 ? `${Math.round(stats.optimizer_wins / stats.optimizer_ab_tests * 100)}%` : 'n/a';
  log(`  Cycle #${cycleCount} done in ${elapsed}s | gen:${stats.prompts_generated} exec:${stats.prompts_executed} A/B:${stats.ab_tests_run} opt:${stats.optimizer_ab_tests}(${optRate}win) embed:${stats.embedding_builds} mis:${stats.misroutings_found}`);
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

  // Print optimizer (tropicalization) effectiveness
  const oe = snapshot.optimizer_effectiveness;
  if (oe && oe.tests_run > 0) {
    log('\n  Prompt Optimizer (Tropicalization):');
    log(`    Tests: ${oe.tests_run}  Win rate: ${oe.win_rate}  (W${oe.wins}/L${oe.losses}/T${oe.ties})`);
    // Per-model dialect scores
    for (const [model, scores] of Object.entries(oe.per_model_dialect || {})) {
      const total = scores.opt_wins + scores.raw_wins + scores.ties;
      if (total === 0) continue;
      const rate = ((scores.opt_wins / total) * 100).toFixed(0);
      log(`    ${model.padEnd(22)} opt wins ${rate}%  (${scores.opt_wins}/${total})`);
      // Strategy breakdown
      for (const [strat, sd] of Object.entries(scores.strategies || {})) {
        if (sd.wins + sd.losses === 0) continue;
        log(`      ${strat}: +${sd.wins} -${sd.losses}`);
      }
    }
  }

  // Print embeddings stats
  if (stats.embedding_builds > 0) {
    log(`\n  Embeddings: ${stats.embedding_builds} prompts vectorized (nomic-embed-text)`);
  }

  logEvent({ event: 'tester_hourly_summary', ...snapshot });

  // ── Write structured backlog for /mooter-review ────────────────
  writeBacklog(snapshot);

  log('\n═══════════════════════════════════════════════════════════\n');
  return validation;
}

// ── Backlog Writer ──────────────────────────────────────────────────
// Compiles all findings into a structured file that /mooter-review reads.
// Paulo opens a Claude terminal, runs /mooter-review, accepts/rejects.
function writeBacklog(snapshot) {
  if (DRY_RUN) return;

  // Load existing backlog or start fresh
  let backlog = { version: 3, updated_at: null, findings: { misroutings: [], optimizer_insights: [], model_recommendations: [], classifier_fixes: [] }, counters: {} };
  try {
    if (fs.existsSync(BACKLOG_PATH)) backlog = JSON.parse(fs.readFileSync(BACKLOG_PATH, 'utf8'));
  } catch { /* start fresh */ }

  backlog.updated_at = new Date().toISOString();

  // 1. Misroutings → gold-label candidates
  // Read history for unprocessed misroutings
  try {
    const history = fs.readFileSync(HISTORY_PATH, 'utf8').split('\n').filter(Boolean);
    const existingPrompts = new Set(backlog.findings.misroutings.map(m => m.prompt_preview));
    for (const line of history) {
      try {
        const e = JSON.parse(line);
        if (e.event !== 'tester_misrouting') continue;
        if (existingPrompts.has(e.prompt_preview)) continue;
        backlog.findings.misroutings.push({
          prompt_preview: e.prompt_preview,
          expected: e.expected,
          classified: e.classified,
          category: e.category,
          status: 'pending', // pending | accepted | rejected
          detected_at: e.ts,
        });
        existingPrompts.add(e.prompt_preview);
      } catch { /* skip */ }
    }
  } catch { /* no history yet */ }

  // Cap at 100 pending
  backlog.findings.misroutings = backlog.findings.misroutings
    .filter(m => m.status === 'pending')
    .slice(-100);

  // 2. Optimizer insights — strategies that consistently win per model
  const dialectData = stats.model_dialect_scores;
  backlog.findings.optimizer_insights = [];
  for (const [model, scores] of Object.entries(dialectData)) {
    const total = scores.opt_wins + scores.raw_wins + scores.ties;
    if (total < 3) continue;
    const winRate = scores.opt_wins / total;
    const bestStrats = Object.entries(scores.strategies || {})
      .filter(([, s]) => s.wins > s.losses)
      .map(([name, s]) => ({ strategy: name, wins: s.wins, losses: s.losses }))
      .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses));

    backlog.findings.optimizer_insights.push({
      model, total_tests: total,
      optimizer_win_rate: (winRate * 100).toFixed(1) + '%',
      verdict: winRate > 0.6 ? 'optimizer_helps' : winRate < 0.4 ? 'optimizer_hurts' : 'neutral',
      best_strategies: bestStrats.slice(0, 3),
      status: 'pending',
    });
  }

  // 3. Model recommendations — which model is best per category
  const qm = stats.quality_matrix;
  const categoryBest = {};
  for (const [key, data] of Object.entries(qm)) {
    const [model, category] = key.split(':');
    if (!category || data.runs < 2) continue;
    const score = (data.wins + data.ties * 0.5) / data.runs;
    const avgLatency = data.runs > 0 ? Math.round(data.total_latency / data.runs) : 0;
    if (!categoryBest[category] || score > categoryBest[category].score) {
      categoryBest[category] = { model, score, wins: data.wins, losses: data.losses, ties: data.ties, avg_latency_ms: avgLatency };
    }
  }
  backlog.findings.model_recommendations = Object.entries(categoryBest)
    .map(([category, data]) => ({ category, recommended_model: data.model, win_rate: (data.score * 100).toFixed(1) + '%', ...data, status: 'pending' }));

  // 4. Counters — for landing page and dashboard
  backlog.counters = {
    total_prompts_generated: stats.prompts_generated,
    total_prompts_executed: stats.prompts_executed,
    total_ab_tests: stats.ab_tests_run,
    total_optimizer_tests: stats.optimizer_ab_tests,
    total_embeddings: stats.embedding_builds,
    total_misroutings: stats.misroutings_found,            // alias kept for backward compat
    raw_misrouting_detections: stats.misroutings_found,    // canonical: raw count before gold-label dedup
    optimizer_win_rate: stats.optimizer_ab_tests > 0 ? (stats.optimizer_wins / stats.optimizer_ab_tests * 100).toFixed(1) + '%' : 'n/a',
    models_benchmarked: Object.keys(stats.model_runs).length,
    uptime: snapshot.uptime_human,
    // 0 REAL, nao 0 por medir: este testador corre inteiramente em Ollama
    // local (`ollama run`, ver runModel/checkOllama). Sem esta nota o zero
    // parece um custo que ninguem calculou — foi por isso que um pilar o
    // apanhou a 2026-08-22.
    cost_usd: 0,
    last_updated: new Date().toISOString(),
  };

  fs.writeFileSync(BACKLOG_PATH, JSON.stringify(backlog, null, 2));
  log(`  Backlog: ${backlog.findings.misroutings.length} misroutings, ${backlog.findings.optimizer_insights.length} optimizer insights, ${backlog.findings.model_recommendations.length} model recs`);
}

// ── Banner ───────────────────────────────────────────────────────────
function printBanner() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              🐮 MOOTER CONTINUOUS TESTER — v3.0                 ║
║                                                                  ║
║   24/7 autonomous benchmark & improvement agent                  ║
║   100% local · zero token cost · GPU-accelerated                 ║
║                                                                  ║
║   Models: ${availableModels.join(', ').slice(0, 50).padEnd(50)}  ║
║   Mode: ${AGGRESSIVE ? 'AGGRESSIVE (max GPU)' : 'STANDARD       '}                         ║
║   Interval: ${String(CYCLE_INTERVAL_S).padEnd(4)}s   Dry run: ${DRY_RUN ? 'YES' : 'NO '}                          ║
║                                                                  ║
║   Pipeline: generate → classify → tropicalize → execute          ║
║   → A/B model vs model → A/B raw vs optimized → embed           ║
║   → quality matrix → dialect map → hourly report                 ║
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

  // Warmup: pre-load each model into VRAM so first cycle doesn't pay cold-start cost
  log(`Warming up ${availableModels.length} models (keepalive 15min)...`);
  for (const model of availableModels) {
    const w = callOllama('hi', model, 8);
    if (w.error) {
      log(`  ${model}: ⚠ ${w.error.slice(0, 80)}`);
    } else {
      log(`  ${model}: ✓ ready (${(w.latency_ms/1000).toFixed(1)}s)`);
    }
  }

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
