#!/usr/bin/env node
'use strict';

// Blocking PreToolUse bridge for worktree-conductor. Lock ownership and intent
// detection stay in the bundled conductor; this file only translates the Claude
// hook payload and propagates the conductor's exit contract.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function homeDir(env = process.env) {
  return env.HOME || env.USERPROFILE || os.homedir();
}

function resolveConductorCli(env = process.env) {
  const candidates = [
    env.MOOTER_CONDUCTOR_CLI,
    path.join(homeDir(env), '.mooter', 'cli-v1', 'mooter.js'),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function parsePayload(raw) {
  try {
    const payload = JSON.parse(raw || '{}');
    const toolName = payload.tool_name || payload.toolName || '';
    const input = payload.tool_input || payload.toolInput || {};
    return {
      toolName,
      command: typeof input.command === 'string' ? input.command : '',
      cwd: payload.cwd || payload.project_dir || process.cwd(),
    };
  } catch {
    return null;
  }
}

// Used only to fail closed when the installed conductor bundle is unexpectedly
// absent. The conductor remains the source of truth for actual resource mapping.
function isConductorSensitiveGit(command) {
  if (/\bgit\s+push\b/i.test(command)) return true;
  return /\bgit\s+tag\b/i.test(command) && !/\bgit\s+tag\s+(-l|--list)\b/i.test(command);
}

function run(payload, { release = false, env = process.env } = {}) {
  if (!payload || payload.toolName !== 'Bash' || !payload.command.trim()) {
    return { code: 0, stdout: '', stderr: '' };
  }
  const cli = resolveConductorCli(env);
  if (!cli) {
    if (release || !isConductorSensitiveGit(payload.command)) {
      return { code: 0, stdout: '', stderr: '' };
    }
    return {
      code: 2,
      stdout: '',
      stderr: 'BLOCKED: Mooter conductor runtime is unavailable; refusing an uncoordinated git write.\n',
    };
  }
  const subcommand = release ? 'auto-unlock' : 'auto-lock';
  const result = spawnSync(process.execPath, [cli, 'conductor', subcommand, '--cmd', payload.command], {
    cwd: payload.cwd,
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (release) return { code: 0, stdout, stderr };
  if (result.status === 0) return { code: 0, stdout, stderr };
  return {
    code: 2,
    stdout,
    stderr: stderr || stdout || 'BLOCKED: conductor could not prove exclusive access.\n',
  };
}

module.exports = {
  homeDir,
  resolveConductorCli,
  parsePayload,
  isConductorSensitiveGit,
  run,
};

if (require.main === module) {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }
  const result = run(parsePayload(raw), { release: process.argv.includes('--release') });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.code);
}
