/**
 * fleet-remoto.mjs — os beacons dos OUTROS devices, lidos do remoto do vault.
 *
 * O problema medido a 2026-08-21: o Mac publicava o beacon de 10 em 10 min
 * (commit + push, certinho) e o painel do PC dizia "sem sinal ha 716s". Nao era
 * o Mac: era o PC, que so ve o vault quando ELE proprio faz `pull --rebase`, no
 * seu proprio ciclo de 10 min. Pior caso: 20 min de idade para um device sao.
 *
 * Isto corta a metade que e nossa. Um `git fetch` NAO toca na arvore de
 * trabalho, NAO toca no indice, NAO cria `index.lock` — so actualiza
 * `refs/remotes/`. Depois le-se cada `50-fleet/*.json` directamente do
 * `origin/<branch>` com `git show`, sem passar por ficheiro nenhum.
 *
 * Regras, todas no sentido de nao estorvar:
 *  · fetch no maximo uma vez por FETCH_MIN_MS — o painel faz poll, o remoto nao
 *    tem de pagar por isso;
 *  · se houver `index.lock` no vault, ha outro git a trabalhar (o publicador a
 *    meio do ciclo, ou o dono): nao se faz fetch, le-se o que o remoto ja tem;
 *  · qualquer falha devolve `{}` com o motivo — a frota volta a valer o que o
 *    disco valer, como antes. Nunca se lanca, nunca se bloqueia o painel.
 *
 * Nada aqui escreve. `readBeacons` recebe isto como `remotos` e decide, por
 * ficheiro, se o remoto e mais fresco do que o disco.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const FETCH_MIN_MS = 120_000;
const GIT_TIMEOUT_MS = 8_000;
const MAX_BEACONS = 24;
const MAX_BYTES = 64 * 1024;

function gitRun(cwd, args, runImpl) {
  const r = runImpl
    ? runImpl(cwd, args)
    : execFileSync('git', args, {
        cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 4 * 1024 * 1024,
      });
  return String(r == null ? '' : r).trim();
}

/** O ref remoto que vale: o upstream do branch actual, senao origin/main. */
function refRemoto(vaultDir, runImpl) {
  try {
    const u = gitRun(vaultDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], runImpl);
    if (u && u !== '@{u}') return u;
  } catch { /* sem upstream configurado */ }
  return 'origin/main';
}

/**
 * Le os beacons do remoto. Devolve `{ remotos: {nome.json: beacon}, ref, fetch, porque }`.
 * `fetch` diz o que aconteceu ao fetch: 'feito' | 'saltado: recente' |
 * 'saltado: lock' | 'falhou: ...'. `porque` so vem quando NADA pode ser lido.
 *
 * O estado do throttle vive no `memo` que o chamador passa (ou num por
 * omissao deste modulo), para que os testes nao partilhem relogio entre si.
 */
const memoOmissao = { ultimoFetchMs: 0 };
export function beaconsDoRemoto(vaultDir, {
  agora = Date.now(), runImpl = null, existsImpl = fs.existsSync, minMs = FETCH_MIN_MS, memo = memoOmissao,
} = {}) {
  if (!vaultDir || !existsImpl(path.join(vaultDir, '.git'))) {
    return { remotos: {}, ref: null, fetch: 'saltado: sem git', porque: 'o vault nao e um repositorio git' };
  }

  let fetch;
  if (existsImpl(path.join(vaultDir, '.git', 'index.lock'))) {
    fetch = 'saltado: lock'; // outro git a trabalhar — esperar e gratis
  } else if (agora - memo.ultimoFetchMs < minMs) {
    fetch = 'saltado: recente';
  } else {
    memo.ultimoFetchMs = agora; // marca-se ANTES: um remoto em baixo nao pode virar martelo
    try {
      gitRun(vaultDir, ['fetch', '--quiet', '--no-tags', 'origin'], runImpl);
      fetch = 'feito';
    } catch (e) {
      fetch = 'falhou: ' + String(e && e.message).slice(0, 80);
    }
  }

  const ref = refRemoto(vaultDir, runImpl);
  let nomes;
  try {
    nomes = gitRun(vaultDir, ['ls-tree', '--name-only', ref, '--', '50-fleet/'], runImpl)
      .split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.json')).slice(0, MAX_BEACONS);
  } catch (e) {
    return { remotos: {}, ref, fetch, porque: 'nao consegui listar ' + ref + ': ' + String(e && e.message).slice(0, 80) };
  }

  const remotos = {};
  for (const caminho of nomes) {
    const nome = path.posix.basename(caminho);
    try {
      const txt = gitRun(vaultDir, ['show', `${ref}:${caminho}`], runImpl);
      if (txt.length > MAX_BYTES) continue; // um beacon tem ~1 KB; isto nao e um beacon
      const b = JSON.parse(txt);
      if (b && typeof b === 'object' && b.device) remotos[nome] = b;
    } catch {
      // um beacon ilegivel no remoto e um device a menos, nunca uma frota a menos
    }
  }
  return { remotos, ref, fetch, porque: null };
}
