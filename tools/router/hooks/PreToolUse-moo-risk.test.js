'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const HOOK = path.join(__dirname, 'PreToolUse-moo-risk.js');

// Run the hook with a tool payload; return { code, stderr, log }.
function runHook(payload) {
  const logPath = path.join(os.tmpdir(), `moo-risk-test-${process.pid}-${Math.round(performance.now())}.log`);
  let code = 0, stderr = '';
  try {
    execFileSync('node', [HOOK], {
      input: JSON.stringify(payload),
      env: { ...process.env, MOOTER_DECISIONS_LOG: logPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    code = e.status;
    stderr = e.stderr ? e.stderr.toString() : '';
  }
  let log = '';
  try { log = fs.readFileSync(logPath, 'utf8'); fs.unlinkSync(logPath); } catch { /* none */ }
  return { code, stderr, log };
}

test('blocks a destructive drop-table Bash command (exit 2 + reason + event)', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'psql -c "drop table legacy_users"' } });
  assert.strictEqual(r.code, 2);
  assert.match(r.stderr, /BLOCKED Bash/);
  assert.match(r.stderr, /destructive/i);
  assert.match(r.log, /"event":"risk_blocked"/);
  assert.match(r.log, /sql_drop_table/);
});

test('blocks force-push to main', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'git push --force origin main' } });
  assert.strictEqual(r.code, 2);
  assert.match(r.log, /force_push/);
});

test('allows a safe read command (exit 0, no event)', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'cat README.md | head' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.log, '');
});

test('fails open on unparseable stdin (exit 0)', () => {
  const r = runHook('not json at all');
  assert.strictEqual(r.code, 0);
});

test('empty / missing tool_input → allow', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: {} });
  assert.strictEqual(r.code, 0);
});

// ── Bypass regression (final-reviewer finding) ──────────────────────────────
test('cannot bypass with sandbox/example/comment wrappers', () => {
  const bypasses = [
    'echo example && psql -c "drop table users"',
    'rm -rf /etc/secrets  # for example',
    'psql -c "DELETE FROM users"  # this is just a sample',
    'drop table users -- sandbox',
  ];
  for (const command of bypasses) {
    const r = runHook({ tool_name: 'Bash', tool_input: { command } });
    assert.strictEqual(r.code, 2, `must block: ${command}`);
  }
});

test('editing a file with ordinary boolean code is allowed', () => {
  const r = runHook({ tool_name: 'Write', tool_input: { file_path: 'src/config.ts', content: 'export const enabled = true;\nexport const beta = false;\n' } });
  assert.strictEqual(r.code, 0);
});

test('secret material is redacted in the logged preview', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'rotate the prod API key to sk_live_abcdef1234567890 now' } });
  assert.strictEqual(r.code, 2);
  assert.ok(!/sk_live_abcdef1234567890/.test(r.log), 'raw secret must not be logged');
  assert.match(r.log, /\*\*\*/);
});
