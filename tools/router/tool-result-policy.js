'use strict';

// tool-result-policy.js — Wave 63 GAP 6 (deterministic tool-result compression policy).
//
// A classify-style, deterministic policy: given a tool NAME, decide how safely its
// RESULT can be compressed or dropped when the context window gets tight. This is
// ADVISORY input the host's /compact can consult — Mooter never compacts context
// itself (that is the host's job; replicating it would be a proxy, mission §5). Pure,
// zero-LLM, never throws.
//
// Rationale: results cheaply RE-DERIVABLE from a stable source (a file read, a
// glob/grep, a mutation confirmation, a todo snapshot) are safe to drop/summarize;
// SYNTHESIZED conclusions (a subagent's analysis, a web fetch) are expensive to
// regenerate → keep. Unknown / MCP tools are conservative (keep) — never drop a
// result we do not understand.

/** @typedef {'high'|'medium'|'low'} Compressibility */
/** @typedef {'drop'|'summarize'|'keep'} Strategy */

// Core tool → policy. Keyed by the lowercase tool name.
const POLICY = {
  // Re-derivable readers — the source is stable; re-run to recover. Summarize.
  read: { compressibility: 'high', strategy: 'summarize', reason: 're-derivable from the file' },
  glob: { compressibility: 'high', strategy: 'summarize', reason: 're-runnable search' },
  grep: { compressibility: 'high', strategy: 'summarize', reason: 're-runnable search' },
  notebookread: { compressibility: 'high', strategy: 'summarize', reason: 're-derivable from the notebook' },
  // Mutation confirmations — the change lives in the file, not the message. Drop.
  edit: { compressibility: 'high', strategy: 'drop', reason: 'confirmation; change persisted to disk' },
  write: { compressibility: 'high', strategy: 'drop', reason: 'confirmation; change persisted to disk' },
  multiedit: { compressibility: 'high', strategy: 'drop', reason: 'confirmation; change persisted to disk' },
  notebookedit: { compressibility: 'high', strategy: 'drop', reason: 'confirmation; change persisted to disk' },
  // Ephemeral state — superseded by the next snapshot. Drop.
  todowrite: { compressibility: 'high', strategy: 'drop', reason: 'state snapshot superseded by the next write' },
  // Verbose, re-runnable execution — keep the tail/errors, summarize the rest.
  bash: { compressibility: 'medium', strategy: 'summarize', reason: 're-runnable; keep tail/errors' },
  powershell: { compressibility: 'medium', strategy: 'summarize', reason: 're-runnable; keep tail/errors' },
  // External snapshots — may change; the gist is what matters. Summarize.
  webfetch: { compressibility: 'medium', strategy: 'summarize', reason: 'external snapshot; keep the gist' },
  websearch: { compressibility: 'medium', strategy: 'summarize', reason: 'external snapshot; keep the gist' },
  // Synthesized conclusions — expensive to regenerate. Keep.
  task: { compressibility: 'low', strategy: 'keep', reason: 'synthesized conclusion; costly to regenerate' },
  agent: { compressibility: 'low', strategy: 'keep', reason: 'synthesized conclusion; costly to regenerate' },
};

// The conservative default for unknown / MCP / unmapped tools: never drop.
const DEFAULT_POLICY = { compressibility: 'low', strategy: 'keep', reason: 'unknown tool — conservative keep' };

/** Normalize a tool name (lowercase; MCP `mcp__server__verb` is treated as unknown). */
function normalize(toolName) {
  return String(toolName || '').trim().toLowerCase();
}

/**
 * Compression policy for a tool's result. Pure; never throws. Unknown / MCP tools
 * fall back to the conservative keep policy.
 * @param {string} toolName
 * @returns {{ tool: string, compressibility: Compressibility, strategy: Strategy, reason: string, advisory: true }}
 */
function toolResultPolicy(toolName) {
  const key = normalize(toolName);
  const policy = Object.prototype.hasOwnProperty.call(POLICY, key) ? POLICY[key] : DEFAULT_POLICY;
  return { tool: key || 'unknown', ...policy, advisory: true };
}

/** True when the policy is to drop the result outright (safe under /compact). */
function isDiscardable(toolName) {
  return toolResultPolicy(toolName).strategy === 'drop';
}

module.exports = { toolResultPolicy, isDiscardable, POLICY, DEFAULT_POLICY };
