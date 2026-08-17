#!/usr/bin/env node
/**
 * autostart.mjs — "ligar a máquina" passa a levantar o cockpit deste device.
 *
 * O ponto delicado não é agendar: é o que o agendador tem direito de fazer.
 *
 * O shim de duplo-clique corre `--play`, porque um duplo-clique É o gesto do
 * dono. Um LaunchAgent não é gesto nenhum — é a máquina a arrancar. Se o
 * arranque automático levantasse o STOP, o kill-switch deixava de sobreviver a
 * um reboot e passava a ser uma sugestão: o dono carregava em parar, reiniciava,
 * e a máquina voltava ao trabalho sozinha. Por isso o agendamento invoca
 * `moo-runner.mjs` DIRECTAMENTE, nunca o shim, e nunca com `--play`.
 *
 *   node tools/cockpit/runner/autostart.mjs --status
 *   node tools/cockpit/runner/autostart.mjs --install
 *   node tools/cockpit/runner/autostart.mjs --uninstall
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '..', '..', '..');
const MOO_DIR = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');

export const LABEL = 'ai.mooter.runner';
export const TASK_NAME = 'MooterRunner';
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

const say = (s) => process.stdout.write(`${s}\n`);

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15_000 }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || (err && err.message) || '') }));
  });
}

/**
 * The plist. Two properties matter beyond "run at login":
 *  - the command is the runner module, with NO `--play`, so a boot can never
 *    revoke a STOP the owner set;
 *  - `KeepAlive.SuccessfulExit=false` restarts a crash but not a clean exit,
 *    so `--once` or a deliberate quit is respected instead of fought.
 */
export function buildPlist({ nodePath, runnerPath, repo, mooDir, device }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(nodePath)}</string>
    <string>${esc(runnerPath)}</string>
  </array>
  <key>WorkingDirectory</key><string>${esc(repo)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MOOTER_DEVICE</key><string>${esc(device)}</string>
    <key>MOOTER_AUTOSTART</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${esc(path.join(mooDir, 'runner.log'))}</string>
  <key>StandardErrorPath</key><string>${esc(path.join(mooDir, 'runner.log'))}</string>
</dict>
</plist>
`;
}

/** The Windows equivalent, as a command the owner runs in their own shell. */
export function windowsCommand({ nodePath, runnerPath, repo }) {
  return [
    `schtasks /Create /TN "${TASK_NAME}" /SC ONLOGON /RL LIMITED /F ^`,
    `  /TR "cmd /c cd /d \\"${repo}\\" && \\"${nodePath}\\" \\"${runnerPath}\\""`,
  ].join('\n');
}

/** Fail loudly rather than install something that quietly cannot work. */
export function preflight({ existsImpl = fs.existsSync } = {}) {
  const problems = [];
  const runnerPath = path.join(HERE, 'moo-runner.mjs');
  if (!existsImpl(runnerPath)) problems.push(`runner ausente: ${runnerPath}`);
  if (!existsImpl(process.execPath)) problems.push(`node ausente: ${process.execPath}`);
  // A LaunchAgent has no shell profile: nvm/homebrew node paths that only exist
  // inside an interactive shell would resolve at install time and vanish at boot.
  if (/\/\.nvm\//.test(process.execPath)) {
    problems.push(
      `este node vem do nvm (${process.execPath}) e pode nao existir no arranque; `
      + 'instala um node de sistema ou fixa o caminho a mao',
    );
  }
  return { ok: problems.length === 0, problems, runnerPath, nodePath: process.execPath };
}

async function status() {
  if (process.platform === 'darwin') {
    const installed = fs.existsSync(PLIST);
    say(`  LaunchAgent  ${installed ? 'instalado' : 'nao instalado'}  (${PLIST})`);
    if (installed) {
      const r = await run('launchctl', ['list', LABEL]);
      say(`  carregado    ${r.ok ? 'sim' : 'nao (instalado mas nao carregado)'}`);
    }
    return installed;
  }
  if (process.platform === 'win32') {
    const r = await run('schtasks', ['/Query', '/TN', TASK_NAME]);
    say(`  tarefa agendada  ${r.ok ? 'instalada' : 'nao instalada'} (${TASK_NAME})`);
    return r.ok;
  }
  say(`  sem suporte de arranque automatico para ${process.platform}`);
  return false;
}

async function install() {
  const pre = preflight();
  if (!pre.ok) {
    say('\n  Nao instalo com estes problemas por resolver:');
    for (const p of pre.problems) say(`    - ${p}`);
    process.exit(1);
  }
  const device = process.env.MOOTER_DEVICE
    || os.hostname().replace(/\.local$/i, '').toLowerCase();

  if (process.platform === 'darwin') {
    fs.mkdirSync(path.dirname(PLIST), { recursive: true });
    fs.mkdirSync(MOO_DIR, { recursive: true });
    fs.writeFileSync(PLIST, buildPlist({
      nodePath: pre.nodePath, runnerPath: pre.runnerPath, repo: REPO, mooDir: MOO_DIR, device,
    }));
    await run('launchctl', ['unload', PLIST]);          // idempotente
    const r = await run('launchctl', ['load', PLIST]);
    say(`\n  LaunchAgent instalado e ${r.ok ? 'carregado' : 'NAO carregado'} — ${PLIST}`);
    if (!r.ok) say(`  launchctl disse: ${r.err.trim().slice(0, 200)}`);
  } else if (process.platform === 'win32') {
    say('\n  No Windows a tarefa e criada por ti, numa shell tua:\n');
    say(windowsCommand({ nodePath: pre.nodePath, runnerPath: pre.runnerPath, repo: REPO }));
    say('');
  } else {
    say(`\n  Sem receita de arranque automatico para ${process.platform}.`);
    process.exit(1);
  }

  const stopped = fs.existsSync(path.join(MOO_DIR, 'STOP'));
  say(`  STOP actual: ${stopped ? 'ACTIVO' : 'levantado'}`);
  say('  O arranque automatico NUNCA levanta o STOP — se estiver activo, a');
  say('  maquina arranca parada e espera pelo teu ▶.\n');
}

async function uninstall() {
  if (process.platform === 'darwin') {
    await run('launchctl', ['unload', PLIST]);
    fs.rmSync(PLIST, { force: true });
    say(`\n  LaunchAgent removido — ${PLIST}\n`);
  } else if (process.platform === 'win32') {
    say(`\n  Corre na tua shell:  schtasks /Delete /TN "${TASK_NAME}" /F\n`);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  say(`\n  Moo Pilot · arranque automatico · ${process.platform}\n`);
  if (args.has('--uninstall')) return uninstall();
  if (args.has('--install')) return install();
  await status();
  say('\n  --install para ligar · --uninstall para desligar\n');
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) main();
