#!/usr/bin/env node
/**
 * montar-corpus.mjs — reune o corpus do VERIFICADOR-0 e calcula o GABARITO, tudo
 * mecanicamente e a $0. Zero geracao nova: os artefactos ja existem das baterias.
 *
 * DOMINIO 1 · codigo-com-teste — os 9 artefactos da T2/C4.
 *   gold = TEST_CMD do proprio braco (verde nos 9) + juiz neutro 5/5 (verde nos 9).
 *   ⚠️ e um corpus TODO-POSITIVO: mede falso alarme, nao consegue medir recall.
 *
 * DOMINIO 2 · visual-um-ficheiro — os 9 jogos da T1 (bateria-1).
 *   3 vinham no artefacto/; os outros 6 recuperam-se dos scratchpads pelo
 *   session_id do meta.json (a v2.1 nao os capturava).
 *   gold = os 12 itens S/N do dod_harness.mjs (Playwright, deterministico).
 *   E aqui que ha positivos E negativos, logo e aqui que accuracy/recall querem
 *   dizer alguma coisa.
 *
 * Uso: node montar-corpus.mjs        (escreve corpus/ e gold.json)
 */
import { readdirSync, existsSync, statSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const PILOTO = join(HERE, "..", "piloto");
const B1 = join(PILOTO, "runs-bateria1-invalida-2026-08-07");
const RUNS = join(PILOTO, "runs");
const TMP = "C:\\Users\\PAULOL~1\\AppData\\Local\\Temp\\claude";
const CORPUS = join(HERE, "corpus");

const anda = (dir, prof, out = []) => {
  if (prof > 5) return out;
  let es = []; try { es = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of es) {
    if (e.isFile() && e.name === "index.html") out.push(join(dir, e.name));
    else if (e.isDirectory() && e.name !== "node_modules") anda(join(dir, e.name), prof + 1, out);
  }
  return out;
};

mkdirSync(CORPUS, { recursive: true });
const gold = { gerado_em: null, dominio1: [], dominio2: [] };

// ---------- dominio 1 ----------
for (const d of readdirSync(RUNS).filter((x) => x.startsWith("T2-")).sort()) {
  const src = join(RUNS, d, "artefacto", "packages", "mooter-bridge");
  if (!existsSync(join(src, "valida-handoff.js"))) continue;
  const id = d.replace(/T2-C4-([ABC])-e(\d)-\d+/, "d1-$1e$2");
  const dest = join(CORPUS, id);
  mkdirSync(dest, { recursive: true });
  cpSync(join(src, "valida-handoff.js"), join(dest, "valida-handoff.js"));
  cpSync(join(src, "valida-handoff.test.js"), join(dest, "valida-handoff.test.js"));
  gold.dominio1.push({ id, origem: d, correcto: true,
    base: "TEST_CMD verde no run + juiz neutro 5/5 casos independentes" });
}

// ---------- dominio 2 ----------
const projectos = readdirSync(TMP).filter((x) => x.includes("piloto-wt-"));
for (const d of readdirSync(B1).filter((x) => x.startsWith("T1-")).sort()) {
  const meta = JSON.parse(readFileSync(join(B1, d, "meta.json"), "utf8"));
  const id = d.replace(/T1-([ABC])-e(\d)-\d+/, "d2-$1e$2");
  let html = anda(join(B1, d, "artefacto"), 0)[0] || null;
  let proveniencia = "artefacto/ da worktree";
  if (!html) {
    const cands = [];
    for (const p of projectos) for (const sid of meta.session_ids || []) {
      const sp = join(TMP, p, sid, "scratchpad");
      if (existsSync(sp)) cands.push(...anda(sp, 0));
    }
    html = cands.sort((a, b) => statSync(b).size - statSync(a).size)[0] || null;
    proveniencia = "recuperado do scratchpad da sessao";
  }
  if (!html) { console.error(`  ${id}: SEM ARTEFACTO — fica fora do corpus, declarado`); continue; }
  // ⚠️ O artefacto fica SOZINHO na sua pasta. O check 11 do DoD conta os ficheiros
  // do dir do artefacto ("exactamente 1, chamado index.html"), portanto pôr a saída
  // do harness ao lado dele reprova os 9 jogos por culpa do corpus, não do jogo.
  // Apanhado na 1ª montagem: item 11 dava N=9. A saída vai para irmã, não para dentro.
  const dest = join(CORPUS, id);
  mkdirSync(dest, { recursive: true });
  cpSync(html, join(dest, "index.html"));

  const outDir = join(CORPUS, "_dod", id);
  let itens = null, erro = null;
  try {
    execFileSync("node", [join(PILOTO, "dod_harness.mjs"), join(dest, "index.html"), outDir],
      { encoding: "utf8", timeout: 180000 });
    itens = JSON.parse(readFileSync(join(outDir, "dod.json"), "utf8"));
  } catch (e) { erro = String(e.message).slice(0, 200); }
  gold.dominio2.push({ id, origem: d, proveniencia, bytes: statSync(html).size, dod: itens, erro });
  console.error(`  ${id}: ${proveniencia} · ${statSync(html).size}B · dod ${itens ? (itens.score || "?") : "ERRO: " + erro}`);
}

writeFileSync(join(HERE, "gold.json"), JSON.stringify(gold, null, 2));
console.error(`\ncorpus: ${gold.dominio1.length} (dominio 1) + ${gold.dominio2.length} (dominio 2)`);
