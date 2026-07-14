'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const CLI = path.join(__dirname, 'moo-verify.js');

function mkproject(pkg, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooverify-'));
  if (pkg) fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

function runCLI(dir, args = [], stdin = '') {
  const last = path.join(dir, '.last.json');
  const r = spawnSync('node', [CLI, ...args], {
    input: stdin,
    env: { ...process.env, MOO_VERIFY_CWD: dir, MOO_VERIFY_LAST: last },
    encoding: 'utf8',
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* gate mode prints nothing */ }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

test('failing required test → pass:false, exit 2, blocking lists the check', () => {
  const dir = mkproject({ name: 'x', scripts: { test: 'exit 1' } });
  const r = runCLI(dir);
  assert.strictEqual(r.code, 2);
  assert.strictEqual(r.json.pass, false);
  assert.deepStrictEqual(r.json.blocking.map((b) => b.name), ['test']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('required auto-detected failure ending in "not found" still blocks (never misclassified unavailable)', () => {
  const dir = mkproject({ name: 'x', scripts: { test: 'echo resource not found && exit 1' } });
  const r = runCLI(dir);
  assert.strictEqual(r.code, 2);
  assert.strictEqual(r.json.pass, false);
  assert.ok(r.json.blocking.some((b) => b.name === 'test'));
  assert.match(r.json.blocking.find((b) => b.name === 'test').signal, /not found/i);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('passing required test → pass:true, exit 0', () => {
  const dir = mkproject({ name: 'x', scripts: { test: 'exit 0' } });
  const r = runCLI(dir);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.json.pass, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('npm placeholder test is SKIPPED, never a fabricated pass', () => {
  const dir = mkproject({ name: 'x', scripts: { test: 'echo "Error: no test specified" && exit 1' } });
  const r = runCLI(dir);
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.json.checks, []); // nothing detected → nothing claimed
  fs.rmSync(dir, { recursive: true, force: true });
});

test('advisory check failing does NOT block (exit 0)', () => {
  // a custom advisory check that fails; test passes
  const dir = mkproject({ name: 'x', scripts: { test: 'exit 0' } });
  fs.writeFileSync(path.join(dir, 'mooter.verify.json'), JSON.stringify({ required: ['test'], advisory: ['style'], checks: { style: 'exit 3' } }));
  const r = runCLI(dir);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.json.pass, true);
  const style = r.json.checks.find((c) => c.name === 'style');
  assert.strictEqual(style.pass, false);
  assert.strictEqual(style.kind, 'advisory');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fast-fail: checks after a required failure are marked pending', () => {
  // detection order is typecheck → test; fail typecheck so test should be pending
  const dir = mkproject({ name: 'x', scripts: { typecheck: 'exit 1', test: 'exit 0' } });
  fs.writeFileSync(path.join(dir, 'mooter.verify.json'), JSON.stringify({ required: ['test', 'typecheck'] }));
  const r = runCLI(dir);
  assert.strictEqual(r.code, 2);
  const t = r.json.checks.find((c) => c.name === 'test');
  assert.strictEqual(t.signal, 'pending');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Stop-hook gate ──────────────────────────────────────────────────────────
test('gate is a no-op (exit 0) when NOT opted in', () => {
  const dir = mkproject({ name: 'x', scripts: { test: 'exit 1' } }); // would fail if it ran
  const r = runCLI(dir, ['--gate'], '{}');
  assert.strictEqual(r.code, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('gate (opted in) keeps the agent working on failure: exit 2 + signal', () => {
  const dir = mkproject({ name: 'x', scripts: { test: 'exit 1' } }, { 'mooter.verify.json': JSON.stringify({ required: ['test'] }) });
  const r = runCLI(dir, ['--gate'], '{}');
  assert.strictEqual(r.code, 2);
  assert.match(r.stderr, /moo-verify/);
  assert.match(r.stderr, /test/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('gate (opted in) passes through when green: exit 0', () => {
  const dir = mkproject({ name: 'x', scripts: { test: 'exit 0' } }, { 'mooter.verify.json': JSON.stringify({ required: ['test'] }) });
  const r = runCLI(dir, ['--gate'], '{}');
  assert.strictEqual(r.code, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('writes ~/.mooter/verify-last.json (audit trail)', () => {
  const dir = mkproject({ name: 'x', scripts: { test: 'exit 0' } });
  runCLI(dir);
  assert.ok(fs.existsSync(path.join(dir, '.last.json')));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Honesty edge: a user-required custom check with a missing tool must BLOCK ─
test('required custom check whose tool is missing → blocks (no silent green)', () => {
  const dir = mkproject({ name: 'x', scripts: { test: 'exit 0' } });
  fs.writeFileSync(path.join(dir, 'mooter.verify.json'), JSON.stringify({ required: ['test', 'build'], checks: { build: 'definitely-not-a-real-binary-xyz' } }));
  const r = runCLI(dir);
  assert.strictEqual(r.code, 2);
  assert.strictEqual(r.json.pass, false);
  assert.ok(r.json.blocking.some((b) => b.name === 'build'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('advisory custom check with a missing tool stays "—" (does not block)', () => {
  const dir = mkproject({ name: 'x', scripts: { test: 'exit 0' } });
  fs.writeFileSync(path.join(dir, 'mooter.verify.json'), JSON.stringify({ required: ['test'], advisory: ['extra'], checks: { extra: 'definitely-not-a-real-binary-xyz' } }));
  const r = runCLI(dir);
  assert.strictEqual(r.code, 0);
  const extra = r.json.checks.find((c) => c.name === 'extra');
  assert.strictEqual(extra.pass, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Zero-LLM / no-proxy doctrine guard ──────────────────────────────────────
test('source makes no network / paid-model calls (zero-LLM)', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  for (const bad of ['require(\'http\')', 'require("http")', 'require(\'https\')', 'fetch(', 'anthropic', 'openai', 'api.anthropic']) {
    assert.ok(!src.includes(bad), `moo-verify must not reference ${bad}`);
  }
});
