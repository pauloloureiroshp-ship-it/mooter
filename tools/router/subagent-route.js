'use strict';

// subagent-route — deterministic local|cloud routing per subagent role (First Magic — FASE 3).
//
// This is how Mooter plugs INTO native orchestration instead of competing with it: when a
// subagent (incl. Dynamic Workflows fan-out) starts, route it by its ROLE —
//   - leaf/verbose work (retrieval, grep, read logs, run tests, summarize, extract) → local
//     Ollama ($0): high token volume, low judgement;
//   - synthesis / decision / design / review → the cloud maestro: low volume, high judgement.
//
// DOCTRINE: only-UPGRADE, never downgrade on risk. If the task carries a HIGH_RISK signal
// (reuse moo-risk from FASE 1, which itself reuses the frozen classify.js HIGH_RISK bank),
// the subagent is FORCED to cloud Opus regardless of role — a destructive/architectural task
// never silently lands on a small local Moo. Zero-LLM, pure, synchronous.

const { assess } = require('./moo-risk');
const { laneModel, loadCapability } = require('./local-fleet');

// Leaf/verbose roles — safe to run locally at $0. Split by match style:
//   - prefix intent-words: NO trailing \b (retriev→retrieve/retrieval, summari[sz]e→summary;
//     a trailing \b would break those, the bug classify.js documents);
//   - full words: trailing \b anchored to avoid mid-word over-matches;
//   - phrases: anchored.
const LEAF = /\b(?:retriev|summari[sz]e|extract|transform|reformat|enumerat|translat|locat)|\b(?:search|grep|ripgrep|lint|build|format|typecheck|fetch|scan|gather|collect|tail|boilerplate|find)\b|\b(?:read(?:ing)?\s+(?:the\s+)?(?:logs?|files?|code)|run(?:ning)?\s+(?:the\s+)?tests?|dump\s+logs)\b/i;

// Synthesis / judgement roles — keep on the cloud maestro. Checked BEFORE leaf so a role
// that names both ("build the strategy", "scan and decide") routes to cloud.
const SYNTH = /\b(synthesi[sz]e|decide|decision|design|architect|plan\b|review|judge|evaluat|assess|choose|select\s+the\s+best|reconcile|merge\s+(the\s+)?findings|critique|recommend|trade-?off|reason\s+about|prioriti|strateg|verdict|write\s+the\s+(spec|adr|rfc|design))/i;

const CLOUD_SYNTH_MODEL = 'claude-sonnet-4-6'; // synthesis default (T2)
const CLOUD_RISK_MODEL = 'claude-opus-4-6';    // high-risk / architecture floor (T3)

/**
 * Decide where a subagent runs.
 * @param {{role?: string, task?: string, capability?: object}} input
 * @returns {{target:'local'|'cloud', model:string, risk:'none'|'low'|'high', role_class:'leaf'|'synth'|'ambiguous', reason:string}}
 */
function decideRoute(input) {
  const role = String((input && input.role) || '');
  const task = String((input && input.task) || '');
  const text = `${role}\n${task}`.trim();

  // 1) Risk floor (only-upgrade): a HIGH_RISK task can never be downgraded to local.
  //    Use the TOOL layer — at routing time the task text describes an action to run, so
  //    a destructive token must force cloud even if the role is phrased as "summarize …".
  //    (The prompt layer's asking-vs-doing veto would wrongly suppress it — that veto is
  //    for chat questions, not for the work a subagent is about to do.)
  const risk = assess(text, { layer: 'tool' }).risk_tier; // 'none' | 'low' | 'high'
  if (risk === 'high') {
    return { target: 'cloud', model: CLOUD_RISK_MODEL, risk, role_class: classify(role), reason: 'HIGH_RISK signal — forced to cloud Opus (never downgrade risky work to local)' };
  }

  // 2) Role-based routing.
  const cls = classify(role);
  if (cls === 'leaf') {
    const cap = (input && input.capability) || loadCapability();
    const model = laneModel(cap); // the light local lane model (qwen2.5:3b on an 8GB M3)
    return { target: 'local', model, risk, role_class: cls, reason: `leaf/verbose role — local Ollama ($0) on ${model}` };
  }
  if (cls === 'synth') {
    return { target: 'cloud', model: CLOUD_SYNTH_MODEL, risk, role_class: cls, reason: 'synthesis/decision role — cloud maestro for judgement' };
  }

  // 3) Ambiguous → conservative on QUALITY: keep on cloud (only-upgrade bias; we do not
  //    silently downgrade an unclassified role to local).
  return { target: 'cloud', model: CLOUD_SYNTH_MODEL, risk, role_class: cls, reason: 'role unclassified — defaulting to cloud (no silent downgrade)' };
}

function classify(role) {
  const r = String(role || '');
  // leaf and synth can both match; synthesis wins (judgement is the higher bar).
  if (SYNTH.test(r)) return 'synth';
  if (LEAF.test(r)) return 'leaf';
  return 'ambiguous';
}

module.exports = { decideRoute, classify, LEAF, SYNTH };

if (require.main === module) {
  const role = process.argv[2] || '';
  const task = process.argv.slice(3).join(' ');
  process.stdout.write(JSON.stringify(decideRoute({ role, task }), null, 2) + '\n');
}
