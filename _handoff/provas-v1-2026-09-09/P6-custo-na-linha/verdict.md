# P6 · Custo na linha — veredicto (v2, depois do adversário)

**Corrida v2:** 2026-09-09T14:06:36Z · protocolo `61007b23` commitado na **mesma linha de shell** que a corrida v1 (`git commit && node run.mjs`): o `%cI` do commit (13:51:24Z, resolução de 1 s) e o `at` da `analysis.json` v1 (13:51:24,449Z, commit `030374b1`) caem no **mesmo segundo** — a ordem vem da sequência do comando, não dos timestamps; `ERRATA-timestamps.md` explica o `congelado_em` errado da v1 · instrumento `tools/router/cost-line.js` v2 (aditivo, **15/15 testes** com valores calculados à mão) · `AMENDMENT-1.md` (o que mudou e porquê) · bruto em `results/linhas-2.jsonl`, `results/ledger-actual.json`, `results/analysis.json` · adversário em `adversary.md`.

## Veredicto em uma linha

**Cobertura de formato demonstrada numa corrida instrumentada; custo verificado, não.** O ledger vivo desta máquina tem **0 linhas** com custo *e* origem, nos dois cortes: no corte do protocolo (braço A: `classified` 939 + `executed` 492 + ledger `done` 20 = **1 451** eventos, 0) e no corte exploratório (ledger `all` 726 em vez de `done`: **2 157** eventos, 0) — `results/ledger-actual.json`, `with_cost_and_source`; as 156 linhas 2 desta corrida têm custo, origem e contagens em 156/156 — mas isso é o instrumento a preencher o formato, e o produto instalado **não escreve** estas linhas. Nas 20 chamadas Haiku, o preço de lista input/output do SSOT (US$ 0,0796) fica **−94 %** abaixo do que o host reporta (US$ 1,3185); com as contagens de cache aos preços publicados (escrita 1 h a 2×, leitura a 0,1×) o host reconstrói-se com **resíduo 0 em 20/20 chamadas**.

## Os números

### A · o ledger vivo, tal como está (2026-09-09T14:06Z)

| Fonte | Linhas | Com campo de custo | Custo > 0 | Com **origem** do custo | Com tokens |
|---|---|---|---|---|---|
| `~/.claude/tools/router/decisions.log` · `classified` | 939 | 0 | 0 | 0 | 0 |
| `decisions.log` · `executed` | 492 | 479 (todas `0`) | 0 | 0 | 1 |
| `~/.mooter/ledger.jsonl` · `done` (corte do protocolo) | 20 | 8 | 3 | 0 | 20 |
| `ledger.jsonl` · todos os eventos (exploratório) | 726 | 8 | 3 | 0 | 20 |

Somas (`results/ledger-actual.json`): corte do protocolo 939 + 492 + 20 = **1 451** eventos, 0 com custo *e* origem; corte exploratório 939 + 492 + 726 = **2 157** eventos, 0. Os dois cortes não se somam entre si — o segundo troca `done` por `all`.

Leitura: 479 linhas `executed` dizem `cost_usd: 0` sem dizer porquê — 478 delas estão **registadas como `deferred`** (não se afirma que nunca correram noutro sítio); 20 linhas `done` têm tokens, 8 têm custo, **nenhuma diz de onde vem o número**. O `classified` cresceu de 916 (v1: `results/analysis.json` tal como está no commit `030374b1`, `A_ledger_actual.decisions_log.classified.total`; o ficheiro na árvore de trabalho é já a v2) para 939 (`results/ledger-actual.json`) porque as sessões P3/P5 deste pacote escrevem no log vivo; não há *snapshot* imutável com hash (pedido pelo adversário, não feito).

### B · as linhas 2 desta corrida (156)

| Origem (`cost_source`, **declarada por quem chama**) | Linhas | `cost_usd` | Contagens | `completeness` |
|---|---|---|---|---|
| `rule_local` (P1, regra) | 63 | 0 | 0/0 **por política** (a regra não gasta tokens; o número é sintético) | complete |
| `ollama_local` (P1 juiz + P2 holdout) | 73 | 0 | `prompt_eval_count`/`eval_count` do próprio Ollama, as duas obrigatórias | complete |
| `subscription_included` (P2 Haiku) | 20 | 0 desembolso | input/output do CLI · `cache_read`/`cache_creation` · `list_price_input_output_usd` do SSOT · `host_reported_cost_usd` · `model_key_used` | `partial_no_cache_pricing` (20/20) |
| **Total** | **156** | 156 com custo e origem · 0 `n/d` · 93 com tokens > 0 | `priced_at: 2026-08-03` (lido do cabeçalho de `pricing.js`) |

### Reconciliação (P2, 20 chamadas Haiku via `claude -p`) — a métrica pré-registada

| Base `list` (input + output do SSOT) | USD |
|---|---|
| Soma das nossas linhas (20 incluídas, 0 excluídas, `incomplete: false`) | **0,079605** |
| Soma do `total_cost_usd` reportado pelo CLI | **1,318525** |
| Δ | **−1,238920 (−93,96 %)** |

### Reconstrução por chamada (exploratória, não pré-registada)

Tokens nas 20 chamadas: input 200 · output 15 881 · `cache_read` 354 357 · `cache_creation` 601 742. Aos preços publicados da Anthropic para o Haiku 4.5 (input 1/M, output 5/M, leitura de cache 0,10/M, **escrita com TTL 1 h 2,00/M** — confirmados pelo adversário na página oficial; **não estão** em `pricing.js`; os dois multiplicadores de cache e a sua fonte estão declarados em `results/analysis.json → reconciliation_haiku_20_per_call.cache_pricing_declared` (`read_per_M: 0.1`, `write_1h_per_M: 2`)):

| | USD |
|---|---|
| Reconstrução (input + output + cache) | 1,3185247 |
| Host | 1,3185247 |
| **Resíduo total** | **0,000000000** — e **0 em cada uma das 20 chamadas** (`analysis.json → reconciliation_haiku_20_per_call.rows`) |

Ou seja: o Δ de −94 % é **inteiramente** a cache do prefixo do Claude Code (mesmo com hooks desligados), que o SSOT não modela. A nota v1 dizia 1,25× (TTL 5 min) e estava errada; o `claude -p` usa 1 h.

Para as 73 linhas `ollama_local`, Δ = 0 **por construção** — a fonte das contagens é o próprio Ollama; não é uma verificação independente.

## Leitura honesta

1. **O que se demonstrou:** um formato de linha que responde sempre «quanto, de onde, com que contagens» e que nunca inventa (sem contagens → `n/d`; modelo desconhecido → `n/d`, nunca o *fallback* de Sonnet do `pricing.js`; reconciliação incompleta → Δ `n/d`). O ledger vivo não tem nada disto.
2. **O que NÃO se demonstrou:** custo verificado. A origem é **declarada** por quem chama (`source_declared_by_caller: true`) — o módulo não sabe se a chamada foi mesmo de subscrição. O preço de lista não é o desembolso do dono (é subscrição). O subtotal input/output explica 6 % do que o host cobra; a linha diz-o (`partial_no_cache_pricing`).
3. **Nada aqui é poupança.** Zero de desembolso descreve *como se pagou* (regra, GPU local, subscrição), nunca *quanto se poupou*. Proibido converter.
4. **Não está no produto.** `cost-line.js` tem 0 *callers*; nenhum escritor do ledger o chama. Mesmo padrão do `adaptive-learner` até 2026-09-03. Em `10-NAO-PROVADO.md`.
5. **Correcção proposta, não aplicada (SSOT é decisão do dono):** multiplicadores de cache em `pricing.js`, com data e fonte.

## O que isto NÃO prova

- Poupança (proibido). Que o preço de lista é o que o dono paga. Que `cache_read` do CLI é comparável ao `input` do SSOT. Que a origem declarada é a origem real. Que o produto instalado escreve estas linhas (não escreve).

## Reproduzir

```
cd tools/router && node --test cost-line.test.js
node _handoff/provas-v1-2026-09-09/P6-custo-na-linha/run.mjs
```
