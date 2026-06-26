'use strict';

// /metrics additive blocks — Cockpit v2 Wave 1 (PASSO 4).
// Proves the new savings:{} + auto_skill:{} blocks are ADDITIVE and honest:
//   - the flat saved / advisory_saved fields keep their exact shape (regression)
//   - savings.routing_saved_usd === saved; savings.total === saved
//   - auto_skill.applied counts directives; skills map is per-name
//   - est_tokens_saved_pct is null without a paired sample, a real advisory %
//     when both with-skill and without-skill token samples exist
//   - every advisory block is flagged advisory:true (never a fabricated $)

const test = require('node:test');
const assert = require('node:assert');
const { computeMetrics, computeAutoSkill } = require('./savings-tracker.js');

function classified(extra) {
  return JSON.stringify(Object.assign({
    event: 'classified', ts_ms: 1782000000000, session_id: 's1',
    tier: 'T1', prompt_len: 120, task_category: 'diagram',
  }, extra || {}));
}

test('regression: flat saved / advisory_saved are unchanged and savings mirrors them', () => {
  const lines = [
    classified({ tier: 'T0', prompt_len: 800 }),
    classified({ tier: 'T1', prompt_len: 400 }),
    classified({ tier: 'T3', prompt_len: 600 }),
  ];
  const m = computeMetrics(lines);

  // Flat fields still present and numeric.
  assert.equal(typeof m.saved, 'number');
  assert.equal(typeof m.advisory_saved, 'number');
  assert.equal(m.advisory_saved, m.saved, 'advisory_saved tracks saved as before');

  // Additive block mirrors the flat number under an explicit name; no $ inflation.
  assert.ok(m.savings, 'savings block present');
  assert.equal(m.savings.routing_saved_usd, m.saved, 'routing_saved_usd == saved');
  assert.equal(m.savings.total, m.saved, 'total == routing_saved_usd while skill_efficiency advisory');
  assert.equal(m.savings.skill_efficiency.advisory, true);
});

test('auto_skill: applied=0 + skills={} + est null when no directive in the log', () => {
  const m = computeMetrics([classified(), classified({ tier: 'T2' })]);
  assert.deepEqual(m.auto_skill.skills, {});
  assert.equal(m.auto_skill.applied, 0);
  assert.equal(m.auto_skill.est_tokens_saved_pct, null);
  assert.equal(m.auto_skill.advisory, true);
  assert.equal(m.savings.skill_efficiency.applied, 0);
  assert.equal(m.savings.skill_efficiency.est_tokens_saved_pct, null);
});

test('auto_skill: applied counts directives and breaks down by skill name', () => {
  const lines = [
    classified({ auto_skill: 'anthropic-skills:canvas-design' }),
    classified({ auto_skill: 'anthropic-skills:canvas-design' }),
    classified({ auto_skill: 'diagram-systems-skill' }),
    classified(), // no directive
  ];
  const a = computeAutoSkill(lines);
  assert.equal(a.applied, 3);
  assert.deepEqual(a.skills, {
    'anthropic-skills:canvas-design': 2,
    'diagram-systems-skill': 1,
  });
  assert.equal(a.advisory, true);
});

test('est_tokens_saved_pct: null without a paired sample, real advisory % with one', () => {
  // Only with-skill samples → no baseline → null.
  const onlyWith = computeAutoSkill([
    classified({ auto_skill: 'sk', tokens_out: 300 }),
  ]);
  assert.equal(onlyWith.est_tokens_saved_pct, null);

  // Paired: same category, without-skill avg 1000 vs with-skill avg 700 → 30% saved.
  const paired = computeAutoSkill([
    classified({ task_category: 'diagram', tokens_out: 1000 }),                 // baseline
    classified({ task_category: 'diagram', tokens_out: 1000 }),                 // baseline
    classified({ task_category: 'diagram', auto_skill: 'sk', tokens_out: 700 }), // with skill
  ]);
  assert.equal(paired.est_tokens_saved_pct, 30);
  assert.equal(paired.advisory, true);
});

test('tester events are excluded from the auto_skill tally', () => {
  const a = computeAutoSkill([
    classified({ auto_skill: 'sk', source: 'mooter-tester' }),
    classified({ auto_skill: 'sk' }),
  ]);
  assert.equal(a.applied, 1, 'synthetic tester directive must not be counted');
});
