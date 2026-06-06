// token_tracker.js — Wave 19 (19.A): real tokens consumed per tier (T0–T3).
//
// "Token is the new oil." Mooter is a hook, not a proxy — it does NOT see the
// Anthropic API response directly. But Claude Code records real `usage`
// (input/output/cache tokens) + `model` for every assistant message in the
// session transcript (~/.claude/projects/<proj>/<session>.jsonl). That recorded
// response data is the REAL source for the cloud tiers — no extra API call, no
// proxy, no hub (anti-patterns respected). Local (T0/Ollama) tokens are not in
// the transcript, so they arrive via trackCall() from the executor path.
//
// State is session-scoped + file-backed (mimics subagent_tracker.js):
//   os.tmpdir()/mooter-tokens-<session>.json   ← cache of per-tier aggregates.
// snapshot() returns { T0:{calls,tokens_in,tokens_out,real}, T1:{...}, ... }.
//
// PRIVACY: only metadata (tier, model, token counts, ts) — never prompt text.

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TIERS = ['T0', 'T1', 'T2', 'T3'];

function cachePath(sessionId) {
  const sid = String(sessionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(os.tmpdir(), `mooter-tokens-${sid}.json`);
}

/** Map a model string to a Mooter tier. Cloud tiers come from the transcript;
 *  local/Ollama models map to T0. Returns null for unknown (skipped). */
function modelToTier(model) {
  const m = String(model || '').toLowerCase();
  if (!m) return null;
  if (m.includes('opus')) return 'T3';
  if (m.includes('sonnet')) return 'T2';
  if (m.includes('haiku')) return 'T1';
  if (/qwen|llama|gemma|deepseek|mistral|phi|ollama|local/.test(m)) return 'T0';
  return null; // gpt/gemini/grok etc. are not T0–T3 — ignored by the 🪙 chip
}

function emptyState() {
  const s = {};
  for (const t of TIERS) s[t] = { calls: 0, tokens_in: 0, tokens_out: 0, real: true };
  return s;
}

function readCache(sessionId) {
  try {
    const p = cachePath(sessionId);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { /* ignore corrupt cache */ }
  return null;
}

function writeCache(sessionId, obj) {
  try { fs.writeFileSync(cachePath(sessionId), JSON.stringify(obj)); } catch { /* best-effort */ }
}

/** Locate the Claude Code transcript for a session id (glob the projects dir). */
function findTranscript(sessionId, claudeDir) {
  if (!sessionId) return null;
  const base = path.join(
    claudeDir || process.env.MOOTER_CLAUDE_DIR || path.join(os.homedir(), '.claude'),
    'projects',
  );
  try {
    for (const proj of fs.readdirSync(base)) {
      const cand = path.join(base, proj, `${sessionId}.jsonl`);
      if (fs.existsSync(cand)) return cand;
    }
  } catch { /* no projects dir */ }
  return null;
}

/**
 * Aggregate REAL cloud-tier tokens from a transcript jsonl. Pure over a path;
 * counts input_tokens + output_tokens per assistant message (cache tokens are
 * tracked separately and not folded into the headline — see findings).
 * @returns {{T0,T1,T2,T3}} per-tier {calls, tokens_in, tokens_out, real:true}
 */
function aggregateTranscript(transcriptPath) {
  const out = emptyState();
  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch { return out; }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const msg = row && row.message;
    if (!msg || row.type !== 'assistant') continue;
    const tier = modelToTier(msg.model);
    if (!tier) continue;
    const u = msg.usage || {};
    const tin = Number(u.input_tokens) || 0;
    const tout = Number(u.output_tokens) || 0;
    if (tin === 0 && tout === 0) continue;
    out[tier].calls += 1;
    out[tier].tokens_in += tin;
    out[tier].tokens_out += tout;
  }
  return out;
}

/**
 * Real-time push for tokens Mooter executes itself (T0/Ollama via ollama-api).
 * Accumulates into the file-backed cache under a separate `_pushed` bucket so a
 * transcript re-sync never double-counts cloud tiers.
 */
function trackCall(tier, llm, tokens_in, tokens_out, opts = {}) {
  if (!TIERS.includes(tier)) return;
  const sessionId = opts.sessionId || process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || 'unknown';
  const cache = readCache(sessionId) || { _pushed: emptyState() };
  if (!cache._pushed) cache._pushed = emptyState();
  cache._pushed[tier].calls += 1;
  cache._pushed[tier].tokens_in += Number(tokens_in) || 0;
  cache._pushed[tier].tokens_out += Number(tokens_out) || 0;
  cache._pushed[tier].real = true;
  writeCache(sessionId, cache);
}

/**
 * Wave 22 (22.B) — capture a finished subagent's REAL wrapper-model tokens.
 *
 * Root cause of the ~64% gap (Day 0 finding): a subagent (e.g. local-summarizer)
 * runs on a cloud wrapper model — Haiku/Sonnet/Opus — and records its `usage` in a
 * SEPARATE transcript under `…/subagents/agent-<id>.jsonl`. The main `syncFromTranscript`
 * only reads the PARENT transcript, so those tokens were invisible. The SubagentStop
 * hook (Wave 22 Path α) hands us `agent_transcript_path`; we aggregate it here.
 *
 * Disjoint from the main transcript → pushing into `_pushed` never double-counts the
 * `_transcript` bucket. Idempotent by `agent_id` via a `_subagent_done` set, so a hook
 * retry (or a Path-β race) can't inflate counts. snapshot() ignores `_subagent_done`
 * and the per-tier shape is unchanged (Wave 19 non-negotiable preserved).
 * @returns {boolean} true iff this call recorded new tokens.
 */
function trackSubagentTranscript(sessionId, agentId, transcriptPath, opts = {}) {
  if (!agentId || !transcriptPath) return false;
  const sid = opts.sessionId || sessionId || process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || 'unknown';
  const cache = readCache(sid) || {};
  if (!cache._subagent_done) cache._subagent_done = {};
  if (cache._subagent_done[agentId]) return false; // already counted this spawn
  const agg = aggregateTranscript(transcriptPath); // per-tier {calls, tokens_in, tokens_out}
  if (!cache._pushed) cache._pushed = emptyState();
  let any = false;
  for (const t of TIERS) {
    if (agg[t].calls > 0 || agg[t].tokens_in > 0 || agg[t].tokens_out > 0) {
      cache._pushed[t].calls += agg[t].calls;
      cache._pushed[t].tokens_in += agg[t].tokens_in;
      cache._pushed[t].tokens_out += agg[t].tokens_out;
      cache._pushed[t].real = true;
      any = true;
    }
  }
  cache._subagent_done[agentId] = 1;
  writeCache(sid, cache);
  return any;
}

/** Sync the cloud tiers from the transcript into the cache (mtime-guarded). */
function syncFromTranscript(sessionId, opts = {}) {
  const tpath = opts.transcriptPath || findTranscript(sessionId, opts.claudeDir);
  if (!tpath) return readCache(sessionId);
  let mtime = 0;
  try { mtime = fs.statSync(tpath).mtimeMs; } catch { /* gone */ }
  const cache = readCache(sessionId) || {};
  if (cache._transcript_mtime === mtime && cache._transcript) return cache; // fresh
  cache._transcript = aggregateTranscript(tpath);
  cache._transcript_mtime = mtime;
  writeCache(sessionId, cache);
  return cache;
}

/**
 * Per-tier snapshot, merging transcript-derived cloud tokens with executor
 * pushes (T0). **Cache-only / fast** — never parses the transcript, so it is
 * safe to call from the statusline every render. The PostToolUse hook keeps the
 * cache fresh via syncFromTranscript(). @returns {{T0,T1,T2,T3}}.
 */
function snapshot(sessionId, opts = {}) {
  const cache = (opts.sync ? syncFromTranscript(sessionId, opts) : readCache(sessionId)) || {};
  const tx = cache._transcript || emptyState();
  const pushed = cache._pushed || emptyState();
  const merged = emptyState();
  for (const t of TIERS) {
    merged[t].calls = tx[t].calls + pushed[t].calls;
    merged[t].tokens_in = tx[t].tokens_in + pushed[t].tokens_in;
    merged[t].tokens_out = tx[t].tokens_out + pushed[t].tokens_out;
    merged[t].real = true;
  }
  return merged;
}

module.exports = {
  TIERS,
  modelToTier,
  aggregateTranscript,
  findTranscript,
  trackCall,
  trackSubagentTranscript,
  syncFromTranscript,
  snapshot,
  cachePath,
};
