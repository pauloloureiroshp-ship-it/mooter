'use strict';

// guardian-prebake.js — 🐮🛡️ Moo Context Guardian · Fase 2 (the heart of the vision).
//
// WHAT / WHY
//   While a Claude Code session fills its context window, a LOCAL moo ($0, idle GPU)
//   keeps a ready-to-paste handoff fresh in `_handoff/guardian/<sid>.md`, so the jump
//   to a fresh session (F3) is instant and clean. We REUSE the existing handoff
//   generator — the same `generateHandoff` / `composeHandoff` the ⇄ Handoff button
//   runs — we do NOT reinvent generation.
//
// HONESTY MANDATE
//   • This is $0 maintenance work on the idle GPU. It is NEVER counted as "time
//     recovered" (that would be a fabricated metric). It only keeps a file fresh.
//   • It NEVER runs on the session's critical path: the cockpit calls tickPrebake()
//     fire-and-forget, off the render path, debounced.
//   • The pre-baked text comes from the SAME generator + the SAME opts as the manual
//     button, so it is byte-comparable to the manual handoff (the deterministic
//     skeleton is byte-identical; the optional local narrative is the same $0 path).
//
// BOUNDARY / PRESSURE CONTRACT (F1 — `tools/router/compaction-advisor.js`)
//   pressureLadder(ctxPct) → 'monitor'|'mask'|'prune'|'advise'|'emergency'
//   stage1Boundary(prev, cur, now) → { score:number, signals:string[] }
//   F1 builds in parallel; we import it DEFENSIVELY (try/catch → a fallback ladder
//   that mirrors the documented rungs) so this file builds and tests before F1 merges.
//
// TESTABILITY
//   Everything external (advisor, the handoff generator, git/vault/journal reads, fs,
//   the output dir, the clock, the per-session store) is INJECTED via `deps`. The
//   headless test (`guardian-prebake.test.js`) drives it with stubs — no GPU, no
//   vscode, no real Ollama.

const fs = require('fs');
const path = require('path');

// ── F1 advisor: fallback that mirrors the documented contract verbatim ───────────
// Kept in lock-step with compaction-advisor.js (rungs 80/85/90/99; STRONG = 0.5;
// weighted vote over commit/test/PR · category · focus · idle-gap). Used only until
// F1 lands the real module on `tools/router/`.
const _STRONG = 0.5;            // boundary >= this ⇒ a strong, causal boundary (== advisor STRONG)
const _GAP_MS = 10 * 60 * 1000; // 10 min idle ⇒ user-away boundary
const _EVENT_RE = /\b(?:git\s+)?commit(?:ted)?\b|\bpushed?\b|\bmerged?\b|\bpull\s*request\b|\bPR\b|\btests?\s+(?:pass|passed|passing|green)\b|\ball\s+green\b|\bfiz\s+commit\b|\btestes?\s+(?:passa|passaram|verdes?)\b/i;

const _FALLBACK_ADVISOR = {
  pressureLadder(tokenPct) {
    const p = Number(tokenPct);
    if (!Number.isFinite(p)) return 'monitor';
    if (p >= 99) return 'emergency';
    if (p >= 90) return 'advise';
    if (p >= 85) return 'prune';
    if (p >= 80) return 'mask';
    return 'monitor';
  },
  stage1Boundary(prev, cur, now) {
    const signals = [];
    if (!prev || !cur) return { score: 0, signals: ['no_prior_state'] };
    let score = 0;
    if (_EVENT_RE.test(String(cur.prompt || ''))) { score += 0.5; signals.push('commit_test_pr'); }
    const a = String(prev.category || ''), b = String(cur.category || '');
    if (a && b && a !== b) { score += 0.4; signals.push('category:' + a + '→' + b); }
    const fa = String(prev.cwd || ''), fb = String(cur.cwd || '');
    if (fa && fb && fa !== fb) { score += 0.3; signals.push('focus_change'); }
    const t0 = Number(prev.ts), t1 = Number(now);
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 - t0 > _GAP_MS) { score += 0.3; signals.push('user_away_gap'); }
    if (!signals.length) signals.push('continuous');
    return { score: Math.min(1, Number(score.toFixed(3))), signals };
  },
};

// Load the real F1 advisor when present (after F1 merges + F2 rebases on it); else fall back.
function _loadAdvisor() {
  try {
    const a = require('../../../tools/router/compaction-advisor.js');
    if (a && typeof a.pressureLadder === 'function' && typeof a.stage1Boundary === 'function') return a;
  } catch { /* not merged yet → fallback below */ }
  return _FALLBACK_ADVISOR;
}

// ── tunables ─────────────────────────────────────────────────────────────────────
const MIN_INTERVAL_MS = 5 * 60 * 1000;                       // refresh at least this often even with no boundary
const RUNGS_PREBAKE = new Set(['prune', 'advise', 'emergency']); // only ≥85% ctx is pre-baked (gate a)
const HANDOFF_FULL_TURNS = 12;                               // mirrors host-extra (mode by session size)

// Per-session state + in-flight guard (module defaults; tests inject their own).
const _STATE = new Map();     // sid → { prev, lastWriteTs, lastText }
const _INFLIGHT = new Set();  // sids currently baking (guards overlapping fire-and-forget ticks)
let _seq = 0;                 // tmp-file disambiguator (no Math.random needed)

function _nowMs(nowOpt) {
  if (nowOpt instanceof Date) return nowOpt.getTime();
  if (typeof nowOpt === 'number' && Number.isFinite(nowOpt)) return nowOpt;
  return Date.now();
}

function _safeSid(sid) { return String(sid).replace(/[^a-zA-Z0-9._-]/g, ''); }

function _defaultDir() {
  // <repo>/_handoff/guardian — src → vscode-extension → packages → repo root.
  return path.resolve(__dirname, '..', '..', '..', '_handoff', 'guardian');
}

// ctx% from an already-resolved field, or derived from token count + window (mirrors
// mc-snapshot.ctxPct: [1m] models → 1M window, else 200k). null when we have no count.
function ctxPctOf(row) {
  if (!row) return null;
  if (typeof row.ctxPct === 'number') return row.ctxPct;
  const t = Number(row.ctxTokens);
  if (!Number.isFinite(t)) return null;
  const win = /\[1m\]|\b1m\b/.test(String(row.model || '').toLowerCase()) ? 1000000 : 200000;
  return Math.max(0, Math.min(100, Math.round((t / win) * 100)));
}

// The session-state snapshot fed to stage1Boundary. Uses only fields recentSessions()
// already resolved (cheap, no extra git/IO per tick). headSha = the session's OWN
// journal HEAD (sessionGit.sha) — a commit landing there is the strongest, cheapest
// causal boundary; stage1Boundary only sees it via prompt language, so we also check
// the sha delta explicitly in _decide().
function _curFromRow(row, nowMs) {
  const pending = row.pending || {};
  const sg = row.sessionGit || {};
  return {
    category: row.category || null,
    cwd: row.cwd || null,
    prompt: String(pending.lastAssistantText || row.name || ''),
    headSha: sg.sha || (row.gitStage && row.gitStage.sha) || null,
    turns: Number(row.turns) || 0,
    ts: nowMs,
  };
}

// Decide whether to (re)generate. Regenerate on: first sight · a strong semantic
// boundary (stage1Boundary ≥ STRONG) · a HEAD-sha change (commit) · the min-interval
// catch-all. Otherwise hold. NOTE: the temporal-gap signal is turn-oriented and rarely
// fires at the cockpit tick cadence (prev.ts refreshes each tick); HEAD/category/focus
// deltas + the interval are the effective triggers here.
function _decide(prev, cur, nowMs, lastWriteTs, advisor, minIntervalMs) {
  if (!prev) return { regen: true, reason: 'first', signals: ['first'] };
  let boundary = null;
  try { boundary = advisor.stage1Boundary(prev, cur, nowMs); } catch { boundary = null; }
  if (boundary && Number(boundary.score) >= _STRONG) return { regen: true, reason: 'boundary', signals: boundary.signals || [] };
  if (cur.headSha && prev.headSha && cur.headSha !== prev.headSha) return { regen: true, reason: 'head_changed', signals: ['head_changed'] };
  if (Number.isFinite(lastWriteTs) && (nowMs - lastWriteTs) >= minIntervalMs) return { regen: true, reason: 'interval', signals: ['interval'] };
  return { regen: false, reason: 'hold', signals: (boundary && boundary.signals) || [] };
}

// Build the EXACT opts the ⇄ Handoff handler builds (v3 facts: snapshot, vault
// freshness, journal delta + mode by session size). Pure given the injected readers,
// so the test can reproduce it and assert byte-equality with generateHandoff. (gate d)
function buildHandoffOpts(row, deps) {
  deps = deps || {};
  const recent = deps.recent || [];
  const opts = { mode: (Number(row && row.turns) || 0) >= HANDOFF_FULL_TURNS ? 'full' : 'quick', recent };
  if (deps.gitSnapshot) { try { opts.snapshot = deps.gitSnapshot(row.cwd, { recent, branch: row.branch, pr: row.pr }); } catch { /* best-effort */ } }
  if (deps.vaultFreshness) { try { opts.vaultMtime = deps.vaultFreshness(); } catch { /* best-effort */ } }
  let deltaTurns = null;
  if (deps.readJournalLast) { try { const jl = deps.readJournalLast(row.fullId); if (jl && Number.isFinite(jl.n_turn)) deltaTurns = jl.n_turn; } catch { /* best-effort */ } }
  opts.deltaTurns = deltaTurns;
  if (deps.now !== undefined) opts.now = deps.now; // fixed clock for tests; undefined → live time in prod
  return opts;
}

// Atomic write: tmp + rename (never leaves a half-written `<sid>.md` for F3 to read). (gate c)
function _atomicWrite(fsImpl, file, text) {
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid + '-' + (_seq++);
  fsImpl.writeFileSync(tmp, text, 'utf8');
  fsImpl.renameSync(tmp, file);
}

// Produce the handoff text via the SAME generator the manual button uses. Prefer the
// $0 LOCAL narrative (composeHandoff: the rolling summary or a bounded on-demand
// Ollama call — its text IS generateHandoff(...) underneath) and fall back to the
// deterministic skeleton on any failure. Never throws.
async function _bake(row, deps) {
  const pending = row.pending || (deps.extractPending ? deps.extractPending([]) : {});
  const opts = buildHandoffOpts(row, deps);
  if (deps.composeHandoff) {
    try {
      const c = await deps.composeHandoff(row, pending, Object.assign({ deadlineMs: 8000, doingMs: 7000, recapMs: 7500 }, opts));
      if (c && c.text) return c.text;
    } catch { /* Ollama down/slow → fall through to the deterministic skeleton */ }
  }
  return deps.generateHandoff(row, pending, opts);
}

/**
 * One pre-bake tick over the session rows. For each session at pressure ≥ prune, if a
 * semantic boundary fired (or the min interval elapsed), (re)generate the handoff via
 * the existing generator and write it atomically to `<baseDir>/<sid>.md`. Off the
 * critical path; fire-and-forget; never throws (per-session failures are captured in
 * the returned report). Returns [{ sid, rung, baked, reason, file?, signals? }].
 *
 * deps:
 *   advisor          { pressureLadder, stage1Boundary }  (default: F1 module or fallback)
 *   generateHandoff  (row, pending, opts) → string       REQUIRED
 *   composeHandoff   async (row, pending, opts) → { text, model }   optional ($0 local narrative)
 *   gitSnapshot/vaultFreshness/readJournalLast/extractPending       optional readers (host-extra)
 *   recent           session rows passed through to the generator (snapshot context)
 *   fs               { mkdirSync, writeFileSync, renameSync }       (default: node:fs)
 *   baseDir          output dir (default: <repo>/_handoff/guardian)
 *   now              Date|ms fixed clock (default: live)
 *   minIntervalMs    catch-all refresh interval (default: 5 min)
 *   store / inflight injectable Map / Set for isolated tests
 */
async function tickPrebake(sessions, deps) {
  deps = deps || {};
  const advisor = deps.advisor || _loadAdvisor();
  const fsImpl = deps.fs || fs;
  const nowMs = _nowMs(deps.now);
  const store = deps.store || _STATE;
  const inflight = deps.inflight || _INFLIGHT;
  const baseDir = deps.baseDir || _defaultDir();
  const minInterval = Number.isFinite(deps.minIntervalMs) ? deps.minIntervalMs : MIN_INTERVAL_MS;
  const rows = Array.isArray(sessions) ? sessions : [];
  const report = [];

  for (const row of rows) {
    const sid = row && (row.fullId || row.id);
    try {
      if (!sid) continue;
      const rung = advisor.pressureLadder(ctxPctOf(row));
      if (!RUNGS_PREBAKE.has(rung)) continue; // gate (a): only sessions ≥ prune are ever pre-baked
      const cur = _curFromRow(row, nowMs);
      const st = store.get(sid) || { prev: null, lastWriteTs: null, lastText: null };
      const decision = _decide(st.prev, cur, nowMs, st.lastWriteTs, advisor, minInterval);

      if (!decision.regen) { // gate (b): hold — advance prev so the next delta is measured, no write
        store.set(sid, { prev: cur, lastWriteTs: st.lastWriteTs, lastText: st.lastText });
        report.push({ sid, rung, baked: false, reason: decision.reason });
        continue;
      }
      if (inflight.has(sid)) { report.push({ sid, rung, baked: false, reason: 'inflight' }); continue; }
      inflight.add(sid);
      let text;
      try { text = await _bake(row, deps); }
      finally { inflight.delete(sid); }
      if (!text) { report.push({ sid, rung, baked: false, reason: 'empty' }); continue; }

      if (text === st.lastText) { // identical content → skip the write, keep it fresh
        store.set(sid, { prev: cur, lastWriteTs: nowMs, lastText: text });
        report.push({ sid, rung, baked: false, reason: 'unchanged' });
        continue;
      }
      const file = path.join(baseDir, _safeSid(sid) + '.md');
      _atomicWrite(fsImpl, file, text); // gate (c)
      store.set(sid, { prev: cur, lastWriteTs: nowMs, lastText: text });
      report.push({ sid, rung, baked: true, reason: decision.reason, file, signals: decision.signals });
    } catch (e) {
      report.push({ sid, baked: false, error: String((e && e.message) || e) });
    }
  }
  return report;
}

function _resetState() { _STATE.clear(); _INFLIGHT.clear(); }

module.exports = {
  tickPrebake, buildHandoffOpts, ctxPctOf,
  _FALLBACK_ADVISOR, _loadAdvisor, _decide, _curFromRow, _atomicWrite, _safeSid, _defaultDir, _resetState,
  MIN_INTERVAL_MS, RUNGS_PREBAKE,
};
