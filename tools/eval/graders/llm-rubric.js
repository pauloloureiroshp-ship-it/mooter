'use strict';
/**
 * llm_rubric — an ISOLATED, per-DIMENSION LLM judge with an explicit "Unknown" escape hatch.
 *
 * Anthropic's guidance: one judge per dimension (not a single omniscient judge), and the judge must
 * be allowed to answer "Unknown" rather than hallucinate a verdict. Design here:
 *   - Pluggable transport. Default LOCAL ($0) via the mooter local path
 *     (`~/.claude/tools/router/ollama_call.sh`) — we DO NOT hardwire a paid cloud call. A cloud judge
 *     is a documented opt-in (MOOTER_EVAL_JUDGE=cloud), intentionally NOT wired in Fase A.
 *   - Escape hatch. If no judge is reachable, every dimension returns { verdict: 'Unknown' } and the
 *     grade is `unknown` (NOT pass, NOT fail) so it can never silently inflate a pass rate.
 *
 * FASE A HONESTY: the deterministic edit tasks are graded OBJECTIVELY by state_check + parse; they do
 * not need an LLM judge, so llm_rubric returns `not_applicable` for them. It is invoked only for tasks
 * that declare `judge_dimensions` (the free-prompt / agent tasks) — which are themselves BLOCKED in
 * Fase A (no live agent/webview), so in this baseline llm_rubric never renders a live verdict. This is
 * a real, documented interface + a local stub, exactly as the brief permits.
 */

const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

function localJudgePath() {
  const p = path.join(os.homedir(), '.claude', 'tools', 'router', 'ollama_call.sh');
  return fs.existsSync(p) ? p : null;
}

// judgeDimension: returns { dimension, verdict: 'Pass'|'Fail'|'Unknown', raw }
function judgeDimension({ dimension, rubric, prompt, output }) {
  const mode = process.env.MOOTER_EVAL_JUDGE || 'local';
  if (mode === 'cloud') {
    // Intentionally not wired in Fase A — do not hardwire a paid call.
    return { dimension, verdict: 'Unknown', raw: 'cloud judge not wired (Fase A)' };
  }
  const judge = localJudgePath();
  if (!judge) return { dimension, verdict: 'Unknown', raw: 'no local judge (ollama_call.sh absent)' };
  const q = [
    `You are grading ONE dimension: ${dimension}.`,
    `Rubric: ${rubric}`,
    `Task prompt: ${prompt}`,
    `Candidate output:\n${output}`,
    `Answer with exactly one word: Pass, Fail, or Unknown.`,
  ].join('\n\n');
  try {
    const out = execFileSync('bash', [judge, '--text', q], { encoding: 'utf8', timeout: 60000 }).trim();
    const v = /pass/i.test(out) ? 'Pass' : /fail/i.test(out) ? 'Fail' : 'Unknown';
    return { dimension, verdict: v, raw: out.slice(0, 200) };
  } catch (e) {
    return { dimension, verdict: 'Unknown', raw: 'judge unreachable: ' + String(e.message).slice(0, 120) };
  }
}

function grade(ctx) {
  const { task } = ctx;
  if (task.expect.outcome === 'blocked') return { name: 'llm_rubric', status: 'blocked', detail: 'judge not run (task blocked)' };
  const dims = task.judge_dimensions;
  if (!Array.isArray(dims) || dims.length === 0) return { name: 'llm_rubric', status: 'not_applicable', detail: 'objective task — no LLM judge needed' };
  const results = dims.map((d) => judgeDimension({ dimension: d.dimension, rubric: d.rubric, prompt: task.prompt, output: ctx.after }));
  const anyFail = results.some((r) => r.verdict === 'Fail');
  const allPass = results.every((r) => r.verdict === 'Pass');
  const status = anyFail ? 'fail' : allPass ? 'pass' : 'unknown';
  return { name: 'llm_rubric', status, detail: results.map((r) => `${r.dimension}:${r.verdict}`).join(' ') };
}

module.exports = { grade, judgeDimension, localJudgePath };
