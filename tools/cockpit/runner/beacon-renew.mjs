#!/usr/bin/env node
/**
 * beacon-renew.mjs — o beacon deixa de apodrecer. Zero-LLM, zero rede.
 *
 * O PROBLEMA, medido a 2026-09-01 nesta bancada:
 *
 *   desktop-j26409q — assinatura expirada (553768s > 86400s)
 *   paulo-desktop   — assinatura expirada (496375s > 86400s)
 *
 * Dois devices REAIS, apagados do painel. E o `readBeacons` esta certo em os
 * recusar: uma assinatura vale 24 h por desenho, e afirmar hoje uma assinatura
 * de ha seis dias seria dar por boa uma prova que ninguem renovou. O defeito
 * nao esta na verificacao — esta em NINGUEM RENOVAR. O beacon so se reescreve
 * quando o loop corre uma ronda, portanto um device parado (em pausa, desligado
 * ao fim de semana, a espera do dono) desaparece da frota ao fim de um dia. Um
 * device parado e um facto util; um device invisivel nao e nada.
 *
 * ⚠️ O QUE ISTO NAO FAZ, E E O PONTO INTEIRO: nao mexe num unico campo do corpo.
 *
 * Renovar e RE-ASSINAR o mesmo conteudo, nao re-datar o device. O `ts` do
 * beacon — o instante do estado que ele descreve — fica EXACTAMENTE onde
 * estava, e e ele que o painel usa para dizer "asleep · last heartbeat 6d ago".
 * O que fica novo e o `sig.ts`, que e outra pergunta: nao "quando e que este
 * device trabalhou" mas "quando e que alguem provou que este ficheiro e dele".
 *
 * Se este ficheiro alguma vez carimbar `ts: new Date()`, um cron passa a
 * afirmar de hora a hora que uma maquina morta esta acordada — que e a mentira
 * exacta que o `beaconFreshness` existe para nao contar. O teste
 * `beacon-renew.test.mjs` reprova essa alteracao.
 *
 * QUANDO escreve: so quando a assinatura ja passou de metade da janela. Corre
 * de hora a hora (barato: le um ficheiro), escreve duas vezes por dia. A conta
 * e do vault do dono — publicar de hora a hora dava ~8760 commits por ano no
 * repositorio pessoal dele para renovar uma prova que dura 24 h.
 *
 * Uso:
 *   node tools/cockpit/runner/beacon-renew.mjs           renova se precisar
 *   node tools/cockpit/runner/beacon-renew.mjs --forca   renova sempre
 *   node tools/cockpit/runner/beacon-renew.mjs --json    so o resultado
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { beaconDir, deviceName, safeDeviceName, assinarBeacon } from './fleet-beacon.mjs';
import { publicarBeacon, ligado as publicacaoLigada } from './beacon-publisher.mjs';

const require = createRequire(import.meta.url);
const assinatura = require('../../router/assinatura.js');

/**
 * A partir de que idade se renova: METADE da janela de validade.
 *
 * Nao um valor de cabeca — deriva da janela real (`assinatura.JANELA_S`). Se um
 * dia a janela encolher, o limiar encolhe com ela no mesmo commit, e a margem
 * de seguranca continua a ser a mesma proporcao em vez de virar zero em
 * silencio.
 */
export const LIMIAR_S = Math.floor(assinatura.JANELA_S / 2);

/**
 * Precisa de renovacao?
 *
 * Um beacon SEM assinatura devolve `false`: nao ha prova para renovar, e
 * assina-lo aqui seria este script a inventar uma que o `writeBeacon` nao
 * conseguiu produzir (por falta de chave). O sitio de resolver isso e a chave,
 * nao o relogio.
 */
export function precisaDeRenovar(beacon, { agora = Date.now(), limiarS = LIMIAR_S } = {}) {
  const sig = beacon && beacon.sig;
  if (!sig || !sig.ts) {
    return { renovar: false, idade_s: null, porque: 'beacon sem assinatura — nao ha prova para renovar' };
  }
  const t = Date.parse(sig.ts);
  if (!Number.isFinite(t)) {
    return { renovar: false, idade_s: null, porque: 'assinatura com data ilegivel — nao mexo no que nao percebo' };
  }
  const idade = Math.round((agora - t) / 1000);
  if (idade < 0) {
    // Uma assinatura no futuro nao e velha: e um relogio errado, e re-assinar
    // por cima esconderia isso em vez de o mostrar.
    return { renovar: false, idade_s: idade, porque: `assinatura datada no futuro (${-idade}s) — nao renovo` };
  }
  return idade >= limiarS
    ? { renovar: true, idade_s: idade, porque: `assinatura com ${idade}s, limiar ${limiarS}s` }
    : { renovar: false, idade_s: idade, porque: `assinatura com ${idade}s, ainda dentro do limiar ${limiarS}s` };
}

/**
 * Renova o beacon DESTE device.
 *
 * @returns {{ok:boolean, renovado:boolean, device:string, idade_s:number|null,
 *            porque:string, publicado?:object}}
 */
export function renovarBeacon({
  device = null,
  where = null,
  agora = Date.now(),
  forca = false,
  readImpl = fs.readFileSync,
  writeImpl = fs.writeFileSync,
  existsImpl = fs.existsSync,
  assinarImpl = assinarBeacon,
  publicarImpl = publicarBeacon,
  publicarLigadoImpl = publicacaoLigada,
} = {}) {
  const dev = safeDeviceName(device || deviceName());
  const onde = where || beaconDir();
  const ficheiro = path.join(onde.dir, `${dev}.json`);

  if (!existsImpl(ficheiro)) {
    // Nao se cria um beacon aqui. Um device que nunca correu o loop nao tem
    // estado nenhum para descrever, e um beacon vazio seria pior do que nenhum.
    return { ok: false, renovado: false, device: dev, idade_s: null,
             porque: 'este device ainda nao tem beacon — corre o loop uma vez primeiro' };
  }

  let beacon;
  try {
    beacon = JSON.parse(String(readImpl(ficheiro, 'utf8')));
  } catch (e) {
    return { ok: false, renovado: false, device: dev, idade_s: null,
             porque: `beacon ilegivel (${String(e.message).slice(0, 60)}) — nao escrevo por cima` };
  }

  const precisa = precisaDeRenovar(beacon, { agora });
  if (!forca && !precisa.renovar) {
    return { ok: true, renovado: false, device: dev, idade_s: precisa.idade_s, porque: precisa.porque };
  }
  if (forca && !beacon.sig) {
    return { ok: false, renovado: false, device: dev, idade_s: null,
             porque: 'beacon sem assinatura — nem com --forca invento uma' };
  }

  // O CORPO fica intacto. `sig` sai porque vai ser refeita; tudo o resto — `ts`,
  // `seq`, contagens, pausa — e o estado que este device mediu da ultima vez, e
  // renovar uma prova nao e o mesmo que produzir um facto novo.
  const { sig, ...corpo } = beacon;
  const a = assinarImpl(corpo, { device: dev });
  if (!a.assinado) {
    return { ok: false, renovado: false, device: dev, idade_s: precisa.idade_s,
             porque: `nao consegui assinar: ${a.porque || 'motivo n/d'}` };
  }

  try {
    writeImpl(ficheiro, JSON.stringify(a.payload, null, 2));
  } catch (e) {
    return { ok: false, renovado: false, device: dev, idade_s: precisa.idade_s,
             porque: `nao consegui escrever: ${String(e.message).slice(0, 60)}` };
  }

  const out = {
    ok: true, renovado: true, device: dev, idade_s: precisa.idade_s,
    alg: a.alg,
    porque: `re-assinado (${precisa.porque})`,
  };

  // Publicar so quando o dono o ligou. A renovacao mais util e a que chega aos
  // outros devices, mas escrever no repositorio pessoal dele continua a ser um
  // gesto que se pede — a mesma regra do `beacon-publisher`, sem excepcao aqui.
  if (onde.partilhado && publicarLigadoImpl()) {
    out.publicado = publicarImpl(path.dirname(onde.dir), `50-fleet/${dev}.json`);
  } else {
    out.publicado = { ok: false, porque: onde.partilhado
      ? 'publicacao desligada (MOO_PUBLICAR_BEACON != 1) — renovado em disco, a frota so o ve no proximo sync'
      : 'sem vault partilhado — renovado em disco, e o disco e onde fica' };
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const r = renovarBeacon({ forca: argv.includes('--forca') });
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  } else {
    process.stdout.write(
      `beacon ${r.device}: ${r.renovado ? 'RENOVADO' : 'sem renovar'} — ${r.porque}\n`
      + (r.publicado ? `  publicacao: ${r.publicado.ok ? 'ok' : r.publicado.porque}\n` : ''),
    );
  }
  // Sai 0 mesmo sem renovar: "ainda dentro do limiar" e o caso NORMAL, e um
  // cron que grita de hora a hora e um cron que o dono desliga.
  process.exit(r.ok ? 0 : 1);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
