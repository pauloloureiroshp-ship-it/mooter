/**
 * isolamento.test.mjs — kit v2.3: detecção + quarentena determinística.
 *
 * PORQUE EXISTE. A worktree opaca do §2.3 não isola nada: na bateria-1 os braços B/e2
 * e B/e3 escreveram em `~\moo-ranch\` e `~\moo-ranch-b\`, fora de qualquer worktree,
 * e a transcrição do B/e3 declara ter encontrado lá "build anterior (não minha),
 * intacta". O veneno não é a fuga em si — é o run N ver o build do run N-1 e
 * partir com vantagem que não é dele.
 *
 * NÃO tentamos sandbox de OS: `CLAUDE_CONFIG_DIR` já provou que parte o login
 * (`Not logged in`, medido). A escolha é detectar e declarar, não fingir prender:
 *   · ANTES de cada run — o que estiver na HOME a bater o padrão vai para quarentena
 *     datada, para o run nascer cego ao anterior;
 *   · DEPOIS — o que apareceu de novo é fuga, anexada ao run e DECLARADA no
 *     meta.json. Nunca invalida em silêncio.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { padroesDeFuga, listaCandidatos, quarentena, fugasNovas } from "./guardas.mjs";

function homeFalsa(nomes = []) {
  const home = mkdtempSync(join(tmpdir(), "homefalsa-"));
  for (const n of nomes) {
    mkdirSync(join(home, n), { recursive: true });
    writeFileSync(join(home, n, "index.html"), "<html>");
  }
  return home;
}

test("padroesDeFuga tira o primeiro segmento do caminho do artefacto", () => {
  assert.deepEqual(padroesDeFuga("moo-ranch/index.html"), ["moo-ranch"]);
  assert.deepEqual(padroesDeFuga("moo-ranch\\index.html"), ["moo-ranch"]);
});

test("padroesDeFuga recusa padrões perigosos — nunca varre a HOME às cegas", () => {
  // um artefacto na raiz não dá padrão nenhum: preferimos não detectar a apagar a casa
  assert.deepEqual(padroesDeFuga("index.html"), []);
  assert.deepEqual(padroesDeFuga(""), []);
  assert.deepEqual(padroesDeFuga("ab/index.html"), []);   // segmento curto (<4) é recusado
});

test("listaCandidatos apanha o nome exacto e os sufixados (-b, -2)", () => {
  const home = homeFalsa(["moo-ranch", "moo-ranch-b", "moo-ranch-2"]);
  const nomes = listaCandidatos(home, ["moo-ranch"]).map((c) => c.nome).sort();
  assert.deepEqual(nomes, ["moo-ranch", "moo-ranch-2", "moo-ranch-b"]);
});

test("listaCandidatos NÃO apanha o que não bate o prefixo", () => {
  const home = homeFalsa(["moo-ranch", "Documents", "frugal", "paulo-vault", "moo"]);
  assert.deepEqual(listaCandidatos(home, ["moo-ranch"]).map((c) => c.nome), ["moo-ranch"]);
});

test("listaCandidatos ignora ficheiros — só directórios de trabalho contam", () => {
  const home = homeFalsa(["moo-ranch"]);
  writeFileSync(join(home, "moo-ranch.txt"), "nota");
  assert.deepEqual(listaCandidatos(home, ["moo-ranch"]).map((c) => c.nome), ["moo-ranch"]);
});

test("quarentena move para o destino e deixa a HOME cega ao run anterior", () => {
  const home = homeFalsa(["moo-ranch", "moo-ranch-b"]);
  const dest = join(mkdtempSync(join(tmpdir(), "quar-")), "2026-08-07-runX");
  const movidos = quarentena(listaCandidatos(home, ["moo-ranch"]), dest);
  assert.equal(movidos.length, 2);
  assert.equal(listaCandidatos(home, ["moo-ranch"]).length, 0, "a HOME tem de ficar sem candidatos");
  assert.ok(existsSync(join(dest, "moo-ranch", "index.html")), "o conteúdo viaja, não se perde");
  assert.ok(existsSync(join(dest, "moo-ranch-b", "index.html")));
});

test("quarentena sem candidatos não cria lixo nem falha", () => {
  const home = homeFalsa([]);
  const dest = join(mkdtempSync(join(tmpdir(), "quar-")), "vazio");
  assert.deepEqual(quarentena(listaCandidatos(home, ["moo-ranch"]), dest), []);
  assert.equal(existsSync(dest), false, "sem fuga não se cria pasta de quarentena");
});

test("fugasNovas é a diferença antes→depois, não o total", () => {
  assert.deepEqual(fugasNovas(["moo-ranch"], ["moo-ranch", "moo-ranch-b"]), ["moo-ranch-b"]);
  assert.deepEqual(fugasNovas([], ["moo-ranch"]), ["moo-ranch"]);
  assert.deepEqual(fugasNovas(["moo-ranch"], ["moo-ranch"]), []);
  assert.deepEqual(fugasNovas(["moo-ranch"], []), []);   // desaparecer não é fuga
});
