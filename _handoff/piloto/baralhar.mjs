#!/usr/bin/env node
// baralhar.mjs — normalização anti-sotaque + baralhamento + pacotes anónimos (§4.2-4.3).
//   1. prettier (resolvido de cloude-home) sobre js/ts/html/css/json
//   2. remoção de comentários + renomeação MECÂNICA de identificadores (a1, a2, …)
//   3. baralha por crypto, atribui rótulos neutros (ART-1…ART-n)
//   4. escreve pacotes em piloto/pacotes/ART-x/ e o mapa em piloto/mapa.json
//      — mapa.json NUNCA entra num pacote; julgar.mjs recusa pacotes contaminados.
//
// Uso: node baralhar.mjs <dirRunA> <dirRunB> <dirRunC> …   (um dir por artefacto a julgar)

import { createRequire } from "node:module";
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const PW_HOME = "C:/Users/Paulo Loureiro/cloude-home";
const PACOTES = join(HERE, "pacotes");
const MAPA = join(HERE, "mapa.json");

const dirs = process.argv.slice(2);
if (dirs.length < 2) { console.error("uso: baralhar.mjs <dir1> <dir2> …"); process.exit(2); }

let prettier = null;
try { prettier = createRequire(join(PW_HOME, "package.json"))("prettier"); }
catch { console.error("aviso: prettier não resolvido de cloude-home — normalização será só strip+rename (declarado no pacote)."); }

function* ficheiros(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== "node_modules" && f !== ".git") yield* ficheiros(p); }
    else yield p;
  }
}

function stripComments(src, ext) {
  if ([".js", ".mjs", ".ts", ".css"].includes(ext))
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"])\/\/[^\n]*/g, "$1");
  if ([".html", ".md"].includes(ext)) return src.replace(/<!--[\s\S]*?-->/g, "");
  return src;
}

function renameIdentifiers(src, ext) {
  // renomeação mecânica: identificadores declarados viram a1, a2, … (ordem de aparição)
  if (![".js", ".mjs", ".ts"].includes(ext)) return src;
  const decl = [...src.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  const unicos = [...new Set(decl)].filter((n) => !["default", "constructor"].includes(n));
  let out = src;
  unicos.forEach((nome, i) => { out = out.replace(new RegExp(`\\b${nome.replace(/\$/g, "\\$")}\\b`, "g"), `a${i + 1}`); });
  return out;
}

async function normalizar(src, ext) {
  let out = stripComments(src, ext);
  out = renameIdentifiers(out, ext);
  if (prettier) {
    const parser = { ".js": "babel", ".mjs": "babel", ".ts": "typescript", ".html": "html", ".css": "css", ".json": "json" }[ext];
    if (parser) { try { out = await prettier.format(out, { parser }); } catch { /* artefacto malformado fica como está */ } }
  }
  return out;
}

rmSync(PACOTES, { recursive: true, force: true });
mkdirSync(PACOTES, { recursive: true });

// baralha por crypto (Fisher-Yates), lançamentos registados no mapa
const ordem = dirs.map((d, i) => i);
const lancamentos = [];
for (let i = ordem.length - 1; i > 0; i--) { const j = randomInt(i + 1); lancamentos.push(j); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }

const mapa = { gerado: new Date().toISOString(), lancamentos_crypto: lancamentos, atribuicao: {}, aviso: "FORA DO ALCANCE DOS JUÍZES — abrir só depois dos 3 veredictos (§4.3)." };
for (let k = 0; k < ordem.length; k++) {
  const rotulo = `ART-${k + 1}`;
  const origem = dirs[ordem[k]];
  mapa.atribuicao[rotulo] = origem;
  const destino = join(PACOTES, rotulo);
  mkdirSync(destino, { recursive: true });
  for (const f of ficheiros(origem)) {
    const nome = basename(f);
    if (nome === "meta.json" || nome === "mapa.json") continue; // metadados denunciam o braço — nunca entram
    const ext = extname(f).toLowerCase();
    if ([".js", ".mjs", ".ts", ".html", ".css", ".json", ".md"].includes(ext)) {
      writeFileSync(join(destino, nome), await normalizar(readFileSync(f, "utf8"), ext));
    } else if ([".png", ".jpg", ".gif"].includes(ext)) {
      cpSync(f, join(destino, nome)); // capturas do harness seguem (§4.1) — já são anónimas
    }
  }
}
writeFileSync(MAPA, JSON.stringify(mapa, null, 2));
console.log(`${ordem.length} pacotes em ${PACOTES} · mapa em mapa.json (NÃO mostrar aos juízes).`);
