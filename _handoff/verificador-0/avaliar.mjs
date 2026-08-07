#!/usr/bin/env node
/**
 * avaliar.mjs — juizos vs gabarito. Mecanico, sem LLM, sem interpretacao.
 *
 * Reporta, para cada modelo:
 *   · accuracy (criterio do Paulo) — global e SO nos itens discriminantes
 *   · consistencia 3x (criterio do Paulo)
 *   · recall e precisao na classe das FALHAS (a objeccao registada no pre-registo)
 *   · baseline "responder sempre a maioritaria", ao lado, sempre
 *   · custo e tempo reais
 *
 * Resposta que nao parseia conta como ERRO e como falha de consistencia — nunca
 * se descarta. Descartar o ilegivel foi como o cross_check pariu 18 falsos positivos.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const gold = JSON.parse(readFileSync(join(HERE, "gold.json"), "utf8"));
const JUIZOS = join(HERE, "juizos");

// gabarito do dominio 2: id do jogo -> { itemId: "S"|"N" }, item 8 (humano) fora
const goldD2 = new Map();
for (const j of gold.dominio2) {
  if (!j.dod) continue;
  const m = {};
  for (const it of j.dod.itens) {
    const r = String(it.resultado);
    if (r === "S" || r === "N") m[it.id] = r;
  }
  goldD2.set(j.id, m);
}
const goldD1 = new Map(gold.dominio1.map((x) => [x.id, x.correcto ? "S" : "N"]));

// itens que discriminam = os que nao sao constantes no gabarito
const contagem = new Map();
for (const m of goldD2.values()) for (const [k, v] of Object.entries(m)) {
  const c = contagem.get(k) || { S: 0, N: 0 }; c[v]++; contagem.set(k, c);
}
const DISCRIMINANTES = new Set([...contagem.entries()].filter(([, c]) => c.S > 0 && c.N > 0).map(([k]) => k));

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "n/d");

for (const f of readdirSync(JUIZOS).filter((x) => x.endsWith(".json")).sort()) {
  const J = JSON.parse(readFileSync(join(JUIZOS, f), "utf8"));
  const d1 = J.resultados.filter((r) => r.dominio === "dominio1");
  const d2 = J.resultados.filter((r) => r.dominio === "dominio2");
  console.log(`\n=============== ${J.modelo}  (temp ${J.temperatura}, ctx ${J.num_ctx}, ${J.repeticoes}x) — ${f}`);

  // ---------- dominio 2 ----------
  if (d2.length) {
    let cert = 0, tot = 0, certD = 0, totD = 0, erros = 0;
    let tp = 0, fp = 0, fn = 0;                    // classe positiva = "N" (falha)
    for (const r of d2) {
      const g = goldD2.get(r.id); if (!g) continue;
      for (const [item, esperado] of Object.entries(g)) {
        const dado = r.saida ? r.saida[item] : null;
        tot++; if (DISCRIMINANTES.has(item)) totD++;
        if (dado === null || dado === undefined) { erros++; continue; }   // ilegivel = errado
        if (dado === esperado) { cert++; if (DISCRIMINANTES.has(item)) certD++; }
        if (esperado === "N" && dado === "N") tp++;
        if (esperado === "S" && dado === "N") fp++;
        if (esperado === "N" && dado === "S") fn++;
      }
    }
    // consistencia: os 3 veredictos do mesmo (jogo,item) coincidem?
    let consOk = 0, consTot = 0;
    for (const id of goldD2.keys()) {
      const reps = d2.filter((r) => r.id === id);
      for (const item of Object.keys(goldD2.get(id))) {
        const vs = reps.map((r) => (r.saida ? r.saida[item] : null));
        consTot++; if (vs.length && vs.every((v) => v !== null && v === vs[0])) consOk++;
      }
    }
    const nS = [...goldD2.values()].reduce((a, m) => a + Object.values(m).filter((v) => v === "S").length, 0);
    console.log("  DOMINIO 2 · visual-um-ficheiro");
    console.log(`    accuracy global      ${pct(cert, tot)}   (${cert}/${tot})      baseline sempre-S ${pct(nS, tot / J.repeticoes * J.repeticoes ? tot : tot)}`.replace(/baseline.*/, `baseline sempre-S ${pct(nS * J.repeticoes, tot)}`));
    console.log(`    accuracy discriminantes ${pct(certD, totD)}   (${certD}/${totD})`);
    console.log(`    consistencia 3x      ${pct(consOk, consTot)}   (${consOk}/${consTot})`);
    console.log(`    FALHAS: recall ${pct(tp, tp + fn)} (${tp}/${tp + fn})   precisao ${pct(tp, tp + fp)} (${tp}/${tp + fp})`);
    console.log(`    respostas ilegiveis  ${erros}`);
  }

  // ---------- dominio 1 ----------
  if (d1.length) {
    let cert = 0, tot = 0, erros = 0, falsoAlarme = 0;
    for (const r of d1) {
      const esperado = goldD1.get(r.id); if (!esperado) continue;
      const dado = r.saida ? r.saida.correcto : null;
      tot++;
      if (dado === null || dado === undefined) { erros++; continue; }
      if (dado === esperado) cert++;
      if (esperado === "S" && dado === "N") falsoAlarme++;
    }
    let consOk = 0, consTot = 0;
    for (const id of goldD1.keys()) {
      const vs = d1.filter((r) => r.id === id).map((r) => (r.saida ? r.saida.correcto : null));
      consTot++; if (vs.length && vs.every((v) => v !== null && v === vs[0])) consOk++;
    }
    console.log("  DOMINIO 1 · codigo-com-teste  (TODO-POSITIVO: nao mede accuracy, mede falso alarme)");
    console.log(`    concordancia com o gabarito ${pct(cert, tot)}  (${cert}/${tot})   [um 'diz sempre S' faz 100%]`);
    console.log(`    FALSO ALARME (condenou codigo bom) ${pct(falsoAlarme, tot)}  (${falsoAlarme}/${tot})`);
    console.log(`    consistencia 3x      ${pct(consOk, consTot)}   (${consOk}/${consTot})`);
    console.log(`    respostas ilegiveis  ${erros}`);
  }

  const ms = J.resultados.filter((r) => r.ms).reduce((a, r) => a + r.ms, 0);
  const tin = J.resultados.reduce((a, r) => a + (r.tokens_in || 0), 0);
  const tout = J.resultados.reduce((a, r) => a + (r.tokens_out || 0), 0);
  console.log(`  CUSTO: $0 (GPU local) · ${J.resultados.length} chamadas · ${(ms / 1000).toFixed(1)}s · ${tin} tok in · ${tout} tok out · Wh n/d (sem medicao)`);
}

console.log(`\nitens discriminantes no gabarito: ${[...DISCRIMINANTES].join(", ")}`);
