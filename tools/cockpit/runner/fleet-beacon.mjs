/**
 * fleet-beacon.mjs — how devices see each other without listening on the LAN.
 *
 * The obvious design is to bind the F10 endpoint to 0.0.0.0 and have each panel
 * poll the others. That throws away the loopback guarantee this runner was just
 * hardened around: a control endpoint reachable from the network is a remote
 * kill-switch, and no amount of Origin checking fixes a listening socket on a
 * shared wifi.
 *
 * So devices never talk to each other. Each one WRITES a small beacon into a
 * directory both machines already share (the vault, or a local folder when the
 * vault is not mounted), and each panel READS whatever beacons it finds.
 *
 * The honest consequence, which the payload states rather than hides: a beacon
 * is only as fresh as whatever syncs that directory. If the vault syncs by git,
 * "the 4090 is working" means "the 4090 was working as of its last push". The
 * cockpit therefore renders cross-device rows with their own age and its own
 * word for it — never the same green as the device you are standing at.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Beyond this a beacon says nothing useful about right now. */
export const BEACON_FRESH_S = 120;
export const BEACON_STALE_S = 1800;
const MAX_BEACONS = 24;

/**
 * The ONE place this machine gets its name.
 *
 * It used to be derived in three: the launcher from the hostname, the loop from
 * `MOOTER_DEVICE || 'mac-mini'`, the endpoint from its own `'mac-mini'` default.
 * The result showed up live — the mac wrote a beacon as `mac-mini-de-paulo` and
 * its own cockpit failed to recognise it as itself, listing the local machine
 * as if it were a remote one. Identity derived in more than one place is
 * identity that will diverge.
 */
export function deviceName() {
  return safeDeviceName(
    process.env.MOOTER_DEVICE || os.hostname().replace(/\.local$/i, ''),
  );
}

/** Filenames are device names, so they must not be able to escape the folder. */
export function safeDeviceName(name) {
  const clean = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 48);
  return clean || 'device-sem-nome';
}

/**
 * Where beacons live. The vault is preferred because it is the channel that
 * already crosses machines; the local fallback keeps a single-device setup
 * working without pretending it has a fleet.
 */
export function beaconDir({ vaultPath = process.env.VAULT_PATH, home = os.homedir(),
                            existsImpl = fs.existsSync } = {}) {
  const vault = vaultPath || (home ? path.join(home, 'paulo-vault') : null);
  if (vault && existsImpl(vault)) {
    return { dir: path.join(vault, '50-fleet'), transporte: 'vault', partilhado: true };
  }
  return { dir: path.join(home || '.', '.mooter', 'fleet'), transporte: 'local', partilhado: false };
}

/** Writes this device's beacon. Never throws — a beacon is telemetry, not work. */
export function writeBeacon(state, { dir, writeImpl = fs.writeFileSync, mkdirImpl = fs.mkdirSync } = {}) {
  const device = safeDeviceName(state && state.device);
  try {
    mkdirImpl(dir, { recursive: true });
    const beacon = {
      device,
      ts: new Date().toISOString(),
      plataforma: os.platform(),
      running: Boolean(state && state.running),
      pilar_atual: (state && state.pilar_atual) ?? null,
      modelo: (state && state.modelo_atual) ?? null,
      // `buildFleetState` ja calculava `engine`, mas o beacon montava um
      // objecto de chaves fixas onde ele nao constava: a correccao de
      // "deixar de jurar motor vivo" morria antes de chegar ao disco, e a
      // frota via um device em apagao como se estivesse a trabalhar.
      engine: (state && state.engine) ?? null,
      gpu_pct: state && state.gpu ? state.gpu.util_pct : null,
      gpu_fonte: state && state.gpu ? state.gpu.fonte : 'n/d',
      vram_gb: state && state.gpu ? state.gpu.vram_inuse_gb : null,
      recibos: state && state.recibos
        ? { total: state.recibos.total, citacao_ok: state.recibos.citacao_ok,
            refutado: state.recibos.refutado, vazias_seguidas: state.recibos.vazias_seguidas }
        : null,
      branch: state && state.projeto ? state.projeto.repo_branch : null,
      usd: 0,
    };
    writeImpl(path.join(dir, `${device}.json`), JSON.stringify(beacon, null, 2));
    return { ok: true, device };
  } catch (err) {
    return { ok: false, erro: String(err && err.message).slice(0, 120) };
  }
}

/**
 * Age of a beacon, in the same three-state vocabulary the local device uses —
 * but computed against the beacon's own timestamp, so a device that stopped
 * syncing goes dark instead of freezing green.
 */
export function beaconFreshness(ts, nowMs) {
  const t = ts ? Date.parse(ts) : NaN;
  if (!Number.isFinite(t)) return { estado: 'morto', idade_s: null, motivo: 'sem timestamp' };
  const raw = Math.round((nowMs - t) / 1000);
  if (raw < -5) return { estado: 'morto', idade_s: null, motivo: 'beacon datado no futuro' };
  const age = Math.max(0, raw);
  if (age <= BEACON_FRESH_S) return { estado: 'vivo', idade_s: age, motivo: null };
  if (age <= BEACON_STALE_S) return { estado: 'stale', idade_s: age, motivo: `sem sinal ha ${age}s` };
  return { estado: 'morto', idade_s: age, motivo: `sem sinal ha ${age}s` };
}

/**
 * Reads every beacon in the directory.
 *
 * @returns {{frota: Array, transporte: string, partilhado: boolean, aviso: string|null}}
 */
export function readBeacons({
  dir, transporte = 'local', partilhado = false, selfDevice = null, now = Date.now(),
  readdirImpl = fs.readdirSync, readImpl = fs.readFileSync,
} = {}) {
  let names = [];
  try {
    names = readdirImpl(dir).filter((n) => n.endsWith('.json')).slice(0, MAX_BEACONS);
  } catch {
    return {
      frota: [], transporte, partilhado,
      aviso: partilhado
        ? 'pasta de beacons ilegivel — a frota nao pode ser mostrada'
        : 'sem vault montado — so este device escreve aqui, a frota nao e partilhada',
    };
  }

  const frota = [];
  for (const name of names) {
    let b;
    try {
      b = JSON.parse(String(readImpl(path.join(dir, name), 'utf8')));
    } catch {
      continue; // a corrupt beacon is one missing device, never a broken payload
    }
    if (!b || typeof b !== 'object' || !b.device) continue;
    frota.push({
      ...b,
      self: safeDeviceName(b.device) === safeDeviceName(selfDevice),
      frescura: beaconFreshness(b.ts, now),
    });
  }
  frota.sort((a, b) => (a.self === b.self ? String(a.device).localeCompare(b.device) : a.self ? -1 : 1));

  return {
    frota,
    transporte,
    partilhado,
    // Stated, not implied: without a shared directory the "fleet" is one machine.
    aviso: partilhado
      ? 'a frescura de outros devices vale o que o sync do vault valer'
      : 'sem vault montado — so este device escreve aqui, a frota nao e partilhada',
  };
}
