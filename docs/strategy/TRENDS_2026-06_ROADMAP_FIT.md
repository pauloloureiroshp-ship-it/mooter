# Trends Scan 2026-06 → Mooter Roadmap Fit

> **Data:** 2026-06-14 · **Autor:** Paulo (composto no Cowork)
> **Estado do mundo:** v1.39.0 / Wave 59A SHIPPED · 59B (Pastor vs RouteLLM bench) agendada.
> **Âmbito:** cruzar 10 trends (YouTube → resumo Gemini) com o estado real do repo e
> encaixá-las no roadmap sem tocar nos invariantes FROZEN.
> **Output irmão:** `WAVE61_GRAPHIFY_ARCHITECTURE.md` (deep research da aposta nº1).

---

## 0. Filtro — o que "melhor router do mundo" significa

Um router só melhora em 3 eixos mensuráveis. Toda a trend tem de servir um destes,
senão é conteúdo ou lixo — não produto.

| Eixo | Métrica | Pilar de moat (STRATEGY.md) |
|---|---|---|
| **D — Decisão** | tier certo · $/task vs all-Opus (hoje 65–82%) | Subscription-aware · cross-provider |
| **T — Tokens** | tokens/task a qualidade igual | **Codebase-aware** (o grande por-explorar) |
| **F — Fricção** | minutos até 1º valor · zero estudo | Local-first integrado |

---

## 1. Correcções ao resumo Gemini (antes de cruzar)

- **Trend 8 — Marker NÃO é da Microsoft.** É da **Datalab / Vik Paruchuri** (GPL-3 + OpenRAIL-M).
  O tool da Microsoft é o **MarkItDown** — projecto diferente. O resumo fundiu os dois.
- **Trend 4 — o tool do PewDiePie chama-se "Odysseus"** (não "Odysius"), lançado 31-Mai-2026,
  ~66k stars a 10-Jun. A feature relevante é o **scan de hardware → recomenda modelo**.
- **Trend 7 — o "71×" do Graphify é a cauda da distribuição**, não o típico. Mediana 6–15×
  (100–500 ficheiros); 7–8% num teste real pequeno; >30× só acima de 500 ficheiros.
  MIT, tree-sitter AST, 100% local. _(fontes + as_of em WAVE61_GRAPHIFY_ARCHITECTURE.md)_

---

## 2. Scoreboard — 10 trends × estado real do repo

| # | Trend (verificada) | Eixo | Estado real (auditoria 2026-06-14) | Veredicto |
|---|---|---|---|---|
| 7 | **Graphify** — code-graph, −tokens | **T** | ❌ 0% — sem AST em lado nenhum | 🔥 **Maior alavanca. MIT + já skill/MCP → integrar, não construir** |
| 4 | **Hardware-scan** (Odysseus) | **F+D** | 🟡 70% — `model-manager.js` faz scan VRAM, mas `decideAgent` ignora `hw-capability.json` em runtime | 🔥 Router hardware-aware = net-new real |
| 3 | **Ollama/RTX roster** | **D** | 🟡 `model-manager` refere `qwen2.5` (stale) | 🔥 Barato: actualizar p/ `qwen3-coder-next` / `qwen3-30b` |
| 6 | **LLM Council** (Karpathy) | **D-qualidade** | 🟡 5% — `@mooter/validation` tem `adversarial/reviewer.ts`, não exposto | 🟡 Skill opt-in `/moo-council`, T3, cost-cap |
| 9 | **Git Worktrees** | **F** | ✅ Shipped (`spawn-orchestrator` + `worktree-conductor`, W33.5) — ❌ rebenta no Windows (sem bwrap) | 🟡 Fechar gap Windows (máquina do Paulo) |
| 5 | **Second brain** (Karpathy) | **F** | 🟡 Pack `obsidian-vault-sync` (W31) = notas, não graph | ⚪ Alinhar copy ao método; baixo esforço |
| 8 | **Marker** (Datalab) | **T** | ❌ 0% ingestion | ⚪ Pack recomendado, Wave tardia |
| 1 | **Llamafile** (USB) | **F** | 🟡 Local-first coberto via Ollama | ⚪ Doc "sem instalar Ollama", opcional |
| 2 | **AirLLM** (70B/4GB) | — | <1 tok/s | ❌ **Não fazer** — anti-padrão de latência; valida a doutrina |
| 10 | **Backprop** (educacional) | — | — | ⚪ Conteúdo/marketing |

---

## 3. Invariante que molda toda a implementação

`classify.js` está **FROZEN** (sha CI-enforced `427d8c0b…364bc48f`) e os engine packages
`packages/*` também — a Wave 58 só permite **ADIÇÕES de ficheiros novos** a `packages/router/src/`.
Logo, **nada disto edita `classify.js` nem `decide-agent.ts`**. O padrão correcto já existe:
`workflow-locks-bridge.js` (W33.8) injectou comportamento *host-side* sem tocar no package
congelado. Toda a inteligência nova entra como **breadcrumb + anotação host-side + packs/skills +
ficheiros novos**. Detalhe completo em `WAVE61_GRAPHIFY_ARCHITECTURE.md §3`.

---

## 4. Roadmap-fit — Waves 60→63

Janela do gate: 2026-04-26 → 2026-07-26 (~6 semanas restantes a 2026-06-14).

| Wave | Tema | Trends | Eixo | Esforço | Risco | Toca frozen? |
|---|---|---|---|---|---|---|
| **60** | Roster refresh + HW-aware T0 | 3, 4 | D+F | S (1 sessão) | Baixo | Não — `model-manager.js` + bridge host-side |
| **61** | **Graph-aware routing (Graphify)** | 7 | **T** | M (2 sessões) | Médio | Não — pack + `graph-context` host-side + 1 ficheiro novo em `router/src` |
| **62** | `/moo-council` quality mode | 6 | D | M | Médio (custo) | Não — skill expõe `reviewer.ts` |
| **63** | Worktrees Windows + ingestion packs | 9, 8, 5, 1 | F+T | S–M | Baixo | Não |

### Wave 60 — Roster refresh + HW-aware T0 (primeiro; meia-sessão, ROII imediato)
- **(a)** Substituir `qwen2.5:*` por `qwen3-coder-next` (MoE, 58.7% SWE-bench, ~18–22 tok/s) e
  `qwen3-30b` (~196 tok/s) no `model-manager.js` + matriz. ⚠️ confirmar disponibilidade no Ollama
  antes de hardcodar (muda em <30 dias).
- **(b)** Módulo host-side que lê `hw-capability.json` e enviesa T0 para o melhor modelo local que
  cabe na VRAM (dentro do guardrail de tier — doutrina vence). Expõe `mooter models` (o
  "scan→recomenda" do Odysseus, integrado no router, não um workspace separado).

### Wave 61 — Graph-aware routing (a aposta) → ver brief dedicado
Mooter corta por *tier*; Graphify corta por *contexto*. Juntos: menos chamadas **e** menos tokens
por chamada, com poupança **atribuída e visível** no statusline (ninguém mais faz isto). Reforça o
pilar *codebase-aware*. **Arquitectura completa em `WAVE61_GRAPHIFY_ARCHITECTURE.md`.**

### Wave 62 — `/moo-council` (vector Quality, opt-in)
Expor `adversarial/reviewer.ts`: N respostas → peer-review anonimizado → chairman sintetiza.
**Guard-rails:** opt-in explícito · força T3 · **cost-cap medido** antes de correr · avisa o custo.

### Wave 63 — Fricção
- Worktrees no Windows (WSL2 bridge ou degradação honesta documentada).
- Pack `marker` (doc→markdown, −70% tokens) · alinhar pack Obsidian ao método Karpathy ·
  doc Llamafile (local sem instalar Ollama).

---

## 5. Não fazer (tão importante como o que fazer)

- ❌ **AirLLM** — <1 tok/s mata o T0. Contra-exemplo de marketing: "local-first ≠ forçar o modelo
  gigante; é rotear por tier". Usar na narrativa, não no código.
- ❌ **Construir code-graph próprio** — Graphify é MIT e mais maduro; integrar > reinventar.
- ❄️ **Doc-ingestion pesado** (OCR, etc.) — ROI baixo nesta fase; pack leve chega.

---

## 6. A jogada de maior alavanca

**Wave 61 (graph-aware routing).** Único eixo (tokens/contexto) que nenhum router concorrente
cobre, reforça o moat *codebase-aware* (janela aberta na STRATEGY.md), custo de entrada baixo
porque o Graphify já existe como skill/MCP. Wave 60 vem antes só por ser meia-sessão e desbloquear
o melhor modelo local que já está debaixo do nariz.
