#!/usr/bin/env node
/**
 * statusline-multi.js — narrative statusline for the Mooter router.
 *
 * Design philosophy: a statusline is read in 200ms. We pick a SINGLE
 * primary state (🟢 / 🟡 / 🔴) with one short sentence the operator can
 * act on, then surface two compact proofs after the separator. The old
 * "8 metrics on one line" mode caused visual noise — that file is now
 * statusline.sh; this one tells a story.
 *
 *   🟢 mooter saved $0.27 today (89%)        │ T2 0.84 · 42% 5h · 27t
 *   🟡 8% saved — beast forcing T3 trivially │ T3 0.95 · 76% 5h · 12t
 *   🔴 Anthropic 92% used — falling to Codex │ T2 codex · 41 left · 18t
 *   ⚪ no data yet — make a request          │ —
 *
 * Data sources:
 *   - decisions.log     (last 256KB, classified events only, today's UTC date)
 *   - quota-state.json  (anthropic + codex 5h windows, today's cost)
 *   - http://127.0.0.1:7821/metrics  (savings-tracker, optional)
 *
 * Wiring (manual — never auto-applied):
 *   { "type": "command", "command": "node ~/.claude/tools/router/statusline-multi.js" }
 *
 * Performance: tail-reads the log so it stays sub-50ms even at tens of MB.
 * Pure Node built-ins. No deps.
 *
 * Flags:
 *   --mock                  render synthetic green/yellow/red rotation
 *   --demo green|yellow|red render a specific state for screenshots
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');

// ── Locator (resolves to runtime ROUTER_DIR; falls back to ~/.claude/) ──
const { ROUTER_DIR, DECISIONS_LOG } = (() => {
  try { return require('./paths'); }
  catch {
    const home = require('os').homedir();
    const dir  = path.join(home, '.claude', 'tools', 'router');
    return { ROUTER_DIR: dir, DECISIONS_LOG: path.join(dir, 'decisions.log') };
  }
})();

const QUOTA_PATH    = path.join(ROUTER_DIR, 'quota-state.json');
const TAIL_BYTES    = 256 * 1024;
const TRACKER_URL   = 'http://127.0.0.1:7821/metrics';
const TRACKER_TIMEOUT_MS = 250;
const RECENT_WINDOW = 10; // last N decisions for drift / beast-overkill detection

// Wave 2 Day 2 — last decision sidecar (written by the Pastor hook in Day 4).
// Until that writer ships, read returns null and the pack chip is silent.
const LAST_DECISION_PATH = path.join(require('os').homedir(), '.mooter', 'last-decision.json');

// ── Health thresholds (single place to tune) ────────────────────────────
const TH = {
  ANTH_RED:        15,  // % remaining → red
  ANTH_YELLOW:     30,  // % remaining → yellow
  CODEX_LOW:       20,  // % remaining → "falling to" copy
  SAVINGS_YELLOW:  30,  // saved% below this → yellow
  CONFIDENCE_LOW:  0.5, // avg confidence of last 3 → red drift
  CONFIDENCE_WARN: 0.60, // single decision below this → ⚠ in-line marker (Wave 49)
  BEAST_OVERKILL_PCT: 40, // % of last 10 turns where beast forced T3 over a T0/T1 baseline
  ZEN_UNDERKILL_PCT:  40, // % of last 10 turns where zen capped T1 on a complex task
  ZEN_COMPLEXITY_HI:  0.5, // prompt_complexity_score above which zen-cap is wasteful
};

// ────────────────────────────────────────────────────────────────────────
// Data layer
// ────────────────────────────────────────────────────────────────────────

function readQuota() {
  try { return JSON.parse(fs.readFileSync(QUOTA_PATH, 'utf8')); }
  catch { return null; }
}

/**
 * Read the JSON blob Claude Code pipes to a statusline command on stdin.
 * Returns null when stdin is a TTY (manual run) or the payload isn't JSON.
 * Wave 2.5 Day 1 — source of session_id and context-window usage.
 */
function readStdinJson() {
  if (process.stdin.isTTY) return null;
  try {
    const data = fs.readFileSync(0, 'utf8');       // fd 0 = stdin
    if (!data.trim()) return null;
    return JSON.parse(data);
  } catch {
    return null;                                    // not JSON / no stdin
  }
}

/** Coerce a context-usage value to an integer 0..100, or null if unusable. */
function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function readDecisionsTail() {
  let fd;
  try { fd = fs.openSync(DECISIONS_LOG, 'r'); }
  catch { return []; }
  try {
    const stat = fs.fstatSync(fd);
    const len  = Math.min(TAIL_BYTES, stat.size);
    const buf  = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, stat.size - len);
    const text = buf.toString('utf8');
    const nl   = text.indexOf('\n');
    return text.slice(nl + 1).split('\n').filter(Boolean);
  } finally { fs.closeSync(fd); }
}

/**
 * Read the last pack decision written by the Pastor hook. Returns null when
 * the file is missing or malformed — that is the steady state until the
 * Wave 2 Day 4 writer lands.
 *
 * Shape: { pack_id: string, candidates?: string[], ts?: string }
 */
function readLastDecision() {
  try {
    const raw = fs.readFileSync(LAST_DECISION_PATH, 'utf8');
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.pack_id !== 'string') return null;
    return {
      pack_id: obj.pack_id,
      candidates: Array.isArray(obj.candidates) ? obj.candidates.filter((c) => typeof c === 'string') : null,
    };
  } catch {
    return null;
  }
}

/**
 * Adapter status for the 1-line / compact view. Wave 16-18 Day 2 (B2): read the
 * real adapter state via adapter_selection.getActiveAdapter() — the same source
 * the 2-line view already uses. Returns idle when no verified adapter is active
 * (no ~/.mooter/preferences.json, signature invalid, or missing .gguf).
 */
function getAdapterStatus() {
  try {
    const { getActiveAdapter } = require('./adapter_selection.js');
    const active = getActiveAdapter();
    if (active) return { status: 'loaded', id: active.id ?? active.name ?? null };
  } catch { /* fall through to idle */ }
  return { status: 'idle', id: null };
}

/**
 * Best-effort GET with hard timeout. Returns null on any failure.
 * Wave 2.5 Day 1 — when `sessionFilter` is set, scopes the request to a single
 * Claude Code session so saved/turn/alltime reflect this terminal only.
 */
function readSavingsSync(sessionFilter) {
  const url = sessionFilter
    ? `${TRACKER_URL}?session_id=${encodeURIComponent(sessionFilter)}`
    : TRACKER_URL;
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: TRACKER_TIMEOUT_MS }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ────────────────────────────────────────────────────────────────────────
// Aggregation
// ────────────────────────────────────────────────────────────────────────

function isToday(isoTs) {
  if (!isoTs) return false;
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() &&
         d.getUTCMonth()    === now.getUTCMonth() &&
         d.getUTCDate()     === now.getUTCDate();
}

/**
 * Walks the tail and returns:
 *   counts:   per-tier counts among today's classified events
 *   total:    sum of counts
 *   last:     the most-recent classified event (or null)
 *   recent:   the last RECENT_WINDOW classified events (newest first)
 *
 * Wave 2.5 Day 1 — per-terminal isolation: when `sessionFilter` is set, events
 * tagged with a *different* session_id are skipped so each terminal sees only
 * its own activity. Legacy events with no session_id always count (backward
 * compat); MOOTER_STATUSLINE_VIEW=all disables the filter (debug/global view).
 */
function digest(lines, options = {}) {
  const sessionFilter = options.sessionFilter || null;
  const counts = { T0: 0, T1: 0, T2: 0, T3: 0, codex: 0 };
  let total = 0;
  /** @type {any[]} */
  const recent = [];
  let last = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    let evt;
    try { evt = JSON.parse(lines[i]); } catch { continue; }
    if (!evt || evt.event !== 'classified') continue;
    if (evt.source === 'mooter-tester') continue;
    // Per-session scope: skip other terminals' events, but never drop legacy
    // events that pre-date session tagging (evt.session_id absent/unknown).
    if (sessionFilter && evt.session_id && evt.session_id !== 'unknown'
        && evt.session_id !== sessionFilter) continue;

    if (!last) last = evt;
    if (recent.length < RECENT_WINDOW) recent.push(evt);

    if (!isToday(evt.ts)) continue;

    const providers = Array.isArray(evt.suggested_providers) ? evt.suggested_providers : [];
    if (providers[0] === 'codex_cli') counts.codex += 1;
    else if (evt.tier && counts[evt.tier] !== undefined) counts[evt.tier] += 1;
    else continue;
    total += 1;
  }
  return { counts, total, last, recent };
}

function computeAnthropicRem(quota) {
  const a = quota && quota.providers && quota.providers.anthropic;
  if (!a || !a.window_5h) return null;
  const w = a.window_5h;
  if (!w.limit) return 100;
  return Math.max(0, Math.min(100, Math.round((1 - w.tokens_used / w.limit) * 100)));
}

function computeCodexRem(quota) {
  const c = quota && quota.providers && quota.providers.openai_codex_cli;
  if (!c || !c.window_5h) return null;
  if (c.exhausted) return 0;
  const w = c.window_5h;
  if (!w.limit) return 100;
  return Math.max(0, Math.min(100, Math.round((1 - w.messages_used / w.limit) * 100)));
}

function computeCodexMessagesLeft(quota) {
  const c = quota && quota.providers && quota.providers.openai_codex_cli;
  if (!c || !c.window_5h) return null;
  if (c.exhausted) return 0;
  return Math.max(0, c.window_5h.limit - (c.window_5h.messages_used || 0));
}

function avgConfidence(events) {
  const xs = events
    .map((e) => Number(e && e.confidence))
    .filter((n) => Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function beastOverkillPct(events) {
  if (!events.length) return 0;
  const forced = events.filter((e) =>
    e && (
      e.escalation_rule === 'beast_intent_force_t3' ||
      e.escalation_rule === 'beast_mode' ||
      e.active_mode === 'beast'
    ) && (e.tier === 'T3') && (
      // The classifier had a small/cheap intent before beast pulled it up.
      typeof e.prompt_complexity_score === 'number' && e.prompt_complexity_score < 0.05
    )
  );
  return Math.round((forced.length / events.length) * 100);
}

// Symmetric to beastOverkillPct — surfaces when LazyMoo (zen mode) is capping
// a high-complexity task to T1, where the user is likely to feel the quality
// drop. Threshold mirrors the beast detector; tuned in TH.
function zenUnderkillPct(events) {
  if (!events.length) return 0;
  const capped = events.filter((e) =>
    e && (
      e.escalation_rule === 'zen_mode' ||
      e.active_mode === 'zen'
    ) && (e.tier === 'T0' || e.tier === 'T1') && (
      typeof e.prompt_complexity_score === 'number' &&
      e.prompt_complexity_score > TH.ZEN_COMPLEXITY_HI
    )
  );
  return Math.round((capped.length / events.length) * 100);
}

// ────────────────────────────────────────────────────────────────────────
// State picker — produces { color, headline, proof }
// ────────────────────────────────────────────────────────────────────────

/**
 * @param {Object} ctx
 * @returns {{ color: 'green'|'yellow'|'red'|'empty', headline: string, proof: string }}
 */
function pickState(ctx) {
  const {
    total, last, recent, anthRem, codexRem, codexLeft,
    savedPct, savedUsd, todayCost, dataMissing,
    ctxPercent, lastTurnCost, alltimeCost,
  } = ctx;

  // ── Setup incomplete (no decisions, no quota — fresh install) ─────────
  // Wave 2 Day 2: was a generic "no data yet" empty state; now surfaces the
  // concrete next step so a clean WSL install knows what to run.
  if (dataMissing && total === 0) {
    return {
      color:    'setup',
      headline: 'mooter setup incomplete — run /mooter init',
      proof:    '—',
    };
  }

  // ── Confidence / drift signal ─────────────────────────────────────────
  const last3 = recent.slice(0, 3);
  const conf3 = avgConfidence(last3);

  // ── Last-decision label (T-tier · provider-short · confidence) ────────
  // For legacy events that pre-date suggested_providers, infer the label
  // from tier alone so we never print redundancies like "T0 t0".
  const TIER_DEFAULT_TAG = { T0: 'local', T1: 'haiku', T2: 'sonnet', T3: 'opus' };
  let lastLabel = '—';
  if (last) {
    const tier = last.tier || 'T?';
    const conf = Number.isFinite(last.confidence) ? last.confidence.toFixed(2) : '?';
    const provider0 = (Array.isArray(last.suggested_providers) && last.suggested_providers[0]) || null;
    const explicit = provider0 === 'codex_cli'  ? 'codex' :
                     provider0 === 'openai_api' ? 'oai' :
                     provider0 === 'opus'       ? 'opus' :
                     provider0 === 'sonnet'     ? 'sonnet' :
                     provider0 === 'haiku'      ? 'haiku' :
                     provider0 === 'ollama'     ? 'local' : null;
    // Wave 33.8 Block F (Opção B) — show the EXACT routed model, not just "opus".
    // `recommended_model` (logged per decision, e.g. "claude-opus-4-6") collapses
    // the 4-tier macro's hidden variability Paulo flagged (Q11): "opus" → "opus-4.6".
    // Cloud tiers only — T0 stays "local" by definition (and byte-identical, so the
    // pre-Block-F test fixtures with no recommended_model are unaffected).
    const modelTag = tier !== 'T0' ? shortModelTag(last.recommended_model) : null;
    const tag = modelTag || explicit || TIER_DEFAULT_TAG[tier] || tier.toLowerCase();
    // Wave 12 PR-I — T0 is local by definition, so "T0 local" is redundant; drop
    // the tag there. Confidence gets a "conf" qualifier so the bare number reads
    // as what it is rather than as noise.
    // Wave 49 (Phase 1, Anthropic-aligned honesty) — a single low-confidence route
    // (<0.60) is marked ⚠ so the operator sees the uncertainty in-line and can pin
    // a tier or verify, rather than only learning about it once three-in-a-row trip
    // the red "router miscalibrated" headline. Honest metacognition, not noise: the
    // marker is omitted whenever confidence is healthy or unknown.
    const lowConf = Number.isFinite(last.confidence) && last.confidence < TH.CONFIDENCE_WARN;
    const confTok = lowConf ? `⚠ conf ${conf}` : `conf ${conf}`;
    lastLabel = (tier === 'T0' && tag === 'local')
      ? `${tier} · ${confTok}`
      : `${tier} ${tag} · ${confTok}`;
    // Wave 22 (22.C) — append the real-execution segment (⚠ on divergence) when the
    // last delegated subagent ran on a different tier than it was routed to.
    lastLabel += buildExecSegment(ctx.sessionId);
  }

  // ── Proof chips (Wave 2.5 Day 1) ──────────────────────────────────────
  // New operational chips: ctx % · Anthropic 5h % · this-turn cost · cumulative
  // cost. `proofChips` is the label-free form used by the GREEN headline (which
  // already carries the tier badge); `proof` prepends the tier label and is the
  // default for every warning state, so a warning never costs the operator
  // sight of the last decision.
  const proofParts = [];
  if (typeof ctxPercent === 'number') proofParts.push(`ctx ${ctxPercent}%`);
  // Wave 16-18 Day 2 B1 — "est" marks this as a LOCAL estimate (computeAnthropicRem
  // from quota-state.json, 0 network calls), not Anthropic's authoritative quota.
  if (typeof anthRem === 'number') proofParts.push(`${anthRem}% 5h est`);
  if (typeof lastTurnCost === 'number') proofParts.push(`$${lastTurnCost.toFixed(2)} this turn`);
  // Wave 48 (1.6) — `alltimeCost` is all-time spend; was mislabeled "session $".
  if (typeof alltimeCost === 'number') proofParts.push(`$${alltimeCost.toFixed(2)} all-time`);
  const proofChips = proofParts.join(' · ') || '—';
  const proof = (lastLabel !== '—')
    ? [lastLabel, ...proofParts].join(' · ')
    : proofChips;

  // ── RED: Anthropic critically low → forced fallback ───────────────────
  if (typeof anthRem === 'number' && anthRem < TH.ANTH_RED) {
    const codexNote = (typeof codexRem === 'number' && codexRem > TH.CODEX_LOW)
      ? `falling to Codex (${codexRem}%)`
      : 'no fallback ready';
    return {
      color:    'red',
      headline: `Anthropic ${anthRem}% used — ${codexNote}`,
      proof:    typeof codexLeft === 'number'
                ? `T? · ${codexLeft} Codex msgs left · ${total}t`
                : proof,
    };
  }

  // ── RED: router miscalibrated → confidence collapse ───────────────────
  if (last3.length >= 3 && typeof conf3 === 'number' && conf3 < TH.CONFIDENCE_LOW) {
    return {
      color:    'red',
      headline: `router miscalibrated — last 3 conf avg ${conf3.toFixed(2)}`,
      proof,
    };
  }

  // ── YELLOW: severe routing drift vs lifetime baseline ─────────────────
  // Picked up here (above mode-mix yellows) because severe drift means the
  // tuning has decayed, which a beast/zen warning would mask.
  const drift = ctx.drift;
  if (drift && drift.drift && drift.severity === 'severe') {
    return {
      color:    'yellow',
      headline: `routing drift — ${drift.tier} ${drift.actual}% vs ${drift.expected}% baseline`,
      proof,
    };
  }

  // ── YELLOW: beast overkill on trivials ────────────────────────────────
  if (recent.length >= 5) {
    const overkill = beastOverkillPct(recent);
    if (overkill >= TH.BEAST_OVERKILL_PCT) {
      return {
        color:    'yellow',
        headline: `${overkill}% of last 10 turns forced T3 on trivials`,
        proof,
      };
    }
  }

  // ── YELLOW: zen underkill on complex tasks ────────────────────────────
  if (recent.length >= 5) {
    const underkill = zenUnderkillPct(recent);
    if (underkill >= TH.ZEN_UNDERKILL_PCT) {
      return {
        color:    'yellow',
        headline: `${underkill}% of last 10 turns zen-capped on complex tasks`,
        proof,
      };
    }
  }

  // ── YELLOW: Anthropic budget approaching cap ──────────────────────────
  if (typeof anthRem === 'number' && anthRem < TH.ANTH_YELLOW) {
    return {
      color:    'yellow',
      headline: `Anthropic ${anthRem}% remaining — pace yourself`,
      proof,
    };
  }

  // ── YELLOW: low savings (mooter not earning its keep) ─────────────────
  if (typeof savedPct === 'number' && total >= 5 && savedPct < TH.SAVINGS_YELLOW) {
    return {
      color:    'yellow',
      headline: `only ${Math.round(savedPct)}% saved all-time·local — check tier mix`,
      proof,
    };
  }

  // ── YELLOW: mild routing drift (informational, lowest priority) ───────
  if (drift && drift.drift && drift.severity === 'mild') {
    return {
      color:    'yellow',
      headline: `mild drift on ${drift.tier} (Δ ${drift.deltaPct} pp vs baseline)`,
      proof,
    };
  }

  // ── GREEN: default healthy state ──────────────────────────────────────
  // Wave 2.5 Day 1: the tier badge (T2 sonnet 0.84) moves inline into the
  // headline; the proof slot carries the operational chips instead.
  if (typeof savedUsd === 'number' && typeof savedPct === 'number') {
    // Wave 12 PR-I — 🐮 already brands the line, so the word "mooter" is dropped.
    // Wave 16-18 Day 2 (B3): "all-time" — verified that savedUsd = metrics.saved
    // is cumulative over the whole decisions.log (savings-tracker readDecisions +
    // computeMetrics apply NO date filter), so the old "today" label was wrong.
    // "vs all-Opus" names the baseline the savings % is measured against.
    // Wave 33.8 Block H — qualify it "·local": this is THIS MACHINE's decisions.log,
    // not the user's cross-device total. That total lives on the hub/dashboard, so a
    // fresh box reading "$0.00 all-time·local" next to the landing's "$25.95" is no
    // longer a phantom bug — it's two honestly-scoped numbers (see Block A reconcile).
    const headline = `saved $${savedUsd.toFixed(2)} all-time·local (${Math.round(savedPct)}% vs all-Opus)`;
    return { color: 'green', headline, proof: proofChips, lastLabel };
  }

  // ── GREEN fallback: tracker down but data present ─────────────────────
  return {
    color:    'green',
    headline: `routing healthy — $${todayCost.toFixed(2)} spent`,
    proof,
  };
}

// Wave 2.5 Day 1 — brand-identity glyphs. 🐮 (Paulo: "emoji vaquinha, não
// bolinha verde") for healthy, 🐂 (the heavier ox) for warning to echo the
// CrazyMoo mood metaphor, 🚨 keeps urgency while reading distinct from a plain
// red dot. Setup keeps the wrench.
const COLOR_GLYPH = {
  green:  '🐮',
  yellow: '🐂',
  red:    '🚨',
  setup:  '🛠',
  empty:  '⚪', // legacy — kept for back-compat with consumers; not emitted by pickState.
};

// ────────────────────────────────────────────────────────────────────────
// Render
// ────────────────────────────────────────────────────────────────────────

/**
 * Pure render function — no I/O. Takes a context object and returns the
 * one-line statusline. Used by tests and by the demo modes.
 *
 * Wave 2 Day 2: appends two chips to the proof slot:
 *   · pack: <id>           (skipped for GENERAL; "AMBIGUOUS (a, b)" otherwise)
 *   · adapter: ◌ / ◐ / ●    (Wave 5 placeholder — always idle ◌ today)
 * Setup state suppresses both chips because the user has no router data yet.
 */
function renderFromContext(ctx) {
  const state = pickState(ctx);
  let proof = state.proof;
  // Wave 2.5 Day 1 — compact mode: in a narrow terminal (< 100 cols) drop the
  // secondary pack/adapter chips so the essential headline + cost chips still
  // fit on one line. The COLUMNS env reflects the host terminal width.
  const COMPACT = parseInt(process.env.COLUMNS || '120', 10) < 100;
  if (state.color !== 'setup' && !COMPACT) {
    const chips = proof && proof !== '—' ? [proof] : [];
    if (ctx && ctx.lastPack && typeof ctx.lastPack.pack_id === 'string') {
      const pid = ctx.lastPack.pack_id;
      if (pid === 'AMBIGUOUS' && Array.isArray(ctx.lastPack.candidates) && ctx.lastPack.candidates.length >= 2) {
        chips.push(`pack: AMBIGUOUS (${ctx.lastPack.candidates.slice(0, 2).join(', ')})`);
      } else if (pid !== 'GENERAL' && pid !== 'AMBIGUOUS') {
        chips.push(`pack: ${pid}`);
      }
    }
    if (ctx && ctx.adapter && typeof ctx.adapter.status === 'string') {
      const glyph = ctx.adapter.status === 'loaded'  ? '●' :
                    ctx.adapter.status === 'loading' ? '◐' : '◌';
      chips.push(`adapter: ${glyph}`);
    }
    proof = chips.length ? chips.join(' · ') : '—';
  }
  // Wave 2.5 Day 3 — rotating tier-mix view. Every other 5-tick window the green
  // proof slot shows the last-10 tier distribution instead of the cost chips.
  // Green-only (warnings/setup keep their diagnostic proof) and best-effort so a
  // missing module never blocks the render.
  try {
    if (state.color === 'green' && Array.isArray(ctx.recent) && ctx.recent.length) {
      const { pickView, tierMixLast10 } = require('./tier-mix.js');
      const view = pickView(ctx.recent, ctx.tick || 0);
      if (view === 'B') {
        const ctxChip = typeof ctx.ctxPercent === 'number' ? ` · ctx ${ctx.ctxPercent}%` : '';
        proof = `${tierMixLast10(ctx.recent)}${ctxChip}`;
      } else if (view === 'C') {
        // Wave 2.6 Day 3 — view C: cumulative cost. The full 7d-vs-prev-7d
        // evolution lives in `mooter trail --evolution`; here we surface the
        // real cumulative figures the ctx already carries.
        const parts = [];
        if (typeof ctx.alltimeCost === 'number') parts.push(`$${ctx.alltimeCost.toFixed(2)} all-time`);
        if (typeof ctx.todayCost === 'number') parts.push(`today $${ctx.todayCost.toFixed(2)}`);
        if (parts.length) proof = parts.join(' · ');
      }
    }
  } catch { /* keep default proof */ }
  // Wave 12 PR-I — pickState now exposes the tier label (state.lastLabel)
  // separately from the green headline so the 2-line view can place the sparkline
  // ahead of it. The 1-line view has no sparkline, so fold the tier label back
  // onto the headline here to keep the tier badge visible on narrow terminals.
  const headlineText = (state.color === 'green' && state.lastLabel && state.lastLabel !== '—')
    ? `${state.headline} · ${state.lastLabel}`
    : state.headline;
  // Wave 33 (C.1) — on narrow terminals (< 120 cols) the wide 2-line VRAM chip
  // never shows, so the GPU was invisible. Prepend a breakpoint-sized GPU chip to
  // the proof here. The wide path keeps its full VRAM chip on line 2 (unchanged).
  const narrowCols = parseInt(process.env.COLUMNS || '80', 10);
  const gpuNarrow = narrowCols < TWO_LINE_THRESHOLD ? buildNarrowGpuChip(narrowCols) : null;
  const proofOut = gpuNarrow ? (proof && proof !== '—' ? `${gpuNarrow} · ${proof}` : gpuNarrow) : proof;
  // Wave 13 — trail the live 🐄×N herd chip after the headline/proof.
  return appendHerd(`${COLOR_GLYPH[state.color]} ${headlineText.padEnd(38)} │ ${proofOut}`, ctx);
}

// ────────────────────────────────────────────────────────────────────────
// Wave 2.6 Day 2 — 2-line rich statusline (with truncate-safe 1-line fallback)
// ────────────────────────────────────────────────────────────────────────

const TWO_LINE_THRESHOLD = 120;
const CHIP_MAX = 30;

// Mood glyph for the local Moos / provider, reused across chips.
const PROVIDER_GLYPH = { local: '🏠', haiku: '☁', sonnet: '☁', opus: '☁', codex: '⚡', oai: '⚡' };

// Wave 13 "Show the Herd" — live subagent counter. `N` is the total herd in
// flight (the direct answer to Dynamic Workflows' invisible-16 problem); the
// Stop digest does the local 🐄 vs cloud ☁ breakdown. Shown by default (A.1):
// an empty herd fades to dim so it reads as baseline, not noise.
// Wave 19 (19.B-1) — per-tier ANSI palette + a color gate. Color is ON by
// default (Claude Code renders the statusline with ANSI even though stdout is a
// pipe), but honors NO_COLOR / MOOTER_NO_COLOR / TERM=dumb so plain-text
// terminals and tests fall back to bare text.
const ANSI = { reset: '\x1b[0m', green: '\x1b[32m', blue: '\x1b[34m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m' };
const TIER_COLOR = { T0: ANSI.green, T1: ANSI.blue, T2: ANSI.yellow, T3: ANSI.red };
function useColor() {
  return !process.env.NO_COLOR && !process.env.MOOTER_NO_COLOR && process.env.TERM !== 'dumb';
}
function colorize(code, s, on = useColor()) {
  return on && code ? `${code}${s}${ANSI.reset}` : String(s);
}

const WORKFLOW_CONCURRENCY = 3; // ≥ this many concurrent Moos lights ⚡ workflow mode

/**
 * Wave 19 (19.B-5/6) — always-on herd chip: active / total-spawned / peak.
 * Dim when idle (0 active) so it reads as baseline, not noise. ⚡ workflow mode
 * lights at ≥3 concurrent — the live cue that a Dynamic Workflow is running NOW.
 * @param {{active:number,total?:number,peak?:number}|null} herd
 * @returns {string|null}
 */
function buildHerdsChip(herd, { color = useColor(), tick = 0 } = {}) {
  // Wave 22 (22.A) — UNHIDDEN. The native SubagentStop hook (subagentstop_hook.js,
  // Path α) fires once per spawn with a reliable agent_id + agent_type signal — Day 0
  // proved it catches even Read-only subagents that the Wave 21 Day 2 PostToolUse
  // fallback misses. The herd file is now written for real, so the chip renders a true
  // `🐄 N/M/peakK` instead of the suppressed Wave 21 Day 3 (C1.5) `return ''`.
  if (!herd || typeof herd.active !== 'number') return null;
  const active = Math.max(0, herd.active | 0);
  const total = Math.max(0, Number(herd.total) || 0);
  const peak = Math.max(0, Number(herd.peak) || 0);
  // Wave 48 (1.7) — `0/0/peak0` was indecipherable. Label the three numbers by
  // their true meaning: live sub-agents now · total spawned this session · peak
  // concurrency. (No "queued" counter exists — don't invent one.)
  const body = `🐄 agents ${active} active · ${total} spawned · peak ${peak}`;
  let chip = active === 0 ? colorize(ANSI.dim, body, color) : body;
  if (active >= WORKFLOW_CONCURRENCY) {
    chip = `${chip} · ${colorize(ANSI.yellow, '⚡ workflow', color)}`;
  }
  // Wave 20 (20.E) — subtle live pulse when ≥1 Moo is active. The statusline
  // re-renders on each Claude Code tick, so alternating the dot per tick reads as
  // a heartbeat (a Dynamic Workflow running NOW) rather than a static marker. It
  // TRAILS the whole chip (dim) so it never dims the count nor splits the ⚡ cue.
  if (active >= 1) {
    const pulse = (Math.trunc(Number(tick) || 0) % 2 === 0) ? '◉' : '◯';
    chip = `${chip} ${colorize(ANSI.dim, pulse, color)}`;
  }
  return chip;
}
/**
 * Wave 22 (22.C) — routed-intent vs real-execution divergence segment, trailing the
 * last-decision label. The SubagentStop hook (subagentstop_hook.js) records the last
 * delegated subagent's intended tier (SUBAGENT_TIER) vs the tier it ACTUALLY ran on
 * (dominant wrapper model). Day 0 proved local-summarizer routes T0/qwen3:30b but
 * executes on T1/haiku when an API key is present — so we show ` · ⚠ exec T1 haiku · N
 * calls` on divergence, and a dim ` ✓ exec local` when intent == reality. Best-effort:
 * no file / unreadable → '' (the label renders exactly as before). Pure given the file.
 */
function buildExecSegment(sessionId, { color = useColor() } = {}) {
  try {
    const sid = String(sessionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
    const p = path.join(require('os').tmpdir(), `mooter-lastexec-${sid}.json`);
    const e = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!e || !e.exec_tier) return '';
    const TAG = { T0: 'local', T1: 'haiku', T2: 'sonnet', T3: 'opus' };
    const execTag = e.exec_tier === 'T0' ? 'local' : (TAG[e.exec_tier] || String(e.exec_tier).toLowerCase());
    if (e.exec_tier === e.intent_tier) {
      return ` ${colorize(ANSI.dim, `✓ exec ${execTag}`, color)}`;
    }
    const n = Number(e.calls) || 0;
    const callsPart = n > 0 ? ` · ${n} call${n === 1 ? '' : 's'}` : '';
    return ` · ${colorize(ANSI.yellow, `⚠ exec ${e.exec_tier} ${execTag}${callsPart}`, color)}`;
  } catch {
    return '';
  }
}
function herdChip(n, { color = useColor() } = {}) {
  const count = Number.isFinite(Number(n)) ? Math.max(0, Math.trunc(Number(n))) : 0;
  const text = `🐄×${count}`;
  // Wave 19 (19.B-1) — route the idle-dim through the same color gate so
  // NO_COLOR / TERM=dumb yields plain text here too (was unconditional before).
  return count === 0 ? colorize(ANSI.dim, text, color) : text;
}

// Append the herd chip to a rendered line when the context carries a count.
// No-op when ctx has no herd (keeps existing tests / demo contexts unchanged).
function appendHerd(line, ctx) {
  if (ctx && ctx.herd && typeof ctx.herd.active === 'number') {
    return `${line} · ${herdChip(ctx.herd.active)}`;
  }
  return line;
}

/**
 * Truncate a single chip to CHIP_MAX chars (ellipsis) so one oversized field
 * (e.g. a long pack id) can never blow out the line-1/line-2 structure.
 */
function truncateChip(s, max = CHIP_MAX) {
  if (typeof s !== 'string' || s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

// Wave 2.8 Ponto #1 — GPU from ~/.mooter/profile.json. The wizard writes gpu as
// an object { model, vram_gb } (or absent on a no-GPU machine). Best-effort.
function readGpuFromProfile() {
  try {
    const profile = JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.mooter', 'profile.json'), 'utf8'));
    const g = profile && profile.gpu;
    if (!g) return null;
    return typeof g === 'string' ? g : (g.model || null);
  } catch {
    return null;
  }
}

function formatGpuChip(gpu) {
  if (!gpu) return null;
  const compact = String(gpu).replace(/^NVIDIA\s+/i, '').replace(/^Apple\s+/i, '').replace(/^GeForce\s+/i, '');
  return `🎮 ${compact}`;
}

// Wave 33 (C.1) — GPU chip for NARROW terminals (< 120 cols), where the wide
// 2-line VRAM chip never renders. Three breakpoints: < 100 → ultra-compact
// "🎮 RTX4090 50%"; 100-119 → "🎮 RTX 4090 12.1/24GB". Respects the existing
// `hidden_chips: ["vram"]` opt-out. Best-effort: any failure → null (no chip).
function buildNarrowGpuChip(cols) {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.mooter', 'preferences.json'), 'utf8'));
    if (Array.isArray(prefs.hidden_chips) && prefs.hidden_chips.includes('vram')) return null;
  } catch { /* no prefs → show */ }
  const base = formatGpuChip(readGpuFromProfile()); // "🎮 RTX 4090" or null
  if (!base) return null;
  let live = null;
  try { live = require('./hardware_live.js').vramSnapshot(); } catch { live = null; }
  if (cols < 100) {
    const model = base.replace('🎮 ', '').replace(/\s+/g, '');
    const pct = live && live.totalMb > 0 ? ` ${live.pct}%` : '';
    return `🎮 ${model}${pct}`;
  }
  // 100-119 — medium: model + used/total GB (no inner spaces to stay tight).
  if (live && live.totalMb > 0) {
    return `${base} ${(live.usedMb / 1024).toFixed(1)}/${Math.round(live.totalMb / 1024)}GB`;
  }
  return base;
}

// Wave 2.8 Ponto #2 — context window as a 10-char ANSI bar + percent. Green
// < 50%, yellow < 80%, red ≥ 80%. Used only in the 2-line layout; the compact
// 1-line render keeps the bare "ctx N%" text.
function ctxBar(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const width = 10;
  const filled = Math.round((p / 100) * width);
  // Wave 19 (19.B-3) — ▰▱ "evolution bar" for the Claude session context window.
  const bar = '▰'.repeat(filled) + '▱'.repeat(width - filled);
  const code = p < 50 ? ANSI.green : p < 80 ? ANSI.yellow : ANSI.red;
  // Wave 48 (1.1) — 📚 glyph so the Claude context-window chip is recognizable
  // at a glance (was a bare `ctx ▰▱ 16%` that read as noise).
  return `📚 ctx ${colorize(code, bar)} ${p}%`;
}

// Wave 48 (1.8) — 10-char usage bar for the ☁ Claude Max chip. `pct` is the
// share to FILL (e.g. remaining %). Pure, no color (the chip is on line 2 which
// stays plain). e.g. pctBar(42) → "[▓▓▓▓░░░░░░]".
function pctBar(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const width = 10;
  const filled = Math.round((p / 100) * width);
  return `[${'▓'.repeat(filled)}${'░'.repeat(width - filled)}]`;
}

/**
 * Wave 2.6 Day 2 — rich 2-line layout for wide terminals (COLUMNS >= 120).
 * Line 1 is the existing colored headline (carries saved$ + tier badge in the
 * green state). Line 2 carries the full operational detail at once — no
 * rotation needed because we have the width: Moo mix · local count · ctx ·
 * 5h quota · turn$ · alltime$ · pack · adapter. Every chip is derived from the
 * same ctx the 1-line render uses (no invented fields); a chip whose source is
 * absent is dropped via `.filter(Boolean)`.
 *
 * Note: a per-turn token in/out meter is intentionally omitted — buildContext
 * does not track token counts, and inventing them would violate provenance.
 */
/**
 * Compact a token count: 1_898_286 → "1.9M", 13_300 → "13.3k", 940 → "940".
 * Honest rounding — never invents precision the source lacks.
 */
function fmtTokens(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
}

/**
 * Wave 33.8 Block F — short, version-bearing model tag for the Line 1 tier badge.
 * "claude-opus-4-6" → "opus-4.6"; "claude-haiku-4-5" → "haiku-4.5"; a local model
 * like "qwen3:30b" passes through unchanged. Returns null for anything that does
 * not look like a known model id, so the caller falls back to its existing tag.
 * @param {string|undefined} rm  the per-decision recommended_model
 * @returns {string|null}
 */
function shortModelTag(rm) {
  if (typeof rm !== 'string' || !rm.trim()) return null;
  const m = rm.trim().replace(/^claude-/, '');
  // opus-4-6 → opus-4.6 ; sonnet-4-6 → sonnet-4.6 ; haiku-4-5 → haiku-4.5 (keep any [suffix]).
  const cloud = m.match(/^(opus|sonnet|haiku)-(\d+)-(\d+)(.*)$/);
  if (cloud) return `${cloud[1]}-${cloud[2]}.${cloud[3]}${cloud[4] || ''}`;
  // Local Ollama ids (qwen3:30b, gemma3:12b, …) — already short; show verbatim.
  if (/^[a-z0-9][\w.:-]*$/i.test(m) && m.length <= 24) return m;
  return null;
}

// Wave 33.8 Block F — per-tier short model names for the 🪙 token chip annotation.
// Derived from the router's TIER_TO_PRICING_KEY (pricing.js) so the statusline and
// the cost engine name the same models. T0 is "local" (the active Ollama model
// varies per task; the quant chip already names it precisely).
const TIER_MODEL_TAG = { T0: 'local', T1: 'haiku-4.5', T2: 'sonnet-4.6', T3: 'opus-4.6' };

/**
 * Wave 19 (19.A) — the 🪙 per-tier token chip. Renders only tiers that consumed
 * real tokens (input+output; cache tokens are excluded from the headline). All
 * tiers zero → null (chip dropped) so the line stays quiet on a fresh session.
 * @param {{T0,T1,T2,T3}|null} snap  per-tier {tokens_in,tokens_out,...}
 * @returns {string|null}  e.g. "🪙 T0:13.3k · T2:24.2k"
 */
function buildTokenChip(snap, { color = useColor(), models = false } = {}) {
  if (!snap) return null;
  // Wave 19 (Day 4.1) — show ALL FOUR tiers, even at 0. Hiding zero tiers made
  // a session read as "🪙 T3:2.4M" → "Mooter only uses Opus", the exact OPPOSITE
  // of the transparency promise. The whole point is to show the mix, including
  // the zeros that prove cheaper tiers were available.
  // Wave 33.8 Block F — `models:true` annotates each NON-ZERO tier with the model
  // that processed its tokens (e.g. "T3:263.8k (opus-4.6)"), surfacing the cost
  // variability the bare tier hides (Q11). Default off → byte-identical to before.
  const parts = [];
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    const s = snap[t] || {};
    const tot = (Number(s.tokens_in) || 0) + (Number(s.tokens_out) || 0);
    const tag = models && tot > 0 ? ` (${TIER_MODEL_TAG[t]})` : '';
    // T0 green / T1 blue / T2 yellow / T3 red, free→expensive (Wave 19 19.B-1).
    parts.push(colorize(TIER_COLOR[t], `${t}:${fmtTokens(tot)}${tag}`, color));
  }
  // Wave 20 (20.C) — a single "tkns" unit label on the first tier so the 🪙 chip
  // reads as token counts, not the 🐄 call counts. One label keeps it compact.
  const labeled = parts.map((p, i) => (i === 0 ? `${p} tkns` : p));
  return `🪙 ${labeled.join(' · ')}`;
}

/**
 * Wave 20 (20.D) — local share by TOKENS (T0 ÷ all tiers), the honest companion
 * to the local share by CALLS. A session can be 60% local by call count yet ~0%
 * by tokens because one Opus turn dwarfs many Ollama calls. Returns null when no
 * tokens are recorded (chip dropped — never a fake 0%).
 * @param {{T0,T1,T2,T3}|null} snap
 * @returns {number|null} percent 0..100, or null when there is no token data
 */
function tokensLocalPct(snap) {
  if (!snap) return null;
  let local = 0, total = 0;
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    const s = snap[t] || {};
    const tot = (Number(s.tokens_in) || 0) + (Number(s.tokens_out) || 0);
    total += tot;
    if (t === 'T0') local += tot;
  }
  if (total <= 0) return null;
  return (local / total) * 100;
}

/** Format a local-share percent: sub-10% keeps one decimal (0.1%), else integer. */
function fmtSharePct(p) {
  if (!(p > 0)) return '0';
  return p < 10 ? p.toFixed(1) : String(Math.round(p));
}

/**
 * Wave 21 (C4) — the 🏠 chip, from a SINGLE source. The Wave 20 chip concatenated
 * three disagreeing numbers on one line: calls from decisions.log
 * (`ctx.counts.T0/ctx.total`), a token% from token_tracker, and an ASCII bar from
 * the sparkline (`localCloudSplit(ctx.recent)`) — e.g. "2/56 calls (4%) · 12%
 * tokens local · ░░░ 0% local". Here both numbers derive from ONE source: the
 * token_tracker snapshot (already `_pushed`+`_transcript` reconciled), so the 🏠
 * chip agrees with the 🪙 chip. No fabricated chip when nothing was recorded.
 * @param {{T0,T1,T2,T3}|null} tokSnap token_tracker.snapshot()
 * @param {string} [homeGlyph]
 * @returns {string|null}
 */
function buildLocalChip(tokSnap, homeGlyph = '🏠') {
  if (!tokSnap) return null;
  let t0calls = 0, totalCalls = 0;
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    const c = Number(tokSnap[t] && tokSnap[t].calls) || 0;
    totalCalls += c;
    if (t === 'T0') t0calls = c;
  }
  if (totalCalls <= 0) return null; // nothing recorded → no chip (never a fake 0%)
  const callsPct = Math.round((t0calls / totalCalls) * 100);
  const tlp = tokensLocalPct(tokSnap);
  const tokPart = tlp === null ? '' : ` · ${fmtSharePct(tlp)}% tokens local`;
  return `${homeGlyph} ${t0calls}/${totalCalls} calls (${callsPct}%)${tokPart}`;
}

// Wave 33 (A.2) — humanize a session age in ms. <60min → "47m"; <24h →
// "2h47m"; ≥24h → "2d4h". Pure formatter; the source (transcript birth time)
// is read once per render in buildContext.
function formatSessionAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0m';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHr = Math.floor(totalMin / 60);
  if (totalHr < 24) return `${totalHr}h${totalMin % 60}m`;
  return `${Math.floor(totalHr / 24)}d${totalHr % 24}h`;
}

function renderTwoLine(ctx, opts = {}) {
  const state = pickState(ctx);
  const glyph = COLOR_GLYPH[state.color];

  // Setup state has no router data — degrade to the 1-line so we never print a
  // half-empty second line on a fresh install.
  if (state.color === 'setup') return renderFromContext(ctx);

  let line1 = `${glyph} ${state.headline}`;

  // Wave 10 A.1 — Cinematic: a colored sparkline of the last 10 decisions trails
  // the headline. Mostly low gray bars (local) with rare tall pink spikes (opus)
  // tells the routing story at a glance. Best-effort; a missing module or empty
  // history just drops the chip.
  try {
    if (Array.isArray(ctx.recent) && ctx.recent.length) {
      const { tierSparkline } = require('./sparkline.js');
      const spark = tierSparkline(ctx.recent);
      if (spark) line1 = `${line1}  ${spark} last 10`;
    }
  } catch { /* keep the bare headline */ }

  // Wave 12 PR-I — the tier label trails the sparkline on the green headline
  // (pickState exposes it separately so the rhythm sits ahead of it: brand →
  // savings → rhythm → tier). Warning states fold their tier context into the
  // headline/proof already, so this only fires on green.
  if (state.color === 'green' && state.lastLabel && state.lastLabel !== '—') {
    line1 = `${line1}  ·  ${state.lastLabel}`;
  }

  // Wave 21 (C4 / DoD #3) — the herd used to render TWICE in the two-line layout:
  // `🐄×N` here on line 1 (appendHerd) AND `🐄 N/M/peakK` on line 2 (buildHerdsChip).
  // The line-2 chip is strictly richer (active/total/peak + ⚡ workflow), so the
  // line-1 duplicate is dropped. The one-line layout (renderFromContext) keeps its
  // appendHerd — it has no buildHerdsChip, so that's its only herd display.

  // Wave 12 PR-I — the per-decision Moo glyph that used to open line 2 was a
  // second cow, redundant with the 🐮 already branding line 1. Dropped. We still
  // pull the "home" glyph from the same table to keep the local-count chip in sync.
  let homeGlyph = '🏠';
  try {
    const { PROVIDER_GLYPHS } = require('./glyphs.js');
    homeGlyph = (PROVIDER_GLYPHS && PROVIDER_GLYPHS.local) || '🏠';
  } catch { homeGlyph = '🏠'; }

  // Wave 21 (C4) — the line-2 local-share ASCII bar (`░░░ 0% local`) was the third,
  // disagreeing source of the 🏠 chip and read as a flat 0% even mid-session. It's
  // dropped; the single-source buildLocalChip above is the honest local metric and
  // the line-1 sparkline already carries the per-decision tier detail.

  // Pack chip — mirror renderFromContext's GENERAL/AMBIGUOUS handling. This is
  // the one user-controlled (unbounded) chip, so it's the only one we truncate;
  // the structured chips below have known bounded widths.
  let packChip = null;
  if (ctx.lastPack && typeof ctx.lastPack.pack_id === 'string') {
    const pid = ctx.lastPack.pack_id;
    if (pid === 'AMBIGUOUS' && Array.isArray(ctx.lastPack.candidates) && ctx.lastPack.candidates.length >= 2) {
      packChip = truncateChip(`pack: AMBIGUOUS (${ctx.lastPack.candidates.slice(0, 2).join(', ')})`);
    } else if (pid !== 'GENERAL' && pid !== 'AMBIGUOUS') {
      packChip = truncateChip(`pack: ${pid}`);
    }
  }

  // Wave 5 D3 — per-chip hide flags (preferences.json hidden_chips: ["vram","quant",...]).
  let hidden = [];
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.mooter', 'preferences.json'), 'utf8'));
    if (Array.isArray(prefs.hidden_chips)) hidden = prefs.hidden_chips;
  } catch { hidden = []; }
  const hide = (name) => hidden.includes(name);

  // Wave 2.8 GPU chip + Wave 5 D3 live VRAM. `--hide-vram` drops the VRAM suffix.
  let gpuChip = formatGpuChip(readGpuFromProfile());
  if (gpuChip && !hide('vram')) {
    try {
      // Wave 19 (19.B-2) — live VRAM via nvidia-smi, file-cached 5s (each render
      // is a fresh process, so an in-memory cache would re-spawn every time).
      // Shows % AND used/total GB. Real reading only — null → fall back to the
      // model-only chip; M-series shared memory has no discrete %, so it's
      // omitted rather than invented.
      const live = require('./hardware_live.js').vramSnapshot();
      if (live && live.totalMb > 0) {
        gpuChip = `${gpuChip} ${live.pct}% VRAM (${(live.usedMb / 1024).toFixed(1)}/${Math.round(live.totalMb / 1024)} GB)`;
      }
    } catch { /* keep model-only chip */ }
  }

  // Wave 2.8 quant chip + Wave 5 D3 detailed tooltip (wide terminals). Local Moos
  // only; `--hide-quant` drops it. Best-effort, never blocks the render.
  let quantChip = null;
  if (!hide('quant')) {
    try {
      const { detectQuantization, formatQuantChipDetailed } = require('./quantization.js');
      const model = (ctx.last && ctx.last.suggested_providers && ctx.last.suggested_providers[0]) || (ctx.last && ctx.last.tier === 'T0' ? 'ollama' : '');
      const q = detectQuantization(model);
      if (q) quantChip = parseInt(process.env.COLUMNS || '120', 10) >= 140 ? formatQuantChipDetailed(q.format) : `quant ${q.format}`;
    } catch { quantChip = null; }
  }

  // Wave 5 D2 — adapter chip, honest. A validated active adapter shows 🔧 {name}
  // (+perf if benchmarked); a marked-but-unvalidated one shows ⏸; else baseline.
  // Wave 12 PR-I — em-dash reads as "none" (◌ read like an unselected radio).
  // `mooter forge install` is the shipped command that installs a .gguf adapter
  // (commands/forge.ts), so the CTA stays — just trimmed of the "install via … <gguf>"
  // verbosity.
  // Wave 19 (19.B-4) — LoRA/Pastor evolution chip (🧬). The "trained on N"
  // suffix is the Pastor loop's real decision count from tuning-state.json
  // (written by update-router.js, Wave 16-18 Tier C). Absent file or
  // sample_size 0 → no suffix; never invent a "+N pp" boost.
  // Wave 22 (22.F) — read the LIVE decisions corpus count (what the Pastor loop learns
  // from), not the stale tuning-state.sample_size snapshot (lagged at 8 while the corpus
  // grew to 188). Fall back to the tuning snapshot only if the corpus is unreadable.
  let tunedCount = 0;
  try { tunedCount = require('./decisions_v2.js').recordCount(); } catch { tunedCount = 0; }
  if (!tunedCount) {
    try {
      const ts = JSON.parse(fs.readFileSync(path.join(ROUTER_DIR, 'tuning-state.json'), 'utf8'));
      tunedCount = Number(ts && ts.sample_size) || 0;
    } catch { tunedCount = 0; }
  }
  const trained = tunedCount > 0 ? ` · trained on ${tunedCount} decisions` : '';

  let adapterChip = `🧬 baseline${trained || ' · mooter forge install'}`;
  try {
    const { getActiveAdapter, markedAdapterId } = require('./adapter_selection.js');
    const active = getActiveAdapter();
    if (active && active.name) {
      const perf = active.performance && typeof active.performance.accuracy_delta === 'number'
        ? ` (${(active.performance.accuracy_delta * 100).toFixed(0)}% acc)`
        : '';
      adapterChip = `🧬 ${active.name}${perf}${trained}`;
    } else {
      const marked = markedAdapterId();
      if (marked) adapterChip = `🧬 ⏸ ${String(marked).slice(0, 8)} (validating)${trained}`;
    }
  } catch { /* keep baseline */ }

  // Wave 2.8 ctx visual bar (already shipped W2.8). `--hide-ctx` drops it.
  const ctxChip = !hide('ctx') && typeof ctx.ctxPercent === 'number' ? ctxBar(ctx.ctxPercent) : null;

  // Wave 19 (19.A) — 🪙 real tokens per tier. Cache-only snapshot (the PostToolUse
  // hook keeps it fresh), so it never parses the transcript on the render path.
  // Wave 20 (20.D) — read it ONCE and reuse for the 🏠 dual metric below.
  // `hidden_chips: ["tokens"]` drops the 🪙 chip. Best-effort: any failure → no chip.
  let tokSnap = null;
  try { tokSnap = require('./token_tracker.js').snapshot(ctx.sessionId); } catch { tokSnap = null; }
  const tokenChip = hide('tokens') ? null : buildTokenChip(tokSnap, { models: true });

  // Wave 21 (C4) — single-source 🏠 chip from the token_tracker snapshot (calls +
  // token% from the SAME reconciled source, agreeing with the 🪙 chip). Replaces
  // the Wave 20 three-source concat. The misleading ASCII `localShareChip` bar is
  // dropped from line 2 below.
  const homeChip = hide('home') ? null : buildLocalChip(tokSnap, homeGlyph);

  // Wave 19 (19.B-5/6) — always-on herd chip (active/total/peak + ⚡ workflow).
  // Wave 20 (20.E) — pass the render tick so the chip can pulse while Moos work.
  const herdsChip = hide('herd') ? null : buildHerdsChip(ctx.herd, { tick: ctx.tick });

  // Wave 33 (A.2) — ⏱️ session timer chip. ONLY shown when an explicit mode
  // (compact/full) is pinned — `opts.forceLine3` is a boolean then. The adaptive
  // width-based default (render() calls renderTwoLine(ctx) with no opts) stays
  // byte-identical. `hidden_chips: ["session-timer"]` drops it.
  const explicitMode = typeof opts.forceLine3 === 'boolean';
  const sessionTimerChip =
    explicitMode && !hide('session-timer') && typeof ctx.sessionAge === 'number'
      ? `⏱️ session ${formatSessionAge(ctx.sessionAge)}`
      : null;

  const line2 = [
    homeChip,
    gpuChip,
    ctxChip,
    typeof ctx.anthRem === 'number' ? `☁ Claude Max ${pctBar(ctx.anthRem)} ${ctx.anthRem}% left · 5h reset` : null,
    sessionTimerChip,
    // Wave 48 (1.6) — group the two cost figures under one 📝 chip and FIX the
    // mislabel: `alltimeCost` was rendered as "session $" (it is all-time spend,
    // not this session) — the exact "this prompt vs session" confusion Paulo hit.
    (typeof ctx.lastTurnCost === 'number' || typeof ctx.alltimeCost === 'number')
      ? '📝 ' + [
          typeof ctx.lastTurnCost === 'number' ? `$${ctx.lastTurnCost.toFixed(2)} this turn` : null,
          typeof ctx.alltimeCost === 'number' ? `$${ctx.alltimeCost.toFixed(2)} all-time` : null,
        ].filter(Boolean).join(' · ')
      : null,
    tokenChip,
    herdsChip,
    quantChip,
    packChip,
    hide('adapter') ? null : adapterChip,
  ]
    .filter(Boolean)
    .join(' · ');

  // If line 2 has nothing to show, fall back to the 1-line.
  if (!line2) return renderFromContext(ctx);
  // Wave 29 (29.J) — opt-in line 3 (synthesis chips). Default OFF → lines 1-2 are
  // byte-for-byte unchanged. Enable via preferences.json {"statusline_line3":true}
  // or MOOTER_STATUSLINE_LINE3=1. Defensive: any failure → no line 3.
  const line3 = buildLine3(opts.forceLine3);
  return line3 ? `${line1}\n${line2}\n${line3}` : `${line1}\n${line2}`;
}

// Wave 29 (29.J) — assemble the opt-in line-3 synthesis chips (compression ·
// setup · ecosystem). Each helper returns null when its layer is inactive, and
// any throw is swallowed so the statusline can never be broken by line 3.
function buildLine3(force) {
  // Wave 32 (Phase B) — explicit statusline modes can force line 3 on (full) or
  // off (compact). `force` undefined → unchanged opt-in behavior (byte-identical).
  if (force === false) return null;
  let on = force === true || process.env.MOOTER_STATUSLINE_LINE3 === '1';
  if (!on) {
    try {
      const prefs = JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.mooter', 'preferences.json'), 'utf8'));
      on = prefs.statusline_line3 === true;
    } catch { on = false; }
  }
  if (!on) return null;
  const chips = [];
  for (const mod of ['./compression-status.js', './setup-status.js', './ecosystem-status.js',
    './wave-status.js', './dogfood-status.js', './mlwr-status.js', './limits-status.js', './pastor-status.js',
    './effort-status.js', './quant-status.js', './vector-status.js', './turboquant-status.js',
    './eagle3-status.js', './minimax-status.js', './arbitrage-status.js',
    // Wave 33.5 Block A — terminal-name (A.7) + workflow-progress dots (A.6).
    './terminal-name-status.js', './workflow-progress-status.js',
    // Wave 33.5 Block B.5 — 🐝 active spawns.
    './spawns-status.js',
    // Wave 33.6 Block P6 — 🔒 conductor lock count.
    './conductor-status.js',
    // Wave 33.8 Block E — 👤 signed-in identity (opaque hash, silent logged-out).
    './user-status.js']) {
    try {
      const c = require(mod).statusLine();
      if (c) chips.push(c);
    } catch { /* skip a broken chip, never break the statusline */ }
  }
  return chips.length ? chips.join(' · ') : null;
}

/**
 * Entry point — picks the 2-line layout on a wide terminal, otherwise the
 * existing single-line render (already compact-aware for narrow terminals).
 * COLUMNS reflects the host terminal width; absent → assume narrow (1-line).
 */
function render(ctx) {
  // Wave 32 (Phase B) — an explicitly pinned mode (env or preferences.json)
  // overrides the adaptive layout. With no mode pinned this is a no-op and the
  // width-based default below runs byte-for-byte as before. Best-effort: any
  // failure in the modes module falls through to the legacy default.
  try {
    const modes = require('./statusline-modes.js');
    const mode = modes.readMode();
    if (mode) {
      const out = modes.renderForMode(mode, ctx, {
        renderFromContext,
        renderTwoLine,
        helpers: { colorize, useColor, ANSI, COLOR_GLYPH, formatSessionAge },
      });
      if (out !== null && out !== undefined) return out;
    }
  } catch { /* fall through to adaptive default */ }
  const cols = parseInt(process.env.COLUMNS || '80', 10);
  return cols >= TWO_LINE_THRESHOLD ? renderTwoLine(ctx) : renderFromContext(ctx);
}

async function buildContext() {
  // Wave 2.5 Day 1 — Claude Code passes a JSON blob on stdin (session_id +
  // optional context window usage). Parse it best-effort; absent on a manual
  // `node statusline-multi.js` run, where stdin is a TTY.
  const stdinJson = readStdinJson();
  const ctxPercent = clampPercent(
    stdinJson && stdinJson.context && stdinJson.context.percent_used
  );

  // Session scope: prefer the session_id Claude Code just handed us (same value
  // inject_context.js stamps onto each decision), fall back to the env var.
  // MOOTER_STATUSLINE_VIEW=all turns the filter off for a global/debug view.
  const sessionId = (stdinJson && stdinJson.session_id) || process.env.CLAUDE_SESSION_ID || null;
  const sessionFilter = process.env.MOOTER_STATUSLINE_VIEW === 'all' ? null : sessionId;

  // Wave 33 (A.2) — session age = now − transcript file birth time. Claude Code
  // passes `transcript_path` on stdin; its creation time marks session start.
  // One statSync per render (~sub-ms). Best-effort: no path / unreadable → null
  // (chip silently absent). Never throws on the render path.
  let sessionAge = null;
  try {
    const tp = stdinJson && stdinJson.transcript_path;
    if (tp && fs.existsSync(tp)) {
      const st = fs.statSync(tp);
      const birth = st.birthtimeMs > 0 ? st.birthtimeMs : st.ctimeMs;
      if (birth > 0) sessionAge = Date.now() - birth;
    }
  } catch { sessionAge = null; }

  // Wave 2.5 Day 3 — per-session tick counter (persisted in tmp) drives the
  // rotating tier-mix view in renderFromContext. Each statusline call bumps it;
  // a fresh session starts its own file. Best-effort: any read/write failure
  // leaves tick at 0 (always view A) and never blocks the render.
  let tick = 0;
  try {
    const tickPath = path.join(require('os').tmpdir(), `mooter-statusline-tick-${sessionId || 'global'}`);
    try { tick = parseInt(fs.readFileSync(tickPath, 'utf8'), 10) || 0; } catch { tick = 0; }
    tick = (tick + 1) % 1000000;
    try { fs.writeFileSync(tickPath, String(tick)); } catch { /* ignore */ }
  } catch { tick = 0; }

  const quota = readQuota() || {};
  const lines = readDecisionsTail();
  const { counts, total, last, recent } = digest(lines, { sessionFilter });

  const anthRem    = computeAnthropicRem(quota);
  const codexRem   = computeCodexRem(quota);
  const codexLeft  = computeCodexMessagesLeft(quota);

  const todayCost =
    ((quota.providers && quota.providers.anthropic && quota.providers.anthropic.today.cost_usd) || 0) +
    ((quota.providers && quota.providers.openai_api && quota.providers.openai_api.today.cost_usd) || 0);

  // Scope the tracker query to this terminal's session so the saved/turn/alltime
  // numbers match the digest. With no session (or global view) we read all-time.
  const metrics = await readSavingsSync(sessionFilter);
  const savedUsd = metrics && Number.isFinite(Number(metrics.saved)) ? Number(metrics.saved) : null;
  const savedPct = metrics && Number.isFinite(Number(metrics.saved_pct)) ? Number(metrics.saved_pct) : null;
  const lastTurnCost = metrics && Number.isFinite(Number(metrics.last_turn_cost_usd)) ? Number(metrics.last_turn_cost_usd) : null;
  const alltimeCost  = metrics && Number.isFinite(Number(metrics.alltime_cost_usd)) ? Number(metrics.alltime_cost_usd) : null;

  // Wave 2 Day 2 — pack + adapter sidecars (null-safe; both can be absent).
  const lastPack = readLastDecision();
  const adapter  = getAdapterStatus();

  // Drift detection: cheap when no baseline exists (returns drift=false
  // immediately). Wrapped in try/catch so a drift module bug never blocks
  // the statusline render.
  let drift = null;
  try {
    drift = require('./drift-detector.js').checkDrift();
  } catch { drift = null; }

  // Wave 13 "Show the Herd" — live subagent count from the in-process tracker,
  // scoped to this session. Best-effort: a missing tracker or unreadable state
  // file just drops the chip and never blocks the render.
  let herd = null;
  try {
    const snap = require('./subagent_tracker.js').snapshot({ session_id: sessionId });
    herd = {
      active: snap.active_count,
      local: snap.active_local,
      cloud: snap.active_cloud,
      peak: snap.peak_concurrent,
      // Wave 19 (19.B-5) — total spawned this session = Σ cumulative counts.
      // Derived here (not added to subagent_tracker.snapshot) to keep the Wave 13 API unchanged.
      total: Array.isArray(snap.cumulative) ? snap.cumulative.reduce((s, r) => s + (Number(r.count) || 0), 0) : 0,
    };
  } catch { herd = null; }

  return {
    counts, total, last, recent,
    anthRem, codexRem, codexLeft,
    savedUsd, savedPct, todayCost,
    ctxPercent, lastTurnCost, alltimeCost,
    drift,
    lastPack, adapter,
    tick,
    herd,
    sessionId,
    sessionAge,
    dataMissing: !lines.length && !quota.providers,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Demo / mock contexts (for screenshots and tests)
// ────────────────────────────────────────────────────────────────────────

const DEMO_CONTEXTS = {
  green: {
    counts: { T0: 18, T1: 2, T2: 4, T3: 2, codex: 1 }, total: 27,
    last:    { tier: 'T2', confidence: 0.84, suggested_providers: ['sonnet'] },
    recent:  Array(10).fill({ tier: 'T2', confidence: 0.82 }),
    anthRem: 42, codexRem: 88, codexLeft: 132,
    savedUsd: 0.27, savedPct: 89, todayCost: 0.04, dataMissing: false,
    sessionAge: 2 * 3600000 + 47 * 60000, // 2h47m — A.2 demo
  },
  yellow: {
    counts: { T0: 1, T1: 0, T2: 1, T3: 10, codex: 0 }, total: 12,
    last:    { tier: 'T3', confidence: 0.95, suggested_providers: ['opus'] },
    recent:  Array(10).fill({
      tier: 'T3',
      confidence: 0.95,
      escalation_rule: 'beast_intent_force_t3',
      prompt_complexity_score: 0.01,
    }),
    anthRem: 24, codexRem: 91, codexLeft: 137,
    savedUsd: 0.04, savedPct: 8, todayCost: 0.42, dataMissing: false,
  },
  red: {
    counts: { T0: 4, T1: 1, T2: 8, T3: 2, codex: 3 }, total: 18,
    last:    { tier: 'T2', confidence: 0.71, suggested_providers: ['codex_cli', 'sonnet'] },
    recent:  Array(10).fill({ tier: 'T2', confidence: 0.71 }),
    anthRem: 8, codexRem: 84, codexLeft: 41,
    savedUsd: 0.34, savedPct: 71, todayCost: 0.13, dataMissing: false,
  },
  empty: {
    counts: { T0: 0, T1: 0, T2: 0, T3: 0, codex: 0 }, total: 0,
    last: null, recent: [],
    anthRem: 100, codexRem: 100, codexLeft: 150,
    savedUsd: null, savedPct: null, todayCost: 0, dataMissing: true,
  },
};

// ────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--mock') {
    for (const k of ['green', 'yellow', 'red', 'empty']) {
      process.stdout.write(renderFromContext(DEMO_CONTEXTS[k]) + '\n');
    }
    return;
  }
  if (argv[0] === '--demo' && DEMO_CONTEXTS[argv[1]]) {
    process.stdout.write(render(DEMO_CONTEXTS[argv[1]]) + '\n');
    return;
  }

  const ctx = await buildContext();
  process.stdout.write(render(ctx) + '\n');
}

if (require.main === module) {
  main().catch((err) => {
    // The statusline must NEVER throw — degrade so the user's terminal stays
    // usable even if a stale log or missing tracker breaks the pipeline.
    process.stdout.write('⚪ mooter — statusline degraded                 │ —\n');
    if (process.env.MOOTER_DEBUG) process.stderr.write(String(err) + '\n');
  });
}

module.exports = {
  // Pure helpers — exported for tests
  pickState,
  renderFromContext,
  renderTwoLine,
  render,
  truncateChip,
  herdChip,
  appendHerd,
  ctxBar,
  fmtTokens,
  buildTokenChip,
  tokensLocalPct,
  fmtSharePct,
  buildLocalChip,
  buildHerdsChip,
  buildExecSegment,
  colorize,
  useColor,
  formatGpuChip,
  formatSessionAge,
  readGpuFromProfile,
  digest,
  computeAnthropicRem,
  computeCodexRem,
  computeCodexMessagesLeft,
  beastOverkillPct,
  zenUnderkillPct,
  avgConfidence,
  getAdapterStatus,
  clampPercent,
  // Demo contexts kept on the export so consumers can render previews.
  DEMO_CONTEXTS,
  TH,
};
