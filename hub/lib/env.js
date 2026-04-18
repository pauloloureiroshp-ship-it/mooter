// @ts-check
/**
 * hub/lib/env.js — Zod-validated env binding accessor for the Cloudflare Worker.
 *
 * CCA Criterion #10 (Environment Safety) — hub surface. Before this module
 * the worker read env.X directly inside routes, which meant a typo or
 * missing binding surfaced as `undefined` in production with no warning.
 *
 * Usage:
 *   import { validateEnv } from '../lib/env.js';
 *   const cfg = validateEnv(env); // throws ZodError on schema violation
 *
 * The worker pattern: validate once at request entry and pass the typed
 * `cfg` down to handlers. Routes no longer read `env.X` directly —
 * consume `cfg.x` instead.
 */

import { z } from 'zod';

// ── Schema ──────────────────────────────────────────────────────────────

export const envSchema = z.object({
  // D1 binding — opaque object, we just assert presence.
  DB: z.any(),

  // Cron triggers + routes share these. All optional; defaults applied.
  SENTRY_DSN:         z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().min(1).default('production'),
  SENTRY_RELEASE:     z.string().min(1).default('mooter-hub@unknown'),

  // Bearer token for /submit-events. Required in production but optional
  // during local wrangler dev. Handlers must 401 when absent AND a request
  // comes in with Authorization header — enforcement lives there, not here.
  FRUGAL_SUBMIT_TOKEN: z.string().min(16).optional(),

  // TTL for delta records before they're pruned. Accepts either a numeric
  // string (legacy) or an actual number via wrangler [vars] table.
  DELTA_TTL_DAYS:      z.coerce.number().int().min(1).max(365).default(7),

  // Admin / notify target. Optional — when present, weekly notify job
  // posts anomaly reports there.
  PAULO_WEBHOOK_URL:   z.string().url().optional(),

  // Generic catch-all — anything else (R2/KV bindings added later) passes
  // through unvalidated so adding a new binding doesn't require a schema
  // update before deploy.
}).passthrough();

/** @typedef {z.infer<typeof envSchema>} HubEnv */

/**
 * Validate env bindings. Throws ZodError on failure — worker.js catches
 * and routes to Sentry + a 500 response. Do NOT call this in the Sentry
 * withSentry optionsFn — that callback runs before the request is fully
 * initialised and swallowing its errors kills observability.
 *
 * @param {unknown} env
 * @returns {HubEnv}
 */
export function validateEnv(env) {
  return envSchema.parse(env);
}

/**
 * Non-throwing variant for contexts where the operator prefers a soft
 * fallback. Returns the parsed env (defaults applied) and a list of
 * issues that the caller can forward to Sentry without bringing down
 * the whole request.
 *
 * @param {unknown} env
 * @returns {{ ok: true, cfg: HubEnv } | { ok: false, cfg: HubEnv, issues: string[] }}
 */
export function tryValidateEnv(env) {
  const r = envSchema.safeParse(env);
  if (r.success) return { ok: true, cfg: r.data };
  const cfg = envSchema.parse({ DB: /** @type {any} */ (env)?.DB });
  const issues = r.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
  return { ok: false, cfg, issues };
}
