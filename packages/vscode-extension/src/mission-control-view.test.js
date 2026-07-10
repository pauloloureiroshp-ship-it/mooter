'use strict';
// mission-control-view.test.js — Frente G · Página Mission Control.
// Render-execution: renderMissionControl runs against a VARIED set of snapshots (full, sparse,
// null, empty, remote/sync null) and must NEVER throw, ALWAYS return non-empty HTML, and emit
// honest `n/d` markers where data is missing — never fabricate. Also asserts the concat-only/
// CSP contract (no inline on* handlers; every action is a data-a button) so the function stays
// safe to serialise into the getHtml() template.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

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
  // worktree git-graph link → canonical openSessionTab with the sid + available title
  assert.ok(html.indexOf('data-a="openSessionTab" data-x="sess-1" data-title="Build MC view"') !== -1, 'worktree row links to openSessionTab with title');
  // pilot actions present
  for (const cmd of ['pauseAll', 'resumeAll', 'spawnMoo', 'projHandoff', 'refresh']) {
    assert.ok(html.indexOf('data-a="' + cmd + '"') !== -1, 'pilot action ' + cmd + ' present');
  }
  // GPU gauge + fitsMoos
  assert.ok(html.indexOf('cabem <b>+3</b> moos') !== -1, 'GPU fitsMoos rendered');
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

// ── MCV2 ── Ledger fixture: fleet+heartbeat, sessions grouped by task_group with varied
// deps, savings, and an audit/ledger replay. This IS the gate — the VIEW layer validated
// against a ledger FIXTURE ahead of the live Ledger+Lineage landing in main.
const LEDGER_FIXTURE = {
  at: 1700000000000, project: 'frugal',
  scope: { projects: [{ id: 'frugal', name: 'frugal', status: 'active', sessions: 3 }], architecture: [] },
  totals: { savedToday: 4.2, pctLocal: 81, tokensToday: 50000, needYou: 1 },
  // Fleet: one alive (heartbeat fresh + queue + tok/s), one idle.
  fleet: [
    { id: 'moo-coder', name: 'moo-coder', alive: true, lastEventTs: Date.now() - 5000, queueDepth: 3, toksPerSec: 58.4, costUsd: 0 },
    { id: 'moo-summ', name: 'moo-summ', alive: false, lastEventTs: Date.now() - 600000, queueDepth: 0, toksPerSec: null, costUsd: 0 },
  ],
  // Sessions across 2 task_groups with the 3 dependency states.
  sessions: [
    {
      sid: 'sx-1', name: 'render audit panel', taskGroup: 'mission-control-v2', model: 'claude-opus-4-8', tier: 'T3',
      status: 'working', needsYou: false, ctxPct: 40, mode: 'moo',
      git: { branch: 'feat/mc-v2', dirty: 1, ahead: 0, pushNeeded: false }, sync: {},
      deps: { irreversibleAhead: false, waitMerge: false }, // independente
    },
    {
      sid: 'sx-2', name: 'wire host filter', taskGroup: 'mission-control-v2', model: 'claude-sonnet-4-5', tier: 'T2',
      status: 'idle', needsYou: false, ctxPct: 30, mode: 'moo',
      git: { branch: 'feat/mc-wire', dirty: 0, ahead: 2, pushNeeded: true }, sync: {},
      deps: { waitMerge: true }, // espera merge/push
    },
    {
      sid: 'sx-3', name: 'apply ledger migration', taskGroup: 'ledger-core', model: 'qwen3:30b', tier: 'T0',
      status: 'working', needsYou: true, ctxPct: 20, mode: 'moo',
      git: { branch: 'feat/ledger', dirty: 0, ahead: 0, pushNeeded: false }, sync: {},
      deps: { irreversibleAhead: true }, // irreversível à frente
    },
  ],
  loops: [], gpu: null, remote: null, sync: null,
  // Audit / ledger replay: ≥3 events with who/model/tier/kind/ts.
  audit: [
    { ts: 1700000001000, sid: 'sx-1', agent: 'moo-coder', model: 'claude-opus-4-8', tier: 'T3', kind: 'intent', taskGroup: 'mission-control-v2' },
    { ts: 1700000002000, sid: 'sx-3', agent: 'moo-summ', model: 'qwen3:30b', tier: 'T0', kind: 'summary', taskGroup: 'ledger-core' },
    { ts: 1700000003000, sid: 'sx-2', agent: 'moo-wire', model: 'claude-sonnet-4-5', tier: 'T2', kind: 'handoff', taskGroup: 'mission-control-v2' },
  ],
};

test('MCV2: fleet heartbeat — alive + idle moos with queue/tok/s and $0 local', () => {
  const html = noThrow('ledger-fixture', LEDGER_FIXTURE);
  assert.ok(html.indexOf('🚜 Frota de moos') !== -1, 'fleet card header present');
  assert.ok(html.indexOf('moo-coder') !== -1 && html.indexOf('moo-summ') !== -1, 'both moos rendered');
  assert.ok(html.indexOf('🟢') !== -1, 'alive heartbeat dot present');
  assert.ok(html.indexOf('>58<') !== -1 || html.indexOf('58</span>') !== -1, 'tok/s rendered (rounded 58)');
  assert.ok(html.indexOf('$0') !== -1, 'local cost $0 present');
  // idle moo with null tok/s must show n/d, never fabricate
  assert.ok(html.indexOf('n/d') !== -1, 'missing tok/s → n/d');
});

test('MCV2: sessions grouped by task_group with correct dependency badges', () => {
  const html = renderMissionControl(LEDGER_FIXTURE);
  assert.ok(html.indexOf('🧬 Sessões por tarefa') !== -1, 'task_group section header');
  assert.ok(html.indexOf('mission-control-v2') !== -1, 'task_group "mission-control-v2" header');
  assert.ok(html.indexOf('ledger-core') !== -1, 'task_group "ledger-core" header');
  // dep badges + labels
  assert.ok(html.indexOf('🟢') !== -1 && html.indexOf('independente') !== -1, 'independent badge');
  assert.ok(html.indexOf('🟡') !== -1 && html.indexOf('espera merge/push') !== -1, 'waiting-merge badge');
  assert.ok(html.indexOf('⚠️') !== -1 && html.indexOf('irreversível à frente') !== -1, 'irreversible-ahead badge');
  // the irreversible session and the open link
  assert.ok(html.indexOf('apply ledger migration') !== -1, 'irreversible session name');
  assert.ok(html.indexOf('data-a="openSessionTab" data-x="sx-3" data-title="apply ledger migration"') !== -1, 'session open link wired to canonical tab command');
});

test('W-UX: pure session-open controls use openSessionTab; push keeps open-and-scope', () => {
  const html = renderMissionControl(FULL);
  const tip = 'title="abre a aba desta sessão no Claude Code (foca a existente, nunca duplica)"';
  assert.match(html, /class="mcv2-tgopen" data-a="openSessionTab"[^>]*data-title="Build MC view"/, 'task-group link uses canonical tab command');
  assert.match(html, /class="mcf-brow[^"]*" data-a="openSessionTab"[^>]*data-title="Build MC view"/, 'branch row uses canonical tab command');
  assert.match(html, /class="mcf-gitlink" data-a="openSessionTab"[^>]*data-title="Remote moo"/, 'git link uses canonical tab command');
  assert.equal(html.split(tip).length - 1, 4, 'every rendered pure-open control has the exact honest tooltip');
  assert.match(html, /class="mcf-pushbtn" data-a="openSession"[^>]*title="abre os detalhes desta sessão para rever os commits locais; não executa push"/, 'push action keeps backward-compatible open-and-scope path and states that it never pushes');
});

test('W-UX: legacy openSession delegates to mooter.openSessionTab and keeps cockpit scope', () => {
  const src = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const start = src.indexOf("if (m.cmd === 'openSession') {");
  const end = src.indexOf('// ── DELIVERY COCKPIT', start);
  assert.ok(start !== -1 && end > start, 'openSession handler found');
  const handler = src.slice(start, end);
  assert.match(handler, /executeCommand\('mooter\.openSessionTab', \{ id, title \}\)/, 'delegates to registered canonical command with id + title');
  assert.doesNotMatch(handler, /claude-vscode\.primaryEditor\.open/, 'does not duplicate primary editor opening');
  assert.match(handler, /this\.data\.selectedSession = id; this\.data\.refresh\(true\)/, 'keeps cockpit scope + refresh');
  const tabStart = src.indexOf("if (m.cmd === 'openSessionTab') {");
  const tabEnd = src.indexOf('// ═', tabStart);
  const tabHandler = src.slice(tabStart, tabEnd);
  assert.match(tabHandler, /executeCommand\('mooter\.openSessionTab', m\.arg\)/, 'pure tab path uses the registered command');
  assert.doesNotMatch(tabHandler, /selectedSession|refresh\(true\)/, 'pure tab path does not scope the cockpit');
});

test('MCV2: sessions lacking task_group fall into an honest n/d group', () => {
  const html = renderMissionControl({
    sessions: [{ sid: 'q', name: 'no group', model: null, tier: null, deps: null }],
    totals: {}, fleet: [], audit: [],
  });
  assert.ok(html.indexOf('sem task_group') !== -1, 'sessions without task_group → n/d group header');
  assert.ok(html.indexOf('independente') !== -1, 'null deps → independente (no fabricated warning)');
});

test('MCV2: savings highlight strip surfaces savedToday + pctLocal', () => {
  const html = renderMissionControl(LEDGER_FIXTURE);
  assert.ok(html.indexOf('mcv2-savings') !== -1, 'savings strip rendered');
  assert.ok(html.indexOf('$4.20') !== -1, '$ saved today surfaced');
  assert.ok(html.indexOf('81%') !== -1, '% local surfaced');
});

test('MCV2: audit panel replays the ledger (who/model/tier/kind/ts) + filter chips', () => {
  const html = renderMissionControl(LEDGER_FIXTURE);
  assert.ok(html.indexOf('🧾 Audit') !== -1, 'audit panel header');
  // replay rows — kind, tier, who, model, ts all present
  for (const kind of ['intent', 'summary', 'handoff']) {
    assert.ok(html.indexOf(kind) !== -1, 'audit kind ' + kind + ' replayed');
  }
  assert.ok(html.indexOf('moo-coder') !== -1, 'audit who (agent) replayed');
  assert.ok(html.indexOf('mc-tier mc-T0') !== -1, 'audit tier chip (T0) replayed');
  // ts rendered as HH:MM:SS from epoch ms
  assert.ok(/\d{2}:\d{2}:\d{2}/.test(html), 'audit ts replayed as time');
  // filter affordances (host-wire follow-up): "all" + per task_group chips
  assert.ok(html.indexOf('data-a="auditFilter" data-x="all"') !== -1, 'audit "all" filter chip');
  assert.ok(html.indexOf('data-a="auditFilter" data-x="mission-control-v2"') !== -1, 'audit per-group filter chip');
});

test('MCV2: empty snapshot renders the new cards with honest n/d, never throws', () => {
  const html = noThrow('mcv2-empty', {});
  assert.ok(html.indexOf('🚜 Frota de moos') !== -1, 'fleet card still renders');
  assert.ok(html.indexOf('🧾 Audit') !== -1, 'audit card still renders');
  // no fleet / no ledger → honest n/d, never fabricated
  assert.ok(html.indexOf('supervisor heartbeat ainda não aterrou') !== -1, 'empty fleet → n/d message');
  assert.ok(html.indexOf('ledger vazio') !== -1, 'empty ledger → n/d message');
});

test('MCV2: ledger array under s.ledger (alias of s.audit) also replays', () => {
  const html = renderMissionControl({
    sessions: [], totals: {}, fleet: [],
    ledger: [{ ts: 1700000004000, sid: 'z', agent: 'moo-x', model: 'qwen3:30b', tier: 'T0', kind: 'turn' }],
  });
  assert.ok(html.indexOf('turn') !== -1, 's.ledger alias replays');
  assert.ok(html.indexOf('moo-x') !== -1, 's.ledger who replays');
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
