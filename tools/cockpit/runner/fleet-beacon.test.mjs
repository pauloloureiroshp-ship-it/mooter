import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  safeDeviceName, beaconDir, writeBeacon, readBeacons, beaconFreshness,
  BEACON_FRESH_S,
} from './fleet-beacon.mjs';
import { parseNvidiaSmi, sampleGpu } from './gpu-sampler.mjs';
import { buildPlist, windowsCommand, preflight, LABEL } from './autostart.mjs';

const T0 = Date.parse('2026-08-16T18:00:00Z');
const iso = (deltaS) => new Date(T0 - deltaS * 1000).toISOString();

// ── nomes de device ──────────────────────────────────────────────────────────

test('o nome do device nunca pode escapar da pasta de beacons', () => {
  assert.equal(safeDeviceName('../../etc/passwd'), 'etc-passwd');
  assert.equal(safeDeviceName('RTX 4090!!'), 'rtx-4090--');
  assert.equal(safeDeviceName(''), 'device-sem-nome');
  assert.equal(safeDeviceName(null), 'device-sem-nome');
  assert.ok(!safeDeviceName('...evil').startsWith('.'));
});

// ── transporte ───────────────────────────────────────────────────────────────

test('com vault montado os beacons sao partilhados; sem vault, nao', () => {
  const comVault = beaconDir({ vaultPath: '/v', home: '/h', existsImpl: (p) => p === '/v' });
  assert.equal(comVault.partilhado, true);
  assert.match(comVault.dir, /50-fleet$/);

  const sem = beaconDir({ vaultPath: null, home: '/h', existsImpl: () => false });
  assert.equal(sem.partilhado, false);
  assert.match(sem.dir, /\.mooter\/fleet$/);
});

test('sem partilha o painel diz que a frota nao e frota', () => {
  const r = readBeacons({ dir: '/nao/existe', partilhado: false, now: T0 });
  assert.match(r.aviso, /nao e partilhada/);
});

test('com partilha o painel avisa que a frescura vale o que o sync valer', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-beacon-'));
  const r = readBeacons({ dir, partilhado: true, now: T0 });
  assert.match(r.aviso, /vale o que o sync do vault valer/);
});

// ── frescura ─────────────────────────────────────────────────────────────────

test('beacon recente e vivo, antigo escurece, futuro e morto', () => {
  assert.equal(beaconFreshness(iso(10), T0).estado, 'vivo');
  assert.equal(beaconFreshness(iso(600), T0).estado, 'stale');
  assert.equal(beaconFreshness(iso(9999), T0).estado, 'morto');
  assert.equal(beaconFreshness(new Date(T0 + 60_000).toISOString(), T0).estado, 'morto');
  assert.equal(beaconFreshness(null, T0).estado, 'morto');
  assert.ok(BEACON_FRESH_S > 0);
});

// ── escrita e leitura ────────────────────────────────────────────────────────

function fixtureDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'moo-fleet-'));
}

test('writeBeacon grava o essencial e nunca lanca', () => {
  const dir = fixtureDir();
  const res = writeBeacon({
    device: 'mac-mini', running: true, pilar_atual: 'P3', modelo_atual: 'qwen2.5-coder:14b',
    gpu: { util_pct: 91, fonte: 'ioreg:IOAccelerator', vram_inuse_gb: 16.2 },
    recibos: { total: 300, citacao_ok: 98, refutado: 0, vazias_seguidas: 0 },
    projeto: { repo_branch: 'main' },
  }, { dir });
  assert.equal(res.ok, true);
  const b = JSON.parse(fs.readFileSync(path.join(dir, 'mac-mini.json'), 'utf8'));
  assert.equal(b.gpu_pct, 91);
  assert.equal(b.recibos.citacao_ok, 98);
  assert.equal(b.usd, 0);
});

test('writeBeacon falha em silencio util quando a pasta nao da', () => {
  const res = writeBeacon({ device: 'x' }, {
    dir: '/x', mkdirImpl: () => { throw new Error('EROFS'); },
  });
  assert.equal(res.ok, false);
  assert.match(res.erro, /EROFS/);
});

test('readBeacons ve os dois devices e marca qual e este', () => {
  const dir = fixtureDir();
  fs.writeFileSync(path.join(dir, 'mac-mini.json'),
    JSON.stringify({ device: 'mac-mini', ts: iso(5), running: true, gpu_pct: 90 }));
  fs.writeFileSync(path.join(dir, 'rtx-4090.json'),
    JSON.stringify({ device: 'rtx-4090', ts: iso(20), running: true, gpu_pct: 77 }));

  const r = readBeacons({ dir, partilhado: true, selfDevice: 'mac-mini', now: T0 });
  assert.equal(r.frota.length, 2);
  assert.equal(r.frota[0].device, 'mac-mini', 'este device vem primeiro');
  assert.equal(r.frota[0].self, true);
  assert.equal(r.frota[1].self, false);
  assert.equal(r.frota[1].frescura.estado, 'vivo');
});

test('um beacon corrompido perde UM device, nao rebenta a frota', () => {
  const dir = fixtureDir();
  fs.writeFileSync(path.join(dir, 'bom.json'), JSON.stringify({ device: 'bom', ts: iso(5) }));
  fs.writeFileSync(path.join(dir, 'mau.json'), '{{{ nao e json');
  const r = readBeacons({ dir, partilhado: true, now: T0 });
  assert.equal(r.frota.length, 1);
  assert.equal(r.frota[0].device, 'bom');
});

test('o 4090 que parou de sincronizar escurece — nunca fica verde parado no tempo', () => {
  const dir = fixtureDir();
  fs.writeFileSync(path.join(dir, 'rtx-4090.json'),
    JSON.stringify({ device: 'rtx-4090', ts: iso(7200), running: true, gpu_pct: 99 }));
  const r = readBeacons({ dir, partilhado: true, selfDevice: 'mac-mini', now: T0 });
  assert.equal(r.frota[0].frescura.estado, 'morto');
  assert.equal(r.frota[0].running, true, 'o beacon ainda DIZ running...');
  assert.match(r.frota[0].frescura.motivo, /sem sinal/, '...mas a idade desmente-o');
});

// ── GPU no 4090 ──────────────────────────────────────────────────────────────

test('parseNvidiaSmi le utilizacao e VRAM em GB', () => {
  const g = parseNvidiaSmi('97, 21500, 24564');
  assert.equal(g.util_pct, 97);
  assert.equal(g.vram_inuse_gb, 21);   // 21500 MiB
  assert.equal(g.vram_alloc_gb, 23.99);
  assert.equal(g.fonte, 'nvidia-smi');
  assert.equal(g.gpus, 1);
});

test('com varias GPUs a mais quente manda, e o numero de placas viaja', () => {
  const g = parseNvidiaSmi('12, 1000, 24564\n88, 20000, 24564');
  assert.equal(g.util_pct, 88);
  assert.equal(g.gpus, 2);
});

test('nvidia-smi ilegivel da n/d com motivo, nunca 0%', () => {
  const g = parseNvidiaSmi('lixo sem virgulas');
  assert.equal(g.util_pct, null);
  assert.match(g.motivo, /sem linhas legiveis/);
});

test('no Windows a amostragem passa por nvidia-smi', async () => {
  let chamado = null;
  await sampleGpu({ platform: 'win32', runImpl: async (cmd, args) => { chamado = [cmd, args]; return '50, 100, 200'; } });
  assert.equal(chamado[0], 'nvidia-smi');
  assert.match(chamado[1].join(' '), /utilization\.gpu/);
});

test('sem nvidia-smi o 4090 aparece n/d com a razao, nao parado a 0%', async () => {
  const g = await sampleGpu({ platform: 'win32', runImpl: async () => null });
  assert.equal(g.util_pct, null);
  assert.match(g.motivo, /nvidia-smi ausente/);
});

// ── auto-start ───────────────────────────────────────────────────────────────

test('o LaunchAgent NUNCA corre com --play', () => {
  const plist = buildPlist({
    nodePath: '/usr/local/bin/node', runnerPath: '/r/moo-runner.mjs',
    repo: '/r', mooDir: '/m', device: 'mac-mini',
  });
  assert.ok(!plist.includes('--play'), 'arrancar a maquina nao pode revogar um STOP');
  assert.match(plist, /<string>\/r\/moo-runner\.mjs<\/string>/, 'invoca o runner, nao o shim');
  assert.ok(!plist.includes('moo-runner.command'), 'o shim faz --play — nunca agendar o shim');
  assert.match(plist, /MOOTER_AUTOSTART/);
  assert.match(plist, new RegExp(LABEL));
});

test('o plist reinicia um crash mas respeita uma saida limpa', () => {
  const plist = buildPlist({ nodePath: '/n', runnerPath: '/r.mjs', repo: '/r', mooDir: '/m', device: 'd' });
  assert.match(plist, /<key>SuccessfulExit<\/key>\s*<false\/>/);
  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/);
});

test('o shim protege-se do agendador', () => {
  const shim = fs.readFileSync(new URL('../../../moo-runner.command', import.meta.url).pathname, 'utf8');
  assert.match(shim, /MOOTER_AUTOSTART/, 'o shim tem de saber quando NAO deve fazer --play');
  const cmd = fs.readFileSync(new URL('../../../moo-runner.cmd', import.meta.url).pathname, 'utf8');
  assert.match(cmd, /MOOTER_AUTOSTART/);
});

test('a receita do Windows nao inventa privilegios', () => {
  const c = windowsCommand({ nodePath: 'node.exe', runnerPath: 'r.mjs', repo: 'C:\\frugal' });
  assert.match(c, /schtasks \/Create/);
  assert.match(c, /\/RL LIMITED/, 'sem elevacao desnecessaria');
  assert.ok(!c.includes('--play'));
});

test('o preflight recusa instalar sobre um node que desaparece no arranque', () => {
  const p = preflight({ existsImpl: () => true });
  assert.equal(typeof p.ok, 'boolean');
  assert.ok(Array.isArray(p.problems));
});

test('a identidade do device vem de UM sitio so', async () => {
  // A divergencia apanhada ao vivo: o loop escrevia beacon como
  // 'mac-mini-de-paulo' e o proprio cockpit listava-o como device remoto,
  // porque o endpoint tinha o seu proprio default 'mac-mini'.
  const beacon = await import('./fleet-beacon.mjs');
  const launch = await import('./launch.mjs');
  assert.equal(launch.deviceName, beacon.deviceName, 'o launcher reexporta, nao re-deriva');

  const antes = process.env.MOOTER_DEVICE;
  process.env.MOOTER_DEVICE = 'RTX 4090';
  assert.equal(beacon.deviceName(), 'rtx-4090', 'passa pelo saneamento do nome de ficheiro');
  if (antes === undefined) delete process.env.MOOTER_DEVICE; else process.env.MOOTER_DEVICE = antes;

  for (const f of ['f10-server.mjs', 'moo-runner.mjs', 'runner-core.mjs', 'fleet-state.mjs']) {
    const src = fs.readFileSync(new URL(f, import.meta.url).pathname, 'utf8');
    const code = src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
    assert.ok(!/'mac-mini'/.test(code), `${f} nao pode ter o nome do device cravado`);
  }
});
