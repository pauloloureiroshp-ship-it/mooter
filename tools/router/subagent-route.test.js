'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { decideRoute, classify } = require('./subagent-route');

test('leaf/verbose roles route to local Ollama ($0)', () => {
  for (const role of ['retrieve relevant files', 'grep the logs for the error', 'run the tests', 'summarize this README', 'lint the codebase']) {
    const r = decideRoute({ role });
    assert.strictEqual(r.target, 'local', `${role} should be local`);
    assert.strictEqual(r.role_class, 'leaf');
  }
});

test('synthesis/decision roles route to the cloud maestro', () => {
  for (const role of ['synthesize the findings', 'decide the architecture', 'review this design', 'write the ADR']) {
    const r = decideRoute({ role });
    assert.strictEqual(r.target, 'cloud', `${role} should be cloud`);
    assert.strictEqual(r.role_class, 'synth');
  }
});

test('only-upgrade: a HIGH_RISK task forces cloud Opus even for a leaf role', () => {
  const r = decideRoute({ role: 'read the logs', task: 'then drop the production users table' });
  assert.strictEqual(r.target, 'cloud');
  assert.strictEqual(r.model, 'claude-opus-4-6');
  assert.strictEqual(r.risk, 'high');
  assert.match(r.reason, /never downgrade/i);
});

test('only-upgrade (regression): a "summarize" role over a destructive task still forces cloud', () => {
  // the asking-vs-doing veto must NOT suppress the destructive signal at routing time
  for (const task of ['drop table prod_users', 'delete from payments', 'rm -rf /var/data', 'truncate orders', 'rotate the stripe secret']) {
    const r = decideRoute({ role: 'summarize the result', task });
    assert.strictEqual(r.target, 'cloud', `must not downgrade: ${task}`);
    assert.strictEqual(r.risk, 'high');
  }
});

test('benign summarize stays local (tool-layer assess does not over-escalate)', () => {
  assert.strictEqual(decideRoute({ role: 'summarize this README', task: 'one paragraph' }).target, 'local');
});

test('ambiguous role does NOT silently downgrade to local (defaults cloud)', () => {
  const r = decideRoute({ role: 'do the thing' });
  assert.strictEqual(r.target, 'cloud');
  assert.strictEqual(r.role_class, 'ambiguous');
});

test('synthesis wins when a role names both leaf and synth work', () => {
  assert.strictEqual(classify('read the logs then decide the architecture'), 'synth');
});

test('local lane uses the light fleet model (qwen2.5:3b lane)', () => {
  const r = decideRoute({ role: 'grep logs', capability: { option_a_model: 'qwen2.5:3b', recommended_t0: 'qwen2.5-coder:14b-q4' } });
  assert.strictEqual(r.model, 'qwen2.5:3b');
});
