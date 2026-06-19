#!/usr/bin/env node
'use strict';

// PreToolUse-moo-risk — the Safety Plane enforcement hook (First Magic — FASE 1).
//
// Fires BEFORE a tool runs. Extracts the action string from the tool call, scores
// it with moo-risk (host-side, zero-LLM), and HARD-BLOCKS irreversible destructive
// ops (action === 'escalate_human') by exiting 2 with the reason on stderr — the
// only exit code Claude Code treats as a block (see hooks/HOOKS-SPEC.md). Every
// block appends a `risk_blocked` event to decisions.log for the cockpit.
//
// DOCTRINE
//   - Zero-LLM, no-proxy: regex scoring only, never a paid model.
//   - Fail-OPEN on any internal error (never wedge the user's session) — hard
//     enforcement for the worst ops ALSO lives in a permissions deny rule, because
//     hooks are best-effort. This hook is the explainable, logged layer.
//   - classify.js untouched (we reuse patterns.HIGH_RISK via moo-risk).

const path = require('path');
const fs = require('fs');
const { assess, isBlocking } = require(path.join(__dirname, '..', 'moo-risk'));

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Pull the most action-bearing text out of an arbitrary tool_input.
function extractActionText(toolName, input) {
  if (!input || typeof input !== 'object') return String(input || '');
  const parts = [];
  // Bash — the command is the action.
  if (input.command) parts.push(String(input.command));
  // File writes / edits — path + payload can carry destructive SQL/shell.
  if (input.file_path) parts.push(String(input.file_path));
  if (input.content) parts.push(String(input.content));
  if (input.new_string) parts.push(String(input.new_string));
  if (Array.isArray(input.edits)) parts.push(input.edits.map((e) => e && e.new_string).filter(Boolean).join('\n'));
  // Anything else — fall back to a shallow stringify so we never miss a command.
  if (parts.length === 0) parts.push(JSON.stringify(input));
  return parts.join('\n');
}

// Redact obvious secret material before it touches the append-only log. Best-effort
// (the log is local + 0600-ish), but a rotated key must never be written verbatim.
function redact(s) {
  return String(s)
    .replace(/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{6,}/g, '$1_$2_***')
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{6,}/g, 'xox*-***')
    .replace(/\bgh[posru]_[A-Za-z0-9]{10,}/g, 'gh*_***')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'jwt.***.***')
    .replace(/\b(api[_-]?key|secret|token|password|passwd|pwd|credential)\b(\s*[:=]\s*|\s+(?:is|to)\s+)\S+/gi, '$1$2***');
}

function emitRiskBlocked(rec) {
  try {
    const { DECISIONS_LOG } = require(path.join(__dirname, '..', 'paths'));
    const logPath = process.env.MOOTER_DECISIONS_LOG || DECISIONS_LOG;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(rec) + '\n', 'utf8');
  } catch {
    /* logging is best-effort — never block on a log failure */
  }
}

function main() {
  let payload = {};
  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0); // unparseable input → fail open
  }

  const toolName = payload.tool_name || payload.toolName || '';
  const toolInput = payload.tool_input || payload.toolInput || {};
  const text = extractActionText(toolName, toolInput);
  if (!text.trim()) process.exit(0);

  let verdict;
  try {
    // TOOL layer: a command about to run — destructive tokens block regardless of
    // any surrounding "sandbox"/"example"/"explain" wording (no bypass).
    verdict = assess(text, { layer: 'tool' });
  } catch {
    process.exit(0); // scoring error → fail open
  }

  if (isBlocking(verdict.action)) {
    emitRiskBlocked({
      ts: new Date().toISOString(),
      event: 'risk_blocked',
      tool: toolName,
      risk_tier: verdict.risk_tier,
      action: verdict.action,
      reason: verdict.reason,
      signals: verdict.signals,
      // never log the full payload — keep a short, redacted preview only
      preview: redact(text.slice(0, 160)),
    });
    // exit 2 = block (the only code Claude Code blocks on); reason → stderr.
    process.stderr.write(
      `\n🛑 mooter risk gate — BLOCKED ${toolName}\n` +
      `   ${verdict.reason}\n` +
      `   This is an irreversible/destructive action. Confirm with a human or rephrase.\n`
    );
    process.exit(2);
  }

  // escalate_T3 is advisory at the tool layer (it floors the model, not the call);
  // record it lightly so the cockpit can show it, then allow.
  if (verdict.action === 'escalate_T3') {
    emitRiskBlocked({
      ts: new Date().toISOString(),
      event: 'risk_flagged',
      tool: toolName,
      risk_tier: verdict.risk_tier,
      action: verdict.action,
      reason: verdict.reason,
    });
  }
  process.exit(0);
}

main();
