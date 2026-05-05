#!/usr/bin/env node
/**
 * _load-env.js — minimal .env loader for the providers/* wrappers.
 *
 * Reads tools/router/.env (if present) and merges into process.env without
 * overwriting variables already set in the parent shell. No dependency on
 * the dotenv npm package — keeps the router runtime install-free.
 *
 * Used by: providers/codex-cli.js, providers/openai-api.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { ROUTER_DIR } = require('../paths');

// Try the runtime location first (~/.claude/tools/router/.env), then fall
// back to the canonical tree (frugal/tools/router/.env) so the wrappers
// work both after /mooter-update sync AND when running directly out of
// the source repo for testing.
const CANDIDATES = [
  path.join(ROUTER_DIR, '.env'),
  path.resolve(__dirname, '..', '.env'),
];

let loaded   = false;
let resolved = null;

function loadEnv() {
  if (loaded) return process.env;
  loaded = true;

  let text;
  for (const candidate of CANDIDATES) {
    try {
      text = fs.readFileSync(candidate, 'utf8');
      resolved = candidate;
      break;
    } catch { /* try next candidate */ }
  }
  if (!text) return process.env; // no .env anywhere — silent

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val   = line.slice(eq + 1).trim();
    // Strip optional surrounding quotes.
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val;
    }
  }
  return process.env;
}

function getResolvedPath() { return resolved; }

module.exports = { loadEnv, CANDIDATES, getResolvedPath };
