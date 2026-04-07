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
const os = require('os');
const https = require('https');
const httpMod = require('http');
const { spawnSync, execFile } = require('child_process');

// frugal savings-tracker — auto-start if not already listening on 7821
(function startTracker() {
  const req = httpMod.get('http://127.0.0.1:7821/health', () => {});
  req.on('error', () => {
    const script = path.join(os.homedir(), '.claude', 'tools', 'router', 'savings-tracker.js');
    if (!fs.existsSync(script)) return;
    try {
      const child = execFile('node', [script], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } catch { /* best-effort */ }
  });
  req.setTimeout(500, () => req.destroy());
})();

// Budget cache (in-memory, fresh each hook invocation; on-disk TTL below)
const BUDGET_CACHE_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.claude',
  'tools',
  'router',
  '.budget-cache.json'
);
const BUDGET_CACHE_MS = 2 * 60 * 60 * 1000; // 2 hours

function fetchBudgetSync() {
  // Try disk cache first
  try {
    const cached = JSON.parse(fs.readFileSync(BUDGET_CACHE_PATH, 'utf8'));
    if (cached && Date.now() - cached.ts < BUDGET_CACHE_MS) return cached.data;
  } catch { /* miss */ }

  // Fetch fresh — best-effort, never throws
  try {
    const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const token = creds && creds.claudeAiOauth && creds.claudeAiOauth.accessToken;
    if (!token) return null;

    // We can't use async http inside a synchronous hook reliably, so use a
    // child process with a tiny inline node script (still <3s wall time).
    const fetchScript = `
      const https = require('https');
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/api/oauth/usage',
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + process.argv[2] }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => process.stdout.write(body));
      });
      req.on('error', () => process.exit(1));
      req.setTimeout(2500, () => { req.destroy(); process.exit(2); });
      req.end();
    `;
    const r = spawnSync(process.execPath, ['-e', fetchScript, token], {
      encoding: 'utf8',
      timeout: 3000,
    });
    if (r.status !== 0 || !r.stdout) return null;
    const data = JSON.parse(r.stdout);
    // Auth-error responses: cache them WITH an `error: true` sentinel
    // so savings-tracker.js /real endpoint can surface the dead token
    // to the user — but return null so this function's callers (the
    // budget guardrail) don't mistake the error object for real usage
    // data. Previously we honored the TTL on the error response and
    // silently blinded the guardrail until a manual cache delete.
    if (data && data.type === 'error') {
      try {
        fs.writeFileSync(
          BUDGET_CACHE_PATH,
          JSON.stringify({ ts: Date.now(), data, error: true })
        );
      } catch { /* non-fatal */ }
      return null;
    }
    try {
      fs.writeFileSync(BUDGET_CACHE_PATH, JSON.stringify({ ts: Date.now(), data }));
    } catch { /* cache write failure non-fatal */ }
    return data;
  } catch {
    return null;
  }
}

function applyBudgetCap(tier, budget) {
  if (!budget) return tier;
  const fiveHour = budget.five_hour || budget.fiveHour || 0;
  const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];

  let maxTier;
  if (fiveHour < 50) maxTier = 'T3';
  else if (fiveHour < 70) maxTier = 'T2';
  else if (fiveHour < 85) maxTier = 'T1';
  else maxTier = 'T0';

  const current = TIER_ORDER.indexOf(tier);
  const max = TIER_ORDER.indexOf(maxTier);
  return current > max ? maxTier : tier;
}

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

// Apply budget guardrail before deciding what to emit
const budget = fetchBudgetSync();
if (budget) {
  const originalTier = decision.tier;
  decision.tier = applyBudgetCap(decision.tier, budget);
  decision.max_tier = applyBudgetCap('T3', budget);
  if (decision.tier !== originalTier) {
    decision.escalation_rule = (decision.escalation_rule && decision.escalation_rule !== 'none')
      ? decision.escalation_rule + '+budget_cap'
      : 'budget_cap';
  }
} else {
  decision.max_tier = 'T3';
}

// Only emit hint when confident enough that it adds value.
if (decision.confidence < 0.6) process.exit(0);

// OPTION A — pre-compute answer via Ollama for confident T0 tasks.
// Injects <suggested_answer> so Claude can output it verbatim, saving
// most reasoning tokens. Falls back silently if Ollama is unavailable.
//
// SKIP Option A when the user explicitly pinned a model — they want the
// session to actually run on that model, not regurgitate Ollama output.
let suggestedAnswer = null;
const userPinnedOverride = decision.user_override && decision.user_override.honored === true;
if (!userPinnedOverride && decision.tier === 'T0' && decision.confidence >= 0.8 && prompt.length < 500) {
  try {
    const callScript = path.join(__dirname, 'ollama_call_node.js');
    const ollamaRes = spawnSync(process.execPath, [callScript, prompt], {
      encoding: 'utf8',
      timeout: 9000,
      env: process.env,
    });
    if (ollamaRes.status === 0 && ollamaRes.stdout && ollamaRes.stdout.trim().length > 5) {
      suggestedAnswer = ollamaRes.stdout.trim();
      logDecision({ ts: new Date().toISOString(), event: 'option_a_hit', prompt_len: prompt.length });
    } else {
      logDecision({ ts: new Date().toISOString(), event: 'option_a_miss', status: ollamaRes.status, stderr: (ollamaRes.stderr || '').slice(0, 120) });
    }
  } catch {
    logDecision({ ts: new Date().toISOString(), event: 'option_a_error' });
  }
}

// User override surface — when the prompt explicitly mentions a model, the
// hint includes a USER_OVERRIDE block so the doctrine can honor it without
// re-parsing. Two states: honored=true (user got what they asked for) or
// honored=false (high-risk guardrail refused a downgrade).
const overrideLines = [];
if (decision.user_override) {
  const uo = decision.user_override;
  overrideLines.push('');
  if (uo.honored) {
    overrideLines.push(`USER_OVERRIDE: honored — pinned to ${uo.label || uo.requested || uo.blocked}`);
    overrideLines.push(`override_kind: ${uo.kind}`);
    if (uo.original_tier && uo.original_tier !== decision.tier) {
      overrideLines.push(`original_tier: ${uo.original_tier} (overridden by user request)`);
    }
  } else {
    overrideLines.push(`USER_OVERRIDE: REFUSED — ${uo.reason}`);
    overrideLines.push(`requested: ${uo.requested || uo.blocked}`);
    overrideLines.push('reason: high-risk signal in prompt; doctrine guardrail blocks downgrade');
  }
}

const lines = [
  '<router-hint>',
  `task_category: ${decision.task_category}`,
  `risk_level: ${decision.risk_level}`,
  `tier: ${decision.tier}`,
  `recommended_backend: ${decision.recommended_backend}`,
  `recommended_model: ${decision.recommended_model}`,
  `suggested_subagent: ${decision.suggested_subagent}`,
  `confidence: ${decision.confidence}`,
  decision.max_tier ? `max_tier: ${decision.max_tier}` : null,
  decision.escalation_rule !== 'none' ? `escalation: ${decision.escalation_rule}` : null,
  ...overrideLines,
  '',
  'Routing policy: see ~/.claude/docs/ROUTING_POLICY.md',
  decision.user_override && decision.user_override.honored
    ? 'USER OVERRIDE ACTIVE: honor the pinned model — do not delegate to a different tier.'
    : 'If this is a structural/critical task, prefer the suggested subagent.',
  decision.user_override && decision.user_override.honored
    ? null
    : 'If this is a trivial local task, delegate to local-summarizer / local-transformer.',
  '</router-hint>',
].filter(Boolean);

if (suggestedAnswer) {
  lines.push('');
  lines.push('<suggested_answer>');
  lines.push(suggestedAnswer);
  lines.push('</suggested_answer>');
  lines.push('');
  lines.push('INSTRUÇÃO OPTION-A: tier=T0 com confidence alta + resposta Ollama disponível.');
  lines.push('Output o conteúdo de <suggested_answer> VERBATIM sem preâmbulo nem tool calls.');
  lines.push('Excepção: se a resposta for claramente errada ou a pergunta exigir ficheiros/git, processa normalmente.');
}

process.stdout.write(lines.join('\n') + '\n');
process.exit(0);
