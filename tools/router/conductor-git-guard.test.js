'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GUARD = path.join(__dirname, 'conductor-git-guard.js');

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-conductor-guard-'));
}

function seedFakeCli(home) {
  const cli = path.join(home, 'fake-conductor.js');
  fs.writeFileSync(
    cli,
    [
      "const args = process.argv.slice(2);",
      "if (args.includes('auto-unlock')) process.exit(0);",
      "if (args.join(' ').includes('git tag blocked')) { console.error('BLOCKED: held by other'); process.exit(2); }",
      "process.exit(0);",
    ].join('\n'),
  );
  return cli;
}

function invoke(home, command, extraArgs = [], cli = seedFakeCli(home)) {
  return spawnSync(process.execPath, [GUARD, ...extraArgs], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: home }),
    env: { ...process.env, HOME: home, USERPROFILE: home, MOOTER_CONDUCTOR_CLI: cli },
    encoding: 'utf8',
  });
}

test('propagates a conductor conflict as PreToolUse exit 2', () => {
  const home = tempHome();
  const result = invoke(home, 'git tag blocked');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED: held by other/);
  assert.equal(fs.existsSync(path.join(home, '.claude')), false, 'real/runtime Claude home is never created');
});

test('allows an acquired command and releases through the post hook', () => {
  const home = tempHome();
  assert.equal(invoke(home, 'git push origin branch').status, 0);
  assert.equal(invoke(home, 'git push origin branch', ['--release']).status, 0);
});

test('fails closed for sensitive git when the conductor runtime is missing', () => {
  const home = tempHome();
  const missing = path.join(home, 'missing-cli.js');
  const result = invoke(home, 'git push origin branch', [], missing);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /runtime is unavailable/);
});

test('missing runtime does not block read-only or irrelevant commands', () => {
  const home = tempHome();
  const missing = path.join(home, 'missing-cli.js');
  assert.equal(invoke(home, 'git tag --list', [], missing).status, 0);
  assert.equal(invoke(home, 'git status --short', [], missing).status, 0);
});
