#!/usr/bin/env node
/**
 * resultado.mjs — P0-C: gerar `resultado.md` MECANICAMENTE dos `meta.json`.
 *
 * PORQUE ESTE FICHEIRO EXISTE
 * Um `resultado.md` escrito à mão é a segunda verdade clássica: diz o que o
 * autor lembra, não o que os runs mediram. Cada run já escreve tudo o que
 * interessa em `runs/<runId>/meta.json` (`driver.mjs:259`). Este script lê SÓ
 * isso e escreve a tabela. Nada aqui inventa, arredonda para agradar, ou
 * preenche buracos — um campo ausente sai `n/d`.
 *
 * A REGRA QUE FAZ FALHAR
 * Se os `meta.json` não concordarem todos no mesmo `base_sha` — ou no mesmo
 * `runtime_bundle_sha`, quando o driver o registou — a bateria mediu códigos
 * diferentes e a comparação entre braços não significa nada. Isso não é um
 * aviso a rodapé: é exit 1 e nenhum `resultado.md` escrito. Um relatório que
 * sai na mesma com shas mistos é pior do que nenhum, porque parece uma medição.
 *
 * USO
 *   node resultado.mjs                  # runs/ → resultado.md (exit 1 se misto)
 *   node resultado.mjs --runs <dir>     # outra pasta de runs (testes)
 *   node resultado.mjs --out <file>     # outro destino
 *   node resultado.mjs --json           # devolve o agregado sem escrever
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const nd = (v) => (v === undefined || v === null || v === "" ? "n/d" : v);

function lerMetas(runsDir) {
  if (!existsSync(runsDir)) return { metas: [], ilegiveis: [], porque: `pasta de runs ausente: ${runsDir}` };
  const metas = [];
  const ilegiveis = [];
  for (const entry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const f = join(runsDir, entry.name, "meta.json");
    if (!existsSync(f)) { ilegiveis.push({ run: entry.name, porque: "sem meta.json" }); continue; }
    try { metas.push({ run: entry.name, ...JSON.parse(readFileSync(f, "utf8")) }); }
    catch (e) { ilegiveis.push({ run: entry.name, porque: `meta.json ilegível: ${e.message}` }); }
  }
  metas.sort((a, b) => (a.run < b.run ? -1 : a.run > b.run ? 1 : 0));
  return { metas, ilegiveis, porque: null };
}

/** Um campo é coerente quando TODOS os runs que o declaram concordam. */
function coerencia(metas, campo) {
  const vistos = new Map();
  for (const m of metas) {
    const v = m[campo];
    if (v === undefined || v === null) continue;
    if (!vistos.has(v)) vistos.set(v, []);
    vistos.get(v).push(m.run);
  }
  const semCampo = metas.filter((m) => m[campo] === undefined || m[campo] === null).map((m) => m.run);
  return {
    campo,
    valores: [...vistos.entries()].map(([valor, runs]) => ({ valor, runs })),
    misto: vistos.size > 1,
    ausente_em: semCampo,
    valor_unico: vistos.size === 1 ? [...vistos.keys()][0] : null,
  };
}

/**
 * A prova de bundle escrita pelo driver no `driver.log` da própria bateria.
 *
 * O driver mede-a e regista-a lá (`driver.mjs`, evento `prova_bundle`) mas NÃO a
 * copia para cada `meta.json`. Sem esta leitura, o `resultado.md` da T1 de
 * 2026-08-07 saía com `runtime_bundle_sha: n/d` e a acusar 9 runs de serem
 * "anteriores à prova de bundle" — quando a prova tinha corrido nessa mesma
 * bateria e dado `IGUAL 198/198`. O documento canónico publicava uma segunda
 * verdade, que é exactamente o que ele existe para não fazer.
 *
 * Lê-se a fonte onde o driver a pôs; não se escreve nos `meta.json` a posteriori.
 */
function provaDoLog(runsDir) {
  const f = join(runsDir, "driver.log");
  if (!existsSync(f)) return null;
  let ultima = null;
  for (const linha of readFileSync(f, "utf8").split("\n")) {
    if (!linha.trim()) continue;
    try {
      const o = JSON.parse(linha);
      if (o.evento === "prova_bundle" && o.runtime_bundle_sha) ultima = o;
    } catch { /* linha truncada: ignora-se, e a ausência sai n/d */ }
  }
  return ultima;
}

function agregar(runsDir) {
  const { metas, ilegiveis, porque } = lerMetas(runsDir);
  const base = coerencia(metas, "base_sha");
  const runtime = coerencia(metas, "runtime_bundle_sha");
  // Precedência: o que o próprio run mediu > o log da bateria. O log só preenche
  // o que falta, e a proveniência fica declarada no render.
  const prova = provaDoLog(runsDir);
  if (!runtime.valor_unico && !runtime.misto && prova) {
    runtime.valor_unico = prova.runtime_bundle_sha;
    runtime.fonte = "driver.log da bateria (evento prova_bundle)";
    runtime.prova = { igual: prova.igual, medidos: prova.medidos, total: prova.total, base_sha: prova.base_sha };
    runtime.ausente_em = [];
  } else if (runtime.valor_unico) {
    runtime.fonte = "meta.json de cada run";
  }
  const bloqueios = [];
  if (porque) bloqueios.push(porque);
  if (!metas.length) bloqueios.push("nenhum meta.json legível — nada para relatar (n/d, não zero)");
  if (base.misto) bloqueios.push(`base_sha MISTO em ${base.valores.length} valores: ${base.valores.map((v) => `${String(v.valor).slice(0, 7)}×${v.runs.length}`).join(", ")}`);
  if (runtime.misto) bloqueios.push(`runtime_bundle_sha MISTO em ${runtime.valores.length} valores: ${runtime.valores.map((v) => `${String(v.valor).slice(0, 7)}×${v.runs.length}`).join(", ")}`);
  return { runsDir, metas, ilegiveis, base_sha: base, runtime_bundle_sha: runtime, bloqueios, ok: bloqueios.length === 0 };
}

function render(ag) {
  const l = [];
  l.push("# Resultado da bateria — gerado mecanicamente");
  l.push("");
  l.push(`> Gerado por \`resultado.mjs\` a partir de ${ag.metas.length} \`meta.json\` em \`${ag.runsDir}\`.`);
  l.push("> Nenhum número deste ficheiro foi escrito à mão. Campo ausente sai `n/d`, nunca zero.");
  l.push("");
  l.push("## Sha medido");
  l.push("");
  l.push(`- \`base_sha\`: \`${nd(ag.base_sha.valor_unico)}\` — o commit que a bateria diz ter medido.`);
  l.push(`- \`runtime_bundle_sha\`: \`${nd(ag.runtime_bundle_sha.valor_unico)}\` — o que o braço B REALMENTE correu (prova ficheiro-a-ficheiro por sha256, sem manifest).`);
  if (ag.runtime_bundle_sha.fonte) {
    l.push(`  - fonte: ${ag.runtime_bundle_sha.fonte}`);
  }
  if (ag.runtime_bundle_sha.prova) {
    const p = ag.runtime_bundle_sha.prova;
    l.push(`  - veredicto da prova: **${p.igual ? "IGUAL — o runtime é o repo" : "DIVERGENTE"}**, ${p.medidos}/${p.total} ficheiros medidos.`);
  }
  if (ag.runtime_bundle_sha.ausente_em.length) {
    l.push(`- ⚠️ ${ag.runtime_bundle_sha.ausente_em.length} run(s) sem \`runtime_bundle_sha\` no \`meta.json\` **e sem prova no \`driver.log\`** da bateria — não há como saber o que correu: \`${ag.runtime_bundle_sha.ausente_em.join("`, `")}\`.`);
  }
  l.push("");
  l.push("## Runs");
  l.push("");
  l.push("| run | braço | tarefa | exec | critério de paragem | tentativas | wall_ms | custo proxy | intervenções |");
  l.push("|---|---|---|---|---|---|---|---|---|");
  for (const m of ag.metas) {
    l.push(`| ${m.run} | ${nd(m["braço_nome"] || m["braço"])} | ${nd(m.tarefa)} | ${nd(m.execucao)} | ${nd(m.criterio_paragem)} | ${nd(Array.isArray(m.tentativas) ? m.tentativas.length : m.tentativas)} | ${nd(m.wall_ms_total)} | ${nd(m.custo_proxy && (m.custo_proxy.valor ?? JSON.stringify(m.custo_proxy)))} | ${nd(m.intervencoes_humanas)} |`);
  }
  if (ag.ilegiveis.length) {
    l.push("");
    l.push("## Runs não contabilizados (declarados, nunca calados)");
    l.push("");
    for (const i of ag.ilegiveis) l.push(`- \`${i.run}\` — ${i.porque}`);
  }
  l.push("");
  return l.join("\n");
}

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runsDir = flag("--runs") || join(HERE, "runs");
  const ag = agregar(runsDir);
  if (argv.includes("--json")) { console.log(JSON.stringify(ag, null, 2)); process.exit(ag.ok ? 0 : 1); }
  if (!ag.ok) {
    console.error("RECUSADO — resultado.md NÃO foi escrito:");
    for (const b of ag.bloqueios) console.error(`  - ${b}`);
    console.error("Shas mistos significam que os braços mediram códigos diferentes: a comparação não significa nada.");
    process.exit(1);
  }
  const out = flag("--out") || join(HERE, "resultado.md");
  writeFileSync(out, render(ag));
  console.log(`resultado.md escrito de ${ag.metas.length} meta.json · base_sha ${String(ag.base_sha.valor_unico).slice(0, 7)} · ${out}`);
}

export { agregar, coerencia, lerMetas, render };
