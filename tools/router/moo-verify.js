#!/usr/bin/env node
'use strict';

// moo-verify — the free, deterministic critic (First Magic — FASE 2).
//
// Anthropic named the core failure of agentic loops: SELF-PREFERENTIAL BIAS — a model
// prefers its own output when asked to judge it. The fix is doctrine, not magic: the
// critic must be EXTERNAL and MACHINE-CHECKABLE, never the model's opinion. moo-verify
// is that critic, run locally at $0. It is the stop-condition for every Mooter loop and
// the Stop-hook gate. It NEVER calls a paid model.
//
// CONTRACT
//   stdout (JSON): { pass, checks:[{name, kind, pass, signal}], blocking:[...] }
//   exit: 0 if every REQUIRED check passes (or none ran), 2 if any required check fails.
//
//   --gate   Stop-hook mode: self-gating (no-op unless opted in), prints the failing
//            signal to stderr and exits 2 while not green so the agent keeps working
//            (bounded by Claude Code's native 8-block cap). Fails OPEN on any error.
//   --json   force JSON to stdout (default in non-gate mode).
//
// DOCTRINE
//   Zero-LLM. No-proxy. Reads the repo, runs shell checks, writes only
//   ~/.mooter/verify-last.json. Honest signal: a check whose tool is absent is reported
//   as "—", never a fabricated pass. Fast-fail on the first required failure.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PROJECT_DIR = process.env.MOO_VERIFY_CWD || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CHECK_TIMEOUT_MS = Number(process.env.MOO_VERIFY_TIMEOUT_MS) || 120000;
// Total wall-clock budget across all checks — keeps the Stop gate inside Claude
// Code's hook timeout. Checks not started before the budget are reported 'pending'
// (never a fabricated pass), so a slow project degrades honestly, not silently.
const TOTAL_BUDGET_MS = Number(process.env.MOO_VERIFY_TOTAL_MS) || 240000;
const LAST_PATH = process.env.MOO_VERIFY_LAST || path.join(os.homedir(), '.mooter', 'verify-last.json');

function exists(rel) {
  try { return fs.existsSync(path.join(PROJECT_DIR, rel)); } catch { return false; }
}
function readJSON(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, rel), 'utf8')); } catch { return null; }
}
function binExists(bin) {
  return exists(path.join('node_modules', '.bin', bin));
}
function onPath(cmd) {
  try {
    const r = spawnSync(cmd, ['--version'], { cwd: PROJECT_DIR, timeout: 10000, stdio: 'ignore' });
    return !r.error && r.status === 0;
  } catch { return false; }
}

// Run a shell command; classify the result honestly.
//   { state: 'pass'|'fail'|'skip', signal: string }
function run(cmd) {
  let r;
  try {
    r = spawnSync(cmd, { cwd: PROJECT_DIR, shell: true, timeout: CHECK_TIMEOUT_MS, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    return { state: 'skip', signal: '—' };
  }
  if (r.error && r.error.code === 'ETIMEDOUT') return { state: 'fail', signal: `timed out after ${CHECK_TIMEOUT_MS}ms` };
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  // POSIX shells use 127; Windows cmd.exe commonly uses status=1 and a
  // localized "is not recognized" message. Both mean unavailable, not a
  // real failed advisory check. Required custom checks are promoted to a
  // blocker below, preserving the fail-closed contract.
  if (r.status === 127 || /is not recognized as an internal or external command|command not found|not found(?:\r?\n|$)/i.test(out)) {
    return { state: 'skip', signal: '—' };
  }
  if (r.status === 0) return { state: 'pass', signal: 'ok' };
  // concise failing signal: last meaningful line
  const line = out.split('\n').map((s) => s.trim()).filter(Boolean).slice(-1)[0] || `exit ${r.status}`;
  return { state: 'fail', signal: line.slice(0, 140) };
}

// ── Stack detection → ordered list of { name, kind, cmd } ───────────────────
function detectChecks(cfg) {
  const checks = [];
  const pkg = readJSON('package.json');

  if (pkg) {
    const scripts = pkg.scripts || {};
    const placeholder = /no test specified/i;

    // typecheck
    if (scripts.typecheck) checks.push({ name: 'typecheck', cmd: 'npm run -s typecheck' });
    else if (exists('tsconfig.json') && binExists('tsc')) checks.push({ name: 'typecheck', cmd: 'node_modules/.bin/tsc --noEmit' });

    // test
    if (scripts.test && !placeholder.test(scripts.test)) checks.push({ name: 'test', cmd: 'npm test --silent' });
    else if (binExists('vitest')) checks.push({ name: 'test', cmd: 'node_modules/.bin/vitest run' });
    else if (binExists('jest')) checks.push({ name: 'test', cmd: 'node_modules/.bin/jest' });

    // lint
    if (scripts.lint) checks.push({ name: 'lint', cmd: 'npm run -s lint' });
    else if (binExists('eslint') && (exists('.eslintrc') || exists('.eslintrc.json') || exists('.eslintrc.cjs') || exists('eslint.config.js') || exists('eslint.config.mjs'))) {
      checks.push({ name: 'lint', cmd: 'node_modules/.bin/eslint .' });
    }
  }

  if (exists('pyproject.toml') || exists('requirements.txt') || exists('setup.cfg')) {
    const py = onPath('python3') ? 'python3' : (onPath('python') ? 'python' : null);
    if (py) {
      const has = (mod) => !spawnSync(py, ['-c', `import ${mod}`], { cwd: PROJECT_DIR, timeout: 10000, stdio: 'ignore' }).status;
      if (has('ruff')) checks.push({ name: 'lint', cmd: `${py} -m ruff check .` });
      if (has('mypy')) checks.push({ name: 'typecheck', cmd: `${py} -m mypy .` });
      if (has('pytest')) checks.push({ name: 'test', cmd: `${py} -m pytest -q` });
    }
  }

  if (exists('Cargo.toml') && onPath('cargo')) {
    checks.push({ name: 'typecheck', cmd: 'cargo check --quiet' });
    checks.push({ name: 'test', cmd: 'cargo test --quiet' });
  }

  // honour an explicit custom check map from the config (name -> shell cmd)
  if (cfg && cfg.checks && typeof cfg.checks === 'object') {
    for (const [name, cmd] of Object.entries(cfg.checks)) {
      if (typeof cmd === 'string') checks.push({ name, cmd, custom: true });
    }
  }
  return checks;
}

function verify() {
  const cfg = readJSON('mooter.verify.json') || {};
  const required = new Set(cfg.required || ['test', 'typecheck']);
  const advisory = new Set(cfg.advisory || ['lint']);

  const detected = detectChecks(cfg);
  const checks = [];
  const blocking = [];
  let fastFailed = false;
  const startedAt = Date.now();

  for (const c of detected) {
    const kind = required.has(c.name) ? 'required' : 'advisory';
    // fast-fail after a required failure, OR once the total time budget is spent:
    // do not start more checks — report them honestly as pending (not pass).
    if (fastFailed || (Date.now() - startedAt) > TOTAL_BUDGET_MS) {
      checks.push({ name: c.name, kind, pass: null, signal: fastFailed ? 'pending' : 'pending (time budget)' });
      continue;
    }

    const { state, signal } = run(c.cmd);
    let pass = state === 'pass' ? true : (state === 'fail' ? false : null); // null = skipped/—
    let sig = signal;

    // A user-declared REQUIRED check whose tool is missing (skip) is a
    // misconfiguration the opter-in must see — never a silent green. Auto-detected
    // checks may legitimately be absent and stay '—'.
    if (kind === 'required' && state === 'skip' && c.custom) {
      pass = false;
      sig = 'required check unavailable (tool missing / exit 127)';
    }

    checks.push({ name: c.name, kind, pass, signal: sig });

    if (kind === 'required' && pass === false) {
      blocking.push({ name: c.name, signal: sig });
      fastFailed = true; // fast-fail: stop running once a required check fails
    }
  }

  return { pass: blocking.length === 0, checks, blocking, project: PROJECT_DIR };
}

function writeLast(result) {
  try {
    fs.mkdirSync(path.dirname(LAST_PATH), { recursive: true });
    fs.writeFileSync(LAST_PATH, JSON.stringify({ ts: new Date().toISOString(), ...result }, null, 2) + '\n');
  } catch { /* best-effort */ }
}

// Gate is opt-in (self-gating): active only when the project ships a mooter.verify.json
// or MOOTER_VERIFY_GATE=1. Keeps the default install byte-identical.
function gateOptedIn() {
  return exists('mooter.verify.json') || process.env.MOOTER_VERIFY_GATE === '1';
}

function main() {
  const args = process.argv.slice(2);
  const gate = args.includes('--gate');

  if (gate) {
    // drain stdin (Stop payload) — we don't need it, but the harness pipes it
    try { fs.readFileSync(0); } catch { /* none */ }
    if (!gateOptedIn()) process.exit(0); // not opted in → no-op, byte-identical default

    let result;
    try { result = verify(); } catch { process.exit(0); } // fail OPEN — never wedge a session
    writeLast(result);
    if (result.pass) process.exit(0);

    const failing = result.blocking.map((b) => `  ✗ ${b.name}: ${b.signal}`).join('\n');
    process.stderr.write(
      `\n🐮 moo-verify — required checks failing; keep going until green ($0, no LLM judge):\n${failing}\n`
    );
    process.exit(2); // exit 2 keeps the agent working (native 8-block cap bounds it)
  }

  let result;
  try {
    result = verify();
  } catch (e) {
    process.stdout.write(JSON.stringify({ pass: false, checks: [], blocking: [{ name: 'verify', signal: String(e && e.message || e) }] }) + '\n');
    process.exit(2);
  }
  writeLast(result);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.pass ? 0 : 2);
}

module.exports = { verify, detectChecks, run, gateOptedIn };

if (require.main === module) main();
