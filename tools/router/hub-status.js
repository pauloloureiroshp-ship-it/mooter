#!/usr/bin/env node
/**
 * hub-status.js — CLI to check frugal-hub status and local sync state.
 *
 * Usage: node hub-status.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const HUB_URL = process.env.FRUGAL_HUB_URL || 'https://frugal-hub.frugal-hub.workers.dev';

function httpGet(urlStr) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: { 'User-Agent': 'frugal-hub-status/1.0' },
    }, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 300, data: JSON.parse(data) }); }
        catch { resolve({ ok: false }); }
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.end();
  });
}

function readLocalVersion(filePath) {
  try {
    const d = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return d._version || '—';
  } catch { return '—'; }
}

function fileAge(filePath) {
  try {
    const ms = Date.now() - fs.statSync(filePath).mtimeMs;
    if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)}h ago`;
    return `${Math.round(ms / 86400000)}d ago`;
  } catch { return 'never'; }
}

async function main() {
  console.log('');
  console.log('frugal — hub status');
  console.log('');

  // Local state
  console.log('Local:');
  console.log(`  community-tuning:  v${readLocalVersion(path.join(ROUTER_DIR, 'community-tuning.json'))}`);
  console.log(`  model-catalog:     v${readLocalVersion(path.join(ROUTER_DIR, 'model-catalog.json'))}`);
  console.log(`  last pull:         ${fileAge(path.join(ROUTER_DIR, '.last-hub-pull'))}`);
  console.log(`  last push:         ${fileAge(path.join(ROUTER_DIR, '.last-hub-push'))}`);
  console.log('');

  // Remote state
  console.log('Hub:');
  const vr = await httpGet(HUB_URL + '/api/version');
  if (!vr.ok) {
    console.log(`  status: UNREACHABLE (${vr.error || 'unknown'})`);
    console.log('');
    return;
  }

  const v = vr.data;
  console.log(`  status:            online`);
  console.log(`  router-tuning:     v${v.router_tuning?.version || '—'} (${v.router_tuning?.samples || 0} samples)`);
  console.log(`  model-catalog:     v${v.model_catalog?.version || '—'}`);
  console.log(`  deltas (7d):       ${v.community?.delta_count_7d || 0}`);
  console.log(`  prompts (7d):      ${v.community?.prompt_count_7d || 0}`);
  console.log('');

  // Stats
  const sr = await httpGet(HUB_URL + '/api/stats');
  if (sr.ok && sr.data) {
    const s = sr.data;
    console.log('Community (7d):');
    if (s.avg_tier_distribution) {
      const td = s.avg_tier_distribution;
      console.log(`  tier distribution: T0=${(td.t0 * 100).toFixed(1)}% T1=${(td.t1 * 100).toFixed(1)}% T2=${(td.t2 * 100).toFixed(1)}% T3=${(td.t3 * 100).toFixed(1)}%`);
    }
    if (s.avg_savings !== null) {
      console.log(`  avg savings:       ${(s.avg_savings * 100).toFixed(1)}%`);
    }
    console.log(`  pending models:    ${s.pending_models}`);
    console.log('');
  }
}

main().catch((e) => {
  console.error('hub-status error:', e.message);
});
