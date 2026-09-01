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

/**
 * O UNICO sitio do vault onde este modulo pode escrever.
 *
 * Ate 2026-09-01 o `ficheiroRel` vinha de fora e nao era verificado: este
 * publicador podia commitar QUALQUER caminho do vault PESSOAL do dono — notas,
 * canon, estrategia. Nunca o fez, e essa nao e a questao. Um modulo que corre
 * sozinho de 10 em 10 minutos com permissao de escrita ilimitada num
 * repositorio pessoal e um raio de accao que ninguem autorizou, e a defesa
 * "mas ele so passa beacons" e uma convencao de chamada, nao uma trava.
 */
export const PASTA_DOS_BEACONS = '50-fleet/';

/**
 * A pasta ISOLADA do modo chave-de-deploy (M10).
 *
 * Uma chave de deploy so-escrita limita o REPOSITORIO; nao limita o caminho
 * dentro dele. `50-fleet/` e partilhada com o que ja la esta; `50-fleet/90-beacons/`
 * nasce vazia e so tem beacons, portanto uma regra de branch protection ou um
 * hook no vault pode dizer "esta chave so escreve aqui" sem ambiguidade.
 *
 * NAO se aperta a guarda por omissao: hoje os beacons vivem em `50-fleet/<device>.json`
 * (`fleet-beacon.mjs:127`), e mudar isso sem o modo ligado partiria a publicacao
 * que ja funciona. A migracao faz parte do gesto do dono, e esta escrita em
 * `_handoff/BEACON-DEPLOY-KEY.md`.
 */
export const PASTA_ISOLADA = '50-fleet/90-beacons/';

/** O caminho pedido cabe dentro da pasta dos beacons? */
export function dentroDaPasta(ficheiroRel, { pasta = PASTA_DOS_BEACONS } = {}) {
  const rel = String(ficheiroRel || '').replace(/\\/g, '/');
  if (!rel || rel.startsWith('/') || /(?:^|\/)\.\.(?:\/|$)/.test(rel)) return false;
  return rel.startsWith(pasta) && rel.endsWith('.json');
}

/**
 * MODO CHAVE DE DEPLOY (M10) — o mecanismo, atras de uma segunda bandeira.
 *
 * Publicar com as credenciais do dono significa que este processo empurra COM A
 * IDENTIDADE DELE, para qualquer repositorio a que ele tenha acesso. A
 * alternativa e uma chave de deploy so-escrita, com acesso a UM repositorio, que
 * se revoga sozinha sem lhe tocar na conta.
 *
 * `IdentitiesOnly=yes` nao e detalhe: sem isso o ssh oferece TODAS as chaves do
 * agente antes da que lhe demos, e o push seguiria com a identidade pessoal na
 * mesma — a chave nova ficava a enfeitar.
 *
 * ⚠️ DESLIGADO POR OMISSAO, e a activacao e ata do dono. O criterio (3
 * renovacoes seguidas em <15 min) so se pode medir DEPOIS de ligar; declara-lo
 * cumprido antes seria inventar. Ver `_handoff/BEACON-DEPLOY-KEY.md`.
 */
export function modoDeploy(env = process.env, { existsImpl = fs.existsSync } = {}) {
  if (env.MOO_BEACON_PUSH !== '1') {
    return { ligado: false, chave: null, porque: 'modo chave-de-deploy desligado (MOO_BEACON_PUSH != 1)' };
  }
  const chave = env.MOO_BEACON_CHAVE;
  if (!chave) {
    return { ligado: false, chave: null, erro: true, porque: 'MOO_BEACON_PUSH=1 sem MOO_BEACON_CHAVE — nao ha chave nenhuma para usar' };
  }
  if (!existsImpl(chave)) {
    // FAIL-CLOSED. Cair para as credenciais do dono porque a chave nao esta la
    // seria exactamente o contrario do que este modo existe para fazer.
    return { ligado: false, chave: null, erro: true, porque: `MOO_BEACON_CHAVE aponta para um ficheiro que nao existe: ${chave}` };
  }
  return {
    ligado: true,
    chave,
    porque: 'chave de deploy so-escrita, com IdentitiesOnly',
    env: {
      GIT_SSH_COMMAND: `ssh -i ${chave} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`,
    },
  };
}

function git(dir, args, runImpl, extraEnv = null) {
  return String(runImpl('git', args, {
    cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    ...(extraEnv ? { env: { ...process.env, ...extraEnv } } : {}),
  }) || '').trim();
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
  // A trava de RAIO DE ACCAO, antes de tudo o resto: este modulo so pode
  // escrever dentro da pasta dos beacons. Um publicador automatico com escrita
  // ilimitada num vault pessoal e um raio que ninguem autorizou.
  const deploy = o.modoDeploy || modoDeploy(o.env || process.env, { existsImpl });
  if (deploy.erro) return { ok: false, porque: deploy.porque };
  // Com a chave de deploy, a pasta aperta: a chave limita o REPOSITORIO, e o
  // caminho dentro dele tem de ser limitado aqui.
  const pasta = deploy.ligado ? PASTA_ISOLADA : PASTA_DOS_BEACONS;
  if (!dentroDaPasta(ficheiroRel, { pasta })) {
    return { ok: false, porque: `\`${ficheiroRel}\` está fora de \`${pasta}\` — este módulo só publica beacons` };
  }
  const gitEnv = deploy.ligado ? deploy.env : null;
  if (!existsImpl(path.join(vaultDir, '.git'))) {
    return { ok: false, porque: 'o vault não é um repositório git — não há por onde publicar' };
  }

  let remoto;
  try {
    remoto = git(vaultDir, ['remote'], runImpl, gitEnv);
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
    staged = git(vaultDir, ['diff', '--cached', '--name-only'], runImpl, gitEnv).split('\n').filter(Boolean);
  } catch (e) {
    return { ok: false, porque: 'não consegui ler o staging do vault: ' + String(e.message).slice(0, 80) };
  }
  const alheios = staged.filter((f) => f !== ficheiroRel);
  if (alheios.length > 0) {
    return { ok: false, porque: `há ${alheios.length} ficheiro(s) em staging que não são o beacon — não publico por cima de trabalho alheio` };
  }

  try {
    // `--` e o caminho exacto: nunca `git add -A`, nem sequer aqui.
    git(vaultDir, ['add', '--', ficheiroRel], runImpl, gitEnv);
    const paraCommit = git(vaultDir, ['diff', '--cached', '--name-only'], runImpl, gitEnv).split('\n').filter(Boolean);
    if (paraCommit.length === 0) {
      return { ok: true, porque: 'o beacon não mudou desde a última publicação', publicado: null };
    }
    git(vaultDir, ['commit', '-m', `chore(fleet): beacon ${path.basename(ficheiroRel, '.json')}`], runImpl, gitEnv);
    // Rebase antes de empurrar: dois devices a publicar em paralelo não podem
    // resultar num deles a perder o beacon do outro.
    git(vaultDir, ['pull', '--rebase', '--autostash'], runImpl, gitEnv);
    git(vaultDir, ['push'], runImpl, gitEnv);
    return {
      ok: true,
      porque: deploy.ligado ? 'publicado com chave de deploy' : 'publicado',
      publicado: ficheiroRel,
      via: deploy.ligado ? 'chave-de-deploy' : 'credenciais-do-dono',
    };
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
