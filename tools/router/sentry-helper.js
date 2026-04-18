'use strict';

/**
 * sentry-helper.js — minimal opt-in wrapper around @sentry/node for the
 * mooter router's local HTTP server (savings-tracker.js, port 7821).
 *
 * Design rules:
 *   1. Init is strictly opt-in via MOOTER_SENTRY_DSN. Absent or empty →
 *      every exported function is a no-op. No background threads, no
 *      network calls, no process hooks.
 *   2. The `require('@sentry/node')` call is wrapped in try/catch so a
 *      broken install (missing dep, incompatible Node) never crashes the
 *      router — we silently fall back to no-op.
 *   3. We attach uncaughtException / unhandledRejection handlers ONLY when
 *      Sentry is active, and we re-throw to preserve existing process
 *      behavior. The standalone router must stay standalone.
 *   4. Sample rate is conservative (0.1) and can be tuned later with
 *      MOOTER_SENTRY_TRACES_SAMPLE_RATE if the user wants finer control.
 *
 * Usage:
 *   const sentry = require('./sentry-helper');
 *   sentry.init();                       // safe to call repeatedly
 *   sentry.captureException(err, { tags: { route: '/metrics' } });
 */

let _sdk = null;
let _initialized = false;

function _tryLoad() {
  if (_sdk) return _sdk;
  try {
    // eslint-disable-next-line global-require
    _sdk = require('@sentry/node');
  } catch {
    _sdk = null;
  }
  return _sdk;
}

function init() {
  if (_initialized) return false;
  const dsn = process.env.MOOTER_SENTRY_DSN;
  if (!dsn) {
    _initialized = true; // skip-silently path — don't retry on each call
    return false;
  }
  const sdk = _tryLoad();
  if (!sdk || typeof sdk.init !== 'function') {
    _initialized = true;
    return false;
  }
  try {
    const sampleRateRaw = process.env.MOOTER_SENTRY_TRACES_SAMPLE_RATE;
    const sampleRate = sampleRateRaw ? Number(sampleRateRaw) : 0.1;
    sdk.init({
      dsn,
      environment: process.env.MOOTER_SENTRY_ENVIRONMENT || 'production',
      release: process.env.MOOTER_SENTRY_RELEASE || 'mooter-router@unknown',
      tracesSampleRate: Number.isFinite(sampleRate) ? sampleRate : 0.1,
      // Default integrations are fine (HTTP, onUncaughtException, etc.).
    });
    _initialized = true;
    return true;
  } catch {
    _initialized = true;
    return false;
  }
}

function captureException(err, context) {
  if (!_initialized) init();
  const sdk = _sdk;
  if (!sdk || typeof sdk.captureException !== 'function') return;
  try {
    sdk.captureException(err, context || undefined);
  } catch { /* non-fatal */ }
}

function captureMessage(msg, opts) {
  if (!_initialized) init();
  const sdk = _sdk;
  if (!sdk || typeof sdk.captureMessage !== 'function') return;
  try {
    sdk.captureMessage(msg, opts || undefined);
  } catch { /* non-fatal */ }
}

function isEnabled() {
  return !!_sdk && _initialized && !!process.env.MOOTER_SENTRY_DSN;
}

module.exports = { init, captureException, captureMessage, isEnabled };
