'use strict';
/**
 * seamless.test.js — hermetic tests for mooter-bridge v0.2 (node --test).
 * No real CLI is ever spawned: the job spawner is injected. The ledger and
 * jobs dir live in a temp MOOTER_HOME. Worktree checks use a real `git init`
 * temp repo (git is a hard dependency of the product anyway).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { EventEmitter } = require('events');

// isolate BEFORE requiring the module under test
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'seamless-test-'));
process.env.MOOTER_HOME = path.join(TMP, 'mooter-home');
process.env.MOOTER_WORKTREE_ROOT = TMP;

// fake repo with a stub FROZEN classifier (route is tested against the seam,
// the real classify.js contract is exercised in the repo's own suite)
const FAKEREPO = path.join(TMP, 'frugal');
fs.mkdirSync(path.join(FAKEREPO, 'tools', 'router'), { recursive: true });
fs.writeFileSync(path.join(FAKEREPO, 'tools', 'router', 'classify.js'),
  "module.exports={classify:(t)=>({tier:'T2',confidence:0.9,reasoning:'stub',recommended_model:'sonnet'})};");
process.env.MOOTER_REPO = FAKEREPO;

const seam = require('./seamless.js');

// a real git worktree
const WT = path.join(TMP, 'frugal-wt-a');
fs.mkdirSync(WT, { recursive: true });
execFileSync('git', ['init', '-q', WT]);

function fakeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter(); c.stdout.pipe = () => {};
  c.stderr = new EventEmitter(); c.stderr.pipe = () => {};
  c.kill = () => { c.emit('close', 137); };
  return c;
}

const MP = '⇄ ROUTING\nDE: teste\nPARA: cc\n\nDiz apenas "ok".';

test('guard: recusa agent desconhecido, mp sem ⇄, worktree inexistente, vault', () => {
  let g = seam.guardCheck({ agent: 'gpt', worktree: WT, masterprompt: MP, wave: 'w' });
  assert.ok(!g.ok && g.reasons.some((r) => r.includes('desconhecido')));
  g = seam.guardCheck({ agent: 'cc', worktree: WT, masterprompt: 'sem cabecalho', wave: 'w' });
  assert.ok(!g.ok && g.reasons.some((r) => r.includes('⇄')));
  g = seam.guardCheck({ agent: 'cc', worktree: path.join(TMP, 'nope'), masterprompt: MP, wave: 'w' });
  assert.ok(!g.ok && g.reasons.some((r) => r.includes('não existe')));
  g = seam.guardCheck({ agent: 'cc', worktree: path.join(TMP, 'paulo-vault', 'x'), masterprompt: MP, wave: 'w' });
  assert.ok(!g.ok && g.reasons.some((r) => r.includes('vault')));
  g = seam.guardCheck({ agent: 'cc', worktree: WT, masterprompt: MP, wave: 'w"quote' });
  assert.ok(!g.ok && g.reasons.some((r) => r.includes('aspas')));
});

test('guard: aceita worktree git válida e livre', () => {
  const g = seam.guardCheck({ agent: 'cc', worktree: WT, masterprompt: MP, wave: 'w' });
  assert.deepStrictEqual(g, { ok: true, reasons: [] });
});

test('route: usa o classifier (stub) e mapeia tier→agent', async () => {
  const r = await seam.toolRoute({ text: 'qualquer tarefa' });
  assert.strictEqual(r.agent, 'cc');
  assert.strictEqual(r.tier, 'T2');
  assert.strictEqual(r.confidence, 0.9);
  assert.ok(r.routing_note.includes('FROZEN'));
});

test('dispatch: guard-first, ledger dispatched→started→done, cost do CC json, collect idempotente', async () => {
  let spawned = null;
  seam.setJobSpawner((cmd, cwd) => { spawned = { cmd, cwd }; const c = fakeChild(); setImmediate(() => c.emit('spawn')); return c; });

  const d = await seam.toolDispatch({ agent: 'cc', worktree: WT, masterprompt: MP, wave: 'm1', allowedTools: 'Read' });
  assert.ok(d.job_id, JSON.stringify(d));
  assert.strictEqual(path.resolve(spawned.cwd), path.resolve(WT));
  assert.ok(spawned.cmd.bin === 'claude' && spawned.cmd.args.includes('--output-format'));

  // masterprompt landed in the job dir; CLI is pointed at the file, not inline
  const jobDir = path.join(process.env.MOOTER_HOME, 'jobs', d.job_id);
  assert.strictEqual(fs.readFileSync(path.join(jobDir, 'masterprompt.md'), 'utf8'), MP);
  assert.ok(spawned.cmd.args.some((a) => String(a).includes('masterprompt.md')));

  // simulate CC writing its json result, then closing 0
  // (wait a tick first: the module's WriteStream open() truncates out.log async)
  await new Promise((r) => setTimeout(r, 30));
  fs.writeFileSync(path.join(jobDir, 'out.log'), JSON.stringify({ result: 'ok', total_cost_usd: 0.0123, session_id: 'sess-1' }));
  const reg = seam.REGISTRY.get(d.job_id);
  reg.child.emit('close', 0);
  await new Promise((r) => setTimeout(r, 20));

  const evs = seam.ledgerRead().filter((e) => e.job_id === d.job_id).map((e) => e.event);
  assert.deepStrictEqual(evs, ['dispatched', 'started', 'done']);
  const doneEv = seam.ledgerRead().find((e) => e.job_id === d.job_id && e.event === 'done');
  assert.strictEqual(doneEv.cost_usd, 0.0123);
  assert.strictEqual(typeof doneEv.duration_s, 'number');
  assert.ok(doneEv.mp_hash && doneEv.mp_hash.length === 64);

  // status
  const st = await seam.toolStatus({ job_id: d.job_id });
  assert.strictEqual(st.jobs[0].last, 'done');
  assert.strictEqual(st.jobs[0].alive, false);

  // collect (1ª vez) + idempotência
  const c1 = await seam.toolCollect({ job_id: d.job_id });
  assert.strictEqual(c1.result, 'ok');
  assert.strictEqual(c1.cost_usd, 0.0123);
  assert.strictEqual(c1.session_id, 'sess-1');
  const c2 = await seam.toolCollect({ job_id: d.job_id });
  assert.ok(c2.idempotent.includes('já tinha'));
  const collected = seam.ledgerRead().filter((e) => e.job_id === d.job_id && e.event === 'collected');
  assert.strictEqual(collected.length, 1, 'collected não pode duplicar');
});

test('posse: worktree com job ativo é recusada até o job terminar', async () => {
  seam.setJobSpawner(() => { const c = fakeChild(); setImmediate(() => c.emit('spawn')); return c; });
  const WT2 = path.join(TMP, 'frugal-wt-b');
  fs.mkdirSync(WT2, { recursive: true });
  execFileSync('git', ['init', '-q', WT2]);

  const d1 = await seam.toolDispatch({ agent: 'codex', worktree: WT2, masterprompt: MP, wave: 'm1' });
  assert.ok(d1.job_id);
  const d2 = await seam.toolDispatch({ agent: 'cc', worktree: WT2, masterprompt: MP, wave: 'm1' });
  assert.ok(d2.error && d2.reasons.some((r) => r.includes('posse')), JSON.stringify(d2));

  seam.REGISTRY.get(d1.job_id).child.emit('close', 0);
  await new Promise((r) => setTimeout(r, 20));
  const d3 = await seam.toolDispatch({ agent: 'cc', worktree: WT2, masterprompt: MP, wave: 'm1' });
  assert.ok(d3.job_id, 'worktree liberta após done: ' + JSON.stringify(d3));
  seam.REGISTRY.get(d3.job_id).child.emit('close', 1);
  await new Promise((r) => setTimeout(r, 20));
  const failed = seam.ledgerRead().find((e) => e.job_id === d3.job_id && e.event === 'failed');
  assert.strictEqual(failed.exit_code, 1);
});

test('collect: resultado grande vem truncado com path do ficheiro completo', async () => {
  seam.setJobSpawner(() => { const c = fakeChild(); setImmediate(() => c.emit('spawn')); return c; });
  const WT3 = path.join(TMP, 'frugal-wt-c');
  fs.mkdirSync(WT3, { recursive: true });
  execFileSync('git', ['init', '-q', WT3]);
  const d = await seam.toolDispatch({ agent: 'gemini', worktree: WT3, masterprompt: MP, wave: 'm1' });
  const jobDir = path.join(process.env.MOOTER_HOME, 'jobs', d.job_id);
  await new Promise((r) => setTimeout(r, 30));
  fs.writeFileSync(path.join(jobDir, 'out.log'), 'x'.repeat(150_000));
  seam.REGISTRY.get(d.job_id).child.emit('close', 0);
  await new Promise((r) => setTimeout(r, 20));
  const c = await seam.toolCollect({ job_id: d.job_id });
  assert.strictEqual(c.truncated, true);
  assert.ok(c.full_path && c.full_path.includes(d.job_id));
  assert.ok(c.result.length < 10_000);
});

test('collect antes do fim: devolve estado, não resultado', async () => {
  seam.setJobSpawner(() => { const c = fakeChild(); setImmediate(() => c.emit('spawn')); return c; });
  const WT4 = path.join(TMP, 'frugal-wt-d');
  fs.mkdirSync(WT4, { recursive: true });
  execFileSync('git', ['init', '-q', WT4]);
  const d = await seam.toolDispatch({ agent: 'cc', worktree: WT4, masterprompt: MP, wave: 'm2' });
  const c = await seam.toolCollect({ job_id: d.job_id });
  assert.ok(c.note && c.note.includes('não terminou'));
  seam.REGISTRY.get(d.job_id).child.emit('close', 0);
});

test('server-seamless: regista as 4 tools no registry do server.js base', () => {
  const base = require('./server.js');
  require('./server-seamless.js');
  const names = base.TOOLS.map((t) => t.name);
  for (const n of ['mooter_route', 'mooter_dispatch', 'mooter_status', 'mooter_collect']) {
    assert.ok(names.includes(n), n + ' ausente');
  }
  for (const t of base.TOOLS) {
    assert.ok(t.annotations && typeof t.annotations.title === 'string', t.name + ' sem annotation title');
    assert.ok('readOnlyHint' in t.annotations, t.name + ' sem readOnlyHint');
  }
});
