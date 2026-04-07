#!/usr/bin/env node
// gsd-hook-version: 1.32.0
// Claude Code Statusline - GSD Edition
// Shows: model | current task | directory | context usage

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// frugal savings appender — fetches /metrics from local tracker (:7821).
// Returns a coloured " │ 💰 $X.XX (NN%)" segment, or '' on any failure.
// Uses spawnSync(node) with a 500ms hard timeout so the statusline never hangs.
function fetchFrugalSavings() {
  try {
    const fetchScript = `
      const http = require('http');
      const req = http.get('http://127.0.0.1:7821/metrics', (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => process.stdout.write(body));
      });
      req.on('error', () => process.exit(1));
      req.setTimeout(400, () => { req.destroy(); process.exit(2); });
    `;
    const r = spawnSync(process.execPath, ['-e', fetchScript], {
      encoding: 'utf8',
      timeout: 500,
      windowsHide: true,
    });
    if (r.status !== 0 || !r.stdout) return '';
    const m = JSON.parse(r.stdout);
    if (!m || !m.prompts) return '';
    const saved = (m.saved || 0).toFixed(2);
    const pct = Math.round(m.saved_pct || 0);
    let color = '\x1b[2m'; // dim default
    if (pct >= 75) color = '\x1b[32m'; // green
    else if (pct >= 40) color = '\x1b[33m'; // yellow
    let breakdown = '';
    // Prefer pct_by_model when tracker exposes it (newer format). Fall back
    // to pct_by_tier + heuristic mapping for older tracker versions.
    const pbm = m.pct_by_model;
    if (pbm && typeof pbm === 'object') {
      const parts = ['Ollama', 'Haiku', 'Sonnet', 'Opus']
        .filter(name => (pbm[name] || 0) > 0)
        .map(name => `${name}:${Math.round(pbm[name])}%`);
      if (parts.length) breakdown = ` │ \x1b[2m${parts.join(' ')}\x1b[0m`;
    } else {
      const pbt = m.pct_by_tier;
      if (pbt && typeof pbt === 'object') {
        const TIER_LABELS = { T0: 'Ollama', T1: 'Haiku', T2: 'Sonnet', T3: 'Opus' };
        const parts = ['T0', 'T1', 'T2', 'T3']
          .filter(t => (pbt[t] || 0) > 0)
          .map(t => `${TIER_LABELS[t]}:${Math.round(pbt[t])}%`);
        if (parts.length) breakdown = ` │ \x1b[2m${parts.join(' ')}\x1b[0m`;
      }
    }
    return ` │ ${color}💰 $${saved} (${pct}%)\x1b[0m${breakdown}`;
  } catch {
    return '';
  }
}

// Read JSON from stdin
let input = '';
// Timeout guard: if stdin doesn't close within 3s (e.g. pipe issues on
// Windows/Git Bash), exit silently instead of hanging. See #775.
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const dir = data.workspace?.current_dir || process.cwd();
    const session = data.session_id || '';
    const remaining = data.context_window?.remaining_percentage;

    // Context window display (shows USED percentage scaled to usable context)
    // Claude Code reserves ~16.5% for autocompact buffer, so usable context
    // is 83.5% of the total window. We normalize to show 100% at that point.
    const AUTO_COMPACT_BUFFER_PCT = 16.5;
    let ctx = '';
    if (remaining != null) {
      // Normalize: subtract buffer from remaining, scale to usable range
      const usableRemaining = Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100);
      const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));

      // Write context metrics to bridge file for the context-monitor PostToolUse hook.
      // The monitor reads this file to inject agent-facing warnings when context is low.
      // Reject session IDs with path separators or traversal sequences to prevent
      // a malicious session_id from writing files outside the temp directory.
      const sessionSafe = session && !/[/\\]|\.\./.test(session);
      if (sessionSafe) {
        try {
          const bridgePath = path.join(os.tmpdir(), `claude-ctx-${session}.json`);
          const bridgeData = JSON.stringify({
            session_id: session,
            remaining_percentage: remaining,
            used_pct: used,
            timestamp: Math.floor(Date.now() / 1000)
          });
          fs.writeFileSync(bridgePath, bridgeData);
        } catch (e) {
          // Silent fail -- bridge is best-effort, don't break statusline
        }
      }

      // Build progress bar (10 segments)
      const filled = Math.floor(used / 10);
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

      // Color based on usable context thresholds
      if (used < 50) {
        ctx = ` \x1b[32m${bar} ${used}%\x1b[0m`;
      } else if (used < 65) {
        ctx = ` \x1b[33m${bar} ${used}%\x1b[0m`;
      } else if (used < 80) {
        ctx = ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
      } else {
        ctx = ` \x1b[5;31m💀 ${bar} ${used}%\x1b[0m`;
      }
    }

    // Current task from todos
    let task = '';
    const homeDir = os.homedir();
    // Respect CLAUDE_CONFIG_DIR for custom config directory setups (#870)
    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude');
    const todosDir = path.join(claudeDir, 'todos');
    if (session && fs.existsSync(todosDir)) {
      try {
        const files = fs.readdirSync(todosDir)
          .filter(f => f.startsWith(session) && f.includes('-agent-') && f.endsWith('.json'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
          try {
            const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
            const inProgress = todos.find(t => t.status === 'in_progress');
            if (inProgress) task = inProgress.activeForm || '';
          } catch (e) {}
        }
      } catch (e) {
        // Silently fail on file system errors - don't break statusline
      }
    }

    // GSD update available?
    // Check shared cache first (#1421), fall back to runtime-specific cache for
    // backward compatibility with older gsd-check-update.js versions.
    let gsdUpdate = '';
    const sharedCacheFile = path.join(homeDir, '.cache', 'gsd', 'gsd-update-check.json');
    const legacyCacheFile = path.join(claudeDir, 'cache', 'gsd-update-check.json');
    const cacheFile = fs.existsSync(sharedCacheFile) ? sharedCacheFile : legacyCacheFile;
    if (fs.existsSync(cacheFile)) {
      try {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (cache.update_available) {
          gsdUpdate = '\x1b[33m⬆ /gsd-update\x1b[0m │ ';
        }
        if (cache.stale_hooks && cache.stale_hooks.length > 0) {
          gsdUpdate += '\x1b[31m⚠ stale hooks — run /gsd-update\x1b[0m │ ';
        }
      } catch (e) {}
    }

    // frugal savings segment (best-effort, 500ms hard timeout)
    const savings = fetchFrugalSavings();

    // Output
    const dirname = path.basename(dir);
    if (task) {
      process.stdout.write(`${gsdUpdate}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}${savings}`);
    } else {
      process.stdout.write(`${gsdUpdate}\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}${savings}`);
    }
  } catch (e) {
    // Silent fail - don't break statusline on parse errors
  }
});
