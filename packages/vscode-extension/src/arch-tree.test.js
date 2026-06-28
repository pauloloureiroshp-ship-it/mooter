'use strict';

// arch-tree.test.js — Frente E. renderArchTree(snapshot, mode) must render all 3 modes
// (🌳 tree · 📊 ceo · 🔌 wt) PURELY from the MissionControlSnapshot, never throw, return
// non-empty HTML, stay concat-only (its source is embedded into the webview via fn.toString()),
// be clickable→openSession, and stay honest (n/d / "sync pending" when data is absent).

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

const MODES = ['tree', 'ceo', 'wt'];

test('renderArchTree is concat-only (no template literals — webview-embeddable)', () => {
  const src = renderArchTree.toString();
  assert.ok(src.indexOf('`') === -1, 'no backticks allowed in webview-embedded source');
});

test('archMode normalises aliases to the 3 canonical modes', () => {
  assert.strictEqual(archMode(''), 'tree');
  assert.strictEqual(archMode('arvore'), 'tree');
  assert.strictEqual(archMode('ceo'), 'ceo');
  assert.strictEqual(archMode('working-tree'), 'wt');
  assert.strictEqual(archMode('wt'), 'wt');
  assert.strictEqual(archMode(null), 'tree');
});

test('renders all 3 modes: non-empty HTML, never throws, includes the mode switcher', () => {
  const snap = fullSnap();
  for (const mode of MODES) {
    let html;
    assert.doesNotThrow(() => { html = renderArchTree(snap, mode); }, 'mode ' + mode + ' must not throw');
    assert.ok(typeof html === 'string' && html.length > 0, 'mode ' + mode + ' → non-empty HTML');
    assert.ok(/arch-wrap/.test(html), 'wrapper present');
    assert.ok(/data-arch-mode="tree"/.test(html) && /data-arch-mode="ceo"/.test(html) && /data-arch-mode="wt"/.test(html), 'switcher has all 3 modes');
    assert.ok(html.indexOf('data-arch-mode="' + mode + '"') >= 0, 'current mode button present');
  }
});

test('tree mode: per-session detail, clickable→openSession, identity emojis', () => {
  const html = renderArchTree(fullSnap(), 'tree');
  assert.ok(/data-arch="tree"/.test(html));
  // clickable leaves carry the session id for openSession
  assert.ok(/data-arch-sid="aaaa1111"/.test(html) && /data-arch-sid="bbbb2222"/.test(html));
  // working cow 🐮 + idle 😴 + loop identity present somewhere
  assert.ok(html.indexOf('🐮') >= 0 || html.indexOf('😴') >= 0, 'mood cows rendered');
  // topic emoji from the keyword map (UX → 🖌️, routing → 🧮)
  assert.ok(html.indexOf('🖌️') >= 0 || html.indexOf('🧮') >= 0, 'topic emoji rendered');
  // tier + tokens + ctx
  assert.ok(/T3/.test(html) && /T0/.test(html), 'tiers shown');
  assert.ok(/84%/.test(html), 'ctx% shown');
});

test('ceo mode: KPIs from totals + attention-first', () => {
  const html = renderArchTree(fullSnap(), 'ceo');
  assert.ok(/data-arch="ceo"/.test(html));
  assert.ok(/\$1\.23/.test(html), 'savedToday KPI');
  assert.ok(/67%/.test(html), 'pctLocal KPI');
  assert.ok(/Precisam de ti/.test(html), 'attention section');
  assert.ok(/Portfolio/.test(html), 'portfolio section');
  assert.ok(/landing/.test(html), 'projects listed');
});

test('wt mode: connections + honest "sync pending" when remote/sync are null', () => {
  const html = renderArchTree(fullSnap(), 'wt');
  assert.ok(/data-arch="wt"/.test(html));
  assert.ok(/main . frentes|main &.; frentes|main/.test(html));
  assert.ok(/sync pending/.test(html), 'remote null → sync pending (Frente F), never fabricated');
  // registo aggregates per-session sync counts (1 notion, 1 obsidian)
  assert.ok(/Notion/.test(html) && /Obsidian/.test(html));
  assert.ok(/round 3\/10/.test(html), 'loop round shown from snapshot');
});

test('null snapshot → honest empty state, still has switcher, never throws', () => {
  let html;
  assert.doesNotThrow(() => { html = renderArchTree(null, 'tree'); });
  assert.ok(/à espera do snapshot/.test(html), 'honest empty state');
  assert.ok(/data-arch-mode="ceo"/.test(html), 'switcher still rendered');
});

test('missing fields render n/d — never fabricated', () => {
  const bare = {
    project: 'p', device: { os: null }, scope: { projects: [] },
    sessions: [{ sid: 'x', name: 's', topic: null, model: null, tier: null, tokIn: null, tokOut: null, ctxPct: null, status: 'idle', needsYou: false, sync: {} }],
    loops: [], gpu: null, remote: null, sync: null, totals: {},
  };
  const tree = renderArchTree(bare, 'tree');
  assert.ok(/n\/d/.test(tree), 'missing model → n/d');
  const ceo = renderArchTree(bare, 'ceo');
  assert.ok(/n\/d/.test(ceo), 'missing totals → n/d, never invented');
});

test('escapes session names/topics (no HTML injection)', () => {
  const snap = fullSnap();
  snap.sessions[0].topic = '<img src=x onerror=alert(1)>';
  snap.sessions[0].name = '<img src=x onerror=alert(1)>';
  for (const mode of MODES) {
    const html = renderArchTree(snap, mode);
    assert.ok(html.indexOf('<img src=x') === -1, 'raw tag must be escaped in mode ' + mode);
  }
  assert.ok(/&lt;img/.test(renderArchTree(snap, 'tree')));
});

test('garbage input never throws (malformed sessions/projects)', () => {
  assert.doesNotThrow(() => renderArchTree({ sessions: [null, {}, undefined], scope: null, totals: null }, 'tree'));
  assert.doesNotThrow(() => renderArchTree({ sessions: 'nope', scope: { projects: 'nope' } }, 'ceo'));
  assert.doesNotThrow(() => renderArchTree({}, 'wt'));
  assert.doesNotThrow(() => renderArchTree(undefined, 'zzz'));
});
