#!/usr/bin/env node
/**
 * refresh-budget.js — background Anthropic OAuth /usage fetcher.
 *
 * Spawned (detached) by inject_context.js when the on-disk budget cache is
 * stale (≥2h). Writes the fresh response to .budget-cache.json and removes
 * the refresh lock. Any hook invocation after this completes will see the
 * fresh cache on the fast path and skip sync fetch entirely.
 *
 * Design:
 *  - Fully detached — stdout/stderr discarded, never blocks caller
 *  - Lock file removed on exit (success or failure)
 *  - Auth-error responses cached WITH an `error: true` sentinel so the
 *    savings-tracker /real endpoint can surface the dead token
 *  - 3s hard cap on the HTTPS request (matches legacy sync behaviour)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const BUDGET_CACHE_PATH = path.join(ROUTER_DIR, '.budget-cache.json');
const BUDGET_REFRESH_LOCK = path.join(ROUTER_DIR, '.budget-refresh.lock');
const CREDS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

function cleanup() {
  try { fs.unlinkSync(BUDGET_REFRESH_LOCK); } catch { /* non-fatal */ }
}

function finish(code) {
  cleanup();
  process.exit(code);
}

let token;
try {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  token = creds && creds.claudeAiOauth && creds.claudeAiOauth.accessToken;
} catch {
  finish(1);
}

if (!token) finish(1);

const req = https.request(
  {
    hostname: 'api.anthropic.com',
    path: '/api/oauth/usage',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token },
  },
  (res) => {
    let body = '';
    res.on('data', (d) => (body += d));
    res.on('end', () => {
      let data;
      try { data = JSON.parse(body); } catch { return finish(2); }

      // Auth error — cache with sentinel so /real endpoint surfaces it.
      if (data && data.type === 'error') {
        try {
          fs.writeFileSync(
            BUDGET_CACHE_PATH,
            JSON.stringify({ ts: Date.now(), data, error: true })
          );
        } catch { /* non-fatal */ }
        return finish(0);
      }

      try {
        fs.writeFileSync(BUDGET_CACHE_PATH, JSON.stringify({ ts: Date.now(), data }));
      } catch { /* non-fatal */ }
      finish(0);
    });
  }
);

req.on('error', () => finish(1));
req.setTimeout(3000, () => { req.destroy(); finish(1); });
req.end();
