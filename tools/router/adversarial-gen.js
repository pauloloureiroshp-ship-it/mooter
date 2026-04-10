#!/usr/bin/env node
/**
 * adversarial-gen.js — AI-powered prompt generator for classifier testing.
 *
 * Uses Ollama (local, free) to generate realistic developer prompts,
 * then classifies each one and identifies misroutings automatically.
 *
 * Three modes:
 *   1. --realistic    Generate prompts that mimic real developer chat (default)
 *   2. --adversarial  Generate prompts designed to confuse the classifier
 *   3. --template     Generate from templates with random variables
 *
 * Usage:
 *   node adversarial-gen.js                    → 30 realistic prompts
 *   node adversarial-gen.js --adversarial      → 30 edge-case prompts
 *   node adversarial-gen.js --template         → 50 template-based prompts
 *   node adversarial-gen.js --count 100        → custom count
 *   node adversarial-gen.js --report           → full report with suggestions
 *   node adversarial-gen.js --auto             → generate + classify + report + save
 *
 * The --auto flag is designed for scheduled execution (cron jobs).
 * It appends results to adversarial-history.json for trend tracking.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const HISTORY_PATH = path.join(ROUTER_DIR, 'adversarial-history.json');
const CLASSIFY = path.join(__dirname, 'classify.js');

const args = process.argv.slice(2);
const mode = args.includes('--adversarial') ? 'adversarial'
           : args.includes('--template') ? 'template'
           : 'realistic';
const countIdx = args.indexOf('--count');
const count = countIdx >= 0 ? parseInt(args[countIdx + 1]) || 30 : mode === 'template' ? 50 : 30;
const autoMode = args.includes('--auto');
const reportMode = args.includes('--report') || autoMode;

// ── Ollama caller ───────────────────────────────────────────────
function callOllama(prompt, maxTokens = 2000) {
  const r = spawnSync('ollama', ['run', 'qwen3:30b', '--nowordwrap'], {
    input: prompt,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, OLLAMA_NUM_PREDICT: String(maxTokens) },
  });
  if (r.status !== 0) return null;
  // Strip thinking tags if present
  let out = (r.stdout || '').trim();
  out = out.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return out;
}

// ── Classify a single prompt ────────────────────────────────────
function classify(prompt) {
  const r = spawnSync('node', [CLASSIFY, prompt], { encoding: 'utf8', timeout: 5000 });
  try { return JSON.parse(r.stdout); } catch { return null; }
}

// ── Mode 1: Realistic prompts via Ollama ────────────────────────
function generateRealistic(n) {
  const systemPrompt = `/no_think
Generate exactly ${n} realistic prompts that a software developer would type in a CLI coding assistant.
Each prompt should be on its own line, nothing else.
Mix of: trivial tasks (rename, color change), medium tasks (debug, investigate), and critical tasks (deploy, migration, security).
Mix languages: English and Portuguese (Portugal).
Mix lengths: some very short (5 words), some medium (15 words), some long (30+ words).
Include: code pastes, error messages, git commands, architecture questions, security concerns.
NO numbering, NO bullets, NO quotes. Just the raw prompt text, one per line.`;

  const raw = callOllama(systemPrompt, 3000);
  if (!raw) return [];
  return raw.split('\n').map(l => l.trim()).filter(l => l.length > 5 && l.length < 500).slice(0, n);
}

// ── Mode 2: Adversarial prompts via Ollama ──────────────────────
function generateAdversarial(n) {
  const systemPrompt = `/no_think
Generate exactly ${n} tricky prompts that would confuse an LLM routing classifier.
The classifier uses regex to decide if a prompt needs: T0 (trivial/free), T2 (medium/Sonnet), or T3 (critical/Opus).

Generate prompts that are AMBIGUOUS or DECEPTIVE:
- Sounds trivial but is actually critical (e.g. "just update the password field" — touches auth!)
- Sounds critical but is actually trivial (e.g. "redesign the console.log format")
- Has mixed signals (e.g. "fix the typo in the migration script" — typo=trivial, migration=critical)
- Uses informal language for serious tasks (e.g. "yo can u deploy this real quick")
- Very short but important (e.g. "rollback prod")
- Very long but trivial
- Contains code that looks dangerous but isn't
- Contains error messages mixed with questions

One prompt per line, no numbering, no quotes.`;

  const raw = callOllama(systemPrompt, 3000);
  if (!raw) return [];
  return raw.split('\n').map(l => l.trim()).filter(l => l.length > 5 && l.length < 500).slice(0, n);
}

// ── Mode 3: Template-based generation (no Ollama needed) ────────
function generateTemplate(n) {
  const templates = [
    // Trivial
    { t: 'T0', tpl: ['change the {css} of the {element} to {value}', 'rename {var} to {newvar}', 'add a {log} statement in {func}', 'remove the {comment} in line {n}', 'fix the {typo} in the {msg}'] },
    // Medium
    { t: 'T2', tpl: ['why does the {comp} {fail} when {condition}', 'investigate the {issue} in {module}', 'the {metric} went from {n1} to {n2} after {event}', 'compare {a} vs {b} for our {usecase}', 'debug: {error} in {file}'] },
    // Critical
    { t: 'T3', tpl: ['deploy the {fix} to {env}', 'migrate the {table} schema to support {feature}', 'the {vuln} in {component} needs to be patched', 'refactor the entire {system} to use {pattern}', 'review the {change} before pushing to {branch}'] },
  ];

  const fills = {
    css: ['color', 'margin', 'padding', 'font-size', 'border', 'background'],
    element: ['button', 'header', 'sidebar', 'card', 'input', 'modal'],
    value: ['#333', 'red', '16px', '0', 'none', 'flex'],
    var: ['getUserById', 'handleSubmit', 'parseData', 'formatDate'],
    newvar: ['fetchUser', 'onSubmit', 'transformData', 'toDateString'],
    log: ['console.log', 'debug', 'trace', 'print'],
    func: ['handleClick', 'processOrder', 'validateInput', 'renderChart'],
    comment: ['TODO', 'FIXME', 'HACK', 'deprecated block'],
    n: ['12', '42', '87', '156', '231'],
    typo: ['typo', 'spelling error', 'wrong variable name'],
    msg: ['error message', 'success notification', 'validation text'],
    comp: ['useEffect', 'WebSocket', 'auth middleware', 'cache layer', 'queue processor'],
    fail: ['crashes', 'returns null', 'times out', 'throws 500', 'leaks memory'],
    condition: ['under load', 'after 60 seconds', 'with concurrent users', 'on Safari', 'in production'],
    issue: ['memory spike', 'slow query', 'race condition', 'deadlock', 'flaky test'],
    module: ['auth', 'payments', 'notifications', 'search', 'dashboard'],
    metric: ['p95 latency', 'error rate', 'memory usage', 'CPU', 'response time'],
    n1: ['200ms', '2%', '512MB', '10%', '0.5s'],
    n2: ['3.2s', '15%', '4GB', '45%', '8s'],
    event: ['the last deploy', 'enabling the feature flag', 'the migration', 'upgrading Node'],
    a: ['REST', 'PostgreSQL', 'Redis', 'GraphQL', 'MongoDB'],
    b: ['GraphQL', 'DynamoDB', 'Memcached', 'tRPC', 'Cassandra'],
    usecase: ['real-time chat', 'analytics dashboard', 'e-commerce', 'IoT ingestion'],
    error: ['TypeError: x is not a function', 'ECONNREFUSED', '403 Forbidden', 'OOM killed'],
    file: ['src/auth.ts', 'api/orders.js', 'lib/cache.ts', 'workers/processor.js'],
    fix: ['hotfix', 'security patch', 'performance fix', 'rollback'],
    env: ['production', 'staging', 'main branch', 'all servers'],
    table: ['users', 'orders', 'sessions', 'products', 'payments'],
    feature: ['multi-tenancy', 'soft delete', 'versioning', 'audit trail'],
    vuln: ['XSS vulnerability', 'SQL injection', 'CSRF bug', 'auth bypass'],
    component: ['search form', 'admin panel', 'API gateway', 'file upload'],
    system: ['auth layer', 'data pipeline', 'notification system', 'payment flow'],
    pattern: ['repository pattern', 'CQRS', 'event sourcing', 'microservices'],
    change: ['migration', 'schema update', 'dependency bump', 'auth refactor'],
    branch: ['main', 'production', 'release/v2', 'master'],
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const fill = (tpl) => tpl.replace(/\{(\w+)\}/g, (_, k) => fills[k] ? pick(fills[k]) : k);

  const results = [];
  for (let i = 0; i < n; i++) {
    const tier = pick(templates);
    const tpl = pick(tier.tpl);
    results.push({ prompt: fill(tpl), expected: tier.t });
  }
  return results;
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log(`frugal — adversarial generator (${mode} mode, ${count} prompts)\n`);

  let prompts = [];

  if (mode === 'template') {
    const generated = generateTemplate(count);
    prompts = generated.map(g => ({ prompt: g.prompt, expected: g.expected }));
    console.log(`Generated ${prompts.length} template prompts (no Ollama needed)\n`);
  } else {
    console.log('Calling Ollama qwen3:30b...');
    const raw = mode === 'adversarial' ? generateAdversarial(count) : generateRealistic(count);
    if (raw.length === 0) {
      console.log('Ollama unavailable or returned empty. Falling back to template mode.');
      const generated = generateTemplate(count);
      prompts = generated.map(g => ({ prompt: g.prompt, expected: g.expected }));
    } else {
      // For Ollama-generated prompts, we don't know the expected tier
      prompts = raw.map(p => ({ prompt: p, expected: null }));
      console.log(`Generated ${prompts.length} prompts\n`);
    }
  }

  // Classify each
  const results = [];
  const tierCounts = { T0: 0, T1: 0, T2: 0, T3: 0 };
  let mismatches = 0;

  prompts.forEach(({ prompt, expected }) => {
    const d = classify(prompt);
    if (!d) return;
    tierCounts[d.tier] = (tierCounts[d.tier] || 0) + 1;
    const match = expected ? d.tier === expected : null;
    if (expected && !match) mismatches++;
    results.push({
      prompt: prompt.slice(0, 100),
      tier: d.tier,
      expected,
      match,
      confidence: d.confidence,
      category: d.task_category,
    });
  });

  // Report
  const total = results.length;
  console.log(`Classified: ${total}`);
  console.log(`Distribution: T0=${tierCounts.T0} T1=${tierCounts.T1} T2=${tierCounts.T2} T3=${tierCounts.T3}`);
  const freePct = ((tierCounts.T0 + tierCounts.T1) / total * 100).toFixed(1);
  const t3Pct = (tierCounts.T3 / total * 100).toFixed(1);
  console.log(`Free tier: ${freePct}% | T3: ${t3Pct}%`);

  if (mode === 'template' && mismatches > 0) {
    console.log(`\nMismatches: ${mismatches}/${total}`);
    results.filter(r => r.match === false).forEach(r => {
      console.log(`  ${r.expected}→${r.tier} "${r.prompt.slice(0, 70)}"`);
    });
  }

  // Low confidence prompts (interesting for pattern discovery)
  const lowConf = results.filter(r => r.confidence < 0.7);
  if (lowConf.length > 0 && reportMode) {
    console.log(`\nLow confidence (${lowConf.length}): potential pattern gaps`);
    lowConf.slice(0, 10).forEach(r => {
      console.log(`  [${r.tier} ${r.confidence}] "${r.prompt.slice(0, 70)}"`);
    });
  }

  // Suspicious classifications (T0 for long/complex prompts, T3 for short/simple)
  if (reportMode) {
    const suspicious = results.filter(r =>
      (r.tier === 'T0' && r.prompt.length > 100) ||
      (r.tier === 'T3' && r.prompt.length < 30)
    );
    if (suspicious.length > 0) {
      console.log(`\nSuspicious (${suspicious.length}): possible misroutings`);
      suspicious.slice(0, 10).forEach(r => {
        console.log(`  [${r.tier} len=${r.prompt.length}] "${r.prompt.slice(0, 70)}"`);
      });
    }
  }

  // Save to history
  if (autoMode) {
    let history = [];
    try {
      if (fs.existsSync(HISTORY_PATH)) {
        history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
      }
    } catch { /* fresh */ }
    history.push({
      timestamp: new Date().toISOString(),
      mode,
      total,
      tierCounts,
      free_pct: +freePct,
      t3_pct: +t3Pct,
      mismatches: mode === 'template' ? mismatches : null,
      low_confidence_count: lowConf.length,
    });
    if (history.length > 90) history = history.slice(-90);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    console.log(`\n✓ Saved to ${HISTORY_PATH}`);
  }
}

main().catch(console.error);
