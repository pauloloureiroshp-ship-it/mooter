#!/usr/bin/env node
/**
 * prompt-optimizer.test.js — test suite for the prompt optimizer.
 *
 * Run: node tools/router/prompt-optimizer.test.js
 * Exit 0 on all pass, 1 on any failure.
 */

'use strict';

const {
  optimize,
  removePadding,
  reformatForT0,
  reformatForT1,
  reformatForT2,
  reformatForT3,
  categoryFrame,
  structureErrorTrace,
  langHint,
} = require('./prompt-optimizer');

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.log(`  [FAIL] ${label}`);
  }
}

function assertIncludes(label, str, sub) {
  if (typeof str === 'string' && str.includes(sub)) {
    pass++;
  } else {
    fail++;
    console.log(`  [FAIL] ${label} — expected "${sub}" in: ${String(str).slice(0, 120)}`);
  }
}

function assertNotIncludes(label, str, sub) {
  if (typeof str !== 'string' || !str.includes(sub)) {
    pass++;
  } else {
    fail++;
    console.log(`  [FAIL] ${label} — unexpected "${sub}" in: ${String(str).slice(0, 120)}`);
  }
}

function assertNull(label, val) {
  if (val === null || val === undefined) {
    pass++;
  } else {
    fail++;
    console.log(`  [FAIL] ${label} — expected null, got: ${JSON.stringify(val).slice(0, 120)}`);
  }
}

// ── S1: Padding removal ────────────────────────────────────────────────
console.log('S1 — Padding removal');

assert('remove PT "podes fazer"',
  removePadding('podes fazer um fix no auth') === 'Fazer um fix no auth');
assert('remove PT "olha lá"',
  removePadding('olha lá, verifica este ficheiro') === 'Verifica este ficheiro');
assert('remove PT "por favor"',
  removePadding('por favor verifica o código') === 'Verifica o código');
assert('remove PT "obrigado"',
  removePadding('obrigado, é tudo') === 'É tudo');
assert('remove PT "consegues"',
  removePadding('consegues ajudar-me com isto?') === 'Ajudar-me com isto?');
assert('remove EN "can you please"',
  removePadding('can you please fix this bug in the code') === 'Fix this bug in the code');
assert('remove EN "I would like you to"',
  removePadding('I would like you to summarize this file') === 'Summarize this file');
assert('remove EN "hey"',
  removePadding('hey, look at this function') === 'Look at this function');
assert('remove EN "thanks"',
  removePadding('fix this issue thanks') === 'Fix this issue');
assert('preserve code blocks',
  removePadding('please fix ```const x = 1;```') === 'Fix ```const x = 1;```');

// ── S2: Tier-aware reformatting ────────────────────────────────────────
console.log('S2 — Tier-aware reformatting');

{
  const t0 = reformatForT0('Verifica se existe algum problema com a função authenticate no ficheiro auth');
  assert('T0 compresses articles',
    t0.length < 'Verifica se existe algum problema com a função authenticate no ficheiro auth'.length);
}

{
  const t1 = reformatForT1('Verifica o código porque parece estar com problemas.');
  assertNotIncludes('T1 strips because clauses', t1, 'porque');
}

{
  const input = 'First do A. Then do B. Finally do C. And also D.';
  const t2 = reformatForT2(input);
  assertIncludes('T2 formats as bullets', t2, '- ');
  assert('T2 has 4 bullets', (t2.match(/^- /gm) || []).length === 4);
}

{
  const input = 'The auth module handles OAuth tokens\nA bug was reported in token refresh\nWhy does the token expire early?';
  const t3 = reformatForT3(input);
  assertIncludes('T3 adds Context header', t3, 'Context:');
  assertIncludes('T3 adds Task header', t3, 'Task:');
}

{
  const short = 'Fix the bug in auth';
  const t3short = reformatForT3(short);
  // Short single-line prompt with no question should pass through.
  assert('T3 short passthrough', t3short === short);
}

// ── S3: Category-aware framing ─────────────────────────────────────────
console.log('S3 — Category-aware framing');

assert('bug_investigation gets Debug prefix',
  categoryFrame('something is broken', 'bug_investigation').startsWith('Debug:'));
assert('code_generation gets Implement prefix',
  categoryFrame('a REST API for users', 'code_generation').startsWith('Implement:'));
assert('reasoning gets step-by-step prefix',
  categoryFrame('calculate the integral', 'reasoning_intermediate').startsWith('Solve step-by-step:'));

// ── S4: Error trace structuring ────────────────────────────────────────
console.log('S4 — Error trace structuring');

{
  const trace = `I ran the server and got this:
TypeError: Cannot read properties of undefined (reading 'map')
    at processItems (src/index.js:42:10)
    at main (src/index.js:10:3)
    at Object.<anonymous> (src/index.js:100:1)
    at Module._compile (internal/modules/cjs/loader.js:999:30)`;

  const structured = structureErrorTrace(trace);
  assertIncludes('S4 extracts error type', structured, "Bug: TypeError: Cannot read properties of undefined (reading 'map')");
  assertIncludes('S4 includes stack', structured, 'Stack:');
  assertIncludes('S4 has root cause task', structured, 'Task: identify root cause');
  assert('S4 limits to 3 stack lines',
    (structured.match(/^\s+at /gm) || []).length <= 3);
}

{
  assertNull('S4 null on no error', structureErrorTrace('just a normal message'));
}

{
  const trace2 = 'SyntaxError: Unexpected token } at line 42\n    at parse (parser.js:100:5)';
  const structured2 = structureErrorTrace(trace2);
  assertIncludes('S4 handles SyntaxError', structured2, 'Bug: SyntaxError');
}

// ── S5: Multi-language normalization ───────────────────────────────────
console.log('S5 — Language normalization');

{
  const result = langHint('debug this', 'pt', 'T1');
  assertIncludes('S5 adds PT hint for T1', result, '[Note: user prompt in PT');
}
{
  const result = langHint('debug this', 'pt', 'T3');
  assert('S5 no hint for T3', result === 'debug this');
}
{
  const result = langHint('debug this', 'en', 'T1');
  assert('S5 no hint for EN', result === 'debug this');
}

// ── Guardrails ─────────────────────────────────────────────────────────
console.log('Guardrails');

assertNull('skip < 30 chars',
  optimize('fix the bug', { tier: 'T0', task_category: 'trivial_local' }));
assertNull('skip HIGH_RISK (push)',
  optimize('a]'.repeat(20) + ' git push --force to main', { tier: 'T3', task_category: 'critical' }));
assertNull('skip architecture_or_critical',
  optimize('redesign the whole authentication system from scratch please',
    { tier: 'T3', task_category: 'architecture_or_critical' }));
assertNull('skip cross_file_change',
  optimize('refactor the auth module across all files in the project',
    { tier: 'T3', task_category: 'cross_file_change' }));
assertNull('skip bash_command_paste',
  optimize('cat /etc/hosts | grep localhost && echo done',
    { tier: 'T0', task_category: 'bash_command_paste' }));
assertNull('skip re-entry',
  optimize('<optimized-task>already optimized</optimized-task> plus more text please',
    { tier: 'T0', task_category: 'trivial_local' }));

// ── Integration: full optimize() flow ──────────────────────────────────
console.log('Integration');

{
  const result = optimize(
    'hey, can you please fix the timeout error in the authentication handler?',
    { tier: 'T1', task_category: 'simple_transform_or_explain', lang_detected: 'en' }
  );
  assert('full optimize returns result', result !== null);
  if (result) {
    assert('strategy includes s1', result.strategy.includes('s1'));
    assert('tokens_saved_est >= 0', result.tokens_saved_est >= 0);
    assertNotIncludes('no "can you please"', result.optimized_task, 'can you please');
  }
}

{
  const result = optimize(
    'podes por favor verificar porque é que a função de login não funciona? obrigado',
    { tier: 'T0', task_category: 'trivial_local', lang_detected: 'pt' }
  );
  assert('PT optimize returns result', result !== null);
  if (result) {
    assertNotIncludes('no "podes por favor"', result.optimized_task, 'podes por favor');
    assertNotIncludes('no "obrigado"', result.optimized_task, 'obrigado');
  }
}

{
  const result = optimize(
    'I got this error:\nTypeError: x is not a function\n    at foo (bar.js:10:5)\ncan you help?',
    { tier: 'T2', task_category: 'bug_investigation', has_error_trace: true, lang_detected: 'en' }
  );
  assert('error trace optimize returns result', result !== null);
  if (result) {
    assert('strategy includes s4', result.strategy.includes('s4'));
    assertIncludes('has Bug: prefix', result.optimized_task, 'Bug: TypeError');
  }
}

// ── Latency test ───────────────────────────────────────────────────────
console.log('Performance');

{
  const iterations = 1000;
  const longPrompt = 'can you please help me understand why this function is throwing an error when I try to call it with the wrong arguments? I have been debugging this for hours and I cannot figure out what is wrong. The error message says TypeError: x is not a function but x is clearly defined above.';
  const decision = { tier: 'T2', task_category: 'bug_investigation', has_error_trace: true, lang_detected: 'en' };

  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    optimize(longPrompt, decision);
  }
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // ms
  const perCall = elapsed / iterations;
  assert(`latency < 5ms (got ${perCall.toFixed(3)}ms per call over ${iterations} iterations)`, perCall < 5);
}

// ── Summary ────────────────────────────────────────────────────────────
console.log('');
console.log(`prompt-optimizer tests: ${pass} passed, ${fail} failed (${pass + fail} total)`);
process.exit(fail > 0 ? 1 : 0);
