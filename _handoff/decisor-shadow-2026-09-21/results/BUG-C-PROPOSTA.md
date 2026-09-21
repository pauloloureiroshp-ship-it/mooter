# Bug C — os `option_a_miss` do 14b quente são o prazo do filho preso no piso de 1 s (proposta, NÃO aplicada)

**Pergunta (MP5 §2.1, pré-registada em `protocol.json#mp5.parte_2_higiene_T0`):** os 7/20 miss do MP4-a com o
`qwen2.5-coder:14b` quente vão para onde — carga de contexto, prompt do Option A, ou geração?

## Medição (2026-09-21, RTX 4090, 14b residente `Forever`, contexto 4096; bruto em `bug-c-medicao.json`)

**A — 20 prompts T0 pelo hook real** (`tools/router/inject_context.js` do repo, HOME fiel com `hw-capability.json`,
`subscription-profile.json`, `ollama-warmup.js`, `catalogo-local.json`, `latencia-local.jsonl` e `settings.json`
(`timeout: 3`) copiados; sem chave; sem shadow): **19 hit / 1 miss** (`timeout_1000ms`), hook p50 561 ms. O selector
de latência mandou 3 dos 20 para o `qwen2.5:3b` (HOME com o `latencia-local.jsonl` vivo — mais fiel que o MP4-a, que
não o tinha). Hits do 14b entre 74 e 902 ms; o miss saiu aos 1 053 ms.

**B — os mesmos 20 prompts com o MESMO corpo do `ollama_call_node.js`** (SYSTEM extraído do ficheiro, `temperature`
0,2, `num_predict` 256, `keep_alive` −1, `think` false) em `POST /api/generate` **sem prazo**, campos de tempo do
próprio Ollama:

| Parcela | mediana | máx | quota do tempo total |
|---|---|---|---|
| `load_duration` | 3 ms | 4 ms | **0,7 %** — o modelo nunca recarregou |
| `prompt_eval` | 90 tokens · 25 ms | 94 tokens · 27 ms | **5,6 %** — SYSTEM + prompt ≈ 90 tokens |
| `eval` (geração) | 32 tokens · 415 ms | **84 tokens · 1 110 ms** | **93,2 %** — 77 tok/s |
| `total_duration` | 449 ms | 1 140 ms | p95 893 ms; **1/20 acima de 1 000 ms** |

**C — cruzamento:** o único miss de A (prompt 4, «resume o ficheiro hub/src/llm.ts») é o único prompt de B acima de
1 000 ms (84 tokens gerados). Os 19 hits de A correspondem a totais de B entre 62 e 893 ms. (Amostras diferentes —
temperatura 0,2 sem seed — por isso a correspondência é por distribuição, não por igualdade.)

**Diagnóstico (regra pré-registada `geracao_longa`/`orcamento_curto`):** não é carga (0,7 %), não é o prompt (5,6 %,
90 tokens). É a **geração** contra um prazo de 1 000 ms: a 77 tok/s cabem ~75 tokens, e o SYSTEM pede «nunca mais de
3 frases» mas o `num_predict` 256 deixa gerar até 3,3 s. Qualquer resposta acima de ~72 tokens é um miss.

## Porque é que o prazo é 1 000 ms quando o orçamento é ~2 200 ms

Cadeia medida: `settings.json` concede 3 000 ms → o hook desconta o que já gastou (classify etc., **190–225 ms**
medidos = `hook_ms − option_a_ms`) e `MARGEM_SAIDA_MS` 600 → **orçamento ≈ 2 175–2 210 ms** → o filho faz
`max(1000, orçamento − MARGEM_MS)` com **`MARGEM_MS = 1500`** → ≈ 700 → **piso 1 000 ms**. O piso é a única coisa que
o filho vê. A margem de 1 500 ms foi «para arrancar o Node, ler o env, montar o pedido e escrever a saída» — medido
hoje: **startup do Node 28 ms (máx 31)**, e `wall do filho − total_duration do Ollama` para o mesmo prompt =
**39 · 42 · 45 · 52 · 53 ms**, um outlier a 225 ms (1.ª corrida). A margem é ~30× o custo real.

## Proposta (1 linha em `tools/router/ollama_call_node.js`; NÃO aplicada — o MP5 manda propor com a medição)

```
- const MARGEM_MS = 1500;
+ const MARGEM_MS = 300;   // medido 2026-09-21: startup 28 ms, overhead 39–53 ms, outlier 225 ms — 300 cobre-os com folga
```

Efeito com o `timeout: 3` actual: prazo do filho ≈ **1 875–1 910 ms** em vez de 1 000 → cabem ~145 tokens a 77 tok/s;
na amostra B, **20/20** abaixo do prazo (máx 1 140 ms) em vez de 19/20. O pai continua a matar o filho ao fim do
orçamento (`spawnSync timeout: orcamentoMs`), com ≥ 300 ms de folga para o filho escrever. `ollama_call_node.test.js`
importa `MARGEM_MS` do módulo (não crava 1 500) — os testes das linhas 30–35 e 43 continuam a passar; os das linhas
59–60 (piso 1 000) também. **Não é `num_predict`**: baixá-lo (256 → ~96, o que «3 frases» custa) trocaria miss por
resposta truncada — fica como nota, não como proposta.

## O que isto NÃO explica nem corrige

- **A taxa viva** (79 timeouts em 94 chamadas ao 14b no `latencia-local.jsonl`; 28 de 30 entre 17/09 e a regeneração
  do `hw-capability.json` às 11:46Z de hoje) é maior do que 1/20 porque, até hoje, o 14b estava a ser **despejado**
  pelo `qwen3:30b` (Bug A): um reload de 9 GB leva segundos e nenhum prazo dentro de 3 s o cobre. O `qwen2.5:3b` a dar
  `timeout_1000ms` (12 de 14 no mesmo período) é a assinatura disso — quente, responde em 60–110 ms.
- **Taxa viva depois do Bug A: n/d** (1 evento no log desde as 11:46Z, um hit no 3b). Mede-se com o log a andar.
- Não mexe no shadow (timeout 800 ms, modelo) — proibido pelo MP5 e sem relação: o shadow corre desligado, fora do
  orçamento do hook.
