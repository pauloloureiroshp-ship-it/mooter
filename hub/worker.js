/**
 * worker.js — frugal-hub Cloudflare Worker entry point.
 *
 * Routes:
 *   POST /api/delta    — receive anonymized delta from frugal instances
 *   GET  /api/stats    — public aggregate statistics
 *   GET  /api/models   — model catalog + community-detected models
 *   GET  /api/version  — current versions of router-tuning and catalog
 *   GET  /health       — simple health check
 *
 * Cron triggers:
 *   hourly  → aggregate deltas into stats
 *   daily   → generate new router-tuning from community data
 *   weekly  → notify Paulo of anomalies + prune expired deltas
 */

import { handleDelta } from './routes/delta';
import { handleStats } from './routes/stats';
import { handleModels } from './routes/models';
import { handleVersion } from './routes/version';
import { handleSubmitEvents, handleAggregateStats } from './routes/events';
import { runAggregate } from './jobs/aggregate';
import { runGenerate } from './jobs/generate';
import { runNotify } from './jobs/notify';

export default {
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

    let response;
    try {
      switch (path) {
        case '/api/delta':
          response = await handleDelta(request, env);
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
        case '/aggregate-stats':
          response = await handleAggregateStats(request, env);
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
      // Daily: generate router-tuning
      ctx.waitUntil(runGenerate(env));
    } else if (cron === '0 6 * * 1') {
      // Weekly: notify + prune
      ctx.waitUntil(runNotify(env));
    }
  },
};
