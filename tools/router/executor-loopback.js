#!/usr/bin/env node
// @ts-check
/**
 * executor-loopback.js — synthetic load generator that feeds the Wave-2
 * executor with seeded prompts on a configurable interval. Closes the
 * Wave-3 audit loop: real `outcome=ok` rows accumulate continuously in
 * decisions.log, /metrics.executions populates with statistically
 * meaningful counts, and the calibration sampling in gsd-statusline.js
 * gathers ratio data over time.
 *
 * What it does NOT do:
 *   - It is NOT mooter-continuous-tester.js (which runs A/B model
 *     benchmarks against Ollama directly, bypassing the executor).
 *     That tester serves a different purpose; this loopback is a
 *     load generator for the EXECUTOR specifically.
 *   - It does NOT touch tier mix or override classification.
 *     classify.js is invoked normally per prompt; the executor
 *     dispatches according to its doctrine guards.
 *
 * Sources of seeds:
 *   1. tools/router/mooter-tester-focus.json — adversarial buckets
 *      (rename_seeds, format_seeds, arch_t2_keep_seeds, etc).
 *   2. Hand-curated benign prompts (commit messages, simple
 *      explanations, summarisations) for the always-on baseline.
 *
 * Usage:
 *   node tools/router/executor-loopback.js                   # 1 cycle, default seeds
 *   node tools/router/executor-loopback.js --cycles 10       # N cycles
 *   node tools/router/executor-loopback.js --interval-sec 60 # delay between cycles
 *   node tools/router/executor-loopback.js --per-cycle 5     # prompts per cycle
 *   node tools/router/executor-loopback.js --forever         # run until SIGINT
 *
 * Each prompt is logged to decisions.log via the executor's own
 * telemetry (event=executed). No additional file output.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FOCUS_PATH = path.join(__dirname, 'mooter-tester-focus.json');
const EXECUTOR_CLI = path.join(__dirname, 'router-execute.js');
const CLASSIFY_CLI = path.join(__dirname, 'classify.js');

const PER_ATTEMPT_MS = 30_000;
const SPAWN_TIMEOUT_MS = 90_000;

// Hand-curated benign baseline (always-on prompts that exercise T0/T1
// without needing focus.json adversarials).
const BASELINE_PROMPTS = [
  'summarise in one short sentence: the cache is cold today',
  'what is HTTP in one short sentence',
  'name three popular databases',
  'what does REST stand for in one sentence',
  'list four programming paradigms',
  'what is recursion in one short sentence',
  'name three sorting algorithms',
  'what is git in two short sentences',
  'explain what a mutex is in one sentence',
  'one-line definition of dependency injection',
];

function parseArgs(argv) {
  const out = {
    cycles: 1,
    intervalSec: 60,
    perCycle: 3,
    forever: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--cycles' && next) { out.cycles = Number(next) || 1; i++; }
    else if (a === '--interval-sec' && next) { out.intervalSec = Number(next) || 60; i++; }
    else if (a === '--per-cycle' && next) { out.perCycle = Number(next) || 3; i++; }
    else if (a === '--forever') { out.forever = true; }
    else if (a === '--quiet' || a === '-q') { out.quiet = true; }
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'Usage: node executor-loopback.js [--cycles N] [--interval-sec S] [--per-cycle K] [--forever] [--quiet]\n'
      );
      process.exit(0);
    }
  }
  return out;
}

function loadSeeds() {
  const seeds = BASELINE_PROMPTS.slice();
  try {
    const focus = JSON.parse(fs.readFileSync(FOCUS_PATH, 'utf8'));
    const adv = focus._wave_1_6_adversarials || {};
    for (const k of Object.keys(adv)) {
      const v = adv[k];
      if (Array.isArray(v)) for (const s of v) if (typeof s === 'string') seeds.push(s);
    }
  } catch { /* focus.json missing — baseline only */ }
  return seeds;
}

function pickK(arr, k) {
  // Fisher-Yates partial shuffle
  const a = arr.slice();
  const n = Math.min(k, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function classify(prompt) {
  const r = spawnSync(process.execPath, [CLASSIFY_CLI, prompt], {
    encoding: 'utf8', timeout: 10_000,
  });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function runExecutor(prompt, classification) {
  const env = Object.assign({}, process.env, {
    MOOTER_CLASSIFICATION_JSON: JSON.stringify(classification),
    MOOTER_PER_ATTEMPT_TIMEOUT_MS: String(PER_ATTEMPT_MS),
  });
  const r = spawnSync(process.execPath, [EXECUTOR_CLI, prompt], {
    encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, env,
  });
  if (r.status !== 0) return { ok: false, error: `cli_status_${r.status}` };
  try { return JSON.parse(r.stdout); } catch { return { ok: false, error: 'parse_error' }; }
}

function nowIso() { return new Date().toISOString().slice(11, 19); }

function runCycle(seeds, opts, cycleIdx) {
  const picks = pickK(seeds, opts.perCycle);
  const results = { ok: 0, deferred: 0, error: 0, total: picks.length };
  for (const prompt of picks) {
    const classification = classify(prompt);
    if (!classification) {
      results.error += 1;
      if (!opts.quiet) process.stdout.write(`  [${nowIso()}] CLASSIFY FAILED: ${prompt.slice(0, 50)}\n`);
      continue;
    }
    const result = runExecutor(prompt, classification);
    let outcome;
    if (result.ok && typeof result.text === 'string' && result.text.length > 0) {
      outcome = 'ok'; results.ok += 1;
    } else if (result.defer_to_subagent) {
      outcome = 'deferred'; results.deferred += 1;
    } else {
      outcome = 'error'; results.error += 1;
    }
    if (!opts.quiet) {
      const provOrSub = result.provider_used || (result.defer_to_subagent ? `defer:${result.defer_to_subagent}` : 'err');
      process.stdout.write(
        `  [${nowIso()}] cycle=${cycleIdx} ${classification.tier} ${outcome.padEnd(8)} ${provOrSub.padEnd(28)} ${prompt.slice(0, 50)}\n`
      );
    }
  }
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const seeds = loadSeeds();
  process.stdout.write(`executor-loopback: loaded ${seeds.length} seeds, mode=${opts.forever ? 'forever' : opts.cycles + ' cycles'}, perCycle=${opts.perCycle}, intervalSec=${opts.intervalSec}\n`);

  let cyclesRun = 0;
  const totals = { ok: 0, deferred: 0, error: 0, total: 0 };
  const startMs = Date.now();

  // SIGINT graceful exit (forever mode)
  let stopped = false;
  process.on('SIGINT', () => {
    stopped = true;
    process.stdout.write('\nexecutor-loopback: SIGINT received — stopping after current cycle\n');
  });

  while (!stopped) {
    if (!opts.forever && cyclesRun >= opts.cycles) break;
    cyclesRun++;
    const r = runCycle(seeds, opts, cyclesRun);
    totals.ok += r.ok;
    totals.deferred += r.deferred;
    totals.error += r.error;
    totals.total += r.total;
    if (!opts.forever && cyclesRun >= opts.cycles) break;
    if (stopped) break;
    if (opts.intervalSec > 0) {
      await new Promise((res) => setTimeout(res, opts.intervalSec * 1000));
    }
  }

  const wallSec = Math.round((Date.now() - startMs) / 1000);
  process.stdout.write(
    `\nexecutor-loopback: cycles=${cyclesRun} duration=${wallSec}s` +
    `  →  ok=${totals.ok} defer=${totals.deferred} error=${totals.error} total=${totals.total}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`executor-loopback fatal: ${err && err.stack || err}\n`);
  process.exit(2);
});
