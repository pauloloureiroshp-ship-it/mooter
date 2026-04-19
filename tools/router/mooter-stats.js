#!/usr/bin/env node
// mooter-stats.js — detailed stats command (manual invocation only).
//
// The v2.0 statusline is a 2-line badge. Everything else lives here:
// providers, latency, GPU, detailed distribution, session counts.
//
// Usage:
//   node tools/router/mooter-stats.js
//   node tools/router/mooter-stats.js --session <id>

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const BRAND = '\x1b[38;2;194;95;101m';

const args = process.argv.slice(2);
const sessionIdx = args.indexOf('--session');
const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : null;

function fetchJson(urlPath, timeoutMs = 500) {
  try {
    const script = `
      const http = require('http');
      const req = http.get('http://127.0.0.1:7821${urlPath}', (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => process.stdout.write(body));
      });
      req.on('error', () => process.exit(1));
      req.setTimeout(${timeoutMs - 50}, () => { req.destroy(); process.exit(2); });
    `;
    const r = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    });
    if (r.status !== 0 || !r.stdout) return null;
    return JSON.parse(r.stdout);
  } catch { return null; }
}

function header(text) {
  console.log(`\n${BRAND}${BOLD}▸ ${text}${RESET}`);
}

function kv(key, val) {
  console.log(`  ${DIM}${key.padEnd(18)}${RESET} ${val}`);
}

console.log(`${BRAND}${BOLD}mooter stats${RESET}  ${DIM}detailed report${RESET}`);

const metricsPath = sessionId ? `/metrics?session_id=${encodeURIComponent(sessionId)}` : '/metrics';
const m = fetchJson(metricsPath);

if (!m) {
  console.log(`  ${DIM}tracker offline (127.0.0.1:7821)${RESET}`);
  process.exit(0);
}

header('Overview');
kv('prompts', m.prompts || 0);
kv('saved_pct', `${Math.round(m.saved_pct || 0)}%`);
kv('saved_usd', `$${(m.saved || 0).toFixed(2)}`);
kv('spent_usd', `$${(m.actual_cost || 0).toFixed(2)}`);
kv('currency', m.currency || 'USD');

if (m.providers) {
  header('Providers');
  const states = { ok: '●', degraded: '◐', unknown: '◌', off: '○' };
  Object.entries(m.providers).forEach(([name, state]) => {
    const dot = states[state] || state;
    kv(name, `${dot} ${state}`);
  });
}

if (m.latency && m.latency.sample_size) {
  header('Latency');
  kv('p50_ms', m.latency.p50_ms);
  kv('sample_size', m.latency.sample_size);
  if (m.latency.delta_vs_opus_ms != null) {
    kv('delta_vs_opus_ms', m.latency.delta_vs_opus_ms);
  }
}

const gpu = fetchJson('/gpu', 300);
if (gpu && gpu.vendor && gpu.vendor !== 'cpu') {
  header('GPU');
  kv('name', gpu.name_short || 'GPU');
  kv('vendor', gpu.vendor);
  if (gpu.utilPct != null) kv('util_pct', `${gpu.utilPct}%`);
} else {
  const hwPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'hw-capability.json');
  if (fs.existsSync(hwPath)) {
    try {
      const hw = JSON.parse(fs.readFileSync(hwPath, 'utf8'));
      if (hw.name) {
        header('Hardware');
        kv('name', hw.name);
      }
    } catch {}
  }
}

if (m.pct_by_tier) {
  header('Distribution (advisory)');
  Object.entries(m.pct_by_tier).forEach(([tier, pct]) => {
    kv(tier, `${Math.round(pct)}%`);
  });
}

console.log('');
