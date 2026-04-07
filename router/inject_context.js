#!/usr/bin/env node
/**
 * inject_context.js — UserPromptSubmit hook entry point.
 *
 * Reads the user prompt from the hook stdin payload and prints a short
 * routing hint to stdout. Claude Code's UserPromptSubmit hook injects
 * stdout as additional context for the turn — non-blocking, non-destructive.
 *
 * Designed to NEVER fail loudly: any error → silent exit 0 (no context).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const LOG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.claude',
  'tools',
  'router',
  'decisions.log'
);

function logDecision(entry) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* never fail the hook over telemetry */ }
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

let raw = '';
try {
  raw = require('fs').readFileSync(0, 'utf8');
} catch { /* no stdin */ }

const payload = safeJson(raw) || {};
const prompt =
  payload.prompt ||
  payload.user_prompt ||
  payload.message ||
  (payload.messages && payload.messages[payload.messages.length - 1] &&
    payload.messages[payload.messages.length - 1].content) ||
  '';

if (!prompt || typeof prompt !== 'string' || prompt.length < 4) {
  process.exit(0);
}

const classifier = path.join(__dirname, 'classify.js');
const res = spawnSync(process.execPath, [classifier, prompt], {
  encoding: 'utf8',
  timeout: 1500,
});

if (res.status !== 0 || !res.stdout) {
  logDecision({ ts: new Date().toISOString(), event: 'classifier_failed', prompt_len: prompt.length });
  process.exit(0);
}

const decision = safeJson(res.stdout);
if (!decision) {
  logDecision({ ts: new Date().toISOString(), event: 'parse_failed', prompt_len: prompt.length });
  process.exit(0);
}

// Always log the decision (low-confidence too — useful for tuning).
logDecision({
  ts: new Date().toISOString(),
  event: 'classified',
  prompt_len: prompt.length,
  prompt_preview: prompt.slice(0, 80).replace(/\s+/g, ' '),
  tier: decision.tier,
  task_category: decision.task_category,
  recommended_backend: decision.recommended_backend,
  recommended_model: decision.recommended_model,
  confidence: decision.confidence,
  escalation_rule: decision.escalation_rule,
});

// Only emit hint when confident enough that it adds value.
if (decision.confidence < 0.6) process.exit(0);

const lines = [
  '<router-hint>',
  `task_category: ${decision.task_category}`,
  `risk_level: ${decision.risk_level}`,
  `tier: ${decision.tier}`,
  `recommended_backend: ${decision.recommended_backend}`,
  `recommended_model: ${decision.recommended_model}`,
  `suggested_subagent: ${decision.suggested_subagent}`,
  `confidence: ${decision.confidence}`,
  decision.escalation_rule !== 'none' ? `escalation: ${decision.escalation_rule}` : null,
  '',
  'Routing policy: see ~/.claude/docs/ROUTING_POLICY.md',
  'If this is a structural/critical task, prefer the suggested subagent.',
  'If this is a trivial local task, delegate to local-summarizer / local-transformer.',
  '</router-hint>',
].filter(Boolean);

process.stdout.write(lines.join('\n') + '\n');
process.exit(0);
