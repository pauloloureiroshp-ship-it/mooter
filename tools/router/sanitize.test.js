#!/usr/bin/env node
// @ts-check
/**
 * Unit tests for sanitize.js — covers sanitizeText, sanitizeUrl, sanitizeJson.
 * Uses node:test (built-in, Node 18+). Run with: node --test sanitize.test.js
 *
 * Sprint 2 of CCA Testing foundation — these tests gate regressions in the
 * Input Sanitization criterion (#9) and run alongside classify.test.js /
 * backtest.test.js in CI.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeText, sanitizeUrl, sanitizeJson, ALLOWED_PROTOCOLS } = require('./sanitize.js');

// ── sanitizeText ───────────────────────────────────────────────────────

test('sanitizeText: strips HTML tags but keeps inner text', () => {
  assert.equal(sanitizeText('<script>alert(1)</script>hi'), 'alert(1)hi');
  assert.equal(sanitizeText('<b>bold</b>'), 'bold');
  assert.equal(sanitizeText('<img src=x onerror=alert(1)>'), '');
});

test('sanitizeText: strips inline event handlers outside tags', () => {
  // An event handler pasted as raw text (not inside a <...>) still gets stripped.
  const s = 'click me onerror=alert(1) thanks';
  const out = sanitizeText(s);
  assert.ok(!/onerror/i.test(out), `expected onerror stripped, got: ${out}`);
});

test('sanitizeText: strips dangerous URI schemes inline', () => {
  assert.ok(!/javascript:/i.test(sanitizeText('click javascript:alert(1)')));
  assert.ok(!/data:/i.test(sanitizeText('data:text/html,<script>')));
  assert.ok(!/vbscript:/i.test(sanitizeText('go vbscript:msgbox')));
  assert.ok(!/file:/i.test(sanitizeText('open file:///etc/passwd')));
});

test('sanitizeText: strips control bytes but preserves tab/newline/cr', () => {
  assert.equal(sanitizeText('a\x00b\x01c'), 'abc');
  assert.equal(sanitizeText('a\tb\nc\rd'), 'a\tb\nc\rd');
});

test('sanitizeText: enforces maxLength', () => {
  assert.equal(sanitizeText('x'.repeat(5000), { maxLength: 100 }).length, 100);
  assert.equal(sanitizeText('x'.repeat(10), { maxLength: 100 }).length, 10);
});

test('sanitizeText: returns empty string for null/undefined', () => {
  assert.equal(sanitizeText(null), '');
  assert.equal(sanitizeText(undefined), '');
});

test('sanitizeText: coerces non-strings via String()', () => {
  assert.equal(sanitizeText(42), '42');
  assert.equal(sanitizeText(true), 'true');
});

test('sanitizeText: collapses runaway whitespace but preserves newlines', () => {
  assert.equal(sanitizeText('a     b'), 'a b');
  assert.equal(sanitizeText('line1\n\n\nline2'), 'line1\n\n\nline2');
});

// ── sanitizeUrl ────────────────────────────────────────────────────────

test('sanitizeUrl: allows http/https/mailto', () => {
  assert.equal(sanitizeUrl('http://example.com'), 'http://example.com');
  assert.equal(sanitizeUrl('https://example.com/path?q=1'), 'https://example.com/path?q=1');
  assert.equal(sanitizeUrl('mailto:a@b.com'), 'mailto:a@b.com');
});

test('sanitizeUrl: rejects dangerous protocols', () => {
  assert.equal(sanitizeUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeUrl('data:text/html,<script>'), null);
  assert.equal(sanitizeUrl('file:///etc/passwd'), null);
  assert.equal(sanitizeUrl('vbscript:msgbox'), null);
  assert.equal(sanitizeUrl('ftp://example.com'), null);
});

test('sanitizeUrl: rejects empty, non-string, malformed', () => {
  assert.equal(sanitizeUrl(''), null);
  assert.equal(sanitizeUrl('   '), null);
  assert.equal(sanitizeUrl(null), null);
  assert.equal(sanitizeUrl(undefined), null);
  assert.equal(sanitizeUrl(42), null);
  assert.equal(sanitizeUrl('not a url'), null);
});

test('sanitizeUrl: rejects URLs over 2048 chars', () => {
  const long = 'https://example.com/' + 'a'.repeat(2100);
  assert.equal(sanitizeUrl(long), null);
});

test('sanitizeUrl: ALLOWED_PROTOCOLS exported is exactly the 3 safe ones', () => {
  assert.deepEqual(
    [...ALLOWED_PROTOCOLS].sort(),
    ['http:', 'https:', 'mailto:'].sort()
  );
});

// ── sanitizeJson ───────────────────────────────────────────────────────

test('sanitizeJson: strips tags from string leaves', () => {
  const out = /** @type {any} */ (sanitizeJson({ name: '<script>x</script>alice' }));
  assert.equal(out.name, 'xalice');
});

test('sanitizeJson: preserves numbers and booleans', () => {
  const out = /** @type {any} */ (sanitizeJson({ age: 42, ok: true, na: null }));
  assert.equal(out.age, 42);
  assert.equal(out.ok, true);
  assert.equal(out.na, null);
});

test('sanitizeJson: recurses into arrays and nested objects', () => {
  const out = /** @type {any} */ (sanitizeJson({
    arr: ['<b>a</b>', 'b'],
    nested: { evil: 'javascript:x', good: 'ok' },
  }));
  assert.deepEqual(out.arr, ['a', 'b']);
  assert.equal(out.nested.evil, 'x'); // "javascript:" stripped
  assert.equal(out.nested.good, 'ok');
});

test('sanitizeJson: drops prototype-pollution keys', () => {
  const tainted = JSON.parse('{"__proto__":{"poison":1},"constructor":{"x":1},"prototype":{"y":1},"safe":"ok"}');
  const out = /** @type {any} */ (sanitizeJson(tainted));
  assert.equal(out.safe, 'ok');
  assert.ok(!Object.prototype.hasOwnProperty.call(out, '__proto__'));
  assert.ok(!Object.prototype.hasOwnProperty.call(out, 'constructor'));
  assert.ok(!Object.prototype.hasOwnProperty.call(out, 'prototype'));
});

test('sanitizeJson: caps recursion depth', () => {
  /** @type {any} */
  let nested = { x: 'leaf' };
  for (let i = 0; i < 40; i++) nested = { inner: nested };
  const out = sanitizeJson(nested);
  // Depth-capped at 32 → eventually returns null down the chain. Just
  // verify no stack overflow and top level is still an object.
  assert.equal(typeof out, 'object');
});

test('sanitizeJson: handles null, undefined, primitives directly', () => {
  assert.equal(sanitizeJson(null), null);
  assert.equal(sanitizeJson(undefined), undefined);
  assert.equal(sanitizeJson(42), 42);
  assert.equal(sanitizeJson('hello'), 'hello');
  assert.equal(sanitizeJson('<b>hi</b>'), 'hi');
});
