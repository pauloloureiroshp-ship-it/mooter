// data.js — pure data layer for mooter-cockpit (no vscode dependency → testable).
// Contracts validated in F0-VALIDATION-REPORT (decisions.log v1, tracker 0.7.0).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const DECISIONS_LOG = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
const RUNTIME_HOOK = path.join(os.homedir(), '.claude', 'tools', 'router', 'inject_context.js');
const RUNTIME_CLASSIFY = path.join(os.homedir(), '.claude', 'tools', 'router', 'classify.js');

function httpJson(port, pathname, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Management/status subcommands that a CLI poll (e.g. the cockpit's own
// `mooter slash-commands status` health check) can echo into decisions.log as a
// throwaway "prompt" when it is mis-routed through the claude launcher. These are
// NOT real routing decisions or sessions — filtering them keeps the cockpit
// showing real work instead of probe noise. The launcher itself is fixed at the
// source (tools/router/mooter.ps1); this is the non-destructive read-side guard
// that also hides the historical pollution already on disk.
const MGMT_SUBCOMMANDS = new Set([
  'slash-commands', 'savings', 'route', 'explain', 'digest', 'local', 'tier',
  'mcp', 'vision', 'bench', 'why-not-fable', 'trail', 'pack', 'status',
  'summary', 'feedback', 'focus', 'effort', 'init', 'doctor', 'update',
  'login', 'dashboard',
]);

// True when `text` looks like a CLI management/status invocation echoed as a
// prompt (short, first token is a known subcommand) — never a real sentence.
function isProbePrompt(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t || t.length > 40) return false; // a real prompt sentence, not a CLI echo
  return MGMT_SUBCOMMANDS.has(t.split(/\s+/)[0]);
}

// Parse "classified" entries from a raw chunk of decisions.log text.
// Tolerates: garbage lines, partial first line, unknown events, missing fields.
// Probe/management echoes (e.g. "slash-commands status") are dropped as noise.
function parseDecisions(text, maxN = 80) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      if (j && j.event === 'classified' && !isProbePrompt(j.prompt_preview)) out.push(j);
    } catch { /* tolerate */ }
  }
  return out.slice(-maxN).reverse(); // newest first
}

// Tail-read the log (last 256KB max — never the whole file).
function readDecisions(maxN = 80, logPath = DECISIONS_LOG) {
  try {
    const stat = fs.statSync(logPath);
    const start = Math.max(0, stat.size - 256 * 1024);
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return parseDecisions(buf.toString('utf8'), maxN);
  } catch { return []; }
}

// Webview-safe projection: only the fields the UI needs, previews capped.
function publicSnapshot(s) {
  return {
    runtimeInstalled: !!s.runtimeInstalled,
    trackerUp: !!s.trackerUp,
    metrics: s.metrics || null,
    last: s.last || null,
    decisions: (s.decisions || []).slice(0, 40).map((d) => ({
      ts: d.ts, tier: d.tier, cat: d.task_category, model: d.recommended_model,
      conf: d.confidence, preview: String(d.prompt_preview || '').slice(0, 90),
      rule: d.escalation_rule, sid: d.session_id,
    })),
  };
}

// Status-bar text from a snapshot (pure → testable).
function statusBarText(s) {
  if (!s.runtimeInstalled) return '🐮 mooter: setup';
  const tier = (s.last && s.last.tier) || (s.decisions && s.decisions[0] && s.decisions[0].tier) || '—';
  const saved = s.metrics && typeof s.metrics.saved === 'number' ? `$${s.metrics.saved.toFixed(2)}↓` : '';
  return `🐮 ${tier}${saved ? ' · ' + saved : ''}`;
}

function tierCounts(decisions) {
  const c = { T0: 0, T1: 0, T2: 0, T3: 0 };
  for (const d of decisions || []) if (c[d.tier] != null) c[d.tier]++;
  return c;
}

// Installed if the hook OR the classifier is present — don't show the setup wizard
// to a user whose hook merely fell out of settings while the engine is still there.
function runtimeInstalled() { try { return fs.existsSync(RUNTIME_HOOK) || fs.existsSync(RUNTIME_CLASSIFY); } catch { return false; } }

// Poll cadence (ms): brisk while the cockpit is visible, lazy when it's hidden so a
// closed panel doesn't keep the status bar perfectly live at the cost of CPU/processes.
function pollIntervalMs(visible) { return visible ? 7000 : 60000; }

module.exports = { DECISIONS_LOG, RUNTIME_HOOK, httpJson, parseDecisions, readDecisions, publicSnapshot, statusBarText, tierCounts, runtimeInstalled, pollIntervalMs, isProbePrompt };
