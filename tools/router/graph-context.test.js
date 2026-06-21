'use strict';
// Wave 66 Block 3 — graph-context layer tests. The byte-identical guarantee lives
// HERE at the source: applyGraphContext with no breadcrumb leaves the decision
// deep-equal unchanged, so inject_context emits an identical router-hint. The layer
// NEVER changes the tier → the HIGH_RISK floor is intact.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const mod = require('./graph-context.js');
const {
  REPO_THRESHOLD, estimateTokensSaved, resolveGraphContext,
  applyGraphContext, renderGraphContextBlock,
} = mod;

const snap = (over = {}) => ({ repo: 'myrepo', nodes: 951, resolved: true, ts: 1, repo_size: 951, ...over });

// ── estimateTokensSaved (conservative, banded, advisory) ──────────────────────

test('estimateTokensSaved: 0 below threshold / unknown, banded above', () => {
  assert.equal(estimateTokensSaved(0), 0);
  assert.equal(estimateTokensSaved(REPO_THRESHOLD - 1), 0);
  assert.equal(estimateTokensSaved(undefined), 0);
  assert.equal(estimateTokensSaved('x'), 0);
  assert.equal(estimateTokensSaved(100), 2000);
  assert.equal(estimateTokensSaved(499), 2000);
  assert.equal(estimateTokensSaved(500), 4000);
  assert.equal(estimateTokensSaved(5000), 4000);
});

// ── resolveGraphContext (pure) ────────────────────────────────────────────────

test('resolveGraphContext: valid snapshot → context with advisory estimate', () => {
  assert.deepEqual(resolveGraphContext(snap()), {
    repo: 'myrepo', nodes: 951, tokens_saved_est: 4000, repo_size: 951,
  });
});

test('resolveGraphContext: null on absent / unresolved / no nodes / no repo', () => {
  assert.equal(resolveGraphContext(null), null);
  assert.equal(resolveGraphContext({}), null);
  assert.equal(resolveGraphContext(snap({ resolved: false })), null);
  assert.equal(resolveGraphContext(snap({ nodes: 0 })), null);
  assert.equal(resolveGraphContext(snap({ repo: '' })), null);
});

test('resolveGraphContext: small repo → estimate 0 but still a navigation context', () => {
  const ctx = resolveGraphContext(snap({ repo_size: 40 }));
  assert.equal(ctx.tokens_saved_est, 0, 'below threshold → no saving claim');
  assert.equal(ctx.nodes, 951);
});

test('resolveGraphContext: repo_size absent → estimate 0, repo_size omitted', () => {
  const s = snap();
  delete s.repo_size;
  const ctx = resolveGraphContext(s);
  assert.equal(ctx.tokens_saved_est, 0, 'unknown size → no saving claim');
  assert.equal('repo_size' in ctx, false);
});

// ── applyGraphContext — THE byte-identical guarantee ──────────────────────────

test('applyGraphContext: no breadcrumb → decision DEEP-EQUAL unchanged', () => {
  const decision = { tier: 'T2', escalation_rule: 'none', recommended_model: 'claude-sonnet-4-6' };
  const before = JSON.parse(JSON.stringify(decision));
  const after = applyGraphContext(decision, { snapshot: null });
  assert.deepEqual(after, before, 'no graph → byte-identical decision (router-hint unchanged)');
  assert.equal('graph_context' in after, false);
});

test('applyGraphContext: resolved snapshot → graph_context set + escalation appended, tier UNCHANGED', () => {
  const decision = { tier: 'T2', escalation_rule: 'none' };
  applyGraphContext(decision, { snapshot: snap() });
  assert.equal(decision.tier, 'T2', 'tier never changes (66.C owns biasing)');
  assert.equal(decision.escalation_rule, 'graph_resolved');
  assert.deepEqual(decision.graph_context, { repo: 'myrepo', nodes: 951, tokens_saved_est: 4000, repo_size: 951 });
});

test('applyGraphContext: appends to a non-none escalation_rule', () => {
  const decision = { tier: 'T3', escalation_rule: 'beast_mode' };
  applyGraphContext(decision, { snapshot: snap() });
  assert.equal(decision.escalation_rule, 'beast_mode+graph_resolved');
});

test('applyGraphContext: HIGH_RISK T3 stays T3 with a resolved graph (never downgrades)', () => {
  const decision = { tier: 'T3', risk_level: 'high', escalation_rule: 'none', recommended_model: 'claude-opus-4-6' };
  applyGraphContext(decision, { snapshot: snap() });
  assert.equal(decision.tier, 'T3', 'HIGH_RISK floor intact');
  assert.equal(decision.recommended_model, 'claude-opus-4-6', 'model untouched');
});

test('applyGraphContext: unresolved / garbage snapshot → decision unchanged', () => {
  for (const s of [snap({ resolved: false }), null, {}, 'garbage']) {
    const decision = { tier: 'T1', escalation_rule: 'none' };
    applyGraphContext(decision, { snapshot: s });
    assert.equal(decision.escalation_rule, 'none');
    assert.equal('graph_context' in decision, false);
  }
});

test('applyGraphContext: never throws on a bad decision', () => {
  assert.doesNotThrow(() => applyGraphContext(null, { snapshot: snap() }));
  assert.doesNotThrow(() => applyGraphContext(undefined, {}));
});

// ── renderGraphContextBlock (pure) ────────────────────────────────────────────

test('renderGraphContextBlock: [] when no graph_context (byte-identical render)', () => {
  assert.deepEqual(renderGraphContextBlock({}), []);
  assert.deepEqual(renderGraphContextBlock({ graph_context: null }), []);
});

test('renderGraphContextBlock: emits the block with nós=N · repo + grep-avoidance guidance', () => {
  const decision = { graph_context: { repo: 'myrepo', nodes: 951, tokens_saved_est: 4000, repo_size: 951 } };
  const out = renderGraphContextBlock(decision);
  assert.equal(out[0], '');
  assert.equal(out[1], '<graph-context>');
  assert.equal(out[2], 'nós=951 · resolved=true · repo=myrepo · ficheiros=951');
  assert.equal(out[out.length - 1], '</graph-context>');
  assert.ok(out.join('\n').includes('query_graph'), 'tells CC to query the graph over grep');
});

test('renderGraphContextBlock: omits ficheiros segment when repo_size unknown', () => {
  const out = renderGraphContextBlock({ graph_context: { repo: 'r', nodes: 5, tokens_saved_est: 0 } });
  assert.equal(out[2], 'nós=5 · resolved=true · repo=r');
});
