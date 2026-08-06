#!/usr/bin/env node
// dod_harness.mjs — DoD funcional do T1 SEM juiz LLM (protocolo v1.1 §4.1).
// Joga o artefacto com Playwright: 12 itens S/N + FPS/input-lag (§4.6 "experiência
// operacionalizada") + capturas. Resultado binário anexado ANONIMAMENTE ao pacote do juiz.
//
// Uso:  node dod_harness.mjs <caminho-do-artefacto.html> <dir-de-saida>
// Playwright resolve-se de cloude-home (já instalado; browsers no cache ms-playwright).
// NUNCA correr `playwright install` — se faltar, o harness diz e sai.

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PW_HOME = "C:/Users/Paulo Loureiro/cloude-home";

const [artefacto, outDir] = process.argv.slice(2);
if (!artefacto || !outDir) { console.error("uso: dod_harness.mjs <artefacto.html> <dir-saida>"); process.exit(2); }

const { CHECKS } = await import(pathToFileURL(join(HERE, "dod_checks.mjs")));
if (CHECKS.some((c) => String(c.desc).includes("<<TODO"))) {
  console.error("RECUSADO: dod_checks.mjs ainda tem <<TODO — preencher T1_SPEC.md e os checks primeiro.");
  process.exit(1);
}
if (CHECKS.length !== 12) { console.error(`RECUSADO: esperados 12 checks, encontrados ${CHECKS.length}.`); process.exit(1); }

let chromium;
try {
  const require = createRequire(join(PW_HOME, "package.json"));
  ({ chromium } = require("playwright"));
} catch {
  console.error(`RECUSADO: playwright não resolvido a partir de ${PW_HOME}. NÃO correr 'playwright install' — investigar.`);
  process.exit(1);
}

if (!existsSync(artefacto)) { console.error(`RECUSADO: artefacto não existe: ${artefacto} (usar runs/<id>/artefacto/<caminho>)`); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
try {
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(pathToFileURL(resolve(artefacto)).href, { waitUntil: "load", timeout: 30000 });
await page.screenshot({ path: join(outDir, "captura-inicial.png") });

// --- 12 itens S/N ---
const ctx = { artefacto: resolve(artefacto), outDir };
const itens = [];
for (const c of CHECKS) {
  if (c.humano) { itens.push({ id: c.id, desc: c.desc, resultado: "n/d (humano)" }); continue; }
  try { itens.push({ id: c.id, desc: c.desc, resultado: (await c.fn(page, ctx)) ? "S" : "N" }); }
  catch (e) { itens.push({ id: c.id, desc: c.desc, resultado: "N", erro: e.message.slice(0, 200) }); }
}

// --- FPS: rAF durante 5s ---
const fps = await page.evaluate(() => new Promise((res) => {
  const ts = [];
  const tick = (t) => { ts.push(t); if (t - ts[0] < 5000) requestAnimationFrame(tick); else res(ts); };
  requestAnimationFrame(tick);
})).then((ts) => {
  if (ts.length < 10) return { nota: "n/d — <10 frames em 5s" };
  const deltas = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
  const fpsOf = (ms) => +(1000 / ms).toFixed(1);
  return { frames: ts.length, fps_mediana: fpsOf(deltas[Math.floor(deltas.length / 2)]), fps_p95_pior: fpsOf(deltas[Math.floor(deltas.length * 0.95)]) };
}).catch(() => ({ nota: "n/d — página sem requestAnimationFrame mensurável" }));

// --- input lag aproximado: pointerdown → próximo frame ---
const inputLag = await page.evaluate(() => new Promise((res) => {
  let t0 = 0;
  addEventListener("pointerdown", () => { t0 = performance.now(); requestAnimationFrame((t) => res(+(t - t0).toFixed(1))); }, { once: true });
  setTimeout(() => res(null), 3000);
})).then(async (p) => { await page.mouse.click(640, 400); return p; }).catch(() => null);
// nota: o click dispara depois de armar o listener; null => n/d

await page.screenshot({ path: join(outDir, "captura-final.png") });

const resultado = {
  gerado_por: "dod_harness.mjs (Playwright, zero LLM)",
  artefacto_avaliado: "(anonimizado no pacote — o mapa vive fora do alcance dos juízes)",
  itens,
  score_dod: `${itens.filter((i) => i.resultado === "S").length}/12`,
  fluidez: { ...fps, input_lag_ms: inputLag ?? "n/d" },
  capturas: ["captura-inicial.png", "captura-final.png"],
};
writeFileSync(join(outDir, "dod.json"), JSON.stringify(resultado, null, 2));
console.log(JSON.stringify({ score: resultado.score_dod, fluidez: resultado.fluidez }, null, 2));
} finally { await browser.close(); } // Δ verificação: browser nunca fica órfão em crash
