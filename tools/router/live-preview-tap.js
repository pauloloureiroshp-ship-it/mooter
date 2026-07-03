#!/usr/bin/env node
'use strict';
/*
 * live-preview-tap.js — Live Preview · MP0. ADDITIVE, read-only hook tap.
 *
 * A standalone hook that observes the runtime and appends one normalized event to the
 * Live Preview file-bus (<workspace>/_handoff/live-preview/events.jsonl). It does the
 * mapping/append via packages/vscode-extension/src/hook-collector.js — this file is only
 * the thin runtime glue so the WIRED ~/.claude/hooks/ copy can reach the collector.
 *
 * GUARANTEES (so it can be wired next to any existing hook without risk):
 *   • ADDITIVE — never touches the turn-end accumulator or any other hook's behavior.
 *   • read-only over the runtime — records what happened, decides nothing.
 *   • fail-soft — a missing collector, bad stdin, or write error never throws; always exit 0,
 *     never blocks the turn (emits a benign continue:true passthrough).
 *
 * Usage (when armed): wired as an extra entry in the PostToolUse / UserPromptSubmit / Stop /
 * Task* hook arrays, passing the hook name as argv[2], e.g.
 *   node ~/.claude/hooks/live-preview-tap.js PostToolUse
 * NOTE: arming (settings.json wiring + sync-hooks WIRED_HOOKS/install.sh lockstep) is a
 * separate shared-config step — left out of MP0 on purpose.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function homeDir() { return process.env.HOME || process.env.USERPROFILE || os.homedir(); }
function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }
function safeJson(str) { try { return JSON.parse(str); } catch { return null; } }

// Locate hook-collector.js. In-repo __dirname is tools/router (2 levels under the repo root);
// the mirrored ~/.claude/hooks copy falls back to the ~/frugal convention used by sync-hooks.js.
function loadCollector() {
  const candidates = [
    process.env.MOOTER_HOOK_COLLECTOR,
    path.join(__dirname, '..', '..', 'packages', 'vscode-extension', 'src', 'hook-collector.js'),
    path.join(homeDir(), 'frugal', 'packages', 'vscode-extension', 'src', 'hook-collector.js'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return require(c); } catch { /* try next */ }
  }
  return null;
}

(function main() {
  try {
    const hookName = process.argv[2] || process.env.CLAUDE_HOOK_NAME || '';
    const payload = safeJson(readStdin()) || {};
    const col = loadCollector();
    if (col && typeof col.mapEvent === 'function' && typeof col.appendEvent === 'function') {
      const evt = col.mapEvent(hookName, payload);
      if (evt) {
        const ws = payload.cwd || payload.workspace || payload.workspace_dir
          || (payload.session && payload.session.cwd) || process.cwd();
        try { col.appendEvent(ws, evt); } catch { /* fail-soft */ }
      }
    }
  } catch { /* never block the turn */ }
  try { process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true })); } catch {}
  process.exit(0);
})();
