// cockpit-loop.test.js — Autopilot Loop module (node --test). Pure fs + render, no vscode.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const loop = require('./cockpit-loop');

// Build an isolated repo root with a _handoff/loop/ bus we control per-test.
function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-loop-'));
  fs.mkdirSync(path.join(root, '_handoff', 'loop'), { recursive: true });
  return root;
}
const busFile = (root, f) => path.join(root, '_handoff', 'loop', f);
function writeState(root, obj) { fs.writeFileSync(busFile(root, 'STATE.json'), JSON.stringify(obj)); }

test('readLoopState: missing bus dir → { present:false } (never throws)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-noloop-'));
  const s = loop.readLoopState(root);
  assert.equal(s.present, false);
});

test('readLoopState: idle state when STATE.json absent', () => {
  const root = mkRepo(); // dir exists, no STATE.json
  const s = loop.readLoopState(root);
  assert.equal(s.present, true);
  assert.equal(s.status, 'idle');
  assert.equal(s.round, 0);
});

test('readLoopState: cc_running reflects round/maxRounds/wave/branch + ledger tail', () => {
  const root = mkRepo();
  writeState(root, { status: 'cc_running', round: 3, maxRounds: 12, wave: 'council-quality-eval', branch: 'wave-council-d' });
  fs.writeFileSync(busFile(root, 'ledger.jsonl'),
    [JSON.stringify({ ts: '2026-06-22T10:00:00Z', round: 1, ok: true }),
     JSON.stringify({ ts: '2026-06-22T10:05:00Z', round: 2, ok: false })].join('\n') + '\n');
  const s = loop.readLoopState(root);
  assert.equal(s.status, 'cc_running');
  assert.equal(s.round, 3);
  assert.equal(s.maxRounds, 12);
  assert.equal(s.wave, 'council-quality-eval');
  assert.equal(s.branch, 'wave-council-d');
  assert.equal(s.ledger.length, 2);
  assert.equal(s.ledger[1].ok, false);
});

test('readLoopState: awaiting_human surfaces the ASK_HUMAN question', () => {
  const root = mkRepo();
  writeState(root, { status: 'awaiting_human', round: 5 });
  fs.writeFileSync(busFile(root, 'ASK_HUMAN.md'), 'Open PR to wave-council-d? (irreversible)');
  const s = loop.readLoopState(root);
  assert.equal(s.status, 'awaiting_human');
  assert.match(s.askHuman, /Open PR/);
});

test('readLoopState: STOP sentinel forces status=stopped (kill switch)', () => {
  const root = mkRepo();
  writeState(root, { status: 'cc_running', round: 2 });
  fs.writeFileSync(busFile(root, 'STOP'), '');
  const s = loop.readLoopState(root);
  assert.equal(s.status, 'stopped');
});

test('readLoopState: done state', () => {
  const root = mkRepo();
  writeState(root, { status: 'done', round: 7 });
  assert.equal(loop.readLoopState(root).status, 'done');
});

test('renderLoopTab: not-present → init hint + a CSP-safe Start button (data-loop)', () => {
  const html = loop.renderLoopTab({ present: false });
  assert.match(html, /não inicializado/);
  assert.match(html, /data-loop="loopStart"/);
  assert.doesNotMatch(html, /onclick=/); // CSP: no inline handlers
});

test('renderLoopTab: cc_running → status pill + Stop button + scoped CSS', () => {
  const html = loop.renderLoopTab({ present: true, status: 'cc_running', round: 2, maxRounds: 12, ledger: [] });
  assert.match(html, /CC working/);
  assert.match(html, /round 2\/12/);
  assert.match(html, /data-loop="loopStop"/);
  assert.match(html, /\.loopwrap \.pill\{/); // CSS scoped, won't leak to other tabs
  assert.doesNotMatch(html, /onclick=/);
});

test('renderLoopTab: awaiting_human → "Needs you" card with Approve/Reject (escaped)', () => {
  const html = loop.renderLoopTab({ present: true, status: 'awaiting_human', round: 5, askHuman: 'merge <main> & deploy?', ledger: [] });
  assert.match(html, /precisa de ti/);
  assert.match(html, /data-loop="loopApprove"/);
  assert.match(html, /data-loop="loopReject"/);
  assert.match(html, /merge &lt;main&gt; &amp; deploy\?/); // html-escaped
});

test('renderLoopTab: done/stopped → offer a fresh Start', () => {
  for (const status of ['done', 'stopped']) {
    const html = loop.renderLoopTab({ present: true, status, round: 9, ledger: [] });
    assert.match(html, /data-loop="loopStart"/);
  }
});

test('stopLoop / approveHuman write the bus sentinels', () => {
  const root = mkRepo();
  loop.stopLoop(root);
  assert.ok(fs.existsSync(busFile(root, 'STOP')), 'STOP written');
  loop.approveHuman(root);
  assert.ok(fs.existsSync(busFile(root, 'HUMAN_OK')), 'HUMAN_OK written');
});
