#!/usr/bin/env node
/**
 * chave-da-frota.mjs — mover a chave do dono entre maquinas, fora do git.
 *
 * O PROBLEMA (medido 2026-08-24). O `assinatura.js` poe a chave no vault com o
 * argumento escrito no proprio ficheiro: "o vault e o canal que JA atravessa as
 * maquinas do dono". Atravessa — por git. E o git so transporta o que esta
 * tracked: a `.owner.key` cai no `*.key` do .gitignore do vault, a par de
 * `*.pem` e `*_secret*`. Nunca viajou. Cada device correu o `wx` a primeira vez
 * e gerou a sua propria chave, e depois cada painel recusava os beacons do
 * outro. O `desktop-j26409q` aparecia acusado de forja no painel do Mac.
 *
 * PORQUE NAO SE VERSIONA A CHAVE. O HMAC existe para proteger exactamente o
 * canal git: sem ele, qualquer processo com escrita em `50-fleet/` — ou qualquer
 * token com escrita no remote — inventa um device e o painel acredita. Pousar a
 * chave nesse canal e da-la a quem ela exclui, e para sempre, no historico. O
 * `*.key` do .gitignore esta certo; o que estava errado era supor que um
 * ficheiro ignorado sincronizava.
 *
 * ENTAO ESTE FICHEIRO. A chave viaja a mao, uma vez por maquina, por um canal
 * que o dono escolhe (AirDrop, gestor de senhas, `scp`, pen). Nao e elegante e
 * nao tenta ser: e o preco de um segredo simetrico, e esta escrito para que o
 * gesto seja curto e dificil de fazer mal.
 *
 * O `kid` (`sha256(chave)` truncado) e o que se compara para saber se correu
 * bem, SEM voltar a mexer no segredo: duas maquinas com o mesmo `kid` assinam
 * uma para a outra.
 *
 * Uso:
 *   node tools/cockpit/chave-da-frota.mjs                      # estado + kid
 *   node tools/cockpit/chave-da-frota.mjs --exportar <destino> # escreve a chave
 *   node tools/cockpit/chave-da-frota.mjs --importar <origem>  # instala a chave
 *   node tools/cockpit/chave-da-frota.mjs --importar <origem> --forcar
 *
 * Este ficheiro NUNCA imprime a chave. Escreve-a num destino que o dono nomeia,
 * com 0600, e recusa-se a escrever dentro de um repositorio git.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const assinatura = require('../router/assinatura.js');

const HEX_RE = /^[0-9a-f]+$/i;

/** Um erro previsto: tem mensagem para o dono, e nao stack. */
class Recusa extends Error {}

/**
 * A chave esta dentro de um repositorio git?
 *
 * Sobe a arvore a procura de `.git`. Nao usa `git rev-parse` de proposito: se o
 * destino for uma pasta que ainda nao existe, ou uma pen sem git instalado, a
 * pergunta continua a ter resposta.
 */
export function dentroDeRepo(destino, { existsImpl = fs.existsSync } = {}) {
  let dir = path.resolve(destino);
  // O destino e um ficheiro que pode ainda nao existir: comeca-se na pasta.
  dir = path.dirname(dir);
  for (;;) {
    if (existsImpl(path.join(dir, '.git'))) return dir;
    const acima = path.dirname(dir);
    if (acima === dir) return null;
    dir = acima;
  }
}

/** Le um ficheiro de chave e devolve os 32 bytes, ou lanca `Recusa`. */
function lerChave(caminho, readImpl) {
  let cru;
  try {
    cru = String(readImpl(caminho, 'utf8')).trim();
  } catch (err) {
    throw new Recusa(`nao consegui ler ${caminho}: ${String(err && err.message)}`);
  }
  if (!HEX_RE.test(cru)) {
    throw new Recusa(`${caminho} nao parece uma chave: esperava ${assinatura.KEY_BYTES * 2} caracteres hex`);
  }
  const buf = Buffer.from(cru, 'hex');
  if (buf.length !== assinatura.KEY_BYTES) {
    throw new Recusa(`${caminho} tem ${buf.length}B, esperados ${assinatura.KEY_BYTES}B`);
  }
  return buf;
}

/**
 * Onde vive a chave desta maquina, e qual e o seu `kid`.
 *
 * Nunca CRIA a chave: quem a cria e o `chaveDoDono` no arranque do runner. Um
 * comando de diagnostico que gera um segredo como efeito lateral e como uma
 * sonda que muda o que mede — e pior, geraria uma chave NOVA na maquina onde se
 * ia importar a do dono, so por se ter perguntado o estado.
 */
export function estado({ existsImpl = fs.existsSync, readImpl = fs.readFileSync, ...o } = {}) {
  const { caminho, fonte, partilhado } = assinatura.caminhoDaChave({ existsImpl, ...o });
  if (!existsImpl(caminho)) {
    return { caminho, fonte, partilhado, existe: false, kid: null, erro: null };
  }
  try {
    return { caminho, fonte, partilhado, existe: true, kid: assinatura.kidDaChave(lerChave(caminho, readImpl)), erro: null };
  } catch (err) {
    return { caminho, fonte, partilhado, existe: true, kid: null, erro: String(err && err.message) };
  }
}

/**
 * Escreve a chave desta maquina num destino que o dono nomeia.
 *
 * Recusa escrever dentro de um repositorio git. E a unica maneira de este
 * comando reintroduzir exactamente o problema que existe para resolver: uma
 * chave largada num working tree e uma chave a um `git add -A` de distancia do
 * historico. O `.gitignore` do vault ja o cobre, mas basta um repo que nao
 * tenha a regra.
 */
export function exportar(destino, {
  existsImpl = fs.existsSync, readImpl = fs.readFileSync, writeImpl = fs.writeFileSync, ...o
} = {}) {
  if (!destino) throw new Recusa('--exportar precisa de um caminho de destino');
  const st = estado({ existsImpl, readImpl, ...o });
  if (!st.existe) throw new Recusa(`nao ha chave para exportar em ${st.caminho} — arranca o cockpit uma vez para ela nascer`);
  if (st.erro) throw new Recusa(st.erro);

  const repo = dentroDeRepo(destino, { existsImpl });
  if (repo) {
    throw new Recusa(
      `recuso escrever a chave dentro de um repositorio git (${repo}). `
      + 'Uma chave num working tree esta a um `git add` de distancia do historico. '
      + 'Escolhe um destino fora de qualquer repo — ~/Downloads, uma pen, o teu gestor de senhas.',
    );
  }

  const chave = lerChave(st.caminho, readImpl);
  // `wx` nao: exportar duas vezes para o mesmo sitio e um gesto legitimo, e o
  // conteudo e sempre o mesmo. O que nao pode e nascer legivel por outros.
  writeImpl(destino, chave.toString('hex') + '\n', { mode: 0o600 });
  return { ok: true, caminho: path.resolve(destino), kid: st.kid, aviso: assinatura.avisoDePermissoes() };
}

/**
 * Instala a chave do dono nesta maquina.
 *
 * A guarda que interessa: NUNCA substituir uma chave diferente em silencio.
 * Substituir invalida todas as assinaturas ja feitas com a antiga — e o efeito
 * nao e local, e a frota inteira a deixar de reconhecer este device ate ele
 * reassinar. Se e mesmo isso que o dono quer, `--forcar` di-lo por escrito.
 *
 * Importar a MESMA chave e sempre no-op: nao ha nada a avisar quando nada muda.
 */
export function importar(origem, {
  forcar = false,
  existsImpl = fs.existsSync, readImpl = fs.readFileSync,
  writeImpl = fs.writeFileSync, mkdirImpl = fs.mkdirSync, ...o
} = {}) {
  if (!origem) throw new Recusa('--importar precisa do caminho da chave a instalar');
  const nova = lerChave(origem, readImpl);
  const kidNovo = assinatura.kidDaChave(nova);
  const st = estado({ existsImpl, readImpl, ...o });

  if (st.existe && st.kid === kidNovo) {
    return { ok: true, caminho: st.caminho, kid: kidNovo, mudou: false, substituiu: null };
  }
  if (st.existe && !forcar) {
    throw new Recusa(
      `ja existe uma chave DIFERENTE em ${st.caminho} (kid ${st.kid || 'ilegivel'}, a importar ${kidNovo}). `
      + 'Substitui-la invalida tudo o que ja foi assinado com ela, e os outros devices deixam de reconhecer este '
      + 'ate ele reassinar. Se e isso que queres, repete com --forcar.',
    );
  }

  mkdirImpl(path.dirname(st.caminho), { recursive: true });
  writeImpl(st.caminho, nova.toString('hex') + '\n', { mode: 0o600 });
  return { ok: true, caminho: st.caminho, kid: kidNovo, mudou: true, substituiu: st.existe ? st.kid : null };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function valorDe(argv, flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) throw new Recusa(`${flag} precisa de um caminho a seguir`);
  return v;
}

export function main(argv = process.argv.slice(2), say = (s) => process.stdout.write(`${s}\n`)) {
  const forcar = argv.includes('--forcar');
  try {
    if (argv.includes('--exportar')) {
      const r = exportar(valorDe(argv, '--exportar'));
      say('');
      say(`  chave escrita em  ${r.caminho}`);
      say(`  kid               ${r.kid}`);
      if (r.aviso) say(`  aviso             ${r.aviso}`);
      say('');
      say('  Leva-a a mao para a outra maquina — AirDrop, gestor de senhas, scp, pen.');
      say('  NAO a metas num repositorio, nem a coles num chat que fique gravado.');
      say('  La: node tools/cockpit/chave-da-frota.mjs --importar <ficheiro>');
      say('  Depois apaga a copia. O kid tem de bater nas duas maquinas.');
      say('');
      return 0;
    }
    if (argv.includes('--importar')) {
      const r = importar(valorDe(argv, '--importar'), { forcar });
      say('');
      if (!r.mudou) {
        say(`  ja era esta a chave desta maquina (kid ${r.kid}) — nada mudou.`);
      } else {
        say(`  chave instalada em ${r.caminho}`);
        say(`  kid                ${r.kid}`);
        if (r.substituiu) say(`  substituiu         ${r.substituiu} — tudo o que foi assinado com ela deixa de verificar`);
        say('');
        say('  O beacon deste device reassina no proximo ciclo do loop (~10 min),');
        say('  ou ja se reiniciares o cockpit. So depois disso a frota o reconhece.');
      }
      say('');
      return 0;
    }

    const st = estado();
    say('');
    say('  chave do dono · frota');
    say('');
    say(`  caminho     ${st.caminho}`);
    say(`  fonte       ${st.fonte}${st.partilhado ? '' : ' (por-device: nao assina uma frota)'}`);
    if (!st.existe) {
      say('  estado      ainda nao existe — nasce no primeiro arranque do cockpit');
    } else if (st.erro) {
      say(`  estado      ILEGIVEL — ${st.erro}`);
    } else {
      say(`  kid         ${st.kid}`);
      say('');
      say('  Duas maquinas com o mesmo kid assinam uma para a outra. Compara-o com');
      say('  a outra: o kid nao e segredo, a chave e.');
      say('');
      say('  --exportar <destino>   escreve a chave para a levares a mao');
      say('  --importar <origem>    instala aqui a chave do dono');
    }
    say('');
    return 0;
  } catch (err) {
    if (err instanceof Recusa) {
      say('');
      say(`  ✗ ${err.message}`);
      say('');
      return 1;
    }
    throw err;
  }
}

const chamadoDirectamente = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (chamadoDirectamente) process.exit(main());
