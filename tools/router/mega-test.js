#!/usr/bin/env node
/**
 * mega-test.js — 100-prompt comprehensive test across 10 categories.
 * Finds misroutings, reports by category, outputs JSON for analysis.
 *
 * Usage:
 *   node mega-test.js              → full report
 *   node mega-test.js --json       → machine-readable
 *   node mega-test.js --failures   → only failures
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const CLASSIFY = path.join(__dirname, 'classify.js');

const SUITE = [
  // ── Frontend (10) ──
  { p: 'add a loading spinner to the login button', tier: 'T0', tag: 'fe' },
  { p: 'the CSS grid layout breaks on Safari mobile', tier: 'T2', tag: 'fe', also: ['T0'] },
  { p: 'implement infinite scroll with virtualization for 10k items', tier: 'T2', tag: 'fe' },
  { p: 'convert all class components to functional with hooks', tier: 'T3', tag: 'fe' },
  { p: 'add dark mode toggle to the settings page', tier: 'T0', tag: 'fe' },
  { p: 'the useCallback is causing stale closures in the chat component', tier: 'T2', tag: 'fe' },
  { p: 'implement drag and drop for the kanban board', tier: 'T2', tag: 'fe', also: ['T0'] },
  { p: 'add aria labels and keyboard navigation to the dropdown', tier: 'T0', tag: 'fe' },
  { p: 'the bundle size is 4.2MB, find what is causing it', tier: 'T2', tag: 'fe', also: ['T0'] },
  { p: 'create a reusable modal component with portal', tier: 'T0', tag: 'fe' },

  // ── Backend (10) ──
  { p: 'add rate limiting to the /api/auth endpoint', tier: 'T2', tag: 'be', also: ['T3'] },
  { p: 'the worker process crashes after processing 1000 messages', tier: 'T2', tag: 'be' },
  { p: 'implement webhook retry logic with exponential backoff', tier: 'T2', tag: 'be', also: ['T0'] },
  { p: 'add a health check endpoint that pings the database', tier: 'T0', tag: 'be' },
  { p: 'set up Redis caching layer for the product catalog API', tier: 'T2', tag: 'be', also: ['T0'] },
  { p: 'the file upload endpoint accepts files over 100MB with no limit', tier: 'T3', tag: 'be', also: ['T2'] },
  { p: 'implement server-sent events for real-time notifications', tier: 'T2', tag: 'be', also: ['T0'] },
  { p: 'add request validation middleware using Zod schemas', tier: 'T0', tag: 'be' },
  { p: 'the API response time degrades linearly with concurrent users', tier: 'T2', tag: 'be' },
  { p: 'design the event sourcing architecture for the order system', tier: 'T3', tag: 'be' },

  // ── Database (10) ──
  { p: 'add an index on users.email for faster lookups', tier: 'T0', tag: 'db' },
  { p: 'the JOIN query on orders takes 8 seconds with 1M rows', tier: 'T2', tag: 'db' },
  { p: 'write a migration to add soft delete to all tables', tier: 'T3', tag: 'db' },
  { p: 'set up read replicas for the reporting dashboard', tier: 'T3', tag: 'db', also: ['T2'] },
  { p: 'the database deadlocks when two users update the same cart', tier: 'T2', tag: 'db' },
  { p: 'backup the production database before the schema change', tier: 'T3', tag: 'db' },
  { p: 'add a composite index on (tenant_id, created_at)', tier: 'T0', tag: 'db' },
  { p: 'normalize the address table \u2014 it has 15 columns with nulls', tier: 'T2', tag: 'db', also: ['T0'] },
  { p: 'implement connection pooling with PgBouncer', tier: 'T2', tag: 'db', also: ['T0'] },
  { p: 'the N+1 query problem is killing the dashboard performance', tier: 'T2', tag: 'db' },

  // ── DevOps (10) ──
  { p: 'write a Dockerfile for the Node.js API', tier: 'T0', tag: 'devops' },
  { p: 'the container keeps getting OOM killed in production', tier: 'T2', tag: 'devops', also: ['T3'] },
  { p: 'set up GitHub Actions CI with test, lint, and deploy stages', tier: 'T3', tag: 'devops' },
  { p: 'add horizontal pod autoscaling based on CPU usage', tier: 'T2', tag: 'devops', also: ['T0'] },
  { p: 'the SSL certificate expired and the site is down', tier: 'T3', tag: 'devops', also: ['T2'] },
  { p: 'implement blue-green deployment for zero downtime', tier: 'T3', tag: 'devops' },
  { p: 'add a liveness probe to the Kubernetes deployment', tier: 'T0', tag: 'devops' },
  { p: 'set up Terraform for the AWS infrastructure', tier: 'T3', tag: 'devops', also: ['T2'] },
  { p: 'the Docker build takes 12 minutes, optimize the layers', tier: 'T2', tag: 'devops' },
  { p: 'configure nginx reverse proxy with SSL termination', tier: 'T2', tag: 'devops', also: ['T0'] },

  // ── Security (10) ──
  { p: 'the search input is vulnerable to XSS \u2014 sanitize it', tier: 'T3', tag: 'sec' },
  { p: 'implement CSRF protection for all POST endpoints', tier: 'T3', tag: 'sec', also: ['T2'] },
  { p: 'add bcrypt password hashing to replace MD5', tier: 'T3', tag: 'sec', also: ['T2'] },
  { p: 'the admin panel has no authorization checks', tier: 'T3', tag: 'sec' },
  { p: 'implement JWT token rotation with refresh tokens', tier: 'T3', tag: 'sec' },
  { p: 'run OWASP ZAP scan against the staging environment', tier: 'T3', tag: 'sec' },
  { p: 'add Content-Security-Policy headers to prevent injection', tier: 'T0', tag: 'sec', also: ['T2'] },
  { p: 'the SQL query uses string concatenation instead of params', tier: 'T3', tag: 'sec', also: ['T2'] },
  { p: 'implement IP-based rate limiting to prevent brute force', tier: 'T2', tag: 'sec', also: ['T3'] },
  { p: 'rotate all API keys after the security incident', tier: 'T3', tag: 'sec' },

  // ── Testing (10) ──
  { p: 'write unit tests for the calculateTotal function', tier: 'T0', tag: 'test', also: ['T1'] },
  { p: 'set up Playwright for end-to-end testing', tier: 'T2', tag: 'test', also: ['T0'] },
  { p: 'the test suite takes 45 minutes \u2014 find the slow tests', tier: 'T2', tag: 'test' },
  { p: 'add snapshot tests for the email templates', tier: 'T0', tag: 'test' },
  { p: 'mock the payment gateway in integration tests', tier: 'T0', tag: 'test' },
  { p: 'implement contract testing between the API and mobile app', tier: 'T2', tag: 'test', also: ['T0'] },
  { p: 'add code coverage reporting to the CI pipeline', tier: 'T3', tag: 'test' },
  { p: 'write a load test for 10k concurrent WebSocket connections', tier: 'T2', tag: 'test', also: ['T0'] },
  { p: 'the flaky test passes locally but fails in CI randomly', tier: 'T2', tag: 'test' },
  { p: 'add mutation testing to verify test quality', tier: 'T2', tag: 'test', also: ['T0'] },

  // ── Architecture (10) ──
  { p: 'split the monolith into 3 microservices', tier: 'T3', tag: 'arch' },
  { p: 'implement the CQRS pattern for the inventory system', tier: 'T3', tag: 'arch', also: ['T2'] },
  { p: 'design the API versioning strategy for v2', tier: 'T3', tag: 'arch' },
  { p: 'evaluate whether to use GraphQL or REST for the new service', tier: 'T3', tag: 'arch', also: ['T2'] },
  { p: 'implement circuit breaker for external API calls', tier: 'T2', tag: 'arch', also: ['T0'] },
  { p: 'design the multi-region failover strategy', tier: 'T3', tag: 'arch' },
  { p: 'add an API gateway to centralize auth and rate limiting', tier: 'T3', tag: 'arch' },
  { p: 'implement the strangler fig pattern for legacy migration', tier: 'T3', tag: 'arch' },
  { p: 'decide between PostgreSQL and DynamoDB for the new service', tier: 'T3', tag: 'arch', also: ['T2'] },
  { p: 'design the event-driven architecture with Kafka', tier: 'T3', tag: 'arch' },

  // ── Debug (10) ──
  { p: 'TypeError: Cannot read property length of undefined at line 42', tier: 'T0', tag: 'debug' },
  { p: 'FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - heap out of memory', tier: 'T0', tag: 'debug' },
  { p: 'the async function returns a promise instead of the resolved value', tier: 'T2', tag: 'debug' },
  { p: 'segfault in the native addon when processing large images', tier: 'T2', tag: 'debug' },
  { p: 'the event listener is not being removed and causes memory leak', tier: 'T2', tag: 'debug' },
  { p: 'CORS error: No Access-Control-Allow-Origin header is present', tier: 'T0', tag: 'debug' },
  { p: 'the WebSocket connection drops after exactly 60 seconds', tier: 'T2', tag: 'debug' },
  { p: 'race condition between the two useEffect hooks', tier: 'T2', tag: 'debug' },
  { p: 'the bcrypt compare always returns false after password reset', tier: 'T2', tag: 'debug', also: ['T3'] },
  { p: 'UnhandledPromiseRejection: Error: connect ECONNREFUSED 127.0.0.1:5432', tier: 'T0', tag: 'debug' },

  // ── Documentation (5) ──
  { p: 'write the API documentation for the user endpoints', tier: 'T0', tag: 'doc' },
  { p: 'add JSDoc types to the utility functions', tier: 'T0', tag: 'doc', also: ['T1'] },
  { p: 'create an architecture decision record for choosing Redis', tier: 'T2', tag: 'doc', also: ['T3'] },
  { p: 'write the onboarding guide for new developers', tier: 'T0', tag: 'doc' },
  { p: 'document the deployment process step by step', tier: 'T0', tag: 'doc', also: ['T3'] },

  // ── Tooling (5) ──
  { p: 'set up ESLint and Prettier with consistent rules', tier: 'T0', tag: 'tool' },
  { p: 'configure Husky pre-commit hooks for lint and test', tier: 'T0', tag: 'tool' },
  { p: 'the npm audit shows 12 high severity vulnerabilities', tier: 'T3', tag: 'tool' },
  { p: 'set up Renovate for automated dependency updates', tier: 'T0', tag: 'tool' },
  { p: 'configure path aliases in tsconfig for cleaner imports', tier: 'T0', tag: 'tool' },
];

// ── Run ──
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const failOnly = args.includes('--failures');

let exact = 0, adjusted = 0, fail = 0;
const results = [];

SUITE.forEach(({ p, tier, also, tag }) => {
  const r = spawnSync('node', [CLASSIFY, p], { encoding: 'utf8', timeout: 5000 });
  let got = 'ERR', conf = 0, cat = 'error';
  try {
    const d = JSON.parse(r.stdout);
    got = d.tier; conf = d.confidence; cat = d.task_category;
  } catch { /* keep defaults */ }

  const isExact = got === tier;
  const isAcceptable = isExact || (also && also.includes(got));
  if (isExact) { exact++; adjusted++; }
  else if (isAcceptable) { adjusted++; }
  else { fail++; }

  results.push({ prompt: p, expected: tier, got, conf, cat, tag, exact: isExact, acceptable: isAcceptable });
});

const total = SUITE.length;

if (jsonMode) {
  console.log(JSON.stringify({
    total, exact, adjusted, fail,
    accuracy_raw: +(exact / total * 100).toFixed(1),
    accuracy_adjusted: +(adjusted / total * 100).toFixed(1),
    by_category: (() => {
      const cats = {};
      results.forEach(r => {
        if (!cats[r.tag]) cats[r.tag] = { total: 0, exact: 0, adjusted: 0, fail: 0 };
        cats[r.tag].total++;
        if (r.exact) cats[r.tag].exact++;
        if (r.acceptable) cats[r.tag].adjusted++;
        if (!r.acceptable) cats[r.tag].fail++;
      });
      return cats;
    })(),
    failures: results.filter(r => !r.acceptable),
    timestamp: new Date().toISOString(),
  }, null, 2));
} else {
  if (!failOnly) {
    console.log('mooter \u2014 mega test (100 prompts)\n');
    console.log(`Exact accuracy:    ${exact}/${total} (${(exact/total*100).toFixed(1)}%)`);
    console.log(`Adjusted accuracy: ${adjusted}/${total} (${(adjusted/total*100).toFixed(1)}%)`);
    console.log(`True failures:     ${fail}`);
    console.log('');

    // Per-category breakdown
    const cats = {};
    results.forEach(r => {
      if (!cats[r.tag]) cats[r.tag] = { total: 0, exact: 0, adj: 0, fail: 0 };
      cats[r.tag].total++;
      if (r.exact) cats[r.tag].exact++;
      if (r.acceptable) cats[r.tag].adj++;
      if (!r.acceptable) cats[r.tag].fail++;
    });
    console.log('By category:');
    Object.entries(cats).forEach(([cat, s]) => {
      const icon = s.fail === 0 ? '\u2713' : '\u2717';
      console.log(`  ${icon} ${cat.padEnd(8)} ${s.exact}/${s.total} exact  ${s.adj}/${s.total} adj  ${s.fail} fail`);
    });
    console.log('');
  }

  const failures = results.filter(r => !r.acceptable);
  if (failures.length) {
    console.log('True failures:');
    failures.forEach(r => {
      console.log(`  ${r.expected}\u2192${r.got} [${r.tag}] "${r.prompt.slice(0, 65)}"`);
    });
  } else if (!failOnly) {
    console.log('Zero true failures!');
  }
}

process.exit(adjusted / total >= 0.85 ? 0 : 1);
