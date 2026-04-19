#!/usr/bin/env node
// mooter-dashboard.js — companion window that shows the multi-line mooter
// dashboard beside a claude session. Reuses gsd-statusline.js rendering
// via MOOTER_FORCE_MULTILINE=1 so the design stays a single source of truth.
//
// Usage (typically spawned by mooter launcher):
//   node mooter-dashboard.js
//
// Env:
//   MOOTER_DASHBOARD_REFRESH_MS   refresh interval, default 2000
//   COLUMNS                        target width, default process.stdout.columns || 140
//
// Exit: Ctrl+C — graceful shutdown with a parting message.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const STATUSLINE_SCRIPT = path.join(__dirname, 'gsd-statusline.js');
const REFRESH_MS = parseInt(process.env.MOOTER_DASHBOARD_REFRESH_MS || '2000', 10);
const BRIDGE_MAX_AGE_MS = 10 * 60 * 1000; // 10 min = "claude still alive"

// ANSI helpers (mirror gsd-statusline palette for title line consistency).
const BRAND = '\x1b[38;2;194;95;101m';
const DIM   = '\x1b[2m';
const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';

function findLatestBridge() {
  try {
    const tmp = os.tmpdir();
    const files = fs.readdirSync(tmp)
      .filter(f => f.startsWith('claude-ctx-') && f.endsWith('.json'))
      .map(f => {
        const p = path.join(tmp, f);
        try { return { path: p, mtime: fs.statSync(p).mtimeMs }; }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
    // Only pick bridges updated recently — stale ones are zombie sessions.
    const recent = files.find(f => Date.now() - f.mtime < BRIDGE_MAX_AGE_MS);
    if (!recent) return null;
    return JSON.parse(fs.readFileSync(recent.path, 'utf8'));
  } catch {
    return null;
  }
}

function renderOnce() {
  const bridge = findLatestBridge();
  const remaining = bridge && typeof bridge.remaining_percentage === 'number'
    ? bridge.remaining_percentage
    : 100;
  const sessionId = (bridge && bridge.session_id) || 'dashboard';

  const input = JSON.stringify({
    model: { display_name: bridge && bridge.model ? bridge.model : 'Claude' },
    session_id: sessionId,
    context_window: { remaining_percentage: remaining },
  });

  const cols = process.stdout.columns || parseInt(process.env.COLUMNS || '140', 10) || 140;
  const r = spawnSync(process.execPath, [STATUSLINE_SCRIPT], {
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      MOOTER_FORCE_MULTILINE: '1',
      COLUMNS: String(cols),
    },
    windowsHide: true,
    timeout: 2500,
  });

  const dashboard = (r.stdout || '').trimEnd();

  const ts = new Date().toLocaleTimeString();
  const title = `${BRAND}${BOLD}🐮 mooter dashboard${RESET}`;
  const hint  = `${DIM}refresh every ${(REFRESH_MS / 1000).toFixed(0)}s · Ctrl+C to close${RESET}`;
  const stamp = `${DIM}updated ${ts}${RESET}`;

  // Clear screen + scrollback + move cursor home.
  // [3J wipes scrollback (Windows Terminal keeps history otherwise → append effect).
  process.stdout.write('\x1B[3J\x1B[2J\x1B[H');
  process.stdout.write(`${title}   ${hint}   ${stamp}\n\n`);

  if (!dashboard) {
    process.stdout.write(`${DIM}⚠ gsd-statusline.js produced no output — check that it exists at:${RESET}\n  ${STATUSLINE_SCRIPT}\n`);
    return;
  }

  process.stdout.write(dashboard);
  process.stdout.write('\n');

  if (!bridge) {
    process.stdout.write(`\n${DIM}⏳ No active claude session detected yet. The dashboard will update automatically once a session writes to the bridge.${RESET}\n`);
  } else {
    const ageS = Math.round((Date.now() - fs.statSync(path.join(os.tmpdir(), `claude-ctx-${sessionId}.json`)).mtimeMs) / 1000);
    const ageLabel = ageS < 60 ? `${ageS}s ago` : `${Math.round(ageS / 60)}m ago`;
    process.stdout.write(`\n${DIM}session ${sessionId.slice(0, 8)} · last heartbeat ${ageLabel}${RESET}\n`);
  }
}

// Initial paint.
renderOnce();

// Periodic refresh.
const timer = setInterval(() => {
  try { renderOnce(); } catch (e) { /* never crash the dashboard */ }
}, REFRESH_MS);

// Graceful exit on SIGINT / terminal close.
function shutdown() {
  clearInterval(timer);
  process.stdout.write(`\n\n${BRAND}${BOLD}🐮 mooter dashboard${RESET} ${DIM}closed.${RESET}\n`);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
