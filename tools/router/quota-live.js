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
 * Only payloads that actually carry `rate_limits` qualify: the sample exists
 * to pin down the rate_limits shape, and test suites / other tools also pipe
 * synthetic payloads through the wired statusline (observed 2026-07-06: a
 * fixture with {model, context, session} poisoned the first capture).
 * @param {any} data parsed stdin JSON from Claude Code
 * @returns {boolean} true when this call wrote the sample
 */
function captureStdinSample(data) {
  try {
    if (!data || !data.rate_limits) return false;
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

// ── MP-Q Q3 — quota defcon (pure logic; inject_context.js wires it) ─────────
// For a subscription user the weekly (7-day) window is the binding constraint;
// $ cost is ≈0 at the margin. Defcon shifts routing local-first as the week
// runs out — but doctrine outranks the optimizer: HIGH_RISK T3 floors
// (push/deploy/secrets/migrations) NEVER come down, and an explicit user
// override / active mode applied downstream still wins.

const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];

/** @param {number|null|undefined} sevenDayPct @returns {{emoji: string, name: string}|null} */
function quotaDefconLevel(sevenDayPct) {
  if (typeof sevenDayPct !== 'number' || !Number.isFinite(sevenDayPct)) return null;
  if (sevenDayPct >= 95) return { emoji: '⚫', name: 'black' };
  if (sevenDayPct >= 85) return { emoji: '🔴', name: 'red' };
  if (sevenDayPct >= 70) return { emoji: '🟡', name: 'yellow' };
  return { emoji: '🟢', name: 'green' };
}

/** Lower of two tiers ('T0' lowest). */
function minTier(a, b) {
  const ia = TIER_ORDER.indexOf(a), ib = TIER_ORDER.indexOf(b);
  if (ia < 0) return b;
  if (ib < 0) return a;
  return TIER_ORDER[Math.min(ia, ib)];
}

/**
 * Apply the weekly-quota defcon to a routing decision (mutates it).
 *
 * Bands (percent of the OFFICIAL seven-day window used):
 *   🟡 ≥70 — borderline T2 decisions (confidence ≤ 0.7) bias down to T1.
 *   🔴 ≥85 — cap at T2 + aggressive local-first (each tier shifts down one).
 *   ⚫ ≥95 — cloud only for HIGH_RISK doctrine floors; everything else T0.
 * HIGH_RISK prompts (hook regex or classifier risk_level:high) are exempt at
 * every band — the T3 doctrine floor never comes down.
 * Independently: when the payload exposes an Opus/Fable-class window at 100%,
 * sets decision.suppress_fable so the agent stops suggesting @fable/T5.
 *
 * @param {Record<string, any>} decision classify decision (mutated)
 * @param {Record<string, any>|null} live readQuotaLive() result
 * @param {boolean} isHighRisk hook-level HIGH_RISK regex verdict
 * @returns {Record<string, any>|null} the decision.quota_defcon info, or null
 *          when no fresh official data / level green with nothing to do
 */
function applyQuotaDefcon(decision, live, isHighRisk) {
  if (!decision || !live || !live.fresh) return null;

  // Fable/Opus-class exhaustion is orthogonal to the tier bands.
  if (typeof live.opus_or_fable_pct === 'number' && live.opus_or_fable_pct >= 100) {
    decision.suppress_fable = true;
  }

  const seven = live.seven_day_pct;
  const level = quotaDefconLevel(seven);
  if (!level || level.name === 'green') return null;

  const highRisk = !!isHighRisk || decision.risk_level === 'high';
  const before = decision.tier;
  let action;

  if (highRisk) {
    action = 'T3 doctrine floor kept (high-risk exempt)';
  } else if (level.name === 'yellow') {
    action = 'no change';
    const borderline = typeof decision.confidence === 'number' && decision.confidence <= 0.7;
    if (decision.tier === 'T2' && borderline) {
      decision.tier = 'T1';
      action = 'borderline T2 → T1 (bias local)';
    }
  } else if (level.name === 'red') {
    decision.tier = minTier(TIER_ORDER[Math.max(0, TIER_ORDER.indexOf(decision.tier) - 1)], 'T2');
    decision.max_tier = minTier(decision.max_tier || 'T3', 'T2');
    action = `cap T2 + local bias (${before} → ${decision.tier})`;
  } else { // black
    decision.tier = 'T0';
    decision.max_tier = minTier(decision.max_tier || 'T3', 'T0');
    action = `local only (${before} → T0)`;
  }

  const target = decision.tier === before ? decision.tier : `${decision.tier} (was ${before})`;
  const info = {
    level: level.emoji,
    seven_day_pct: seven,
    action,
    reasoning: `weekly ${seven}% → defcon ${level.emoji} → ${target}`,
  };
  decision.quota_defcon = info;
  if (decision.tier !== before) {
    decision.escalation_rule = (decision.escalation_rule && decision.escalation_rule !== 'none')
      ? decision.escalation_rule + '+quota_defcon'
      : 'quota_defcon';
  }
  return info;
}

module.exports = {
  captureStdinSample,
  extractRateLimits,
  writeQuotaLive,
  readQuotaLive,
  onStatuslineRender,
  quotaDefconLevel,
  applyQuotaDefcon,
  mooterHome,
  writeAtomic,
  SAMPLE_BASENAME,
  LIVE_BASENAME,
  FRESH_MS,
};
