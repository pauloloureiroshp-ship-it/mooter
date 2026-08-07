#!/usr/bin/env node
/**
 * julgar-local.mjs — o moo local julga o corpus. $0, Ollama, nada sai da maquina.
 *
 * ⚠️ PARAMETRO QUE O PRE-REGISTO NAO FIXOU: a temperatura.
 * O criterio pede "consistencia >=90% (mesmo artefacto 3x, mesmo veredicto)". Com
 * temperature=0 o Ollama e quase deterministico e a consistencia sai ~100% por
 * construcao — mediria o sampler, nao o verificador. Corre-se com a temperatura
 * DEFAULT do modelo (a que um gate real teria), fixada aqui e gravada em cada
 * juizo. Escolha declarada, nao escondida: o PRE-REGISTO omitiu-a e o VEREDICTO
 * di-lo-a.
 *
 * `format: "json"` esta ligado: garante JSON sintacticamente valido. NAO garante
 * conteudo valido — um veredicto que nao parseie para S/N continua a contar como
 * erro E como falha de consistencia, como o pre-registo manda.
 *
 * Uso: node julgar-local.mjs <modelo> [dominio1|dominio2]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "corpus");
const OUT = join(HERE, "juizos");
const OLLAMA = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const TEMPERATURA = 0.7;      // default tipico; fixada para ser reproduzivel
const REPETICOES = 3;
const NUM_CTX = 32768;        // os jogos vao ate 42 KB — sem isto o modelo le metade

const [modelo, dominioArg] = process.argv.slice(2);
if (!modelo) { console.error("uso: julgar-local.mjs <modelo> [dominio1|dominio2]"); process.exit(2); }

const gold = JSON.parse(readFileSync(join(HERE, "gold.json"), "utf8"));
const CHECKS = (await import(pathToFileURL(join(HERE, "..", "piloto", "dod_checks.mjs")).href)).CHECKS;
// item 8 e "n/d (humano)" nos 9 jogos: fora da conta, como o pre-registo declara.
const ITENS = CHECKS.filter((c) => !c.humano).map((c) => ({ id: c.id, desc: String(c.desc) }));

const ENUNCIADO_T1 = readFileSync(join(HERE, "..", "piloto", "T1_SPEC.md"), "utf8")
  .match(/## Prompt[^\n]*\n\n```\n([\s\S]*?)```/)[1].trim();
const ENUNCIADO_T2 = readFileSync(join(HERE, "..", "piloto", "T2_CANDIDATAS.md"), "utf8")
  .split(/^## C/m).find((b) => b.startsWith("4"))
  .match(/### PROMPT \(idêntico nos 3 braços\)\n\n```\n([\s\S]*?)```/)[1].trim();

async function pergunta(prompt) {
  const t0 = Date.now();
  const r = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      // ⚠️ `think: false` NAO e opcional e nao e cosmetico.
      // O qwen3:30b e um modelo de raciocinio. Com `format:"json"` e o pensamento
      // ligado, o Ollama manda a resposta INTEIRA para o campo `thinking` e devolve
      // `response: ""` — 7 tokens de saida, JSON ilegivel. Medido: a resposta estava
      // la e estava certa (`{"correcto":"S"}` dentro de `thinking`). Sem esta linha o
      // spike dava 0% ao qwen3 e eu teria reportado o meu arnes como veredicto do
      // modelo. Vai para os DOIS modelos, para o arnes ser identico e a comparacao
      // valer alguma coisa.
      model: modelo, prompt, stream: false, format: "json", think: false,
      options: { temperature: TEMPERATURA, num_ctx: NUM_CTX },
    }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return {
    texto: j.response || "", ms: Date.now() - t0,
    tokens_in: j.prompt_eval_count ?? null, tokens_out: j.eval_count ?? null,
    eval_duration_ns: j.eval_duration ?? null, load_duration_ns: j.load_duration ?? null,
  };
}

/** Extrai S/N. Tudo o que nao seja inequivocamente S ou N e `null` = erro declarado. */
function normaliza(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (["S", "SIM", "YES", "TRUE", "PASS"].includes(s)) return "S";
  if (["N", "NAO", "NÃO", "NO", "FALSE", "FAIL"].includes(s)) return "N";
  return null;
}

function promptDominio2(html) {
  const lista = ITENS.map((i) => `${i.id}. ${i.desc}`).join("\n");
  return `Es um verificador. Le o codigo-fonte de uma pagina HTML autonoma e decide, para cada criterio, se a pagina o cumpre.

O que foi pedido a quem escreveu a pagina:
---
${ENUNCIADO_T1}
---

CRITERIOS (responde a todos):
${lista}

CODIGO-FONTE:
---
${html}
---

Responde APENAS com JSON no formato {"1":"S","2":"N",...} usando as chaves dos criterios acima e S ou N. Sem explicacoes.`;
}

function promptDominio1(impl, teste) {
  return `Es um verificador. Decide se uma implementacao cumpre o que lhe foi pedido.

O que foi pedido:
---
${ENUNCIADO_T2}
---

IMPLEMENTACAO (valida-handoff.js):
---
${impl}
---

TESTE QUE A ACOMPANHA (valida-handoff.test.js):
---
${teste}
---

A implementacao esta correcta face ao pedido? Responde APENAS com JSON {"correcto":"S"} ou {"correcto":"N"}. Sem explicacoes.`;
}

mkdirSync(OUT, { recursive: true });
const alvo = dominioArg || "ambos";
const resultados = [];

for (const dom of ["dominio1", "dominio2"]) {
  if (alvo !== "ambos" && alvo !== dom) continue;
  for (const item of gold[dom]) {
    const dir = join(CORPUS, item.id);
    if (!existsSync(dir)) { console.error(`  ${item.id}: ausente do corpus`); continue; }
    let prompt;
    if (dom === "dominio1") {
      prompt = promptDominio1(readFileSync(join(dir, "valida-handoff.js"), "utf8"),
        readFileSync(join(dir, "valida-handoff.test.js"), "utf8"));
    } else {
      prompt = promptDominio2(readFileSync(join(dir, "index.html"), "utf8"));
    }
    for (let rep = 1; rep <= REPETICOES; rep++) {
      let saida = null, erro = null, bruto = "";
      try {
        const r = await pergunta(prompt);
        bruto = r.texto;
        let obj = null;
        try { obj = JSON.parse(r.texto); } catch (e) { erro = "json ilegivel: " + e.message.slice(0, 80); }
        if (obj) {
          saida = dom === "dominio1"
            ? { correcto: normaliza(obj.correcto ?? obj.Correcto ?? obj.correto) }
            : Object.fromEntries(ITENS.map((i) => [i.id, normaliza(obj[String(i.id)] ?? obj[i.id])]));
        }
        resultados.push({ dominio: dom, id: item.id, rep, modelo, temperatura: TEMPERATURA,
          saida, erro, ms: r.ms, tokens_in: r.tokens_in, tokens_out: r.tokens_out,
          eval_duration_ns: r.eval_duration_ns, bruto: bruto.slice(0, 400) });
      } catch (e) {
        resultados.push({ dominio: dom, id: item.id, rep, modelo, temperatura: TEMPERATURA,
          saida: null, erro: String(e.message).slice(0, 200), ms: null, bruto: "" });
      }
      const ult = resultados[resultados.length - 1];
      console.error(`  ${modelo} ${item.id} rep${rep}  ${ult.erro ? "ERRO " + ult.erro : (ult.ms + "ms")}`);
    }
  }
}

const ficheiro = join(OUT, `juizos-${modelo.replace(/[:\/]/g, "_")}${alvo === "ambos" ? "" : "-" + alvo}.json`);
writeFileSync(ficheiro, JSON.stringify({ modelo, temperatura: TEMPERATURA, num_ctx: NUM_CTX,
  repeticoes: REPETICOES, format_json: true, resultados }, null, 2));
console.error(`\nescrito: ${ficheiro}  (${resultados.length} juizos)`);
