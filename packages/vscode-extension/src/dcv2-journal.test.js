'use strict';
// dcv2-journal.test.js — Director's Cut v2 · F4 (auto-journal local $0, visible) contract.
// (A) host reader — LPA.readJournal(sid, opts) against injected fake journal modules (mirrors
//     the pricingPaths injection seam in lp-aggregates.test.js): no sid, no summary, a throwing
//     module, and an empty-string summary must all degrade to null, never throw. A real temp
//     file is stat'd for a genuine mtime so updatedAt is proven non-fabricated.
// (B) renderer — renderJournalCard deserialised exactly like the webview does (fn.toString() +
//     new Function('esc', ...)), mirroring dcv2-work.test.js's harness: null -> honest
//     "sem resumo local ainda"; a fresh summary shows the qwen/best-effort meta + hh:mm + text;
//     a >10min-old summary shows its "há Xm" age; XSS in the summary text is escaped.
// (C) structural — getLivePreviewHtml('tok') carries the serialised fn, the CSS, the Stream lens
//     prepend, and lpSig's stream branch includes the journal in its signature.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

const LPA = require('./lp-aggregates.js');
const LPV = require('./live-preview-view.js');

// ── (A) host reader — LPA.readJournal ──────────────────────────────────────────────────────

test('F4 readJournal: no sid -> null', () => {
  assert.strictEqual(LPA.readJournal(null), null);
  assert.strictEqual(LPA.readJournal(undefined), null);
  assert.strictEqual(LPA.readJournal(''), null);
});

test('F4 readJournal: injected mod with no summary -> null', () => {
  const r = LPA.readJournal('sid-1', { journalMod: { readSummary: () => null, summaryPath: () => 'x' } });
  assert.strictEqual(r, null);
});

test('F4 readJournal: injected mod with empty-string summary -> null', () => {
  const r = LPA.readJournal('sid-1', { journalMod: { readSummary: () => '', summaryPath: () => 'x' } });
  assert.strictEqual(r, null);
});

test('F4 readJournal: real summary + real temp file -> { text, updatedAt } with a genuine mtime', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lpa-journal-'));
  const f = path.join(tmp, 'sid-1.summary.txt');
  fs.writeFileSync(f, 'hello');
  const r = LPA.readJournal('sid-1', { journalMod: { readSummary: () => 'hello', summaryPath: () => f } });
  assert.ok(r, 'must return a snapshot');
  assert.strictEqual(r.text, 'hello');
  assert.strictEqual(typeof r.updatedAt, 'number');
  assert.ok(isFinite(r.updatedAt) && r.updatedAt > 0, 'updatedAt must be a real, finite mtime');
});

test('F4 readJournal: a journalMod whose readSummary throws -> null, never throws', () => {
  assert.doesNotThrow(() => {
    const r = LPA.readJournal('sid-1', { journalMod: { readSummary: () => { throw new Error('boom'); }, summaryPath: () => 'x' } });
    assert.strictEqual(r, null);
  });
});

test('F4 readJournal: readSummary returning whitespace-only (mocked as already-trimmed empty) -> null', () => {
  const r = LPA.readJournal('sid-1', { journalMod: { readSummary: () => '', summaryPath: () => 'x' } });
  assert.strictEqual(r, null);
});

test('F4 readJournal: no candidate module resolvable -> null, never throws', () => {
  const r = LPA.readJournal('sid-1', { journalPaths: ['/definitely/not/here.js'] });
  assert.strictEqual(r, null);
});

// ── (B) renderer — renderJournalCard (webview-sim deserialisation, exact webview path) ─────

const _wv_esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _wvRenderJournalCard = new Function('esc', 'return (' + LPV.renderJournalCard.toString() + ')')(_wv_esc);

test('F4 renderer: null -> exact honest "sem resumo local ainda" card; never throws on null/garbage', () => {
  assert.strictEqual(_wvRenderJournalCard(null), '<div class="lp-jrnl lp-jrnl-nd">sem resumo local ainda</div>');
  assert.doesNotThrow(() => _wvRenderJournalCard(undefined));
  assert.doesNotThrow(() => _wvRenderJournalCard('garbage'));
  assert.doesNotThrow(() => _wvRenderJournalCard({}));
  assert.doesNotThrow(() => _wvRenderJournalCard({ text: '' }));
});

test('F4 renderer: fresh summary shows meta + hh:mm + text, no age suffix', () => {
  const now = Date.now();
  const html = _wvRenderJournalCard({ text: 'did X', updatedAt: now });
  assert.ok(html.includes('resumo local (qwen · best-effort)'), 'must show the best-effort meta');
  const d = new Date(now);
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  assert.ok(html.includes(pad2(d.getHours()) + ':' + pad2(d.getMinutes())), 'must show hh:mm from updatedAt');
  assert.ok(html.includes('did X'), 'must show the summary text');
  assert.ok(!html.includes(' · há '), 'a fresh summary must not show an age suffix');
});

test('F4 renderer: a 20-minute-old summary shows " · há 20m" (stale age surfaced)', () => {
  const html = _wvRenderJournalCard({ text: 'old', updatedAt: Date.now() - 20 * 60000 });
  assert.ok(html.includes(' · há 20m'), 'a >10min-old summary must show its honest age');
});

test('F4 renderer: XSS in the summary text is escaped, never rendered raw', () => {
  const html = _wvRenderJournalCard({ text: '<script>alert(1)</script>', updatedAt: Date.now() });
  assert.ok(html.includes('&lt;script&gt;'), 'must escape the tag');
  assert.ok(!html.includes('<script>alert(1)</script>'), 'must never emit the raw tag');
});

test('F4 concat-only guard — renderJournalCard source has no backticks or ${} interpolation', () => {
  const src = LPV.renderJournalCard.toString();
  assert.ok(src.indexOf('`') === -1, 'renderJournalCard source has no backticks');
  assert.ok(src.indexOf('${') === -1, 'renderJournalCard source has no ${ interpolation');
});

// ── (C) structural — getLivePreviewHtml serialisation/CSS/wiring anchors ───────────────────

function loadExtension() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const REAL = ['./cowork-waiting', './mode-registry', './row-renderer', './arch-tree', './mission-control-view', './project-command-view', './guardian-chip', './live-preview-view.js', './lp-stage.js', './lp-toolbar-geom.js', './lp-diagnostics.js'];
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors; the getters are hoisted */ }
  return sandbox;
}

const FULL_HTML = loadExtension().getLivePreviewHtml('tok');
const SCRIPT_MATCH = FULL_HTML.match(/<script[^>]*>([\s\S]*?)<\/script>/);
const SCRIPT_TEXT = SCRIPT_MATCH ? SCRIPT_MATCH[1] : '';

test('F4 structural: getLivePreviewHtml serialises renderJournalCard and carries the CSS', () => {
  assert.ok(FULL_HTML.includes('const renderJournalCard='), 'renderJournalCard must be serialised into the inline script');
  assert.ok(FULL_HTML.includes('.lp-jrnl{'), 'the journal card CSS must be present');
});

test('F4 structural: the Stream lens prepends renderJournalCard(s&&s.journal)', () => {
  assert.ok(SCRIPT_TEXT.includes('renderJournalCard(s&&s.journal)+renderExecutiveTimeline('), 'renderLens stream branch must prepend the journal card to the unified executive timeline');
});

test('F4 structural: lpSig stream branch includes the journal in its signature', () => {
  const lpSigLine = SCRIPT_TEXT.split('\n').find((l) => l.indexOf('function lpSig(tab,s)') !== -1);
  assert.ok(lpSigLine, 'lpSig function found in the inline script');
  assert.ok(lpSigLine.includes('journal:(s&&s.journal)||null'), 'lpSig stream branch must fold s.journal into the signature');
});
