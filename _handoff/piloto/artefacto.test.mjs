/**
 * artefacto.test.mjs — kit v2.2, item 1: o `done` da T1 procura o artefacto onde
 * os braços REALMENTE o põem, não onde a spec gostaria que o pusessem.
 *
 * Escrito vermelho antes do fix. As formas de caminho aqui não são inventadas:
 * saíram das transcrições da bateria-1 (2026-08-07), extraídas por grep:
 *
 *   A/e1  C:\Users\Paulo Loureiro\piloto-wt-99bb0a9a\index.html
 *   B/e1  …\Temp\claude\C--Users-Paulo-Loureiro-piloto-wt-6923bc4a\
 *           1176e1c3-1c3f-4cf8-992f-e01896cb7001\scratchpad\index.html
 *   B/e2  …\<mesma forma>\scratchpad\moo-ranch\index.html
 *
 * O uuid do caminho do scratchpad é EXACTAMENTE o `session_ids[0]` do meta.json
 * (verificado no B/e1) — é isso que torna o scratchpad localizável sem adivinhar
 * a chave de projecto que o Claude Code deriva do cwd.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { achaFicheiro, raizesDeProcura } from "./guardas.mjs";

function arvore() {
  const raiz = mkdtempSync(join(tmpdir(), "art-"));
  const wt = join(raiz, "piloto-wt-deadbeef");
  const tmpClaude = join(raiz, "tmp", "claude");
  mkdirSync(wt, { recursive: true });
  mkdirSync(tmpClaude, { recursive: true });
  return { raiz, wt, tmpClaude };
}

const SID = "1176e1c3-1c3f-4cf8-992f-e01896cb7001";

test("acha o artefacto na RAIZ da worktree (o que o braço A fez)", () => {
  const { wt, tmpClaude } = arvore();
  writeFileSync(join(wt, "index.html"), "<html>");
  const achado = achaFicheiro(raizesDeProcura(wt, [SID], tmpClaude), "index.html");
  assert.equal(achado, join(wt, "index.html"));
});

test("acha o artefacto ANINHADO na worktree (moo-ranch/index.html, o que a spec pedia)", () => {
  const { wt, tmpClaude } = arvore();
  mkdirSync(join(wt, "moo-ranch"), { recursive: true });
  writeFileSync(join(wt, "moo-ranch", "index.html"), "<html>");
  assert.equal(achaFicheiro(raizesDeProcura(wt, [SID], tmpClaude), "index.html"),
    join(wt, "moo-ranch", "index.html"));
});

test("acha o artefacto no SCRATCHPAD da sessão (o que os braços B e C fizeram)", () => {
  const { wt, tmpClaude } = arvore();
  const sp = join(tmpClaude, "C--Users-Paulo-Loureiro-piloto-wt-deadbeef", SID, "scratchpad");
  mkdirSync(sp, { recursive: true });
  writeFileSync(join(sp, "index.html"), "<html>");
  assert.equal(achaFicheiro(raizesDeProcura(wt, [SID], tmpClaude), "index.html"), join(sp, "index.html"));
});

test("acha o artefacto aninhado DENTRO do scratchpad (scratchpad/moo-ranch/, o B/e2)", () => {
  const { wt, tmpClaude } = arvore();
  const sp = join(tmpClaude, "C--Users-Paulo-Loureiro-piloto-wt-deadbeef", SID, "scratchpad", "moo-ranch");
  mkdirSync(sp, { recursive: true });
  writeFileSync(join(sp, "index.html"), "<html>");
  assert.equal(achaFicheiro(raizesDeProcura(wt, [SID], tmpClaude), "index.html"), join(sp, "index.html"));
});

test("NÃO acha o scratchpad de OUTRA sessão — um braço não herda o artefacto do vizinho", () => {
  const { wt, tmpClaude } = arvore();
  const outro = join(tmpClaude, "C--Users-Paulo-Loureiro-piloto-wt-outra",
    "ffffffff-0000-0000-0000-000000000000", "scratchpad");
  mkdirSync(outro, { recursive: true });
  writeFileSync(join(outro, "index.html"), "<html>");
  assert.equal(achaFicheiro(raizesDeProcura(wt, [SID], tmpClaude), "index.html"), null);
});

test("sem artefacto devolve null — nunca um caminho optimista", () => {
  const { wt, tmpClaude } = arvore();
  assert.equal(achaFicheiro(raizesDeProcura(wt, [SID], tmpClaude), "index.html"), null);
});

test("node_modules não conta como artefacto do braço", () => {
  const { wt, tmpClaude } = arvore();
  mkdirSync(join(wt, "node_modules", "qualquer"), { recursive: true });
  writeFileSync(join(wt, "node_modules", "qualquer", "index.html"), "<html>");
  assert.equal(achaFicheiro(raizesDeProcura(wt, [SID], tmpClaude), "index.html"), null);
});
