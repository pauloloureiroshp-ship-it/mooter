#!/usr/bin/env node
/**
 * moo-runner.mjs — the perpetual $0 loop.
 *
 * One rule above all the others: this process only ever talks to the local
 * Ollama. `runner-core.assertLocalEngine` enforces it at the only place a
 * request can leave, so "zero subscription tokens" is a property of the code
 * rather than a promise in a README.
 *
 * The prototype cleared the STOP flag on startup. That was harmless while the
 * runner was launched by hand, and a real fail-open the moment it is wired to a
 * LaunchAgent: the owner presses stop, reboots, and the machine quietly starts
 * working again. STOP now survives a restart, and only an explicit `--play`
 * (the owner's gesture, not the scheduler's) clears it.
 *
 * QUE repo, e ONDE vive o estado desse repo, vivem em `project.mjs`. Ate 2026-08-18
 * o REPO_ROOT era derivado da localizacao deste ficheiro e o estado era global:
 * um ledger, um cursor, um lock, sem campo de repo. Dois projectos nao podiam
 * coexistir, e o runner so sabia conduzir o repo de onde ele proprio corria.
 *
 *   node tools/cockpit/runner/moo-runner.mjs
 *   node tools/cockpit/runner/moo-runner.mjs --repo ~/outro-projecto
 *   MOOTER_REPO=~/outro-projecto node tools/cockpit/runner/moo-runner.mjs --once
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { runRound, nextPillar, DEFAULT_MODEL, DEFAULT_OLLAMA } from './runner-core.mjs';
import { loadPillars, DIFF_LADDER } from './context-pack.mjs';
import { buildFleetState } from './fleet-state.mjs';
import { sampleGpu } from './gpu-sampler.mjs';
import { beaconDir, writeBeacon, deviceName } from './fleet-beacon.mjs';
import { buildAlignment } from './alignment.mjs';
import { createEngineBreaker } from './engine-breaker.mjs';
import { resolveRepoRoot, projectPaths, repoSha } from './project.mjs';
import { verReserva, esperaS } from './reserva.mjs';

const HOME = os.homedir();
const MOO_DIR = process.env.MOOTER_HOME || path.join(HOME, '.mooter');
/** A raiz do repo de onde ESTE script corre — o ultimo degrau da resolucao. */
const SCRIPT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

// Base do diff: o que mudou desde este ref e trabalho novo para rever. Um repo
// parado devolve zero hunks e o runner cai para a ancora — a escada degrada
// sozinha, nunca falha. MOO_DIFF_BASE permite apontar para outro ref.
// origin/main como base era um bug: assim que o trabalho merja, o diff fica
// VAZIO e o runner cai para a ancora — que ja esta esgotada — e volta aos 97%
// de falso positivo. Medido a 2026-08-18: 30/30 rondas em modo ancorado, 29
// falsos positivos. A base tem de ser uma JANELA MOVEL de commits recentes, que
// nunca seca enquanto houver historia.
// Uma base so e um poco finito. MOO_DIFF_BASE continua a fixar UMA base
// (util para depurar); sem ela, a escada abre a seguinte quando a actual nao
// tem nada por rever.
const DIFF_BASE = process.env.MOO_DIFF_BASE || DIFF_LADDER;

/** Quantas chaves de revistos guardar. Um ficheiro que cresce para sempre acaba por ser o problema. */
const MAX_REVISTOS = 5000;
// Segundo parecer: outro modelo LOCAL, de LINHAGEM DIFERENTE do primario. Dois
// modelos da mesma familia partilham os mesmos erros — o par so vale se
// divergirem. Vazio ou ausente desliga a escalada; continua tudo a $0.
const SECOND_MODEL = process.env.MOO_SECOND_MODEL || 'gpt-oss:20b';

const SLEEP_MIN_S = 15;
const SLEEP_MAX_S = 30;
const IDLE_SLEEP_S = 5;

const log = (msg) => process.stdout.write(`[moo-runner] ${msg}\n`);
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/**
 * Que repo conduzir, onde guardar o seu estado, e com que pilares.
 *
 * Tudo o que decide o alvo passa por aqui, para que um teste possa perguntar
 * "com estes argumentos e este ambiente, que projecto sai?" sem levantar nada.
 */
export function resolverAlvo({ argv = [], env = process.env, cwd = process.cwd(), mooDir = MOO_DIR } = {}) {
  const { root, fonte, chave } = resolveRepoRoot({ argv, env, cwd, scriptRoot: SCRIPT_ROOT });
  const paths = projectPaths({ repoRoot: root, mooDir, canonicalRoot: SCRIPT_ROOT });
  const pilares = loadPillars(root);
  return { repoRoot: root, fonte, chave, paths, pilares };
}

/**
 * O alvo por omissao: sem argumentos, so ambiente e cwd. Exportado para os
 * testes e para o `launch.mjs` saberem onde o loop escreve.
 */
export const PATHS = (() => {
  try {
    const { paths, repoRoot } = resolverAlvo({ argv: [] });
    return { ...paths, MOO_DIR, REPO_ROOT: repoRoot };
  } catch {
    // Uma env apontada a um repo que nao existe nao pode impedir o modulo de
    // carregar — rebenta no `main()`, onde ha quem leia a mensagem.
    const paths = projectPaths({ repoRoot: SCRIPT_ROOT, mooDir: MOO_DIR, canonicalRoot: SCRIPT_ROOT });
    return { ...paths, MOO_DIR, REPO_ROOT: SCRIPT_ROOT };
  }
})();

/** Fail-closed: an unusable home directory means we never dispatch. */
function assertHome(base, logImpl = log) {
  try {
    fs.mkdirSync(base, { recursive: true });
    fs.accessSync(base, fs.constants.W_OK);
  } catch {
    logImpl(`${base} inacessivel — fail-closed, nao arranca.`);
    process.exit(1);
  }
}

/** Refuses to start beside a live runner; a stale lock (dead PID) is reclaimed. */
function claimLock(lockPath, logImpl = log) {
  try {
    const pid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        logImpl(`ja ha um runner vivo (PID ${pid}). Saio.`);
        process.exit(0);
      } catch {
        logImpl(`lock orfao do PID ${pid} — reclamado.`);
      }
    }
  } catch {
    /* no lock yet */
  }
  fs.writeFileSync(lockPath, String(process.pid));
}

function releaseLock(lockPath) {
  try {
    if (Number(fs.readFileSync(lockPath, 'utf8').trim()) === process.pid) fs.rmSync(lockPath, { force: true });
  } catch {
    /* nothing to release */
  }
}

/** An unreadable or unknown focus is no focus — never a crash, never a guess. */
function readFocus(focusPath, ids) {
  try {
    const { pilar } = JSON.parse(fs.readFileSync(focusPath, 'utf8'));
    return ids.includes(pilar) ? pilar : null;
  } catch {
    return null;
  }
}

function readCursor(cursorPath) {
  try {
    const c = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
    return Number.isInteger(c.i) ? c.i : 0;
  } catch {
    return 0;
  }
}

function writeCursor(cursorPath, i) {
  try {
    fs.writeFileSync(cursorPath, JSON.stringify({ i }));
  } catch {
    /* the cursor is an optimisation, never a blocker */
  }
}

/** Le as chaves ja julgadas. Ilegivel = conjunto vazio: remoer e mau, parar e pior. */
function readRevistos(p) {
  try {
    const v = JSON.parse(fs.readFileSync(p, 'utf8'));
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeRevistos(p, set) {
  try {
    const arr = [...set];
    fs.writeFileSync(p, JSON.stringify(arr.slice(Math.max(0, arr.length - MAX_REVISTOS))));
  } catch {
    /* memoria de trabalho, nunca um bloqueador */
  }
}

function appendReceipt(ledgerPath, receipt) {
  fs.appendFileSync(ledgerPath, `${JSON.stringify(receipt)}\n`);
}

/**
 * Publishes this device's beacon so other machines' cockpits can see it. The
 * loop is the right writer because it is the thing that actually works — an
 * endpoint that is up while the loop is dead must not keep the beacon warm.
 * Failures are logged once and never block a round.
 */
let beaconWarned = false;
async function publishBeacon({ repoRoot, paths, engineAlive = true, logImpl = log } = {}) {
  try {
    const [gpu, alignment] = await Promise.all([
      sampleGpu(),
      buildAlignment({ repoRoot }).catch(() => null),
    ]);
    const state = buildFleetState({
      device: deviceName(),
      ledgerPath: paths.LEDGER,
      statePath: paths.STATE,
      stopFile: paths.STOP_FILE,
      gpu,
      alignment,
      // Era `true` fixo: o beacon jurava motor vivo durante as 11 horas em que
      // ele esteve morto. Um sinal que nao pode dizer "nao" nao e sinal.
      engineAlive,
    });
    const where = beaconDir();
    const res = writeBeacon(state, where);
    if (!res.ok && !beaconWarned) {
      beaconWarned = true;
      logImpl(`beacon nao escrito (${res.erro}) — a frota nao vera este device.`);
    }
  } catch (err) {
    if (!beaconWarned) {
      beaconWarned = true;
      logImpl(`beacon falhou: ${String(err && err.message).slice(0, 100)}`);
    }
  }
}

/**
 * O ciclo. Tudo o que toca no mundo entra por parametro com o default real, para
 * que um teste possa levantar o loop inteiro sem GPU, sem rede e sem relogio.
 * `maxRounds` existe so para os testes; em producao e Infinity.
 */
export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  runRoundImpl = runRound,
  sleepImpl = sleep,
  publishBeaconImpl = publishBeacon,
  appendReceiptImpl = appendReceipt,
  nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  maxRounds = Infinity,
  logImpl = log,
} = {}) {
  const args = new Set(argv);
  const { repoRoot, fonte, chave, paths, pilares } = resolverAlvo({ argv, env, cwd });
  assertHome(paths.base, logImpl);

  // The owner's explicit gesture is the ONLY thing that lifts a STOP.
  if (args.has('--play')) {
    fs.rmSync(paths.STOP_FILE, { force: true });
    logImpl('--play explicito: STOP levantado pelo dono.');
  }

  claimLock(paths.LOCK, logImpl);
  const soltar = () => releaseLock(paths.LOCK);
  process.on('exit', soltar);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      logImpl(`${sig} — a sair limpo.`);
      soltar();
      process.exit(0);
    });
  }

  const ids = pilares.ids;
  logImpl(`arranque ${new Date().toISOString()} — motor ${DEFAULT_OLLAMA} — $0 duro.`);
  // A linha que ja imprimia `repo ${REPO_ROOT}` dizia sempre o mesmo repo,
  // fosse qual fosse. Agora diz o repo E de onde veio a decisao.
  logImpl(`repo ${repoRoot} (via ${fonte}${chave ? `:${chave}` : ''}) · estado em ${paths.base}${paths.canonico ? ' (canonico)' : ''}`);
  logImpl(`pilares ${ids.join(',')} (${pilares.fonte}) · modelo ${DEFAULT_MODEL}`);
  // Nunca engolir em silencio: um pilares.json presente e recusado tem de doer.
  if (pilares.erro) logImpl(`AVISO ${pilares.erro} — a correr com os pilares embutidos.`);
  if (fs.existsSync(paths.STOP_FILE)) logImpl('STOP presente a arrancar — fica parado ate /play.');

  let i = readCursor(paths.CURSOR);
  const once = args.has('--once');
  // O disjuntor guarda o estado do motor entre rondas. Ver engine-breaker.mjs:
  // 1767 recibos de um apagao de 11 horas foi o que custou nao o ter.
  const breaker = createEngineBreaker();
  const revistos = readRevistos(paths.REVISTOS);
  logImpl(`ja julgados ${revistos.size} excertos — nao voltam a fila enquanto nao mudarem`);
  let rondas = 0;

  // Uma reserva activa nao e um STOP: e alguem a precisar da maquina por um
  // bocado. Nao se grava recibo, nao se conta ronda, nao se acusa ninguem — e
  // quando o prazo passa, o loop volta sozinho. Ver reserva.mjs para o porque
  // de o STOP nao servir aqui.
  let reservaAvisada = null;

  for (;;) {
    if (rondas >= maxRounds) return { rondas, breaker: breaker.estado, repoRoot, paths };

    const res = verReserva(paths.base);
    if (res.activa) {
      // Diz-se UMA vez por reserva. Um log por ronda durante duas horas e a
      // mesma inundacao que o disjuntor existe para travar, noutro sitio.
      if (reservaAvisada !== res.reserva.desde) {
        reservaAvisada = res.reserva.desde;
        logImpl(`cedo a maquina — ${res.motivo} · ate ${res.reserva.ate}`);
      }
      await sleepImpl(esperaS(res.faltaS));
      // Conta como volta do ciclo, tal como o ramo do STOP ao lado. Sem isto o
      // `maxRounds` nunca chegava e o loop ficava preso — em producao passava
      // despercebido (o sleep e real), mas um teste com sleep instantaneo gira
      // para sempre. Um ramo que nao conta e um ramo que nao se consegue testar.
      rondas += 1;
      if (once) return { rondas, breaker: breaker.estado, repoRoot, paths };
      continue;
    }
    if (reservaAvisada) {
      logImpl(`reserva terminada (${res.motivo}) — volto ao trabalho.`);
      reservaAvisada = null;
    }

    if (fs.existsSync(paths.STOP_FILE)) {
      await sleepImpl(IDLE_SLEEP_S);
      rondas += 1;
      if (once) return { rondas, breaker: breaker.estado, repoRoot, paths };
      continue;
    }

    // A focus set from the cockpit pins the rotation to one pillar; clearing it
    // resumes the round robin. Read every round so the button takes effect on
    // the next one instead of at the next restart.
    const focus = readFocus(paths.FOCUS, ids);
    const pillar = focus || nextPillar(i, ids);
    const cursor = Math.floor(i / ids.length);
    fs.writeFileSync(
      paths.STATE,
      JSON.stringify({
        device: deviceName(),
        repo: repoRoot,
        pilar_atual: pillar,
        foco: focus,
        modelo: DEFAULT_MODEL,
        ts: Math.floor(Date.now() / 1000),
      }),
    );

    let receipt;
    try {
      ({ receipt } = await runRoundImpl({
        repoRoot,
        repoSha: repoSha(repoRoot),
        pillar,
        pillars: pilares.pillars,
        cursor,
        model: DEFAULT_MODEL,
        endpoint: DEFAULT_OLLAMA,
        stopFile: paths.STOP_FILE,
        anchorPath: paths.ANCORA,
        diffBase: DIFF_BASE,
        revistos,
        secondModel: SECOND_MODEL,
      }));
    } catch (err) {
      // A crash must still leave a trace: a silent gap in the ledger is the one
      // thing that would make the cockpit lie about what happened.
      receipt = {
        ts: nowIso(),
        pilar: pillar,
        repo: repoRoot,
        modelo: DEFAULT_MODEL,
        usd: 0,
        dur_s: 0,
        tokens_out: 0,
        verdict: 'sem-citacao',
        // Sem esta bandeira, uma ronda que REBENTA escapava ao disjuntor: 12
        // crashes seguidos escreviam 12 recibos sem backoff nenhum — a mesma
        // inundacao que o B8 existe para travar, por outra porta.
        falha_ronda: true,
        resultado_resumo: `ronda rebentou: ${String(err && err.message).slice(0, 160)}`,
        evidencia: 'n/d',
      };
    }

    // So conta como julgado quando o motor REALMENTE respondeu: marcar um
    // excerto como visto por causa de um apagao perdia-o para sempre.
    if (receipt.motor_ok === true && receipt.chave) {
      revistos.add(receipt.chave);
      writeRevistos(paths.REVISTOS, revistos);
    }

    const motorFalhou = Boolean(receipt.falha_motor);
    const { recibos, backoffS, aberto } = breaker.observe(receipt, nowIso());
    for (const r of recibos) appendReceiptImpl(paths.LEDGER, r);

    // O cursor anda SEMPRE. A versao anterior so o avancava quando o motor
    // respondia — "uma ronda que nao chegou ao motor nao gastou o alvo" — e
    // isso encravava o runner para sempre: como `pillar` e `cursor` derivam
    // ambos de `i`, congelar `i` congela tambem o pilar. Medido: 30 rondas
    // com HTTP 404 (motor VIVO, modelo em falta) deram 1 alvo, 3 recibos e
    // cursor nunca escrito. Um device novo, sem o modelo puxado, ficava mudo.
    // Os alvos reciclam por modulo, por isso andar durante um apagao nao perde
    // trabalho nenhum.
    i += 1;
    writeCursor(paths.CURSOR, i);
    await publishBeaconImpl({ repoRoot, paths, engineAlive: !motorFalhou, logImpl });

    if (motorFalhou) {
      // O stdout nao e o ledger: aqui podemos falar. O que nao se pode e
      // escrever 1767 linhas de apagao no registo do trabalho feito.
      logImpl(
        `motor em baixo (${breaker.estado.falhas} seguidas desde ${breaker.estado.inicio}) · ` +
          `${aberto ? 'disjuntor ABERTO, ledger em silencio' : 'ainda a registar'} · espera ${backoffS}s`,
      );
    } else {
      logImpl(
        `${pillar} ${receipt.verdict} · ${receipt.dur_s}s · ${receipt.tokens_out} tok · $0 · ` +
          `${String(receipt.evidencia).slice(0, 90)}`,
      );
    }

    rondas += 1;
    if (once) return { rondas, breaker: breaker.estado, repoRoot, paths };
    await sleepImpl(backoffS || SLEEP_MIN_S + Math.floor(Math.random() * (SLEEP_MAX_S - SLEEP_MIN_S + 1)));
  }
}

/**
 * O guard que faltava. Sem ele, `import './moo-runner.mjs'` arrancava o loop
 * perpetuo dentro do processo de teste — por isso nenhum teste o importava, e
 * por isso o ciclo era a UNICA parte do runner sem cobertura nenhuma. Um TDZ
 * no modo diff passou 161 testes e rebentou todas as rondas em producao.
 */
export const invocadoComoPrograma = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invocadoComoPrograma) {
  main().catch((err) => {
    log(`fatal: ${err && err.stack}`);
    releaseLock(PATHS.LOCK);
    process.exit(1);
  });
}
