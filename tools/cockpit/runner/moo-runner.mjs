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
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runRound, nextPillar, DEFAULT_MODEL, DEFAULT_OLLAMA } from './runner-core.mjs';
import { PILLAR_IDS } from './context-pack.mjs';
import { buildFleetState } from './fleet-state.mjs';
import { sampleGpu } from './gpu-sampler.mjs';
import { beaconDir, writeBeacon, deviceName } from './fleet-beacon.mjs';
import { buildAlignment } from './alignment.mjs';

const HOME = os.homedir();
const MOO_DIR = process.env.MOOTER_HOME || path.join(HOME, '.mooter');
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

const STOP_FILE = path.join(MOO_DIR, 'STOP');
const LEDGER = path.join(MOO_DIR, 'runner-ledger.jsonl');
const STATE = path.join(MOO_DIR, 'runner-state.json');
const LOCK = path.join(MOO_DIR, 'runner.lock');
const CURSOR = path.join(MOO_DIR, 'runner-cursor.json');
const FOCUS = path.join(MOO_DIR, 'runner-focus.json');

const SLEEP_MIN_S = 15;
const SLEEP_MAX_S = 30;
const IDLE_SLEEP_S = 5;

const log = (msg) => process.stdout.write(`[moo-runner] ${msg}\n`);
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** Fail-closed: an unusable home directory means we never dispatch. */
function assertHome() {
  try {
    fs.mkdirSync(MOO_DIR, { recursive: true });
    fs.accessSync(MOO_DIR, fs.constants.W_OK);
  } catch {
    log(`${MOO_DIR} inacessivel — fail-closed, nao arranca.`);
    process.exit(1);
  }
}

/** Refuses to start beside a live runner; a stale lock (dead PID) is reclaimed. */
function claimLock() {
  try {
    const pid = Number(fs.readFileSync(LOCK, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        log(`ja ha um runner vivo (PID ${pid}). Saio.`);
        process.exit(0);
      } catch {
        log(`lock orfao do PID ${pid} — reclamado.`);
      }
    }
  } catch {
    /* no lock yet */
  }
  fs.writeFileSync(LOCK, String(process.pid));
}

function releaseLock() {
  try {
    if (Number(fs.readFileSync(LOCK, 'utf8').trim()) === process.pid) fs.rmSync(LOCK, { force: true });
  } catch {
    /* nothing to release */
  }
}

/** An unreadable or unknown focus is no focus — never a crash, never a guess. */
function readFocus() {
  try {
    const { pilar } = JSON.parse(fs.readFileSync(FOCUS, 'utf8'));
    return PILLAR_IDS.includes(pilar) ? pilar : null;
  } catch {
    return null;
  }
}

function readCursor() {
  try {
    const c = JSON.parse(fs.readFileSync(CURSOR, 'utf8'));
    return Number.isInteger(c.i) ? c.i : 0;
  } catch {
    return 0;
  }
}

function writeCursor(i) {
  try {
    fs.writeFileSync(CURSOR, JSON.stringify({ i }));
  } catch {
    /* the cursor is an optimisation, never a blocker */
  }
}

function appendReceipt(receipt) {
  fs.appendFileSync(LEDGER, `${JSON.stringify(receipt)}\n`);
}

/**
 * Publishes this device's beacon so other machines' cockpits can see it. The
 * loop is the right writer because it is the thing that actually works — an
 * endpoint that is up while the loop is dead must not keep the beacon warm.
 * Failures are logged once and never block a round.
 */
let beaconWarned = false;
async function publishBeacon() {
  try {
    const [gpu, alignment] = await Promise.all([
      sampleGpu(),
      buildAlignment({ repoRoot: REPO_ROOT }).catch(() => null),
    ]);
    const state = buildFleetState({
      device: deviceName(),
      ledgerPath: LEDGER,
      statePath: STATE,
      stopFile: STOP_FILE,
      gpu,
      alignment,
      engineAlive: true,
    });
    const where = beaconDir();
    const res = writeBeacon(state, where);
    if (!res.ok && !beaconWarned) {
      beaconWarned = true;
      log(`beacon nao escrito (${res.erro}) — a frota nao vera este device.`);
    }
  } catch (err) {
    if (!beaconWarned) {
      beaconWarned = true;
      log(`beacon falhou: ${String(err && err.message).slice(0, 100)}`);
    }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  assertHome();

  // The owner's explicit gesture is the ONLY thing that lifts a STOP.
  if (args.has('--play')) {
    fs.rmSync(STOP_FILE, { force: true });
    log('--play explicito: STOP levantado pelo dono.');
  }

  claimLock();
  process.on('exit', releaseLock);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      log(`${sig} — a sair limpo.`);
      releaseLock();
      process.exit(0);
    });
  }

  log(`arranque ${new Date().toISOString()} — motor ${DEFAULT_OLLAMA} — $0 duro.`);
  log(`repo ${REPO_ROOT} · pilares ${PILLAR_IDS.join(',')} · modelo ${DEFAULT_MODEL}`);
  if (fs.existsSync(STOP_FILE)) log('STOP presente a arrancar — fica parado ate /play.');

  let i = readCursor();
  const once = args.has('--once');

  for (;;) {
    if (fs.existsSync(STOP_FILE)) {
      await sleep(IDLE_SLEEP_S);
      if (once) return;
      continue;
    }

    // A focus set from the cockpit pins the rotation to one pillar; clearing it
    // resumes the round robin. Read every round so the button takes effect on
    // the next one instead of at the next restart.
    const focus = readFocus();
    const pillar = focus || nextPillar(i, PILLAR_IDS);
    const cursor = Math.floor(i / PILLAR_IDS.length);
    fs.writeFileSync(
      STATE,
      JSON.stringify({
        device: deviceName(),
        pilar_atual: pillar,
        foco: focus,
        modelo: DEFAULT_MODEL,
        ts: Math.floor(Date.now() / 1000),
      }),
    );

    let receipt;
    try {
      ({ receipt } = await runRound({
        repoRoot: REPO_ROOT,
        pillar,
        cursor,
        model: DEFAULT_MODEL,
        endpoint: DEFAULT_OLLAMA,
        stopFile: STOP_FILE,
      }));
    } catch (err) {
      // A crash must still leave a trace: a silent gap in the ledger is the one
      // thing that would make the cockpit lie about what happened.
      receipt = {
        ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        pilar: pillar,
        modelo: DEFAULT_MODEL,
        usd: 0,
        dur_s: 0,
        tokens_out: 0,
        verdict: 'sem-citacao',
        resultado_resumo: `ronda rebentou: ${String(err && err.message).slice(0, 160)}`,
        evidencia: 'n/d',
      };
    }

    appendReceipt(receipt);
    i += 1;
    writeCursor(i);
    await publishBeacon();
    log(
      `${pillar} ${receipt.verdict} · ${receipt.dur_s}s · ${receipt.tokens_out} tok · $0 · ` +
        `${String(receipt.evidencia).slice(0, 90)}`,
    );

    if (once) return;
    await sleep(SLEEP_MIN_S + Math.floor(Math.random() * (SLEEP_MAX_S - SLEEP_MIN_S + 1)));
  }
}

main().catch((err) => {
  log(`fatal: ${err && err.stack}`);
  releaseLock();
  process.exit(1);
});
