#!/usr/bin/env node
/**
 * launch.mjs — one gesture: put THIS device's cockpit on screen, live.
 *
 * What it does not do is as important as what it does. It never clears the STOP
 * flag: launching the cockpit is "show me the controls", not "start working".
 * The owner presses ▶ in the panel, and that press is the consent. A launcher
 * that silently resumed a stopped device would make the kill-switch a
 * suggestion — and this is exactly the path a scheduler or LaunchAgent would
 * take, which is where a fail-open actually bites.
 *
 * Every step reports what it found rather than what it assumed, and a step that
 * cannot be satisfied stops the launch with the concrete fix instead of opening
 * a cockpit wired to nothing.
 *
 *   node tools/cockpit/runner/launch.mjs          # start what is down, open the panel
 *   node tools/cockpit/runner/launch.mjs --status # report only, start nothing
 *   node tools/cockpit/runner/launch.mjs --no-open
 */

import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { HOST, PORT } from './f10-server.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '..', '..', '..');
const MOO_DIR = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
const LOCK = path.join(MOO_DIR, 'runner.lock');
const STOP = path.join(MOO_DIR, 'STOP');
const URL_PANEL = `http://${HOST}:${PORT}/panel`;
const OLLAMA_PORT = 11434;

const say = (s) => process.stdout.write(`${s}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The device name the whole cockpit is keyed on. */
export function deviceName() {
  return (
    process.env.MOOTER_DEVICE ||
    os.hostname().replace(/\.local$/i, '').toLowerCase() ||
    'device-sem-nome'
  );
}

/** A port check that answers in milliseconds and never throws. */
export function portOpen(port, host = '127.0.0.1', timeoutMs = 700) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    sock.connect(port, host);
  });
}

/** True only if the PID in the lock is a process that still exists. */
export function loopAlive(lockPath = LOCK) {
  try {
    const pid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Detached so the cockpit survives this terminal closing. */
function startDetached(script, logName) {
  fs.mkdirSync(MOO_DIR, { recursive: true });
  const log = fs.openSync(path.join(MOO_DIR, logName), 'a');
  const child = spawn(process.execPath, [path.join(HERE, script)], {
    detached: true,
    stdio: ['ignore', log, log],
    cwd: REPO,
    env: { ...process.env, MOOTER_DEVICE: deviceName() },
  });
  child.unref();
  return child.pid;
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  execFile(cmd, args, () => {});
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const statusOnly = args.has('--status');
  const device = deviceName();

  say(`\n  Moo Pilot · ${device}`);
  say(`  repo ${REPO}\n`);

  // 1. The engine. Without it there is nothing to show, so this is a hard stop
  //    with the fix rather than a cockpit pointing at a dead GPU.
  const ollama = await portOpen(OLLAMA_PORT);
  say(`  motor local (Ollama :${OLLAMA_PORT})   ${ollama ? 'vivo' : 'EM BAIXO'}`);
  if (!ollama) {
    say('\n  Sem motor local não há trabalho a $0. Arranca-o e volta a lançar:');
    say('      ollama serve\n');
    process.exit(1);
  }

  // 2. The endpoint — what the cockpit reads and writes.
  let endpoint = await portOpen(PORT);
  say(`  endpoint (:${PORT})               ${endpoint ? 'vivo' : 'em baixo'}`);
  if (!endpoint && !statusOnly) {
    const pid = startDetached('f10-server.mjs', 'f10.log');
    for (let i = 0; i < 20 && !endpoint; i += 1) { await sleep(250); endpoint = await portOpen(PORT); }
    say(`     -> arrancado (PID ${pid}) ${endpoint ? 'e a responder' : 'mas AINDA sem responder'}`);
    if (!endpoint) {
      say(`\n  O endpoint não subiu. Vê o log: ${path.join(MOO_DIR, 'f10.log')}\n`);
      process.exit(1);
    }
  }

  // 3. The loop. It is started, but never un-stopped.
  const loop = loopAlive();
  say(`  loop dos pilares                ${loop ? 'vivo' : 'em baixo'}`);
  if (!loop && !statusOnly) {
    const pid = startDetached('moo-runner.mjs', 'runner.log');
    await sleep(600);
    say(`     -> arrancado (PID ${pid})`);
  }

  const stopped = fs.existsSync(STOP);
  say(`  kill-switch (STOP)              ${stopped ? 'ACTIVO — o device fica parado' : 'levantado'}`);
  if (stopped) {
    // Deliberate: the launcher shows the controls, the owner presses ▶.
    say('     -> o cockpit abre com o botão "▶ Trabalhar" pronto. O gesto é teu.');
  }

  say(`\n  cockpit: ${URL_PANEL}`);
  if (statusOnly) { say('  (--status: não arranquei nada)\n'); return; }
  if (!args.has('--no-open')) { openBrowser(URL_PANEL); say('  a abrir no browser…\n'); }
  else say('');
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) main();
