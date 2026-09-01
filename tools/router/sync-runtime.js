#!/usr/bin/env node
// sync-runtime.js — espelha o runtime do router para ~/.claude/tools/router/.
//
// ─────────────────────────────────────────────────────────────────────────────
// PORQUE ESTE FICHEIRO EXISTE
//
// O Step 5 do `/mooter-update` fazia:
//
//     for f in ~/frugal/tools/router/*.js; do cp "$f" ~/.claude/tools/router/; done
//
// `*.js` **não desce a subpastas**. Medido a 2026-08-31, logo a seguir a um
// update que imprimiu cinco ✓ e passou todos os gates:
//
//   · `tools/router/*.js`           → 204 ficheiros de runtime copiados
//   · `tools/router/providers/*.js` → **0** — a pasta inteira ficou de fora
//
// Nesse dia isso significou que a correcção do `ollama-api.js` (o motor $0 que
// falhava mudo) ficou em `~/frugal` e **nunca chegou ao runtime**; o
// `ollama-host.js` novo aterrou na raiz e ficou órfão, requerido por ninguém.
// Como o ficheiro velho não requer o novo, não houve erro de `require`: o update
// declarou sucesso e o motor continuou morto. E o `deepseek-v4.js` nunca tinha
// estado no runtime — quem sabe desde quando.
//
// O comentário do próprio Step 5 conta que uma lista à mão já tinha perdido
// ficheiros de runtime **duas vezes** (Wave 13, Wave 58) e que por isso passaram
// a glob. Passaram — a glob **de um nível**. A classe do defeito sobreviveu à
// correcção dela.
//
// O `install.sh` já sabia disto: as linhas 158-160 copiam `providers/`
// explicitamente, com a nota «(Wave 61). Copy the providers/ subdir explicitly.»
// Ou seja, o defeito real não era o glob — era **o instalador e o updater terem
// duas definições diferentes do que é «o runtime»**. Uma máquina acabada de
// instalar e uma máquina actualizada não convergiam.
//
// Este ficheiro passa a ser a definição única, do mesmo modo que `sync-hooks.js`
// é a definição única dos hooks ligados. Mantém-se em lockstep com `install.sh`.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE CONTA COMO RUNTIME (derivado, com uma lista só de exclusão)
//
//   · todo o `.js` que não seja `*.test.js`, **recursivamente**;
//   · todo o `.json` que algum desses `.js` mencione pelo nome, menos a
//     configuração de projecto (`JSON_NUNCA`, abaixo);
//   · e, por cima de tudo isso, **só o que está versionado no git**
//     (`ficheirosVersionados`) — a regra que impede o espelho de arrastar
//     `coverage/` e os 12 `.json` de estado local de um checkout de trabalho;
//   · **menos os hooks ligados** (`hooksLigados`), que pertencem a
//     `~/.claude/hooks/` e cuja cópia aqui é só uma cópia a envelhecer.
//
// A segunda regra dispensa uma lista de inclusão: `safety_seeds.json` estava
// ausente do runtime e é requerido por código — passa a propagar-se sozinho, e
// qualquer `.json` de dados que venha a ser requerido também.
//
// A menção é por substring, e isso é grosseiro de propósito (é barato e nunca
// perde um require). O preço é apanhar menções em comentários: na primeira
// corrida do `--check` arrastou `package.json`, `tsconfig.json` e
// `.prettierrc.json`, nomeados de passagem em `arbiter.js`, `classify.js` e
// `env.js`. Daí o `JSON_NUNCA` — ver lá porque um `package.json` no runtime é
// perigoso e porque a lista de exclusão é o lado seguro de errar.
//
// Excepção declarada: `version.json` entra sempre. É o SSOT de `mooter --version`
// e nenhum `.js` o menciona por nome (é lido por caminho construído), pelo que a
// regra acima não o apanharia — e já ficou preso em 0.11.0 enquanto o repo ia
// em 1.38.0.
//
// Uso:
//   node sync-runtime.js            # espelha
//   node sync-runtime.js --check    # não escreve; falha se houver divergência
//   node sync-runtime.js --src DIR  # origem explícita
//   node sync-runtime.js --dest DIR # destino explícito (o install.sh usa-o)
//
// Nunca lança para o chamador: devolve código de saída, imprime o que fez.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

/**
 * O QUE O REPO DISTRIBUI É O QUE ESTÁ VERSIONADO — e mais nada.
 *
 * Apanhado a 2026-08-31 na primeira corrida real a partir de `~/frugal`, que
 * (ao contrário de um worktree limpo) é um checkout DE TRABALHO. Sem este
 * filtro, o espelho arrastava:
 *
 *   · `coverage/lcov-report/*.js` — artefactos de uma corrida de testes;
 *   · **12 `.json` de estado local**: `router-tuning.json`, `quota-state.json`,
 *     `tuning-state.json`, `subscription-profile.json`, `hw-capability.json`,
 *     os quatro caches `.*-cache.json`, `mooter-tester-*`, …
 *
 * O segundo grupo é o perigoso, e não por ocupar espaço: são estados de DUAS
 * instalações diferentes. Copiar o do repo por cima do do runtime é apagar o
 * que o runtime aprendeu — o `router-tuning.json` é escrito pelo backtest
 * directamente em `~/.claude/tools/router/`, e um sync que o sobreponha desfaz
 * o tuning da máquina em silêncio, no mesmo passo que diz `✓ synced`.
 *
 * `git ls-files` responde a isto sem lista à mão: estado local nunca está
 * versionado, artefactos de build nunca estão versionados. Sem git (uma
 * instalação por tarball), não há estado local na origem — devolve-se `null` e
 * o chamador segue sem filtro.
 */
function ficheirosVersionados(raiz) {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: raiz, encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000,
    });
    const lista = out.toString('utf8').split('\0').filter(Boolean);
    if (!lista.length) return null;
    return new Set(lista.map((p) => path.normalize(p)));
  } catch {
    return null; // não é repo git, ou git ausente — sem filtro
  }
}

/** `version.json` é lido por caminho construído, logo nenhum `.js` o nomeia. */
const JSON_SEMPRE = ['version.json'];

/**
 * Configuração de PROJECTO — nunca runtime, por muito que o código os mencione.
 *
 * A regra «copia o `.json` que algum `.js` nomeie» é boa para dados
 * (`gold-labels`, `safety_seeds`) e péssima para estes: basta um comentário a
 * dizer «ver package.json» para os arrastar. Apanhado a 2026-08-31 na primeira
 * corrida do `--check`, que os listou por causa de menções em `arbiter.js`,
 * `classify.js` e `env.js`.
 *
 * O perigo não é teórico: `~/.claude/tools/router/` não é um pacote npm, e um
 * `package.json` ali passa a governar a resolução de módulos daquela árvore. Hoje
 * `tools/router/package.json` não declara `type`, portanto seria inofensivo — mas
 * no dia em que alguém lhe puser `"type": "module"`, este sync copiava-o e
 * **partia todos os `require()` do runtime de uma vez**, sem uma linha de aviso.
 *
 * Isto é uma lista à mão, e é de propósito: uma lista de EXCLUSÃO que envelhece
 * copia um ficheiro a mais — visível e inofensivo. Uma lista de INCLUSÃO que
 * envelhece perde ficheiros em silêncio, que é exactamente o defeito que este
 * ficheiro existe para matar.
 */
const JSON_NUNCA = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  '.prettierrc.json',
  '.eslintrc.json',
]);

/**
 * Os hooks ligados vivem em `~/.claude/hooks/`, NÃO aqui.
 *
 * O `install.sh` copia-os para `$HOOKS_DIR` e a seguir faz `rm -f` da cópia em
 * `~/.claude/tools/router/` — de propósito: os `require('./_model-resolver')` do
 * `exec-logger.js` e do `PostToolUse.js` resolvem-se ao lado do hook, e uma
 * segunda cópia no router é só uma cópia a envelhecer sem ninguém a carregar.
 *
 * O espelho copiava-os na mesma e recriava essa cópia a cada update — a «4.ª
 * cópia da statusline» que já custou uma sessão inteira ao dono: com uma origem
 * stale, o ficheiro novo era sobreposto pelo velho e o sync dizia «synced».
 *
 * A lista vem do `sync-hooks.js`, que é quem a define. Duplicá-la aqui seria
 * criar o mesmo drift que este ficheiro existe para fechar. Se esse módulo não
 * carregar, devolve-se lista vazia: o espelho volta ao comportamento antigo
 * (copiar a mais) em vez de rebentar.
 */
function hooksLigados() {
  try {
    const { WIRED_HOOKS } = require('./sync-hooks.js');
    return new Set(Array.isArray(WIRED_HOOKS) ? WIRED_HOOKS : []);
  } catch {
    return new Set();
  }
}

/** Subpastas que NUNCA são runtime, custe o que custar. */
const PASTAS_IGNORADAS = new Set(['node_modules', '.git', '__pycache__', 'benchmark-results', 'coverage']);

function homeDir() {
  return process.env.MOOTER_HOME_OVERRIDE || os.homedir();
}

/**
 * Origem canónica. Mesma precedência do `sync-hooks.js`, de propósito:
 * `--src` explícito → `$HOME/frugal/tools/router` (a convenção da skill) → a
 * pasta deste próprio ficheiro (a cópia de runtime, já espelhada).
 */
function resolveSrcDir(explicit) {
  if (explicit) return path.resolve(explicit);
  const convencao = path.join(homeDir(), 'frugal', 'tools', 'router');
  if (fs.existsSync(path.join(convencao, 'classify.js'))) return convencao;
  return __dirname;
}

/**
 * Destino. `--dest` explícito ganha a tudo — o `install.sh` tem
 * `CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"`, sobreponível por variável de
 * ambiente, e um espelho que assumisse `~/.claude` escrevia no sítio errado
 * para quem a define.
 */
function destDir(home, dest) {
  if (dest) return path.resolve(dest);
  return path.join(home || homeDir(), '.claude', 'tools', 'router');
}

/** Todos os `.js` não-teste, recursivamente, como caminhos relativos a `raiz`. */
function listarJs(raiz, sub = '', out = []) {
  const dir = path.join(raiz, sub);
  let entradas;
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entradas) {
    const rel = sub ? path.join(sub, e.name) : e.name;
    if (e.isDirectory()) {
      if (PASTAS_IGNORADAS.has(e.name)) continue;
      listarJs(raiz, rel, out);
      continue;
    }
    if (!e.name.endsWith('.js')) continue;
    if (e.name.endsWith('.test.js')) continue;
    out.push(rel);
  }
  return out;
}

/**
 * Os `.json` do nível 1 que algum `.js` de runtime menciona pelo nome, mais os
 * de `JSON_SEMPRE`. Derivado, não listado — ver o cabeçalho.
 */
function listarJson(raiz, ficheirosJs) {
  let candidatos;
  try {
    candidatos = fs.readdirSync(raiz).filter((n) => n.endsWith('.json'));
  } catch { return []; }

  let corpus = '';
  for (const rel of ficheirosJs) {
    try { corpus += fs.readFileSync(path.join(raiz, rel), 'utf8'); }
    catch { /* ficheiro ilegível não vota */ }
  }

  const escolhidos = new Set(JSON_SEMPRE.filter((n) => candidatos.includes(n)));
  for (const nome of candidatos) {
    if (JSON_NUNCA.has(nome)) continue;
    if (corpus.includes(nome)) escolhidos.add(nome);
  }
  return [...escolhidos].sort();
}

/** Diferentes se o destino não existe ou o conteúdo não bate certo. */
function precisaCopia(origem, destino) {
  let a, b;
  try { a = fs.readFileSync(origem); } catch { return false; }
  try { b = fs.readFileSync(destino); } catch { return true; }
  return !a.equals(b);
}

/**
 * @param {object} [opts]
 * @param {string} [opts.src]   origem
 * @param {string} [opts.home]  home (para testes)
 * @param {boolean} [opts.check] não escreve; só relata divergência
 */
function sync(opts = {}) {
  const src = resolveSrcDir(opts.src);
  const dst = destDir(opts.home, opts.dest);

  // `opts.versionados === null` desliga o filtro explicitamente (testes).
  const versionados = opts.versionados !== undefined ? opts.versionados : ficheirosVersionados(src);
  const distribuivel = (rel) => !versionados || versionados.has(path.normalize(rel));

  const hooks = opts.hooks !== undefined ? opts.hooks : hooksLigados();
  // Só no nível 1: os hooks ligados vivem todos na raiz de tools/router/.
  const ehHook = (rel) => !rel.includes(path.sep) && hooks.has(rel);

  // `listarJson` lê o corpo dos `.js` para descobrir que `.json` são precisos —
  // e os hooks contam para isso, mesmo não sendo copiados para aqui. Excluí-los
  // ANTES da derivação faria desaparecer um `.json` que só o hook menciona.
  const jsTodos = listarJs(src).filter(distribuivel);
  const json = listarJson(src, jsTodos).filter(distribuivel);
  const js = jsTodos.filter((rel) => !ehHook(rel));
  const todos = [...js, ...json];

  const emFalta = [];
  const copiados = [];

  for (const rel of todos) {
    const origem = path.join(src, rel);
    const destino = path.join(dst, rel);
    if (!precisaCopia(origem, destino)) continue;
    emFalta.push(rel);
    if (opts.check) continue;
    try {
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(origem, destino);
      copiados.push(rel);
    } catch (err) {
      // Um ficheiro que não copia não pode matar o resto do espelho.
      emFalta.push(`${rel} (falhou: ${(err && err.message) || 'erro'})`);
    }
  }

  // Cópias de hooks que ficaram no router de updates anteriores. Reporta-se,
  // NÃO se apaga: um espelho que apaga ficheiros é uma ferramenta diferente, e
  // muito mais perigosa, do que um que copia. Quem decide remover é o dono.
  const hooksOrfaos = [...hooks].filter((h) => fs.existsSync(path.join(dst, h))).sort();

  return { src, dst, total: todos.length, js: js.length, json, emFalta, copiados, hooksOrfaos };
}

function main(argv) {
  const check = argv.includes('--check');
  const iSrc = argv.indexOf('--src');
  const src = iSrc >= 0 ? argv[iSrc + 1] : undefined;
  const iDest = argv.indexOf('--dest');
  const dest = iDest >= 0 ? argv[iDest + 1] : undefined;

  const r = sync({ src, dest, check });
  console.log(`runtime mirror: ${r.src} -> ${r.dst}`);
  console.log(`  ${r.js} .js (recursivo, sem testes) + ${r.json.length} .json derivados: ${r.json.join(', ')}`);
  if (r.hooksOrfaos.length) {
    console.log(`  nota: ${r.hooksOrfaos.length} cópia(s) de hooks ligados ainda no router (o install apaga-as; nós não):`);
    console.log(`    ${r.hooksOrfaos.join(', ')}`);
    console.log('    vivem em ~/.claude/hooks/ — estas não são carregadas por ninguém.');
  }

  if (check) {
    if (r.emFalta.length === 0) {
      console.log(`  OK self-check: runtime em dia (${r.total} ficheiros)`);
      return 0;
    }
    console.log(`  WARNING: ${r.emFalta.length} ficheiro(s) divergem do repo — corre sem --check:`);
    for (const f of r.emFalta.slice(0, 20)) console.log(`    · ${f}`);
    if (r.emFalta.length > 20) console.log(`    … e mais ${r.emFalta.length - 20}`);
    return 1;
  }

  if (r.copiados.length === 0) console.log('  . identical: nada a copiar');
  else {
    console.log(`  ✓ ${r.copiados.length} copiado(s)`);
    for (const f of r.copiados.slice(0, 20)) console.log(`    · ${f}`);
    if (r.copiados.length > 20) console.log(`    … e mais ${r.copiados.length - 20}`);
  }
  return 0;
}

module.exports = { sync, listarJs, listarJson, ficheirosVersionados, hooksLigados, resolveSrcDir, destDir, JSON_SEMPRE, JSON_NUNCA, PASTAS_IGNORADAS };

if (require.main === module) process.exit(main(process.argv.slice(2)));
