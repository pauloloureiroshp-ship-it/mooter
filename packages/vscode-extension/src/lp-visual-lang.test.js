'use strict';
// lp-visual-lang.test.js — C5 · visual language + contextual skills:
//   COH-13 — ONE tier dictionary everywhere (🐮 local · ⚡ Haiku · 🎼 Sonnet · 🧠 Opus · 🌟 Fable): the
//            one-box chips carry glyphs, famEmoji (cockpit) no longer collapses Claude into ✨, and the
//            MEO uses the same famGlyph.
//   COH-14 — a single visual state machine (idle·blocked·working·success·warning·error); animation ONLY
//            in 'working'; prefers-reduced-motion zeroes it.
//   COH-18 — 1–3 contextual skill chips derived from the node tag (img→/icon · heading→/copy · text→/a11y).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT_SRC = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
const LPV_SRC = fs.readFileSync(path.join(__dirname, 'live-preview-view.js'), 'utf8');

// Load extension.js in a vm and expose the sandbox so module-scope host fns (famEmoji) can be eval'd.
function loadSandbox() {
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const req = (name) => { if (name === 'vscode') return mk(); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, Map, Set, Number };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(EXT_SRC, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() */ }
  return sandbox;
}
const SB = loadSandbox();
// famEmoji is a one-liner — extract + eval it directly (works whether it is host- or webview-scoped).
const _feSrc = /function famEmoji\(model\)\{[^\n]*return '🤖';\}/.exec(EXT_SRC);
const _feCtx = {}; if (_feSrc) vm.runInNewContext(_feSrc[0] + '\nthis.f = famEmoji;', _feCtx);
const famEmoji = (m) => _feCtx.f(m);

// ── COH-13 — the single dictionary ─────────────────────────────────────────────────────────────────
test('COH-13: famEmoji maps each Claude tier to its OWN glyph (no ✨ collapse)', () => {
  assert.strictEqual(famEmoji('claude-opus-4-6'), '🧠');
  assert.strictEqual(famEmoji('claude-sonnet-4-6'), '🎼');
  assert.strictEqual(famEmoji('claude-haiku-4-5'), '⚡');
  assert.strictEqual(famEmoji('claude-fable-5'), '🌟');
  assert.notStrictEqual(famEmoji('claude-opus-4-6'), famEmoji('claude-sonnet-4-6'), 'Opus and Sonnet are NOT the same glyph anymore');
  assert.strictEqual(famEmoji('qwen2.5:3b'), '🦙', 'local families keep their own mark');
  assert.ok(!/✨/.test(EXT_SRC.slice(EXT_SRC.indexOf('function famEmoji'), EXT_SRC.indexOf('function famEmoji') + 400)), 'the ✨ collapse glyph is gone from famEmoji');
});

test('COH-13: the one-box tier chips carry glyphs + text (never a glyph/name alone)', () => {
  assert.ok(/'⚡ Haiku'/.test(EXT_SRC) && /'🎼 Sonnet'/.test(EXT_SRC) && /'🧠 Opus'/.test(EXT_SRC) && /'🌟 @fable'/.test(EXT_SRC), 'chips glyph+text');
  assert.ok(/function tierGlyph/.test(EXT_SRC) && /function tierLabel/.test(EXT_SRC), 'a single glyph/label helper');
});

test('COH-13: the MEO model breakdown uses the SAME famGlyph dictionary', () => {
  assert.ok(/function famGlyph/.test(LPV_SRC), 'the MEO has the shared family glyph');
  assert.ok(/indexOf\('opus'\).*'🧠'/.test(LPV_SRC.replace(/\n/g, ' ')) || /opus.*🧠/.test(LPV_SRC), 'opus → 🧠 in the MEO too');
  assert.ok(/famGlyph\(m\.model\)/.test(LPV_SRC), 'the model row is prefixed with the glyph');
});

// ── COH-14 — the single state machine ────────────────────────────────────────────────────────────
test('COH-14: a single reducer covers all six states; animation ONLY in working; reduced-motion green', () => {
  assert.ok(/function lpVisualState/.test(EXT_SRC), 'the reducer exists');
  const dict = EXT_SRC.slice(EXT_SRC.indexOf('LP_STATE_TOKENS='), EXT_SRC.indexOf('LP_STATE_TOKENS=') + 260);
  ['idle', 'blocked', 'working', 'success', 'warning', 'error'].forEach((s) => assert.ok(dict.indexOf(s + ':') !== -1, 'state ' + s + ' in the token map'));
  assert.ok(/lpStartProgress\(text, cancellable\)\{\s*\n?\s*lpVisualState\('working'\)/.test(EXT_SRC.replace(/\r/g, '')), 'working is entered on progress start');
  assert.ok(/\.lp-state-token\[data-state="working"\]\{animation:/.test(EXT_SRC), 'CSS animates ONLY the working state');
  assert.ok(/prefers-reduced-motion:reduce\)\{\.lp-state-token\[data-state="working"\]\{animation:none\}/.test(EXT_SRC), 'reduced-motion zeroes even the working animation');
});

// ── COH-18 — contextual skills ────────────────────────────────────────────────────────────────────
test('COH-18: contextualSkills derives 1–3 chips from the node tag (img→/icon, heading→/copy, text→/a11y)', () => {
  // extract + eval the pure webview function from the generated HTML
  const html = vm.runInContext('typeof getLivePreviewHtml==="function" ? getLivePreviewHtml("tok") : ""', SB);
  const m = /function contextualSkills\(sel\)\{[\s\S]*?return out;\s*\}/.exec(html);
  assert.ok(m, 'contextualSkills is serialised into the webview');
  const ctx = {};
  vm.runInNewContext(m[0] + '\nthis.f = contextualSkills;', ctx);
  const skillsOf = (tag) => ctx.f({ file: 'page.tsx', tag: tag }).map((s) => s.skill);
  assert.ok(skillsOf('img').indexOf('/icon') !== -1, 'an image suggests /icon');
  assert.ok(skillsOf('h1').indexOf('/copy') !== -1, 'a heading suggests /copy');
  const p = skillsOf('p');
  assert.ok(p.indexOf('/copy') !== -1 && p.indexOf('/a11y') !== -1, 'text suggests /copy + /a11y');
  ['img', 'h2', 'p', 'section', 'div', 'unknowntag'].forEach((t) => {
    const n = ctx.f({ file: 'page.tsx', tag: t }).length;
    assert.ok(n >= 1 && n <= 3, '1–3 chips for <' + t + '> (got ' + n + ')');
  });
  // the "no file → no chips" guard lives in renderCtxSkills, source-verified here.
  assert.ok(/var sk=\(sel&&sel\.file\)\?contextualSkills\(sel\):\[\]/.test(EXT_SRC), 'renderCtxSkills shows no chips without a pinned file');
});
