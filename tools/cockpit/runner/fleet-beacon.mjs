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
import { versaoDoConector, repoSha } from './project.mjs';
import { verConector } from './self-check.mjs';

/**
 * PARIDADE — o que cada device leva no beacon para que a frota se compare.
 *
 * Medido a 2026-08-21 em dois devices: conector 1.49.3 nos dois por
 * `mooter_setup`, mas o registo do Claude Desktop do Mac ainda dizia 1.33.0;
 * o PC com o cockpit em codigo de outra manha; o vault num path diferente em
 * cada maquina. Nada disto era visivel de um device para o outro — cada
 * cockpit so conhecia o seu umbigo. Isto poe os factos no beacon; o painel
 * compara com o proprio e acusa a diferenca. Tudo lido do disco, nada
 * adivinhado: o que nao se consegue ler vai `null`, nunca um valor bonito.
 */
export function medirParidade({ repoRoot, vaultDir = null, readImpl = fs.readFileSync, shaImpl = repoSha } = {}) {
  if (!repoRoot) return null;
  let plugin = null;
  try {
    const p = JSON.parse(String(readImpl(path.join(repoRoot, 'plugin', 'mooter', '.claude-plugin', 'plugin.json'), 'utf8')));
    plugin = typeof p.version === 'string' ? p.version : null;
  } catch { /* sem plugin no repo: null diz isso */ }
  let conector_instalado = null;
  try {
    const c = verConector(repoRoot, { readImpl });
    // 'ok' => valor e a versao; 'mau' => "X instalado ≠ Y no repo"; 'n/d' => registo ilegivel
    if (c.estado === 'ok') conector_instalado = c.valor;
    else if (c.estado === 'mau') conector_instalado = String(c.valor).split(' ')[0];
  } catch { /* fica null */ }
  let sha = null;
  try { sha = shaImpl(repoRoot); } catch { /* fica null */ }
  return {
    conector_repo: versaoDoConector(repoRoot, { readImpl }),
    conector_instalado,
    plugin,
    repo_sha: sha,
    repo_path: repoRoot,
    vault_path: vaultDir,
  };
}

/** Beyond this a beacon says nothing useful about right now. */
export const BEACON_FRESH_S = 120;
export const BEACON_STALE_S = 1800;
/**
 * Um device REMOTO só chega aqui pelo sync do vault: o outro lado publica de
 * 10 em 10 min (MINUTOS_OMISSAO do beacon-publisher) e este lado só o vê quando
 * ele próprio puxa, também de 10 em 10 min. Dois ciclos é a idade NORMAL de um
 * beacon remoto saudável, não um alarme. Medido a 2026-08-21: o Mac publicava
 * certinho a cada 10 min e o painel do PC dizia "sem sinal ha 716s" — com o
 * limiar de 120 s um device remoto NUNCA ficava verde, nem a funcionar bem.
 * O device local continua a responder a BEACON_FRESH_S: esse não tem desculpa.
 */
export const BEACON_FRESH_REMOTO_S = 2 * 10 * 60;
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
      // `recibos.total` e a contagem da JANELA lida, nao o tamanho do ledger.
      // Sem isto, a frota mostrava 5000 para um device com 6569 recibos, e
      // chamava-lhe total. O calculo ja existia em fleet-state; faltava viajar.
      ledger: state && state.ledger ? state.ledger : null,
      // Quantos achados esperam decisao neste device. E o que permite ver o
      // gargalo da frota — sem isto, todos os devices parecem igualmente uteis.
      triagem: state && state.triagem
        ? { achados: state.triagem.achados, por_triar: state.triagem.por_triar }
        : null,
      // Um device que CEDEU a maquina nao esta avariado. Sem este campo, uma
      // reserva activa era indistinguivel de um loop morto.
      reserva: state && state.reserva ? state.reserva : null,
      branch: state && state.projeto ? state.projeto.repo_branch : null,
      // O que este device leva para a frota se comparar (ver medirParidade).
      // O chamador mede e poe em `state.paridade`; aqui so viaja.
      paridade: state && state.paridade && typeof state.paridade === 'object' ? state.paridade : null,
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
export function beaconFreshness(ts, nowMs, { remoto = false } = {}) {
  const t = ts ? Date.parse(ts) : NaN;
  if (!Number.isFinite(t)) return { estado: 'morto', idade_s: null, motivo: 'sem timestamp' };
  const raw = Math.round((nowMs - t) / 1000);
  if (raw < -5) return { estado: 'morto', idade_s: null, motivo: 'beacon datado no futuro' };
  const age = Math.max(0, raw);
  const fresco = remoto ? BEACON_FRESH_REMOTO_S : BEACON_FRESH_S;
  if (age <= fresco) return { estado: 'vivo', idade_s: age, motivo: null };
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
  // Beacons lidos do REMOTO do vault (`origin/<branch>:50-fleet/*.json`), por
  // nome de ficheiro. Sao uma camada por cima do disco: se o remoto tiver um
  // beacon mais novo do que o ficheiro local, vale o remoto. Assim a frescura
  // de outro device deixa de esperar pelo `pull` deste lado — so pelo `fetch`,
  // que nao toca na arvore de trabalho nem no indice de ninguem.
  remotos = null,
} = {}) {
  let names = [];
  try {
    names = readdirImpl(dir).filter((n) => n.endsWith('.json'));
    if (remotos) {
      for (const n of Object.keys(remotos)) if (n.endsWith('.json') && !names.includes(n)) names.push(n);
    }
    names = names.slice(0, MAX_BEACONS);
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
    let b = null;
    try {
      b = JSON.parse(String(readImpl(path.join(dir, name), 'utf8')));
    } catch {
      b = null; // a corrupt beacon is one missing device, never a broken payload
    }
    const doFicheiro = safeDeviceName(name.replace(/\.json$/, ''));
    const eSelf = doFicheiro === safeDeviceName(selfDevice);
    // O proprio device NUNCA se le do remoto: o que ele escreveu no disco e a
    // verdade mais fresca que existe sobre ele. Os outros, se o remoto tiver
    // um `ts` mais novo, e o remoto que conta.
    const r = !eSelf && remotos ? remotos[name] : null;
    if (r && typeof r === 'object' && r.device) {
      const tsLocal = b && typeof b.ts === 'string' ? Date.parse(b.ts) : NaN;
      const tsRemoto = typeof r.ts === 'string' ? Date.parse(r.ts) : NaN;
      if (!b || (Number.isFinite(tsRemoto) && !(tsLocal >= tsRemoto))) b = r;
    }
    if (!b || typeof b !== 'object' || !b.device) continue;
    // `{...b}` copiava TODAS as chaves de TODOS os ficheiros `.json` desta
    // pasta para o `/fleet.json` servido por HTTP. A escrita (writeBeacon)
    // monta um objecto de chaves NOMEADAS de proposito — uma allowlist — e a
    // leitura deitava essa disciplina fora. Qualquer ficheiro que alguem
    // largasse em `50-fleet/` era publicado inteiro.
    //
    // O nome do FICHEIRO e a identidade, nao o campo `device` la dentro: um
    // beacon podia dizer que era outra maquina e roubar-lhe o lugar de `self`.
    frota.push({
      device: safeDeviceName(b.device),
      ts: typeof b.ts === 'string' ? b.ts : null,
      plataforma: typeof b.plataforma === 'string' ? b.plataforma : null,
      running: Boolean(b.running),
      pilar_atual: typeof b.pilar_atual === 'string' ? b.pilar_atual : null,
      modelo: typeof b.modelo === 'string' ? b.modelo : null,
      engine: typeof b.engine === 'string' ? b.engine : null,
      gpu_pct: typeof b.gpu_pct === 'number' ? b.gpu_pct : null,
      gpu_fonte: typeof b.gpu_fonte === 'string' ? b.gpu_fonte : null,
      vram_gb: typeof b.vram_gb === 'number' ? b.vram_gb : null,
      recibos: b.recibos && typeof b.recibos === 'object' ? b.recibos : null,
      ledger: b.ledger && typeof b.ledger === 'object' ? b.ledger : null,
      triagem: b.triagem && typeof b.triagem === 'object' ? b.triagem : null,
      reserva: b.reserva && typeof b.reserva === 'object' ? b.reserva : null,
      branch: typeof b.branch === 'string' ? b.branch : null,
      paridade: b.paridade && typeof b.paridade === 'object' ? {
        conector_repo: typeof b.paridade.conector_repo === 'string' ? b.paridade.conector_repo : null,
        conector_instalado: typeof b.paridade.conector_instalado === 'string' ? b.paridade.conector_instalado : null,
        plugin: typeof b.paridade.plugin === 'string' ? b.paridade.plugin : null,
        repo_sha: typeof b.paridade.repo_sha === 'string' ? b.paridade.repo_sha : null,
        repo_path: typeof b.paridade.repo_path === 'string' ? b.paridade.repo_path : null,
        vault_path: typeof b.paridade.vault_path === 'string' ? b.paridade.vault_path : null,
      } : null,
      usd: typeof b.usd === 'number' ? b.usd : 0,
      self: eSelf,
      // Um device remoto e julgado pela cadencia com que pode chegar aqui,
      // nao pela do relogio local. Ver BEACON_FRESH_REMOTO_S.
      frescura: beaconFreshness(b.ts, now, { remoto: !eSelf }),
      // De onde veio o que se mostra: 'disco' (o ficheiro neste vault) ou
      // 'origin' (o remoto tinha um beacon mais novo). Dito, nao escondido.
      via: b === r ? 'origin' : 'disco',
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
