#!/usr/bin/env node
// @ts-check
/**
 * env.js — Zod-validated env reader for the Mooter router.
 *
 * v0.10 (CCA Criterion #10): env vars are now schema-validated at read
 * time. Malformed URLs, empty strings where numbers are expected, etc.
 * all fail fast with a clear message naming the variable.
 *
 * Backward-compat: MOOTER_* preferred, FRUGAL_* still accepted until
 * 30-day rebrand window closes. Precedence:
 *   MOOTER_X > FRUGAL_X > default
 *
 * Consumers:
 *   - savings-tracker.js calls requireEnv() on startup → exits 1 if bad
 *   - inject_context.js (hook) calls tryEnv() → silent fallback on bad,
 *     so a misconfigured env never kills Claude Code
 */

'use strict';

// zod is a SOFT dependency. It is declared in this package's package.json and
// present in the repo, but the synced runtime copy at ~/.claude/tools/router/
// has no node_modules (/mooter-update syncs .js files, not deps). A hard
// `require('zod')` there crashes every consumer (e.g. hub-pull.js → "Cannot
// find module 'zod'"). So we require it best-effort: when present we get full
// schema validation; when absent we fall back to a defaults-applying reader
// (validateless()) that returns the same typed shape so getHubUrl()/getLandingUrl()
// and friends keep working. Behaviour is byte-identical when zod is installed.
let z = null;
try { ({ z } = require('zod')); } catch { /* slim runtime without node_modules */ }

const DEFAULT_HUB_URL = 'https://mooter-hub.frugal-hub.workers.dev';
const DEFAULT_LANDING_URL = 'https://mooter.ai';

const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'];

// ── Schema ──────────────────────────────────────────────────────────────
// Each field has a sensible default so the router runs out-of-the-box.
// The operator can override via MOOTER_* or legacy FRUGAL_* vars.
// Null when zod is unavailable — see validateless() for the fallback path.

const envSchema = z ? z.object({
  hub_url:     z.string().url().default(DEFAULT_HUB_URL),
  landing_url: z.string().url().default(DEFAULT_LANDING_URL),
  // Optional — when set, savings-tracker initialises Sentry in Node runtime.
  sentry_dsn:  z.string().url().optional(),
  // HTTP server port (savings-tracker). Range-bound to avoid privileged
  // ports and the IANA ephemeral range.
  tracker_port: z.coerce.number().int().min(1024).max(49151).default(7821),
  // Log level — controls how verbose the router is in its own logs.
  log_level:   z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
}) : null;

/**
 * Zod-free fallback: apply the same defaults + coercion the schema would,
 * but never throw. Bad user values silently fall back to the default (same
 * net effect as tryEnv()'s second pass). Used only when zod is unavailable.
 * @param {Record<string, unknown>} raw
 * @returns {RouterEnv}
 */
function validateless(raw) {
  const isUrl = (v) => {
    if (typeof v !== 'string' || !v) return false;
    try { new URL(v); return true; } catch { return false; }
  };
  const port = Number(raw.tracker_port);
  return /** @type {any} */ ({
    hub_url:      isUrl(raw.hub_url) ? raw.hub_url : DEFAULT_HUB_URL,
    landing_url:  isUrl(raw.landing_url) ? raw.landing_url : DEFAULT_LANDING_URL,
    sentry_dsn:   isUrl(raw.sentry_dsn) ? raw.sentry_dsn : undefined,
    tracker_port: Number.isInteger(port) && port >= 1024 && port <= 49151 ? port : 7821,
    log_level:    LOG_LEVELS.includes(/** @type {any} */ (raw.log_level)) ? raw.log_level : 'info',
  });
}

/** @typedef {z.infer<typeof envSchema>} RouterEnv */

/**
 * Pick the correct env var with MOOTER > FRUGAL > undefined precedence.
 * @param {string} mooterKey
 * @param {string} frugalKey
 * @returns {string | undefined}
 */
function pick(mooterKey, frugalKey) {
  const m = process.env[mooterKey];
  if (m && m.length > 0) return m;
  const f = process.env[frugalKey];
  if (f && f.length > 0) return f;
  return undefined;
}

/**
 * Collect raw env values into a shape the schema can validate.
 * @returns {Record<string, unknown>}
 */
function collect() {
  return {
    hub_url:      pick('MOOTER_HUB_URL', 'FRUGAL_HUB_URL'),
    landing_url:  pick('MOOTER_LANDING_URL', 'FRUGAL_LANDING_URL'),
    sentry_dsn:   pick('MOOTER_SENTRY_DSN', 'FRUGAL_SENTRY_DSN'),
    tracker_port: pick('MOOTER_TRACKER_PORT', 'FRUGAL_TRACKER_PORT'),
    log_level:    pick('MOOTER_LOG_LEVEL', 'FRUGAL_LOG_LEVEL'),
  };
}

/**
 * Validate env and return the typed shape. Throws a structured ZodError on
 * failure — the stack contains the field path and what was expected. Call
 * this from savings-tracker.js startup and any long-running process that
 * must fail-fast with bad config.
 * @returns {RouterEnv}
 */
function requireEnv() {
  if (!envSchema) return validateless(collect());
  return envSchema.parse(collect());
}

/**
 * Validate env but return { ok, value, error } instead of throwing. For
 * hook contexts (inject_context.js) where a bad env var must NEVER kill
 * the parent process — Claude Code would stop working. Operator sees
 * the warning once via the `error` field; the hook continues with
 * defaults so the doctrine still applies.
 *
 * @returns {{ ok: true, value: RouterEnv } | { ok: false, value: RouterEnv, error: string }}
 */
function tryEnv() {
  if (!envSchema) return { ok: true, value: validateless(collect()) };
  const result = envSchema.safeParse(collect());
  if (result.success) {
    return { ok: true, value: result.data };
  }
  // Parse with defaults — the schema itself guarantees non-null defaults
  // for every required field, so this second pass succeeds whenever the
  // first failed only on a user-provided value.
  const fallback = envSchema.parse({});
  const issues = result.error.issues
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ');
  return { ok: false, value: fallback, error: issues };
}

// ── Legacy-compatible getters (preserve API for existing consumers) ─────

/** @returns {string} */
function getHubUrl() {
  return tryEnv().value.hub_url;
}

/** @returns {string} */
function getLandingUrl() {
  return tryEnv().value.landing_url;
}

module.exports = {
  envSchema,
  requireEnv,
  tryEnv,
  getHubUrl,
  getLandingUrl,
  DEFAULT_HUB_URL,
  DEFAULT_LANDING_URL,
};
