#!/usr/bin/env node
/**
 * gh-bin.mjs — onde esta o `gh`, e a resposta honesta quando nao esta em lado nenhum.
 *
 * O DEFEITO QUE ISTO FECHA, medido a 2026-09-01 no live test do dono:
 * o `/ledger` servido mostrava `CI & PULL REQUESTS -> n/d — o gh nao esta
 * instalado nesta maquina`. O `gh` ESTA instalado — em
 * `~/.local/bin/gh` — e a mesma chamada corrida do terminal devolvia
 * `{disponivel:true, prs_abertos:30, ...}`. A diferenca nao era a maquina: era
 * o PROCESSO. O F10 corre sob launchd, e o launchd nao le o perfil da shell:
 *
 *     $ ps -Eww -o command= -p <pid do f10> | tr ' ' '\n' | grep ^PATH=
 *     PATH=/usr/bin:/bin:/usr/sbin:/sbin
 *
 * Nesse PATH nao ha `gh` nenhum, e `execFileSync('gh', ...)` da ENOENT.
 * Reproduzido a frio, com o PATH exacto do launchd:
 *
 *     $ env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=$HOME node -e "...ciEPrs()"
 *     {"disponivel":false,"porque":"n/d — o `gh` nao esta instalado nesta maquina"}
 *
 * DUAS HIPOTESES, E PORQUE ESTA.
 *
 *  (a) `EnvironmentVariables/PATH` no molde do plist. Recusada. O molde ja avisa,
 *      em maiusculas, que caminhos absolutos por-maquina commitados falham em
 *      SILENCIO noutro computador — e um PATH cravado e exactamente isso. Pior:
 *      neste Mac o `gh` nao esta em `/opt/homebrew/bin` nem em `/usr/local/bin`,
 *      esta em `~/.local/bin`. Um PATH "com os caminhos do Homebrew" teria
 *      passado em revisao e NAO teria corrigido a maquina onde o defeito foi
 *      medido. E so cobriria o launchd: um cron, um container de CI ou um
 *      LaunchAgent novo trariam o mesmo defeito de volta.
 *  (b) Resolver o binario em codigo — esta. Corrige onde quer que o processo
 *      corra, nao tem nada de por-maquina para commitar, e e testavel sem disco.
 *
 * NAO EXECUTA NADA para procurar. Nem `which`, nem `where` — os dois precisam
 * de estar eles proprios no PATH, que e o recurso que aqui esta em falta.
 * So `fs.existsSync` sobre dois conjuntos de directorios.
 *
 * PRIVACIDADE: o caminho resolvido contem o nome do utilizador
 * (`/Users/<alguem>/.local/bin/gh`) e o consumidor deste modulo acaba num HTML
 * que se envia a terceiros. Quem chama publica a FONTE (`PATH` / `fora-do-PATH`),
 * nunca o caminho. `redigirCasa()` esta aqui para o mesmo fim.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Nomes do executavel, por plataforma. */
export function nomesDe(binario, plataforma) {
  return plataforma === 'win32'
    ? [`${binario}.exe`, `${binario}.cmd`, `${binario}.bat`]
    : [binario];
}

/**
 * Os sitios onde um `gh` instalado costuma estar e que o PATH do launchd nao
 * tem. Ordem = preferencia. Nao pretende ser exaustiva: pretende ser honesta
 * sobre o que cobre, e por isso a mensagem de falha DIZ quantos procurou.
 */
export function caminhosHabituais({ home = os.homedir(), env = process.env, plataforma = process.platform } = {}) {
  // `path` e nao `path.win32`/`path.posix` seria o disco DESTE processo a
  // decidir por uma plataforma que o chamador nomeou. Um teste de Windows
  // corrido no Mac saía `C:\bin/gh.exe` — separador trocado a meio.
  const P = plataforma === 'win32' ? path.win32 : path.posix;
  if (plataforma === 'win32') {
    const lad = env.LOCALAPPDATA || P.join(home, 'AppData', 'Local');
    const pf = env.ProgramFiles || 'C:\\Program Files';
    return [P.join(lad, 'Programs', 'GitHub CLI'), P.join(pf, 'GitHub CLI', 'bin'), P.join(pf, 'GitHub CLI')];
  }
  return [
    P.join(home, '.local', 'bin'),   // onde ele esta NESTA maquina — o caso medido
    '/opt/homebrew/bin',                // Homebrew em Apple Silicon
    '/usr/local/bin',                   // Homebrew em Intel, e a maioria dos Linux
    '/home/linuxbrew/.linuxbrew/bin',
    P.join(home, 'bin'),
    '/snap/bin',
    '/usr/bin',
    '/bin',
  ];
}

/**
 * Onde esta o binario. `{ caminho, fonte, procurados }`.
 *
 * `fonte` e a parte util para diagnostico: `'PATH'` quer dizer que o processo
 * estava bem servido; `'fora-do-PATH'` quer dizer que ISTO foi o que o salvou —
 * e e o sinal de que o processo corre com um ambiente mais pobre do que o do
 * dono. `null` quer dizer que nao o encontrei, e nada mais do que isso.
 */
export function resolverBin(binario, {
  env = process.env,
  home = os.homedir(),
  plataforma = process.platform,
  existsImpl = fs.existsSync,
} = {}) {
  const P = plataforma === 'win32' ? path.win32 : path.posix;
  const nomes = nomesDe(binario, plataforma);
  const doPath = String(env.PATH || env.Path || '').split(P.delimiter).filter(Boolean);
  const habituais = caminhosHabituais({ home, env, plataforma });
  const procurados = [];
  for (const [dirs, fonte] of [[doPath, 'PATH'], [habituais, 'fora-do-PATH']]) {
    for (const dir of dirs) {
      for (const nome of nomes) {
        const p = P.join(dir, nome);
        procurados.push(p);
        try { if (existsImpl(p)) return { caminho: p, fonte, procurados }; } catch { /* dir ilegivel */ }
      }
    }
  }
  return { caminho: null, fonte: null, procurados, path_do_processo: env.PATH || env.Path || '' };
}

export const resolverGh = (opts) => resolverBin('gh', opts);

/** O nome do utilizador nao viaja para dentro de um HTML que se partilha. */
export function redigirCasa(texto, { home = os.homedir() } = {}) {
  if (!home) return String(texto);
  return String(texto).split(home).join('~');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = resolverGh();
  process.stdout.write(`${JSON.stringify({
    caminho: r.caminho ? redigirCasa(r.caminho) : null,
    fonte: r.fonte,
    procurados: r.procurados.length,
    path_do_processo: process.env.PATH,
  }, null, 2)}\n`);
}
