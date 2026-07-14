'use strict';
// Resolve the dev command from the selected workspace instead of assuming the workspace root owns
// an npm `dev` script. Mooter itself keeps the preview app in `landing/`.

const fs = require('fs');
const path = require('path');

function readPackage(dir) {
  try {
    const file = path.join(dir, 'package.json');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && value.scripts && typeof value.scripts.dev === 'string' && value.scripts.dev.trim() ? value : null;
  } catch { return null; }
}

function resolveDevTarget(wsRoot) {
  const root = path.resolve(String(wsRoot || '.'));
  const candidates = [path.join(root, 'landing'), root];
  for (const cwd of candidates) {
    const pkg = readPackage(cwd);
    if (!pkg) continue;
    return {
      cwd,
      command: 'npm run dev',
      relativeDir: path.relative(root, cwd) || '.',
      script: pkg.scripts.dev.trim(),
    };
  }
  return null;
}

function psQuote(value) {
  return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'";
}

function shQuote(value) {
  return "'" + String(value == null ? '' : value).replace(/'/g, "'\"'\"'") + "'";
}

function restartShell(port, platform, targetCwd) {
  const p = Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
  const os = platform || process.platform;
  const target = targetCwd ? path.resolve(String(targetCwd)) : null;
  if (!p || !target) return { shellPath: null, command: 'npm run dev', stopsPort: false, ownershipScoped: true };
  if (os === 'win32') {
    return {
      shellPath: 'powershell.exe',
      command: '$mooterTarget=' + psQuote(target) + '; $mooterPids=@(Get-NetTCPConnection -LocalPort ' + p + " -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); foreach($mooterPid in $mooterPids){$mooterProc=Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId=' + $mooterPid) -ErrorAction SilentlyContinue; if($mooterProc -and $mooterProc.CommandLine -and $mooterProc.CommandLine.IndexOf($mooterTarget,[StringComparison]::OrdinalIgnoreCase) -ge 0){Stop-Process -Id $mooterPid -Force -ErrorAction SilentlyContinue}}; npm run dev",
      stopsPort: true,
      ownershipScoped: true,
    };
  }
  return {
    // The command is POSIX sh syntax, so do not send it to an arbitrary user shell (fish etc.).
    // Restrict lsof to LISTEN sockets: client connections using the same port must never be killed.
    shellPath: '/bin/sh',
    command: 'mooter_target=' + shQuote(target) + "; if command -v lsof >/dev/null 2>&1; then for mooter_pid in $(lsof -tiTCP:" + p + " -sTCP:LISTEN); do mooter_cwd=$(lsof -a -p \"$mooter_pid\" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1); case \"$mooter_cwd/\" in \"$mooter_target/\"*) kill \"$mooter_pid\";; esac; done; fi; npm run dev",
    stopsPort: true,
    ownershipScoped: true,
  };
}

module.exports = { readPackage, resolveDevTarget, psQuote, shQuote, restartShell };
