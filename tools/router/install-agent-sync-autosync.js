#!/usr/bin/env node
/**
 * Installs a per-user 5-minute scheduler for agent-sync-vault-git.js.
 *
 * The scheduler contains paths only. Git authentication remains repository-local
 * (for example a repo-scoped deploy key configured in the vault clone).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const sync = require('./agent-sync-ledger.js');

const LABEL = 'ai.mooter.agent-sync-vault';

function xml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function atomicWrite(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, content, { encoding: 'utf8', mode: mode || 0o600 });
  fs.renameSync(temp, file);
}

function launchdPlist(config) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${xml(LABEL)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    `    <string>${xml(config.node)}</string>`,
    `    <string>${xml(config.script)}</string>`,
    '    <string>sync</string>',
    `    <string>--vault</string><string>${xml(config.vault)}</string>`,
    '  </array>',
    '  <key>RunAtLoad</key><true/>',
    '  <key>StartInterval</key>',
    `  <integer>${config.interval}</integer>`,
    '  <key>ProcessType</key><string>Background</string>',
    '  <key>StandardOutPath</key>',
    `  <string>${xml(config.stdout)}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${xml(config.stderr)}</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

function systemdUnits(config) {
  const quote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const service = [
    '[Unit]',
    'Description=Mooter append-only agent sync vault publisher',
    '',
    '[Service]',
    'Type=oneshot',
    `ExecStart=${quote(config.node)} ${quote(config.script)} sync --vault ${quote(config.vault)}`,
    '',
  ].join('\n');
  const timer = [
    '[Unit]',
    'Description=Run Mooter agent sync vault publisher',
    '',
    '[Timer]',
    'OnBootSec=2min',
    `OnUnitActiveSec=${config.interval}s`,
    'Persistent=true',
    '',
    '[Install]',
    'WantedBy=timers.target',
    '',
  ].join('\n');
  return { service, timer };
}

function windowsWrapper(config) {
  return [
    '@echo off',
    `"${config.node}" "${config.script}" sync --vault "${config.vault}"`,
    '',
  ].join('\r\n');
}

function buildConfig(options) {
  options = options || {};
  const home = path.resolve(options.home || os.homedir());
  const vault = sync.resolveVaultPath(options.vault);
  if (!vault) throw new Error('canonical vault not found; pass --vault <path>');
  const installed = path.join(home, '.claude', 'tools', 'router', 'agent-sync-vault-git.js');
  const source = path.join(__dirname, 'agent-sync-vault-git.js');
  const script = path.resolve(options.script || (fs.existsSync(installed) ? installed : source));
  if (!fs.existsSync(script)) throw new Error(`vault sync runtime missing: ${script}`);
  const interval = Math.max(60, Math.min(3600, Number(options.interval) || 300));
  const logDir = path.join(home, '.mooter', 'logs');
  return {
    platform: options.platform || process.platform,
    home,
    vault,
    node: path.resolve(options.node || process.execPath),
    script,
    interval,
    stdout: path.join(logDir, 'agent-sync-vault.log'),
    stderr: path.join(logDir, 'agent-sync-vault.error.log'),
  };
}

function run(command, args, options) {
  const result = (options.spawnSync || childProcess.spawnSync)(command, args, {
    encoding: 'utf8',
    timeout: 20000,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function install(options) {
  options = options || {};
  const config = buildConfig(options);
  const dryRun = options.dryRun === true;
  if (config.platform === 'darwin') {
    const file = path.join(config.home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
    const content = launchdPlist(config);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(config.stdout), { recursive: true });
      atomicWrite(file, content);
      const domain = `gui/${typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid}`;
      run('launchctl', ['bootout', domain, file], { ...options, allowFailure: true });
      run('launchctl', ['bootstrap', domain, file], options);
      run('launchctl', ['kickstart', '-k', `${domain}/${LABEL}`], options);
    }
    return { ok: true, dry_run: dryRun, platform: config.platform, file, config, content };
  }
  if (config.platform === 'linux') {
    const dir = path.join(config.home, '.config', 'systemd', 'user');
    const serviceFile = path.join(dir, `${LABEL}.service`);
    const timerFile = path.join(dir, `${LABEL}.timer`);
    const units = systemdUnits(config);
    if (!dryRun) {
      atomicWrite(serviceFile, units.service);
      atomicWrite(timerFile, units.timer);
      run('systemctl', ['--user', 'daemon-reload'], options);
      run('systemctl', ['--user', 'enable', '--now', `${LABEL}.timer`], options);
    }
    return {
      ok: true,
      dry_run: dryRun,
      platform: config.platform,
      file: timerFile,
      service_file: serviceFile,
      config,
      content: units,
    };
  }
  if (config.platform === 'win32') {
    const file = path.join(config.home, '.mooter', 'agent-sync-vault.cmd');
    const content = windowsWrapper(config);
    const minutes = Math.max(1, Math.round(config.interval / 60));
    if (!dryRun) {
      atomicWrite(file, content);
      run('schtasks.exe', [
        '/Create', '/F',
        '/TN', 'Mooter Agent Sync Vault',
        '/SC', 'MINUTE',
        '/MO', String(minutes),
        '/TR', `"${file}"`,
      ], options);
    }
    return { ok: true, dry_run: dryRun, platform: config.platform, file, config, content };
  }
  throw new Error(`unsupported scheduler platform: ${config.platform}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

function command(argv, options) {
  const args = parseArgs(argv || []);
  if (args.help) {
    return 'Usage: install-agent-sync-autosync.js --vault <path> [--interval 300] [--dry-run] [--json]\n';
  }
  const result = install({
    ...options,
    vault: args.vault,
    interval: args.interval,
    dryRun: Boolean(args['dry-run']),
  });
  return args.json
    ? JSON.stringify(result, null, 2) + '\n'
    : [
      '# Mooter Agent Sync Autosync',
      '',
      `AUTOSYNC=${result.dry_run ? 'dry_run_pass' : 'installed'}`,
      `platform: ${result.platform}`,
      `scheduler: ${result.file}`,
      `interval_seconds: ${result.config.interval}`,
      `vault: ${result.config.vault}`,
      `runtime: ${result.config.script}`,
      '',
    ].join('\n');
}

module.exports = {
  LABEL,
  launchdPlist,
  systemdUnits,
  windowsWrapper,
  buildConfig,
  install,
  command,
};

if (require.main === module) {
  try {
    process.stdout.write(command(process.argv.slice(2)));
  } catch (err) {
    process.stderr.write((err && err.message ? err.message : String(err)) + '\n');
    process.exitCode = 1;
  }
}
