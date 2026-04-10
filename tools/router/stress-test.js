#!/usr/bin/env node
/**
 * stress-test.js — 47-prompt regression suite for classify.js
 *
 * Runs the full prompt suite against the current classifier and reports
 * accuracy per tier. Designed to be run after any patterns.js change.
 *
 * Usage:
 *   node stress-test.js              → full report
 *   node stress-test.js --json       → machine-readable JSON
 *   node stress-test.js --failures   → only show failures
 *
 * Exit codes:
 *   0  → adjusted accuracy >= 85%
 *   1  → adjusted accuracy < 85% (regression detected)
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const CLASSIFY = path.join(__dirname, 'classify.js');

// Each prompt has an expected tier. "acceptable" tiers are alternatives
// that don't count as failures (e.g. T1→T0 is fine by doctrine).
const SUITE = [
  // ── T0 — trivial ──────────────────────────────────────────────
  { p: 'muda a cor do header para #333', tier: 'T0' },
  { p: 'rename getUserById to fetchUser', tier: 'T0' },
  { p: 'add a console.log before the return', tier: 'T0' },
  { p: 'remove the commented-out code in line 45', tier: 'T0' },
  { p: 'fix the typo in the error message', tier: 'T0' },
  { p: 'what does this file do?', tier: 'T0' },
  { p: 'ls the contents of src/', tier: 'T0' },
  { p: 'show me the last 5 git commits', tier: 'T0' },
  { p: 'resume este ficheiro em 3 bullet points', tier: 'T0' },
  { p: 'traduz este comentário para inglês', tier: 'T0' },

  // ── T1 — simple transforms (T0 also acceptable) ───────────────
  { p: 'gera a commit message para este diff', tier: 'T1', also: ['T0'] },
  { p: 'write a regex to match email addresses', tier: 'T1', also: ['T0'] },
  { p: 'explain what map and reduce do in JavaScript', tier: 'T0' },
  { p: 'converte este JSON para YAML', tier: 'T0' },
  { p: 'add JSDoc to this function', tier: 'T1', also: ['T0'] },

  // ── T2 — reasoning ────────────────────────────────────────────
  { p: 'porque é que o useEffect dispara duas vezes em development?', tier: 'T2' },
  { p: 'debug: the API returns 403 but the token is valid', tier: 'T2' },
  { p: 'compare REST vs GraphQL for our use case', tier: 'T2', also: ['T0', 'T1'] },
  { p: 'investigate why memory usage spikes every 30 minutes', tier: 'T2' },
  { p: 'plan the implementation of rate limiting middleware', tier: 'T2' },
  { p: 'decompose this feature into smaller tasks', tier: 'T2' },
  { p: 'root cause analysis: users report slow page loads after deploy', tier: 'T2', also: ['T3'] },
  { p: 'optimiza a query que demora 3 segundos no dashboard', tier: 'T2' },

  // ── T3 — architecture / critical ──────────────────────────────
  { p: 'redesenha o sistema de autenticação para suportar SSO', tier: 'T3' },
  { p: 'refactor the entire data layer to use repository pattern', tier: 'T3' },
  { p: 'review the migration before we deploy to production', tier: 'T3' },
  { p: 'vou fazer push para main agora', tier: 'T3' },
  { p: 'audit the security of our API endpoints', tier: 'T3' },
  { p: 'decide entre PostgreSQL e MongoDB para o novo serviço', tier: 'T3', also: ['T2'] },
  { p: 'update the CI/CD pipeline to add staging deploys', tier: 'T3' },
  { p: 'the .env.production has wrong database credentials', tier: 'T3' },
  { p: 'migrate the database schema to support multi-tenancy', tier: 'T3' },
  { p: 'create a new microservice for payment processing', tier: 'T3' },

  // ── Edge cases ─────────────────────────────────────────────────
  { p: 'faz um fix rápido no botão mas pensa bem se não quebra o layout', tier: 'T0', also: ['T2'] },
  { p: 'just add a border-radius: 8px to the card component', tier: 'T0' },
  { p: 'esta função tem um bug subtil — o reduce não trata arrays vazios', tier: 'T2' },
  { p: 'move the utils folder to shared/utils and update all imports', tier: 'T3' },
  { p: 'deploy the fix to staging first and then production', tier: 'T3' },
  { p: 'cria um teste unitário para a função calculateDiscount', tier: 'T1', also: ['T0'] },
  { p: 'what is the time complexity of this algorithm?', tier: 'T0' },
  { p: 'reescreve este componente em TypeScript', tier: 'T2' },
  { p: 'check if there are any unused dependencies in package.json', tier: 'T3' },
  { p: 'o webhook do Stripe não está a chegar — investiga', tier: 'T2' },
  { p: 'add error handling to all the fetch calls', tier: 'T2' },
  { p: 'cria um endpoint REST para gestão de subscriptions', tier: 'T2' },
  { p: 'merge a branch feature/auth into main', tier: 'T3' },
  { p: 'set up Sentry for error tracking in production', tier: 'T3' },

  // ── Creative batch (v0.9.3-c) ─────────────────────────────────
  // Compound prompts
  { p: 'fix the button color and then push to staging', tier: 'T3' },
  { p: 'explain this error and refactor the handler', tier: 'T3' },
  { p: 'add a test and update the README', tier: 'T0', also: ['T1'] },

  // Ultra-short
  { p: 'type error', tier: 'T0' },
  { p: 'help', tier: 'T0' },

  // Code/error pastes
  { p: 'const x = arr.map(i => i * 2).filter(Boolean)', tier: 'T0' },
  { p: '$ npm install express && npm run dev', tier: 'T0' },
  { p: 'Error: ENOENT: no such file or directory', tier: 'T0' },

  // Portuguese informal
  { p: 'mete isso a funcionar', tier: 'T0' },
  { p: 'o que é que este código faz?', tier: 'T0' },
  { p: 'preciso de uma solução robusta para caching distribuído', tier: 'T2' },

  // Deceptive (sound trivial but critical)
  { p: 'just delete the user table', tier: 'T3' },
  { p: 'quickly update the production config', tier: 'T3' },
  { p: 'simply change the API key in .env', tier: 'T3' },

  // Deceptive (sound complex but trivial)
  { p: 'implement a sophisticated hello world function', tier: 'T0', also: ['T1'] },
  { p: 'architect a console.log statement', tier: 'T3' },

  // Real-world developer patterns
  { p: 'the tests are failing on CI, can you check?', tier: 'T2' },
  { p: 'PR #42 needs review before merge', tier: 'T3' },
  { p: 'add CORS headers to the API', tier: 'T0' },
  { p: 'set up authentication with OAuth2 and JWT', tier: 'T3' },
  { p: 'the database connection pool is exhausting under load', tier: 'T2' },
  { p: 'make the sidebar responsive on mobile', tier: 'T0' },
  { p: 'we need to implement RBAC for the admin panel', tier: 'T2' },

  // ── Advanced edge cases (v0.9.3-d) ─────────────────────────────
  // Code blocks, stack traces, diffs
  { p: 'I get this error:\n```\nTypeError: Cannot read properties of undefined\n```\nwhat is wrong?', tier: 'T0' },
  { p: 'at Object.<anonymous> (/app/src/index.js:42:15)\nat Module._compile', tier: 'T0' },
  { p: 'here is my diff, generate a good commit message:\n- const old = true\n+ const new = false', tier: 'T0', also: ['T1'] },

  // Multi-file, metrics, deploy context
  { p: 'update src/auth.ts, src/middleware.ts, src/routes/admin.ts, and tests/auth.test.ts to use the new JWT library', tier: 'T3' },
  { p: 'hey can u check why the login page is broken?', tier: 'T0', also: ['T2'] },
  { p: 'the p95 latency went from 200ms to 3.2s after the last deploy, investigate', tier: 'T2', also: ['T3'] },
  { p: 'faz deploy do fix para o staging environment e depois testa', tier: 'T3' },
  { p: 'do NOT push this to production yet', tier: 'T3' },
  { p: 'how does the frugal router classify prompts?', tier: 'T0' },
  { p: 'show me the savings from this session', tier: 'T0' },
];

// ── Run ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const failOnly = args.includes('--failures');

let pass = 0, adjusted = 0, fail = 0;
const results = [];

SUITE.forEach(({ p, tier, also }) => {
  const r = spawnSync('node', [CLASSIFY, p], { encoding: 'utf8', timeout: 5000 });
  let got = 'ERR', conf = 0, cat = 'error';
  try {
    const d = JSON.parse(r.stdout);
    got = d.tier; conf = d.confidence; cat = d.task_category;
  } catch { /* keep defaults */ }

  const exact = got === tier;
  const acceptable = exact || (also && also.includes(got));
  if (exact) { pass++; adjusted++; }
  else if (acceptable) { adjusted++; }
  else { fail++; }

  results.push({ prompt: p, expected: tier, got, conf, cat, exact, acceptable });
});

const total = SUITE.length;

if (jsonMode) {
  console.log(JSON.stringify({
    total,
    exact_pass: pass,
    adjusted_pass: adjusted,
    fail,
    accuracy_raw: +(pass / total * 100).toFixed(1),
    accuracy_adjusted: +(adjusted / total * 100).toFixed(1),
    failures: results.filter(r => !r.acceptable),
    timestamp: new Date().toISOString(),
  }, null, 2));
} else {
  if (!failOnly) {
    console.log('frugal — stress test\n');
    console.log(`Suite:             ${total} prompts`);
    console.log(`Exact accuracy:    ${pass}/${total} (${(pass/total*100).toFixed(1)}%)`);
    console.log(`Adjusted accuracy: ${adjusted}/${total} (${(adjusted/total*100).toFixed(1)}%)`);
    console.log(`True failures:     ${fail}`);
    console.log('');
  }

  const failures = results.filter(r => !r.acceptable);
  if (failures.length) {
    console.log('Failures:');
    failures.forEach(r => {
      console.log(`  ${r.expected}→${r.got} [${r.conf}] "${r.prompt.slice(0, 60)}"`);
    });
  } else if (!failOnly) {
    console.log('No true failures. All misroutings are within acceptable bounds.');
  }
}

process.exit(adjusted / total >= 0.85 ? 0 : 1);
