/**
 * workflows.js — POST /v1/workflows (Wave 28, Phase H)
 *
 * Landing point for the local workflow engine (packages/workflow). The CLI posts
 * ONE run-metadata object per workflow run (idempotent: report 'running' first,
 * 'completed' later — same run_id upserts). Run METADATA only: counts, status,
 * cost/savings. Never the orchestration script, prompts, or any file/code text.
 *
 * Identity follows the Wave 26 model α (same as /v1/events): NO bearer token —
 * a server secret in a public CLI would leak. Clients are identified by
 * device_id (client_id_pseudonymous, SHA256 of a per-machine secret) and
 * rate-limited per device. Separate table (workflow_runs); Pastor untouched.
 */

import * as Sentry from '@sentry/cloudflare';
import { sanitizeJson } from '../lib/sanitize.js';
import { errorResponse, classifyException } from '../lib/errors.js';

// Same fail-open hourly ceiling style as /v1/events.
export const RATE_LIMIT_PER_HOUR = 500;

const ALLOWED_STATUS = new Set(['running', 'completed', 'failed', 'cancelled']);

function asInt(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function asReal(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function asStr(v, max = 200) {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

/**
 * Validate the run metadata. Pure; returns { run, error }. Only run_id and
 * device_id are required — everything else is optional progress detail.
 */
export function validateRun(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const run_id = asStr(body.run_id, 128);
  if (!run_id) return { error: 'run_id is required' };
  const device_id = asStr(body.device_id, 128);
  if (!device_id) return { error: 'device_id is required' };

  let status = asStr(body.status, 32);
  if (status && !ALLOWED_STATUS.has(status)) {
    return { error: `status must be one of: ${[...ALLOWED_STATUS].join(', ')}` };
  }

  const ts_start = asInt(body.ts_start);
  if (ts_start === null) return { error: 'ts_start is required (epoch ms)' };

  return {
    run: {
      run_id,
      device_id,
      workflow_name: asStr(body.workflow_name, 128),
      ts_start,
      ts_end: asInt(body.ts_end),
      num_phases: asInt(body.num_phases),
      num_agents_total: asInt(body.num_agents_total),
      num_agents_local: asInt(body.num_agents_local),
      num_agents_cloud: asInt(body.num_agents_cloud),
      duration_ms: asInt(body.duration_ms),
      status: status || 'running',
      estimated_savings_usd: asReal(body.estimated_savings_usd),
      actual_cost_usd: asReal(body.actual_cost_usd),
      doctrine_violations: asInt(body.doctrine_violations) ?? 0,
    },
  };
}

const UPSERT_SQL = `INSERT INTO workflow_runs (
  run_id, device_id, workflow_name, ts_start, ts_end, num_phases,
  num_agents_total, num_agents_local, num_agents_cloud, duration_ms,
  status, estimated_savings_usd, actual_cost_usd, doctrine_violations, received_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(run_id) DO UPDATE SET
  workflow_name = COALESCE(excluded.workflow_name, workflow_runs.workflow_name),
  ts_end = COALESCE(excluded.ts_end, workflow_runs.ts_end),
  num_phases = COALESCE(excluded.num_phases, workflow_runs.num_phases),
  num_agents_total = COALESCE(excluded.num_agents_total, workflow_runs.num_agents_total),
  num_agents_local = COALESCE(excluded.num_agents_local, workflow_runs.num_agents_local),
  num_agents_cloud = COALESCE(excluded.num_agents_cloud, workflow_runs.num_agents_cloud),
  duration_ms = COALESCE(excluded.duration_ms, workflow_runs.duration_ms),
  status = excluded.status,
  estimated_savings_usd = COALESCE(excluded.estimated_savings_usd, workflow_runs.estimated_savings_usd),
  actual_cost_usd = COALESCE(excluded.actual_cost_usd, workflow_runs.actual_cost_usd),
  doctrine_violations = excluded.doctrine_violations,
  received_at = excluded.received_at`;

export async function handleWorkflows(request, env) {
  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  let body;
  try {
    body = sanitizeJson(await request.json());
  } catch {
    return errorResponse('invalid_json', 'bad_request', { message: 'Request body is not valid JSON' });
  }

  const { run, error } = validateRun(body);
  if (error) {
    return errorResponse('validation_failed', 'bad_request', { message: error });
  }

  const receivedAt = new Date().toISOString();
  try {
    await env.DB.prepare(UPSERT_SQL)
      .bind(
        run.run_id, run.device_id, run.workflow_name, run.ts_start, run.ts_end,
        run.num_phases, run.num_agents_total, run.num_agents_local, run.num_agents_cloud,
        run.duration_ms, run.status, run.estimated_savings_usd, run.actual_cost_usd,
        run.doctrine_violations, receivedAt,
      )
      .run();
  } catch (e) {
    try { Sentry.captureException(e, { tags: { route: '/v1/workflows', kind: 'db_upsert_failed' } }); } catch { /* no-op */ }
    return errorResponse('db_error', classifyException(e), { message: e.message });
  }

  return new Response(JSON.stringify({ ok: true, run_id: run.run_id, status: run.status }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}
