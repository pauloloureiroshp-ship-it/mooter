# P6 · AMENDMENT-1 — endurecimento do instrumento depois do adversário (2026-09-09)

**Gatilho.** Ronda 1 do adversário (Codex, `adversary-codex-round1.md`, 13 ataques). Cinco derrubaram **defeitos do instrumento** (`tools/router/cost-line.js` v1), um derrubou a **cronologia** do pré-registo, um derrubou uma **nota errada** na análise. Pela regra do MP (§3): corrige-se o instrumento, escreve-se esta emenda, re-corre-se **só esta prova**.

## O que mudou no instrumento (`cost-line.js` v1 → v2)

| Ataque | Defeito confirmado | Correcção | Teste que morde |
|---|---|---|---|
| P6-08 | `numOrNull(false)=0`, `[5]=5`, `-1`, `1.5` aceites; Ollama com **uma** contagem publicava 0 | `count(v)`: só inteiros finitos ≥ 0 (ou string decimal); Ollama exige **as duas** contagens | `contagens: so inteiros…`, `ollama sem contagens, ou so com UMA` |
| P6-06 | subscrição **sem contagens** recebia `cost_usd: 0` + origem válida | sem contagens → `n/d`; cada linha leva `source_declared_by_caller: true` (a origem é declarada, não verificada — assumido) | `subscricao sem contagens: n/d` |
| P6-07 | `reconcile([{n/d}], 1)` dava `ours=0, Δ=−100 %`; misturava `list_price` com `cost_usd` | base declarada (`list` \| `incremental`); linha sem número finito ≥ 0 é **excluída** e contada; total fica `incomplete: true` e Δ = `n/d`; custo negativo excluído | `reconcile: … n/d NUNCA vira 0`, `reconcile nao mistura bases` |
| P6-09 | `listPrice` chamava `pricing.priceTurn`, que tem `FALLBACK_PRICE` (3/15 = Sonnet) para nome desconhecido; regex `/haiku/` mapeava `claude-haiku-9-inventado` | `modelKey` → chave exacta do SSOT, ou apelido curto exacto (`haiku`/`sonnet`/`opus`/`fable`), senão `null`; `listPrice` lê `pricing.PRICES[key]` directamente, nunca `priceTurn`; a linha publica `model_key_used` | `modelo desconhecido … NUNCA o fallback (P6-09)` (verifica que o fallback do `pricing.js` **existe** e que não o herdamos) |
| P6-05 | ramo `api` publicava input/output como `cost_usd` completo mesmo com contagens de cache | `completeness: 'partial_no_cache_pricing'` quando há cache; campo renomeado `list_price_input_output_usd` (era `list_price_usd`) | `… PARCIAL (P6-05)` |
| P6-10 | `round6` por linha (sub-microdólar virava 0); data do snapshot ilegível virava a string `"pricing.js"` | sem arredondar na linha (só no `reconcile`); snapshot ilegível → `n/d` | `precisao: um custo sub-microdolar…` |
| P6-12 | valores esperados vinham do próprio SSOT | os 15 testes usam valores **calculados à mão** no ficheiro de teste (haiku 1/5, sonnet 3/15, opus 5/25 por M) | todos |

**Testes:** 11 → **15/15** (`cd tools/router && node --test cost-line.test.js`). Um valor de mão do teste novo estava errado (1 token de input do Haiku é **exactamente** 1e-6 USD, não `< 1e-6`); corrigido no próprio teste com a conta ao lado.

## O que mudou no `run.mjs` (só leitura/apresentação; a métrica pré-registada não mudou)

- **P6-04 / P6-03:** tabela **por chamada** (`reconciliation_haiku_20_per_call`) com input, output, `cache_read`, `cache_creation`, preço de lista input/output, custo do host, e uma reconstrução **exploratória** com a cache aos preços publicados da Anthropic (leitura 0,10/M; escrita **TTL 1 h** 2,00/M). Esses multiplicadores **não estão** em `pricing.js`; ficam declarados com a fonte e não entram em `cost_usd`.
- **Errata:** a nota v1 dizia `cache_creation (1,25×)` — isso é o TTL de 5 min. O `claude -p` usa 1 h (2×). Corrigido na nota.
- **P6-11:** `B_lines.with_tokens` acrescentado (faltava); o corte do ledger `done` (protocolar) e `all` (exploratório) ficam rotulados.
- **P6-02:** nota explícita em `B_lines`: a presença de custo+origem é garantida pelo formato; o que se mede é **cobertura nesta amostra**.

## O que NÃO mudou

Protocolo (`61007b23`), corpus, braços, a métrica pré-registada (soma do preço de lista input/output vs `total_cost_usd` do host), as 156 entradas. Nenhum número da regra ou do Ollama mudou.

## Re-corrida (2026-09-09T14:06:36Z)

| | v1 (13:51Z) | v2 (14:06Z) |
|---|---|---|
| B · linhas com custo **e** origem | 156/156 | **156/156** (`with_tokens` 93; `partial_no_cache_pricing` 20 — as 20 do Haiku, como deve ser) |
| B · `n/d` | 0 | 0 |
| Reconciliação 20 Haiku (base `list`) | 0,079605 vs 1,318525 · Δ −94 % | **igual**; `included 20, excluded 0, incomplete false` |
| Reconstrução exploratória com cache 1 h | agregado ≈ 1,32 | **1,3185247 vs host 1,3185247 · resíduo 0,000000000 em 20/20 chamadas** |
| A · ledger vivo | 916 / 492 / 726 (classified / executed / ledger `all`; v1 = `results/analysis.json` no commit `030374b1`) | 939 / … — o log **cresceu** entre as duas corridas porque as sessões P3 e P5 deste mesmo pacote escrevem no `decisions.log` vivo (defeito **D6**, `09-DEFEITOS-APANHADOS.md`); imprime-se o que está |

**P6-01 (cronologia):** o `congelado_em` do protocolo era escrito à mão e errado (14:40Z, *depois* da corrida). O commit `61007b23` (`%cI` 13:51:24Z, resolução de 1 s) e a corrida v1 (`at` 13:51:24,449Z na `analysis.json` do commit `030374b1`) caem no **mesmo segundo**: a ordem vem da sequência do comando na mesma linha de shell (`git commit && node run.mjs`), não dos timestamps. Corrigido em `ERRATA-timestamps.md`; o protocolo passou a ter `congelado_em` = hora do commit e `congelado_em_fonte`.
