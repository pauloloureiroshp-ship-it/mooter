'use strict';
// Wave 66 Block 3 — inject_context integration. Drives the live hook as a
// subprocess (like inject_context.test.js) with MOOTER_GRAPH_ACTIVE pointing at an
// absent vs present breadcrumb. Proves: no breadcrumb → NO <graph-context> block
// (the byte-identical path); breadcrumb → block appears; and a HIGH_RISK prompt
// keeps tier T3 regardless of the graph.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'inject_context.js');

function runHook(prompt, graphActive) {
  const env = Object.assign({}, process.env);
  delete env.MOOTER_PIN_MODEL;
  env.MOOTER_GRAPH_ACTIVE = graphActive
    || path.join(os.tmpdir(), `mooter-graph-absent-${process.pid}.json`);
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ prompt, session_id: 'test-graph-ctx' }),
    encoding: 'utf8',
    timeout: 15000,
    env,
  });
  return (res.stdout || '') + (res.stderr || '');
}

function writeBreadcrumb(snap) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-graph-bc-')), 'active-graph.json');
  fs.writeFileSync(p, JSON.stringify(snap));
  return p;
}

// A high-risk prompt reliably yields a full hint (confidence >= 0.6), so the graph
// layer (which runs only on the full-hint path) is exercised deterministically.
const PROMPT = 'review the architecture and deploy to production';

test('no breadcrumb → NO <graph-context> block, no graph_resolved marker', () => {
  const out = runHook(PROMPT, null);
  assert.ok(out.includes('</router-hint>'), 'sanity: a full hint was emitted');
  assert.ok(!out.includes('<graph-context>'), 'no graph block without a breadcrumb');
  assert.ok(!/graph_resolved/.test(out), 'no graph_resolved marker without a breadcrumb');
});

test('with breadcrumb → <graph-context> block appears with nós=N + grep-avoidance', () => {
  const bc = writeBreadcrumb({ repo: 'myrepo', nodes: 951, resolved: true, ts: Date.now(), repo_size: 951 });
  const out = runHook(PROMPT, bc);
  assert.match(out, /<graph-context>/);
  assert.match(out, /nós=951 · resolved=true · repo=myrepo/);
  assert.match(out, /query_graph/);
  assert.match(out, /escalation: .*graph_resolved/);
});

test('unresolved breadcrumb → no block (graph exists but not current for cwd)', () => {
  const bc = writeBreadcrumb({ repo: 'myrepo', nodes: 951, resolved: false, ts: Date.now(), repo_size: 951 });
  const out = runHook(PROMPT, bc);
  assert.ok(!out.includes('<graph-context>'), 'unresolved breadcrumb must not annotate');
});

test('HIGH_RISK prompt + breadcrumb → tier stays T3 (graph never downgrades)', () => {
  const bc = writeBreadcrumb({ repo: 'myrepo', nodes: 951, resolved: true, ts: Date.now(), repo_size: 951 });
  const out = runHook('deploy to production and push the release now', bc);
  assert.match(out, /tier: T3/, 'HIGH_RISK floor holds with a graph present');
});
