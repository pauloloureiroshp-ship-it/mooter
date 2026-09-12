#!/usr/bin/env node
'use strict';
/**
 * run.js — the Live Edit CCA eval harness runner.
 *
 * For each golden task it runs k INDEPENDENT trials, each in a fresh isolated sandbox (a temp copy of
 * the fixture). One deterministic $0 engine op runs per trial; the harness performs the SINGLE write
 * (only when the engine returns ok) and then the grader stack reads the file BACK from disk. Outputs
 * pass@1 / pass^k per task + the cost/latency vector, split local vs cloud (cloud honestly empty in
 * Fase A). Blocked tasks (live webview / cloud agent) are reported as BLOCKED with a reason — never
 * silently skipped.
 *
 * Usage:
 *   node tools/eval/run.js [--suite all|capability|regression] [--k N] [--json out.json]
 */

const fs = require('fs');
const { load } = require('./lib/load-golden');
const sandbox = require('./lib/sandbox');
const metricsLib = require('./lib/metrics');
const passk = require('./lib/passk');
const adapter = require('./lib/engine-adapter');
const deterministic = require('./graders/deterministic-tests');
const { runGraders } = require('./graders/index');

const MUTATORS = new Set(['applyDeterministicEdit', 'deleteNode', 'spliceNodeRange', 'insertImports']);

function parseArgs(argv) {
  const a = { suite: 'all', k: 5, json: null, golden: null };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--suite') a.suite = argv[++i];
    else if (v === '--k') a.k = Math.max(1, parseInt(argv[++i], 10) || 5);
    else if (v === '--json') a.json = argv[++i];
    else if (v === '--golden') a.golden = argv[++i];
  }
  return a;
}

function runTrial(task) {
  const sb = sandbox.createSandbox(task);
  try {
    const before = sb.before;
    const { out, ms } = metricsLib.measure(() => adapter.runOp(task, before, sb.filePath));
    const { result, aux, toolCalls } = out;

    // The SINGLE write — mirrors the host applying an edit only on success. Refusals never write.
    if (result && result.ok === true && typeof result.code === 'string') {
      fs.writeFileSync(sb.filePath, result.code, 'utf8');
      const mut = toolCalls.find((t) => MUTATORS.has(t.primitive));
      if (mut) mut.wrote = true;
    }
    const after = sandbox.readFinal(sb.filePath);

    const ctx = {
      task, before, after, engineResult: result, aux, toolCalls,
      sandboxRoot: sb.root, sandboxFile: sb.filePath,
    };
    const graded = runGraders(ctx);
    const metric = metricsLib.edit({ latencyMs: ms, nToolcalls: toolCalls.length });
    return { pass: graded.pass, blocked: graded.blocked, results: graded.results, metric, engineReason: result && result.reason };
  } finally {
    sandbox.destroySandbox(sb);
  }
}

function runTask(task, k) {
  if (task.expect.outcome === 'blocked') {
    // One pass to capture the grader stack's BLOCKED verdicts (no engine op).
    const ctx = { task, before: '', after: '', engineResult: null, aux: {}, toolCalls: [], sandboxRoot: '', sandboxFile: '' };
    const graded = runGraders(ctx);
    return { id: task.id, suite: task.suite, outcome: 'blocked', blocked_reason: task.blocked && task.blocked.reason, results: graded.results };
  }
  const trials = [];
  for (let i = 0; i < k; i++) trials.push(runTrial(task));
  const summary = passk.summarize(trials.map((t) => t.pass));
  const metricAgg = metricsLib.aggregate(trials.map((t) => t.metric));
  // The grader detail from trial 0 is representative (deterministic).
  return {
    id: task.id, suite: task.suite, outcome: task.expect.outcome, probes: task.probes,
    ...summary, metrics: metricAgg, engineReason: trials[0].engineReason,
    graders: trials[0].results.map((r) => ({ name: r.name, status: r.status, detail: r.detail })),
  };
}

function main() {
  const args = parseArgs(process.argv);
  const all = load(args.golden);
  const tasks = args.suite === 'all' ? all : all.filter((t) => t.suite === args.suite);

  console.log('=== Live Edit CCA eval — baseline ===');
  console.log(`engine: ${adapter.ENGINE_PATH.replace(/\\/g, '/')}`);
  const parserOk = adapter.parserAvailable();
  console.log(`@babel/parser available: ${parserOk}`);
  if (!parserOk) {
    console.error('ABORT: parser unavailable — every task would score as a false refusal. Run `npm install` in packages/vscode-extension.');
    process.exit(2);
  }

  // Suite-level regression gate: the product's own engine unit suite must be green.
  const suite = deterministic.runEngineSuite();
  console.log(`engine unit suite (live-edit-ast.test.js): tests=${suite.tests} pass=${suite.pass} fail=${suite.fail} green=${suite.green}`);
  console.log(`k (trials/task): ${args.k} · suite filter: ${args.suite}\n`);

  const rows = tasks.map((t) => runTask(t, args.k));

  // ── Table ──────────────────────────────────────────────────────────────────────────────────────
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('id', 26) + pad('suite', 12) + pad('outcome', 9) + pad('pass@1', 8) + pad('pass^k', 8) + pad('lat_p50ms', 11) + 'probe');
  console.log('-'.repeat(120));
  for (const r of rows) {
    if (r.outcome === 'blocked') {
      console.log(pad(r.id, 26) + pad(r.suite, 12) + pad('BLOCKED', 9) + pad('-', 8) + pad('-', 8) + pad('-', 11) + (r.blocked_reason || ''));
    } else {
      console.log(
        pad(r.id, 26) + pad(r.suite, 12) + pad(r.outcome, 9) +
        pad(r.pass_at_1 ? 'PASS' : 'FAIL', 8) + pad(r.pass_hat_k ? 'PASS' : 'FAIL', 8) +
        pad(r.metrics.latency_ms_p50.toFixed(3), 11) + (r.probes || ''),
      );
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────────────────────────
  const scored = rows.filter((r) => r.outcome !== 'blocked');
  const blocked = rows.filter((r) => r.outcome === 'blocked');
  const p1 = scored.filter((r) => r.pass_at_1).length;
  const pk = scored.filter((r) => r.pass_hat_k).length;
  const bySuite = (name) => scored.filter((r) => r.suite === name);
  const suiteLine = (name) => {
    const s = bySuite(name);
    return `${name}: pass@1 ${s.filter((r) => r.pass_at_1).length}/${s.length} · pass^k ${s.filter((r) => r.pass_hat_k).length}/${s.length}`;
  };
  const totalLat = scored.reduce((a, r) => a + r.metrics.latency_ms_mean * r.metrics.n, 0);
  const totalTrials = scored.reduce((a, r) => a + r.metrics.n, 0);

  console.log('\n=== summary ===');
  console.log(`scored tasks: ${scored.length} · blocked: ${blocked.length}`);
  console.log(`overall pass@1: ${p1}/${scored.length} · pass^k: ${pk}/${scored.length}`);
  console.log(suiteLine('regression'));
  console.log(suiteLine('capability'));
  console.log(`local lane: tokens=0 cost=$0.00 · mean latency/trial ${(totalTrials ? totalLat / totalTrials : 0).toFixed(3)}ms (${totalTrials} trials)`);
  console.log(`cloud lane: NOT executed in Fase A (no cloud judge/agent wired — by design)`);
  for (const b of blocked) console.log(`BLOCKED · ${b.id}: ${b.blocked_reason}`);

  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({
      engine: adapter.ENGINE_PATH, parserOk, engineSuite: suite, k: args.k, suite: args.suite,
      rows, summary: { scored: scored.length, blocked: blocked.length, pass_at_1: p1, pass_hat_k: pk },
    }, null, 2));
    console.log(`\nJSON written: ${args.json}`);
  }

  // Exit non-zero if any REGRESSION task failed pass^k — this is the per-commit gate contract.
  const regressionBroken = bySuite('regression').some((r) => !r.pass_hat_k);
  process.exit(regressionBroken ? 1 : 0);
}

main();
