// ledger-reduce.test.js — Ledger Spine L1: the single reducer (projection).
// Proves: the last kind:handoff event projects to <sid>.md; replay is
// deterministic (same events → same file); a later handoff supersedes an
// earlier one; and the reducer never throws / never writes a fabricated file.
'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let HOME, OUT;
before(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-ledger-red-'));
  process.env.MOOTER_HOME = HOME;
});
after(() => {
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {}
  delete process.env.MOOTER_HOME;
});
beforeEach(() => { OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-ledger-out-')); });

function fresh() {
  delete require.cache[require.resolve('./handoff-journal.js')];
  delete require.cache[require.resolve('./ledger-reduce.js')];
  return { j: require('./handoff-journal.js'), r: require('./ledger-reduce.js') };
}

test('reduceSession projects the last kind:handoff event → <sid>.md atomically', () => {
  const { j, r } = fresh();
  const sid = 'red-a';
  j.appendTurn(sid, { assistant_snippet: 'noise', n_turn: 1 });
  j.appendEvent({ sid, kind: 'handoff', agent: 'cc', output: { markdown: '# Handoff A\nbody' } });
  const res = r.reduceSession(sid, { outDir: OUT });
  assert.equal(res.ok, true);
  assert.equal(res.file, path.join(OUT, 'red-a.md'));
  assert.equal(fs.readFileSync(res.file, 'utf8'), '# Handoff A\nbody');
});

test('replay is deterministic — same event sequence → identical <sid>.md', () => {
  const { j, r } = fresh();
  const sid = 'red-replay';
  const seq = [
    { kind: 'intent', input: { goal: 'build the spine' } },
    { kind: 'handoff', output: { markdown: '## State\n- done X\n- next Y' } },
  ];
  for (const e of seq) j.appendEvent({ sid, agent: 'cc', ...e });

  const out1 = path.join(OUT, 'run1');
  const r1 = r.reduceSession(sid, { outDir: out1 });
  // Replay the SAME events into a second session id and reduce again.
  const sid2 = 'red-replay-2';
  for (const e of seq) j.appendEvent({ sid: sid2, agent: 'cc', ...e });
  const out2 = path.join(OUT, 'run2');
  const r2 = r.reduceSession(sid2, { outDir: out2 });

  assert.equal(r1.ok && r2.ok, true);
  assert.equal(
    fs.readFileSync(r1.file, 'utf8'),
    fs.readFileSync(r2.file, 'utf8'),
    'same events → byte-identical projection',
  );
  // Re-reducing the same session is also stable (idempotent projection).
  const again = r.reduceSession(sid, { outDir: out1 });
  assert.equal(fs.readFileSync(again.file, 'utf8'), fs.readFileSync(r1.file, 'utf8'));
});

test('a later handoff supersedes an earlier one (last wins)', () => {
  const { j, r } = fresh();
  const sid = 'red-super';
  j.appendEvent({ sid, kind: 'handoff', agent: 'moo1', output: { markdown: 'OLD' } });
  j.appendEvent({ sid, kind: 'handoff', agent: 'moo2', output: { markdown: 'NEW' } });
  const res = r.reduceSession(sid, { outDir: OUT });
  assert.equal(fs.readFileSync(res.file, 'utf8'), 'NEW');
});

test('projectFromEvents is a pure function of the event list', () => {
  const { r } = fresh();
  assert.equal(r.projectFromEvents([
    { kind: 'turn' }, { kind: 'handoff', output: 'raw string body' }, { kind: 'summary' },
  ]), 'raw string body');
  assert.equal(r.projectFromEvents([{ kind: 'handoff', output: { body: 'via body field' } }]), 'via body field');
  assert.equal(r.projectFromEvents([{ kind: 'turn' }]), null, 'no handoff → null');
  assert.equal(r.projectFromEvents([]), null);
});

test('reduceSession skips (never fabricates) when there is no handoff event', () => {
  const { j, r } = fresh();
  const sid = 'red-none';
  j.appendTurn(sid, { assistant_snippet: 'only a turn', n_turn: 1 });
  const res = r.reduceSession(sid, { outDir: OUT });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no-handoff-event');
  assert.equal(fs.existsSync(path.join(OUT, 'red-none.md')), false, 'no file written');
});

test('reduceSession never throws on a write failure (degrades)', () => {
  const { j, r } = fresh();
  const sid = 'red-err';
  j.appendEvent({ sid, kind: 'handoff', output: { markdown: 'x' } });
  const orig = fs.writeFileSync;
  fs.writeFileSync = () => { throw new Error('disk full'); };
  try {
    let res;
    assert.doesNotThrow(() => { res = r.reduceSession(sid, { outDir: OUT }); });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'error');
  } finally { fs.writeFileSync = orig; }
});

test('Gate 2: O_EXCL lock records owner identity and refuses a live holder', () => {
  const { r } = fresh();
  const lockPath = path.join(OUT, '.writer.lock');
  const first = r.acquireFileLock(lockPath, {
    now: 1000, leaseMs: 5000, pid: 101, host: 'host-a', runtime: 'win32:x64', nonce: 'owner-a',
    isProcessAlive: () => true,
  });
  assert.equal(first.ok, true);
  const metadata = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.deepEqual(metadata.owner, { pid: 101, host: 'host-a', runtime: 'win32:x64', nonce: 'owner-a' });
  assert.equal(metadata.lease_expires_at_ms, 6000);
  const second = r.acquireFileLock(lockPath, {
    now: 2000, pid: 202, host: 'host-a', runtime: 'win32:x64', nonce: 'owner-b',
    isProcessAlive: () => true,
  });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'lock-held');
  assert.equal(r.releaseFileLock(first), true);
});

test('Gate 2: an expired lock is recovered only when the same-runtime owner is proven dead', () => {
  const { r } = fresh();
  const lockPath = path.join(OUT, '.writer.lock');
  const old = r.acquireFileLock(lockPath, {
    now: 1000, leaseMs: 10, pid: 101, host: 'host-a', runtime: 'win32:x64', nonce: 'dead-owner',
  });
  assert.equal(old.ok, true);
  const recovered = r.acquireFileLock(lockPath, {
    now: 2000, pid: 202, host: 'host-a', runtime: 'win32:x64', nonce: 'new-owner',
    isProcessAlive: (pid) => pid === 101 ? false : true,
  });
  assert.equal(recovered.ok, true);
  assert.ok(recovered.recovered && fs.existsSync(recovered.recovered), 'expired owner metadata remains auditable');
  assert.equal(r.releaseFileLock(recovered), true);
});

test('Gate 2: cross Windows/WSL expiry requires human audit even if the PID looks dead', () => {
  const { r } = fresh();
  const lockPath = path.join(OUT, '.writer.lock');
  const old = r.acquireFileLock(lockPath, {
    now: 1000, leaseMs: 10, pid: 101, host: 'same-machine', runtime: 'linux:x64', nonce: 'wsl-owner',
  });
  assert.equal(old.ok, true);
  const refused = r.acquireFileLock(lockPath, {
    now: 2000, pid: 202, host: 'same-machine', runtime: 'win32:x64', nonce: 'windows-owner',
    isProcessAlive: () => false,
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'human-audit-required');
  assert.equal(r.releaseFileLock(old), true);
});
