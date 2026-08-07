#!/usr/bin/env node
/**
 * aplicar-item8.mjs — o único item do DoD que o harness não mede entra pelo mesmo
 * caminho mecânico que todos os outros.
 *
 * Lê `jogar/JOGAR.md`, mapeia ART-n → run pelo `mapa.json`, e escreve o item 8 no
 * `runs/<id>/dod/dod.json`. NENHUM `meta.json` é tocado, por ninguém.
 *
 * Recusa-se a escrever se: a tabela tiver um valor que não seja S/N/?, faltar um
 * rótulo, ou o mapa não conhecer um ART-n. Recusar é melhor do que adivinhar.
 *
 * `?` grava `null` com o porquê — nunca "N". Não conseguir jogar não é perder.
 *
 * Uso: node aplicar-item8.mjs [--dry]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
// ⚠️ `pathToFileURL` e não uma comparação de strings à mão: `import.meta.url` vem
// percent-encoded ("Paulo%20Loureiro") e o `process.argv[1]` não. A primeira versão
// deste ficheiro saiu com exit 0 e ZERO output por causa disso — o mesmo defeito que
// o `prova-bundle.mjs:215` já tinha documentado. Segunda superfície, mesmo bug.
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ID_ITEM8 = 8;

/** Extrai os veredictos da tabela do JOGAR.md. Devolve {ok, linhas[], erros[]}. */
export function lerJogar(texto) {
  const linhas = [];
  const erros = [];
  for (const l of String(texto || "").split("\n")) {
    const m = l.match(/^\|\s*(ART-\d+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/);
    if (!m) continue;
    const [, rotulo, bruto, nota] = m;
    const v = bruto.trim().toUpperCase();
    if (v === "S" || v === "SIM") linhas.push({ rotulo, venceu: "S", nota: nota.trim() || null });
    else if (v === "N" || v === "NAO" || v === "NÃO") linhas.push({ rotulo, venceu: "N", nota: nota.trim() || null });
    else if (v === "?" || v === "") linhas.push({ rotulo, venceu: null, nota: nota.trim() || null, porque: "o Paulo não conseguiu decidir — n/d declarado, nunca convertido em N" });
    else erros.push(`${rotulo}: valor "${bruto.trim()}" não é S, N nem ? — não se adivinha`);
  }
  if (!linhas.length && !erros.length) erros.push("nenhuma linha ART-n encontrada na tabela");
  return { ok: erros.length === 0, linhas, erros };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const jogarF = join(HERE, "jogar", "JOGAR.md");
  if (!existsSync(jogarF)) { console.error(`RECUSADO: ${jogarF} não existe`); process.exit(1); }
  const { ok, linhas, erros } = lerJogar(readFileSync(jogarF, "utf8"));
  if (!ok) { console.error("RECUSADO — nada escrito:"); for (const e of erros) console.error(`  - ${e}`); process.exit(1); }

  const mapa = JSON.parse(readFileSync(join(HERE, "mapa.json"), "utf8"));
  const semMapa = linhas.filter((l) => !mapa.atribuicao[l.rotulo]);
  if (semMapa.length) { console.error(`RECUSADO: sem mapa para ${semMapa.map((x) => x.rotulo).join(", ")}`); process.exit(1); }

  const dry = process.argv.includes("--dry");
  let escritos = 0, nd = 0;
  for (const l of linhas) {
    const runRel = mapa.atribuicao[l.rotulo];                    // ex.: runs/T1-B-e2-…/artefacto
    const dodF = join(HERE, dirname(runRel), "dod", "dod.json");
    if (!existsSync(dodF)) { console.error(`  ! ${l.rotulo}: dod.json ausente em ${dodF} — saltado, declarado`); continue; }
    const dod = JSON.parse(readFileSync(dodF, "utf8"));
    const item = (dod.itens || []).find((i) => i.id === ID_ITEM8);
    if (!item) { console.error(`  ! ${l.rotulo}: item ${ID_ITEM8} ausente do dod.json — saltado`); continue; }
    item.resultado = l.venceu ?? "n/d";
    item.fonte = "humano (Paulo), jogado — o harness não verifica este item";
    item.porque = l.venceu ? null : l.porque;
    if (l.nota) item.nota_humana = l.nota;
    // score_dod passa a contar 12 quando o item 8 tem resposta; declara-se a base.
    const objectivos = (dod.itens || []).filter((i) => i.resultado === "S" || i.resultado === "N");
    dod.score_dod = `${objectivos.filter((i) => i.resultado === "S").length}/${objectivos.length}`;
    dod.score_base = `${objectivos.length} itens com resposta objectiva (dos 12; os restantes ficam n/d)`;
    if (!dry) writeFileSync(dodF, JSON.stringify(dod, null, 2));
    if (l.venceu) escritos++; else nd++;
    console.log(`  ${l.rotulo} → ${dirname(runRel).replace("runs/", "")}: item 8 = ${l.venceu ?? "n/d"} · score ${dod.score_dod}`);
  }
  console.log(`\n${dry ? "[DRY] " : ""}${escritos} veredicto(s) humano(s) escritos · ${nd} n/d declarado(s)`);
  if (!dry) console.log("A seguir: node resultado.mjs && node dossier.mjs");
}
