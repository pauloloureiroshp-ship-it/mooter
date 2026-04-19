const { execSync } = require('child_process');
const { color, say, ok, fail, info } = require('../lib/ui');
const { paths, readVersion } = require('../lib/paths');

function run() {
  const current = readVersion();
  console.log('');
  console.log(`  ${color.magenta('mooter update')} ${color.dim('current: v' + current.version)}`);
  console.log('');
  say('Downloading and running the latest installer...');
  try {
    const cmd = paths.isWindows
      ? `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://mooter.ai/install.ps1 | iex"`
      : `curl -fsSL https://mooter.ai/install.sh | bash`;
    info(cmd);
    execSync(cmd, { stdio: 'inherit' });
    const after = readVersion();
    console.log('');
    if (after.version !== current.version) {
      ok(`Updated: v${current.version} -> v${after.version}`);
    } else {
      ok(`Already on latest: v${after.version}`);
    }
    console.log('');
  } catch (e) {
    fail('Update failed: ' + e.message);
    info('You can manually re-run the installer from https://mooter.ai');
    process.exit(1);
  }
}

module.exports = { run };
