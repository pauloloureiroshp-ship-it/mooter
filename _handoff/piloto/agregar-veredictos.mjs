#!/usr/bin/env node
/**
 * agregar-veredictos.mjs — cruza os 3 veredictos cegos com o mapa revelado.
 *
 * NAO interpreta: extrai numeros, calcula concordancia e mede a sonda de
 * proveniencia contra o acaso. Cada juiz chega num formato diferente (codex em
 * JSON cru, fable5 dentro do wrapper do `--output-format json` do CLI, kimi em
 * bloco markdown) — a extraccao trata os tres e DECLARA quando falha.
 *
 * Uso: node agregar-veredictos.mjs [--json]
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const V = join(HERE, "veredictos");
const MAPA = JSON.parse(readFileSync(join(HERE, "mapa.json"), "utf8"));

const PESOS = { "codex.json": 1, "fable5.json": 0.5, "terceira-voz.json": 1 };

/** Encontra o objecto {artefactos:[...]} venha ele em que embrulho vier. */
function extrai(bruto) {
  const texto = String(bruto || "");
  const tentativas = [];
  // 1) JSON directo
  tentativas.push(texto);
  // 2) wrapper do CLI (--output-format json) -> campo .result
  try { const w = JSON.parse(texto); if (w && typeof w.result === "string") tentativas.push(w.result); } catch { /* segue */ }
  // 3) bloco markdown ```json ... ```
  const m = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) tentativas.push(m[1]);
  // 4) primeira chaveta equilibrada que contenha "artefactos"
  const i = texto.indexOf('{"artefactos"');
  if (i >= 0) tentativas.push(texto.slice(i));
  const j = texto.indexOf('"artefactos"');
  if (j >= 0) { const k = texto.lastIndexOf("{", j); if (k >= 0) tentativas.push(texto.slice(k)); }

  for (const t of tentativas) {
    const s = String(t).trim();
    for (const cand of [s, (s.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1]]) {
      if (!cand) continue;
      try { const o = JSON.parse(cand); if (o && Array.isArray(o.artefactos)) return o; } catch { /* proxima */ }
      // JSON seguido de lixo: cortar no fecho equilibrado
      const c = String(cand);
      let prof = 0, fim = -1;
      for (let p = 0; p < c.length; p++) {
        if (c[p] === "{") prof++;
        else if (c[p] === "}") { prof--; if (prof === 0) { fim = p; break; } }
      }
      if (fim > 0) { try { const o = JSON.parse(c.slice(c.indexOf("{"), fim + 1)); if (o && Array.isArray(o.artefactos)) return o; } catch { /* desiste */ } }
    }
  }
  return null;
}

const bracoDe = (rotulo) => {
  const origem = MAPA.atribuicao[rotulo] || "";
  const m = origem.match(/T1-([ABC])-e(\d)/);
  return m ? { braco: m[1], exec: Number(m[2]), run: origem } : { braco: null, exec: null, run: origem || null };
};
const NOME = { A: "TECTO (fable-5)", B: "MOOTER", C: "ESTATICO (sonnet-5)" };

const juizes = [];
for (const f of readdirSync(V).filter((x) => x.endsWith(".json") && x !== "painel.json")) {
  const raw = JSON.parse(readFileSync(join(V, f), "utf8"));
  const parsed = extrai(raw.bruto);
  juizes.push({
    ficheiro: f, juiz: raw.juiz, peso: PESOS[f] ?? raw.peso ?? 1,
    motivo_peso: raw.motivo_peso ?? raw.declarado ?? null,
    parseou: !!parsed,
    porque_nao: parsed ? null : "veredicto ilegível — não se descarta em silêncio, conta como juiz sem voto",
    artefactos: parsed ? parsed.artefactos : [],
  });
}

const rotulos = Object.keys(MAPA.atribuicao).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));

// ---------- por artefacto ----------
const porArtefacto = rotulos.map((r) => {
  const verdade = bracoDe(r);
  const notas = juizes.filter((j) => j.parseou).map((j) => {
    const a = j.artefactos.find((x) => String(x.id).toUpperCase() === r);
    return a ? { juiz: j.juiz, peso: j.peso, dod: a.dod ?? null, robustez: a.robustez ?? null,
      codigo: a.codigo ?? null, experiencia: a.experiencia ?? null, final: a.final ?? null,
      proveniencia_palpite: a.proveniencia_palpite ?? null, justificacao: a.justificacao ?? null }
      : { juiz: j.juiz, peso: j.peso, final: null, porque: "o juiz não pontuou este artefacto" };
  });
  const finais = notas.map((n) => n.final).filter((v) => typeof v === "number");
  const pesos = notas.filter((n) => typeof n.final === "number").map((n) => n.peso);
  const somaP = pesos.reduce((a, b) => a + b, 0);
  return {
    rotulo: r, braco: verdade.braco, braco_nome: verdade.braco ? NOME[verdade.braco] : null,
    execucao: verdade.exec, run: verdade.run,
    notas,
    final_ponderado: somaP ? +(notas.filter((n) => typeof n.final === "number")
      .reduce((a, n) => a + n.final * n.peso, 0) / somaP).toFixed(3) : null,
    final_ponderado_porque: somaP ? `média dos ${finais.length} finais, pesos ${pesos.join("/")}` : "nenhum juiz pontuou este artefacto",
    dispersao: finais.length > 1 ? +(Math.max(...finais) - Math.min(...finais)).toFixed(2) : null,
    dispersao_porque: finais.length > 1 ? null : "menos de 2 notas — dispersão indefinida",
  };
});

// ---------- por braço ----------
const porBraco = {};
for (const a of porArtefacto) {
  if (!a.braco) continue;
  (porBraco[a.braco] = porBraco[a.braco] || { braco: a.braco, nome: NOME[a.braco], finais: [], artefactos: [] });
  porBraco[a.braco].artefactos.push(a.rotulo);
  if (typeof a.final_ponderado === "number") porBraco[a.braco].finais.push(a.final_ponderado);
}
for (const b of Object.values(porBraco)) {
  const f = b.finais;
  b.n = f.length;
  b.media = f.length ? +(f.reduce((x, y) => x + y, 0) / f.length).toFixed(3) : null;
  b.min = f.length ? Math.min(...f) : null;
  b.max = f.length ? Math.max(...f) : null;
  b.porque = f.length ? `média de ${f.length} artefacto(s), nota final ponderada pelos pesos dos juízes` : "sem notas";
}

// ---------- concordância entre juízes ----------
// Par a par: em quantos dos 36 pares de artefactos os dois juízes os ordenam igual.
const comVoto = juizes.filter((j) => j.parseou);
const finalDe = (j, r) => { const a = j.artefactos.find((x) => String(x.id).toUpperCase() === r); return a && typeof a.final === "number" ? a.final : null; };
const paresJuizes = [];
for (let i = 0; i < comVoto.length; i++) {
  for (let k = i + 1; k < comVoto.length; k++) {
    let concordam = 0, comparaveis = 0, empates = 0;
    for (let x = 0; x < rotulos.length; x++) {
      for (let y = x + 1; y < rotulos.length; y++) {
        const a1 = finalDe(comVoto[i], rotulos[x]), a2 = finalDe(comVoto[i], rotulos[y]);
        const b1 = finalDe(comVoto[k], rotulos[x]), b2 = finalDe(comVoto[k], rotulos[y]);
        if ([a1, a2, b1, b2].some((v) => v === null)) continue;
        comparaveis++;
        if (a1 === a2 || b1 === b2) { empates++; continue; }
        if (Math.sign(a1 - a2) === Math.sign(b1 - b2)) concordam++;
      }
    }
    const decisivos = comparaveis - empates;
    paresJuizes.push({
      juizes: [comVoto[i].juiz, comVoto[k].juiz],
      pares_comparaveis: comparaveis, empates,
      concordancia_ordenacao_pct: decisivos ? +(100 * concordam / decisivos).toFixed(1) : null,
      concordancia_porque: decisivos ? `${concordam}/${decisivos} pares ordenados igual (empates excluídos)` : "sem pares decisivos",
      baseline_acaso_pct: 50, baseline_porque: "ordenar dois artefactos ao acaso acerta metade das vezes",
    });
  }
}

// ---------- sonda de proveniência ----------
const BRACOS = ["A", "B", "C"];
const sonda = { itens: [], acertos: 0, palpites_validos: 0, sem_palpite: 0 };
for (const j of comVoto) {
  for (const r of rotulos) {
    const a = j.artefactos.find((x) => String(x.id).toUpperCase() === r);
    const palpite = a && a.proveniencia_palpite ? String(a.proveniencia_palpite) : null;
    const verdade = bracoDe(r).braco;
    if (!palpite) { sonda.sem_palpite++; sonda.itens.push({ juiz: j.juiz, rotulo: r, palpite: null, verdade, acertou: null, porque: "juiz não arriscou palpite" }); continue; }
    // normalizar: procurar a letra do braço ou o nome do motor no texto do palpite
    const p = palpite.toUpperCase();
    let letra = null;
    if (/\bMOOTER\b/.test(p) || /\bOPUS\b/.test(p)) letra = "B";
    else if (/\bFABLE\b/.test(p) || /\bTECTO\b/.test(p)) letra = "A";
    else if (/\bSONNET\b/.test(p) || /\bESTATICO|ESTÁTICO\b/.test(p)) letra = "C";
    else { const m = p.match(/\b(?:BRA[ÇC]O\s*)?([ABC])\b/); if (m) letra = m[1]; }
    if (!letra) { sonda.sem_palpite++; sonda.itens.push({ juiz: j.juiz, rotulo: r, palpite, verdade, acertou: null, porque: "palpite não mapeável a um braço" }); continue; }
    sonda.palpites_validos++;
    const acertou = letra === verdade;
    if (acertou) sonda.acertos++;
    sonda.itens.push({ juiz: j.juiz, rotulo: r, palpite, palpite_normalizado: letra, verdade, acertou });
  }
}
sonda.taxa_acerto_pct = sonda.palpites_validos ? +(100 * sonda.acertos / sonda.palpites_validos).toFixed(1) : null;
sonda.taxa_porque = sonda.palpites_validos ? `${sonda.acertos}/${sonda.palpites_validos} palpites mapeáveis` : "nenhum palpite mapeável — sonda indeterminada (n/d, nunca 0%)";
sonda.baseline_acaso_pct = +(100 / BRACOS.length).toFixed(1);
sonda.baseline_porque = "3 braços equiprováveis — adivinhar ao acaso acerta 1 em 3 (33,3%). Acima disto a cegueira do painel está comprometida; ao nível disto, o painel julgou às cegas.";

const saida = {
  gerado_por: "agregar-veredictos.mjs",
  mapa_revelado_em: MAPA.aviso ? "mapa.json" : null,
  juizes: juizes.map((j) => ({ juiz: j.juiz, ficheiro: j.ficheiro, peso: j.peso, motivo_peso: j.motivo_peso, parseou: j.parseou, porque_nao: j.porque_nao, artefactos_pontuados: j.artefactos.length })),
  por_artefacto: porArtefacto,
  por_braco: Object.values(porBraco).sort((a, b) => a.braco.localeCompare(b.braco)),
  concordancia_entre_juizes: paresJuizes,
  sonda_proveniencia: sonda,
};

if (process.argv.includes("--json")) { console.log(JSON.stringify(saida, null, 2)); process.exit(0); }
console.log(`juízes: ${juizes.map((j) => `${j.ficheiro}${j.parseou ? "✓" : "✗"}`).join(" ")}`);
for (const b of saida.por_braco) console.log(`  ${b.braco} ${b.nome.padEnd(18)} média ${b.media} (n=${b.n}, ${b.min}–${b.max})`);
for (const p of paresJuizes) console.log(`  concordância ${p.juizes[0].slice(0, 12)} vs ${p.juizes[1].slice(0, 12)}: ${p.concordancia_ordenacao_pct}% (acaso 50%)`);
console.log(`  sonda proveniência: ${sonda.taxa_acerto_pct}% — ${sonda.taxa_porque} · acaso ${sonda.baseline_acaso_pct}%`);

export { saida };
