'use strict';
/**
 * graders/index.js — the grader stack registry (Demystifying-evals §2). Runs every grader on one
 * trial and decides whether the trial passed.
 *
 * Decisive graders (all must be 'pass'): state_check, deterministic_tests, tool_calls, static_analysis.
 * Advisory: llm_rubric — 'unknown'/'not_applicable'/'blocked' never fail a trial; only an explicit
 * 'fail' does. This keeps the "Unknown escape hatch" from silently inflating OR deflating pass rates.
 */

const stateCheck = require('./state-check');
const deterministic = require('./deterministic-tests');
const toolCalls = require('./tool-calls');
const staticAnalysis = require('./static-analysis');
const llmRubric = require('./llm-rubric');

const DECISIVE = ['state_check', 'deterministic_tests', 'tool_calls', 'static_analysis'];

function runGraders(ctx) {
  const results = [
    stateCheck.grade(ctx),
    deterministic.grade(ctx),
    toolCalls.grade(ctx),
    staticAnalysis.grade(ctx),
    llmRubric.grade(ctx),
  ];
  const byName = Object.fromEntries(results.map((r) => [r.name, r]));

  if (ctx.task.expect.outcome === 'blocked') {
    return { results, byName, pass: null, blocked: true };
  }
  const decisiveOk = DECISIVE.every((n) => byName[n] && byName[n].status === 'pass');
  const rubricFail = byName.llm_rubric && byName.llm_rubric.status === 'fail';
  return { results, byName, pass: decisiveOk && !rubricFail, blocked: false };
}

module.exports = { runGraders, DECISIVE };
