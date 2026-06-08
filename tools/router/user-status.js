#!/usr/bin/env node
/**
 * user-status.js — Wave 33.8 Block E.
 *
 * Opt-in line-3 chip naming the signed-in identity, e.g. `👤 user f50b36ca`.
 *
 * HONEST SCOPE (Day 0 catch): `mooter login` persists ONLY an opaque
 * `user_id_hash` (SHA256(user_id)[:16]) to ~/.mooter/auth.json — NO GitHub
 * handle, NO email (privacy by construction). So this chip can NOT show
 * `🐙 @handle`; that would be fabricated. It shows the first 8 hex of the
 * hash, which is enough to tell "am I logged in, and as which identity" across
 * terminals without ever leaking who you are.
 *
 * Privacy default: SILENT when logged out (no chip, no "anon" noise). Hide even
 * when logged in via `mooter quiet --hide-user` (hidden_chips includes "user").
 *
 * Hot path: a single best-effort JSON read, no subprocess. Any failure → ''.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function mooterHome() {
  return process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0
    ? process.env.MOOTER_HOME
    : path.join(os.homedir(), '.mooter');
}

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Pure: build the user chip from an already-parsed auth record.
 * Returns '' (silent) when logged out or the record is malformed — privacy
 * default. Never fabricates a handle: only the opaque hash prefix is shown.
 */
function buildUserChip(auth) {
  if (!auth || typeof auth.user_id_hash !== 'string') return '';
  const hash = auth.user_id_hash.trim();
  // Defensive: a hash must look like the opaque hex id `mooter login` writes.
  if (!/^[0-9a-f]{8,}$/i.test(hash)) return '';
  return `👤 user ${hash.slice(0, 8)}`;
}

function statusLine() {
  try {
    const p = prefs();
    if (Array.isArray(p.hidden_chips) && p.hidden_chips.includes('user')) return '';
    let auth;
    try {
      auth = JSON.parse(fs.readFileSync(path.join(mooterHome(), 'auth.json'), 'utf8'));
    } catch {
      return ''; // logged out → silent (privacy default)
    }
    return buildUserChip(auth);
  } catch {
    return '';
  }
}

module.exports = { buildUserChip, statusLine };

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}
