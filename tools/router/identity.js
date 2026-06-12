#!/usr/bin/env node
/**
 * identity.js — canonical device identity & user-state paths for mooter.
 *
 * Single source of truth for ~/.mooter (formerly ~/.frugal).
 * On first load, transparently migrates legacy files from ~/.frugal:
 *   device.id, user.hash, auth.token, budget-config.json, .last-sync
 * Migration MOVES files (identity must never fork) and removes ~/.frugal
 * when it ends up empty. Errors are non-fatal: callers fall back to legacy
 * paths via readDeviceId()'s dual-read until migration succeeds.
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

const MOOTER_DIR = path.join(os.homedir(), '.mooter');
const LEGACY_DIR = path.join(os.homedir(), '.frugal');

const MIGRATABLE = ['device.id', 'user.hash', 'auth.token', 'budget-config.json', '.last-sync'];

function migrateLegacy() {
  let migrated = 0;
  try {
    if (!fs.existsSync(LEGACY_DIR)) return 0;
    fs.mkdirSync(MOOTER_DIR, { recursive: true });
    for (const name of MIGRATABLE) {
      const oldPath = path.join(LEGACY_DIR, name);
      const newPath = path.join(MOOTER_DIR, name);
      try {
        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
          fs.renameSync(oldPath, newPath);
          migrated++;
        } else if (fs.existsSync(oldPath) && fs.existsSync(newPath)) {
          // Both exist: ~/.mooter wins; drop the stale legacy copy.
          fs.unlinkSync(oldPath);
        }
      } catch { /* per-file non-fatal */ }
    }
    try {
      if (fs.readdirSync(LEGACY_DIR).length === 0) fs.rmdirSync(LEGACY_DIR);
    } catch { /* non-fatal */ }
  } catch { /* non-fatal */ }
  return migrated;
}

// Run migration on first require.
migrateLegacy();

const DEVICE_ID_PATH = path.join(MOOTER_DIR, 'device.id');
const USER_HASH_PATH = path.join(MOOTER_DIR, 'user.hash');
const AUTH_TOKEN_PATH = path.join(MOOTER_DIR, 'auth.token');
const BUDGET_CONFIG_PATH = path.join(MOOTER_DIR, 'budget-config.json');
const LAST_SYNC_PATH = path.join(MOOTER_DIR, '.last-sync');

function readDeviceId() {
  // Dual-read guards against a failed migration (e.g. permissions).
  for (const p of [DEVICE_ID_PATH, path.join(LEGACY_DIR, 'device.id')]) {
    try { return fs.readFileSync(p, 'utf8').trim(); } catch { /* try next */ }
  }
  return null;
}

function ensureDeviceId() {
  const existing = readDeviceId();
  if (existing) return existing;
  const crypto = require('crypto');
  const id = crypto.randomUUID();
  fs.mkdirSync(MOOTER_DIR, { recursive: true });
  fs.writeFileSync(DEVICE_ID_PATH, id + '\n');
  return id;
}

module.exports = {
  MOOTER_DIR,
  LEGACY_DIR,
  DEVICE_ID_PATH,
  USER_HASH_PATH,
  AUTH_TOKEN_PATH,
  BUDGET_CONFIG_PATH,
  LAST_SYNC_PATH,
  migrateLegacy,
  readDeviceId,
  ensureDeviceId,
};
