// Pack state helpers (Wave 3 Day 2) — shared by `mooter dashboard` (PACK section)
// and `mooter hub`. Reads the local schemas the wizard/router already write.
//
// Honesty: there is NO per-pack time-series usage log in this build, so usage
// counts are reported as "no usage data yet" rather than fabricated. We surface
// only what exists: the installed list (installed.json) and the active pack
// (last-decision.json, if the router wrote one).

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

/**
 * O directorio `.mooter` deste utilizador — A fonte, e nao mais uma copia.
 *
 * `MOOTER_HOME` ganha ao `homedir()`, e nao e preferencia de estilo: no Windows
 * o `os.homedir()` le o `USERPROFILE` e IGNORA o `HOME`, portanto um teste que
 * se isole exportando `HOME` continua a apontar a casa verdadeira. Foi assim
 * que `npm test` apagou o `~/.mooter` vivo do dono duas vezes — 2026-08-05 (232
 * eventos de ledger) e 2026-08-20 (o ledger do loop e a memoria de revisao).
 * `MOOTER_HOME` e o contrato que o resto do repo ja honra (`tools/cockpit`,
 * `packages/data-rights`); faltava aqui.
 *
 * Medido a 2026-08-20: 19 ficheiros de `commands/` tinham a sua propria copia
 * de `join(homedir(), ".mooter")` e nenhuma delas olhava para o `MOOTER_HOME`.
 * Resultado visivel: 13 testes vermelhos no Windows, sempre os mesmos, e uma
 * suite que escrevia na maquina de quem a corria. `mooter-home.test.ts` e o
 * guarda que impede a copia numero 20.
 */
export function mooterHomeDefault(): string {
  return process.env.MOOTER_HOME || join(homedir(), ".mooter");
}

/**
 * O PAI do `.mooter` — para as APIs que recebem a casa e juntam o `.mooter`
 * elas proprias (`packages/effort`, `packages/transparency`). Derivado da mesma
 * fonte, para nao haver duas respostas a mesma pergunta.
 */
export function mooterHomeParent(): string {
  return dirname(mooterHomeDefault());
}

/** Installed pack ids from installed.json (sorted). Missing file → []. */
export function listInstalledPacks(mooterHome: string = mooterHomeDefault()): string[] {
  try {
    const obj = JSON.parse(readFileSync(join(mooterHome, "installed.json"), "utf8"));
    return Array.isArray(obj.packs) ? obj.packs.filter((p: unknown) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** Active pack from last-decision.json, or null (GENERAL/AMBIGUOUS/absent → null). */
export function getActivePack(mooterHome: string = mooterHomeDefault()): string | null {
  try {
    const obj = JSON.parse(readFileSync(join(mooterHome, "last-decision.json"), "utf8"));
    const pid = obj && obj.pack_id;
    return typeof pid === "string" && pid !== "GENERAL" && pid !== "AMBIGUOUS" ? pid : null;
  } catch {
    return null;
  }
}
