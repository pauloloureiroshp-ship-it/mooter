#!/usr/bin/env node
// @ts-check
/**
 * run-executor-validation.js — Wave-3 closure cycle for acceptance §10 #5.
 *
 * Replaces the legacy `run-provider-invocation.js` (which invoked
 * provider wrappers DIRECTLY, bypassing the executor) with a runner
 * that drives every prompt THROUGH `tools/router/router-execute.js`.
 *
 * What we measure:
 *   - For each non-T3 prompt in validation-corpus.jsonl, classify via
 *     classify.js then invoke the executor CLI (which now auto-loads
 *     real provider wrappers per Wave-3 commit 2e1b6b4).
 *   - Tally outcome ∈ {ok, deferred, error} and the executor
 *     `provider_used` chosen per prompt.
 *   - Compute the §10 #5 ratio: outcome=ok / non-T3 prompts.
 *
 * Hard caps (defensive):
 *   - 60-prompt corpus limit (Mooter validation-corpus.jsonl is 60)
 *   - 10 min wall clock total
 *   - 30 s per executor invocation (MOOTER_PER_ATTEMPT_TIMEOUT_MS)
 *   - T3 prompts SKIPPED (executor always defers; no outcome=ok possible)
 *
 * Output:
 *   - executor-executions.jsonl  (one line per prompt: prompt_id, tier, outcome, ...)
 *   - executor-validation-report.json  (summary + ratio)
 *   - stdout  (human-readable summary)
 *
 * No new providers wired. No external quota burned beyond what the
 * executor already routes to (Ollama for T0, Codex for T1 if available).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CORPUS = path.join(__dirname, 'validation-corpus.jsonl');
const OUT_JSONL = path.join(__dirname, 'executor-executions.jsonl');
const OUT_REPORT = path.join(__dirname, 'executor-validation-report.json');
const EXECUTOR_CLI = path.join(__dirname, '..', '..', 'tools', 'router', 'router-execute.js');

const PER_ATTEMPT_MS = 30_000;
const SPAWN_TIMEOUT_MS = 90_000;
const WALL_CLOCK_BUDGET_MS = 10 * 60 * 1000;

const t0 = Date.now();

function classifyPrompt(prompt) {
  const r = spawnSync(process.execPath, [
    path.join(__dirname, '..', '..', 'tools', 'router', 'classify.js'),
    prompt,
  ], { encoding: 'utf8', timeout: 10_000 });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function runExecutor(prompt, classification) {
  const env = Object.assign({}, process.env, {
    MOOTER_CLASSIFICATION_JSON: JSON.stringify(classification),
    MOOTER_PER_ATTEMPT_TIMEOUT_MS: String(PER_ATTEMPT_MS),
  });
  const r = spawnSync(process.execPath, [EXECUTOR_CLI, prompt], {
    encoding: 'utf8',
    timeout: SPAWN_TIMEOUT_MS,
    env,
  });
  if (r.status !== 0) {
    return { ok: false, error: `cli_status_${r.status}`, stderr: (r.stderr || '').slice(0, 200) };
  }
  try { return JSON.parse(r.stdout); } catch (e) {
    return { ok: false, error: 'parse_error', stderr: String(e).slice(0, 200) };
  }
}

function loadCorpus() {
  const raw = fs.readFileSync(CORPUS, 'utf8');
  return raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function main() {
  const corpus = loadCorpus();
  console.log(`Loaded ${corpus.length} prompts from corpus.`);

  const fdJsonl = fs.openSync(OUT_JSONL, 'w');
  const tally = {
    total: corpus.length,
    skipped_t3: 0,
    invoked: 0,
    ok: 0,
    deferred: 0,
    error: 0,
    by_provider: /** @type {Record<string, number>} */ ({}),
    by_subagent: /** @type {Record<string, number>} */ ({}),
  };

  let i = 0;
  for (const entry of corpus) {
    i++;
    if (Date.now() - t0 > WALL_CLOCK_BUDGET_MS) {
      console.log(`  [${i}/${corpus.length}] WALL CLOCK BUDGET EXCEEDED — stopping`);
      break;
    }

    const prompt = entry.prompt;
    const expectedTier = entry.expected_tier;

    // Classify first (so we know what tier the classifier picks RIGHT NOW)
    const classification = classifyPrompt(prompt);
    const tier = (classification && classification.tier) || expectedTier || 'T2';

    // Skip T3 — executor always defers, no outcome=ok possible.
    if (tier === 'T3') {
      tally.skipped_t3++;
      fs.writeSync(fdJsonl, JSON.stringify({
        id: entry.id, prompt_preview: prompt.slice(0, 60),
        expected_tier: expectedTier, classified_tier: tier,
        skipped: true, reason: 't3_skip',
      }) + '\n');
      console.log(`  [${i}/${corpus.length}] ${entry.id} T3 → skipped`);
      continue;
    }

    if (!classification) {
      tally.error++;
      fs.writeSync(fdJsonl, JSON.stringify({
        id: entry.id, prompt_preview: prompt.slice(0, 60),
        expected_tier: expectedTier, classified_tier: null,
        error: 'classify_failed',
      }) + '\n');
      console.log(`  [${i}/${corpus.length}] ${entry.id} CLASSIFY FAILED`);
      continue;
    }

    const result = runExecutor(prompt, classification);
    tally.invoked++;

    let outcome;
    if (result.ok === true && typeof result.text === 'string' && result.text.length > 0) {
      outcome = 'ok';
      tally.ok++;
      const prov = result.provider_used || 'unknown';
      tally.by_provider[prov] = (tally.by_provider[prov] || 0) + 1;
    } else if (result.defer_to_subagent) {
      outcome = 'deferred';
      tally.deferred++;
      const sub = result.defer_to_subagent;
      tally.by_subagent[sub] = (tally.by_subagent[sub] || 0) + 1;
    } else {
      outcome = 'error';
      tally.error++;
    }

    fs.writeSync(fdJsonl, JSON.stringify({
      id: entry.id,
      prompt_preview: prompt.slice(0, 60),
      expected_tier: expectedTier,
      classified_tier: tier,
      classified_confidence: classification.confidence,
      classified_category: classification.task_category,
      outcome,
      provider_used: result.provider_used || null,
      defer_to_subagent: result.defer_to_subagent || null,
      defer_reason: result.reason || null,
      duration_ms: result.duration_ms || 0,
      tokens_out: result.tokens_out || 0,
      cost_usd: result.cost_usd || 0,
    }) + '\n');

    const provOrSub = result.provider_used || (result.defer_to_subagent ? `defer:${result.defer_to_subagent}` : 'err');
    console.log(`  [${i}/${corpus.length}] ${entry.id} ${tier} → ${outcome.padEnd(8)} ${provOrSub}`);
  }

  fs.closeSync(fdJsonl);

  // Compute the §10 #5 ratio
  const denom = tally.invoked; // non-T3 prompts that got an executor call
  const okRatio = denom > 0 ? tally.ok / denom : 0;
  const acceptanceTarget = 0.55;

  const report = {
    ts: new Date().toISOString(),
    wall_clock_ms: Date.now() - t0,
    corpus_size: corpus.length,
    tally,
    ok_ratio: Math.round(okRatio * 10000) / 10000,
    acceptance_target: acceptanceTarget,
    acceptance_pass: okRatio >= acceptanceTarget,
    spec_reference: 'wave-2 SPEC.md §10 #5',
    note: 'T3 prompts are excluded from the denominator — executor always defers them by doctrine; no outcome=ok possible.',
  };

  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));

  console.log('\n--- Validation summary ---');
  console.log(`Corpus:          ${tally.total}`);
  console.log(`Skipped (T3):    ${tally.skipped_t3}`);
  console.log(`Invoked:         ${tally.invoked}`);
  console.log(`  outcome=ok:    ${tally.ok}`);
  console.log(`  outcome=defer: ${tally.deferred}`);
  console.log(`  outcome=error: ${tally.error}`);
  console.log(`OK ratio:        ${(okRatio * 100).toFixed(1)}%  (target ≥ ${(acceptanceTarget * 100).toFixed(0)}%)`);
  console.log(`Acceptance:      ${report.acceptance_pass ? 'PASS' : 'FAIL'}`);
  console.log(`\nReport: ${OUT_REPORT}`);
  console.log(`JSONL:  ${OUT_JSONL}`);
}

main();
