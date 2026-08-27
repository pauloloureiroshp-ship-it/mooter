#!/usr/bin/env node
/**
 * frugal-doctor.js — comprehensive health check for frugal.
 *
 * Runs on any machine (Mac/Windows/Linux) and shows:
 *   - Every installed component and its status
 *   - Subscription profile (what the router knows about your subscriptions)
 *   - Data pipeline (decisions.log → hub-push → hub)
 *   - Auto-learning loop status (cron/LaunchAgent)
 *   - Provider availability (Ollama, Anthropic, OpenAI, Gemini)
 *   - Quick fixes for common issues
 *
 * Usage:
 *   node ~/.claude/tools/router/frugal-doctor.js
 *   node ~/.claude/tools/router/frugal-doctor.js --json   (machine-readable output)
 *   node ~/.claude/tools/router/frugal-doctor.js --fix    (attempt auto-fixes)
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { getHubUrl, tryEnv } = require('./env');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawnSync, execSync } = require('child_process');

const IS_WINDOWS = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const JSON_MODE = process.argv.includes('--json');
const FIX_MODE = process.argv.includes('--fix');
const SYNC_MODE = process.argv.includes('--sync');
const OPTIMIZE_MODE = process.argv.includes('--optimize');
const DRY_RUN = process.argv.includes('--dry-run');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const MOOTER_DIR = path.join(os.homedir(), '.mooter');
const LEGACY_DIR = path.join(os.homedir(), '.frugal');

// A porta do tracker é configurável (env.js: MOOTER_TRACKER_PORT >
// FRUGAL_TRACKER_PORT > 7821). Cravar 7821 fazia o doctor jurar "tracker not
// running" a quem apenas lhe tinha mudado a porta.
const TRACKER_PORT = (() => {
  try { return tryEnv().value.tracker_port; } catch { return 7821; }
})();
const TRACKER_URL = `http://127.0.0.1:${TRACKER_PORT}`;

// ── Output helpers ────────────────────────────────────────────────────────
const C = {
  green:  s => JSON_MODE ? s : `\x1b[38;2;78;201;176m${s}\x1b[0m`,
  red:    s => JSON_MODE ? s : `\x1b[38;2;244;71;71m${s}\x1b[0m`,
  yellow: s => JSON_MODE ? s : `\x1b[38;2;220;220;170m${s}\x1b[0m`,
  dim:    s => JSON_MODE ? s : `\x1b[2m${s}\x1b[0m`,
  bold:   s => JSON_MODE ? s : `\x1b[1m${s}\x1b[0m`,
  cyan:   s => JSON_MODE ? s : `\x1b[36m${s}\x1b[0m`,
};

const TICK   = C.green('✓');
const CROSS  = C.red('✗');
const WARN   = C.yellow('⚠');
const ARROW  = C.cyan('→');
// Não medido. Deliberadamente NÃO é o TICK: um check que não mediu nada não
// passou — apenas não tem nada a dizer.
const NA     = C.dim('○');

function section(title) {
  if (JSON_MODE) return;
  console.log('');
  console.log(C.bold(`  ${title}`));
  console.log(C.dim('  ' + '─'.repeat(50)));
}

function row(icon, label, value, fix) {
  if (JSON_MODE) return;
  const valStr = value ? C.dim(value) : '';
  console.log(`  ${icon}  ${label.padEnd(30)} ${valStr}`);
  if (fix) console.log(`     ${ARROW} ${C.yellow(fix)}`);
}

// Um valor só conta como medição se for mesmo um número. `undefined`, `null`
// e `NaN` são AUSÊNCIA de medição — nunca zero. (Num sistema que mede
// poupança, o default de um heurístico nunca pode ser o número que favorece
// o próprio sistema; em dúvida, null.)
function measured(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Linha de métrica honesta: medido → TICK + valor (mesmo que o valor seja 0,
// que é um facto e mostra-se); não medido → NA + `n/d` com o porquê, e SEM
// tick de sucesso. Nunca um número que nasce a zero por falta de dados.
function metricRow(label, value, format, why) {
  if (value === null || value === undefined) {
    row(NA, label, `n/d — ${why}`);
    return;
  }
  row(TICK, label, format(value));
}

// ── Check helpers ─────────────────────────────────────────────────────────
function fileExists(p) { try { return fs.existsSync(p); } catch { return false; } }

function cmdExists(cmd) {
  try {
    const r = spawnSync(IS_WINDOWS ? 'where' : 'which', [cmd], {
      encoding: 'utf8', timeout: 3000, windowsHide: true,
    });
    return r.status === 0;
  } catch { return false; }
}

function httpGet(url, timeoutMs = 1000) {
  return new Promise((resolve) => {
    try {
      const mod = url.startsWith('https') ? require('https') : http;
      const req = mod.get(url, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try { resolve({ ok: true, json: JSON.parse(body), status: res.statusCode }); }
          catch { resolve({ ok: true, text: body, status: res.statusCode }); }
        });
      });
      req.on('error', () => resolve({ ok: false }));
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, timeout: true }); });
    } catch { resolve({ ok: false }); }
  });
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').filter(l => l.trim()).length;
  } catch (erro) {
    if (erro && erro.code === 'ENOENT') return 0;
    // Log ilegível e log vazio davam ambos zero decisões; null mantém a
    // contagem desconhecida no relatório e no JSON.
    try { process.stderr.write(`mooter-doctor: decisions count n/d — ${(erro && erro.message) || erro}\n`); } catch { /* stderr fechado */ }
    return null;
  }
}

function runCmd(cmd, timeoutMs = 5000) {
  try {
    return spawnSync(cmd, { shell: true, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  } catch { return { status: 1, stdout: '', stderr: '' }; }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const report = { ok: true, checks: {}, fixes: [], timestamp: new Date().toISOString() };

  if (!JSON_MODE) {
    console.log('');
    console.log(C.bold('  mooter doctor — health check'));
    console.log(C.dim(`  ${os.platform()} · ${os.arch()} · Node ${process.version}`));
  }

  // ── SECTION 1: Core files ─────────────────────────────────────────────
  section('1. Core Files');

  const coreFiles = [
    { file: path.join(CLAUDE_DIR, 'CLAUDE.md'),                  label: 'Doctrine (CLAUDE.md)' },
    { file: path.join(ROUTER_DIR, 'classify.js'),                 label: 'Classifier' },
    { file: path.join(ROUTER_DIR, 'inject_context.js'),           label: 'Hook (inject_context)' },
    { file: path.join(ROUTER_DIR, 'patterns.js'),                 label: 'Patterns' },
    { file: path.join(ROUTER_DIR, 'savings-tracker.js'),          label: 'Savings tracker' },
    { file: path.join(ROUTER_DIR, 'backtest.js'),                 label: 'Auto-learner (backtest)' },
    { file: path.join(ROUTER_DIR, 'onboarding.js'),               label: 'Onboarding' },
    { file: path.join(ROUTER_DIR, 'hub-push.js'),                 label: 'Hub push (telemetry)' },
    { file: path.join(ROUTER_DIR, 'hub-pull.js'),                 label: 'Hub pull (updates)' },
    { file: path.join(CLAUDE_DIR, 'hooks', 'gsd-statusline.js'), label: 'Statusline hook' },
  ];

  let coreMissing = 0;
  for (const { file, label } of coreFiles) {
    const exists = fileExists(file);
    if (!exists) coreMissing++;
    report.checks[label] = exists;
    row(exists ? TICK : CROSS, label, exists ? '' : file, exists ? null : 'Re-run install.sh / install-windows.ps1');
  }

  if (coreMissing > 0) {
    report.ok = false;
    report.fixes.push('Re-run the installer to restore missing files');
  }

  // ── SECTION 2: settings.json hook ─────────────────────────────────────
  section('2. Hook Registration');

  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const settings = readJson(settingsPath);
  const hookRegistered = settings &&
    JSON.stringify(settings).includes('inject_context.js');

  row(
    hookRegistered ? TICK : CROSS,
    'UserPromptSubmit hook',
    hookRegistered ? 'registered in settings.json' : 'NOT registered',
    hookRegistered ? null : 'Re-run installer or add hook manually to ~/.claude/settings.json'
  );
  report.checks.hook_registered = !!hookRegistered;
  if (!hookRegistered) report.ok = false;

  // ── SECTION 3: Classifier smoke test ─────────────────────────────────
  section('3. Classifier Test');

  const classifierPath = path.join(ROUTER_DIR, 'classify.js');
  if (fileExists(classifierPath)) {
    const tests = [
      { prompt: 'rename the button class', expected: 'T0' },
      { prompt: 'debug this stack trace',  expected: 'T2' },
      { prompt: 'redesign auth for multi-tenant scale', expected: 'T3' },
    ];
    let passed = 0;
    for (const t of tests) {
      const r = spawnSync(process.execPath, [classifierPath, t.prompt], {
        encoding: 'utf8', timeout: 5000, windowsHide: true,
      });
      let tier = null;
      try { tier = JSON.parse(r.stdout.trim()).tier; } catch {}
      const ok = tier === t.expected;
      if (ok) passed++;
      row(ok ? TICK : WARN, `"${t.prompt.slice(0, 30)}"`, ok ? `→ ${tier}` : `expected ${t.expected}, got ${tier}`);
    }
    report.checks.classifier_tests = `${passed}/${tests.length}`;
    if (passed < tests.length) report.fixes.push('Run: node classify.js "your prompt" --debug');
  } else {
    row(CROSS, 'Classifier', 'not installed');
    report.checks.classifier_tests = 'missing';
    report.ok = false;
  }

  // ── SECTION 4: Subscriptions ──────────────────────────────────────────
  section('4. Subscription Profile');

  const subProfilePath = path.join(ROUTER_DIR, 'subscription-profile.json');
  const hwCapPath      = path.join(ROUTER_DIR, 'hw-capability.json');
  const subProfile = readJson(subProfilePath);
  const hwCap      = readJson(hwCapPath);

  if (subProfile && subProfile.profiles) {
    const p = subProfile.profiles;
    row(TICK, 'Profile exists', path.relative(os.homedir(), subProfilePath));
    row(
      p.anthropic && p.anthropic !== 'unknown' && p.anthropic !== 'none' ? TICK : WARN,
      'Anthropic subscription',
      p.anthropic || 'unknown',
      p.anthropic === 'unknown' || !p.anthropic
        ? 'Run: node ~/.claude/tools/router/setup-profile.js'
        : null
    );
    row(
      p.openai && p.openai !== 'none' ? TICK : C.dim('○'),
      'OpenAI',
      p.openai || 'none'
    );
    row(
      p.gemini && p.gemini !== 'none' ? TICK : C.dim('○'),
      'Gemini',
      p.gemini || 'none'
    );
    report.checks.subscription_profile = p;
    if (!p.anthropic || p.anthropic === 'unknown') {
      report.fixes.push('Configure subscriptions: node ~/.claude/tools/router/setup-profile.js');
    }
  } else {
    row(WARN, 'Subscription profile', 'not configured (using defaults)');
    report.checks.subscription_profile = null;
    report.fixes.push('Run: node ~/.claude/tools/router/setup-profile.js');
  }

  if (hwCap) {
    row(TICK, 'Hardware profile', `${hwCap.name || hwCap.vendor} (${hwCap.hw_tier || 'unknown tier'})`);
    report.checks.hw_profile = `${hwCap.name} ${hwCap.hw_tier}`;
  } else {
    row(WARN, 'Hardware profile', 'not detected yet — runs on next prompt');
    report.checks.hw_profile = null;
  }

  // ── SECTION 5: Providers ──────────────────────────────────────────────
  section('5. Provider Availability');

  // Ollama
  const ollamaOk = cmdExists('ollama');
  row(ollamaOk ? TICK : WARN, 'Ollama (T0 — free local)',
    ollamaOk ? 'installed' : 'not found',
    ollamaOk ? null : 'Install: https://ollama.com/download');
  if (ollamaOk) {
    const models = runCmd('ollama list 2>/dev/null');
    const hasQwen3b  = models.stdout.includes('qwen2.5:3b');
    const hasQwen30b = models.stdout.includes('qwen3:30b') || models.stdout.includes('qwen2.5:30b');
    row(hasQwen3b ? TICK : WARN, '  Model qwen2.5:3b (fast)', hasQwen3b ? 'ready' : 'missing',
      hasQwen3b ? null : 'ollama pull qwen2.5:3b');
    row(hasQwen30b ? TICK : C.dim('○'), '  Model qwen3:30b (smart)', hasQwen30b ? 'ready' : 'not installed (optional)',
      hasQwen30b ? null : 'ollama pull qwen3:30b (recommended for T0-smart)');
    report.checks.ollama = { installed: true, qwen3b: hasQwen3b, qwen30b: hasQwen30b };
  } else {
    report.checks.ollama = { installed: false };
    report.fixes.push('Install Ollama for free T0 routing: https://ollama.com/download');
  }

  // Anthropic
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  row(hasAnthropicKey ? TICK : WARN, 'Anthropic API key (T1 direct)',
    hasAnthropicKey ? 'set in env' : 'not in env (T1 via subagent — still works)',
    hasAnthropicKey ? null : 'Optional: export ANTHROPIC_API_KEY=... in your shell rc');
  report.checks.anthropic_key = hasAnthropicKey;

  // OpenAI
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  row(hasOpenAIKey ? TICK : C.dim('○'), 'OpenAI API key', hasOpenAIKey ? 'set' : 'not set (optional)');
  report.checks.openai_key = hasOpenAIKey;

  // ── SECTION 6: Data pipeline ──────────────────────────────────────────
  section('6. Data Pipeline (Auto-Learning)');

  const decisionsLog = path.join(ROUTER_DIR, 'decisions.log');
  const decisionCount = countLines(decisionsLog);
  if (decisionCount === null) report.ok = false;
  row(decisionCount > 0 ? TICK : WARN, 'decisions.log',
    decisionCount === null ? 'n/d — unreadable'
      : (decisionCount > 0 ? `${decisionCount} decisions recorded` : 'empty — no prompts classified yet'));
  report.checks.decisions_count = decisionCount;

  // Tracker HTTP
  const trackerHealth = await httpGet(TRACKER_URL + '/health', 800);
  row(trackerHealth.ok ? TICK : WARN, `Savings tracker (:${TRACKER_PORT})`,
    trackerHealth.ok ? `running (pid ${trackerHealth.json?.pid || '?'})` : 'not running (starts on next prompt)',
    trackerHealth.ok ? null : 'Start manually: node ~/.claude/tools/router/savings-tracker.js &');
  report.checks.tracker_running = trackerHealth.ok;

  // Hub connectivity (2 attempts, 6s timeout each — cold start can be slow)
  let hubOk = false;
  for (let attempt = 0; attempt < 2 && !hubOk; attempt++) {
    try {
      const hubRes = await httpGet(getHubUrl() + '/health', 6000);
      hubOk = hubRes.ok && hubRes.status === 200;
    } catch {}
    if (!hubOk && attempt === 0) await new Promise(r => setTimeout(r, 1000));
  }
  row(hubOk ? TICK : WARN, 'mooter-hub connectivity',
    hubOk ? 'reachable' : 'unreachable after 2 attempts (timeout 6s)',
    hubOk ? null : `Test manually: curl ${getHubUrl()}/health`);
  report.checks.hub_reachable = hubOk;

  // Last hub-push
  const hubPushLog = path.join(ROUTER_DIR, '.hub-push.ts');
  if (fileExists(hubPushLog)) {
    try {
      const ts = parseInt(fs.readFileSync(hubPushLog, 'utf8').trim(), 10);
      // Um carimbo ilegível não é "0h atrás" nem "NaNh atrás": é n/d.
      if (!Number.isFinite(ts)) {
        row(WARN, 'Last hub-push', 'n/d — unreadable timestamp in .hub-push.ts',
          'Run: node ~/.claude/tools/router/hub-push.js --force');
        report.checks.last_hub_push_hours = null;
      } else {
        const ageH = Math.round((Date.now() - ts) / 3600000);
        row(ageH < 25 ? TICK : WARN, 'Last hub-push',
          `${ageH}h ago`,
          ageH >= 25 ? 'Run: node ~/.claude/tools/router/hub-push.js --force' : null);
        report.checks.last_hub_push_hours = ageH;
      }
    } catch {
      row(WARN, 'Last hub-push', 'n/d — timestamp unreadable');
      report.checks.last_hub_push_hours = null;
    }
  } else {
    row(WARN, 'Hub push',
      'never sent',
      'Run: node ~/.claude/tools/router/hub-push.js --force (after you have decisions)');
    report.checks.last_hub_push_hours = null;
  }

  // ── SECTION 7: Auto-learning cron ────────────────────────────────────
  section('7. Auto-Learning Schedule');

  if (IS_MAC) {
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.frugal.backtest.plist');
    const cronOk = fileExists(plistPath);
    row(cronOk ? TICK : CROSS, 'macOS LaunchAgent (02:00 daily)',
      cronOk ? plistPath : 'not installed',
      cronOk ? null : 'Re-run install.sh — it will install the LaunchAgent automatically');
    report.checks.cron_mac = cronOk;
    if (!cronOk) {
      report.ok = false;
      report.fixes.push('Install LaunchAgent: re-run install.sh (adds backtest cron at 02:00)');
    }
  } else if (IS_WINDOWS) {
    const taskCheck = runCmd('schtasks /query /tn "FrugalRouterBacktest" 2>nul');
    const taskOk = taskCheck.status === 0;
    row(taskOk ? TICK : WARN, 'Windows Task Scheduler',
      taskOk ? 'FrugalRouterBacktest registered' : 'not found',
      taskOk ? null : 'Re-run install-windows.ps1 to register the task');
    report.checks.cron_windows = taskOk;
  } else {
    const cronCheck = runCmd('crontab -l 2>/dev/null | grep backtest');
    const cronOk = cronCheck.status === 0 && cronCheck.stdout.includes('backtest');
    row(cronOk ? TICK : WARN, 'crontab (02:00 daily)',
      cronOk ? 'registered' : 'not found',
      cronOk ? null : 'Add: (crontab -l 2>/dev/null; echo "0 2 * * * node ~/.claude/tools/router/backtest.js --export-delta") | crontab -');
    report.checks.cron_linux = cronOk;
  }

  // ── SECTION 8: Skills ─────────────────────────────────────────────────
  section('8. Slash Commands (Skills)');

  const expectedSkills = [
    'frugal-status', 'frugal-savings', 'frugal-update',
    'frugal-summary', 'frugal-route', 'frugal-beast',
    'frugal-zen', 'frugal-auto', 'frugal-hello',
  ];
  let skillsOk = 0;
  for (const skill of expectedSkills) {
    const skillPath = path.join(CLAUDE_DIR, 'skills', skill, 'SKILL.md');
    const ok = fileExists(skillPath);
    if (ok) skillsOk++;
    row(ok ? TICK : WARN, `/${skill}`, ok ? '' : 'missing', ok ? null : 'Re-run installer');
  }
  report.checks.skills = `${skillsOk}/${expectedSkills.length}`;

  // ── SECTION 9: Savings summary ────────────────────────────────────────
  section('9. Savings Summary');

  if (trackerHealth.ok) {
    const metrics = await httpGet(TRACKER_URL + '/metrics', 800);
    if (metrics.ok && metrics.json) {
      const m = metrics.json;

      // JANELA antes de número. Sem prompts classificados não há nada somado;
      // sem baseline Opus (`naive_cost`) a percentagem é 0/0, não "0% de
      // poupança". O próprio tracker devolve `saved_pct: 0` nesse caso
      // (savings-tracker.js:555), por isso um zero VINDO do tracker não prova
      // medição nenhuma — quem decide é a janela. Até 2026-08-27 esta secção
      // fazia `Math.round(m.saved_pct || 0)` e imprimia
      //     ✓  Savings % (advisory)  0%
      // numa máquina que nunca classificou um prompt: um número de poupança
      // com selo de sucesso exactamente onde não houve medição.
      const prompts     = measured(m.prompts);
      const naiveCost   = measured(m.naive_cost);
      const hasWindow   = prompts !== null && prompts > 0;
      const hasBaseline = hasWindow && naiveCost !== null && naiveCost > 0;
      const NO_WINDOW   = 'no prompts classified yet (empty window)';

      const savedPct      = hasBaseline ? measured(m.saved_pct) : null;
      const advisoryUsd   = hasWindow ? measured(m.saved) : null;
      const guaranteedUsd = hasWindow ? measured(m.guaranteed_saved) : null;

      // `actual_cost` nunca existiu no /metrics do tracker — o campo medido
      // chama-se `executions.actual_cost_usd` (savings-tracker.js:1000). O
      // `|| 0` fazia esta linha imprimir "~$0.00" em TODAS as máquinas desde
      // sempre: um zero de uma chave que nunca é emitida.
      const execRuns = measured(m.executions && m.executions.total);
      const spentUsd = execRuns !== null && execRuns > 0
        ? measured(m.executions.actual_cost_usd)
        : null;

      metricRow('Total decisions', prompts,
        v => String(v),
        'tracker returned no prompt count');

      metricRow('Savings % (advisory)', savedPct,
        v => `${Math.round(v)}%  ← token-estimated vs Opus baseline, assumes hints honoured`
           + `  (source :${TRACKER_PORT}/metrics · window ${prompts} prompts)`,
        hasWindow ? 'no Opus baseline to compare against (naive_cost = 0)' : NO_WINDOW);

      metricRow('Saved (advisory ~)', advisoryUsd,
        v => `~$${v.toFixed(2)}  (window ${prompts} prompts)`,
        NO_WINDOW);

      if (guaranteedUsd === null) {
        row(NA, 'Guaranteed saved', `n/d — ${NO_WINDOW}`);
      } else {
        row(guaranteedUsd > 0 ? TICK : NA, 'Guaranteed saved',
          `$${guaranteedUsd.toFixed(2)}  ← only Option-A hits (Ollama verbatim)`);
      }

      const advisoryCovers = advisoryUsd !== null && advisoryUsd > 0 && guaranteedUsd !== null
        ? Math.round(((advisoryUsd - guaranteedUsd) / advisoryUsd) * 100)
        : null;
      metricRow('Advisory covers', advisoryCovers,
        v => `${v}% of total  (${100 - v}% verified)`,
        advisoryUsd === null ? NO_WINDOW : 'advisory saved is $0 — no total to split');

      metricRow('Actual spend', spentUsd,
        v => `~$${v.toFixed(2)}  (measured over ${execRuns} router-execute runs)`,
        'no run measured by router-execute');

      const tierPct = m.pct_by_tier || {};
      metricRow('T0 (Ollama/free)', hasWindow ? measured(tierPct.T0) : null,
        v => `${Math.round(v)}%  (of ${prompts} prompts)`, NO_WINDOW);
      metricRow('T3 (Opus)', hasWindow ? measured(tierPct.T3) : null,
        v => `${Math.round(v)}%  (of ${prompts} prompts)`, NO_WINDOW);

      report.checks.savings = {
        source: `${TRACKER_URL}/metrics`,
        window_prompts: prompts,
        pct: savedPct,
        saved_usd: advisoryUsd,
        guaranteed_usd: guaranteedUsd,
        spent_usd: spentUsd,
        spent_window_runs: execRuns,
      };
    } else {
      // Tracker de pé mas /metrics ilegível: n/d com o porquê, nunca zeros.
      row(NA, 'Savings data', `n/d — :${TRACKER_PORT}/metrics returned no JSON`);
      report.checks.savings = null;
    }
  } else {
    row(WARN, 'Savings data', 'tracker not running — will show after next prompt');
    report.checks.savings = null;
  }

  // ── SECTION 10: Dashboard Sync (only with --sync) ─────────────────────
  if (SYNC_MODE) {
    section('10. Dashboard Sync');

    const https = require('https');

    // Collect data already computed during the check
    const ollamaCheck = report.checks.ollama || {};
    const ollamaModelList = ollamaOk
      ? (runCmd('ollama list 2>/dev/null').stdout || '').split('\n').filter(l => l.trim() && !l.startsWith('NAME')).map(l => l.split(/\s+/)[0]).filter(Boolean)
      : [];

    const versionPath = path.join(ROUTER_DIR, 'version.json');
    const versionData = readJson(versionPath);
    const frugalVersion = versionData?.version || 'unknown';

    // Try to get savings from tracker
    let savingsUsd = 0;
    let guaranteedSavedUsd = 0;
    try {
      const metricsRes = await httpGet(TRACKER_URL + '/metrics', 800);
      if (metricsRes.ok && metricsRes.json) {
        savingsUsd = metricsRes.json.saved || metricsRes.json.advisory_saved || 0;
        guaranteedSavedUsd = metricsRes.json.guaranteed_saved || 0;
      }
    } catch {}

    // MP-12: generate one stable device_id in the canonical ~/.mooter location.
    // Preserve a legacy identity byte-for-byte instead of minting a second ID.
    const deviceIdPath = path.join(MOOTER_DIR, 'device.id');
    const legacyDeviceIdPath = path.join(LEGACY_DIR, 'device.id');
    let deviceId;
    try { deviceId = fs.readFileSync(deviceIdPath, 'utf8').trim(); } catch {}
    if (!deviceId) {
      try { deviceId = fs.readFileSync(legacyDeviceIdPath, 'utf8').trim(); } catch {}
      if (!deviceId) deviceId = crypto.randomUUID();
      fs.mkdirSync(MOOTER_DIR, { recursive: true });
      try {
        fs.writeFileSync(deviceIdPath, deviceId + '\n', { flag: 'wx' });
      } catch (err) {
        if (!err || err.code !== 'EEXIST') throw err;
        deviceId = fs.readFileSync(deviceIdPath, 'utf8').trim();
      }
    }

    const syncPayload = {
      device_id: deviceId,
      device_name: `${os.hostname()} (${process.platform})`,
      hw_tier: hwCap?.hw_tier || 'unknown',
      gpu_name: hwCap?.name_short || hwCap?.name || null,
      gpu_vram_mb: hwCap?.vramMB || null,
      has_anthropic_key: hasAnthropicKey,
      has_openai_key: hasOpenAIKey,
      has_gemini_key: !!process.env.GOOGLE_API_KEY || !!process.env.GEMINI_API_KEY,
      has_ollama: ollamaOk,
      ollama_models: ollamaModelList,
      ollama_has_qwen3b: !!(ollamaCheck.qwen3b),
      ollama_has_qwen30b: !!(ollamaCheck.qwen30b),
      frugal_version: frugalVersion,
      os_type: process.platform,
      arch: process.arch,
      decisions_count: decisionCount,
      savings_usd: savingsUsd,
      guaranteed_saved_usd: guaranteedSavedUsd,
    };

    // Read auth token
    const authTokenPath = path.join(os.homedir(), '.frugal', 'auth.token');
    let authToken = null;
    try { authToken = fs.readFileSync(authTokenPath, 'utf8').trim(); } catch {}

    if (authToken) {
      // POST to landing
      const postBody = JSON.stringify(syncPayload);
      const syncResult = await new Promise((resolve) => {
        const req = https.request('https://landing-five-azure-16.vercel.app/api/install-complete', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postBody),
          },
          timeout: 5000,
        }, (res) => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => {
            try { resolve({ ok: res.statusCode === 200, json: JSON.parse(body) }); }
            catch { resolve({ ok: res.statusCode === 200 }); }
          });
        });
        req.on('error', () => resolve({ ok: false }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
        req.write(postBody);
        req.end();
      });

      if (syncResult.ok) {
        row(TICK, 'Dashboard sync', 'profile updated');
      } else {
        row(WARN, 'Dashboard sync', 'failed — will retry next run');
      }
    } else {
      row(WARN, 'Dashboard sync', 'not logged in');
      row(ARROW, '', 'Run: node ~/.claude/tools/router/frugal-login.js');
      row(ARROW, '', 'Or visit https://landing-five-azure-16.vercel.app manually');
    }

    report.checks.dashboard_sync = !!authToken;
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────
  if (!JSON_MODE) {
    console.log('');
    console.log(C.dim('  ' + '─'.repeat(52)));

    if (report.fixes.length === 0) {
      console.log(`  ${TICK}  ${C.green(C.bold('All systems operational.'))}`);
      console.log(`  ${C.dim('Every prompt is being routed, recorded, and contributing to the algorithm.')}`);
    } else {
      console.log(`  ${WARN}  ${C.yellow(C.bold(`${report.fixes.length} issue(s) found:`))}`);
      report.fixes.forEach((fix, i) => {
        console.log(`  ${C.dim(`${i + 1}.`)} ${fix}`);
      });
    }
    console.log('');
    console.log(`  ${C.dim('Run with --json for machine-readable output.')}`);
    console.log(`  ${C.dim('Run with --fix to attempt automatic fixes (where safe).')}`);
    console.log(`  ${C.dim('Run with --sync to sync your setup to the mooter dashboard.')}`);
    console.log(`  ${C.dim('Run with --optimize to check OS performance optimizations.')}`);
    console.log('');
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  // ── AUTO-FIX mode ─────────────────────────────────────────────────────
  if (FIX_MODE && !JSON_MODE) {
    console.log(C.bold('  Auto-fix mode'));
    console.log('');

    // Fix 1: Mac LaunchAgent
    if (IS_MAC && !report.checks.cron_mac) {
      const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.frugal.backtest.plist');
      const backtestScript = path.join(ROUTER_DIR, 'backtest.js');
      const logPath = path.join(ROUTER_DIR, 'backtest-cron.log');
      const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.frugal.backtest</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${backtestScript}</string>
        <string>--export-delta</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${logPath}</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>`;
      try {
        fs.mkdirSync(path.dirname(plistPath), { recursive: true });
        fs.writeFileSync(plistPath, plist);
        const loadResult = spawnSync('launchctl', ['load', plistPath], { encoding: 'utf8' });
        if (loadResult.status === 0) {
          console.log(`  ${TICK}  Installed macOS LaunchAgent (backtest at 02:00 daily)`);
        } else {
          console.log(`  ${WARN}  LaunchAgent file written but load failed — try: launchctl load ${plistPath}`);
        }
      } catch (e) {
        console.log(`  ${CROSS}  Failed to install LaunchAgent: ${e.message}`);
      }
    }

    // Fix 2: Start tracker
    if (!report.checks.tracker_running) {
      try {
        const { execFile } = require('child_process');
        const trackerScript = path.join(ROUTER_DIR, 'savings-tracker.js');
        if (fileExists(trackerScript)) {
          const child = execFile(process.execPath, [trackerScript], {
            detached: true, stdio: 'ignore', windowsHide: true,
          });
          child.unref();
          console.log(`  ${TICK}  Started savings tracker on :7821`);
        }
      } catch (e) {
        console.log(`  ${WARN}  Could not start tracker: ${e.message}`);
      }
    }

    console.log('');
  }

  // ── OPTIMIZE mode (--optimize) ──────────────────────────────────────────
  if (OPTIMIZE_MODE && !JSON_MODE) {
    console.log(C.bold('  OS Optimization Checklist'));
    console.log('');

    const optimizations = [];

    if (IS_WINDOWS) {
      // 1. Power plan
      try {
        const pp = runCmd('powercfg /getactivescheme');
        const isHighPerf = pp.stdout && /high performance|ultimate/i.test(pp.stdout);
        if (isHighPerf) {
          console.log(`  ${TICK}  Power plan: High Performance`);
        } else {
          console.log(`  ${WARN}  Power plan: not High Performance`);
          const fix = 'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
          console.log(`     ${C.dim('Fix: ' + fix)}`);
          optimizations.push({ name: 'power_plan', fix, applied: false });
          if (!DRY_RUN) {
            try { runCmd(fix); console.log(`     ${TICK} Applied`); optimizations[optimizations.length - 1].applied = true; } catch { /* needs admin */ }
          }
        }
      } catch { console.log(`  ${C.dim('  Power plan: could not check')}`); }

      // 2. Defender exclusion for Ollama models
      try {
        const ollamaModels = path.join(process.env.LOCALAPPDATA || '', 'Ollama', 'models');
        if (fs.existsSync(ollamaModels)) {
          console.log(`  ${WARN}  Defender exclusion for Ollama models`);
          console.log(`     ${C.dim('Fix (run as admin): Add-MpPreference -ExclusionPath "' + ollamaModels + '"')}`);
          optimizations.push({ name: 'defender_exclusion', path: ollamaModels, applied: false });
        } else {
          console.log(`  ${C.dim('  Ollama models dir not found — skipped')}`);
        }
      } catch {}
    }

    if (IS_MAC) {
      // Sleep check
      try {
        const sleep = runCmd('pmset -g | grep " sleep"');
        const sleepVal = sleep.stdout && sleep.stdout.match(/sleep\s+(\d+)/);
        if (sleepVal && parseInt(sleepVal[1]) > 0) {
          console.log(`  ${WARN}  Sleep enabled (${sleepVal[1]} min) — may interrupt long sessions`);
          console.log(`     ${C.dim('Fix: sudo pmset -a sleep 0 (during long sessions)')}`);
          optimizations.push({ name: 'sleep', current: sleepVal[1] });
        } else {
          console.log(`  ${TICK}  Sleep: disabled or 0`);
        }
      } catch {}
    }

    // 3. NVIDIA CUDA check
    try {
      const nvidia = runCmd('nvidia-smi --query-gpu=driver_version --format=csv,noheader');
      if (nvidia.status === 0 && nvidia.stdout) {
        const ver = nvidia.stdout.trim();
        console.log(`  ${TICK}  NVIDIA driver: ${ver}`);
      }
    } catch { /* no nvidia */ }

    // 4. Ollama GPU layers
    const ollamaGpuLayers = process.env.OLLAMA_NUM_GPU;
    const hwCap = readJson(path.join(ROUTER_DIR, 'hw-capability.json'));
    const vram = hwCap?.vramMB || 0;
    if (vram > 8000 && !ollamaGpuLayers) {
      console.log(`  ${WARN}  OLLAMA_NUM_GPU not set (VRAM: ${Math.round(vram / 1024)}GB)`);
      console.log(`     ${C.dim('Fix: set OLLAMA_NUM_GPU=999 in your shell profile for max GPU offload')}`);
      optimizations.push({ name: 'ollama_gpu_layers', vram });
    } else if (ollamaGpuLayers) {
      console.log(`  ${TICK}  OLLAMA_NUM_GPU: ${ollamaGpuLayers}`);
    }

    console.log('');
    if (optimizations.length === 0) {
      console.log(`  ${TICK}  ${C.green('All optimizations applied.')}`);
    } else {
      console.log(`  ${C.dim(`${optimizations.length} optimization(s) available. Use without --dry-run to auto-apply where safe.`)}`);
    }
    console.log('');
  }

  process.exit(report.ok && report.fixes.length === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('frugal-doctor error:', err.message);
  process.exit(1);
});
