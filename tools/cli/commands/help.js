const { color } = require('../lib/ui');
const { readVersion } = require('../lib/paths');

function run() {
  const v = readVersion();
  console.log('');
  console.log(`  ${color.magenta('mooter')} ${color.dim('v' + v.version)} — intelligent model routing for Claude Code`);
  console.log('');
  console.log('  Usage:');
  console.log('    mooter                   Launch Claude Code with routing active');
  console.log('    mooter doctor            Run health check (recommended on first install)');
  console.log('    mooter init              Configure subscription + pull Ollama models');
  console.log('    mooter dashboard         Open live routing dashboard');
  console.log('    mooter update            Update mooter to latest version');
  console.log('    mooter uninstall         Remove mooter cleanly');
  console.log('    mooter --version         Print version');
  console.log('    mooter --help            This message');
  console.log('');
  console.log('  After install, just type ' + color.bold('mooter') + ' in any project to start.');
  console.log('  Claude Code is invoked with MOOTER_MODE=1 — routing runs in the background.');
  console.log('');
  console.log(`  ${color.dim('Docs:  https://mooter.ai')}`);
  console.log(`  ${color.dim('Issues: paulo@mooter.ai (private friends-beta)')}`);
  console.log('');
}

module.exports = { run };
