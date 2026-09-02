'use strict';
/**
 * bin-resolver.js — onde esta o binario, para o conector nao morrer num ENOENT.
 *
 * ── O DEFEITO QUE ISTO FECHA, medido a 2026-09-02 ───────────────────────────
 *
 * Seis tarefas despachadas pelo conector. Duas correram no motor local. As
 * outras quatro nao chegaram a existir:
 *
 *     codex  ->  proc-error: spawn codex ENOENT
 *
 * O `codex` ESTA instalado nesta maquina, em `~/.local/node/bin/codex`. A
 * diferenca nao era a maquina: era o PROCESSO. O Claude Desktop lanca o
 * conector com um PATH que nao tem `~/.local/bin`, `~/.local/node/bin`, nem o
 * Homebrew — e `spawn('codex', …)` da ENOENT.
 *
 * E exactamente a mesma classe do `gh` sob launchd, que ja tem solucao neste
 * repo (`tools/cockpit/runner/gh-bin.mjs`) e a mesma decisao: resolver o
 * binario em CODIGO, e nunca cravar um PATH por-maquina num ficheiro
 * commitado — um PATH "com os caminhos do Homebrew" teria passado em revisao e
 * NAO teria corrigido esta maquina, onde os binarios estao noutro sitio.
 *
 * ── PORQUE E UMA SEGUNDA COPIA E NAO UM IMPORT ──────────────────────────────
 *
 * O bundle esbuild deste pacote nao arrasta codigo de fora do pacote
 * (AGENTS.md, Conventions). E uma fronteira de EMPACOTAMENTO, nao de
 * conhecimento. Precedente exacto: `packages/cli/src/ollama-host.ts`, que
 * duplica `tools/router/ollama-host.js` pela mesma razao.
 *
 * Para as duas copias nao divergirem em silencio, ambas sao provadas contra a
 * MESMA tabela: `tools/cockpit/runner/bin-resolver.casos.json`. Os testes
 * correm no repo, nao no bundle, e a fronteira nao se lhes aplica. Mordida
 * verificada: alterar um caso da tabela reprova os dois lados.
 *
 * ── NAO EXECUTA NADA ────────────────────────────────────────────────────────
 *
 * Nem `which`, nem `where` — os dois precisam de estar eles proprios no PATH,
 * que e precisamente o recurso em falta. So `fs.existsSync`.
 *
 * PRIVACIDADE: o caminho resolvido contem o nome do utilizador. Quem chama
 * publica a FONTE (`PATH` / `fora-do-PATH`), nunca o caminho.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Nomes do executavel, por plataforma. Em Windows a ordem e a preferencia.
 *
 * Identico, propositadamente, ao `nomesDe` do `gh-bin.mjs`: um teste de
 * paridade compara as duas listas nome a nome. Duas copias da mesma regra
 * podem divergir; duas copias provadas contra a mesma tabela nao podem
 * divergir em silencio.
 */
function nomesDe(binario, plataforma) {
  return plataforma === 'win32'
    ? [`${binario}.exe`, `${binario}.cmd`, `${binario}.bat`]
    : [binario];
}

/**
 * Os sitios onde um CLI instalado costuma estar e que um PATH pobre nao tem.
 * Ordem = preferencia. Nao pretende ser exaustiva: pretende ser honesta sobre
 * o que cobre, e por isso quem falha DIZ quantos caminhos procurou.
 *
 * `~/.local/node/bin` esta aqui porque e onde o `codex`, o `kimi` e o `gemini`
 * estao NESTA maquina — o caso medido. Uma lista que so tivesse o Homebrew
 * teria passado em revisao e nao teria corrigido nada.
 */
function caminhosHabituais({ home = os.homedir(), env = process.env, plataforma = process.platform } = {}) {
  // `path` cru seria o disco DESTE processo a decidir por uma plataforma que o
  // chamador nomeou: um teste de Windows corrido no Mac saia com o separador
  // trocado a meio.
  const P = plataforma === 'win32' ? path.win32 : path.posix;
  if (plataforma === 'win32') {
    const lad = env.LOCALAPPDATA || P.join(home, 'AppData', 'Local');
    const ad = env.APPDATA || P.join(home, 'AppData', 'Roaming');
    const pf = env.ProgramFiles || 'C:\\Program Files';
    return [
      P.join(lad, 'Programs'), P.join(lad, 'Microsoft', 'WindowsApps'),
      P.join(ad, 'npm'), P.join(pf, 'nodejs'),
    ];
  }
  return [
    P.join(home, '.local', 'bin'),        // onde o `claude` e o `gh` estao nesta maquina
    P.join(home, '.local', 'node', 'bin'), // onde o `codex`, o `kimi` e o `gemini` estao nesta maquina
    '/opt/homebrew/bin',                   // Homebrew em Apple Silicon
    '/usr/local/bin',                      // Homebrew em Intel, e a maioria dos Linux
    '/home/linuxbrew/.linuxbrew/bin',
    P.join(home, 'bin'),
    P.join(home, '.bun', 'bin'),
    P.join(home, '.volta', 'bin'),
    '/snap/bin',
    '/usr/bin',
    '/bin',
  ];
}

/**
 * Onde esta o binario. `{ caminho, fonte, procurados }`.
 *
 * `fonte` e a parte util: `'PATH'` quer dizer que o processo estava bem
 * servido; `'fora-do-PATH'` quer dizer que ISTO foi o que o salvou — e e o
 * sinal de que o conector corre com um ambiente mais pobre do que o do dono.
 * `null` quer dizer que nao o encontrei, e nada mais do que isso.
 */
function resolverBin(binario, {
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

/** O nome do utilizador nao viaja para dentro de um payload que se partilha. */
function redigirCasa(texto, { home = os.homedir() } = {}) {
  if (!home) return String(texto);
  return String(texto).split(home).join('~');
}

module.exports = { nomesDe, caminhosHabituais, resolverBin, redigirCasa };
