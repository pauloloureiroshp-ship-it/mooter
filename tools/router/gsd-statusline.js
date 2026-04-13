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
// When sessionId is provided, returns metrics scoped to that session only —
// each Claude Code terminal then shows ITS own savings, not the all-time
// total (which lives in the VS Code extension statusbar instead).
function fetchFrugalMetrics(sessionId) {
  try {
    const path = sessionId
      ? `/metrics?session_id=${encodeURIComponent(sessionId)}`
      : '/metrics';
    const fetchScript = `
      const http = require('http');
      const req = http.get('http://127.0.0.1:7821${'__PATH__'}', (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => process.stdout.write(body));
      });
      req.on('error', () => process.exit(1));
      req.setTimeout(400, () => { req.destroy(); process.exit(2); });
    `.replace('__PATH__', path);
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

// ── v0.12: statusline — full transparency with model names + tokens ────────
// The statusline is frugal's business card. It must prove at a glance:
//   "frugal saves you real money — here's the proof."
//
// Layout (normal session):
//   🐕 ↓89% 💰saved ~$3.84 │ ████████░░ 🔴Opus 9% 🟡Sonnet 22% 🟢Local 69%
//
// Layout (with token counts, when tracker is running):
//   🐕 ↓89% 💰~$3.84 │ ████████░░ 🔴Opus 9% 12k 🟡Sonnet 22% 31k 🟢Local 69% 98k
//
// The colored bar IS the proof: mostly teal = mostly free.
// Full model names: "Opus", "Sonnet", "Local" — no jargon.
// Emoji dots: 🔴 expensive → 🟡 mid → 🟢 free — universal language.
// Token counts: optional, shown when available from tracker.

// ── Distribution renderer ─────────────────────────────────────────────────
// Map a raw model id to one of 6 display buckets that the distribution bar
// knows how to render. Mirrors the emoji logic in PostToolUse.js so the
// terminal per-call indicator and the statusline bar never disagree.
function bucketFor(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus'))   return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku'))  return 'haiku';
  if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) return 'local';
  if (m.includes('gpt') || m.includes('codex') || m.includes('openai'))  return 'gpt';
  if (m.includes('gemini') || m.includes('google')) return 'gemini';
  return null;
}

// v0.11: read execution.log and count REAL Bash tool calls by model bucket
// for the current session. This is the ground truth — same data source as
// the PostToolUse emoji that the user sees after every Bash call.
// Returns { opus, sonnet, haiku, local, gpt, gemini, total } or null on error.
function realExecutionCounts(sessionId) {
  try {
    const execPath = path.join(os.homedir(), '.claude', 'hooks', 'execution.log');
    if (!fs.existsSync(execPath)) return null;
    const stat = fs.statSync(execPath);
    const MAX = 512 * 1024; // 512 KB tail is plenty
    const start = Math.max(0, stat.size - MAX);
    const fd = fs.openSync(execPath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);

    const counts = { opus: 0, sonnet: 0, haiku: 0, local: 0, gpt: 0, gemini: 0 };
    let total = 0;
    for (const line of lines) {
      if (sessionId) {
        const sm = line.match(/session=(\S+)/);
        if (!sm || sm[1] !== sessionId) continue;
      }
      const mm = line.match(/model=(\S+)/);
      if (!mm) continue;
      const b = bucketFor(mm[1]);
      if (!b) continue;
      counts[b]++;
      total++;
    }
    if (total === 0) return null;
    counts.total = total;
    return counts;
  } catch {
    return null;
  }
}

// renderDistribution — the distribution bar below the savings hero.
// v0.11: source of truth is execution.log (real Bash per-call models) so the
// bar matches what the user sees in the terminal emojis. Falls back to the
// previous advisory source (decisions.log / tracker pct_by_tier) only when
// execution.log has nothing for the current session, and then tags the bar
// with a "(advisory)" marker so the difference is never ambiguous.
function renderDistribution(metrics, sessionId) {
  // PRIMARY: real execution from execution.log (session-scoped).
  const real = realExecutionCounts(sessionId);
  let pbt = null;
  let tokensByTier = null;
  let source = 'real';      // 'real' | 'advisory'
  let callCountsByBucket = null;

  if (real && real.total > 0) {
    callCountsByBucket = real;
    pbt = {
      T3: (real.opus   / real.total) * 100,
      T2: (real.sonnet / real.total) * 100,
      T1: (real.haiku  / real.total) * 100,
      T0: (real.local  / real.total) * 100,
      GPT: (real.gpt   / real.total) * 100,
      GEM: (real.gemini/ real.total) * 100,
    };
    // Token estimate via call counts × ~400 chars unit of work
    const unit = Math.round(400 / 4) + 1500;
    tokensByTier = {
      T3: real.opus   * unit,
      T2: real.sonnet * unit,
      T1: real.haiku  * unit,
      T0: real.local  * unit,
    };
  }

  // FALLBACK 1: tracker HTTP metrics (recommendation-based)
  if (!pbt && metrics && metrics.pct_by_tier) {
    pbt = metrics.pct_by_tier;
    source = 'advisory';
    if (metrics.tokens_by_tier) tokensByTier = metrics.tokens_by_tier;
  }

  // FALLBACK 2: read decisions.log directly (recommendation-based)
  if (!pbt) {
    try {
      const logPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
      if (fs.existsSync(logPath)) {
        const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
        const tiers = { T0: 0, T1: 0, T2: 0, T3: 0 };
        const tokens = { T0: 0, T1: 0, T2: 0, T3: 0 };
        let total = 0;
        lines.slice(-200).forEach(l => {
          try {
            const d = JSON.parse(l);
            if (d.tier) {
              tiers[d.tier]++; total++;
              const estTokens = Math.round((d.prompt_length || 200) / 4) + 1500;
              tokens[d.tier] += estTokens;
            }
          } catch { /* skip */ }
        });
        if (total > 0) {
          pbt = {};
          tokensByTier = {};
          Object.entries(tiers).forEach(([k, v]) => {
            pbt[k] = (v / total) * 100;
            tokensByTier[k] = tokens[k];
          });
          source = 'advisory';
        }
      }
    } catch { /* silent */ }
  }

  if (!pbt) return '';

  // Bucket percentages — from execution data (real mode) or decisions (advisory).
  const opsPct   = Math.round(pbt.T3 || 0);
  const sonPct   = Math.round(pbt.T2 || 0);
  const hkuPct   = Math.round(pbt.T1 || 0);
  const localPct = Math.round(pbt.T0 || 0);
  const gptPct   = Math.round(pbt.GPT || 0);
  const gemPct   = Math.round(pbt.GEM || 0);

  const total = opsPct + sonPct + hkuPct + localPct + gptPct + gemPct;
  if (total === 0) return '';

  // Token counts (formatted as "12k" or "1.2M")
  const fmtTok = (n) => {
    if (!n || n === 0) return '';
    if (n >= 1000000) return ` ${DIM}${(n/1000000).toFixed(1)}M${RESET}`;
    if (n >= 1000) return ` ${DIM}${Math.round(n/1000)}k${RESET}`;
    return ` ${DIM}${n}${RESET}`;
  };
  const opsTok   = tokensByTier ? fmtTok(tokensByTier.T3 || 0) : '';
  const sonTok   = tokensByTier ? fmtTok(tokensByTier.T2 || 0) : '';
  const hkuTok   = tokensByTier ? fmtTok(tokensByTier.T1 || 0) : '';
  const localTok = tokensByTier ? fmtTok(tokensByTier.T0 || 0) : '';

  // Build 10-char proportional bar (all 6 buckets).
  const barLen = 10;
  const share = (pct) => Math.round((pct / total) * barLen);
  let opsC  = share(opsPct);
  let sonC  = share(sonPct);
  let hkuC  = share(hkuPct);
  let locC  = share(localPct);
  let gptC  = share(gptPct);
  let gemC  = share(gemPct);
  // Clamp rounding drift so the bar is always exactly barLen chars.
  const drift = barLen - (opsC + sonC + hkuC + locC + gptC + gemC);
  if (drift !== 0) locC = Math.max(0, locC + drift);

  const HAIKU_COLOR  = '\x1b[38;2;180;180;255m';
  const GPT_COLOR    = '\x1b[38;2;120;220;120m';
  const GEMINI_COLOR = '\x1b[38;2;140;180;255m';

  const bar =
    (opsC > 0 ? `${TIER_COLOR.T3}${'█'.repeat(opsC)}${RESET}` : '') +
    (sonC > 0 ? `${TIER_COLOR.T2}${'█'.repeat(sonC)}${RESET}` : '') +
    (hkuC > 0 ? `${HAIKU_COLOR}${'█'.repeat(hkuC)}${RESET}`   : '') +
    (locC > 0 ? `${TIER_COLOR.T0}${'█'.repeat(locC)}${RESET}` : '') +
    (gptC > 0 ? `${GPT_COLOR}${'█'.repeat(gptC)}${RESET}`     : '') +
    (gemC > 0 ? `${GEMINI_COLOR}${'█'.repeat(gemC)}${RESET}`  : '');

  // Source marker — "exec" (real) vs "adv" (advisory/recommendation).
  // Tagging the bar makes it impossible to confuse the two sources.
  const sourceBadge = source === 'real'
    ? `${DIM}exec${RESET}`
    : `\x1b[38;2;255;180;80madv\x1b[0m`;

  // Labels always show all 6 LLMs (0% when unused) so the legend is stable.
  const dimIf = (pct, color) => pct === 0 ? DIM : color;
  const labels = [];
  labels.push(`${dimIf(opsPct,   TIER_COLOR.T3)}🔴 Opus ${opsPct}%${RESET}${opsTok}`);
  labels.push(`${dimIf(sonPct,   TIER_COLOR.T2)}🟡 Sonnet ${sonPct}%${RESET}${sonTok}`);
  labels.push(`${dimIf(hkuPct,   HAIKU_COLOR)}⚡ Haiku ${hkuPct}%${RESET}${hkuTok}`);
  labels.push(`${dimIf(localPct, TIER_COLOR.T0)}🦙 Local ${localPct}%${RESET}${localTok}`);
  labels.push(`${dimIf(gptPct,   GPT_COLOR)}🟩 GPT ${gptPct}%${RESET}`);
  labels.push(`${dimIf(gemPct,   GEMINI_COLOR)}💎 Gemini ${gemPct}%${RESET}`);

  // GPU tag for the Local tier — shows what hardware powers Ollama
  let gpuTag = '';
  try {
    // Try tracker endpoint first
    const g = fetchTrackerJson('/gpu', 200);
    if (g && g.name_short && g.vendor !== 'cpu') {
      gpuTag = ` ${DIM}⚡${g.name_short}${RESET}`;
    }
  } catch { /* silent */ }
  if (!gpuTag) {
    // Fallback: read hw-capability.json directly
    try {
      const hwPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'hw-capability.json');
      if (fs.existsSync(hwPath)) {
        const hw = JSON.parse(fs.readFileSync(hwPath, 'utf8'));
        if (hw.name) gpuTag = ` ${DIM}⚡${hw.name}${RESET}`;
      }
    } catch { /* silent */ }
  }

  return ` ${bar} ${sourceBadge} ${labels.join(' · ')}${gpuTag}`;
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

// ── Savings hero renderer ──────────────────────────────────────────────────
// Format: 💰 ↓89% saved ~$3.84 · spent ~$0.47
// Green ≥75%, yellow ≥40%, dim otherwise.
//
// v0.12: PRIMARY source is execution.log (real per-Bash models) so the hero
// agrees with the distribution bar and the footer. Advisory tracker data is
// only used as a fallback when execution.log has nothing for the session,
// and when used it's tagged with "(advisory)" so there's no ambiguity.
function renderSavingsHero(mOpt, sessionId) {
  try {
    const m = mOpt || fetchFrugalMetrics(sessionId);

    // Helper: format with currency
    const fmtMoney = (usd, m) => {
      const currency = (m && m.currency || 'USD').toUpperCase();
      const altKey = `in_${currency.toLowerCase()}`;
      const alt = m && m[altKey];
      const symbolMap = { USD: '$', BRL: 'R$', EUR: '€', GBP: '£' };
      const sym = symbolMap[currency] || '$';
      if (alt && currency !== 'USD' && alt.saved != null) {
        return `${sym}${(alt.saved * usd / (m.saved || 1)).toFixed(2)}`;
      }
      return `$${usd.toFixed(2)}`;
    };

    // ── PRIMARY: real execution data from execution.log ───────────────────
    // Count Bash calls per model for this session, map each to a tier, use
    // pricing.js to compute what was actually spent vs what all-Opus would
    // have cost. This is the SAME data source as the distribution bar — the
    // two numbers are guaranteed to agree.
    try {
      const real = realExecutionCounts(sessionId);
      if (real && real.total > 0) {
        let pricing;
        try { pricing = require('../tools/router/pricing'); }
        catch {
          try { pricing = require(path.join(os.homedir(), '.claude', 'tools', 'router', 'pricing.js')); }
          catch { pricing = null; }
        }
        if (pricing) {
          // 400 chars ≈ one Bash tool-use roundtrip worth of IO.
          // The absolute number is imperfect but the RATIO (real vs baseline)
          // is the signal the user actually cares about.
          const CHAR_UNIT = 400;
          const costAt = (tier) => pricing.estimateTurnCost(tier, CHAR_UNIT);
          const opusUnit = pricing.naiveOpusCost(CHAR_UNIT);

          const realSpent =
            real.opus   * costAt('T3') +
            real.sonnet * costAt('T2') +
            real.haiku  * costAt('T1') +
            real.local  * costAt('T0') +
            real.gpt    * costAt('T2') +  // external APIs ≈ Sonnet price band
            real.gemini * costAt('T2');

          const baseline = real.total * opusUnit;
          const saved = Math.max(0, baseline - realSpent);
          const pct = baseline > 0 ? Math.round((saved / baseline) * 100) : 0;

          let pctColor = DIM;
          if (pct >= 75) pctColor = '\x1b[38;2;50;220;120m';
          else if (pct >= 40) pctColor = '\x1b[38;2;220;220;100m';
          else if (pct === 0) pctColor = '\x1b[38;2;244;71;71m'; // red — no savings

          const arrow = pct >= 30 ? '↓' : (pct === 0 ? '∅' : '');
          const savedStr = `$${saved.toFixed(2)}`;
          const spentStr = `$${realSpent.toFixed(2)}`;

          // MP-18 Peça 6: show session + total savings side by side
          // Fetch total metrics (no session filter) for lifetime context
          let totalSuffix = '';
          try {
            const totalMetrics = fetchFrugalMetrics(null);
            if (totalMetrics && totalMetrics.prompts && totalMetrics.prompts > real.total) {
              const totalPct = Math.round(totalMetrics.saved_pct || 0);
              const totalDecisions = totalMetrics.prompts || 0;
              totalSuffix = ` ${DIM}· total: ${totalPct}% · ${totalDecisions} decisions${RESET}`;
            }
          } catch { /* non-fatal */ }

          // When savings are zero (all-Opus session) we make this EXPLICIT.
          if (pct === 0 || saved < 0.001) {
            return `💰 ${pctColor}∅ 0% saved${RESET} ${DIM}· spent ~${spentStr} (all-Opus)${RESET}${totalSuffix}`;
          }
          return `💰 ${pctColor}${arrow}${pct}%${RESET} ${DIM}saved ~${savedStr} · spent ~${spentStr}${RESET}${totalSuffix}`;
        }
      }
    } catch { /* fall through to advisory */ }

    // ── FALLBACK 1: tracker HTTP metrics (advisory, lifetime/session) ─────
    if (m && m.prompts) {
      const advisoryUsd = m.saved || 0;
      const guaranteedUsd = m.guaranteed_saved || 0;
      const savedUsd = guaranteedUsd > 0 ? guaranteedUsd : advisoryUsd;
      const spentUsd = m.actual_cost || 0;
      const tildePrefix = guaranteedUsd > 0 ? '' : '~';

      const pct = Math.round(m.saved_pct || 0);
      let pctColor = DIM;
      if (pct >= 75) pctColor = '\x1b[38;2;50;220;120m';
      else if (pct >= 40) pctColor = '\x1b[38;2;220;220;100m';
      const arrow = pct >= 30 ? '↓' : '';

      const savedStr = fmtMoney(savedUsd, m);
      let spent = '';
      if (spentUsd > 0) spent = ` ${DIM}· spent ${tildePrefix}${fmtMoney(spentUsd, m)}${RESET}`;

      // Explicit advisory tag — prevents the mismatch the user saw in v0.11.
      return `💰 ${pctColor}${arrow}${pct}%${RESET} ${DIM}saved ${tildePrefix}${savedStr} (advisory)${RESET}${spent}`;
    }

    // Fallback: compute from decisions.log using pricing.js (SSOT)
    // Critical: this MUST match what savings-tracker.js produces, otherwise
    // the statusline shows a different number than /frugal-savings.
    try {
      const logPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
      if (!fs.existsSync(logPath)) return '';
      let pricing;
      try { pricing = require('./pricing'); } catch { return ''; }
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
      let total = 0;
      let actual = 0;
      let naive = 0;
      // Use ALL entries (not last 200) so the statusline matches all-time
      // totals shown by /frugal-savings. The user was seeing mismatches
      // because the statusline was windowed and /frugal-savings was not.
      lines.forEach(l => {
        try {
          const d = JSON.parse(l);
          if (!d.tier || d.event && d.event !== 'classified') return;
          const promptLen = d.prompt_length || d.prompt_len || 200;
          actual += pricing.estimateTurnCost(d.tier, promptLen);
          naive += pricing.naiveOpusCost(promptLen);
          total++;
        } catch {}
      });
      if (total === 0 || naive === 0) return '';
      const saved = naive - actual;
      const pct = Math.round((1 - actual / naive) * 100);
      let pctColor = DIM;
      if (pct >= 75) pctColor = '\x1b[38;2;50;220;120m';
      else if (pct >= 40) pctColor = '\x1b[38;2;220;220;100m';
      const arrow = pct >= 30 ? '↓' : '';
      return `💰 ${pctColor}${arrow}${pct}%${RESET} ${DIM}saved ~$${saved.toFixed(2)} · spent ~$${actual.toFixed(2)} (advisory)${RESET}`;
    } catch { return ''; }
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

    // ── frugal v0.11 statusline ──────────────────────────────────────
    // Layout:
    //   🐕 ↓89% ~$3.84 │ █░░▒▒▓▓▓▓▓ ops:9·son:22·free:69
    //   🐕🦁 ↓89% ~$3.84 │ ██████████ ops:100  (beast mode)
    //   🐕🧘 ↓95% ~$0.12 │ ██████████ free:100 (zen mode)
    //
    // Per-session: each Claude Code terminal shows ITS own savings (this
    // conversation). The VS Code extension statusbar shows all-time totals.
    const metrics = fetchFrugalMetrics(session);

    // Mode badge
    let modeBadge = '';
    try {
      const modeFile = path.join(os.homedir(), '.claude', 'tools', 'router', '.frugal-mode.json');
      if (fs.existsSync(modeFile)) {
        const md = JSON.parse(fs.readFileSync(modeFile, 'utf8'));
        if (md.mode === 'beast') modeBadge = '\x1b[38;2;255;140;0m🦁\x1b[0m';
        else if (md.mode === 'zen') modeBadge = '\x1b[38;2;120;200;120m🧘\x1b[0m';
      }
    } catch { /* silent */ }

    // Compose: 🐕[mode] savings │ distribution-bar labels
    const savingsHero = renderSavingsHero(metrics, session);
    const dist = renderDistribution(metrics, session);
    const frugalSegment = savingsHero || dist
      ? ` │ 🐕${modeBadge} ${savingsHero}${dist ? ' │' + dist : ''}`
      : '';

    // Output
    const dirname = path.basename(dir);
    if (task) {
      process.stdout.write(`${gsdUpdate}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}${frugalSegment}`);
    } else {
      process.stdout.write(`${gsdUpdate}\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}${frugalSegment}`);
    }
  } catch (e) {
    // Silent fail - don't break statusline on parse errors
  }
});
