'use strict';
// Keeper 4: render the real cockpit/App Stage templates plus representative session and Mission
// Control surfaces. Every native control and keyboard-clickable row must explain its real effect.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RR = require('./row-renderer.js');
const MCV = require('./mission-control-view.js');

function loadExtension() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const real = ['./cowork-waiting', './mode-registry', './row-renderer', './arch-tree', './mission-control-view', './project-command-view', './guardian-chip', './live-preview-view.js', './lp-stage.js', './lp-diagnostics.js', './lp-task-view.js', './lp-presets.js', './lp-skills.js', './lp-security-view.js', './lp-publish-view.js'];
  const req = (name) => name === 'vscode' ? mk() : (real.includes(name) ? realReq(name) : (name.charAt(0) === '.' ? mk() : realReq(name)));
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch { /* getters are hoisted */ }
  return sandbox;
}

function nativeControls(html) { return String(html).match(/<(button|select|input|textarea|summary)\b[^>]*>/g) || []; }
function keyboardControls(html) { return String(html).match(/<(div|span)\b[^>]*(?:role="button"|tabindex="0")[^>]*>/g) || []; }
function withoutTitle(tags) { return tags.filter((tag) => !/(^|\s)title=/.test(tag)); }

function representativeRow() {
  return RR.renderRow({ fullId: 'keeper-4-session', id: 'keeper4', name: 'Keeper 4', model: 'claude-opus-4-8', mode: 'moo', auto: true, loop: true, working: true, pinned: true, ctxPct: 91, notionPageId: 'page-id', obsidianPath: 'notes/keeper.md', gitStage: { state: 'uncommitted', dirty: 2 } }, { loopActive: true, localModels: [{ name: 'qwen3:30b', sizeGb: 18 }], slashCommands: [{ cmd: '/moo', desc: 'route' }] });
}

function representativeMissionControl() {
  return MCV.renderMissionControl({ project: 'Mooter', sessions: [{ sid: 'keeper-4-session', name: 'Keeper 4', status: 'working', ctxPct: 91, git: { pushNeeded: true } }], gpu: {}, remote: { devices: [] } });
}

test('Keeper 4: every rendered native control has an exact title', () => {
  const ext = loadExtension();
  const surfaces = [
    ['cockpit template', ext.getHtml()],
    ['App Stage template', ext.getLivePreviewHtml('keeper-token')],
    ['session row', representativeRow()],
    ['Mission Control', representativeMissionControl()],
  ];
  let checked = 0;
  for (const [name, html] of surfaces) {
    const controls = nativeControls(html); checked += controls.length;
    let missing = withoutTitle(controls);
    if (name === 'cockpit template') {
      // getHtml contains the serialized btn() source fragment; its title lives in the runtime
      // variable `t`. The separately rendered Mission Control surface below proves the emitted
      // buttons carry real titles. `<summary>` is prose inside a source comment, not an element.
      missing = missing.filter((tag) => tag !== '<summary>' && !tag.includes('class="mc-btn \' + (cls || \'\')'));
    }
    assert.deepStrictEqual(missing, [], name + ' has native controls without title');
  }
  assert.ok(checked >= 190, 'representative sweep must cover the full control surface');
});

test('Keeper 4: keyboard-clickable chips and rows have exact titles', () => {
  const ext = loadExtension();
  const html = [ext.getHtml(), ext.getLivePreviewHtml('keeper-token'), representativeRow(), representativeMissionControl()].join('\n');
  const controls = keyboardControls(html);
  assert.ok(controls.length >= 10, 'representative sweep includes clickable chips and rows');
  assert.deepStrictEqual(withoutTitle(controls), [], 'keyboard-clickable controls without title');
});
