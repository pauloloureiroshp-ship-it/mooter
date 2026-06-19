#!/usr/bin/env node
'use strict';

// SubagentStart-moo-route — per-subagent local|cloud routing hook (First Magic — FASE 3).
//
// Fires when a subagent (incl. Dynamic Workflows fan-out) starts. Reads its role/
// description + the parent task, asks subagent-route for a deterministic local|cloud
// decision, and emits `additionalContext` biasing the model for THIS subagent. It only
// BIASES — it never blocks (it is not an enforcement gate). Zero-LLM, fail-open.
//
// NOTE: the exact SubagentStart payload field names should be confirmed against the live
// hook schema; this parser is intentionally tolerant (role/description/prompt/task under
// several shapes) so it degrades to a no-op rather than misfiring.

const path = require('path');
const fs = require('fs');
const { decideRoute } = require(path.join(__dirname, '..', 'subagent-route'));

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && typeof obj[k] === 'string' && obj[k].trim()) return obj[k];
  }
  return '';
}

function emitDecision(rec) {
  try {
    const { DECISIONS_LOG } = require(path.join(__dirname, '..', 'paths'));
    const logPath = process.env.MOOTER_DECISIONS_LOG || DECISIONS_LOG;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(rec) + '\n', 'utf8');
  } catch { /* best-effort */ }
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readStdin() || '{}'); } catch { process.exit(0); }
  // JSON.parse('null') succeeds → guard non-objects so the hook stays fail-open.
  if (!payload || typeof payload !== 'object') process.exit(0);

  const sub = payload.subagent || payload.agent || payload.tool_input || payload;
  const role = pick(sub, ['role', 'description', 'subagent_type', 'agent_type', 'name', 'type']);
  const task = pick(sub, ['prompt', 'task', 'input', 'description']) || pick(payload, ['prompt', 'task', 'parent_task']);

  if (!role && !task) process.exit(0); // nothing to route → no-op

  let route;
  try { route = decideRoute({ role, task }); } catch { process.exit(0); }

  emitDecision({
    ts: new Date().toISOString(),
    event: 'subagent_routed',
    role: String(role).slice(0, 80),
    target: route.target,
    model: route.model,
    risk: route.risk,
    role_class: route.role_class,
  });

  const badge = route.target === 'local' ? '🦙 local' : '✨ cloud';
  const ctx = `mooter route: ${badge} — ${route.model}. ${route.reason}` +
    (route.target === 'local' ? ' Prefer the local model for this verbose/leaf step ($0); escalate to the maestro only if it cannot complete.' : '');

  // Bias only — additionalContext, never a block. Exit 0 always.
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: ctx },
  }) + '\n');
  process.exit(0);
}

main();
