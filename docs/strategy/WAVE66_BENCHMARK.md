# Wave 66 — Graphify A/B Benchmark (real-token ledger)

> **Fase:** Benchmark 1 · **Data / as_of:** 2026-06-22 · **Autor:** Claude Code (Opus, beast)
> **Estado:** **ADVISORY** — medição interna, **nada publicado** sem OK do Paulo.
> **Gate de honestidade:** todo número = *(valor, tamanho-repo, as_of, n, metodologia)*. **Nunca "71×" isolado.**
> Impressionante = clareza de um número REAL e rotulado, nunca inflar.

---

## TL;DR (honesto)

No repo `frugal` (**1781 ficheiros de código extraídos** · **19 454 nós / 25 298 arestas** · _as_of 2026-06-22_ · **n=3** · proxy `gpt-tokenizer o200k`):

**O enquadramento honesto do valor:** o grafo entrega **contexto estrutural** (call graph + dependências + impacto) **ao preço de um grep** — ou, dito de outra forma, **~34× mais barato do que ler os ficheiros relevantes** para obter esse mesmo entendimento.

- Consultar o **grafo** usou uma **mediana de ~34× menos tokens de input** do que **ler os ficheiros-hit do `git grep`** para responder à mesma pergunta de navegação/impacto — **range 9.7×–439× em 8 tarefas**.
- Contra um **grep-skim puro** (só as linhas do grep, sem abrir ficheiros), o grafo é **≈par (mediana 0.95×)** — o mesmo orçamento de tokens, mas com **estrutura** (quem chama quem, dependências, comunidades) que o grep não dá. O grep custa o mesmo e devolve linhas soltas; o grafo custa o mesmo e devolve o **call graph**.

> **Não é "71×".** É **contexto estrutural ao preço do grep**, ou **~34× vs ler os ficheiros relevantes** — num repo grande (1781 fich.), n=3, tokenizer real. Repo pequeno daria muito menos. O grep não é escondido: é o piso, e o grafo iguala-o em custo dando muito mais.

---

## 1. Setup (verificável, sem LLM, sem rede)

| Item | Valor |
|---|---|
| Graphify | `graphifyy 0.8.44`, instalado do **clone oficial verificado** `/tmp/graphify-src-w61` (`github.com/safishamsi/graphify`, MIT) — **não** PyPI typosquat |
| Caminho de extração | `graphify update .` → **tree-sitter AST + Leiden clustering**, **sem LLM** (multimodal OFF; `extract`/`label` LLM **não** corridos) |
| Deps puxadas | networkx, rapidfuzz, 20+ tree-sitter grammars — **zero** deps LLM (openai/anthropic ausentes) |
| Token proxy | `gpt-tokenizer` o200k_base BPE (offline, determinístico). O tokenizer do Claude difere ligeiramente, mas **os rácios A/B são estáveis entre tokenizers** para código |
| Repo / commit | `frugal` @ `0dc818a` |

### Build do grafo (medido)
| Métrica | Valor |
|---|---|
| Ficheiros de código extraídos | **1781** (tracked code-ext = 1011; restantes = untracked `.planning/`/`audit/` etc.; `node_modules` ignorado) |
| Nós | **19 454** (funções, classes, métodos, ficheiros) |
| Arestas | **25 298** (`relation`: contains/calls/imports…) |
| Comunidades (Leiden) | **1485** |
| Tempo de build | **36 s** (32 workers, cache frio) |
| `graph.json` | **16.3 MB** · `GRAPH_REPORT.md` 394 KB · `graph.html` saltado (>5000 nós) |
| Schema confirmado | node-link; `links` (não `edges`); nó tem `community` numérico → **valida o reader 61.C/66.C** |

---

## 2. Metodologia (porque é honesta)

Para cada tarefa (uma pergunta real de navegação/impacto sobre um símbolo `S`), medem-se **tokens de input reais** que um agente carregaria:

- **Mode A1 — ler ficheiros-hit** (`git grep -l S` → conteúdo completo de cada ficheiro). Limite **realista de igual confiança**: um agente que quer responder "quem chama / o que parte se mudar `S`" abre e lê os ficheiros que mencionam `S`.
- **Mode A2 — grep-skim** (`git grep -n S`, só as linhas que casam). **Piso optimista**: greppar e passar os olhos, sem abrir ficheiros (menor confiança / sem estrutura).
- **Mode B — grafo** (`graphify query "<pergunta>"`, subgrafo BFS, budget 2000 tok). O contexto estruturado que o agente recebe **em vez de** greppar/ler.

**Âmbito do Mode A = só código** (`*.ts/tsx/js/jsx/mjs/cjs/py/go/rs`; exclui `dist/build/*.min.js/node_modules`). **Excluídos de propósito** `audit/*.jsonl` (até 594 KB), `SYNC.md` (348 KB), `*.json` de dados — mencionam o nome do símbolo em **logs/dados**, não como código; incluí-los era a **inflação "read-all"** que o gate proíbe. _(Excluir isto **baixa** o rácio — é a favor da honestidade, não do grafo.)_

**n=3** por tarefa. Os tokens são **determinísticos** (`git grep` e `graphify query` estáveis); B variou ≤0.1% (±2 tok) só por **ordenação de nós** (mesmo conteúdo). Rácio = A / B.

> **Achado de método (honesto):** `graphify affected "<S>"` falhou com *"No unique node match"* em símbolos definidos em múltiplos ficheiros (ex. `logDecision`) — devolvia uma string de erro de ~8 tokens. Comparar A1 contra um erro dava "7659×" **falso**; por isso **todas** as tarefas usam `query` (BFS, robusto). Reportar o 7659× teria sido desonesto.

---

## 3. Resultados por tarefa (tokens reais)

| # | Símbolo | ficheiros-hit | A1 (ler ficheiros) | A2 (grep-skim) | B (grafo) | A1/B | A2/B |
|---|---|--:|--:|--:|--:|--:|--:|
| T1 | `decideAgent` | 10 | 36 902 | 2 546 | 835 | **44.2×** | 3.0× |
| T2 | `applyGraphContext` | 3 | 22 392 | 456 | 129 | **173.6×** | 3.5× |
| T3 | `logDecision` (impacto) | 4 | 23 605 | 505 | 1 340 | **17.6×** | 0.4× |
| T4 | `computeTES` | 8 | 31 688 | 1 044 | 781 | **40.6×** | 1.3× |
| T5 | `readGraphContext` | 4 | 5 191 | 338 | 534 | **9.7×** | 0.6× |
| T6 | `buildBadge` | 5 | 23 639 | 1 058 | 1 724 | **13.7×** | 0.6× |
| T7 | `renderGraphContextBlock` | 3 | 22 392 | 319 | 51 | **439.1×** | 6.3× |
| T8 | `coerceHintCoherent` (impacto) | 3 | 22 602 | 216 | 843 | **26.8×** | 0.3× |

### Agregado (mediana entre 8 tarefas, n=3)
| Métrica | Mediana | Range |
|---|--:|---|
| A1 — ler ficheiros-hit | **23 104 tok** | 5 191–36 902 |
| A2 — grep-skim | 481 tok | 216–2 546 |
| B — grafo | 808 tok | 51–1 724 |
| **Redução A1/B (igual confiança)** | **~34×** | **9.7×–439×** |
| Redução A2/B (grep-skim floor) | ~0.95× | 0.3×–6.3× |

---

## 4. Veredicto (advisory)

1. **Para perguntas estruturais (quem chama / dependências / impacto de mudar `S`)**, onde a alternativa honesta é **ler os ficheiros-hit**, o grafo poupa **mediana ~34× tokens de input** neste repo (range 10×–439×, n=3). Consistente com a banda honesta do Graphify para repos grandes (500+ fich. → 30×+) — corroborada aqui com **tokens reais**, não estimativa.
2. **Para greppar-e-passar-os-olhos** (sem abrir ficheiros), o grafo é **≈break-even** (mediana ~1×) e por vezes pior para símbolos pequenos. **Não vende o grafo como mágica** — o ganho existe quando o trabalho exige confiança estrutural.
3. **Tamanho importa.** Este é um repo grande (1781 fich. / 19.4k nós). Um repo pequeno (<100 fich.) daria ganho ~nulo a single-digit % — **nunca anunciar um multiplicador desses contextos**.
4. **Custo de entrada:** build 36 s (one-off, cache frio); incremental é sub-segundo. `graph.json` 16.3 MB (consultado, **nunca** carregado inteiro).

**Claim citável (gated, com OK):**
> "Num repo de ~1781 ficheiros, consultar o code-graph usou **mediana ~34× menos tokens** que ler os ficheiros relevantes para responder a perguntas de navegação/impacto (range 10–439×) — _benchmark interno Mooter, n=3, gpt-tokenizer o200k, as_of 2026-06-22; ≈break-even vs grep puro_."

---

## 5. Honestidade / limites

- **ADVISORY**, não `guaranteed`: é poupança de *contexto* estimada com proxy de tokenizer, não o ledger verbatim do Claude.
- A1 lê ficheiros-hit **inteiros** (limite superior realista); um agente esperto leria só regiões → o ganho real fica **entre A2 e A1**, mais perto de A1 para impacto/refactor.
- Mode B inclui ruído de query NL ("used" casou nós extra em T6) → **B sobre-estimado** → rácio **conservador**.
- **Nunca "até 439×" isolado** — é o outlier (T7, símbolo único num ficheiro pequeno). O número de cabeçalho é a **mediana ~34×**, com range.
- Reprodutível: `bench.js` + `bench-results.json` em `/tmp/bench-tools/` (proxy tokenizer, git grep code-scoped, graphify query).

_(Fim Benchmark 1. PARA e reporta — conforme masterprompt.)_
