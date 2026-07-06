#!/usr/bin/env node
'use strict';
/**
 * quota-live.js — MP-Q (quota-aware routing, feat/quota-aware).
 *
 * The weekly quota — not $ — is the real constraint for a Claude Max user.
 * Claude Code (≥2.1.x) already delivers official `rate_limits` in the JSON
 * payload it pipes to the wired statusline on every render. This module is
 * the capture side of that seam:
 *
 *   Q0 — captureStdinSample(data): one-time diagnostic dump of the RAW
 *        stdin payload to ~/.mooter/statusline-stdin-sample.json so the
 *        rate_limits parser is built on the OBSERVED shape, never on a
 *        guessed schema. Written once, atomically; delete the file to
 *        re-capture.
 *
 * Everything here is fail-soft by contract: a broken capture must NEVER
 * break the wired statusline (caller also wraps in try/catch).
 *
 * Additive only — no other router file's behaviour changes when the
 * payload carries no rate_limits.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function mooterHome() {
  return process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0
    ? process.env.MOOTER_HOME
    : path.join(os.homedir(), '.mooter');
}

const SAMPLE_BASENAME = 'statusline-stdin-sample.json';

/** Atomic write: tmp + rename, so readers never see a torn file. */
function writeAtomic(file, contents) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
}

/**
 * Q0 — dump the raw statusline stdin payload ONCE.
 * @param {any} data parsed stdin JSON from Claude Code
 * @returns {boolean} true when this call wrote the sample
 */
function captureStdinSample(data) {
  try {
    const home = mooterHome();
    const sample = path.join(home, SAMPLE_BASENAME);
    if (fs.existsSync(sample)) return false;
    fs.mkdirSync(home, { recursive: true });
    writeAtomic(sample, JSON.stringify(
      { captured_at: new Date().toISOString(), payload: data }, null, 2));
    return true;
  } catch {
    return false;
  }
}

/** Single entry point for the wired statusline. */
function onStatuslineRender(data) {
  captureStdinSample(data);
}

module.exports = { captureStdinSample, onStatuslineRender, mooterHome, writeAtomic, SAMPLE_BASENAME };
