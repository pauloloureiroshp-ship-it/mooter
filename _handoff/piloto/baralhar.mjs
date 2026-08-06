#!/usr/bin/env node
// baralhar.mjs v2 — normalização anti-sotaque + baralhamento + pacotes anónimos (§4.2-4.3).
//   1. prettier (resolvido de cloude-home) sobre js/ts/html/css
//   2. remoção de comentários + renomeação MECÂNICA de identificadores (a1, a2, …)
//      — inclui <script>/<style> inline de .html (o artefacto T1 é uma página autónoma)
//   3. redacção mecânica de nomes de modelos/vendors em QUALQUER texto ("[modelo]")
//   4. baralha por crypto, atribui rótulos neutros (ART-1…) e escreve mapa em piloto/mapa.json
//      — mapa.json NUNCA entra num pacote; julgar.mjs recusa pacotes contaminados.
// v2 incorpora a verificação adversarial de 2026-08-06:
//   Δ transcrições/logs/meta NUNCA entram no pacote (denunciavam o modelo via modelUsage)
//   Δ único .json admitido é dod.json (resultado do harness — já anónimo)
//   Δ normalização cobre JS/CSS inline em .html · Δ redacção de tokens denunciadores
//
// Uso: node baralhar.mjs <dirArtefactoA> <dirArtefactoB> …  (runs/<id>/artefacto/ + dod.json ao lado)

import { createRequire } from "node:module";
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const PW_HOME = "C:/Users/Paulo Loureiro/cloude-home";
const PACOTES = join(HERE, "pacotes");
const MAPA = join(HERE, "mapa.json");

// nunca entram num pacote: denunciam braço, modelo ou nº de follow-ups
const PROIBIDOS = /^(mapa|meta)\.json$|^(tentativa|transcricao)-|\.stderr\.txt$|^driver\.log$|^artefacto\.diff$|^artefacto\.ERRO/;

const dirs = process.argv.slice(2);
if (dirs.length < 2) { console.error("uso: baralhar.mjs <dirArtefacto1> <dirArtefacto2> …"); process.exit(2); }

let prettier = null;
try { prettier = createRequire(join(PW_HOME, "package.json"))("prettier"); }
catch { console.error("aviso: prettier não resolvido de cloude-home — normalização será só strip+rename+redacção (declarado no mapa)."); }

function* ficheiros(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== "node_modules" && f !== ".git") yield* ficheiros(p); }
    else yield p;
  }
}

function stripCommentsJs(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"])\/\/[^\n]*/g, "$1");
}

function renameIdentifiersJs(src) {
  // renomeação mecânica: identificadores declarados viram a1, a2, … (ordem de aparição)
  const decl = [...src.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  const unicos = [...new Set(decl)].filter((n) => !["default", "constructor"].includes(n));
  let out = src;
  unicos.forEach((nome, i) => { out = out.replace(new RegExp(`\\b${nome.replace(/\$/g, "\\$")}\\b`, "g"), `a${i + 1}`); });
  return out;
}

function redigirTokens(src) {
  // redacção mecânica anti-fuga: nomes de modelos/vendors/ferramentas viram [modelo]
  return src.replace(/\b(claude|anthropic|fable|opus|sonnet|haiku|codex|gpt-?[45o]?|openai|chatgpt|mooter|frugal|ollama|qwen|gemini|kimi|moonshot)\b/gi, "[modelo]");
}

function normalizarHtml(src) {
  // JS/CSS inline: strip + rename dentro de <script>/<style>; comentários HTML fora
  let out = src.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, a, corpo, z) => a + renameIdentifiersJs(stripCommentsJs(corpo)) + z);
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, a, corpo, z) => a + corpo.replace(/\/\*[\s\S]*?\*\//g, "") + z);
  return out;
}

async function normalizar(src, ext) {
  let out;
  if ([".js", ".mjs", ".ts"].includes(ext)) out = renameIdentifiersJs(stripCommentsJs(src));
  else if (ext === ".html") out = normalizarHtml(src);
  else if (ext === ".css") out = src.replace(/\/\*[\s\S]*?\*\//g, "");
  else if (ext === ".md") out = src.replace(/<!--[\s\S]*?-->/g, "");
  else out = src;
  out = redigirTokens(out);
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

const mapa = {
  gerado: new Date().toISOString(), lancamentos_crypto: lancamentos, atribuicao: {},
  prettier_activo: !!prettier,
  aviso: "FORA DO ALCANCE DOS JUÍZES — abrir só depois dos 3 veredictos (§4.3). julgar.mjs corre os juízes em cwd isolado.",
};
for (let k = 0; k < ordem.length; k++) {
  const rotulo = `ART-${k + 1}`;
  const origem = dirs[ordem[k]];
  mapa.atribuicao[rotulo] = origem;
  const destino = join(PACOTES, rotulo);
  mkdirSync(destino, { recursive: true });
  for (const f of ficheiros(origem)) {
    const nome = basename(f);
    if (PROIBIDOS.test(nome)) continue;
    const ext = extname(f).toLowerCase();
    if (ext === ".json" && nome !== "dod.json") continue; // único .json admitido: resultado anónimo do harness
    if ([".js", ".mjs", ".ts", ".html", ".css", ".json", ".md"].includes(ext)) {
      writeFileSync(join(destino, nome), await normalizar(readFileSync(f, "utf8"), ext));
    } else if ([".png", ".jpg", ".gif"].includes(ext)) {
      cpSync(f, join(destino, nome)); // capturas do harness (§4.1) — já anónimas
    }
  }
  // dod.json pode viver ao lado do dir artefacto/ (runs/<id>/dod/) — apanhar se existir
  const dodVizinho = join(dirname(origem), "dod", "dod.json");
  if (!existsSync(join(destino, "dod.json")) && existsSync(dodVizinho))
    writeFileSync(join(destino, "dod.json"), await normalizar(readFileSync(dodVizinho, "utf8"), ".json"));
}
writeFileSync(MAPA, JSON.stringify(mapa, null, 2));
console.log(`${ordem.length} pacotes em ${PACOTES} · mapa em mapa.json (NÃO mostrar aos juízes).`);
