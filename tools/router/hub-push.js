#!/usr/bin/env node
/**
 * hub-push.js — sends anonymized delta to the frugal-hub.
 *
 * Called automatically by backtest.js --export-delta or manually.
 * Non-blocking: fire-and-forget. If hub is offline, silently exits.
 *
 * Usage:
 *   node hub-push.js                    # auto-export + push
 *   node hub-push.js <delta-file.json>  # push existing delta
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const DELTA_PATH = path.join(ROUTER_DIR, 'backtest-delta.json');
const LAST_PUSH_PATH = path.join(ROUTER_DIR, '.last-hub-push');
const HUB_URL = process.env.FRUGAL_HUB_URL || 'https://frugal-hub.frugal-hub.workers.dev';
const PUSH_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h minimum between pushes

function shouldPush() {
  try {
    const stat = fs.statSync(LAST_PUSH_PATH);
    if (Date.now() - stat.mtimeMs < PUSH_COOLDOWN_MS) return false;
  } catch { /* no file = never pushed */ }
  return true;
}

function markPushed() {
  try {
    fs.writeFileSync(LAST_PUSH_PATH, String(Date.now()));
  } catch { /* non-fatal */ }
}

function readDelta(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function enrichDelta(delta) {
  // Read subscription profile if available
  try {
    const sp = JSON.parse(fs.readFileSync(path.join(ROUTER_DIR, 'subscription-profile.json'), 'utf8'));
    delta.sub_profile = sp.profiles ? sp.profiles.anthropic : 'unknown';
  } catch {
    if (!delta.sub_profile) delta.sub_profile = 'unknown';
  }

  // Read hw capability if available
  try {
    const hw = JSON.parse(fs.readFileSync(path.join(ROUTER_DIR, 'hw-capability.json'), 'utf8'));
    delta.hw_tier = hw.hw_tier || delta.hw_tier || 'cpu-only';
    delta.vram_mb = hw.vram_mb || null;
  } catch {
    if (!delta.hw_tier) delta.hw_tier = 'cpu-only';
  }

  // P4: Enrich with real savings from the local tracker. The hub aggregates
  // these to power the landing page community counters with REAL numbers,
  // not estimates from tier distribution.
  try {
    const metrics = fetchLocalMetricsSync();
    if (metrics) {
      delta.savings_usd = round4(metrics.saved);
      delta.saved_pct = round4(metrics.saved_pct);
      delta.guaranteed_saved_usd = round4(metrics.guaranteed_saved);
      delta.real_cost_usd = round4(metrics.real_cost);
      delta.naive_cost_usd = round4(metrics.naive_cost);
      // Routing audit (if turn_end hook is installed)
      if (metrics.routing_audit) {
        delta.routing_honored_pct = metrics.routing_audit.estimated_honored_pct;
      }
    }
  } catch { /* tracker offline — push without savings, hub will count distribution only */ }

  // Ensure required fields
  delta.delta_version = '3'; // bumped: now includes savings_usd
  if (!delta.prompt_count) delta.prompt_count = 1;
  if (!delta.tier_distribution) {
    delta.tier_distribution = { t0: 0, t1: 0, t2: 0, t3: 1 };
  }

  return delta;
}

function round4(n) {
  if (typeof n !== 'number' || isNaN(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

// Fetch metrics from the local savings-tracker HTTP server (if running).
// Synchronous-ish via execSync to keep this script's flow simple.
function fetchLocalMetricsSync() {
  const { execSync } = require('child_process');
  try {
    const out = execSync(
      'node -e "const http=require(\'http\');http.get(\'http://127.0.0.1:7821/metrics\',r=>{let d=\'\';r.on(\'data\',c=>d+=c);r.on(\'end\',()=>process.stdout.write(d))})"',
      { encoding: 'utf8', timeout: 2000 }
    );
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function pushToHub(delta) {
  return new Promise((resolve) => {
    const body = JSON.stringify(delta);
    const url = new URL(HUB_URL + '/api/delta');
    const mod = url.protocol === 'https:' ? https : http;

    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'frugal-hub-push/1.0',
      },
    }, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ ok: res.statusCode < 300, status: res.statusCode, ...result });
        } catch {
          resolve({ ok: false, status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const filePath = args.find(a => !a.startsWith('--')) || DELTA_PATH;

  if (!force && !dryRun && !shouldPush()) {
    if (!args.includes('--quiet')) {
      console.log('frugal hub-push: cooldown active (last push < 24h ago). Use --force to override.');
    }
    process.exit(0);
  }

  // Generate delta if it doesn't exist
  if (!fs.existsSync(filePath)) {
    const { spawnSync } = require('child_process');
    const backtest = path.join(ROUTER_DIR, 'backtest.js');
    const r = spawnSync(process.execPath, [backtest, '--export-delta'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    if (r.status !== 0) {
      console.log('frugal hub-push: backtest --export-delta failed');
      process.exit(1);
    }
  }

  let delta = readDelta(filePath);
  if (!delta) {
    console.log(`frugal hub-push: cannot read ${filePath}`);
    process.exit(1);
  }

  delta = enrichDelta(delta);

  if (dryRun) {
    console.log('frugal hub-push [dry-run]: payload that WOULD be sent:');
    console.log(JSON.stringify(delta, null, 2));
    console.log('\nfrugal hub-push [dry-run]: no data was sent. Use without --dry-run to push.');
    process.exit(0);
  }

  const result = await pushToHub(delta);
  if (result.ok) {
    markPushed();
    console.log(`frugal hub-push: delta sent successfully (id: ${result.id}, trust: ${result.trust_score})`);
  } else {
    console.log(`frugal hub-push: failed (${result.error || result.status || 'unknown'})`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('hub-push error:', e.message);
    process.exit(1);
  });
}

module.exports = { shouldPush, enrichDelta, pushToHub };
