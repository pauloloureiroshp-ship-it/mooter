'use strict';

// arch-tree.test.js — Aba Arquitectura. After POLISH_F3 (C2) the tab collapsed from 3 modes
// to a SINGLE working-tree system graph (the only view with an insight no other tab gives;
// 🌳 tree / 📊 ceo duplicated Mission Control). renderArchTree(snapshot[, mode]) must render
// that graph PURELY from the MissionControlSnapshot, never throw, return non-empty HTML, stay
// concat-only (its source is embedded into the webview via fn.toString()), be
// clickable→openSession, and stay honest (n/d / "sync pending" when data is absent).

const { test } = require('node:test');
const assert = require('node:assert');

const { renderArchTree, archMode } = require('./arch-tree.js');

// A representative snapshot (schema §6) — sessions in mixed states, projects, loops; remote/sync null.
function fullSnap() {
  return {
    at: 1,
    project: 'mooter',
    device: { os: 'win32', id: null },
    scope: {
      projects: [
        { id: 'mooter', name: 'mooter', status: 'active', sessions: 2 },
        { id: 'site', name: 'landing', status: 'idle', sessions: 1 },
      ],
      architecture: [],
    },
    sessions: [
      {
        sid: 'aaaa1111', name: 'fix the router', topic: 'algoritmo de routing',
        model: 'claude-opus-4-8', tier: 'T3', tokIn: 12000, tokOut: 3400, ctxPct: 84,
        mode: 'crazy', auto: true, loop: false, status: 'working', needsYou: false,
        tokPerSec: 40, cost: 0.5, saved: 0.3,
        git: { branch: 'main', dirty: 2, ahead: 0, pushNeeded: false, sha: 'abc' },
        sync: { notion: { pageId: 'p1', at: 2 }, obsidian: null }, device: null, worktree: null,
      },
      {
        sid: 'bbbb2222', name: 'review UI', topic: 'UX polish do cockpit',
        model: 'qwen2.5:3b', tier: 'T0', tokIn: 200, tokOut: 80, ctxPct: 12,
        mode: 'lazy', auto: false, loop: true, status: 'idle', needsYou: true,
        tokPerSec: 200, cost: 0, saved: 0.1,
        git: { branch: 'feat/x', dirty: 0, ahead: 1, pushNeeded: true, sha: 'def' },
        sync: { notion: null, obsidian: { path: '/v/n.md', at: 3 } }, device: null, worktree: 'wt-x',
      },
    ],
    loops: [{ id: 'loop', kind: 'loop', round: 3, maxRounds: 10, model: 'qwen3:30b', nextInMs: 5000, active: true }],
    gpu: null,
    remote: null,
    sync: null,
    totals: { savedToday: 1.23, pctLocal: 67, tokensToday: 15680, commitsPending: 1, pushPending: 1, needYou: 1, ctxFull: 1 },
  };
}

test('renderArchTree is concat-only (no template literals — webview-embeddable)', () => {
  const src = renderArchTree.toString();
  assert.ok(src.indexOf('`') === -1, 'no backticks allowed in webview-embedded source');
});

test('archMode resolves to the single canonical mode wt (C2 collapse)', () => {
  assert.strictEqual(archMode(), 'wt');
  assert.strictEqual(archMode('tree'), 'wt', 'legacy aliases collapse to wt');
  assert.strictEqual(archMode('ceo'), 'wt');
});

test('renders the system graph: non-empty HTML, no mode switcher any more', () => {
  const snap = fullSnap();
  let html;
  assert.doesNotThrow(() => { html = renderArchTree(snap); }, 'must not throw');
  assert.ok(typeof html === 'string' && html.length > 0, 'non-empty HTML');
  assert.ok(/arch-wrap/.test(html), 'wrapper present');
  assert.ok(/data-arch="wt"/.test(html), 'renders the working-tree graph');
  assert.ok(html.indexOf('data-arch-mode=') === -1, 'the 3-mode switcher is gone (single mode)');
  // legacy modes no longer rendered
  assert.ok(html.indexOf('data-arch="tree"') === -1 && html.indexOf('data-arch="ceo"') === -1, 'tree/ceo modes removed');
});

test('system graph: git branches clickable→openSession', () => {
  const html = renderArchTree(fullSnap());
  assert.ok(/data-arch-sid="aaaa1111"/.test(html) && /data-arch-sid="bbbb2222"/.test(html), 'branches carry the session id');
  assert.ok(/main . frentes|main &.; frentes|main/.test(html), 'main → frentes spine');
});

test('system graph: connections + honest "sync pending" when remote/sync are null', () => {
  const html = renderArchTree(fullSnap());
  assert.ok(/sync pending/.test(html), 'remote null → sync pending (Frente F), never fabricated');
  // registo aggregates per-session sync counts (1 notion, 1 obsidian)
  assert.ok(/Notion/.test(html) && /Obsidian/.test(html));
  assert.ok(/contratos/.test(html), 'contract node present');
  assert.ok(/round 3\/10/.test(html), 'loop round shown from snapshot');
});

test('no portfolio mock identity any more (C1: PORTFOLIO removed)', () => {
  const html = renderArchTree(fullSnap());
  assert.ok(html.indexOf('Cloude Home') === -1 && html.indexOf('Marley') === -1, 'hardcoded mock projects gone');
});

test('null snapshot → honest empty state, no switcher, never throws', () => {
  let html;
  assert.doesNotThrow(() => { html = renderArchTree(null); });
  assert.ok(/à espera do snapshot/.test(html), 'honest empty state');
  assert.ok(html.indexOf('data-arch-mode=') === -1, 'no switcher in the empty state');
});

test('missing fields render n/d — never fabricated', () => {
  const bare = {
    project: 'p', device: { os: null }, scope: { projects: [] },
    sessions: [{ sid: 'x', name: 's', topic: null, model: null, tier: null, tokIn: null, tokOut: null, ctxPct: null, status: 'idle', needsYou: false, sync: {} }],
    loops: [], gpu: null, remote: null, sync: null, totals: {},
  };
  const html = renderArchTree(bare);
  assert.ok(/n\/d/.test(html), 'missing model → n/d');
});

test('escapes session names/topics (no HTML injection)', () => {
  const snap = fullSnap();
  snap.sessions[0].topic = '<img src=x onerror=alert(1)>';
  snap.sessions[0].name = '<img src=x onerror=alert(1)>';
  const html = renderArchTree(snap);
  assert.ok(html.indexOf('<img src=x') === -1, 'raw tag must be escaped');
  assert.ok(/&lt;img/.test(html));
});

test('garbage input never throws (malformed sessions/projects)', () => {
  assert.doesNotThrow(() => renderArchTree({ sessions: [null, {}, undefined], scope: null, totals: null }));
  assert.doesNotThrow(() => renderArchTree({ sessions: 'nope', scope: { projects: 'nope' } }));
  assert.doesNotThrow(() => renderArchTree({}));
  assert.doesNotThrow(() => renderArchTree(undefined, 'zzz'));
});
