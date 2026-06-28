'use strict';
// mission-control-view.test.js — Frente G · Página Mission Control.
// Render-execution: renderMissionControl runs against a VARIED set of snapshots (full, sparse,
// null, empty, remote/sync null) and must NEVER throw, ALWAYS return non-empty HTML, and emit
// honest `n/d` markers where data is missing — never fabricate. Also asserts the concat-only/
// CSP contract (no inline on* handlers; every action is a data-a button) so the function stays
// safe to serialise into the getHtml() template.

const { test } = require('node:test');
const assert = require('node:assert');

const { renderMissionControl, renderMissionControlSafe } = require('./mission-control-view.js');

// A fully-populated snapshot (mirrors mc-snapshot §6 output shape).
const FULL = {
  at: 999, project: 'frugal-front-G', device: { os: 'win32', id: 'dev-1' },
  scope: {
    projects: [
      { id: 'frugal', name: 'frugal', status: 'active', sessions: 3 },
      { id: 'Cloude Home', name: 'Cloude Home', status: 'idle', sessions: 1 },
    ],
    architecture: [{ id: 'router', name: 'router', sessions: 2 }],
  },
  sessions: [
    {
      sid: 'sess-1', name: 'Build MC view', topic: 'Frente G', model: 'claude-opus-4-8', tier: 'T3',
      tokIn: 1200, tokOut: 800, ctxPct: 50, mode: 'moo', cow: 'MC', auto: true, loop: true,
      status: 'working', needsYou: false, tokPerSec: 42, cost: 0.12, saved: 0.3,
      git: { branch: 'feat/mission-control-page', dirty: 2, ahead: 3, pushNeeded: true, sha: 'abc1234def' },
      sync: { notion: { pageId: 'pg1', at: '2026-06-28T10:00:00Z' }, obsidian: null },
      device: null, worktree: 'frugal-front-G',
    },
    {
      sid: 'sess-2', name: 'Remote moo', topic: null, model: 'qwen3:30b', tier: 'T0',
      tokIn: null, tokOut: null, ctxPct: null, mode: 'zen', auto: false, loop: false,
      status: 'idle', needsYou: false, tokPerSec: null, cost: null, saved: null,
      git: { branch: null, dirty: null, ahead: null, pushNeeded: null, sha: null },
      sync: { notion: null, obsidian: null }, device: 'Mac-mini', worktree: null,
    },
  ],
  loops: [{ id: 'rev', kind: 'review', round: 2, maxRounds: 5, model: 'qwen3:30b', nextInMs: 8000, active: true }],
  gpu: { at: 1, gpus: [{ index: 0, name: 'RTX 4090', utilPct: 30, usedMb: 4000, totalMb: 24000, freeMb: 20000 }], totalMb: 24000, freeMb: 20000, utilPct: 30, fitsMoos: 3 },
  remote: { devices: [{ os: 'darwin', online: true, sessions: 2 }] },
  sync: { notion: { at: '2026-06-28T10:00:00Z' } },
  totals: { savedToday: 0.3, pctLocal: 73, tokensToday: 2000, commitsPending: 1, pushPending: 1, needYou: 0, ctxFull: 0 },
};

// A snapshot with remote/sync null (Frente F not landed) + a session needing attention.
const SYNC_PENDING = {
  at: 1, project: 'frugal', device: null,
  scope: { projects: [{ id: 'frugal', name: 'frugal', status: 'active', sessions: 1 }], architecture: [] },
  sessions: [{
    sid: 's', name: 'needs you', topic: null, model: null, tier: null,
    tokIn: null, tokOut: null, ctxPct: null, mode: null, auto: false, loop: false,
    status: 'needs-you', needsYou: true, tokPerSec: null, cost: null, saved: null,
    git: { branch: 'main', dirty: 0, ahead: 0, pushNeeded: false, sha: null },
    sync: { notion: null, obsidian: null }, device: null, worktree: null,
  }],
  loops: [], gpu: null, remote: null, sync: null,
  totals: { savedToday: null, pctLocal: null, tokensToday: null, commitsPending: 0, pushPending: 0, needYou: 1, ctxFull: 0 },
};

// Minimal/empty snapshot — every collector empty.
const EMPTY = {
  at: 0, project: null, device: null,
  scope: { projects: [], architecture: [] }, sessions: [],
  loops: [], gpu: null, remote: null, sync: null, totals: {},
};

function noThrow(label, snap) {
  let html;
  assert.doesNotThrow(() => { html = renderMissionControl(snap); }, label + ' must not throw');
  assert.equal(typeof html, 'string', label + ' returns a string');
  assert.ok(html.length > 0, label + ' returns non-empty HTML');
  return html;
}

test('renders the full snapshot without throwing, non-empty HTML', () => {
  const html = noThrow('full', FULL);
  assert.ok(html.indexOf('Mission Control') !== -1);
  assert.ok(html.indexOf('frugal-front-G') !== -1, 'project name appears');
  // worktree git-graph link → openSession with the sid
  assert.ok(html.indexOf('data-a="openSession" data-x="sess-1"') !== -1, 'worktree row links to openSession');
  // pilot actions present
  for (const cmd of ['pauseAll', 'resumeAll', 'spawnMoo', 'projHandoff', 'refresh']) {
    assert.ok(html.indexOf('data-a="' + cmd + '"') !== -1, 'pilot action ' + cmd + ' present');
  }
  // GPU gauge + fitsMoos
  assert.ok(html.indexOf('cabem <b>3</b> moos') !== -1, 'GPU fitsMoos rendered');
  // loops band
  assert.ok(html.indexOf('review') !== -1, 'loop kind rendered');
  // Moo assistant input + example chips
  assert.ok(html.indexOf('id="mcMooIn"') !== -1, 'Moo input present');
  assert.ok(html.indexOf('data-q="') !== -1, 'Moo example chips present');
  // remote device rendered
  assert.ok(html.indexOf('darwin') !== -1, 'remote device rendered');
});

test('sync pending: remote/sync null → "sync pending", needs-you surfaced', () => {
  const html = noThrow('sync-pending', SYNC_PENDING);
  assert.ok(html.indexOf('sync pending') !== -1, 'shows sync pending when remote null');
  assert.ok(html.indexOf('mc-need') !== -1, 'needs-you status surfaced');
});

test('empty snapshot renders honest n/d, never fabricates', () => {
  const html = noThrow('empty', EMPTY);
  assert.ok(html.indexOf('n/d') !== -1, 'honest n/d markers present');
  // no GPU cache → must say n/d, never invent VRAM
  assert.ok(html.indexOf('cabem') === -1 || html.indexOf('n/d') !== -1);
});

test('null / undefined / garbage snapshots never throw', () => {
  noThrow('null', null);
  noThrow('undefined', undefined);
  noThrow('number', 42);
  noThrow('string', 'oops');
  noThrow('array', []);
  noThrow('partial', { sessions: null, scope: null, totals: null, gpu: 'not-an-object' });
});

test('CSP-safe / concat-only contract: no inline event handlers, no backticks', () => {
  const html = renderMissionControl(FULL);
  assert.ok(!/on(click|load|error|mouseover)=/i.test(html), 'no inline on* handlers');
  assert.ok(html.indexOf('`') === -1, 'no backticks in rendered output');
  assert.ok(html.indexOf('${') === -1, 'no template-literal interpolation in output');
  // The function SOURCE itself must be backtick/${}-free (it gets serialised into a template literal).
  const src = renderMissionControl.toString();
  assert.ok(src.indexOf('`') === -1, 'function source has no backticks');
  assert.ok(src.indexOf('${') === -1, 'function source has no ${ interpolation');
});

test('renderMissionControlSafe swallows a thrown render and returns a string', () => {
  // Force a throw by making esc blow up via a hostile getter on a field it reads.
  const hostile = { get project() { throw new Error('boom'); } };
  const html = renderMissionControlSafe(hostile);
  assert.equal(typeof html, 'string');
  assert.ok(html.indexOf('erro de render') !== -1, 'safe wrapper reports the error honestly');
});

test('escapes HTML in snapshot strings (no injection)', () => {
  const evil = {
    project: '<img src=x onerror=alert(1)>',
    scope: { projects: [{ name: '<script>bad</script>', status: 'idle', sessions: 0 }], architecture: [] },
    sessions: [], loops: [], gpu: null, remote: null, sync: null, totals: {},
  };
  const html = renderMissionControl(evil);
  assert.ok(html.indexOf('<img src=x') === -1, 'raw img tag must be escaped');
  assert.ok(html.indexOf('<script>bad') === -1, 'raw script tag must be escaped');
  assert.ok(html.indexOf('&lt;img') !== -1, 'escaped form present');
});
