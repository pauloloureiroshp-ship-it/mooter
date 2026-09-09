# P2 · O tier que recomendamos vale alguma coisa — veredicto

**Corrida:** 2026-09-09 · protocolo congelado antes da primeira corrida (`protocol.json`) · oráculos dos 10 novos casos revistos por Codex antes de congelar (10/10 concordam, `oracle-review-codex.json`) · bruto em `results/` · `results/analysis.json` (`node run.mjs --analyse`).

## Veredicto em uma linha

**Ganhou, com uma reserva impressa.** Quando o router (com chave) diz «escala», tem razão: 11 das 13 falhas do modelo local estavam marcadas T1 antes de correr, e o modelo do tier resolveu 10 dessas 11. Mas «Haiku em tudo» resolve 12 das 13 — o sinal do tier poupa 7 chamadas ao Haiku ao custo de 2 falhas que ficaram no local. **E sem chave — o estado real desta máquina — o router diz T0 em 20/20 e o resultado é o do modelo local: 7/20.**

## Os números

| Braço | 20 casos | dev (10, Codex) | holdout (10, novos) | Resolve as falhas do local |
|---|---|---|---|---|
| A · local `qwen2.5-coder:14b` (sem chave = tudo T0) | **7/20 = 35 %** [18; 57] | 4/10 | 3/10 | — (13 falhas) |
| B · modelo do tier recomendado (chave presente): T0 → local, T1 → Haiku | **17/20 = 85 %** [64; 95] | 8/10 | 9/10 | **10 de 13** |
| C · Haiku em todos os 20 (controlo) | **19/20 = 95 %** [76; 99] | 9/10 | 10/10 | 12 de 13 |

- **Facto prévio confirmado e replicado no holdout:** falhas do local marcadas T1 pelo router com chave: dev **5 de 6**, holdout **6 de 7** → 11 de 13. Sem chave: 0 de 13 (tudo T0).
- **McNemar direccional, B > A** (pré-registado): 20 casos b=10, c=0 → **p = 0,00098**; só holdout b=6, c=0 → **p = 0,0156**.
- **B vs C:** b=0, c=2 → p(C>B) = 0,25. As 2 são L3-b e L3-d: o router disse T0, o local falhou, o Haiku teria acertado. O router nunca recomendou T2/T3 nestes 20: o «tier» aqui é binário (local vs Haiku).
- **Custo:** local 55–171 tokens in, 10–19 out, p50 300 ms. Haiku via `claude -p`: 10 tokens in + 142–5 435 out (média 794) + **16–48 k tokens de cache lidos por chamada** (o prefixo do Claude Code, mesmo com hooks desligados e system prompt substituído), p50 8,2 s, máx 52,8 s; custo de lista reportado pelo CLI para as 20 chamadas: US$ 1,32 — **pago pela subscrição, API = US$ 0**.
- A única falha do Haiku (L4-b) devolveu `[1,5]` em vez de `["1","5"]`: o critério é exacto, e fica.

## Leitura honesta

1. **O sinal «escala» é informativo neste corpus.** 11/13 das falhas locais estavam sinalizadas antes de correr. É o que o P2 perguntava, e a resposta é sim, com p = 0,001 (20) e p = 0,016 (holdout, pré-registado como o número limpo).
2. **Mas o tier não é melhor do que «Haiku sempre».** 85 % vs 95 %. O que o tier compra é não gastar Haiku em 7 casos T0 — 5 dos quais o local acertou, 2 não. Se o critério fosse só exactidão, C ganha; se for exactidão por chamada cara, B faz 17/20 com 13 chamadas ao Haiku em vez de 20. Nenhum dos dois é «poupança»: é subscrição.
3. **Sem chave, nada disto acontece.** O router desta máquina (sem `ANTHROPIC_API_KEY`) marca os 20 casos T0 e o utilizador fica com 7/20. O sinal existe no código e não chega ao utilizador que instala sem chave. É a mesma degradação T1→T0 do P1.
4. **O corpus é sintético e pequeno.** 20 tarefas JSON de escada L1–L5, duas por nível. Os 10 do holdout foram escritos por mim e revistos pelo Codex; o Haiku acertou os 10. Um teto de 100 % no holdout não discrimina.

## O que isto NÃO prova

- Prompts reais longos (P1 diz que a regra sub-classifica prompts reais). Obediência (P3). Que o Haiku é barato — é subscrição, e o CLI lê 16–48 k tokens de cache por chamada de 10 tokens. Que T2/T3 acrescentam algo: nunca foram recomendados aqui.

## Correcções ao instrumento nesta corrida

- O braço Haiku v1 usou `spawnSync('claude', …, {shell:true})`: 3 de 4 chamadas partidas pelo `cmd.exe`, a 4.ª respondeu ao contexto dos hooks. **Corrigido** para executável real + prompt por stdin + `disableAllHooks` (D5 em `09-DEFEITOS-APANHADOS.md`); a corrida v1 está no git (`f2739bcb`) e não conta.
- `AMENDMENT`: nenhuma alteração ao protocolo.

## Reproduzir

```
node _handoff/provas-v1-2026-09-09/P2-o-tier-vale-alguma-coisa/run.mjs --classify
node _handoff/provas-v1-2026-09-09/P2-o-tier-vale-alguma-coisa/run.mjs --local --set holdout
node _handoff/provas-v1-2026-09-09/P2-o-tier-vale-alguma-coisa/run.mjs --cloud --model haiku
node _handoff/provas-v1-2026-09-09/P2-o-tier-vale-alguma-coisa/run.mjs --analyse
```
