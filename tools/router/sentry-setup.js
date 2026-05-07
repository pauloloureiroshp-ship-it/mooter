#!/usr/bin/env node
/**
 * sentry-setup.js — Sentry opt-in CLI for the mooter router (Wave-1.5 task #7).
 *
 * Usage:
 *   node sentry-setup.js                 # show current state
 *   node sentry-setup.js --status        # JSON status
 *   node sentry-setup.js --enable --dsn <DSN> [--sample 0.1] [--env prod]
 *   node sentry-setup.js --disable
 *
 * Writes ~/.claude/tools/router/.sentry.json. sentry-helper.js prefers the
 * env vars MOOTER_SENTRY_DSN / MOOTER_SENTRY_TRACES_SAMPLE_RATE; when those
 * are absent, it falls back to this file. Tagging includes:
 *   - user_id_hash    (from ~/.frugal/user.hash, anonymous if absent)
 *   - mooter_version  (from ./version.json)
 *
 * The file is plain JSON, gitignored. Generate a DSN at:
 *   https://sentry.io → Projects → mooter-router → Client Keys (DSN).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const CONFIG_PATH = path.join(ROUTER_DIR, '.sentry.json');
const VERSION_PATH = path.join(ROUTER_DIR, 'version.json');
const USER_HASH_PATH = path.join(os.homedir(), '.frugal', 'user.hash');

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  return (v && !v.startsWith('--')) ? v : fallback;
}
const STATUS = args.includes('--status');
const ENABLE = args.includes('--enable') || args.includes('--enable-sentry');
const DISABLE = args.includes('--disable');
const DSN = flag('--dsn', null);
const SAMPLE = flag('--sample', '0.1');
const ENV = flag('--env', 'production');

function readVersion() {
  try { return JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8')).version || 'unknown'; }
  catch { return 'unknown'; }
}

function readUserHash() {
  try {
    const v = fs.readFileSync(USER_HASH_PATH, 'utf8').trim();
    if (/^[a-f0-9]{16}$/.test(v)) return v;
  } catch { /* anonymous */ }
  return null;
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return null; }
}

function writeConfig(cfg) {
  fs.mkdirSync(ROUTER_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
  // 0600 to keep the DSN private (the DSN itself isn't a secret in Sentry's
  // model but good hygiene).
  try { fs.chmodSync(CONFIG_PATH, 0o600); } catch { /* windows */ }
}

function summary() {
  const cfg = readConfig();
  const out = {
    enabled: !!(cfg && cfg.dsn),
    config_path: CONFIG_PATH,
    has_env_dsn: !!process.env.MOOTER_SENTRY_DSN,
    user_id_hash: readUserHash(),
    mooter_version: readVersion(),
  };
  if (cfg) {
    out.environment = cfg.environment || null;
    out.sample_rate = cfg.traces_sample_rate || null;
    out.set_at = cfg.set_at || null;
    // Mask DSN for display: keep scheme + first/last 4 chars only.
    if (cfg.dsn) {
      const dsn = cfg.dsn;
      const m = dsn.match(/^(https?:\/\/)([^@]+)@(.+)$/);
      if (m) {
        const tail = m[2].slice(-4);
        out.dsn_masked = `${m[1]}***${tail}@${m[3].slice(0, 20)}…`;
      } else {
        out.dsn_masked = '***';
      }
    }
  }
  return out;
}

function main() {
  if (DISABLE) {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
      process.stdout.write(`sentry-setup: removed ${CONFIG_PATH}\n`);
    } else {
      process.stdout.write('sentry-setup: already disabled (no config file)\n');
    }
    return;
  }

  if (ENABLE) {
    if (!DSN) {
      process.stderr.write('sentry-setup: --enable requires --dsn <SENTRY_DSN>\n');
      process.stderr.write('  Get one at https://sentry.io → mooter-router → Client Keys (DSN)\n');
      process.exit(1);
    }
    if (!/^https?:\/\/[^@]+@[^/]+\/\d+$/.test(DSN)) {
      process.stderr.write('sentry-setup: DSN does not look like a Sentry DSN. Continuing anyway.\n');
    }
    const sample = parseFloat(SAMPLE);
    if (!Number.isFinite(sample) || sample < 0 || sample > 1) {
      process.stderr.write('sentry-setup: --sample must be a number between 0 and 1\n');
      process.exit(1);
    }
    const cfg = {
      dsn: DSN,
      environment: ENV,
      traces_sample_rate: sample,
      tags: {
        user_id_hash: readUserHash(),
        mooter_version: readVersion(),
      },
      set_at: new Date().toISOString(),
    };
    writeConfig(cfg);
    process.stdout.write(`sentry-setup: enabled (env=${ENV}, sample=${sample})\n`);
    process.stdout.write(`  config:    ${CONFIG_PATH}\n`);
    process.stdout.write(`  dsn:       ${summary().dsn_masked}\n`);
    process.stdout.write(`  user_hash: ${cfg.tags.user_id_hash || '(anonymous)'}\n`);
    process.stdout.write(`  version:   ${cfg.tags.mooter_version}\n`);
    return;
  }

  const s = summary();
  if (STATUS) {
    process.stdout.write(JSON.stringify(s, null, 2) + '\n');
    return;
  }

  process.stdout.write(`sentry-setup: ${s.enabled ? 'ENABLED' : 'disabled'}\n`);
  if (s.enabled) {
    process.stdout.write(`  env:        ${s.environment}\n`);
    process.stdout.write(`  sample:     ${s.sample_rate}\n`);
    process.stdout.write(`  dsn:        ${s.dsn_masked}\n`);
    process.stdout.write(`  set_at:     ${s.set_at}\n`);
  } else {
    process.stdout.write('  Enable with: node sentry-setup.js --enable --dsn <SENTRY_DSN>\n');
    process.stdout.write('  Get a DSN at https://sentry.io → mooter-router → Client Keys (DSN)\n');
  }
  process.stdout.write(`  user_hash:  ${s.user_id_hash || '(anonymous)'}\n`);
  process.stdout.write(`  version:    ${s.mooter_version}\n`);
  process.stdout.write(`  env DSN:    ${s.has_env_dsn ? 'present (overrides config)' : 'absent'}\n`);
}

if (require.main === module) {
  try { main(); } catch (e) {
    process.stderr.write(`sentry-setup error: ${e && e.message ? e.message : e}\n`);
    process.exit(1);
  }
}

module.exports = { summary, readConfig };
