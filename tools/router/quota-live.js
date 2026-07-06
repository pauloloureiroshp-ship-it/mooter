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
 *        rate_limits parser is validated against the OBSERVED shape, not
 *        just the documented one. Written once, atomically; delete the
 *        file to re-capture.
 *
 *   Q1 — writeQuotaLive(data): extract `rate_limits` and persist
 *        ~/.mooter/quota-live.json for every router-side consumer
 *        (quota-tracker, inject_context defcon, statusline chip).
 *        readQuotaLive() is the single read path, with freshness.
 *
 * Payload shape (official Claude Code statusline docs, 2026-07-06, and
 * matching the Cowork-verified seam):
 *   rate_limits: {
 *     five_hour: { used_percentage: 23.5, resets_at: 1738425600 },   // epoch s
 *     seven_day: { used_percentage: 41.2, resets_at: 1738857600 },
 *   }
 * `used_percentage` is percent USED (0-100). The extractor tolerates plain
 * numbers and ISO reset strings, and records `raw_keys` so an unexpected
 * shape is visible instead of silently mis-parsed. When nothing matches it
 * writes NOTHING — honesty over invention.
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
const LIVE_BASENAME = 'quota-live.json';

/** Freshness window: official data older than this falls back to estimates. */
const FRESH_MS = 10 * 60 * 1000;
/** Re-write heartbeat: bump ts even with unchanged values after this long. */
const REWRITE_MS = 60 * 1000;

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

/** @returns {number|null} finite number or null */
function pctOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Percent USED from one rate-limit window (documented object or bare number). */
function windowPct(w) {
  if (typeof w === 'number') return pctOrNull(w);
  if (w && typeof w === 'object') return pctOrNull(w.used_percentage);
  return null;
}

/** ISO reset timestamp from one window; epoch-seconds (docs) or ISO string. */
function windowReset(w) {
  if (w && typeof w === 'object' && w.resets_at != null) {
    const n = Number(w.resets_at);
    if (Number.isFinite(n) && n > 1e9) return new Date(n * 1000).toISOString();
    const d = new Date(w.resets_at);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/**
 * Extract + normalize `rate_limits` from a statusline stdin payload.
 * @param {any} payload
 * @returns {{five_hour_pct: number|null, seven_day_pct: number|null,
 *            opus_or_fable_pct: number|null,
 *            resets: {five_hour: string|null, seven_day: string|null},
 *            raw_keys: string[]} | null} null when the payload has no
 *            recognizable rate_limits — caller must then write nothing.
 */
function extractRateLimits(payload) {
  const rl = payload && payload.rate_limits;
  if (!rl || typeof rl !== 'object') return null;
  const five = windowPct(rl.five_hour);
  const seven = windowPct(rl.seven_day);
  if (five == null && seven == null) return null;

  // Model-scoped weekly window (Opus/Fable-class), if the payload ever
  // exposes one — not in the documented example, so null-safe by design.
  let opusOrFable = null;
  for (const k of Object.keys(rl)) {
    if (/opus|fable/i.test(k)) {
      const p = windowPct(rl[k]);
      if (p != null) opusOrFable = p;
    }
  }

  return {
    five_hour_pct: five,
    seven_day_pct: seven,
    opus_or_fable_pct: opusOrFable,
    resets: { five_hour: windowReset(rl.five_hour), seven_day: windowReset(rl.seven_day) },
    raw_keys: Object.keys(rl),
  };
}

/**
 * Q1 — persist the official quota snapshot for router-side consumers.
 * Throttled: skips the write when values are unchanged and the file is
 * younger than REWRITE_MS (the statusline renders several times a second).
 * @param {any} data parsed stdin JSON from Claude Code
 * @returns {boolean} true when this call wrote quota-live.json
 */
function writeQuotaLive(data) {
  try {
    const extracted = extractRateLimits(data);
    if (!extracted) return false;

    const home = mooterHome();
    const live = path.join(home, LIVE_BASENAME);

    try {
      const prev = JSON.parse(fs.readFileSync(live, 'utf8'));
      const unchanged = prev
        && prev.five_hour_pct === extracted.five_hour_pct
        && prev.seven_day_pct === extracted.seven_day_pct
        && prev.opus_or_fable_pct === extracted.opus_or_fable_pct;
      if (unchanged && typeof prev.ts === 'number' && Date.now() - prev.ts < REWRITE_MS) {
        return false;
      }
    } catch { /* no previous file → write */ }

    fs.mkdirSync(home, { recursive: true });
    const now = Date.now();
    writeAtomic(live, JSON.stringify({
      v: 1,
      source: 'cc-statusline-stdin',
      ts: now,
      iso: new Date(now).toISOString(),
      five_hour_pct: extracted.five_hour_pct,
      seven_day_pct: extracted.seven_day_pct,
      opus_or_fable_pct: extracted.opus_or_fable_pct,
      resets: extracted.resets,
      raw_keys: extracted.raw_keys,
    }, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Single read path for the official quota snapshot.
 * @param {{maxAgeMs?: number}} [opts]
 * @returns {(Record<string, any> & {age_ms: number, fresh: boolean}) | null}
 *          null when the file is missing or unreadable. `fresh` is false
 *          when older than maxAgeMs (default 10 min) — callers must then
 *          fall back to their own estimates and say so (`basis`).
 */
function readQuotaLive(opts) {
  try {
    const maxAgeMs = (opts && opts.maxAgeMs) || FRESH_MS;
    const live = path.join(mooterHome(), LIVE_BASENAME);
    const rec = JSON.parse(fs.readFileSync(live, 'utf8'));
    if (!rec || typeof rec.ts !== 'number') return null;
    const age = Date.now() - rec.ts;
    return Object.assign({}, rec, { age_ms: age, fresh: age <= maxAgeMs });
  } catch {
    return null;
  }
}

/** Single entry point for the wired statusline. */
function onStatuslineRender(data) {
  captureStdinSample(data);
  writeQuotaLive(data);
}

module.exports = {
  captureStdinSample,
  extractRateLimits,
  writeQuotaLive,
  readQuotaLive,
  onStatuslineRender,
  mooterHome,
  writeAtomic,
  SAMPLE_BASENAME,
  LIVE_BASENAME,
  FRESH_MS,
};
