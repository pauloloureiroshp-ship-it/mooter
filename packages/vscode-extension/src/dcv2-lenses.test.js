'use strict';
// dcv2-lenses.test.js — Director's Cut v2 · F2, Unit A.
// Proves: renderDayBreakdown/renderModelBreakdown/renderFleetLanes render real data honestly
// (hero + table markers, "ops reais"/"rotas" kept distinct, "~est." tilde discipline, heartbeat
// age); degrade to the exact empty-state string on null/malformed input without ever throwing;
// escape XSS-shaped data (model/pillar ids); and never fabricate a 0/false chip when a field is
// honestly null. Mirrors live-preview-view.test.js's harness (webview-sim via new Function()).

const { test } = require('node:test');
const assert = require('node:assert');

const LPV = require('./live-preview-view.js');

// ── webview-sim harness (exact webview path: fn.toString() -> new Function('esc', ...)) ──────
const _wv_esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function wv(fn) {
  return new Function('esc', 'return (' + fn.toString() + ')')(_wv_esc);
}
const renderDayBreakdown = wv(LPV.renderDayBreakdown);
const renderModelBreakdown = wv(LPV.renderModelBreakdown);
const renderFleetLanes = wv(LPV.renderFleetLanes);

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// ── renderDayBreakdown ─────────────────────────────────────────────────────────────────────

test('renderDayBreakdown: real data renders hero + table, honest labels present', () => {
  const byDay = {
    days: [
      {
        day: todayStr(),
        events: { reason: 1, file: 2, task: 0, server: 0, other: 0, total: 3 },
        decisions: { total: 4, tiers: { T0: 2, T1: 1, T2: 1, T3: 0 }, pctLocal: 50, costEstUsd: 0.0123, costCounted: 3, costUncounted: 1 },
        exec: { ops: 5, agentOps: 2, models: ['qwen3:30b'] },
      },
      {
        day: '2026-07-01',
        events: { reason: 0, file: 1, task: 0, server: 0, other: 0, total: 1 },
        decisions: { total: 2, tiers: { T0: 0, T1: 0, T2: 1, T3: 1 }, pctLocal: 0, costEstUsd: null, costCounted: 0, costUncounted: 2 },
        exec: { ops: 1, agentOps: 0, models: [] },
      },
    ],
    window: { events: 10, decisions: 6, execOps: 8, unplaced: 1, daysTotal: 2, daysShown: 2 },
    costBasis: 'tier-est',
  };
  const html = renderDayBreakdown(byDay);
  assert.ok(html.includes('lpx-hero'), 'hero marker present');
  assert.ok(html.includes('lpx-tbl'), 'table marker present');
  assert.ok(html.includes('50% local'), 'hero pctLocal from newest day');
  assert.ok(html.includes('Hoje'), 'newest day computed client-side as Hoje');
  assert.ok(html.includes('~est. $0.0123'), 'tilde-prefixed cost estimate');
  assert.ok(html.includes('sem ~est.'), 'uncounted-cost honesty note');
  assert.ok(html.includes('eventos (deste workspace)'), 'events scope honestly labelled workspace');
  assert.ok(html.includes('decisões — todas as sessões desta máquina (não é histórico completo)'), 'decisions scope honestly labelled machine-wide, canon em-dash form (matches renderModelBreakdown)');
  assert.ok(html.includes('sem data'), 'window.unplaced surfaced');
});

test('renderDayBreakdown: null -> exact empty-state string, never throws', () => {
  assert.strictEqual(renderDayBreakdown(null), '<div class="lpx lpdc-empty">sem decisões ainda</div>');
  assert.doesNotThrow(() => renderDayBreakdown(undefined));
  assert.doesNotThrow(() => renderDayBreakdown({}));
  assert.doesNotThrow(() => renderDayBreakdown({ days: [] }));
  assert.doesNotThrow(() => renderDayBreakdown('garbage'));
});

test('renderDayBreakdown: honest-null pctLocal -> n/d, never a fabricated percentage', () => {
  const byDay = {
    days: [{
      day: '2026-07-01',
      events: { total: 0 },
      decisions: { total: 0, tiers: {}, pctLocal: null, costEstUsd: null, costCounted: 0, costUncounted: 0 },
      exec: { ops: 0, agentOps: 0, models: [] },
    }],
    window: { events: 0, decisions: 0, execOps: 0, unplaced: 0, daysTotal: 1, daysShown: 1 },
    costBasis: null,
  };
  const html = renderDayBreakdown(byDay);
  assert.ok(html.includes('n/d'), 'pctLocal null renders n/d');
});

test('renderDayBreakdown: escapes XSS-shaped day/data (no raw <script>)', () => {
  const byDay = {
    days: [{
      day: '<script>bad</script>',
      events: { total: 1 },
      decisions: { total: 1, tiers: { T0: 1, T1: 0, T2: 0, T3: 0 }, pctLocal: 100, costEstUsd: 0.01, costCounted: 1, costUncounted: 0 },
      exec: { ops: 1, agentOps: 0, models: [] },
    }],
    window: { events: 1, decisions: 1, execOps: 1, unplaced: 0, daysTotal: 1, daysShown: 1 },
    costBasis: 'tier-est',
  };
  const html = renderDayBreakdown(byDay);
  assert.ok(html.indexOf('<script>bad') === -1, 'raw script tag must be escaped');
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'), 'escaped day string present');
});

// ── renderModelBreakdown ───────────────────────────────────────────────────────────────────

test('renderModelBreakdown: real data renders hero + table, "ops reais"/"rotas" kept distinct', () => {
  const byModel = {
    models: [
      { model: 'claude-opus-4-8', tier: 'T3', local: false, ops: { bash: 1, agent: 2, total: 3 }, routes: 5, costEstUsd: 0.25, costCounted: 5, costUncounted: 0 },
      { model: 'qwen3:30b', tier: 'T0', local: true, ops: { bash: 2, agent: 0, total: 2 }, routes: 9, costEstUsd: 0, costCounted: 2, costUncounted: 0 },
      { model: 'fable-agent', tier: 'T5', local: null, ops: { bash: 0, agent: 1, total: 1 }, routes: 1, costEstUsd: null, costCounted: 0, costUncounted: 1 },
    ],
    totals: { costEstUsd: 0.25, naiveOpusUsd: 1.0, savedEstUsd: 0.75, costCounted: 7, costUncounted: 1 },
    window: { decisions: 8, execOps: 6, opsUnattributed: 1, modelsTotal: 3, modelsShown: 3 },
    costBasis: 'tier-est',
  };
  const html = renderModelBreakdown(byModel);
  assert.ok(html.includes('lpx-hero'), 'hero marker present');
  assert.ok(html.includes('lpx-tbl'), 'table marker present');
  assert.ok(html.includes('ops reais'), 'ops reais header present');
  assert.ok(html.includes('rotas'), 'rotas header present');
  // ops.total (3) and routes (5) for opus must both appear as DISTINCT numbers, never merged.
  assert.ok(html.includes('>3<'), 'ops reais value for opus rendered');
  assert.ok(html.includes('>5<'), 'rotas value for opus rendered');
  assert.ok(html.includes('$0 local'), 'local model chip present');
  assert.ok(html.includes('opt-in'), 'T5/Fable chip present');
  const rows = html.match(/<div class="lpx-tr">.*?<\/div>/g) || [];
  const fableRow = rows.find((r) => r.includes('fable-agent'));
  assert.ok(fableRow && fableRow.indexOf('~est. $') === -1, 'T5 row never shows a $ cost estimate');
  assert.ok(html.includes('$0.7500'), 'hero savedEstUsd rendered honestly');
  assert.ok(html.includes('ops sem modelo resolvido'), 'opsUnattributed surfaced');
});

test('renderModelBreakdown: null -> exact empty-state string, never throws', () => {
  assert.strictEqual(renderModelBreakdown(null), '<div class="lpx lpdc-empty">sem decisões ainda</div>');
  assert.doesNotThrow(() => renderModelBreakdown(undefined));
  assert.doesNotThrow(() => renderModelBreakdown({}));
  assert.doesNotThrow(() => renderModelBreakdown({ models: [] }));
});

test('renderModelBreakdown: honest-null costEstUsd/local/tier -> n/d shown, no fabricated 0/false chip', () => {
  const byModel = {
    models: [{ model: 'mystery-model', tier: null, local: null, ops: { bash: 0, agent: 0, total: 0 }, routes: 0, costEstUsd: null, costCounted: 0, costUncounted: 0 }],
    totals: { costEstUsd: null, naiveOpusUsd: null, savedEstUsd: null, costCounted: 0, costUncounted: 0 },
    window: { decisions: 0, execOps: 0, opsUnattributed: 0, modelsTotal: 1, modelsShown: 1 },
    costBasis: null,
  };
  const html = renderModelBreakdown(byModel);
  assert.ok(html.includes('n/d'), 'unknown tier/cost/local render as n/d');
  assert.ok(html.indexOf('$0 local') === -1, 'local:null never fabricates the $0 local chip');
  assert.ok(html.indexOf('false') === -1, 'local:null never leaks a literal "false"');
});

test('renderModelBreakdown: escapes XSS-shaped model name', () => {
  const byModel = {
    models: [{ model: '<script>bad</script>', tier: 'T1', local: false, ops: { bash: 1, agent: 0, total: 1 }, routes: 1, costEstUsd: 0.001, costCounted: 1, costUncounted: 0 }],
    totals: { costEstUsd: 0.001, naiveOpusUsd: 0.01, savedEstUsd: 0.009, costCounted: 1, costUncounted: 0 },
    window: { decisions: 1, execOps: 1, opsUnattributed: 0, modelsTotal: 1, modelsShown: 1 },
    costBasis: 'tier-est',
  };
  const html = renderModelBreakdown(byModel);
  assert.ok(html.indexOf('<script>bad') === -1, 'raw script tag must be escaped');
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'), 'escaped model name present');
});

// ── renderFleetLanes ───────────────────────────────────────────────────────────────────────

test('renderFleetLanes: real data renders heartbeat age + swimlanes', () => {
  const ts = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // ~3h ago
  const fleet = {
    heartbeat: { ts: ts, dryRun: true, running: ['p1'], totalRounds: 5, pillarsIdle: 1, pillarsDone: 2 },
    pillars: [
      { id: 'p1', status: 'building', round: 3, updatedAt: ts, running: true, priority: 1, gpuHeavy: true },
      { id: 'p2', status: null, round: null, updatedAt: null, running: null, priority: 2, gpuHeavy: false },
    ],
    resting: false,
  };
  const html = renderFleetLanes(fleet);
  assert.ok(html.includes('último sinal'), 'heartbeat timestamp label present');
  assert.ok(html.includes('há 3h'), 'human age computed client-side');
  assert.ok(html.includes('dry-run'), 'dry-run chip present');
  assert.ok(html.includes('lpx-lane'), 'swimlane marker present');
  assert.ok(html.includes('a correr'), 'running:true renders "a correr"');
  assert.ok(html.includes('🔥GPU'), 'gpuHeavy pillar tagged');
  assert.ok(html.includes('n/d (sem heartbeat)'), 'running:null renders the honest n/d note');
});

test('renderFleetLanes: resting banner never hides a stale heartbeat', () => {
  const staleTs = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
  const fleet = { heartbeat: { ts: staleTs, dryRun: false, running: [], totalRounds: 1, pillarsIdle: 0, pillarsDone: 0 }, pillars: [], resting: true };
  const html = renderFleetLanes(fleet);
  assert.ok(html.includes('frota em repouso'), 'resting banner shown');
  assert.ok(html.includes('há 5d'), 'stale heartbeat age still surfaced even while resting');
  assert.ok(html.includes('sem pilares'), 'empty pillars + known heartbeat -> honest note');
});

test('renderFleetLanes: whole-null fleet -> exact empty-state string, never throws', () => {
  assert.strictEqual(renderFleetLanes(null), '<div class="lpx lpdc-empty">sem sinais da frota ainda</div>');
  assert.doesNotThrow(() => renderFleetLanes(undefined));
  assert.doesNotThrow(() => renderFleetLanes({}));
  assert.doesNotThrow(() => renderFleetLanes('garbage'));
});

test('renderFleetLanes: heartbeat null/ts null -> honest n/d (sem heartbeat), never a fabricated time', () => {
  assert.ok(renderFleetLanes({ heartbeat: null, pillars: [], resting: null }).includes('n/d (sem heartbeat)'));
  assert.ok(renderFleetLanes({ heartbeat: { ts: null, dryRun: null }, pillars: [], resting: null }).includes('n/d (sem heartbeat)'));
});

test('renderFleetLanes: escapes XSS-shaped pillar id', () => {
  const fleet = {
    heartbeat: { ts: new Date().toISOString(), dryRun: false, running: [], totalRounds: 1, pillarsIdle: 0, pillarsDone: 0 },
    pillars: [{ id: '<script>bad</script>', status: 'ok', round: 1, updatedAt: null, running: false, priority: 1, gpuHeavy: false }],
    resting: false,
  };
  const html = renderFleetLanes(fleet);
  assert.ok(html.indexOf('<script>bad') === -1, 'raw script tag must be escaped');
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'), 'escaped pillar id present');
});

// ── concat-only contract (safe to embed in getLivePreviewHtml's outer template literal) ───────

test('concat-only guard: the three new fns have no backticks or ${} interpolation', () => {
  for (const fn of [LPV.renderDayBreakdown, LPV.renderModelBreakdown, LPV.renderFleetLanes]) {
    const src = fn.toString();
    assert.ok(src.indexOf('`') === -1, fn.name + ' source has no backticks');
    assert.ok(src.indexOf('${') === -1, fn.name + ' source has no ${ interpolation');
  }
});

// ── webview-sim smoke (fn.toString() + new Function(), exact webview path) ────────────────────

test('webview-sim: all three lenses parse and execute via new Function() (exact webview path)', () => {
  assert.strictEqual(typeof renderDayBreakdown, 'function');
  assert.strictEqual(typeof renderModelBreakdown, 'function');
  assert.strictEqual(typeof renderFleetLanes, 'function');
  assert.ok(renderDayBreakdown(null).includes('sem decisões ainda'));
  assert.ok(renderModelBreakdown(null).includes('sem decisões ainda'));
  assert.ok(renderFleetLanes(null).includes('sem sinais da frota ainda'));
});
