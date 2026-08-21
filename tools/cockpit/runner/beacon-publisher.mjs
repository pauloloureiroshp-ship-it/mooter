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
 * Um `index.lock` é considerado órfão a partir daqui.
 *
 * Um ciclo deste publicador dura menos de um segundo. Cinco minutos é ordens de
 * grandeza acima de qualquer operação legítima — e continua a ser conservador
 * para um `git pull` lento numa ligação má.
 */
export const LOCK_ORFAO_MIN = 5;

/**
 * O vault está em condições de receber um commit?
 *
 * Recusa em três casos, e nunca força nenhum:
 *
 *  · um merge/rebase por fechar (`MERGE_HEAD`, `REBASE_HEAD`) — commitar por
 *    cima disso enterraria um conflito que alguém tem de resolver a olho
 *  · um `index.lock` FRESCO — há outro git a trabalhar, e esperar é grátis
 *  · um `index.lock` velho ANTES de o remover — só se remove o que se provou
 *    órfão pela idade, nunca por suposição
 */
export function estadoDoVault(vaultDir, { existsImpl = fs.existsSync, statImpl = fs.statSync, rmImpl = fs.rmSync, agora = Date.now() } = {}) {
  const g = (n) => path.join(vaultDir, '.git', n);
  for (const marca of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD']) {
    if (existsImpl(g(marca))) {
      return { ok: false, porque: `o vault tem um ${marca} por fechar — não commito por cima de um conflito de outra pessoa` };
    }
  }
  const lock = g('index.lock');
  if (!existsImpl(lock)) return { ok: true, porque: 'vault livre' };
  let idadeMin;
  try {
    idadeMin = (agora - statImpl(lock).mtimeMs) / 60000;
  } catch {
    return { ok: false, porque: 'há um index.lock no vault e não consegui datá-lo — não arrisco' };
  }
  if (idadeMin < LOCK_ORFAO_MIN) {
    return { ok: false, porque: `outro git está a trabalhar no vault (lock com ${Math.round(idadeMin)} min) — espero pelo próximo ciclo` };
  }
  // Órfão provado pela idade: este publicador é o suspeito mais provável, e um
  // lock esquecido bloqueia o dono. Remove-se e diz-se que se removeu.
  try {
    rmImpl(lock, { force: true });
    return { ok: true, porque: `removi um index.lock órfão de ${Math.round(idadeMin)} min` };
  } catch (e) {
    return { ok: false, porque: 'index.lock órfão que não consegui remover: ' + String(e.message).slice(0, 70) };
  }
}

/**
 * Publica UM ficheiro de beacon. Recusa-se em vez de forçar, sempre.
 *
 * @returns {{ok: boolean, porque: string, publicado?: string}}
 */
export function publicarBeacon(vaultDir, ficheiroRel, o = {}) {
  const runImpl = o.runImpl || execFileSync;
  const existsImpl = o.existsImpl || fs.existsSync;
  const statImpl = o.statImpl || fs.statSync;

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

  // ⚠️ O VAULT ESTÁ SEQUER EM CONDIÇÕES DE RECEBER UM COMMIT?
  //
  // Incidente de 2026-08-21: este publicador foi morto a meio de um ciclo git e
  // deixou um `.git/index.lock` de 0 bytes no vault PESSOAL do dono. Enquanto
  // ali esteve, TODAS as operações git naquele repositório ficaram bloqueadas —
  // incluindo as dele. Um beacon de conveniência trancou o trabalho de alguém.
  //
  // Duas coisas passam a ser verificadas antes de tocar em seja o que for, e
  // ambas RECUSAM em vez de forçar. Um publicador que "arruma" o repositório de
  // outra pessoa é mais perigoso do que um que não publica.
  const estado = estadoDoVault(vaultDir, { existsImpl, statImpl, agora: o.agora });
  if (!estado.ok) return { ok: false, porque: estado.porque };

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
