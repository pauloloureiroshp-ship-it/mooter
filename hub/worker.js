/**
 * worker.js — mooter-hub Cloudflare Worker entry point.
 *
 * Routes:
 *   POST /api/delta             — receive anonymized delta from mooter instances
 *   POST /api/device-heartbeat  — receive install/lifecycle heartbeat from devices
 *   GET  /api/stats             — public aggregate statistics
 *   GET  /api/models            — model catalog + community-detected models
 *   GET  /api/version           — current versions of router-tuning and catalog
 *   GET  /health                — simple health check
 *
 * Cron triggers:
 *   hourly  → aggregate deltas into stats
 *   daily   → generate new router-tuning from community data
 *   weekly  → notify Paulo of anomalies + prune expired deltas
 *
 * Sprint 8.3 — Sentry: the export default is wrapped by Sentry.withSentry,
 * which instruments both `fetch` and `scheduled`. Init is conditional on
 * env.SENTRY_DSN — when absent the wrapper passes through with zero overhead.
 * Per-route failures are still caught here and reported via Sentry.captureException
 * inside routes/delta.js and routes/events.js for richer context.
 */

import * as Sentry from '@sentry/cloudflare';

import { handleDelta } from './routes/delta.js';
import { handleStats } from './routes/stats.js';
import { handleModels } from './routes/models.js';
import { handleVersion } from './routes/version.js';
import { handleSubmitEvents, handleAggregateStats } from './routes/events.js';
import { handleSyncEvents } from './routes/sync_events.js';
import { handleWorkflows } from './routes/workflows.js';
import { handlePastorV2 } from './routes/pastor-v2.js';
import { handlePastorAdapters } from './routes/pastor-adapters.js';
import { handleFederated } from './routes/federated.js';
import { handleWaveStatus } from './routes/wave-status.js';
import { handleTransparency, handleForgetMe } from './routes/transparency.js';
import { handleHeartbeat } from './routes/heartbeat.js';
import { handleFeedback } from './routes/feedback.js';
import { handlePricing } from './routes/pricing.js';
import { handleBenchmarks } from './routes/benchmarks.js';
import { handleUserDashboard } from './routes/user-dashboard.js';
import { handleAdminUsers } from './routes/admin_users.js';
import { adminUserDetail } from './routes/admin_user_detail.js';
import { handleAdminCohort } from './routes/admin_cohort.js';
import { runAggregate } from './jobs/aggregate.js';
import { runGenerate } from './jobs/generate.js';
import { runNotify } from './jobs/notify.js';
import { runUpdateProfiles } from './jobs/update-profiles.js';
import { tryValidateEnv } from './lib/env.js';

const handler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for public API
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Sprint 10.2 — env binding validation. tryValidateEnv never throws;
    // returns issues[] when a typed binding is malformed so we can forward
    // them to Sentry without 500'ing legit requests. Defaults fill in any
    // missing optional binding so downstream routes get a typed cfg.
    const envCheck = tryValidateEnv(env);
    if (!envCheck.ok) {
      try {
        Sentry.captureMessage(`hub_env_invalid: ${envCheck.issues.join('; ')}`, 'warning');
      } catch { /* non-fatal — DSN may be unset */ }
    }

    let response;
    try {
      // Dynamic admin route: GET /v1/admin/user/<hash> (Wave 56). The 16-hex
      // segment is variable, so it cannot be an exact switch case. Registered
      // BEFORE the switch so it is not shadowed by any broader /v1/admin path.
      // The handler validates /^[a-f0-9]{16}$/ and returns 400 on a malformed
      // segment, so worker.js only needs the prefix test (no query strings here).
      if (request.method === 'GET' && path.startsWith('/v1/admin/user/')) {
        const hash = path.slice('/v1/admin/user/'.length);
        response = await adminUserDetail(request, env, hash);
      } else
      switch (path) {
        case '/api/delta':
          response = await handleDelta(request, env);
          break;
        case '/api/device-heartbeat':
          response = await handleHeartbeat(request, env);
          break;
        case '/api/feedback':        // POST: anonymous feedback (Wave 12 D1-2)
        case '/api/feedback-list':   // GET: admin read (MOOTER_ADMIN_TOKEN, FRUGAL_ADMIN_TOKEN fallback)
          response = await handleFeedback(request, env);
          break;
        case '/api/stats':
          response = await handleStats(request, env);
          break;
        case '/api/models':
          response = await handleModels(request, env);
          break;
        case '/api/version':
          response = await handleVersion(request, env);
          break;
        case '/submit-events':
          response = await handleSubmitEvents(request, env);
          break;
        case '/v1/events':
          response = await handleSyncEvents(request, env);
          break;
        case '/v1/workflows':
          response = await handleWorkflows(request, env);
          break;
        case '/v1/pastor-v2':
          response = await handlePastorV2(request, env);
          break;
        case '/v1/pastor-adapters':
          response = await handlePastorAdapters(request, env);
          break;
        case '/v1/federated':
          response = await handleFederated(request, env);
          break;
        case '/v1/wave-status':
          response = await handleWaveStatus(request, env);
          break;
        case '/v1/transparency':
          response = await handleTransparency(request, env);
          break;
        case '/v1/forget-me':
          response = await handleForgetMe(request, env);
          break;
        case '/v1/pricing':
          response = await handlePricing(request, env);
          break;
        case '/v1/benchmarks':   // GET: curated PUBLIC benchmark cells (Wave 5, Option B; data-only)
          response = await handleBenchmarks(request, env);
          break;
        case '/aggregate-stats':
          response = await handleAggregateStats(request, env);
          break;
        case '/v1/user/dashboard':   // GET: per-user aggregates by anonymous user_hash (Wave 33.7)
          response = await handleUserDashboard(request, env);
          break;
        case '/v1/admin/users':   // GET: paginated per-user roll-up of frugal_events (Wave 56, anonymous user_id_hash only)
          response = await handleAdminUsers(request, env);
          break;
        case '/v1/admin/cohort-metrics':   // GET: aggregate cohort engagement metrics (Wave 56; ?period=7d|30d parsed in handler)
          response = await handleAdminCohort(request, env);
          break;
        case '/health':
          response = new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
          break;
        default:
          response = new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
    } catch (e) {
      // Forward to Sentry with request context. Safe when DSN is unset —
      // withSentry passes through and Sentry.captureException becomes a no-op.
      try { Sentry.captureException(e); } catch { /* non-fatal */ }
      response = new Response(JSON.stringify({ error: 'internal error', detail: e.message }), {
        status: 500,
      });
    }

    // Apply CORS headers to all responses
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      headers.set(k, v);
    }
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },

  async scheduled(event, env, ctx) {
    const cron = event.cron;

    if (cron === '0 * * * *') {
      // Hourly: aggregate deltas
      ctx.waitUntil(runAggregate(env));
    } else if (cron === '0 6 * * *') {
      // Daily: generate router-tuning + update user profiles
      ctx.waitUntil(runGenerate(env));
      ctx.waitUntil(runUpdateProfiles(env));
    } else if (cron === '0 6 * * 1') {
      // Weekly: notify + prune
      ctx.waitUntil(runNotify(env));
    }
  },
};

// Sprint 8.3 — Sentry wrapper.
//
// Sentry.withSentry(optionsFn, handler) takes a function that receives the
// Worker's env binding (including SENTRY_DSN from wrangler.mooter.toml [vars]) and
// returns the init options. When env.SENTRY_DSN is absent/empty, we return
// `{ enabled: false }` so the SDK fully disables itself — no network calls,
// no instrumentation overhead. This lets local `wrangler dev` runs work
// without Sentry credentials.
export default Sentry.withSentry(
  (env) => {
    const dsn = env && env.SENTRY_DSN;
    if (!dsn) return { enabled: false, dsn: '' };
    return {
      dsn,
      environment: (env && env.SENTRY_ENVIRONMENT) || 'production',
      release: (env && env.SENTRY_RELEASE) || 'mooter-hub@unknown',
      tracesSampleRate: 0.1,
    };
  },
  handler
);
