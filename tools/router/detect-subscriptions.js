#!/usr/bin/env node
/**
 * detect-subscriptions.js — non-interactive subscription auto-detect.
 *
 * Probes:
 *   - Anthropic plan       → ~/.claude/.credentials.json claudeAiOauth.subscriptionType
 *                            (max | pro | team | enterprise | none)
 *   - OpenAI Codex CLI     → `codex login status` output
 *   - OpenAI API           → OPENAI_API_KEY env presence (smoke ping with --ping)
 *   - Gemini               → GEMINI_API_KEY / GOOGLE_API_KEY env presence
 *   - Ollama               → command -v ollama on PATH
 *
 * Output:
 *   - Writes subscription-profile.json (preserves existing shape, adds
 *     `detected` sub-object with per-provider evidence + timestamp).
 *   - Prints JSON to stdout when invoked with --json.
 *
 * Flags:
 *   --json        Print result JSON to stdout instead of writing file.
 *   --ping        Smoke-ping providers when env keys exist (costs API calls).
 *   --dry-run     Print what would change, don't write the file.
 *
 * Wave-1.5 task #1.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawnSync } = require('child_process');

const HOME = os.homedir();
const CREDENTIALS_PATH = path.join(HOME, '.claude', '.credentials.json');
const SUB_PROFILE_PATH = path.join(HOME, '.claude', 'tools', 'router', 'subscription-profile.json');

const args = new Set(process.argv.slice(2));
const PRINT_JSON = args.has('--json');
const SMOKE_PING = args.has('--ping');
const DRY_RUN = args.has('--dry-run');

// Detection methods are pure functions: input → result. Each returns a result
// object the caller will merge into `detected`. Keeps the test surface tight.

function detectAnthropic() {
  try {
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    const c = JSON.parse(raw);
    const oa = c && c.claudeAiOauth;
    if (oa && typeof oa.subscriptionType === 'string') {
      return {
        plan: oa.subscriptionType,
        available: true,
        detected_via: 'credentials_json_subscription_type',
        evidence: { subscriptionType: oa.subscriptionType, has_token: !!oa.accessToken },
      };
    }
  } catch { /* missing or unreadable */ }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      plan: 'api-paid',
      available: true,
      detected_via: 'env_anthropic_api_key',
      evidence: { env_var: 'ANTHROPIC_API_KEY' },
    };
  }
  return { plan: 'none', available: false, detected_via: null, evidence: null };
}

function detectCodexCli() {
  // Windows codex shim is `codex.cmd`; bare `codex` returns ENOENT without
  // a shell. Codex prints `Logged in using ...` to stderr, not stdout.
  // We avoid `shell: true` with args (Node DEP0190) by invoking via cmd.exe
  // explicitly on Windows and bash on POSIX.
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'cmd.exe' : 'sh';
  const cmdArgs = isWin
    ? ['/c', 'codex', 'login', 'status']
    : ['-c', 'codex login status'];
  try {
    const r = spawnSync(cmd, cmdArgs, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    const combined = `${r.stdout || ''}\n${r.stderr || ''}`;
    if (r.status === 0 && /Logged in using ChatGPT/i.test(combined)) {
      return {
        plan: 'chatgpt_pro_or_plus',
        available: true,
        detected_via: 'codex_login_status',
        evidence: { match: 'Logged in using ChatGPT' },
      };
    }
    if (r.status === 0 && /Logged in/i.test(combined)) {
      return {
        plan: 'chatgpt_unknown',
        available: true,
        detected_via: 'codex_login_status',
        evidence: { first_line: combined.split('\n').find((l) => l.trim()) || '' },
      };
    }
  } catch { /* codex CLI not installed */ }
  return { plan: 'none', available: false, detected_via: null, evidence: null };
}

function smokePingOpenAI() {
  return new Promise((resolve) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return resolve(false);
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/models',
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function detectOpenAIApi() {
  const has = !!process.env.OPENAI_API_KEY;
  if (!has) return { plan: 'none', available: false, detected_via: null, evidence: null };
  if (SMOKE_PING) {
    const ok = await smokePingOpenAI();
    return {
      plan: ok ? 'api-paid' : 'api-broken',
      available: ok,
      detected_via: 'env_key_smoke_ping',
      evidence: { ping_ok: ok },
    };
  }
  return {
    plan: 'api-paid',
    available: true,
    detected_via: 'env_openai_api_key',
    evidence: { env_var: 'OPENAI_API_KEY', smoke_skipped: true },
  };
}

function detectGemini() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return { plan: 'none', available: false, detected_via: null, evidence: null };
  return {
    plan: 'api-paid',
    available: true,
    detected_via: 'env_gemini_or_google_api_key',
    evidence: { env_var: process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : 'GOOGLE_API_KEY' },
  };
}

function detectOllama() {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const r = spawnSync(which, ['ollama'], { encoding: 'utf8', timeout: 1000, windowsHide: true });
    if (r.status === 0 && r.stdout && r.stdout.trim()) {
      return {
        plan: 'installed',
        available: true,
        detected_via: 'which_ollama',
        evidence: { path: r.stdout.split('\n')[0].trim() },
      };
    }
  } catch { /* not installed */ }
  return { plan: 'none', available: false, detected_via: null, evidence: null };
}

async function detectAll() {
  const [anthropic, codex, openai, gemini, ollama] = await Promise.all([
    Promise.resolve(detectAnthropic()),
    Promise.resolve(detectCodexCli()),
    detectOpenAIApi(),
    Promise.resolve(detectGemini()),
    Promise.resolve(detectOllama()),
  ]);
  return {
    checked_at: new Date().toISOString(),
    anthropic,
    openai_codex_cli: codex,
    openai_api: openai,
    gemini,
    ollama,
  };
}

function flattenForBackcompat(detected) {
  return {
    anthropic: detected.anthropic.plan,
    openai: detected.openai_api.plan === 'none' ? 'none' : detected.openai_api.plan,
    openai_codex_cli: detected.openai_codex_cli.plan,
    gemini: detected.gemini.plan,
    ollama: detected.ollama.plan,
  };
}

function mergeIntoExisting(existing, detected) {
  const flat = flattenForBackcompat(detected);
  const out = {
    ...(existing || {}),
    updated_at: new Date().toISOString(),
    profiles: { ...(existing && existing.profiles), ...flat },
    detected,
    notes: 'Auto-detected by detect-subscriptions.js. Run --ping to smoke-test API keys.',
  };
  // Preserve created_at from legacy file if present.
  if (existing && existing.created_at && !out.created_at) {
    out.created_at = existing.created_at;
  } else if (!out.created_at) {
    out.created_at = out.updated_at;
  }
  // Preserve routing_hints if present (legacy field).
  if (existing && existing.routing_hints && !out.routing_hints) {
    out.routing_hints = existing.routing_hints;
  }
  return out;
}

async function main() {
  const detected = await detectAll();

  let existing = null;
  try { existing = JSON.parse(fs.readFileSync(SUB_PROFILE_PATH, 'utf8')); } catch { /* first run */ }

  const merged = mergeIntoExisting(existing, detected);

  if (PRINT_JSON) {
    process.stdout.write(JSON.stringify(merged, null, 2) + '\n');
    return;
  }

  if (DRY_RUN) {
    process.stdout.write('--- would write ---\n');
    process.stdout.write(JSON.stringify(merged, null, 2) + '\n');
    return;
  }

  fs.writeFileSync(SUB_PROFILE_PATH, JSON.stringify(merged, null, 2) + '\n');
  process.stdout.write(`detect-subscriptions: wrote ${SUB_PROFILE_PATH}\n`);
  for (const [provider, info] of Object.entries(detected)) {
    if (provider === 'checked_at') continue;
    const tag = info.available ? 'OK' : '--';
    process.stdout.write(`  [${tag}] ${provider.padEnd(20)} plan=${info.plan} via=${info.detected_via || 'n/a'}\n`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`detect-subscriptions error: ${err && err.message ? err.message : err}\n`);
    process.exit(1);
  });
}

module.exports = {
  detectAnthropic,
  detectCodexCli,
  detectOpenAIApi,
  detectGemini,
  detectOllama,
  detectAll,
  mergeIntoExisting,
  flattenForBackcompat,
};
