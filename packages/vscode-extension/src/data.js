// data.js — pure data layer for mooter-cockpit (no vscode dependency → testable).
// Contracts validated in F0-VALIDATION-REPORT (decisions.log v1, tracker 0.7.0).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const DECISIONS_LOG = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
const RUNTIME_HOOK = path.join(os.homedir(), '.claude', 'tools', 'router', 'inject_context.js');

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

// Parse "classified" entries from a raw chunk of decisions.log text.
// Tolerates: garbage lines, partial first line, unknown events, missing fields.
function parseDecisions(text, maxN = 80) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      if (j && j.event === 'classified') out.push(j);
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
      rule: d.escalation_rule,
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

function runtimeInstalled() { try { return fs.existsSync(RUNTIME_HOOK); } catch { return false; } }

module.exports = { DECISIONS_LOG, RUNTIME_HOOK, httpJson, parseDecisions, readDecisions, publicSnapshot, statusBarText, tierCounts, runtimeInstalled };
