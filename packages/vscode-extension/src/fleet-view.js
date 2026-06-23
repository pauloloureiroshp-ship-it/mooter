// fleet-view.js — reads fleet buses + renders the 🚀 Fleet tab (cockpit add-on)
// Pure fs (no spawn), robust to missing/truncated files.
// Exports: readFleet, renderFleetTab, approvePillar, stopPillar.
'use strict';

const fs = require('fs');
const path = require('path');

const FLEET_REL = path.join('_handoff', 'fleet');

// ── Safe readers ────────────────────────────────────────────────────────────
function safeRead(fp) {
  try { return fs.readFileSync(fp, 'utf8'); } catch { return null; }
}

function safeJson(fp) {
  const raw = safeRead(fp);
  if (!raw) return null;
  try { return JSON.parse(raw.trim()); } catch { return null; }
}

// Last valid JSON line in a .jsonl file (tolerates truncated last line).
function lastJsonLine(fp) {
  const raw = safeRead(fp);
  if (!raw) return null;
  const lines = raw.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch { /* try next */ }
  }
  return null;
}

// Scan backward through a .jsonl for the first line that has a `did` or `DID` field.
function findLastDid(fp) {
  const raw = safeRead(fp);
  if (!raw) return null;
  const lines = raw.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(lines[i]);
      if (j && (j.did || j.DID)) return String(j.did || j.DID);
    } catch { /* skip */ }
  }
  return null;
}

// ── readFleet ────────────────────────────────────────────────────────────────
// Returns { heartbeat, lastFleetEvent, pillars: [...], at }.
// Never throws — all reads are guarded.
function readFleet(repoRoot) {
  const fleetDir = path.join(String(repoRoot || ''), FLEET_REL);

  // Global state
  const heartbeat = safeJson(path.join(fleetDir, 'fleet-heartbeat.json')) || {};
  const lastFleetEvent = lastJsonLine(path.join(fleetDir, 'fleet-ledger.jsonl'));

  // Discover pilar directories
  let pillarNames = [];
  try {
    pillarNames = fs.readdirSync(fleetDir).filter(f => {
      try { return fs.statSync(path.join(fleetDir, f)).isDirectory(); } catch { return false; }
    });
  } catch { /* fleet dir absent — return empty fleet */ }

  const pillars = pillarNames.map(name => {
    const pdir = path.join(fleetDir, name);
    const state  = safeJson(path.join(pdir, 'STATE.json')) || { status: 'idle', round: 0, pillar: name };
    const hb     = safeJson(path.join(pdir, 'heartbeat.json'));
    const lastLedger = lastJsonLine(path.join(pdir, 'ledger.jsonl'));
    const lastDid    = findLastDid(path.join(pdir, 'ledger.jsonl'));
    const askRaw     = safeRead(path.join(pdir, 'ASK_HUMAN.md'));

    // Derive cost: prefer pilar heartbeat, fall back to ledger field
    const cost = (hb && hb.cost != null) ? hb.cost
               : (lastLedger && lastLedger.cost != null) ? lastLedger.cost
               : null;

    return {
      name,
      status:    String(state.status  || 'idle'),
      round:     state.round    != null ? +state.round    : 0,
      maxRounds: state.maxRounds != null ? +state.maxRounds : (heartbeat.total_rounds != null ? +heartbeat.total_rounds : null),
      lastLedger,
      lastDid,
      askHuman:     !!askRaw,
      askHumanText: askRaw ? askRaw.slice(0, 250) : null,
      cost,
    };
  });

  return { heartbeat, lastFleetEvent, pillars, at: Date.now() };
}

// ── HTML helpers ─────────────────────────────────────────────────────────────
function esc(x) {
  return String(x == null ? '' : x)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const PILL_DEFS = {
  cc_running:     { label: 'running',      bg: 'rgba(76,175,106,.18)',  col: '#4CAF6A', border: '#4CAF6A' },
  awaiting_eval:  { label: 'eval',         bg: 'rgba(90,155,212,.16)',  col: '#5A9BD4', border: '#5A9BD4' },
  awaiting_human: { label: '👤 needs you', bg: 'rgba(229,192,123,.18)', col: '#E5C07B', border: '#E5C07B' },
  done:           { label: 'done ✓',       bg: 'rgba(76,175,106,.18)',  col: '#4CAF6A', border: '#4CAF6A' },
  stopped:        { label: 'stopped',      bg: 'rgba(232,136,138,.18)', col: '#E8888A', border: '#E8888A' },
  idle:           { label: 'idle',         bg: 'transparent',           col: '#8A8076', border: '#8A8076' },
};

function statusPill(status) {
  const p = PILL_DEFS[status] || PILL_DEFS.idle;
  return `<span style="display:inline-block;font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;border:1px solid ${p.border};background:${p.bg};color:${p.col};white-space:nowrap">${esc(p.label)}</span>`;
}

function ledgerLine(ev) {
  if (!ev) return '—';
  const parts = [];
  if (ev.event) parts.push(ev.event);
  if (ev.ok    != null) parts.push(ev.ok ? 'ok' : 'fail');
  if (ev.ts)   parts.push(String(ev.ts).slice(11, 19));
  return parts.join(' · ') || JSON.stringify(ev).slice(0, 60);
}

// ── renderFleetTab ────────────────────────────────────────────────────────────
function renderFleetTab(fleet) {
  if (!fleet || !fleet.pillars) {
    return '<div class="fleetwrap"><div class="empty" style="padding:24px 8px;color:var(--vscode-descriptionForeground)">Fleet data unavailable — run the fleet orchestrator first.</div></div>';
  }

  const pillars = fleet.pillars;
  const hb      = fleet.heartbeat || {};

  const nRunning  = pillars.filter(p => p.status === 'cc_running').length;
  const nQueued   = pillars.filter(p => p.status === 'idle' || p.status === 'awaiting_eval').length;
  const nHuman    = pillars.filter(p => p.status === 'awaiting_human').length;
  const nDone     = pillars.filter(p => p.status === 'done').length;
  const nStopped  = pillars.filter(p => p.status === 'stopped').length;
  const totalCost = pillars.reduce((s, p) => s + (p.cost || 0), 0);

  // Global running slots from heartbeat
  const slots = Array.isArray(hb.running) && hb.running.length ? hb.running.join(', ') : null;

  const header = `
<div class="fleetwrap-header">
  <div class="lbl" style="margin-bottom:7px">🚀 Fleet — ${pillars.length} pilares</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;margin-bottom:5px">
    <span style="color:#4CAF6A"><b>${nRunning}</b> running</span>
    <span style="opacity:.7"><b>${nQueued}</b> queued</span>
    ${nHuman  ? `<span style="color:#E5C07B"><b>${nHuman}</b> needs you</span>` : ''}
    <span style="color:#4CAF6A"><b>${nDone}</b> done</span>
    ${nStopped ? `<span style="color:#E8888A"><b>${nStopped}</b> stopped</span>` : ''}
    <span style="margin-left:auto;opacity:.65">total $${totalCost.toFixed(2)}</span>
  </div>
  ${slots ? `<div style="font-size:9.5px;opacity:.6">GPU: ${esc(slots)}</div>` : ''}
  ${hb.dry_run ? '<div style="font-size:9px;color:#E5C07B;margin-top:3px">⚠ dry_run=true — no real CC sessions</div>' : ''}
</div>`;

  const cards = pillars.map(p => {
    const isNeeds   = p.status === 'awaiting_human';
    const isRunning = p.status === 'cc_running';
    const isDone    = p.status === 'done';
    const accentCol = isNeeds ? '#E5C07B' : (isRunning || isDone) ? '#4CAF6A' : 'var(--vscode-widget-border)';

    const roundStr = (p.round != null && p.maxRounds != null)
      ? `rnd ${p.round}/${p.maxRounds}`
      : (p.round != null ? `rnd ${p.round}` : '');

    const gateBlock = p.askHuman
      ? `<div style="font-size:10px;color:#E5C07B;margin:3px 0 5px;word-break:break-word">👤 Gate: ${esc((p.askHumanText || '').split('\n')[0].slice(0, 80))}</div>`
      : '';

    const approveDisabled = !isNeeds   ? 'disabled style="opacity:.35;cursor:default"' : '';
    const stopDisabled    = (isDone || p.status === 'stopped') ? 'disabled style="opacity:.35;cursor:default"' : '';

    return `
<div class="fleetwrap-card" style="border-left:3px solid ${accentCol}">
  <div class="fleetwrap-row">
    <span class="fleetwrap-name">${esc(p.name)}</span>
    ${statusPill(p.status)}
    ${roundStr ? `<span class="fleetwrap-rnd">${esc(roundStr)}</span>` : ''}
    ${p.cost != null ? `<span class="fleetwrap-cost">$${p.cost.toFixed(3)}</span>` : ''}
  </div>
  ${p.lastDid ? `<div class="fleetwrap-did"><span class="fleetwrap-dimkey">DID:</span> ${esc(String(p.lastDid).slice(0, 80))}</div>` : ''}
  <div class="fleetwrap-ledger"><span class="fleetwrap-dimkey">ledger:</span> ${esc(ledgerLine(p.lastLedger).slice(0, 80))}</div>
  ${gateBlock}
  <div class="fleetwrap-btns">
    <button class="sm" data-fleet="approve:${esc(p.name)}" ${approveDisabled}>Approve</button>
    <button class="sm" data-fleet="stop:${esc(p.name)}" ${stopDisabled}>Stop</button>
  </div>
</div>`;
  });

  return `<div class="fleetwrap">${header}${cards.join('')}</div>`;
}

// ── Action handlers (called from extension.js onDidReceiveMessage) ────────────
// ctx = { runInTerminal: fn, mooterCmd: fn }
function approvePillar(pilarName, ctx) {
  if (!pilarName || !ctx || !ctx.runInTerminal) return;
  const cmd = ctx.mooterCmd ? ctx.mooterCmd(`mooter fleet approve ${pilarName}`) : `mooter fleet approve ${pilarName}`;
  ctx.runInTerminal(cmd);
}

function stopPillar(pilarName, ctx) {
  if (!pilarName || !ctx || !ctx.runInTerminal) return;
  const cmd = ctx.mooterCmd ? ctx.mooterCmd(`mooter fleet stop ${pilarName}`) : `mooter fleet stop ${pilarName}`;
  ctx.runInTerminal(cmd);
}

module.exports = { readFleet, renderFleetTab, approvePillar, stopPillar };
