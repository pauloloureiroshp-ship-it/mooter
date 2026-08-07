/**
 * julgar-args.test.mjs — o painel de juízes não pode perder um juiz por um espaço.
 *
 * QUARTA APARIÇÃO do mesmo defeito nesta semana. `julgar.mjs` faz
 * `spawnSync("claude", args, { shell: true })` e mete em `args` o caminho
 * `…\Paulo Loureiro\frugal\_handoff\piloto\settings.no-mooter.json`. Com
 * `shell: true` o Node concatena sem escapar (DEP0190): o CLI recebe
 * `--settings C:\Users\Paulo` e responde `Settings file not found`.
 *
 * O que torna isto pior do que no driver: o `julgar.mjs` apanha a falha e segue —
 * `painel.push("fable5 ✗ (exit N)")`. O painel sairia com DOIS juízes em vez de
 * três, com ar de "o terceiro falhou", quando na verdade nunca correu. Um
 * veredicto de piloto com um juiz a menos por um bug de aspas é exactamente a
 * classe de mentira mecânica que esta wave existe para matar.
 *
 * O repro do mecanismo vive em `guardas.test.mjs` ("BUG 1"), e usa ESTE caminho
 * exacto — não se repete aqui. Este teste é a guarda de regressão na origem: que
 * o `julgar.mjs` nunca volte a passar o caminho em cru.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTE = readFileSync(join(HERE, "julgar.mjs"), "utf8");

test("julgar.mjs cita o caminho do --settings antes de o dar ao shell", () => {
  const usos = [...FONTE.matchAll(/"--settings"\s*,\s*([^,\]\n]+)/g)].map((m) => m[1].trim());
  assert.ok(usos.length > 0, "esperava pelo menos um --settings em julgar.mjs");
  for (const u of usos) {
    assert.match(u, /^citaArg\(/,
      `--settings passado em cru: ${u} — com shell:true parte-se no espaço de "Paulo Loureiro"`);
  }
});

test("julgar.mjs importa a guarda em vez de reimplementar aspas à mão", () => {
  assert.match(FONTE, /import\s*\{[^}]*citaArg[^}]*\}\s*from\s*["']\.\/guardas\.mjs["']/);
});

test("os spawn de julgar.mjs continuam com shell:true — o fix é citar, não tirar o shell", () => {
  // shell:false daria ENOENT: o `claude` no Windows é um shim. Medido em 2026-08-07.
  assert.match(FONTE, /shell:\s*true/);
});

/**
 * Painel de 2026-08-07T19:18Z — os três defeitos que o deixaram com UM juiz real.
 *
 *   codex ✗ (exit 1)        → o cwd isolado (mkdtemp) não é repo git e o codex
 *                             recusa: "Not inside a trusted directory". O juiz
 *                             ÂNCORA, o único de outra casa, morreu por isto.
 *   moo local ✓ com bruto:"" → o ramo do moo empurrava ✓ sem olhar para a
 *                             resposta. Um ✓ sobre nada é pior do que um ✗.
 *   prompt 82 600 tokens     → sem `num_ctx` o Ollama usa 4096: o juiz local viu
 *                             ~5% do material. Não julgou mal — não chegou a ver.
 */

test("codex corre com --skip-git-repo-check — o cwd isolado não é repo git", () => {
  assert.match(FONTE, /--skip-git-repo-check/,
    "sem isto o codex recusa o mkdtemp e o painel perde o juiz âncora");
});

test("o juiz local pede num_ctx — 82k tokens não cabem nos 4096 por omissão", () => {
  assert.match(FONTE, /num_ctx/,
    "sem num_ctx o Ollama trunca o prompt e o veredicto mede outra coisa");
});

test("nenhum juiz é dado por bom com veredicto vazio", () => {
  // O ramo do kimi já fazia `if (texto.trim())`. O do moo não fazia — e mentiu.
  const ramoMoo = FONTE.slice(FONTE.indexOf("if (!terceiraVoz)"));
  const okMoo = ramoMoo.slice(0, ramoMoo.indexOf("moo local ✓"));
  assert.match(okMoo, /\.trim\(\)/,
    "o ramo do moo tem de exigir resposta não-vazia antes de escrever ✓ no painel");
});
