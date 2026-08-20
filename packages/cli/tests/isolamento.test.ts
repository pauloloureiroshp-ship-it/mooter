// isolamento.test.ts — nenhum teste pode apontar ao ~/.mooter do dono.
//
// Isto ja aconteceu duas vezes, com duas semanas de intervalo:
//
//   2026-08-05  `data.test.ts` isolava-se so com HOME. O `delete-all --confirm`
//               resolveu para o `~/.mooter` REAL e apagou 232 eventos de ledger
//               mais o `decisions.log` do router.
//   2026-08-20  `wave32-integration.test.ts` isolava-se so com HOME. O mesmo
//               `delete-all --confirm`, o mesmo alvo, o mesmo estrago — desta
//               vez o ledger vivo do loop e a memoria de revisao.
//
// A correccao de Agosto foi feita na INSTANCIA: arranjou-se o `data.test.ts` e
// documentou-se o porque no topo dele. O ficheiro do lado ficou como estava, e
// nada no repo o podia dizer. Duas semanas depois voltou a acontecer, e o
// segundo estrago foi maior do que o primeiro.
//
// A CAUSA, em uma linha: no Windows o `os.homedir()` le o `USERPROFILE` e
// IGNORA o `HOME`. Um teste que exporta `HOME=<temp>` sente-se isolado e nao
// esta: todo o codigo que resolve por `homedir()` continua a apontar a casa
// verdadeira. `MOOTER_HOME` e o contrato que o codigo sob teste honra.
//
// Este ficheiro e o guarda, e nao a instancia. Falha na REVISAO, antes de
// alguem correr `npm test` e perder trabalho — que e o unico momento em que
// isto pode ser barato.
//
// ⚠️ Nao basta correr `npm test` para ver isto: o dano do defeito que este
// guarda tranca acontece EXACTAMENTE quando se corre `npm test`. E o `CLAUDE.md`
// deste repo manda todos os agentes correrem-no.

import { test } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Define `HOME` — e portanto acredita estar isolado. */
const DEFINE_HOME = /process\.env\.HOME\s*=\s*[^=]/;
/** Define o contrato que o codigo sob teste honra mesmo no Windows. */
const DEFINE_MOOTER_HOME = /process\.env\.MOOTER_HOME\s*=/;

/**
 * Todos menos este. O guarda nomeia os comandos destrutivos para os procurar,
 * portanto encontra-se sempre a si proprio — e um inspector que le o nome de
 * uma arma nao esta a disparar nenhuma. E a unica excepcao, e e por nome exacto:
 * qualquer outro ficheiro que queira escapar tem de o pedir por escrito aqui.
 */
const ESTE = "isolamento.test.ts";

function ficheirosDeTeste(): string[] {
  return readdirSync(AQUI).filter((f) => f.endsWith(".test.ts") && f !== ESTE).sort();
}

test("nenhum teste se isola so com HOME — no Windows isso nao e isolamento", () => {
  const infractores = ficheirosDeTeste().filter((f) => {
    const src = readFileSync(join(AQUI, f), "utf8");
    // Linhas de comentario nao contam: este proprio ficheiro precisa de
    // escrever o defeito para o explicar.
    const codigo = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
      .join("\n");
    return DEFINE_HOME.test(codigo) && !DEFINE_MOOTER_HOME.test(codigo);
  });

  assert.deepStrictEqual(
    infractores,
    [],
    `estes testes apontam ao ~/.mooter do dono: ${infractores.join(", ")}\n` +
      `no Windows o os.homedir() le o USERPROFILE e ignora o HOME.\n` +
      `junta process.env.MOOTER_HOME = join(<temp>, ".mooter") ao lado do HOME.`,
  );
});

// A segunda metade da mesma regra. `delete-all` tambem apaga o
// `decisions.log` do router, e esse resolve-se por `MOOTER_CLAUDE_DIR`. Em
// 2026-08-05 os dois foram pelo mesmo cano.
test("quem corre um comando destrutivo isola TAMBEM o directorio do router", () => {
  const DESTRUTIVO = /delete-all|forget-me|deleteAll|forgetMe/;
  const infractores = ficheirosDeTeste().filter((f) => {
    const src = readFileSync(join(AQUI, f), "utf8");
    const codigo = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
      .join("\n");
    if (!DESTRUTIVO.test(codigo)) return false;
    return !/process\.env\.MOOTER_CLAUDE_DIR\s*=/.test(codigo);
  });

  assert.deepStrictEqual(
    infractores,
    [],
    `estes testes correm um comando destrutivo sem isolar o MOOTER_CLAUDE_DIR: ${infractores.join(", ")}`,
  );
});
