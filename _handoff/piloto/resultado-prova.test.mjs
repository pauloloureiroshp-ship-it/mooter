/**
 * resultado-prova.test.mjs — o `resultado.md` não pode dizer que a prova de bundle
 * não existe quando ela existe.
 *
 * MEDIDO a 2026-08-07: a bateria T1 correu com a prova a dar `IGUAL 198/198`, o
 * driver escreveu-a no `driver.log` (`evento: "prova_bundle"`), e o `resultado.md`
 * saiu na mesma com:
 *
 *   runtime_bundle_sha: n/d
 *   ⚠️ 9 run(s) sem runtime_bundle_sha — ANTERIORES À PROVA DE BUNDLE
 *
 * Nenhum dos dois é verdade. O driver grava o campo no log da bateria
 * (`driver.mjs:465,479`) e nunca no `meta.json`; o `resultado.mjs` lê a ausência
 * como "run antigo". O documento canónico do piloto — aquele que existe
 * precisamente para não ter segundas verdades — publicava uma.
 *
 * O fix NÃO é editar os `meta.json` à mão: é o `resultado.mjs` ir buscar a prova
 * ao `driver.log` da própria pasta de runs, que é a fonte onde o driver a pôs, e
 * declarar de onde a tirou.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { agregar, render } from "./resultado.mjs";

const SHA_RUNTIME = "27fb623d2264d5e1396097b04fd49dfb23d2a82e1ac47155f202ccb1299cb501";
const SHA_BASE = "e8f9b25c9d7b9c0daf2f6a988da66105ce4cc073";

function bateria({ comProvaNoLog = true, comProvaNoMeta = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "res-"));
  for (const n of ["T1-A-e1-1", "T1-B-e1-2"]) {
    mkdirSync(join(dir, n), { recursive: true });
    const meta = { runId: n, "braço": n[3], tarefa: "T1", execucao: 1, base_sha: SHA_BASE,
      criterio_paragem: "cumprido", tentativas: [{ n: 0 }], wall_ms_total: 1000, intervencoes_humanas: 0 };
    if (comProvaNoMeta) meta.runtime_bundle_sha = SHA_RUNTIME;
    writeFileSync(join(dir, n, "meta.json"), JSON.stringify(meta));
  }
  if (comProvaNoLog) {
    writeFileSync(join(dir, "driver.log"),
      JSON.stringify({ evento: "prova_bundle", base_sha: SHA_BASE, runtime_bundle_sha: SHA_RUNTIME,
        igual: true, medidos: 198, total: 198 }) + "\n");
  }
  return dir;
}

test("prova no driver.log é usada quando o meta.json não a traz", () => {
  const ag = agregar(bateria({ comProvaNoLog: true }));
  assert.equal(ag.runtime_bundle_sha.valor_unico, SHA_RUNTIME,
    "o driver escreveu a prova no driver.log — o resultado tem de a ler de lá");
});

test("o resultado NÃO acusa runs de serem anteriores à prova quando a prova existe", () => {
  const md = render(agregar(bateria({ comProvaNoLog: true })));
  assert.ok(!/anteriores à prova de bundle/.test(md),
    "com prova no driver.log, essa frase é factualmente falsa");
  assert.match(md, new RegExp(SHA_RUNTIME.slice(0, 16)));
});

test("a proveniência da prova é declarada, não disfarçada de campo do meta", () => {
  const md = render(agregar(bateria({ comProvaNoLog: true })));
  assert.match(md, /driver\.log/,
    "quem lê tem de saber que o sha veio do log da bateria, não do meta.json");
});

test("sem prova em lado nenhum continua n/d — e AÍ o aviso é verdade", () => {
  const ag = agregar(bateria({ comProvaNoLog: false }));
  assert.equal(ag.runtime_bundle_sha.valor_unico, null);
  assert.match(render(ag), /n\/d/);
});

test("o meta.json ganha precedência sobre o log — o run manda no que ele próprio mediu", () => {
  const ag = agregar(bateria({ comProvaNoLog: true, comProvaNoMeta: true }));
  assert.equal(ag.runtime_bundle_sha.valor_unico, SHA_RUNTIME);
});
