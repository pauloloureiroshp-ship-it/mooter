'use strict';
// lp-aggregates.js — Live Preview · Director's Cut v2 · F1 (host-side aggregates, ZERO UI).
//
// Pure data layer in the data.js mould (fs + os only, NO `vscode`, fully testable): crosses
// the sources that already exist — the file-bus (hook-collector.js schema), decisions.log
// (data.js::readDecisions shape), execution.log (exec-logger.js line format), pricing.js
// (tier-based cost ESTIMATES) and the fleet JSONs (_handoff/fleet/*) — into three read-only,
// nullable snapshot fields the Director's Cut lenses will render in a later wave:
//
//   byDay   — activity bucketed per LOCAL day (events × decisions × exec ops × ~est cost)
//   byModel — LLM × operation breakdown (exec ops + routed decisions + ~est cost + savings)
//   fleet   — parallel-fleet lanes (heartbeat.running[] joined with per-pillar STATE.json)
//
// ── HONESTY RULES (the golden rule of the whole feature — never bend these) ─────────────
//   • EVERY field is nullable; a value we cannot source stays null (render shows n/d).
//     No data at all → the whole aggregate is null (render shows "sem dados ainda").
//   • Costs are tier-based ESTIMATES via pricing.js::estimateTurnCost — NEVER token-exact.
//     Field names carry the suffix `EstUsd` and `costBasis:'tier-est'` so no consumer can
//     mistake them for measured spend; decisions we could NOT cost are counted in
//     `costUncounted`, never silently folded into the sum. No pricing module → cost null.
//   • Day buckets use the LOCAL timezone (same honesty fix as renderDirectorsCut's clock()).
//     An event with a missing/unparseable ts cannot be placed honestly → counted in
//     `window.unplaced`, never guessed into a day.
//   • These are WINDOWED views (bus tail ≤500 events, decisions tail ≤80, exec tail ≤400
//     lines), not full history — every aggregate carries a `window` block saying exactly
//     how much was seen, so the render can say "janela recente", not "tudo".
//   • model=unknown / session=unknown in execution.log are sentinels, not facts → null
//     (unattributed ops are counted in `window.opsUnattributed`, not shown as a fake model).
//   • Fleet: heartbeat absent → running is UNKNOWN (null), not false. dry_run / empty
//     running[] → `resting:true` so the lens can say "frota em repouso" honestly.
//
// Fail-soft everywhere (house pattern): any fs error, garbage line or bad input degrades to
// [] / null — never throws, never crashes the panel. Additive: nothing here mutates any
// existing snapshot field; extension.js merely attaches the three new nullable keys.

const fs = require('fs');
const os = require('os');
const path = require('path');

const EXECUTION_LOG = path.join(os.homedir(), '.claude', 'hooks', 'execution.log');

// ── small honesty helpers (mirror hook-collector.js's s()/num() discipline) ─────────────
function str(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  const m = (typeof max === 'number' && max > 0) ? max : 200;
  return t.length > m ? t.slice(0, m) : t;
}
function num(v) { return (typeof v === 'number' && Number.isFinite(v)) ? v : null; }
function uniqueList(items) {
  const seen = new Set(); const out = [];
  for (const item of (Array.isArray(items) ? items : [])) { if (item && !seen.has(item)) { seen.add(item); out.push(item); } }
  return out;
}

// ── dayKeyOf(ts) — LOCAL-day bucket key (YYYY-MM-DD) or null ────────────────────────────
// Local timezone on purpose: the user lives in local time (see the clock() UTC bugfix in
// live-preview-view.js). ts == null guarded explicitly — new Date(null) is a VALID date
// (epoch 1970) and would fabricate a 1970-01-01 bucket.
function dayKeyOf(ts) {
  if (ts == null) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const p2 = function (n) { return n < 10 ? '0' + n : String(n); };
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}

// ── execution.log parsing (exec-logger.js line contract) ────────────────────────────────
// One line per Bash/Agent call:
//   [<ISO>] session=<id> model=<model> role=<role> cmd=<text…> resolve_ms=<n> mode=<m>
// Older lines may lack the trailing resolve_ms/mode pair; cmd may contain spaces. For
// subagent spawns cmd is the marker `agent:<type>` (see exec-logger.js v0.12).
const EXEC_LINE_RE = /^\[([^\]]+)\]\s+session=(\S+)\s+model=(\S+)\s+role=(\S*)\s+cmd=(.*)$/;

function parseExecutionLog(text, maxN) {
  const out = [];
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = EXEC_LINE_RE.exec(line);
    if (!m) continue; // garbage / truncated first line of a tail-read — tolerate
    let cmd = m[5] || '';
    cmd = cmd.replace(/\s*resolve_ms=\d+\s+mode=\S+\s*$/, '').trim();
    const agent = cmd.indexOf('agent:') === 0 ? (str(cmd.slice(6), 60) || null) : null;
    out.push({
      ts: str(m[1], 40),
      sid: m[2] === 'unknown' ? null : str(m[2], 200),      // sentinel → honest null
      model: m[3] === 'unknown' ? null : str(m[3], 80),     // sentinel → honest null
      role: str(m[4], 40),
      cmd: str(cmd, 80),
      op: agent ? 'agent' : 'bash',
      agent: agent,
    });
  }
  const cap = (typeof maxN === 'number' && maxN > 0) ? maxN : 400;
  return out.length > cap ? out.slice(out.length - cap) : out;
}

// Tail-read execution.log (last 64KB max — never the whole file; same technique as
// data.js::readDecisions / extension.js::readBusTail). Fail-soft: [] on any error.
function readExecutionTail(maxN, logPath) {
  try {
    const file = logPath || EXECUTION_LOG;
    const st = fs.statSync(file);
    if (!st.isFile() || st.size === 0) return [];
    const start = Math.max(0, st.size - 64 * 1024);
    const fd = fs.openSync(file, 'r');
    let buf;
    try {
      buf = Buffer.alloc(st.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
    } finally { fs.closeSync(fd); }
    return parseExecutionLog(buf.toString('utf8'), maxN);
  } catch { return []; }
}

// ── pricing (tier-based ~est — reuse tools/router/pricing.js, NEVER re-implement) ───────
// ONLY the wired runtime mirror (~/.claude/tools/router — what /mooter-update ships) is a
// candidate: loading it executes the user's OWN mooter runtime, the same trust domain as
// the CLI execs the cockpit already spawns. The WORKSPACE checkout is deliberately NOT a
// candidate — the manifest promises untrusted workspaces that we "never execute workspace
// code", and require()ing <wsRoot>/tools/router/pricing.js would break that promise.
// (Tests/dev inject an explicit path via collectAggregates' pricingPaths instead.)
// Absent/broken → null → every cost field stays honestly null.
function pricingCandidates() {
  try { return [path.join(os.homedir(), '.claude', 'tools', 'router', 'pricing.js')]; } catch { return []; }
}

function loadPricing(candidates) {
  for (const c of (Array.isArray(candidates) ? candidates : [])) {
    try {
      if (!c || !fs.existsSync(c)) continue;
      const mod = require(c);
      if (mod && typeof mod.estimateTurnCost === 'function' && typeof mod.naiveOpusCost === 'function') return mod;
    } catch { /* unreadable/broken candidate — try the next */ }
  }
  return null;
}

// ── journal (host-side session summary — reuse ~/.claude/tools/router/handoff-journal.js, the
// SAME runtime-only resolution as pricing above; NEVER the workspace copy). Best-effort: any
// failure (module/file absent, unreadable) leaves it null and the panel says "sem resumo local
// ainda". Never throws.
function journalCandidates() {
  try { return [path.join(os.homedir(), '.claude', 'tools', 'router', 'handoff-journal.js')]; } catch { return []; }
}
function loadJournalMod(paths) {
  const list = Array.isArray(paths) ? paths : [];
  for (let i = 0; i < list.length; i++) {
    try {
      const m = require(list[i]);
      if (m && typeof m.readSummary === 'function' && typeof m.summaryPath === 'function') return m;
    } catch { /* try next candidate */ }
  }
  return null;
}
// readJournal(sid, opts?) -> { text, updatedAt } | null. updatedAt = mtime (epoch ms) of the
// summary file, or null if unstattable. No sid / no module / no summary -> null (honest).
// opts.journalMod / opts.journalPaths are test injection seams (mirror pricingPaths).
function readJournal(sid, o) {
  o = o || {};
  if (!sid) return null;
  try {
    const mod = o.journalMod || loadJournalMod(o.journalPaths || journalCandidates());
    if (!mod) return null;
    const text = mod.readSummary(sid);
    if (!text) return null;
    let updatedAt = null;
    try { updatedAt = fs.statSync(mod.summaryPath(sid)).mtimeMs; } catch { updatedAt = null; }
    return { text: String(text), updatedAt: updatedAt };
  } catch { return null; }
}

// Tiers estimateTurnCost can honestly price (TIER_TO_PRICING_KEY domain). T5/@fable is
// opt-in-only and has no auto-routing price key — its decisions are counted as
// costUncounted, never priced as $0 (a fabricated zero is still a fabrication).
const COSTABLE_TIERS = { T0: true, T1: true, T2: true, T3: true };

// decisionCostEst(pricing, d) → USD estimate or null (null = cannot cost honestly).
function decisionCostEst(pricing, d) {
  if (!pricing || !d || !COSTABLE_TIERS[d.tier]) return null;
  try {
    const v = pricing.estimateTurnCost(d.tier, num(d.prompt_len) || 0);
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  } catch { return null; }
}

// decisionNaiveOpusEst(pricing, d) → what the same prompt would cost all-Opus, or null.
function decisionNaiveOpusEst(pricing, d) {
  if (!pricing || !d) return null;
  try {
    const v = pricing.naiveOpusCost(num(d.prompt_len) || 0);
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  } catch { return null; }
}

// ── byDay — activity bucketed per local day ──────────────────────────────────────────────
// input: { events, decisions, exec, pricing, maxDays } (all optional, all fail-soft).
// Returns null when the whole window holds nothing placeable — the render's honest
// "sem dados ainda" state — otherwise { days:[…newest first], window, costBasis }.
function buildByDay(input) {
  const o = input || {};
  const events = Array.isArray(o.events) ? o.events : [];
  const decisions = Array.isArray(o.decisions) ? o.decisions : [];
  const exec = Array.isArray(o.exec) ? o.exec : [];
  const pricing = o.pricing || null;
  const maxDays = (typeof o.maxDays === 'number' && o.maxDays > 0) ? o.maxDays : 14;

  const buckets = new Map();
  let unplaced = 0;
  function bucketOf(key) {
    let b = buckets.get(key);
    if (!b) {
      b = {
        day: key,
        events: { reason: 0, file: 0, task: 0, server: 0, other: 0, total: 0 },
        decisions: { total: 0, tiers: { T0: 0, T1: 0, T2: 0, T3: 0 }, pctLocal: null, costEstUsd: null, costCounted: 0, costUncounted: 0 },
        exec: { ops: 0, agentOps: 0, models: new Set() },
      };
      buckets.set(key, b);
    }
    return b;
  }

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const k = dayKeyOf(e && e.ts);
    if (!k) { unplaced++; continue; }
    const b = bucketOf(k);
    const kind = (e.kind === 'reason' || e.kind === 'file' || e.kind === 'task' || e.kind === 'server') ? e.kind : 'other';
    b.events[kind]++;
    b.events.total++;
  }

  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    if (!d) continue;
    const k = dayKeyOf(d.ts != null ? d.ts : d.ts_ms);
    if (!k) { unplaced++; continue; }
    const b = bucketOf(k);
    b.decisions.total++;
    if (b.decisions.tiers[d.tier] != null) b.decisions.tiers[d.tier]++;
    const c = decisionCostEst(pricing, d);
    if (c != null) {
      b.decisions.costEstUsd = (b.decisions.costEstUsd == null ? 0 : b.decisions.costEstUsd) + c;
      b.decisions.costCounted++;
    } else {
      b.decisions.costUncounted++;
    }
  }

  for (let i = 0; i < exec.length; i++) {
    const x = exec[i];
    const k = dayKeyOf(x && x.ts);
    if (!k) { unplaced++; continue; }
    const b = bucketOf(k);
    b.exec.ops++;
    if (x.op === 'agent') b.exec.agentOps++;
    if (x.model) b.exec.models.add(x.model);
  }

  if (buckets.size === 0) return null;

  const days = Array.from(buckets.values());
  days.sort(function (a, b) { return a.day < b.day ? 1 : (a.day > b.day ? -1 : 0); }); // newest first
  const shown = days.slice(0, maxDays);
  for (let i = 0; i < shown.length; i++) {
    const b = shown[i];
    const t = b.decisions.tiers;
    const tiered = t.T0 + t.T1 + t.T2 + t.T3;
    b.decisions.pctLocal = tiered > 0 ? Math.round((t.T0 / tiered) * 100) : null;
    b.exec.models = Array.from(b.exec.models).sort().slice(0, 8);
  }

  return {
    days: shown,
    window: {
      events: events.length, decisions: decisions.length, execOps: exec.length,
      unplaced: unplaced, daysTotal: days.length, daysShown: shown.length,
    },
    costBasis: pricing ? 'tier-est' : null, // 'tier-est' = pricing.js estimate — render labels "~est."
  };
}

// ── byModel — LLM × operation breakdown ──────────────────────────────────────────────────
// Rows come from the ONLY two per-model ground-truth sources: execution.log (ops actually
// run) and decisions.log (models the router recommended). Bus events almost never carry a
// model (nullable by contract) and are deliberately NOT a row source — no invented rows.
// Returns null when neither source names a single model.
function buildByModel(input) {
  const o = input || {};
  const decisions = Array.isArray(o.decisions) ? o.decisions : [];
  const exec = Array.isArray(o.exec) ? o.exec : [];
  const pricing = o.pricing || null;
  const maxModels = (typeof o.maxModels === 'number' && o.maxModels > 0) ? o.maxModels : 12;

  const rows = new Map();
  let opsUnattributed = 0;
  function rowOf(model) {
    let r = rows.get(model);
    if (!r) {
      r = {
        model: model,
        tier: null, local: null,
        ops: { bash: 0, agent: 0, total: 0 },
        routes: 0,
        costEstUsd: null, costCounted: 0, costUncounted: 0,
        _tierVotes: new Map(), // decisions-side fallback when pricing lacks the model
      };
      rows.set(model, r);
    }
    return r;
  }

  for (let i = 0; i < exec.length; i++) {
    const x = exec[i];
    if (!x) continue;
    if (!x.model) { opsUnattributed++; continue; } // sentinel/unresolved → never a fake row
    const r = rowOf(x.model);
    if (x.op === 'agent') r.ops.agent++; else r.ops.bash++;
    r.ops.total++;
  }

  let naiveOpusUsd = null, costEstUsd = null, costCounted = 0, costUncounted = 0;
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    if (!d || !d.recommended_model) continue;
    const r = rowOf(String(d.recommended_model).slice(0, 80));
    r.routes++;
    if (typeof d.tier === 'string' && d.tier) {
      r._tierVotes.set(d.tier, (r._tierVotes.get(d.tier) || 0) + 1);
    }
    const c = decisionCostEst(pricing, d);
    const n = decisionNaiveOpusEst(pricing, d);
    if (c != null && n != null) {
      r.costEstUsd = (r.costEstUsd == null ? 0 : r.costEstUsd) + c;
      r.costCounted++;
      costEstUsd = (costEstUsd == null ? 0 : costEstUsd) + c;
      naiveOpusUsd = (naiveOpusUsd == null ? 0 : naiveOpusUsd) + n;
      costCounted++;
    } else {
      r.costUncounted++;
      costUncounted++;
    }
  }

  if (rows.size === 0) return null;

  const prices = (pricing && pricing.PRICES && typeof pricing.PRICES === 'object') ? pricing.PRICES : null;
  const list = Array.from(rows.values());
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const p = prices ? prices[r.model] : null;
    if (p) {
      r.tier = (typeof p.tier === 'string') ? p.tier : null;
      r.local = (num(p.input) === 0 && num(p.output) === 0);
    } else if (prices && r.model.indexOf('ollama') === 0) {
      r.tier = 'T0';
      r.local = true;
    }
    if (r.tier == null && r._tierVotes.size) {
      // fallback: the tier the router itself most often attached to this model
      let best = null, bestN = 0;
      r._tierVotes.forEach(function (n2, t) { if (n2 > bestN) { bestN = n2; best = t; } });
      r.tier = best;
    }
    delete r._tierVotes;
  }

  list.sort(function (a, b) { return (b.ops.total + b.routes) - (a.ops.total + a.routes); });
  const shown = list.slice(0, maxModels);

  // savings vs all-Opus: only over the SAME decisions both estimates could price
  // (apples to apples) — null when pricing is absent or nothing was costable.
  const savedEstUsd = (costEstUsd != null && naiveOpusUsd != null) ? (naiveOpusUsd - costEstUsd) : null;

  return {
    models: shown,
    totals: {
      costEstUsd: costEstUsd, naiveOpusUsd: naiveOpusUsd, savedEstUsd: savedEstUsd,
      costCounted: costCounted, costUncounted: costUncounted,
    },
    window: {
      decisions: decisions.length, execOps: exec.length,
      opsUnattributed: opsUnattributed,
      modelsTotal: list.length, modelsShown: shown.length,
    },
    costBasis: pricing ? 'tier-est' : null,
  };
}

// ── fleet — parallel-fleet lanes from _handoff/fleet/* ──────────────────────────────────
// readFleet(fleetDir) → raw { heartbeat, roster, states } (each null/[] on absence).
// Bounded: at most 32 pillar dirs scanned, each STATE.json ≤ 64KB. Read-only, fail-soft.
function readFleet(fleetDir) {
  const out = { heartbeat: null, roster: null, states: [] };
  if (!fleetDir) return out;
  function readJson(f, maxBytes) {
    try {
      const st = fs.statSync(f);
      if (!st.isFile() || st.size === 0 || st.size > (maxBytes || 64 * 1024)) return null;
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch { return null; }
  }
  out.heartbeat = readJson(path.join(fleetDir, 'fleet-heartbeat.json'));
  out.roster = readJson(path.join(fleetDir, 'fleet.json'));
  try {
    const ents = fs.readdirSync(fleetDir, { withFileTypes: true }).filter(function (e) { return e.isDirectory(); }).slice(0, 32);
    for (let i = 0; i < ents.length; i++) {
      const st = readJson(path.join(fleetDir, ents[i].name, 'STATE.json'));
      if (st) out.states.push({ id: ents[i].name, state: st });
    }
  } catch { /* no fleet dir — honest empty */ }
  return out;
}

// buildFleet(raw) → { heartbeat, pillars, resting } | null (null = no fleet data at all).
// `running` per pillar is true/false ONLY when a heartbeat exists to say so; without a
// heartbeat we do not know → null (n/d), never a fabricated false.
function buildFleet(raw) {
  const r = raw || {};
  const hb = (r.heartbeat && typeof r.heartbeat === 'object') ? r.heartbeat : null;
  const rosterPillars = (r.roster && Array.isArray(r.roster.pillars)) ? r.roster.pillars : [];
  const states = Array.isArray(r.states) ? r.states : [];

  const running = (hb && Array.isArray(hb.running))
    ? hb.running.map(function (x) { return str(String(x == null ? '' : x), 60); }).filter(Boolean).slice(0, 16)
    : [];

  const stateById = new Map();
  for (let i = 0; i < states.length; i++) {
    const s2 = states[i];
    if (s2 && s2.id && s2.state && typeof s2.state === 'object') stateById.set(String(s2.id), s2.state);
  }

  const ids = [];
  const seen = new Set();
  for (let i = 0; i < rosterPillars.length; i++) {
    const p = rosterPillars[i];
    if (p && typeof p.id === 'string' && p.id && !seen.has(p.id)) { seen.add(p.id); ids.push(p.id); }
  }
  stateById.forEach(function (_v, id) { if (!seen.has(id)) { seen.add(id); ids.push(id); } });

  const pillars = [];
  for (let i = 0; i < ids.length && pillars.length < 24; i++) {
    const id = ids[i];
    let meta = null;
    for (let j = 0; j < rosterPillars.length; j++) { if (rosterPillars[j] && rosterPillars[j].id === id) { meta = rosterPillars[j]; break; } }
    const st = stateById.get(id) || null;
    pillars.push({
      id: str(id, 60),
      status: st ? str(st.status, 40) : null,
      round: st ? num(st.round) : null,
      updatedAt: st ? str(st.updated_at, 40) : null,
      running: hb ? (running.indexOf(id) !== -1) : null,
      priority: meta ? num(meta.priority) : null,
      gpuHeavy: meta ? (meta.gpu_heavy === true ? true : (meta.gpu_heavy === false ? false : null)) : null,
    });
  }
  pillars.sort(function (a, b) {
    const ra = a.running === true ? 1 : 0, rb = b.running === true ? 1 : 0;
    if (ra !== rb) return rb - ra;
    const pa = a.priority == null ? -1 : a.priority, pb = b.priority == null ? -1 : b.priority;
    if (pa !== pb) return pb - pa;
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });

  const heartbeat = hb ? {
    ts: str(hb.ts, 40),
    dryRun: hb.dry_run === true ? true : (hb.dry_run === false ? false : null),
    running: running,
    totalRounds: num(hb.total_rounds),
    pillarsIdle: num(hb.pillars_idle),
    pillarsDone: num(hb.pillars_done),
  } : null;

  if (!heartbeat && pillars.length === 0) return null;

  // resting: with a heartbeat we KNOW (dry_run or nothing running); without one → n/d.
  const resting = heartbeat ? (heartbeat.dryRun === true || running.length === 0) : null;
  return { heartbeat: heartbeat, pillars: pillars, resting: resting };
}

// ── MEO Control Tower — cross-agent executive projection ───────────────────────────────
// The ledger is LOCAL operational state. Tail-read only; absence is a visible coverage
// gap, never an empty-success state. Old v1 and current v2 rows are both accepted.
function readAgentSync(wsRoot, ledgerPath, maxN) {
  try {
    const file = ledgerPath || (wsRoot ? path.join(wsRoot, '_handoff', 'agent-sync', 'events.jsonl') : null);
    if (!file) return [];
    const st = fs.statSync(file);
    if (!st.isFile() || st.size === 0) return [];
    const start = Math.max(0, st.size - 256 * 1024);
    const fd = fs.openSync(file, 'r'); let buf;
    try { buf = Buffer.alloc(st.size - start); fs.readSync(fd, buf, 0, buf.length, start); }
    finally { fs.closeSync(fd); }
    const rows = [];
    for (const line of buf.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); if (e && typeof e === 'object' && e.ts) rows.push(e); } catch { /* truncated tail */ }
    }
    const cap = Number.isFinite(maxN) && maxN > 0 ? maxN : 400;
    return rows.length > cap ? rows.slice(rows.length - cap) : rows;
  } catch { return []; }
}

// local/subscription/cloud is a DISPLAY classification with an explicit basis. An explicit
// provider/local flag wins; model-family fallback is labelled `model-family`, never presented
// as connector proof. Unknown stays n/d.
function executionChannel(model, provider, local, explicitChannel) {
  const p = String(provider || '').toLowerCase();
  const m = String(model || '').toLowerCase();
  const explicit = String(explicitChannel || '').toLowerCase();
  if (explicit === 'local' || explicit === 'subscription' || explicit === 'api' || explicit === 'cloud') {
    return { channel: explicit, provider: provider || null, basis: 'typed-ledger' };
  }
  if (local === true || p === 'ollama' || p === 'local') return { channel: 'local', provider: provider || 'ollama', basis: local === true ? 'explicit-local' : 'explicit-provider' };
  if (local === false && p === 'anthropic') return { channel: 'subscription', provider: provider, basis: 'explicit-provider' };
  if (p === 'anthropic' || p === 'claude-code') return { channel: 'subscription', provider: provider || 'anthropic', basis: 'explicit-provider' };
  if (p === 'openai' || p === 'google' || p === 'fable') return { channel: 'cloud', provider: provider, basis: 'explicit-provider' };
  if (/qwen|llama|gemma|deepseek|mistral|phi|ollama/.test(m) || (m && m.indexOf(':') !== -1)) return { channel: 'local', provider: 'ollama', basis: 'model-family' };
  if (/^claude-|opus|sonnet|haiku/.test(m)) return { channel: 'subscription', provider: 'anthropic', basis: 'model-family' };
  if (/gemini/.test(m)) return { channel: 'cloud', provider: 'google', basis: 'model-family' };
  if (/gpt|codex|openai/.test(m)) return { channel: 'cloud', provider: 'openai', basis: 'model-family' };
  return { channel: null, provider: provider || null, basis: null };
}

function buildExecutive(input) {
  const o = input || {};
  const bus = Array.isArray(o.events) ? o.events : [];
  const exec = Array.isArray(o.exec) ? o.exec : [];
  const ledger = Array.isArray(o.ledger) ? o.ledger : [];
  const catalog = Array.isArray(o.sessions) ? o.sessions : [];
  const sessionById = new Map();
  for (const s of catalog) if (s && s.fullId) sessionById.set(s.fullId, s);

  function sessionOf(sid) { return sid ? (sessionById.get(sid) || null) : null; }
  function titleOf(sid, explicit) { const s = sessionOf(sid); return str(explicit, 160) || (s && str(s.title, 160)) || null; }
  function tsMs(ts) { const n = Date.parse(ts); return Number.isFinite(n) ? n : 0; }
  const timeline = [];

  for (const e of bus) {
    if (!e || typeof e !== 'object') continue;
    const ch = executionChannel(e.model, null, typeof e.local === 'boolean' ? e.local : null);
    timeline.push({
      ts: str(e.ts, 40), source: 'stream', kind: str(e.kind, 40), status: str(e.phase, 24),
      agent: e.sid ? 'claude-code' : null, attribution: e.sid ? 'live-preview-hook' : null,
      provider: ch.provider, channel: ch.channel, channelBasis: ch.basis,
      model: str(e.model, 120), tier: str(e.tier, 20), role: null,
      sid: str(e.sid, 120), sessionTitle: titleOf(e.sid),
      summary: str(e.summary || e.tool || e.path, 240), path: str(e.path, 400),
      wave: null, pr: null, targets: [], evidence: ['runtime'], git: null,
      notionRef: null, obsidianRef: null,
    });
  }

  for (const x of exec) {
    if (!x || typeof x !== 'object') continue;
    const ch = executionChannel(x.model, null, null);
    timeline.push({
      ts: str(x.ts, 40), source: 'execution', kind: x.op === 'agent' ? 'agent-op' : 'tool-op', status: null,
      agent: x.agent ? str(x.agent, 80) : (ch.channel === 'local' ? 'ollama' : 'claude-code'),
      attribution: x.agent ? 'execution-agent-marker' : (ch.basis ? 'execution-model-family' : 'execution-hook'),
      provider: ch.provider, channel: ch.channel, channelBasis: ch.basis,
      model: str(x.model, 120), tier: null, role: str(x.role, 60),
      sid: str(x.sid, 120), sessionTitle: titleOf(x.sid),
      summary: str(x.cmd, 240), path: null, wave: null, pr: null, targets: [],
      evidence: ['runtime'], git: null, notionRef: null, obsidianRef: null,
    });
  }

  for (const e of ledger) {
    if (!e || typeof e !== 'object') continue;
    const ch = executionChannel(e.model, e.provider, null, e.execution_channel || e.channel);
    timeline.push({
      ts: str(e.ts, 40), source: 'ledger', kind: str(e.kind, 40), status: str(e.status, 40),
      agent: str(e.agent, 80), attribution: 'typed-ledger',
      provider: ch.provider, channel: ch.channel, channelBasis: ch.basis,
      model: str(e.model, 120), tier: null, role: null,
      sid: str(e.session_id, 120), sessionTitle: titleOf(e.session_id, e.session_title),
      summary: str(e.summary, 700), path: str(e.artifact, 200),
      wave: str(e.wave, 120), pr: str(e.pr, 120),
      targets: Array.isArray(e.target_agents) ? e.target_agents.slice(0, 8) : [],
      evidence: Array.isArray(e.evidence) ? e.evidence.slice(0, 16) : [],
      git: e.git && typeof e.git === 'object' ? e.git : null,
      notionRef: str(e.notion_ref, 240), obsidianRef: str(e.obsidian_ref, 240),
    });
  }

  timeline.sort(function (a, b) { return tsMs(b.ts) - tsMs(a.ts); });
  const shownTimeline = timeline.slice(0, 240);

  const sessions = new Map();
  function sessionRow(sid) {
    const key = sid || '__unknown__';
    let r = sessions.get(key);
    if (!r) {
      const c = sessionOf(sid);
      r = {
        sid: sid || null, title: c ? c.title : null, lastTs: c && c.lastActiveTs ? new Date(c.lastActiveTs).toISOString() : null,
        models: new Set(), agents: new Set(), channels: new Set(), steps: 0,
        streamSteps: 0, executionSteps: 0, ledgerSteps: 0, handoffs: 0,
        wave: null, pr: null, branch: null,
        notionRef: c ? (c.notionPageId || null) : null, notionSyncedAt: c ? (c.notionSyncedAt || null) : null,
        obsidianRef: c ? (c.obsidianPath || null) : null, obsidianSyncedAt: c ? (c.obsidianSyncedAt || null) : null,
        handoffSentAt: c ? (c.handoffSentAt || null) : null,
      };
      sessions.set(key, r);
    }
    return r;
  }
  for (const c of catalog) if (c && c.fullId) sessionRow(c.fullId);
  for (const e of shownTimeline) {
    const r = sessionRow(e.sid);
    r.steps++;
    if (e.source === 'stream') r.streamSteps++; else if (e.source === 'execution') r.executionSteps++; else if (e.source === 'ledger') r.ledgerSteps++;
    if (e.model) r.models.add(e.model); if (e.agent) r.agents.add(e.agent); if (e.channel) r.channels.add(e.channel);
    if (!r.title && e.sessionTitle) r.title = e.sessionTitle;
    if (!r.lastTs || tsMs(e.ts) > tsMs(r.lastTs)) r.lastTs = e.ts;
    if (e.kind === 'handoff' || e.kind === 'brief') r.handoffs++;
    if (e.wave) r.wave = e.wave; if (e.pr) r.pr = e.pr;
    if (e.git && e.git.branch) r.branch = e.git.branch;
    if (e.notionRef) r.notionRef = e.notionRef; if (e.obsidianRef) r.obsidianRef = e.obsidianRef;
  }
  const sessionList = Array.from(sessions.values()).map(function (r) {
    r.models = Array.from(r.models).sort(); r.agents = Array.from(r.agents).sort(); r.channels = Array.from(r.channels).sort(); return r;
  }).sort(function (a, b) { return tsMs(b.lastTs) - tsMs(a.lastTs); }).slice(0, 60);

  const agentMap = new Map();
  for (const e of shownTimeline) {
    if (!e.agent) continue;
    let a = agentMap.get(e.agent);
    if (!a) { a = { agent: e.agent, steps: 0, lastTs: null, models: new Set(), channels: new Set(), sessions: new Set() }; agentMap.set(e.agent, a); }
    a.steps++; if (e.model) a.models.add(e.model); if (e.channel) a.channels.add(e.channel); if (e.sid) a.sessions.add(e.sid);
    if (!a.lastTs || tsMs(e.ts) > tsMs(a.lastTs)) a.lastTs = e.ts;
  }
  const agents = Array.from(agentMap.values()).map(function (a) {
    a.models = Array.from(a.models).sort(); a.channels = Array.from(a.channels).sort(); a.sessions = Array.from(a.sessions); return a;
  }).sort(function (a, b) { return tsMs(b.lastTs) - tsMs(a.lastTs); });

  const handoffs = shownTimeline.filter(function (e) { return e.source === 'ledger' && (e.kind === 'handoff' || e.kind === 'brief'); }).slice(0, 40);
  const mirrors = {
    notion: shownTimeline.filter(function (e) { return e.notionRef || e.evidence.indexOf('notion-export') !== -1; }).slice(0, 20),
    obsidian: shownTimeline.filter(function (e) { return e.obsidianRef || e.evidence.indexOf('obsidian-vault') !== -1; }).slice(0, 20),
  };
  const waves = uniqueList(ledger.map(function (e) { return str(e && e.wave, 120); }).filter(Boolean));
  const prs = uniqueList(ledger.map(function (e) { return str(e && e.pr, 120); }).filter(Boolean));
  const branches = uniqueList(ledger.map(function (e) { return e && e.git && str(e.git.branch, 160); }).filter(Boolean));
  const titled = sessionList.filter(function (s) { return !!s.title; }).length;
  const modelled = shownTimeline.filter(function (e) { return !!e.model; }).length;
  const warnings = [];
  if (!ledger.length) warnings.push('agent-sync Ledger ausente — handoffs e autoria cross-agent ficam n/d');
  if (titled < sessionList.length) warnings.push((sessionList.length - titled) + ' sessão(ões) sem título resolvido');
  if (modelled < shownTimeline.length) warnings.push((shownTimeline.length - modelled) + ' etapa(s) sem modelo atribuído');

  return {
    generatedAt: new Date().toISOString(), timeline: shownTimeline, sessions: sessionList, agents,
    handoffs, mirrors, delivery: { waves, prs, branches },
    coverage: {
      ledgerPresent: ledger.length > 0, ledgerEvents: ledger.length, streamEvents: bus.length,
      executionOps: exec.length, sessions: sessionList.length, titledSessions: titled,
      steps: shownTimeline.length, modelAttributedSteps: modelled, warnings,
    },
  };
}

// ── collectAggregates — the ONE call extension.js::livePreviewSnapshot() makes ───────────
// opts: { wsRoot, events, decisions, sessions?, execLogPath?, ledgerPath?, pricingPaths?, fleetDir?, maxExec? }.
// Every sub-aggregate is isolated in its own try/catch: one broken source NEVER nulls the
// others (fail-soft per lens — harmonization rule §8 of the handoff).
function collectAggregates(opts) {
  const o = opts || {};
  const wsRoot = (typeof o.wsRoot === 'string' && o.wsRoot) ? o.wsRoot : null;

  let exec = [];
  try { exec = readExecutionTail(o.maxExec || 400, o.execLogPath || EXECUTION_LOG); } catch { exec = []; }

  let pricing = null;
  try { pricing = loadPricing(o.pricingPaths || pricingCandidates()); } catch { pricing = null; }

  let byDay = null;
  try { byDay = buildByDay({ events: o.events, decisions: o.decisions, exec: exec, pricing: pricing }); } catch { byDay = null; }

  let byModel = null;
  try { byModel = buildByModel({ decisions: o.decisions, exec: exec, pricing: pricing }); } catch { byModel = null; }

  let fleet = null;
  try {
    const dir = o.fleetDir || (wsRoot ? path.join(wsRoot, '_handoff', 'fleet') : null);
    fleet = buildFleet(readFleet(dir));
  } catch { fleet = null; }

  let executive = null;
  try {
    const ledger = readAgentSync(wsRoot, o.ledgerPath, o.maxLedger || 400);
    executive = buildExecutive({ events: o.events, exec: exec, ledger: ledger, sessions: o.sessions });
  } catch { executive = null; }

  return { byDay: byDay, byModel: byModel, fleet: fleet, executive: executive };
}

module.exports = {
  EXECUTION_LOG,
  dayKeyOf,
  parseExecutionLog,
  readExecutionTail,
  pricingCandidates,
  loadPricing,
  journalCandidates,
  loadJournalMod,
  readJournal,
  decisionCostEst,
  decisionNaiveOpusEst,
  buildByDay,
  buildByModel,
  readFleet,
  buildFleet,
  readAgentSync,
  executionChannel,
  buildExecutive,
  collectAggregates,
};
