#!/usr/bin/env node
// julgar.mjs v2 — painel cego (protocolo v1.1 §4.4-4.6, corrigido pela infra medida em 2026-08-06):
//   · codex/GPT  — âncora, outra casa (codex exec por stdin — funciona, memória G4)
//   · Fable 5    — contexto fresco, MESMA FAMÍLIA do braço A => peso 0,5 declarado
//   · kimi-k3    — streaming + timeout subido (fix §7.2); se não couber, moo local
//                  (Ollama) como 3ª voz, DECLARADO. Gemini NÃO — CLI morto (§7.1).
// v2 incorpora a verificação adversarial de 2026-08-06 (crítico≠autor):
//   Δ --revelar conta SÓ veredictos reais (painel.json não conta) — §4.3
//   Δ prompt do juiz Fable por STDIN (argv+shell:true mutila e rebenta aos 32k no Windows)
//   Δ juízes correm em cwd ISOLADO (tmp) + Fable sem tools — mapa.json/runs/ fora do alcance
//   Δ kimi com stream:true e default 600s (240s provou não chegar — job-mshq2ggm)
//   Δ rubrica manda marcar "acabamento visual: n/d" — juízes de texto NÃO veem capturas; nunca inventar
// Este script NUNCA lê mapa.json; recusa pacotes contaminados.
//
// Uso:  node julgar.mjs               # julga todos os pacotes em piloto/pacotes/
//       node julgar.mjs --revelar     # só abre o mapa se existirem ≥3 veredictos REAIS

import { spawnSync } from "node:child_process";
import { citaArg } from "./guardas.mjs";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACOTES = join(HERE, "pacotes");
const VEREDICTOS = join(HERE, "veredictos");
const VEREDICTOS_REAIS = ["codex.json", "fable5.json", "terceira-voz.json"]; // painel.json NÃO é veredicto
const KIMI_TIMEOUT_MS = +(process.env.KIMI_TIMEOUT_MS || 600000); // fix §7.2: 240s provou não chegar

const RUBRICA = `RUBRICA FIXA (pesos): DoD anexa 40% · robustez 20% · qualidade de código (já normalizado) 20% · experiência operacionalizada 20% (fluidez MEDIDA no dod.json: FPS/input lag + acabamento visual).
ACABAMENTO VISUAL: tu és um juiz de texto e NÃO consegues ver as capturas — marca essa sub-parcela "n/d" e pondera a experiência apenas pela fluidez medida. NUNCA inventes o que não viste.
Para CADA artefacto (ART-x): nota 0-10 por critério + nota final ponderada + 3 frases de justificação.
SONDA DE PROVENIÊNCIA (obrigatória): declara de que modelo/setup achas que veio cada artefacto e porquê (1 frase). A tua taxa de acerto será medida.
Avalia comportamento e estrutura — o estilo foi normalizado de propósito. Trabalha SÓ com o material fornecido neste prompt; não procures ficheiros fora dele.
Responde em JSON: {"artefactos":[{"id":"ART-1","dod":n,"robustez":n,"codigo":n,"experiencia":n,"final":n,"justificacao":"...","proveniencia_palpite":"..."}]}`;

// --- revelar (guardado): só depois dos 3 veredictos REAIS (§4.3) ---
if (process.argv.includes("--revelar")) {
  const n = existsSync(VEREDICTOS) ? readdirSync(VEREDICTOS).filter((f) => VEREDICTOS_REAIS.includes(f)).length : 0;
  if (n < 3) { console.error(`RECUSADO: só ${n}/3 veredictos reais (painel.json não conta) — o mapa continua fechado (§4.3).`); process.exit(1); }
  console.log(readFileSync(join(HERE, "mapa.json"), "utf8"));
  process.exit(0);
}

if (!existsSync(PACOTES)) { console.error("Sem pacotes — correr baralhar.mjs primeiro."); process.exit(2); }
const arts = readdirSync(PACOTES).filter((d) => d.startsWith("ART-")).sort();
if (!arts.length) { console.error("pacotes/ vazio."); process.exit(2); }

// guarda anti-fuga: pacote não pode conter mapa/meta/transcrições/logs do driver
for (const a of arts) for (const f of readdirSync(join(PACOTES, a)))
  if (/^(mapa|meta)\.json$|^(tentativa|transcricao)-|\.stderr\.txt$|^driver\.log$/.test(f)) {
    console.error(`RECUSADO: ${a}/${f} contamina o pacote — regenerar com baralhar.mjs.`); process.exit(1);
  }

function corpoPacotes() {
  let corpo = "";
  for (const a of arts) {
    corpo += `\n\n===== ${a} =====\n`;
    for (const f of readdirSync(join(PACOTES, a)).sort()) {
      if (/\.(png|jpg|gif)$/.test(f)) { corpo += `\n[captura ${f}: presente no pacote mas invisível para juiz de texto — ver rubrica]\n`; continue; }
      corpo += `\n--- ${f} ---\n${readFileSync(join(PACOTES, a, f), "utf8").slice(0, 40000)}\n`;
    }
  }
  return corpo;
}

const prompt = `És um juiz cego num teste A/B/C. Recebes ${arts.length} artefactos anonimizados (ART-1…) com o seu dod.json (verificação funcional feita por harness, não por LLM).\n${RUBRICA}\n${corpoPacotes()}`;

mkdirSync(VEREDICTOS, { recursive: true });
const painel = [];
const cwdIsolado = () => mkdtempSync(join(tmpdir(), "piloto-juiz-")); // longe de mapa.json e runs/

// 1) codex — âncora (outra casa). Prompt por stdin; cwd isolado (read-only lê na mesma — isolar o que há para ler).
try {
  const r = spawnSync("codex", ["exec", "--sandbox", "read-only", "-"], { input: prompt, cwd: cwdIsolado(), encoding: "utf8", timeout: 900000, shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0 && r.stdout?.trim()) {
    writeFileSync(join(VEREDICTOS, "codex.json"), JSON.stringify({ juiz: "codex (âncora, outra casa)", peso: 1, bruto: r.stdout }, null, 2));
    painel.push("codex ✓");
  } else painel.push(`codex ✗ (exit ${r.status}) — registado, sem substituto da mesma casa`);
} catch (e) { painel.push(`codex ✗ (${e.message.slice(0, 80)})`); }

// 2) Fable 5 — contexto fresco, hooks OFF, SEM tools, prompt por STDIN, cwd isolado; peso 0,5 (§4.4)
try {
  // ⚠️ `citaArg` — quarta aparição do mesmo defeito (ver julgar-args.test.mjs).
  // Sem aspas, `shell: true` parte o caminho no espaço de "Paulo Loureiro", o CLI
  // responde `Settings file not found: C:\Users\Paulo`, e o catch abaixo limita-se
  // a escrever `fable5 ✗` no painel: o veredicto sairia com DOIS juízes em vez de
  // três, com ar de "o terceiro falhou" quando nunca chegou a correr.
  const args = ["-p", "--model", "claude-fable-5", "--settings", citaArg(join(HERE, "settings.no-mooter.json")),
    "--disallowedTools", "Bash,Read,Glob,Grep,Write,Edit,WebFetch,WebSearch,Agent,Task,NotebookEdit",
    "--output-format", "json"];
  const r = spawnSync("claude", args, { input: prompt, cwd: cwdIsolado(), encoding: "utf8", timeout: 900000, shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0 && r.stdout?.trim()) {
    writeFileSync(join(VEREDICTOS, "fable5.json"), JSON.stringify({ juiz: "Fable 5 (contexto fresco, sem tools, cwd isolado)", peso: 0.5, motivo_peso: "mesma família do braço A — sub-ponderado (§4.4)", bruto: r.stdout }, null, 2));
    painel.push("fable5 ✓ (peso 0,5)");
  } else painel.push(`fable5 ✗ (exit ${r.status})`);
} catch (e) { painel.push(`fable5 ✗ (${e.message.slice(0, 80)})`); }

// 3) kimi-k3 com streaming + timeout subido (fix §7.2); senão moo local (Ollama), declarado (§4.4)
let terceiraVoz = null;
if (process.env.MOONSHOT_API_KEY) {
  try {
    const r = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MOONSHOT_API_KEY}` },
      body: JSON.stringify({ model: "kimi-k3", temperature: 1, stream: true, stream_options: { include_usage: true }, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(KIMI_TIMEOUT_MS),
    });
    if (r.ok) {
      let texto = "", usage = null, buf = "";
      const dec = new TextDecoder();
      for await (const chunk of r.body) {
        buf += dec.decode(chunk, { stream: true });
        const linhas = buf.split("\n"); buf = linhas.pop();
        for (const l of linhas) {
          if (!l.startsWith("data: ") || l.includes("[DONE]")) continue;
          try { const j = JSON.parse(l.slice(6)); texto += j.choices?.[0]?.delta?.content || ""; if (j.usage) usage = j.usage; } catch { /* fragmento SSE */ }
        }
      }
      if (texto.trim()) { terceiraVoz = { juiz: "kimi-k3 (streaming)", peso: 1, bruto: texto, usage: usage ?? "n/d" }; painel.push(`kimi ✓ (coube em ${KIMI_TIMEOUT_MS}ms com streaming — fix §7.2)`); }
      else painel.push("kimi ✗ (resposta vazia) → moo local");
    } else painel.push(`kimi ✗ HTTP ${r.status} → moo local`);
  } catch { painel.push(`kimi ✗ (timeout ${KIMI_TIMEOUT_MS}ms mesmo com streaming; parcial DESCARTADO — veredicto incompleto não conta) → moo local`); }
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

writeFileSync(join(VEREDICTOS, "painel.json"), JSON.stringify({
  ts: new Date().toISOString(), painel,
  gemini: "EXCLUÍDO — CLI morto/Antigravity (§7.1)", kimi_timeout_ms: KIMI_TIMEOUT_MS,
  riscos_residuais_declarados: [
    "codex read-only pode em teoria ler disco fora do cwd isolado; mitigação = cwd tmp + prompt manda usar só o material fornecido",
    "acabamento visual julgado como n/d pelos juízes de texto — parcela da rubrica coberta só pela fluidez medida do harness",
  ],
}, null, 2));
console.log(painel.join("\n"));
console.log(`Veredictos em ${VEREDICTOS}. Mapa só com: node julgar.mjs --revelar (exige 3 veredictos REAIS).`);
