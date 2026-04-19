const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { color, warn, info } = require('../lib/ui');
const { paths } = require('../lib/paths');

function run() {
  const dashboardScript = path.join(paths.router, 'mooter-dashboard.js');
  if (!fs.existsSync(dashboardScript)) {
    warn('Dashboard script not found at ' + dashboardScript);
    info('Run: mooter update');
    process.exit(4);
  }
  console.log('');
  console.log(`  ${color.magenta('mooter dashboard')} ${color.dim('— live routing feed (Ctrl+C to exit)')}`);
  console.log('');
  const child = spawn(process.execPath, [dashboardScript], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code || 0));
}

module.exports = { run };
