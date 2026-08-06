#!/usr/bin/env node
// julgar.mjs — painel cego (protocolo v1.1 §4.4-4.6, corrigido pela infra medida em 2026-08-06):
//   · codex/GPT  — âncora, outra casa (codex exec por stdin — funciona, memória G4)
//   · Fable 5    — contexto fresco, MESMA FAMÍLIA do braço A => peso 0,5 declarado
//   · kimi-k3    — SÓ se responder dentro de KIMI_TIMEOUT_MS (streaming); senão moo local
//                  (Ollama) como 3ª voz, DECLARADO no resultado. Gemini NÃO — CLI morto (§7.1).
// A sonda de proveniência (§4.5) vai embutida no prompt. Rubrica fixa (§4.6).
// Este script NUNCA lê mapa.json; recusa pacotes contaminados com mapa/meta.
//
// Uso:  node julgar.mjs               # julga todos os pacotes em piloto/pacotes/
//       node julgar.mjs --revelar     # só abre o mapa se existirem ≥3 veredictos

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACOTES = join(HERE, "pacotes");
const VEREDICTOS = join(HERE, "veredictos");
const KIMI_TIMEOUT_MS = +(process.env.KIMI_TIMEOUT_MS || 240000); // §7.2 — o tecto que o kimi tem de caber

const RUBRICA = `RUBRICA FIXA (pesos): DoD anexa 40% · robustez 20% · qualidade de código (já normalizado) 20% · experiência operacionalizada (fluidez medida no dod.json + capturas) 20%.
Para CADA artefacto (ART-x): nota 0-10 por critério + nota final ponderada + 3 frases de justificação.
SONDA DE PROVENIÊNCIA (obrigatória): declara de que modelo/setup achas que veio cada artefacto e porquê (1 frase). A tua taxa de acerto será medida.
Avalia comportamento e estrutura — o estilo foi normalizado de propósito. Responde em JSON: {"artefactos":[{"id":"ART-1","dod":n,"robustez":n,"codigo":n,"experiencia":n,"final":n,"justificacao":"...","proveniencia_palpite":"..."}]}`;

// --- revelar (guardado): só depois dos 3 veredictos (§4.3) ---
if (process.argv.includes("--revelar")) {
  const n = existsSync(VEREDICTOS) ? readdirSync(VEREDICTOS).filter((f) => f.endsWith(".json")).length : 0;
  if (n < 3) { console.error(`RECUSADO: só ${n}/3 veredictos — o mapa continua fechado (§4.3).`); process.exit(1); }
  console.log(readFileSync(join(HERE, "mapa.json"), "utf8"));
  process.exit(0);
}

if (!existsSync(PACOTES)) { console.error("Sem pacotes — correr baralhar.mjs primeiro."); process.exit(2); }
const arts = readdirSync(PACOTES).filter((d) => d.startsWith("ART-")).sort();
if (!arts.length) { console.error("pacotes/ vazio."); process.exit(2); }

// guarda anti-fuga: nenhum pacote pode conter mapa/meta
for (const a of arts) for (const f of readdirSync(join(PACOTES, a)))
  if (/^(mapa|meta)\.json$/.test(f)) { console.error(`RECUSADO: ${a}/${f} contamina o pacote — regenerar com baralhar.mjs.`); process.exit(1); }

function corpoPacotes() {
  let corpo = "";
  for (const a of arts) {
    corpo += `\n\n===== ${a} =====\n`;
    for (const f of readdirSync(join(PACOTES, a)).sort()) {
      if (/\.(png|jpg|gif)$/.test(f)) { corpo += `\n[captura anexa: ${f} — descrita no dod.json]\n`; continue; }
      corpo += `\n--- ${f} ---\n${readFileSync(join(PACOTES, a, f), "utf8").slice(0, 40000)}\n`;
    }
  }
  return corpo;
}

const prompt = `És um juiz cego num teste A/B/C. Recebes ${arts.length} artefactos anonimizados (ART-1…) com o seu dod.json (verificação funcional feita por harness, não por LLM).\n${RUBRICA}\n${corpoPacotes()}`;

mkdirSync(VEREDICTOS, { recursive: true });
const painel = [];

// 1) codex — âncora (outra casa). Por stdin, em linha com a memória G4 (motor diferente).
try {
  const r = spawnSync("codex", ["exec", "--sandbox", "read-only", "-"], { input: prompt, encoding: "utf8", timeout: 900000, shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0 && r.stdout?.trim()) {
    writeFileSync(join(VEREDICTOS, "codex.json"), JSON.stringify({ juiz: "codex (âncora, outra casa)", peso: 1, bruto: r.stdout }, null, 2));
    painel.push("codex ✓");
  } else painel.push(`codex ✗ (exit ${r.status}) — registado, sem substituto da mesma casa`);
} catch (e) { painel.push(`codex ✗ (${e.message.slice(0, 80)})`); }

// 2) Fable 5 — contexto fresco, hooks OFF, peso 0,5 (mesma família do braço A — §4.4)
try {
  const r = spawnSync("claude", ["-p", prompt, "--model", "claude-fable-5", "--settings", join(HERE, "settings.no-mooter.json"), "--output-format", "json", "--dangerously-skip-permissions"], { encoding: "utf8", timeout: 900000, shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0 && r.stdout?.trim()) {
    writeFileSync(join(VEREDICTOS, "fable5.json"), JSON.stringify({ juiz: "Fable 5 (contexto fresco)", peso: 0.5, motivo_peso: "mesma família do braço A — sub-ponderado (§4.4)", bruto: r.stdout }, null, 2));
    painel.push("fable5 ✓ (peso 0,5)");
  } else painel.push(`fable5 ✗ (exit ${r.status})`);
} catch (e) { painel.push(`fable5 ✗ (${e.message.slice(0, 80)})`); }

// 3) kimi-k3 SE couber no timeout; senão moo local (Ollama), declarado (§4.4 + §7.2)
let terceiraVoz = null;
if (process.env.MOONSHOT_API_KEY) {
  try {
    const r = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MOONSHOT_API_KEY}` },
      body: JSON.stringify({ model: "kimi-k3", temperature: 1, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(KIMI_TIMEOUT_MS),
    });
    if (r.ok) {
      const j = await r.json();
      terceiraVoz = { juiz: "kimi-k3", peso: 1, bruto: j.choices?.[0]?.message?.content ?? "n/d", usage: j.usage ?? "n/d" };
      painel.push("kimi ✓ (coube no timeout)");
    } else painel.push(`kimi ✗ HTTP ${r.status} → moo local`);
  } catch { painel.push(`kimi ✗ (timeout ${KIMI_TIMEOUT_MS}ms — §7.2) → moo local`); }
} else painel.push("kimi ✗ (MOONSHOT_API_KEY ausente) → moo local");

if (!terceiraVoz) {
  try {
    const r = await fetch("http://localhost:11434/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.MOO_JUDGE_MODEL || "qwen3:30b", prompt, stream: false }),
      signal: AbortSignal.timeout(1200000),
    });
    if (r.ok) { terceiraVoz = { juiz: `moo local (${process.env.MOO_JUDGE_MODEL || "qwen3:30b"})`, peso: 1, declarado: "substituto do kimi — DECLARADO no resultado (§4.4)", bruto: (await r.json()).response ?? "n/d" }; painel.push("moo local ✓ (declarado)"); }
    else painel.push(`moo local ✗ HTTP ${r.status}`);
  } catch (e) { painel.push(`moo local ✗ (${e.message.slice(0, 80)}) — painel fica a 2 vozes, DECLARADO`); }
}
if (terceiraVoz) writeFileSync(join(VEREDICTOS, "terceira-voz.json"), JSON.stringify(terceiraVoz, null, 2));

writeFileSync(join(VEREDICTOS, "painel.json"), JSON.stringify({ ts: new Date().toISOString(), painel, gemini: "EXCLUÍDO — CLI morto/Antigravity (§7.1)", kimi_timeout_ms: KIMI_TIMEOUT_MS }, null, 2));
console.log(painel.join("\n"));
console.log(`Veredictos em ${VEREDICTOS}. Mapa só com: node julgar.mjs --revelar (exige 3 veredictos).`);
