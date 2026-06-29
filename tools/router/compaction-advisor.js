'use strict';

// compaction-advisor.js — Wave 64 Fase 1 (Compaction Advisor, execution-axis).
//
// Decides the OPTIMAL MOMENT to compact the agent's context — at a semantic TASK
// BOUNDARY, before the emergency auto-compact — instead of the dumb "% of window"
// or "tool-call count" triggers everyone else uses. Pure, deterministic, host-side,
// zero-cloud, <1ms. It only ADVISES (chip + router-hint nudge): firing /compact from
// a hook is impossible today (CC issue #58538), so there is no auto-trigger — Fase 4
// flips ADVISE_NOW to actuation in one line when upstream ships it.
//
// NO-PROXY / doctrine: reuses signals the harness already has (classify.js category,
// cwd, prompt text, turn timestamps). The local LLM (embedding drift / qwen3 arbiter)
// is Fase 2 and only runs in the grey zone — never on the critical path here.

const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Stage-1 boundary weights (deterministic weighted vote) ---
const W_EVENT = 0.5;     // commit / test-pass / PR — strongest causal boundary (end of a unit of work)
const W_CATEGORY = 0.4;  // classify.js category transition (code_generation → debugging → docs)
const W_FOCUS = 0.3;     // the focused directory changed (dir A → dir B)
const W_GAP = 0.3;       // user-away temporal gap between turns
const STRONG = 0.5;      // boundary >= this ⇒ a strong, causal boundary
const GREY_LOW = 0.2;    // Fase 2: run the embedding drift detector only in [GREY_LOW, STRONG)
const GAP_MS = 10 * 60 * 1000; // 10 min idle ⇒ user-away boundary
const STALE_MS = 12 * 60 * 60 * 1000;

// commit / test-pass / PR language (EN + PT-PT) — a strong "end of work unit" signal.
const EVENT_RE = /\b(?:git\s+)?commit(?:ted)?\b|\bpushed?\b|\bmerged?\b|\bpull\s*request\b|\bPR\b|\btests?\s+(?:pass|passed|passing|green)\b|\ball\s+green\b|\bfiz\s+commit\b|\btestes?\s+(?:passa|passaram|verdes?)\b|\babri\s+(?:um\s+)?PR\b/i;

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

/** Map an API-reported context fill % (0..100) to a pressure rung. null/unknown ⇒ monitor. */
function pressureLadder(tokenPct) {
  const p = Number(tokenPct);
  if (!Number.isFinite(p)) return 'monitor';
  if (p >= 99) return 'emergency';
  if (p >= 90) return 'advise';
  if (p >= 85) return 'prune';
  if (p >= 80) return 'mask';
  return 'monitor';
}

/** True when the prompt names a commit / test-pass / PR — a causal work boundary. */
function commitTestPRSignal(promptText) {
  return EVENT_RE.test(typeof promptText === 'string' ? promptText : '');
}

/**
 * Stage-1 deterministic boundary gate. Weighted vote over signals the harness
 * already has. Pure; returns { score∈[0,1], signals:string[] }. `prev` is the
 * persisted per-session state (or null on the first turn ⇒ no boundary yet).
 */
function stage1Boundary(prev, cur, now) {
  const signals = [];
  if (!prev || !cur) return { score: 0, signals: ['no_prior_state'] };
  let score = 0;

  if (commitTestPRSignal(cur.prompt)) { score += W_EVENT; signals.push('commit_test_pr'); }

  const a = String(prev.category || ''), b = String(cur.category || '');
  if (a && b && a !== b) { score += W_CATEGORY; signals.push(`category:${a}→${b}`); }

  const fa = String(prev.cwd || ''), fb = String(cur.cwd || '');
  if (fa && fb && fa !== fb) { score += W_FOCUS; signals.push('focus_change'); }

  const t0 = Number(prev.ts), t1 = Number(now);
  if (Number.isFinite(t0) && Number.isFinite(t1) && t1 - t0 > GAP_MS) { score += W_GAP; signals.push('user_away_gap'); }

  if (!signals.length) signals.push('continuous');
  return { score: Number(clamp01(score).toFixed(3)), signals };
}

/**
 * The junction (spec B.5). Decide HOLD / PREP_SNAPSHOT / ADVISE_NOW from the
 * boundary score, pressure rung and cache state. Pure. SAFETY: never advise
 * compaction mid-HIGH_RISK task (risk_level 'high') — return HOLD.
 *   cacheCold: 'hot' | 'cooling' | 'cold' | 'unknown' (Fase 3 computes it; default 'unknown').
 */
function compactionDecision({ boundary = 0, pressure = 'monitor', cacheCold = 'unknown', risk_level = '' } = {}) {
  if (String(risk_level).toLowerCase() === 'high') return 'HOLD'; // never interrupt a high-risk unit
  const strong = boundary >= STRONG;
  const pressureAdvise = pressure === 'advise' || pressure === 'emergency';
  if ((strong && cacheCold !== 'hot') || pressureAdvise) return 'ADVISE_NOW';
  if (strong) return 'PREP_SNAPSHOT';
  return 'HOLD';
}

// --- Fase 3: cache-aware timing. The prompt-cache has a ~5-min TTL; compacting
// rewrites the prefix and loses a warm cache. So the optimal instant is NOT "early
// because there's room" — it's the boundary where the cache was going to churn
// anyway (post-commit + pause), not mid-task while the prefix is hot.
const CACHE_TTL_MS = 5 * 60 * 1000; // prompt-cache TTL (regressed from 1h in Mar-2026)
const CACHE_HOT_MS = 90 * 1000;     // recent activity ⇒ prefix still warm

/** Prompt-cache temperature from the gap since the last turn. 'unknown' when no prior ts. */
function cacheState(lastTs, now = Date.now()) {
  const t = Number(lastTs);
  if (!Number.isFinite(t) || t <= 0) return 'unknown'; // Number(null/'')===0, not NaN
  const gap = Number(now) - t;
  if (gap < CACHE_HOT_MS) return 'hot';
  if (gap >= CACHE_TTL_MS) return 'cold';
  return 'cooling';
}

/**
 * A restorable "previously on" snapshot of the session boundary state — the priority
 * payload a PreCompact hook would persist. Pure; deterministic; JSON-serializable.
 */
function buildSnapshot(state = {}) {
  const s = state || {};
  return {
    session_id: s.session_id || null,
    category: s.category || null,
    focus: s.cwd || null,
    turns: Number(s.turns) || 0,
    last_event: s.last_event || null,
    file_index: Array.isArray(s.file_index) ? s.file_index.slice(0, 50) : [],
    previously_on: `Previously: ${s.category || 'work'} in ${s.cwd || 'repo'} `
      + `(${Number(s.turns) || 0} turns${s.last_event ? `, last ${s.last_event}` : ''}).`,
  };
}

// --- per-session breadcrumb (mirrors session-affinity.js: best-effort, never throws) ---
function dir() {
  return path.join(process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter'), 'compaction');
}
function safeId(sessionId) {
  return String(sessionId || 'nosession').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
}
function statePath(sessionId) { return path.join(dir(), `${safeId(sessionId)}.json`); }

function readState(sessionId, now = Date.now()) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(sessionId), 'utf8'));
    if (!s || typeof s !== 'object') return null;
    if (Number.isFinite(Number(s.ts)) && now - Number(s.ts) > STALE_MS) return null;
    return s;
  } catch { return null; }
}
function writeState(sessionId, state, now = Date.now()) {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(statePath(sessionId), JSON.stringify(Object.assign({ ts: now }, state)));
    return true;
  } catch { return false; }
}

/**
 * Orchestrate one turn: read prior state, compute the boundary + decision, persist
 * the new state, and return the advisory. Pure-ish (only its own breadcrumb IO).
 * `cur` = { category, cwd, prompt, risk_level, tokenPct?, cacheCold? }.
 */
function advise(sessionId, cur = {}, now = Date.now()) {
  const prev = readState(sessionId, now);
  let { score, signals } = stage1Boundary(prev, cur, now);

  // Fase 2/3 — Stage-2 embedding drift + Stage-3 qwen arbiter, ONLY in the grey
  // zone, ONLY when opt-in, best-effort. Stage 2 catches a semantic pivot Stage 1
  // missed; Stage 3 arbitrates the BORDERLINE (same vocabulary, new intent). Tests
  // inject cur.embedding / cur.arbiterVerdict to avoid live Ollama.
  let driftState = (prev && prev.drift) || null;
  let topicAnchor = (prev && prev.topic_anchor) || null;
  let driftInfo = null;
  let driftFired = false;
  if (cur.embedEnabled && score >= GREY_LOW && score < STRONG) {
    try {
      const drift = require('./compaction-drift.js');
      const emb = Array.isArray(cur.embedding) ? cur.embedding : drift.embedText(cur.prompt);
      driftInfo = drift.stage2Drift(driftState, emb, { percentile: cur.driftPercentile });
      driftState = driftInfo.state;
      driftFired = driftInfo.fired;
      // Stage 3 — arbiter ONLY when the drift is borderline + opt-in (rare tie-break).
      if (cur.arbiterEnabled && topicAnchor && drift.needsArbiter(driftInfo.drift, driftInfo.threshold)) {
        const verdict = cur.arbiterVerdict || drift.arbitrate(topicAnchor, cur.prompt, { model: cur.arbiterModel });
        if (verdict === 'NEW') { driftFired = true; signals = signals.concat('arbiter_new'); }
        else if (verdict === 'SAME') { driftFired = false; }
      }
      if (driftFired) {
        score = Math.max(score, STRONG);
        if (!signals.includes('embedding_drift') && !signals.includes('arbiter_new')) {
          signals = signals.filter((s) => s !== 'continuous').concat('embedding_drift');
        }
      }
    } catch { /* best-effort; drift is optional */ }
  }

  const pressure = pressureLadder(cur.tokenPct);
  // Fase 3 — derive cache temperature from the last turn's ts (caller may override).
  const cacheCold = cur.cacheCold || (prev ? cacheState(prev.ts, now) : 'unknown');
  const decision = compactionDecision({ boundary: score, pressure, cacheCold, risk_level: cur.risk_level });
  const turns = (prev && Number(prev.turns) || 0) + 1;

  // Topic anchor (Stage-3 input): sanitized seed of the current topic — reset on a
  // fired boundary (topic changed) or seeded when absent. Only kept when arbiter on.
  if (cur.arbiterEnabled && (score >= STRONG || !topicAnchor)) {
    let t = String(cur.prompt || '').slice(0, 300);
    try { const { sanitize } = require('./privacy.js'); t = sanitize(t) || t; } catch { /* best-effort */ }
    topicAnchor = t.slice(0, 300);
  }

  writeState(sessionId, {
    category: cur.category || (prev && prev.category) || null,
    cwd: cur.cwd || (prev && prev.cwd) || null,
    turns,
    last_event: commitTestPRSignal(cur.prompt) ? 'commit_test_pr' : (prev && prev.last_event) || null,
    last_decision: decision,
    drift: driftState,
    topic_anchor: topicAnchor,
  }, now);
  return {
    decision, boundary: score, signals, pressure, cacheCold, turns,
    drift: driftInfo && { fired: driftFired, drift: driftInfo.drift, threshold: driftInfo.threshold },
  };
}

module.exports = {
  pressureLadder, commitTestPRSignal, stage1Boundary, compactionDecision, cacheState, buildSnapshot,
  readState, writeState, advise, STRONG, GAP_MS, CACHE_TTL_MS,
};
