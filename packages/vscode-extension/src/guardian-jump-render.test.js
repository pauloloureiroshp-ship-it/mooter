'use strict';
// guardian-jump-render.test.js — F3 gate proof (the closest honest stand-in for the live demo):
// the "⇄ Saltar para fresca" button is rendered ONLY at the delirium threshold (advise ≥90),
// in BOTH surfaces — the cockpit row (renderRow) and the Mission Control card (renderMissionControl)
// — and is wired to the guardianJump host handler via data-a/data-x (concat-only, CSP-safe).
const { test } = require('node:test');
const assert = require('node:assert');
const rr = require('./row-renderer');
const { renderMissionControl } = require('./mission-control-view.js');

const BASE_ROW = {
  fullId: 'abc12345-dead-beef-1234-567890abcdef', id: 'abc12345', name: 'hot session',
  mode: 'moo', model: 'claude-opus-4-6', auto: false, project: 'Mooter.ai', brainTitle: null,
  working: false, needsYou: false, waitingForCowork: false, coworkStatus: null, coworkTitle: null,
  ageMs: 120000, branch: null, cwd: null, pr: null, worktree: null,
  notionPageId: null, notionSyncedAt: null, obsidianPath: null, obsidianSyncedAt: null,
  lastActiveTs: 1000,
};

// ── Cockpit (renderRow) ─────────────────────────────────────────────────────
test('cockpit: jump button appears at ctxTokens ≥ 90% (185k/200k = 93%)', () => {
  const html = rr.renderRow(Object.assign({}, BASE_ROW, { ctxTokens: 185000 }), {});
  assert.ok(html.includes('data-a="guardianJump"'), 'guardianJump wired');
  assert.ok(html.includes('data-x="abc12345-dead-beef-1234-567890abcdef"'), 'carries the session id');
  assert.ok(html.includes('Saltar para fresca'), 'shows the label');
  assert.ok(html.includes('93%'), 'shows the live fill %');
});

test('cockpit: NO jump button below the threshold (80k/200k = 40%)', () => {
  const html = rr.renderRow(Object.assign({}, BASE_ROW, { ctxTokens: 80000 }), {});
  assert.ok(!html.includes('guardianJump'), 'no jump button below advise');
});

test('cockpit: [1m] window keeps a big session below threshold (185k/1M = 19%)', () => {
  const html = rr.renderRow(Object.assign({}, BASE_ROW, { ctxTokens: 185000, model: 'claude-opus-4-8[1m]' }), {});
  assert.ok(!html.includes('guardianJump'), '1M-window session at 19% must not offer the jump');
});

test('cockpit: prefers an explicit ctxPct when the host provides one', () => {
  const html = rr.renderRow(Object.assign({}, BASE_ROW, { ctxPct: 96 }), {});
  assert.ok(html.includes('guardianJump') && html.includes('96%'));
});

test('cockpit: unknown context fill → no button (defensive default)', () => {
  const html = rr.renderRow(Object.assign({}, BASE_ROW, {}), {});
  assert.ok(!html.includes('guardianJump'), 'never fabricate a jump when fill is unknown');
});

// ── Mission Control (renderMissionControl) ──────────────────────────────────
function mcSnapshot(ctxPct) {
  return {
    at: 1, project: 'frugal', device: null,
    scope: { projects: [{ id: 'frugal', name: 'frugal', status: 'active', sessions: 1 }], architecture: [] },
    sessions: [{
      sid: 'sess-hot', name: 'hot', topic: 'ctx', model: 'claude-opus-4-8', tier: 'T3',
      tokIn: 1, tokOut: 1, ctxPct, mode: 'moo', auto: false, loop: false,
      status: 'working', needsYou: false, tokPerSec: null, cost: 0.1, saved: 0.1,
      git: { branch: 'feat/x', dirty: 0, ahead: 0, pushNeeded: false, sha: 'deadbee' },
      sync: { notion: null, obsidian: null }, device: null, worktree: null,
    }],
    loops: [], gpu: null, remote: null, sync: null,
    totals: { savedToday: null, pctLocal: null, tokensToday: null, commitsPending: 0, pushPending: 0, needYou: 0, ctxFull: 0 },
  };
}

test('MC: jump button appears on a card at ≥ 90%', () => {
  const html = renderMissionControl(mcSnapshot(92));
  assert.ok(html.includes('data-a="guardianJump"'), 'guardianJump wired in MC');
  assert.ok(html.includes('data-x="sess-hot"'), 'carries the session id');
  assert.ok(html.includes('Saltar para fresca'));
  assert.ok(html.includes('92%'));
});

test('MC: NO jump button below the threshold', () => {
  const html = renderMissionControl(mcSnapshot(50));
  assert.ok(!html.includes('guardianJump'), 'no jump below advise in MC');
});

test('MC: unknown ctxPct → no button', () => {
  const html = renderMissionControl(mcSnapshot(null));
  assert.ok(!html.includes('guardianJump'));
});
