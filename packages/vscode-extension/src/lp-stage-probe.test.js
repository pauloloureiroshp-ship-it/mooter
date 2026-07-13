'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const Probe = require('./lp-stage-probe.js');

test('classifyResponse rejects HTTP 500 even when the body is HTML', () => {
  const result = Probe.classifyResponse({ statusCode: 500, headers: { 'content-type': 'text/html' }, bodySample: '<html>Internal Server Error</html>' });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /HTTP 500/);
});

test('classifyResponse accepts successful HTML and records the instrumentation hint', () => {
  const result = Probe.classifyResponse({ statusCode: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, bodySample: '<!doctype html><main data-insp-path="page.tsx:1">ok</main>' });
  assert.deepStrictEqual(result, { ok: true, statusCode: 200, reason: null, instrumented: true });
});

test('classifyResponse rejects JSON and frame-blocking headers', () => {
  assert.match(Probe.classifyResponse({ statusCode: 200, headers: { 'content-type': 'application/json' }, bodySample: '{}' }).reason, /não HTML/);
  assert.match(Probe.classifyResponse({ statusCode: 200, headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY' }, bodySample: '<html></html>' }).reason, /X-Frame-Options/);
  assert.match(Probe.classifyResponse({ statusCode: 200, headers: { 'content-type': 'text/html', 'content-security-policy': "frame-ancestors 'none'" }, bodySample: '<html></html>' }).reason, /frame-ancestors/);
  assert.match(Probe.classifyResponse({ statusCode: 200, headers: { 'content-type': 'text/html', 'content-security-policy': 'frame-ancestors https://*.example.com' }, bodySample: '<html></html>' }).reason, /frame-ancestors/, 'a wildcard inside an unrelated host is not a global wildcard');
  assert.strictEqual(Probe.classifyResponse({ statusCode: 200, headers: { 'content-type': 'text/html', 'content-security-policy': 'frame-ancestors *' }, bodySample: '<html></html>' }).ok, true);
  assert.match(Probe.classifyResponse({ statusCode: 200, headers: { 'content-type': 'text/html', 'content-security-policy': ['frame-ancestors https://blocked.example', 'frame-ancestors *'] }, bodySample: '<html></html>' }).reason, /frame-ancestors/, 'all cumulative CSP policies must permit the parent');
});

test('sameOriginRedirect never follows another host, scheme or port', () => {
  assert.strictEqual(Probe.sameOriginRedirect('/login', 'http', 7819), '/login');
  assert.strictEqual(Probe.sameOriginRedirect('http://127.0.0.1:7819/login?q=1', 'http', 7819), null, 'hostname swaps are cross-origin even inside loopback');
  assert.strictEqual(Probe.sameOriginRedirect('http://localhost:3000/login', 'http', 7819), null);
  assert.strictEqual(Probe.sameOriginRedirect('https://localhost:7819/login', 'http', 7819), null);
  assert.strictEqual(Probe.sameOriginRedirect('https://example.com/login', 'http', 7819), null);
});

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

async function listen6(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: 0, host: '::1', ipv6Only: true }, resolve);
  });
  return { server, port: server.address().port };
}

test('probe result frames the same localhost authority that the Host validation used', async () => {
  const app = await listen((req, res) => {
    if (req.headers.host === 'localhost:' + app.port) {
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>vhost ok</html>');
    } else { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html>wrong vhost</html>'); }
  });
  try {
    const result = await Probe.probeOne(app.port, { timeoutMs: 500 });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.connectedHost, '127.0.0.1');
    assert.strictEqual(result.url, 'http://localhost:' + app.port);
  } finally { await new Promise((resolve) => app.server.close(resolve)); }
});

test('probe rejects a redirect that swaps localhost to 127.0.0.1 on the same port', async () => {
  const app = await listen((_req, res) => {
    res.writeHead(302, { location: 'http://127.0.0.1:' + app.port + '/other' }); res.end();
  });
  try {
    const result = await Probe.probeOne(app.port, { timeoutMs: 500 });
    assert.strictEqual(result.ok, false);
    assert.match(result.reason, /fora do localhost/);
  } finally { await new Promise((resolve) => app.server.close(resolve)); }
});

test('probe falls back to IPv6 loopback for a localhost server bound only on ::1', async (t) => {
  let app;
  try {
    app = await listen6((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>ipv6</html>'); });
  } catch (error) {
    t.skip('IPv6 loopback unavailable: ' + (error && error.code || 'unknown'));
    return;
  }
  try {
    const result = await Probe.probeOne(app.port, { timeoutMs: 500 });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.connectedHost, '::1');
    assert.strictEqual(result.url, 'http://localhost:' + app.port);
  } finally { await new Promise((resolve) => app.server.close(resolve)); }
});

test('probePorts skips a reachable HTTP 500 and accepts the next healthy HTML server', async () => {
  const bad = await listen((_req, res) => { res.writeHead(500, { 'content-type': 'text/html' }); res.end('<html>broken</html>'); });
  const good = await listen((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><div data-insp-path="page.tsx:1">ok</div>'); });
  try {
    const result = await Probe.probePorts([bad.port, good.port], { timeoutMs: 500 });
    assert.deepStrictEqual(result.livePorts, [good.port]);
    assert.strictEqual(result.rejected.length, 1);
    assert.strictEqual(result.rejected[0].port, bad.port);
    assert.strictEqual(result.rejected[0].statusCode, 500);
    assert.strictEqual(result.accepted.instrumented, true);
  } finally {
    await new Promise((resolve) => bad.server.close(resolve));
    await new Promise((resolve) => good.server.close(resolve));
  }
});

test('probePorts stops on a reachable broken configured port instead of jumping to another app', async () => {
  const bad = await listen((_req, res) => { res.writeHead(500, { 'content-type': 'text/html' }); res.end('<html>broken</html>'); });
  const unrelated = await listen((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><p>another app</p>'); });
  try {
    const result = await Probe.probePorts([bad.port, unrelated.port], { timeoutMs: 500, authoritativePorts: [bad.port] });
    assert.deepStrictEqual(result.livePorts, []);
    assert.strictEqual(result.rejected.length, 1);
    assert.strictEqual(result.rejected[0].port, bad.port);
    assert.strictEqual(result.rejected[0].statusCode, 500);
  } finally {
    await new Promise((resolve) => bad.server.close(resolve));
    await new Promise((resolve) => unrelated.server.close(resolve));
  }
});

test('probePorts treats a connected timeout as inconclusive and keeps the configured port authoritative', async () => {
  const slow = await listen((_req, res) => {
    setTimeout(() => {
      if (res.destroyed) return;
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>late compile</html>');
    }, 150);
  });
  const unrelated = await listen((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html>another app</html>');
  });
  try {
    const result = await Probe.probePorts([slow.port, unrelated.port], {
      timeoutMs: 30,
      authoritativePorts: [slow.port],
    });
    assert.deepStrictEqual(result.livePorts, []);
    assert.deepStrictEqual(result.rejected, [], 'no HTTP status means no positive broken-page verdict');
    assert.strictEqual(result.accepted, null);
    assert.strictEqual(result.inconclusive.length, 1);
    assert.strictEqual(result.inconclusive[0].port, slow.port);
  } finally {
    await new Promise((resolve) => slow.server.close(resolve));
    await new Promise((resolve) => unrelated.server.close(resolve));
  }
});

test('repeated probes remain healthy when Node reuses an already-connected socket', async () => {
  const page = await listen((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><p data-insp-path="page.tsx:1:1">ok</p>'); });
  try {
    for (let i = 0; i < 20; i++) {
      const result = await Probe.probeOne(page.port, { timeoutMs: 500 });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.instrumented, true);
    }
  } finally {
    await new Promise((resolve) => page.server.close(resolve));
  }
});
