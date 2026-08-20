// mooter-home.test.ts — o `.mooter` tem UMA morada, e resolve-se num sitio so.
//
// PORQUE EXISTE. A 2026-08-20 mediram-se **19 ficheiros** em `src/commands/`
// com a sua propria copia de `join(homedir(), ".mooter")`, e nenhuma delas
// olhava para o `MOOTER_HOME`. Duas consequencias, ambas medidas:
//
//   1. 13 testes vermelhos no Windows, sempre os mesmos. O teste escrevia numa
//      casa temporaria e o comando escrevia noutra — e como o `os.homedir()` no
//      Windows le o `USERPROFILE` e IGNORA o `HOME`, "noutra" queria dizer a
//      casa VERDADEIRA de quem corria a suite.
//   2. `npm test` sujava essa casa. Entre o que la deixava estava o
//      `effort.json` com `mode: "high"` — ou seja, correr a suite MUDAVA o modo
//      de esforco da maquina. Depois desta migracao: 7 artefactos -> 1.
//
// E o mesmo defeito que apagou o `~/.mooter` vivo do dono duas vezes (05/08 e
// 20/08, ver #325). A causa nunca foi um ficheiro: foi a regra existir em 19
// copias e nenhuma ser a fonte.
//
// Este ficheiro e o guarda. Falha na REVISAO, que e onde isto e barato — o dano
// do defeito acontece exactamente quando alguem corre `npm test`.

import { test } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, sep } from "node:path";

import { mooterHomeDefault, mooterHomeParent } from "../src/packs.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");

/** `join(homedir(), ".mooter")` — a copia que nao pode voltar a nascer. */
const COPIA = /homedir\(\)\s*,\s*["'`]\.mooter["'`]/;

/**
 * Os que ainda nao foram migrados. **A lista SO PODE ENCOLHER** — o teste no
 * fim deste ficheiro falha se crescer. Nao e absolvicao: e divida com nome.
 *
 * Ficaram de fora desta passagem de proposito, porque migra-los muda
 * comportamento e merece revisao propria:
 *   · `data.ts` — e o GDPR (`export`/`delete-all`). Mudar-lhe a resolucao de
 *     casa muda o que o `delete-all` APAGA. Nao se toca de passagem.
 *   · os restantes — leitura de diagnostico (doctor, dashboard, statusline…);
 *     erram para o lado seguro (leem a casa real, que e o que o dono quer ver).
 */
const POR_MIGRAR = [
  // `packs.ts` E a fonte: e ali que vive o `join(homedir(), ".mooter")` de
  // recurso, quando nao ha `MOOTER_HOME`. Um inspector que se acusa a si proprio
  // por conter a regra que define nao inspecciona nada. Unica excepcao por
  // natureza; as outras sao divida.
  "packs.ts",
  "commands/agents.ts",
  "commands/coherence.ts",
  "commands/dashboard.ts",
  "commands/data.ts",
  "commands/doctor.ts",
  "commands/env-detect.ts",
  "commands/init.ts",
  "commands/pastor.ts",
  "commands/quiet.ts",
  "commands/sessions.ts",
  "commands/stats-reconcile.ts",
  "commands/statusline.ts",
  "commands/terminal.ts",
  "commands/workflows.ts",
];

function ficheirosTs(dir: string, prefixo = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const rel = prefixo ? `${prefixo}/${e}` : e;
    if (statSync(p).isDirectory()) out.push(...ficheirosTs(p, rel));
    else if (e.endsWith(".ts")) out.push(rel);
  }
  return out;
}

/** Linhas de comentario nao contam: este ficheiro precisa de escrever o defeito. */
function codigo(p: string): string {
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");
}

test("a resolucao do ~/.mooter honra MOOTER_HOME — no Windows o HOME nao chega", () => {
  const antes = process.env.MOOTER_HOME;
  try {
    process.env.MOOTER_HOME = join("/tmp", "isolado", ".mooter");
    assert.strictEqual(
      mooterHomeDefault().split(sep).join("/"),
      "/tmp/isolado/.mooter",
      "MOOTER_HOME tem de ganhar ao homedir()",
    );
    assert.strictEqual(
      mooterHomeParent().split(sep).join("/"),
      "/tmp/isolado",
      "o pai deriva da MESMA fonte — nao ha duas respostas a mesma pergunta",
    );
    delete process.env.MOOTER_HOME;
    assert.match(mooterHomeDefault(), /\.mooter$/, "sem a variavel, cai no homedir()");
  } finally {
    if (antes === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = antes;
  }
});

test("nenhum ficheiro NOVO faz a sua propria copia de join(homedir(), '.mooter')", () => {
  const infractores = ficheirosTs(SRC)
    .filter((rel) => COPIA.test(codigo(join(SRC, rel))))
    .filter((rel) => !POR_MIGRAR.includes(rel));

  assert.deepStrictEqual(
    infractores,
    [],
    `estes resolvem o ~/.mooter por conta propria: ${infractores.join(", ")}\n` +
      `usa \`mooterHomeDefault()\` de src/packs.ts — no Windows o os.homedir() le o\n` +
      `USERPROFILE e ignora o HOME, portanto a tua copia aponta a casa verdadeira\n` +
      `de quem correr a suite. Ja custou o ~/.mooter vivo do dono duas vezes.`,
  );
});

/**
 * O ratchet. A divida so anda num sentido; para a aumentar, alguem tem de mudar
 * este numero — e ai a pergunta "porque e que voltamos a espalhar a regra?"
 * aparece na revisao, que e onde deve estar.
 */
test("a lista de por-migrar SO PODE ENCOLHER", () => {
  assert.ok(
    POR_MIGRAR.length <= 15,
    `a lista tem ${POR_MIGRAR.length} entradas e o tecto e 15 — 14 por migrar + o packs.ts, que e a fonte (eram 19 copias a 2026-08-20)`,
  );
});
