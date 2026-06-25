'use strict';
/**
 * savings-tracker-security.test.js — guards for the localhost-only tracker.
 *
 * Verifies the v0.8.0 hardening that closed the audit MED finding
 * (Access-Control-Allow-Origin: '*' with no Origin/Host check):
 *   1. Host allow-list defeats DNS-rebinding.
 *   2. Origin allow-list rejects any real website; allows node clients
 *      (no Origin) and the VS Code webview.
 *   3. JSON content-type required on writes (kills simple-request CSRF).
 *   4. send() never emits '*'; reflects only an allowed origin.
 *
 * Run:  node --test savings-tracker-security.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const tracker = require('./savings-tracker.js');
const { guardRequest, originAllowed, hostAllowed, corsOriginFor } = tracker;

const PORT = 7821; // matches the default the server uses for ALLOWED_HOSTS
const reqLike = (headers, method = 'GET') => ({ headers, method });

// ── Unit: hostAllowed ────────────────────────────────────────────────────────
test('hostAllowed: loopback hosts pass, everything else fails', () => {
  assert.equal(hostAllowed(`127.0.0.1:${PORT}`), true);
  assert.equal(hostAllowed(`localhost:${PORT}`), true);
  assert.equal(hostAllowed(`[::1]:${PORT}`), true);
  assert.equal(hostAllowed('127.0.0.1:9999'), false); // wrong port
  assert.equal(hostAllowed('evil.com'), false);       // DNS-rebind target
  assert.equal(hostAllowed('evil.com:7821'), false);
  assert.equal(hostAllowed(''), false);
  assert.equal(hostAllowed(undefined), false);
});

// ── Unit: originAllowed ──────────────────────────────────────────────────────
test('originAllowed: node clients + webview pass, websites fail', () => {
  assert.equal(originAllowed(undefined), true);                 // node client
  assert.equal(originAllowed(''), true);                        // node client
  assert.equal(originAllowed('null'), true);                    // sandboxed webview
  assert.equal(originAllowed('vscode-webview://abc123'), true); // the cockpit
  assert.equal(originAllowed('https://evil.com'), false);       // exfil vector
  assert.equal(originAllowed('http://localhost:3000'), false);  // any site, even local
  assert.equal(originAllowed('https://mooter.ai'), false);      // our own site too
});

test('corsOriginFor: never wildcards; reflects only allowed origins', () => {
  assert.equal(corsOriginFor(undefined), null);                 // node → no header
  assert.equal(corsOriginFor('vscode-webview://x'), 'vscode-webview://x');
  assert.equal(corsOriginFor('https://evil.com'), null);
});

// ── Unit: guardRequest (the gate the server applies per-request) ─────────────
test('guardRequest: legitimate node GET passes', () => {
  assert.equal(guardRequest(reqLike({ host: `127.0.0.1:${PORT}` }, 'GET')), null);
});

test('guardRequest: legitimate node JSON write passes', () => {
  assert.equal(guardRequest(reqLike(
    { host: `127.0.0.1:${PORT}`, 'content-type': 'application/json' }, 'POST')), null);
});

test('guardRequest: website Origin is rejected (read exfil blocked)', () => {
  assert.equal(guardRequest(reqLike(
    { host: `127.0.0.1:${PORT}`, origin: 'https://evil.com' }, 'GET')), 'forbidden_origin');
});

test('guardRequest: DNS-rebind Host is rejected', () => {
  assert.equal(guardRequest(reqLike({ host: 'evil.com' }, 'GET')), 'bad_host');
});

test('guardRequest: text/plain simple-request POST is rejected (CSRF blocked)', () => {
  assert.equal(guardRequest(reqLike(
    { host: `127.0.0.1:${PORT}`, 'content-type': 'text/plain' }, 'POST')), 'bad_content_type');
  // no content-type at all on a write → also rejected
  assert.equal(guardRequest(reqLike({ host: `127.0.0.1:${PORT}` }, 'PUT')), 'bad_content_type');
});

test('guardRequest: webview JSON write passes', () => {
  assert.equal(guardRequest(reqLike(
    { host: `127.0.0.1:${PORT}`, origin: 'vscode-webview://x', 'content-type': 'application/json' },
    'PUT')), null);
});

// ── Integration: boot the real server on a test port and hit it ──────────────
// Skipped automatically if the port can't bind. Uses a non-default port via
// MOOTER_TRACKER_PORT so it never collides with the production daemon on 7821.
test('integration: real server enforces the guards end-to-end', async (t) => {
  const TEST_PORT = 7931;
  const child = spawn(process.execPath, [path.join(__dirname, 'savings-tracker.js')], {
    env: { ...process.env, MOOTER_TRACKER_PORT: String(TEST_PORT) },
    stdio: 'ignore',
  });
  t.after(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } });

  const call = (opts) => new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: TEST_PORT, path: opts.path || '/health',
      method: opts.method || 'GET', headers: opts.headers || {}, timeout: 2500,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });

  // Wait for the server to come up (up to ~3s).
  let up = false;
  for (let i = 0; i < 30; i++) {
    try { const r = await call({ path: '/health' }); if (r.status === 200) { up = true; break; } }
    catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) { t.skip('server did not start in time'); return; }

  // 1. Legitimate node GET → 200, and NO wildcard CORS header.
  const ok = await call({ path: '/health' });
  assert.equal(ok.status, 200);
  assert.notEqual(ok.headers['access-control-allow-origin'], '*');

  // 2. Website Origin → 403.
  const evilOrigin = await call({ path: '/metrics', headers: { origin: 'https://evil.com' } });
  assert.equal(evilOrigin.status, 403);

  // 3. DNS-rebind Host → 403.
  const evilHost = await call({ path: '/health', headers: { host: 'evil.com' } });
  assert.equal(evilHost.status, 403);

  // 4. text/plain POST → 403 (no preflight CSRF).
  const csrf = await call({
    path: '/decision', method: 'POST',
    headers: { 'content-type': 'text/plain' }, body: '{"x":1}',
  });
  assert.equal(csrf.status, 403);

  // 5. Webview Origin GET → 200 with the origin reflected (not '*').
  const webview = await call({ path: '/health', headers: { origin: 'vscode-webview://abc' } });
  assert.equal(webview.status, 200);
  assert.equal(webview.headers['access-control-allow-origin'], 'vscode-webview://abc');
});
