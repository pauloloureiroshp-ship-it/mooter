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
 * Adapter status — Wave 5 placeholder. Until the LoRA / pack-adapter loader
 * lands we always report idle so the chip is visible and reserves the slot.
 * The future implementation will read ~/.mooter/adapter-state.json.
 */
function getAdapterStatus() {
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
    const tag = explicit || TIER_DEFAULT_TAG[tier] || tier.toLowerCase();
    // Wave 12 PR-I — T0 is local by definition, so "T0 local" is redundant; drop
    // the tag there. Confidence gets a "conf" qualifier so the bare number reads
    // as what it is rather than as noise.
    lastLabel = (tier === 'T0' && tag === 'local')
      ? `${tier} · conf ${conf}`
      : `${tier} ${tag} · conf ${conf}`;
  }

  // ── Proof chips (Wave 2.5 Day 1) ──────────────────────────────────────
  // New operational chips: ctx % · Anthropic 5h % · this-turn cost · cumulative
  // cost. `proofChips` is the label-free form used by the GREEN headline (which
  // already carries the tier badge); `proof` prepends the tier label and is the
  // default for every warning state, so a warning never costs the operator
  // sight of the last decision.
  const proofParts = [];
  if (typeof ctxPercent === 'number') proofParts.push(`ctx ${ctxPercent}%`);
  if (typeof anthRem === 'number') proofParts.push(`${anthRem}% 5h`);
  if (typeof lastTurnCost === 'number') proofParts.push(`turn $${lastTurnCost.toFixed(2)}`);
  if (typeof alltimeCost === 'number') proofParts.push(`alltime $${alltimeCost.toFixed(2)}`);
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
      headline: `only ${Math.round(savedPct)}% saved today — check tier mix`,
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
    // "today" names the aggregation window (matches `mooter trail`); "vs all-Opus"
    // names the baseline the savings % is measured against. The tier label rides
    // on state.lastLabel so the renderer can sit the sparkline between the outcome
    // and the tier (outcome → rhythm → tier).
    const headline = `saved $${savedUsd.toFixed(2)} today (${Math.round(savedPct)}% vs all-Opus)`;
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
        if (typeof ctx.alltimeCost === 'number') parts.push(`alltime $${ctx.alltimeCost.toFixed(2)}`);
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
  // Wave 13 — trail the live 🐄×N herd chip after the headline/proof.
  return appendHerd(`${COLOR_GLYPH[state.color]} ${headlineText.padEnd(38)} │ ${proof}`, ctx);
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
const HERD_DIM = '\x1b[2m';
const HERD_RESET = '\x1b[0m';
function herdChip(n, { color = true } = {}) {
  const count = Number.isFinite(Number(n)) ? Math.max(0, Math.trunc(Number(n))) : 0;
  const text = `🐄×${count}`;
  return count === 0 && color ? `${HERD_DIM}${text}${HERD_RESET}` : text;
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

// Wave 2.8 Ponto #2 — context window as a 10-char ANSI bar + percent. Green
// < 50%, yellow < 80%, red ≥ 80%. Used only in the 2-line layout; the compact
// 1-line render keeps the bare "ctx N%" text.
function ctxBar(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const width = 10;
  const filled = Math.round((p / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const color = p < 50 ? '\x1b[32m' : p < 80 ? '\x1b[33m' : '\x1b[31m';
  return `ctx [${color}${bar}\x1b[0m] ${p}%`;
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
function renderTwoLine(ctx) {
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

  // Wave 13 "Show the Herd" — live `🐄×N` count of subagents in flight, trailing
  // Line 1. Shown by default (A.1); empty herd renders dim.
  line1 = appendHerd(line1, ctx);

  // Wave 12 PR-I — the per-decision Moo glyph that used to open line 2 was a
  // second cow, redundant with the 🐮 already branding line 1. Dropped. We still
  // pull the "home" glyph from the same table to keep the local-count chip in sync.
  let homeGlyph = '🏠';
  try {
    const { PROVIDER_GLYPHS } = require('./glyphs.js');
    homeGlyph = (PROVIDER_GLYPHS && PROVIDER_GLYPHS.local) || '🏠';
  } catch { homeGlyph = '🏠'; }

  // Local-Moo usage count (T0 = local tier) from the per-session tier counts.
  const localCount = (ctx.counts && Number(ctx.counts.T0)) || 0;
  // Wave 12 PR-I — denominator for the local-count chip ("6/10 local"). Total
  // classified decisions in the session window; falls back to the local count
  // itself if the digest carried no total (keeps the ratio sane, never > 1).
  const sessionTotal = Number(ctx.total) || localCount;

  // Wave 10 A.1 — Cinematic: replace the verbose "🐄 last10: T0:.. T1:.." text
  // chip with a visual local-share bar. The line-1 sparkline already carries the
  // per-decision tier detail, so line 2 shows just the aggregate % that ran
  // locally. Best-effort; a missing module or empty history drops the chip.
  let localShareChip = null;
  try {
    if (Array.isArray(ctx.recent) && ctx.recent.length) {
      const { localCloudSplit, localBar } = require('./sparkline.js');
      localShareChip = localBar(localCloudSplit(ctx.recent).pct);
    }
  } catch { localShareChip = null; }

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
      // Wave 12 PR-I — VRAM as a single % is more glanceable than raw "5.4GB /
      // 24GB"; the raw GB pair stays available via `mooter doctor`. Same detector
      // (vram_detect), same numbers — only the presentation changes. M-series
      // shared memory reports used_mb = -1, so the % is omitted there rather than
      // invented.
      const { getVram } = require('./vram_detect.js');
      const v = getVram();
      if (v && Number.isFinite(v.used_mb) && v.used_mb >= 0 && v.total_mb > 0) {
        gpuChip = `${gpuChip} ${Math.round((v.used_mb / v.total_mb) * 100)}% VRAM`;
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
  let adapterChip = 'adapter — baseline · mooter forge install';
  try {
    const { getActiveAdapter, markedAdapterId } = require('./adapter_selection.js');
    const active = getActiveAdapter();
    if (active && active.name) {
      const perf = active.performance && typeof active.performance.accuracy_delta === 'number'
        ? ` (${(active.performance.accuracy_delta * 100).toFixed(0)}% acc)`
        : ' (◌ benchmark pending)';
      adapterChip = `adapter 🔧 ${active.name}${perf}`;
    } else {
      const marked = markedAdapterId();
      if (marked) adapterChip = `adapter ⏸ ${String(marked).slice(0, 8)} (validating)`;
    }
  } catch { /* keep baseline */ }

  // Wave 2.8 ctx visual bar (already shipped W2.8). `--hide-ctx` drops it.
  const ctxChip = !hide('ctx') && typeof ctx.ctxPercent === 'number' ? ctxBar(ctx.ctxPercent) : null;

  const line2 = [
    localCount > 0 ? `${homeGlyph} ${localCount}/${sessionTotal} local` : null,
    localShareChip,
    gpuChip,
    ctxChip,
    typeof ctx.anthRem === 'number' ? `☁ Claude Max ${ctx.anthRem}% · 5h reset` : null,
    typeof ctx.lastTurnCost === 'number' ? `turn $${ctx.lastTurnCost.toFixed(2)}` : null,
    typeof ctx.alltimeCost === 'number' ? `alltime $${ctx.alltimeCost.toFixed(2)}` : null,
    quantChip,
    packChip,
    hide('adapter') ? null : adapterChip,
  ]
    .filter(Boolean)
    .join(' · ');

  // If line 2 has nothing to show, fall back to the 1-line.
  return line2 ? `${line1}\n${line2}` : renderFromContext(ctx);
}

/**
 * Entry point — picks the 2-line layout on a wide terminal, otherwise the
 * existing single-line render (already compact-aware for narrow terminals).
 * COLUMNS reflects the host terminal width; absent → assume narrow (1-line).
 */
function render(ctx) {
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
    herd = { active: snap.active_count, local: snap.active_local, cloud: snap.active_cloud, peak: snap.peak_concurrent };
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
  formatGpuChip,
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
