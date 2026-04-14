#!/usr/bin/env node
/**
 * paths.js — cross-platform path resolver for mooter (formerly frugal).
 *
 * Centralises all directory constants so every script uses the same
 * quoting-safe paths. Works on Windows (native + WSL + Git Bash),
 * macOS and Linux.
 *
 * Backward-compat: accepts FRUGAL_CLAUDE_DIR env var, auto-migrates
 * .frugal-mode.json → .mooter-mode.json on first access.
 *
 * Usage:
 *   const { CLAUDE_DIR, ROUTER_DIR, DECISIONS_LOG } = require('./paths');
 */

'use strict';

const os = require('os');
const path = require('path');

// Allow override via env for testing / non-standard installs.
// Backward-compat: FRUGAL_CLAUDE_DIR still accepted.
const CLAUDE_DIR = process.env.MOOTER_CLAUDE_DIR
  || process.env.FRUGAL_CLAUDE_DIR
  || path.join(os.homedir(), '.claude');

const ROUTER_DIR  = path.join(CLAUDE_DIR, 'tools', 'router');
const SKILLS_DIR  = path.join(CLAUDE_DIR, 'skills');
const AGENTS_DIR  = path.join(CLAUDE_DIR, 'agents');
const DOCS_DIR    = path.join(CLAUDE_DIR, 'docs');
const HOOKS_DIR   = path.join(CLAUDE_DIR, 'hooks');
const BACKUP_DIR  = path.join(CLAUDE_DIR, 'backups');

// Frequently accessed files
const DECISIONS_LOG        = path.join(ROUTER_DIR, 'decisions.log');
const SETTINGS_JSON        = path.join(CLAUDE_DIR, 'settings.json');
const HW_CAPABILITY_PATH   = path.join(ROUTER_DIR, 'hw-capability.json');
const SUB_PROFILE_PATH     = path.join(ROUTER_DIR, 'subscription-profile.json');
const BUDGET_CACHE_PATH    = path.join(ROUTER_DIR, '.budget-cache.json');
const CLASSIFY_CACHE_PATH  = path.join(ROUTER_DIR, '.classify-cache.json');
const TRACKER_PID_PATH     = path.join(ROUTER_DIR, '.tracker.pid');
const MODE_FILE_NEW        = path.join(ROUTER_DIR, '.mooter-mode.json');
const MODE_FILE_OLD        = path.join(ROUTER_DIR, '.frugal-mode.json');

// Auto-migrate .frugal-mode.json → .mooter-mode.json on first access.
const fs = require('fs');
let MODE_FILE = MODE_FILE_NEW;
try {
  if (!fs.existsSync(MODE_FILE_NEW) && fs.existsSync(MODE_FILE_OLD)) {
    fs.copyFileSync(MODE_FILE_OLD, MODE_FILE_NEW);
  }
} catch { /* non-fatal — will use new path regardless */ }

const TUNING_PATH          = path.join(ROUTER_DIR, 'router-tuning.json');
const LAST_HUB_PUSH        = path.join(ROUTER_DIR, '.last-hub-push');
const LAST_HUB_PULL        = path.join(ROUTER_DIR, '.last-hub-pull');

module.exports = {
  CLAUDE_DIR,
  ROUTER_DIR,
  SKILLS_DIR,
  AGENTS_DIR,
  DOCS_DIR,
  HOOKS_DIR,
  BACKUP_DIR,
  DECISIONS_LOG,
  SETTINGS_JSON,
  HW_CAPABILITY_PATH,
  SUB_PROFILE_PATH,
  BUDGET_CACHE_PATH,
  CLASSIFY_CACHE_PATH,
  TRACKER_PID_PATH,
  MODE_FILE,
  TUNING_PATH,
  LAST_HUB_PUSH,
  LAST_HUB_PULL,
};
