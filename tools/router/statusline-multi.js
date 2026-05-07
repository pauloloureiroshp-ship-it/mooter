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

/** Best-effort sync GET with hard timeout. Returns null on any failure. */
function readSavingsSync() {
  return new Promise((resolve) => {
    const req = http.get(TRACKER_URL, { timeout: TRACKER_TIMEOUT_MS }, (res) => {
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
 */
function digest(lines) {
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
  } = ctx;

  // ── Empty (cold start, no classified events yet today) ────────────────
  if (dataMissing && total === 0) {
    return {
      color:    'empty',
      headline: 'no data yet — make a request',
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
    lastLabel = `${tier} ${tag} ${conf}`;
  }

  const proofParts = [];
  if (lastLabel !== '—') proofParts.push(lastLabel);
  if (typeof anthRem === 'number') proofParts.push(`${anthRem}% 5h`);
  if (total) proofParts.push(`${total}t`);
  const proof = proofParts.join(' · ') || '—';

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

  // ── GREEN: default healthy state ──────────────────────────────────────
  if (typeof savedUsd === 'number' && typeof savedPct === 'number') {
    return {
      color:    'green',
      headline: `mooter saved $${savedUsd.toFixed(2)} today (${Math.round(savedPct)}%)`,
      proof,
    };
  }

  // ── GREEN fallback: tracker down but data present ─────────────────────
  return {
    color:    'green',
    headline: `routing healthy — $${todayCost.toFixed(2)} spent`,
    proof,
  };
}

const COLOR_GLYPH = {
  green:  '🟢',
  yellow: '🟡',
  red:    '🔴',
  empty:  '⚪',
};

// ────────────────────────────────────────────────────────────────────────
// Render
// ────────────────────────────────────────────────────────────────────────

/**
 * Pure render function — no I/O. Takes a context object and returns the
 * one-line statusline. Used by tests and by the demo modes.
 */
function renderFromContext(ctx) {
  const state = pickState(ctx);
  return `${COLOR_GLYPH[state.color]} ${state.headline.padEnd(38)} │ ${state.proof}`;
}

async function buildContext() {
  const quota = readQuota() || {};
  const lines = readDecisionsTail();
  const { counts, total, last, recent } = digest(lines);

  const anthRem    = computeAnthropicRem(quota);
  const codexRem   = computeCodexRem(quota);
  const codexLeft  = computeCodexMessagesLeft(quota);

  const todayCost =
    ((quota.providers && quota.providers.anthropic && quota.providers.anthropic.today.cost_usd) || 0) +
    ((quota.providers && quota.providers.openai_api && quota.providers.openai_api.today.cost_usd) || 0);

  const metrics = await readSavingsSync();
  const savedUsd = metrics && Number.isFinite(Number(metrics.saved)) ? Number(metrics.saved) : null;
  const savedPct = metrics && Number.isFinite(Number(metrics.saved_pct)) ? Number(metrics.saved_pct) : null;

  return {
    counts, total, last, recent,
    anthRem, codexRem, codexLeft,
    savedUsd, savedPct, todayCost,
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
    process.stdout.write(renderFromContext(DEMO_CONTEXTS[argv[1]]) + '\n');
    return;
  }

  const ctx = await buildContext();
  process.stdout.write(renderFromContext(ctx) + '\n');
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
  digest,
  computeAnthropicRem,
  computeCodexRem,
  computeCodexMessagesLeft,
  beastOverkillPct,
  zenUnderkillPct,
  avgConfidence,
  // Demo contexts kept on the export so consumers can render previews.
  DEMO_CONTEXTS,
  TH,
};
