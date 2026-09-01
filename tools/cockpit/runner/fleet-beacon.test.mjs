import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  safeDeviceName, beaconDir, writeBeacon, readBeacons, beaconFreshness, naTuaMao,
  medirParidade, proximoSeq,
  BEACON_FRESH_S, BEACON_FRESH_REMOTO_S, BEACON_STALE_S,
} from './fleet-beacon.mjs';
import { MINUTOS_OMISSAO } from './beacon-publisher.mjs';
import { parseNvidiaSmi, sampleGpu, normalizaSonda } from './gpu-sampler.mjs';
import { buildPlist, windowsCommand, preflight, LABEL } from './autostart.mjs';

import { createRequire } from 'node:module';
const requireT = createRequire(import.meta.url);
const assinaturaMod = requireT('../../router/assinatura.js');

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
  assert.match(sem.dir.split(path.sep).join('/'), /\.mooter\/fleet$/);
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

// Incidente de 2026-08-21: o Mac publicava de 10 em 10 min e o painel do PC
// dizia "sem sinal ha 716s". Um device REMOTO e julgado pela cadencia do sync,
// nao pelo relogio local — senao nunca fica verde, nem a funcionar bem.
test('um device REMOTO com a idade normal do sync e vivo; o local com a mesma idade nao', () => {
  assert.equal(BEACON_FRESH_REMOTO_S, 2 * MINUTOS_OMISSAO * 60,
    'dois ciclos de publicacao — a constante segue a cadencia real, nao um numero bonito');
  assert.ok(BEACON_FRESH_REMOTO_S > BEACON_FRESH_S && BEACON_FRESH_REMOTO_S < BEACON_STALE_S);
  assert.equal(beaconFreshness(iso(716), T0, { remoto: true }).estado, 'vivo');
  assert.equal(beaconFreshness(iso(716), T0).estado, 'stale', 'o device local nao tem desculpa');
  assert.equal(beaconFreshness(iso(1500), T0, { remoto: true }).estado, 'stale');
  assert.equal(beaconFreshness(iso(7200), T0, { remoto: true }).estado, 'morto');
});

test('readBeacons julga o self pelo limiar local e os outros pelo remoto', () => {
  const dir = fixtureDir();
  fs.writeFileSync(path.join(dir, 'mac-mini.json'),
    JSON.stringify({ device: 'mac-mini', ts: iso(716), running: true }));
  fs.writeFileSync(path.join(dir, 'rtx-4090.json'),
    JSON.stringify({ device: 'rtx-4090', ts: iso(716), running: true }));
  const { frota } = readBeacons({ dir, partilhado: true, selfDevice: 'mac-mini', now: T0 });
  const self = frota.find((d) => d.self);
  const outro = frota.find((d) => !d.self);
  assert.equal(self.frescura.estado, 'stale');
  assert.equal(outro.frescura.estado, 'vivo');
});

// ── paridade ─────────────────────────────────────────────────────────────────
// 2026-08-21: dois devices, cockpits em commits diferentes e o vault em paths
// diferentes — e nenhum painel conseguia dizer isso do outro.

test('medirParidade le do disco e diz null ao que nao consegue ler — nunca inventa', () => {
  const ficheiros = {
    '/r/plugin/mooter/.claude-plugin/plugin.json': JSON.stringify({ version: '1.49.3' }),
  };
  const readImpl = (p2) => {
    const k = String(p2).split(path.sep).join('/');
    if (k in ficheiros) return ficheiros[k];
    throw new Error('ENOENT ' + k);
  };
  const par = medirParidade({ repoRoot: '/r', vaultDir: '/v', readImpl, shaImpl: () => 'abc123def456' });
  assert.equal(par.plugin, '1.49.3');
  assert.equal(par.repo_sha, 'abc123def456');
  assert.equal(par.repo_path, '/r');
  assert.equal(par.vault_path, '/v');

  // Sem plugin no checkout e sem sha legivel: null nos dois, nunca um palpite.
  const vazio = medirParidade({
    repoRoot: '/r', readImpl: () => { throw new Error('ENOENT'); }, shaImpl: () => null,
  });
  assert.equal(vazio.plugin, null);
  assert.equal(vazio.repo_sha, null);
  assert.equal(vazio.vault_path, null);

  assert.equal(medirParidade({ repoRoot: null }), null, 'sem repo nao ha paridade a medir');
  assert.equal(medirParidade({ repoRoot: '/r', shaImpl: () => { throw new Error('boom'); }, readImpl: () => { throw new Error('x'); } }).repo_sha, null,
    'um shaImpl que rebenta nao pode rebentar a ronda');
});

test('a paridade viaja no beacon e volta pela mesma allowlist', () => {
  const dir = fixtureDir();
  const paridade = {
    plugin: '1.49.3', repo_sha: '70597e5e1234', repo_path: '/r', vault_path: '/v',
    segredo: 'nao', usd: 999,
  };
  const w = writeBeacon({ device: 'mac-mini', running: true, paridade }, { dir });
  assert.equal(w.ok, true);
  const { frota } = readBeacons({ dir, selfDevice: 'mac-mini', now: Date.now() });
  assert.equal(frota[0].paridade.plugin, '1.49.3');
  assert.equal(frota[0].paridade.repo_sha, '70597e5e1234');
  assert.equal(frota[0].paridade.vault_path, '/v');
  assert.ok(!('segredo' in frota[0].paridade), 'a leitura so deixa passar as chaves nomeadas');
  assert.ok(!('usd' in frota[0].paridade));

  fs.writeFileSync(path.join(dir, 'antigo.json'),
    JSON.stringify({ device: 'antigo', ts: new Date().toISOString() }));
  const r2 = readBeacons({ dir, selfDevice: 'mac-mini', now: Date.now() });
  assert.equal(r2.frota.find((d) => d.device === 'antigo').paridade, null,
    'beacon anterior ao campo: null, e o painel diz-o — nunca um valor inventado');
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
  assert.match(g.motivo, /no readable lines/);
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
  // A forma legada (`null` seco) nao carrega motivo nenhum. O sampler diz
  // exactamente isso — nao inventa uma causa para preencher o campo.
  assert.match(g.motivo, /motivo nao reportado/);
});

/**
 * O defeito que este teste tranca: o `resolve(err ? null : ...)` antigo
 * colapsava "o binario nao existe", "a maquina esta sob carga" e "respondeu
 * lixo" no mesmo `null`, e o painel traduzia os tres para
 * `non-NVIDIA GPU?`. Uma RTX 4090 numa maquina ocupada era publicada a frota
 * como maquina sem GPU — o sintoma acusava a plataforma em vez do sistema.
 */
test('a sonda que falha diz PORQUE falhou — carga nunca vira "sem GPU"', async () => {
  const semPath = await sampleGpu({
    platform: 'win32',
    runImpl: async () => ({ out: null, motivo: 'nvidia-smi nao esta no PATH deste processo' }),
  });
  assert.equal(semPath.util_pct, null);
  assert.match(semPath.motivo, /nao esta no PATH/);

  const lenta = await sampleGpu({
    platform: 'win32',
    runImpl: async () => ({ out: null, motivo: 'nvidia-smi nao respondeu em 4000ms — a maquina pode estar sob carga; isto NAO prova ausencia de GPU' }),
  });
  assert.match(lenta.motivo, /sob carga/);
  assert.match(lenta.motivo, /NAO prova ausencia de GPU/);
  assert.doesNotMatch(lenta.motivo, /non-NVIDIA/);
});

test('normalizaSonda aceita as tres formas sem perder o motivo', () => {
  assert.deepEqual(normalizaSonda(null), { out: null, motivo: null });
  assert.deepEqual(normalizaSonda('50, 100, 200'), { out: '50, 100, 200', motivo: null });
  assert.deepEqual(normalizaSonda({ out: null, motivo: 'x' }), { out: null, motivo: 'x' });
  // O sucesso continua a devolver stdout: quem injecta `runImpl` nos testes
  // antigos nao teve de mudar uma linha.
  assert.deepEqual(normalizaSonda({ out: '1, 2, 3' }), { out: '1, 2, 3', motivo: null });
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
  const shim = fs.readFileSync(fileURLToPath(new URL('../../../moo-runner.command', import.meta.url)), 'utf8');
  assert.match(shim, /MOOTER_AUTOSTART/, 'o shim tem de saber quando NAO deve fazer --play');
  const cmd = fs.readFileSync(fileURLToPath(new URL('../../../moo-runner.cmd', import.meta.url)), 'utf8');
  assert.match(cmd, /MOOTER_AUTOSTART/);
});

test('a receita do Windows nao inventa privilegios', () => {
  const c = windowsCommand({ nodePath: 'node.exe', runnerPath: 'r.mjs', repo: 'C:\\mooter' });
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
    const src = fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
    const code = src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
    assert.ok(!/'mac-mini'/.test(code), `${f} nao pode ter o nome do device cravado`);
  }
});

test('FASE 0: o beacon LE com a mesma allowlist com que ESCREVE', () => {
  // `frota.push({...b})` copiava TODAS as chaves de TODOS os ficheiros `.json`
  // da pasta para o `/fleet.json` servido por HTTP. A escrita monta um objecto
  // de chaves NOMEADAS de proposito; a leitura deitava essa disciplina fora.
  // Basta alguem largar um ficheiro naquela pasta para ele ser publicado.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-beacon-'));
  fs.writeFileSync(path.join(dir, 'intruso.json'), JSON.stringify({
    device: 'intruso',
    segredo: 'ISTO-NAO-PODE-SAIR',
    token: 'sk-nao-publicar',
    caminho_absoluto: '/Users/alguem/privado',
  }));
  const { frota } = readBeacons({ dir, selfDevice: 'outro' });
  assert.equal(frota.length, 1);
  const publicado = Object.keys(frota[0]);
  for (const proibida of ['segredo', 'token', 'caminho_absoluto']) {
    assert.ok(!publicado.includes(proibida), `${proibida} foi publicado no payload`);
  }
  assert.ok(publicado.includes('device') && publicado.includes('frescura'));
});

test('FASE 0: a identidade e o NOME DO FICHEIRO, nao o campo la dentro', () => {
  // Um beacon podia declarar-se outra maquina e roubar-lhe o lugar de `self`.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-beacon2-'));
  fs.writeFileSync(path.join(dir, 'impostor.json'), JSON.stringify({ device: 'mac-do-paulo', ts: new Date().toISOString() }));
  const { frota } = readBeacons({ dir, selfDevice: 'mac-do-paulo' });
  assert.equal(frota[0].self, false, 'o ficheiro chama-se impostor.json — nao e este device');
});

// ── ONDA 1a · o canal deixa de acreditar em tudo ─────────────────────────────
//
// Ate aqui qualquer processo com escrita em `50-fleet/` inventava um device ou
// reescrevia o custo de outra maquina, e o painel publicava. Estes testes sao o
// GATE da Onda 1a; o modulo em si tem cobertura propria em
// `tools/router/assinatura.test.js`.

const CHAVE_T = Buffer.alloc(assinaturaMod.KEY_BYTES, 3);
const chaveFalsa = () => ({ chave: CHAVE_T, caminho: '/t/.owner.key', fonte: 'vault', partilhado: true, criada: false, erro: null });
const semChave = () => ({ chave: null, caminho: '/t/.owner.key', fonte: 'local', partilhado: false, criada: false, erro: 'sem vault' });

test('ONDA 1a · o beacon escrito vem assinado, e diz que a chave e partilhada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-sig-'));
  const r = writeBeacon({ device: 'pc-paulo', running: true }, { dir, chaveImpl: chaveFalsa });
  assert.equal(r.ok, true);
  assert.equal(r.assinado, true);
  assert.equal(r.chave_partilhada, true);

  const escrito = JSON.parse(fs.readFileSync(path.join(dir, 'pc-paulo.json'), 'utf8'));
  assert.equal(escrito.sig.alg, assinaturaMod.ALG_TAG);
  assert.match(escrito.sig.mac, /^[0-9a-f]{64}$/);
  assert.ok(escrito.sig.nonce, 'sem nonce nao ha anti-replay possivel');
});

test('ONDA 1a · GATE: um beacon ADULTERADO e rejeitado, COM RECIBO', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-sig2-'));
  writeBeacon({ device: 'pc-paulo', running: true }, { dir, chaveImpl: chaveFalsa });

  // O ataque concreto: reescrever o ficheiro no vault mantendo a assinatura.
  const p = path.join(dir, 'pc-paulo.json');
  const forjado = JSON.parse(fs.readFileSync(p, 'utf8'));
  forjado.usd = 999.99;
  forjado.running = false;
  fs.writeFileSync(p, JSON.stringify(forjado));

  const r = readBeacons({ dir, selfDevice: 'pc-paulo', chaveImpl: chaveFalsa });

  assert.equal(r.frota.length, 0, 'um beacon forjado NAO pode aparecer no painel');
  assert.equal(r.rejeitados.length, 1, 'e nao pode desaparecer em silencio: tem de deixar recibo');
  const recibo = r.rejeitados[0];
  assert.equal(recibo.device, 'pc-paulo');
  assert.equal(recibo.codigo, 'adulterado');
  assert.equal(recibo.motivo, 'assinatura nao bate com o conteudo');
  assert.equal(recibo.ficheiro, 'pc-paulo.json');
});

test('ONDA 1a · escrever e ler de volta sem mexer PASSA', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-sig3-'));
  writeBeacon({ device: 'pc-paulo', running: true, gpu: { util_pct: 61, fonte: 'nvidia-smi', vram_inuse_gb: 12 } },
    { dir, chaveImpl: chaveFalsa });
  const r = readBeacons({ dir, selfDevice: 'pc-paulo', chaveImpl: chaveFalsa });
  assert.equal(r.rejeitados.length, 0);
  assert.equal(r.frota.length, 1);
  assert.equal(r.frota[0].autenticidade.ok, true, 'o caminho feliz tem de continuar a funcionar');
  // Ate 2026-08-24 este teste exigia `prova_frota: true` com UM device — fixava
  // a propria mentira que o campo contava. Um device que se verifica a si
  // proprio nao prova frota; prova um solitario.
  assert.equal(r.autenticacao.prova_frota, false, 'um device sozinho nao e uma frota');
  assert.equal(r.autenticacao.devices_verificados, 1);
  assert.match(r.autenticacao.porque, /uma maquina sozinha nao prova frota/);
});

test('ONDA 1a · um beacon NAO assinado entra, mas marcado — nao e uma forja', () => {
  // No dia do upgrade os beacons ja no vault sao todos sem assinatura. Recusa-los
  // apagaria a frota do painel. O que se recusa e quem AFIRMA assinatura e falha.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-sig4-'));
  fs.writeFileSync(path.join(dir, 'mac-antigo.json'),
    JSON.stringify({ device: 'mac-antigo', ts: new Date().toISOString() }));
  const r = readBeacons({ dir, selfDevice: 'pc', chaveImpl: chaveFalsa });
  assert.equal(r.frota.length, 1);
  assert.equal(r.rejeitados.length, 0);
  assert.equal(r.frota[0].autenticidade.ok, false);
  assert.equal(r.frota[0].autenticidade.codigo, 'nao-assinado');
});

test('ONDA 1a · sem chave, o painel NAO diz que a frota esta autenticada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-sig5-'));
  const w = writeBeacon({ device: 'pc-paulo' }, { dir, chaveImpl: semChave });
  assert.equal(w.assinado, false, 'nunca se escreve um beacon a fingir que esta assinado');
  assert.match(w.porque_nao_assinado, /sem vault/);

  const r = readBeacons({ dir, selfDevice: 'pc-paulo', chaveImpl: semChave });
  assert.equal(r.autenticacao.chave, 'n/d');
  assert.equal(r.autenticacao.prova_frota, false);
  assert.match(r.autenticacao.porque, /sem vault|sem chave/);
});

test('ONDA 1a · chave LOCAL nao pode ser vendida como prova de frota', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-sig6-'));
  const soLocal = () => ({ chave: CHAVE_T, caminho: '/h/.mooter/owner.key', fonte: 'local', partilhado: false, criada: false, erro: null });
  writeBeacon({ device: 'pc-paulo' }, { dir, chaveImpl: soLocal });
  const r = readBeacons({ dir, selfDevice: 'pc-paulo', chaveImpl: soLocal });
  assert.equal(r.frota[0].autenticidade.ok, true, 'assina e verifica na mesma');
  assert.equal(r.autenticacao.prova_frota, false, 'mas NAO prova origem, so integridade do ficheiro');
  assert.match(r.autenticacao.porque, /nao a origem/);
});

test('ONDA 1a · a assinatura de um device NAO valida o ficheiro de outro', () => {
  // Copiar o beacon assinado do PC para `mac.json` nao pode ressuscitar o Mac.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-sig7-'));
  writeBeacon({ device: 'pc-paulo', running: true }, { dir, chaveImpl: chaveFalsa });
  const original = fs.readFileSync(path.join(dir, 'pc-paulo.json'), 'utf8');
  const copia = JSON.parse(original);
  copia.device = 'mac-do-paulo';                 // renomear o campo parte o MAC
  fs.writeFileSync(path.join(dir, 'mac-do-paulo.json'), JSON.stringify(copia));

  const r = readBeacons({ dir, selfDevice: 'pc-paulo', chaveImpl: chaveFalsa });
  assert.equal(r.frota.length, 1, 'so o PC real sobrevive');
  assert.equal(r.frota[0].device, 'pc-paulo');
  assert.equal(r.rejeitados.length, 1);
  assert.equal(r.rejeitados[0].codigo, 'adulterado');
});

// ── ONDA 1c · paridade: o alerta do Mac tem de ver-se do PC ──────────────────
//
// GATE: o Mac acusa 1.33.0 com instrucao de 1 clique, VISTO DO PC.

test('ONDA 1c · a versao do conector viaja no beacon (facto, nao juizo)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-conn-'));
  writeBeacon({ device: 'mac-do-paulo', conector: { instalado: '1.33.0', repo: '1.49.3' } },
    { dir, chaveImpl: chaveFalsa });
  const escrito = JSON.parse(fs.readFileSync(path.join(dir, 'mac-do-paulo.json'), 'utf8'));
  assert.deepEqual(escrito.conector, { instalado: '1.33.0', repo: '1.49.3' });
  // e sobrevive a leitura, que tem allowlist:
  const { frota } = readBeacons({ dir, selfDevice: 'pc-paulo', chaveImpl: chaveFalsa });
  assert.deepEqual(frota[0].conector, { instalado: '1.33.0', repo: '1.49.3' });
});

test('ONDA 1c · GATE: do PC ve-se o Mac em 1.33.0, com instrucao de 1 clique', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-conn2-'));
  // O PC, em dia.
  writeBeacon({ device: 'pc-paulo', conector: { instalado: '1.49.3', repo: '1.49.3' } },
    { dir, chaveImpl: chaveFalsa });
  // O Mac, dezasseis versoes atras — o caso real medido a 2026-08-19.
  writeBeacon({ device: 'mac-do-paulo', conector: { instalado: '1.33.0', repo: '1.49.3' } },
    { dir, chaveImpl: chaveFalsa });

  const r = readBeacons({ dir, selfDevice: 'pc-paulo', chaveImpl: chaveFalsa });
  const itens = naTuaMao(r.frota, { rejeitados: r.rejeitados });

  assert.equal(itens.length, 1, 'o PC em dia nao ocupa a lista; so o Mac');
  const it = itens[0];
  assert.equal(it.device, 'mac-do-paulo');
  assert.equal(it.estado, 'mau');
  assert.match(it.titulo, /1\.33\.0 instalado ≠ 1\.49\.3 no repo/);
  assert.ok(it.accao && it.accao.includes('mac-do-paulo'),
    'a instrucao tem de dizer EM QUE MAQUINA — e isso que a torna accionavel com dois computadores');
  assert.match(it.comando, /mooter-1\.49\.3\.mcpb/);
  assert.equal(it.passos.length, 3, 'um clique tem de caber em passos contaveis');
});

test('ONDA 1c · um device sem versao declarada NAO conta como em dia', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-conn3-'));
  writeBeacon({ device: 'antigo' }, { dir, chaveImpl: chaveFalsa });   // sem conector
  const r = readBeacons({ dir, selfDevice: 'pc', chaveImpl: chaveFalsa });
  const itens = naTuaMao(r.frota, { rejeitados: r.rejeitados });
  assert.equal(itens.length, 1);
  assert.equal(itens[0].estado, 'n/d', 'silencio nao pode virar "esta bem"');
  assert.equal(itens[0].accao, null, 'e n/d nao inventa um comando');
});

test('ONDA 1c · um beacon RECUSADO tambem chega a mao do dono', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-conn4-'));
  writeBeacon({ device: 'pc-paulo', conector: { instalado: '1.49.3', repo: '1.49.3' } },
    { dir, chaveImpl: chaveFalsa });
  const p = path.join(dir, 'pc-paulo.json');
  const forj = JSON.parse(fs.readFileSync(p, 'utf8'));
  forj.usd = 42;
  fs.writeFileSync(p, JSON.stringify(forj));

  const r = readBeacons({ dir, selfDevice: 'pc-paulo', chaveImpl: chaveFalsa });
  const itens = naTuaMao(r.frota, { rejeitados: r.rejeitados });
  const recusado = itens.find((i) => i.id === 'beacon-recusado');
  assert.ok(recusado, 'um beacon forjado nao pode sair da lista de rejeitados e desaparecer');
  assert.equal(recusado.estado, 'mau');
  assert.match(recusado.titulo, /adulterado/);
});

test('ONDA 1c · frota toda em dia devolve lista VAZIA (nao ruido)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-conn5-'));
  for (const d of ['pc-paulo', 'mac-do-paulo']) {
    writeBeacon({ device: d, conector: { instalado: '1.49.3', repo: '1.49.3' } }, { dir, chaveImpl: chaveFalsa });
  }
  const r = readBeacons({ dir, selfDevice: 'pc-paulo', chaveImpl: chaveFalsa });
  assert.deepEqual(naTuaMao(r.frota, { rejeitados: r.rejeitados }), []);
});

// ── ONDA 1d · beacons do REMOTO: a camada por cima do disco ──────────────────
//
// O `fleet-remoto.mjs` traz os beacons de `origin/<branch>:50-fleet/*.json`.
// O que ele traz NAO tem estatuto especial nenhum: entra por `remotos` e passa
// exactamente pelas mesmas regras — assinatura, allowlist de campos, e o nome
// do FICHEIRO como identidade. Estes testes sao o contrato dessa fronteira.
//
// Assina-se aqui a mao em vez de usar `writeBeacon` porque o `writeBeacon`
// carimba `ts: new Date()` e ignora o que se lhe passe — e todo este merge se
// decide precisamente pelo `ts`.

/** Um beacon assinado com o `ts` que o teste quiser. */
const assinadoCom = (device, ts, extra = {}) =>
  assinaturaMod.assinado({ device, running: true, ts, ...extra }, { chave: CHAVE_T, ts });

/** O mesmo, mas pousado no disco como o publicador o teria deixado. */
const noDisco = (dir, device, ts, extra = {}) => {
  const b = assinadoCom(device, ts, extra);
  fs.writeFileSync(path.join(dir, `${device}.json`), JSON.stringify(b));
  return b;
};

const pasta = (nome) => fs.mkdtempSync(path.join(os.tmpdir(), `moo-${nome}-`));

test('ONDA 1d · o remoto MAIS NOVO ganha ao disco, e diz que veio do remoto', () => {
  const dir = pasta('rem1');
  noDisco(dir, 'mac-mini', iso(10));
  noDisco(dir, 'pc-paulo', iso(900));                 // velho, no disco
  const novo = assinadoCom('pc-paulo', iso(30));      // fresco, so no remoto

  const r = readBeacons({
    dir, partilhado: true, selfDevice: 'mac-mini', now: T0,
    chaveImpl: chaveFalsa, remotos: { 'pc-paulo.json': novo },
  });
  const pc = r.frota.find((d) => d.device === 'pc-paulo');
  assert.equal(r.rejeitados.length, 0);
  assert.equal(pc.ts, novo.ts, 'o painel tem de mostrar o beacon mais novo');
  assert.equal(pc.via, 'remoto');
  assert.equal(pc.frescura.estado, 'vivo', 'era isto que dizia "sem sinal ha 716s"');
});

test('ONDA 1d · o disco MAIS NOVO ganha ao remoto — e em empate ganha o disco', () => {
  const dir = pasta('rem2');
  const local = noDisco(dir, 'pc-paulo', iso(30));
  const velho = assinadoCom('pc-paulo', iso(900));

  const r = readBeacons({
    dir, partilhado: true, selfDevice: 'mac-mini', now: T0,
    chaveImpl: chaveFalsa, remotos: { 'pc-paulo.json': velho },
  });
  assert.equal(r.frota.find((d) => d.device === 'pc-paulo').via, 'disco');

  // Empate de `ts`: o disco ja foi aceite por este device, nao se troca.
  const empate = readBeacons({
    dir, partilhado: true, selfDevice: 'mac-mini', now: T0,
    chaveImpl: chaveFalsa, remotos: { 'pc-paulo.json': assinadoCom('pc-paulo', local.ts) },
  });
  assert.equal(empate.frota.find((d) => d.device === 'pc-paulo').via, 'disco');
});

test('ONDA 1d · o PROPRIO device nunca se le do remoto, por mais novo que ele diga ser', () => {
  const dir = pasta('rem3');
  const meu = noDisco(dir, 'mac-mini', iso(300));
  const doRemoto = assinadoCom('mac-mini', iso(1));

  const r = readBeacons({
    dir, partilhado: true, selfDevice: 'mac-mini', now: T0,
    chaveImpl: chaveFalsa, remotos: { 'mac-mini.json': doRemoto },
  });
  const self = r.frota.find((d) => d.self);
  assert.equal(self.via, 'disco', 'o que este device escreveu e a verdade mais fresca sobre ele');
  assert.equal(self.ts, meu.ts);
});

test('ONDA 1d · um device que ainda NAO chegou a este disco aparece na mesma', () => {
  const dir = pasta('rem4');
  noDisco(dir, 'mac-mini', iso(10));
  const estreante = assinadoCom('rtx-4090', iso(20));

  const r = readBeacons({
    dir, partilhado: true, selfDevice: 'mac-mini', now: T0,
    chaveImpl: chaveFalsa, remotos: { 'rtx-4090.json': estreante },
  });
  assert.equal(r.frota.length, 2, 'nunca houve pull, mas o device existe');
  assert.equal(r.frota.find((d) => d.device === 'rtx-4090').via, 'remoto');
});

test('ONDA 1d · GATE: um beacon FORJADO no remoto e rejeitado, com o mesmo recibo', () => {
  const dir = pasta('rem5');
  noDisco(dir, 'mac-mini', iso(10));
  const forjado = assinadoCom('pc-paulo', iso(5));
  forjado.usd = 999.99; // assinatura mantida, conteudo mexido depois de assinar

  const r = readBeacons({
    dir, partilhado: true, selfDevice: 'mac-mini', now: T0,
    chaveImpl: chaveFalsa, remotos: { 'pc-paulo.json': forjado },
  });
  assert.equal(r.frota.find((d) => d.device === 'pc-paulo'), undefined,
    'vir do remoto NAO e um atalho de confianca');
  assert.equal(r.rejeitados.length, 1, 'e nao pode desaparecer em silencio');
  assert.equal(r.rejeitados[0].codigo, 'adulterado');
  assert.equal(r.rejeitados[0].device, 'pc-paulo');
});

test('ONDA 1d · o nome do FICHEIRO continua a mandar: o remoto nao rouba o lugar de self', () => {
  const dir = pasta('rem6');
  noDisco(dir, 'mac-mini', iso(10));
  // Um beacon que AFIRMA ser o mac-mini, entregue no ficheiro do pc-paulo.
  const impostor = assinadoCom('mac-mini', iso(1));

  const r = readBeacons({
    dir, partilhado: true, selfDevice: 'mac-mini', now: T0,
    chaveImpl: chaveFalsa, remotos: { 'pc-paulo.json': impostor },
  });
  assert.equal(r.frota.filter((d) => d.self).length, 1, 'so pode haver um self');
  assert.equal(r.frota.find((d) => d.self).ts, iso(10), 'e e o do ficheiro do proprio');
});

test('ONDA 1d · com o remoto ligado o aviso deixa de falar em sync, e fala em fetch', () => {
  const dir = pasta('rem7');
  assert.match(readBeacons({ dir, partilhado: true, now: T0 }).aviso,
    /vale o que o sync do vault valer/);
  assert.match(readBeacons({ dir, partilhado: true, now: T0, remotos: {} }).aviso,
    /vale o que o fetch do vault valer/);
});

// ── ONDA 1e · `prova_frota` medida, nao presumida ────────────────────────────
//
// Ate 2026-08-24 era `Boolean(chave && k.partilhado)`, e `partilhado` so queria
// dizer "o ficheiro da chave esta debaixo do vault". A `.owner.key` cai no
// `*.key` do .gitignore do vault, portanto nunca viajou: cada device gerou a
// sua. O painel dizia `prova_frota: true` com duas chaves diferentes e um dos
// devices recusado como forja.

const CHAVE_B = Buffer.alloc(32, 0xb1);
const outraChave = () => ({ chave: CHAVE_B, caminho: '/t/.owner.key', fonte: 'vault', partilhado: true, criada: false, erro: null });

test('ONDA 1e · dois devices com a MESMA chave provam a frota', () => {
  const dir = pasta('prova1');
  writeBeacon({ device: 'mac-mini', running: true }, { dir, chaveImpl: chaveFalsa });
  writeBeacon({ device: 'pc-paulo', running: true }, { dir, chaveImpl: chaveFalsa });

  const r = readBeacons({ dir, partilhado: true, selfDevice: 'mac-mini', chaveImpl: chaveFalsa });
  assert.equal(r.autenticacao.devices_verificados, 2);
  assert.equal(r.autenticacao.prova_frota, true);
  assert.equal(r.autenticacao.porque, null);
  assert.equal(r.autenticacao.resolver, null, 'sem nada por resolver, nao se pede gesto nenhum');
  assert.deepEqual(r.autenticacao.devices_por_enrolar, []);
});

test('ONDA 1e · GATE: chaves DIFERENTES nao provam frota, e dizem porque', () => {
  const dir = pasta('prova2');
  writeBeacon({ device: 'mac-mini', running: true }, { dir, chaveImpl: chaveFalsa });
  writeBeacon({ device: 'pc-paulo', running: true }, { dir, chaveImpl: outraChave }); // outra maquina, outra chave

  const r = readBeacons({ dir, partilhado: true, selfDevice: 'mac-mini', chaveImpl: chaveFalsa });

  assert.equal(r.autenticacao.prova_frota, false, 'era isto que dizia true');
  assert.equal(r.autenticacao.devices_verificados, 1);
  assert.deepEqual(r.autenticacao.devices_por_enrolar, ['pc-paulo']);
  assert.match(r.autenticacao.porque, /nao esta partilhada entre as maquinas/);
  // Um diagnostico correcto e inaccionavel nao serve de nada: tem de dizer como.
  assert.match(r.autenticacao.resolver, /frota:chave/);

  // E o recibo deixa de acusar forja onde ha um device por enrolar.
  assert.equal(r.rejeitados.length, 1);
  assert.equal(r.rejeitados[0].codigo, 'chave-diferente');
  assert.equal(r.rejeitados[0].device, 'pc-paulo');
});

test('ONDA 1e · o kid desta maquina viaja no bloco, para se comparar a olho', () => {
  const dir = pasta('prova3');
  writeBeacon({ device: 'mac-mini', running: true }, { dir, chaveImpl: chaveFalsa });
  const r = readBeacons({ dir, partilhado: true, selfDevice: 'mac-mini', chaveImpl: chaveFalsa });
  assert.match(r.autenticacao.kid, /^[0-9a-f]{16}$/);
  assert.equal(r.autenticacao.chave, 'no vault', 'onde vive e um facto; se e partilhada quem responde e prova_frota');
});

test('ONDA 1e · chave LOCAL: a causa dita e o alcance, nao a contagem', () => {
  const dir = pasta('prova4');
  const soLocal = () => ({ chave: CHAVE_T, caminho: '/h/.mooter/owner.key', fonte: 'local', partilhado: false, criada: false, erro: null });
  writeBeacon({ device: 'mac-mini', running: true }, { dir, chaveImpl: soLocal });
  writeBeacon({ device: 'pc-paulo', running: true }, { dir, chaveImpl: soLocal });

  const r = readBeacons({ dir, partilhado: false, selfDevice: 'mac-mini', chaveImpl: soLocal });
  assert.equal(r.autenticacao.devices_verificados, 2, 'os dois verificam...');
  assert.equal(r.autenticacao.prova_frota, false, '...e mesmo assim nao provam origem');
  assert.match(r.autenticacao.porque, /nao a origem/);
});

// ── ONDA 2 · o registo de publicas manda ─────────────────────────────────────

const parEd = () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pub = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');
  return { privada: privateKey, pub, kid: assinaturaMod.kidDaPublica(pub) };
};
const regDe = (mapa) => () => ({
  devices: Object.fromEntries(Object.entries(mapa).map(([n, p]) => [n, { alg: assinaturaMod.ALG_ED, kid: p.kid, pub: p.pub }])),
  caminho: '/t/trusted-devices.json', partilhado: true, existe: true, erro: null,
});
const semRegisto = () => ({ devices: {}, caminho: '/t/trusted-devices.json', partilhado: true, existe: false, erro: null });

test('ONDA 2 · writeBeacon so muda para Ed25519 DEPOIS de inscrito', () => {
  // A ordem e a unica que nao parte nada: assinar com uma publica que ninguem
  // tem so troca "verificado" por "nao-inscrito" em todos os paineis.
  const dir = pasta('ed-ordem');
  const p = parEd();
  const meu = () => ({ ...p, caminho: '/t/device.key', criada: false, erro: null });

  const antes = writeBeacon({ device: 'mac-mini' }, { dir, chaveImpl: chaveFalsa, deviceKeyImpl: meu, registoImpl: semRegisto });
  assert.equal(antes.inscrito, false);
  assert.equal(antes.alg, assinaturaMod.ALG_TAG, 'por inscrever: continua em HMAC, exactamente como estava');

  const depois = writeBeacon({ device: 'mac-mini' }, { dir, chaveImpl: chaveFalsa, deviceKeyImpl: meu, registoImpl: regDe({ 'mac-mini': p }) });
  assert.equal(depois.inscrito, true);
  assert.equal(depois.alg, assinaturaMod.ALG_ED);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'mac-mini.json'), 'utf8')).sig.alg, assinaturaMod.ALG_ED);
});

test('ONDA 2 · dois devices inscritos provam a frota, ancorados no registo', () => {
  const dir = pasta('ed-prova');
  const mac = parEd();
  const pc = parEd();
  const registo = regDe({ 'mac-mini': mac, 'pc-paulo': pc });
  writeBeacon({ device: 'mac-mini' }, { dir, deviceKeyImpl: () => ({ ...mac, erro: null }), registoImpl: registo });
  writeBeacon({ device: 'pc-paulo' }, { dir, deviceKeyImpl: () => ({ ...pc, erro: null }), registoImpl: registo });

  const r = readBeacons({ dir, partilhado: true, selfDevice: 'mac-mini', chaveImpl: chaveFalsa, registoImpl: registo });
  assert.equal(r.rejeitados.length, 0);
  assert.equal(r.autenticacao.prova_frota, true);
  assert.equal(r.autenticacao.registo.devices, 2);
  for (const d of r.frota) assert.equal(d.autenticidade.ancora, 'registo');
});

test('ONDA 2 · GATE: um device POR INSCREVER nao entra, e o painel diz como se inscreve', () => {
  const dir = pasta('ed-falta');
  const mac = parEd();
  const pc = parEd();
  const soMac = regDe({ 'mac-mini': mac });
  writeBeacon({ device: 'mac-mini' }, { dir, deviceKeyImpl: () => ({ ...mac, erro: null }), registoImpl: soMac });
  // O PC assina com a sua privada, mas ninguem o autorizou ainda.
  fs.writeFileSync(path.join(dir, 'pc-paulo.json'),
    JSON.stringify(assinaturaMod.assinadoEd({ device: 'pc-paulo', running: true }, { privada: pc.privada, pub: pc.pub })));

  const r = readBeacons({ dir, partilhado: true, selfDevice: 'mac-mini', chaveImpl: chaveFalsa, registoImpl: soMac });
  assert.equal(r.frota.find((d) => d.device === 'pc-paulo'), undefined);
  assert.equal(r.rejeitados[0].codigo, 'nao-inscrito');
  assert.deepEqual(r.autenticacao.devices_por_inscrever, ['pc-paulo']);
  assert.equal(r.autenticacao.prova_frota, false);
  assert.match(r.autenticacao.porque, /o dono ainda nao autorizou/);
  assert.match(r.autenticacao.resolver, /--inscrever/);
});

test('ONDA 2 · GATE: uma chave LOCAL nunca conta para a prova, por mais devices que verifique', () => {
  // Duas maquinas a verificar com uma chave que so existe numa delas provam
  // integridade de ficheiro, nao origem. A contagem sozinha nao sabe isso.
  const dir = pasta('ed-local');
  const soLocal = () => ({ chave: CHAVE_T, caminho: '/h/.mooter/owner.key', fonte: 'local', partilhado: false, criada: false, erro: null });
  writeBeacon({ device: 'mac-mini' }, { dir, chaveImpl: soLocal, registoImpl: semRegisto });
  writeBeacon({ device: 'pc-paulo' }, { dir, chaveImpl: soLocal, registoImpl: semRegisto });

  const r = readBeacons({ dir, partilhado: false, selfDevice: 'mac-mini', chaveImpl: soLocal, registoImpl: semRegisto });
  assert.equal(r.autenticacao.devices_verificados, 2);
  assert.equal(r.autenticacao.prova_frota, false);
  for (const d of r.frota) assert.equal(d.autenticidade.ancora, 'chave-local');
  assert.match(r.autenticacao.porque, /nao a origem/);
});

test('ONDA 2 · migracao: HMAC e Ed25519 coexistem na mesma pasta', () => {
  // No dia da migracao um device ja assina Ed25519 e o outro ainda nao. Nenhum
  // pode desaparecer do painel por causa disso.
  const dir = pasta('ed-mistura');
  const mac = parEd();
  const registo = regDe({ 'mac-mini': mac });
  writeBeacon({ device: 'mac-mini' }, { dir, deviceKeyImpl: () => ({ ...mac, erro: null }), registoImpl: registo });
  writeBeacon({ device: 'pc-paulo' }, { dir, chaveImpl: chaveFalsa, registoImpl: semRegisto });

  const r = readBeacons({ dir, partilhado: true, selfDevice: 'mac-mini', chaveImpl: chaveFalsa, registoImpl: registo });
  assert.equal(r.rejeitados.length, 0, 'os dois entram');
  assert.equal(r.frota.find((d) => d.device === 'mac-mini').autenticidade.ancora, 'registo');
  assert.equal(r.frota.find((d) => d.device === 'pc-paulo').autenticidade.ancora, 'chave-partilhada');
  assert.equal(r.autenticacao.prova_frota, true, 'ancoras diferentes, ambas provam origem');
});

test('ONDA 2 · GATE: o impostor Ed25519 nao rouba o lugar de self', () => {
  const dir = pasta('ed-impostor');
  const mac = parEd();
  const pc = parEd();
  const registo = regDe({ 'mac-mini': mac, 'pc-paulo': pc });
  writeBeacon({ device: 'mac-mini' }, { dir, deviceKeyImpl: () => ({ ...mac, erro: null }), registoImpl: registo });
  // O beacon do Mac, copiado para o ficheiro do PC.
  fs.copyFileSync(path.join(dir, 'mac-mini.json'), path.join(dir, 'pc-paulo.json'));

  const r = readBeacons({ dir, partilhado: true, selfDevice: 'mac-mini', chaveImpl: chaveFalsa, registoImpl: registo });
  assert.equal(r.frota.length, 1, 'o ficheiro do PC nao pode ressuscitar o PC com o beacon do Mac');
  assert.equal(r.rejeitados[0].ficheiro, 'pc-paulo.json');
  assert.equal(r.rejeitados[0].codigo, 'chave-diferente');
});

// ── seq: VETO, nunca decisor (regressão apanhada em revisão, 2026-09-01) ──────

/** Lê beacons de uma pasta temporária, com uma camada remota por cima. */
function frotaCom({ disco, remoto, agora }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-seq-'));
  fs.writeFileSync(path.join(dir, 'outro.json'), JSON.stringify(disco));
  return readBeacons({
    dir, selfDevice: 'eu', now: agora,
    remotos: { 'outro.json': remoto },
    chaveImpl: () => ({ chave: null, erro: 'sem chave nesta bancada' }),
    registoImpl: semRegisto,
  });
}

const AGORA_SEQ = Date.parse('2026-09-01T12:00:00Z');
const isoSeq = (msAtras) => new Date(AGORA_SEQ - msAtras).toISOString();

/**
 * O CASO QUE A PRIMEIRA VERSÃO ERRAVA. O contador vive fora do vault e reinicia
 * num perfil/SO novo. Com o `seq` a DECIDIR, um remoto de 24 h com contador de
 * uma época antiga (800) ganhava a um disco fresco de época nova (2) — e o
 * painel declarava morto um device que estava a trabalhar naquele instante.
 */
test('seq de épocas diferentes NÃO pode declarar morto um device vivo', () => {
  const { frota } = frotaCom({
    disco:  { device: 'outro', seq: 2,   ts: isoSeq(0),         running: true },
    remoto: { device: 'outro', seq: 800, ts: isoSeq(24 * 3600e3), running: false },
    agora: AGORA_SEQ,
  });
  assert.equal(frota.length, 1);
  assert.equal(frota[0].via, 'disco', 'o `ts` decide — o `seq` não escolhe por ele');
  assert.equal(frota[0].running, true);
});

/** E o que o `seq` VETA: um beacon antigo restaurado com o relógio a mentir. */
test('seq veta um remoto que vem ATRÁS, mesmo com o relógio a dizer o contrário', () => {
  const { frota } = frotaCom({
    disco:  { device: 'outro', seq: 41, ts: isoSeq(60e3),  running: true },
    remoto: { device: 'outro', seq: 20, ts: isoSeq(-3600e3), running: false },  // datado no futuro
    agora: AGORA_SEQ,
  });
  assert.equal(frota[0].via, 'disco', 'um seq mais baixo não entra por muito que o ts minta');
  assert.equal(frota[0].running, true);
});

test('sem seq dos dois lados, a regra é a de sempre: ganha o ts mais novo', () => {
  const { frota } = frotaCom({
    disco:  { device: 'outro', ts: isoSeq(3600e3), running: false },
    remoto: { device: 'outro', ts: isoSeq(60e3),   running: true },
    agora: AGORA_SEQ,
  });
  assert.equal(frota[0].via, 'remoto');
  assert.equal(frota[0].seq, null, 'um beacon antigo não ganha um contador inventado');
});

test('seq só de um lado não veta nada — não há comparação a fazer', () => {
  const { frota } = frotaCom({
    disco:  { device: 'outro', seq: 900, ts: isoSeq(3600e3) },
    remoto: { device: 'outro', ts: isoSeq(60e3) },
    agora: AGORA_SEQ,
  });
  assert.equal(frota[0].via, 'remoto', 'o ts decide; o seq de um só lado não é um veto');
});

// ── o contador ───────────────────────────────────────────────────────────────

test('proximoSeq começa em 1 quando o ficheiro ainda não existe', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'moo-cont-')), 'seq.json');
  assert.equal(proximoSeq('dev', { caminho: f }), 1);
  assert.equal(proximoSeq('dev', { caminho: f }), 2);
  assert.equal(proximoSeq('outro', { caminho: f }), 1, 'cada device tem o seu contador');
});

/**
 * FICHEIRO ILEGÍVEL ≠ FICHEIRO AUSENTE. Recomeçar em 1 sobre um contador que
 * existia inventa um número baixo, escreve-o por cima (a perda fica permanente)
 * e faz o veto acima recusar os beacons desta máquina por virem «atrás».
 */
test('proximoSeq devolve null num contador ilegível — e NÃO escreve por cima', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'moo-cont-')), 'seq.json');
  fs.writeFileSync(f, '{ isto nao e json');
  assert.equal(proximoSeq('dev', { caminho: f }), null);
  assert.equal(fs.readFileSync(f, 'utf8'), '{ isto nao e json', 'o ficheiro tem de ficar intacto');
});

test('proximoSeq devolve null se não conseguir escrever — nunca reinicia em silêncio', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'moo-cont-')), 'seq.json');
  assert.equal(proximoSeq('dev', {
    caminho: f, writeImpl: () => { throw new Error('EACCES'); },
  }), null);
});

test('a escrita do contador é atómica (temp + rename), porque é partilhado', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'moo-cont-')), 'seq.json');
  let escrito = null; let renomeado = null;
  proximoSeq('dev', {
    caminho: f,
    readImpl: () => { const e = new Error('nao ha'); e.code = 'ENOENT'; throw e; },
    writeImpl: (p) => { escrito = p; },
    renameImpl: (de, para) => { renomeado = [de, para]; },
  });
  assert.notEqual(escrito, f, 'escreve-se no temporário, não no destino');
  assert.deepEqual(renomeado, [escrito, f]);
});
