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

const WINDOWS_EXECUTABLE_EXTENSIONS = new Set(['.cmd', '.exe', '.bat']);

function isLaunchableCommand(commandPath, platform = process.platform) {
  if (!commandPath) return false;
  if (platform !== 'win32') return true;
  return WINDOWS_EXECUTABLE_EXTENSIONS.has(path.extname(commandPath).toLowerCase());
}

function selectCommandPath(output, platform = process.platform) {
  const candidates = String(output || '')
    .trim()
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  if (platform !== 'win32') return candidates[0] || null;
  return candidates.find((candidate) => isLaunchableCommand(candidate, platform)) || null;
}

function which(cmd, { platform = process.platform, execSyncImpl } = {}) {
  const { execSync } = require('child_process');
  try {
    const bin = platform === 'win32' ? 'where' : 'which';
    const out = (execSyncImpl || execSync)(`${bin} ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] });
    return selectCommandPath(out.toString(), platform);
  } catch {
    return null;
  }
}

module.exports = { paths, readVersion, which, isLaunchableCommand, selectCommandPath };
