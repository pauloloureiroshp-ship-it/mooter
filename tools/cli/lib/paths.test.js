'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { which, isLaunchableCommand } = require('./paths');
const { claudeLaunch } = require('../commands/default');

test('Windows escolhe a variante executavel quando where devolve script e .cmd', () => {
  const extensionless = String.raw`C:\Users\Paulo\AppData\Roaming\npm\claude`;
  const executable = `${extensionless}.cmd`;
  const execSyncImpl = () => Buffer.from(`${extensionless}\r\n${executable}\r\n`);

  const selected = which('claude', { platform: 'win32', execSyncImpl });

  assert.equal(selected, executable);
  assert.equal(isLaunchableCommand(selected, 'win32'), true);
  assert.equal(isLaunchableCommand(extensionless, 'win32'), false);
});

test('Windows lanca wrappers .cmd por cmd.exe; outros sistemas mantem spawn direto', () => {
  const executable = String.raw`C:\Users\Paulo Loureiro\AppData\Roaming\npm\claude.cmd`;
  assert.deepEqual(
    claudeLaunch(executable, ['--version'], { isWindows: true, comSpec: 'cmd.exe' }),
    { command: 'cmd.exe', args: ['/d', '/c', executable, '--version'] },
  );
  assert.deepEqual(
    claudeLaunch('/usr/local/bin/claude', ['--version'], { isWindows: false }),
    { command: '/usr/local/bin/claude', args: ['--version'] },
  );
});
