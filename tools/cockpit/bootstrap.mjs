#!/usr/bin/env node
/**
 * bootstrap.mjs — de zero a device alinhado, com um comando.
 *
 * O problema que resolve é de galinha-e-ovo. A skill `/moo-sync` vive em
 * `~/.claude/skills/`, e quem a põe lá é o `device:sync` do repo. Numa máquina
 * onde o repo ainda não existe, a skill também não existe — logo não há slash
 * command nenhum para lançar. Alguma coisa tem de chegar primeiro.
 *
 * O vault já chega a todas as máquinas: é um repo git que o dono clona de
 * qualquer maneira. Por isso o arranque vive lá, em três linhas que só sabem
 * clonar este repo e delegar. Um stub que não faz nada não fica desactualizado
 * — a lógica toda está aqui, e este ficheiro anda sempre com o resto.
 *
 * Ordem, e a razão de cada passo estar onde está:
 *
 *   1. o REPO, porque tudo o resto vive dentro dele
 *   2. o `device:sync`, que espelha runtime, skills e índice do vault
 *   3. o RELATÓRIO do que falta — e o que falta é sempre um gesto humano
 *
 * Uso (em qualquer device com o vault clonado):
 *   node ~/paulo-vault/.claude/moo-bootstrap.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const REPO_URL = 'https://github.com/pauloloureiroshp-ship-it/mooter.git';
export const VAULT_URL = 'git@github.com:pauloloureiroshp-ship-it/paulo-vault.git';

/**
 * A pasta de um clone NOVO. `mooter`, que e o nome do projecto.
 *
 * As maquinas antigas nao sao afectadas: quando este ficheiro corre de dentro
 * de um repo, o caminho deriva-se de onde ele esta e a pasta pode chamar-se o
 * que se quiser. Isto so decide onde POR um clone que ainda nao existe.
 */
export const PASTA_OMISSAO = 'mooter';

/**
 * Onde o repo vive.
 *
 * Deriva-se de ONDE ESTE FICHEIRO ESTA quando ele ja corre de dentro do repo —
 * nao ha nome nenhum para cravar, e um repo clonado com outro nome continua a
 * funcionar. So o caso do clone precisa de um destino, e esse respeita
 * `MOOTER_REPO` antes de assumir o que quer que seja.
 */
export function caminhoDoRepo(home = os.homedir(), env = process.env, aqui = null) {
  if (env.MOOTER_REPO) return env.MOOTER_REPO;
  const meu = aqui || path.dirname(new URL(import.meta.url).pathname);
  const raiz = path.resolve(meu, '..', '..');
  try { if (fs.existsSync(path.join(raiz, '.git'))) return raiz; } catch { /* segue */ }
  return path.join(home, PASTA_OMISSAO);
}

function correr(bin, args, cwd) {
  return String(execFileSync(bin, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
}

/**
 * Garante que o repo existe e está em dia.
 * @returns {{estado: 'clonado'|'actualizado'|'ja-em-dia'|'falhou', porque?: string}}
 */
export function garantirRepo(destino, { existsImpl = fs.existsSync, runImpl = correr } = {}) {
  if (!existsImpl(path.join(destino, '.git'))) {
    try {
      runImpl('git', ['clone', REPO_URL, destino], path.dirname(destino));
      return { estado: 'clonado' };
    } catch (e) {
      return { estado: 'falhou', porque: String(e.message).slice(0, 140) };
    }
  }
  try {
    const atras = Number(runImpl('git', ['rev-list', '--count', 'HEAD..origin/main'], destino));
    if (atras === 0) return { estado: 'ja-em-dia' };
    runImpl('git', ['pull', '--ff-only', 'origin', 'main'], destino);
    return { estado: 'actualizado' };
  } catch (e) {
    // Um repo que existe e não puxa continua utilizável — segue-se com o que há
    // e diz-se. Parar aqui deixaria a máquina sem nada, o que é pior.
    return { estado: 'falhou', porque: String(e.message).slice(0, 140) };
  }
}

/** As variáveis que este device precisa, e o gesto certo para cada sistema. */
export function variaveisEmFalta(env = process.env, plataforma = os.platform()) {
  const home = plataforma === 'win32' ? '$HOME' : '~';
  const definir = (nome, valor) => (plataforma === 'win32'
    ? `[Environment]::SetEnvironmentVariable('${nome}', "${valor}", 'User')   # e reabre o PowerShell`
    : `echo 'export ${nome}=${valor}' >> ~/.zshrc && source ~/.zshrc`);
  const faltam = [];
  if (!env.VAULT_PATH) {
    faltam.push({ nome: 'VAULT_PATH', porque: 'sem isto a frota é um device só', gesto: definir('VAULT_PATH', `${home}/paulo-vault`) });
  }
  if (env.MOO_PUBLICAR_BEACON !== '1') {
    faltam.push({ nome: 'MOO_PUBLICAR_BEACON', porque: 'o beacon fica no disco e nunca sai da máquina', gesto: definir('MOO_PUBLICAR_BEACON', '1') });
  }
  return faltam;
}

async function main() {
  const home = os.homedir();
  const destino = caminhoDoRepo(home);
  console.log(`\n  Mooter · arranque deste device`);
  console.log(`  ${os.platform()} · ${os.hostname()}\n`);

  const repo = garantirRepo(destino);
  const rotulo = {
    clonado: `repo clonado em ${destino}`,
    actualizado: 'repo actualizado',
    'ja-em-dia': 'repo já em dia',
    falhou: `repo NÃO actualizado — ${repo.porque}`,
  }[repo.estado];
  console.log(`  ${repo.estado === 'falhou' ? '✗' : '✓'} ${rotulo}`);

  if (repo.estado === 'falhou' && !fs.existsSync(path.join(destino, '.git'))) {
    console.log(`\n  Sem repo não há nada para alinhar. Clona-o à mão e volta a correr:`);
    console.log(`      git clone ${REPO_URL} "${destino}"\n`);
    return;
  }

  console.log('');
  try {
    // Delegado de propósito: o alinhamento tem UM dono, e é o `sync-device`.
    // Duas cópias da mesma lógica divergem no dia em que uma delas é corrigida.
    const saida = execFileSync(process.execPath, [path.join(destino, 'tools', 'cockpit', 'sync-device.mjs')],
      { cwd: destino, encoding: 'utf8' });
    console.log(saida.split('\n').slice(2).join('\n'));
  } catch (e) {
    console.log(`  (o alinhamento não correu: ${String(e.message).slice(0, 90)})\n`);
  }

  const faltam = variaveisEmFalta();
  if (faltam.length) {
    console.log('  VARIÁVEIS — uma vez por máquina, e a frota depende delas:');
    for (const v of faltam) {
      console.log(`     ✗ ${v.nome} — ${v.porque}`);
      console.log(`        ${v.gesto}`);
    }
    console.log('');
  }

  // E levanta. Dizer "a seguir corre X" e pedir a alguem que se lembre de mais
  // um passo — e o passo que se esquece e sempre o ultimo. `--so-alinhar` para
  // quem quer mesmo parar aqui.
  if (process.argv.includes('--so-alinhar')) {
    console.log(`  Alinhado. Para levantar o cockpit:  cd "${destino}" && npm run pilot\n`);
    return;
  }
  console.log('  a levantar o cockpit deste device...\n');
  try {
    execFileSync(process.execPath, [path.join(destino, 'tools', 'cockpit', 'runner', 'launch.mjs'), '--no-sync'],
      { cwd: destino, stdio: 'inherit' });
  } catch (e) {
    console.log(`\n  O cockpit nao subiu: ${String(e && e.message).slice(0, 90)}`);
    console.log(`  Tenta a mao:  cd "${destino}" && npm run pilot\n`);
  }
}

const chamadoDirectamente = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (chamadoDirectamente) main();
