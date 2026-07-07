// lp-secret-scan.test.js — Review Security · LP-5. Static secret detector: pins the shape of
// every finding, the redaction (never leaks a full secret), the path-based severity escalation
// (public/, .env*) and fail-soft behaviour on garbage input.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { scanSecrets, isSensitivePath } = require('./lp-secret-scan.js');

test('scanSecrets: detects an AWS access key as critical', () => {
  const files = [{ path: 'src/config.js', content: 'const key = "AKIAABCDEFGHIJKLMNOP";' }];
  const out = scanSecrets(files);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'aws-access-key');
  assert.strictEqual(out[0].severity, 'critical');
  assert.strictEqual(out[0].line, 1);
  assert.strictEqual(out[0].path, 'src/config.js');
});

test('scanSecrets: detects a GitHub personal access token as critical', () => {
  const ghp = 'ghp_' + 'a'.repeat(36);
  // No API_KEY/SECRET/PASSWORD/TOKEN keyword in this line — isolates the github-token detector
  // from the generic-assignment detector (a "token:" prefix would double-fire, by design).
  const out = scanSecrets([{ path: 'notes.md', content: 'const gh = "' + ghp + '";' }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'github-token');
  assert.strictEqual(out[0].severity, 'critical');
});

test('scanSecrets: detects a Stripe live secret key as critical', () => {
  const sk = 'sk_live_' + 'x'.repeat(24);
  const out = scanSecrets([{ path: 'stripe.ts', content: 'const stripeKey = "' + sk + '";' }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'stripe-live-key');
  assert.strictEqual(out[0].severity, 'critical');
});

test('scanSecrets: detects every PEM private key header variant as critical', () => {
  const variants = [
    '-----BEGIN RSA PRIVATE KEY-----',
    '-----BEGIN EC PRIVATE KEY-----',
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    '-----BEGIN PRIVATE KEY-----',
  ];
  for (const header of variants) {
    const out = scanSecrets([{ path: 'id_rsa', content: header + '\nMIIBogIBAAKC...\n-----END' }]);
    assert.strictEqual(out.length, 1, header);
    assert.strictEqual(out[0].type, 'pem-private-key', header);
    assert.strictEqual(out[0].severity, 'critical', header);
  }
});

test('scanSecrets: detects generic API_KEY/SECRET/PASSWORD/TOKEN assignments as warning', () => {
  const content = [
    'API_KEY=abcd1234efgh',
    'SECRET="topsecretvalue"',
    "PASSWORD='hunter2hunter2'",
    'AUTH_TOKEN=zzz999yyy888',
  ].join('\n');
  const out = scanSecrets([{ path: 'src/config.js', content }]);
  assert.strictEqual(out.length, 4);
  for (const f of out) {
    assert.strictEqual(f.type, 'generic-secret-assignment');
    assert.strictEqual(f.severity, 'warning');
  }
});

test('scanSecrets: redaction — the full secret NEVER appears in the preview', () => {
  const secret = 'AKIAABCDEFGHIJKLMNOP';
  const out = scanSecrets([{ path: 'a.js', content: 'x = "' + secret + '"' }]);
  assert.strictEqual(out.length, 1);
  assert.ok(!out[0].preview.includes(secret), 'full secret must not leak');
  assert.strictEqual(out[0].preview, secret.slice(0, 4) + '…');
});

test('scanSecrets: redaction applies to generic-assignment values too', () => {
  const value = 'superlongsecretvaluethatmustneverleak';
  const out = scanSecrets([{ path: 'a.env', content: 'API_KEY=' + value }]);
  assert.strictEqual(out.length, 1);
  assert.ok(!out[0].preview.includes(value.slice(4)), 'no tail of the secret leaks');
  assert.strictEqual(out[0].preview, value.slice(0, 4) + '…');
});

test('scanSecrets: escalates a generic assignment to critical under public/ or .env*', () => {
  const publicOut = scanSecrets([{ path: 'landing/public/config.js', content: 'TOKEN=abcd1234' }]);
  assert.strictEqual(publicOut[0].severity, 'critical');

  const envOut = scanSecrets([{ path: '.env.production', content: 'SECRET=abcd1234' }]);
  assert.strictEqual(envOut[0].severity, 'critical');

  const normalOut = scanSecrets([{ path: 'src/config.js', content: 'SECRET=abcd1234' }]);
  assert.strictEqual(normalOut[0].severity, 'warning');
});

test('isSensitivePath: recognises public/ dirs and .env-family basenames only', () => {
  assert.strictEqual(isSensitivePath('public/index.html'), true);
  assert.strictEqual(isSensitivePath('apps/web/public/x.js'), true);
  assert.strictEqual(isSensitivePath('.env'), true);
  assert.strictEqual(isSensitivePath('.env.local'), true);
  assert.strictEqual(isSensitivePath('src/index.js'), false);
  assert.strictEqual(isSensitivePath('src/publicish.js'), false);
});

test('scanSecrets: no false positives on clean, secret-free source', () => {
  const content = [
    'function greet(name) { return "hi " + name; }',
    'const TOKENIZER = new Tokenizer();',
    'const NOTOKEN = load();',
    '// PASSWORD reset flow lives in auth.js',
  ].join('\n');
  const out = scanSecrets([{ path: 'src/app.js', content }]);
  assert.deepStrictEqual(out, []);
});

test('scanSecrets: fail-soft on null, non-array, and garbage entries — never throws', () => {
  assert.deepStrictEqual(scanSecrets(null), []);
  assert.deepStrictEqual(scanSecrets(undefined), []);
  assert.deepStrictEqual(scanSecrets('not-an-array'), []);
  assert.deepStrictEqual(scanSecrets(42), []);
  assert.deepStrictEqual(
    scanSecrets([null, 'garbage', 123, {}, { path: 1, content: 2 }, { path: 'x.js', content: '' }]),
    []
  );
});
