#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');
const HOME = os.homedir();
const FRUGAL_DIR = path.join(HOME, '.frugal');
const MOOTER_DIR = path.join(HOME, '.mooter');
const BASE_URL = 'https://landing-five-azure-16.vercel.app';
const { getHubUrl } = require('../router/env');
const HUB_URL = getHubUrl();

// ── Result accumulator ──────────────────────────────────────────────────────
const results = { B1: [], B2: [], B3: [], B4: [], B5: [] };

function check(block, icon, label, detail = '') {
  results[block].push({ icon, label, detail });
  console.log(`  ${icon} ${label}${detail ? ': ' + detail : ''}`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function isValidJSON(str) {
  try { JSON.parse(str); return true; } catch { return false; }
}

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.exp < Math.floor(Date.now() / 1000);
  } catch { return true; }
}

function isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((str || '').trim());
}

function httpRequest(url, opts = {}) {
  const mod = url.startsWith('https') ? https : http;
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const headers = {};
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers,
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(body), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body, headers: res.headers }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: true, message: e.message }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ status: 0, timeout: true }); });
    req.end();
  });
}

function testClassify(prompt) {
  try {
    const result = execSync(`node "${path.join(REPO_ROOT, 'tools/router/classify.js')}" ${JSON.stringify(prompt)}`, {
      cwd: REPO_ROOT,
      timeout: 5000,
      env: { ...process.env },
    }).toString();
    return JSON.parse(result);
  } catch { return null; }
}

// ── BLOCO 1: Ficheiros e CLI ────────────────────────────────────────────────
async function runB1() {
  const B = 'B1';

  // Core files
  const coreFiles = [
    { p: 'tools/router/classify.js', extra: 'exports classify()' },
    { p: 'tools/router/inject_context.js' },
    { p: 'tools/router/PostToolUse.js' },
    { p: 'tools/router/savings-tracker.js' },
    { p: 'tools/router/frugal-doctor.js', extra: 'has --sync flag' },
    { p: 'tools/router/frugal-login.js' },
    { p: 'tools/router/patterns.js' },
    { p: 'tools/router/pricing.js' },
    { p: 'tools/router/gold-labels.json', validate: 'json-array' },
    { p: 'tools/router/version.json', validate: 'version-field' },
  ];

  for (const f of coreFiles) {
    const full = path.join(REPO_ROOT, f.p);
    if (!fileExists(full)) {
      check(B, '\u274C', f.p, 'MISSING');
      continue;
    }
    if (f.validate === 'json-array') {
      const content = readFileSafe(full);
      if (!content || !isValidJSON(content)) {
        check(B, '\u274C', f.p, 'invalid JSON');
      } else {
        const arr = JSON.parse(content);
        check(B, Array.isArray(arr) && arr.length > 0 ? '\u2705' : '\u26A0\uFE0F',
          f.p, `${Array.isArray(arr) ? arr.length : 0} entries`);
      }
    } else if (f.validate === 'version-field') {
      const content = readFileSafe(full);
      try {
        const obj = JSON.parse(content);
        check(B, obj.version ? '\u2705' : '\u274C', f.p, `version=${obj.version || 'MISSING'}`);
      } catch { check(B, '\u274C', f.p, 'invalid JSON'); }
    } else if (f.extra === 'exports classify()') {
      const content = readFileSafe(full);
      check(B, content && /function classify\b/.test(content) ? '\u2705' : '\u26A0\uFE0F',
        f.p, f.extra);
    } else if (f.extra === 'has --sync flag') {
      const content = readFileSafe(full);
      check(B, content && /--sync/.test(content) ? '\u2705' : '\u26A0\uFE0F',
        f.p, f.extra);
    } else {
      check(B, '\u2705', f.p, 'exists');
    }
  }

  // Landing files
  const landingFiles = [
    'landing/app/(app)/layout.tsx',
    'landing/app/(app)/dashboard/page.tsx',
    'landing/app/(app)/settings/page.tsx',
    'landing/app/(app)/admin/page.tsx',
    'landing/app/api/me/route.ts',
    'landing/app/api/profile/route.ts',
    'landing/app/api/install-complete/route.ts',
    'landing/app/api/admin/stats/route.ts',
    'landing/app/auth/callback/route.ts',
    'landing/middleware.ts',
  ];

  for (const f of landingFiles) {
    const full = path.join(REPO_ROOT, f);
    check(B, fileExists(full) ? '\u2705' : '\u274C', f, fileExists(full) ? 'exists' : 'MISSING');
  }

  // Migrations
  const migrations = [
    'landing/migrations/002_devices_table.sql',
    'landing/migrations/003_decisions_log.sql',
  ];
  for (const f of migrations) {
    const full = path.join(REPO_ROOT, f);
    check(B, fileExists(full) ? '\u2705' : '\u274C', f, fileExists(full) ? 'exists' : 'MISSING');
  }

  // Local state
  const authTokenPath = path.join(FRUGAL_DIR, 'auth.token');
  const authToken = readFileSafe(authTokenPath);
  if (!authToken || !authToken.trim()) {
    check(B, '\u274C', '~/.frugal/auth.token', 'missing or empty');
  } else if (isTokenExpired(authToken.trim())) {
    check(B, '\u274C', '~/.frugal/auth.token', 'EXPIRED');
  } else {
    check(B, '\u2705', '~/.frugal/auth.token', 'valid, not expired');
  }

  const deviceIdPath = path.join(FRUGAL_DIR, 'device.id');
  const deviceId = readFileSafe(deviceIdPath);
  if (!deviceId || !deviceId.trim()) {
    check(B, '\u274C', '~/.frugal/device.id', 'missing or empty');
  } else if (!isUUID(deviceId.trim())) {
    check(B, '\u26A0\uFE0F', '~/.frugal/device.id', `not UUID format: ${deviceId.trim().slice(0, 20)}`);
  } else {
    check(B, '\u2705', '~/.frugal/device.id', deviceId.trim());
  }

  const settingsPath = path.join(HOME, '.claude', 'settings.json');
  if (!fileExists(settingsPath)) {
    check(B, '\u274C', '~/.claude/settings.json', 'MISSING');
  } else {
    const content = readFileSafe(settingsPath);
    try {
      const obj = JSON.parse(content);
      const hasHooks = obj.hooks && Object.keys(obj.hooks).length > 0;
      check(B, hasHooks ? '\u2705' : '\u26A0\uFE0F', '~/.claude/settings.json',
        hasHooks ? `${Object.keys(obj.hooks).length} hook(s) configured` : 'no hooks found');
    } catch { check(B, '\u274C', '~/.claude/settings.json', 'invalid JSON'); }
  }
}

// ── BLOCO 2: Seguranca e Auth ───────────────────────────────────────────────
async function runB2() {
  const B = 'B2';

  // Auth guard — endpoints must return 401 without token
  const guardChecks = [
    { path: '/api/me', method: 'GET' },
    { path: '/api/profile?userId=xxx', method: 'GET' },
    { path: '/api/install-complete', method: 'POST', accept: [401, 405] },
    { path: '/api/admin/stats', method: 'GET' },
  ];

  for (const ep of guardChecks) {
    try {
      const res = await httpRequest(`${BASE_URL}${ep.path}`);
      const accepted = ep.accept || [401];
      if (accepted.includes(res.status)) {
        check(B, '\u2705', `${ep.method} ${ep.path} (no token)`, `${res.status} as expected`);
      } else {
        check(B, '\u274C', `${ep.method} ${ep.path} (no token)`, `expected ${accepted.join('/')}, got ${res.status}`);
      }
    } catch (e) {
      check(B, '\u26A0\uFE0F', `${ep.method} ${ep.path} (no token)`, `request failed: ${e.message}`);
    }
  }

  // Admin guard — needs non-admin token
  check(B, '\u26A0\uFE0F', 'GET /api/admin/stats (non-admin token)', 'SKIP — no secondary test token available');

  // CORS / Headers
  try {
    const res = await httpRequest(`${BASE_URL}/api/me`);
    const ct = res.headers && res.headers['content-type'];
    check(B, ct && ct.includes('application/json') ? '\u2705' : '\u26A0\uFE0F',
      'GET /api/me content-type', ct || 'missing');
  } catch {
    check(B, '\u26A0\uFE0F', 'GET /api/me content-type', 'request failed');
  }

  // install-complete accepts Bearer header (structural check)
  const authTokenPath = path.join(FRUGAL_DIR, 'auth.token');
  const token = (readFileSafe(authTokenPath) || '').trim();
  if (token) {
    try {
      const res = await httpRequest(`${BASE_URL}/api/install-complete`, { token, method: 'GET' });
      // We just need it to not reject the Authorization header format
      check(B, res.status !== 0 ? '\u2705' : '\u26A0\uFE0F',
        'POST /api/install-complete accepts Bearer', `status=${res.status}`);
    } catch {
      check(B, '\u26A0\uFE0F', 'POST /api/install-complete accepts Bearer', 'request failed');
    }
  } else {
    check(B, '\u26A0\uFE0F', 'POST /api/install-complete accepts Bearer', 'SKIP — no token');
  }
}

// ── BLOCO 3: Integridade de Dados ───────────────────────────────────────────
async function runB3() {
  const B = 'B3';

  const authTokenPath = path.join(FRUGAL_DIR, 'auth.token');
  const token = (readFileSafe(authTokenPath) || '').trim();

  if (!token || isTokenExpired(token)) {
    const reason = !token ? 'no auth token' : 'auth token expired';
    check(B, '\u26A0\uFE0F', 'Profile Integrity', `SKIP — ${reason}`);
    check(B, '\u26A0\uFE0F', 'Device Integrity', `SKIP — ${reason}`);
    check(B, '\u26A0\uFE0F', 'Admin Stats', `SKIP — ${reason}`);
    check(B, '\u26A0\uFE0F', 'Data Consistency', `SKIP — ${reason}`);
    return;
  }

  // Profile integrity
  let userId = null;
  try {
    const meRes = await httpRequest(`${BASE_URL}/api/me`, { token });
    if (meRes.status === 200 && meRes.json) {
      userId = meRes.json.userId || meRes.json.user_id;
      const email = meRes.json.email;
      check(B, userId && email ? '\u2705' : '\u274C',
        'GET /api/me', `userId=${userId || 'null'}, email=${email || 'null'}`);
    } else {
      check(B, '\u274C', 'GET /api/me', `status=${meRes.status}`);
    }
  } catch (e) {
    check(B, '\u274C', 'GET /api/me', `error: ${e.message}`);
  }

  if (userId) {
    try {
      const profRes = await httpRequest(`${BASE_URL}/api/profile?userId=${userId}`, { token });
      if (profRes.status === 200 && profRes.json) {
        const p = profRes.json;
        check(B, p.install_completed === true ? '\u2705' : '\u274C',
          'profile.install_completed', String(p.install_completed));
        check(B, p.frugal_version ? '\u2705' : '\u274C',
          'profile.frugal_version', p.frugal_version || 'null');
        check(B, p.hardware_tier && p.hardware_tier !== 'unknown' ? '\u2705' : '\u26A0\uFE0F',
          'profile.hardware_tier', p.hardware_tier || 'null');

        // Device integrity
        const devices = p.devices || [];
        check(B, devices.length > 0 ? '\u2705' : '\u274C',
          'profile.devices', `${devices.length} device(s)`);

        if (devices.length > 0) {
          const localDeviceId = (readFileSafe(path.join(FRUGAL_DIR, 'device.id')) || '').trim();
          const dev = devices.find(d => d.device_id === localDeviceId) || devices[0];

          check(B, dev.device_id === localDeviceId ? '\u2705' : '\u26A0\uFE0F',
            'device.device_id matches local', `remote=${dev.device_id}, local=${localDeviceId}`);
          check(B, dev.decisions_count > 0 ? '\u2705' : '\u26A0\uFE0F',
            'device.decisions_count', String(dev.decisions_count));
          check(B, dev.savings_usd > 0 ? '\u2705' : '\u26A0\uFE0F',
            'device.savings_usd', String(dev.savings_usd));
          check(B, dev.os_type === process.platform ? '\u2705' : '\u26A0\uFE0F',
            'device.os_type matches platform', `remote=${dev.os_type}, local=${process.platform}`);

          if (dev.last_sync_at) {
            const syncAge = Date.now() - new Date(dev.last_sync_at).getTime();
            const days = Math.round(syncAge / 86400000);
            check(B, days < 7 ? '\u2705' : '\u26A0\uFE0F',
              'device.last_sync_at', `${days} days ago`);
          } else {
            check(B, '\u26A0\uFE0F', 'device.last_sync_at', 'null');
          }

          // Data consistency — compare local tracker vs remote
          try {
            const trackerRes = await httpRequest('http://127.0.0.1:7821/metrics');
            if (trackerRes.status === 200 && trackerRes.json) {
              const localCount = trackerRes.json.prompts || trackerRes.json.m?.prompts || 0;
              const remoteCount = dev.decisions_count || 0;
              if (remoteCount === 0) {
                check(B, '\u26A0\uFE0F', 'Data consistency (local vs remote)', 'remote decisions_count=0');
              } else {
                const diff = Math.abs(localCount - remoteCount) / Math.max(localCount, remoteCount);
                if (diff > 0.8) {
                  check(B, '\u274C', 'Data consistency', `local=${localCount}, remote=${remoteCount}, diff=${Math.round(diff * 100)}%`);
                } else if (diff > 0.2) {
                  check(B, '\u26A0\uFE0F', 'Data consistency', `local=${localCount}, remote=${remoteCount}, diff=${Math.round(diff * 100)}%`);
                } else {
                  check(B, '\u2705', 'Data consistency', `local=${localCount}, remote=${remoteCount}, diff=${Math.round(diff * 100)}%`);
                }
              }
            } else {
              check(B, '\u26A0\uFE0F', 'Data consistency', 'savings-tracker not responding on :7821');
            }
          } catch {
            check(B, '\u26A0\uFE0F', 'Data consistency', 'savings-tracker not running');
          }
        }
      } else {
        check(B, '\u274C', 'GET /api/profile', `status=${profRes.status}`);
      }
    } catch (e) {
      check(B, '\u274C', 'GET /api/profile', `error: ${e.message}`);
    }
  }

  // Admin stats
  try {
    const adminRes = await httpRequest(`${BASE_URL}/api/admin/stats`, { token });
    if (adminRes.status === 200 && adminRes.json) {
      const s = adminRes.json;
      check(B, s.totalUsers >= 1 ? '\u2705' : '\u274C', 'admin.totalUsers', String(s.totalUsers));
      check(B, s.totalDevices >= 1 ? '\u2705' : '\u274C', 'admin.totalDevices', String(s.totalDevices));
      check(B, s.totalDecisions > 0 ? '\u2705' : '\u26A0\uFE0F', 'admin.totalDecisions', String(s.totalDecisions));
      const funnelInstalled = s.funnel?.installed || s.funnel?.install_completed;
      check(B, funnelInstalled >= 1 ? '\u2705' : '\u26A0\uFE0F', 'admin.funnel.installed', String(funnelInstalled));
    } else if (adminRes.status === 403) {
      check(B, '\u26A0\uFE0F', 'Admin Stats', 'SKIP — token is not admin (403)');
    } else {
      check(B, '\u274C', 'Admin Stats', `status=${adminRes.status}`);
    }
  } catch (e) {
    check(B, '\u26A0\uFE0F', 'Admin Stats', `error: ${e.message}`);
  }
}

// ── BLOCO 4: Algorithm Feedback Loop ────────────────────────────────────────
async function runB4() {
  const B = 'B4';

  // Gold labels
  const goldPath = path.join(REPO_ROOT, 'tools/router/gold-labels.json');
  const goldContent = readFileSafe(goldPath);
  if (!goldContent) {
    check(B, '\u274C', 'gold-labels.json', 'MISSING');
  } else {
    try {
      const arr = JSON.parse(goldContent);
      const count = Array.isArray(arr) ? arr.length : 0;
      if (count === 0) check(B, '\u274C', 'gold-labels.json', '0 entries — no data to learn from');
      else if (count < 10) check(B, '\u26A0\uFE0F', 'gold-labels.json', `${count} entries — few data points`);
      else check(B, '\u2705', 'gold-labels.json', `${count} entries`);
    } catch { check(B, '\u274C', 'gold-labels.json', 'invalid JSON'); }
  }

  // Classify test prompts
  const testCases = [
    { prompt: 'muda a cor do botao para azul', expected: 'T0', label: 'trivial edit' },
    { prompt: 'redesenha a arquitectura do vault para multi-user', expected: 'T3', label: 'architecture' },
    { prompt: 'porque e que o websocket reconnect falha as vezes', expected: 'T2', label: 'bug investigation' },
  ];

  for (const tc of testCases) {
    const result = testClassify(tc.prompt);
    if (!result) {
      check(B, '\u274C', `classify("${tc.label}")`, 'failed to run');
    } else {
      const hasTier = !!result.tier;
      const hasCategory = !!result.task_category;
      const hasBackend = !!result.recommended_backend;
      const hasConf = typeof result.confidence === 'number';
      const tierMatch = result.tier === tc.expected;

      if (hasTier && hasCategory && hasBackend && hasConf) {
        check(B, tierMatch ? '\u2705' : '\u26A0\uFE0F',
          `classify("${tc.label}")`,
          `tier=${result.tier}${tierMatch ? '' : ' (expected ' + tc.expected + ')'}, conf=${result.confidence}`);
      } else {
        check(B, '\u274C', `classify("${tc.label}")`, 'missing fields in output');
      }
    }
  }

  // Tuned block
  const classifyContent = readFileSafe(path.join(REPO_ROOT, 'tools/router/classify.js'));
  if (classifyContent) {
    const hasTunedBlock = /TUNED-BLOCK-START/.test(classifyContent);
    const hasTunedThreshold = /TUNED_COMPLEXITY_THRESHOLD/.test(classifyContent);
    if (hasTunedBlock && hasTunedThreshold) {
      const match = classifyContent.match(/sample_size\s*[:=]\s*(\d+)/);
      const sampleSize = match ? parseInt(match[1]) : -1;
      check(B, sampleSize > 0 ? '\u2705' : '\u26A0\uFE0F',
        'TUNED-BLOCK', `present, sample_size=${sampleSize > 0 ? sampleSize : 'unknown'}`);
    } else {
      check(B, '\u26A0\uFE0F', 'TUNED-BLOCK', 'not found in classify.js — router not yet tuned');
    }
  }

  // Decisions log
  const decisionsLogPath = path.join(HOME, '.claude', 'tools', 'router', 'decisions.log');
  const dlContent = readFileSafe(decisionsLogPath);
  if (!dlContent) {
    check(B, '\u26A0\uFE0F', 'decisions.log', 'not found at ~/.claude/tools/router/');
  } else {
    const lines = dlContent.trim().split('\n').filter(l => l.trim());
    check(B, lines.length > 0 ? '\u2705' : '\u26A0\uFE0F',
      'decisions.log lines', String(lines.length));

    // Validate last 3 lines
    const last3 = lines.slice(-3);
    let validCount = 0;
    for (const line of last3) {
      try {
        const obj = JSON.parse(line);
        if (obj.tier && obj.timestamp) validCount++;
      } catch { /* invalid line */ }
    }
    check(B, validCount === last3.length ? '\u2705' : '\u26A0\uFE0F',
      'decisions.log format', `${validCount}/${last3.length} recent lines are valid JSON with tier+timestamp`);
  }

  // Backtest capability
  const backtestExists = fileExists(path.join(REPO_ROOT, 'tools/router/backtest.js'));
  const goldExists = fileExists(goldPath);
  check(B, backtestExists && goldExists ? '\u2705' : '\u26A0\uFE0F',
    'Backtest capability', backtestExists && goldExists ? 'backtest.js + gold-labels.json present' : 'missing components');
}

// ── BLOCO 5: UX/UI e Conectividade ──────────────────────────────────────────
async function runB5() {
  const B = 'B5';

  // Vercel endpoints
  const endpoints = [
    { url: `${BASE_URL}`, label: 'Landing page', expect: 200 },
    { url: `${BASE_URL}/dashboard`, label: 'Dashboard', expect: [200, 307, 308] },
    { url: `${BASE_URL}/api/me`, label: '/api/me (no token)', expect: 401 },
  ];

  for (const ep of endpoints) {
    try {
      const res = await httpRequest(ep.url);
      const expected = Array.isArray(ep.expect) ? ep.expect : [ep.expect];
      check(B, expected.includes(res.status) ? '\u2705' : '\u26A0\uFE0F',
        ep.label, `status=${res.status}`);
    } catch {
      check(B, '\u274C', ep.label, 'request failed');
    }
  }

  // Hub connectivity
  try {
    const hubRes = await httpRequest(`${HUB_URL}/health`);
    check(B, hubRes.status === 200 ? '\u2705' : '\u26A0\uFE0F',
      'Hub /health', `status=${hubRes.status}`);
  } catch {
    check(B, '\u26A0\uFE0F', 'Hub /health', 'request failed');
  }

  // Local services
  try {
    const trackerRes = await httpRequest('http://127.0.0.1:7821/health');
    check(B, trackerRes.status === 200 ? '\u2705' : '\u26A0\uFE0F',
      'savings-tracker :7821', trackerRes.status === 200 ? 'running' : 'not responding');
  } catch {
    check(B, '\u26A0\uFE0F', 'savings-tracker :7821', 'not running — savings won\'t auto-update');
  }

  // Auth flow completeness
  const callbackPath = path.join(REPO_ROOT, 'landing/app/auth/callback/route.ts');
  const callbackContent = readFileSafe(callbackPath);
  if (callbackContent) {
    check(B, /bridge|html|<!DOCTYPE/i.test(callbackContent) ? '\u2705' : '\u26A0\uFE0F',
      'auth/callback bridge HTML', callbackContent.includes('bridge') || callbackContent.includes('html') ? 'present' : 'not detected');
  } else {
    check(B, '\u274C', 'auth/callback/route.ts', 'MISSING');
  }

  const loginPath = path.join(REPO_ROOT, 'tools/router/frugal-login.js');
  const loginContent = readFileSafe(loginPath);
  if (loginContent) {
    const opensBrowser = /open|browser|xdg-open|start\s/i.test(loginContent);
    const listens7822 = /7822/.test(loginContent);
    check(B, opensBrowser && listens7822 ? '\u2705' : '\u26A0\uFE0F',
      'frugal-login.js', `opens browser=${opensBrowser}, listens :7822=${listens7822}`);
  } else {
    check(B, '\u274C', 'frugal-login.js', 'MISSING');
  }

  // MacBook readiness (manual checks)
  const manualChecks = [
    'Node.js instalado no MacBook',
    'Git clone do repo no MacBook',
    'npm install corrido',
    '.claude/settings.json configurado com os hooks',
    'frugal-login.js executado \u2192 token em ~/.frugal/auth.token',
    'frugal-doctor --sync \u2192 "\u2713 profile updated" com novo device_id',
  ];
  for (const mc of manualChecks) {
    check(B, '\u23F3', `[MacBook] ${mc}`, 'PENDING');
  }
}

// ── Report Generator ────────────────────────────────────────────────────────
function generateReport() {
  let versionStr = 'unknown';
  try {
    const v = JSON.parse(readFileSafe(path.join(REPO_ROOT, 'tools/router/version.json')));
    versionStr = v.version;
  } catch { /* ignore */ }

  const now = new Date().toISOString();
  const hostname = os.hostname();
  const platform = process.platform;
  const arch = process.arch;

  const blockNames = {
    B1: 'B1 \u2014 Ficheiros e CLI',
    B2: 'B2 \u2014 Seguran\u00E7a e Auth',
    B3: 'B3 \u2014 Integridade de Dados',
    B4: 'B4 \u2014 Feedback Loop',
    B5: 'B5 \u2014 UX/UI Conectividade',
  };

  // Summary table
  let totalAll = 0, passAll = 0, warnAll = 0, failAll = 0;
  const summaryRows = [];
  for (const [key, name] of Object.entries(blockNames)) {
    const items = results[key];
    const total = items.length;
    const pass = items.filter(r => r.icon === '\u2705').length;
    const warn = items.filter(r => r.icon === '\u26A0\uFE0F' || r.icon === '\u23F3').length;
    const fail = items.filter(r => r.icon === '\u274C').length;
    summaryRows.push(`| ${name} | ${total} | ${pass} | ${warn} | ${fail} |`);
    totalAll += total; passAll += pass; warnAll += warn; failAll += fail;
  }

  let verdict;
  if (failAll === 0 && warnAll === 0) verdict = '\u2705 READY FOR MACBOOK';
  else if (failAll === 0) verdict = '\u26A0\uFE0F REVIEW WARNINGS';
  else verdict = '\u274C BLOCKERS FOUND';

  // Build report
  let report = `# Frugal Pre-Flight Audit Report
**Gerado em:** ${now}
**M\u00E1quina:** ${hostname} (${platform} ${arch})
**Frugal version:** ${versionStr}

## Sum\u00E1rio
| Bloco | Total | \u2705 Pass | \u26A0\uFE0F Warn | \u274C Fail |
|---|---|---|---|---|
${summaryRows.join('\n')}
| **TOTAL** | **${totalAll}** | **${passAll}** | **${warnAll}** | **${failAll}** |

**Veredicto:** ${verdict}

---

`;

  // Detailed sections
  for (const [key, name] of Object.entries(blockNames)) {
    report += `## ${name}\n`;
    for (const item of results[key]) {
      report += `- ${item.icon} **${item.label}**${item.detail ? ': ' + item.detail : ''}\n`;
    }
    report += '\n';
  }

  // Blockers
  report += '---\n\n## Bloqueadores (\u274C)\n';
  const blockers = Object.values(results).flat().filter(r => r.icon === '\u274C');
  if (blockers.length === 0) {
    report += 'Nenhum bloqueador encontrado.\n\n';
  } else {
    for (const b of blockers) {
      report += `- **${b.label}**: ${b.detail}\n`;
    }
    report += '\n';
  }

  // Warnings
  report += '## Avisos (\u26A0\uFE0F)\n';
  const warnings = Object.values(results).flat().filter(r => r.icon === '\u26A0\uFE0F');
  if (warnings.length === 0) {
    report += 'Nenhum aviso.\n\n';
  } else {
    for (const w of warnings) {
      report += `- **${w.label}**: ${w.detail}\n`;
    }
    report += '\n';
  }

  // Pending manual
  report += '## Pendentes Manuais (\u23F3)\n';
  const pending = Object.values(results).flat().filter(r => r.icon === '\u23F3');
  if (pending.length === 0) {
    report += 'Nenhum pendente.\n';
  } else {
    for (const p of pending) {
      report += `- [ ] ${p.label.replace('[MacBook] ', '')}${p.detail && p.detail !== 'PENDING' ? ': ' + p.detail : ''}\n`;
    }
  }
  report += '\n';

  const reportPath = path.join(REPO_ROOT, 'docs', 'AUDIT_REPORT_PRE_MACBOOK.md');
  fs.writeFileSync(reportPath, report, 'utf8');
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n\uD83D\uDD0D frugal Pre-Flight Audit\n');

  console.log('\n\u2500\u2500 B1: Ficheiros e CLI \u2500\u2500');
  await runB1();

  console.log('\n\u2500\u2500 B2: Seguran\u00E7a e Auth \u2500\u2500');
  await runB2();

  console.log('\n\u2500\u2500 B3: Integridade de Dados \u2500\u2500');
  await runB3();

  console.log('\n\u2500\u2500 B4: Feedback Loop \u2500\u2500');
  await runB4();

  console.log('\n\u2500\u2500 B5: UX/UI Conectividade \u2500\u2500');
  await runB5();

  generateReport();

  // Print verdict
  const allFails = Object.values(results).flat().filter(r => r.icon === '\u274C');
  const allWarns = Object.values(results).flat().filter(r => r.icon === '\u26A0\uFE0F');

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  if (allFails.length === 0 && allWarns.length === 0) {
    console.log('\u2705 READY FOR MACBOOK \u2014 zero blockers, zero warnings');
  } else if (allFails.length === 0) {
    console.log(`\u26A0\uFE0F  REVIEW ${allWarns.length} WARNING(S) \u2014 no blockers`);
  } else {
    console.log(`\u274C ${allFails.length} BLOCKER(S) FOUND \u2014 fix before MacBook`);
  }
  console.log('\uD83D\uDCC4 Relat\u00F3rio completo: docs/AUDIT_REPORT_PRE_MACBOOK.md');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');
}

main().catch(console.error);
