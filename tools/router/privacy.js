#!/usr/bin/env node
/**
 * privacy.js — PII normalizer for prompt previews.
 *
 * Per METHODOLOGY §10.2: regex pass to sanitize paths, API keys, tokens,
 * and long numbers from prompt_preview BEFORE it's logged to decisions.log
 * or sent to the hub.
 *
 * Can be used:
 *   1. Inline: const { sanitize } = require('./privacy'); sanitize(text)
 *   2. CLI:    echo "text" | node privacy.js
 *   3. Batch:  node privacy.js --scan-log    # report PII found in existing log
 *
 * All replacements are one-way (lossy). Original text cannot be recovered.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');

const RULES = [
  // Windows paths: C:\Users\Paulo Loureiro\... → <winpath>
  { rx: /[A-Z]:\\[\w\s\\.-]+/g, replace: '<winpath>' },
  // Unix paths: /home/user/project/file.ts → <path>
  { rx: /\/[a-zA-Z0-9_\-/.]+\.\w{1,6}/g, replace: '<path>' },
  // Anthropic API keys
  { rx: /sk-ant-[a-zA-Z0-9\-_]{20,}/g, replace: '<anthropic_key>' },
  // Generic sk- keys (OpenAI etc)
  { rx: /sk-[a-zA-Z0-9]{20,}/g, replace: '<api_key>' },
  // GitHub tokens
  { rx: /gh[ps]_[a-zA-Z0-9]{36,}/g, replace: '<github_token>' },
  // Bearer tokens
  { rx: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi, replace: 'Bearer <token>' },
  // Email addresses
  { rx: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replace: '<email>' },
  // IP addresses (v4)
  { rx: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replace: '<ip>' },
  // Long numbers (credit cards, phone numbers, etc)
  { rx: /\b\d{13,19}\b/g, replace: '<long_number>' },
  // UUIDs
  { rx: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replace: '<uuid>' },
  // Connection strings
  { rx: /(?:postgres|mysql|mongodb|redis):\/\/[^\s"']+/gi, replace: '<connection_string>' },
  // Base64 blobs (>40 chars of base64)
  { rx: /[A-Za-z0-9+/]{40,}={0,3}/g, replace: '<base64>' },
];

function sanitize(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  for (const rule of RULES) {
    result = result.replace(rule.rx, rule.replace);
  }
  return result;
}

function scanLog() {
  if (!fs.existsSync(LOG_PATH)) {
    console.error('decisions.log not found');
    process.exit(1);
  }
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  let totalPII = 0;
  const byRule = {};

  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      const preview = e.prompt_preview || '';
      if (!preview) continue;
      for (const rule of RULES) {
        const matches = preview.match(rule.rx);
        if (matches && matches.length > 0) {
          totalPII += matches.length;
          byRule[rule.replace] = (byRule[rule.replace] || 0) + matches.length;
        }
      }
    } catch (_) { /* skip */ }
  }

  console.log(`PII scan of decisions.log (${lines.length} lines):`);
  console.log(`  Total PII instances found: ${totalPII}`);
  if (totalPII > 0) {
    console.log('  By type:');
    for (const [type, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(25)} ${count}`);
    }
  } else {
    console.log('  No PII detected in prompt previews.');
  }
  return totalPII;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--scan-log')) {
    scanLog();
  } else if (args.includes('--test')) {
    const tests = [
      'check C:\\Users\\Paulo Loureiro\\frugal\\tools\\router\\classify.js',
      'use sk-ant-abcdefghijklmnop1234567890 to call the API',
      'email paulo.loureiro.shp@gmail.com for details',
      'connect to postgres://user:pass@localhost:5432/db',
      'token ghp_abcdefghijklmnopqrstuvwxyz1234567890',
      'ip is 192.168.1.1 and card 4532015112830366',
      'uuid a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    ];
    for (const t of tests) {
      console.log(`IN:  ${t}`);
      console.log(`OUT: ${sanitize(t)}`);
      console.log('');
    }
  } else {
    // Pipe mode: read from stdin
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => {
      process.stdout.write(sanitize(input));
    });
  }
}

module.exports = { sanitize, RULES, scanLog };
