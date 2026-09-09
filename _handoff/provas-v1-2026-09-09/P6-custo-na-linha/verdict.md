# P6 · Custo na linha — veredicto

**Corrida:** 2026-09-09 · protocolo congelado e **commitado antes** da corrida (`61007b23`) · instrumento `tools/router/cost-line.js` (aditivo, 11 testes que mordem) · bruto em `results/linhas-2.jsonl` · `results/ledger-actual.json` · `results/analysis.json`.

## Veredicto em uma linha

**Ganhou por construção, com o Δ impresso.** O ledger actual desta máquina tem **0 linhas** com custo *e* origem em 2 134 eventos; as 156 linhas 2 desta corrida têm custo, origem e contagens em 156/156, sem nenhum `n/d`. A reconciliação com a telemetria do host, nas 20 chamadas Haiku, dá **Δ = −94 %** — e o Δ é explicável linha a linha: o SSOT de preços não modela cache, o CLI sim.

## Os números

### A · o ledger como está (esta máquina, 2026-09-09)

| Fonte | Linhas | Com campo de custo | Custo > 0 | Com **origem** do custo | Com tokens |
|---|---|---|---|---|---|
| `~/.claude/tools/router/decisions.log` · `classified` | 916 | 0 | 0 | 0 | 0 |
| `decisions.log` · `executed` | 492 | 479 (todas `0`) | 0 | 0 | 1 |
| `~/.mooter/ledger.jsonl` · todas | 726 | 8 | 3 | 0 | 20 |
| `ledger.jsonl` · `done` | 20 | 8 | 3 | 0 | 20 |

Leitura: 479 linhas dizem `cost_usd: 0` sem dizer porquê (478 dos `executed` são `deferred` — nunca correram); 20 linhas `done` têm tokens mas só 8 têm custo e nenhuma diz de onde vem.

### B · as linhas 2 desta corrida

| Origem (`cost_source`) | Linhas | `cost_usd` | O que carrega |
|---|---|---|---|
| `rule_local` (P1, regra) | 63 | 0 | 0/0 tokens por construção |
| `ollama_local` (P1 juiz + P2 holdout) | 73 | 0 | `prompt_eval_count`/`eval_count` do próprio Ollama |
| `subscription_included` (P2 Haiku) | 20 | 0 desembolso | `list_price_usd` do SSOT ao lado · `cache_read`/`cache_creation` · `host_reported_cost_usd` do CLI |
| **Total** | **156** | **156 com custo e origem, 0 `n/d`** | `priced_at: 2026-08-03` (lido do cabeçalho de `pricing.js`) |

### Reconciliação (P2, 20 chamadas Haiku via `claude -p`)

| | USD |
|---|---|
| Soma do preço de lista das nossas linhas (input + output, SSOT) | **0,0796** |
| Soma do `total_cost_usd` reportado pelo CLI (telemetria do host) | **1,3185** |
| Δ | **−1,2389 (−94 %)** |

O Δ tem explicação e fica impresso: o CLI precifica **601 742 tokens de `cache_creation`** e **354 357 de `cache_read`** (o prefixo do Claude Code, mesmo com hooks desligados); o SSOT `pricing.js` só tem input/output. Aos preços de Haiku 4.5 com cache de 1 h (2× input) e leitura (0,1× input): 601 742 × 2/M + 354 357 × 0,1/M + 15 881 × 5/M ≈ 1,20 + 0,04 + 0,08 = **1,32** — bate com o host. Ou seja: **a nossa linha está certa no que conta e o SSOT está incompleto no que não conta** (cache). Correcção proposta, não aplicada aqui (SSOT é decisão do dono): multiplicadores de cache em `pricing.js`.

Para as 73 linhas `ollama_local`, Δ = 0 **por construção** — a fonte das contagens é o próprio Ollama; não é uma verificação independente.

## Leitura honesta

1. **O que ganhou:** cada decisão desta corrida tem custo, origem e contagens na mesma linha. O ledger actual não tem nenhuma. A diferença é estrutural e é o C2-min do roadmap.
2. **O que não ganhou:** o número do custo. O preço de lista do SSOT explica 6 % do que o host cobra ao Haiku porque ignora cache. Quem ler `list_price_usd` sem `cache_*` ao lado engana-se por 16×. A linha imprime as contagens de cache precisamente para isso.
3. **Nada aqui é poupança.** As 156 linhas somam 0 de desembolso porque são regra, Ollama e subscrição — isso descreve *como se pagou*, não *quanto se poupou*. Proibido converter.
4. **Ainda não está ligado ao produto.** `cost-line.js` existe e tem testes; nenhum escritor do ledger o chama. É o mesmo padrão do `adaptive-learner` (0 callers): o caminho existe, o ciclo não. Declarado em `10-NAO-PROVADO.md`.

## O que isto NÃO prova

- Poupança (proibido). Que o preço de lista é o que o dono paga (é subscrição). Que `cache_read` do CLI é comparável ao `input` do SSOT. Que o produto instalado escreve estas linhas (não escreve).

## Reproduzir

```
cd tools/router && node --test cost-line.test.js
node _handoff/provas-v1-2026-09-09/P6-custo-na-linha/run.mjs
```
