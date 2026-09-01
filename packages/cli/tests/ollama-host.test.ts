// ollama-host.test.ts — a mesma regra, do lado do CLI, provada contra a MESMA
// tabela de casos que o motor usa.
//
// A duplicação de `normalizeOllamaHost` entre `tools/router/ollama-host.js` e
// `packages/cli/src/ollama-host.ts` é uma fronteira de EMPACOTAMENTO (o bundle
// esbuild do CLI não arrasta código de fora do pacote), não de conhecimento. Os
// testes correm no repo, não no bundle — por isso podem ler a tabela do outro
// lado, e é isso que impede as duas de divergirem em silêncio.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeOllamaHost, ollamaHostFromEnv, DEFAULT_OLLAMA_HOST } from "../src/ollama-host.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CASOS_PATH = join(AQUI, "..", "..", "..", "tools", "router", "ollama-host.casos.json");

type Caso = { entrada: string | null; esperado: string; porque: string };

function carregarCasos(): Caso[] {
  const raw = JSON.parse(readFileSync(CASOS_PATH, "utf8"));
  return raw.casos as Caso[];
}

test("a tabela de casos partilhada existe e não está vazia", () => {
  // Guarda contra o modo de falha que este ficheiro inteiro tem: se o caminho
  // partir (mudança de layout), um `for` sobre lista vazia passa verde tendo
  // corrido zero asserções.
  const casos = carregarCasos();
  assert.ok(casos.length >= 10, `só ${casos.length} casos — a tabela partilhada não foi lida`);
  assert.ok(casos.some((c) => c.entrada === "127.0.0.1:11434"),
    "o caso canónico (sem esquema) tem de estar na tabela");
});

test("normalizeOllamaHost cumpre TODOS os casos partilhados com o motor", () => {
  for (const c of carregarCasos()) {
    const esperado = c.esperado === "__DEFAULT__" ? DEFAULT_OLLAMA_HOST : c.esperado;
    assert.equal(
      normalizeOllamaHost(c.entrada),
      esperado,
      `${JSON.stringify(c.entrada)} → esperado ${esperado} · ${c.porque}`,
    );
  }
});

test("o fallback do chamador também é normalizado", () => {
  // O audit usa `host.docker.internal:11434` como default. Um default mal
  // escrito partia exactamente como a env partia.
  assert.equal(
    normalizeOllamaHost("", "host.docker.internal:11434"),
    "http://host.docker.internal:11434",
  );
});

test("ollamaHostFromEnv lê a env já normalizada", () => {
  assert.equal(
    ollamaHostFromEnv(undefined, { OLLAMA_HOST: "127.0.0.1:11434" } as NodeJS.ProcessEnv),
    "http://127.0.0.1:11434",
  );
  assert.equal(
    ollamaHostFromEnv("http://host.docker.internal:11434", {} as NodeJS.ProcessEnv),
    "http://host.docker.internal:11434",
  );
});

test("o resultado serve sempre de base a new URL — é o uso real nos 4 sítios", () => {
  for (const c of carregarCasos()) {
    const base = normalizeOllamaHost(c.entrada);
    assert.doesNotThrow(
      () => new URL("/api/generate", base),
      `new URL falhou com base derivada de ${JSON.stringify(c.entrada)} → ${base}`,
    );
  }
});

test("nenhum dos 4 sítios voltou a ler OLLAMA_HOST cru", () => {
  // A mordida de cobertura, do lado do CLI. Sem ela, o quinto sítio nasce
  // partido em silêncio — foi assim que estes quatro chegaram aqui.
  const alvos = [
    join(AQUI, "..", "src", "audit", "orchestrator.ts"),
    join(AQUI, "..", "src", "commands", "init.ts"),
    join(AQUI, "..", "src", "commands", "quant-vector.ts"),
    join(AQUI, "..", "src", "fable-observe", "cca-f-audit.ts"),
  ];
  for (const f of alvos) {
    const src = readFileSync(f, "utf8");
    if (!/process\.env\.OLLAMA_HOST/.test(src)) continue;
    assert.match(
      src,
      /ollama-host/,
      `${f} lê process.env.OLLAMA_HOST sem importar o normalizador`,
    );
  }
});
