#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const CLASSIFIER = path.join(__dirname, 'classify.js');
const NODE = process.execPath;

const TESTS = [
  { prompt: 'rename handleConnect to onConnect',                          expected: 'T0' },
  { prompt: 'debug this stack trace and find root cause',                 expected: 'T2' },
  { prompt: 'investigate why the auth middleware leaks memory under load', expected: 'T2' },
  { prompt: 'redesign the auth system for multi-tenant scale',            expected: 'T3' },
];

const TICK  = '\u2713';
const CROSS = '\u2717';

console.log('\nfrugal smoke test v0.9.4\n');

let passed = 0;
let totalMs = 0;
const failures = [];

for (const t of TESTS) {
  const label = (t.expected + '  ' + t.prompt).padEnd(50).slice(0, 50);
  const t0 = Date.now();
  const res = spawnSync(NODE, [CLASSIFIER, t.prompt], { encoding: 'utf8', timeout: 10000 });
  const ms = Date.now() - t0;
  totalMs += ms;

  let tier = null;
  let conf = null;
  if (res.status === 0 && res.stdout) {
    try {
      const parsed = JSON.parse(res.stdout.trim());
      tier = parsed.tier || null;
      conf = parsed.confidence != null ? parsed.confidence : null;
    } catch (_) { /* parse error — tier stays null */ }
  }

  const ok = tier === t.expected;
  if (ok) {
    passed++;
    console.log(`  ${t.expected}  ${t.prompt.slice(0, 40).padEnd(40)}  ${TICK}  (${ms}ms)`);
  } else {
    const confStr = conf != null ? ` (conf ${conf.toFixed(2)})` : '';
    console.log(`  ${t.expected}  ${t.prompt.slice(0, 40).padEnd(40)}  ${CROSS}  expected ${t.expected}, got ${tier ?? 'null'}${confStr}`);
    failures.push(t.prompt);
  }
}

const avgMs = Math.round(totalMs / TESTS.length);
console.log('');

if (passed === TESTS.length) {
  console.log(`${passed}/${TESTS.length} passed \xB7 avg ${avgMs}ms \xB7 frugal is working correctly.\n`);
  process.exit(0);
} else {
  console.log(`${passed}/${TESTS.length} passed \xB7 ${TESTS.length - passed} failed`);
  for (const p of failures) {
    console.log(`Run: node classify.js "${p}" --debug`);
  }
  console.log('');
  process.exit(1);
}
