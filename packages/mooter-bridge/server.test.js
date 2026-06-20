'use strict';
// mooter-bridge P0 — hermetic MCP protocol + tool tests (stubbed host-extra, no real ~/.claude).
const test = require('node:test');
const assert = require('node:assert');
const bridge = require('./server.js');

const FAKE_ROWS = [
  { id: 'aaaa1111', fullId: 'aaaa1111-2222-3333', name: 'fix ollama endpoint', project: 'mooter', model: 'claude-opus-4-8',
    turns: 12, ageMs: 5000, working: true, needsYou: false, cwd: '/r/mooter', branch: 'feat/x',
    pr: { number: 84, title: 'feat x', state: 'OPEN', isDraft: false, stage: 'CI ✅' },
    tokIn: 100, tokOut: 50, cost: 0.01, saved: 0.2, tokPerSec: 30 },
  { id: 'bbbb2222', fullId: 'bbbb2222-3333-4444', name: 'write tests', project: 'mooter', model: 'claude-sonnet-4-6',
    turns: 3, ageMs: 600000, working: false, needsYou: true, cwd: '/r/mooter', branch: 'feat/y',
    pr: null, tokIn: 10, tokOut: 5, cost: 0, saved: 0.01, tokPerSec: null },
];
bridge.setHostExtra({ recentSessions: async (n) => FAKE_ROWS.slice(0, n) });

test('initialize echoes client protocolVersion + advertises tools capability', async () => {
  const r = await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test' } } });
  assert.equal(r.result.protocolVersion, '2025-06-18');
  assert.ok(r.result.capabilities.tools);
  assert.equal(r.result.serverInfo.name, 'mooter-bridge');
});

test('notifications/initialized produces no response', async () => {
  const r = await bridge.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(r, null);
});

test('tools/list returns the bridge tools with schemas; read tools are read-only', async () => {
  const r = await bridge.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = r.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['mooter_run', 'mooter_session_read', 'mooter_sessions_list']);
  for (const t of r.result.tools) { assert.ok(t.inputSchema.type === 'object'); }
  for (const t of r.result.tools.filter((x) => x.name.startsWith('mooter_session'))) { assert.equal(t.annotations.readOnlyHint, true); }
});

test('tools/call mooter_sessions_list returns honest counts + shaped sessions', async () => {
  const r = await bridge.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mooter_sessions_list', arguments: { limit: 8 } } });
  assert.equal(r.result.isError, false);
  const sc = r.result.structuredContent;
  assert.equal(sc.counts.total, 2);
  assert.equal(sc.counts.working, 1);
  assert.equal(sc.counts.needs_you, 1);
  assert.equal(sc.sessions[0].status, 'working');
  assert.equal(sc.sessions[0].pr.stage, 'CI ✅');
  assert.equal(sc.sessions[1].status, 'needs_you');
  // text content mirrors structured content (valid JSON)
  assert.deepEqual(JSON.parse(r.result.content[0].text), sc);
});

test('tools/call mooter_session_read resolves by 8-char prefix', async () => {
  const r = await bridge.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'mooter_session_read', arguments: { id: 'bbbb2222' } } });
  assert.equal(r.result.structuredContent.title, 'write tests');
  assert.equal(r.result.structuredContent.branch, 'feat/y');
});

test('mooter_session_read unknown id → honest error (not a throw)', async () => {
  const r = await bridge.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'mooter_session_read', arguments: { id: 'zzz' } } });
  assert.equal(r.result.isError, true);
  assert.match(r.result.structuredContent.error, /not found/);
});

test('unknown tool → JSON-RPC invalid params', async () => {
  const r = await bridge.handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nope' } });
  assert.equal(r.error.code, -32602);
});

test('unknown method → method not found (-32601)', async () => {
  const r = await bridge.handle({ jsonrpc: '2.0', id: 7, method: 'foo/bar' });
  assert.equal(r.error.code, -32601);
});

test('ping → empty result', async () => {
  const r = await bridge.handle({ jsonrpc: '2.0', id: 8, method: 'ping' });
  assert.deepEqual(r.result, {});
});

// ── P0.1: graceful drain — stdin close must NOT cut off an in-flight async tool call ──
test('subprocess: response to a slow tools/call arrives AFTER stdin closes (graceful drain)', async () => {
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, [require('path').join(__dirname, 'server.js')], {
    env: { ...process.env, MOOTER_BRIDGE_SLOW_MS: '300' }, stdio: ['pipe', 'pipe', 'ignore'],
  });
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { out += d; });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'mooter_sessions_list', arguments: { limit: 3 } } }) + '\n');
  child.stdin.end(); // close immediately — the 300ms tool call is still in flight
  const code = await new Promise((res) => child.on('close', res));
  const msgs = out.trim().split('\n').filter(Boolean).map(JSON.parse);
  const call = msgs.find((m) => m.id === 2);
  assert.ok(call, 'tools/call response was delivered despite stdin closing first');
  assert.ok(call.result.structuredContent.counts, 'has structured counts');
  assert.equal(code, 0, 'exits cleanly after draining');
});

// ── P1: mooter_run (headless runner) — hermetic, stubbed spawner ──────────────────────
const os = require('os'); const fs = require('fs'); const path = require('path');
test('mooter_run text-only builds claude -p with NO tools / no permission-mode, isolated cwd, shaped result', async () => {
  let seen = null;
  bridge.setSpawner(async (cfg) => { seen = cfg; return { ok: true, code: 0, json: { result: 'ok', session_id: 'sid-1', total_cost_usd: 0.01, num_turns: 1 } }; });
  const r = await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mooter_run', arguments: { prompt: 'Reply with exactly: ok' } } });
  const sc = r.result.structuredContent;
  assert.equal(r.result.isError, false);
  assert.equal(seen.prompt, 'Reply with exactly: ok');
  assert.equal(seen.allowedTools, null, 'text-only → no tools');
  assert.equal(seen.permissionMode, null, 'no permission mode without tools');
  assert.equal(seen.maxTurns, 6, 'default maxTurns');
  assert.ok(seen.cwd.includes('mooter-run-'), 'isolated temp cwd');
  assert.equal(sc.result, 'ok'); assert.equal(sc.session_id, 'sid-1'); assert.equal(sc.cost_usd, 0.01); assert.equal(sc.ephemeral, true);
});

test('mooter_run with allowedTools → permission-mode acceptEdits, maxTurns clamped to 20', async () => {
  let seen = null;
  bridge.setSpawner(async (cfg) => { seen = cfg; return { ok: true, code: 0, json: { result: 'done', session_id: 's', total_cost_usd: 0.2, num_turns: 3 } }; });
  await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mooter_run', arguments: { prompt: 'edit', allowedTools: 'Write,Edit', maxTurns: 99 } } });
  assert.equal(seen.allowedTools, 'Write,Edit');
  assert.equal(seen.permissionMode, 'acceptEdits');
  assert.equal(seen.maxTurns, 20, 'clamped');
});

test('mooter_run honours an explicit cwd (no temp dir)', async () => {
  let seen = null; bridge.setSpawner(async (cfg) => { seen = cfg; return { ok: true, code: 0, json: { result: 'x', session_id: 's' } }; });
  const r = await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mooter_run', arguments: { prompt: 'p', cwd: '/tmp' } } });
  assert.equal(seen.cwd, '/tmp');
  assert.equal(r.result.structuredContent.ephemeral, false);
});

test('mooter_run failure (spawn error) → honest error, not a throw', async () => {
  bridge.setSpawner(async () => ({ ok: false, error: 'spawn failed: claude ENOENT' }));
  const r = await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mooter_run', arguments: { prompt: 'p' } } });
  assert.equal(r.result.isError, true);
  assert.match(r.result.structuredContent.error, /spawn failed/);
});

test('mooter_run missing prompt → error', async () => {
  const r = await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mooter_run', arguments: {} } });
  assert.equal(r.result.isError, true);
});

test('tools/list now advertises mooter_run as non-read-only', async () => {
  const r = await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const run = r.result.tools.find((t) => t.name === 'mooter_run');
  assert.ok(run); assert.equal(run.annotations.readOnlyHint, false); assert.equal(run.annotations.destructiveHint, true);
});
