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
import { execFileSync } from 'node:child_process';
import { HOST, PORT } from './f10-server.mjs';
import { deviceName, beaconDir } from './fleet-beacon.mjs';
import { autoVerificar } from './self-check.mjs';
import { resolveRepoRoot, projectPaths } from './project.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const RAIZ_DO_SCRIPT = path.resolve(HERE, "..", "..", "..");
/**
 * O motor generalizou (B1) e o ponto de entrada que o dono usa — `npm run
 * pilot` — nao tinha herdado nada: `--repo` e `MOO_REPO_ROOT` eram
 * silenciosamente ignorados aqui, e o lancador abria sempre o repo do
 * script. Um runner que sabe conduzir qualquer repo, atras de um botao que
 * so sabe abrir um, e um runner que ninguem consegue apontar.
 */
const REPO = (() => {
  try {
    return resolveRepoRoot({ argv: process.argv.slice(2), scriptRoot: RAIZ_DO_SCRIPT }).root;
  } catch (err) {
    process.stdout.write("repo invalido: " + err.message + "\n");
    process.exit(1);
  }
})();
const MOO_DIR = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
/**
 * O LOCK e o STOP sao POR PROJECTO desde o B2, mas este ficheiro montava-os a
 * partir do `MOO_DIR` cru — ignorando o `--repo` que ele proprio acabara de
 * resolver duas linhas acima. Consequencia: com `--repo` a apontar a outro
 * projecto, o lancador reportava o lock e o STOP do projecto ERRADO, e o botao
 * de parar do painel escrevia num sitio que este nao lia. Kill-switch a falhar
 * aberto, pela terceira vez nesta base de codigo e sempre pela mesma razao.
 */
const PATHS = projectPaths({ repoRoot: REPO, mooDir: MOO_DIR, canonicalRoot: RAIZ_DO_SCRIPT });
const LOCK = PATHS.LOCK;
const STOP = PATHS.STOP_FILE;
const URL_PANEL = `http://${HOST}:${PORT}/panel`;
const OLLAMA_PORT = 11434;

const say = (s) => process.stdout.write(`${s}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A identidade vive em fleet-beacon.mjs e só lá. Reexportada por conveniência,
// nunca re-derivada: foi exactamente a segunda derivação que partiu a frota.
export { deviceName } from './fleet-beacon.mjs';

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

  // 4. ALINHAMENTO — e aqui ARRANJA-SE, nao se reporta.
  //
  // Ate aqui isto listava o que estava desalinhado e deixava o dono a copiar
  // comandos. Do lado de quem usa nao existem tres conceitos (arrancar,
  // alinhar, lancar): existe uma vontade — "poe esta maquina a trabalhar". Cada
  // comando extra e uma forma de falhar, e o unico que sobrevive a memoria de
  // quem nao mexe nisto todos os dias e o que ja se sabe de cor.
  //
  // `npm run pilot` passa a puxar o codigo, espelhar o runtime e reconstruir o
  // indice do vault ANTES de levantar seja o que for. `--no-sync` salta isto
  // para quem esta a depurar e quer a maquina exactamente como a deixou.
  if (!args.has('--no-sync') && !statusOnly) {
    try {
      const saida = execFileSync(process.execPath, [path.join(REPO, 'tools', 'cockpit', 'sync-device.mjs')],
        { cwd: REPO, encoding: 'utf8' });
      const linhas = saida.split('\n').filter((l) => /^\s*[↻✗]/.test(l));
      if (linhas.length) { say('  a alinhar este device:'); for (const l of linhas) say(`  ${l.trim()}`); say(''); }
    } catch (e) {
      // Alinhar e conveniencia; o cockpit e o trabalho. Nunca impede o arranque.
      say(`  (alinhamento nao correu: ${String(e && e.message).slice(0, 60)})\n`);
    }
  }

  // 5. O QUE SOBRA — o que nenhum script pode fazer sozinho.
  //
  // Um device novo falha sempre pelas mesmas quatro coisas: codigo antigo,
  // conector de outra versao, vault por montar, beacon que nao publica. Nenhuma
  // grita; todas dao um sintoma que parece outra coisa. Aqui gritam, e cada uma
  // traz o comando que a resolve.
  try {
    const onde = beaconDir();
    const saude = autoVerificar({
      repoRoot: REPO,
      paths: { LEDGER: path.join(MOO_DIR, 'runner-ledger.jsonl') },
      mooDir: MOO_DIR,
      // `beaconDir()` resolve o vault quando ele existe e cai numa pasta local
      // quando nao. Apontar a mao para a local dizia "beacon nao existe" com o
      // beacon vivo no vault, a dois centimetros.
      vaultDir: onde.partilhado ? path.dirname(onde.dir) : null,
      beaconFile: path.join(onde.dir, `${device}.json`),
    });
    const precisam = saude.itens.filter((i) => i.estado === 'mau' || i.estado === 'aviso');
    if (precisam.length) {
      say('\n  FALTA O TEU GESTO — nada disto um script pode fazer sozinho:');
      for (const i of precisam) {
        say(`     ${i.estado === 'mau' ? '✗' : '!'} ${i.o_que}: ${i.valor ?? i.porque}`);
        if (i.resolver) say(`        -> ${i.resolver}`);
      }
    } else {
      say('\n  alinhamento                     tudo em dia');
    }
  } catch (e) {
    // O preflight nunca pode impedir o lancamento: informa, nao bloqueia.
    say(`\n  (alinhamento nao verificado: ${String(e && e.message).slice(0, 70)})`);
  }

  say(`\n  cockpit: ${URL_PANEL}`);
  if (statusOnly) { say('  (--status: não arranquei nada)\n'); return; }
  if (!args.has('--no-open')) { openBrowser(URL_PANEL); say('  a abrir no browser…\n'); }
  else say('');
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) main();
