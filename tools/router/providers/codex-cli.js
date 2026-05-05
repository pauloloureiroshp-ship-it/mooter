#!/usr/bin/env node
/**
 * providers/codex-cli.js — wrap the OpenAI Codex CLI for the Mooter router.
 *
 * Uses `codex exec` (non-interactive) so the prompt → response flow is a
 * single child_process call. Authenticated via ChatGPT OAuth (handled by
 * `codex login` outside the router); we never touch OPENAI_API_KEY here so
 * usage bills against the subscription, not the API.
 *
 * Returns { ok, text, durationMs, model } on success; null on quota
 * exhaustion or any failure (caller falls through to the next provider in
 * `suggested_providers`).
 *
 * Updates quota-tracker.js after every call so the classifier can decide
 * whether to keep preferring Codex on the next prompt.
 *
 * No npm deps; pure Node built-ins.
 */

'use strict';

const { spawnSync } = require('child_process');
const { loadEnv }   = require('./_load-env');
const tracker       = require('../quota-tracker');

loadEnv();

// On Windows, npm installs Codex as both `codex` (bash shim) and `codex.cmd`
// (Windows shim). Node 18.20+ blocks .cmd execution without shell: true
// (CVE-2024-27980), so we MUST use shell: true on Windows. To avoid both
// the shell-injection risk AND the Node DEP0190 deprecation that fires when
// passing args alongside shell: true, we collapse everything into a single
// command string ourselves. The prompt is always fed via stdin (`exec -`),
// never via argv, so even with shell: true no user-controlled string ever
// reaches the shell parser.
const IS_WIN    = process.platform === 'win32';
const CODEX_BIN = IS_WIN ? 'codex.cmd' : 'codex';

function buildCmd(parts) {
  // All inputs are internally produced flags — quote any that contain spaces
  // for safety, but no shell metachars are possible.
  return parts
    .map((p) => /\s/.test(p) ? `"${p.replace(/"/g, '\\"')}"` : p)
    .join(' ');
}

function runCodex(parts, extra = {}) {
  if (IS_WIN) {
    return spawnSync(buildCmd([CODEX_BIN, ...parts]), [], {
      shell: true,
      encoding: 'utf8',
      windowsHide: true,
      ...extra,
    });
  }
  return spawnSync(CODEX_BIN, parts, {
    encoding: 'utf8',
    windowsHide: true,
    ...extra,
  });
}

// Strings the Codex CLI prints (or includes in error messages) when the
// ChatGPT subscription window is exhausted. Treated as "soft failure" —
// wrapper records the exhaustion and returns null so the router falls back.
const QUOTA_HINTS = [
  'rate limit',
  'rate-limited',
  'quota',
  '5 hour',
  '5-hour',
  'weekly limit',
  'usage limit',
];

const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Invoke Codex CLI with a prompt.
 *
 * @param {string} prompt
 * @param {object} [opts]
 * @param {string} [opts.model]              optional model override (-m)
 * @param {'read-only'|'workspace-write'} [opts.sandbox='read-only']
 * @param {number} [opts.timeoutMs=90000]
 * @param {boolean} [opts.skipGitRepoCheck=true]
 * @returns {{ok:true,text:string,durationMs:number,model:string|null}|null}
 */
function callCodex(prompt, opts = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('codex-cli: prompt must be a non-empty string');
  }

  const sandbox      = opts.sandbox || 'read-only';
  const timeoutMs    = Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const skipGitCheck = opts.skipGitRepoCheck !== false;

  // Internal-only flags here. Prompt arrives via stdin (`-`), never via
  // argv. See CODEX_BIN/runCodex comment above.
  const parts = ['exec'];
  if (skipGitCheck) parts.push('--skip-git-repo-check');
  parts.push('-s', sandbox);
  if (opts.model) parts.push('-m', opts.model);
  parts.push('-');

  const t0 = Date.now();
  let res;
  try {
    res = runCodex(parts, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      input: prompt,
    });
  } catch (err) {
    return null;
  }
  const durationMs = Date.now() - t0;

  if (res.error) return null;

  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const status = res.status;
  const exhausted = looksLikeQuotaExhaustion(stdout, stderr);

  // Always record the attempt — even failures count against the rolling
  // estimate, since the CLI may have charged the subscription before
  // surfacing the error.
  try {
    tracker.recordUsage('openai_codex_cli', {
      messages: 1,
      exhausted,
    });
  } catch { /* tracker is best-effort */ }

  if (status !== 0 || exhausted) return null;

  return {
    ok: true,
    text: stdout.trim(),
    durationMs,
    model: opts.model || null,
  };
}

function looksLikeQuotaExhaustion(stdout, stderr) {
  const blob = `${stdout}\n${stderr}`.toLowerCase();
  return QUOTA_HINTS.some((needle) => blob.includes(needle));
}

/**
 * Cheap availability check — does the CLI exist and is the user logged in?
 * Returns { available: bool, reason?: string }. Does NOT consume quota.
 */
function isAvailable() {
  let res;
  try {
    res = runCodex(['login', 'status'], { timeout: 5_000 });
  } catch {
    return { available: false, reason: 'codex CLI not installed' };
  }
  if (res.error || res.status !== 0) {
    return { available: false, reason: 'codex login status failed' };
  }
  // Codex prints the login banner to stderr on success — check both streams.
  const blob = `${res.stdout || ''}\n${res.stderr || ''}`.toLowerCase();
  if (!blob.includes('logged in')) {
    return { available: false, reason: 'not logged in (run: codex login)' };
  }
  return { available: true };
}

module.exports = {
  callCodex,
  isAvailable,
  QUOTA_HINTS,
};

// CLI sanity check: `node providers/codex-cli.js`
if (require.main === module) {
  const probe = isAvailable();
  process.stdout.write(JSON.stringify(probe, null, 2) + '\n');
}
