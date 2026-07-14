'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const LPV = require('./live-preview-view.js');

const esc = (x) => String(x == null ? '' : x).replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]));
function webviewFn(fn) { return new Function('esc', 'return (' + fn.toString() + ')')(esc); }

const overview = webviewFn(LPV.renderExecutiveOverview);
const timeline = webviewFn(LPV.renderExecutiveTimeline);
const sessions = webviewFn(LPV.renderSessionBreakdown);

function fixture() {
  return {
    coverage: { steps: 9, sessions: 2, titledSessions: 2, modelAttributedSteps: 8, ledgerPresent: true, ledgerEvents: 3, warnings: [] },
    agents: [{ agent: 'codex', channels: ['subscription'], models: ['codex'], steps: 3, lastTs: '2026-07-12T12:00:00Z' }],
    handoffs: [{ agent: 'claude-code', targets: ['codex', 'ollama'], summary: 'Validate the release' }],
    delivery: { waves: ['meo-cto'], prs: ['#247'], branches: ['feat/meo'] },
    mirrors: { notion: [{ notionRef: 'notion://mooter' }], obsidian: [{ obsidianRef: 'Mooter/meo.md' }] },
    timeline: [{ ts: '2026-07-12T12:00:00Z', agent: 'codex', channel: 'subscription', model: 'codex', sessionTitle: 'MEO CTO', source: 'ledger', kind: 'outcome', status: 'done', summary: 'Shipped <safe>', wave: 'meo-cto', pr: '#247' }],
    sessions: [{ sid: 'session-12345678', title: 'MEO CTO', lastTs: '2026-07-12T12:00:00Z', agents: ['codex'], channels: ['subscription'], models: ['codex'], steps: 3, streamSteps: 1, executionSteps: 1, ledgerSteps: 1, handoffs: 1, wave: 'meo-cto', pr: '#247', branch: 'feat/meo', notionSyncedAt: '2026-07-12T11:00:00Z', obsidianSyncedAt: '2026-07-12T11:30:00Z' }],
  };
}

test('MEO Control renders coverage, responsibility flow, delivery and mirror signals', () => {
  const html = overview(fixture());
  assert.match(html, />ON</);
  assert.match(html, /codex/);
  assert.match(html, /claude-code/);
  assert.match(html, /meo-cto/);
  assert.match(html, /#247/);
  assert.match(html, /Notion <b>1 sinal/);
  assert.match(html, /Obsidian <b>1 sinal/);
});

test('MEO Stream renders agent, execution channel, model, session and scope with escaping', () => {
  const html = timeline(fixture());
  assert.match(html, /lpdc-stream/);
  assert.match(html, /subscription/);
  assert.match(html, /codex/);
  assert.match(html, /MEO CTO/);
  assert.match(html, /meo-cto/);
  assert.ok(html.includes('Shipped &lt;safe&gt;'));
  assert.ok(!html.includes('Shipped <safe>'));
});

test('MEO Sessions renders per-session provenance and mirror recency', () => {
  const html = sessions(fixture());
  assert.match(html, /MEO CTO/);
  assert.match(html, /stream 1/);
  assert.match(html, /exec 1/);
  assert.match(html, /ledger 1/);
  assert.match(html, /handoffs 1/);
  assert.match(html, /Notion/);
  assert.match(html, /Obsidian/);
});

test('MEO executive renderers are null-safe, honest, and concat-only', () => {
  assert.doesNotThrow(() => overview(null));
  assert.doesNotThrow(() => timeline(null));
  assert.doesNotThrow(() => sessions(null));
  assert.match(overview(null), /n\/d/);
  assert.match(timeline(null), /sem etapas/);
  assert.match(sessions(null), /sem sessões/);
  for (const fn of [LPV.renderExecutiveOverview, LPV.renderExecutiveTimeline, LPV.renderSessionBreakdown]) {
    const src = fn.toString();
    assert.strictEqual(src.includes('`'), false, fn.name + ' must stay concat-only');
    assert.strictEqual(src.includes('${'), false, fn.name + ' must not interpolate template literals');
  }
});
