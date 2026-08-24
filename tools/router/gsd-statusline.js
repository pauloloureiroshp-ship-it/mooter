#!/usr/bin/env node
// gsd-hook-version: 1.37.1
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

// ── v4.1 tier palette — brand at T0 (the mooter WIN), danger at T3 ──────
// Rationale: rose is the mooter brand. It should signal mooter's success
// (local routing = winning), not the failure state (Opus = expensive).
// Previously T3=rose caused cognitive dissonance: the brand color
// appeared when things were going worst. This release decouples BRAND
// (rose, always mooter) from DANGER (pure red, distinct semantic).
const TIER_COLOR = {
  T0: '\x1b[38;2;194;95;101m',   // rose  #C25F65  — local (mooter brand = the win)
  T1: '\x1b[38;2;78;201;176m',   // teal  #4ec9b0  — haiku (cheaper paid, healthy)
  T2: '\x1b[38;2;220;220;170m',  // gold  #dcdcaa  — sonnet (caution, pricier)
  T3: '\x1b[38;2;227;70;70m',    // red   #E34646  — opus (danger, top price)
  // kimi-k3 (Moonshot) — violeta. Cor PROPRIA de proposito: o kimi nao pertence
  // a escada T0-T3 (o classificador nem o conhece) e nao e subscricao. Dar-lhe
  // a cor de um tier faria a barra mentir sobre o que se gastou.
  KIMI: '[38;2;167;139;250m',
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

// Semantic colors — now distinct from tier colors so they don't overload.
const BRAND   = '\x1b[38;2;194;95;101m';  // rose #C25F65 — mooter mark
const HEALTHY = '\x1b[38;2;78;201;176m';  // teal #4ec9b0
const WARN    = '\x1b[38;2;220;220;170m'; // gold #dcdcaa
const DANGER  = '\x1b[38;2;227;70;70m';   // red  #E34646 — true alerts (separate from brand rose)
const GREEN   = '\x1b[38;2;50;220;120m';
const BLACK   = '\x1b[30m';

const TIER_BG = {
  T0: '\x1b[48;2;194;95;101m',  // rose
  T1: '\x1b[48;2;78;201;176m',  // teal
  T2: '\x1b[48;2;220;220;170m', // gold
  T3: '\x1b[48;2;227;70;70m',   // red
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
  // Primary: tracker /metrics (live).
  let raw = metrics && metrics.plan;
  // Fallback: ~/.claude/tools/router/subscription-profile.json (set by /setup).
  if (!raw) {
    try {
      const subPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'subscription-profile.json');
      if (fs.existsSync(subPath)) {
        const j = JSON.parse(fs.readFileSync(subPath, 'utf8'));
        raw = j && j.profiles && j.profiles.anthropic;
      }
    } catch {}
  }
  if (!raw) return null;
  const p = String(raw).toLowerCase();
  const MAP = { max: 'Claude Max', team: 'Claude Team', pro: 'Claude Pro', free: 'Free' };
  return MAP[p] || (p.charAt(0).toUpperCase() + p.slice(1));
}

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return String(str).replace(/\x1B\[[0-9;]*[mGKHF]/g, '');
}

// v6.0 — box-drawing line builder for 2L/3L adaptive layout.
// Produces a bordered row with left content, automatic ─ fill, and right
// content anchored at the far edge. Corner chars picked by `pos`:
//   'top'    → ╭─ ... ─╮
//   'mid'    → ├─ ... ─┤
//   'bottom' → ╰─ ... ─╯
// Width is the target terminal width. 6 chars are reserved for the frame
// (`╭─ ` + ` ─╮`). Fill is rose brand to echo the 🐮 mooter identity.
function boxLine(pos, leftContent, rightContent, width) {
  const corners = {
    top:    { open: '╭', close: '╮' },
    mid:    { open: '├', close: '┤' },
    bottom: { open: '╰', close: '╯' },
  };
  const c = corners[pos] || corners.mid;
  const leftLen  = stripAnsi(leftContent || '').length;
  const rightLen = stripAnsi(rightContent || '').length;
  const frameLen = 6; // "╭─ " + " ─╮"
  const gap      = (leftLen && rightLen) ? 1 : 0; // space between left and fill
  const fillLen  = Math.max(2, width - leftLen - rightLen - frameLen - gap);
  const fill     = '─'.repeat(fillLen);
  const left     = leftContent ? `${leftContent} ` : '';
  const right    = rightContent ? ` ${rightContent}` : '';
  return `${BRAND}${c.open}─${RESET} ${left}${BRAND}${fill}${RESET}${right} ${BRAND}─${c.close}${RESET}`;
}

// v6.8 — flat row for in-prompt statusline. left ═════ right with
// U+2550 DOUBLE HORIZONTAL filler in BRAND rose. Probe results (session
// #32, commit 76eca09):
//   ✅ probe 6  — '-' ASCII hyphen (baseline, kept as fallback)
//   ✅ probe 7  — '·' middle dot (U+00B7)
//   ✅ probe 8  — ASCII pseudo-corners +---
//   ✅ probe 9  — '═' (U+2550) — CHOSEN: dense look, same block as '─'
//   ✅ probe 10 — '▁' lower one eighth block
//   ✅ probe 11 — '-' + single close-corners ╮┤╯
//   ✅ probe 12 — no filler, trailing \n
//   ❌ '─' (U+2500 LIGHT HORIZONTAL) — kills multi-line; East Asian
//      Width ambiguous. U+2550 ('═') does NOT share this pathology.
// Width capped to 90 cols to survive narrow VS Code terminals (~100 cols).
// Override with MOOTER_FILLER env (any single char) to experiment without
// redeploying — e.g. MOOTER_FILLER='-' to restore v6.7 look.
function flatLine(leftContent, rightContent, width) {
  if (!rightContent) return leftContent || '';
  if (!leftContent)  return rightContent;
  const leftLen   = stripAnsi(leftContent).length;
  const rightLen  = stripAnsi(rightContent).length;
  const safeWidth = Math.min(width || 100, 90);
  const fillLen   = Math.max(2, safeWidth - leftLen - rightLen - 2);
  const fillChar  = process.env.MOOTER_FILLER || '═';
  const fill      = `${BRAND}${fillChar.repeat(fillLen)}${RESET}`;
  return `${leftContent} ${fill} ${rightContent}`;
}

// ── v5.0 multi-subscription awareness helpers ──────────────────────────
// Mooter's real value prop: orchestrate ALL paid LLM subscriptions.
// The statusline should surface which ones are active, what mode the
// router is in, and where we are in the billing cycle so the user can
// judge "should I be in zen or beast mode right now?"

// Mode: reads .mooter-mode.json flags. Returns { mode: 'beast'|'zen'|null }.
function getRouterMode() {
  if (process.env.MOOTER_MOCK === '1') {
    if (process.env.MOOTER_MODE_MOCK === 'beast') return { mode: 'beast' };
    if (process.env.MOOTER_MODE_MOCK === 'zen')   return { mode: 'zen' };
    return { mode: null };
  }
  try {
    const p = path.join(os.homedir(), '.claude', 'tools', 'router', '.mooter-mode.json');
    if (!fs.existsSync(p)) return { mode: null };
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    // Union schema (AUDIT-MOOTER-2026-04-19 F5.1): prefer `mode` string.
    if (typeof j.mode === 'string' && j.mode !== 'auto') return { mode: j.mode };
    if (j.beast_mode === true) return { mode: 'beast' };
    if (j.zen_mode === true)   return { mode: 'zen' };
  } catch {}
  return { mode: null };
}

// Subscriptions: reads subscription-profile.json. Returns array of
// { label, short, providerKey } objects. `short` is used in multi-sub
// compact display (row packed into L3). Future-ready for multi-provider
// (anthropic + openai + google + etc.).
function getSubscriptions() {
  if (process.env.MOOTER_MOCK === '1') {
    // Rich mock to exercise multi-sub layout in tests:
    //   MOOTER_MOCK_SUBS=multi shows 3 providers; default = 1.
    if (process.env.MOOTER_MOCK_SUBS === 'multi') {
      return [
        { label: 'Claude Max', short: 'Claude', providerKey: 'anthropic' },
        { label: 'GPT Plus',   short: 'GPT',    providerKey: 'openai'    },
        { label: 'Gemini Adv', short: 'Gmi',    providerKey: 'google'    },
      ];
    }
    return [{ label: 'Claude Max', short: 'Claude', providerKey: 'anthropic' }];
  }
  try {
    const p = path.join(os.homedir(), '.claude', 'tools', 'router', 'subscription-profile.json');
    if (!fs.existsSync(p)) return [];
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!j.profiles) return [];
    const LABEL_MAP = {
      anthropic: { max: 'Claude Max', pro: 'Claude Pro', team: 'Claude Team', free: 'Claude Free' },
      openai:    { plus: 'GPT Plus', team: 'GPT Team', pro: 'GPT Pro', free: 'GPT Free' },
      google:    { advanced: 'Gemini Adv', pro: 'Gemini Pro', free: 'Gemini' },
      xai:       { premium: 'Grok Premium', free: 'Grok' },
      mistral:   { pro: 'Mistral Pro', free: 'Mistral' },
    };
    const SHORT_MAP = {
      anthropic: 'Claude',
      openai:    'GPT',
      google:    'Gmi',
      xai:       'Grok',
      mistral:   'Mistral',
    };
    const out = [];
    for (const [provider, tierKey] of Object.entries(j.profiles)) {
      const tier = String(tierKey).toLowerCase();
      const providerMap = LABEL_MAP[provider] || {};
      out.push({
        label:       providerMap[tier] || `${provider} ${tier}`,
        short:       SHORT_MAP[provider] || provider,
        providerKey: provider,
      });
    }
    return out;
  } catch {}
  return [];
}

// Cycle awareness: where are we in the billing month? Helps user decide
// if they should be in zen (conserve budget) or beast (spend remaining
// before reset) mode. Returns compact string like "d19/30" + progress %.
function getCycleDay() {
  const d = new Date();
  const day = d.getDate();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const progressPct = Math.round((day / lastDay) * 100);
  return { day, lastDay, progressPct };
}

// v5.1 — per-subscription usage & beast/zen recommendation
function getUsageData() {
  if (process.env.MOOTER_MOCK === '1') {
    return {
      usage: {
        anthropic: {
          plan: 'max',
          budget_usd: 200,
          cost_usd: 42.50,
          call_count: 216,
          used_pct: 21.25,
          projected_pct: 34,
          pace_ratio: 0.34,
          cycle: { progress_pct: 62, elapsed_days: 18.5, length_days: 30 },
          rolling_5h: { cost_usd: 0.68, budget_usd: 1.39, used_pct: 48.9, pace_ratio: 0.489, call_count: 12 },
        },
      },
      recommendation: { mode: 'beast', reason: 'projection 34% — under-using plan at 62% cycle' },
      sparkline: { spark: '▁▂▃▄▅▆▇', buckets: [0.1, 0.5, 1.2, 2.1, 3.4, 4.5, 5.8], peak: 5.8 },
    };
  }
  try {
    const est = require('./usage-estimator');
    const usage = est.computeSubscriptionUsage();
    if (!usage) return null;
    const recommendation = est.getRecommendation(usage);
    const sparkline = est.computeBurnRateSparkline(7);
    return { usage, recommendation, sparkline };
  } catch { return null; }
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
  // kimi-k3 (Moonshot): nuvem paga ao token, de fornecedor proprio. Sem este
  // bucket os jobs kimi caiam em `null` e desapareciam da barra — o dono via so
  // os locais e as subscricoes Claude/Codex, e concluia que o kimi nao corria.
  if (m.includes('kimi') || m.includes('moonshot'))  return 'kimi';
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
      // AUDIT-MOOTER-2026-04-19 F3.1: exec-logger's degraded mode writes
      // the classifier's `recommended_model` (not the real one) when the
      // transcript scan is too slow. Skip those lines so the distribution
      // bar never conflates advisory with real exec counts.
      const modeM = line.match(/\bmode=(\S+)/);
      if (modeM && modeM[1] === 'decisions_log') continue;
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
    return {
      savingsPct: 90, savedUsd: '1.68', spentUsd: '0.18', promptCount: 42,
      executionCount: 0, guaranteedUsdW2: 0, advisoryUsd: 1.68,
      signal: 'mock',
    };
  }
  const empty = {
    savingsPct: 0, savedUsd: null, spentUsd: null, promptCount: 0,
    executionCount: 0, guaranteedUsdW2: 0, advisoryUsd: 0,
    signal: 'empty',
  };
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
        // ── CAMINHO DESLIGADO a 2026-08-23 ────────────────────────────────
        //
        // Este ramo lia o `execution.log` e contava CHAMADAS BASH como se
        // fossem prompts. Medido: 3.225 execucoes para 123 prompts = 26 por
        // prompt. E cobrava cada uma como um turno de 400 caracteres fixos
        // (`CHAR_UNIT`), numero que nao vem de medicao nenhuma.
        //
        // Somava-se um terceiro defeito: devolvia `signal: 'real_exec'`, e o
        // comentario original chamava-lhe "a legitimate guaranteed number".
        // Nao era — era modelado a partir de uma contagem na unidade errada.
        //
        // Nao e corrigivel: a fonte nao tem a unidade certa. O FALLBACK 2 le o
        // `decisions.log`, filtra `event === 'classified'` e usa o comprimento
        // REAL de cada prompt — passa a ser o unico caminho.
        //
        // O que se perde: a visibilidade do `guaranteed_saved` (os Option-A
        // hits, o unico dolar medido do sistema). Fica por religar a partir de
        // uma fonte com a unidade certa, e esta escrito aqui para nao se perder.
        if (false && pricing) {
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
          // Wave-2 honesty surface — even when the PRIMARY path drives
          // the headline number, expose the executor and advisory
          // values so the renderer can show the diff when it exists.
          const exec = (m && m.executions) || {};
          return {
            savingsPct: pct,
            savedUsd: saved.toFixed(2),
            spentUsd: realSpent.toFixed(2),
            promptCount: real.total,
            executionCount: Number(exec.total) || 0,
            guaranteedUsdW2: Number(exec.guaranteed_saved_usd) || 0,
            advisoryUsd: Number(m && m.saved) || 0,
            // Signal tells the renderer that savedUsd here is computed
            // from real execution.log data — a legitimate "guaranteed"
            // number even when guaranteedUsdW2 is zero.
            signal: 'real_exec',
          };
        }
      }
    } catch { /* fall through */ }

    // FALLBACK 1: tracker metrics
    if (m && m.prompts) {
      const advisoryUsd = m.saved || 0;
      const guaranteedUsd = m.guaranteed_saved || 0;
      const exec = m.executions || {};
      const guaranteedUsdW2 = Number(exec.guaranteed_saved_usd) || 0;
      // Pick order: Wave-2 executor (real outcomes) > legacy Option-A
      // hits > advisory estimate. The renderer separately displays
      // advisory vs guaranteed when the executor has real data.
      const savedUsd = guaranteedUsdW2 > 0
        ? guaranteedUsdW2
        : (guaranteedUsd > 0 ? guaranteedUsd : advisoryUsd);
      return {
        savingsPct: Math.round(m.saved_pct || 0),
        savedUsd: savedUsd.toFixed(2),
        spentUsd: (m.actual_cost || 0).toFixed(2),
        promptCount: m.prompts,
        executionCount: Number(exec.total) || 0,
        guaranteedUsdW2,
        advisoryUsd,
        // Signal tells the renderer that savedUsd may collapse to
        // advisory when both Wave-2 and Option-A produce zero — used
        // by the honesty marker to refuse the conflation.
        signal: 'tracker',
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
      // No Wave-2 executor visibility from this fallback (it works off
      // raw decisions.log without the aggregate). Zeros tell the
      // renderer to keep the legacy single-number rendering.
      return {
        savingsPct: Math.round((1 - actual / naive) * 100),
        savedUsd: saved.toFixed(2),
        spentUsd: actual.toFixed(2),
        promptCount: total,
        executionCount: 0,
        guaranteedUsdW2: 0,
        advisoryUsd: 0,
        signal: 'log_fallback',
      };
    } catch {
      return empty;
    }
  } catch {
    return empty;
  }
}

// v4.1 — renderDistributionBar: colored bar, width parametric.
// Guarantees every non-zero tier gets at least 1 char so small shares
// (e.g. 6% opus in a 10-char bar) remain visible. Overflow is absorbed
// by the largest tier so total width is always exact.
function renderDistributionBar(metrics, sessionId, width = 30) {
  const counts = realExecutionCounts(sessionId);
  if (!counts || !counts.total) return `${DIM}${'░'.repeat(width)}${RESET}`;
  const total = counts.total;
  const tiers = [
    { key: 'local',  color: TIER_COLOR.T0 },
    { key: 'haiku',  color: TIER_COLOR.T1 },
    { key: 'kimi',   color: TIER_COLOR.KIMI },
    { key: 'sonnet', color: TIER_COLOR.T2 },
    { key: 'opus',   color: TIER_COLOR.T3 },
  ];
  // Compute targets; ensure any non-zero tier gets ≥1 char.
  const targets = tiers.map(t => {
    const n = counts[t.key] || 0;
    if (n === 0) return 0;
    return Math.max(1, Math.round((n / total) * width));
  });
  // Reconcile to exact width by adjusting the largest non-zero tier.
  let sum = targets.reduce((a, b) => a + b, 0);
  const argmax = () => {
    let idx = 0, best = -1;
    for (let i = 0; i < targets.length; i++) if (targets[i] > best) { best = targets[i]; idx = i; }
    return idx;
  };
  while (sum > width) { targets[argmax()]--; sum--; }
  while (sum < width) { targets[argmax()]++; sum++; }
  let bar = '';
  for (let i = 0; i < tiers.length; i++) {
    if (targets[i] > 0) bar += `${tiers[i].color}${'█'.repeat(targets[i])}${RESET}`;
  }
  return bar;
}

// ── Rich layout renderers (5-row dashboard) ──────────────────────────────
function termWidthCols() {
  return process.stdout.columns || parseInt(process.env.COLUMNS) || 120;
}

// v6.2 — ctx bar as routing-distribution spine. The ctx progress shows how
// full Claude Code's context window is (filled width = ctxPct). Within the
// filled portion, characters are colour-split by tier share so the user
// sees at a glance "what paid my ctx so far". T0=rose=mooter win.
function renderCtxBarTier(ctxPct, counts, width) {
  const w = Math.max(6, width || 16);
  const filled = Math.max(0, Math.min(w, Math.round((ctxPct / 100) * w)));
  const empty  = w - filled;
  if (filled === 0) return `${DIM}${'░'.repeat(w)}${RESET}`;
  if (!counts || counts.total === 0) {
    const solid = ctxPct >= 80 ? DANGER : ctxPct >= 65 ? WARN : HEALTHY;
    return `${solid}${'█'.repeat(filled)}${RESET}${DIM}${'░'.repeat(empty)}${RESET}`;
  }
  // T0 uses BRAND (not TIER_COLOR.T0) so the segment is guaranteed to
  // render in the exact same rose as the frame lines — visual coherence
  // between "mooter win" (T0) and the mooter mark (brand).
  const shares = [
    { color: BRAND,         n: counts.local  || 0 },
    { color: TIER_COLOR.T1, n: counts.haiku  || 0 },
    { color: TIER_COLOR.T2, n: counts.sonnet || 0 },
    { color: TIER_COLOR.T3, n: counts.opus   || 0 },
  ];
  let bar = '', used = 0;
  for (const s of shares) {
    if (s.n === 0) continue;
    const chars = Math.round((s.n / counts.total) * filled);
    if (chars > 0) {
      bar += `${s.color}${'█'.repeat(chars)}${RESET}`;
      used += chars;
    }
  }
  if (used < filled) bar += `${BRAND}${'█'.repeat(filled - used)}${RESET}`;
  bar += `${DIM}${'░'.repeat(empty)}${RESET}`;
  return bar;
}

// v6.2 — subscription row. One paid plan per row, showing pace · 5h · spark ·
// quota. Rec badge right-anchors when THIS provider triggered the mode
// recommendation.
function renderSubscriptionRow(sub, usageData, width, pos, recBadge, sparklineStr, sepStr, flat) {
  const u = usageData && usageData.usage && usageData.usage[sub.providerKey];
  const sep = sepStr || ` ${DIM}·${RESET} `;
  // v6.4 — per-provider emoji so each row has a visual anchor that reflects
  // the brand/metaphor of the provider:
  //   anthropic (Claude) → 🧠  reasoning/intellect (Claude's positioning)
  //   openai (GPT)       → 💬  chat heritage (ChatGPT origin)
  //   google (Gemini)    → ♊   the Gemini astrological twin glyph
  //   xai (Grok)         → ⚡  X/speed branding
  //   mistral            → 🌬️  the French mistral wind
  //   unknown            → 📦  generic fallback
  const PROVIDER_ICON = {
    anthropic: '🧠',
    openai:    '💬',
    google:    '♊',
    xai:       '⚡',
    mistral:   '🌬️',
  };
  const icon = PROVIDER_ICON[sub.providerKey] || '📦';
  const nameSeg = `${icon} ${BOLD}${sub.label}${RESET}`;
  if (!u) {
    const left = `${nameSeg} ${DIM}— no usage data${RESET}`;
    return flat ? flatLine(left, '', width) : boxLine(pos, left, '', width);
  }
  // v6.8 — pace sentiment replaces the cryptic "N%↑" pill. pace_ratio
  // compares monthly burn rate vs the day-of-cycle expectation, so:
  //   <0.8  → "relaxed"  (plenty of headroom, under pace)
  //   ≤1.2  → "on pace"  (right on track)
  //   ≤1.5  → "burning"  (over pace, watch the 5h window)
  //   >1.5  → "critical" (way over, consider /mooter-zen)
  // The right-anchor dot below still uses paceColor so sentiment + colour
  // tell the same story.
  const ratio = u.pace_ratio || 0;
  let paceColor, paceWord;
  if      (ratio < 0.8)  { paceColor = GREEN;  paceWord = 'relaxed'; }
  else if (ratio <= 1.2) { paceColor = DIM;    paceWord = 'on pace'; }
  else if (ratio <= 1.5) { paceColor = WARN;   paceWord = 'burning'; }
  else                   { paceColor = DANGER; paceWord = 'critical'; }
  const pacePill = `${paceColor}${BOLD}${paceWord}${RESET} ${DIM}pace${RESET}`;
  // 5h rolling window (Anthropic cares most, others optional)
  // v6.8 storytelling — adds a sentiment word after the percentage so the
  // user reads "5h 27% cold" instead of a naked number. Bucketed on used_pct
  // so it aligns with visual expectation:
  //   <30% → 'cold'       (green, lots of room)
  //   <60% → 'warm'       (dim, normal)
  //   <85% → 'hot'        (warn, watch out)
  //   ≥85% → 'throttling' (danger, close to limit)
  let fivePill = '';
  if (u.rolling_5h && u.rolling_5h.budget_usd > 0) {
    const p5 = Math.round(u.rolling_5h.used_pct);
    const r5 = u.rolling_5h.pace_ratio || 0;
    let c5 = DIM;
    if (r5 > 2)        c5 = DANGER;
    else if (r5 > 1.3) c5 = WARN;
    else if (r5 > 0.8) c5 = DIM;
    else               c5 = HEALTHY;
    let fiveWord = 'warm';
    if      (p5 < 30) fiveWord = 'cold';
    else if (p5 < 60) fiveWord = 'warm';
    else if (p5 < 85) fiveWord = 'hot';
    else              fiveWord = 'throttling';
    fivePill = `${DIM}5h${RESET} ${c5}${BOLD}${p5}%${RESET} ${c5}${fiveWord}${RESET}`;
  }
  // v6.8 — monthly budget. Label changed from "quota $X/Y" to "$X/$Y month"
  // so the period ("month") is explicit. Reads as: "used $X of $Y this month".
  let quotaPill = '';
  if (u.budget_usd > 0) {
    const cost = u.cost_usd || 0;
    const c = cost < 10 ? cost.toFixed(2) : cost.toFixed(0);
    quotaPill = `${BOLD}$${c}/$${Math.round(u.budget_usd)}${RESET} ${DIM}month${RESET}`;
  }
  const spark = sparklineStr || '';
  // v6.8 — narrative order: name → monthly budget → 5h window → pace
  // sentiment → sparkline. Reads left-to-right like: "Claude Max, $2.67
  // of $200 this month, 5h window 27%, relaxed pace, [trend]".
  const leftParts = [nameSeg, quotaPill, fivePill, pacePill, spark].filter(Boolean);
  const left = leftParts.join(sep);
  // Right anchor: rec badge if this sub triggered it, else a pace dot
  const right = recBadge || `${paceColor}●${RESET}`;
  return flat ? flatLine(left, right, width) : boxLine(pos, left, right, width);
}

// v6.2 — local layer row. Shows Ollama/T0 routing share, latency, and $0
// cost. Right anchors a "mooter win" badge when local share > 50%.
function renderLocalRow(counts, metrics, width, pos, sepStr, flat) {
  const sep = sepStr || ` ${DIM}·${RESET} `;
  const total = counts && counts.total ? counts.total : 0;
  const share = total > 0 ? Math.round(((counts.local || 0) / total) * 100) : 0;
  let shareColor = DANGER;
  if (share >= 60)      shareColor = BRAND;
  else if (share >= 30) shareColor = WARN;
  const nameSeg = `${DIM}🦙${RESET} ${BOLD}Ollama local${RESET}`;
  const sharePill = `${shareColor}${BOLD}${share}%${RESET} ${DIM}routing${RESET}`;
  const modelPill = `${DIM}model${RESET} ${BOLD}${process.env.MOOTER_OLLAMA_MODEL || 'qwen3:30b'}${RESET}`;
  let latPill = '';
  if (metrics && metrics.latency && metrics.latency.sample_size) {
    const p50s = Math.round(metrics.latency.p50_ms / 1000);
    if (Number.isFinite(p50s) && p50s >= 1) {
      latPill = `${DIM}p50${RESET} ${HEALTHY}${BOLD}${p50s}s${RESET}`;
    }
  }
  const costPill = `${DIM}cost${RESET} ${GREEN}${BOLD}$0${RESET}`;
  const leftParts = [nameSeg, sharePill, modelPill, latPill, costPill].filter(Boolean);
  const left = leftParts.join(sep);
  const right = share >= 50 ? `${BRAND}${BOLD}🐮 mooter win${RESET}` : '';
  return flat ? flatLine(left, right, width) : boxLine(pos, left, right, width);
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

// v6.0 — attempt-tracker for background self-healing actions. Keeps a tiny
// timestamp file per action so we only retry every DEBOUNCE_MS, even across
// separate statusline invocations.
function recentlyAttempted(key, debounceMs) {
  try {
    const p = path.join(os.tmpdir(), `mooter-heal-${key}.ts`);
    if (fs.existsSync(p)) {
      const ts = parseInt(fs.readFileSync(p, 'utf8'), 10);
      if (!isNaN(ts) && Date.now() - ts < debounceMs) return true;
    }
    fs.writeFileSync(p, String(Date.now()));
  } catch {}
  return false;
}

// v6.0 — auto-sync stale hooks. The update checker flags the hook file in
// ~/.claude/hooks/ as stale when its `// gsd-hook-version:` comment doesn't
// match what's installed. 95% of the time both files are byte-identical
// modulo that single comment line — so we do a content-aware compare and,
// if they're effectively the same, silently bump the version + clear the
// cache. When they genuinely differ, we copy the newer one over. Runs
// detached so the render never blocks.
function trySyncStaleHooks() {
  if (recentlyAttempted('hooks-sync', 60 * 1000)) return;
  try {
    // The file currently executing IS the source of truth. Whether we're
    // running from frugal/tools/router/ (dev) or ~/.claude/hooks/ (installed),
    // __filename tells us what Claude Code is actually invoking — and that's
    // the version we want mirrored to the hooks path.
    const src = __filename;
    const dst = path.join(os.homedir(), '.claude', 'hooks', 'gsd-statusline.js');
    if (!fs.existsSync(src)) return;
    if (fs.existsSync(dst)) {
      const srcBuf = fs.readFileSync(src);
      const dstBuf = fs.readFileSync(dst);
      // Same file (src === dst) or identical content → nothing to copy, but
      // still clear the cache below since the warning is outdated.
      if (src !== dst && !srcBuf.equals(dstBuf)) {
        fs.writeFileSync(dst, srcBuf);
      }
    } else {
      // Hook file missing entirely → copy over.
      fs.writeFileSync(dst, fs.readFileSync(src));
    }
    // Clear stale_hooks from cache (both shared and legacy paths).
    for (const cacheFile of [
      path.join(os.homedir(), '.cache', 'gsd', 'gsd-update-check.json'),
      path.join(os.homedir(), '.claude', 'cache', 'gsd-update-check.json'),
    ]) {
      if (!fs.existsSync(cacheFile)) continue;
      try {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (cache.stale_hooks && cache.stale_hooks.length) {
          cache.stale_hooks = [];
          fs.writeFileSync(cacheFile, JSON.stringify(cache));
        }
      } catch {}
    }
  } catch {}
}

// v6.0 — auto-start the savings tracker daemon when offline. Spawns
// savings-tracker.js detached so it survives beyond this render, with a
// 60s debounce to avoid hammering when it's genuinely broken. The daemon
// itself exits silently if :7821 is already bound, so no duplication.
function tryStartTracker() {
  if (recentlyAttempted('tracker-start', 60 * 1000)) return;
  try {
    const tracker = path.join(os.homedir(), '.claude', 'tools', 'router', 'savings-tracker.js');
    if (!fs.existsSync(tracker)) return;
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [tracker], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch {}
}

// Collect active warnings (stale hooks, update available, tracker offline).
// Returns an array of short messages, empty if no warnings.
// Side-effect: kicks off background self-healing for stale hooks & offline
// tracker — they're silent if already healthy or debounced.
function collectWarnings(metricsAvailable) {
  const warnings = [];
  try {
    const sharedCacheFile = path.join(os.homedir(), '.cache', 'gsd', 'gsd-update-check.json');
    const legacyCacheFile = path.join(os.homedir(), '.claude', 'cache', 'gsd-update-check.json');
    const cacheFile = fs.existsSync(sharedCacheFile) ? sharedCacheFile : legacyCacheFile;
    if (fs.existsSync(cacheFile)) {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cache.update_available) warnings.push('update available');
      if (cache.stale_hooks && cache.stale_hooks.length > 0) {
        warnings.push('stale hooks');
        trySyncStaleHooks(); // self-heal in background
      }
    }
  } catch {}
  if (!metricsAvailable) {
    warnings.push('tracker offline');
    tryStartTracker(); // self-heal in background
  }
  return warnings;
}

// v5.3 — recent autopilot flip (last 5min) for toast notification
function getRecentFlip() {
  try {
    const flipLog = path.join(os.homedir(), '.claude', 'tools', 'router', '.autopilot-flips.log');
    if (!fs.existsSync(flipLog)) return null;
    const stat = fs.statSync(flipLog);
    const MAX = 32 * 1024;
    const start = Math.max(0, stat.size - MAX);
    const fd = fs.openSync(flipLog, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    if (!lines.length) return null;
    const last = JSON.parse(lines[lines.length - 1]);
    const ageMs = Date.now() - (last.ts || 0);
    if (ageMs > 5 * 60 * 1000) return null; // older than 5 min = stale
    return last;
  } catch { return null; }
}

// Right-anchor pill — ONE always-visible pill, priority:
//   1. Recent autopilot flip toast (5 min after action)
//   2. System warnings (stale hooks / tracker offline)
//   3. Health pill (baseline)
// Recommendation badge stays as a separate extra (prio 2) so it can
// coexist with warnings — both are actionable at the same time.
function renderRightAnchor(savingsPct, metricsAvailable) {
  const flip = getRecentFlip();
  if (flip && flip.from && flip.to) {
    const label = flip.to === 'beast' ? 'CrazyMoo' : flip.to === 'zen' ? 'LazyMoo' : flip.to;
    return `${HEALTHY}${BOLD}🔄 → ${label}${RESET}`;
  }
  const warnings = collectWarnings(metricsAvailable);
  if (warnings.length) {
    const msg = warnings.slice(0, 2).join(' · ');
    return `${DANGER}⚠ ${msg}${RESET}`;
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
  const subscriptions = getSubscriptions();
  const routerMode = getRouterMode();
  const cycle = getCycleDay();
  const usageData = getUsageData();
  const version = getVersionInfo();
  const termW = termWidthCols();

  // Compact bar (10 chars) — visual spine of the distribution.
  // With T0=rose palette swap, lots of rose here = mooter is winning.
  let compactBar = '';
  try {
    const b = renderDistributionBar(metrics, session, 10);
    if (b) compactBar = b;
  } catch {}

  // Tight separator — every char counts in a single-line statusline.
  // ` · ` (3 chars) vs the old `  ·  ` (5) frees ~14 chars across 7 pills.
  const SEP = ` ${DIM}·${RESET} `;
  const sepLen = stripAnsi(SEP).length;

  // v5.4 — mode badge rebrand to the mooter cow family.
  //   beast   → 🐂 CrazyMoo (bull = aggressive cow, all power, all-Opus)
  //   zen     → 🐄 LazyMoo  (grazing cow = conserve, favour T0/T1)
  //   default → 🐮 Moo      (the mooter brand cow = auto-route, intelligent)
  // Internal keys 'beast' / 'zen' / null stay unchanged for backwards compat
  // with /mooter-beast, /mooter-zen, /mooter-auto, autopilot, etc.
  // Source of truth: getRouterMode() → ~/.claude/tools/router/.mooter-mode.json
  //   (written by /mooter-beast, /mooter-zen, /mooter-auto, autopilot).
  // v6.9 — all three modes always visible; only the active one gets emoji + color.
  //   Inactive modes render as dim plain text. Makes modes discoverable and
  //   removes ambiguity about which mode is active at a glance.
  // Wave 58.4 Block E (Q2) — REVIEWED and DELIBERATELY KEPT. The brief proposed
  //   hiding/collapsing the inactive modes to reduce "redundancy", but that would
  //   reverse the v6.9 discoverability decision above. Paulo's gate decision
  //   (2026-06-13): keep all three visible, inactive ones dim. NO code change —
  //   this comment is the decision record. See docs/strategy/WAVE58_4_DAY0_RECON.md §A.4.
  const modeMoo   = routerMode.mode === null    ? `${BOLD}🐮 Moo${RESET}`              : `${DIM}Moo${RESET}`;
  const modeCrazy = routerMode.mode === 'beast' ? `${DANGER}${BOLD}🐂 CrazyMoo${RESET}` : `${DIM}CrazyMoo${RESET}`;
  const modeLazy  = routerMode.mode === 'zen'   ? `${HEALTHY}${BOLD}🐄 LazyMoo${RESET}`  : `${DIM}LazyMoo${RESET}`;
  const modeBadge = `${modeMoo} ${DIM}·${RESET} ${modeCrazy} ${DIM}·${RESET} ${modeLazy}`;
  // v6.2 — tier-segmented ctx bar. Replaces both ctx% pill and the
  // last-prompt tierBadge. Filled width = ctxPct; colours within filled
  // portion = tier share of routing (T0=rose=mooter win). At a glance
  // the user sees both HOW FULL and HOW MUCH was local.
  // v6.7 — fall back to cumulative execution.log counts when the current
  // session has 0 calls (fresh terminal). Otherwise L1 stays empty of tier
  // badges and ctx-tier-bar until the user runs a prompt — feels broken.
  const tierCountsEarly = realExecutionCounts(session) || realExecutionCounts(null) || { total: 0 };

  // v6.3 — tier legend: coloured dots naming WHICH tiers ran in this terminal
  // session, with % share. Renders only tiers with >0 counts (compact). This
  // is the "colour key" that decodes the ctx bar's segments immediately to
  // the right. Format: "●T0 58% · ●T1 22% · ●T3 6%"
  // Source of truth: tierCountsEarly ← realExecutionCounts(session|null) which
  //   reads ~/.claude/tools/router/execution.log and buckets via bucketFor()
  //   (line 427): Opus→T3, Sonnet→T2, Haiku→T1, qwen3:30b/local→T0.
  const tierLegendPill = (() => {
    if (!tierCountsEarly || tierCountsEarly.total === 0) return null;
    // T0 dot uses BRAND (not TIER_COLOR.T0) to match the frame's rose
    // exactly — see renderCtxBarTier for the matching decision.
    const tiers = [
      { key: 'T0', color: BRAND,         n: tierCountsEarly.local  || 0 },
      { key: 'T1', color: TIER_COLOR.T1, n: tierCountsEarly.haiku  || 0 },
      { key: 'T2', color: TIER_COLOR.T2, n: tierCountsEarly.sonnet || 0 },
      { key: 'T3', color: TIER_COLOR.T3, n: tierCountsEarly.opus   || 0 },
    ].filter(t => t.n > 0);
    if (tiers.length === 0) return null;
    return tiers.map(t => {
      const pct = Math.round((t.n / tierCountsEarly.total) * 100);
      return `${t.color}●${RESET}${DIM}${t.key}${RESET} ${BOLD}${pct}%${RESET}`;
    }).join(` ${DIM}·${RESET} `);
  })();

  // Source of truth: ctxPct ← data.context_window.remaining_percentage (Claude
  //   Code stdin JSON, converted to "used %" in buildStatusline line ~1557).
  //   Always-show contract: renders even at 0% as long as remaining is provided.
  const ctxPill = (ctxPct !== null && ctxPct !== undefined) ? (() => {
    const ctxColor = ctxPct >= 80 ? DANGER : ctxPct >= 65 ? WARN : HEALTHY;
    const bar = renderCtxBarTier(ctxPct, tierCountsEarly, 14);
    return `${DIM}ctx${RESET} ${bar} ${ctxColor}${BOLD}${ctxPct}%${RESET}`;
  })() : null;

  // v6.4 — modelShort dropped. Mooter is a ROUTER, not a model: showing
  // the session's Claude Code model ("Opus 4.7") here conflicts with the
  // tier legend which is what actually matters. Model info is a Claude
  // Code concern, not a mooter concern.
  const A_mandatory = [
    `🐮 ${BRAND}${BOLD}mooter${RESET}`,
    modeBadge,
    tierLegendPill,
    ctxPill,
  ].filter(Boolean);
  // Drop the 'saved' word — the ↓ arrow + green $ already imply it.
  const savingsCore = savedStr
    ? `${BOLD}${pct}%${arrow}${RESET} ${GREEN}${BOLD}${savedStr}${RESET}`
    : (savings?.promptCount ? `${DIM}${pct}% no savings${RESET}` : null);
  const healthCore = renderRightAnchor(pct, !!metrics);

  // Priority-ordered extras. v5.0 reorder emphasizes mooter as a
  // multi-subscription orchestrator (not just a "route to local" router):
  //   1 bar           — visual hero (distribution across all tiers)
  //   2 MODE          — beast/zen is CRITICAL when active (overrides routing)
  //   3 subscriptions — all paid LLM plans the user has (multi-provider)
  //   4 cycle d/N     — where in the billing month (decides beast vs zen)
  //   5 spent $       — session cost
  //   6 prompts N     — session activity
  //   7 ctx %         — working memory
  //   8 latency Ns    — perf feedback
  //   9 providers     — infra health dots (online/degraded)
  //  10 auto-routed   — option-A deflection count
  //  11 version       — meta
  const extras = [];
  // v6.5 — compactBar (old 10-char distribution spine) REMOVED. Its role
  // is now served by the tier-segmented ctx bar in mandatory (which uses
  // the SAME colours and the SAME source data, so it was just noise).
  // Set MOOTER_SHOW_LEGACY_BAR=1 to bring it back for debugging.
  if (compactBar && process.env.MOOTER_SHOW_LEGACY_BAR === '1') {
    extras.push({ prio: 1, str: compactBar });
  }

  // mode is in mandatory (see above) — never drops out of budget.

  // v6.5 — multi-subscription pill (old single-cluster form) REMOVED.
  // Replaced by one individual pill per provider below in the v6.5 block,
  // which uses per-provider emoji (🧠 💬 ♊ ⚡ 🌬️) and fits better via
  // priority-fit budgeting (each sub can drop independently on narrow widths).

  // Recommendation badge — actionable advice, matches the CrazyMoo /
  // LazyMoo nomenclature from the mode badge.
  if (usageData && usageData.recommendation) {
    const rec = usageData.recommendation.mode;
    const active = routerMode.mode;
    if (rec !== 'auto' && rec !== active) {
      const icon  = rec === 'beast' ? '🐂' : '🐄';
      const label = rec === 'beast' ? 'CrazyMoo' : 'LazyMoo';
      const slash = rec === 'beast' ? '/mooter-beast' : '/mooter-zen';
      const color = rec === 'beast' ? WARN : HEALTHY;
      // v6.0 — badge now names the slash command so the user knows HOW to act,
      // not just that action is suggested. Format: "→ 🐂 CrazyMoo /mooter-beast"
      extras.push({ prio: 2, str: `${color}${BOLD}→ ${icon} ${label}${RESET} ${DIM}${slash}${RESET}` });
    }
  }

  // v5.4 — Mooter efficiency pill: T0 share (local routing = the win).
  // The pill tells the user at a glance how much mooter saved vs paying
  // for every prompt. rose=winning, gold=mixed, red=all-paid.
  if (savings && savings.promptCount) {
    const counts = realExecutionCounts(session);
    if (counts && counts.total > 0) {
      const t0share = Math.round(((counts.local || 0) / counts.total) * 100);
      let effColor = DANGER;
      if (t0share >= 60)      effColor = BRAND;
      else if (t0share >= 30) effColor = WARN;
      else                     effColor = DANGER;
      extras.push({ prio: 4, str: `🐮 ${effColor}${BOLD}${t0share}%${RESET}` });
    }
  }

  // ctx moved to mandatory pills (always visible) — no extras entry.

  // Cycle pill — late-month tint flags when to consider CrazyMoo.
  const cycleColor = cycle.progressPct >= 75 ? WARN : cycle.progressPct >= 90 ? DANGER : DIM;
  extras.push({ prio: 6, str: `${DIM}cycle${RESET} ${cycleColor}${BOLD}d${cycle.day}/${cycle.lastDay}${RESET}` });

  // 5h rolling window pill (crucial for Claude Max enforcement).
  if (usageData && usageData.usage) {
    const firstProvider = Object.keys(usageData.usage)[0];
    const r5h = firstProvider && usageData.usage[firstProvider].rolling_5h;
    if (r5h && r5h.budget_usd > 0) {
      const p5 = Math.round(r5h.used_pct);
      let c5 = DIM;
      if (r5h.pace_ratio > 2)        c5 = DANGER;
      else if (r5h.pace_ratio > 1.3) c5 = WARN;
      else if (r5h.pace_ratio > 0.8) c5 = DIM;
      else                            c5 = HEALTHY;
      extras.push({ prio: 7, str: `${DIM}5h${RESET} ${c5}${BOLD}${p5}%${RESET}` });
    }
  }

  // 7-day burn sparkline (visual trend).
  if (usageData && usageData.sparkline && usageData.sparkline.peak > 0) {
    extras.push({ prio: 8, str: `${BRAND}${usageData.sparkline.spark}${RESET}` });
  }

  if (spentStr) extras.push({ prio: 9, str: `${BOLD}${spentStr}${RESET} ${DIM}spent${RESET}` });
  if (savings?.promptCount) extras.push({ prio: 10, str: `${BOLD}${savings.promptCount}${RESET}${DIM}p${RESET}` });
  if (latency) extras.push({ prio: 11, str: latency });
  if (providers) extras.push({ prio: 12, str: providers });
  if (metrics && metrics.option_a_hits != null && metrics.option_a_hits > 0) {
    extras.push({ prio: 13, str: `${DIM}auto-routed${RESET} ${BOLD}${metrics.option_a_hits}${RESET}` });
  }
  if (version && version.version) extras.push({ prio: 14, str: `${DIM}v${version.version}${RESET}` });

  // v6.5 — per-subscription pill (compact, paid plan) and local-layer pill.
  // These port the layered-dashboard L3/Ln insights into the single line.
  const PROVIDER_ICON_INLINE = {
    anthropic: '🧠', openai: '💬', google: '♊', xai: '⚡', mistral: '🌬️',
  };
  (subscriptions || []).forEach((sub, idx) => {
    const u = usageData && usageData.usage && usageData.usage[sub.providerKey];
    const icon = PROVIDER_ICON_INLINE[sub.providerKey] || '📦';
    let pill;
    if (u) {
      const pctNum = Math.round(u.used_pct || 0);
      const ratio  = u.pace_ratio || 0;
      let c = DIM, a = '·';
      if      (ratio < 0.8)  { c = GREEN;  a = '↓'; }
      else if (ratio <= 1.2) { c = DIM;    a = '·'; }
      else if (ratio <= 1.5) { c = WARN;   a = '↑'; }
      else                   { c = DANGER; a = '↑'; }
      pill = `${icon} ${c}${BOLD}${pctNum}%${a}${RESET}`;
    } else {
      pill = `${icon} ${DIM}${sub.short || sub.label}${RESET}`;
    }
    // Each subscription competes for visibility — first one wins the low prio.
    extras.push({ prio: 3 + idx * 0.1, str: pill });
  });
  // Local layer pill — compact 🦙 N% (only when there's T0 activity to show).
  if (tierCountsEarly && (tierCountsEarly.local || 0) > 0 && tierCountsEarly.total > 0) {
    const share = Math.round(((tierCountsEarly.local || 0) / tierCountsEarly.total) * 100);
    let sc = DANGER;
    if (share >= 60)      sc = BRAND;
    else if (share >= 30) sc = WARN;
    extras.push({ prio: 5, str: `🦙 ${sc}${BOLD}${share}%${RESET}` });
  }

  // PROBE escape hatch — kept as machinery for future in-prompt parser
  // experiments. Probes 1-12 landed the v6.7/v6.8 findings (see the
  // flatLine header for the full ✅/❌ table) and have been removed from
  // production code. If a future Claude Code release breaks rendering or
  // you want to test a new glyph, wire a fresh probe here by adding a
  // branch that returns a 4-line payload joined with '\n'. Invocation:
  //   $env:MOOTER_PROBE='NAME'; claude   # in a fresh VS Code terminal
  //
  // Reminder — NEVER re-introduce '─' (U+2500) here or in flatLine
  // without re-running a fresh probe first. It killed multi-line every
  // time before v6.7 and is the reason this machinery exists.
  if (process.env.MOOTER_PROBE) {
    // Intentionally empty — add experimental branches above this comment
    // when needed. Leaving the `if` in place keeps the env-var contract.
  }

  // v6.8 dispatch:
  //   MOOTER_FORCE_MULTILINE=1 → boxed multi-line (mooter-dashboard.js
  //     external pane — owns its terminal, can render full ╭╮├┤╰╯ frame
  //     with '─' because the external pane is not Claude Code's parser).
  //   MOOTER_MODE=1            → flat multi-line (in-prompt statusline,
  //     '═' U+2550 filler — probe 9 proven. '─' U+2500 stays banned here.
  if (process.env.MOOTER_FORCE_MULTILINE === '1' || process.env.MOOTER_MODE === '1') {
    // v6.8 — same cumulative fallback as tierCountsEarly (line 1635). Without
    // this, a fresh terminal's renderMultiLine sees total=0 and the "0% local"
    // pill in L2 never renders, breaking the always-show contract.
    const tierCounts =
      realExecutionCounts(session) || realExecutionCounts(null) || { total: 0 };
    return renderMultiLine({
      width: termW,
      mandatory: A_mandatory,
      savingsCore,
      healthCore,
      sep: SEP,
      metrics,
      session,
      subscriptions,
      usageData,
      routerMode,
      cycle,
      tierCounts,
      savings,
      spentStr,
      flat: process.env.MOOTER_MODE === '1' && process.env.MOOTER_FORCE_MULTILINE !== '1',
    });
  }

  // Default (Claude Code native statusline) — all v6.x innovations packed
  // into a single priority-fit line. See v6.5 commit for rationale.
  const mandatory = [...A_mandatory, savingsCore, healthCore].filter(Boolean);
  let visible = stripAnsi(mandatory.join(SEP)).length;
  const budget = Math.max(40, termW - 22);

  const sorted = extras.sort((a, b) => a.prio - b.prio);
  const addedExtras = [];
  for (const e of sorted) {
    const needed = sepLen + stripAnsi(e.str).length;
    if (visible + needed > budget) continue;
    addedExtras.push(e.str);
    visible += needed;
  }
  const withoutHealth = mandatory.slice(0, -1);
  const all = [...withoutHealth, ...addedExtras, healthCore];
  return all.join(SEP);
}

// v6.2 — layered dashboard renderer. One box-drawn row per consumption
// layer: identity, savings, each paid subscription, local/Ollama. Row
// count scales with the user's profile — 1 sub = 4 rows, 3 subs = 6 rows.
function renderMultiLine({
  width, mandatory, savingsCore, healthCore, sep, metrics, session,
  subscriptions, usageData, routerMode, cycle, tierCounts, savings, spentStr,
  flat
}) {
  // v6.7 — when flat=true, swap boxLine() for flatLine(): same content,
  // same alignment, same '─' filler — but no corner glyphs (╭╮├┤╰╯) that
  // confuse Claude Code's in-prompt statusline parser.
  const _row = (pos, l, r) => flat ? flatLine(l, r, width) : boxLine(pos, l, r, width);
  const FRAME = 6;

  // --- L1 Identity -----------------------------------------------------
  // Left: mandatory pills (mooter · mode · model · ctx-tier-bar · ctx%).
  // Right: cycle d/N (billing window anchor).
  const cycleColor = cycle.progressPct >= 90 ? DANGER : cycle.progressPct >= 75 ? WARN : DIM;
  const cyclePill = `${DIM}cycle${RESET} ${cycleColor}${BOLD}d${cycle.day}/${cycle.lastDay}${RESET}`;
  const l1Left = mandatory.join(sep);
  const l1 = _row('top', l1Left, cyclePill);

  // --- L2 Savings ------------------------------------------------------
  // Clarified copy — explicitly says what was saved vs spent. Reads left
  // to right as an English sentence: "mooter saved $X (N%↓ vs all-Opus)
  // · spent $Y · Np · M% local".
  // Source of truth: savings ← calcSavings(metrics, session); metrics ←
  //   fetchFrugalMetrics(session) = GET http://127.0.0.1:7821/metrics on the
  //   local tracker. Fallback path (line ~1416) recomputes from decisions.log
  //   via pricing.js so the number matches /mooter-savings exactly.
  const pct = savings?.savingsPct || 0;
  const arrow = pct >= 30 ? '↓' : '';
  const savedUsdNum = parseFloat(savings?.savedUsd) || 0;
  const savedStr = savedUsdNum > 0.01 ? `$${savings.savedUsd}` : null;
  // Wave-3 honesty surface (audit S1#2 closure):
  //   When the executor has real data (executionCount > 0) we show BOTH
  //   the guaranteed (Wave-2 real outcomes) and advisory (legacy
  //   estimate) numbers so the user can see the gap between what
  //   advisory promised and what the executor actually delivered.
  //   - Healthy:  "saved $42.10 gtd · $24.30 adv (45%↓ vs all-Opus)"
  //   - Drift:    "⚠ saved $0.00 gtd · $24.30 adv (11% vs all-Opus)"  (T-03 marker)
  //   - No exec:  "saved $24.30 (11% vs all-Opus)"  (legacy single-number)
  const exec = Number(savings?.executionCount) || 0;
  const w2 = Number(savings?.guaranteedUsdW2) || 0;
  const adv = Number(savings?.advisoryUsd) || 0;
  const showSplit = savedStr && exec > 0 && adv > 0;
  // v6.8 storytelling — three states, each a clean sentence start:
  //   real savings → "🐮 saved $X (N%↓ vs all-Opus)"
  //   pct=0 with   → "🐮 all-Opus session"  (honest, no '∅' math glyph,
  //   activity        no phantom "$0 saved")
  //   no prompts   → "🐮 no data yet"
  let savedHero;
  if (showSplit) {
    // Refusing the conflation flagged by final-reviewer Q4:
    // when signal='tracker' (FALLBACK 1) and savedUsd has collapsed
    // to advisory because both w2 and legacy Option-A are zero, do
    // NOT label that as `gtd`. Surface $0.00 honestly — the marker
    // logic below will then see a true zero ratio and fire.
    // When signal='real_exec' or 'log_fallback', savedUsdNum is a
    // legitimate measured-real number (computed from execution.log
    // tier mix or decisions.log replay) — use it as gtd even when
    // w2 itself is zero.
    const signal = savings?.signal;
    const trackerCollapsed = signal === 'tracker' && w2 === 0;
    const gtdNum = trackerCollapsed ? 0 : (w2 > 0 ? w2 : savedUsdNum);
    const gtdStr = `$${gtdNum.toFixed(2)}`;
    const advStr = `$${adv.toFixed(2)}`;
    // Wave-3 T-03: honesty marker. When the executor has enough samples
    // to be statistically meaningful (≥ 50 dispatches) AND the
    // guaranteed value is less than half of advisory, surface a ⚠ at
    // the head of the line. The user instantly sees that advisory is
    // promising more than the executor delivers — the drift signal.
    // Below 50 samples we stay quiet (small-sample noise is not drift).
    const ratio = adv > 0 ? gtdNum / adv : 1;
    const driftMarker = (exec >= 50 && ratio < 0.5)
      ? `${WARN}${BOLD}⚠${RESET} `
      : '';
    // Wave-3 T-04 — calibration sampling. 1% of split-renders write
    // {ratio, exec, w2, adv, signal} to .statusline-calibration.jsonl.
    // Statusline runs ~every 5s, so 1% ≈ one entry every 8min. Over
    // weeks this builds up empirical data so a future Wave-4 can tune
    // the 50-dispatch / 0.5-ratio thresholds against the real
    // distribution instead of the hardcoded defaults.
    // Sampling is fire-and-forget async — never blocks the render.
    if (Math.random() < 0.01) {
      try {
        const lp = require('node:path').join(
          require('node:os').homedir(),
          '.claude', 'tools', 'router', '.statusline-calibration.jsonl'
        );
        const line = JSON.stringify({
          ts: new Date().toISOString(),
          ratio: Number(ratio.toFixed(4)),
          exec, w2, adv,
          signal: savings?.signal || 'unknown',
          marker_fired: driftMarker.length > 0,
        }) + '\n';
        require('node:fs').promises.appendFile(lp, line).catch(() => {});
      } catch { /* best-effort */ }
    }
    savedHero =
      `${driftMarker}${BRAND}${BOLD}🐮${RESET} ${DIM}saved${RESET} ` +
      `${GREEN}${BOLD}${gtdStr}${RESET} ${DIM}gtd${RESET}` +
      ` ${DIM}·${RESET} ` +
      `${DIM}${advStr} adv${RESET}` +
      ` ${DIM}(${BOLD}${pct}%${arrow}${RESET}${DIM} vs all-Opus)${RESET}`;
  } else {
    // "saved $X (Y% vs all-Opus)" dizia mais do que se mede.
    //
    // Este numero vem do `decisions.log`, que regista o TIER RECOMENDADO. Mede
    // o plano de routing, nao o que correu. Medido a 2026-08-23: o classificador
    // recomendou tier local/barato em 101 de 123 prompts, e das 3.225 execucoes
    // dessas mesmas sessoes, 3.193 correram em Opus e UMA correu localmente. E
    // nenhum ficheiro de telemetria deste projecto regista tokens, por isso o
    // valor em dolares e modelado a partir do comprimento do prompt.
    //
    // O #346 retirou cinco numeros de poupanca de todas as superficies publicas
    // e nao tocou nesta — que e a que o dono ve mais vezes por dia. A etiqueta
    // passa a dizer o que o numero e: um PLANO.
    savedHero = savedStr
      ? `${BRAND}${BOLD}🐮${RESET} ${DIM}plan${RESET} ${GREEN}${BOLD}${savedStr}${RESET} ${DIM}(${BOLD}${pct}%${arrow}${RESET}${DIM} routed cheap · not executed)${RESET}`
      : (savings?.promptCount
          ? `${BRAND}${BOLD}🐮${RESET} ${DIM}all-Opus session${RESET}`
          : `${BRAND}${BOLD}🐮${RESET} ${DIM}no data yet${RESET}`);
  }
  const spentPart = spentStr ? `${DIM}spent${RESET} ${BOLD}${spentStr}${RESET}` : null;
  const promptsPart = savings?.promptCount ? `${BOLD}${savings.promptCount}${RESET}${DIM} prompts${RESET}` : null;
  // Efficiency pill — % of routing that went local (the mooter win).
  // Source of truth: tierCounts ← realExecutionCounts(session|null) from
  //   execution.log; local = T0 bucket (qwen3:30b + other Ollama models).
  //   Renders 0% as an honest zero — always-show contract when total>0.
  let effPart = null;
  if (tierCounts && tierCounts.total > 0) {
    const t0share = Math.round(((tierCounts.local || 0) / tierCounts.total) * 100);
    let ec = DANGER;
    if (t0share >= 60)      ec = BRAND;
    else if (t0share >= 30) ec = WARN;
    effPart = `${ec}${BOLD}${t0share}%${RESET} ${DIM}local${RESET}`;
  }
  const l2Left = [savedHero, spentPart, promptsPart, effPart].filter(Boolean).join(sep);
  const l2 = _row('mid', l2Left, healthCore || '');

  // --- L3..Ln One row per paid subscription ----------------------------
  // Sparkline belongs to Anthropic in the current tracker; passed through
  // to the anthropic row only.
  // Source of truth: usageData ← getUsageData() (reads usage-estimator output).
  //   Subscription list ← subscription-profile.json via getSubscriptions().
  //   Per-provider bucket: usageData.usage[sub.providerKey] → used_pct,
  //   pace_ratio, rolling_5h, cost_usd, budget_usd.
  const sparkline = usageData && usageData.sparkline && usageData.sparkline.peak > 0
    ? `${BRAND}${usageData.sparkline.spark}${RESET}`
    : '';
  // Rec badge is attached to the subscription that TRIGGERED the recommendation.
  // Current usage-estimator picks from anthropic; future multi-provider can
  // return a providerKey in the rec. For now, attach to the first sub that
  // has usage data.
  // Source of truth: usageData.recommendation.mode ← usage-estimator pace/budget
  //   heuristic (triggers beast/zen/auto based on 5h rolling window + cycle
  //   progress). Only surfaces when rec != 'auto' AND rec != active mode.
  let recBadge = '';
  if (usageData && usageData.recommendation) {
    const rec = usageData.recommendation.mode;
    const active = routerMode.mode;
    if (rec !== 'auto' && rec !== active) {
      const icon  = rec === 'beast' ? '🐂' : '🐄';
      const label = rec === 'beast' ? 'CrazyMoo' : 'LazyMoo';
      const slash = rec === 'beast' ? '/mooter-beast' : '/mooter-zen';
      const color = rec === 'beast' ? WARN : HEALTHY;
      recBadge = `${color}${BOLD}→ ${icon} ${label}${RESET} ${DIM}${slash}${RESET}`;
    }
  }
  const subRows = (subscriptions || []).map((sub, idx) => {
    const hasUsage = usageData && usageData.usage && usageData.usage[sub.providerKey];
    const rec = hasUsage && idx === 0 ? recBadge : '';   // attach rec to first provider w/ usage
    const spark = sub.providerKey === 'anthropic' ? sparkline : '';
    return renderSubscriptionRow(sub, usageData, width, 'mid', rec, spark, sep, flat);
  });

  // --- Final row: Ollama local layer -----------------------------------
  // Only show when there's actually been local routing (avoids a "0%" row
  // on a fresh session with zero T0 calls).
  // Source of truth: tierCounts.local > 0 predicate (execution.log T0 bucket).
  //   Latency p50 ← metrics.latency.p50_ms from tracker /metrics endpoint.
  //   Model name ← MOOTER_OLLAMA_MODEL env (defaults to qwen3:30b).
  let localRow = null;
  if (tierCounts && (tierCounts.local || 0) > 0) {
    localRow = renderLocalRow(tierCounts, metrics, width, 'bottom', sep, flat);
  }

  // Assemble — last row uses 'bottom' corner, rest of mid rows stay 'mid'.
  // If no local row, the last subscription row becomes 'bottom'.
  const rows = [l1, l2, ...subRows];
  if (localRow) {
    rows.push(localRow);
  } else if (rows.length > 0) {
    // Re-render last row with 'bottom' corners.
    const lastIdx = rows.length - 1;
    if (subRows.length > 0) {
      const lastSub = subscriptions[subscriptions.length - 1];
      const hasUsage = usageData && usageData.usage && usageData.usage[lastSub.providerKey];
      const rec = hasUsage && subscriptions.length === 1 ? recBadge : '';
      const spark = lastSub.providerKey === 'anthropic' ? sparkline : '';
      rows[lastIdx] = renderSubscriptionRow(lastSub, usageData, width, 'bottom', rec, spark, sep, flat);
    } else {
      // No subs at all — L2 becomes the bottom.
      rows[lastIdx] = _row('bottom', l2Left, healthCore || '');
    }
  }

  return rows.join('\n');
}

// Wave 58 A.5 — modular chips appended to the WIRED statusline.
//
// buildStatusline()'s return value is left BYTE-IDENTICAL; the composed chip
// line is appended only here, at the stdout boundary. With default/empty
// preferences the ONLY visible new content is the 🎯 matrix chip (default-ON);
// every other DEFAULT_ELIGIBLE chip (agent-focus, conductor, sessions, bench,
// cca-f, agents-progress) stays silent until the user opts in (its
// statusLine() → ''). The always-on line-3-only chips (mlwr, terminal-name, …)
// are NOT in the default set — they appear only when the user has the legacy
// line-3 opt-in (statusline_line3 / MOOTER_STATUSLINE_LINE3=1), mirroring the
// behaviour statusline-multi.js#buildLine3() always had.
//
// The composer is lazy-required and fully wrapped: any failure (missing module,
// throwing chip) yields the unchanged base statusline. Chips are cheap file
// reads, so this stays inside the 500ms render budget (gsd-statusline-latency.test.js).
function lineGateOn() {
  if (process.env.MOOTER_STATUSLINE_LINE3 === '1'
    || process.env.MOOTER_STATUSLINE_BURN === '1'
    || process.env.MOOTER_STATUSLINE_CCAF === '1') return true;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
    return p && p.statusline_line3 === true;
  } catch { return false; }
}

function appendModularChips(base, data) {
  try {
    const session = (data && data.session_id) || '';
    const chipLine = require('./chip-composer.js').composeChips(session, { lineGateOn: lineGateOn() });
    if (chipLine) return `${base}\n${chipLine}`;
  } catch { /* never let a chip break the wired statusline */ }
  return base;
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
    // v6.5 — every line including the last must be \n-terminated for
    // Claude Code to render multi-line statusline correctly.
    process.stdout.write(appendModularChips(buildStatusline(mockData), mockData) + '\n');
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
    // P1-E — a ÚNICA fonte oficial de quota que existe nesta máquina é o
    // `rate_limits` que o Claude Code entrega aqui, neste payload. `quota-live.js`
    // foi escrito para o capturar mas `onStatuslineRender` nunca era chamado por
    // ninguém: ~/.mooter/quota-live.json não existia, e o hint publicava o
    // contador LOCAL de orçamento como se fosse quota do fornecedor. Esta linha
    // é a que faz a fonte oficial existir. Fail-soft: capturar quota nunca pode
    // partir a statusline.
    try { require('./quota-live.js').onStatuslineRender(data); } catch { /* sem captura, o consumidor diz n/d */ }
    // v6.5 — trailing \n required: Claude Code parses statusline stdout
    // line-by-line, and without a trailing newline the last row is
    // sometimes dropped or treated as a continuation of the previous one.
    process.stdout.write(appendModularChips(buildStatusline(data), data) + '\n');
  } catch (e) {
    // Silent fail - don't break statusline on parse errors
  }
});
