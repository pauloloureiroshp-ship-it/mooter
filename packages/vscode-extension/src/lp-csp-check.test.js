// lp-csp-check.test.js — Review Security · LP-5. Static Content-Security-Policy heuristic
// checker: pins the missing-CSP info finding, each present-CSP weakness ('unsafe-inline',
// 'unsafe-eval', bare script-src '*'), no false positive on a clean/strict CSP, and fail-soft
// behaviour on garbage input.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { checkCsp } = require('./lp-csp-check.js');

test('checkCsp: reports missing-csp (info) when no Content-Security-Policy header exists', () => {
  const out = checkCsp('module.exports = { reactStrictMode: true };');
  assert.strictEqual(out.hasCsp, false);
  assert.strictEqual(out.findings.length, 1);
  assert.strictEqual(out.findings[0].type, 'missing-csp');
  assert.strictEqual(out.findings[0].severity, 'info');
});

test('checkCsp: flags unsafe-inline when the CSP is present but weakened', () => {
  const cfg = `
    const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'";
    module.exports = { headers: async () => [{ key: 'Content-Security-Policy', value: csp }] };
  `;
  const out = checkCsp(cfg);
  assert.strictEqual(out.hasCsp, true);
  assert.ok(out.findings.some((f) => f.type === 'unsafe-inline' && f.severity === 'warning'));
});

test('checkCsp: flags unsafe-eval when the CSP is present but weakened', () => {
  const cfg = "value: \"Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval'\"";
  const out = checkCsp(cfg);
  assert.strictEqual(out.hasCsp, true);
  assert.ok(out.findings.some((f) => f.type === 'unsafe-eval' && f.severity === 'warning'));
});

test('checkCsp: flags a bare "*" in script-src', () => {
  const cfg = "\"Content-Security-Policy\": \"default-src 'self'; script-src 'self' *;\"";
  const out = checkCsp(cfg);
  assert.strictEqual(out.hasCsp, true);
  assert.ok(out.findings.some((f) => f.type === 'script-src-wildcard' && f.severity === 'warning'));
});

test('checkCsp: does NOT flag a wildcard subdomain (*.trusted.com) as a bare "*"', () => {
  const cfg = "\"Content-Security-Policy\": \"default-src 'self'; script-src 'self' *.trusted.com;\"";
  const out = checkCsp(cfg);
  assert.strictEqual(out.hasCsp, true);
  assert.ok(!out.findings.some((f) => f.type === 'script-src-wildcard'));
});

test('checkCsp: a strict, clean CSP produces zero findings', () => {
  const cfg = "\"Content-Security-Policy\": \"default-src 'self'; script-src 'self'; object-src 'none';\"";
  const out = checkCsp(cfg);
  assert.strictEqual(out.hasCsp, true);
  assert.deepStrictEqual(out.findings, []);
});

test('checkCsp: fail-soft on null/undefined/non-string input — never throws, treated as missing', () => {
  for (const bad of [null, undefined, 42, {}, []]) {
    const out = checkCsp(bad);
    assert.strictEqual(out.hasCsp, false);
    assert.strictEqual(out.findings[0].type, 'missing-csp');
  }
});
