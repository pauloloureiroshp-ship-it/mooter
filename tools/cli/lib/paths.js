const os = require('os');
const path = require('path');
const fs = require('fs');

const HOME = os.homedir();
const IS_WINDOWS = process.platform === 'win32';

const paths = {
  home: HOME,
  isWindows: IS_WINDOWS,
  claude: path.join(HOME, '.claude'),
  router: path.join(HOME, '.claude', 'tools', 'router'),
  hooks: path.join(HOME, '.claude', 'hooks'),
  mooter: path.join(HOME, '.mooter'),
  frugal: path.join(HOME, '.frugal'),
  localBin: IS_WINDOWS
    ? path.join(HOME, '.local', 'bin')
    : path.join(HOME, '.local', 'bin'),
  settings: path.join(HOME, '.claude', 'settings.json'),
  decisions: path.join(HOME, '.claude', 'tools', 'router', 'decisions.log'),
  deviceId: path.join(HOME, '.frugal', 'device.id'),
  versionFile: path.join(HOME, '.mooter', 'version.json'),
};

function readVersion() {
  const candidates = [
    paths.versionFile,
    path.join(__dirname, '..', '..', 'router', 'version.json'),
    path.join(paths.router, 'version.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      return JSON.parse(raw);
    } catch {}
  }
  return { version: '0.10.0', channel: 'unknown' };
}

function which(cmd) {
  const { execSync } = require('child_process');
  try {
    const bin = IS_WINDOWS ? 'where' : 'which';
    const out = execSync(`${bin} ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .split(/\r?\n/)[0];
    return out || null;
  } catch {
    return null;
  }
}

module.exports = { paths, readVersion, which };
