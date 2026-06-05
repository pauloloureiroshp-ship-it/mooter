#!/usr/bin/env node
'use strict';

// Wave 10 · A.4 — per-tool-call model badge (PostToolUse hook).
//
// Answers "which Moo handled this tool call?" by printing a one-line badge after
// a Bash/Task tool runs, e.g.  🐂 ☁ sonnet T2 · via model-architect
//
// Source: tools/router/last-subagent.json, written by inject_context.js
// precisely so PostToolUse can surface the routed model (see its line ~890
// "WriteLastSubagent state so PostToolUse:Bash can show the correct model").
//
// Honesty: that state carries { model, subagent, tier } — NOT per-tool latency
// or cost, so the badge shows only those real fields. No ms / $ are invented.
// Like every hook it must NEVER throw; all paths exit 0 and an absent/stale
// state file simply prints nothing.

const fs = require('fs');
const path = require('path');
const os = require('os');

function routerDir() {
  try {
    return require('./paths').ROUTER_DIR || path.join(os.homedir(), '.claude', 'tools', 'router');
  } catch {
    const claude = process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || path.join(os.homedir(), '.claude');
    return path.join(claude, 'tools', 'router');
  }
}

/** Read ~/.mooter/preferences.json. Missing/bad → {}. */
function readPrefs(prefsPath) {
  try {
    const p = prefsPath || path.join(os.homedir(), '.mooter', 'preferences.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch {
    return {};
  }
}

/**
 * Enabled by default; suppressed when the user has gone quiet, turned the badge
 * off, or explicitly set post_tool_badge:false.
 */
function badgeEnabled(prefs) {
  const p = prefs || {};
  if (p.post_tool_badge === false) return false;
  if (p.quiet === true) return false;
  if (p.badge_off === true) return false;
  return true;
}

function shortModel(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('gpt')) return 'gpt';
  if (m.includes('gemini')) return 'gemini';
  if (/qwen|llama|deepseek|gemma|mistral|phi/.test(m)) return m.split(':')[0] || 'ollama';
  return m || 'unknown';
}

/**
 * Build the per-tool badge from the last-subagent state. Returns '' when there
 * is nothing real to show. Pure given its input.
 * @param {{model?:string, subagent?:string, tier?:string}|null} sub
 * @returns {string}
 */
function buildPostToolBadge(sub) {
  if (!sub || (!sub.model && !sub.tier)) return '';
  const tier = sub.tier ? String(sub.tier) : 'T?';
  const model = shortModel(sub.model);
  let glyph;
  try {
    const { glyphFor, providerBucket } = require('./glyphs.js');
    // Local (T0) grazes home; everything else is cloud. We only have the model,
    // so bucket from it (qwen/llama/etc → local) for the provider glyph.
    const prov = /qwen|llama|deepseek|gemma|mistral|phi|ollama|local/.test(model) ? 'local' : providerBucket(model);
    glyph = glyphFor({ tier, provider: prov });
  } catch {
    glyph = '🐮';
  }
  const via = sub.subagent && sub.subagent !== 'inline' ? ` · via ${sub.subagent}` : '';
  return `${glyph} ${model} ${tier}${via}`;
}

/** Read the last-subagent state file. Returns null on any failure. */
function readLastSubagent(statePath) {
  try {
    const p = statePath || path.join(routerDir(), 'last-subagent.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Wave 13 "Show the Herd" — per-agent annotation (standard verbosity)
// ────────────────────────────────────────────────────────────────────────

// Verbosity ladder. `silent`/`quiet` suppress the per-agent line; `standard`
// (default) and `verbose` render it. Env var wins, then preferences.json, then
// the default. Phase 5 surfaces this via `mooter quiet --verbose|--quiet|--herd-off`.
const HERD_LEVELS = ['silent', 'quiet', 'standard', 'verbose'];

function herdVisibility(prefs) {
  const env = String(process.env.MOOTER_HERD_VISIBILITY || '').toLowerCase();
  if (HERD_LEVELS.includes(env)) return env;
  const p = prefs && String(prefs.herd_visibility || '').toLowerCase();
  if (HERD_LEVELS.includes(p)) return p;
  return 'standard';
}

function herdAnnotationEnabled(verbosity) {
  return verbosity === 'standard' || verbosity === 'verbose';
}

/**
 * One line per agent class (not per file), aggregated. Local agents wear 🐄
 * (a Moo); cloud agents wear ☁. Latency only shown when the tracker actually
 * measured it (no invented ms). Verbose adds the tier; file-path logging (still
 * never prompt text) is the hook's job since only it sees tool_input.
 * @param {{agent_name?:string,count?:number,avg_ms?:number,local?:boolean,model?:string,tier?:string}} row
 * @returns {string} indented line, or '' when suppressed / no real data
 */
function buildHerdLine(row, { verbosity = 'standard' } = {}) {
  if (!herdAnnotationEnabled(verbosity)) return '';
  if (!row || !row.agent_name || !(Number(row.count) >= 1)) return '';
  const glyph = row.local ? '🐄' : '☁';
  const parts = [`${glyph} ${row.agent_name} × ${Number(row.count)}`];
  if (row.model) {
    const m = shortModel(row.model);
    parts.push(verbosity === 'verbose' && row.tier ? `${m} ${row.tier}` : m);
  } else if (verbosity === 'verbose' && row.tier) {
    parts.push(String(row.tier));
  }
  if (Number(row.avg_ms) > 0) parts.push(`avg ${Math.round(Number(row.avg_ms))}ms`);
  return `   ${parts.join(' · ')}`;
}

/** Best-effort session id from the PostToolUse stdin payload or env. */
function readSessionId() {
  try {
    if (process.stdin.isTTY) return process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || null;
    const raw = fs.readFileSync(0, 'utf8');
    const j = JSON.parse(raw);
    return (j && j.session_id) || process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || null;
  } catch {
    return process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || null;
  }
}

/**
 * Build the herd annotation for the agent class that just completed, reading the
 * tracker's cumulative snapshot. Best-effort and pure-ish (snapshot is injected
 * in tests). Returns '' when there is nothing to show.
 */
function herdAnnotationFor(agentName, snap, verbosity) {
  if (!agentName || !snap || !Array.isArray(snap.cumulative)) return '';
  const row = snap.cumulative.find((r) => r.agent_name === agentName);
  if (!row) return '';
  return buildHerdLine(row, { verbosity });
}

function main() {
  const prefs = readPrefs();
  if (!badgeEnabled(prefs)) return; // suppressed → no output, no pollution
  const sub = readLastSubagent();
  const badge = buildPostToolBadge(sub);
  if (badge) process.stdout.write(badge + '\n');

  // Read the session id once (stdin is single-use) and reuse it below.
  const sessionId = readSessionId();

  // Wave 19 (19.A) — keep the per-tier token cache fresh from the session
  // transcript (real cloud tokens). Best-effort; the statusline reads the cache.
  try { require('./token_tracker.js').syncFromTranscript(sessionId); } catch { /* hooks never throw */ }

  // Wave 13 — per-agent herd annotation. Best-effort; a missing tracker, no
  // session, or quiet/silent verbosity simply prints nothing extra.
  const verbosity = herdVisibility(prefs);
  if (!herdAnnotationEnabled(verbosity)) return;
  try {
    const snap = require('./subagent_tracker.js').snapshot({ session_id: sessionId });
    const agentName = sub && sub.subagent && sub.subagent !== 'inline' ? sub.subagent : null;
    const line = herdAnnotationFor(agentName, snap, verbosity);
    if (line) process.stdout.write(line + '\n');
  } catch { /* hooks never throw */ }
}

if (require.main === module) {
  try { main(); } catch { /* hooks never throw */ }
  process.exit(0);
}

module.exports = {
  readPrefs, badgeEnabled, shortModel, buildPostToolBadge, readLastSubagent,
  // Wave 13 "Show the Herd"
  herdVisibility, herdAnnotationEnabled, buildHerdLine, herdAnnotationFor, HERD_LEVELS,
};
