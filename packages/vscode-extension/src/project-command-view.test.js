'use strict';
// project-command-view.test.js — Delivery Cockpit · Frente B renderer.
// Proves: CSP-safe (serialised body has no backtick / ${ and parses as embedded), honest
// states render (calibrating "n/k", no_base "sem base", cone P50/P90 work+wall), deps lock the
// play button, sub-session rows carry branch@sha + the uncommitted red alert + click-to-tab,
// and the Safe wrapper never throws.

const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');

const V = require('./project-command-view.js');

function wave(over) {
  return Object.assign({
    wave_id: 'W1', name: 'A wave', goal: 'do a thing', phase: 'NOW', type: 'CC-once', mode: 'CC',
    effort: 'M', worktree: 'frugal-x', deps: [], locked: false, lock_reason: null, running: false,
    forecast: { state: 'no_base', note: 'classe não declarada', drivers: [] }, progress: null, sessions: [],
  }, over || {});
}
function pcWith(waves, over) {
  return Object.assign({
    schema: 'mooter.projectcommand/1', forecast_missing: false, generated_ts: '2026-07-03T10:00',
    scope_hash: 'abcdef0123456789', injection_rate: 0.4, k: 8, window: 40, stale: false,
    counts: { total: waves.length, cone: 0, calibrating: 0, no_base: waves.length },
    unassigned_sessions: [], phases: [{ key: 'NOW', label: 'Agora', waves }],
  }, over || {});
}

test('serialised renderer is CSP-safe (no backtick / ${) and parses as embedded', () => {
  const body = V.renderProjectCommand.toString();
  assert.ok(!/`/.test(body), 'no backtick in the serialised body');
  assert.ok(body.indexOf('${') < 0, 'no template-substitution in the serialised body');
  assert.doesNotThrow(() => new vm.Script('const renderProjectCommand=' + body + ';'), 'parses AS DELIVERED');
});

test('forecast_missing → run-the-CLI banner, never a cone', () => {
  const html = V.renderProjectCommand({ forecast_missing: true, cli_hint: 'node forecast.js' });
  assert.match(html, /forecast\.json/);
  assert.match(html, /node forecast\.js/);
});

test('honest cone states: no_base / calibrating / cone (P50+P90 work AND wall)', () => {
  const nob = V.renderProjectCommand(pcWith([wave({ forecast: { state: 'no_base', note: 'classe não declarada', drivers: [] } })]));
  assert.match(nob, /sem base comparável/);

  const cal = V.renderProjectCommand(pcWith([wave({ forecast: { state: 'calibrating', calibrating_progress: '3/8', samples_n: 3, drivers: [] } })]));
  assert.match(cal, /a calibrar/);
  assert.match(cal, /3\/8/);

  const cone = V.renderProjectCommand(pcWith([wave({
    forecast: { state: 'cone', p50_work: 3600000, p90_work: 7200000, p50_wall: 86400000, p90_wall: 172800000, drivers: [], reliability: 0.78,
      human: { work: 'P50 work 1.0h · P90 work 2.0h', wall: 'P50 wall 1.0d · P90 wall 2.0d' } },
  })]));
  assert.match(cone, /P50 work/);
  assert.match(cone, /P90 work/);
  assert.match(cone, /P50 wall/);
  assert.match(cone, /P90 wall/);
  assert.match(cone, /fiabilidade 78%/);
});

test('deps lock the play button; unlocked wave exposes data-a="playWave"', () => {
  const locked = V.renderProjectCommand(pcWith([wave({ deps: [{ id: 'W0', met: false }], locked: true, lock_reason: 'espera W0 — sem prova de conclusão no Ledger' })]));
  assert.match(locked, /🔒/);
  assert.match(locked, /W0/);
  assert.ok(!/data-a="playWave"/.test(locked), 'locked wave has no play action');

  const open = V.renderProjectCommand(pcWith([wave()]));
  assert.match(open, /data-a="playWave" data-x="W1"/);
});

test('sub-session row: branch@sha7 + uncommitted red alert + click-to-tab', () => {
  const w = wave({ sessions: [{ sid: 'sess-9', name: 'the session', branch: 'feat/x', sha: 'a1b2c3d', dirty: 4, ahead: 1, uncommitted: true, status: 'working' }] });
  const html = V.renderProjectCommand(pcWith([w]));
  assert.match(html, /feat\/x/);
  assert.match(html, /@a1b2c3d/);
  assert.match(html, /pc-red/, 'uncommitted work flagged red (the mother alert)');
  assert.match(html, /data-a="openSession" data-x="sess-9"/, 'row is click-to-tab');
  // chevron toggle affordance present + hidden sub-block by default
  assert.match(html, /pc-chev" data-wave="W1"/);
  assert.match(html, /pc-subs" data-wave-subs="W1" hidden/);
});

test('honest progress bar renders from gate data; stale banner surfaces', () => {
  const running = V.renderProjectCommand(pcWith([wave({ running: true, progress: { passed: 2, total: 5, pct: 40, currentPhase: 2 } })]));
  assert.match(running, /fase 2\/5/);
  assert.match(running, /width:40%/);

  const stale = V.renderProjectCommand(pcWith([wave()], { stale: true }));
  assert.match(stale, /STALE/);
});

test('Safe wrapper never throws on garbage', () => {
  assert.doesNotThrow(() => V.renderProjectCommandSafe(null));
  assert.doesNotThrow(() => V.renderProjectCommandSafe({ phases: 'nope' }));
  assert.doesNotThrow(() => V.renderProjectCommandSafe(undefined));
});
