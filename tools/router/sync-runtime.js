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
//     configuração de projecto (`JSON_NUNCA`, abaixo).
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
//
// Nunca lança para o chamador: devolve código de saída, imprime o que fez.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

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

/** Subpastas que NUNCA são runtime, custe o que custar. */
const PASTAS_IGNORADAS = new Set(['node_modules', '.git', '__pycache__', 'benchmark-results']);

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

function destDir(home) {
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
  const dst = destDir(opts.home);

  const js = listarJs(src);
  const json = listarJson(src, js);
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

  return { src, dst, total: todos.length, js: js.length, json, emFalta, copiados };
}

function main(argv) {
  const check = argv.includes('--check');
  const iSrc = argv.indexOf('--src');
  const src = iSrc >= 0 ? argv[iSrc + 1] : undefined;

  const r = sync({ src, check });
  console.log(`runtime mirror: ${r.src} -> ${r.dst}`);
  console.log(`  ${r.js} .js (recursivo, sem testes) + ${r.json.length} .json derivados: ${r.json.join(', ')}`);

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

module.exports = { sync, listarJs, listarJson, resolveSrcDir, destDir, JSON_SEMPRE, JSON_NUNCA, PASTAS_IGNORADAS };

if (require.main === module) process.exit(main(process.argv.slice(2)));
