#!/usr/bin/env node
/**
 * mooter-continuous-tester.js — 24/7 autonomous agent for classifier improvement.
 *
 * Runs in a dedicated terminal, uses ONLY local resources (Ollama + GPU).
 * Zero token cost. Zero human approval needed.
 *
 * Every cycle (~60s):
 *   1. Generate N prompts (realistic + adversarial + template mix)
 *   2. Classify each via classify.js
 *   3. Judge quality via Ollama LLM-as-judge
 *   4. Detect misroutings and log them
 *   5. Run A/B test: current vs proposed fixes
 *   6. If improvement found → apply via update-router.js (with backup)
 *   7. Log everything to decisions.log as user "mooter-tester"
 *
 * Hourly:
 *   - Run full validation suite (gold-labels + validation-set)
 *   - Run backtest analysis
 *   - Run signal detection
 *   - Run ground-truth oracles
 *   - Write stats snapshot to mooter-tester-stats.json
 *   - Push summary to decisions.log
 *
 * Safety:
 *   - Never touches classify.js without backup
 *   - Reverts if accuracy drops below 85% after any change
 *   - All data tagged with source: "mooter-tester" (distinguishable from real users)
 *   - Stops gracefully on SIGINT/SIGTERM
 *
 * Usage:
 *   node mooter-continuous-tester.js                   # start daemon
 *   node mooter-continuous-tester.js --dry-run         # no writes, just log
 *   node mooter-continuous-tester.js --cycle-interval 30  # seconds between cycles
 *   node mooter-continuous-tester.js --batch-size 50   # prompts per cycle
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, execSync } = require('child_process');
const crypto = require('crypto');

// ── Paths ────────────────────────────────────────────────────────────
const SCRIPT_DIR = __dirname;
const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const STATS_PATH = path.join(ROUTER_DIR, 'mooter-tester-stats.json');
const HISTORY_PATH = path.join(ROUTER_DIR, 'mooter-tester-history.jsonl');
const CLASSIFY_PATH = path.join(ROUTER_DIR, 'classify.js');
const CLASSIFY_BAK = path.join(ROUTER_DIR, 'classify.js.bak');
const TUNING_PATH = path.join(ROUTER_DIR, 'router-tuning.json');
const VALIDATION_SET = path.join(SCRIPT_DIR, 'validation-set.json');
const GOLD_LABELS = path.join(SCRIPT_DIR, 'gold-labels.json');

// ── Config ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argi = (k) => args.indexOf(k);
const DRY_RUN = args.includes('--dry-run');
const CYCLE_INTERVAL_S = argi('--cycle-interval') >= 0
  ? parseInt(args[argi('--cycle-interval') + 1], 10) : 60;
const BATCH_SIZE = argi('--batch-size') >= 0
  ? parseInt(args[argi('--batch-size') + 1], 10) : 30;
const ACCURACY_FLOOR = 0.85;
const JUDGE_MODEL = 'qwen3:30b';
const GEN_MODEL = 'qwen3:30b';
const TESTER_USER = 'mooter-tester';
const TESTER_EMAIL = 'mooter-tester@mooter.ai';
const ADMIN_EMAIL = 'paulo.loureiro.shp@gmail.com';

// ── State ────────────────────────────────────────────────────────────
let running = true;
let cycleCount = 0;
let totalPromptsGenerated = 0;
let totalMisroutingsFound = 0;
let totalFixesApplied = 0;
let totalFixesReverted = 0;
let lastHourlyRun = 0;
let sessionStart = Date.now();

// Graceful shutdown
process.on('SIGINT', () => { running = false; log('SIGINT received, finishing current cycle...'); });
process.on('SIGTERM', () => { running = false; log('SIGTERM received, finishing current cycle...'); });

// ── Helpers ──────────────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

function logEvent(event) {
  const entry = {
    ...event,
    source: TESTER_USER,
    ts: new Date().toISOString(),
    ts_ms: Date.now(),
  };
  if (!DRY_RUN) {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
    fs.appendFileSync(HISTORY_PATH, JSON.stringify(entry) + '\n');
  }
}

function callOllama(prompt, model = GEN_MODEL, maxTokens = 2048) {
  try {
    const r = spawnSync('ollama', ['run', model, '--nowordwrap'], {
      input: `/no_think\n${prompt}`,
      encoding: 'utf8',
      timeout: 90000,
      env: { ...process.env, OLLAMA_NUM_PREDICT: String(maxTokens) },
    });
    if (r.status !== 0) return null;
    let out = (r.stdout || '').trim();
    out = out.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return out;
  } catch {
    return null;
  }
}

function classify(prompt) {
  try {
    const classifySrc = fs.readFileSync(CLASSIFY_PATH, 'utf8');
    const iifeIdx = classifySrc.search(/\(async \(\) => \{/);
    if (iifeIdx < 0) return null;
    const classifyBody = classifySrc.slice(0, iifeIdx).replace(/^#!.*\n/, '');
    const classifyFn = new Function('require', `${classifyBody}\nreturn classify;`)(require);
    return classifyFn(prompt);
  } catch (e) {
    log(`classify error: ${e.message}`);
    return null;
  }
}

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

// ── Prompt Generation ────────────────────────────────────────────────
function generatePromptBatch(size) {
  const realistic = Math.floor(size * 0.4);
  const adversarial = Math.floor(size * 0.3);
  const template = size - realistic - adversarial;

  const prompts = [];

  // Realistic via Ollama
  const realisticRaw = callOllama(
    `Generate exactly ${realistic} realistic prompts a developer types in a CLI coding assistant.
Mix: trivial (rename, color), medium (debug, investigate), critical (deploy, migrate, security).
Mix EN + PT-PT. Mix lengths: 5-50 words. Include code snippets, error msgs, git commands.
One per line, no numbering, no quotes.`, GEN_MODEL, 3000
  );
  if (realisticRaw) {
    realisticRaw.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 5 && l.length < 500)
      .slice(0, realistic)
      .forEach(p => prompts.push({ prompt: p, source: 'realistic' }));
  }

  // Adversarial via Ollama
  const adversarialRaw = callOllama(
    `Generate exactly ${adversarial} tricky prompts to confuse an LLM routing classifier.
The classifier decides: T0 (trivial/free), T1 (simple), T2 (reasoning), T3 (critical/Opus).
Generate AMBIGUOUS prompts: sounds trivial but critical, or vice-versa. Mix signals.
Include: informal language for serious tasks, code mixed with questions, multilingual.
One per line, no numbering.`, GEN_MODEL, 3000
  );
  if (adversarialRaw) {
    adversarialRaw.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 5 && l.length < 500)
      .slice(0, adversarial)
      .forEach(p => prompts.push({ prompt: p, source: 'adversarial' }));
  }

  // Template (no Ollama, instant)
  const templates = {
    T0: ['change the {css} to {val}', 'rename {v1} to {v2}', 'show me {file}', 'what does {func} do'],
    T1: ['generate commit message for this diff', 'write a regex for {pattern}', 'explain {concept}'],
    T2: ['why does {comp} fail when {cond}', 'debug: {error} in {file}', 'investigate {issue} in {mod}'],
    T3: ['deploy {fix} to {env}', 'migrate {table} to support {feat}', 'review before pushing to {branch}',
         'refactor {system} architecture', 'fix the {vuln} in {comp}'],
  };
  const fills = {
    css: ['color', 'margin', 'padding', 'font-size', 'border'],
    val: ['#333', 'red', '16px', '0', 'none'],
    v1: ['getUserById', 'handleSubmit', 'parseData'],
    v2: ['fetchUser', 'onSubmit', 'transformData'],
    file: ['src/auth.ts', 'api/orders.js', 'lib/cache.ts'],
    func: ['handleClick', 'processOrder', 'validateInput'],
    pattern: ['email addresses', 'URLs', 'phone numbers', 'dates'],
    concept: ['closures', 'event loop', 'promises', 'recursion'],
    comp: ['useEffect', 'WebSocket', 'auth middleware', 'cache'],
    cond: ['under load', 'after timeout', 'concurrent users'],
    error: ['TypeError', 'ECONNREFUSED', '403 Forbidden', 'OOM'],
    issue: ['memory spike', 'slow query', 'race condition'],
    mod: ['auth', 'payments', 'search', 'dashboard'],
    fix: ['hotfix', 'security patch', 'rollback'],
    env: ['production', 'staging', 'main branch'],
    table: ['users', 'orders', 'sessions'],
    feat: ['multi-tenancy', 'soft delete', 'versioning'],
    branch: ['main', 'production', 'release/v2'],
    system: ['auth layer', 'data pipeline', 'payment flow'],
    vuln: ['XSS', 'SQL injection', 'CSRF', 'auth bypass'],
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const fill = (tpl) => tpl.replace(/\{(\w+)\}/g, (_, k) => fills[k] ? pick(fills[k]) : k);

  for (let i = 0; i < template; i++) {
    const tierKey = pick(Object.keys(templates));
    const tpl = pick(templates[tierKey]);
    prompts.push({ prompt: fill(tpl), source: 'template', expected_tier: tierKey });
  }

  return prompts;
}

// ── LLM Judge (local) ────────────────────────────────────────────────
function judgeClassification(prompt, classifiedTier, category) {
  const judgePrompt = `You are a routing quality judge. A developer prompt was classified for routing to different AI models.

Prompt: "${prompt.slice(0, 300)}"
Classified as: ${classifiedTier} (${category})

Tiers:
- T0: trivial (rename, color change, read file, translate, summarize)
- T1: simple transforms (commit msg, regex, docstring, format conversion)
- T2: reasoning (debug, investigate, compare approaches, root cause)
- T3: critical (architecture, deploy, migrate, security, multi-file refactor, .env/secrets)

Is the classification CORRECT, OVER-ROUTED (should be lower tier), or UNDER-ROUTED (should be higher tier)?
Respond with EXACTLY one JSON object: {"verdict": "correct|over|under", "suggested_tier": "T0|T1|T2|T3", "reason": "brief reason"}`;

  const raw = callOllama(judgePrompt, JUDGE_MODEL, 512);
  if (!raw) return null;
  try {
    const match = raw.match(/\{[^}]+\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ── Validation Suite ─────────────────────────────────────────────────
function runValidation() {
  const results = { gold_labels: null, validation_set: null, stress_test: null };

  // Gold labels
  try {
    const r = spawnSync('node', [path.join(SCRIPT_DIR, 'replay.js'), '--gold-labels'], {
      encoding: 'utf8', timeout: 30000, cwd: SCRIPT_DIR,
    });
    const match = (r.stdout || '').match(/accuracy[:\s]+(\d+\.?\d*)%/i);
    results.gold_labels = match ? parseFloat(match[1]) / 100 : null;
  } catch { /* skip */ }

  // Validation set
  try {
    const r = spawnSync('node', [path.join(SCRIPT_DIR, 'validate-set.js'), '--json', '-'], {
      encoding: 'utf8', timeout: 30000, cwd: SCRIPT_DIR,
    });
    try {
      const j = JSON.parse(r.stdout);
      results.validation_set = j.overall_accuracy || j.accuracy || null;
    } catch { /* skip */ }
  } catch { /* skip */ }

  // Stress test
  try {
    const r = spawnSync('node', [path.join(SCRIPT_DIR, 'stress-test.js'), '--json'], {
      encoding: 'utf8', timeout: 30000, cwd: SCRIPT_DIR,
    });
    try {
      const j = JSON.parse(r.stdout);
      results.stress_test = j.adjusted_accuracy || j.accuracy || null;
    } catch { /* skip */ }
  } catch { /* skip */ }

  return results;
}

// ── A/B Test Engine ──────────────────────────────────────────────────
function runABTest(misroutings) {
  if (misroutings.length < 3) return null;

  // Group misroutings by pattern
  const patterns = {};
  for (const m of misroutings) {
    const key = `${m.classified_tier}->${m.suggested_tier}:${m.category}`;
    if (!patterns[key]) patterns[key] = [];
    patterns[key].push(m);
  }

  const abResults = [];
  for (const [pattern, items] of Object.entries(patterns)) {
    if (items.length < 2) continue;
    abResults.push({
      pattern,
      count: items.length,
      direction: items[0].verdict,
      sample_prompts: items.slice(0, 3).map(i => i.prompt.slice(0, 100)),
      confidence: items.length / misroutings.length,
    });
  }

  return abResults.length > 0 ? abResults : null;
}

// ── Fix Application (with safety) ────────────────────────────────────
function attemptFix(abResults) {
  if (!abResults || abResults.length === 0) return false;
  if (DRY_RUN) {
    log('DRY RUN: would attempt fix based on A/B results');
    return false;
  }

  // Take baseline accuracy BEFORE any change
  const baseline = runValidation();
  const baselineAccuracy = baseline.gold_labels || baseline.stress_test || 0;

  if (baselineAccuracy < ACCURACY_FLOOR) {
    log(`Baseline accuracy ${(baselineAccuracy * 100).toFixed(1)}% already below floor, skipping fix`);
    return false;
  }

  // Run backtest to generate tuning suggestions
  try {
    spawnSync('node', [path.join(SCRIPT_DIR, 'backtest.js')], {
      encoding: 'utf8', timeout: 60000, cwd: SCRIPT_DIR,
    });
  } catch { /* continue */ }

  // Check if tuning file has suggestions
  if (!fs.existsSync(TUNING_PATH)) return false;

  try {
    const tuning = JSON.parse(fs.readFileSync(TUNING_PATH, 'utf8'));
    const hasChanges = (tuning.promote_to_t0_patterns || []).length > 0
      || (tuning.demote_from_t3_patterns || []).length > 0
      || tuning.complexity_threshold != null;
    if (!hasChanges) return false;
  } catch { return false; }

  // Backup classify.js
  fs.copyFileSync(CLASSIFY_PATH, CLASSIFY_BAK);
  log('classify.js backed up');

  // Apply update-router.js
  try {
    const r = spawnSync('node', [path.join(SCRIPT_DIR, 'update-router.js')], {
      encoding: 'utf8', timeout: 30000, cwd: SCRIPT_DIR,
    });
    log(`update-router.js: ${r.stdout.slice(0, 200)}`);
  } catch (e) {
    log(`update-router.js failed: ${e.message}`);
    fs.copyFileSync(CLASSIFY_BAK, CLASSIFY_PATH);
    return false;
  }

  // Verify accuracy AFTER change
  const after = runValidation();
  const afterAccuracy = after.gold_labels || after.stress_test || 0;

  if (afterAccuracy < ACCURACY_FLOOR || afterAccuracy < baselineAccuracy - 0.02) {
    // Revert!
    log(`REVERT: accuracy dropped ${(baselineAccuracy * 100).toFixed(1)}% → ${(afterAccuracy * 100).toFixed(1)}%`);
    fs.copyFileSync(CLASSIFY_BAK, CLASSIFY_PATH);
    totalFixesReverted++;
    logEvent({
      event: 'tester_fix_reverted',
      baseline_accuracy: baselineAccuracy,
      after_accuracy: afterAccuracy,
      reason: 'accuracy_regression',
    });
    return false;
  }

  log(`FIX APPLIED: accuracy ${(baselineAccuracy * 100).toFixed(1)}% → ${(afterAccuracy * 100).toFixed(1)}%`);
  totalFixesApplied++;
  logEvent({
    event: 'tester_fix_applied',
    baseline_accuracy: baselineAccuracy,
    after_accuracy: afterAccuracy,
    ab_results: abResults.slice(0, 5),
  });
  return true;
}

// ── Stats Snapshot ───────────────────────────────────────────────────
function writeStats(validation) {
  const uptime = Math.floor((Date.now() - sessionStart) / 1000);
  const stats = {
    user: TESTER_USER,
    email: TESTER_EMAIL,
    role: 'synthetic_tester',
    updated_at: new Date().toISOString(),
    session_start: new Date(sessionStart).toISOString(),
    uptime_seconds: uptime,
    uptime_human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    cycles_completed: cycleCount,
    total_prompts_generated: totalPromptsGenerated,
    total_misroutings_found: totalMisroutingsFound,
    total_fixes_applied: totalFixesApplied,
    total_fixes_reverted: totalFixesReverted,
    fix_success_rate: totalFixesApplied + totalFixesReverted > 0
      ? totalFixesApplied / (totalFixesApplied + totalFixesReverted) : null,
    prompts_per_hour: uptime > 0 ? Math.round(totalPromptsGenerated / (uptime / 3600)) : 0,
    last_validation: validation,
    accuracy_floor: ACCURACY_FLOOR,
    models_used: { generator: GEN_MODEL, judge: JUDGE_MODEL },
    cost_usd: 0, // always zero — local only
  };

  if (!DRY_RUN) {
    fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
  }
  return stats;
}

// ── Hourly Full Analysis ─────────────────────────────────────────────
function hourlyAnalysis() {
  log('=== HOURLY ANALYSIS START ===');

  // 1. Full validation
  const validation = runValidation();
  log(`Validation: gold=${validation.gold_labels ? (validation.gold_labels * 100).toFixed(1) + '%' : 'n/a'} ` +
      `stress=${validation.stress_test ? (validation.stress_test * 100).toFixed(1) + '%' : 'n/a'}`);

  // 2. Backtest
  try {
    spawnSync('node', [path.join(SCRIPT_DIR, 'backtest.js')], {
      encoding: 'utf8', timeout: 60000, cwd: SCRIPT_DIR,
    });
    log('Backtest completed');
  } catch { log('Backtest failed'); }

  // 3. Signals
  try {
    spawnSync('node', [path.join(SCRIPT_DIR, 'signals.js'), '--all'], {
      encoding: 'utf8', timeout: 30000, cwd: SCRIPT_DIR,
    });
    log('Signals scan completed');
  } catch { log('Signals scan failed'); }

  // 4. Ground truth
  try {
    spawnSync('node', [path.join(SCRIPT_DIR, 'ground-truth.js'), '--all'], {
      encoding: 'utf8', timeout: 30000, cwd: SCRIPT_DIR,
    });
    log('Ground truth scan completed');
  } catch { log('Ground truth scan failed'); }

  // 5. Stats snapshot
  const stats = writeStats(validation);
  log(`Stats written: ${stats.total_prompts_generated} prompts, ${stats.total_misroutings_found} misroutings, ${stats.total_fixes_applied} fixes`);

  // 6. Log hourly summary event
  logEvent({
    event: 'tester_hourly_summary',
    cycle: cycleCount,
    prompts_total: totalPromptsGenerated,
    misroutings_total: totalMisroutingsFound,
    fixes_applied: totalFixesApplied,
    fixes_reverted: totalFixesReverted,
    validation,
    uptime_h: Math.floor((Date.now() - sessionStart) / 3600000),
  });

  log('=== HOURLY ANALYSIS END ===');
  return validation;
}

// ── Main Cycle ───────────────────────────────────────────────────────
function runCycle() {
  cycleCount++;
  const cycleStart = Date.now();
  log(`── Cycle #${cycleCount} (batch=${BATCH_SIZE}) ──`);

  // 1. Generate prompts
  const batch = generatePromptBatch(BATCH_SIZE);
  totalPromptsGenerated += batch.length;
  log(`Generated ${batch.length} prompts (${batch.filter(p => p.source === 'realistic').length} realistic, ${batch.filter(p => p.source === 'adversarial').length} adversarial, ${batch.filter(p => p.source === 'template').length} template)`);

  // 2. Classify each
  const classified = [];
  for (const item of batch) {
    const result = classify(item.prompt);
    if (result) {
      classified.push({ ...item, ...result });
    }
  }
  log(`Classified ${classified.length}/${batch.length}`);

  // 3. Judge a sample (judge all template ones with known expected, sample 30% of others)
  const misroutings = [];
  let judged = 0;

  for (const item of classified) {
    // Template items: compare against expected tier
    if (item.expected_tier && item.tier !== item.expected_tier) {
      // Check if it's an acceptable mismatch (T1↔T0 is often fine)
      const tierDist = Math.abs(['T0', 'T1', 'T2', 'T3'].indexOf(item.tier) -
                                 ['T0', 'T1', 'T2', 'T3'].indexOf(item.expected_tier));
      if (tierDist > 1 || (['T2', 'T3'].includes(item.expected_tier) && item.tier === 'T0')) {
        misroutings.push({
          prompt: item.prompt,
          classified_tier: item.tier,
          suggested_tier: item.expected_tier,
          category: item.task_category,
          verdict: item.tier < item.expected_tier ? 'under' : 'over',
          source: 'template_mismatch',
        });
      }
    }

    // LLM judge for non-template (30% sample to save GPU)
    if (!item.expected_tier && Math.random() < 0.3) {
      const judgment = judgeClassification(item.prompt, item.tier, item.task_category);
      judged++;
      if (judgment && judgment.verdict !== 'correct') {
        misroutings.push({
          prompt: item.prompt,
          classified_tier: item.tier,
          suggested_tier: judgment.suggested_tier,
          category: item.task_category,
          verdict: judgment.verdict,
          reason: judgment.reason,
          source: 'llm_judge',
        });
      }
    }
  }

  totalMisroutingsFound += misroutings.length;
  log(`Judged ${judged} via LLM, ${classified.filter(c => c.expected_tier).length} via template. Misroutings: ${misroutings.length}`);

  // 4. Log each classified prompt
  for (const item of classified) {
    logEvent({
      event: 'tester_classification',
      prompt_preview: item.prompt.slice(0, 200),
      prompt_len: item.prompt.length,
      decided_tier: item.tier,
      confidence: item.confidence,
      task_category: item.task_category,
      expected_tier: item.expected_tier || null,
      prompt_source: item.source,
    });
  }

  // 5. Log misroutings
  for (const m of misroutings) {
    logEvent({
      event: 'tester_misrouting',
      prompt_preview: m.prompt.slice(0, 200),
      classified_tier: m.classified_tier,
      suggested_tier: m.suggested_tier,
      category: m.category,
      verdict: m.verdict,
      reason: m.reason || null,
      detection_source: m.source,
    });
  }

  // 6. A/B test + fix attempt (only every 5 cycles to accumulate data)
  if (cycleCount % 5 === 0 && misroutings.length > 0) {
    const abResults = runABTest(misroutings);
    if (abResults) {
      log(`A/B patterns found: ${abResults.length}`);
      attemptFix(abResults);
    }
  }

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  log(`Cycle #${cycleCount} done in ${elapsed}s. Total: ${totalPromptsGenerated} prompts, ${totalMisroutingsFound} misroutings\n`);

  // Hourly check
  const now = Date.now();
  if (now - lastHourlyRun >= 3600000) {
    lastHourlyRun = now;
    hourlyAnalysis();
  }
}

// ── Banner ───────────────────────────────────────────────────────────
function printBanner() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           🐮 MOOTER CONTINUOUS TESTER — v1.0                ║
║                                                              ║
║   24/7 autonomous classifier improvement agent               ║
║   100% local · zero token cost · GPU-accelerated             ║
║                                                              ║
║   User: ${TESTER_USER.padEnd(20)}                            ║
║   Models: gen=${GEN_MODEL} judge=${JUDGE_MODEL.padEnd(10)}   ║
║   Batch: ${String(BATCH_SIZE).padEnd(4)} prompts/cycle                           ║
║   Interval: ${String(CYCLE_INTERVAL_S).padEnd(4)}s between cycles                       ║
║   Dry run: ${DRY_RUN ? 'YES' : 'NO '}                                            ║
║   Accuracy floor: ${(ACCURACY_FLOOR * 100).toFixed(0)}%                                  ║
║                                                              ║
║   Press Ctrl+C to stop gracefully                            ║
╚══════════════════════════════════════════════════════════════╝
`);
}

// ── Main Loop ────────────────────────────────────────────────────────
async function main() {
  printBanner();

  // Check Ollama is running
  try {
    execSync('ollama list', { encoding: 'utf8', timeout: 5000 });
    log('Ollama is running ✓');
  } catch {
    log('ERROR: Ollama is not running. Start it with: ollama serve');
    process.exit(1);
  }

  // Check models are available
  try {
    const models = execSync('ollama list', { encoding: 'utf8', timeout: 5000 });
    if (!models.includes('qwen3')) {
      log('WARNING: qwen3:30b not found. Pull it: ollama pull qwen3:30b');
    }
    log(`Models available: ${models.split('\n').filter(l => l.trim()).length - 1}`);
  } catch { /* continue */ }

  // Initial validation
  log('Running initial validation...');
  const initial = runValidation();
  log(`Initial accuracy: gold=${initial.gold_labels ? (initial.gold_labels * 100).toFixed(1) + '%' : 'n/a'} ` +
      `stress=${initial.stress_test ? (initial.stress_test * 100).toFixed(1) + '%' : 'n/a'}`);
  lastHourlyRun = Date.now();

  // Main loop
  while (running) {
    try {
      runCycle();
    } catch (e) {
      log(`ERROR in cycle: ${e.message}`);
    }

    // Wait for next cycle (but check running flag every second)
    for (let i = 0; i < CYCLE_INTERVAL_S && running; i++) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Final stats
  log('Shutting down...');
  const finalValidation = runValidation();
  const finalStats = writeStats(finalValidation);
  log(`Final stats: ${finalStats.total_prompts_generated} prompts, ${finalStats.total_misroutings_found} misroutings, ${finalStats.total_fixes_applied} fixes`);
  log(`Uptime: ${finalStats.uptime_human}`);
  log('Goodbye.');
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
