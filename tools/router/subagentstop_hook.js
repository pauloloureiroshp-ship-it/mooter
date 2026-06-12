#!/usr/bin/env node
'use strict';

// subagentstop_hook.js — Wave 22 (22.A): native SubagentStop herd + token tracker.
//
// Day 0 recon (WAVE22_DAY0_SUBAGENTSTOP_PAYLOAD.md) proved Claude Code v2.1.165 fires
// a SubagentStop event once per subagent completion, carrying the reliable spawn
// signal `agent_id` + `agent_type` + `session_id` + `agent_transcript_path`. This is
// strictly better than the Wave 21 Day 2 PostToolUse fallback, which only sees a spawn
// when the subagent runs an inner Bash tool (a Read-only subagent — e.g. the Day 0
// local-summarizer — is missed by Path β but caught here).
//
// Two jobs, both best-effort, NEVER throw (it is on the hook path):
//   22.A  herd  → trackSpawn(agent_id) + trackComplete(agent_id, real duration)
//   22.B  token → aggregate the subagent's OWN transcript (wrapper-model usage that
//                 the main syncFromTranscript never reads) into the per-tier tracker.
//
// Idempotency: the tracker dedups by spawn_id (== agent_id), so this handler and the
// retained Path-β `recordSpawn` coexist with zero double-count — whichever fires first
// wins, the other no-ops. Token capture has its OWN dedup (`_subagent_done`) so it is
// recorded exactly once regardless of which path won the herd race.
//
// PRIVACY: only {agent_name, tier, model, duration_ms, token counts} are persisted —
// never `last_assistant_message` or any prompt/response text.

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Session-scoped file recording the LAST subagent's real execution profile, so the
 *  statusline can render the routed-intent-vs-reality gap (22.C). tmp-scoped like the
 *  herd/token state — never a versioned repo artifact, never prompt text. */
function lastExecPath(sessionId) {
  const sid = String(sessionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(os.tmpdir(), `mooter-lastexec-${sid}.json`);
}

/** Read the SubagentStop stdin payload ONCE (fd 0 is single-use). null on any failure. */
function readPayload() {
  try {
    if (process.stdin.isTTY) return null;
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Real spawn duration from the subagent transcript's timestamp SPAN. Day 0 found the
 * WSL clock is skewed (rows arrive out of order, signed deltas go negative), so we use
 * max(ts) − min(ts) — always ≥ 0, never a fabricated or negative value. null when the
 * transcript is unreadable or has < 2 timestamps (caller then omits duration_ms and the
 * tracker stores 0 rather than a guess).
 */
function durationFromTranscript(transcriptPath) {
  try {
    const raw = fs.readFileSync(transcriptPath, 'utf8');
    let lo = Infinity, hi = -Infinity, n = 0;
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const t = row && row.timestamp ? Date.parse(row.timestamp) : NaN;
      if (Number.isFinite(t)) { if (t < lo) lo = t; if (t > hi) hi = t; n += 1; }
    }
    if (n >= 2 && Number.isFinite(lo) && Number.isFinite(hi)) return Math.max(0, hi - lo);
  } catch { /* unreadable transcript → no duration */ }
  return null;
}

/**
 * Real execution profile of a finished subagent: the wrapper model it ACTUALLY ran on
 * (dominant by output tokens) + that model's tier + assistant-message count. This is the
 * reality half of the 22.C intent-vs-exec display — e.g. local-summarizer routes as
 * T0/qwen3:30b but really executes on T1/haiku when an API key is present. null when the
 * transcript is unreadable or carries no attributable assistant model.
 */
function execProfile(transcriptPath) {
  try {
    const raw = fs.readFileSync(transcriptPath, 'utf8');
    const byModel = {};
    let calls = 0;
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const msg = row && row.message;
      if (!msg || row.type !== 'assistant' || !msg.model) continue;
      const out = Number((msg.usage || {}).output_tokens) || 0;
      byModel[msg.model] = (byModel[msg.model] || 0) + out;
      calls += 1;
    }
    const models = Object.keys(byModel);
    if (!models.length) return null;
    models.sort((a, b) => byModel[b] - byModel[a]);
    const model = models[0];
    let tier = null;
    try { tier = require('./token_tracker.js').modelToTier(model); } catch { /* keep null */ }
    return { model, tier, calls };
  } catch {
    return null;
  }
}

/** Map a Claude Code subagent_type → {tier, model}. Single source of truth is the
 *  Wave 20 SUBAGENT_TIER table in post_tool_badge.js (Path β shares it). */
function tierFor(agentType) {
  try {
    const map = require('./post_tool_badge.js').SUBAGENT_TIER;
    return (map && map[agentType]) || { tier: null, model: null };
  } catch {
    return { tier: null, model: null };
  }
}

/**
 * Process one SubagentStop payload. Returns the agent_type on a recorded spawn, else
 * null. Pure-ish: all side effects are best-effort tracker writes.
 */
function handle(payload) {
  if (!payload) return null;
  const agentType = payload.agent_type;
  const agentId = payload.agent_id;
  if (!agentType || !agentId) return null; // not an attributable subagent stop
  const sessionId = payload.session_id
    || process.env.CLAUDE_SESSION_ID
    || process.env.CLAUDE_CODE_SESSION_ID
    || null;

  const { tier, model } = tierFor(agentType);
  const dur = payload.agent_transcript_path
    ? durationFromTranscript(payload.agent_transcript_path)
    : null;

  // 22.A — herd. trackSpawn then trackComplete (both idempotent by agent_id).
  try {
    const tracker = require('./subagent_tracker.js');
    const id = tracker.trackSpawn({ agent_name: agentType, tier, model, spawn_id: agentId, session_id: sessionId });
    tracker.trackComplete(id, {
      session_id: sessionId, agent_name: agentType, tier, model,
      ...(dur != null ? { duration_ms: dur } : {}),
    });
  } catch { /* hooks never throw */ }

  // 22.B — capture the subagent's wrapper-model tokens (own transcript, own dedup).
  try {
    if (payload.agent_transcript_path) {
      require('./token_tracker.js').trackSubagentTranscript(sessionId, agentId, payload.agent_transcript_path);
    }
  } catch { /* hooks never throw */ }

  // Wave 58 (A.9) — best-effort cost/perf journal. Uses ONLY data already in
  // hand (agent, tier/model, real transcript tokens, real duration). Wrapped so
  // a failure here can NEVER break the hook or alter its existing behaviour/output.
  try {
    if (payload.agent_transcript_path) {
      const tt = require('./token_tracker.js');
      const agg = tt.aggregateTranscript(payload.agent_transcript_path); // per-tier {calls,tokens_in,tokens_out}
      const execTier = (tier && agg && agg[tier] && (agg[tier].tokens_in || agg[tier].tokens_out)) ? tier : null;
      // Prefer the routed tier's tokens; else fall back to whichever tier actually has tokens.
      let useTier = execTier;
      if (!useTier && agg) {
        for (const t of ['T3', 'T2', 'T1', 'T0']) {
          if (agg[t] && (agg[t].tokens_in || agg[t].tokens_out)) { useTier = t; break; }
        }
      }
      const bucket = useTier && agg ? agg[useTier] : null;
      require('./cost-perf-tracker.js').appendCostPerf({
        task_category: agentType,
        model_chosen: model,
        agent_name: agentType,
        actual_tokens_in: bucket ? bucket.tokens_in : null,
        actual_tokens_out: bucket ? bucket.tokens_out : null,
        actual_duration_ms: dur != null ? dur : null,
      });
    }
  } catch { /* hooks never throw */ }

  // 22.C — record routed-intent vs real-execution for the statusline divergence chip.
  try {
    if (payload.agent_transcript_path) {
      const ep = execProfile(payload.agent_transcript_path);
      if (ep && ep.tier) {
        fs.writeFileSync(lastExecPath(sessionId), JSON.stringify({
          agent_type: agentType,
          intent_tier: tier, intent_model: model,
          exec_tier: ep.tier, exec_model: ep.model, calls: ep.calls,
        }));
      }
    }
  } catch { /* hooks never throw */ }

  return agentType;
}

function main() {
  handle(readPayload());
}

if (require.main === module) {
  try { main(); } catch { /* hooks never throw */ }
  process.exit(0);
}

module.exports = { readPayload, durationFromTranscript, tierFor, execProfile, lastExecPath, handle };
