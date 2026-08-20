/**
 * beacon-publisher.mjs — pôr o beacon deste device onde os outros o vêem.
 *
 * O `fleet-beacon.mjs` escreve o beacon numa pasta partilhada e diz de si
 * próprio que "a frescura vale o que o sync valer". Medido a 2026-08-19: o
 * sync valia ZERO. `50-fleet/` nunca tinha sido commitado, o beacon existia
 * no disco de uma máquina e nunca saía de lá. O transporte tinha sido
 * escolhido — um vault com remoto no GitHub — e o mecanismo para o atravessar
 * nunca foi construído. Dois cockpits em duas máquinas mostravam um device
 * cada e fingiam conhecer-se.
 *
 * Não é um esquecimento: o beacon reescreve-se a cada ronda, e commitá-lo a
 * cada ronda daria milhares de commits no vault pessoal do dono. Por isso este
 * módulo publica por RELÓGIO, não por ronda.
 *
 * ⚠️ NASCE DESLIGADO. Sem `MOO_PUBLICAR_BEACON=1` não corre. Escrever no
 * repositório pessoal de alguém é um gesto que se pede, não se assume.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** De quanto em quanto tempo se publica. Uma ronda dura segundos; isto não. */
export const MINUTOS_OMISSAO = 10;

export function ligado(env = process.env) {
  return env.MOO_PUBLICAR_BEACON === '1';
}

function git(dir, args, runImpl) {
  return String(runImpl('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }) || '').trim();
}

/**
 * Publica UM ficheiro de beacon. Recusa-se em vez de forçar, sempre.
 *
 * @returns {{ok: boolean, porque: string, publicado?: string}}
 */
export function publicarBeacon(vaultDir, ficheiroRel, o = {}) {
  const runImpl = o.runImpl || execFileSync;
  const existsImpl = o.existsImpl || fs.existsSync;

  if (!vaultDir || !existsImpl(vaultDir)) {
    return { ok: false, porque: 'sem vault montado nesta máquina' };
  }
  if (!existsImpl(path.join(vaultDir, '.git'))) {
    return { ok: false, porque: 'o vault não é um repositório git — não há por onde publicar' };
  }

  let remoto;
  try {
    remoto = git(vaultDir, ['remote'], runImpl);
  } catch (e) {
    return { ok: false, porque: 'git indisponível: ' + String(e.message).slice(0, 80) };
  }
  if (!remoto) return { ok: false, porque: 'o vault não tem remoto — o beacon não chega a lado nenhum' };

  // A trava que importa: NUNCA se leva trabalho de outra pessoa à boleia.
  // Se houver algo em staging que não seja este beacon, este módulo pára.
  // Um publicador que empurra o que encontrou é indistinguível de um acidente.
  let staged;
  try {
    staged = git(vaultDir, ['diff', '--cached', '--name-only'], runImpl).split('\n').filter(Boolean);
  } catch (e) {
    return { ok: false, porque: 'não consegui ler o staging do vault: ' + String(e.message).slice(0, 80) };
  }
  const alheios = staged.filter((f) => f !== ficheiroRel);
  if (alheios.length > 0) {
    return { ok: false, porque: `há ${alheios.length} ficheiro(s) em staging que não são o beacon — não publico por cima de trabalho alheio` };
  }

  try {
    // `--` e o caminho exacto: nunca `git add -A`, nem sequer aqui.
    git(vaultDir, ['add', '--', ficheiroRel], runImpl);
    const paraCommit = git(vaultDir, ['diff', '--cached', '--name-only'], runImpl).split('\n').filter(Boolean);
    if (paraCommit.length === 0) {
      return { ok: true, porque: 'o beacon não mudou desde a última publicação', publicado: null };
    }
    git(vaultDir, ['commit', '-m', `chore(fleet): beacon ${path.basename(ficheiroRel, '.json')}`], runImpl);
    // Rebase antes de empurrar: dois devices a publicar em paralelo não podem
    // resultar num deles a perder o beacon do outro.
    git(vaultDir, ['pull', '--rebase', '--autostash'], runImpl);
    git(vaultDir, ['push'], runImpl);
    return { ok: true, porque: 'publicado', publicado: ficheiroRel };
  } catch (e) {
    // Um erro aqui NUNCA pode derrubar o loop: o beacon é conveniência, o
    // trabalho é a GPU. Diz-se o que falhou e continua-se.
    return { ok: false, porque: String(e.message).slice(0, 160) };
  }
}

/** Já passou tempo que chegue desde a última publicação? */
export function estaNaHora(ultimaMs, { agora = Date.now(), minutos = MINUTOS_OMISSAO } = {}) {
  if (!ultimaMs) return true;
  return agora - ultimaMs >= minutos * 60 * 1000;
}
