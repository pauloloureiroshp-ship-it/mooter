#!/usr/bin/env node
// gsd-hook-version: 1.34.2
// Claude Code Statusline - GSD Edition
// Shows: model | current task | directory | context usage

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// frugal savings appender — fetches /metrics from local tracker (:7821).
// Returns a coloured " │ 💰 $X.XX (NN%)" segment, or '' on any failure.
// Uses spawnSync(node) with a 500ms hard timeout so the statusline never hangs.
//
// v0.6: honest labels + dual currency.
//   - FRUGAL_CURRENCY=BRL (or EUR/GBP) shows the target currency in
//     the primary position with USD in parens: "R$10.83 ($2.00)".
//   - "~" prefix marks the number as estimated, not OAuth-real.
//   - Uses guaranteed_saved (Option-A hits) when present, otherwise
//     falls back to advisory (tier-routing estimate).
// v0.7.1: single fetch, shared by renderSavings + renderProviders.
// Returns the parsed /metrics JSON or null on any failure.
function fetchFrugalMetrics() {
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
    if (r.status !== 0 || !r.stdout) return null;
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

// v0.9: cheap helper — fetch a JSON endpoint on the tracker with a short
// hard timeout. Returns parsed JSON or null.
function fetchTrackerJson(urlPath, timeoutMs) {
  try {
    const fetchScript = `
      const http = require('http');
      const req = http.get('http://127.0.0.1:7821${'${urlPath}'}', (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => process.stdout.write(body));
      });
      req.on('error', () => process.exit(1));
      req.setTimeout(${'${tmo}'}, () => { req.destroy(); process.exit(2); });
    `.replace('${urlPath}', urlPath).replace('${tmo}', String(timeoutMs - 50));
    const r = spawnSync(process.execPath, ['-e', fetchScript], {
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
    });
    if (r.status !== 0 || !r.stdout) return null;
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

// ── v0.9: tier color + abbreviated name helpers ─────────────────────────
// Canonical tier palette (ANSI 24-bit where supported). Used by all v0.9
// segments (last-turn, distribution, GPU util).
const TIER_COLOR = {
  T0: '\x1b[38;2;78;201;176m',   // teal  #4ec9b0
  T1: '\x1b[38;2;86;156;214m',   // blue  #569cd6
  T2: '\x1b[38;2;220;220;170m',  // yellow #dcdcaa
  T3: '\x1b[38;2;244;71;71m',    // red   #f44747
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

// v0.9: segment ③ — last-turn renderer. Reads /last and builds:
//   [T3] ops arch 2.5s L1→L2→T3
function renderLastTurn() {
  try {
    const l = fetchTrackerJson('/last', 250);
    if (!l || !l.tier) return '';
    const color = TIER_COLOR[l.tier] || '';
    const tierLabel = `${color}[${l.tier}]${RESET}`;
    const modelShort = l.model_short || '';
    const catShort = l.category_short || '';
    const latencyMs = l.latency_ms || 0;
    const latS = (latencyMs / 1000).toFixed(1);
    let latColor = '\x1b[38;2;78;201;176m';
    if (latencyMs >= 3000) latColor = '\x1b[38;2;244;71;71m';
    else if (latencyMs >= 500) latColor = '\x1b[38;2;220;220;170m';

    // Optional indicators
    const indicators = [];
    const overrideRefused = l.user_override && l.user_override.honored === false;
    if (overrideRefused && l.arbiter_used) indicators.push('⚠↯🌸arb');
    else if (overrideRefused) indicators.push('⚠↯');
    else if (l.arbiter_used) indicators.push('🌸arb');

    // Δ vs Opus (estimated) — only show if meaningful
    let delta = '';
    if (l.latency_vs_opus_ms != null && Math.abs(l.latency_vs_opus_ms) > 2000) {
      const absS = (Math.abs(l.latency_vs_opus_ms) / 1000).toFixed(1);
      const sign = l.latency_vs_opus_ms < 0 ? '-' : '+';
      delta = ` ${DIM}~${sign}${absS}s${RESET}`;
    }

    const indStr = indicators.length ? ' ' + indicators.join(' ') : '';
    const cascade = l.cascade_path || '';
    return ` │ ${tierLabel} ${modelShort}${indStr} ${catShort} ${latColor}${latS}s${RESET}${delta} ${DIM}${cascade}${RESET}`;
  } catch {
    return '';
  }
}

// v0.9: segment ⑥ — GPU widget. Reads /gpu.
function renderGpu() {
  try {
    const g = fetchTrackerJson('/gpu', 300);
    if (!g || !g.vendor || g.vendor === 'cpu') return '';
    const name = g.name_short || 'GPU';
    if (g.utilPct == null) {
      // Apple Silicon / AMD w/o util
      return ` │ 💻 ${DIM}${name}${RESET}`;
    }
    const pct = g.utilPct;
    const filled = Math.min(6, Math.max(0, Math.round((pct / 100) * 6)));
    const bar = '▓'.repeat(filled) + '░'.repeat(6 - filled);
    let c = '\x1b[38;2;78;201;176m';
    if (pct >= 80) c = '\x1b[38;2;197;134;192m'; // purple
    else if (pct >= 50) c = '\x1b[38;2;220;220;170m';
    return ` │ 💻 ${DIM}${name}${RESET} ${c}${bar} ${pct}%${RESET}`;
  } catch {
    return '';
  }
}

function fetchFrugalSavings(mOpt) {
  try {
    const m = mOpt || fetchFrugalMetrics();
    if (!m || !m.prompts) return '';

    // Pick the number to display. Prefer guaranteed (real Option-A skips).
    const advisoryUsd = m.saved || 0;
    const guaranteedUsd = m.guaranteed_saved || 0;
    const primaryUsd = guaranteedUsd > 0 ? guaranteedUsd : advisoryUsd;

    // Currency selection. The tracker already exposes a dual block in
    // in_brl / in_eur / in_gbp when FRUGAL_CURRENCY is set.
    const currency = (m.currency || 'USD').toUpperCase();
    const altKey = `in_${currency.toLowerCase()}`;
    const alt = m[altKey];
    const symbolMap = { USD: '$', BRL: 'R$', EUR: '€', GBP: '£' };
    const sym = symbolMap[currency] || '$';

    let primaryStr;
    if (alt && currency !== 'USD') {
      // Use the alt-currency number the tracker computed, plus USD in parens.
      const altAmount = guaranteedUsd > 0 ? (alt.guaranteed_saved || 0) : (alt.saved || 0);
      primaryStr = `${sym}${altAmount.toFixed(2)} ($${primaryUsd.toFixed(2)})`;
    } else {
      primaryStr = `$${primaryUsd.toFixed(2)}`;
    }

    const pct = Math.round(m.saved_pct || 0);
    let color = '\x1b[2m'; // dim default
    if (pct >= 75) color = '\x1b[32m'; // green
    else if (pct >= 40) color = '\x1b[33m'; // yellow

    // "~" prefix = estimated. Keep it visible so the number is never
    // mistaken for the real OAuth figure.
    const tildePrefix = guaranteedUsd > 0 ? '' : '~';

    // v0.9: segment ④ — distribution with abbreviated names (qwen/hku/son/ops)
    // and per-tier color from TIER_COLOR. Dimmed when pct = 0.
    let breakdown = '';
    const pbt = m.pct_by_tier || {};
    const SHORT = [
      ['T0', 'qwen', TIER_COLOR.T0],
      ['T1', 'hku',  TIER_COLOR.T1],
      ['T2', 'son',  TIER_COLOR.T2],
      ['T3', 'ops',  TIER_COLOR.T3],
    ];
    const parts = SHORT.map(([t, label, clr]) => {
      const v = Math.round(pbt[t] || 0);
      if (v === 0) return `${DIM}${label} 0%${RESET}`;
      return `${clr}${label} ${v}%${RESET}`;
    });
    if (parts.length) breakdown = ` │ ${parts.join(' · ')}`;

    // v0.9: segment ⑤ — budget track mini-bar (8 chars) appended to savings.
    let budgetBar = '';
    try {
      const real = fetchTrackerJson('/real', 250);
      let budgetPct = null;
      if (real && real.ok && typeof real.five_hour_pct === 'number') {
        budgetPct = real.five_hour_pct;
      }
      if (budgetPct != null) {
        const filled = Math.min(8, Math.max(0, Math.round((budgetPct / 100) * 8)));
        const bar = '▓'.repeat(filled) + '░'.repeat(8 - filled);
        let bColor = '\x1b[38;2;78;201;176m'; // teal
        if (budgetPct > 80) bColor = '\x1b[38;2;244;71;71m'; // red
        else if (budgetPct > 50) bColor = '\x1b[38;2;220;220;170m'; // yellow
        budgetBar = ` ${bColor}${Math.round(budgetPct)}% ${bar}${RESET}`;
      }
    } catch { /* budget bar is best-effort */ }

    return ` │ ${color}💰 ${tildePrefix}${primaryStr} (${pct}%)${RESET}${budgetBar}${breakdown}`;
  } catch {
    return '';
  }
}

// v0.7.2: turn-latency indicator — renders "⏱ 2.1s p50 · ~-9.3s vs Opus"
// so the user can see both (a) how slow their turns actually are with the
// router, and (b) the estimated delta vs a naive direct-to-Opus baseline.
//
// Format:
//   ⏱ {p50_seconds}s p50 · ~{delta}s vs Opus
//
// Colour rules on the delta:
//   green  : delta < -500ms      (frugal is faster)
//   dim    : |delta| ≤ 500ms     (roughly the same)
//   yellow : 500ms < delta ≤ 3s  (slightly slower)
//   red    : delta > 3s          (significantly slower)
//
// The `~` prefix on the delta marks the Opus baseline as *estimated* from
// public Anthropic latency specs, not measured. The p50 number has no
// tilde — it is the real wall-clock median measured via the Stop hook.
function renderLatency(m) {
  try {
    const l = m && m.latency;
    if (!l || !l.sample_size) return '';
    const p50s = (l.p50_ms / 1000).toFixed(1);
    const delta = l.delta_vs_opus_ms;
    const absS = (Math.abs(delta) / 1000).toFixed(1);
    let color, text;
    if (delta < -500) {
      color = '\x1b[32m'; // green — router beat Opus baseline
      text = `~-${absS}s vs Opus`;
    } else if (delta <= 500) {
      color = '\x1b[2m';  // dim — roughly equal
      text = `~same as Opus`;
    } else if (delta <= 3000) {
      color = '\x1b[33m'; // yellow — slightly slower
      text = `~+${absS}s vs Opus`;
    } else {
      color = '\x1b[31m'; // red — significantly slower
      text = `~+${absS}s vs Opus`;
    }
    return ` │ \x1b[2m⏱ ${p50s}s p50\x1b[0m · ${color}${text}\x1b[0m`;
  } catch {
    return '';
  }
}

// v0.7.1: provider availability indicator — renders a compact lightning-bolt
// segment showing which of Claude/Ollama/Gemini/GPT the router could invoke
// RIGHT NOW. Reads the providers block embedded in the /metrics response
// (the tracker refreshes it every 30s via refreshProvidersAsync), so there's
// no extra HTTP call from the statusline.
//
// Symbols:
//   ●  (green)  — live, the router can hand work to this provider
//   ◐  (yellow) — configured but degraded (e.g. OAuth token error)
//   ○  (dim)    — not configured / not installed
//
// Layout:   │ ⚡ Claude● Ollama● Gemini○ GPT○
// v0.9: all 6 providers rendered as compact dots in fixed order.
// Anthropic · Ollama · Gemini · GPT · Grok · Mistral
// Unconfigured providers still appear (as ○) so the row is always 6 wide.
function renderProviders(m) {
  try {
    const p = (m && m.providers) || {};
    // Allow env override of provider order (comma-separated).
    const envOrder = process.env.FRUGAL_PROVIDERS;
    const defaultOrder = ['claude', 'ollama', 'gemini', 'gpt', 'grok', 'mistral'];
    const order = envOrder
      ? envOrder.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
      : defaultOrder;

    const dotFor = (state) => {
      if (state === 'ok')       return '\x1b[38;2;35;209;139m●\x1b[0m'; // bright green
      if (state === 'degraded') return '\x1b[38;2;220;220;170m◐\x1b[0m'; // yellow
      if (state === 'unknown')  return '\x1b[38;2;90;90;90m◌\x1b[0m';    // dim hollow
      return '\x1b[38;2;58;58;58m○\x1b[0m';                                // off (dark)
    };
    const parts = order.map((key) => dotFor(p[key] || 'off'));
    return ` │ ${parts.join('')}`;
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

    // frugal v0.9 segments. One /metrics fetch; /last, /gpu, /real each have
    // their own cheap call with short timeouts inside the renderers.
    const metrics = fetchFrugalMetrics();

    // Segment ② — brand (🐕 frugal v0.9). Ultra-savings mode (T0 > 90%) turns
    // the separator teal for a subtle visual cue.
    const t0pct = (metrics && metrics.pct_by_tier && metrics.pct_by_tier.T0) || 0;
    const ultraSavings = t0pct > 90;
    const brandColor = ultraSavings ? '\x1b[38;2;78;201;176m' : DIM;
    const brand = ` │ 🐕 ${brandColor}frugal v0.9${RESET}`;

    const lastTurn = renderLastTurn();                    // ③
    const savings = fetchFrugalSavings(metrics);          // ⑤ (+ dist ④)
    const gpu = renderGpu();                              // ⑥
    const providers = renderProviders(metrics);           // ⑦
    const latency = renderLatency(metrics);               // legacy (kept)

    // Output
    const dirname = path.basename(dir);
    if (task) {
      process.stdout.write(`${gsdUpdate}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}${brand}${lastTurn}${savings}${gpu}${providers}${latency}`);
    } else {
      process.stdout.write(`${gsdUpdate}\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}${brand}${lastTurn}${savings}${gpu}${providers}${latency}`);
    }
  } catch (e) {
    // Silent fail - don't break statusline on parse errors
  }
});
