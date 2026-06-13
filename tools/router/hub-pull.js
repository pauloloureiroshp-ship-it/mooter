#!/usr/bin/env node
/**
 * hub-pull.js — fetches latest router-tuning and model-catalog from the mooter hub.
 *
 * Called on session startup by inject_context.js (non-blocking) or manually.
 * Downloads silently to ~/.claude/tools/router/ if a newer version exists.
 *
 * Usage:
 *   node hub-pull.js           # check and pull if newer
 *   node hub-pull.js --force   # always pull
 *   node hub-pull.js --quiet   # suppress output
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const { getHubUrl } = require('./env');
const HUB_URL = getHubUrl();
const PULL_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h between pulls
const LAST_PULL_PATH = path.join(ROUTER_DIR, '.last-hub-pull');
const COMMUNITY_TUNING_PATH = path.join(ROUTER_DIR, 'community-tuning.json');
const MODEL_CATALOG_PATH = path.join(ROUTER_DIR, 'model-catalog.json');

function shouldPull(force) {
  if (force) return true;
  try {
    const stat = fs.statSync(LAST_PULL_PATH);
    if (Date.now() - stat.mtimeMs < PULL_COOLDOWN_MS) return false;
  } catch { /* never pulled */ }
  return true;
}

function markPulled() {
  try {
    fs.writeFileSync(LAST_PULL_PATH, String(Date.now()));
  } catch { /* non-fatal */ }
}

function httpGet(urlStr) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'User-Agent': 'mooter-hub-pull/1.0' },
    }, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode < 300, data: JSON.parse(data) });
        } catch {
          resolve({ ok: false, error: 'parse' });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.end();
  });
}

function localVersion(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data._version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function versionNewer(remote, local) {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

async function pull(options = {}) {
  const quiet = options.quiet || false;

  // 1. Check versions
  const versionResult = await httpGet(HUB_URL + '/api/version');
  if (!versionResult.ok) {
    if (!quiet) console.log('mooter hub-pull: hub unreachable');
    return { updated: false, error: 'unreachable' };
  }

  const remote = versionResult.data;
  const updates = [];

  // 2. Router tuning
  const localTuningVersion = localVersion(COMMUNITY_TUNING_PATH);
  const remoteTuningVersion = remote.router_tuning?.version || '0.0.0';
  if (versionNewer(remoteTuningVersion, localTuningVersion)) {
    const tuningResult = await httpGet(HUB_URL + '/api/stats');
    if (tuningResult.ok) {
      // Fetch the actual tuning file content would go through R2 public URL
      // For now, store the version info so classify.js knows community data exists
      const tuningData = {
        _version: remoteTuningVersion,
        _generated: remote.router_tuning?.generated,
        _samples: remote.router_tuning?.samples,
        _community: remote.community,
        avg_tier_distribution: tuningResult.data.avg_tier_distribution,
        avg_savings: tuningResult.data.avg_savings,
      };
      fs.writeFileSync(COMMUNITY_TUNING_PATH, JSON.stringify(tuningData, null, 2));
      updates.push(`router-tuning ${localTuningVersion} → ${remoteTuningVersion}`);
    }
  }

  // 3. Model catalog
  const localCatalogVersion = localVersion(MODEL_CATALOG_PATH);
  const remoteCatalogVersion = remote.model_catalog?.version || '0.0.0';
  if (versionNewer(remoteCatalogVersion, localCatalogVersion)) {
    const catalogResult = await httpGet(HUB_URL + '/api/models');
    if (catalogResult.ok && catalogResult.data.catalog) {
      fs.writeFileSync(MODEL_CATALOG_PATH, JSON.stringify(catalogResult.data.catalog, null, 2));
      updates.push(`model-catalog ${localCatalogVersion} → ${remoteCatalogVersion}`);
    }
  }

  markPulled();

  if (updates.length > 0 && !quiet) {
    console.log('mooter hub-pull: updated ' + updates.join(', '));
  } else if (!quiet) {
    console.log('mooter hub-pull: already up to date');
  }

  return { updated: updates.length > 0, updates };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const quiet = args.includes('--quiet');

  if (!shouldPull(force)) {
    if (!quiet) console.log('mooter hub-pull: cooldown active (last pull < 4h ago). Use --force.');
    process.exit(0);
  }

  await pull({ quiet });
}

if (require.main === module) {
  main().catch((e) => {
    if (!process.argv.includes('--quiet')) {
      console.error('hub-pull error:', e.message);
    }
    process.exit(0); // never fail loudly
  });
}

module.exports = { pull, shouldPull, versionNewer };
