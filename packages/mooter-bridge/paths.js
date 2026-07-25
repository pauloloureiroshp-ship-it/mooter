'use strict';
/**
 * paths.js — mooter-bridge v1.4.2: comparar caminhos em Windows sem mentir.
 *
 * O bug, apanhado a correr a suite no Windows real em 2026-07-25:
 *
 *   os.tmpdir()            → C:\Users\PAULOL~1\AppData\Local\Temp   (forma 8.3)
 *   fs.mkdtempSync(...)    → C:\Users\PAULOL~1\AppData\Local\Temp\x
 *   git worktree list      → C:\Users\Paulo Loureiro\...            (forma longa)
 *
 * `path.resolve` NÃO normaliza entre as duas: são a mesma pasta no disco e
 * strings completamente diferentes. Consequências medidas:
 *   · o guard recusou worktrees legítimas — "worktree fora da raiz permitida"
 *   · `isTemp()` não reconhecia o temp, e o picker relocalizava sem razão
 *   · três suites falharam por motivos que nada tinham a ver com o código
 *
 * `fs.realpathSync.native()` resolve 8.3 → longa, e resolve também junctions e
 * symlinks — que é exactamente o que uma comparação de caminhos precisa. Se o
 * caminho ainda não existir (uma worktree por criar), caímos para `path.resolve`,
 * que é o melhor palpite honesto.
 *
 * Nunca comparar caminhos com `===` outra vez. É esta a razão.
 */

const fs = require('fs');
const path = require('path');

const cache = new Map();

/** Caminho canónico: 8.3 resolvido, symlinks resolvidos, minúsculas em Windows. */
function canon(p) {
  if (!p) return '';
  const chave = String(p);
  if (cache.has(chave)) return cache.get(chave);
  let out;
  try {
    out = fs.realpathSync.native(chave);
  } catch {
    // ainda não existe: o melhor que podemos afirmar é a resolução do path
    out = path.resolve(chave);
  }
  if (process.platform === 'win32') out = out.toLowerCase();
  cache.set(chave, out);
  return out;
}

/** Dois caminhos apontam para a mesma pasta/ficheiro? */
function mesmo(a, b) { return canon(a) === canon(b); }

/** `filho` está dentro de `pai` (ou é o próprio)? */
function dentroDe(filho, pai) {
  const f = canon(filho);
  const p = canon(pai);
  if (!f || !p) return false;
  return f === p || f.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

/**
 * Chave de comparação TOLERANTE, para caminhos que vêm de fontes estranhas
 * (ficheiros de sessão, ledger antigo) e que podem nem existir no disco: além
 * do canon, unifica separadores, colapsa `//` e tira a barra final.
 *
 * ⚠️ Não usar em guards de segurança — para "está dentro de?" usa `dentroDe`,
 * que é estrito de propósito.
 */
function chave(p) {
  return canon(p).replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase();
}

function limparCache() { cache.clear(); }

module.exports = { canon, mesmo, dentroDe, chave, limparCache };
