#!/usr/bin/env node
/**
 * statusline-modes.js — Wave 32 (Phase B) explicit statusline modes.
 *
 * The statusline (statusline-multi.js) has always auto-selected its layout from
 * terminal width: < 120 cols → 1 line, ≥ 120 → 2 lines, + opt-in line 3. That
 * adaptive default is PRESERVED byte-for-byte — this module only kicks in when
 * the user has explicitly pinned a mode:
 *
 *   mini      1 line  — headline only (savings + tier badge)
 *   compact   2 lines — headline + operational chips (line 3 forced OFF)
 *   full      3 lines — compact + synthesis chips (line 3 forced ON)
 *   didactic  5 lines — human-friendly, explains each number
 *
 * Mode source (in precedence order):
 *   1. env MOOTER_STATUSLINE_MODE
 *   2. ~/.mooter/preferences.json { "statusline_mode": "..." }
 *   3. null → caller keeps the adaptive width-based default (UNCHANGED)
 *
 * preferences.json is the established home for statusline prefs (statusline_line3,
 * hidden_chips, herd_visibility …). We reuse it rather than introduce a new TOML
 * file + parser dependency. Pure Node built-ins; injected renderers keep this
 * module free of a circular require on statusline-multi.js.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const VALID_MODES = ['mini', 'compact', 'full', 'didactic'];

function prefsPath() {
  return path.join(os.homedir(), '.mooter', 'preferences.json');
}

/**
 * Resolve the pinned statusline mode, or null for the adaptive default.
 * Best-effort: any read/parse failure → null (default behavior, never throws).
 * @returns {('mini'|'compact'|'full'|'didactic')|null}
 */
function readMode() {
  const env = process.env.MOOTER_STATUSLINE_MODE;
  if (env && VALID_MODES.includes(env)) return env;
  try {
    const prefs = JSON.parse(fs.readFileSync(prefsPath(), 'utf8'));
    const m = prefs && prefs.statusline_mode;
    if (typeof m === 'string' && VALID_MODES.includes(m)) return m;
  } catch { /* fall through */ }
  return null;
}

/**
 * Dispatch to the renderer for an explicit mode. Returns null when `mode` is not
 * one of the four explicit modes, so the caller falls back to its adaptive
 * width-based default (the byte-identical legacy path).
 *
 * @param {string|null} mode
 * @param {object} ctx  the statusline context (from buildContext)
 * @param {{renderFromContext:Function, renderTwoLine:Function, helpers?:object}} R
 *        injected renderers from statusline-multi.js (avoids circular require)
 * @returns {string|null}
 */
function renderForMode(mode, ctx, R) {
  switch (mode) {
    case 'mini':
      return R.renderFromContext(ctx);
    case 'compact':
      return R.renderTwoLine(ctx, { forceLine3: false });
    case 'full':
      return R.renderTwoLine(ctx, { forceLine3: true });
    case 'didactic':
      return renderDidactic(ctx, R.helpers || {});
    default:
      return null;
  }
}

/**
 * Compose the 5-line human-friendly didactic view. Every line names what it
 * measures in plain language so a first-time user can read the routing story
 * without a legend. Built purely from ctx fields already present (no invented
 * data): a field that is absent yields an honest "—" rather than a fake number.
 *
 * @param {object} ctx
 * @param {{colorize?:Function, ANSI?:object, COLOR_GLYPH?:object}} helpers
 * @returns {string}
 */
function renderDidactic(ctx, helpers = {}) {
  const colorize = helpers.colorize || ((_c, s) => String(s));
  const ANSI = helpers.ANSI || { green: '', yellow: '', red: '', blue: '', dim: '', reset: '' };
  const c = (ctx && ctx.counts) || { T0: 0, T1: 0, T2: 0, T3: 0, codex: 0 };
  const total = (ctx && ctx.total) || 0;

  // Line 1 — the headline outcome: money saved.
  const savedUsd = typeof ctx.savedUsd === 'number' ? `$${ctx.savedUsd.toFixed(2)}` : '—';
  const savedPct = typeof ctx.savedPct === 'number' ? `${Math.round(ctx.savedPct)}%` : '—';
  const l1 = `🐮 Mooter saved you ${savedUsd} so far (${savedPct} vs running everything on Opus).`;

  // Line 2 — where the work went, in words.
  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const localPct = pct(c.T0);
  const l2 = `   Of ${total} routed turns: ${localPct}% ran FREE on your machine (T0 🏠), ` +
    `${pct(c.T1)}% on Haiku, ${pct(c.T2)}% on Sonnet, ${pct(c.T3)}% on Opus.`;

  // Line 3 — the last decision, explained.
  let l3;
  if (ctx.last && ctx.last.tier) {
    const tier = ctx.last.tier;
    const why = {
      T0: 'trivial/local — kept off the cloud',
      T1: 'cheap cloud (Haiku) — simple but needs a model',
      T2: 'mid cloud (Sonnet) — real reasoning',
      T3: 'top cloud (Opus) — architecture/critical',
    }[tier] || 'classified';
    const conf = Number.isFinite(ctx.last.confidence) ? ` at ${(ctx.last.confidence * 100).toFixed(0)}% confidence` : '';
    l3 = `   Last turn → ${tier}: ${why}${conf}.`;
  } else {
    l3 = `   Last turn → no decision recorded yet. Make a request to see routing.`;
  }

  // Line 4 — budget / quota in plain terms.
  const anth = typeof ctx.anthRem === 'number'
    ? `You have ${ctx.anthRem}% of your Claude 5h window left`
    : `Claude quota unknown`;
  const herd = ctx.herd && typeof ctx.herd.active === 'number' && ctx.herd.active > 0
    ? `; ${ctx.herd.active} local worker${ctx.herd.active === 1 ? '' : 's'} running now`
    : '';
  // Wave 33 (A.2) — session age, when the transcript birth time is known.
  const fmtAge = helpers.formatSessionAge;
  const sess = typeof ctx.sessionAge === 'number' && fmtAge
    ? `; this session has run ${fmtAge(ctx.sessionAge)}`
    : '';
  const l4 = `   ${anth}${herd}${sess}.`;

  // Line 5 — the actionable takeaway.
  let takeaway;
  if (total === 0) {
    takeaway = 'Run `mooter init` if you have not set up yet.';
  } else if (localPct >= 50) {
    takeaway = 'Most work is staying local — that is the savings engine working.';
  } else if (typeof ctx.savedPct === 'number' && ctx.savedPct < 30) {
    takeaway = 'Low savings — check tier mix with `mooter trail`.';
  } else {
    takeaway = 'Tip: `mooter effort set high` compresses prompts for deeper savings.';
  }
  const l5 = `   ${colorize(ANSI.dim, '↳ ' + takeaway)}`;

  return [l1, l2, l3, l4, l5].join('\n');
}

module.exports = { VALID_MODES, readMode, renderForMode, renderDidactic, prefsPath };
