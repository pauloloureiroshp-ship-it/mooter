'use strict';
// Host-side HTTP validation for the Live Preview App Stage.
//
// A TCP listener is not evidence of a usable preview. The probe accepts only a successful HTML
// response that Chromium may frame, follows redirects only inside the same localhost origin, and
// never returns response bodies to the webview. This keeps APIs, HTTP 500 pages and frame-blocked
// dashboards from becoming a false-green App Stage.

const http = require('http');
const https = require('https');

const MAX_SAMPLE_BYTES = 16 * 1024;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function headerValue(headers, name) {
  try {
    const value = headers && headers[String(name).toLowerCase()];
    if (Array.isArray(value)) return value.join(', ');
    return typeof value === 'string' ? value : '';
  } catch { return ''; }
}

function headerValues(headers, name) {
  try {
    const value = headers && headers[String(name).toLowerCase()];
    if (Array.isArray(value)) return value.map(String);
    return typeof value === 'string' ? [value] : [];
  } catch { return []; }
}

function frameBlockReason(headers) {
  const xfo = headerValue(headers, 'x-frame-options').trim().toLowerCase();
  if (xfo && (xfo.includes('deny') || xfo.includes('sameorigin') || xfo.includes('allow-from'))) {
    return 'X-Frame-Options bloqueia o iframe';
  }
  // Multiple CSP headers/policies are cumulative (intersection), not alternatives. Every policy
  // that declares frame-ancestors must permit the VS Code webview parent.
  const policies = headerValues(headers, 'content-security-policy')
    .flatMap((value) => String(value).split(/,(?=\s*(?:[a-z-]+\s|$))/i));
  for (const csp of policies) {
    const match = /(?:^|;)\s*frame-ancestors\s+([^;]+)/i.exec(csp);
    if (!match) continue;
    const rule = String(match[1] || '').trim().toLowerCase();
    const sources = rule.split(/\s+/).filter(Boolean);
    // Only a standalone wildcard or an explicit VS Code webview source permits this parent.
    // `https://*.example.com` contains a star but absolutely does not permit vscode-webview://.
    const allowsWebview = sources.includes('*') || sources.some((source) => source.startsWith('vscode-webview:'));
    if (!allowsWebview) return 'CSP frame-ancestors bloqueia o iframe';
  }
  return null;
}

function classifyResponse(input) {
  const value = input || {};
  const statusCode = Number.isInteger(value.statusCode) ? value.statusCode : null;
  const headers = value.headers && typeof value.headers === 'object' ? value.headers : {};
  const sample = String(value.bodySample == null ? '' : value.bodySample).slice(0, MAX_SAMPLE_BYTES);
  if (statusCode == null) return { ok: false, statusCode, reason: 'resposta HTTP sem status' };
  if (statusCode < 200 || statusCode >= 300) {
    return { ok: false, statusCode, reason: 'HTTP ' + statusCode + (statusCode >= 500 ? ' — dev server com erro interno' : ' — página indisponível') };
  }
  const frameBlocked = frameBlockReason(headers);
  if (frameBlocked) return { ok: false, statusCode, reason: frameBlocked };
  if (statusCode === 204) return { ok: false, statusCode, reason: 'HTTP 204 sem conteúdo' };

  const contentType = headerValue(headers, 'content-type').toLowerCase();
  const htmlType = contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
  const htmlBody = /<!doctype\s+html\b|<html(?:\s|>)/i.test(sample);
  if (htmlType || htmlBody) {
    return {
      ok: true,
      statusCode,
      reason: null,
      instrumented: /\bdata-insp-path\s*=|\blp-ready\b|\bNEXT_PUBLIC_LP_ROOT\b/.test(sample),
    };
  }
  if (contentType) return { ok: false, statusCode, reason: 'conteúdo ' + contentType.split(';')[0].trim().slice(0, 80) + ', não HTML' };
  return { ok: false, statusCode, reason: 'resposta sem documento HTML' };
}

function sameOriginRedirect(location, scheme, port, authorityHost) {
  try {
    const expectedHost = authorityHost === '127.0.0.1' ? '127.0.0.1' : 'localhost';
    const base = scheme + '://' + expectedHost + ':' + port + '/';
    const url = new URL(String(location || ''), base);
    const effectivePort = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);
    if (url.hostname !== expectedHost || url.protocol !== scheme + ':' || effectivePort !== port) return null;
    return (url.pathname || '/') + (url.search || '');
  } catch { return null; }
}

function probeEndpoint(port, options, connectedHost, pathName, redirectsLeft) {
  const opts = options || {};
  const schemes = opts.schemeByPort && typeof opts.schemeByPort === 'object' ? opts.schemeByPort : {};
  const scheme = schemes[port] === 'https' ? 'https' : 'http';
  const transport = scheme === 'https' ? https : http;
  const timeoutMs = typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0 ? opts.timeoutMs : 900;
  const pathToGet = typeof pathName === 'string' && pathName.startsWith('/') ? pathName : '/';
  const redirectBudget = Number.isInteger(redirectsLeft) ? redirectsLeft : 2;

  return new Promise((resolve) => {
    let settled = false;
    let connected = false;
    let hardTimer = null;
    let req = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (hardTimer) clearTimeout(hardTimer);
      try { if (req) req.destroy(); } catch { /* noop */ }
      resolve(Object.assign({ port, ok: false, reachable: connected, statusCode: null, reason: null, instrumented: false }, result || {}));
    };
    try {
      req = transport.get({
        hostname: connectedHost, port, path: pathToGet, rejectUnauthorized: false,
        headers: {
          Host: 'localhost:' + port,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'User-Agent': 'Mooter-Live-Preview-Probe',
        },
      }, (res) => {
        connected = true;
        const statusCode = Number.isInteger(res.statusCode) ? res.statusCode : null;
        const location = headerValue(res.headers, 'location');
        if (statusCode && REDIRECT_CODES.has(statusCode) && location) {
          const nextPath = sameOriginRedirect(location, scheme, port, 'localhost');
          try { res.resume(); } catch { /* noop */ }
          if (!nextPath) return finish({ reachable: true, statusCode, reason: 'redireciona para fora do localhost' });
          if (redirectBudget <= 0) return finish({ reachable: true, statusCode, reason: 'redirecionamentos em excesso' });
          probeEndpoint(port, opts, connectedHost, nextPath, redirectBudget - 1).then(finish, () => finish({ reachable: true, reason: 'falha ao seguir redirecionamento' }));
          return;
        }
        const chunks = [];
        let bytes = 0;
        res.on('data', (chunk) => {
          if (bytes >= MAX_SAMPLE_BYTES) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
          const take = buffer.subarray(0, Math.max(0, MAX_SAMPLE_BYTES - bytes));
          if (take.length) { chunks.push(take); bytes += take.length; }
        });
        res.once('end', () => {
          const verdict = classifyResponse({ statusCode, headers: res.headers, bodySample: Buffer.concat(chunks).toString('utf8') });
          finish({ reachable: true, statusCode, ok: verdict.ok, reason: verdict.reason, instrumented: verdict.instrumented === true });
        });
        res.once('aborted', () => finish({ reachable: true, statusCode, reason: 'resposta HTTP interrompida' }));
        res.once('error', () => finish({ reachable: true, statusCode, reason: 'erro ao ler a resposta HTTP' }));
      });
      req.once('socket', (socket) => socket.once('connect', () => { connected = true; }));
      req.setTimeout(timeoutMs, () => finish({ reachable: connected, reason: connected ? 'serviço não respondeu como página HTTP' : null }));
      hardTimer = setTimeout(() => finish({ reachable: connected, reason: connected ? 'resposta HTTP excedeu o limite' : null }), timeoutMs + 300);
      req.once('error', () => finish({ reachable: connected, reason: connected ? 'resposta não-HTTP' : null }));
    } catch { finish({ reachable: connected, reason: connected ? 'falha na validação HTTP' : null }); }
  });
}

async function probeOne(port, options, pathName, redirectsLeft) {
  // Bind-exclusive localhost servers are common across Node versions: some listen only on IPv4,
  // others only on IPv6. Validate both loopback families, but always advertise `localhost` because
  // that exactly matches the Host header validated above (avoids vhost probe/frame drift).
  let ipv4 = null;
  try { ipv4 = await probeEndpoint(port, options, '127.0.0.1', pathName, redirectsLeft); } catch { ipv4 = null; }
  if (ipv4 && ipv4.reachable) return Object.assign({}, ipv4, { connectedHost: '127.0.0.1', url: ((options && options.schemeByPort && options.schemeByPort[port] === 'https') ? 'https' : 'http') + '://localhost:' + port });
  let ipv6 = null;
  try { ipv6 = await probeEndpoint(port, options, '::1', pathName, redirectsLeft); } catch { ipv6 = null; }
  return Object.assign({}, ipv6 || ipv4 || { port, ok: false, reachable: false }, {
    connectedHost: ipv6 && ipv6.reachable ? '::1' : null,
    url: ((options && options.schemeByPort && options.schemeByPort[port] === 'https') ? 'https' : 'http') + '://localhost:' + port,
  });
}

async function probePorts(ports, options) {
  const opts = options || {};
  const uniq = Array.from(new Set((Array.isArray(ports) ? ports : []).filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535)));
  const authoritative = new Set((Array.isArray(opts.authoritativePorts) ? opts.authoritativePorts : []).filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535));
  // Run the bounded probes concurrently; select in candidate order afterwards. The old sequential
  // sweep could take ~N×timeout and made a refresh feel ignored even when it was working.
  const results = await Promise.all(uniq.map(async (port) => {
    try { return await probeOne(port, opts); } catch { return null; }
  }));
  const rejected = [];
  for (let i = 0; i < uniq.length; i++) {
    const port = uniq[i];
    const result = results[i];
    if (result && result.ok) return { livePorts: [port], rejected, accepted: result };
    if (result && result.reachable) {
      rejected.push({ port, statusCode: result.statusCode, reason: result.reason || 'não é uma página HTML enquadrável' });
      // A configured server that answers HTTP 500 is a broken project server, not permission to
      // silently jump to an unrelated healthy app on a common port. Unreachable configured ports
      // still fall through so zero-config detection remains useful.
      if (authoritative.has(port)) return { livePorts: [], rejected, accepted: null };
    }
  }
  return { livePorts: [], rejected, accepted: null };
}

module.exports = { MAX_SAMPLE_BYTES, headerValue, headerValues, frameBlockReason, classifyResponse, sameOriginRedirect, probeOne, probePorts };
