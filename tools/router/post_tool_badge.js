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

function main() {
  const prefs = readPrefs();
  if (!badgeEnabled(prefs)) return; // suppressed → no output, no pollution
  const badge = buildPostToolBadge(readLastSubagent());
  if (badge) process.stdout.write(badge + '\n');
}

if (require.main === module) {
  try { main(); } catch { /* hooks never throw */ }
  process.exit(0);
}

module.exports = { readPrefs, badgeEnabled, shortModel, buildPostToolBadge, readLastSubagent };
