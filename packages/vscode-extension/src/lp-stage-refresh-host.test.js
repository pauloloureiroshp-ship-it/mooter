'use strict';
// Regression for the refresh race: the old host returned immediately when a probe was already in
// flight, so clicking ↻ at the exact moment a server restarted did nothing. Exercise the REAL
// LivePreviewPanel with the real pure resolver and a controlled async HTTP-probe boundary.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const EXT_PATH = path.join(__dirname, 'extension.js');

function loadPanelClass(probe) {
  const code = fs.readFileSync(EXT_PATH, 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, {
    get(_t, key) {
      if (key === Symbol.toPrimitive || key === 'toString') return () => '';
      if (key === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' };
      return mk();
    },
    apply() { return mk(); },
  });
  const realReq = require;
  const req = (name) => {
    if (name === 'vscode') return mk();
    if (name === './lp-stage.js') return realReq(name);
    if (name === './lp-stage-probe.js') return probe;
    if (name.charAt(0) === '.') return mk();
    return realReq(name);
  };
  const sandbox = {
    require: req, module: { exports: {} }, exports: {},
    console: { log() {}, error() {}, warn() {}, info() {} },
    process, __dirname, __filename: EXT_PATH, Buffer,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, Map, Set, Number,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch { /* class survives */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('manual refresh during an in-flight probe is never lost and re-probes without stale sticky origin', async () => {
  const calls = [];
  const pending = [];
  const probe = {
    probePorts(ports, options) {
      calls.push({ ports: Array.from(ports), options });
      return new Promise((resolve) => pending.push(resolve));
    },
  };
  const Panel = loadPanelClass(probe);
  assert.ok(Panel, 'LivePreviewPanel is loadable');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-refresh-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'next dev -p 7819' } }));
  try {
    const stages = [];
    let posts = 0;
    const inst = Object.create(Panel.prototype);
    inst._detecting = false;
    inst._detectAgain = false;
    inst._freshDetect = false;
    inst.overrideUrl = null;
    inst.stage = { url: 'http://localhost:9123', port: 9123, source: 'probe' };
    inst.routes = ['cached'];
    inst._wsRoot = () => root;
    inst._hasWorkspace = () => true;
    inst._invalidateBridge = () => {};
    inst._post = () => { posts += 1; };
    inst._setStage = (next) => { stages.push(next); inst.stage = next; };

    const detection = inst._detectStage();
    assert.strictEqual(calls.length, 1, 'first automatic probe is in flight');
    assert.ok(calls[0].ports.includes(9123), 'automatic probe keeps the last-good sticky origin');

    inst._onMessage({ type: 'lp-redetect' });
    assert.strictEqual(inst._detectAgain, true, 'refresh queues a guaranteed follow-up pass');
    assert.strictEqual(inst._freshDetect, true, 'queued refresh remembers that it must be fresh');
    assert.strictEqual(inst.routes, null, 'refresh also invalidates route discovery');

    pending[0]({ livePorts: [9123], rejected: [], accepted: { port: 9123, instrumented: true } });
    while (calls.length < 2) await nextTurn();
    assert.ok(!calls[1].ports.includes(9123), 'follow-up is not biased by the stale non-common port');
    assert.strictEqual(calls[1].ports[0], 7819, 'fresh configured localhost is probed first');

    pending[1]({ livePorts: [7819], rejected: [], accepted: { port: 7819, instrumented: true } });
    await detection;
    assert.strictEqual(stages.length, 1, 'stale in-flight result is discarded; only latest intent publishes');
    assert.strictEqual(stages[0].port, 7819, 'refresh converges on the newly-live configured server');
    assert.strictEqual(stages[0].stale, false);
    assert.strictEqual(posts, 2, 'each completed probe publishes its honest state');
    assert.strictEqual(inst._detecting, false);
    assert.strictEqual(inst._detectAgain, false);
    assert.strictEqual(inst._freshDetect, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
