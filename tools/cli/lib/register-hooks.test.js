'use strict';
// register-hooks.test.js — Live Preview · MP0 ARM (settings.json wiring).
// Proves register-hooks.js arms the file-bus tap in the four hook arrays with the
// right command + matcher, and stays idempotent (a second run adds nothing and
// never duplicates). This is the canonical wiring both installers call.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, 'register-hooks.js');

function run(settingsPath) {
  const r = spawnSync(process.execPath, [SCRIPT, settingsPath, '/opt/router', '/opt/hooks'], {
    encoding: 'utf8',
  });
  const m = (r.stdout || '').match(/hooks_added=(\d+)/);
  return { code: r.status, added: m ? Number(m[1]) : null, stderr: r.stderr || '' };
}

// count entries in a hook array whose command references the tap for a given event.
// The wired command is `node "<hooks>/live-preview-tap.js" <evt>` — match the tap
// file plus the event as the trailing argv (endsWith avoids the Stop/SubagentStop
// suffix clash: " SubagentStop" does not end with " Stop").
function tapEntries(arr, evt) {
  return (arr || []).filter((entry) =>
    (entry.hooks || []).some((h) => h.command
      && h.command.includes('live-preview-tap.js')
      && h.command.trimEnd().endsWith(` ${evt}`)));
}

test('register-hooks arms the tap in all four hook arrays, idempotently', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-reg-'));
  const settingsPath = path.join(dir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({ hooks: {} }, null, 2));

  const first = run(settingsPath);
  assert.strictEqual(first.code, 0, `exit 0 (stderr: ${first.stderr})`);
  assert.ok(first.added > 0, 'first run wires hooks');

  const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

  // one tap entry per event, wired to the ~/.claude/hooks copy
  assert.strictEqual(tapEntries(s.hooks.UserPromptSubmit, 'UserPromptSubmit').length, 1);
  assert.strictEqual(tapEntries(s.hooks.Stop, 'Stop').length, 1);
  assert.strictEqual(tapEntries(s.hooks.SubagentStop, 'SubagentStop').length, 1);

  const post = tapEntries(s.hooks.PostToolUse, 'PostToolUse');
  assert.strictEqual(post.length, 1, 'PostToolUse tap wired once');
  assert.strictEqual(post[0].matcher, 'Write|Edit|MultiEdit|NotebookEdit', 'scoped to edit-family tools');

  // command points at the forward-slashed hooks dir (cross-OS)
  const upsCmd = s.hooks.UserPromptSubmit.flatMap((e) => e.hooks).find((h) => h.command.includes('live-preview-tap.js'));
  assert.match(upsCmd.command, /"\/opt\/hooks\/live-preview-tap\.js" UserPromptSubmit$/);
  assert.match(upsCmd.command, new RegExp(`^"${process.execPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" `));

  // second run is a no-op — nothing added, no duplicates
  const second = run(settingsPath);
  assert.strictEqual(second.added, 0, 'second run adds nothing (idempotent)');
  const s2 = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.strictEqual(tapEntries(s2.hooks.PostToolUse, 'PostToolUse').length, 1, 'no duplicate PostToolUse tap');
  assert.strictEqual(tapEntries(s2.hooks.Stop, 'Stop').length, 1, 'no duplicate Stop tap');
  assert.deepStrictEqual(fs.readdirSync(dir), ['settings.json'], 'atomic update leaves no temp files');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('register-hooks preserves a pre-existing user hook while arming the tap', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-reg-'));
  const settingsPath = path.join(dir, 'settings.json');
  const userHook = { hooks: [{ type: 'command', command: 'node /my/own/hook.js' }] };
  fs.writeFileSync(settingsPath, JSON.stringify({ hooks: { Stop: [userHook] } }, null, 2));

  const r = run(settingsPath);
  assert.strictEqual(r.code, 0);

  const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const kept = s.hooks.Stop.some((e) => (e.hooks || []).some((h) => h.command === 'node /my/own/hook.js'));
  assert.ok(kept, 'user hook survived');
  assert.strictEqual(tapEntries(s.hooks.Stop, 'Stop').length, 1, 'tap added alongside it');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('register-hooks upgrades bare-node Mooter hooks without rewriting user hooks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-reg-'));
  const settingsPath = path.join(dir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: 'node "/opt/hooks/gsd-turn-end.js"' }] },
        { hooks: [{ type: 'command', command: 'node /my/own/hook.js' }] },
      ],
    },
  }, null, 2));

  const result = run(settingsPath);
  assert.equal(result.code, 0);
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const commands = settings.hooks.Stop.flatMap((entry) => entry.hooks || []).map((hook) => hook.command);
  assert.ok(commands.includes(`"${process.execPath}" "/opt/hooks/gsd-turn-end.js"`));
  assert.ok(commands.includes('node /my/own/hook.js'));

  fs.rmSync(dir, { recursive: true, force: true });
});
