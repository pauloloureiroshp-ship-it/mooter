#!/usr/bin/env node
'use strict';

// audit_pipeline.js — Wave 23 orchestrator / status.
//
// The audit is a hybrid: the deterministic, high-volume work (corpus via local Ollama,
// validation via Haiku) runs as standalone node loops; the two steps where real model
// reasoning earns its keep (Phase 3 insights = one Sonnet pass; Phase 4 = Opus synthesis)
// are driven by the Claude Code orchestrator spawning a subagent and feeding the reply
// back through these workers. This module is the single place that (a) documents the run
// order and (b) reports how far the pipeline has progressed by reading the artifacts on
// disk — so a resumed session can see state at a glance.
//
// CLI:
//   node audit_pipeline.js status   → JSON: which phases are done + counts
//   node audit_pipeline.js plan      → the human-readable run order

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, CORPUS_PATH, STATS_PATH } = require('./audit_corpus_builder.js');
const { VALIDATION_PATH, VALIDATION_STATS_PATH } = require('./audit_validator.js');
const { REPORT_PATH, INSIGHTS_INPUT_PATH } = require('./audit_insights.js');
const { COST_PATH, LORA_PATH, QUANT_PATH, TWEET_PATH, BLOG_PATH, BENCHMARK_PATH } = require('./audit_benchmark.js');

const AUDIT_DIR = path.join(REPO_ROOT, 'audit');

function countLines(p) { try { return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).length; } catch { return 0; } }
function exists(p) { return fs.existsSync(p); }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function status() {
  const corpusN = countLines(CORPUS_PATH);
  const valN = countLines(VALIDATION_PATH);
  const loraN = countLines(LORA_PATH);
  const valStats = readJson(VALIDATION_STATS_PATH);
  return {
    phase0_infra: ['audit_pii_redactor.js', 'audit_corpus_builder.js', 'audit_validator.js',
      'audit_insights.js', 'audit_benchmark.js', 'audit_pipeline.js']
      .every((f) => exists(path.join(__dirname, f))),
    phase1_corpus: { done: corpusN > 0, entries: corpusN, stats: exists(STATS_PATH) },
    phase2_validate: { done: valN > 0, entries: valN, stats: exists(VALIDATION_STATS_PATH), avg_score: valStats ? valStats.avg_score : null },
    phase3_insights: { input_prepped: exists(INSIGHTS_INPUT_PATH), report: exists(REPORT_PATH) },
    phase4_benchmark: {
      cost: exists(COST_PATH), lora_samples: loraN, quant: exists(QUANT_PATH),
      tweet: exists(TWEET_PATH), blog: exists(BLOG_PATH), benchmark_md: exists(BENCHMARK_PATH),
    },
  };
}

const PLAN = `Wave 23 audit run order:
  Phase 0 (done by orchestrator): build tools/audit/*.js, document v167 schema, keep 22.A hook.
  Phase 1: node tools/audit/audit_corpus_builder.js run        # local Ollama, resumable
  Phase 2: node tools/audit/audit_validator.js run             # Haiku, resumable
  Phase 3: node tools/audit/audit_insights.js prep             # → audit/insights_input.json
           <orchestrator spawns model-reasoner with input.prompt; saves reply → audit/insights.json>
           node tools/audit/audit_insights.js report audit/insights.json   # → AUDIT_REPORT.md
  Phase 4: <orchestrator records phase3/4 tokens → audit/phase_tokens.json>
           node tools/audit/audit_benchmark.js all 5           # cost+lora+quant(5)+marketing+report
  Closure: PII guard (audit_pii_redactor.js on corpus/validation/lora), classify.js sha256,
           remove _debug_subagentstop_v167.js + restore settings.json, tests, PR, final-reviewer.`;

module.exports = { status, PLAN };

if (require.main === module) {
  const cmd = process.argv[2] || 'status';
  if (cmd === 'status') process.stdout.write(JSON.stringify(status(), null, 2) + '\n');
  else if (cmd === 'plan') process.stdout.write(PLAN + '\n');
  else { process.stderr.write('usage: audit_pipeline.js {status|plan}\n'); process.exit(2); }
}
