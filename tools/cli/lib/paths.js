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
  legacyFrugal: path.join(HOME, '.frugal'), // legacy dir — migrated away on load (Kill Frugal W1)
  localBin: IS_WINDOWS
    ? path.join(HOME, '.local', 'bin')
    : path.join(HOME, '.local', 'bin'),
  settings: path.join(HOME, '.claude', 'settings.json'),
  decisions: path.join(HOME, '.claude', 'tools', 'router', 'decisions.log'),
  deviceId: path.join(HOME, '.mooter', 'device.id'),
  versionFile: path.join(HOME, '.mooter', 'version.json'),
};

// Kill Frugal W1 — migrate legacy identity/state files from ~/.frugal on load.
// Moves (never copies) so identity cannot fork; ~/.frugal is removed when empty.
(function migrateLegacyFrugal() {
  const MIGRATABLE = ['device.id', 'user.hash', 'auth.token', 'budget-config.json', '.last-sync'];
  try {
    if (!fs.existsSync(paths.legacyFrugal)) return;
    fs.mkdirSync(paths.mooter, { recursive: true });
    for (const name of MIGRATABLE) {
      const oldPath = path.join(paths.legacyFrugal, name);
      const newPath = path.join(paths.mooter, name);
      try {
        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) fs.renameSync(oldPath, newPath);
        else if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch { /* per-file non-fatal */ }
    }
    try { if (fs.readdirSync(paths.legacyFrugal).length === 0) fs.rmdirSync(paths.legacyFrugal); } catch {}
  } catch { /* non-fatal */ }
})();

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
