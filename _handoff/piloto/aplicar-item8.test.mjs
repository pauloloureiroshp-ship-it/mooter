/**
 * aplicar-item8.test.mjs — o veredicto humano entra pelo mesmo caminho mecânico
 * que os outros 11 itens, e recusa-se a adivinhar.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerJogar } from "./aplicar-item8.mjs";

const tabela = (linhas) => "| artefacto | venceu? | nota |\n|---|---|---|\n" + linhas.join("\n") + "\n";

test("lê S e N", () => {
  const r = lerJogar(tabela(["| ART-1 | S |  |", "| ART-2 | N | rebentou no fim |"]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.linhas.map((l) => l.venceu), ["S", "N"]);
  assert.equal(r.linhas[1].nota, "rebentou no fim");
});

test("`?` vira null COM porquê — nunca N", () => {
  const r = lerJogar(tabela(["| ART-1 | ? |  |"]));
  assert.equal(r.linhas[0].venceu, null);
  assert.match(r.linhas[0].porque, /n\/d/);
});

test("célula vazia também é n/d, não é N", () => {
  const r = lerJogar(tabela(["| ART-1 |  |  |"]));
  assert.equal(r.linhas[0].venceu, null);
});

test("valor que não é S/N/? faz RECUSAR — não se adivinha", () => {
  const r = lerJogar(tabela(["| ART-1 | talvez |  |"]));
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /não é S, N nem \?/);
});

test("aceita sim/não por extenso e ignora maiúsculas", () => {
  const r = lerJogar(tabela(["| ART-1 | sim |  |", "| ART-2 | Não |  |"]));
  assert.deepEqual(r.linhas.map((l) => l.venceu), ["S", "N"]);
});

test("tabela sem linhas ART-n é recusa, não silêncio", () => {
  const r = lerJogar("# nada aqui\n");
  assert.equal(r.ok, false);
});
