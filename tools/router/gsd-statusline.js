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
  if (process.env.MOOTER_MOCK === '1') {
    return {
      prompts: 42,
      saved: 1.68,
      saved_pct: 90,
      actual_cost: 0.18,
      guaranteed_saved: 0,
      currency: 'USD',
      plan: 'max',
      option_a_hits: 15,
      providers: { claude: 'ok', ollama: 'ok', gemini: 'off', gpt: 'ok' },
      latency: { sample_size: 42, p50_ms: 9500, delta_vs_opus_ms: -3200 },
    };
  }
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
  T3: '\x1b[38;2;194;95;101m',   // rose  #C25F65 (mooter brand — was #f44747)
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

// v2.0 palette — warm mooter.ai brand
const BRAND   = '\x1b[38;2;194;95;101m';  // rose #C25F65
const HEALTHY = '\x1b[38;2;78;201;176m';  // teal #4ec9b0
const WARN    = '\x1b[38;2;220;220;170m'; // gold #dcdcaa
const DANGER  = '\x1b[38;2;194;95;101m';  // rose #C25F65
const GREEN   = '\x1b[38;2;50;220;120m';
const BLACK   = '\x1b[30m';

const TIER_BG = {
  T0: '\x1b[48;2;78;201;176m',
  T1: '\x1b[48;2;86;156;214m',
  T2: '\x1b[48;2;220;220;170m',
  T3: '\x1b[48;2;194;95;101m',
};

// v2.0 helpers
function tierToModelShort(tier) {
  const map = { T0: 'qwen3:30b', T1: 'haiku-4-5', T2: 'sonnet-4-6', T3: 'opus-4-6' };
  return map[tier] || 'sonnet-4-6';
}

// Read the last *classified* tier from decisions.log — used as a fallback
// when MOOTER_LAST_TIER isn't in the process env (statusline runs in a
// sibling process, so hook-exported env vars don't propagate). Tester and
// arbiter events are skipped — we only want real user turns.
function readLastTierFromLog() {
  try {
    const logPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
    if (!fs.existsSync(logPath)) return null;
    const stat = fs.statSync(logPath);
    const MAX = 128 * 1024;
    const start = Math.max(0, stat.size - MAX);
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const d = JSON.parse(lines[i]);
        if (d.event !== 'classified') continue;
        if (d.source === 'mooter-tester') continue;
        if (!d.tier) continue;
        return { tier: d.tier, classifyMs: d.classify_ms || d.duration_ms || null };
      } catch {}
    }
  } catch {}
  return null;
}

function readRouterEnv() {
  if (process.env.MOOTER_MOCK === '1') {
    return {
      lastTier: process.env.MOOTER_LAST_TIER || 'T2',
      classifyMs: process.env.MOOTER_CLASSIFY_MS ? parseInt(process.env.MOOTER_CLASSIFY_MS) : 14,
    };
  }
  if (process.env.MOOTER_LAST_TIER) {
    return {
      lastTier: process.env.MOOTER_LAST_TIER,
      classifyMs: process.env.MOOTER_CLASSIFY_MS ? parseInt(process.env.MOOTER_CLASSIFY_MS) : null,
    };
  }
  const fromLog = readLastTierFromLog();
  if (fromLog) return { lastTier: fromLog.tier, classifyMs: fromLog.classifyMs };
  return { lastTier: null, classifyMs: null };
}

function healthDot(savingsPct) {
  if (savingsPct >= 30) return `${HEALTHY}●${RESET}`;
  if (savingsPct >= 10) return `${WARN}●${RESET}`;
  return `${DANGER}●${RESET}`;
}

function healthLabel(savingsPct) {
  if (savingsPct >= 30) return 'healthy';
  if (savingsPct >= 10) return 'ok';
  return 'all-Opus';
}

function getVersionInfo() {
  const candidates = [
    path.join(os.homedir(), '.claude', 'tools', 'router', 'version.json'),
    path.join(__dirname, 'version.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
  }
  return null;
}

// Avoid forking `git` (too slow for statusline). Parse .git/HEAD directly.
function getGitSha() {
  try {
    const candidates = [
      path.join(process.cwd(), '.git', 'HEAD'),
      path.join(os.homedir(), 'frugal', '.git', 'HEAD'),
    ];
    for (const headPath of candidates) {
      if (!fs.existsSync(headPath)) continue;
      const head = fs.readFileSync(headPath, 'utf8').trim();
      if (head.startsWith('ref:')) {
        const ref = head.slice(4).trim();
        const refPath = path.join(path.dirname(headPath), ref);
        if (fs.existsSync(refPath)) {
          return fs.readFileSync(refPath, 'utf8').trim().slice(0, 7);
        }
      } else if (/^[0-9a-f]+$/i.test(head)) {
        return head.slice(0, 7);
      }
    }
  } catch {}
  return null;
}

function getPlanLabel(metrics) {
  if (!metrics || !metrics.plan) return null;
  const p = String(metrics.plan).toLowerCase();
  const MAP = { max: 'Claude Max', team: 'Claude Team', pro: 'Claude Pro', free: 'Free' };
  return MAP[p] || (p.charAt(0).toUpperCase() + p.slice(1));
}

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return String(str).replace(/\x1B\[[0-9;]*[mGKHF]/g, '');
}

// ── v0.12: statusline — full transparency with model names + tokens ────────
// The statusline is frugal's business card. It must prove at a glance:
//   "frugal saves you real money — here's the proof."
//
// Layout (normal session):
//   🐮 ↓89% 💰saved ~$3.84 │ ████████░░ 🔴Opus 9% 🟡Sonnet 22% 🟢Local 69%
//
// Layout (with token counts, when tracker is running):
//   🐮 ↓89% 💰~$3.84 │ ████████░░ 🔴Opus 9% 12k 🟡Sonnet 22% 31k 🟢Local 69% 98k
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
  if (m.includes('deepseek'))                                            return 'deepseek';
  if (m.includes('gemma'))                                               return 'gemma';
  if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) return 'local';
  if (m.includes('gpt') || m.includes('codex') || m.includes('openai'))  return 'gpt';
  if (m.includes('gemini') || m.includes('google')) return 'gemini';
  if (m.includes('grok'))                          return 'grok';
  if (m.includes('mistral') || m.includes('codestral') || m.includes('mixtral')) return 'mistral';
  return null;
}

// v0.11: read execution.log and count REAL Bash tool calls by model bucket
// for the current session. This is the ground truth — same data source as
// the PostToolUse emoji that the user sees after every Bash call.
// Returns { opus, sonnet, haiku, local, gpt, gemini, total } or null on error.
function realExecutionCounts(sessionId) {
  if (process.env.MOOTER_MOCK === '1') {
    return { opus: 1, sonnet: 3, haiku: 4, local: 8, gpt: 0, gemini: 0, deepseek: 0, gemma: 0, grok: 0, mistral: 0, total: 16 };
  }
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

    const counts = { opus: 0, sonnet: 0, haiku: 0, local: 0, gpt: 0, gemini: 0, deepseek: 0, gemma: 0, grok: 0, mistral: 0 };
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
      T3: (real.opus    / real.total) * 100,
      T2: (real.sonnet  / real.total) * 100,
      T1: (real.haiku   / real.total) * 100,
      T0: (real.local   / real.total) * 100,
      GPT: (real.gpt    / real.total) * 100,
      GEM: (real.gemini / real.total) * 100,
      DSP: (real.deepseek / real.total) * 100,
      GMM: (real.gemma  / real.total) * 100,
      GRK: (real.grok   / real.total) * 100,
      MST: (real.mistral / real.total) * 100,
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
  const dspPct   = Math.round(pbt.DSP || 0);
  const gmmPct   = Math.round(pbt.GMM || 0);
  const grkPct   = Math.round(pbt.GRK || 0);
  const mstPct   = Math.round(pbt.MST || 0);

  const total = opsPct + sonPct + hkuPct + localPct + gptPct + gemPct + dspPct + gmmPct + grkPct + mstPct;
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
  let dspC  = share(dspPct);
  let gmmC  = share(gmmPct);
  let grkC  = share(grkPct);
  let mstC  = share(mstPct);
  // Clamp rounding drift so the bar is always exactly barLen chars.
  const drift = barLen - (opsC + sonC + hkuC + locC + gptC + gemC + dspC + gmmC + grkC + mstC);
  if (drift !== 0) locC = Math.max(0, locC + drift);

  const HAIKU_COLOR    = '\x1b[38;2;180;180;255m';
  const GPT_COLOR      = '\x1b[38;2;120;220;120m';
  const GEMINI_COLOR   = '\x1b[38;2;140;180;255m';
  const DEEPSEEK_COLOR = '\x1b[38;2;99;179;237m';
  const GEMMA_COLOR    = '\x1b[38;2;154;205;50m';
  const GROK_COLOR     = '\x1b[38;2;255;100;50m';
  const MISTRAL_COLOR  = '\x1b[38;2;255;140;0m';

  const bar =
    (opsC > 0 ? `${TIER_COLOR.T3}${'█'.repeat(opsC)}${RESET}` : '') +
    (sonC > 0 ? `${TIER_COLOR.T2}${'█'.repeat(sonC)}${RESET}` : '') +
    (hkuC > 0 ? `${HAIKU_COLOR}${'█'.repeat(hkuC)}${RESET}`   : '') +
    (locC > 0 ? `${TIER_COLOR.T0}${'█'.repeat(locC)}${RESET}` : '') +
    (dspC > 0 ? `${DEEPSEEK_COLOR}${'█'.repeat(dspC)}${RESET}` : '') +
    (gmmC > 0 ? `${GEMMA_COLOR}${'█'.repeat(gmmC)}${RESET}`    : '') +
    (gptC > 0 ? `${GPT_COLOR}${'█'.repeat(gptC)}${RESET}`     : '') +
    (gemC > 0 ? `${GEMINI_COLOR}${'█'.repeat(gemC)}${RESET}`  : '') +
    (grkC > 0 ? `${GROK_COLOR}${'█'.repeat(grkC)}${RESET}`    : '') +
    (mstC > 0 ? `${MISTRAL_COLOR}${'█'.repeat(mstC)}${RESET}` : '');

  // Source marker — subtle icon instead of jargon.
  // ✓ = real execution data, ~ = advisory/estimated.
  const sourceBadge = source === 'real'
    ? `${DIM}✓${RESET}`
    : `${DIM}~${RESET}`;

  // Labels grouped by provider layer — only active models shown.
  const L = (emoji, name, pct, color, tok) =>
    `${color}${emoji} ${name} ${pct}%${RESET}${tok || ''}`;

  // Layer 1: Local (free, GPU-powered)
  const local = [];
  if (localPct > 0) local.push(L('🦙', 'Qwn', localPct, TIER_COLOR.T0, localTok));
  if (dspPct > 0)   local.push(L('🐉', 'DSk', dspPct,   DEEPSEEK_COLOR));
  if (gmmPct > 0)   local.push(L('🌺', 'Gma', gmmPct,   GEMMA_COLOR));

  // GPU tag for local layer
  let gpuTag = '';
  try {
    const g = fetchTrackerJson('/gpu', 200);
    if (g && g.name_short && g.vendor !== 'cpu') {
      gpuTag = ` ${TIER_COLOR.T0}⚡${g.name_short}${RESET}`;
    }
  } catch { /* silent */ }
  if (!gpuTag) {
    try {
      const hwPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'hw-capability.json');
      if (fs.existsSync(hwPath)) {
        const hw = JSON.parse(fs.readFileSync(hwPath, 'utf8'));
        if (hw.name) gpuTag = ` ${TIER_COLOR.T0}⚡${hw.name}${RESET}`;
      }
    } catch { /* silent */ }
  }

  // Layer 2: Claude API (paid)
  const claude = [];
  if (opsPct > 0) claude.push(L('🔴', 'Ops', opsPct, TIER_COLOR.T3, opsTok));
  if (sonPct > 0) claude.push(L('🟡', 'Son', sonPct, TIER_COLOR.T2, sonTok));
  if (hkuPct > 0) claude.push(L('⚡', 'Hai', hkuPct, HAIKU_COLOR,   hkuTok));

  // Layer 3: External APIs (paid)
  const external = [];
  if (gptPct > 0) external.push(L('🟩', 'GPT', gptPct, GPT_COLOR));
  if (gemPct > 0) external.push(L('💎', 'Gmi', gemPct, GEMINI_COLOR));
  if (grkPct > 0) external.push(L('🔥', 'Grk', grkPct, GROK_COLOR));
  if (mstPct > 0) external.push(L('🌀', 'Mis', mstPct, MISTRAL_COLOR));

  // Assemble groups with separators — only show groups that have active models
  const groups = [];
  if (local.length > 0)    groups.push(`${DIM}🏠${RESET} ${local.join(' · ')}${gpuTag}`);
  if (claude.length > 0)   groups.push(`${DIM}☁️${RESET} ${claude.join(' · ')}`);
  if (external.length > 0) groups.push(`${DIM}🔌${RESET} ${external.join(' · ')}`);

  // 2-line layout: line 1 = bar + source, line 2 = grouped breakdown
  const line2 = `  ${groups.join('  │  ')}`;
  return ` ${bar} ${sourceBadge}\n${line2}`;
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

// v2.0 — calcSavings: extracts the raw data from the same 3 sources
// renderSavingsHero uses, without formatting. Returns:
//   { savingsPct, savedUsd, spentUsd, promptCount } — never throws.
function calcSavings(mOpt, sessionId) {
  if (process.env.MOOTER_MOCK === '1') {
    return { savingsPct: 90, savedUsd: '1.68', spentUsd: '0.18', promptCount: 42 };
  }
  const empty = { savingsPct: 0, savedUsd: null, spentUsd: null, promptCount: 0 };
  try {
    const m = mOpt || fetchFrugalMetrics(sessionId);

    // PRIMARY: real execution data
    try {
      const real = realExecutionCounts(sessionId);
      if (real && real.total > 0) {
        let pricing;
        try { pricing = require('./pricing'); }
        catch {
          try { pricing = require(path.join(os.homedir(), '.claude', 'tools', 'router', 'pricing.js')); }
          catch { pricing = null; }
        }
        if (pricing) {
          const CHAR_UNIT = 400;
          const costAt = (tier) => pricing.estimateTurnCost(tier, CHAR_UNIT);
          const opusUnit = pricing.naiveOpusCost(CHAR_UNIT);
          const realSpent =
            real.opus    * costAt('T3') +
            real.sonnet  * costAt('T2') +
            real.haiku   * costAt('T1') +
            real.local   * costAt('T0') +
            real.gpt     * costAt('T2') +
            real.gemini  * costAt('T2') +
            real.grok    * costAt('T2') +
            real.mistral * costAt('T1');
          const baseline = real.total * opusUnit;
          const saved = Math.max(0, baseline - realSpent);
          const pct = baseline > 0 ? Math.round((saved / baseline) * 100) : 0;
          return {
            savingsPct: pct,
            savedUsd: saved.toFixed(2),
            spentUsd: realSpent.toFixed(2),
            promptCount: real.total,
          };
        }
      }
    } catch { /* fall through */ }

    // FALLBACK 1: tracker metrics
    if (m && m.prompts) {
      const advisoryUsd = m.saved || 0;
      const guaranteedUsd = m.guaranteed_saved || 0;
      const savedUsd = guaranteedUsd > 0 ? guaranteedUsd : advisoryUsd;
      return {
        savingsPct: Math.round(m.saved_pct || 0),
        savedUsd: savedUsd.toFixed(2),
        spentUsd: (m.actual_cost || 0).toFixed(2),
        promptCount: m.prompts,
      };
    }

    // FALLBACK 2: decisions.log
    try {
      const logPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
      if (!fs.existsSync(logPath)) return empty;
      let pricing;
      try { pricing = require('./pricing'); } catch { return empty; }
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
      let total = 0, actual = 0, naive = 0;
      lines.forEach(l => {
        try {
          const d = JSON.parse(l);
          if (!d.tier || (d.event && d.event !== 'classified')) return;
          const promptLen = d.prompt_length || d.prompt_len || 200;
          actual += pricing.estimateTurnCost(d.tier, promptLen);
          naive  += pricing.naiveOpusCost(promptLen);
          total++;
        } catch {}
      });
      if (total === 0 || naive === 0) return empty;
      const saved = naive - actual;
      return {
        savingsPct: Math.round((1 - actual / naive) * 100),
        savedUsd: saved.toFixed(2),
        spentUsd: actual.toFixed(2),
        promptCount: total,
      };
    } catch {
      return empty;
    }
  } catch {
    return empty;
  }
}

// v2.0 — renderDistributionBar: just the colored bar, width parametric.
function renderDistributionBar(metrics, sessionId, width = 30) {
  const counts = realExecutionCounts(sessionId);
  if (!counts || !counts.total) return `${DIM}${'░'.repeat(width)}${RESET}`;
  const total = counts.total;
  const tiers = [
    { key: 'local',  color: TIER_COLOR.T0 },
    { key: 'haiku',  color: TIER_COLOR.T1 },
    { key: 'sonnet', color: TIER_COLOR.T2 },
    { key: 'opus',   color: TIER_COLOR.T3 },
  ];
  let bar = '';
  let filled = 0;
  for (const t of tiers) {
    if (filled >= width) break;
    const n = counts[t.key] || 0;
    let chars = Math.round((n / total) * width);
    if (filled + chars > width) chars = width - filled;
    if (chars > 0) {
      bar += `${t.color}${'█'.repeat(chars)}${RESET}`;
      filled += chars;
    }
  }
  if (filled < width) bar += `${DIM}${'░'.repeat(width - filled)}${RESET}`;
  return bar;
}

// ── Rich layout renderers (5-row dashboard) ──────────────────────────────
function termWidthCols() {
  return process.stdout.columns || parseInt(process.env.COLUMNS) || 120;
}

// Health indicator — mascot-coloured dot + matching text (no bg pill: we want
// the shape of the row to stay calm, the *colour* carries the signal).
function renderHealthPill(savingsPct) {
  let color, label;
  if (savingsPct >= 30) { color = HEALTHY; label = 'healthy'; }
  else if (savingsPct >= 10) { color = WARN; label = 'ok'; }
  else { color = DANGER; label = 'all-Opus'; }
  return `${color}●${RESET} ${color}${label}${RESET}`;
}

// Active Claude Code task (from todos) — tells the user what Claude is DOING
// right now, independent of tier/routing. Highest operational-awareness signal.
function getActiveTask(sessionId) {
  if (!sessionId) return null;
  try {
    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const todosDir = path.join(claudeDir, 'todos');
    if (!fs.existsSync(todosDir)) return null;
    const files = fs.readdirSync(todosDir)
      .filter(f => f.startsWith(sessionId) && f.includes('-agent-') && f.endsWith('.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    if (!files.length) return null;
    const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
    const inProgress = todos.find(t => t && t.status === 'in_progress');
    return inProgress ? (inProgress.activeForm || inProgress.content || null) : null;
  } catch {}
  return null;
}

// Latency pill — only when tracker has enough samples.
function getLatencyPill(metrics) {
  if (!metrics || !metrics.latency || !metrics.latency.sample_size) return null;
  const p50s = Math.round(metrics.latency.p50_ms / 1000);
  if (!Number.isFinite(p50s) || p50s < 1) return null;
  let color = HEALTHY;
  if (p50s > 30) color = DANGER;
  else if (p50s > 10) color = WARN;
  return `${DIM}latency${RESET} ${color}${BOLD}${p50s}s${RESET}`;
}

// Collect active warnings (stale hooks, update available, tracker offline).
// Returns an array of short messages, empty if no warnings.
function collectWarnings(metricsAvailable) {
  const warnings = [];
  try {
    const sharedCacheFile = path.join(os.homedir(), '.cache', 'gsd', 'gsd-update-check.json');
    const legacyCacheFile = path.join(os.homedir(), '.claude', 'cache', 'gsd-update-check.json');
    const cacheFile = fs.existsSync(sharedCacheFile) ? sharedCacheFile : legacyCacheFile;
    if (fs.existsSync(cacheFile)) {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cache.update_available) warnings.push('update available');
      if (cache.stale_hooks && cache.stale_hooks.length > 0) warnings.push('stale hooks');
    }
  } catch {}
  if (!metricsAvailable) warnings.push('tracker offline');
  return warnings;
}

// Right-anchor pill — warning takes priority over health signal.
function renderRightAnchor(savingsPct, metricsAvailable) {
  const warnings = collectWarnings(metricsAvailable);
  if (warnings.length) {
    // Short join for single-line constraint
    const msg = warnings.slice(0, 2).join(' · ');
    return `${DANGER}⚠${RESET} ${DANGER}${msg}${RESET}`;
  }
  return renderHealthPill(savingsPct);
}

// Task row — rendered between header and session when a todo is in_progress.
function renderTaskRow(sessionId) {
  const task = getActiveTask(sessionId);
  if (!task) return null;
  // Truncate extremely long titles to ~80 chars so the row stays on one line.
  const max = Math.max(40, termWidthCols() - 18);
  const shown = task.length > max ? task.slice(0, max - 1) + '…' : task;
  return `${DIM}task${RESET}     ${BRAND}▸${RESET} ${BOLD}${shown}${RESET}`;
}

// Row 1: 🐮 mooter · model · [ T2 ] · classify · latency · ctx          ● healthy
function renderHeaderRow(metrics, sessionId, displayModel, ctxPct, savingsPct) {
  const env = readRouterEnv();
  const tier = env.lastTier || 'T?';
  const tierBg = TIER_BG[tier] || '\x1b[48;2;100;100;100m';
  const tierBadge = `${tierBg}${BLACK}${BOLD} ${tier} ${RESET}`;  // anchor: background pill
  const modelRaw = displayModel || (metrics && metrics.model_used) || tierToModelShort(tier);
  const modelShort = String(modelRaw).replace(/^claude-/, '').replace(/-202510\w*/, '');

  const parts = [
    `🐮 ${BRAND}${BOLD}mooter${RESET}`,
    `${DIM}model${RESET} ${BOLD}${modelShort}${RESET}`,
    tierBadge,
  ];
  if (env.classifyMs) parts.push(`${DIM}classify${RESET} ${BOLD}${env.classifyMs}ms${RESET}`);
  const latency = getLatencyPill(metrics);
  if (latency) parts.push(latency);
  if (ctxPct !== null && ctxPct !== undefined) {
    const ctxColor = ctxPct >= 80 ? DANGER : ctxPct >= 65 ? WARN : HEALTHY;
    parts.push(`${DIM}ctx${RESET} ${ctxColor}${BOLD}${ctxPct}%${RESET}`);
  }
  const left = parts.join(`  ${DIM}│${RESET}  `);
  const right = renderHealthPill(savingsPct);

  const termW = termWidthCols();
  const padLen = Math.max(2, termW - stripAnsi(left).length - stripAnsi(right).length);
  return `${left}${' '.repeat(padLen)}${right}`;
}

// Row 2: session N prompts · $X spent · $Y saved · N% vs all-Opus
function renderSessionRow(savings) {
  if (!savings || !savings.promptCount) {
    return `${DIM}session${RESET}  ${DIM}awaiting first Bash tool call${RESET}`;
  }
  const spent = savings.spentUsd ? `$${savings.spentUsd}` : '$0.00';
  const saved = savings.savedUsd ? `$${savings.savedUsd}` : '$0.00';
  const pct = savings.savingsPct || 0;
  return [
    `${DIM}session${RESET} ${BOLD}${savings.promptCount}${RESET} ${DIM}prompts${RESET}`,
    `${BOLD}${spent}${RESET} ${DIM}spent${RESET}`,
    `${GREEN}${BOLD}${saved}${RESET} ${DIM}saved${RESET}`,
    `${BOLD}${pct}%${RESET} ${DIM}vs all-Opus${RESET}`,
  ].join(`  ${DIM}·${RESET}  `);
}

// Row 3: routing  [full-width colored distribution bar]
function renderRoutingRow(metrics, sessionId) {
  const termW = termWidthCols();
  const prefix = `${DIM}routing${RESET}  `;  // 2 spaces — tighter rhythm
  const prefixLen = stripAnsi(prefix).length;
  const barWidth = Math.max(20, termW - prefixLen);
  const bar = renderDistributionBar(metrics, sessionId, barWidth);
  return `${prefix}${bar}`;
}

// Row 4: ■ T0 58% local  ·  ■ T1 22% haiku  ·  ■ T2 14% sonnet  ·  ■ T3 6% opus
function renderLegendRow(sessionId) {
  const counts = realExecutionCounts(sessionId);
  if (!counts || !counts.total) {
    return `${DIM}legend${RESET}   ${DIM}populates after first Bash tool call${RESET}`;
  }
  const total = counts.total;
  const pctFor = (n) => Math.round((n / total) * 100);
  const tiers = [
    { key: 'local',  name: 'local',  color: TIER_COLOR.T0, label: 'T0' },
    { key: 'haiku',  name: 'haiku',  color: TIER_COLOR.T1, label: 'T1' },
    { key: 'sonnet', name: 'sonnet', color: TIER_COLOR.T2, label: 'T2' },
    { key: 'opus',   name: 'opus',   color: TIER_COLOR.T3, label: 'T3' },
  ];
  const parts = tiers.map(t => {
    const p = pctFor(counts[t.key] || 0);
    return `${t.color}■ ${t.label}${RESET} ${BOLD}${p}%${RESET} ${DIM}${t.name}${RESET}`;
  });

  // GPU tag — only when local tier > 10% (otherwise it's dead weight).
  let gpuTag = '';
  const localShare = (counts.local || 0) / counts.total;
  if (localShare >= 0.10) {
    try {
      const hwPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'hw-capability.json');
      if (fs.existsSync(hwPath)) {
        const hw = JSON.parse(fs.readFileSync(hwPath, 'utf8'));
        if (hw && hw.name) gpuTag = `     ${TIER_COLOR.T0}⚡${hw.name}${RESET}`;
      }
    } catch {}
  }

  return `${DIM}legend${RESET}   ${parts.join(`  ${DIM}·${RESET}  `)}${gpuTag}`;
}

// Provider health dots — compact infra status (Cld/Oll/Gmi/GPT).
function renderProviderDots(metrics) {
  if (!metrics || !metrics.providers) return null;
  const p = metrics.providers;
  const order = [['claude','Cld'], ['ollama','Oll'], ['gemini','Gmi'], ['gpt','GPT']];
  const dots = order.map(([key, short]) => {
    const state = p[key];
    if (state === 'ok')       return `${HEALTHY}●${RESET}${DIM}${short}${RESET}`;
    if (state === 'degraded') return `${WARN}◐${RESET}${DIM}${short}${RESET}`;
    return `${DIM}○${short}${RESET}`;
  }).join(' ');
  return dots;
}

// Row 5: plan X · auto-routed N · providers           v0.10.0 · sha 1a2b3c4
function renderPlanRow(metrics) {
  const plan = getPlanLabel(metrics);
  const version = getVersionInfo();
  const sha = getGitSha();
  const providers = renderProviderDots(metrics);

  const leftParts = [];
  if (plan) leftParts.push(`${DIM}plan${RESET} ${BOLD}${plan}${RESET}`);
  if (metrics && metrics.option_a_hits != null) {
    leftParts.push(`${DIM}auto-routed${RESET} ${BOLD}${metrics.option_a_hits}${RESET} ${DIM}prompts${RESET}`);
  }
  if (providers) leftParts.push(providers);
  const left = leftParts.join(`  ${DIM}│${RESET}  `);

  const rightParts = [];
  if (version && version.version) rightParts.push(`${DIM}v${version.version}${RESET}`);
  if (sha) rightParts.push(`${DIM}sha ${sha}${RESET}`);
  const right = rightParts.join(`${DIM} · ${RESET}`);

  if (!left && !right) return null;
  if (!left) return right;
  if (!right) return left;

  const termW = termWidthCols();
  const padLen = Math.max(2, termW - stripAnsi(left).length - stripAnsi(right).length);
  return `${left}${' '.repeat(padLen)}${right}`;
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
            real.opus    * costAt('T3') +
            real.sonnet  * costAt('T2') +
            real.haiku   * costAt('T1') +
            real.local   * costAt('T0') +
            real.gpt     * costAt('T2') +  // external APIs ≈ Sonnet price band
            real.gemini  * costAt('T2') +
            real.grok    * costAt('T2') +
            real.mistral * costAt('T1');   // Mistral ≈ Haiku price band

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

          // Session prompt count from execution.log (real, this terminal only)
          const sessionPrompts = real.total;

          // Lifetime context (all sessions combined) — brief suffix
          let totalSuffix = '';
          try {
            const totalMetrics = fetchFrugalMetrics(null);
            if (totalMetrics && totalMetrics.prompts && totalMetrics.prompts > sessionPrompts) {
              const totalPct = Math.round(totalMetrics.saved_pct || 0);
              totalSuffix = ` ${DIM}· 🌍 ${totalPct}% · ${totalMetrics.prompts}p${RESET}`;
            }
          } catch { /* non-fatal */ }

          // When savings are zero (all-Opus session) we make this EXPLICIT.
          if (pct === 0 || saved < 0.001) {
            return `📍 ${pctColor}∅ 0%${RESET} ${DIM}· ~${spentStr} spent · ${sessionPrompts}p (all-Opus)${RESET}${totalSuffix}`;
          }
          return `📍 ${pctColor}${arrow}${pct}%${RESET} ${DIM}~${savedStr} saved · ~${spentStr} spent · ${sessionPrompts}p${RESET}${totalSuffix}`;
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
      return `📍 ${pctColor}${arrow}${pct}%${RESET} ${DIM}saved ${tildePrefix}${savedStr} (advisory)${RESET}${spent}`;
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
      return `📍 ${pctColor}${arrow}${pct}%${RESET} ${DIM}saved ~$${saved.toFixed(2)} · spent ~$${actual.toFixed(2)} (advisory)${RESET}`;
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
    const avgS = (l.p50_ms / 1000).toFixed(0);
    const delta = l.delta_vs_opus_ms;

    // Color based on absolute speed
    let color;
    if (l.p50_ms <= 10000)      color = '\x1b[38;2;35;209;139m';  // green
    else if (l.p50_ms <= 30000) color = '\x1b[38;2;220;220;170m'; // yellow
    else                        color = '\x1b[38;2;244;71;71m';    // red

    // Tradeoff message: explain what the time means in practice
    let tradeoff = '';
    if (delta != null) {
      const absDelta = Math.abs(delta);
      const deltaSec = (absDelta / 1000).toFixed(0);
      if (delta < -500) {
        // Routing is FASTER than all-Opus — best case
        tradeoff = ` ${DIM}· ${deltaSec}s faster + cheaper${RESET}`;
      } else if (absDelta <= 500) {
        // Same speed — no tradeoff
        tradeoff = ` ${DIM}· same speed, less cost${RESET}`;
      } else {
        // Routing is slower — show the tradeoff honestly
        tradeoff = ` ${DIM}· +${deltaSec}s for savings${RESET}`;
      }
    }

    return ` │ ${color}⏱ ~${avgS}s/prompt${RESET}${tradeoff}`;
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
    const defaultOrder = ['claude', 'ollama', 'deepseek', 'gemma', 'gemini', 'gpt', 'grok', 'mistral'];
    const order = envOrder
      ? envOrder.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
      : defaultOrder;

    const SHORT = { claude: 'Cld', ollama: 'Oll', deepseek: 'DSk', gemma: 'Gma', gemini: 'Gmi', gpt: 'GPT', grok: 'Grk', mistral: 'Mis' };
    const labelFor = (key, state) => {
      const name = SHORT[key] || key.charAt(0).toUpperCase() + key.slice(1);
      if (state === 'ok')       return `\x1b[38;2;35;209;139m${name}●\x1b[0m`;
      if (state === 'degraded') return `\x1b[38;2;220;220;170m${name}◐\x1b[0m`;
      if (state === 'unknown')  return `\x1b[38;2;90;90;90m${name}◌\x1b[0m`;
      return `\x1b[38;2;58;58;58m${name}○\x1b[0m`;
    };
    const parts = order.map((key) => labelFor(key, p[key] || 'off'));
    return ` │ ${parts.join(' ')}`;
  } catch {
    return '';
  }
}

// v4.0 — buildStatusline: Claude Code only renders the first line of statusline
// output (by design), so we condense everything into ONE width-adaptive row.
//
// Priority tiers (left to right, added while width budget allows):
//   TIER A (always):   🐮 [Tn] model · ↓savings% $saved · ● health
//   TIER B (≥100 col): · ctx X% · 10s lat · bar
//   TIER C (≥140 col): · $spent · ⚡GPU · ●Cld●Oll
//   TIER D (≥180 col): · auto-routed N · plan · vX.Y
function buildStatusline(data) {
  const model = data?.model?.display_name || null;
  const session = data?.session_id || '';
  const remaining = data?.context_window?.remaining_percentage;

  const AUTO_COMPACT_BUFFER_PCT = 16.5;
  let ctxPct = null;
  if (remaining != null) {
    const usableRemaining = Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100);
    const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));
    ctxPct = used;

    const sessionSafe = session && !/[/\\]|\.\./.test(session);
    if (sessionSafe) {
      try {
        const bridgePath = path.join(os.tmpdir(), `claude-ctx-${session}.json`);
        fs.writeFileSync(bridgePath, JSON.stringify({
          session_id: session,
          remaining_percentage: remaining,
          used_pct: used,
          timestamp: Math.floor(Date.now() / 1000),
        }));
      } catch { /* bridge is best-effort */ }
    }
  }

  const metrics = fetchFrugalMetrics(session);
  const savings = calcSavings(metrics, session);
  const env = readRouterEnv();
  const tier = env.lastTier || 'T?';
  const tierBg = TIER_BG[tier] || '\x1b[48;2;100;100;100m';
  const tierBadge = `${tierBg}${BLACK}${BOLD} ${tier} ${RESET}`;
  const modelRaw = model || tierToModelShort(tier);
  const modelShort = String(modelRaw)
    .replace(/^claude-/, '')
    .replace(/-202510\w*/, '')
    .replace(/\s*\([^)]*\)$/, '')   // strip "(1M context)" etc
    .trim();

  const pct = savings?.savingsPct || 0;
  const arrow = pct >= 30 ? '↓' : (pct === 0 ? '∅' : '');
  const savedStr = savings?.savedUsd ? `$${savings.savedUsd}` : null;
  const spentStr = savings?.spentUsd ? `$${savings.spentUsd}` : null;
  const dot = healthDot(pct);
  const label = healthLabel(pct);
  const latency = getLatencyPill(metrics);
  const providers = renderProviderDots(metrics);
  const plan = getPlanLabel(metrics);
  const version = getVersionInfo();
  const termW = termWidthCols();

  // Compact bar (8 chars) — visual spine of the distribution.
  let compactBar = '';
  try {
    const b = renderDistributionBar(metrics, session, 10);
    if (b) compactBar = b;
  } catch {}

  // Build priority buckets. We'll assemble left-to-right, dropping lower-priority
  // fragments if the total visible width would exceed termW.
  const SEP = `  ${DIM}·${RESET}  `;
  const sepLen = stripAnsi(SEP).length;

  const A_mandatory = [
    `🐮 ${BRAND}${BOLD}mooter${RESET}`,
    tierBadge,
    `${BOLD}${modelShort}${RESET}`,
  ];
  const savingsCore = savedStr
    ? `${BOLD}${pct}%${arrow}${RESET} ${GREEN}${BOLD}${savedStr}${RESET} ${DIM}saved${RESET}`
    : (savings?.promptCount ? `${DIM}${pct}% no savings yet${RESET}` : null);
  const healthCore = renderRightAnchor(pct, !!metrics);

  // Priority-ordered extras. Each is [priority, render] — higher priority added first.
  const extras = [];
  if (compactBar) extras.push({ prio: 1, str: compactBar });
  if (ctxPct !== null) {
    const ctxColor = ctxPct >= 80 ? DANGER : ctxPct >= 65 ? WARN : HEALTHY;
    extras.push({ prio: 2, str: `${DIM}ctx${RESET} ${ctxColor}${BOLD}${ctxPct}%${RESET}` });
  }
  if (latency) extras.push({ prio: 3, str: latency });
  if (spentStr) extras.push({ prio: 4, str: `${BOLD}${spentStr}${RESET} ${DIM}spent${RESET}` });
  if (savings?.promptCount) extras.push({ prio: 5, str: `${BOLD}${savings.promptCount}${RESET}${DIM}p${RESET}` });
  if (providers) extras.push({ prio: 6, str: providers });
  if (plan) extras.push({ prio: 7, str: `${DIM}plan${RESET} ${BOLD}${plan}${RESET}` });
  if (metrics && metrics.option_a_hits != null && metrics.option_a_hits > 0) {
    extras.push({ prio: 8, str: `${DIM}auto-routed${RESET} ${BOLD}${metrics.option_a_hits}${RESET}` });
  }
  if (version && version.version) extras.push({ prio: 9, str: `${DIM}v${version.version}${RESET}` });

  // Measure budget and add extras while we have room.
  const mandatory = [...A_mandatory, savingsCore, healthCore].filter(Boolean);
  let visible = stripAnsi(mandatory.join(SEP)).length;
  // Claude Code reserves space on the right for its own footer decorations
  // (keyboard hints, token counter). Leaving ~30 chars headroom prevents the
  // "…" truncation we saw on real renders.
  const budget = Math.max(40, termW - 30);

  const sorted = extras.sort((a, b) => a.prio - b.prio);
  const addedExtras = [];
  for (const e of sorted) {
    const needed = sepLen + stripAnsi(e.str).length;
    if (visible + needed > budget) break;
    addedExtras.push(e.str);
    visible += needed;
  }

  // Final assembly: mandatory fields first, then extras (priority order), health last.
  // We reinsert healthCore at the end for visual anchor.
  const withoutHealth = mandatory.slice(0, -1);
  const all = [...withoutHealth, ...addedExtras, healthCore];
  return all.join(SEP);
}

// Mock entry point — bypass stdin so `MOOTER_MOCK=1 node gsd-statusline.js`
// produces a full statusline without needing a JSON pipe.
if (process.env.MOOTER_MOCK === '1') {
  const mockData = {
    model: { display_name: null },
    workspace: { current_dir: process.cwd() },
    session_id: 'mock',
    context_window: { remaining_percentage: 45 },
  };
  try {
    process.stdout.write(buildStatusline(mockData));
  } catch (e) {
    process.stderr.write(`mock error: ${e && e.message}\n`);
  }
  process.exit(0);
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
    process.stdout.write(buildStatusline(data));
  } catch (e) {
    // Silent fail - don't break statusline on parse errors
  }
});
