/**
 * frugal-savings — VS Code extension
 *
 * Renders live frugal router savings as:
 *   1. Status bar item     (always visible, polls /metrics)
 *   2. Sidebar webview     (full breakdown)
 *   3. Toast notifications (when new prompts arrive AND avg savings ≥ threshold)
 *
 * Auto-starts the savings-tracker.js HTTP server on :7821 if not already
 * running. All operations are best-effort: if the tracker is unreachable,
 * the status bar shows "💰 –" and we keep polling silently.
 */

'use strict';

const vscode = require('vscode');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

const TRACKER_SCRIPT = path.join(os.homedir(), '.claude', 'tools', 'router', 'savings-tracker.js');
const DECISIONS_LOG = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');

let statusBarItem;
let pollTimer;
let lastPromptCount = null;
let savingsProvider;

// ── HTTP helper ─────────────────────────────────────────────────────────────
function fetchJson(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function trackerUrl() {
  return vscode.workspace.getConfiguration('frugal').get('trackerUrl', 'http://127.0.0.1:7821');
}

// ── Auto-start tracker ──────────────────────────────────────────────────────
async function ensureTracker() {
  const health = await fetchJson(`${trackerUrl()}/health`, 800);
  if (health && health.ok) return true;

  if (!fs.existsSync(TRACKER_SCRIPT)) return false;
  try {
    const child = execFile('node', [TRACKER_SCRIPT], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch {
    return false;
  }

  // Give it a moment to bind
  await new Promise((r) => setTimeout(r, 350));
  const recheck = await fetchJson(`${trackerUrl()}/health`, 800);
  return !!(recheck && recheck.ok);
}

// ── Status bar rendering ────────────────────────────────────────────────────
function alignmentFromConfig() {
  const cfg = vscode.workspace.getConfiguration('frugal').get('statusBarAlignment', 'right');
  return cfg === 'left'
    ? vscode.StatusBarAlignment.Left
    : vscode.StatusBarAlignment.Right;
}

function colorForSavingsPct(pct) {
  if (pct >= 75) return new vscode.ThemeColor('charts.green');
  if (pct >= 40) return new vscode.ThemeColor('charts.yellow');
  return undefined;
}

function fmtUsd(n) {
  if (typeof n !== 'number' || isNaN(n)) return '–';
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

function renderStatusBar(metrics) {
  if (!statusBarItem) return;
  if (!metrics || metrics.prompts === 0) {
    statusBarItem.text = '$(symbol-numeric) frugal: –';
    statusBarItem.tooltip = 'frugal: tracker idle (no prompts yet)';
    statusBarItem.color = undefined;
    statusBarItem.command = 'frugal.showSummary';
    statusBarItem.show();
    return;
  }
  // savings-tracker.js reads the FULL decisions.log on every /metrics call,
  // so `metrics.saved` is already the all-time accumulated savings — not just
  // this session. The previous version showed `real_cost` under the "alltime"
  // label, which was wrong (real_cost is what you SPENT, not what you SAVED).
  const plan = metrics.plan || 'unknown';
  const isApiOnly = plan === 'api_only' || plan === 'api-free' || plan === 'unknown';
  const saved = fmtUsd(metrics.saved);
  const pct = Math.round(metrics.saved_pct || 0);
  const real = fmtUsd(metrics.real_cost);

  if (isApiOnly) {
    statusBarItem.text = `💰 ${saved} saved (${pct}%) │ ${real} real │ ${metrics.prompts} prompts`;
  } else {
    // Plan users (claude_max, claude_pro): the "saved" $ doesn't reflect
    // out-of-pocket savings (they pay flat). Show how many Opus prompts
    // were deflected to free tiers instead.
    const deflected = (metrics.by_tier?.T0 || 0) + (metrics.by_tier?.T1 || 0);
    const planLabel = plan === 'claude_max' ? 'Claude Max' : plan === 'claude_pro' ? 'Claude Pro' : plan;
    statusBarItem.text = `💰 ${deflected} deflected (${pct}% to Ollama/Haiku) │ ${planLabel}`;
  }

  statusBarItem.color = colorForSavingsPct(metrics.saved_pct || 0);
  const tooltipLines = [
    `**frugal — savings**`,
    ``,
    `| | |`,
    `|-|-|`,
    `| Prompts (all-time) | ${metrics.prompts} |`,
    `| Real cost | ${fmtUsd(metrics.real_cost)} |`,
    `| Naive (all Opus) | ${fmtUsd(metrics.naive_cost)} |`,
    `| **Saved (est)** | **${fmtUsd(metrics.saved)} (${pct}%)** |`,
    `| Guaranteed saved | ${fmtUsd(metrics.guaranteed_saved || 0)} |`,
    `| Plan | ${plan} |`,
  ];
  if (metrics.subscription_note) {
    tooltipLines.push(`| Note | ${metrics.subscription_note} |`);
  }
  if (metrics.routing_audit) {
    tooltipLines.push(`| Routing honored (est) | ${metrics.routing_audit.estimated_honored_pct}% |`);
  }
  tooltipLines.push(
    ``,
    `**Tier breakdown**`,
    `- T0 Ollama: ${metrics.by_tier.T0} (${(metrics.pct_by_tier.T0 || 0).toFixed(0)}%)`,
    `- T1 Haiku: ${metrics.by_tier.T1} (${(metrics.pct_by_tier.T1 || 0).toFixed(0)}%)`,
    `- T2 Sonnet: ${metrics.by_tier.T2} (${(metrics.pct_by_tier.T2 || 0).toFixed(0)}%)`,
    `- T3 Opus: ${metrics.by_tier.T3} (${(metrics.pct_by_tier.T3 || 0).toFixed(0)}%)`,
    ``,
    `Methodology: token-estimated vs naive Opus baseline`,
    `Click for full summary.`
  );
  statusBarItem.tooltip = new vscode.MarkdownString(tooltipLines.join('\n'));
  statusBarItem.command = 'frugal.showSummary';
  statusBarItem.show();
}

// ── Sidebar webview ─────────────────────────────────────────────────────────
class SavingsViewProvider {
  constructor(context) {
    this.context = context;
    this.view = null;
  }
  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.renderHtml(null);
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg && msg.command === 'refresh') {
        vscode.commands.executeCommand('frugal.refresh');
      } else if (msg && msg.command === 'openDecisions') {
        vscode.commands.executeCommand('frugal.openDecisionsLog');
      } else if (msg && msg.command === 'summary') {
        vscode.commands.executeCommand('frugal.showSummary');
      }
    });
    poll(); // immediate refresh on view open
  }
  update(metrics) {
    if (!this.view) return;
    this.view.webview.html = this.renderHtml(metrics);
  }
  renderHtml(m) {
    if (!m || m.prompts === 0) {
      return baseHtml(`<p class="muted">No prompts logged yet.</p>
        <p class="muted">Send a prompt in any Claude Code session — frugal will start tracking automatically.</p>`);
    }
    const saved = fmtUsd(m.saved);
    const pct = (m.saved_pct || 0).toFixed(1);
    const barWidth = Math.max(0, Math.min(100, m.saved_pct || 0));
    const barColor = m.saved_pct >= 75 ? '#2ea043' : m.saved_pct >= 40 ? '#d29922' : '#6e7681';
    const tierRow = (t) =>
      `<tr><td>${t}</td><td>${m.by_tier[t]}</td><td>${(m.pct_by_tier[t] || 0).toFixed(1)}%</td><td>${fmtUsd(m.cost_by_tier[t])}</td></tr>`;
    return baseHtml(`
      <div class="big">${saved}</div>
      <div class="muted">saved across ${m.prompts} prompts (${pct}%)</div>
      <div class="bar"><div class="fill" style="width:${barWidth}%;background:${barColor}"></div></div>

      <table class="kv">
        <tr><th>Real paid</th><td>${fmtUsd(m.real_cost)}</td></tr>
        <tr><th>Would have paid (T3)</th><td>${fmtUsd(m.naive_cost)}</td></tr>
        <tr><th>Saved</th><td><strong>${fmtUsd(m.saved)}</strong></td></tr>
        <tr><th>Avg / prompt</th><td>${fmtUsd(m.avg_saved_per_prompt)}</td></tr>
      </table>

      <h3>Tier breakdown</h3>
      <table class="tiers">
        <tr><th>Tier</th><th>Count</th><th>%</th><th>Cost</th></tr>
        ${tierRow('T0')}${tierRow('T1')}${tierRow('T2')}${tierRow('T3')}
      </table>

      <div class="actions">
        <button onclick="vscode.postMessage({command:'summary'})">Full summary</button>
        <button onclick="vscode.postMessage({command:'openDecisions'})">decisions.log</button>
        <button onclick="vscode.postMessage({command:'refresh'})">Refresh</button>
      </div>
    `);
  }
}

function baseHtml(body) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: var(--vscode-font-family); padding: 12px; color: var(--vscode-foreground); }
  .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .big { font-size: 32px; font-weight: 600; margin-bottom: 4px; }
  .bar { height: 6px; background: var(--vscode-editorWidget-background); border-radius: 3px; margin: 12px 0; overflow: hidden; }
  .bar .fill { height: 100%; transition: width .3s; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--vscode-editorWidget-border); }
  .tiers th { color: var(--vscode-descriptionForeground); font-weight: normal; }
  h3 { margin-top: 16px; font-size: 12px; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
  .actions { margin-top: 16px; display: flex; gap: 6px; flex-wrap: wrap; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style></head>
<body>
  <script>const vscode = acquireVsCodeApi();</script>
  ${body}
</body></html>`;
}

// ── Polling loop ────────────────────────────────────────────────────────────
async function poll() {
  const metrics = await fetchJson(`${trackerUrl()}/metrics`);
  renderStatusBar(metrics);
  if (savingsProvider) savingsProvider.update(metrics);

  if (!metrics) return;

  // Toast on new prompts
  const cfg = vscode.workspace.getConfiguration('frugal');
  const showToasts = cfg.get('showToasts', true);
  const threshold = cfg.get('toastThresholdUSD', 0.001);

  if (lastPromptCount === null) {
    lastPromptCount = metrics.prompts;
    return;
  }
  const newPrompts = metrics.prompts - lastPromptCount;
  if (newPrompts > 0 && showToasts && metrics.avg_saved_per_prompt >= threshold) {
    const avg = metrics.avg_saved_per_prompt.toFixed(4);
    const pct = Math.round(metrics.saved_pct || 0);
    const breakdown = `T0:${Math.round(metrics.pct_by_tier.T0 || 0)}% T2:${Math.round(metrics.pct_by_tier.T2 || 0)}% T3:${Math.round(metrics.pct_by_tier.T3 || 0)}%`;
    vscode.window
      .showInformationMessage(
        `💰 frugal saved ~$${avg}/prompt (${pct}% cheaper) │ ${breakdown}`,
        'See Summary',
        'Dismiss'
      )
      .then((choice) => {
        if (choice === 'See Summary') {
          vscode.commands.executeCommand('frugal.showSummary');
        }
      });
  }
  lastPromptCount = metrics.prompts;
}

function startPolling() {
  const interval = vscode.workspace.getConfiguration('frugal').get('refreshIntervalMs', 8000);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, interval);
}

// ── Activation ──────────────────────────────────────────────────────────────
async function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(alignmentFromConfig(), 50);
  statusBarItem.text = '$(symbol-numeric) frugal: …';
  statusBarItem.command = 'frugal.showSummary';
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();

  savingsProvider = new SavingsViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('frugal.savingsView', savingsProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('frugal.refresh', poll),
    vscode.commands.registerCommand('frugal.showSummary', async () => {
      const txt = await new Promise((resolve) => {
        const req = http.get(`${trackerUrl()}/summary`, (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => resolve(body));
        });
        req.on('error', () => resolve('frugal: tracker not reachable.'));
        req.setTimeout(1500, () => { req.destroy(); resolve('frugal: tracker timeout.'); });
      });
      const doc = await vscode.workspace.openTextDocument({ content: txt, language: 'plaintext' });
      vscode.window.showTextDocument(doc, { preview: true });
    }),
    vscode.commands.registerCommand('frugal.openDecisionsLog', async () => {
      try {
        const doc = await vscode.workspace.openTextDocument(DECISIONS_LOG);
        vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showWarningMessage(`frugal: ${DECISIONS_LOG} not found.`);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('frugal.refreshIntervalMs')) startPolling();
    })
  );

  await ensureTracker();
  poll();
  startPolling();
}

function deactivate() {
  if (pollTimer) clearInterval(pollTimer);
  if (statusBarItem) statusBarItem.dispose();
}

module.exports = { activate, deactivate };
