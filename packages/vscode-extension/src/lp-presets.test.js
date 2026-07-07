// lp-presets.test.js — LP-4.8 §2. The deterministic preset engine: colour/size/spacing tweaks
// that compute the next className and ride the EXISTING class-edit fence — $0, no LLM. These
// tests pin the string logic (mergeClass) and the catalog (renderPresetsBarHTML) so a preset can
// never stack duplicates, never clobber unrelated classes, and never emit an unsafe token.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const LPP = require('./lp-presets.js');

test('mergeClass: appends a preset to an empty className', () => {
  assert.strictEqual(LPP.mergeClass('', 'text-red-600', 'text-color'), 'text-red-600');
  assert.strictEqual(LPP.mergeClass(null, 'p-4', 'pad'), 'p-4');
});

test('mergeClass: swaps within a group (red → blue), never stacks', () => {
  const out = LPP.mergeClass('font-bold text-red-600 rounded', 'text-blue-600', 'text-color');
  assert.ok(out.includes('text-blue-600'), 'new colour present');
  assert.ok(!out.includes('text-red-600'), 'old colour dropped');
  assert.ok(out.includes('font-bold') && out.includes('rounded'), 'unrelated classes kept');
});

test('mergeClass: a SIZE is never mistaken for a colour (disjoint groups)', () => {
  // text-lg must survive a colour change, and a size swap must not touch the colour.
  const c = LPP.mergeClass('text-lg text-red-600', 'text-blue-600', 'text-color');
  assert.ok(c.includes('text-lg'), 'size kept when only the colour changes');
  const s = LPP.mergeClass('text-lg text-red-600', 'text-2xl', 'text-size');
  assert.ok(s.includes('text-2xl') && !s.includes('text-lg'), 'size swapped');
  assert.ok(s.includes('text-red-600'), 'colour kept when only the size changes');
});

test('mergeClass: bg group is independent of text group', () => {
  const out = LPP.mergeClass('text-red-600 bg-slate-500', 'bg-blue-500', 'bg-color');
  assert.ok(out.includes('bg-blue-500') && !out.includes('bg-slate-500'), 'bg swapped');
  assert.ok(out.includes('text-red-600'), 'text colour untouched');
});

test('mergeClass: padding swaps within the pad group', () => {
  const out = LPP.mergeClass('p-2 m-4 flex', 'p-6', 'pad');
  assert.ok(out.includes('p-6') && !/(^|\s)p-2(\s|$)/.test(out), 'p-2 replaced by p-6');
  assert.ok(out.includes('m-4') && out.includes('flex'), 'margin/flex kept (pad group only owns p-N)');
});

test('mergeClass: idempotent — clicking the same preset twice is a no-op string', () => {
  const once = LPP.mergeClass('flex', 'text-red-600', 'text-color');
  const twice = LPP.mergeClass(once, 'text-red-600', 'text-color');
  assert.strictEqual(once, twice);
});

test('mergeClass: collapses duplicate tokens already in the className', () => {
  const out = LPP.mergeClass('flex flex gap-2', 'p-4', 'pad');
  assert.strictEqual(out.split(/\s+/).filter((t) => t === 'flex').length, 1, 'duplicate flex collapsed');
});

test('renderPresetsBarHTML: emits only safe, deterministic Tailwind tokens (no LLM, no scripts)', () => {
  const html = LPP.renderPresetsBarHTML();
  assert.ok(html.includes('data-cls="text-red-600"'), 'a text colour swatch present');
  assert.ok(html.includes('data-cls="bg-blue-500"'), 'a bg colour swatch present');
  assert.ok(html.includes('data-cls="text-2xl"'), 'a size chip present');
  assert.ok(html.includes('data-cls="p-4"'), 'a spacing chip present');
  assert.ok(html.includes('data-group="text-color"') && html.includes('data-group="pad"'), 'groups tagged for the merge');
  // Never any script/handler/entity smuggling — the bar is inert markup the webview wires by id.
  assert.ok(!/<script|onclick|javascript:/i.test(html), 'no inline scripts or handlers');
  // Every data-cls value is a plain Tailwind token (letters/digits/dash only).
  const cls = html.match(/data-cls="([^"]*)"/g).map((m) => m.slice(10, -1));
  for (const c of cls) assert.ok(/^[a-z0-9-]+$/.test(c), 'safe token: ' + c);
});
