#!/usr/bin/env node
/**
 * hub-submit-events.js — sends exported frugal events to the hub.
 *
 * Usage:
 *   node hub-submit-events.js                        # uses events-export.json
 *   node hub-submit-events.js ./my-events.json       # custom file
 *   node hub-submit-events.js --dry-run              # show what would be sent
 *
 * Requires FRUGAL_SUBMIT_TOKEN env var.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const DEFAULT_EVENTS = path.join(ROUTER_DIR, 'events-export.json');
const HUB_URL = 'https://frugal-hub.frugal-hub.workers.dev/submit-events';
const BATCH_SIZE = 50;
const LAST_SUBMIT = path.join(ROUTER_DIR, '.last-submit.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArg = args.find(a => !a.startsWith('--'));
const eventsPath = fileArg || DEFAULT_EVENTS;

const token = process.env.FRUGAL_SUBMIT_TOKEN;
if (!token && !dryRun) {
  console.error('FRUGAL_SUBMIT_TOKEN not set. Add to your shell profile.');
  process.exit(1);
}

if (!fs.existsSync(eventsPath)) {
  console.error(`Events file not found: ${eventsPath}`);
  console.error('Run: node backtest.js --export-events');
  process.exit(1);
}

const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
if (!Array.isArray(events) || events.length === 0) {
  console.log('No events to submit.');
  process.exit(0);
}

// Split into batches
const batches = [];
for (let i = 0; i < events.length; i += BATCH_SIZE) {
  batches.push(events.slice(i, i + BATCH_SIZE));
}

console.log(`Events: ${events.length}  Batches: ${batches.length}  Dry run: ${dryRun}`);

function postBatch(batch) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(batch);
    const url = new URL(HUB_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  let totalAccepted = 0;
  let totalRejected = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (dryRun) {
      console.log(`  Batch ${i + 1}/${batches.length}: ${batch.length} events (dry run — not sent)`);
      totalAccepted += batch.length;
      continue;
    }

    try {
      const result = await postBatch(batch);
      if (result.status === 200) {
        const accepted = result.body.accepted || 0;
        const rejected = result.body.rejected || 0;
        console.log(`  Submitted batch ${i + 1}/${batches.length}: ${accepted} accepted, ${rejected} rejected`);
        totalAccepted += accepted;
        totalRejected += rejected;
        if (result.body.rejection_reasons?.length > 0) {
          console.log(`    Reasons: ${result.body.rejection_reasons.join(', ')}`);
        }
      } else if (result.status === 429) {
        console.log(`  Batch ${i + 1}/${batches.length}: rate limited — try again in 1h`);
        break;
      } else {
        console.error(`  Batch ${i + 1}/${batches.length}: HTTP ${result.status} — ${JSON.stringify(result.body)}`);
        totalRejected += batch.length;
      }
    } catch (e) {
      console.error(`  Batch ${i + 1}/${batches.length}: error — ${e.message}`);
      totalRejected += batch.length;
    }
  }

  console.log('');
  console.log(`Total: ${totalAccepted} accepted, ${totalRejected} rejected`);

  if (!dryRun && totalAccepted > 0) {
    fs.writeFileSync(LAST_SUBMIT, JSON.stringify({
      submitted_at: new Date().toISOString(),
      events_accepted: totalAccepted,
      events_rejected: totalRejected,
      source: eventsPath,
    }, null, 2));
  }
})();
