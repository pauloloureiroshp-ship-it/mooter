#!/usr/bin/env node
'use strict';

// Moo card — Stop hook (Wave 2.6 Day 3). Prints a compact per-turn summary of
// which Moo the Mooter pastored the turn to. OPT-IN: silent unless the user has
// run `mooter quiet --moo-card` (preferences.json `moo_card_enabled === true`).
//
// Honesty: decisions.log carries tier / model / backend / confidence / prompt_len
// per classified event — but NOT per-turn tokens / latency / cost. So the card
// reports only those real fields plus the session tier-mix; the turn cost line
// appears ONLY if the savings-tracker is reachable (best-effort, short timeout),
// never fabricated. Like every hook, it must NEVER throw — all paths exit 0.

const fs = require('fs');
const path = require('path');
const os = require('os');

function routerDir() {
  // Mirror paths.js resolution; fall back to ~/.claude/tools/router.
  try {
    return require('./paths').ROUTER_DIR || path.join(os.homedir(), '.claude', 'tools', 'router');
  } catch {
    const claude = process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || path.join(os.homedir(), '.claude');
    return path.join(claude, 'tools', 'router');
  }
}

/** Read ~/.mooter/preferences.json (or override path). Missing/bad → {}. */
function readPrefs(prefsPath) {
  try {
    const p = prefsPath || path.join(os.homedir(), '.mooter', 'preferences.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch {
    return {};
  }
}

/** True only when the user explicitly enabled the card (default OFF). */
function mooCardEnabled(prefs) {
  return !!(prefs && prefs.moo_card_enabled === true);
}

/**
 * Last classified event for this session + the session tier-mix, read straight
 * from decisions.log. Returns null when there is nothing to report.
 * @param {string|undefined} sessionId
 * @param {string} [logPath]
 */
function aggregateLastTurn(sessionId, logPath) {
  const p = logPath || path.join(routerDir(), 'decisions.log');
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
  const events = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || e.event !== 'classified') continue;
    if (e.source === 'mooter-tester') continue;
    if (sessionId && e.session_id && e.session_id !== 'unknown' && e.session_id !== sessionId) continue;
    events.push(e);
  }
  if (!events.length) return null;
  const last = events[events.length - 1];
  const counts = { T0: 0, T1: 0, T2: 0, T3: 0 };
  for (const e of events.slice(-10)) if (e.tier && e.tier in counts) counts[e.tier]++;
  return {
    tier: last.tier || 'T?',
    model: last.recommended_model || 'unknown',
    backend: last.recommended_backend,
    confidence: typeof last.confidence === 'number' ? last.confidence : null,
    promptLen: typeof last.prompt_len === 'number' ? last.prompt_len : null,
    tierMix: `T0:${counts.T0} T1:${counts.T1} T2:${counts.T2} T3:${counts.T3}`,
  };
}

function shortModel(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('gpt')) return 'gpt';
  if (m.includes('gemini')) return 'gemini';
  if (/qwen|llama|deepseek|gemma|mistral|phi/.test(m)) return 'ollama';
  return m || 'unknown';
}

/**
 * Wave 13 "Show the Herd" — the end-of-session Moo tally. Lists every subagent
 * class that worked, local Moos (🐄) first then cloud agents (☁), with peak
 * concurrent (shown always, T-4). Latency only for local Moos the tracker
 * actually measured; cloud rows show their model short-name. No per-Moo cost is
 * shown — the tracker has no cost data and we never fabricate it.
 * @param {object|null} snap  subagent_tracker.snapshot() result
 * @param {{verbosity?:string}} [opts]
 * @returns {string} the section text (no trailing newline), or '' when empty/silent
 */
function buildHerdSection(snap, { verbosity = 'standard' } = {}) {
  if (verbosity === 'silent') return '';
  if (!snap || !Array.isArray(snap.cumulative) || !snap.cumulative.length) return '';
  const peak = Number(snap.peak_concurrent) || 0;
  const lines = [` Moos that worked the session  (peak concurrent: ${peak})`];
  // Local Moos first, then cloud; each already count-desc from the snapshot.
  const rows = snap.cumulative.slice().sort((a, b) => (b.local === a.local ? 0 : b.local ? 1 : -1));
  for (const r of rows) {
    const glyph = r.local ? '🐄' : '☁';
    const name = String(r.agent_name).slice(0, 20).padEnd(20);
    let detail = '';
    if (r.local && Number(r.avg_ms) > 0) detail = `avg ${Math.round(Number(r.avg_ms))}ms`;
    else if (!r.local && r.model) detail = shortModel(r.model);
    const err = Number(r.errors) > 0 ? ` · ${r.errors}⚠` : '';
    lines.push(`   ${glyph} ${name} × ${r.count}${detail ? '   ' + detail : ''}${err}`);
  }
  return lines.join('\n');
}

/**
 * Render the Moo card. `turnCost` is an optional `{ turn, saved }` object from
 * the tracker — omitted entirely when null (never faked). Pure given its input.
 * @param {object} s  aggregateLastTurn result
 * @param {{turn:number, saved:number}|null} [turnCost]
 * @param {{herd?:object|null, verbosity?:string}} [opts]  Wave 13 herd section
 */
function buildMooCard(s, turnCost, opts = {}) {
  let glyph;
  try {
    const { glyphFor, providerBucket } = require('./glyphs.js');
    glyph = glyphFor({ tier: s.tier, provider: providerBucket(s.backend) });
  } catch {
    glyph = '🐮';
  }
  const conf = s.confidence === null ? '—' : s.confidence.toFixed(2);
  const lines = [
    '',
    '─────── 🐮 Moo card ───────',
    ` moo       ${glyph} ${shortModel(s.model)} (${s.tier})`,
    ` confidence ${conf}`,
  ];
  if (s.promptLen !== null) lines.push(` prompt    ${s.promptLen} chars`);
  if (turnCost && typeof turnCost.turn === 'number') {
    const saved = typeof turnCost.saved === 'number' ? ` · saved $${turnCost.saved.toFixed(4)} vs T3` : '';
    lines.push(` cost      $${turnCost.turn.toFixed(4)} turn${saved}`);
  }
  lines.push(` last10    ${s.tierMix}`);
  // Wave 2.8 Ponto #7 — quant line for local Moos (omitted for cloud models).
  try {
    const { detectQuantization } = require('./quantization.js');
    const q = detectQuantization(s.model);
    if (q) lines.push(` quant     ${q.format} (baseline · ~-${q.reduction_vs_fp16}% vs FP16)`);
  } catch { /* omit quant line */ }
  // Wave 2.8 Ponto #8 — honest adapter line (parity with dashboard ADAPTER).
  lines.push(' adapter   ◌ baseline · add one with `mooter forge install <gguf>`');
  // Wave 13 "Show the Herd" — append the session Moo tally when the tracker has data.
  const herdSection = opts && opts.herd ? buildHerdSection(opts.herd, { verbosity: opts.verbosity }) : '';
  if (herdSection) {
    lines.push('───────────────────────────');
    lines.push(herdSection);
  }
  lines.push('───────────────────────────');
  lines.push('');
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────
// Wave 19 (19.D) — full session report. Expands the Wave 13 herd tally into a
// per-tier token + reason + hardware + savings digest, composed from the Day
// 1-3 + Wave 13 sources. Opt-in (`session_report_enabled`), rendered on stderr
// (Wave 13.1). Every figure is REAL — token counts from the transcript (Day 1),
// costs from pricing.js × those real tokens, reasons from decisions_v2 (Day 3).
// A section whose source is absent is omitted, never fabricated.
// ────────────────────────────────────────────────────────────────────────

/** True only when the user opted into the full session report (default OFF). */
function sessionReportEnabled(prefs) {
  return !!(prefs && prefs.session_report_enabled === true);
}

const TIER_LABEL = {
  T0: 'T0 (local ollama)',
  T1: 'T1 (haiku-4-5)  ',
  T2: 'T2 (sonnet-4-6) ',
  T3: 'T3 (opus-4-6)   ',
};

function fmtTok(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
}

function fmtDur(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

/** USD for a tier's real token totals, via pricing.js (T0 → $0.00). */
function tierCost(tier, tin, tout) {
  try {
    const { priceTurn, TIER_TO_PRICING_KEY } = require('./pricing.js');
    return priceTurn(TIER_TO_PRICING_KEY[tier], tin, tout);
  } catch {
    return 0;
  }
}

/** Group decisions_v2 records by tier+reason, count-desc, with the dominant via. */
function groupReasons(records) {
  const groups = new Map();
  for (const r of records || []) {
    if (!r || !r.tier) continue;
    const key = `${r.tier} ${r.reason || '?'}`;
    const g = groups.get(key) || { tier: r.tier, reason: r.reason || '?', count: 0, vias: {} };
    g.count += 1;
    const via = r.via && r.via !== 'inline' ? r.via : null;
    if (via) g.vias[via] = (g.vias[via] || 0) + 1;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => {
      const top = Object.entries(g.vias).sort((a, b) => b[1] - a[1])[0];
      return { tier: g.tier, reason: g.reason, count: g.count, via: top ? top[0] : null };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * Wave 20 (20.F) — full per-task breakdown from decisions_v2 (Day 3). One line
 * per routed task: op → llm · tokens_in→out · (via) · reason. Privacy: there is
 * NO prompt text in decisions_v2 (whitelisted schema), so each task is labelled by
 * its op/category — never the prompt. Display is capped (newest-last) with an
 * honest "showing last N of M" header so a long session never silently truncates.
 * @param {Array} records decisions_v2 records
 * @param {{limit?:number}} [opts]
 * @returns {string[]} indented lines
 */
function buildPerTaskLines(records, { limit = 25 } = {}) {
  const recs = Array.isArray(records) ? records.filter((r) => r && r.tier) : [];
  if (!recs.length) return ['  (no decisions logged this session)'];
  const shown = recs.slice(-limit);
  const startIdx = recs.length - shown.length;
  const lines = [];
  if (startIdx > 0) lines.push(`  (showing last ${shown.length} of ${recs.length} tasks)`);
  let dv2 = null;
  try { dv2 = require('./decisions_v2.js'); } catch { dv2 = null; }
  shown.forEach((r, i) => {
    const n = startIdx + i + 1;
    const op = String(r.op || 'task');
    const llm = r.llm || (dv2 ? dv2.shortLlm(undefined, r.tier) : (r.tier || '?'));
    const tin = Number(r.tokens_in) || 0;
    const tout = Number(r.tokens_out) || 0;
    const tok = (tin || tout) ? ` · ${fmtTok(tin)}→${fmtTok(tout)}` : '';
    const via = r.via && r.via !== 'inline' ? ` (via ${r.via})` : '';
    lines.push(`  ${n}. ${op} → ${llm}${tok}${via} · ${r.reason || '?'}`);
  });
  return lines;
}

/**
 * Render the full session report. Pure given its inputs (all sources injected),
 * so the integration test drives it without files, a tracker, or a GPU.
 * @param {object} d
 * @param {object|null} d.tokens   token_tracker.snapshot() — per-tier {calls,tokens_in,tokens_out}
 * @param {Array}       d.records  decisions_v2 records (Day 3)
 * @param {object|null} d.hardware {model?, quant?:{format,reduction}, adapter?:{name,trained}, vram?:{pct,usedGb,totalGb}}
 * @param {object|null} d.herd     subagent_tracker.snapshot()
 * @param {object|null} d.context  {ctxPct?:number|null, anthRemPct?:number|null}
 * @param {number}      [d.durationMs]
 * @returns {string}
 */
function buildSessionReport(d = {}) {
  const tokens = d.tokens || {};
  const lines = [];
  lines.push('');
  lines.push(`🐮 Mooter session report${d.durationMs ? ` — ${fmtDur(d.durationMs)}` : ''}`);

  // ── TOKENS BY TIER (real counts from token_tracker; cost from pricing.js) ──
  lines.push('');
  lines.push('  TOKENS BY TIER');
  let spent = 0;
  let opusBaseline = 0;
  let anyTier = false;
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    const s = tokens[t];
    if (!s) continue;
    const tin = Number(s.tokens_in) || 0;
    const tout = Number(s.tokens_out) || 0;
    const calls = Number(s.calls) || 0;
    if (calls === 0 && tin + tout === 0) continue;
    anyTier = true;
    const cost = tierCost(t, tin, tout);
    spent += cost;
    opusBaseline += tierCost('T3', tin, tout); // what these tokens would cost at Opus
    lines.push(`  ${TIER_LABEL[t]}  ${fmtTok(tin + tout)} tokens · ${calls} calls · $${cost.toFixed(2)}`);
  }
  if (!anyTier) lines.push('  (no LLM calls recorded this session)');

  // ── CHOICE REASONS (decisions_v2, Day 3) ──
  const reasons = groupReasons(d.records);
  lines.push('');
  lines.push('  CHOICE REASONS');
  if (reasons.length === 0) {
    lines.push('  (no decisions logged this session)');
  } else {
    for (const g of reasons.slice(0, 8)) {
      const via = g.via ? ` (delegated to ${g.via})` : '';
      lines.push(`  ${g.count}× ${g.tier} → ${g.reason}${via}`);
    }
  }

  // ── PER-TASK BREAKDOWN (decisions_v2, Day 3 — Wave 20 20.F) ──
  // CHOICE REASONS above is the aggregate; this is the full per-task trail so the
  // digest answers "what did each call route to + why", not just the grouped count.
  if (Array.isArray(d.records) && d.records.length) {
    lines.push('');
    lines.push('  PER-TASK BREAKDOWN');
    for (const l of buildPerTaskLines(d.records)) lines.push(l);
  }

  // ── HARDWARE STATE ──
  const hw = d.hardware || {};
  const hwLines = [];
  if (hw.model || hw.quant) {
    const q = hw.quant ? ` · Quant ${hw.quant.format}${hw.quant.reduction ? ` (-${hw.quant.reduction}% vs FP16)` : ''}` : '';
    hwLines.push(`  Model: ${hw.model || 'local'}${q}`);
  }
  if (hw.adapter) {
    const trained = hw.adapter.trained > 0 ? ` · trained on ${hw.adapter.trained} decisions` : '';
    hwLines.push(`  Adapter: ${hw.adapter.name || 'baseline'}${trained}`);
  }
  if (hw.vram && hw.vram.totalGb > 0) {
    hwLines.push(`  GPU: ${hw.vram.pct}% VRAM (${hw.vram.usedGb.toFixed(1)}/${Math.round(hw.vram.totalGb)} GB)`);
  }
  if (hwLines.length) {
    lines.push('');
    lines.push('  HARDWARE STATE');
    lines.push(...hwLines);
  }

  // ── HERD (Wave 13 + Day 2) ──
  if (d.herd && Array.isArray(d.herd.cumulative) && d.herd.cumulative.length) {
    const total = d.herd.cumulative.reduce((n, r) => n + (Number(r.count) || 0), 0);
    const peak = Number(d.herd.peak_concurrent) || 0;
    const top = d.herd.cumulative.slice().sort((a, b) => b.count - a.count)[0];
    lines.push('');
    lines.push('  HERD');
    const avg = top && Number(top.avg_ms) > 0 ? ` · ${top.agent_name} avg ${Math.round(top.avg_ms)}ms` : '';
    lines.push(`  ${total} Moo(s) spawned${avg} · peak concurrent: ${peak}`);
  }

  // ── CONTEXT ──
  const ctx = d.context || {};
  const ctxLines = [];
  if (typeof ctx.ctxPct === 'number') ctxLines.push(`  Ctx used: ${ctx.ctxPct}%`);
  if (typeof ctx.anthRemPct === 'number') ctxLines.push(`  Claude Max: ${ctx.anthRemPct}% remaining · 5h reset (local estimate)`);
  if (ctxLines.length) {
    lines.push('');
    lines.push('  CONTEXT');
    lines.push(...ctxLines);
  }

  // ── SAVINGS (real tokens × pricing.js; vs an all-Opus baseline) ──
  if (anyTier) {
    const saved = Math.max(0, opusBaseline - spent);
    const pct = opusBaseline > 0 ? Math.round((saved / opusBaseline) * 100) : 0;
    lines.push('');
    lines.push('  SAVINGS');
    lines.push(`  Saved vs all-Opus: $${saved.toFixed(2)} (${pct}% reduction)`);
    lines.push(`  Total spent: $${spent.toFixed(2)}`);
  }

  lines.push('');
  return lines.join('\n');
}

/** Best-effort tracker read (short timeout). Returns null on any failure. */
async function fetchTurnCost(sessionId) {
  try {
    const base = 'http://127.0.0.1:7821/metrics';
    const url = sessionId ? `${base}?session_id=${encodeURIComponent(sessionId)}` : base;
    const res = await fetch(url, { signal: AbortSignal.timeout(300) });
    if (!res.ok) return null;
    const m = await res.json();
    const turn = Number(m && m.last_turn_cost_usd);
    if (!Number.isFinite(turn)) return null;
    return { turn, saved: Number(m.saved) || 0 };
  } catch {
    return null;
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    try {
      process.stdin.on('data', (c) => { buf += c.toString(); });
      process.stdin.on('end', () => resolve(buf));
    } catch { resolve(buf); }
    setTimeout(() => resolve(buf), 200); // non-blocking for non-TTY
  });
}

/**
 * Collect the 5 report sources for a session. Every source is independently
 * best-effort — a missing module/file drops that section, never throws.
 * @returns {object} the `d` payload for buildSessionReport()
 */
function gatherReport(sessionId, { herd = null, stdinJson = null } = {}) {
  const out = { tokens: null, records: [], hardware: {}, herd, context: {}, durationMs: 0 };

  // Day 1 — real per-tier tokens (force a final transcript sync at Stop).
  try { out.tokens = require('./token_tracker.js').snapshot(sessionId, { sync: true }); } catch { /* none */ }

  // Day 3 — per-call decisions (also derives session duration from first/last ts).
  try {
    out.records = require('./decisions_v2.js').readRecords({ limit: 1000 });
    if (out.records.length >= 2) {
      const t0 = Date.parse(out.records[0].ts);
      const t1 = Date.parse(out.records[out.records.length - 1].ts);
      if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) out.durationMs = t1 - t0;
    }
  } catch { /* none */ }

  // Hardware — local model + quant (Wave 12), adapter + Pastor tune count (Day 2/Tier C), live VRAM (Day 2).
  try {
    const model = 'qwen3:30b';
    out.hardware.model = model;
    try {
      const { detectQuantization } = require('./quantization.js');
      const q = detectQuantization(model);
      if (q) out.hardware.quant = { format: q.format, reduction: q.reduction_vs_fp16 };
    } catch { /* omit quant */ }
    let trained = 0;
    try { trained = Number(JSON.parse(fs.readFileSync(path.join(routerDir(), 'tuning-state.json'), 'utf8')).sample_size) || 0; } catch { /* 0 */ }
    let name = 'baseline';
    try { const a = require('./adapter_selection.js').getActiveAdapter(); if (a && a.name) name = a.name; } catch { /* baseline */ }
    out.hardware.adapter = { name, trained };
    try {
      const live = require('./hardware_live.js').vramSnapshot();
      if (live && live.totalMb > 0) out.hardware.vram = { pct: live.pct, usedGb: live.usedMb / 1024, totalGb: live.totalMb / 1024 };
    } catch { /* omit vram */ }
  } catch { /* omit hardware */ }

  // Context — ctx% from Claude Code stdin; Claude Max 5h from quota-state.json.
  try {
    const pu = stdinJson && stdinJson.context && stdinJson.context.percent_used;
    if (Number.isFinite(Number(pu))) out.context.ctxPct = Math.max(0, Math.min(100, Math.round(Number(pu))));
  } catch { /* omit ctx */ }
  try {
    const quota = JSON.parse(fs.readFileSync(path.join(routerDir(), 'quota-state.json'), 'utf8'));
    const w = quota && quota.providers && quota.providers.anthropic && quota.providers.anthropic.window_5h;
    if (w && typeof w.limit === 'number' && w.limit > 0) {
      out.context.anthRemPct = Math.max(0, Math.min(100, Math.round((1 - (w.tokens_used || 0) / w.limit) * 100)));
    }
  } catch { /* omit quota */ }

  return out;
}

async function main() {
  const prefs = readPrefs();
  const enabled = mooCardEnabled(prefs); // opt-in; silent by default
  const reportOn = sessionReportEnabled(prefs); // Wave 19 19.D — full report, opt-in

  const stdinJson = await readStdin();
  let sessionId;
  try { sessionId = JSON.parse(stdinJson || '{}').session_id; } catch { /* ignore */ }
  sessionId = sessionId || process.env.CLAUDE_SESSION_ID;

  // Wave 13 — snapshot the herd BEFORE we reset it; Stop is the canonical tally.
  let herd = null;
  let verbosity = 'standard';
  try {
    verbosity = require('./post_tool_badge.js').herdVisibility(prefs);
    herd = require('./subagent_tracker.js').snapshot({ session_id: sessionId });
  } catch { herd = null; }

  try {
    if (reportOn) {
      // Wave 19 (19.D) — full session report supersedes the compact Moo card.
      let stdinObj = null;
      try { stdinObj = JSON.parse(stdinJson || '{}'); } catch { /* ignore */ }
      const d = gatherReport(sessionId, { herd, stdinJson: stdinObj });
      process.stderr.write(buildSessionReport(d));
    } else if (enabled) {
      const stats = aggregateLastTurn(sessionId);
      if (stats) {
        const turnCost = await fetchTurnCost(sessionId);
        // Wave 13.1 — emit on stderr, NOT stdout. The Stop digest is purely
        // visual; on shells that inherit the hook's stdout (WSL/Linux bash), any
        // stdout line is replayed into the host prompt's input buffer after exit
        // ("🐮: command not found"). stderr is shown to the user but never fed
        // back to the shell as input. Same on macOS/Windows. (Day-5 repro, WSL2.)
        process.stderr.write(buildMooCard(stats, turnCost, { herd, verbosity }));
      } else {
        // No classified turn this session, but Moos may still have worked —
        // surface the tally on its own rather than swallowing it.
        const section = buildHerdSection(herd, { verbosity });
        if (section) process.stderr.write('\n' + section + '\n');
      }
    }
  } finally {
    // Always reset per-session herd state at Stop — even when the card is off or
    // a turn never classified — so counts never leak into the next session.
    try { require('./subagent_tracker.js').reset({ session_id: sessionId }); } catch { /* ignore */ }
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(() => process.exit(0)); // hooks never throw
}

module.exports = {
  readPrefs, mooCardEnabled, aggregateLastTurn, buildMooCard, shortModel, buildHerdSection,
  // Wave 19 (19.D) — full session report
  sessionReportEnabled, buildSessionReport, groupReasons, gatherReport, fmtTok, fmtDur, tierCost,
  // Wave 20 (20.F) — per-task breakdown
  buildPerTaskLines,
};
