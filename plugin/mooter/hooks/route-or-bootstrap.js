#!/usr/bin/env node
/**
 * route-or-bootstrap.js — mooter plugin hook (UserPromptSubmit).
 *
 * Three states, zero duplication, never blocks:
 *  1. Runtime installed AND the native mooter hook is registered in
 *     ~/.claude/settings.json → stay SILENT (the native hook does the work;
 *     emitting here would duplicate the router hint).
 *  2. Runtime installed but native hook NOT registered (edge: partial
 *     install) → delegate to the runtime's inject_context.js directly.
 *  3. Runtime absent → suggest the one-command install, at most once per
 *     session (state file keyed by session_id under os.tmpdir()).
 *
 * Doctrine: a statusline/hook must NEVER throw or block the user's prompt —
 * every path is wrapped; on any error we exit 0 silently.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function main() {
  const raw = readStdin();
  let payload = {};
  try { payload = JSON.parse(raw || '{}'); } catch { /* tolerate */ }

  const home = os.homedir();
  const runtimeHook = path.join(home, '.claude', 'tools', 'router', 'inject_context.js');
  const settingsPath = path.join(home, '.claude', 'settings.json');

  let runtimePresent = false;
  let nativeHookRegistered = false;
  try { runtimePresent = fs.existsSync(runtimeHook); } catch { /* no */ }
  try {
    const settings = fs.readFileSync(settingsPath, 'utf8');
    nativeHookRegistered = settings.includes('inject_context.js');
  } catch { /* no settings — treat as not registered */ }

  // State 1 — native pipeline active: silence (no duplication).
  if (runtimePresent && nativeHookRegistered) return;

  // State 2 — runtime present, hook missing: delegate once per prompt.
  if (runtimePresent) {
    try {
      const res = spawnSync(process.execPath, [runtimeHook], {
        input: raw, encoding: 'utf8', timeout: 4000,
      });
      if (res.stdout) process.stdout.write(res.stdout);
    } catch { /* never block the prompt */ }
    return;
  }

  // State 3 — bootstrap hint, once per session.
  try {
    const session = String(payload.session_id || 'unknown').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
    const marker = path.join(os.tmpdir(), `mooter-plugin-hint-${session}`);
    if (fs.existsSync(marker)) return;
    fs.writeFileSync(marker, new Date().toISOString());
    process.stdout.write(
      '<mooter-plugin>mooter is installed as a plugin but its routing engine is not set up yet. ' +
      'To activate routing (local models + cost savings), tell the user they can run: npx @mooter/cli ' +
      '— then restart the session. Until then mooter stays silent.</mooter-plugin>\n'
    );
  } catch { /* silent */ }
}

try { main(); } catch { /* absolute never-throw guarantee */ }
process.exit(0);
