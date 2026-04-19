const { spawn } = require('child_process');
const { color, warn, info } = require('../lib/ui');
const { which, paths } = require('../lib/paths');
const fs = require('fs');

function run(args) {
  const claudeBin = which('claude');
  if (!claudeBin) {
    console.log('');
    console.log(`  ${color.red('[XX]')} Claude Code CLI not found on PATH.`);
    console.log('');
    console.log('  mooter wraps Claude Code with smart routing — you need `claude` first.');
    console.log('');
    console.log('  Install Claude Code:');
    if (paths.isWindows) {
      console.log('    ' + color.bold('irm https://claude.ai/install.ps1 | iex'));
    } else {
      console.log('    ' + color.bold('curl -fsSL https://claude.ai/install.sh | bash'));
    }
    console.log('');
    console.log(`  Then: ${color.bold('mooter doctor')} to verify, then ${color.bold('mooter')} to start.`);
    console.log('');
    process.exit(3);
  }

  if (!fs.existsSync(paths.router) || !fs.existsSync(require('path').join(paths.router, 'classify.js'))) {
    warn('Router runtime not installed in ~/.claude/tools/router/.');
    info('Run: mooter update   (or: curl -fsSL https://mooter.ai/install.sh | sh)');
    process.exit(4);
  }

  process.stdout.write('\n');
  process.stdout.write(`  ${color.magenta('mooter')} ${color.dim('routing active — multi-line statusline + MOOTER_MODE=1')}\n`);
  process.stdout.write('\n');

  const env = { ...process.env, MOOTER_MODE: '1' };
  const child = spawn(claudeBin, args, { stdio: 'inherit', env, shell: false });
  child.on('exit', (code) => process.exit(code || 0));
  child.on('error', (err) => {
    console.error(`  ${color.red('[XX]')} failed to launch claude: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { run };
