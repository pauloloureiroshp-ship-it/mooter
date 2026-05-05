#!/usr/bin/env node
/**
 * statusline-multi.js — multi-provider statusline for the Mooter router.
 *
 * Companion to statusline.sh (which is left untouched). This Node script
 * reads decisions.log + quota-state.json and prints a single line with the
 * provider distribution, today's spend, and live quota state.
 *
 * Output (single line):
 *   🟢 Local 67% · 🔵 Haiku 8% · 🟣 Sonnet 6% · 🟠 Codex 11% · 🔴 Opus 8% │ 💰 $1.23 today │ Anth 78% · OAI 66%
 *
 * Wiring (manual, not auto-applied):
 *   Set "statusLine" in ~/.claude/settings.json to:
 *     { "type": "command", "command": "node ~/.claude/tools/router/statusline-multi.js" }
 *
 * Performance: tails the last ~256KB of decisions.log so it stays fast even
 * after the file grows past tens of MB. Pure Node built-ins, no deps.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { ROUTER_DIR, DECISIONS_LOG } = (() => {
  try { return require('./paths'); }
  catch {
    const home = require('os').homedir();
    const dir  = path.join(home, '.claude', 'tools', 'router');
    return { ROUTER_DIR: dir, DECISIONS_LOG: path.join(dir, 'decisions.log') };
  }
})();

const QUOTA_PATH = path.join(ROUTER_DIR, 'quota-state.json');
const TAIL_BYTES = 256 * 1024;

function readQuota() {
  try {
    const raw = fs.readFileSync(QUOTA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readDecisionsTail() {
  let fd;
  try {
    fd = fs.openSync(DECISIONS_LOG, 'r');
  } catch {
    return [];
  }
  try {
    const stat = fs.fstatSync(fd);
    const len  = Math.min(TAIL_BYTES, stat.size);
    const buf  = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, stat.size - len);
    // Drop the (likely partial) first line.
    const text = buf.toString('utf8');
    const nl   = text.indexOf('\n');
    return text.slice(nl + 1).split('\n').filter(Boolean);
  } finally {
    fs.closeSync(fd);
  }
}

function isToday(isoTs) {
  if (!isoTs) return false;
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() &&
         d.getUTCMonth()    === now.getUTCMonth() &&
         d.getUTCDate()     === now.getUTCDate();
}

function tally(lines) {
  const counts = { T0: 0, T1: 0, T2: 0, T3: 0, codex: 0 };
  let total = 0;

  for (const line of lines) {
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }
    if (!evt || evt.event !== 'classified') continue;
    if (evt.source === 'mooter-tester') continue; // tester noise
    if (!isToday(evt.ts)) continue;

    // Codex CLI uses are tagged either by recommended_backend or by an
    // upstream provider tag once execution telemetry lands. Today the
    // "classified" event records the *suggested* provider list; if the
    // first suggestion is codex_cli we count it as a Codex slot to give
    // operators visibility into how often Codex would have fired.
    const providers = Array.isArray(evt.suggested_providers) ? evt.suggested_providers : [];
    if (providers[0] === 'codex_cli') {
      counts.codex += 1;
    } else if (evt.tier && counts[evt.tier] !== undefined) {
      counts[evt.tier] += 1;
    } else {
      continue; // unknown tier/provider — skip
    }
    total += 1;
  }
  return { counts, total };
}

function pct(num, denom) {
  if (!denom) return 0;
  return Math.round((num / denom) * 100);
}

function fmt$(x) {
  return `$${(Math.round(x * 100) / 100).toFixed(2)}`;
}

function render() {
  const quota = readQuota() || {};
  const lines = readDecisionsTail();
  const { counts, total } = tally(lines);

  const local  = pct(counts.T0, total);
  const haiku  = pct(counts.T1, total);
  const sonnet = pct(counts.T2, total);
  const opus   = pct(counts.T3, total);
  const codex  = pct(counts.codex, total);

  const todayCost =
    (quota.providers && quota.providers.anthropic && quota.providers.anthropic.today.cost_usd || 0) +
    (quota.providers && quota.providers.openai_api && quota.providers.openai_api.today.cost_usd || 0);

  const anthRem = quota.providers && quota.providers.anthropic
    ? Math.max(0, Math.round((1 - (quota.providers.anthropic.window_5h.tokens_used /
        Math.max(1, quota.providers.anthropic.window_5h.limit))) * 100))
    : 100;
  const codexRem = quota.providers && quota.providers.openai_codex_cli
    ? (quota.providers.openai_codex_cli.exhausted ? 0
       : Math.max(0, Math.round((1 - (quota.providers.openai_codex_cli.window_5h.messages_used /
           Math.max(1, quota.providers.openai_codex_cli.window_5h.limit))) * 100)))
    : 100;

  const dist = [
    `🟢 Local ${local}%`,
    `🔵 Haiku ${haiku}%`,
    `🟣 Sonnet ${sonnet}%`,
    `🟠 Codex ${codex}%`,
    `🔴 Opus ${opus}%`,
  ].join(' · ');

  return `${dist} │ 💰 ${fmt$(todayCost)} today │ Anth ${anthRem}% · OAI ${codexRem}%`;
}

// CLI entry: write a single line and exit.
if (require.main === module) {
  try {
    process.stdout.write(render() + '\n');
  } catch (err) {
    // Statusline must NEVER throw — degrade to a minimal fallback so the
    // user's terminal is never broken by a stale log or missing file.
    process.stdout.write('mooter (statusline-multi: degraded)\n');
    if (process.env.MOOTER_DEBUG) process.stderr.write(String(err) + '\n');
  }
}

module.exports = { render, tally, readDecisionsTail, readQuota };
