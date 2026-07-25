'use strict';
/**
 * fleet.test.js — unit tests for the fleet snapshot that feeds the native panel.
 * Deterministic: the Ollama probe is pointed at a dead port so "local" is always
 * the unreachable path, which is the one that must degrade honestly.
 *   node --test packages/mooter-bridge/
 */

process.env.OLLAMA_HOST = '127.0.0.1:1'; // must be set before requiring fleet.js

const test = require('node:test');
const assert = require('node:assert');
const fleet = require('./fleet.js');

const E = (job_id, event, extra) => Object.assign(
  { ts: '2026-07-24T17:47:11.000Z', job_id, wave: 'w1', agent: 'cc', worktree: 'C:\\repo\\wt', event },
  extra || {},
);

test('foldJobs collapses an event stream into one row per job', () => {
  const jobs = fleet.foldJobs([
    E('a', 'dispatched'), E('a', 'started'), E('a', 'done', { exit_code: 0, duration_s: 16 }),
    E('b', 'dispatched'), E('b', 'started'),
  ]);
  assert.strictEqual(jobs.length, 2);
  const a = jobs.find((j) => j.job_id === 'a');
  assert.strictEqual(a.state, 'done');
  assert.strictEqual(a.duration_s, 16);
  assert.strictEqual(jobs.find((j) => j.job_id === 'b').state, 'running');
});

test('a failed job is never downgraded by a later collected event', () => {
  const jobs = fleet.foldJobs([E('c', 'started'), E('c', 'failed', { exit_code: 1 }), E('c', 'collected')]);
  assert.strictEqual(jobs[0].state, 'failed');
});

test('malformed and unknown events do not invent rows', () => {
  const jobs = fleet.foldJobs([{ ts: 'x', event: 'started' }, null, E('d', 'dispatched')]);
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].job_id, 'd');
});

test('elapsedSeconds counts from started when live and uses duration_s when finished', () => {
  const now = Date.parse('2026-07-24T17:47:41.000Z');
  assert.strictEqual(fleet.elapsedSeconds({ state: 'running', started_at: '2026-07-24T17:47:11.000Z' }, now), 30);
  assert.strictEqual(fleet.elapsedSeconds({ state: 'done', started_at: '2026-07-24T17:47:11.000Z', ended_at: '2026-07-24T17:47:27.000Z', duration_s: 16 }, now), 16);
});

test('elapsedSeconds returns null rather than guessing', () => {
  assert.strictEqual(fleet.elapsedSeconds({ state: 'running' }, Date.now()), null);
  assert.strictEqual(fleet.elapsedSeconds({ state: 'running', started_at: 'not-a-date' }, Date.now()), null);
});

// CONTRACT CHANGE in v1.2 — this test used to assert that a cwd match was
// enough. It is not, and the old behaviour shipped a real lie: on 2026-07-25 a
// job was labelled with the model of a session 18 HOURS older that merely
// shared the folder. A cwd match now also requires a time overlap.
test('attachModels matches worktree to session cwd when the session overlaps the job', () => {
  const jobs = [{ worktree: 'C:\\Users\\P\\frugal-w2', started_at: new Date(Date.now() - 60000).toISOString() }];
  fleet.attachModels(jobs, [{ cwd: 'c:/users/p/frugal-w2/', model: 'claude-sonnet-4-6', id: 'a1', ageMs: 55000 }]);
  assert.strictEqual(jobs[0].model, 'claude-sonnet-4-6');
  assert.strictEqual(jobs[0].session_id, 'a1');
});

test('attachModels refuses a same-folder session from another hour', () => {
  const jobs = [{ worktree: 'C:\\Users\\P\\frugal-w2', started_at: new Date(Date.now() - 60000).toISOString() }];
  fleet.attachModels(jobs, [{ cwd: 'c:/users/p/frugal-w2/', model: 'claude-opus-4-8', id: 'velha', ageMs: 64992846 }]);
  assert.strictEqual(jobs[0].model, null, 'voltou a herdar o modelo de outra sessão');
});

test('attachModels leaves model null when nothing matches — never fabricates', () => {
  const jobs = [{ worktree: 'C:\\repo\\other' }];
  fleet.attachModels(jobs, [{ cwd: 'C:\\repo\\wt', model: 'x' }]);
  assert.strictEqual(jobs[0].model, null);
});

test('groupByWave keeps input order and counts live vs done per wave', () => {
  const g = fleet.groupByWave([
    { wave: 'm3', state: 'running' }, { wave: 'vs1', state: 'done' },
    { wave: 'm3', state: 'done' }, { wave: 'm3', state: 'dispatched' },
  ]);
  assert.deepStrictEqual(g.map((x) => x.wave), ['m3', 'vs1']);
  assert.strictEqual(g[0].live, 2);
  assert.strictEqual(g[0].done, 1);
  assert.strictEqual(g[0].total, 3);
});

test('groupByWave gives jobs without a wave an explicit bucket', () => {
  const g = fleet.groupByWave([{ state: 'running' }]);
  assert.strictEqual(g[0].wave, '(sem wave)');
});

test('probeOllama resolves null (not an empty list) when the daemon is unreachable', async () => {
  const r = await fleet.probeOllama(200);
  assert.strictEqual(r, null, 'null means n/d; [] would falsely claim "up with zero models"');
});

test('probeOllama parses a real /api/ps payload into the panel shape', async () => {
  const http = require('http');
  const payload = { models: [{ model: 'qwen3:30b', size_vram: 19327352832, context_length: 32768, details: { parameter_size: '30.5B', quantization_level: 'Q4_K_M' } }] };
  const srv = http.createServer((q, r) => { r.end(JSON.stringify(payload)); });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const port = srv.address().port;
  process.env.OLLAMA_HOST = '127.0.0.1:' + port;
  delete require.cache[require.resolve('./fleet.js')];
  const f2 = require('./fleet.js');
  const models = await f2.probeOllama(1500);
  srv.close();
  process.env.OLLAMA_HOST = '127.0.0.1:1';
  delete require.cache[require.resolve('./fleet.js')];
  assert.strictEqual(models.length, 1);
  assert.strictEqual(models[0].model, 'qwen3:30b');
  assert.strictEqual(models[0].parameter_size, '30.5B');
  assert.strictEqual(models[0].vram_bytes, 19327352832);
  assert.strictEqual(models[0].context_length, 32768);
});

test('mooter_session_bind refuses an empty binding', async () => {
  const r = await fleet.toolSessionBind({});
  assert.ok(r.error, 'binding nothing would silently mislabel every later snapshot');
});

test('toolFleet reports local_available false instead of pretending zero models', async () => {
  const out = await fleet.toolFleet({}, { sessionsList: async () => ({ sessions: [] }) });
  assert.strictEqual(out.local, null);
  assert.strictEqual(out.local_available, false);
  assert.ok('waves' in out && 'context' in out);
});

test('an unexpanded ${VAR} placeholder is treated as unset, not as a hostname', () => {
  process.env.MOOTER_TEST_VAR = '${MOOTER_TEST_VAR}';
  assert.strictEqual(fleet.envOrNull('MOOTER_TEST_VAR'), null, 'a literal placeholder would silently kill the probe');
  process.env.MOOTER_TEST_VAR = '  ';
  assert.strictEqual(fleet.envOrNull('MOOTER_TEST_VAR'), null);
  process.env.MOOTER_TEST_VAR = ' 127.0.0.1:9 ';
  assert.strictEqual(fleet.envOrNull('MOOTER_TEST_VAR'), '127.0.0.1:9');
  delete process.env.MOOTER_TEST_VAR;
});

test('the UI resource carries the exact MCP Apps contract', () => {
  assert.strictEqual(fleet.UI_MIME, 'text/html;profile=mcp-app');
  assert.strictEqual(fleet.UI_RESOURCE.uri, 'ui://mooter/fleet');
  assert.strictEqual(fleet.UI_RESOURCE.mimeType, fleet.UI_MIME);
  assert.ok(fleet.UI_RESOURCE._meta.ui.csp, 'resource must declare its CSP');
});

test('both tools are exported and mooter_fleet declares its UI', () => {
  const names = fleet.TOOLS.map((t) => t.name);
  assert.deepStrictEqual(names, ['mooter_fleet', 'mooter_session_bind']);
  const t = fleet.TOOLS[0];
  assert.strictEqual(t._meta.ui.resourceUri, 'ui://mooter/fleet');
  assert.deepStrictEqual(t._meta.ui.visibility, ['model', 'app']);
  assert.strictEqual(t._meta['ui/resourceUri'], 'ui://mooter/fleet');
  assert.strictEqual(t.annotations.readOnlyHint, true);
});

test('the panel html is self-contained and speaks the app protocol', () => {
  const html = fleet.readUiHtml();
  assert.ok(html.length > 1000);
  assert.ok(!/https?:\/\//.test(html), 'panel must not reference any external URL');
  assert.ok(html.includes('color-scheme: light dark'), 'without this the iframe canvas is white in dark mode');
  assert.ok(html.includes('ui/initialize'));
  assert.ok(html.includes('ui/notifications/tool-result'));
  // CONTRACT CHANGE in v1.2: money is now ON PURPOSE. "Não consigo ver quantos
  // tokens em tempo real por LLM" was the complaint; a cockpit that hides the
  // meter is not honest, it is just quiet.
  assert.ok(html.includes('tok/s'), 'the panel must show measured throughput');
  assert.ok(html.includes('<svg'), 'the cow must exist — inline, because the default CSP allows no external image');
  assert.ok(html.includes('ui/message'), 'the panel must be able to act, not only display');
  assert.ok(html.includes('--color-text-primary'), 'must use the host theme variables');
});
