/**
 * self-check.test.mjs
 *
 * O dono disse, e tinha razao: "nao vi nada de melhorias ou alertas". Nove
 * defeitos reais num dia — o ledger sem rotacao, o indice do vault de ha 21
 * dias, dois ficheiros a discordar sobre o projecto activo — e o painel calado
 * o tempo todo. Nao era falta de defeitos: era falta de quem olhasse.
 *
 * Nenhum deles precisava de um modelo. Um `stat` e uma comparacao chegavam.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  verLedger, verIndiceDoVault, verBeacon, verProjectoActivo, verPreferencias,
  autoVerificar, LEDGER_TECTO_MB, BEACON_VELHO_MIN,
  verCodigo, verConector,
} from './self-check.mjs';

const MB = 1024 * 1024;

// ── a regra que faz isto valer alguma coisa ─────────────────────────────────

test('todo o alerta traz o GESTO que o resolve', () => {
  // Um alerta que nao diz COMO se resolve e uma queixa. Isto e a diferenca
  // entre um painel que ajuda e um painel que aponta o dedo.
  const maus = [
    verLedger({ LEDGER: '/x' }, { statImpl: () => ({ size: (LEDGER_TECTO_MB + 5) * MB }) }),
    verIndiceDoVault('/v', { statImpl: () => { throw new Error('ENOENT'); } }),
    verBeacon('/b', { statImpl: () => { throw new Error('ENOENT'); } }),
    verPreferencias('/m', { existsImpl: () => false }),
  ];
  for (const m of maus) {
    assert.notEqual(m.estado, 'ok');
    assert.ok(m.resolver && String(m.resolver).length > 5, `${m.id} avisa e nao diz como resolver`);
    assert.ok(m.porque && m.porque.length > 10, `${m.id} nao explica porque importa`);
  }
});

test('o que nao se consegue medir e n/d, NUNCA ok', () => {
  // Um verde por ignorancia e pior do que um vermelho: convida a confiar.
  assert.equal(verLedger({ LEDGER: '/x' }, { statImpl: () => { throw new Error('ENOENT'); } }).estado, 'n/d');
  assert.equal(verIndiceDoVault(null).estado, 'n/d');
  assert.equal(verProjectoActivo('/m', { readImpl: () => { throw new Error('ENOENT'); } }).estado, 'n/d');
});

// ── cada verificacao, contra o defeito real que a fez nascer ────────────────

test('o ledger acima do tecto e MAU, e nao um aviso', () => {
  const ok = verLedger({ LEDGER: '/x' }, { statImpl: () => ({ size: 1 * MB }) });
  assert.equal(ok.estado, 'ok');
  const mau = verLedger({ LEDGER: '/x' }, { statImpl: () => ({ size: (LEDGER_TECTO_MB + 1) * MB }) });
  assert.equal(mau.estado, 'mau', 'passar o tecto quer dizer que a rotacao nao correu — isso nao e um detalhe');
});

test('ficheiros mais novos que o indice do vault sao invisiveis, e ve-se', () => {
  // Medido a 2026-08-19: 60 de 448 (13%) estavam fora do indice, ha 21 dias.
  const emDia = verIndiceDoVault('/v', { statImpl: () => ({ mtimeMs: 1000 }), listarImpl: () => 0 });
  assert.equal(emDia.estado, 'ok');
  const atras = verIndiceDoVault('/v', { statImpl: () => ({ mtimeMs: 1000 }), listarImpl: () => 60 });
  assert.equal(atras.estado, 'aviso');
  assert.match(atras.valor, /60/);
  assert.match(atras.resolver, /build-index/);
});

test('escrever o beacon NAO e publica-lo, e o painel di-lo', () => {
  const agora = 1_760_000_000_000;
  const desligado = verBeacon('/b', { statImpl: () => ({ mtimeMs: agora }), agora, env: {} });
  assert.equal(desligado.estado, 'aviso');
  assert.match(desligado.porque, /NÃO publicado/);
  assert.match(desligado.resolver, /MOO_PUBLICAR_BEACON/);

  const ligado = verBeacon('/b', { statImpl: () => ({ mtimeMs: agora }), agora, env: { MOO_PUBLICAR_BEACON: '1' } });
  assert.equal(ligado.estado, 'ok');

  const velho = verBeacon('/b', {
    statImpl: () => ({ mtimeMs: agora - (BEACON_VELHO_MIN + 5) * 60000 }),
    agora, env: { MOO_PUBLICAR_BEACON: '1' },
  });
  assert.equal(velho.estado, 'mau', 'ligado e parado e pior do que desligado — parece que funciona');
});

test('dois ficheiros a discordar sobre o projecto activo e MAU', () => {
  // Medido: `cowork-session.json` dizia mooter-pilar-coerencia e
  // `sessoes/mooter.json` dizia mooter-gpu-local-strategy. Quem ler primeiro
  // decide, e isso e sorte.
  const ler = (mapa) => (p) => {
    for (const [k, v] of Object.entries(mapa)) if (String(p).includes(k)) return JSON.stringify(v);
    throw new Error('ENOENT');
  };
  const iguais = verProjectoActivo('/m', { readImpl: ler({ 'cowork-session': { project: 'x' }, 'sessoes': { projecto: 'x' } }) });
  assert.equal(iguais.estado, 'ok');
  const dif = verProjectoActivo('/m', { readImpl: ler({ 'cowork-session': { project: 'a' }, 'sessoes': { projecto: 'b' } }) });
  assert.equal(dif.estado, 'mau');
  assert.match(dif.valor, /a ≠ b/);
});

// ── o agregado ──────────────────────────────────────────────────────────────

test('uma verificacao que rebenta vira n/d, nunca derruba o alarme', () => {
  // O alarme nao pode ser a coisa que parte.
  const r = autoVerificar({ paths: null, mooDir: null, vaultDir: null, beaconFile: null });
  assert.ok(Array.isArray(r.itens) && r.itens.length >= 5);
  assert.ok(['ok', 'aviso', 'mau', 'n/d'].includes(r.pior));
});

test('o pior estado manda — um mau nao se esconde atras de quatro oks', () => {
  const r = autoVerificar({ paths: { LEDGER: '/x' }, mooDir: '/m', vaultDir: null, beaconFile: null });
  const temMau = r.itens.some((i) => i.estado === 'mau');
  if (temMau) assert.equal(r.pior, 'mau', 'o agregado tem de doer tanto como o pior item');
});

// ── o preflight de um device novo (2026-08-19) ──────────────────────────────

/**
 * Um device novo falha sempre pelas mesmas quatro coisas — codigo antigo,
 * conector de outra versao, vault por montar, beacon que nao publica — e
 * NENHUMA grita. Todas dao um sintoma que parece outra coisa, e passa-se uma
 * hora a debugar o sintoma errado.
 */
test('codigo atrasado e MAU, e diz quantos commits', () => {
  const emDia = verCodigo('/r', { runImpl: () => '0' });
  assert.equal(emDia.estado, 'ok');
  const atras = verCodigo('/r', { runImpl: () => '7' });
  assert.equal(atras.estado, 'mau');
  assert.match(atras.valor, /7 commits/);
  assert.match(atras.resolver, /git pull/);
});

test('sem upstream, cai para origin/main antes de desistir', () => {
  // `n/d` era a resposta honesta e tambem a inutil: quem trabalha num ramo sem
  // upstream ficava sem saber se estava a correr codigo velho.
  let vez = 0;
  const r = verCodigo('/r', { runImpl: () => { if (vez++ === 0) throw new Error('no upstream'); return '3'; } });
  assert.equal(r.estado, 'mau');
  assert.match(r.valor, /3 commits/);
});

test('o conector instalado tem de ser o do repo', () => {
  const ler = (mapa) => (p) => {
    for (const [k, v] of Object.entries(mapa)) if (String(p).includes(k)) return JSON.stringify(v);
    throw new Error('ENOENT');
  };
  const reg = (v) => ({ extensions: { 'local.mcpb.x.mooter': { version: v, id: 'mooter' } } });

  const igual = verConector('/r', { readImpl: ler({ manifest: { version: '1.49.3' }, 'extensions-installations': reg('1.49.3') }) });
  assert.equal(igual.estado, 'ok');

  // Medido nesta maquina: 1.33.0 instalado contra 1.49.3 no repo.
  const dif = verConector('/r', { readImpl: ler({ manifest: { version: '1.49.3' }, 'extensions-installations': reg('1.33.0') }) });
  assert.equal(dif.estado, 'mau');
  assert.match(dif.valor, /1\.33\.0 instalado ≠ 1\.49\.3/);
  assert.match(dif.resolver, /v1\.49\.3/, 'o gesto tem de nomear a versao a instalar');
});

test('sem registo do Claude Desktop, e n/d — nunca ok', () => {
  const r = verConector('/r', { readImpl: (p) => (String(p).includes('manifest') ? JSON.stringify({ version: '1.0.0' }) : (() => { throw new Error('ENOENT'); })()) });
  assert.equal(r.estado, 'n/d', 'nao encontrar o registo nao prova que esta alinhado');
});

test('o lancamento corre o preflight e nunca bloqueia por causa dele', () => {
  const fonte = fs.readFileSync(new URL('./launch.mjs', import.meta.url), 'utf8');
  assert.match(fonte, /autoVerificar\(/, 'o lancamento tem de verificar o alinhamento');
  assert.match(fonte, /ALINHAMENTO/, 'e tem de o mostrar ao dono');
  // Informa, nao bloqueia: um preflight que impede o arranque e pior do que
  // nenhum, porque a primeira coisa que se faz e desliga-lo.
  const bloco = /const saude = autoVerificar\(\{[\s\S]*?\n  \} catch/.exec(fonte);
  assert.ok(bloco, 'o preflight tem de estar dentro de um try');
  assert.doesNotMatch(bloco[0], /process\.exit/, 'o preflight informa, nao bloqueia');
});
