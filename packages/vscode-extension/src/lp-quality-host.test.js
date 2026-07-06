'use strict';
// lp-quality-host.test.js — LP-4.7 host contract: the LOCAL fenced path runs through the REAL
// Moo Quality Engine (best-of-N + retry + asset/import fence), the escalation payload is an
// OFFER with evidence (never an automatic climb, nothing written), verified imports ride the
// preview and land at apply time through the FULL re-verification, and a tampered apply payload
// (webview lying about imports) is refused. Real LivePreviewPanel (vm-loaded extension.js),
// real live-edit-ast/assets/quality modules, scripted model stub, real temp workspace.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function loadPanelClass(stubs) {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  // REAL fence + REAL engine — the model is the only stub: this suite proves the wiring, not mocks.
  const REAL = ['./live-edit-ast.js', './live-edit-assets.js', './live-edit-quality.js'];
  const req = (name) => {
    if (name === 'vscode') return vscodeStub;
    if (name === './live-edit-model.js' && stubs && stubs.model) return stubs.model;
    if (name === './live-edit-cloud.js' && stubs && stubs.cloud) return stubs.cloud;
    if (REAL.indexOf(name) !== -1) return realReq(name);
    if (name.charAt(0) === '.') return mk();
    return realReq(name);
  };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: (f) => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

const SRC = [
  'export default function P() {',
  '  return (',
  '    <section>',
  '      <img src="/moo.png" alt="moo" />',
  '      <p>keep me</p>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const NODE = '<img src="/moo.png" alt="moo" />';
const REPL = '<img src="/moo.png" alt="moo" className="rounded-xl" />';
const TARGET = { file: 'page.tsx', line: 4, tag: 'img' };
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function setup(withPkgs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-quality-'));
  fs.writeFileSync(path.join(root, 'page.tsx'), SRC, 'utf8');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'ws' }), 'utf8');
  for (const p of withPkgs || []) {
    const dir = path.join(root, 'node_modules', p);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: p }), 'utf8');
  }
  return root;
}

function mkInstance(Panel, root) {
  const inst = Object.create(Panel.prototype);
  const posts = [];
  inst.panel = { webview: { postMessage: (m) => posts.push(m) } };
  inst.token = 'tok';
  inst._wsRoot = () => root;
  return { inst, posts };
}

// A scripted model module: replies pop in order (the last repeats), calls record (input, opts).
function scriptedModel(replies, calls) {
  let i = 0;
  return {
    rewriteElement: async (input, opts) => {
      if (calls) calls.push({ input, opts });
      const r = replies[Math.min(i++, replies.length - 1)];
      return typeof r === 'function' ? r(input, opts) : r;
    },
    cleanModelReply: (t) => String(t == null ? '' : t).trim(),
  };
}

const GOOD = { ok: true, text: REPL, newImports: [], envelope: true, model: 'stub-moo' };
const BAD = { ok: true, text: '<i>a</i>\n<i>b</i>', newImports: [], envelope: true, model: 'stub-moo' };

test('quality path: greedy pass → ONE model call, envelope+temperature wired, fenced diff posted', async () => {
  const calls = [];
  const Panel = loadPanelClass({ model: scriptedModel([GOOD], calls) });
  assert.ok(Panel, 'LivePreviewPanel resolvable');
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'cantos redondos' }, TARGET));
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC, 'preview never writes');
  assert.strictEqual(calls.length, 1, 'greedy sample passed — no burst');
  assert.strictEqual(calls[0].opts.envelope, true, 'envelope on for the local path');
  assert.strictEqual(calls[0].opts.temperature, 0.1, 'greedy first');
  assert.strictEqual(calls[0].input.nodeSource, NODE, 'READ fence intact through the engine');
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === true, 'fenced preview posted');
  assert.strictEqual(diff.replacement, REPL);
  assert.strictEqual(diff.h, sha(SRC));
  const st = posts.filter((p) => p.type === 'lp-prompt-status');
  assert.ok(st.some((s) => s.round === 1 && s.sample === 1), 'round/sample narrated');
});

test('exhaustion → escalation OFFER with evidence, target+prompt bound, NOTHING written', async () => {
  const calls = [];
  const Panel = loadPanelClass({ model: scriptedModel([BAD], calls) });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'faz magia' }, TARGET));
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC, 'nothing written');
  assert.strictEqual(calls.length, 10, '2 rounds × 5 samples, then STOP — no automatic cloud call');
  const offer = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(offer && offer.ok === false && offer.reason === 'local-quality-exhausted');
  assert.strictEqual(offer.evidence.samplesTried, 10);
  assert.strictEqual(offer.evidence.lastReason, 'replacement-parse-error');
  assert.strictEqual(offer.prompt, 'faz magia', 'the ask rides the offer so one click can re-fire on t2');
  assert.strictEqual(offer.line, TARGET.line, 'bound to THIS target (P1-B discipline)');
  // Round 2 fed the EXACT error back:
  const round2 = calls[5];
  assert.ok((round2.opts.extraBlocks || []).join('\n').indexOf('replacement-parse-error') !== -1);
});

test('verified import rides preview and lands at apply through the FULL fence; undo restores', async () => {
  const withImport = { ok: true, text: REPL, newImports: ["import { siGithub } from 'simple-icons'"], envelope: true, model: 'stub-moo' };
  const Panel = loadPanelClass({ model: scriptedModel([withImport]) });
  const root = setup(['simple-icons']);
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'logo do github' }, TARGET));
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === true, JSON.stringify(diff));
  assert.deepStrictEqual(diff.newImports, ["import { siGithub } from 'simple-icons'"]);
  assert.deepStrictEqual(diff.importsAdded, ["import { siGithub } from 'simple-icons'"]);
  assert.ok(diff.added.some((l) => l.includes('rounded-xl')), 'node diff stays the NODE diff');
  assert.ok(!diff.added.some((l) => l.includes('import')), 'import lines are separate, not smeared into the node hunk');
  // Apply: the webview echoes replacement + newImports + hash.
  await inst._promptApply({ file: TARGET.file, line: TARGET.line, tag: TARGET.tag, replacement: diff.replacement, newImports: diff.newImports, h: diff.h, tier: 'local' });
  const after = fs.readFileSync(path.join(root, 'page.tsx'), 'utf8');
  assert.ok(after.startsWith("import { siGithub } from 'simple-icons'\n"), 'import landed at the top');
  assert.ok(after.includes('rounded-xl'), 'node rewritten');
  const done = posts.find((p) => p.type === 'lp-edit-result' && p.ok === true);
  assert.ok(done, 'honest applied result');
});

test('a tampered apply payload (invented package in newImports) is refused — nothing written', async () => {
  const Panel = loadPanelClass({ model: scriptedModel([GOOD]) });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptApply({ file: TARGET.file, line: TARGET.line, tag: TARGET.tag, replacement: REPL, newImports: ["import { X } from 'ghost-pkg'"], h: sha(SRC), tier: 'local' });
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC, 'nothing written');
  const r = posts.find((p) => p.type === 'lp-edit-result');
  assert.ok(r && r.ok === false && r.reason === 'import-unresolved', 'the webview cannot smuggle an import past the write fence');
});

test('infra failure (offline) aborts the loop as-is — the honest offline UX, not an offer', async () => {
  const Panel = loadPanelClass({ model: scriptedModel([{ ok: false, reason: 'local-model-offline' }]) });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'x' }, TARGET));
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === false && diff.reason === 'local-model-offline');
});

test('webview copy: escalation offer + import fence reasons exist; never-automatic is in the code', () => {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  assert.ok(code.indexOf('renderEscalationOffer') !== -1, 'the offer UI exists');
  assert.ok(code.indexOf('subir para Sonnet · subscrição') !== -1, 'the offer names its cost honestly');
  assert.ok(code.indexOf("'import-unresolved':'o modelo inventou um package") !== -1, 'honest import copy');
  assert.ok(code.indexOf("'lucide-name-unknown':'ícone lucide inexistente") !== -1, 'honest lucide copy');
  assert.ok(code.indexOf("'local-quality-exhausted':'o moo local esgotou as tentativas") !== -1);
});
